# Nexus P4.4 — Legacy Workspace Frontend Port (v1)

**Package:** P4.4 — Port legacy Claudia Console workspace into Nexus
**Status:** Complete
**Date:** 2026-06-30

## Nexus Chat preservation

- Route `/` unchanged; default post-login destination.
- `NexusChatWorkspace` extracted from prior `ChatWorkspace`; same welcome card, answer/sources regions, composer, diagnostics, mode toggle.
- Legacy Claudia Chat (`chat.js`) **not** substituted.
- Chat request history (`TaskHistorySection`) remains in sidebar **only on `/`**.

## What was ported

Rich tool navigation restored via `lib/navigation/toolRegistry.ts` and `ToolNavigation` in the sidebar.

React ports of legacy interfaces (layouts, toolbars, split panes, empty states) for:

- Calendar, Notes, Documents, Email, Research, Memory, Gallery, Tasks
- Settings, Status, Operations (deferred shell), Cookbook, Skills
- Admin integrated with existing `AccessAdminPanel`

See inventory: `docs/specs/nexus_p4_4_legacy_frontend_port_inventory_v1.md`

## Backend coupling removed

- No `fetch('/api/...')` in ported workspace components.
- Typed adapters under `lib/adapters/*` return truthful `connector_required` / `local_only` / `deferred` states.
- No fake records rendered.

## Routes added

`/calendar`, `/notes`, `/documents`, `/email`, `/research`, `/memory`, `/gallery`, `/tasks`, `/knowledge`, `/skills`, `/settings`, `/status`, `/operations`

All protected by `requireWorkspaceAccess()` except public auth routes unchanged.

## Availability states

Shared `ToolAvailabilityBanner` — `available`, `partially_available`, `setup_required`, `connector_required`, `local_only`, `deferred`.

## Visual fidelity

`styles/legacy-port.css` ports cal-*, notes-*, doclib-*, email-*, research-*, memory-*, gallery-*, tasks-*, settings-* layout patterns from legacy CSS/JS structure. Nexus design tokens applied.

## Tests

`tests/nexus-p4-4-legacy-workspace-port.test.ts` — Chat preservation, registry, routes, adapters, no legacy API calls.

## Validation

| Command | Result |
|---------|--------|
| `npx convex codegen` | PASS |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS |
| `npm run build` | PASS |
| `./scripts/verify-nexus-boundary.sh` | PASS |

## Remaining before P5

Per-tool Connector-backed data loading, Convex task persistence (P5), governed operations terminal (D7).

## Exact next step

**P5 — Nexus task persistence** (`nexusTasks` schema + composer enablement).

**P5 was not started.**
