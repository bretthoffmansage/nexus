// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import { IDENTITY_A, key, p5Test, seedApprovedReader } from "./helpers/convexP5";

describe("P5 convex-test smoke", () => {
  it("an approved reader can submit a request and see their own task", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);

    const asA = t.withIdentity(IDENTITY_A);
    const submit = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "What does the vault say about onboarding?",
      idempotencyKey: key("smoke"),
    });

    expect(submit.duplicate).toBe(false);
    expect(submit.status).toBe("queued");
    expect(submit.queueSequence).toBe(1);

    const list = await asA.query(api.tasks.listMyTasks, {});
    expect(list.tasks).toHaveLength(1);
    expect(list.tasks[0].id).toBe(submit.taskId);
    expect(list.tasks[0].requestedToolId).toBe("vault.agentic_retrieval");
  });
});
