# Nexus Deep Research duplicate Report rules repair (v1)

Package: `nexus_deep_research_duplicate_report_rules_repair_v1`

## Observed behavior

Submitted Deep Research `requestText` sometimes ended with two identical canonical blocks:

```
-------
RULES FOR REPORT:
Do not include any sensitive SAGE company information…
-------
RULES FOR REPORT:
Do not include any sensitive SAGE company information…
```

The Request preview/modal showed the stored payload verbatim — this was not a display-only concatenation bug.

## Root cause

Tracing every composition path:

| Path | Compose calls | Stored field |
|------|---------------|--------------|
| Direct **Research** button | Client `validateComposedDeepResearchRequest` → `composeDeepResearchRequestText` once; `submitDeepResearch` stores `requestText` as-is | `nexusTasks.requestText` |
| **Try again** | None — submits failed task's canonical `requestText` unchanged | new task `requestText` |
| **Calendar** create/update | Validation only (no compose); stores raw `taskRequest` + `deepResearchReportRules` | `nexusScheduledEvents` |
| **Calendar** dispatch | `composeDeepResearchRequestText(taskRequest, deepResearchReportRules)` once | `nexusTasks.requestText` |
| Request preview/modal | None — reads `detailTask.requestText` only | display only |

No server-side second append exists on direct submit. Retry never recomposes. Calendar never composes at event creation.

**Duplication was introduced when already-composed text was passed back into `composeDeepResearchRequestText` with non-empty report rules**, most commonly:

1. **Copy/paste resubmit** — operator copies a prior task's composed request (including the rules block) into the left-side Research request field while Report rules still holds the default text, then clicks **Research**.
2. **CRLF mismatch** — pasted or imported text used `\r\n` line endings. The prior idempotency guard looked for the LF-only marker `-------\nRULES FOR REPORT:` via `includes()`, failed to recognize the existing block, and appended a second LF-normalized block.

The first idempotency guard (commit `99e11bf`) used substring `includes()` anywhere in the body, which also incorrectly suppressed rule append when an incidental `RULES FOR REPORT:` phrase appeared mid-body.

## Authority model

| Layer | Fields | Responsibility |
|-------|--------|----------------|
| Draft UI | `researchRequest`, `reportRules` (left form / Calendar dialog) | Raw operator input only |
| Validation | `validateComposedDeepResearchRequest(raw, rules)` | Preview length + compose for submit eligibility |
| Canonical submit | `requestText` on `nexusTasks` | Final governed payload sent to Claudia |
| Calendar storage | `taskRequest`, `deepResearchReportRules` on scheduled events | Raw fields until dispatch |

**Contract:** only `composeDeepResearchRequestText` turns raw fields into canonical `requestText`. Callers that already hold canonical text (retry, or dispatch when `taskRequest` is accidentally pre-composed) must rely on compose idempotency or pass the text through without raw rules.

## Repair

`convex/lib/deepResearchRequestCompose.ts`:

1. **`normalizeDeepResearchRequestLineEndings`** — fold `\r\n` / `\r` to `\n` before compose and idempotency checks.
2. **`hasCanonicalTrailingReportRulesBlock`** — detect only the governed trailing structure `\n-------\nRULES FOR REPORT:\n…` at end of string.
3. **`composeDeepResearchRequestText`** — if a canonical trailing block is present, return normalized request unchanged; otherwise append exactly one block.

No changes to `submitDeepResearch`, retry wiring, Calendar mutations, display components, Convex schema, or Claudia contracts.

## Path behavior after repair

### Direct submission

- Reads raw research request + raw report rules.
- Composes once client-side; mutation receives final `requestText`.
- Draft fields are not mutated.
- Exactly one rules block for new tasks.

### Retry

- Submits failed task's stored `requestText` verbatim via `startStandaloneRun(failedRequestText)`.
- Does not call compose; does not append rules.
- New `researchRequestId` + `idempotencyKey`; failed task immutable.

### Calendar

- Create/update stores raw `taskRequest` + optional `deepResearchReportRules`.
- Dispatch composes once; 8000-char limit enforced on composed payload at validation/dispatch.
- Five-key metadata unchanged.

### Display

- Request panel and modal render `detailTask.requestText` only — never concatenate with draft `reportRules`.
- Historical tasks that already contain duplicated blocks are shown exactly as stored; no migration.

## Idempotency semantics

- **Trailing canonical block present** → no second append (covers retry, Calendar re-dispatch, copy/paste resubmit, CRLF input).
- **Incidental `RULES FOR REPORT:` in body** → preserved; canonical block still appended at end when rules are non-empty.
- **Historical double blocks** → compose returns text unchanged (trailing block detected); stored duplicates are not rewritten.

## Length validation

`validateComposedDeepResearchRequest` validates the **once-composed** payload against `DEEP_RESEARCH_MAX_REQUEST_LENGTH` (8000). Calendar scheduling uses the same helper server-side before insert.

## Focused tests

| File | Coverage |
|------|----------|
| `tests/nexus-deep-research-report-rules.test.tsx` | Composition, CRLF idempotency, incidental body phrase, historical duplicate unchanged |
| `tests/nexus-deep-research-retry-and-history.test.tsx` | Try again preserves canonical text with one rules heading |
| `tests/nexus-calendar-deep-research.test.ts` | Raw storage at create; dispatch emits one rules block |
| `tests/nexus-deep-research-request-panel.test.tsx` | Historical duplicated request displayed as stored |

## Live smoke plan

1. Submit a fresh Deep Research run with default report rules — Request modal shows one `RULES FOR REPORT:` block.
2. Copy the full composed request into the left Research request field (leave Report rules populated) — resubmit creates a new task with still one block.
3. Fail a run and **Try again** — new task request matches failed task exactly.
4. Schedule Calendar Deep Research — inspect dispatched task `requestText` for a single rules block.

## Remaining limitations

- Tasks created before this repair may still store duplicated rules; Nexus displays them faithfully.
- Compose idempotency keys off the canonical trailing structure only — arbitrary user text that exactly mimics that suffix without intent is treated as already composed.
- No automatic backfill/migration of historical `nexusTasks.requestText` rows.
