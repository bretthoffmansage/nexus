import { ConvexError } from "convex/values";

export const NEXUS_ERROR_CODES = {
  UNAUTHENTICATED: "unauthenticated",
  APPROVAL_REQUIRED: "approval_required",
  USER_SUSPENDED: "user_suspended",
  FORBIDDEN: "forbidden",
  ROLE_REQUIRED: "role_required",
  USER_NOT_FOUND: "user_not_found",
  ROLE_ALREADY_GRANTED: "role_already_granted",
  ROLE_NOT_ACTIVE: "role_not_active",
  LAST_ADMIN: "last_admin",
  INVALID_INPUT: "invalid_input",
  // P5 — private conversations, tasks, and shared queue.
  CONVERSATION_NOT_FOUND: "conversation_not_found",
  MESSAGE_NOT_FOUND: "message_not_found",
  TASK_NOT_FOUND: "task_not_found",
  INVALID_TASK_STATE: "invalid_task_state",
  INVALID_TOOL: "invalid_tool",
  REQUEST_TOO_LARGE: "request_too_large",
  IDEMPOTENCY_CONFLICT: "idempotency_conflict",
  RETRY_NOT_ALLOWED: "retry_not_allowed",
  CANCELLATION_NOT_ALLOWED: "cancellation_not_allowed",
  QUEUE_UNAVAILABLE: "queue_unavailable",
  RESULT_NOT_AVAILABLE: "result_not_available",
  // P6 — trusted Connector queue protocol.
  CONNECTOR_UNAUTHORIZED: "connector_unauthorized",
  CONNECTOR_DISABLED: "connector_disabled",
  CONNECTOR_REVOKED: "connector_revoked",
  INVALID_SIGNATURE: "invalid_signature",
  STALE_TIMESTAMP: "stale_timestamp",
  REPLAY_DETECTED: "replay_detected",
  INVALID_REQUEST: "invalid_request",
  BODY_TOO_LARGE: "body_too_large",
  NO_TASK_AVAILABLE: "no_task_available",
  CONNECTOR_BUSY: "connector_busy",
  TASK_NOT_CLAIMED: "task_not_claimed",
  WRONG_CONNECTOR: "wrong_connector",
  WRONG_LEASE: "wrong_lease",
  LEASE_EXPIRED: "lease_expired",
  CANCELLATION_REQUESTED: "cancellation_requested",
  COMPLETION_CONFLICT: "completion_conflict",
  RESULT_TOO_LARGE: "result_too_large",
  TOO_MANY_SOURCES: "too_many_sources",
  PROGRESS_TOO_LARGE: "progress_too_large",
  PROTOCOL_VERSION_UNSUPPORTED: "protocol_version_unsupported",
  INTERNAL_ERROR: "internal_error",
} as const;

export type NexusErrorCode =
  (typeof NEXUS_ERROR_CODES)[keyof typeof NEXUS_ERROR_CODES];

export function nexusError(code: NexusErrorCode, message: string): never {
  throw new ConvexError({ code, message });
}
