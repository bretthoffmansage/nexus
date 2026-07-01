// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import { NEXUS_PERMISSIONS, permissionsForRoles } from "@/convex/lib/permissions";
import {
  IDENTITY_A,
  IDENTITY_ADMIN,
  IDENTITY_B,
  key,
  p5Test,
  seedAdmin,
  seedApprovedReader,
} from "./helpers/convexP5";

/** Assert a Convex call rejects with a specific stable error code. */
async function rejectsWithCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ data: { code } });
}

/** Build two readers, A submits one request; returns A's ids for B to attack. */
async function setupAWithTask() {
  const t = p5Test();
  await seedApprovedReader(t, IDENTITY_A);
  await seedApprovedReader(t, IDENTITY_B);
  const asA = t.withIdentity(IDENTITY_A);
  const submit = await asA.mutation(api.tasks.submitKnowledgeRequest, {
    requestText: "User A private question about onboarding",
    idempotencyKey: key("a-first"),
  });
  return { t, asA, asB: t.withIdentity(IDENTITY_B), submit };
}

describe("P5 multi-user privacy (Part R)", () => {
  it("1. User A can create a conversation", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    const asA = t.withIdentity(IDENTITY_A);
    const convo = await asA.mutation(api.conversations.createConversation, {});
    expect(convo.status).toBe("active");
    expect(convo.id).toBeDefined();
  });

  it("2-3. User B cannot read or list User A's conversation", async () => {
    const { asB, submit } = await setupAWithTask();
    await rejectsWithCode(
      asB.query(api.conversations.getMyConversation, {
        conversationId: submit.conversationId,
      }),
      "conversation_not_found",
    );
    // B's own listing is empty — A's conversation never appears.
    const bList = await asB.query(api.conversations.listMyConversations, {});
    expect(bList.conversations).toHaveLength(0);
  });

  it("4. User B cannot append (submit) into User A's conversation", async () => {
    const { asB, submit } = await setupAWithTask();
    await rejectsWithCode(
      asB.mutation(api.tasks.submitKnowledgeRequest, {
        requestText: "B trying to write into A's thread",
        conversationId: submit.conversationId,
        idempotencyKey: key("b-intrude"),
      }),
      "conversation_not_found",
    );
  });

  it("5. User B cannot rename User A's conversation", async () => {
    const { asB, submit } = await setupAWithTask();
    await rejectsWithCode(
      asB.mutation(api.conversations.renameMyConversation, {
        conversationId: submit.conversationId,
        title: "hijacked",
      }),
      "conversation_not_found",
    );
  });

  it("6. User B cannot archive User A's conversation", async () => {
    const { asB, submit } = await setupAWithTask();
    await rejectsWithCode(
      asB.mutation(api.conversations.archiveMyConversation, {
        conversationId: submit.conversationId,
      }),
      "conversation_not_found",
    );
  });

  it("6b. User B cannot delete User A's conversation", async () => {
    const { asB, submit } = await setupAWithTask();
    await rejectsWithCode(
      asB.mutation(api.conversations.deleteMyConversation, {
        conversationId: submit.conversationId,
      }),
      "conversation_not_found",
    );
  });

  it("7. User B cannot read User A's messages", async () => {
    const { asB, submit } = await setupAWithTask();
    await rejectsWithCode(
      asB.query(api.messages.listMyConversationMessages, {
        conversationId: submit.conversationId,
      }),
      "conversation_not_found",
    );
    await rejectsWithCode(
      asB.query(api.conversations.getConversationTranscript, {
        conversationId: submit.conversationId,
      }),
      "conversation_not_found",
    );
  });

  it("8. User B cannot read User A's task", async () => {
    const { asB, submit } = await setupAWithTask();
    await rejectsWithCode(
      asB.query(api.tasks.getMyTask, { taskId: submit.taskId }),
      "task_not_found",
    );
  });

  it("9. User B cannot cancel User A's task", async () => {
    const { asB, submit } = await setupAWithTask();
    await rejectsWithCode(
      asB.mutation(api.tasks.cancelMyTask, { taskId: submit.taskId }),
      "task_not_found",
    );
  });

  it("10. User B cannot retry User A's task", async () => {
    const { asB, submit } = await setupAWithTask();
    await rejectsWithCode(
      asB.mutation(api.tasks.retryMyTask, {
        taskId: submit.taskId,
        idempotencyKey: key("b-retry-a"),
      }),
      "task_not_found",
    );
  });

  it("11-12. User B cannot read User A's result or sources", async () => {
    const { t, asA, asB, submit } = await setupAWithTask();
    // Worker (internal) writes a result + source for A's task.
    await t.mutation(internal.tasks.transitionTaskInternal, { taskId: submit.taskId, toStatus: "claimed" });
    await t.mutation(internal.tasks.transitionTaskInternal, { taskId: submit.taskId, toStatus: "running" });
    await t.mutation(internal.taskResults.writeTaskResultInternal, {
      taskId: submit.taskId,
      answerText: "A's private answer",
    });
    await t.mutation(internal.taskSources.replaceTaskSourcesInternal, {
      taskId: submit.taskId,
      sources: [{ sourceType: "vault_note", title: "A's private note" }],
    });
    await t.mutation(internal.tasks.transitionTaskInternal, { taskId: submit.taskId, toStatus: "completed" });

    // A can read; B cannot.
    const aResult = await asA.query(api.taskResults.getMyTaskResult, { taskId: submit.taskId });
    expect(aResult?.answerText).toBe("A's private answer");
    await rejectsWithCode(
      asB.query(api.taskResults.getMyTaskResult, { taskId: submit.taskId }),
      "task_not_found",
    );
    await rejectsWithCode(
      asB.query(api.taskSources.listMyTaskSources, { taskId: submit.taskId }),
      "task_not_found",
    );
    await rejectsWithCode(
      asB.query(api.taskProgress.listMyTaskProgress, { taskId: submit.taskId }),
      "task_not_found",
    );
  });

  it("13. Identical idempotency keys do NOT collide across users", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await seedApprovedReader(t, IDENTITY_B);
    const shared = key("shared-collision");
    const a = await t.withIdentity(IDENTITY_A).mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "A request",
      idempotencyKey: shared,
    });
    const b = await t.withIdentity(IDENTITY_B).mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "B request",
      idempotencyKey: shared,
    });
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(false);
    expect(a.taskId).not.toBe(b.taskId);
  });

  it("14-16. Separate, durable histories survive 'sign out / sign back in'", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await seedApprovedReader(t, IDENTITY_B);
    await t.withIdentity(IDENTITY_A).mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "A one",
      idempotencyKey: key("a1"),
    });
    await t.withIdentity(IDENTITY_A).mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "A two",
      idempotencyKey: key("a2"),
    });
    await t.withIdentity(IDENTITY_B).mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "B one",
      idempotencyKey: key("b1"),
    });

    // "Sign back in" = a fresh identity-scoped client; the data persists.
    const aAgain = await t.withIdentity(IDENTITY_A).query(api.tasks.listMyTasks, {});
    const bAgain = await t.withIdentity(IDENTITY_B).query(api.tasks.listMyTasks, {});
    expect(aAgain.tasks).toHaveLength(2);
    expect(bAgain.tasks).toHaveLength(1);
    expect(aAgain.tasks.every((task) => task.requestText.startsWith("A"))).toBe(true);
    expect(bAgain.tasks.every((task) => task.requestText.startsWith("B"))).toBe(true);
  });

  it("17. A guessed/valid document id does not leak another user's record", async () => {
    const { asB, submit } = await setupAWithTask();
    // B holds a genuinely valid conversation/task id (A's), yet learns nothing.
    await rejectsWithCode(
      asB.query(api.conversations.getMyConversation, { conversationId: submit.conversationId }),
      "conversation_not_found",
    );
    await rejectsWithCode(
      asB.query(api.tasks.getMyTask, { taskId: submit.taskId }),
      "task_not_found",
    );
  });
});

describe("P5 admin privacy boundary (Part R 18-20, Part V)", () => {
  it("18. nexus_admin without content permission cannot read User A's conversation", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await seedAdmin(t, IDENTITY_ADMIN);
    const submit = await t.withIdentity(IDENTITY_A).mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "A private",
      idempotencyKey: key("admin-probe"),
    });
    // Admin lacks knowledge_reader -> role gate denies before any ownership check.
    await rejectsWithCode(
      t.withIdentity(IDENTITY_ADMIN).query(api.conversations.getMyConversation, {
        conversationId: submit.conversationId,
      }),
      "role_required",
    );
    await rejectsWithCode(
      t.withIdentity(IDENTITY_ADMIN).query(api.tasks.getMyTask, { taskId: submit.taskId }),
      "role_required",
    );
  });

  it("admin role permissions never include private-content access", () => {
    const adminPerms = permissionsForRoles(["nexus_admin"]) as string[];
    for (const forbidden of [
      "conversations.read_own",
      "messages.read_own",
      "tasks.read_own",
      "results.read_own",
      "sources.read_own",
    ]) {
      expect(adminPerms).not.toContain(forbidden);
    }
    // And no *_all variants exist at all.
    expect(Object.values(NEXUS_PERMISSIONS as Record<string, string>)).not.toContain(
      "tasks.read_all",
    );
    expect(Object.values(NEXUS_PERMISSIONS as Record<string, string>)).not.toContain(
      "conversations.read_all",
    );
  });

  it("19. aggregate admin diagnostics contain only counts, never content", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await seedAdmin(t, IDENTITY_ADMIN);
    await t.withIdentity(IDENTITY_A).mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "Sensitive content that must never appear in diagnostics",
      idempotencyKey: key("diag"),
    });
    const diag = await t.withIdentity(IDENTITY_ADMIN).query(api.diagnostics.adminQueueDiagnostics, {});
    expect(diag.counts.queued).toBe(1);
    expect(diag.total).toBe(1);
    const serialized = JSON.stringify(diag);
    expect(serialized).not.toContain("Sensitive content");
    expect(serialized).not.toContain(IDENTITY_A.subject);
  });

  it("20. ordinary users cannot query the global queue diagnostics", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await rejectsWithCode(
      t.withIdentity(IDENTITY_A).query(api.diagnostics.adminQueueDiagnostics, {}),
      "role_required",
    );
  });
});

describe("P5 authentication & approval gates", () => {
  it("unauthenticated callers are rejected", async () => {
    const t = p5Test();
    await rejectsWithCode(
      t.query(api.tasks.listMyTasks, {}),
      "unauthenticated",
    );
  });

  it("approved user without knowledge_reader role is denied", async () => {
    const t = p5Test();
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("approvedUsers", {
        clerkUserId: IDENTITY_A.subject,
        primaryEmail: IDENTITY_A.email,
        status: "active",
        firstSeenAt: now,
        createdAt: now,
        updatedAt: now,
      });
    });
    await rejectsWithCode(
      t.withIdentity(IDENTITY_A).mutation(api.tasks.submitKnowledgeRequest, {
        requestText: "no role",
        idempotencyKey: key("norole"),
      }),
      "role_required",
    );
  });

  it("suspended user is denied even with a role", async () => {
    const t = p5Test();
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("approvedUsers", {
        clerkUserId: IDENTITY_A.subject,
        primaryEmail: IDENTITY_A.email,
        status: "suspended",
        firstSeenAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("userRoles", {
        clerkUserId: IDENTITY_A.subject,
        role: "knowledge_reader",
        grantedAt: now,
        grantedByClerkUserId: "system:test",
        active: true,
      });
    });
    await rejectsWithCode(
      t.withIdentity(IDENTITY_A).query(api.tasks.listMyTasks, {}),
      "user_suspended",
    );
  });
});
