import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

type AuditEventType = Doc<"identityAuditEvents">["eventType"];
type ActorType = Doc<"identityAuditEvents">["actorType"];

export async function recordIdentityAuditEvent(
  ctx: MutationCtx,
  args: {
    eventType: AuditEventType;
    actorType: ActorType;
    actorId: string;
    targetClerkUserId: string;
    metadata?: Record<string, unknown>;
    dedupeKey?: string;
  },
): Promise<void> {
  if (args.dedupeKey) {
    const existing = await ctx.db
      .query("identityAuditEvents")
      .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", args.dedupeKey))
      .unique();
    if (existing) return;
  }

  await ctx.db.insert("identityAuditEvents", {
    eventType: args.eventType,
    actorType: args.actorType,
    actorId: args.actorId,
    targetClerkUserId: args.targetClerkUserId,
    at: Date.now(),
    metadata: args.metadata,
    dedupeKey: args.dedupeKey,
  });
}
