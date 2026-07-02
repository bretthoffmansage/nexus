"use client";

import { useId, useMemo, useState } from "react";
import {
  CLAUDIA_DEFAULT_MODEL_VALUE,
  type NexusResearchModel,
} from "@/lib/nexus/deepResearchModelCatalog";

export type ResearchModelSelectorProps = {
  value: string;
  onChange: (value: string) => void;
  models: NexusResearchModel[];
  loading: boolean;
  error: boolean;
  disabled?: boolean;
};

function contextLabel(model: NexusResearchModel): string {
  if (!model.contextWindow) return "";
  const k = Math.round(model.contextWindow / 1000);
  return k >= 1 ? ` · ${k}k ctx` : "";
}

/**
 * Searchable Deep Research model selector.
 *
 * Replaces the legacy disabled "Managed by Claudia" field. The first option is
 * always "Claudia default" (submits no model id). Concrete options come from
 * the live Vercel AI Gateway catalog, filtered server-side to research-
 * compatible models. If the operator's saved model has disappeared from the
 * catalog it is shown as unavailable and the run is blocked until they choose
 * another — the selection is never silently changed. Rendering, filtering, or
 * changing the model never submits anything.
 */
export function ResearchModelSelector({
  value,
  onChange,
  models,
  loading,
  error,
  disabled = false,
}: ResearchModelSelectorProps) {
  const [search, setSearch] = useState("");
  const listId = useId();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q),
    );
  }, [models, search]);

  const isConcrete = value !== CLAUDIA_DEFAULT_MODEL_VALUE;
  const selectedModel = isConcrete ? models.find((m) => m.id === value) ?? null : null;
  const savedUnavailable = isConcrete && !loading && !error && !selectedModel;

  return (
    <div className="research-model-selector">
      <label htmlFor={`${listId}-select`}>Model</label>

      {loading ? (
        <p className="research-model-status" role="status">
          Loading the current model catalog…
        </p>
      ) : null}
      {error ? (
        <p className="research-model-status research-model-status-warn" role="status">
          Live model catalog is unavailable. You can still run with the Claudia default
          {isConcrete && selectedModel ? " or your last selection" : ""}.
        </p>
      ) : null}

      <input
        type="search"
        className="research-model-search"
        placeholder="Search models by name or provider…"
        value={search}
        disabled={disabled || loading || (error && models.length === 0)}
        onChange={(event) => setSearch(event.target.value)}
        aria-label="Search research models"
      />

      <select
        id={`${listId}-select`}
        className="research-model-field"
        value={savedUnavailable ? "__unavailable__" : value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={`${listId}-hint`}
      >
        <option value={CLAUDIA_DEFAULT_MODEL_VALUE}>Claudia default</option>
        {savedUnavailable ? (
          <option value="__unavailable__" disabled>
            {value} (unavailable — choose another)
          </option>
        ) : null}
        {filtered.map((model) => (
          <option key={model.id} value={model.id}>
            {model.provider} / {model.name}
            {contextLabel(model)}
          </option>
        ))}
      </select>

      <p id={`${listId}-hint`} className="research-model-hint">
        {savedUnavailable ? (
          <span className="research-validation-error">
            Your saved model is no longer available. Select a model or use the Claudia default.
          </span>
        ) : selectedModel ? (
          <span>
            Exact model: <code>{selectedModel.id}</code>
          </span>
        ) : (
          <span>Claudia selects and validates the model for each run.</span>
        )}
      </p>
    </div>
  );
}
