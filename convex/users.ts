import { mutation, query } from "./_generated/server";
import { shouldBootstrapAdmin } from "./lib/bootstrap";
import {
  getActiveRolesForUser,
  getApprovedUser,
} from "./lib/auth";
import {
  getClerkUserId,
  getVerifiedPrimaryEmail,
  isPlaceholderEmail,
  normalizeEmail,
} from "./lib/identity";
import {
  activateBootstrapAdmin,
  repairAndMaybeBootstrap,
} from "./lib/userProvisioning";
import { recordIdentityAuditEvent } from "./identityAudit";
import { permissionsForRoles } from "./lib/permissions";

type EnsureStatus =
  | "pending"
  | "active"
  | "suspended"
  | "identity_claims_incomplete";

export const ensurePendingUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { status: "identity_claims_incomplete" as const };
    }

    const clerkUserId = getClerkUserId(identity);
    const verifiedEmail = getVerifiedPrimaryEmail(identity);
    const now = Date.now();
    const existing = await getApprovedUser(ctx, clerkUserId);

    if (existing) {
      await recordIdentityAuditEvent(ctx, {
        eventType: "user_seen",
        actorType: "user",
        actorId: clerkUserId,
        targetClerkUserId: clerkUserId,
      });

      if (verifiedEmail) {
        if (
          isPlaceholderEmail(existing.primaryEmail) ||
          (existing.status === "pending" &&
            normalizeEmail(existing.primaryEmail) !== normalizeEmail(verifiedEmail))
        ) {
          const result = await repairAndMaybeBootstrap(
            ctx,
            existing,
            verifiedEmail,
            clerkUserId,
          );
          if (result === "active" || result === "approved_without_role") {
            return { status: "active" as const };
          }
          if (result === "suspended") {
            return { status: "suspended" as const };
          }
          return { status: "pending" as const };
        }

        if (existing.status === "pending") {
          const bootstrap = await shouldBootstrapAdmin(ctx, verifiedEmail);
          if (bootstrap) {
            await activateBootstrapAdmin(ctx, existing, clerkUserId);
            return { status: "active" as const };
          }
        }
      } else if (isPlaceholderEmail(existing.primaryEmail)) {
        return { status: "identity_claims_incomplete" as const };
      }

      return { status: existing.status as EnsureStatus };
    }

    if (!verifiedEmail) {
      return { status: "identity_claims_incomplete" as const };
    }

    const primaryEmail = normalizeEmail(verifiedEmail);
    const bootstrap = await shouldBootstrapAdmin(ctx, primaryEmail);

    await ctx.db.insert("approvedUsers", {
      clerkUserId,
      primaryEmail,
      displayName: identity.name ?? undefined,
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
      actorId: clerkUserId,
      targetClerkUserId: clerkUserId,
    });

    if (bootstrap) {
      const user = await getApprovedUser(ctx, clerkUserId);
      if (user) {
        await activateBootstrapAdmin(ctx, user, clerkUserId);
      }
      return { status: "active" as const };
    }

    return { status: "pending" as const };
  },
});

export const currentUserProfile = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const clerkUserId = getClerkUserId(identity);
    const user = await getApprovedUser(ctx, clerkUserId);
    if (!user) return null;

    const verifiedEmail = getVerifiedPrimaryEmail(identity);
    if (!verifiedEmail && isPlaceholderEmail(user.primaryEmail)) {
      return null;
    }

    return {
      clerkUserId: user.clerkUserId,
      primaryEmail: isPlaceholderEmail(user.primaryEmail) ? undefined : user.primaryEmail,
      displayName: user.displayName,
      status: user.status,
    };
  },
});

export const currentUserRoles = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const clerkUserId = getClerkUserId(identity);
    const roles = await getActiveRolesForUser(ctx, clerkUserId);
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

    const clerkUserId = getClerkUserId(identity);
    const verifiedEmail = getVerifiedPrimaryEmail(identity);
    const user = await getApprovedUser(ctx, clerkUserId);

    if (!user) {
      if (!verifiedEmail) {
        return {
          state: "identity_claims_incomplete" as const,
          clerkUserId,
        };
      }
      return {
        state: "pending" as const,
        clerkUserId,
      };
    }

    if (!verifiedEmail && isPlaceholderEmail(user.primaryEmail)) {
      return {
        state: "identity_claims_incomplete" as const,
        clerkUserId,
      };
    }

    if (user.status === "pending") {
      return {
        state: "pending" as const,
        clerkUserId: user.clerkUserId,
        primaryEmail: isPlaceholderEmail(user.primaryEmail)
          ? undefined
          : user.primaryEmail,
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
        primaryEmail: isPlaceholderEmail(user.primaryEmail)
          ? undefined
          : user.primaryEmail,
      };
    }

    return {
      state: "approved" as const,
      clerkUserId: user.clerkUserId,
      primaryEmail: isPlaceholderEmail(user.primaryEmail)
        ? undefined
        : user.primaryEmail,
      displayName: user.displayName,
      roles,
      permissions: permissionsForRoles(roles),
    };
  },
});
