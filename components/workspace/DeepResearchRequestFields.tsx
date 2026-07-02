"use client";

import { useMemo } from "react";
import { DEEP_RESEARCH_MAX_REQUEST_LENGTH } from "@/convex/lib/deepResearchConfig";
import { ResearchModelSelector } from "@/components/workspace/port/ResearchModelSelector";
import {
  composedResearchRequestValidationMessage,
  DEFAULT_DEEP_RESEARCH_REPORT_RULES,
  validateComposedDeepResearchRequest,
} from "@/lib/nexus/deepResearchRequestCompose";
import {
  CLAUDIA_DEFAULT_MODEL_VALUE,
  type NexusResearchModel,
} from "@/lib/nexus/deepResearchModelCatalog";

export type DeepResearchRequestFieldsProps = {
  researchRequest: string;
  onResearchRequestChange: (value: string) => void;
  reportRules: string;
  onReportRulesChange: (value: string) => void;
  selectedModelId: string;
  onModelChange: (value: string) => void;
  models: NexusResearchModel[];
  modelCatalogLoading: boolean;
  modelCatalogError: boolean;
  disabled?: boolean;
  /** Prefix for element ids when multiple forms exist on one page. */
  idPrefix?: string;
  researchRequestRows?: number;
  reportRulesRows?: number;
  className?: string;
};

/**
 * Shared Deep Research request inputs — research request, composed character
 * count, report rules, and bounded model selector. Model is display-only;
 * callers must not send model in execution payloads.
 */
export function DeepResearchRequestFields({
  researchRequest,
  onResearchRequestChange,
  reportRules,
  onReportRulesChange,
  selectedModelId,
  onModelChange,
  models,
  modelCatalogLoading,
  modelCatalogError,
  disabled = false,
  idPrefix = "deep-research",
  researchRequestRows = 8,
  reportRulesRows = 4,
  className,
}: DeepResearchRequestFieldsProps) {
  const validation = useMemo(
    () => validateComposedDeepResearchRequest(researchRequest, reportRules),
    [researchRequest, reportRules],
  );
  const composedCharCount = validation.length;
  const requestOnlyCharCount = researchRequest.trim().length;
  const requestId = `${idPrefix}-request`;
  const rulesId = `${idPrefix}-report-rules`;

  return (
    <div className={className ?? "deep-research-request-fields"}>
      <label className="cal-field" htmlFor={requestId}>
        <span>Research request</span>
        <textarea
          id={requestId}
          className="research-request-input"
          rows={researchRequestRows}
          value={researchRequest}
          placeholder="Describe the question, task, or report you want researched…"
          disabled={disabled}
          onChange={(event) => onResearchRequestChange(event.target.value)}
        />
      </label>
      <div className="research-request-meta" aria-live="polite">
        <span>
          {composedCharCount.toLocaleString()} /{" "}
          {DEEP_RESEARCH_MAX_REQUEST_LENGTH.toLocaleString()} submitted characters
        </span>
        <span className="research-request-meta-secondary">
          Request field: {requestOnlyCharCount.toLocaleString()}
        </span>
        {!validation.ok && validation.code === "too_large" ? (
          <span className="research-validation-error">
            {composedResearchRequestValidationMessage("too_large")}
          </span>
        ) : null}
      </div>

      <label className="cal-field" htmlFor={rulesId}>
        <span>Report rules</span>
        <textarea
          id={rulesId}
          className="research-report-rules-input"
          rows={reportRulesRows}
          value={reportRules}
          placeholder="Optional rules for the final report…"
          disabled={disabled}
          onChange={(event) => onReportRulesChange(event.target.value)}
        />
      </label>

      <ResearchModelSelector
        value={selectedModelId}
        onChange={onModelChange}
        models={models}
        loading={modelCatalogLoading}
        error={modelCatalogError}
        disabled={disabled}
      />
    </div>
  );
}

export { DEFAULT_DEEP_RESEARCH_REPORT_RULES, CLAUDIA_DEFAULT_MODEL_VALUE };
