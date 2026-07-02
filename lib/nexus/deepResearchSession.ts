import {
  DEEP_RESEARCH_MAX_REQUEST_LENGTH,
  isValidDeepResearchIdentifier,
  isValidDeepResearchModelId,
} from "@/convex/lib/deepResearchConfig";
import { CLAUDIA_DEFAULT_MODEL_VALUE } from "@/lib/nexus/deepResearchModelCatalog";
import { DEFAULT_DEEP_RESEARCH_REPORT_RULES } from "@/lib/nexus/deepResearchRequestCompose";

const STORAGE_REQUEST_ID = "nexus.deepResearch.researchRequestId";
const STORAGE_IDEMPOTENCY_KEY = "nexus.deepResearch.idempotencyKey";
const STORAGE_ACTIVE_TASK_ID = "nexus.deepResearch.activeTaskId";
const STORAGE_SELECTED_MODEL = "nexus.deepResearch.selectedModelId";
const STORAGE_REPORT_RULES_DRAFT = "nexus.deepResearch.reportRulesDraft";

function randomIdentifier(prefix: string): string {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  return `${prefix}_${uuid}`;
}

function readStored(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore quota / private-mode failures — callers still hold in-memory values.
  }
}

function removeStored(key: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}

/** Load or mint a stable researchRequestId for the current user-created request. */
export function loadOrCreateResearchRequestId(): string {
  const existing = readStored(STORAGE_REQUEST_ID);
  if (existing && isValidDeepResearchIdentifier(existing)) {
    return existing;
  }
  const created = randomIdentifier("nexus-research");
  writeStored(STORAGE_REQUEST_ID, created);
  return created;
}

/** Load or mint a stable idempotency key for the current execution intent. */
export function loadOrCreateIdempotencyKey(): string {
  const existing = readStored(STORAGE_IDEMPOTENCY_KEY);
  if (existing && isValidDeepResearchIdentifier(existing)) {
    return existing;
  }
  const created = randomIdentifier("nexus-research-run");
  writeStored(STORAGE_IDEMPOTENCY_KEY, created);
  return created;
}

/** Mint a fresh idempotency key when the user explicitly starts a new run. */
export function rotateIdempotencyKey(): string {
  const created = randomIdentifier("nexus-research-run");
  writeStored(STORAGE_IDEMPOTENCY_KEY, created);
  removeStored(STORAGE_ACTIVE_TASK_ID);
  return created;
}

/** Mint a fresh research request and execution pair for an intentional new request. */
export function rotateResearchRequestSession(): {
  researchRequestId: string;
  idempotencyKey: string;
} {
  const researchRequestId = randomIdentifier("nexus-research");
  const idempotencyKey = randomIdentifier("nexus-research-run");
  writeStored(STORAGE_REQUEST_ID, researchRequestId);
  writeStored(STORAGE_IDEMPOTENCY_KEY, idempotencyKey);
  removeStored(STORAGE_ACTIVE_TASK_ID);
  return { researchRequestId, idempotencyKey };
}

export function rememberActiveTaskId(taskId: string): void {
  writeStored(STORAGE_ACTIVE_TASK_ID, taskId);
}

export function loadActiveTaskId(): string | null {
  return readStored(STORAGE_ACTIVE_TASK_ID);
}

export function clearActiveTaskId(): void {
  removeStored(STORAGE_ACTIVE_TASK_ID);
}

/** Load persisted report-rules draft or the canonical default for a new request. */
export function loadReportRulesDraft(): string {
  const stored = readStored(STORAGE_REPORT_RULES_DRAFT);
  if (stored !== null) return stored;
  return DEFAULT_DEEP_RESEARCH_REPORT_RULES;
}

/** Persist in-progress report rules without submitting a task. */
export function saveReportRulesDraft(value: string): void {
  writeStored(STORAGE_REPORT_RULES_DRAFT, value);
}

/** Reset report rules to the default (e.g. intentional New request). */
export function resetReportRulesDraft(): string {
  writeStored(STORAGE_REPORT_RULES_DRAFT, DEFAULT_DEEP_RESEARCH_REPORT_RULES);
  return DEFAULT_DEEP_RESEARCH_REPORT_RULES;
}

/**
 * Load the persisted Deep Research model selection. Returns the sentinel
 * "Claudia default" value when nothing valid is stored, so the selector always
 * has a safe starting option. A stored concrete model is only returned when it
 * still passes syntax (a corrupted value degrades to the default).
 */
export function loadSelectedModelId(): string {
  const stored = readStored(STORAGE_SELECTED_MODEL);
  if (!stored || stored === CLAUDIA_DEFAULT_MODEL_VALUE) {
    return CLAUDIA_DEFAULT_MODEL_VALUE;
  }
  return isValidDeepResearchModelId(stored) ? stored : CLAUDIA_DEFAULT_MODEL_VALUE;
}

/**
 * Persist the operator's model choice. The choice is a UI preference only —
 * every submitted task still captures its own model explicitly. Storing does
 * not submit anything.
 */
export function saveSelectedModelId(value: string): void {
  if (value === CLAUDIA_DEFAULT_MODEL_VALUE) {
    writeStored(STORAGE_SELECTED_MODEL, CLAUDIA_DEFAULT_MODEL_VALUE);
    return;
  }
  if (isValidDeepResearchModelId(value)) {
    writeStored(STORAGE_SELECTED_MODEL, value);
  }
}

/**
 * Resolve the selector value into the envelope field: the sentinel default
 * yields undefined (omit → Claudia default); a concrete valid id passes
 * through. Anything else is treated as the default (fail safe).
 */
export function selectedModelToEnvelopeField(value: string): string | undefined {
  if (!value || value === CLAUDIA_DEFAULT_MODEL_VALUE) return undefined;
  return isValidDeepResearchModelId(value) ? value : undefined;
}

export function validateResearchRequestLength(text: string): {
  ok: true;
  trimmed: string;
  length: number;
} | {
  ok: false;
  code: "empty" | "too_large";
  length: number;
} {
  const trimmed = text.trim();
  const length = trimmed.length;
  if (!trimmed) {
    return { ok: false, code: "empty", length };
  }
  if (length > DEEP_RESEARCH_MAX_REQUEST_LENGTH) {
    return { ok: false, code: "too_large", length };
  }
  return { ok: true, trimmed, length };
}

export function researchRequestValidationMessage(
  code: "empty" | "too_large",
): string {
  switch (code) {
    case "empty":
      return "Enter a research request before submitting.";
    case "too_large":
      return `Research request must be at most ${DEEP_RESEARCH_MAX_REQUEST_LENGTH.toLocaleString()} characters.`;
  }
}
