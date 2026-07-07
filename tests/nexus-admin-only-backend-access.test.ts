// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import {
  IDENTITY_A,
  IDENTITY_ADMIN,
  key,
  p5Test,
  seedApprovedAdmin,
  seedApprovedReader,
  type P5Test,
} from "./helpers/convexP5";

async function rejectsWithCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ data: { code } });
}

const REVOKED = { subject: "user_revoked", email: "revoked@example.com" } as const;
const SUSPENDED = { subject: "user_suspended", email: "suspended@example.com" } as const;
const NO_ROLE = { subject: "user_norole", email: "norole@example.com" } as const;

/** Approved + active, holds knowledge_reader but a REVOKED (inactive) nexus_admin. */
async function seedRevokedAdmin(t: P5Test): Promise<void> {
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("approvedUsers", {
      clerkUserId: REVOKED.subject,
      primaryEmail: REVOKED.email,
      status: "active",
      firstSeenAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("userRoles", {
      clerkUserId: REVOKED.subject,
      role: "knowledge_reader",
      grantedAt: now,
      grantedByClerkUserId: "system:test",
      active: true,
    });
    await ctx.db.insert("userRoles", {
      clerkUserId: REVOKED.subject,
      role: "nexus_admin",
      grantedAt: now,
      grantedByClerkUserId: "system:test",
      active: false,
    });
  });
}

/** Suspended user who still carries an active nexus_admin role row. */
async function seedSuspendedAdmin(t: P5Test): Promise<void> {
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("approvedUsers", {
      clerkUserId: SUSPENDED.subject,
      primaryEmail: SUSPENDED.email,
      status: "suspended",
      firstSeenAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("userRoles", {
      clerkUserId: SUSPENDED.subject,
      role: "nexus_admin",
      grantedAt: now,
      grantedByClerkUserId: "system:test",
      active: true,
    });
  });
}

/** Approved + active but holding no roles at all. */
async function seedApprovedNoRole(t: P5Test): Promise<void> {
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("approvedUsers", {
      clerkUserId: NO_ROLE.subject,
      primaryEmail: NO_ROLE.email,
      status: "active",
      firstSeenAt: now,
      createdAt: now,
      updatedAt: now,
    });
  });
}

const VALID_ID = "nexus-research_abcd1234";
const VALID_IDEM = "nexus-research-run_abcd1234";

describe("admin-only backend authorization — knowledge_reader is denied", () => {
  it("rejects Deep Research submission, history, retry-surface for a reader", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    const asReader = t.withIdentity(IDENTITY_A);
    await rejectsWithCode(
      asReader.mutation(api.deepResearch.submitDeepResearch, {
        requestText: "Reader tries research",
        researchRequestId: VALID_ID,
        idempotencyKey: VALID_IDEM,
      }),
      "role_required",
    );
    await rejectsWithCode(
      asReader.query(api.deepResearch.listMyDeepResearchTasks, { limit: 5 }),
      "role_required",
    );
  });

  it("rejects Calendar create/update/delete/list/read for a reader", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    const asReader = t.withIdentity(IDENTITY_A);
    await rejectsWithCode(
      asReader.mutation(api.scheduledEvents.createMyScheduledEvent, {
        title: "Reader event",
        taskRequest: "do a thing",
        requestedToolId: "research.hermes_deep_research",
        localScheduledDate: "2031-01-01",
        localScheduledTime: "09:00",
        timezone: "UTC",
      }),
      "role_required",
    );
    await rejectsWithCode(
      asReader.query(api.scheduledEvents.listMyScheduledEventsForRange, {
        startDate: "2031-01-01",
        endDate: "2031-01-31",
      }),
      "role_required",
    );
    await rejectsWithCode(
      asReader.query(api.scheduledEvents.listAllowedScheduledTools, {}),
      "role_required",
    );
  });

  it("rejects Vault Library upload/list/process/archive/delete for a reader", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    const asReader = t.withIdentity(IDENTITY_A);
    await rejectsWithCode(asReader.mutation(api.libraryDocuments.generateUploadUrl, {}), "role_required");
    await rejectsWithCode(
      asReader.query(api.libraryDocuments.listMyLibraryVersions, {}),
      "role_required",
    );
  });

  it("rejects Library content creation even through the internal finalize path (defense-in-depth)", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    const storageId = await t.run(async (ctx) => ctx.storage.store(new Blob([new Uint8Array([1, 2, 3])])));
    await rejectsWithCode(
      t.mutation(internal.libraryDocuments.finalizeUploadRecord, {
        clerkUserId: IDENTITY_A.subject,
        storageId,
        originalFilename: "note.txt",
        contentType: "text/plain",
        byteLength: 3,
        sha256: "a".repeat(64),
      }),
      "role_required",
    );
  });

  it("rejects the private Skills catalog query for a reader", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await rejectsWithCode(
      t.withIdentity(IDENTITY_A).query(api.skillsCatalog.listSkillsCatalog, {}),
      "role_required",
    );
  });
});

describe("admin-only backend authorization — active admin retains access", () => {
  it("allows the admin-only read surfaces for an active admin (both roles)", async () => {
    const t = p5Test();
    await seedApprovedAdmin(t, IDENTITY_ADMIN);
    const asAdmin = t.withIdentity(IDENTITY_ADMIN);
    await expect(asAdmin.query(api.skillsCatalog.listSkillsCatalog, {})).resolves.toBeTruthy();
    await expect(
      asAdmin.query(api.deepResearch.listMyDeepResearchTasks, { limit: 5 }),
    ).resolves.toBeTruthy();
    await expect(asAdmin.query(api.libraryDocuments.listMyLibraryVersions, {})).resolves.toBeDefined();
    await expect(
      asAdmin.query(api.scheduledEvents.listMyScheduledEventsForRange, {
        startDate: "2031-01-01",
        endDate: "2031-01-31",
      }),
    ).resolves.toBeDefined();
    await expect(asAdmin.query(api.scheduledEvents.listAllowedScheduledTools, {})).resolves.toBeTruthy();
  });
});

describe("admin-only backend authorization — fail-closed states", () => {
  it("denies a revoked (inactive) nexus_admin", async () => {
    const t = p5Test();
    await seedRevokedAdmin(t);
    await rejectsWithCode(
      t.withIdentity(REVOKED).query(api.skillsCatalog.listSkillsCatalog, {}),
      "role_required",
    );
    await rejectsWithCode(
      t.withIdentity(REVOKED).query(api.deepResearch.listMyDeepResearchTasks, {}),
      "role_required",
    );
  });

  it("denies a suspended user even with an active nexus_admin role row", async () => {
    const t = p5Test();
    await seedSuspendedAdmin(t);
    await rejectsWithCode(
      t.withIdentity(SUSPENDED).query(api.skillsCatalog.listSkillsCatalog, {}),
      "user_suspended",
    );
  });

  it("denies an approved user holding no roles", async () => {
    const t = p5Test();
    await seedApprovedNoRole(t);
    await rejectsWithCode(
      t.withIdentity(NO_ROLE).query(api.skillsCatalog.listSkillsCatalog, {}),
      "role_required",
    );
  });

  it("denies an unauthenticated caller", async () => {
    const t = p5Test();
    await rejectsWithCode(t.query(api.skillsCatalog.listSkillsCatalog, {}), "unauthenticated");
  });
});

describe("admin-only backend authorization — shared surfaces unchanged", () => {
  it("still lets a knowledge_reader submit Chat tasks and read their own tasks", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    const asReader = t.withIdentity(IDENTITY_A);
    const submit = await asReader.mutation(api.tasks.submitKnowledgeRequest, {
      requestText: "ordinary chat question",
      idempotencyKey: key("shared-chat"),
    });
    expect(submit.taskId).toBeTruthy();
    const task = await asReader.query(api.tasks.getMyTask, { taskId: submit.taskId });
    expect(task?.requestText).toBe("ordinary chat question");
    const list = await asReader.query(api.tasks.listMyTasks, {});
    expect(list.tasks.length).toBe(1);
  });

  it("still lets a knowledge_reader read their Notes surface", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    const notes = await t
      .withIdentity(IDENTITY_A)
      .query(api.notes.listMyNotes, { archived: false });
    expect(Array.isArray(notes)).toBe(true);
  });
});
