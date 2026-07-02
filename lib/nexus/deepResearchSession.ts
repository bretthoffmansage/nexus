import {
  DEEP_RESEARCH_MAX_REQUEST_LENGTH,
  isValidDeepResearchIdentifier,
} from "@/convex/lib/deepResearchConfig";

const STORAGE_REQUEST_ID = "nexus.deepResearch.researchRequestId";
const STORAGE_IDEMPOTENCY_KEY = "nexus.deepResearch.idempotencyKey";
const STORAGE_ACTIVE_TASK_ID = "nexus.deepResearch.activeTaskId";

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
