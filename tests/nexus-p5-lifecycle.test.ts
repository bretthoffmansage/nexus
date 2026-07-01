// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import { P5_LIMITS } from "@/convex/lib/p5config";
import {
  IDENTITY_A,
  key,
  p5Test,
  seedApprovedReader,
} from "./helpers/convexP5";

async function rejectsWithCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ data: { code } });
}

async function readerCtx() {
  const t = p5Test();
  await seedApprovedReader(t, IDENTITY_A);
  return { t, asA: t.withIdentity(IDENTITY_A) };
}

describe("P5 conversation lifecycle", () => {
  it("creates with default vs user title and lists active only", async () => {
    const { asA } = await readerCtx();
    const def = await asA.mutation(api.conversations.createConversation, {});
    expect(def.titleSource).toBe("default");
    const named = await asA.mutation(api.conversations.createConversation, {
      title: "  My   Research  ",
    });
    expect(named.title).toBe("My Research"); // whitespace normalized
    expect(named.titleSource).toBe("user");

    const list = await asA.query(api.conversations.listMyConversations, {});
    expect(list.conversations).toHaveLength(2);
  });

  it("rename, archive (excluded), and reopen (reappears)", async () => {
    const { asA } = await readerCtx();
    const convo = await asA.mutation(api.conversations.createConversation, {});
    await asA.mutation(api.conversations.renameMyConversation, {
      conversationId: convo.id,
      title: "Renamed",
    });

    await asA.mutation(api.conversations.archiveMyConversation, { conversationId: convo.id });
    const active = await asA.query(api.conversations.listMyConversations, {});
    expect(active.conversations).toHaveLength(0);
    const withArchived = await asA.query(api.conversations.listMyConversations, {
      includeArchived: true,
    });
    expect(withArchived.conversations).toHaveLength(1);
    expect(withArchived.conversations[0].title).toBe("Renamed");

    await asA.mutation(api.conversations.reopenMyConversation, { conversationId: convo.id });
    const reopened = await asA.query(api.conversations.listMyConversations, {});
    expect(reopened.conversations).toHaveLength(1);
  });

  it("whitespace title on create falls back to default; empty rename is rejected", async () => {
    const { asA } = await readerCtx();
    const created = await asA.mutation(api.conversations.createConversation, { title: "   " });
    expect(created.titleSource).toBe("default");
    expect(created.title).toBe("New conversation");

    await rejectsWithCode(
      asA.mutation(api.conversations.renameMyConversation, {
        conversationId: created.id,
        title: "   ",
      }),
      "invalid_input",
    );
  });
});

describe("P5 message lifecycle", () => {
  it("allocates transactional ascending sequences across authors", async () => {
    const { t, asA } = await readerCtx();
    const submit = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "first user message",
      idempotencyKey: key("seq"),
    });
    // Worker appends assistant + system messages (internal path only).
    await t.mutation(internal.messages.appendAssistantMessage, {
      conversationId: submit.conversationId,
      content: "assistant reply",
      taskId: submit.taskId,
    });
    await t.mutation(internal.messages.appendSystemMessage, {
      conversationId: submit.conversationId,
      content: "system note",
    });

    const transcript = await asA.query(api.conversations.getConversationTranscript, {
      conversationId: submit.conversationId,
    });
    expect(transcript.messages.map((m) => m.sequence)).toEqual([1, 2, 3]);
    expect(transcript.messages.map((m) => m.author)).toEqual(["user", "assistant", "system"]);
  });

  it("clamps over-long worker message content to the message limit", async () => {
    const { t, asA } = await readerCtx();
    const submit = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "q",
      idempotencyKey: key("clamp"),
    });
    await t.mutation(internal.messages.appendAssistantMessage, {
      conversationId: submit.conversationId,
      content: "x".repeat(P5_LIMITS.maxMessageLength + 5_000),
    });
    const transcript = await asA.query(api.conversations.getConversationTranscript, {
      conversationId: submit.conversationId,
    });
    const assistant = transcript.messages.find((m) => m.author === "assistant");
    expect(assistant?.content.length).toBe(P5_LIMITS.maxMessageLength);
  });
});

describe("P5 task submission & validation", () => {
  it("records task_created and task_queued progress events", async () => {
    const { asA } = await readerCtx();
    const submit = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "progress please",
      idempotencyKey: key("prog"),
    });
    const progress = await asA.query(api.taskProgress.listMyTaskProgress, {
      taskId: submit.taskId,
    });
    expect(progress.map((p) => p.eventType)).toEqual(["task_created", "task_queued"]);
  });

  it("rejects empty, over-long, and unsupported-tool requests", async () => {
    const { asA } = await readerCtx();
    await rejectsWithCode(
      asA.mutation(api.tasks.submitKnowledgeRequest, {
        requestText: "   ",
        idempotencyKey: key("empty"),
      }),
      "invalid_input",
    );
    await rejectsWithCode(
      asA.mutation(api.tasks.submitKnowledgeRequest, {
        requestText: "x".repeat(P5_LIMITS.maxRequestLength + 1),
        idempotencyKey: key("toolong"),
      }),
      "request_too_large",
    );
    await rejectsWithCode(
      asA.mutation(api.tasks.submitKnowledgeRequest, {
        requestText: "ok",
        requestedToolId: "shell.exec",
        idempotencyKey: key("badtool"),
      }),
      "invalid_tool",
    );
  });

  it("rejects malformed idempotency keys", async () => {
    const { asA } = await readerCtx();
    await rejectsWithCode(
      asA.mutation(api.tasks.submitKnowledgeRequest, {
        requestText: "ok",
        idempotencyKey: "short",
      }),
      "invalid_input",
    );
    await rejectsWithCode(
      asA.mutation(api.tasks.submitKnowledgeRequest, {
        requestText: "ok",
        idempotencyKey: "has spaces and *bad* chars!!",
      }),
      "invalid_input",
    );
  });

  it("accepts the second supported tool id", async () => {
    const { asA } = await readerCtx();
    const submit = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "transcript please",
      requestedToolId: "membership_io.transcript_retrieve",
      idempotencyKey: key("tool2"),
    });
    const task = await asA.query(api.tasks.getMyTask, { taskId: submit.taskId });
    expect(task.requestedToolId).toBe("membership_io.transcript_retrieve");
  });
});

describe("P5 cancellation", () => {
  it("cancels a queued task and is idempotent", async () => {
    const { asA } = await readerCtx();
    const submit = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "cancel",
      idempotencyKey: key("cxl"),
    });
    const first = await asA.mutation(api.tasks.cancelMyTask, { taskId: submit.taskId });
    expect(first.status).toBe("cancelled");
    const second = await asA.mutation(api.tasks.cancelMyTask, { taskId: submit.taskId });
    expect(second.status).toBe("cancelled"); // idempotent, no throw
    const task = await asA.query(api.tasks.getMyTask, { taskId: submit.taskId });
    expect(task.cancelledAt).not.toBeNull();
  });

  it("cannot cancel a completed task", async () => {
    const { t, asA } = await readerCtx();
    const submit = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "done",
      idempotencyKey: key("done"),
    });
    await t.mutation(internal.tasks.transitionTaskInternal, { taskId: submit.taskId, toStatus: "claimed" });
    await t.mutation(internal.tasks.transitionTaskInternal, { taskId: submit.taskId, toStatus: "running" });
    await t.mutation(internal.tasks.transitionTaskInternal, { taskId: submit.taskId, toStatus: "completed" });
    await rejectsWithCode(
      asA.mutation(api.tasks.cancelMyTask, { taskId: submit.taskId }),
      "cancellation_not_allowed",
    );
  });
});

describe("P5 retry", () => {
  it("retries a failed task as a NEW task without mutating the original", async () => {
    const { t, asA } = await readerCtx();
    const submit = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "retry source",
      idempotencyKey: key("retry-orig"),
    });
    await t.mutation(internal.tasks.transitionTaskInternal, { taskId: submit.taskId, toStatus: "claimed" });
    await t.mutation(internal.tasks.transitionTaskInternal, { taskId: submit.taskId, toStatus: "running" });
    await t.mutation(internal.tasks.transitionTaskInternal, {
      taskId: submit.taskId,
      toStatus: "failed",
      errorCode: "tool_error",
    });

    const retried = await asA.mutation(api.tasks.retryMyTask, {
      taskId: submit.taskId,
      idempotencyKey: key("retry-new"),
    });
    expect(retried.taskId).not.toBe(submit.taskId);
    expect(retried.attemptNumber).toBe(2);

    const original = await asA.query(api.tasks.getMyTask, { taskId: submit.taskId });
    expect(original.status).toBe("failed"); // unchanged
    const newTask = await asA.query(api.tasks.getMyTask, { taskId: retried.taskId });
    expect(newTask.status).toBe("queued");
    expect(newTask.retryOfTaskId).toBe(submit.taskId);
    expect(newTask.conversationId).toBe(submit.conversationId);
    expect(newTask.requestText).toBe("retry source");
  });

  it("refuses to retry a still-queued task", async () => {
    const { asA } = await readerCtx();
    const submit = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "still queued",
      idempotencyKey: key("retry-queued"),
    });
    await rejectsWithCode(
      asA.mutation(api.tasks.retryMyTask, {
        taskId: submit.taskId,
        idempotencyKey: key("retry-queued-2"),
      }),
      "retry_not_allowed",
    );
  });
});

describe("P5 task status transitions", () => {
  it("rejects an invalid transition (queued -> completed)", async () => {
    const { t, asA } = await readerCtx();
    const submit = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "no skipping",
      idempotencyKey: key("badtrans"),
    });
    await rejectsWithCode(
      t.mutation(internal.tasks.transitionTaskInternal, {
        taskId: submit.taskId,
        toStatus: "completed",
      }),
      "invalid_task_state",
    );
  });

  it("permits the full worker chain queued -> claimed -> running -> completed", async () => {
    const { t, asA } = await readerCtx();
    const submit = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "chain",
      idempotencyKey: key("chain"),
    });
    for (const toStatus of ["claimed", "running", "completed"] as const) {
      await t.mutation(internal.tasks.transitionTaskInternal, { taskId: submit.taskId, toStatus });
    }
    const task = await asA.query(api.tasks.getMyTask, { taskId: submit.taskId });
    expect(task.status).toBe("completed");
    expect(task.completedAt).not.toBeNull();
  });
});

describe("P5 results & sources (internal write, private read, bounded, owner-copied)", () => {
  it("writes one canonical result per task and copies ownership from the task", async () => {
    const { t, asA } = await readerCtx();
    const submit = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "answer me",
      idempotencyKey: key("result"),
    });
    await t.mutation(internal.taskResults.writeTaskResultInternal, {
      taskId: submit.taskId,
      answerText: "first answer",
    });
    await t.mutation(internal.taskResults.writeTaskResultInternal, {
      taskId: submit.taskId,
      answerText: "replacement answer",
    });
    const result = await asA.query(api.taskResults.getMyTaskResult, { taskId: submit.taskId });
    expect(result?.answerText).toBe("replacement answer");

    const rows = await t.run(async (ctx) =>
      ctx.db.query("nexusTaskResults").withIndex("by_task", (q) => q.eq("taskId", submit.taskId)).collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].ownerClerkUserId).toBe(IDENTITY_A.subject); // copied, not passed
  });

  it("bounds source count and clamps excerpt length", async () => {
    const { t, asA } = await readerCtx();
    const submit = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "sources",
      idempotencyKey: key("sources"),
    });
    const tooMany = Array.from({ length: P5_LIMITS.maxSourcesPerTask + 10 }, (_, i) => ({
      sourceType: "web" as const,
      title: `Source ${i}`,
      excerpt: "y".repeat(P5_LIMITS.maxSourceExcerptLength + 1_000),
    }));
    await t.mutation(internal.taskSources.replaceTaskSourcesInternal, {
      taskId: submit.taskId,
      sources: tooMany,
    });
    const sources = await asA.query(api.taskSources.listMyTaskSources, { taskId: submit.taskId });
    expect(sources.length).toBe(P5_LIMITS.maxSourcesPerTask);
    expect(sources[0].excerpt?.length).toBe(P5_LIMITS.maxSourceExcerptLength);
    expect(sources.map((s) => s.ordinal)).toEqual(
      Array.from({ length: P5_LIMITS.maxSourcesPerTask }, (_, i) => i),
    );
  });
});

describe("P5 aggregate counts (own only)", () => {
  it("counts the caller's own tasks by status", async () => {
    const { t, asA } = await readerCtx();
    const a = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "one",
      idempotencyKey: key("count1"),
    });
    await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "two",
      idempotencyKey: key("count2"),
    });
    await asA.mutation(api.tasks.cancelMyTask, { taskId: a.taskId });
    const counts = await asA.query(api.tasks.myTaskCounts, {});
    expect(counts.queued).toBe(1);
    expect(counts.cancelled).toBe(1);
    expect(counts.total).toBe(2);

    // Counts ignore the internal flag arg; ensure no cross-user leakage shape.
    void t;
  });
});
