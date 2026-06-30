import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { BOOTSTRAP_ROLES, shouldBootstrapAdmin } from "./bootstrap";
import { getApprovedUser } from "./auth";
import { isPlaceholderEmail, normalizeEmail } from "./identity";
import { recordIdentityAuditEvent } from "../identityAudit";

export async function grantBootstrapRoles(
  ctx: MutationCtx,
  clerkUserId: string,
): Promise<void> {
  const now = Date.now();
  for (const role of BOOTSTRAP_ROLES) {
    const existingRole = await ctx.db
      .query("userRoles")
      .withIndex("by_clerk_user_id_and_role", (q) =>
        q.eq("clerkUserId", clerkUserId).eq("role", role),
      )
      .unique();

    if (existingRole?.active) continue;

    if (existingRole) {
      await ctx.db.patch(existingRole._id, {
        active: true,
        grantedAt: now,
        grantedByClerkUserId: "system:bootstrap",
        revokedAt: undefined,
        revokedByClerkUserId: undefined,
      });
    } else {
      await ctx.db.insert("userRoles", {
        clerkUserId,
        role,
        grantedAt: now,
        grantedByClerkUserId: "system:bootstrap",
        active: true,
      });
    }

    await recordIdentityAuditEvent(ctx, {
      eventType: "role_granted",
      actorType: "system",
      actorId: "system:bootstrap",
      targetClerkUserId: clerkUserId,
      metadata: { role, reason: "bootstrap_admin" },
    });
  }
}

export async function activateBootstrapAdmin(
  ctx: MutationCtx,
  user: Doc<"approvedUsers">,
  clerkUserId: string,
): Promise<"active"> {
  const now = Date.now();
  const alreadyActive = user.status === "active";

  if (!alreadyActive) {
    await ctx.db.patch(user._id, {
      status: "active",
      approvedAt: now,
      approvedByClerkUserId: "system:bootstrap",
      updatedAt: now,
    });
    await recordIdentityAuditEvent(ctx, {
      eventType: "user_approved",
      actorType: "system",
      actorId: "system:bootstrap",
      targetClerkUserId: clerkUserId,
      metadata: { approvedUserId: user._id },
    });
  }

  await grantBootstrapRoles(ctx, clerkUserId);
  return "active";
}

export async function repairPlaceholderEmail(
  ctx: MutationCtx,
  user: Doc<"approvedUsers">,
  verifiedEmail: string,
  clerkUserId: string,
): Promise<Doc<"approvedUsers">> {
  const normalized = normalizeEmail(verifiedEmail);
  if (!isPlaceholderEmail(user.primaryEmail) && user.primaryEmail === normalized) {
    return user;
  }

  if (!isPlaceholderEmail(user.primaryEmail) && user.primaryEmail !== normalized) {
    await ctx.db.patch(user._id, {
      primaryEmail: normalized,
      updatedAt: Date.now(),
    });
    await recordIdentityAuditEvent(ctx, {
      eventType: "clerk_user_updated",
      actorType: "system",
      actorId: "system:identity_repair",
      targetClerkUserId: clerkUserId,
      metadata: { reason: "email_updated" },
    });
    const updated = await getApprovedUser(ctx, clerkUserId);
    return updated ?? user;
  }

  await ctx.db.patch(user._id, {
    primaryEmail: normalized,
    updatedAt: Date.now(),
  });
  await recordIdentityAuditEvent(ctx, {
    eventType: "identity_email_repaired",
    actorType: "system",
    actorId: "system:identity_repair",
    targetClerkUserId: clerkUserId,
    metadata: { previousPlaceholder: true },
  });

  const updated = await getApprovedUser(ctx, clerkUserId);
  return updated ?? user;
}

export async function repairAndMaybeBootstrap(
  ctx: MutationCtx,
  user: Doc<"approvedUsers">,
  verifiedEmail: string,
  clerkUserId: string,
): Promise<"active" | "pending" | "suspended" | "approved_without_role"> {
  const repaired = await repairPlaceholderEmail(ctx, user, verifiedEmail, clerkUserId);

  if (repaired.status === "suspended") {
    return "suspended";
  }

  if (repaired.status === "active") {
    const roles = await ctx.db
      .query("userRoles")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
      .collect();
    const activeRoles = roles.filter((row) => row.active);
    return activeRoles.length ? "active" : "approved_without_role";
  }

  const normalized = normalizeEmail(verifiedEmail);
  if (await shouldBootstrapAdmin(ctx, normalized)) {
    return await activateBootstrapAdmin(ctx, repaired, clerkUserId);
  }

  return "pending";
}
