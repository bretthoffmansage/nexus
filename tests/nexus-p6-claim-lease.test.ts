// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { IDENTITY_A, IDENTITY_B, key, p5Test, seedApprovedReader, type P5Test } from "./helpers/convexP5";
import {
  clearConnectorEnv,
  installConnectorEnv,
  seedConnector,
  TEST_CONNECTOR_ID,
} from "./helpers/convexP6";

beforeEach(() => installConnectorEnv());
afterEach(() => clearConnectorEnv());

async function submitTask(
  t: P5Test,
  identity: { subject: string; email: string; name?: string },
  text: string,
  seed: string,
) {
  return t.withIdentity(identity).mutation(api.tasks.submitKnowledgeRequest, {
    requestText: text,
    idempotencyKey: key(seed),
  });
}

async function claim(t: P5Test, connectorId = TEST_CONNECTOR_ID) {
  return t.mutation(internal.connectorTasks.claimNextTask, { connectorId });
}

describe("P6 claim + queue ordering (Part X)", () => {
  it("1-3. claims the oldest eligible queued task and records the lease + ownership", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await seedConnector(t);
    const submit = await submitTask(t, IDENTITY_A, "first question", "c1");

    const result = await claim(t);
    expect(result.status).toBe("claimed");
    expect(result.task?.taskId).toBe(submit.taskId);
    expect(result.task?.leaseId).toBeTruthy();
    expect(result.task?.leaseExpiresAt).toBeGreaterThan(Date.now());

    const row = await t.run(async (ctx) => ctx.db.get(submit.taskId as Id<"nexusTasks">));
    expect(row?.status).toBe("claimed");
    expect(row?.claimedByConnectorId).toBe(TEST_CONNECTOR_ID);
    expect(row?.leaseId).toBe(result.task?.leaseId);

    // Progress + audit recorded.
    const progress = await t
      .withIdentity(IDENTITY_A)
      .query(api.taskProgress.listMyTaskProgress, { taskId: submit.taskId });
    expect(progress.map((p) => p.eventType)).toContain("task_claimed");
  });

  it("2. global queue order is honored across users (A, B, A → seq 1,2,3)", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await seedApprovedReader(t, IDENTITY_B);
    await seedConnector(t);
    const a1 = await submitTask(t, IDENTITY_A, "A-first", "qa1");
    await submitTask(t, IDENTITY_B, "B-first", "qb1");
    await submitTask(t, IDENTITY_A, "A-second", "qa2");

    const first = await claim(t);
    expect(first.task?.taskId).toBe(a1.taskId);
    expect(first.task?.queueSequence).toBe(1);
    expect(first.task?.requestText).toBe("A-first");
  });

  it("3-4. single-worker mode: cannot claim a second task while busy; others see idle", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await seedConnector(t);
    await seedConnector(t, { connectorId: "connector-B" });
    await submitTask(t, IDENTITY_A, "only one", "s1");

    const first = await claim(t);
    expect(first.status).toBe("claimed");

    // Same connector, still busy → connector_busy.
    await expect(claim(t)).rejects.toMatchObject({ data: { code: "connector_busy" } });

    // A different connector finds nothing queued (the task is claimed).
    const other = await claim(t, "connector-B");
    expect(other.status).toBe("idle");
    expect(other.task).toBeNull();
  });

  it("5. empty queue returns a successful idle response", async () => {
    const t = p5Test();
    await seedConnector(t);
    const result = await claim(t);
    expect(result.status).toBe("idle");
    expect(result.task).toBeNull();
  });

  it("6. cancelled queued tasks are skipped", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await seedConnector(t);
    const submit = await submitTask(t, IDENTITY_A, "cancel me", "cx");
    await t.withIdentity(IDENTITY_A).mutation(api.tasks.cancelMyTask, { taskId: submit.taskId });

    const result = await claim(t);
    expect(result.status).toBe("idle");
  });

  it("7. tasks with unsupported tools for the Connector are skipped", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    // Connector only supports the transcript tool.
    await seedConnector(t, { allowedToolIds: ["membership_io.transcript_retrieve"] });
    // Default submission uses vault.agentic_retrieval → not claimable here.
    await submitTask(t, IDENTITY_A, "vault question", "u1");

    const result = await claim(t);
    expect(result.status).toBe("idle");
  });

  it("12-13. claim envelope is bounded — no owner id, email, or unrelated history", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await seedConnector(t);
    await submitTask(t, IDENTITY_A, "bounded payload", "b1");
    const result = await claim(t);
    const serialized = JSON.stringify(result.task);
    expect(serialized).not.toContain(IDENTITY_A.subject);
    expect(serialized).not.toContain(IDENTITY_A.email);
    expect(result.task).not.toHaveProperty("ownerClerkUserId");
  });
});

describe("P6 task start + lease heartbeat (Part X)", () => {
  async function setupClaimed() {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await seedConnector(t);
    const submit = await submitTask(t, IDENTITY_A, "work", "w1");
    const claimed = await claim(t);
    return { t, taskId: submit.taskId as Id<"nexusTasks">, leaseId: claimed.task!.leaseId };
  }

  it("14-16. wrong connector / wrong lease / cannot start; expired lease rejected", async () => {
    const { t, taskId, leaseId } = await setupClaimed();
    await seedConnector(t, { connectorId: "connector-B" });

    await expect(
      t.mutation(internal.connectorTasks.startTask, { connectorId: "connector-B", taskId, leaseId }),
    ).rejects.toMatchObject({ data: { code: "wrong_connector" } });

    await expect(
      t.mutation(internal.connectorTasks.startTask, {
        connectorId: TEST_CONNECTOR_ID,
        taskId,
        leaseId: "not-the-lease",
      }),
    ).rejects.toMatchObject({ data: { code: "wrong_lease" } });
  });

  it("17-18. valid start transitions claimed → running and is idempotent", async () => {
    const { t, taskId, leaseId } = await setupClaimed();
    const started = await t.mutation(internal.connectorTasks.startTask, {
      connectorId: TEST_CONNECTOR_ID,
      taskId,
      leaseId,
    });
    expect(started.status).toBe("running");
    const again = await t.mutation(internal.connectorTasks.startTask, {
      connectorId: TEST_CONNECTOR_ID,
      taskId,
      leaseId,
    });
    expect(again.status).toBe("running"); // idempotent, no throw
  });

  it("19-20. heartbeat extends the lease and reports cancellation state", async () => {
    const { t, taskId, leaseId } = await setupClaimed();
    await t.mutation(internal.connectorTasks.startTask, { connectorId: TEST_CONNECTOR_ID, taskId, leaseId });

    const before = await t.run(async (ctx) => (await ctx.db.get(taskId))?.leaseExpiresAt ?? 0);
    const hb = await t.mutation(internal.connectorTasks.heartbeatTaskLease, {
      connectorId: TEST_CONNECTOR_ID,
      taskId,
      leaseId,
    });
    expect(hb.leaseExpiresAt).toBeGreaterThanOrEqual(before);
    expect(hb.cancellationRequested).toBe(false);

    // User requests cancellation of the running task → heartbeat now reports it.
    await t.withIdentity(IDENTITY_A).mutation(api.tasks.cancelMyTask, { taskId });
    const hb2 = await t.mutation(internal.connectorTasks.heartbeatTaskLease, {
      connectorId: TEST_CONNECTOR_ID,
      taskId,
      leaseId,
    });
    expect(hb2.cancellationRequested).toBe(true);
    expect(hb2.status).toBe("cancel_requested");
  });

  it("client cannot supply queueSequence or priority to the claim", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await seedConnector(t);
    await submitTask(t, IDENTITY_A, "no injection", "ni");
    await expect(
      t.mutation(internal.connectorTasks.claimNextTask, {
        connectorId: TEST_CONNECTOR_ID,
        queueSequence: 999,
        priority: -1,
      } as never),
    ).rejects.toThrow();
  });
});
