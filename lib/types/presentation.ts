/**
 * Frontend presentation contracts for Nexus UI rendering.
 * These are NOT the authoritative Convex schema — backend types arrive in P5+.
 */

export type TaskDisplayStatus =
  | "queued"
  | "claimed"
  | "running"
  | "needs_clarification"
  | "needs_confirmation"
  | "complete"
  | "partial"
  | "failed"
  | "expired"
  | "cancelled";

export type SystemPresenceState =
  | "not_configured"
  | "online"
  | "offline"
  | "reconnecting"
  | "error"
  | "busy";

export type NexusAnswer = {
  text: string;
  partial?: boolean;
};

export type NexusSource = {
  id: string;
  title: string;
  sourceType: string;
  location?: string;
  excerpt?: string;
  retrievedAt?: string;
  toolId?: string;
  href?: string;
  provenanceLabel?: string;
};

export type NexusDiagnostics = {
  taskId?: string;
  traceId?: string;
  toolId?: string;
  model?: string;
  durationMs?: number;
  attemptNumber?: number;
  status?: TaskDisplayStatus;
  warnings?: string[];
  structuredError?: string;
};
