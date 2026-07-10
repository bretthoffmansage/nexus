// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildDeepResearchEnvelope,
  DEEP_RESEARCH_CONTRACT_VERSION,
  isValidDeepResearchModelId,
} from "@/convex/lib/deepResearchConfig";
import {
  CLAUDIA_DEFAULT_MODEL_VALUE,
  normalizeResearchModelCatalog,
  summarizeCatalog,
  type NexusResearchModel,
} from "@/lib/nexus/deepResearchModelCatalog";
import {
  loadSelectedModelId,
  saveSelectedModelId,
  selectedModelToEnvelopeField,
} from "@/lib/nexus/deepResearchSession";
import { ResearchModelSelector } from "@/components/workspace/port/ResearchModelSelector";

const VALID_ID = "nexus-research_abc123def456";
const VALID_KEY = "nexus-research-run_abc123def456";

const RAW_CATALOG = {
  object: "list",
  data: [
    {
      id: "anthropic/claude-sonnet-4.6",
      name: "Claude Sonnet 4.6",
      type: "language",
      tags: ["reasoning", "tool-use", "vision"],
      context_window: 200000,
      pricing: { input: "0.000003", output: "0.000015" },
      owned_by: "anthropic",
    },
    {
      id: "openai/gpt-5",
      name: "GPT-5",
      type: "language",
      tags: ["tool-use"],
      context_window: 400000,
      pricing: { input: "0.00001", output: "0.00003" },
    },
    // language but no tool calling → excluded (Hermes needs tools)
    { id: "meta/llama-base", name: "Llama Base", type: "language", tags: ["reasoning"] },
    // non-chat modalities → excluded
    { id: "openai/dall-e-3", name: "DALL-E 3", type: "image", tags: [] },
    { id: "openai/whisper", name: "Whisper", type: "transcription", tags: [] },
    { id: "voyage/voyage-3", name: "Voyage 3", type: "embedding", tags: [] },
    { id: "openai/gpt-realtime", name: "GPT Realtime", type: "realtime", tags: ["tool-use"] },
    // malformed id → excluded
    { id: "no slash here", name: "Bad", type: "language", tags: ["tool-use"] },
  ],
};

describe("Deep Research model catalog normalization", () => {
  it("keeps only text + tool-calling chat models and normalizes fields", () => {
    const models = normalizeResearchModelCatalog(RAW_CATALOG);
    const ids = models.map((m) => m.id);
    expect(ids).toEqual(["anthropic/claude-sonnet-4.6", "openai/gpt-5"]);
    const sonnet = models[0];
    expect(sonnet.provider).toBe("anthropic");
    expect(sonnet.contextWindow).toBe(200000);
    expect(sonnet.pricing).toEqual({ input: "0.000003", output: "0.000015" });
    expect(sonnet.capabilities).toContain("text");
    expect(sonnet.capabilities).toContain("tool_calling");
  });

  it("excludes image, transcription, embedding, realtime, and malformed models", () => {
    const models = normalizeResearchModelCatalog(RAW_CATALOG);
    const ids = models.map((m) => m.id);
    expect(ids).not.toContain("openai/dall-e-3");
    expect(ids).not.toContain("openai/whisper");
    expect(ids).not.toContain("voyage/voyage-3");
    expect(ids).not.toContain("openai/gpt-realtime");
    expect(ids).not.toContain("no slash here");
    expect(ids).not.toContain("meta/llama-base");
  });

  it("degrades gracefully on unexpected shapes", () => {
    expect(normalizeResearchModelCatalog(null)).toEqual([]);
    expect(normalizeResearchModelCatalog({})).toEqual([]);
    expect(normalizeResearchModelCatalog({ data: "nope" })).toEqual([]);
  });

  it("summarizes providers without secrets", () => {
    const summary = summarizeCatalog(normalizeResearchModelCatalog(RAW_CATALOG));
    expect(summary.total).toBe(2);
    expect(summary.byProvider).toEqual({ anthropic: 1, openai: 1 });
  });
});

describe("Deep Research envelope with model selection (v1.1)", () => {
  it("omits requestedModelId for the Nexus default", () => {
    const result = buildDeepResearchEnvelope({
      requestText: "why do members churn?",
      researchRequestId: VALID_ID,
      idempotencyKey: VALID_KEY,
      requestedModelId: undefined,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect("requestedModelId" in result.envelope).toBe(false);
    }
  });

  it("includes a validated concrete model id", () => {
    const result = buildDeepResearchEnvelope({
      requestText: "why do members churn?",
      researchRequestId: VALID_ID,
      idempotencyKey: VALID_KEY,
      requestedModelId: "anthropic/claude-sonnet-4.6",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.requestedModelId).toBe("anthropic/claude-sonnet-4.6");
    }
  });

  it("rejects a malformed model id", () => {
    const result = buildDeepResearchEnvelope({
      requestText: "q",
      researchRequestId: VALID_ID,
      idempotencyKey: VALID_KEY,
      requestedModelId: "bad model id",
    });
    expect(result).toEqual({ ok: false, code: "invalid_model_id" });
  });

  it("never carries provider/runtime adjacent fields", () => {
    const result = buildDeepResearchEnvelope({
      requestText: "q",
      researchRequestId: VALID_ID,
      idempotencyKey: VALID_KEY,
      requestedModelId: "openai/gpt-5",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const keys = Object.keys(result.envelope).sort();
      expect(keys).toEqual(
        ["requestText", "requestedModelId", "requestedToolId", "taskKind", "taskMetadata"].sort(),
      );
      for (const forbidden of [
        "provider",
        "baseUrl",
        "apiMode",
        "transport",
        "fallbackModels",
        "modelOptions",
        "temperature",
        "maxTokens",
        "maxTurns",
        "systemPrompt",
      ]) {
        expect(forbidden in result.envelope).toBe(false);
      }
    }
  });

  it("contract version is bumped additively to v1.1", () => {
    expect(DEEP_RESEARCH_CONTRACT_VERSION).toBe(
      "nexus_hermes_deep_research_connector_handoff_v1_1",
    );
  });

  it("syntax gate accepts real ids and rejects dangerous input", () => {
    expect(isValidDeepResearchModelId("anthropic/claude-opus-4.6")).toBe(true);
    expect(isValidDeepResearchModelId("a/b;rm -rf")).toBe(false);
    expect(isValidDeepResearchModelId("http://evil/x")).toBe(false);
    expect(isValidDeepResearchModelId("a/`whoami`")).toBe(false);
  });
});

describe("Deep Research model persistence (localStorage preference)", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("defaults to the Claudia-default sentinel when nothing is stored", () => {
    expect(loadSelectedModelId()).toBe(CLAUDIA_DEFAULT_MODEL_VALUE);
  });

  it("round-trips a concrete valid model and remains until changed", () => {
    saveSelectedModelId("anthropic/claude-sonnet-4.6");
    expect(loadSelectedModelId()).toBe("anthropic/claude-sonnet-4.6");
    // Persists across a fresh read (simulated reload).
    expect(loadSelectedModelId()).toBe("anthropic/claude-sonnet-4.6");
  });

  it("degrades a corrupted stored value to the default", () => {
    localStorage.setItem("nexus.deepResearch.selectedModelId", "corrupted value!!");
    expect(loadSelectedModelId()).toBe(CLAUDIA_DEFAULT_MODEL_VALUE);
  });

  it("maps sentinel to undefined and concrete to the id for the envelope", () => {
    expect(selectedModelToEnvelopeField(CLAUDIA_DEFAULT_MODEL_VALUE)).toBeUndefined();
    expect(selectedModelToEnvelopeField("openai/gpt-5")).toBe("openai/gpt-5");
    expect(selectedModelToEnvelopeField("bad value")).toBeUndefined();
  });
});

describe("ResearchModelSelector component", () => {
  const models: NexusResearchModel[] = normalizeResearchModelCatalog(RAW_CATALOG);

  it("always offers the Nexus default first and lists compatible models", () => {
    render(
      <ResearchModelSelector
        value={CLAUDIA_DEFAULT_MODEL_VALUE}
        onChange={() => {}}
        models={models}
        loading={false}
        error={false}
      />,
    );
    expect(screen.getByRole("option", { name: "Nexus default" })).toBeTruthy();
    expect(screen.getByRole("option", { name: /Claude Sonnet 4.6/ })).toBeTruthy();
    expect(
      screen.queryByText(/Claudia selects and validates the model for each run/i),
    ).not.toBeInTheDocument();
  });

  it("shows a loading state and a catalog-error fallback", () => {
    const { rerender } = render(
      <ResearchModelSelector value={CLAUDIA_DEFAULT_MODEL_VALUE} onChange={() => {}} models={[]} loading error={false} />,
    );
    expect(screen.getByText(/Loading the current model catalog/)).toBeTruthy();
    rerender(
      <ResearchModelSelector value={CLAUDIA_DEFAULT_MODEL_VALUE} onChange={() => {}} models={[]} loading={false} error />,
    );
    expect(screen.getByText(/Live model catalog is unavailable/)).toBeTruthy();
  });

  it("marks a saved-but-unavailable model and reports it", () => {
    render(
      <ResearchModelSelector
        value="acme/removed-model"
        onChange={() => {}}
        models={models}
        loading={false}
        error={false}
      />,
    );
    expect(screen.getByText(/no longer available/)).toBeTruthy();
  });

  it("emits the chosen model id on change (no submission)", () => {
    let chosen = "";
    render(
      <ResearchModelSelector
        value={CLAUDIA_DEFAULT_MODEL_VALUE}
        onChange={(v) => {
          chosen = v;
        }}
        models={models}
        loading={false}
        error={false}
      />,
    );
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "openai/gpt-5" } });
    expect(chosen).toBe("openai/gpt-5");
  });

  it("shows the exact selected model id for reproducibility", () => {
    render(
      <ResearchModelSelector
        value="anthropic/claude-sonnet-4.6"
        onChange={() => {}}
        models={models}
        loading={false}
        error={false}
      />,
    );
    expect(screen.getByText("anthropic/claude-sonnet-4.6")).toBeTruthy();
  });
});
