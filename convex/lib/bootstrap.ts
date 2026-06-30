import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { NexusRole } from "./permissions";

export function parseBootstrapAdminEmails(): string[] {
  const raw = process.env.NEXUS_BOOTSTRAP_ADMIN_EMAILS;
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export async function hasActiveAdmin(ctx: QueryCtx | MutationCtx): Promise<boolean> {
  const admins = await ctx.db
    .query("userRoles")
    .withIndex("by_role_and_active", (q) =>
      q.eq("role", "nexus_admin").eq("active", true),
    )
    .take(1);
  return admins.length > 0;
}

export async function shouldBootstrapAdmin(
  ctx: QueryCtx | MutationCtx,
  primaryEmail: string,
): Promise<boolean> {
  if (await hasActiveAdmin(ctx)) return false;
  const allowlist = parseBootstrapAdminEmails();
  if (!allowlist.length) return false;
  return allowlist.includes(primaryEmail.trim().toLowerCase());
}

export const BOOTSTRAP_ROLES: NexusRole[] = ["nexus_admin", "knowledge_reader"];
