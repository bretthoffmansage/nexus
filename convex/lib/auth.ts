import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { NEXUS_ERROR_CODES, nexusError } from "./errors";
import type { NexusRole } from "./permissions";

export type AuthenticatedIdentity = {
  clerkUserId: string;
  email?: string;
  name?: string;
};

export async function requireAuthenticatedIdentity(
  ctx: QueryCtx | MutationCtx,
): Promise<AuthenticatedIdentity> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    nexusError(NEXUS_ERROR_CODES.UNAUTHENTICATED, "Authentication required");
  }
  return {
    clerkUserId: identity.subject,
    email: identity.email?.toLowerCase(),
    name: identity.name ?? undefined,
  };
}

export async function getApprovedUser(
  ctx: QueryCtx | MutationCtx,
  clerkUserId: string,
): Promise<Doc<"approvedUsers"> | null> {
  return await ctx.db
    .query("approvedUsers")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
    .unique();
}

export async function requireApprovedUser(
  ctx: QueryCtx | MutationCtx,
  clerkUserId: string,
): Promise<Doc<"approvedUsers">> {
  const user = await getApprovedUser(ctx, clerkUserId);
  if (!user) {
    nexusError(NEXUS_ERROR_CODES.APPROVAL_REQUIRED, "User approval required");
  }
  if (user.status === "pending") {
    nexusError(NEXUS_ERROR_CODES.APPROVAL_REQUIRED, "User approval required");
  }
  if (user.status === "suspended") {
    nexusError(NEXUS_ERROR_CODES.USER_SUSPENDED, "User access suspended");
  }
  return user;
}

export async function getActiveRolesForUser(
  ctx: QueryCtx | MutationCtx,
  clerkUserId: string,
): Promise<NexusRole[]> {
  const rows = await ctx.db
    .query("userRoles")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
    .collect();
  return rows.filter((row) => row.active).map((row) => row.role);
}

export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  clerkUserId: string,
  role: NexusRole,
): Promise<void> {
  await requireApprovedUser(ctx, clerkUserId);
  const roles = await getActiveRolesForUser(ctx, clerkUserId);
  if (!roles.includes(role)) {
    nexusError(NEXUS_ERROR_CODES.ROLE_REQUIRED, "Required role not assigned");
  }
}

export async function requireAnyRole(
  ctx: QueryCtx | MutationCtx,
  clerkUserId: string,
  roles: NexusRole[],
): Promise<NexusRole[]> {
  await requireApprovedUser(ctx, clerkUserId);
  const active = await getActiveRolesForUser(ctx, clerkUserId);
  const matched = active.filter((role) => roles.includes(role));
  if (!matched.length) {
    nexusError(NEXUS_ERROR_CODES.ROLE_REQUIRED, "Required role not assigned");
  }
  return matched;
}

export async function countActiveAdmins(ctx: QueryCtx | MutationCtx): Promise<number> {
  const admins = await ctx.db
    .query("userRoles")
    .withIndex("by_role_and_active", (q) =>
      q.eq("role", "nexus_admin").eq("active", true),
    )
    .collect();
  return admins.length;
}
