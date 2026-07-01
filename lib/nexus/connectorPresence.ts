import type { ClaudiaPresenceState } from "@/lib/types/presentation";

/**
 * P6 — truthful Connector presence states surfaced to the UI. Mirrors
 * `convex/lib/p6config.ts` `ConnectorPresenceState` (kept as a plain string
 * union here so client code never imports Convex server config).
 */
export type ConnectorPresenceState =
  | "not_configured"
  | "offline"
  | "online_idle"
  | "online_busy"
  | "degraded"
  | "disabled";

/**
 * Map the P6 Connector presence to the existing 6-state `ClaudiaPresence`
 * visual vocabulary so the presence card renders truthfully without a
 * redesign.
 */
export function connectorPresenceToClaudiaState(
  presence: ConnectorPresenceState,
): ClaudiaPresenceState {
  switch (presence) {
    case "online_idle":
      return "online";
    case "online_busy":
      return "busy";
    case "offline":
      return "offline";
    case "degraded":
      return "error";
    case "disabled":
    case "not_configured":
    default:
      return "not_configured";
  }
}
