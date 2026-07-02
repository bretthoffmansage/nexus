# Nexus Deep Research report rules and model UI cleanup (v1)

Package: `nexus_deep_research_report_rules_and_model_ui_cleanup_v1`

## Report rules purpose

Operators can add plain-text guidance that is folded into the governed `requestText` before queueing. Rules are not a separate Claudia field or metadata key.

## Default text

On a new request:

`Do not include any sensitive SAGE company information, sensitive client information, or employee names in the final report`

Loaded from `DEFAULT_DEEP_RESEARCH_REPORT_RULES` in `lib/nexus/deepResearchRequestCompose.ts`. Persisted draft in `localStorage` (`nexus.deepResearch.reportRulesDraft`). **New request** resets via `resetReportRulesDraft()`.

## Composition format

When rules are non-empty after trim:

```
<trimmed research request>
-------
RULES FOR REPORT:
<trimmed report rules>
```

Implemented in `composeDeepResearchRequestText()`.

## Blank rules

Omit divider, heading, and extra newlines — submit only the trimmed research request.

## 8000-character validation

`validateComposedDeepResearchRequest()` validates the **full composed** payload. UI character count shows submitted (composed) size against 8000, with request-field count as secondary info.

## Draft / reset behavior

- Editing rules saves draft locally; rerenders and reloads preserve edits.
- **New request** clears primary request and resets rules to default.
- Rules/report edits do not rotate idempotency keys or create tasks.

## Unchanged metadata contract

Envelope remains:

```json
{
  "requestedToolId": "research.hermes_deep_research",
  "taskKind": "deep_research",
  "requestText": "<composed>",
  "taskMetadata": {
    "kind": "deep_research",
    "sourcePage": "nexus_deep_research",
    "explicitUserAction": "research",
    "researchRequestId": "...",
    "idempotencyKey": "..."
  }
}
```

Exactly five metadata keys. No `reportRules`, `rules`, `model`, or `provider` in metadata.

## Model control layout repair

**Root cause:** native `<select>` intrinsic width from long `<option>` labels expanded the grid column (`research-panel-layout` child without `min-width: 0`).

**Repair:** `min-width: 0` on `.research-settings` / `.research-form`; `width/max-width: 100%` and `box-sizing: border-box` on `.research-model-field`, `.research-model-search`, `.research-model-selector`; ellipsis on select text.

## Model authority boundary

`ResearchModelSelector` remains a searchable UI preference. **No `requestedModelId` is sent** from `ResearchWorkspace` — Claudia owns model selection. Server mutation still accepts optional model for backward compatibility, but Nexus UI omits it per governed contract.

## Focused tests

- `tests/nexus-deep-research-report-rules.test.tsx` — rules, composition, validation, layout, no model in submit
- `tests/nexus-deep-research-model-submit.test.tsx` — no model on submit, composed text, no load submit

## Live verification

Component tests used in place of authenticated `/research` browser session. No live Claudia/Hermes/Tavily submission.
