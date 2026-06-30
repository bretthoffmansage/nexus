import { mutation, query } from "./_generated/server";
import { BOOTSTRAP_ROLES, shouldBootstrapAdmin } from "./lib/bootstrap";
import {
  getActiveRolesForUser,
  getApprovedUser,
  requireAuthenticatedIdentity,
} from "./lib/auth";
import { recordIdentityAuditEvent } from "./identityAudit";
import { permissionsForRoles } from "./lib/permissions";

export const ensurePendingUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireAuthenticatedIdentity(ctx);
    const now = Date.now();
    const existing = await getApprovedUser(ctx, identity.clerkUserId);

    if (existing) {
      await recordIdentityAuditEvent(ctx, {
        eventType: "user_seen",
        actorType: "user",
        actorId: identity.clerkUserId,
        targetClerkUserId: identity.clerkUserId,
      });
      return { status: existing.status };
    }

    const primaryEmail = identity.email ?? `${identity.clerkUserId}@unknown.local`;
    const bootstrap = await shouldBootstrapAdmin(ctx, primaryEmail);

    const userId = await ctx.db.insert("approvedUsers", {
      clerkUserId: identity.clerkUserId,
      primaryEmail,
      displayName: identity.name,
      status: bootstrap ? "active" : "pending",
      firstSeenAt: now,
      invitedAt: now,
      approvedAt: bootstrap ? now : undefined,
      approvedByClerkUserId: bootstrap ? "system:bootstrap" : undefined,
      createdAt: now,
      updatedAt: now,
    });

    await recordIdentityAuditEvent(ctx, {
      eventType: "user_seen",
      actorType: "user",
      actorId: identity.clerkUserId,
      targetClerkUserId: identity.clerkUserId,
    });

    if (bootstrap) {
      for (const role of BOOTSTRAP_ROLES) {
        await ctx.db.insert("userRoles", {
          clerkUserId: identity.clerkUserId,
          role,
          grantedAt: now,
          grantedByClerkUserId: "system:bootstrap",
          active: true,
        });
        await recordIdentityAuditEvent(ctx, {
          eventType: "role_granted",
          actorType: "system",
          actorId: "system:bootstrap",
          targetClerkUserId: identity.clerkUserId,
          metadata: { role, reason: "bootstrap_admin" },
        });
      }
      await recordIdentityAuditEvent(ctx, {
        eventType: "user_approved",
        actorType: "system",
        actorId: "system:bootstrap",
        targetClerkUserId: identity.clerkUserId,
        metadata: { approvedUserId: userId },
      });
      return { status: "active" as const };
    }

    return { status: "pending" as const };
  },
});

export const currentUserProfile = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireAuthenticatedIdentity(ctx);
    const user = await getApprovedUser(ctx, identity.clerkUserId);
    if (!user) return null;
    return {
      clerkUserId: user.clerkUserId,
      primaryEmail: user.primaryEmail,
      displayName: user.displayName,
      status: user.status,
    };
  },
});

export const currentUserRoles = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireAuthenticatedIdentity(ctx);
    const roles = await getActiveRolesForUser(ctx, identity.clerkUserId);
    return {
      roles,
      permissions: permissionsForRoles(roles),
    };
  },
});

export const currentUserAccess = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { state: "unauthenticated" as const };
    }

    const user = await getApprovedUser(ctx, identity.subject);
    if (!user) {
      return {
        state: "pending" as const,
        clerkUserId: identity.subject,
      };
    }

    if (user.status === "pending") {
      return {
        state: "pending" as const,
        clerkUserId: user.clerkUserId,
        primaryEmail: user.primaryEmail,
      };
    }

    if (user.status === "suspended") {
      return {
        state: "suspended" as const,
        clerkUserId: user.clerkUserId,
      };
    }

    const roles = await getActiveRolesForUser(ctx, user.clerkUserId);
    if (!roles.length) {
      return {
        state: "approved_without_role" as const,
        clerkUserId: user.clerkUserId,
        primaryEmail: user.primaryEmail,
      };
    }

    return {
      state: "approved" as const,
      clerkUserId: user.clerkUserId,
      primaryEmail: user.primaryEmail,
      displayName: user.displayName,
      roles,
      permissions: permissionsForRoles(roles),
    };
  },
});
