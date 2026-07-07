// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import {
  hasDeepResearchAccess,
  NEXUS_ROLES,
  permissionsForRoles,
  type NexusRole,
} from "@/convex/lib/permissions";
import {
  IDENTITY_A,
  IDENTITY_ADMIN,
  p5Test,
  seedAdmin,
  seedApprovedReader,
  type P5Test,
} from "./helpers/convexP5";

async function rejectsWithCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ data: { code } });
}

/** knowledge_reader + deep_researcher (the intended Deep Researcher user). */
async function seedReaderPlusDeepResearcher(
  t: P5Test,
  identity: { subject: string; email: string },
): Promise<void> {
  await seedApprovedReader(t, identity);
  await t.run(async (ctx) => {
    await ctx.db.insert("userRoles", {
      clerkUserId: identity.subject,
      role: "deep_researcher",
      grantedAt: Date.now(),
      grantedByClerkUserId: "system:test",
      active: true,
    });
  });
}

/** Approved + active with deep_researcher but NO knowledge_reader. */
async function seedDeepResearcherOnly(
  t: P5Test,
  identity: { subject: string; email: string },
): Promise<void> {
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("approvedUsers", {
      clerkUserId: identity.subject,
      primaryEmail: identity.email,
      status: "active",
      firstSeenAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("userRoles", {
      clerkUserId: identity.subject,
      role: "deep_researcher",
      grantedAt: now,
      grantedByClerkUserId: "system:test",
      active: true,
    });
  });
}

const VALID_ID = "nexus-research_abcd1234";
const VALID_IDEM = "nexus-research-run_abcd1234";

describe("deep_researcher role — canonical definition", () => {
  it("is part of the role set", () => {
    expect(NEXUS_ROLES).toContain("deep_researcher");
  });

  it("grants no standalone permissions (capability flag only)", () => {
    expect(permissionsForRoles(["deep_researcher"])).toEqual([]);
  });
});

describe("hasDeepResearchAccess predicate", () => {
  const cases: Array<{ roles: NexusRole[]; expected: boolean; label: string }> = [
    { roles: ["nexus_admin"], expected: true, label: "admin only" },
    { roles: ["knowledge_reader", "nexus_admin"], expected: true, label: "admin + reader" },
    { roles: ["knowledge_reader", "deep_researcher"], expected: true, label: "reader + deep_researcher" },
    { roles: ["knowledge_reader"], expected: false, label: "reader only" },
    { roles: ["deep_researcher"], expected: false, label: "deep_researcher only" },
    { roles: [], expected: false, label: "no roles" },
  ];
  for (const { roles, expected, label } of cases) {
    it(`${label} -> ${expected}`, () => {
      expect(hasDeepResearchAccess(roles)).toBe(expected);
    });
  }
});

describe("deep_researcher role — backend Deep Research authorization", () => {
  it("denies a knowledge_reader without deep_researcher", async () => {
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

  it("allows a knowledge_reader + deep_researcher", async () => {
    const t = p5Test();
    await seedReaderPlusDeepResearcher(t, IDENTITY_A);
    const asUser = t.withIdentity(IDENTITY_A);
    const submit = await asUser.mutation(api.deepResearch.submitDeepResearch, {
      requestText: "Deep researcher runs research",
      researchRequestId: VALID_ID,
      idempotencyKey: VALID_IDEM,
    });
    expect(submit.taskId).toBeTruthy();
    const listed = await asUser.query(api.deepResearch.listMyDeepResearchTasks, { limit: 5 });
    expect(listed.tasks.some((row) => row.id === submit.taskId)).toBe(true);
  });

  it("denies a deep_researcher without knowledge_reader", async () => {
    const t = p5Test();
    await seedDeepResearcherOnly(t, IDENTITY_A);
    await rejectsWithCode(
      t.withIdentity(IDENTITY_A).query(api.deepResearch.listMyDeepResearchTasks, {}),
      "role_required",
    );
  });

  it("allows an active nexus_admin without a separate deep_researcher role", async () => {
    const t = p5Test();
    await seedAdmin(t, IDENTITY_ADMIN);
    const listed = await t
      .withIdentity(IDENTITY_ADMIN)
      .query(api.deepResearch.listMyDeepResearchTasks, { limit: 5 });
    expect(Array.isArray(listed.tasks)).toBe(true);
  });

  it("denies once deep_researcher is revoked (inactive)", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await t.run(async (ctx) => {
      await ctx.db.insert("userRoles", {
        clerkUserId: IDENTITY_A.subject,
        role: "deep_researcher",
        grantedAt: Date.now(),
        grantedByClerkUserId: "system:test",
        active: false,
      });
    });
    await rejectsWithCode(
      t.withIdentity(IDENTITY_A).query(api.deepResearch.listMyDeepResearchTasks, {}),
      "role_required",
    );
  });
});

describe("deep_researcher role — admin grant/revoke via existing controls", () => {
  it("an admin can grant then revoke deep_researcher, toggling Deep Research access", async () => {
    const t = p5Test();
    await seedAdmin(t, IDENTITY_ADMIN);
    await seedApprovedReader(t, IDENTITY_A);
    const asAdmin = t.withIdentity(IDENTITY_ADMIN);
    const asUser = t.withIdentity(IDENTITY_A);

    // Before: reader-only is denied.
    await rejectsWithCode(
      asUser.query(api.deepResearch.listMyDeepResearchTasks, {}),
      "role_required",
    );

    // Grant via the existing admin control.
    await asAdmin.mutation(api.admin.adminGrantRole, {
      targetClerkUserId: IDENTITY_A.subject,
      role: "deep_researcher",
    });
    const granted = await asUser.query(api.deepResearch.listMyDeepResearchTasks, {});
    expect(Array.isArray(granted.tasks)).toBe(true);

    // Revoke; access is removed reactively (no stale role).
    await asAdmin.mutation(api.admin.adminRevokeRole, {
      targetClerkUserId: IDENTITY_A.subject,
      role: "deep_researcher",
    });
    await rejectsWithCode(
      asUser.query(api.deepResearch.listMyDeepResearchTasks, {}),
      "role_required",
    );
  });

  it("surfaces deep_researcher in the admin user listing roles", async () => {
    const t = p5Test();
    await seedAdmin(t, IDENTITY_ADMIN);
    await seedReaderPlusDeepResearcher(t, IDENTITY_A);
    const active = await t
      .withIdentity(IDENTITY_ADMIN)
      .query(api.admin.listUsersByStatus, { status: "active" });
    const target = active.find((u) => u.clerkUserId === IDENTITY_A.subject);
    expect(target?.roles).toContain("deep_researcher");
    expect(target?.roles).toContain("knowledge_reader");
  });
});
