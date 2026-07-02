import { query } from "./_generated/server";
import {
  buildSkillsCatalogSections,
  calendarCapabilityAvailable,
  SKILLS_CATALOG_TOOL_DEFS,
} from "./lib/nexusSkillsCatalog";
import { requireKnowledgeReader } from "./lib/ownership";
import { DEFAULT_CONNECTOR_TOOL_IDS, P6_LEASE } from "./lib/p6config";

/** Read-only Skills catalog for approved Nexus-accessible tools. */
export const listSkillsCatalog = query({
  args: {},
  handler: async (ctx) => {
    await requireKnowledgeReader(ctx);
    const now = Date.now();
    const connector = await ctx.db.query("nexusConnectors").first();
    const connectorConfigured = Boolean(connector && connector.status === "active" && connector.enabled);
    const lastHeartbeat = connector?.lastHeartbeatAt ?? connector?.lastSeenAt;
    const connectorOnline = Boolean(
      connectorConfigured &&
        lastHeartbeat &&
        now - lastHeartbeat <= P6_LEASE.connectorOfflineThresholdMs,
    );
    const allowedToolIds = connector?.allowedToolIds ?? [...DEFAULT_CONNECTOR_TOOL_IDS];

    const calendarCapabilityByToolId: Record<string, boolean> = {};
    for (const def of SKILLS_CATALOG_TOOL_DEFS) {
      if (def.calendarRequiresExplicitCapability) {
        calendarCapabilityByToolId[def.toolId] = await calendarCapabilityAvailable(ctx, def.toolId);
      }
    }

    const sections = buildSkillsCatalogSections({
      connectorConfigured,
      connectorOnline,
      allowedToolIds,
      calendarCapabilityByToolId,
    });

    return {
      sections,
      connectorConfigured,
      connectorOnline,
    };
  },
});
