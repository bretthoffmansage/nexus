import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * P6 — scheduled maintenance for the trusted Connector protocol.
 *
 * Both jobs are deterministic, bounded, and idempotent: they only ever act on
 * rows that are already past an expiry the schema records, so running them
 * more or less often changes throughput, never correctness. Stale-lease
 * recovery also runs opportunistically inside `claimNextTask`, so these crons
 * are a backstop that keeps the queue healthy even when no Connector is
 * polling.
 */
const crons = cronJobs();

// Requeue/fail/cancel tasks whose Connector lease expired (abandoned work).
crons.interval(
  "recover stale connector leases",
  { seconds: 60 },
  internal.connectorTasks.recoverStaleLeases,
  {},
);

// Prune consumed replay nonces that are past their retention window.
crons.interval(
  "prune expired connector nonces",
  { minutes: 5 },
  internal.connectorAuthStore.pruneExpiredNonces,
  {},
);

// Nexus Calendar — due-event detection, dispatch, and reconciliation.
crons.interval(
  "dispatch due scheduled calendar events",
  { seconds: 60 },
  internal.scheduledEventDispatch.runScheduledEventMaintenance,
  {},
);

export default crons;
