"use client";

import { useQuery } from "convex/react";
import { SystemPresence } from "@/components/status/SystemPresence";
import { nexusChat } from "@/lib/nexus/p5Client";
import {
  connectorPresenceToSystemState,
  type ConnectorPresenceState,
} from "@/lib/nexus/connectorPresence";
import { useNexusAuthReadiness } from "@/lib/nexus/useNexusAuthReadiness";

/**
 * P6 — live Connector presence for approved users.
 *
 * Reads the truthful, content-free `getConnectorStatusPublic` projection
 * (presence only — no heartbeat timestamps, task ids, or software details for
 * ordinary users) and renders the existing `SystemPresence` card.
 *
 * The `useQuery` call lives in a child that is only mounted once Convex
 * confirms auth (`readyForPrivateQueries`). That guarantees a
 * `ConvexProviderWithClerk` is present before any Convex hook runs, so the
 * Sidebar (rendered on every route, including provider-less "configuration
 * required" dev states) never crashes — it simply shows the truthful
 * `not_configured` placeholder until auth is ready.
 */
function ConnectorPresenceQuery() {
  const status = useQuery(nexusChat.connectorStatus, {});
  const presence = (status?.state ?? "not_configured") as ConnectorPresenceState;
  return <SystemPresence state={connectorPresenceToSystemState(presence)} />;
}

export function SystemPresenceLive() {
  const { readyForPrivateQueries } = useNexusAuthReadiness();
  if (!readyForPrivateQueries) {
    return <SystemPresence state="not_configured" />;
  }
  return <ConnectorPresenceQuery />;
}
