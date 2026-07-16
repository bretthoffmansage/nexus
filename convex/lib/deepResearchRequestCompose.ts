import { DEEP_RESEARCH_MAX_REQUEST_LENGTH } from "./deepResearchConfig";

/** Default Report rules text for a new Deep Research request. */
export const DEFAULT_DEEP_RESEARCH_REPORT_RULES =
  "Do not include any sensitive SAGE company information, sensitive client information, or employee names in the final report";

export const DEEP_RESEARCH_RULES_DIVIDER = "-------";
export const DEEP_RESEARCH_RULES_HEADING = "RULES FOR REPORT:";

/**
 * Marker proving a request already carries a composed Report-rules block. Used
 * to keep composition idempotent across the direct, retry, and Calendar paths.
 */
export const DEEP_RESEARCH_RULES_MARKER = `${DEEP_RESEARCH_RULES_DIVIDER}\n${DEEP_RESEARCH_RULES_HEADING}`;

/** Canonical trailing block: `\n-------\nRULES FOR REPORT:\n<rules>` at end of request. */
const CANONICAL_TRAILING_RULES_BLOCK =
  /\n-------\nRULES FOR REPORT:\n[\s\S]*$/;

/** Normalize user input to `\n` line endings before compose / idempotency checks. */
export function normalizeDeepResearchRequestLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * True when the request already ends with the governed Report-rules block.
 * Only the canonical trailing structure counts — incidental `RULES FOR REPORT:`
 * phrases earlier in the body are ignored.
 */
export function hasCanonicalTrailingReportRulesBlock(researchRequest: string): boolean {
  const normalized = normalizeDeepResearchRequestLineEndings(researchRequest.trim());
  return CANONICAL_TRAILING_RULES_BLOCK.test(normalized);
}

/**
 * Compose the final governed `requestText` from the primary research request
 * and optional report rules. Rules are folded into requestText only — never
 * taskMetadata.
 *
 * Idempotent: if `researchRequest` already ends with the canonical Report-rules
 * block (e.g. retry re-submitting stored requestText, Calendar re-dispatch, or
 * copy/paste of a prior composed request), the rules are NOT appended again.
 */
export function composeDeepResearchRequestText(
  researchRequest: string,
  reportRules: string,
): string {
  const normalizedRequest = normalizeDeepResearchRequestLineEndings(researchRequest.trim());
  const trimmedRules = reportRules.trim();
  if (!trimmedRules) {
    return normalizedRequest;
  }
  if (hasCanonicalTrailingReportRulesBlock(normalizedRequest)) {
    return normalizedRequest;
  }
  return `${normalizedRequest}\n${DEEP_RESEARCH_RULES_DIVIDER}\n${DEEP_RESEARCH_RULES_HEADING}\n${trimmedRules}`;
}

export type ComposedResearchRequestValidation =
  | {
      ok: true;
      trimmed: string;
      length: number;
      composed: string;
    }
  | {
      ok: false;
      code: "empty" | "too_large";
      length: number;
      composed: string;
    };

/** Validate the fully composed request payload (DEEP_RESEARCH_MAX_REQUEST_LENGTH). */
export function validateComposedDeepResearchRequest(
  researchRequest: string,
  reportRules: string,
): ComposedResearchRequestValidation {
  const composed = composeDeepResearchRequestText(researchRequest, reportRules);
  const length = composed.length;
  const trimmedRequest = researchRequest.trim();

  if (!trimmedRequest) {
    return { ok: false, code: "empty", length, composed };
  }
  if (length > DEEP_RESEARCH_MAX_REQUEST_LENGTH) {
    return { ok: false, code: "too_large", length, composed };
  }
  return { ok: true, trimmed: composed, length, composed };
}

export function composedResearchRequestValidationMessage(
  code: "empty" | "too_large",
): string {
  switch (code) {
    case "empty":
      return "Enter a research request before submitting.";
    case "too_large":
      return `The combined research request must be at most ${DEEP_RESEARCH_MAX_REQUEST_LENGTH.toLocaleString()} characters.`;
  }
}
