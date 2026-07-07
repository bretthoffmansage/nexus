import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import {
  countActiveAdmins,
  getApprovedUser,
  getActiveRolesForUser,
  requireAuthenticatedIdentity,
  requireRole,
} from "./lib/auth";
import { recordIdentityAuditEvent } from "./identityAudit";
import { NEXUS_ERROR_CODES, nexusError } from "./lib/errors";
import { grantRoleInternal, revokeRoleInternal } from "./roles";

const roleValidator = v.union(
  v.literal("knowledge_reader"),
  v.literal("nexus_admin"),
  v.literal("deep_researcher"),
);

export const listUsersByStatus = query({
  args: {
    status: v.union(v.literal("pending"), v.literal("active"), v.literal("suspended")),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedIdentity(ctx);
    await requireRole(ctx, actor.clerkUserId, "nexus_admin");

    const users = await ctx.db
      .query("approvedUsers")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .collect();

    const enriched = await Promise.all(
      users.map(async (user) => ({
        ...user,
        roles: await getActiveRolesForUser(ctx, user.clerkUserId),
      })),
    );

    return enriched;
  },
});

export const approveUser = mutation({
  args: {
    targetClerkUserId: v.string(),
    grantKnowledgeReader: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedIdentity(ctx);
    await requireRole(ctx, actor.clerkUserId, "nexus_admin");

    const user = await getApprovedUser(ctx, args.targetClerkUserId);
    if (!user) {
      nexusError(NEXUS_ERROR_CODES.USER_NOT_FOUND, "User not found");
    }

    const now = Date.now();
    await ctx.db.patch(user._id, {
      status: "active",
      approvedAt: now,
      approvedByClerkUserId: actor.clerkUserId,
      updatedAt: now,
    });

    await recordIdentityAuditEvent(ctx, {
      eventType: "user_approved",
      actorType: "user",
      actorId: actor.clerkUserId,
      targetClerkUserId: args.targetClerkUserId,
    });

    if (args.grantKnowledgeReader !== false) {
      await grantRoleInternal(ctx, {
        targetClerkUserId: args.targetClerkUserId,
        role: "knowledge_reader",
        actorClerkUserId: actor.clerkUserId,
        actorType: "user",
      });
    }
  },
});

export const suspendUser = mutation({
  args: {
    targetClerkUserId: v.string(),
    reason: v.optional(v.string()),
    confirmSelf: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedIdentity(ctx);
    await requireRole(ctx, actor.clerkUserId, "nexus_admin");

    if (args.targetClerkUserId === actor.clerkUserId && !args.confirmSelf) {
      nexusError(
        NEXUS_ERROR_CODES.FORBIDDEN,
        "Explicit confirmation required to suspend your own account",
      );
    }

    const user = await getApprovedUser(ctx, args.targetClerkUserId);
    if (!user) {
      nexusError(NEXUS_ERROR_CODES.USER_NOT_FOUND, "User not found");
    }

    if (args.targetClerkUserId === actor.clerkUserId) {
      const adminCount = await countActiveAdmins(ctx);
      if (adminCount <= 1) {
        nexusError(NEXUS_ERROR_CODES.LAST_ADMIN, "Cannot suspend the last active administrator");
      }
    } else {
      const targetIsAdmin = (
        await getActiveRolesForUser(ctx, args.targetClerkUserId)
      ).includes("nexus_admin");
      if (targetIsAdmin) {
        const adminCount = await countActiveAdmins(ctx);
        if (adminCount <= 1) {
          nexusError(NEXUS_ERROR_CODES.LAST_ADMIN, "Cannot suspend the last active administrator");
        }
      }
    }

    const now = Date.now();
    await ctx.db.patch(user._id, {
      status: "suspended",
      suspendedAt: now,
      suspendedByClerkUserId: actor.clerkUserId,
      suspensionReason: args.reason,
      updatedAt: now,
    });

    await recordIdentityAuditEvent(ctx, {
      eventType: "user_suspended",
      actorType: "user",
      actorId: actor.clerkUserId,
      targetClerkUserId: args.targetClerkUserId,
      metadata: args.reason ? { reason: args.reason } : undefined,
    });
  },
});

export const reactivateUser = mutation({
  args: {
    targetClerkUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedIdentity(ctx);
    await requireRole(ctx, actor.clerkUserId, "nexus_admin");

    const user = await getApprovedUser(ctx, args.targetClerkUserId);
    if (!user) {
      nexusError(NEXUS_ERROR_CODES.USER_NOT_FOUND, "User not found");
    }

    const now = Date.now();
    await ctx.db.patch(user._id, {
      status: "active",
      suspendedAt: undefined,
      suspendedByClerkUserId: undefined,
      suspensionReason: undefined,
      updatedAt: now,
    });

    await recordIdentityAuditEvent(ctx, {
      eventType: "user_reactivated",
      actorType: "user",
      actorId: actor.clerkUserId,
      targetClerkUserId: args.targetClerkUserId,
    });
  },
});

export const adminGrantRole = mutation({
  args: {
    targetClerkUserId: v.string(),
    role: roleValidator,
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedIdentity(ctx);
    await requireRole(ctx, actor.clerkUserId, "nexus_admin");
    await grantRoleInternal(ctx, {
      targetClerkUserId: args.targetClerkUserId,
      role: args.role,
      actorClerkUserId: actor.clerkUserId,
      actorType: "user",
    });
  },
});

export const adminRevokeRole = mutation({
  args: {
    targetClerkUserId: v.string(),
    role: roleValidator,
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedIdentity(ctx);
    await requireRole(ctx, actor.clerkUserId, "nexus_admin");
    await revokeRoleInternal(ctx, {
      targetClerkUserId: args.targetClerkUserId,
      role: args.role,
      actorClerkUserId: actor.clerkUserId,
      actorType: "user",
    });
  },
});

export async function deactivateAllRoles(
  ctx: MutationCtx,
  targetClerkUserId: string,
  actorId: string,
  actorType: "user" | "system" | "clerk_webhook",
) {
  const rows = await ctx.db
    .query("userRoles")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", targetClerkUserId))
    .collect();

  const now = Date.now();
  for (const row of rows) {
    if (!row.active) continue;
    await ctx.db.patch(row._id, {
      active: false,
      revokedAt: now,
      revokedByClerkUserId: actorId,
    });
    await recordIdentityAuditEvent(ctx, {
      eventType: "role_revoked",
      actorType,
      actorId,
      targetClerkUserId,
      metadata: { role: row.role, reason: "deactivate_all" },
    });
  }
}
