import { query } from "./_generated/server";
import { requireApprovedRole } from "./lib/ownership";
import { TASK_STATUSES, type TaskStatus } from "./lib/taskStatus";

/**
 * Privacy-safe aggregate queue/system health for `nexus_admin` only.
 *
 * Returns COUNTS and a single oldest-queued timestamp — never message text,
 * request text, result content, source excerpts, conversation titles, or any
 * per-user history. Being an administrator grants identity administration and
 * queue health visibility, NOT access to anyone's private content.
 *
 * Counts use the global status indexes (content-free). These are the only
 * functions permitted to read across owners, and they expose no row contents.
 */
export const adminQueueDiagnostics = query({
  args: {},
  handler: async (ctx) => {
    await requireApprovedRole(ctx, "nexus_admin");

    const counts: Record<TaskStatus, number> = {
      queued: 0,
      cancel_requested: 0,
      cancelled: 0,
      claimed: 0,
      running: 0,
      completed: 0,
      failed: 0,
    };

    for (const status of TASK_STATUSES) {
      const rows = await ctx.db
        .query("nexusTasks")
        .withIndex("by_status_and_queue_sequence", (q) => q.eq("status", status))
        .collect();
      counts[status] = rows.length;
    }

    // Oldest queued task by queueSequence — timestamp only, no identity/content.
    const oldestQueued = await ctx.db
      .query("nexusTasks")
      .withIndex("by_status_and_queue_sequence", (q) => q.eq("status", "queued"))
      .order("asc")
      .first();

    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

    return {
      counts,
      total,
      oldestQueuedAt: oldestQueued?.queuedAt ?? null,
      // P5 has no worker; surfaced so the admin UI can say so truthfully.
      connectorState: "not_configured" as const,
      generatedAt: Date.now(),
    };
  },
});
