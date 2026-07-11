/**
 * Deep Research model catalog normalization (pure, no network, no secrets).
 *
 * Input is the raw Vercel AI Gateway `GET /v1/models` response shape
 * ({ object: "list", data: [...] }). We filter to models compatible with the
 * Claudia Deep Research Hermes runtime (text generation + tool calling over the
 * OpenAI-compatible gateway transport) and normalize to a small, non-secret UI
 * shape. Claudia independently re-validates any selection, so this filter exists
 * purely for UI usability — it is never the authority.
 *
 * This module is pure so both the server route and unit tests share the exact
 * same logic. It never reads env, never fetches, and never touches credentials.
 */

/** Sentinel option: send no requestedModelId → Claudia uses its default. */
export const NEXUS_DEFAULT_MODEL_VALUE = "__nexus_default__";

/** Model types from the Gateway catalog that are never eligible for research. */
const DENIED_TYPES = new Set([
  "embedding",
  "image",
  "video",
  "reranking",
  "transcription",
  "speech",
  "realtime",
]);

/** Tag that indicates tool/function calling on a Gateway language model. */
const TOOL_CALLING_TAGS = new Set(["tool-use", "tools", "tool", "function_calling"]);

/** Bounded model-id syntax mirror of the Claudia + Connector gate. */
const MODEL_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,40}\/[A-Za-z0-9][A-Za-z0-9._:-]{0,80}$/;

export type NexusResearchModel = {
  /** Exact Gateway identifier, e.g. "anthropic/claude-sonnet-4.6". */
  id: string;
  /** Friendly display name. */
  name: string;
  /** Provider family (id prefix), e.g. "anthropic". */
  provider: string;
  /** Context window in tokens, when the catalog reports it. */
  contextWindow: number | null;
  /** Input/output price strings as reported by the catalog (display only). */
  pricing: { input: string | null; output: string | null } | null;
  /** Normalized capability labels for UI badges. */
  capabilities: string[];
};

export type RawGatewayModel = {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  tags?: unknown;
  context_window?: unknown;
  pricing?: unknown;
  owned_by?: unknown;
};

export function isValidModelIdSyntax(value: string): boolean {
  return (
    typeof value === "string" &&
    value.length <= 128 &&
    !/\s/.test(value) &&
    MODEL_ID_PATTERN.test(value)
  );
}

function providerFromId(id: string): string {
  const slash = id.indexOf("/");
  return slash > 0 ? id.slice(0, slash) : "unknown";
}

function toStringTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((t) => String(t).toLowerCase());
}

function isCompatible(model: RawGatewayModel): boolean {
  const id = typeof model.id === "string" ? model.id : "";
  if (!isValidModelIdSyntax(id)) return false;
  const type = String(model.type ?? "").toLowerCase();
  if (DENIED_TYPES.has(type)) return false;
  // Require an explicit language/text type: never trust an unknown type.
  if (type !== "language" && type !== "text" && type !== "chat") return false;
  const tags = toStringTags(model.tags);
  return tags.some((t) => TOOL_CALLING_TAGS.has(t));
}

function normalizeCapabilities(tags: string[]): string[] {
  const labels: string[] = ["text"];
  if (tags.some((t) => TOOL_CALLING_TAGS.has(t))) labels.push("tool_calling");
  if (tags.includes("reasoning")) labels.push("reasoning");
  if (tags.includes("vision")) labels.push("vision");
  return labels;
}

function normalizePricing(value: unknown): NexusResearchModel["pricing"] {
  if (!value || typeof value !== "object") return null;
  const p = value as { input?: unknown; output?: unknown };
  const input = p.input != null ? String(p.input) : null;
  const output = p.output != null ? String(p.output) : null;
  if (input == null && output == null) return null;
  return { input, output };
}

/**
 * Parse and filter a raw Gateway `/v1/models` payload into the compatible,
 * normalized, provider-sorted UI catalog. Unknown shapes yield an empty list
 * rather than throwing, so a malformed upstream response degrades gracefully.
 */
export function normalizeResearchModelCatalog(payload: unknown): NexusResearchModel[] {
  const data =
    payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)
      ? ((payload as { data: unknown[] }).data as RawGatewayModel[])
      : Array.isArray(payload)
        ? (payload as RawGatewayModel[])
        : [];

  const models: NexusResearchModel[] = [];
  const seen = new Set<string>();
  for (const raw of data) {
    if (!raw || typeof raw !== "object" || !isCompatible(raw)) continue;
    const id = String(raw.id);
    if (seen.has(id)) continue;
    seen.add(id);
    const tags = toStringTags(raw.tags);
    models.push({
      id,
      name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : id,
      provider: providerFromId(id),
      contextWindow:
        typeof raw.context_window === "number" && raw.context_window > 0
          ? raw.context_window
          : null,
      pricing: normalizePricing(raw.pricing),
      capabilities: normalizeCapabilities(tags),
    });
  }

  models.sort((a, b) => {
    if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
    return a.name.localeCompare(b.name);
  });
  return models;
}

/** Provider → count summary for a safe manual/UI overview (no secrets). */
export function summarizeCatalog(models: NexusResearchModel[]): {
  total: number;
  byProvider: Record<string, number>;
} {
  const byProvider: Record<string, number> = {};
  for (const m of models) byProvider[m.provider] = (byProvider[m.provider] ?? 0) + 1;
  return { total: models.length, byProvider };
}
