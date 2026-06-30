import type { MutationCtx } from "./_generated/server";
import type { NexusRole } from "./lib/permissions";
import { NEXUS_ERROR_CODES, nexusError } from "./lib/errors";
import { recordIdentityAuditEvent } from "./identityAudit";
import { countActiveAdmins } from "./lib/auth";

export async function grantRoleInternal(
  ctx: MutationCtx,
  args: {
    targetClerkUserId: string;
    role: NexusRole;
    actorClerkUserId: string;
    actorType: "user" | "system" | "clerk_webhook";
  },
) {
  const existing = await ctx.db
    .query("userRoles")
    .withIndex("by_clerk_user_id_and_role", (q) =>
      q.eq("clerkUserId", args.targetClerkUserId).eq("role", args.role),
    )
    .unique();

  if (existing?.active) {
    nexusError(NEXUS_ERROR_CODES.ROLE_ALREADY_GRANTED, "Role already active");
  }

  const now = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, {
      active: true,
      grantedAt: now,
      grantedByClerkUserId: args.actorClerkUserId,
      revokedAt: undefined,
      revokedByClerkUserId: undefined,
    });
  } else {
    await ctx.db.insert("userRoles", {
      clerkUserId: args.targetClerkUserId,
      role: args.role,
      grantedAt: now,
      grantedByClerkUserId: args.actorClerkUserId,
      active: true,
    });
  }

  await recordIdentityAuditEvent(ctx, {
    eventType: "role_granted",
    actorType: args.actorType,
    actorId: args.actorClerkUserId,
    targetClerkUserId: args.targetClerkUserId,
    metadata: { role: args.role },
  });
}

export async function revokeRoleInternal(
  ctx: MutationCtx,
  args: {
    targetClerkUserId: string;
    role: NexusRole;
    actorClerkUserId: string;
    actorType: "user" | "system" | "clerk_webhook";
  },
) {
  if (args.role === "nexus_admin") {
    const activeAdmins = await countActiveAdmins(ctx);
    const targetRoles = await ctx.db
      .query("userRoles")
      .withIndex("by_clerk_user_id_and_role", (q) =>
        q.eq("clerkUserId", args.targetClerkUserId).eq("role", "nexus_admin"),
      )
      .unique();
    if (activeAdmins <= 1 && targetRoles?.active) {
      nexusError(NEXUS_ERROR_CODES.LAST_ADMIN, "Cannot revoke the last active administrator");
    }
  }

  const row = await ctx.db
    .query("userRoles")
    .withIndex("by_clerk_user_id_and_role", (q) =>
      q.eq("clerkUserId", args.targetClerkUserId).eq("role", args.role),
    )
    .unique();

  if (!row?.active) {
    nexusError(NEXUS_ERROR_CODES.ROLE_NOT_ACTIVE, "Role is not active");
  }

  const now = Date.now();
  await ctx.db.patch(row._id, {
    active: false,
    revokedAt: now,
    revokedByClerkUserId: args.actorClerkUserId,
  });

  await recordIdentityAuditEvent(ctx, {
    eventType: "role_revoked",
    actorType: args.actorType,
    actorId: args.actorClerkUserId,
    targetClerkUserId: args.targetClerkUserId,
    metadata: { role: args.role },
  });
}
