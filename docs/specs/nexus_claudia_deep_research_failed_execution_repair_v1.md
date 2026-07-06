# Nexus — Claudia Deep Research Failed-Execution Repair v1

Package: `cross_repo_deep_research_failed_execution_repair_v1`
Status: **Nexus side verified correct — no Nexus code change required.** Root
cause and repair are entirely Claudia-side.

## Purpose

Document the Nexus/Convex portion of the cross-repo investigation into the failed
Deep Research request and record that the transport, persistence, and rendering
layers behaved correctly.

## Failed task identity

| Field | Value |
| --- | --- |
| Nexus task id | `kd733nct6x5aw45xz9qrk6jd4h8a0wqy` |
| Requested tool id | `research.hermes_deep_research` |
| Task kind | `deep_research` |
| Claimed connector | `claudia-primary` |
| Convex deployment | `doting-raven-338` |
| Stored failure code | `research_tool_policy_invalid` |
| Stored safe message | `Research tool policy validation failed.` |

## What Nexus did — all correct

1. **Submission / envelope.** `convex/deepResearch.ts` (`submitDeepResearch`) built
   the canonical envelope via `convex/lib/deepResearchConfig.ts`:
   `requestedToolId: "research.hermes_deep_research"`, `taskKind: "deep_research"`,
   `requestText`, optional `requestedModelId`, and the exact five-key
   `taskMetadata` (`kind`, `sourcePage`, `explicitUserAction`,
   `researchRequestId`, `idempotencyKey`). One task inserted; idempotency index
   enforced. No forbidden/UI-only fields, no model/provider leakage.

2. **Claim / lease protocol.** `convex/http.ts` claim endpoint returned
   `{ ok: true, protocolVersion: "v1", data: { status: "claimed", task: {…} } }`
   with fields preserved. Start + lease heartbeat behaved normally (lease renewed
   ~13× during execution).

3. **Terminal failure persistence.** `convex/connectorTasks.ts` (`failTask`)
   stored the connector-supplied `errorCode` and `userSafeMessage` verbatim on the
   `nexusTasks` row (`errorMessage` clamped to 2000 chars). **No transformation,
   no message loss.**

4. **Rendering.** `components/workspace/port/ResearchWorkspace.tsx` +
   `lib/nexus/deepResearchView.ts` surface `detailTask.errorMessage` exactly in the
   failed/blocked panel. The compact history row shows the status label
   ("Failed"); the detail panel shows the real safe message.

## Deployment alignment

Only `doting-raven-338` is configured (dev `.convex.cloud` UI + `.convex.site`
HTTP actions); no separate production Convex deployment is wired in this repo. The
connector polls `doting-raven-338.convex.site` and **successfully claimed** the
task, proving the UI and connector operate on the same deployment. No dev/prod
task-routing mismatch was involved in this failure.

## First failing boundary (Claudia)

The request reached the connector, was claimed and fetched, accepted by Claudia
ingress, and Hermes ran to completion. It then failed inside the Claudia research
runtime's post-run tool-policy guard, which misread `hermes tools list` toolset
registration (`browser` enabled) as an unapproved callable tool. See the Claudia
spec: `docs/specs/claudia_nexus_deep_research_failed_execution_repair_v1.md`
(claudia_system repo).

## Error-propagation conclusion (Phase 5)

The safe failure code/message is **not** discarded anywhere in the Nexus pipeline.
It flows connector → `failTask` → `nexusTasks.errorCode/errorMessage` → query →
detail panel intact. No Nexus projection/rendering repair is required.

## Focused tests (existing, still valid)

- `tests/nexus-deep-research-handoff.test.tsx` — envelope/metadata contract.
- `tests/nexus-p6-claim-lease.test.ts` — claim/lease/start/complete/fail.
- `tests/nexus-p6-ui.test.tsx` — lifecycle rendering.

No new Nexus tests added because no Nexus behavior changed.

## Rollback

No Nexus code change; nothing to roll back on this side.

## Remaining items

- Live end-to-end re-run pending operator approval (paid providers) and a
  connector restart to load the Claudia fix.
