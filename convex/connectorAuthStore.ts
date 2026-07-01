import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { NEXUS_ERROR_CODES, nexusError } from "./lib/errors";
import { P6_SIGNING } from "./lib/p6config";

/**
 * P6 — nonce replay protection. `(connectorId, nonce)` may be consumed at
 * most once. This is a separate transactional step from HMAC signature
 * verification (`convex/lib/connectorAuth.ts`, which touches no database)
 * — signature validity is checked first (cheap, no DB), and only a
 * genuinely valid, freshly-signed request ever reaches this mutation.
 */
export const verifyAndConsumeNonce = internalMutation({
  args: {
    connectorId: v.string(),
    nonce: v.string(),
    requestTimestamp: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("nexusConnectorNonces")
      .withIndex("by_connector_and_nonce", (q) =>
        q.eq("connectorId", args.connectorId).eq("nonce", args.nonce),
      )
      .unique();

    if (existing) {
      nexusError(NEXUS_ERROR_CODES.REPLAY_DETECTED, "Nonce already used");
    }

    const now = Date.now();
    await ctx.db.insert("nexusConnectorNonces", {
      connectorId: args.connectorId,
      nonce: args.nonce,
      requestTimestamp: args.requestTimestamp,
      createdAt: now,
      expiresAt: now + P6_SIGNING.nonceTtlMs,
    });
  },
});

/** Bounded batch cleanup of expired nonces. Called by a cron; safe to call
 * repeatedly (idempotent — deletes only rows already past `expiresAt`). */
export const pruneExpiredNonces = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 200, 1), 500);
    const now = Date.now();
    const expired = await ctx.db
      .query("nexusConnectorNonces")
      .withIndex("by_expires_at", (q) => q.lt("expiresAt", now))
      .take(limit);
    for (const row of expired) {
      await ctx.db.delete(row._id);
    }
    return { deleted: expired.length };
  },
});
