// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  collectEligiblePriorTurns,
  effectiveExecutionRequestText,
  formatExecutionRequest,
  type ConversationTurn,
} from "@/convex/lib/conversationContext";
import { CONVERSATION_CONTEXT } from "@/convex/lib/conversationContextConfig";
import {
  IDENTITY_A,
  IDENTITY_B,
  key,
  p5Test,
  seedApprovedReader,
  type P5Test,
} from "./helpers/convexP5";
import { installConnectorEnv, seedConnector, TEST_CONNECTOR_ID } from "./helpers/convexP6";

async function rejectsWithCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ data: { code } });
}

async function completeRoundTrip(
  t: P5Test,
  conversationId: Id<"nexusConversations">,
  taskId: Id<"nexusTasks">,
  answerText: string,
  sources?: Array<{ sourceType: "vault_note" | "membership_transcript"; title: string; locator?: string }>,
) {
  const status = await t.run(async (ctx) => (await ctx.db.get(taskId))?.status);
  if (status === "queued") {
    await t.mutation(internal.tasks.transitionTaskInternal, { taskId, toStatus: "claimed" });
    await t.mutation(internal.tasks.transitionTaskInternal, { taskId, toStatus: "running" });
  } else if (status === "claimed") {
    await t.mutation(internal.tasks.transitionTaskInternal, { taskId, toStatus: "running" });
  }
  await t.mutation(internal.taskResults.writeTaskResultInternal, { taskId, answerText });
  if (sources?.length) {
    await t.mutation(internal.taskSources.replaceTaskSourcesInternal, { taskId, sources });
  }
  await t.mutation(internal.messages.appendAssistantMessage, {
    conversationId,
    content: answerText,
    kind: "result_summary",
    taskId,
  });
  await t.mutation(internal.tasks.transitionTaskInternal, { taskId, toStatus: "completed" });
}

describe("conversation context formatter (pure)", () => {
  it("returns only the current request when no prior turns exist", () => {
    expect(formatExecutionRequest("Hello there", [])).toBe("Hello there");
    expect(formatExecutionRequest("Hello there", [])).not.toContain("PREVIOUS CONVERSATION");
  });

  it("includes prior user, Nexus, and compact sources with clear boundaries", () => {
    const turns: ConversationTurn[] = [
      {
        userMessage: "find themes in the last three Copy Clinic calls",
        nexusResponse: "The most recent three Copy Clinic calls discuss hooks, offers, and headlines.",
        sources: [
          {
            title: "Copy Clinic - June 23 2026",
            sourceType: "membership_transcript",
            locator: "membership_io:item:5449221",
          },
        ],
      },
    ];
    const formatted = formatExecutionRequest("Can you expand upon those themes?", turns);
    expect(formatted).toContain("PREVIOUS CONVERSATION FOR CONTEXT ONLY");
    expect(formatted).toContain("find themes in the last three Copy Clinic calls");
    expect(formatted).toContain("The most recent three Copy Clinic calls");
    expect(formatted).toContain(
      "- Copy Clinic - June 23 2026 | membership_transcript | membership_io:item:5449221",
    );
    expect(formatted).toContain("END OF PREVIOUS CONVERSATION CONTEXT");
    expect(formatted).toContain("CURRENT TASK FROM USER:");
    expect(formatted.endsWith("Can you expand upon those themes?")).toBe(true);
  });

  it("keeps only the newest four turns when five exist", () => {
    const turns: ConversationTurn[] = Array.from({ length: 5 }, (_, index) => ({
      userMessage: `user-${index + 1}`,
      nexusResponse: `nexus-${index + 1}`,
      sources: [],
    }));
    const formatted = formatExecutionRequest("current", turns);
    expect(formatted).not.toContain("user-1");
    expect(formatted).toContain("user-2");
    expect(formatted).toContain("user-5");
    expect(formatted).toContain("nexus-5");
  });
});

describe("conversation context at task creation", () => {
  it("first request has no execution wrapper; follow-up includes prior completed turn", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    const asA = t.withIdentity(IDENTITY_A);

    const first = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "find themes in the last three Copy Clinic calls",
      idempotencyKey: key("ctx-1"),
    });

    const firstRow = await t.run(async (ctx) => ctx.db.get(first.taskId));
    expect(firstRow?.requestText).toBe("find themes in the last three Copy Clinic calls");
    expect(firstRow?.executionRequestText).toBeUndefined();

    await completeRoundTrip(
      t,
      first.conversationId,
      first.taskId,
      "Themes include hooks, offers, and headlines.",
      [
        {
          sourceType: "membership_transcript",
          title: "Copy Clinic - June 23 2026",
          locator: "membership_io:item:5449221",
        },
      ],
    );

    const second = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "Can you expand upon those themes?",
      conversationId: first.conversationId,
      idempotencyKey: key("ctx-2"),
    });

    const userMessage = await t.run(async (ctx) => ctx.db.get(second.requestMessageId));
    expect(userMessage?.content).toBe("Can you expand upon those themes?");

    const secondRow = await t.run(async (ctx) => ctx.db.get(second.taskId));
    expect(secondRow?.requestText).toBe("Can you expand upon those themes?");
    expect(secondRow?.executionRequestText).toContain("PREVIOUS CONVERSATION FOR CONTEXT ONLY");
    expect(secondRow?.executionRequestText).toContain("find themes in the last three Copy Clinic calls");
    expect(secondRow?.executionRequestText).toContain("Themes include hooks, offers, and headlines.");
    expect(secondRow?.executionRequestText).toContain("CURRENT TASK FROM USER:");
    expect(secondRow?.executionRequestText).toContain("Can you expand upon those themes?");
  });

  it("isolates context by conversation and owner", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await seedApprovedReader(t, IDENTITY_B);
    const asA = t.withIdentity(IDENTITY_A);
    const asB = t.withIdentity(IDENTITY_B);

    const convoA = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "Conversation A secret topic",
      idempotencyKey: key("iso-a1"),
    });
    await completeRoundTrip(t, convoA.conversationId, convoA.taskId, "Answer about A");

    const convoB = await asB.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "Conversation B unrelated",
      idempotencyKey: key("iso-b1"),
    });
    await completeRoundTrip(t, convoB.conversationId, convoB.taskId, "Answer about B");

    const followA = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "Follow up in A",
      conversationId: convoA.conversationId,
      idempotencyKey: key("iso-a2"),
    });
    const followB = await asB.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "Follow up in B",
      conversationId: convoB.conversationId,
      idempotencyKey: key("iso-b2"),
    });

    const rowA = await t.run(async (ctx) => ctx.db.get(followA.taskId));
    const rowB = await t.run(async (ctx) => ctx.db.get(followB.taskId));
    expect(rowA?.executionRequestText).toContain("Conversation A secret topic");
    expect(rowA?.executionRequestText).not.toContain("Conversation B unrelated");
    expect(rowB?.executionRequestText).toContain("Conversation B unrelated");
    expect(rowB?.executionRequestText).not.toContain("Conversation A secret topic");
  });

  it("excludes queued, running, and failed prior tasks", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    const asA = t.withIdentity(IDENTITY_A);

    const completed = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "completed turn",
      idempotencyKey: key("elig-done"),
    });
    await completeRoundTrip(t, completed.conversationId, completed.taskId, "done answer");

    const queued = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "still queued",
      conversationId: completed.conversationId,
      idempotencyKey: key("elig-queue"),
    });
    const running = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "now running",
      conversationId: completed.conversationId,
      idempotencyKey: key("elig-run"),
    });
    await t.mutation(internal.tasks.transitionTaskInternal, {
      taskId: running.taskId,
      toStatus: "claimed",
    });
    await t.mutation(internal.tasks.transitionTaskInternal, {
      taskId: running.taskId,
      toStatus: "running",
    });

    const failed = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "will fail",
      conversationId: completed.conversationId,
      idempotencyKey: key("elig-fail"),
    });
    await t.mutation(internal.tasks.transitionTaskInternal, { taskId: failed.taskId, toStatus: "claimed" });
    await t.mutation(internal.tasks.transitionTaskInternal, { taskId: failed.taskId, toStatus: "running" });
    await t.mutation(internal.tasks.transitionTaskInternal, {
      taskId: failed.taskId,
      toStatus: "failed",
      errorCode: "test_fail",
    });

    const follow = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "next question",
      conversationId: completed.conversationId,
      idempotencyKey: key("elig-follow"),
    });

    const row = await t.run(async (ctx) => ctx.db.get(follow.taskId));
    expect(row?.executionRequestText).toContain("completed turn");
    expect(row?.executionRequestText).not.toContain("still queued");
    expect(row?.executionRequestText).not.toContain("now running");
    expect(row?.executionRequestText).not.toContain("will fail");
    void queued;
  });

  it("persists execution request for claim and does not change on later turns", async () => {
    installConnectorEnv();
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await seedConnector(t);
    const asA = t.withIdentity(IDENTITY_A);

    const first = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "first",
      idempotencyKey: key("persist-1"),
    });
    await completeRoundTrip(t, first.conversationId, first.taskId, "first answer");

    const second = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "second",
      conversationId: first.conversationId,
      idempotencyKey: key("persist-2"),
    });

    const beforeClaim = await t.run(async (ctx) => ctx.db.get(second.taskId));
    const claimed = await t.mutation(internal.connectorTasks.claimNextTask, {
      connectorId: TEST_CONNECTOR_ID,
    });
    expect(claimed.task?.requestText).toBe(beforeClaim?.executionRequestText);
    expect(claimed.task?.requestText).toContain("first");
    expect(claimed.task?.requestText).toContain("CURRENT TASK FROM USER:");
    expect(claimed.task?.requestText).toContain("second");

    await completeRoundTrip(t, first.conversationId, second.taskId, "second answer");

    const after = await t.run(async (ctx) => ctx.db.get(second.taskId));
    expect(after?.executionRequestText).toBe(beforeClaim?.executionRequestText);
    expect(effectiveExecutionRequestText(after!)).toBe(beforeClaim?.executionRequestText);
  });

  it("does not use deleted-conversation tasks as context for another conversation", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    const asA = t.withIdentity(IDENTITY_A);

    const doomed = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "deleted thread topic",
      idempotencyKey: key("del-ctx-1"),
    });
    await completeRoundTrip(t, doomed.conversationId, doomed.taskId, "deleted answer");
    await asA.mutation(api.conversations.deleteMyConversation, {
      conversationId: doomed.conversationId,
    });

    const fresh = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "fresh follow-up",
      idempotencyKey: key("del-ctx-2"),
    });

    const row = await t.run(async (ctx) => ctx.db.get(fresh.taskId));
    expect(row?.executionRequestText).toBeUndefined();
    expect(row?.requestText).toBe("fresh follow-up");

    const tasks = await asA.query(api.tasks.listMyTasks, {});
    expect(tasks.tasks.some((task) => task.id === doomed.taskId)).toBe(true);
  });

  it("rejects foreign conversation submission server-side", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await seedApprovedReader(t, IDENTITY_B);
    const asA = t.withIdentity(IDENTITY_A);
    const asB = t.withIdentity(IDENTITY_B);

    const aConvo = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "private A",
      idempotencyKey: key("foreign-a"),
    });
    await completeRoundTrip(t, aConvo.conversationId, aConvo.taskId, "A answer");

    await rejectsWithCode(
      asB.mutation(api.tasks.submitKnowledgeRequest, {
        requestText: "intrude",
        conversationId: aConvo.conversationId,
        idempotencyKey: key("foreign-b"),
      }),
      "conversation_not_found",
    );
  });
});

describe("collectEligiblePriorTurns", () => {
  it("returns only paired completed turns in chronological order", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    const asA = t.withIdentity(IDENTITY_A);
    const submit = await asA.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "one",
      idempotencyKey: key("collect-1"),
    });
    await completeRoundTrip(t, submit.conversationId, submit.taskId, "answer one");

    const turns = await t.run(async (ctx) =>
      collectEligiblePriorTurns(ctx, {
        conversationId: submit.conversationId,
        ownerClerkUserId: IDENTITY_A.subject,
      }),
    );
    expect(turns).toHaveLength(1);
    expect(turns[0].userMessage).toBe("one");
    expect(turns[0].nexusResponse).toBe("answer one");
  });
});
