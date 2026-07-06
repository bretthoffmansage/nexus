/** Browser + server share one canonical compose implementation. */
export {
  composeDeepResearchRequestText,
  composedResearchRequestValidationMessage,
  DEFAULT_DEEP_RESEARCH_REPORT_RULES,
  DEEP_RESEARCH_RULES_DIVIDER,
  DEEP_RESEARCH_RULES_HEADING,
  DEEP_RESEARCH_RULES_MARKER,
  hasCanonicalTrailingReportRulesBlock,
  normalizeDeepResearchRequestLineEndings,
  validateComposedDeepResearchRequest,
  type ComposedResearchRequestValidation,
} from "@/convex/lib/deepResearchRequestCompose";
