import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { NEXUS_ERROR_CODES, nexusError } from "./lib/errors";
import { requireActiveConnector } from "./connectorRegistry";

/**
 * P6 — read-only cancellation check for the Connector holding a lease.
 *
 * Lets the P7 poller cheaply learn that the user requested cancellation while
 * Claudia was working, WITHOUT extending the lease (unlike
 * `heartbeatTaskLease`). Returns only this one task's own status/cancellation
 * flag — never any other task or user content. Lease ownership is verified so
 * a Connector can only read a task it currently holds.
 */
export const getTaskCancellationState = internalQuery({
  args: { connectorId: v.string(), taskId: v.id("nexusTasks"), leaseId: v.string() },
  handler: async (ctx, args) => {
    await requireActiveConnector(ctx, args.connectorId);
    const task = await ctx.db.get(args.taskId);
    if (!task) nexusError(NEXUS_ERROR_CODES.TASK_NOT_FOUND, "Task not found");

    if (task.claimedByConnectorId !== args.connectorId) {
      nexusError(NEXUS_ERROR_CODES.WRONG_CONNECTOR, "Task is claimed by a different Connector");
    }
    if (task.leaseId !== args.leaseId) {
      nexusError(NEXUS_ERROR_CODES.WRONG_LEASE, "Lease id does not match the current claim");
    }

    return {
      taskId: task._id,
      status: task.status,
      cancellationRequested: task.status === "cancel_requested",
      leaseExpiresAt: task.leaseExpiresAt ?? null,
    };
  },
});
