# Nexus P5.1 — Convex Authentication Readiness Guard (v1)

**Package:** P5.1 — Focused repair of an authentication-readiness race in P5 private queries
**Status:** Complete
**Date:** 2026-07-01
**Related:** `docs/specs/nexus_p5_private_conversations_tasks_shared_queue_v1.md`,
`docs/specs/nexus_p5_data_privacy_and_queue_contract_v1.md`

## 1. Root cause

On initial page load, `components/history/TaskHistorySection.tsx` called

```ts
useQuery(nexusChat.listMyConversations, { limit: 30 });
```

unconditionally, as soon as `session.canSubmit` was true. `canSubmit` is derived
server-side (`app/page.tsx` → `getNexusAccess()`) from the Clerk session at
request time — it is available the instant the client hydrates. The Convex
WebSocket client, however, needs a separate round trip to exchange and confirm
the Clerk session token before `ctx.auth.getUserIdentity()` resolves inside a
Convex function. In the gap between "Clerk says signed in" and "Convex has
confirmed the token," the query ran unauthenticated and the (correctly
strict) backend rejected it:

```
[CONVEX Q(conversations:listMyConversations)] Server Error
ConvexError: {"code":"unauthenticated","message":"Authentication required"}
```

This was reproduced live and captured in this repository's own dev server log
(`.next/dev/logs/next-development.log`) during this takeover, with the exact
reported error and a stack trace terminating at
`TaskHistorySection.tsx:39 — useQuery(nexusChat.listMyConversations, { limit: 30 })`,
confirming both the call site and the mechanism (an authentication-readiness
race, not a backend defect).

The Convex backend's rejection was correct behavior and was not changed.

## 2. Affected query/mutation sites

Audited every P5 `useQuery`/`useMutation` call site in the hosted app:

| Component | Query/mutation | Previously gated on |
|---|---|---|
| `TaskHistorySection.tsx` | `listMyConversations` | `canSubmit` only |
| `NexusChatWorkspace.tsx` | `getConversationTranscript` | `activeConversationId` only |
| `NexusChatWorkspace.tsx` | `getMyTaskResult` | `latestTask` only |
| `NexusChatWorkspace.tsx` | `listMyTaskSources` | `latestTask` only |
| `NexusChatWorkspace.tsx` | `submitRequest` (mutation) | `canSubmit` only |
| `MyTasksPanel.tsx` (`TaskDetail`) | `getMyTask`, `listMyTaskProgress`, `getMyTaskResult`, `listMyTaskSources` | nothing |
| `MyTasksPanel.tsx` (`TaskDetail`) | `cancelTask`, `retryTask` (mutations) | task status only |
| `MyTasksPanel.tsx` | `myTaskCounts`, `listMyTasks`, `listMyTasksByStatus` | view selection only |

None of these previously checked Convex's own confirmed-auth state. All are
now gated on it.

Non-P5 queries (`ConvexConnectivityBadge`'s `appMeta.get`, `AccessAdminPanel`'s
admin queries) are out of scope — they are not P5 owner-scoped private data
and were not part of this repair.

## 3. Provider verification (Part F)

Inspected `components/providers/ConvexClientProvider.tsx` and
`AppProviders.tsx`:

- `ConvexProviderWithClerk` correctly receives Clerk's `useAuth` from
  `@clerk/nextjs`.
- `AppProviders` (mounted once, in `app/layout.tsx`) wraps every route,
  including `/` (Nexus Chat) and `/tasks`. No duplicate Convex client or
  provider exists — the client is memoized on `convexUrl`.
- The local app uses `NEXT_PUBLIC_CONVEX_URL` from `.env.local`, confirmed
  present via `./scripts/check-nexus-env.sh`.
- No legacy `template: "convex"` regression: the client provider uses
  `ConvexProviderWithClerk`'s native integration (no `template` argument). A
  server-only helper (`lib/auth/clerkConvexToken.ts`, used by API routes, not
  the client provider) still supports the legacy `template: "convex"` path as
  a fallback for accounts without native session-token audience — this is
  pre-existing, unrelated to the client provider, and out of scope.

Conclusion: the race was a frontend query-timing issue, not a provider wiring
defect. No provider changes were made.

## 4. Authentication readiness implementation

New: `lib/nexus/useNexusAuthReadiness.ts` — a thin wrapper around Convex's own
`useConvexAuth()`:

```ts
export function useNexusAuthReadiness(): NexusAuthReadiness {
  const { isLoading, isAuthenticated } = useConvexAuth();
  return {
    isLoading,
    isAuthenticated,
    readyForPrivateQueries: !isLoading && isAuthenticated,
  };
}
```

Convex remains the sole authentication authority — this hook introduces no
second source of truth, it only names the existing Convex signal so every P5
component checks the same thing the same way.

`components/chat/ChatSessionContext.tsx` now calls this hook once and exposes
`authLoading` / `readyForPrivateQueries` on the shared chat session context
(consumed by `TaskHistorySection` and `NexusChatWorkspace`, both of which sit
under `ChatSessionProvider`). `MyTasksPanel.tsx` (on `/tasks`, which has no
`ChatSessionProvider`) calls the hook directly.

## 5. Skip behavior

Every private query now uses Convex's `"skip"` sentinel, gated on
`readyForPrivateQueries` (in addition to whatever domain condition already
applied, e.g. `activeConversationId`, `latestTask`, `view`):

```ts
useQuery(nexusChat.listMyConversations, ready ? { limit: 30 } : "skip");
useQuery(
  nexusChat.getConversationTranscript,
  activeConversationId && ready ? { conversationId: activeConversationId } : "skip",
);
```

Because Convex's `useQuery` returns `undefined` both while loading **and**
while skipped, existing "loading" branches in `MyTasksPanel` needed no
separate readiness-specific state — they already read as "loading" for the
whole not-ready window. `TaskHistorySection` gained one explicit branch
("Loading history…") so a not-ready account is never presented identically to
an authenticated account with zero history.

## 6. Mutation guards

- `NexusChatWorkspace.handleSubmit` now checks `canSubmit && ready` before
  calling `submitRequest`; the composer's `disabled` prop is
  `!canSubmit || !ready`, so the control is inert (not just the handler
  short-circuiting) while auth initializes.
- `MyTasksPanel`'s `TaskDetail` computes `canCancel`/`canRetry` as
  `ready && <status check>`; combined with `getMyTask` being skipped (so
  `task` is `undefined`) while not ready, the Cancel/Retry buttons do not
  render at all until both the task is loaded and auth is ready.

Backend authorization (`convex/lib/ownership.ts`, `convex/lib/auth.ts`) is
unchanged and remains the final authority; these are lifecycle/UX guards only.

## 7. Loading UI

- `TaskHistorySection`: "Loading history…" while not ready, distinct from
  "Loading your requests…" (query in flight, already ready) and "No requests
  yet…" (query resolved, truly empty).
- `NexusChatWorkspace` composer: help text is `DISABLED_HELP` (not
  authorized), `INITIALIZING_HELP` ("Connecting to Nexus…", authorized but
  not yet ready), or `ENABLED_HELP` (ready) — three distinct, truthful states
  instead of two.
- `MyTasksPanel`: existing "Loading your tasks…" text now also covers the
  readiness gap (see §5); `TaskDetail` shows "Loading task…" whenever not
  ready or the task query hasn't resolved.

No raw Convex stack trace or internal file path is ever rendered in the
product UI in any of these states.

## 8. Sign-out / account-switch handling

`ChatSessionProvider` and `MyTasksPanel` each track the previous
`isAuthenticated` value with a ref and clear their selection state
(`activeConversationId`, `selectedTaskId`) the moment `isAuthenticated`
transitions from `true` to `false`. This guarantees:

- Signing out immediately stops all P5 private queries (they fall back to
  `"skip"` as soon as Convex reports `isAuthenticated: false`).
- A previously selected conversation/task is cleared on that same transition,
  so a newly signed-in account can never — even momentarily — render another
  account's selected private data.
- No private conversation/task record is ever written to `localStorage`;
  selection state is in-memory React state only and is naturally destroyed on
  full reload.

## 9. Tests

New: `tests/nexus-p5-1-auth-readiness.test.tsx` (14 tests) — drives realistic
`useConvexAuth()` transitions (loading → unauthenticated → authenticated →
sign-out → re-sign-in) through a controlled mock and asserts on actual
`useQuery`/`useMutation` call arguments (`"skip"` vs real args), not source
strings. Covers: skip-while-loading, skip-while-unauthenticated, runs-once-
ready, truthful loading copy (no false "No requests yet"), private task
queries skipped pre-readiness, selected-conversation queries skipped pre-
readiness, result/source/progress queries skipped once readiness is lost
mid-session, composer/mutation guards, sign-out stopping queries, and
selection clearing across an account switch.

Updated: `tests/nexus-p5-ui.test.tsx`'s `convex/react` mock now includes
`useConvexAuth` (defaulting to ready), since `ChatSessionContext` calls it
transitively — this keeps the pre-existing UI assertions unchanged.

## 10. Request persistence vs. Connector-gating (product clarification)

Unchanged by this repair. As before P5.1: the composer, once
`readyForPrivateQueries` is true and the account is an approved
`knowledge_reader`, **persists the request as a real, queued P5 task** —
`submitKnowledgeRequest` creates the conversation/message/task rows and
allocates a global queue sequence. It is not blocked pending Connector
availability. What is blocked is **execution**: the UI always shows the
truthful "Requests are saved and queued. Execution waits for the Nexus
Connector (not configured yet)" copy, and no task transitions past `queued`
in P5. This package did not change that behavior.

## 11. Validation results

| Check | Result |
|-------|--------|
| `npx convex codegen` | Pass — connected to the linked deployment; no generated-file changes (frontend-only repair). |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm test` | Pass — 178 tests, 21 files (164 pre-existing + 14 new P5.1) |
| `npm run build` | Pass — all routes build |
| `./scripts/verify-nexus-boundary.sh` | Pass |
| `./scripts/check-nexus-env.sh` | Pass (`CLERK_WEBHOOK_SECRET` reported missing — pre-existing, unrelated) |

## 12. Local smoke result

A pre-existing local dev server (`next dev`, PID not owned by this task) was
already running against the real linked Clerk/Convex deployment. Its dev log
(`.next/dev/logs/next-development.log`) contained a **live, pre-fix
reproduction** of the exact reported error and stack trace, confirming the
root cause and call site described in §1. Post-fix:

- `curl http://localhost:3000/` → `307` to `/sign-in?redirect_url=...` →
  `200`, no server error, no crash — the unauthenticated path (which exercises
  the same provider tree and readiness hook) renders cleanly.
- No connected Chrome browser instance was available in this environment
  (`list_connected_browsers` returned empty) and no real Clerk end-user
  credentials were available to script an interactive sign-in headlessly, so
  a full authenticated two-account browser walkthrough (steps 4–12 of the
  package's validation checklist) was **not** executed live in this session.
  This is stated honestly rather than fabricated.

### Remaining operator smoke steps

1. `npx convex dev` (if not already running) and `npm run dev`.
2. Open `http://localhost:3000/` in a fresh browser session/profile.
3. Sign in with a real approved `knowledge_reader` account.
4. Confirm the page loads with **no** `unauthenticated`/`ConvexError` in the
   browser console, and the sidebar briefly shows "Loading history…" before
   real history (or "No requests yet…") appears.
5. Refresh `/`, then refresh `/tasks` — same expectation on `/tasks`
   ("Loading your tasks…" then real data).
6. Navigate between Chat and Tasks a few times.
7. Sign out from an active page (e.g. via the sidebar `UserButton`) — confirm
   no protected-query exception appears in the console and the sidebar
   history/tasks panel returns to its signed-out/loading state.
8. Sign back in (same or a different approved account) — confirm private
   query loading resumes normally and, if a different account, that no data
   from the previous account is visible at any point.

## 13. Known limitations / follow-ups

- The live authenticated two-account browser walkthrough above remains an
  operator step (§12).
- `AccessAdminPanel`'s admin queries and `ConvexConnectivityBadge`'s
  `appMeta.get` were not audited or changed — they are not P5 private
  (owner-scoped) queries and were out of scope for this package.

## 14. P6 boundary

No Connector, claim, lease, heartbeat, HMAC, or execution work was performed.
`system` is unchanged. P6 has not started.
