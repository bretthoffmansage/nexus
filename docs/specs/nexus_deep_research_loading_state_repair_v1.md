# Nexus Deep Research loading state repair (v1)

Package: `nexus_deep_research_loading_state_repair_v1`

## Observed symptom

The `/research` page shell rendered (request form, model field, buttons, panels) but **Current research** and **Recent research** stayed on `Loading research state…` indefinitely when the signed-in user had no Deep Research tasks.

## Root cause

`ResearchWorkspace` treated `detailTask === undefined` as loading:

```tsx
{!ready || detailTask === undefined ? (
  <p>Loading research state…</p>
) : ...}
```

When there is **no task to show**, `detailTaskId` is `null`, so `getMyTask` is invoked with `"skip"`. Skipped Convex `useQuery` calls always return `undefined`, which is indistinguishable from a pending query. With `ready === true` and an empty history, the UI never left the loading branch.

This was **not**:

- a missing Convex function (`listMyDeepResearchTasks` exists in `convex/deepResearch.ts` and generated `api.deepResearch`);
- deployment/API drift in the repository;
- auth readiness never resolving (`readyForPrivateQueries` worked; the list query could succeed).

The list query could return `{ tasks: [] }` while the current panel still appeared to load forever because of the skipped detail query.

## Query invocation findings

| Query | When ready, no tasks | When ready, has tasks |
|-------|----------------------|------------------------|
| `listMyDeepResearchTasks` | Invoked `{ limit: 20 }` | Invoked |
| `getMyTask` | **Skipped** (`detailTaskId` null) | Invoked for selected/active/first task |
| `connectorStatus` | Invoked (informational only) | Invoked |

Connector status does not gate task-history loading.

## Auth readiness behavior

- Canonical gate: `readyForPrivateQueries` from `useNexusAuthReadiness()`.
- While `isLoading` or token refresh (`!ready`), private queries use `"skip"`.
- Signed-out Convex state skips private queries and shows a sign-in message (server redirect still applies for unapproved users).

## Loading / empty / error state model

| State | Current research | Recent research |
|-------|------------------|-----------------|
| Auth initializing | Loading… | Loading history… |
| Signed out | Sign in message | Sign in message |
| List query pending | Loading… | Loading history… |
| List empty | No research is currently running. | No research runs yet. |
| Detail query pending | Loading… | (list rendered) |
| Detail unavailable | Bounded alert | (list rendered) |
| Connector offline | Note only; history still renders | History still renders |

## Repair

`components/workspace/port/ResearchWorkspace.tsx`:

1. Separate `authInitializing`, `tasksLoading`, and `detailTaskLoading`.
2. Show empty current state when `tasksPage` has loaded and `detailTaskId` is null.
3. Only show detail loading when `detailTaskId` is set and `detailTask === undefined`.
4. Show bounded error when `detailTaskId` is set but `detailTask` resolved null.
5. Clear stale stored active task id when history is empty.
6. Update deliberate empty copy per product spec.

## Focused tests

`tests/nexus-deep-research-loading-state.test.tsx` — auth skip/start, signed-out skip, empty resolution, no skipped-detail loading trap, recent tasks, detail error, connector offline history, no submit on load.

## Live browser verification

Focused component tests used in place of authenticated live `/research` (approval-gated). Symptom reproduced and fixed via skipped-query semantics in tests.

## Out of scope

- Convex schema / mutations
- Nexus System
- Direct Hermes/Tavily paths
- Automatic retry
