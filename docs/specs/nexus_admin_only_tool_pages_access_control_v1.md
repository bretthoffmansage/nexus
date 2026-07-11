# nexus_admin_only_tool_pages_access_control_v1

Expand the existing `nexus_admin` access boundary (previously only the Admin page)
so six additional Nexus tool pages become admin-only, enforced at three layers:
sidebar visibility, server-side route guard, and Convex backend authorization.

## Role authority

Roles are unchanged (`convex/lib/permissions.ts`):

- `knowledge_reader` — ordinary owner-scoped content access (Chat, Notes, Tasks,
  shared task read surfaces).
- `nexus_admin` — identity/diagnostics authority, and now the gate for the
  admin-only tool pages.

Role authority is sourced **only** from Convex `userRoles` (active rows), resolved
server-side by `getNexusAccess()` → `api.users.currentUserAccess` and threaded to
the client as the `isAdmin` prop. No role state lives in the client or Clerk claims
for this feature. A revoked/inactive `nexus_admin` (`active: false`) is treated the
same as no admin role because `getActiveRolesForUser` filters to `active` rows.

`knowledge_reader` alone grants access to **none** of the seven admin areas.
An active `nexus_admin` is required. In practice an operator admin holds **both**
roles: `nexus_admin` unlocks these pages, while `knowledge_reader` is still needed
for the shared owner-scoped task surfaces (e.g. `getMyTask`) those pages consume.

## Exact protected routes

| Page | Route | Page file | Registry id |
|---|---|---|---|
| Email | `/email` | `app/email/page.tsx` | `email` |
| Calendar | `/calendar` | `app/calendar/page.tsx` | `calendar` |
| Deep Research | `/research` | `app/research/page.tsx` | `research` |
| Vault Library | `/documents` | `app/documents/page.tsx` | `documents` |
| Skills | `/skills` | `app/skills/page.tsx` | `skills` |
| Settings | `/settings` | `app/settings/page.tsx` | `settings` |
| Admin | `/admin`, `/admin/access` | `app/admin/access/page.tsx` | `admin-access` |

`/admin` server-redirects to `/admin/access` (unchanged). Admin was already
protected; the six new pages now match it.

## Hidden navigation items

`lib/navigation/toolRegistry.ts` adds `requiredRole: "nexus_admin"` to the six new
entries (Admin already had it). `toolsForNavigation({ isAdmin })` filters any entry
whose `requiredRole === "nexus_admin"` when `isAdmin` is not true — so it also
**fails closed** while `isAdmin` is `undefined` (auth loading). `ToolNavigation`
already drops group headings with no visible items, so for a `knowledge_reader`:

- the `Communication` heading disappears (Email was its only item);
- the `Admin` heading disappears;
- `Tools` and `System` remain because Notes/Tasks and Status are still visible.

Filtering is at the navigation view-model layer, not CSS. Availability "Connector"
badges are per-item, so they disappear naturally with the hidden items.

## Server route protection

Each protected page renders `ToolPageFrame requiredRole="nexus_admin"`.
`ToolPageFrame` → `requireWorkspaceAccess({ requiredRole })`
(`lib/workspace/requireWorkspaceAccess.ts`):

1. resolves `getNexusAccess()`;
2. applies the standard access redirect (`unauthenticated → /sign-in`,
   `pending`/`approved_without_role → /pending-approval`, `suspended →
   /access-suspended`, etc.);
3. if `requiredRole === "nexus_admin"` and the user lacks an active `nexus_admin`,
   `redirect("/")` — a bounded, non-looping fallback (Chat), never `/admin`.

The protected page component and its private data never render for a denied user.

## Backend operation protection

A new convenience helper `requireNexusAdmin(ctx)` (`convex/lib/ownership.ts`) wraps
`requireApprovedRole(ctx, "nexus_admin")`, mirroring `requireKnowledgeReader`.
Upgraded functions (were `requireKnowledgeReader` / `getCurrentApprovedClerkUserId`,
now `requireNexusAdmin`):

- **Deep Research** — `convex/deepResearch.ts`: `submitDeepResearch`,
  `listMyDeepResearchTasks`.
- **Calendar** — `convex/scheduledEvents.ts`: `listMyScheduledEventsForRange`,
  `getMyScheduledEvent`, `getMyScheduledEventTaskResult`, `createMyScheduledEvent`,
  `updateMyScheduledEvent`, `deleteMyScheduledEvent`, `listAllowedScheduledTools`.
- **Vault Library** — `convex/libraryDocuments.ts`: `generateUploadUrl`,
  `listMyLibraryVersions`, `listMyDocumentVersions`, `processMyDocumentVersion`,
  `archiveMyDocumentVersion`, `deleteMyDocumentVersion`. The internal
  `finalizeUploadRecord` also gains a defense-in-depth admin check keyed on the
  verified `clerkUserId` (its only caller, the `libraryUpload.finalizeUpload`
  action, validates identity; the storage id is only obtainable from the now
  admin-gated `generateUploadUrl`).
- **Skills** — `convex/skillsCatalog.ts`: `listSkillsCatalog`.
- **Email / Settings** — no backend Convex functions exist (static/connector-gated
  placeholders); protection is via navigation + route guard only.

`nexus_admin` deliberately carries no private-content permissions in the
permissions model; that design is unchanged. These functions gate on the *active
role*, not on content permissions.

## Shared API exceptions (must NOT be globally restricted)

Deep Research reuses the shared chat/task surface via `lib/nexus/deepResearchClient.ts`
→ `nexusChat` (`lib/nexus/p5Client.ts`): `getMyTask`, `getMyTaskResult`,
`listMyTaskSources`, `listMyTaskProgress`, `cancelTask` (`cancelMyTask`), and
`connectorStatus` (`getConnectorStatusPublic`). These are the same functions Chat
(`/`) and Tasks (`/tasks`) use and remain at `requireKnowledgeReader`. Restricting
them would break Chat and Tasks. Consequently a full admin needs both roles so
these shared reads continue to work when viewing Deep Research task detail.

Calendar scheduled dispatch (`convex/scheduledEventDispatch.ts`) is `internalMutation`
(cron/system only) and is intentionally untouched; already-scheduled events keep
dispatching.

## Revocation behavior

Role rows are read live from Convex. Revoking `nexus_admin` (setting the row
`active: false`):

- removes the sidebar items on the next access-query refresh (`isAdmin` becomes
  false);
- causes the route guard to `redirect("/")` on the next navigation/refresh;
- causes every upgraded Convex operation to reject with `role_required`.

No sign-out/sign-in cycle and no stale client role can preserve access.

## Unaffected pages

Chat (`/`), Brain (`/memory`, still hidden from nav by its own flag), Notes
(`/notes`), Tasks (`/tasks`), and Status (`/status`) keep their existing
`knowledge_reader` + ownership behavior. General Tasks-page ownership rules are
unchanged; owned rows (including Calendar/Deep-Research-originated tasks) remain
stored and visible per existing rules. No task ownership or historical records are
altered.

## Focused tests

- `tests/nexus-admin-only-tool-pages.test.tsx` — sidebar visibility for
  admin/reader/undefined (fail-closed), registry `requiredRole`, empty-section
  heading removal, page-level `requiredRole="nexus_admin"`, route-guard source
  (redirect to `/`, never `/admin`), and unaffected pages have no role gate.
- `tests/nexus-admin-only-backend-access.test.ts` — reader rejected on every
  upgraded op (`role_required`); admin read surfaces allowed; revoked/suspended/
  no-role/unauthenticated fail closed; `finalizeUploadRecord` internal path
  rejects a reader; shared Chat/Tasks/Notes reader surfaces unchanged.
- Existing feature tests updated to seed a real admin (`seedApprovedAdmin`, both
  roles) where they exercise now-admin functions: `nexus-skills-catalog`,
  `nexus-calendar-deep-research`, `nexus-calendar-scheduled-dispatch`,
  `nexus-calendar-membership-full-sync`, `nexus-deep-research-handoff`,
  `nexus-library-dropzone`, `nexus-attachment-download`,
  `nexus-p6-connector-allowed-tools`.

Pre-existing, unrelated failures (present on HEAD before this change): the
`CALENDAR_SCHEDULED_TOOLS` registry assertion and the `research` availability
assertion in the calendar suites, and the `Nexus Chat` label/heading assertions in
`nexus-p4-4-legacy-workspace-port`.

## Live smoke plan (operator-controlled; do not mutate live roles automatically)

Admin account (active `nexus_admin` + `knowledge_reader`):
- sees Email, Calendar, Deep Research, Vault Library, Skills, Settings, Admin;
- opens each route; can create a harmless Calendar event; opens Deep Research,
  Library, Skills, Settings, Admin.

Knowledge-reader account (no admin):
- sees none of the seven; the Communication and Admin headings are gone;
- direct URLs (`/email`, `/calendar`, `/research`, `/documents`, `/skills`,
  `/settings`, `/admin/access`) redirect to `/`;
- direct backend calls reject with `role_required`;
- Chat, Brain, Notes, Tasks, Status behave as before.

Revocation:
- grant admin, confirm access appears; from a second admin, revoke `nexus_admin`;
- confirm nav disappears and route + mutation access are denied; restore if needed.

## Rollback

Revert this commit. All changes are additive/narrow: registry `requiredRole` flags,
per-page `requiredRole` props, the `requireNexusAdmin` helper and its use in the
six pages' private functions, plus tests and this spec. No schema, role model, or
Nexus System changes were made.
