/**
 * Conversation continuity limits — single configuration surface for context
 * assembly at task creation time.
 */
export const CONVERSATION_CONTEXT = {
  /** Maximum completed user→Nexus round trips included before the current task. */
  maxPriorRoundTrips: 4,
  maxPriorUserMessageChars: 2_000,
  maxPriorNexusResponseChars: 4_000,
  maxSourcesPerPriorTurn: 10,
  /** Budget for the formatted prior-context block (excluding current user request). */
  maxTotalContextChars: 24_000,
  /** Hard cap on the persisted execution request sent to the Connector. */
  maxExecutionRequestLength: 32_000,
} as const;

export type ConversationContextLimits = typeof CONVERSATION_CONTEXT;
