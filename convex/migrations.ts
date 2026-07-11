import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

/**
 * TEMPORARY one-off rebrand migrations (run once via `npx convex run`, then
 * this file is deleted and the deprecated schema field removed).
 */

/** Clear the pre-rebrand `claudiaSystemStatus` snapshot on every connector row.
 * The snapshot is ephemeral heartbeat display data; the next heartbeat
 * repopulates the renamed `systemStatus` field with the new component keys. */
export const clearLegacySystemStatusField = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("nexusConnectors").collect();
    let cleared = 0;
    for (const row of rows) {
      const legacy = (row as unknown as Record<string, unknown>).claudiaSystemStatus;
      if (legacy !== undefined) {
        await ctx.db.patch(row._id, { claudiaSystemStatus: undefined } as never);
        cleared += 1;
      }
    }
    return { rows: rows.length, cleared };
  },
});

/** Rename a connector id in place (row keeps its secret hash, allowlist, history). */
export const renameConnectorId = internalMutation({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, args) => {
    const source = await ctx.db
      .query("nexusConnectors")
      .withIndex("by_connector_id", (q) => q.eq("connectorId", args.from))
      .unique();
    if (!source) throw new Error(`Connector "${args.from}" not found`);
    const clash = await ctx.db
      .query("nexusConnectors")
      .withIndex("by_connector_id", (q) => q.eq("connectorId", args.to))
      .unique();
    if (clash) throw new Error(`Connector "${args.to}" already exists`);
    await ctx.db.patch(source._id, { connectorId: args.to, updatedAt: Date.now() });
    return { renamed: true, from: args.from, to: args.to };
  },
});
