import { DEEP_RESEARCH_MAX_REQUEST_LENGTH } from "@/convex/lib/deepResearchConfig";

/** Default Report rules text for a new Deep Research request. */
export const DEFAULT_DEEP_RESEARCH_REPORT_RULES =
  "Do not include any sensitive SAGE company information, sensitive client information, or employee names in the final report";

export const DEEP_RESEARCH_RULES_DIVIDER = "-------";
export const DEEP_RESEARCH_RULES_HEADING = "RULES FOR REPORT:";

/**
 * Compose the final governed `requestText` from the primary research request
 * and optional report rules. Rules are folded into requestText only — never
 * taskMetadata.
 */
export function composeDeepResearchRequestText(
  researchRequest: string,
  reportRules: string,
): string {
  const trimmedRequest = researchRequest.trim();
  const trimmedRules = reportRules.trim();
  if (!trimmedRules) {
    return trimmedRequest;
  }
  return `${trimmedRequest}\n${DEEP_RESEARCH_RULES_DIVIDER}\n${DEEP_RESEARCH_RULES_HEADING}\n${trimmedRules}`;
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

/** Validate the fully composed request payload (8000-char limit). */
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
