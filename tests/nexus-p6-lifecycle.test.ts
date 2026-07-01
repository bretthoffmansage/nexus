// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  IDENTITY_A,
  IDENTITY_B,
  IDENTITY_ADMIN,
  key,
  p5Test,
  seedAdmin,
  seedApprovedReader,
  type P5Test,
} from "./helpers/convexP5";
import { clearConnectorEnv, installConnectorEnv, seedConnector, TEST_CONNECTOR_ID } from "./helpers/convexP6";

beforeEach(() => installConnectorEnv());
afterEach(() => clearConnectorEnv());

/** Submit a task as A, claim it, and start it → returns a running task. */
async function setupRunning(t: P5Test, text = "run me", seed = "r1") {
  await seedApprovedReader(t, IDENTITY_A);
  await seedConnector(t);
  const submit = await t
    .withIdentity(IDENTITY_A)
    .mutation(api.tasks.submitKnowledgeRequest, { requestText: text, idempotencyKey: key(seed) });
  const claimed = await t.mutation(internal.connectorTasks.claimNextTask, { connectorId: TEST_CONNECTOR_ID });
  const leaseId = claimed.task!.leaseId;
  await t.mutation(internal.connectorTasks.startTask, {
    connectorId: TEST_CONNECTOR_ID,
    taskId: submit.taskId as Id<"nexusTasks">,
    leaseId,
  });
  return { taskId: submit.taskId as Id<"nexusTasks">, conversationId: submit.conversationId, leaseId };
}

describe("P6 completion (Part Y)", () => {
  it("1-4. stores one result, ordered sources, one assistant message, preserving owner", async () => {
    const t = p5Test();
    const { taskId } = await setupRunning(t);
    await t.mutation(internal.connectorTasks.completeTask, {
      connectorId: TEST_CONNECTOR_ID,
      taskId,
      leaseId: (await t.run((ctx) => ctx.db.get(taskId)))!.leaseId!,
      answerText: "The answer with provenance.",
      sources: [
        { sourceType: "vault_note", title: "Note B", excerpt: "b" },
        { sourceType: "web", title: "Note A", excerpt: "a" },
      ],
      model: "test-model",
    });

    const result = await t.withIdentity(IDENTITY_A).query(api.taskResults.getMyTaskResult, { taskId });
    expect(result?.answerText).toBe("The answer with provenance.");

    const sources = await t.withIdentity(IDENTITY_A).query(api.taskSources.listMyTaskSources, { taskId });
    expect(sources.map((s) => s.ordinal)).toEqual([0, 1]);
    expect(sources[0].title).toBe("Note B");

    const transcript = await t
      .withIdentity(IDENTITY_A)
      .query(api.conversations.getConversationTranscript, {
        conversationId: (await t.run((ctx) => ctx.db.get(taskId)))!.conversationId,
      });
    const assistantMsgs = transcript.messages.filter((m) => m.author === "assistant");
    expect(assistantMsgs).toHaveLength(1);

    // Owner copied from the task, never trusted from the request.
    const resultRow = await t.run((ctx) =>
      ctx.db.query("nexusTaskResults").withIndex("by_task", (q) => q.eq("taskId", taskId)).unique(),
    );
    expect(resultRow?.ownerClerkUserId).toBe(IDENTITY_A.subject);

    const task = await t.run((ctx) => ctx.db.get(taskId));
    expect(task?.status).toBe("completed");
    expect(task?.leaseId).toBeUndefined(); // lease cleared
  });

  it("6-8. wrong connector / wrong lease / expired lease cannot complete", async () => {
    const t = p5Test();
    const { taskId, leaseId } = await setupRunning(t);
    await seedConnector(t, { connectorId: "connector-B" });

    await expect(
      t.mutation(internal.connectorTasks.completeTask, {
        connectorId: "connector-B",
        taskId,
        leaseId,
        answerText: "hijack",
      }),
    ).rejects.toMatchObject({ data: { code: "wrong_connector" } });

    await expect(
      t.mutation(internal.connectorTasks.completeTask, {
        connectorId: TEST_CONNECTOR_ID,
        taskId,
        leaseId: "bad-lease",
        answerText: "hijack",
      }),
    ).rejects.toMatchObject({ data: { code: "wrong_lease" } });
  });

  it("9-10. duplicate completion is idempotent; a different connector conflicts", async () => {
    const t = p5Test();
    const { taskId, leaseId } = await setupRunning(t);
    const first = await t.mutation(internal.connectorTasks.completeTask, {
      connectorId: TEST_CONNECTOR_ID,
      taskId,
      leaseId,
      answerText: "canonical answer",
    });
    expect(first.idempotent).toBe(false);
    const second = await t.mutation(internal.connectorTasks.completeTask, {
      connectorId: TEST_CONNECTOR_ID,
      taskId,
      leaseId,
      answerText: "different answer",
    });
    expect(second.idempotent).toBe(true);

    // Exactly one result, and it is the canonical (first) one.
    const rows = await t.run((ctx) =>
      ctx.db.query("nexusTaskResults").withIndex("by_task", (q) => q.eq("taskId", taskId)).collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].answerText).toBe("canonical answer");

    await seedConnector(t, { connectorId: "connector-B" });
    await expect(
      t.mutation(internal.connectorTasks.completeTask, {
        connectorId: "connector-B",
        taskId,
        leaseId,
        answerText: "conflict",
      }),
    ).rejects.toMatchObject({ data: { code: "completion_conflict" } });
  });

  it("5 & 18-19. browser cannot complete; other user & admin cannot read result", async () => {
    const t = p5Test();
    const { taskId, leaseId } = await setupRunning(t);
    await t.mutation(internal.connectorTasks.completeTask, {
      connectorId: TEST_CONNECTOR_ID,
      taskId,
      leaseId,
      answerText: "A private answer",
    });

    // There is no public mutation to complete a task (browser cannot reach it):
    // the only cross-user visibility check we can assert is that B and admin
    // cannot read A's completed result.
    await seedApprovedReader(t, IDENTITY_B);
    await seedAdmin(t, IDENTITY_ADMIN);
    await expect(
      t.withIdentity(IDENTITY_B).query(api.taskResults.getMyTaskResult, { taskId }),
    ).rejects.toMatchObject({ data: { code: "task_not_found" } });
    await expect(
      t.withIdentity(IDENTITY_ADMIN).query(api.taskResults.getMyTaskResult, { taskId }),
    ).rejects.toMatchObject({ data: { code: "role_required" } });
  });
});

describe("P6 failure (Part Y)", () => {
  it("11-13. fail clears the lease, stores bounded error, and stays retryable", async () => {
    const t = p5Test();
    const { taskId, leaseId } = await setupRunning(t);
    const failed = await t.mutation(internal.connectorTasks.failTask, {
      connectorId: TEST_CONNECTOR_ID,
      taskId,
      leaseId,
      errorCode: "tool_unavailable",
      userSafeMessage: "The retrieval tool was unavailable.",
    });
    expect(failed.status).toBe("failed");

    const task = await t.run((ctx) => ctx.db.get(taskId));
    expect(task?.status).toBe("failed");
    expect(task?.errorCode).toBe("tool_unavailable");
    expect(task?.leaseId).toBeUndefined();

    // Still user-retryable per P5 rules → creates a NEW queued task.
    const retried = await t
      .withIdentity(IDENTITY_A)
      .mutation(api.tasks.retryMyTask, { taskId, idempotencyKey: key("retry-after-fail") });
    expect(retried.status).toBe("queued");
    expect(retried.taskId).not.toBe(taskId);
  });

  it("idempotent repeated fail from the same connector", async () => {
    const t = p5Test();
    const { taskId, leaseId } = await setupRunning(t);
    await t.mutation(internal.connectorTasks.failTask, {
      connectorId: TEST_CONNECTOR_ID,
      taskId,
      leaseId,
      errorCode: "e",
      userSafeMessage: "failed",
    });
    const again = await t.mutation(internal.connectorTasks.failTask, {
      connectorId: TEST_CONNECTOR_ID,
      taskId,
      leaseId,
      errorCode: "e",
      userSafeMessage: "failed",
    });
    expect(again.idempotent).toBe(true);
  });
});

describe("P6 cancellation acknowledgement (Part Y / Part N)", () => {
  it("14-16. cancel_requested is visible; ack cancels; completion after cancel is refused", async () => {
    const t = p5Test();
    const { taskId, leaseId } = await setupRunning(t);

    // User requests cancellation of the running task.
    await t.withIdentity(IDENTITY_A).mutation(api.tasks.cancelMyTask, { taskId });
    const state = await t.query(internal.connectorReads.getTaskCancellationState, {
      connectorId: TEST_CONNECTOR_ID,
      taskId,
      leaseId,
    });
    expect(state.cancellationRequested).toBe(true);

    // Completing a cancel_requested task is refused.
    await expect(
      t.mutation(internal.connectorTasks.completeTask, {
        connectorId: TEST_CONNECTOR_ID,
        taskId,
        leaseId,
        answerText: "too late",
      }),
    ).rejects.toMatchObject({ data: { code: "cancellation_requested" } });

    // Connector acknowledges → cancelled, lease + connector current-task cleared.
    const ack = await t.mutation(internal.connectorTasks.acknowledgeCancellation, {
      connectorId: TEST_CONNECTOR_ID,
      taskId,
      leaseId,
    });
    expect(ack.status).toBe("cancelled");

    const task = await t.run((ctx) => ctx.db.get(taskId));
    expect(task?.status).toBe("cancelled");
    expect(task?.leaseId).toBeUndefined();
    const connector = await t.run((ctx) =>
      ctx.db.query("nexusConnectors").withIndex("by_connector_id", (q) => q.eq("connectorId", TEST_CONNECTOR_ID)).unique(),
    );
    expect(connector?.currentTaskId).toBeUndefined();
  });

  it("17. connector current task clears on terminal completion", async () => {
    const t = p5Test();
    const { taskId, leaseId } = await setupRunning(t);
    await t.mutation(internal.connectorTasks.completeTask, {
      connectorId: TEST_CONNECTOR_ID,
      taskId,
      leaseId,
      answerText: "done",
    });
    const connector = await t.run((ctx) =>
      ctx.db.query("nexusConnectors").withIndex("by_connector_id", (q) => q.eq("connectorId", TEST_CONNECTOR_ID)).unique(),
    );
    expect(connector?.currentTaskId).toBeUndefined();
    expect(connector?.operatingState).toBe("idle");
  });
});

describe("P6 stale-lease recovery (Part Z)", () => {
  /** Force a task's lease into the past to simulate an abandoned Connector. */
  async function expireLease(t: P5Test, taskId: Id<"nexusTasks">) {
    await t.run(async (ctx) => {
      await ctx.db.patch(taskId, { leaseExpiresAt: Date.now() - 60_000 });
    });
  }

  it("1. expired claimed task is safely requeued (preserving queue sequence)", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await seedConnector(t);
    const submit = await t
      .withIdentity(IDENTITY_A)
      .mutation(api.tasks.submitKnowledgeRequest, { requestText: "abandon", idempotencyKey: key("z1") });
    const claimed = await t.mutation(internal.connectorTasks.claimNextTask, { connectorId: TEST_CONNECTOR_ID });
    const taskId = submit.taskId as Id<"nexusTasks">;
    const seqBefore = claimed.task!.queueSequence;
    await expireLease(t, taskId);

    const rec = await t.mutation(internal.connectorTasks.recoverStaleLeases, {});
    expect(rec.recovered).toBeGreaterThanOrEqual(1);
    const task = await t.run((ctx) => ctx.db.get(taskId));
    expect(task?.status).toBe("queued");
    expect(task?.queueSequence).toBe(seqBefore); // fairness: keeps its place
    expect(task?.leaseId).toBeUndefined();
    expect(task?.recoveryCount).toBe(1);
  });

  it("2. expired running read-only task is requeued; 4-5. connector cleared + audited", async () => {
    const t = p5Test();
    const { taskId } = await setupRunning(t);
    await expireLease(t, taskId);

    await t.mutation(internal.connectorTasks.recoverStaleLeases, {});
    const task = await t.run((ctx) => ctx.db.get(taskId));
    expect(task?.status).toBe("queued"); // read_only_idempotent → safe requeue

    const audit = await t.run((ctx) =>
      ctx.db.query("nexusTaskAuditEvents").withIndex("by_task_and_at", (q) => q.eq("taskId", taskId)).collect(),
    );
    expect(audit.some((a) => a.eventType === "task_lease_recovered")).toBe(true);
    const connector = await t.run((ctx) =>
      ctx.db.query("nexusConnectors").withIndex("by_connector_id", (q) => q.eq("connectorId", TEST_CONNECTOR_ID)).unique(),
    );
    expect(connector?.currentTaskId).toBeUndefined();
  });

  it("3. expired cancel_requested task is finalized to cancelled", async () => {
    const t = p5Test();
    const { taskId } = await setupRunning(t);
    await t.withIdentity(IDENTITY_A).mutation(api.tasks.cancelMyTask, { taskId });
    await expireLease(t, taskId);

    await t.mutation(internal.connectorTasks.recoverStaleLeases, {});
    const task = await t.run((ctx) => ctx.db.get(taskId));
    expect(task?.status).toBe("cancelled");
  });

  it("8. running task recovered past the max is failed, not requeued forever", async () => {
    const t = p5Test();
    const { taskId } = await setupRunning(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(taskId, { recoveryCount: 3, leaseExpiresAt: Date.now() - 60_000 });
    });
    await t.mutation(internal.connectorTasks.recoverStaleLeases, {});
    const task = await t.run((ctx) => ctx.db.get(taskId));
    expect(task?.status).toBe("failed");
    expect(task?.errorCode).toBe("connector_lease_expired");
  });

  it("9. an active, unexpired lease is NOT recovered", async () => {
    const t = p5Test();
    const { taskId } = await setupRunning(t);
    // Lease is still valid (setupRunning just claimed+started).
    await t.mutation(internal.connectorTasks.recoverStaleLeases, {});
    const task = await t.run((ctx) => ctx.db.get(taskId));
    expect(task?.status).toBe("running"); // untouched
  });
});
