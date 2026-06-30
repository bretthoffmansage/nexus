import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const userStatus = v.union(
  v.literal("pending"),
  v.literal("active"),
  v.literal("suspended"),
);

const roleName = v.union(v.literal("knowledge_reader"), v.literal("nexus_admin"));

const identityEventType = v.union(
  v.literal("user_seen"),
  v.literal("user_approved"),
  v.literal("user_suspended"),
  v.literal("user_reactivated"),
  v.literal("role_granted"),
  v.literal("role_revoked"),
  v.literal("clerk_user_updated"),
  v.literal("clerk_user_deleted"),
  v.literal("identity_email_repaired"),
);

export default defineSchema({
  approvedUsers: defineTable({
    clerkUserId: v.string(),
    primaryEmail: v.string(),
    displayName: v.optional(v.string()),
    status: userStatus,
    invitedAt: v.optional(v.number()),
    firstSeenAt: v.number(),
    approvedAt: v.optional(v.number()),
    approvedByClerkUserId: v.optional(v.string()),
    suspendedAt: v.optional(v.number()),
    suspendedByClerkUserId: v.optional(v.string()),
    suspensionReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerk_user_id", ["clerkUserId"])
    .index("by_primary_email", ["primaryEmail"])
    .index("by_status", ["status"]),

  userRoles: defineTable({
    clerkUserId: v.string(),
    role: roleName,
    grantedAt: v.number(),
    grantedByClerkUserId: v.string(),
    revokedAt: v.optional(v.number()),
    revokedByClerkUserId: v.optional(v.string()),
    active: v.boolean(),
  })
    .index("by_clerk_user_id", ["clerkUserId"])
    .index("by_clerk_user_id_and_role", ["clerkUserId", "role"])
    .index("by_role_and_active", ["role", "active"]),

  identityAuditEvents: defineTable({
    eventType: identityEventType,
    actorType: v.union(v.literal("user"), v.literal("system"), v.literal("clerk_webhook")),
    actorId: v.string(),
    targetClerkUserId: v.string(),
    at: v.number(),
    metadata: v.optional(v.any()),
    dedupeKey: v.optional(v.string()),
  })
    .index("by_target_and_at", ["targetClerkUserId", "at"])
    .index("by_event_type_and_at", ["eventType", "at"])
    .index("by_at", ["at"])
    .index("by_dedupe_key", ["dedupeKey"]),
});
