import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { mutation } from "./_generated/server";
import { deactivateAllRoles } from "./admin";
import { BOOTSTRAP_ROLES, shouldBootstrapAdmin } from "./lib/bootstrap";
import { getApprovedUser } from "./lib/auth";
import { normalizeEmail } from "./lib/identity";
import { recordIdentityAuditEvent } from "./identityAudit";
import { grantRoleInternal } from "./roles";
import { NEXUS_ERROR_CODES, nexusError } from "./lib/errors";

function requireInternalSecret(secret: string) {
  const expected = process.env.NEXUS_INTERNAL_API_SECRET;
  if (!expected || secret !== expected) {
    nexusError(NEXUS_ERROR_CODES.FORBIDDEN, "Invalid internal API secret");
  }
}

async function upsertPendingFromWebhook(
  ctx: MutationCtx,
  args: {
    clerkUserId: string;
    primaryEmail: string;
    displayName?: string;
    dedupeKey: string;
  },
) {
  const existingDedupe = await ctx.db
    .query("identityAuditEvents")
    .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", args.dedupeKey))
    .unique();
  if (existingDedupe) {
    return { duplicate: true as const };
  }

  const now = Date.now();
  const user = await getApprovedUser(ctx, args.clerkUserId);
  const bootstrap = await shouldBootstrapAdmin(ctx, args.primaryEmail);

  if (!user) {
    const userId = await ctx.db.insert("approvedUsers", {
      clerkUserId: args.clerkUserId,
      primaryEmail: args.primaryEmail,
      displayName: args.displayName,
      status: bootstrap ? "active" : "pending",
      firstSeenAt: now,
      invitedAt: now,
      approvedAt: bootstrap ? now : undefined,
      approvedByClerkUserId: bootstrap ? "system:bootstrap" : undefined,
      createdAt: now,
      updatedAt: now,
    });

    if (bootstrap) {
      for (const role of BOOTSTRAP_ROLES) {
        await grantRoleInternal(ctx, {
          targetClerkUserId: args.clerkUserId,
          role,
          actorClerkUserId: "system:bootstrap",
          actorType: "system",
        });
      }
      await recordIdentityAuditEvent(ctx, {
        eventType: "user_approved",
        actorType: "system",
        actorId: "system:bootstrap",
        targetClerkUserId: args.clerkUserId,
        metadata: { approvedUserId: userId },
        dedupeKey: args.dedupeKey,
      });
      return { duplicate: false as const, status: "active" as const };
    }

    await recordIdentityAuditEvent(ctx, {
      eventType: "user_seen",
      actorType: "clerk_webhook",
      actorId: "clerk_webhook",
      targetClerkUserId: args.clerkUserId,
      dedupeKey: args.dedupeKey,
    });
    return { duplicate: false as const, status: "pending" as const };
  }

  await recordIdentityAuditEvent(ctx, {
    eventType: "user_seen",
    actorType: "clerk_webhook",
    actorId: "clerk_webhook",
    targetClerkUserId: args.clerkUserId,
    dedupeKey: args.dedupeKey,
  });
  return { duplicate: false as const, status: user.status };
}

export const processClerkWebhook = mutation({
  args: {
    internalSecret: v.string(),
    eventId: v.string(),
    eventType: v.string(),
    clerkUserId: v.string(),
    primaryEmail: v.optional(v.string()),
    displayName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.internalSecret);
    const dedupeKey = `clerk:${args.eventId}`;

    if (args.eventType === "user.created") {
      if (!args.primaryEmail?.trim()) {
        return { duplicate: false as const, skipped: true as const, reason: "missing_email" as const };
      }
      const email = normalizeEmail(args.primaryEmail);
      return await upsertPendingFromWebhook(ctx, {
        clerkUserId: args.clerkUserId,
        primaryEmail: email,
        displayName: args.displayName,
        dedupeKey,
      });
    }

    const existingDedupe = await ctx.db
      .query("identityAuditEvents")
      .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", dedupeKey))
      .unique();
    if (existingDedupe) {
      return { duplicate: true as const };
    }

    const user = await getApprovedUser(ctx, args.clerkUserId);
    if (!user) {
      if (args.eventType === "user.deleted") {
        await recordIdentityAuditEvent(ctx, {
          eventType: "clerk_user_deleted",
          actorType: "clerk_webhook",
          actorId: "clerk_webhook",
          targetClerkUserId: args.clerkUserId,
          dedupeKey,
        });
        return { duplicate: false as const };
      }
      return { duplicate: false as const, missing: true as const };
    }

    if (args.eventType === "user.updated") {
      const now = Date.now();
      const patch: {
        primaryEmail?: string;
        displayName?: string;
        updatedAt: number;
      } = { updatedAt: now };
      if (args.primaryEmail?.trim()) {
        patch.primaryEmail = normalizeEmail(args.primaryEmail);
      }
      if (args.displayName !== undefined) {
        patch.displayName = args.displayName;
      }
      await ctx.db.patch(user._id, patch);
      await recordIdentityAuditEvent(ctx, {
        eventType: "clerk_user_updated",
        actorType: "clerk_webhook",
        actorId: "clerk_webhook",
        targetClerkUserId: args.clerkUserId,
        dedupeKey,
      });
      return { duplicate: false as const };
    }

    if (args.eventType === "user.deleted") {
      const now = Date.now();
      await ctx.db.patch(user._id, {
        status: "suspended",
        suspendedAt: now,
        suspendedByClerkUserId: "clerk_webhook",
        suspensionReason: "Clerk user deleted",
        updatedAt: now,
      });
      await deactivateAllRoles(ctx, args.clerkUserId, "clerk_webhook", "clerk_webhook");
      await recordIdentityAuditEvent(ctx, {
        eventType: "clerk_user_deleted",
        actorType: "clerk_webhook",
        actorId: "clerk_webhook",
        targetClerkUserId: args.clerkUserId,
        dedupeKey,
      });
      return { duplicate: false as const };
    }

    return { duplicate: false as const, unsupported: true as const };
  },
});
