# Nexus Deep Research — source provenance rendering audit (v1)

Package: `cross_repo_deep_research_internal_source_truth_and_wait_behavior_audit_v1`

## Context

A completed Deep Research report claimed both internal sources were unavailable
while five Membership.io transcript sources rendered beneath it. The root cause
and primary repair are Claudia-side (see the Claudia spec:
`claudia_deep_research_internal_source_truth_and_wait_behavior_v1`). This spec
records the Nexus-side audit and the two minimal presentation/robustness changes.

## Source rendering audit — findings

- **Task-scoped, not stale.** `nexusTaskSources` rows carry `taskId: v.id("nexusTasks")`
  and are queried via `by_task` (`convex/taskSources.ts` `listMyTaskSources`,
  scoped to the detail task id in `ResearchWorkspace.tsx`). Sources cannot leak
  across tasks, and stale sources from another run cannot attach.
- **Faithful, not rewritten.** The completion callback (`connectorTasks.ts`
  `completeTask`) stores `args.answerText` verbatim as the canonical result and
  `args.sources` as task sources. The UI renders `detailResult.answerText`
  (the report, verbatim) and the task's own `detailSources`. Nexus does **not**
  rewrite or infer source-availability claims.
- **Genuine provenance.** The five Membership sources originated from Claudia's
  `TrustedToolResult.sources` (real `membership_io.transcript_retrieve` output),
  forwarded through `completeTask`. Not Nexus enrichment or fabrication.
- **The only issue: ambiguous label.** The block was titled simply "Sources",
  which can imply every listed source supported the report. In the incident the
  report prose denied internal evidence while five internal sources were listed —
  the label implied a usage the report did not claim.

## Report-rules composition audit — findings

The observed run (submitted 15:19:48) predates the retry/history feature
(`fad2d41`, 15:48) and the progress-visibility change (`04f436d`, 15:53). In the
current tree, `RULES FOR REPORT:` is composed **exactly once** on every path:

- Direct submit: the client composes once; `submitDeepResearch` +
  `buildDeepResearchEnvelope` do **not** re-append rules.
- Retry ("Try again"): `startStandaloneRun` submits the stored, already-composed
  `requestText` unchanged — no recomposition.
- Calendar: `scheduledEvents` stores the **raw** `taskRequest` + separate
  `deepResearchReportRules`; `scheduledEventDispatch` composes once at dispatch.

No live double-composition path exists. The duplication the operator observed was
either historical (a since-removed path) or user-entered rules text. As
defense-in-depth against any future caller passing already-composed text, compose
was made **idempotent**.

## Changes

1. **Idempotent composition** — `convex/lib/deepResearchRequestCompose.ts`:
   added `DEEP_RESEARCH_RULES_MARKER`; `composeDeepResearchRequestText` now
   returns the request unchanged when it already contains a composed rules block.
   Guarantees `RULES FOR REPORT:` appears exactly once across direct, retry, and
   Calendar paths, even if a caller passes already-composed text.
2. **Source-list label** — `components/workspace/port/ResearchWorkspace.tsx`:
   heading "Sources" → "Sources retrieved this run", with a one-line note that
   not every source is necessarily cited. This states the block's meaning
   explicitly (retrieved during the run) so the UI no longer implies evidence
   usage the report did not consume.

No metadata/contract changes; no new Convex fields; no Nexus-to-tool calls.

## Focused tests

Extended `tests/nexus-deep-research-report-rules.test.tsx` (24 tests total):
- Idempotency: exactly one RULES block for a raw request; re-composing an
  already-composed request (retry/direct/Calendar re-dispatch) does not
  duplicate, even with different rules text.
- Provenance rendering: task-source scoping asserted from `schema.ts` +
  `taskSources.ts`; the Sources block label asserts "retrieved / not necessarily
  cited".

Two unrelated failures in `nexus-calendar-*` (tool-registry `availability`)
reproduce at `HEAD` without these changes and are out of scope.

## Remaining limitations

- The authoritative source-availability truth is enforced Claudia-side (report
  prose + provenance). Nexus renders that faithfully; it intentionally does not
  independently police availability.
