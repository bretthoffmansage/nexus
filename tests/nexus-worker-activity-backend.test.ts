// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  IDENTITY_A,
  IDENTITY_B,
  key,
  p5Test,
  seedApprovedReader,
  type P5Test,
} from "./helpers/convexP5";
import {
  clearConnectorEnv,
  fetchSigned,
  installConnectorEnv,
  seedConnector,
  TEST_CONNECTOR_ID,
} from "./helpers/convexP6";
import { WORKER_ACTIVITY_LIMITS } from "@/convex/lib/p5config";

beforeEach(() => installConnectorEnv());
afterEach(() => clearConnectorEnv());

/** Submit a task as A, claim + start it → a running task owned by A. */
async function setupRunning(t: P5Test, seed = "wa1") {
  await seedApprovedReader(t, IDENTITY_A);
  await seedConnector(t);
  const submit = await t
    .withIdentity(IDENTITY_A)
    .mutation(api.tasks.submitKnowledgeRequest, { requestText: "vault lookup", idempotencyKey: key(seed) });
  const claimed = await t.mutation(internal.connectorTasks.claimNextTask, { connectorId: TEST_CONNECTOR_ID });
  const leaseId = claimed.task!.leaseId;
  const taskId = submit.taskId as Id<"nexusTasks">;
  await t.mutation(internal.connectorTasks.startTask, {
    connectorId: TEST_CONNECTOR_ID,
    taskId,
    leaseId,
  });
  return { taskId, leaseId };
}

const OK_ACTIVITY = {
  surface: "chat",
  toolId: "vault.agentic_retrieval",
  worker: "cursor_cli",
  phase: "vault_retrieval",
  status: "running",
  message: "Searching approved vault notes…",
  occurredAt: "2026-07-08T10:00:00.000+00:00",
};

describe("appendConnectorActivity (persistence)", () => {
  it("persists a sanitized worker_activity event with structured metadata", async () => {
    const t = p5Test();
    const { taskId, leaseId } = await setupRunning(t);

    const res = await t.mutation(internal.connectorTasks.appendConnectorActivity, {
      connectorId: TEST_CONNECTOR_ID,
      taskId,
      leaseId,
      ...OK_ACTIVITY,
    });
    expect(res.accepted).toBe(true);

    const rows = await t.withIdentity(IDENTITY_A).query(api.taskProgress.listMyTaskProgress, { taskId });
    const activity = rows.filter((r) => r.eventType === "worker_activity");
    expect(activity).toHaveLength(1);
    expect(activity[0].message).toBe("Searching approved vault notes…");
    expect(activity[0].metadata).toMatchObject({
      surface: "chat",
      toolId: "vault.agentic_retrieval",
      worker: "cursor_cli",
      phase: "vault_retrieval",
      status: "running",
    });
  });

  it("drops (accepts without storing) an out-of-allowlist tuple", async () => {
    const t = p5Test();
    const { taskId, leaseId } = await setupRunning(t);

    const res = await t.mutation(internal.connectorTasks.appendConnectorActivity, {
      connectorId: TEST_CONNECTOR_ID,
      taskId,
      leaseId,
      ...OK_ACTIVITY,
      phase: "thinking_hard", // not allowlisted
    });
    expect(res.accepted).toBe(true);
    expect((res as { dropped?: string }).dropped).toBe("unrecognized");

    const rows = await t.withIdentity(IDENTITY_A).query(api.taskProgress.listMyTaskProgress, { taskId });
    expect(rows.filter((r) => r.eventType === "worker_activity")).toHaveLength(0);
  });

  it("drops an empty message without storing", async () => {
    const t = p5Test();
    const { taskId, leaseId } = await setupRunning(t);
    const res = await t.mutation(internal.connectorTasks.appendConnectorActivity, {
      connectorId: TEST_CONNECTOR_ID,
      taskId,
      leaseId,
      ...OK_ACTIVITY,
      message: "   ",
    });
    expect((res as { dropped?: string }).dropped).toBe("empty");
  });

  it("clamps an overly long message", async () => {
    const t = p5Test();
    const { taskId, leaseId } = await setupRunning(t);
    await t.mutation(internal.connectorTasks.appendConnectorActivity, {
      connectorId: TEST_CONNECTOR_ID,
      taskId,
      leaseId,
      ...OK_ACTIVITY,
      message: "y".repeat(5000),
    });
    const rows = await t.withIdentity(IDENTITY_A).query(api.taskProgress.listMyTaskProgress, { taskId });
    const activity = rows.find((r) => r.eventType === "worker_activity");
    expect(activity?.message?.length).toBeLessThanOrEqual(WORKER_ACTIVITY_LIMITS.maxMessageLength);
  });

  it("rejects a caller that does not hold the current lease", async () => {
    const t = p5Test();
    const { taskId } = await setupRunning(t);
    await expect(
      t.mutation(internal.connectorTasks.appendConnectorActivity, {
        connectorId: TEST_CONNECTOR_ID,
        taskId,
        leaseId: "bogus-lease",
        ...OK_ACTIVITY,
      }),
    ).rejects.toThrow();
  });

  it("cannot append activity to a terminal task (lease is released on completion)", async () => {
    const t = p5Test();
    const { taskId, leaseId } = await setupRunning(t);
    await t.mutation(internal.connectorTasks.completeTask, {
      connectorId: TEST_CONNECTOR_ID,
      taskId,
      leaseId,
      answerText: "done",
    });
    // Completion clears the lease, so any late activity is rejected — a
    // successful task never gains new activity events.
    await expect(
      t.mutation(internal.connectorTasks.appendConnectorActivity, {
        connectorId: TEST_CONNECTOR_ID,
        taskId,
        leaseId,
        ...OK_ACTIVITY,
      }),
    ).rejects.toThrow();
  });
});

describe("worker-activity owner isolation", () => {
  it("does not let another user read the owner's activity", async () => {
    const t = p5Test();
    const { taskId, leaseId } = await setupRunning(t);
    await t.mutation(internal.connectorTasks.appendConnectorActivity, {
      connectorId: TEST_CONNECTOR_ID,
      taskId,
      leaseId,
      ...OK_ACTIVITY,
    });
    await seedApprovedReader(t, IDENTITY_B);
    await expect(
      t.withIdentity(IDENTITY_B).query(api.taskProgress.listMyTaskProgress, { taskId }),
    ).rejects.toThrow();
  });
});

describe("worker-activity end-to-end via the signed /task endpoint", () => {
  it("transports a worker_activity event through the existing task path", async () => {
    const t = p5Test();
    const { taskId, leaseId } = await setupRunning(t, "wa-http");

    const res = await fetchSigned(t, {
      path: "/api/connector/v1/task",
      body: {
        action: "worker_activity",
        taskId,
        leaseId,
        activity: OK_ACTIVITY,
      },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);

    const rows = await t.withIdentity(IDENTITY_A).query(api.taskProgress.listMyTaskProgress, { taskId });
    const activity = rows.filter((r) => r.eventType === "worker_activity");
    expect(activity).toHaveLength(1);
    expect(activity[0].message).toBe("Searching approved vault notes…");
  });
});
