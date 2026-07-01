// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import {
  IDENTITY_A,
  IDENTITY_B,
  key,
  p5Test,
  seedApprovedReader,
} from "./helpers/convexP5";

describe("P5 shared global queue (Part S)", () => {
  it("1-7. interleaved submissions get a deterministic global order; views stay private", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await seedApprovedReader(t, IDENTITY_B);
    const asA = t.withIdentity(IDENTITY_A);
    const asB = t.withIdentity(IDENTITY_B);

    const taskA = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "A-first",
      idempotencyKey: key("q-a1"),
    });
    const taskB = await asB.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "B-first",
      idempotencyKey: key("q-b1"),
    });
    const taskC = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "A-second",
      idempotencyKey: key("q-a2"),
    });

    // 4. Global queueSequence order is A, B, C.
    expect(taskA.queueSequence).toBe(1);
    expect(taskB.queueSequence).toBe(2);
    expect(taskC.queueSequence).toBe(3);

    const globalOrder = await t.run(async (ctx) =>
      (
        await ctx.db.query("nexusTasks").withIndex("by_queue_sequence").order("asc").collect()
      ).map((task) => ({ seq: task.queueSequence, text: task.requestText })),
    );
    expect(globalOrder).toEqual([
      { seq: 1, text: "A-first" },
      { seq: 2, text: "B-first" },
      { seq: 3, text: "A-second" },
    ]);

    // 5-6. Each user sees only their own.
    const aTasks = await asA.query(api.tasks.listMyTasks, {});
    const bTasks = await asB.query(api.tasks.listMyTasks, {});
    expect(aTasks.tasks.map((task) => task.requestText).sort()).toEqual(["A-first", "A-second"]);
    expect(bTasks.tasks.map((task) => task.requestText)).toEqual(["B-first"]);

    // 7. Neither user's list mentions the other's request text.
    expect(JSON.stringify(aTasks)).not.toContain("B-first");
    expect(JSON.stringify(bTasks)).not.toContain("A-first");
  });

  it("8. duplicate submission (same owner + key) creates exactly one task", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    const asA = t.withIdentity(IDENTITY_A);
    const first = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "Only once please",
      idempotencyKey: key("dupe"),
    });
    const second = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "Only once please",
      idempotencyKey: key("dupe"),
    });
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.taskId).toBe(first.taskId);
    expect(second.conversationId).toBe(first.conversationId);

    const list = await asA.query(api.tasks.listMyTasks, {});
    expect(list.tasks).toHaveLength(1);
    const counter = await t.run(async (ctx) =>
      ctx.db.query("nexusQueueCounter").withIndex("by_key", (q) => q.eq("key", "global")).unique(),
    );
    expect(counter?.value).toBe(1); // second submit allocated no new sequence
  });

  it("9. same key under different users creates independent tasks", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await seedApprovedReader(t, IDENTITY_B);
    const shared = key("cross-user");
    const a = await t.withIdentity(IDENTITY_A).mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "A",
      idempotencyKey: shared,
    });
    const b = await t.withIdentity(IDENTITY_B).mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "B",
      idempotencyKey: shared,
    });
    expect(a.taskId).not.toBe(b.taskId);
    expect(a.queueSequence).toBe(1);
    expect(b.queueSequence).toBe(2);
  });

  it("10. cancelled queued tasks drop out of queue-eligible ordering", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    const asA = t.withIdentity(IDENTITY_A);
    const task = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "cancel me",
      idempotencyKey: key("cancel-elig"),
    });
    await asA.mutation(api.tasks.cancelMyTask, { taskId: task.taskId });

    const stillQueued = await t.run(async (ctx) =>
      ctx.db
        .query("nexusTasks")
        .withIndex("by_status_and_queue_sequence", (q) => q.eq("status", "queued"))
        .collect(),
    );
    expect(stillQueued).toHaveLength(0);
  });

  it("11. retry receives a new, higher queueSequence", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    const asA = t.withIdentity(IDENTITY_A);
    const task = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "retry me",
      idempotencyKey: key("retry-seq"),
    });
    await asA.mutation(api.tasks.cancelMyTask, { taskId: task.taskId });
    const retried = await asA.mutation(api.tasks.retryMyTask, {
      taskId: task.taskId,
      idempotencyKey: key("retry-seq-2"),
    });
    expect(retried.queueSequence).toBeGreaterThan(task.queueSequence);
    expect(retried.attemptNumber).toBe(2);
  });

  it("12-13. client cannot supply queueSequence or priority", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    const asA = t.withIdentity(IDENTITY_A);
    await expect(
      asA.mutation(api.tasks.submitKnowledgeRequest, {
        requestText: "trying to jump the queue",
        idempotencyKey: key("inject-seq"),
        queueSequence: 0,
      } as never),
    ).rejects.toThrow();
    await expect(
      asA.mutation(api.tasks.submitKnowledgeRequest, {
        requestText: "trying to raise priority",
        idempotencyKey: key("inject-prio"),
        priority: -100,
      } as never),
    ).rejects.toThrow();
  });

  it("14. concurrent submissions allocate unique, gap-free queue sequences", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    const asA = t.withIdentity(IDENTITY_A);
    const N = 12;
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        asA.mutation(api.tasks.submitKnowledgeRequest, {
          requestText: `concurrent ${i}`,
          idempotencyKey: key(`conc-${i}`),
        }),
      ),
    );
    const sequences = results.map((r) => r.queueSequence).sort((a, b) => a - b);
    expect(sequences).toEqual(Array.from({ length: N }, (_, i) => i + 1));
    expect(new Set(sequences).size).toBe(N);
  });
});
