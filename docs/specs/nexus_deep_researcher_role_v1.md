# nexus_deep_researcher_role_v1

Add a third Nexus user role, `deep_researcher` (label **Deep Researcher**), using
the existing `userRoles` authority. It grants access to the Deep Research page
and its backend operations to non-admin users, without granting any other
admin-only page. This is not a new permission system — it extends the canonical
role type and reuses the existing active/revoked semantics, admin controls,
sidebar filtering, route guards, and Convex authorization.

## Role authority

Canonical roles (`convex/lib/permissions.ts`, mirrored by `lib/auth/permissions.ts`):

- `knowledge_reader`
- `nexus_admin`
- `deep_researcher` (new)

`deep_researcher` carries **no** standalone permissions (`ROLE_PERMISSIONS.deep_researcher = []`).
It is a capability flag that only matters when combined with `knowledge_reader`.
It does **not** imply `knowledge_reader`; an admin may grant the two independently.

## Canonical Deep Research access predicate

`hasDeepResearchAccess(roles)` (in `convex/lib/permissions.ts`) returns true when:

1. the user has an active `nexus_admin`; **or**
2. the user has BOTH active `knowledge_reader` and active `deep_researcher`.

A user with only `deep_researcher` (no active `knowledge_reader`) gets no normal
Nexus tool access and no Deep Research access. Admins do not need `deep_researcher`.

This single predicate is used by all three enforcement layers (sidebar, route
guard, backend), so the rule is defined once.

## Role combinations

| Active roles | Chat/Brain/Notes/Tasks/Status | Deep Research | Email/Calendar/Library/Skills/Settings/Admin |
|---|---|---|---|
| `knowledge_reader` | yes | no | no |
| `knowledge_reader` + `deep_researcher` | yes | **yes** | no |
| `deep_researcher` only | no (fails closed) | no | no |
| `nexus_admin` (+ `knowledge_reader`) | yes | yes | yes |

## Storage / validators extended

- `convex/schema.ts` — `userRoles.role` union adds `deep_researcher`.
- `convex/admin.ts` — `roleValidator` (adminGrantRole/adminRevokeRole args) adds
  `deep_researcher`.
- `convex/lib/permissions.ts` — `NEXUS_ROLES` + `ROLE_PERMISSIONS` extended;
  `hasDeepResearchAccess` added.
- `grantRoleInternal` / `revokeRoleInternal` are role-generic and unchanged.
  Last-active-admin protection remains scoped to `nexus_admin` only.
- Bootstrap (`convex/lib/bootstrap.ts`) still grants only `[nexus_admin,
  knowledge_reader]`; `deep_researcher` is never auto-granted.

## Sidebar visibility

The Deep Research registry entry (`lib/navigation/toolRegistry.ts`) now uses
`requiredAccess: "deep_research"` instead of `requiredRole: "nexus_admin"`. The
other five privileged pages keep `requiredRole: "nexus_admin"`.
`toolsForNavigation({ isAdmin, canAccessDeepResearch })` hides an item when its
`requiredAccess` gate is unmet, and fails closed when `canAccessDeepResearch` is
undefined (auth loading). `canAccessDeepResearch = hasDeepResearchAccess(roles)`
is computed server-side and threaded through
`NexusShell`/`WorkspacePageShell` → `AppShell` → `Sidebar` → `ToolNavigation`,
parallel to `isAdmin`.

## Route protection

`app/research/page.tsx` uses `ToolPageFrame requiredAccess="deep_research"`.
`requireWorkspaceAccess` gained a `requiredAccess?: "deep_research"` branch that
`redirect("/")` when `hasDeepResearchAccess(access.roles)` is false (bounded
fallback, never `/admin`). `ToolPageFrame` forwards `requiredAccess` and computes
`canAccessDeepResearch` for the shell so Deep Research appears in the sidebar on
every page for an eligible user.

## Backend authorization

`convex/lib/ownership.ts` adds `requireDeepResearchAccess(ctx)` (approved+active,
then `hasDeepResearchAccess`). `convex/deepResearch.ts` `submitDeepResearch` and
`listMyDeepResearchTasks` now use it instead of `requireNexusAdmin`. Shared
task-detail surfaces (`getMyTask`, `getMyTaskResult`, `listMyTaskSources`,
`listMyTaskProgress`, `cancelMyTask`, `connectorStatus`) remain
`requireKnowledgeReader` — which is why the intended Deep Researcher holds both
roles. The other admin-only pages' backend guards are unchanged
(`requireNexusAdmin`).

## Admin controls

`components/admin/AccessAdminPanel.tsx` adds Grant/Revoke `deep_researcher`
buttons alongside the existing role controls; the role model is otherwise
unchanged. Revocation is reactive — the next access query / route load / mutation
re-evaluates active roles from Convex; no stale client role persists.

## Unaffected

Chat, Brain, Notes, Tasks, Status keep existing `knowledge_reader` behavior.
Email, Calendar, Vault Library, Skills, Settings, Admin remain `nexus_admin`-only.
No third permission system, no schema table changes, no Claudia System changes.

## Focused tests

- `tests/nexus-deep-researcher-role.test.ts` — role in `NEXUS_ROLES`, empty
  permissions, full `hasDeepResearchAccess` truth table, backend enforcement for
  reader-only (denied), reader+deep_researcher (allowed submit + list),
  deep_researcher-only (denied), admin-only (allowed), revoked deep_researcher
  (denied), and admin grant→access→revoke→denied plus role listing.
- `tests/nexus-admin-only-tool-pages.test.tsx` — updated: Deep Research gated by
  `canAccessDeepResearch`/`requiredAccess` (reader+deep_researcher sees it,
  admin-only pages still hidden); route source assertions for both gates.

## Live smoke plan (operator-controlled; do not mutate live roles automatically)

1. Knowledge-reader account: no Deep Research in sidebar; `/research` redirects to
   `/`; `submitDeepResearch` rejects. Chat/Brain/Notes/Tasks/Status normal.
2. Grant `deep_researcher` from an admin account: Deep Research appears; `/research`
   opens; submit/list work; Email/Calendar/Library/Skills/Settings/Admin still
   hidden and blocked.
3. Revoke `deep_researcher`: Deep Research disappears on refresh; `/research`
   redirects; backend rejects again.
4. Admin account: Deep Research accessible without a separate `deep_researcher`.

## Rollback

Revert this commit. Changes are additive: one role literal across the
type/validators, one predicate, one backend helper, the research nav/route gate
switch, a threaded `canAccessDeepResearch` prop, admin UI buttons, tests, and this
spec. Existing `deep_researcher` role rows (if any were granted) would simply stop
being recognized by the validator union on older code; none are created by
bootstrap.
