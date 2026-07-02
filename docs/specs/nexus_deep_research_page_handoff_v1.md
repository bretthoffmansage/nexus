# Nexus Deep Research Page Handoff (v1)

**Package:** `nexus_deep_research_page_handoff_v1`  
**Contract:** `nexus_hermes_deep_research_connector_handoff_v1`

## Architecture

```
Nexus Deep Research page
  → submitDeepResearch (nexusTasks insert)
  → global nexusTasks queue
  → Claudia Connector claim/execute
  → research.hermes_deep_research
  → terminal result path (taskResults / taskSources)
  → Nexus SafeMarkdown + SafeExternalLink rendering
```

Nexus owns request collection, task creation, lifecycle display, and safe terminal-result rendering. Claudia owns research runtime, tools, model selection, prompts, source access, sandboxing, budgets, and final result assembly.

No second queue, worker, callback route, or persisted research state machine is introduced.

## Canonical envelope

```json
{
  "requestedToolId": "research.hermes_deep_research",
  "taskKind": "deep_research",
  "requestText": "<trimmed non-empty plain text>",
  "taskMetadata": {
    "kind": "deep_research",
    "sourcePage": "nexus_deep_research",
    "explicitUserAction": "research",
    "researchRequestId": "<stable request id>",
    "idempotencyKey": "<stable execution key>"
  }
}
```

- **Maximum request length:** 8000 characters
- **Identifier pattern:** `^[A-Za-z0-9_.:-]{8,128}$` for both `researchRequestId` and `idempotencyKey`
- **Forbidden in task payload:** model, provider, prompts, tools, max rounds, paths, attachments, conversationId, requestMessageId, runtime configuration

## Identifier behavior

| Field | Stability |
|-------|-----------|
| `researchRequestId` | Stable across reload/reconnect for the same user-created request; rotates on intentional **New request** |
| `idempotencyKey` | Stable for the same execution intent; rotates on **Start new run** or new request session |

Server idempotency uses `by_owner_and_idempotency_key` — refresh/reconnect does not create duplicate tasks.

## Page design

- Centered layout (`--nexus-calendar-content-max`)
- Multiline **Research request** textarea with live character count
- Disabled read-only **Model** field (`Managed by Claudia`) — not sent in task
- **Max rounds** removed
- **Research** submit button (explicit action only)
- Current research lifecycle + recent task history from `listMyDeepResearchTasks`
- No legacy Connector-required banner; bounded availability note when Connector is offline/unconfigured

## Lifecycle mapping

| UI state | Derived from |
|----------|----------------|
| Draft | No selected task |
| Queued | `status === queued` |
| Preparing | `status === claimed` |
| Running | `status === running` or `cancel_requested` |
| Blocked | `status === failed` + blocked error code |
| Failed | `status === failed` (other codes) |
| Completed | `status === completed` |
| Cancelled | `status === cancelled` |

## Blocked states

Non-retryable blocked codes (no automatic resubmit):

- `research_disabled`
- `research_web_provider_unconfigured`
- `unsupported_tool`
- `task_contract_invalid`

Display Claudia `errorMessage` when present; otherwise: `Deep Research is currently unavailable.`

## Result rendering

- Primary report: `answerText` via `SafeMarkdown` when `format === markdown`
- Optional: `model`, `durationMs`
- Sources: defensive rendering; web `locator` linked only for safe `http`/`https` URLs (`SafeExternalLink`)
- Internal sources: title/type/excerpt/provenance without inferred filesystem paths

## Skills exposure

- Tool ID: `research.hermes_deep_research`
- Surfaces: **Deep Research**, **Connector**
- Excluded from Chat routing (`P5_SUPPORTED_TOOL_IDS`) and Calendar tool selector (`CALENDAR_SCHEDULED_TOOLS`)

## Connector capability

- Registered in `KNOWN_CONNECTOR_TOOL_IDS` and execution safety metadata
- Not on `DEFAULT_CONNECTOR_TOOL_IDS` — Connector must explicitly advertise the tool
- Live Connector allowlist is not mutated by Nexus

## Dormant smoke expectation

With Claudia research master enable **false** and Connector advertising the tool:

1. Nexus submits valid task → one `nexusTasks` row with exact envelope
2. Connector claims → Claudia validates → `research_disabled`
3. Nexus renders blocked state; no automatic retry or second task

## Focused tests

`tests/nexus-deep-research-handoff.test.ts` — envelope, identifiers, submission, UI, lifecycle, blocked results, architecture guards.

## Claudia activation dependencies

Before live production research:

1. Connector advertises `research.hermes_deep_research`
2. Claudia governed tool enabled (master enable)
3. Tavily credentials configured and verified
4. Operator enables production execution on Claudia side

## Rollback

Revert Deep Research page, `convex/deepResearch.ts`, schema `deep_research` kind, Skills/sidebar metadata, and spec. Existing `nexusTasks` rows with `taskKind: deep_research` remain readable but the page can be disabled by restoring sidebar `connector_required` if needed.
