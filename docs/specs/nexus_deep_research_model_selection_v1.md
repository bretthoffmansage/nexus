# Nexus Deep Research Model Selection v1

Status: implemented (2026-07-02)
Contract: `nexus_hermes_deep_research_connector_handoff_v1_1`
Claudia counterpart: `docs/specs/nexus_hermes_deep_research_connector_handoff_v1_1.md`

## Summary

The Deep Research page's disabled "Managed by Claudia" model field is replaced
with a real searchable model selector. Nexus displays a live, filtered catalog
and sends the chosen model on the task envelope; Claudia independently validates
and applies it. This is the only page with model selection — routed Nexus Chat
and all other tools are unaffected.

## Legacy selector findings (Phase 1)

The old local Claudia UI had a Hermes chat model selector, but that direct
UI→Hermes chat architecture is obsolete under the current Nexus→queue→Connector
→Claudia routing. What remains reusable is Claudia's server-side catalog
infrastructure: `core_api/vercel_model_catalog.py` fetches
`https://ai-gateway.vercel.sh/v1/models`, classifies chat-capable models, and
writes `config/model_options.yaml` (the allowlist Claudia validates against).
The obsolete direct-connection UI was NOT restored; Nexus builds a fresh,
minimal selector over the existing queue handoff.

## Catalog source

- Endpoint: `GET https://ai-gateway.vercel.sh/v1/models`. Verified **public**
  (no auth required for the catalog); if `AI_GATEWAY_API_KEY` is present in the
  Nexus server env it is sent as a bearer token for the account-scoped catalog.
- Response shape: `{ object: "list", data: [ { id, name, type, tags,
  context_window, max_tokens, pricing:{input,output}, owned_by, ... } ] }`.
- Live snapshot 2026-07-02: **298 raw models → 187 compatible.** Types present:
  language(201), image(31), video(26), embedding(24), reranking(5),
  transcription(4), realtime(4), speech(3). Tool-calling is indicated by the
  `tool-use` tag.

## Server-only read path

`app/api/deep-research/models/route.ts` (Next.js route handler) fetches the
catalog server-side, normalizes/filters it, caches for 5 minutes, and returns
the non-secret UI list. It ONLY reads the catalog — never invokes a model,
proxies arbitrary URLs, submits research, calls Claudia, or returns the
credential. The `AI_GATEWAY_API_KEY` (if any) is read only on the server and is
never sent to the browser.

## Compatibility filtering (UI usability only)

`lib/nexus/deepResearchModelCatalog.ts` (pure) keeps a model when: id matches
the bounded `provider/model` syntax; `type` is `language`/`text`/`chat`; and a
`tool-use`/tool-calling tag is present. It excludes image, video, embedding,
reranking, transcription, speech, and realtime. Normalized fields: id, friendly
name, provider, context window, pricing (display only), capability labels.
Claudia re-validates independently, so this filter is convenience, not
authority.

## Selector UI

`components/workspace/port/ResearchModelSelector.tsx`: a search box + select.
First option is always **Claudia default** (sends no model id). Concrete options
come from the catalog, grouped/sorted by provider, showing `provider / name ·
ctx`. Loading and catalog-error states are surfaced; on catalog failure the page
still works with the Claudia default (and any last valid selection). A saved
model missing from the catalog is shown as unavailable and blocks the run until
the operator chooses another — never silently changed.

## Persistence

`lib/nexus/deepResearchSession.ts` stores the selection in browser localStorage
(`nexus.deepResearch.selectedModelId`) — the established Deep Research preference
pattern; no new backend. The stored value is a preference only: every task still
carries `requestedModelId` explicitly. A corrupted stored value degrades to the
default. Changing the model never submits; a page reload never submits.

## Envelope

`convex/lib/deepResearchConfig.ts` `buildDeepResearchEnvelope` accepts an
optional `requestedModelId`, validates its syntax, and includes it only when a
concrete model is chosen (omission = Claudia default). `submitDeepResearch`
(`convex/deepResearch.ts`) stores it on the `nexusTasks` row
(`requestedModelId`, added to `convex/schema.ts`), and `claimNextTask`
(`convex/connectorTasks.ts`) forwards it on the claim payload. Contract version
is `nexus_hermes_deep_research_connector_handoff_v1_1`.

## Scope & safety

- Deep Research only: no other tool/task kind carries a model.
- No direct Nexus→Hermes or new Nexus→Claudia route; the existing queue +
  Connector remain the sole handoff and result path.
- No second queue, worker, daemon, or model-routing service.
- Credential never reaches the browser.
- The dormant research tool stays closed (`research_disabled`) until Stage 3B.

## Manual smoke check

`node scripts/deep-research-model-catalog-smoke.mjs` prints raw/compatible
counts, provider counts, and a sample of ids — no credentials, no model
invocation, no full raw response.

## Remaining Stage 3B activation

Unchanged by this work: set `TAVILY_API_KEY`, flip the research master enable,
restart Claudia. Model selection is fully wired and offline-verified now.
