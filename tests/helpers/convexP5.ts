/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import schema from "@/convex/schema";

/**
 * All Convex function modules, for convex-test. The `!(*.*.*)` extglob keeps
 * single-dot files (function modules + `_generated/*.js`, which convex-test
 * needs to locate the modules root) while excluding multi-dot files such as
 * `*.d.ts` and `auth.config.ts`.
 */
const modules = import.meta.glob("../../convex/**/!(*.*.*)*.*s");

export function p5Test() {
  return convexTest(schema, modules);
}

export type P5Test = ReturnType<typeof p5Test>;

export const IDENTITY_A = { subject: "user_A", email: "a@example.com", name: "User A" } as const;
export const IDENTITY_B = { subject: "user_B", email: "b@example.com", name: "User B" } as const;
export const IDENTITY_ADMIN = {
  subject: "user_admin",
  email: "admin@example.com",
  name: "Admin",
} as const;

/** Seed an approved, active user holding the knowledge_reader role. */
export async function seedApprovedReader(
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
      role: "knowledge_reader",
      grantedAt: now,
      grantedByClerkUserId: "system:test",
      active: true,
    });
  });
}

/** Seed an approved, active user holding only the nexus_admin role. */
export async function seedAdmin(
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
      role: "nexus_admin",
      grantedAt: now,
      grantedByClerkUserId: "system:test",
      active: true,
    });
  });
}

/** A short, valid idempotency key built from a stable test seed. */
export function key(seed: string): string {
  return `idem-${seed}-0000`;
}
