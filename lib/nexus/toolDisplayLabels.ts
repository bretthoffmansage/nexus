import {
  P5_DEFAULT_TOOL_ID,
  P5_SUPPORTED_TOOL_IDS,
  type P5ToolId,
} from "@/convex/lib/p5config";

/** Human-facing presentation for a P5 knowledge-request tool (UI only). */
export type NexusRequestToolDisplay = {
  /** Canonical tool ID — unchanged in Convex, queue, and Connector protocol. */
  id: P5ToolId;
  /** Operator-facing label shown in Nexus Chat. */
  label: string;
  /** Optional short description for tooltips or help copy. */
  description?: string;
};

export const NEXUS_REQUEST_TOOL_DISPLAY: Record<P5ToolId, NexusRequestToolDisplay> = {
  "vault.agentic_retrieval": {
    id: "vault.agentic_retrieval",
    label: "Vault",
    description: "Search the Sage knowledge base with governed retrieval.",
  },
  "membership_io.transcript_retrieve": {
    id: "membership_io.transcript_retrieve",
    label: "Transcripts",
    description: "Retrieve Membership.io transcript excerpts.",
  },
};

/** Ordered options for the chat composer tool selector. */
export const NEXUS_REQUEST_TOOL_OPTIONS: NexusRequestToolDisplay[] =
  P5_SUPPORTED_TOOL_IDS.map((id) => NEXUS_REQUEST_TOOL_DISPLAY[id]);

export function getRequestToolDisplayLabel(toolId: P5ToolId): string {
  return NEXUS_REQUEST_TOOL_DISPLAY[toolId].label;
}

export { P5_DEFAULT_TOOL_ID };
