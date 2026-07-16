/**
 * Nexus Deep Research — canonical system handoff contract.
 *
 * Contract: `nexus_hermes_deep_research_connector_handoff_v1`.
 *
 * Nexus owns only request collection, task creation, lifecycle display, and
 * safe terminal-result rendering. The system owns the research runtime, tools,
 * model selection, prompts, source access, sandboxing, budgets, and final
 * result assembly. The ONLY user-controlled execution content is `requestText`.
 *
 * This module is pure (no Convex imports) so both the browser client and the
 * server submission mutation build the exact same envelope, and so the envelope
 * is directly unit-testable.
 */

export const DEEP_RESEARCH_CONTRACT_VERSION =
  "nexus_hermes_deep_research_connector_handoff_v1_1";

/**
 * Bounded model-id syntax. Mirrors the Console Connector + research-tool gate
 * exactly ("provider/model", no whitespace/url/path/shell/credential syntax).
 * Nexus is not the authority — the system re-validates — but the envelope must not
 * carry an obviously malformed value.
 */
export const DEEP_RESEARCH_MODEL_ID_PATTERN =
  /^[a-z0-9][a-z0-9._-]{0,40}\/[A-Za-z0-9][A-Za-z0-9._:-]{0,80}$/;
export const DEEP_RESEARCH_MAX_MODEL_ID_LENGTH = 128;

export function isValidDeepResearchModelId(value: string): boolean {
  return (
    typeof value === "string" &&
    value.length <= DEEP_RESEARCH_MAX_MODEL_ID_LENGTH &&
    !/\s/.test(value) &&
    DEEP_RESEARCH_MODEL_ID_PATTERN.test(value)
  );
}

/** Canonical system tool ID for governed deep research. */
export const DEEP_RESEARCH_TOOL_ID = "research.hermes_deep_research";

/** Canonical task kind persisted on the shared `nexusTasks` queue. */
export const DEEP_RESEARCH_TASK_KIND = "deep_research";

/** Canonical source page marker (fixed metadata value). */
export const DEEP_RESEARCH_SOURCE_PAGE = "nexus_deep_research";

/** Fixed explicit-user-action value (fixed metadata value). */
export const DEEP_RESEARCH_EXPLICIT_USER_ACTION = "research";

/** Maximum plain-text research request length (composed request + report rules). */
export const DEEP_RESEARCH_MAX_REQUEST_LENGTH = 12000;

/** Stable identifier format shared by researchRequestId and idempotencyKey. */
export const DEEP_RESEARCH_ID_PATTERN = /^[A-Za-z0-9_.:-]{8,128}$/;

export function isValidDeepResearchIdentifier(value: string): boolean {
  return typeof value === "string" && DEEP_RESEARCH_ID_PATTERN.test(value);
}

/** Exactly the five allowed taskMetadata keys for this task kind. */
export type DeepResearchTaskMetadata = {
  kind: typeof DEEP_RESEARCH_TASK_KIND;
  sourcePage: typeof DEEP_RESEARCH_SOURCE_PAGE;
  explicitUserAction: typeof DEEP_RESEARCH_EXPLICIT_USER_ACTION;
  researchRequestId: string;
  idempotencyKey: string;
};

/** Build the server-authoritative metadata with fixed values baked in. */
export function buildDeepResearchTaskMetadata(
  researchRequestId: string,
  idempotencyKey: string,
): DeepResearchTaskMetadata {
  return {
    kind: DEEP_RESEARCH_TASK_KIND,
    sourcePage: DEEP_RESEARCH_SOURCE_PAGE,
    explicitUserAction: DEEP_RESEARCH_EXPLICIT_USER_ACTION,
    researchRequestId,
    idempotencyKey,
  };
}

export type DeepResearchEnvelope = {
  requestedToolId: typeof DEEP_RESEARCH_TOOL_ID;
  taskKind: typeof DEEP_RESEARCH_TASK_KIND;
  requestText: string;
  /**
   * Optional governed model selection (v1.1). Omitted entirely when the
   * operator chose the system default. When present it is a validated Gateway
   * model identifier; it is the ONLY execution-selection field allowed to cross
   * — no provider, transport, prompt, or runtime controls ever appear here.
   */
  requestedModelId?: string;
  taskMetadata: DeepResearchTaskMetadata;
};

export type DeepResearchEnvelopeError =
  | "empty_request"
  | "request_too_large"
  | "invalid_research_request_id"
  | "invalid_idempotency_key"
  | "invalid_model_id";

export type DeepResearchEnvelopeResult =
  | { ok: true; envelope: DeepResearchEnvelope }
  | { ok: false; code: DeepResearchEnvelopeError };

/**
 * Validate inputs and build the exact canonical envelope. `requestText` is
 * trimmed before validation; line breaks inside the text are preserved. No
 * model, provider, prompt, tools, runtime, attachment, or conversation fields
 * are ever included — the only execution content is `requestText`.
 */
export function buildDeepResearchEnvelope(input: {
  requestText: string;
  researchRequestId: string;
  idempotencyKey: string;
  /** Optional. Omit or pass undefined/empty for the system default. */
  requestedModelId?: string;
}): DeepResearchEnvelopeResult {
  const requestText = input.requestText.trim();
  if (!requestText) {
    return { ok: false, code: "empty_request" };
  }
  if (requestText.length > DEEP_RESEARCH_MAX_REQUEST_LENGTH) {
    return { ok: false, code: "request_too_large" };
  }
  if (!isValidDeepResearchIdentifier(input.researchRequestId)) {
    return { ok: false, code: "invalid_research_request_id" };
  }
  if (!isValidDeepResearchIdentifier(input.idempotencyKey)) {
    return { ok: false, code: "invalid_idempotency_key" };
  }
  const trimmedModel = (input.requestedModelId ?? "").trim();
  if (trimmedModel && !isValidDeepResearchModelId(trimmedModel)) {
    return { ok: false, code: "invalid_model_id" };
  }
  const envelope: DeepResearchEnvelope = {
    requestedToolId: DEEP_RESEARCH_TOOL_ID,
    taskKind: DEEP_RESEARCH_TASK_KIND,
    requestText,
    taskMetadata: buildDeepResearchTaskMetadata(
      input.researchRequestId,
      input.idempotencyKey,
    ),
  };
  // Only include the field when a concrete model was chosen. Omission is the
  // canonical "use system default" signal.
  if (trimmedModel) {
    envelope.requestedModelId = trimmedModel;
  }
  return { ok: true, envelope };
}

/**
 * Non-retryable system blocked-result codes for governed research. These are
 * terminal for automatic behavior — Nexus never auto-resubmits on any of them.
 */
export const DEEP_RESEARCH_BLOCKED_CODES = [
  "research_disabled",
  "research_web_provider_unconfigured",
  "unsupported_tool",
  "task_contract_invalid",
] as const;

export type DeepResearchBlockedCode = (typeof DEEP_RESEARCH_BLOCKED_CODES)[number];

export function isDeepResearchBlockedCode(
  code: string | null | undefined,
): code is DeepResearchBlockedCode {
  return (
    typeof code === "string" &&
    (DEEP_RESEARCH_BLOCKED_CODES as readonly string[]).includes(code)
  );
}

/** Bounded fallback shown when no safe system message is available. */
export const DEEP_RESEARCH_FALLBACK_BLOCKED_MESSAGE =
  "Deep Research is currently unavailable.";
