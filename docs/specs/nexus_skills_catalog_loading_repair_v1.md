# Nexus Skills Catalog Loading Repair v1

**Package:** `nexus_skills_catalog_loading_repair_v1`  
**Repository:** `/Users/bretthoffman/Documents/claudia_console`  
**Branch at start:** `main`  
**Starting HEAD:** `da96ec2`

## Observed symptom

The Skills page rendered its shell (title, subtitle, explanatory copy) but remained indefinitely on:

> Loading catalog…

No grouped tool cards appeared.

## Root cause

`SkillsWorkspace` destructured `{ ready }` from `useNexusAuthReadiness()`, but that hook exposes `readyForPrivateQueries` — not `ready`.

Because `ready` was always `undefined` (falsy):

1. `useQuery(nexusSkills.listCatalog, ready ? {} : "skip")` permanently passed `"skip"`.
2. The UI condition `!ready || catalog === undefined` was always true.
3. The page never left the loading state even after Convex auth succeeded.

During token refresh, Convex can report `isAuthenticated: true` with `isLoading: false` while `isRefreshing: true`. Queries issued in that window receive the backend's correct `unauthenticated` rejection.

`readyForPrivateQueries` now requires `!isRefreshing` in addition to `!isLoading && isAuthenticated`.

The Skills page also defers mounting `SkillsCatalogContent` (which calls `useQuery`) until `readyForPrivateQueries` is true, so the private query is not subscribed during initialization, sign-out, or refresh.

## Query / auth / deployment findings

| Check | Result |
|-------|--------|
| `api.skillsCatalog.listSkillsCatalog` in generated API | Present (`convex/_generated/api.d.ts`) |
| Convex dev deployment (`doting-raven-338`) | Function exists; unauthenticated CLI call returns `unauthenticated` (not “function not found”) |
| Query skipped permanently | **Yes** — wrong readiness field |
| Query throws | No — query never ran |
| Connector required to return catalog | No — server query returns all tools with `connector_required` when no Connector row exists |

## Architecture after repair

Three independent concepts:

1. **Catalog definition** — canonical static tool metadata from `SKILLS_CATALOG_TOOL_DEFS` / `buildSkillsCatalogSections`.
2. **Live availability** — enriched by `listSkillsCatalog` from Connector heartbeat, allowlist, and calendar capability checks.
3. **Page state** — loading only while Convex auth is not `readyForPrivateQueries`; static catalog renders immediately once auth is ready while live availability is still pending.

### Static catalog behavior

Once `readyForPrivateQueries` is true, the page renders known tools from `buildSkillsCatalogSections` with conservative fallback availability (`connector_required`) even before the Convex query resolves.

### Connector availability behavior

When the live query resolves, per-tool `currentAvailability` and `availabilityLabel` replace the interim **Checking availability…** badge.

### Loading behavior

- **Loading catalog…** — only while Convex auth is loading or not yet authenticated.
- Does not wait on Connector state or live availability.

### Error behavior

Query failures surface through the normal Convex/React error boundary. The static catalog is shown while the query is pending, not on hard failure.

### No-Connector behavior

`listSkillsCatalog` returns all four canonical tools with `connector_required` labels. The UI renders the full grouped catalog.

## Repair

1. Use `readyForPrivateQueries` for query gating (same pattern as `DocumentsWorkspace`, `CalendarWorkspace`, `MyTasksPanel`).
2. Render static catalog sections immediately once auth is ready; show **Checking availability…** per tool until live data arrives.
3. Keep read-only surface — no execution controls added.

## Focused tests

| Test file | Coverage |
|-----------|----------|
| `tests/nexus-skills-catalog-loading.test.tsx` | Auth skip/run, static render while query pending, live label swap, no infinite loading |
| `tests/nexus-skills-catalog.test.ts` | No-Connector Convex query, `readyForPrivateQueries` source assertion, sidebar/navigation unchanged |

## Dev deployment status

- **Convex dev:** `doting-raven-338` — `skillsCatalog:listSkillsCatalog` deployed and reachable.
- **Next dev:** `localhost:3000` running; `/skills` redirects to sign-in when unauthenticated (expected).

## Live verification

Component tests prove the repaired readiness gating and static-first rendering. Full signed-in browser verification requires an approved operator session.
