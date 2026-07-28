// @vitest-environment edge-runtime
// Claim envelope carries the submitting account's display name (requestedBy)
// so the system's capacity console can label Console tasks "Console [Brett]".
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import { IDENTITY_A, key, p5Test, seedApprovedReader, type P5Test } from "./helpers/convexP5";
import {
  clearConnectorEnv,
  installConnectorEnv,
  seedConnector,
  TEST_CONNECTOR_ID,
} from "./helpers/convexP6";

beforeEach(() => installConnectorEnv());
afterEach(() => clearConnectorEnv());

async function submitTask(t: P5Test, seed: string) {
  return t.withIdentity(IDENTITY_A).mutation(api.tasks.submitKnowledgeRequest, {
    requestText: "who is speaking in the kickoff call?",
    idempotencyKey: key(seed),
  });
}

async function setDisplayName(t: P5Test, clerkUserId: string, displayName: string) {
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query("approvedUsers")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
      .unique();
    if (row) await ctx.db.patch(row._id, { displayName });
  });
}

describe("claim envelope requestedBy", () => {
  it("carries the owner's displayName when set", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await setDisplayName(t, IDENTITY_A.subject, "Brett");
    await seedConnector(t);
    await submitTask(t, "rb1");

    const result = await t.mutation(internal.connectorTasks.claimNextTask, {
      connectorId: TEST_CONNECTOR_ID,
    });
    expect(result.status).toBe("claimed");
    expect(result.task?.requestedBy).toBe("Brett");
  });

  it("falls back to the email local part when displayName is absent", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A); // seeded without displayName
    await seedConnector(t);
    await submitTask(t, "rb2");

    const result = await t.mutation(internal.connectorTasks.claimNextTask, {
      connectorId: TEST_CONNECTOR_ID,
    });
    expect(result.status).toBe("claimed");
    expect(result.task?.requestedBy).toBe(IDENTITY_A.email.split("@")[0]);
  });

  it("is bounded to 64 characters", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await setDisplayName(t, IDENTITY_A.subject, "B".repeat(200));
    await seedConnector(t);
    await submitTask(t, "rb3");

    const result = await t.mutation(internal.connectorTasks.claimNextTask, {
      connectorId: TEST_CONNECTOR_ID,
    });
    expect(result.task?.requestedBy).toHaveLength(64);
  });
});
