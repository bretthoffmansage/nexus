# Nexus Chat header and signed-in identity cleanup (v1)

Package: `nexus_chat_header_and_signed_in_identity_cleanup_v1`

Focused UI cleanup on the hosted Nexus Chat page: shorten the sidebar navigation label, remove the redundant in-page Chat heading, and show the signed-in user's configured display name in the sidebar identity area.

## Sidebar Chat rename

- **Source:** `lib/navigation/toolRegistry.ts` (`NEXUS_CHAT_TOOL.label`)
- **Before:** `Nexus Chat`
- **After:** `Chat`
- **Preserved:** route `/`, tool id `nexus-chat`, selected-state styling, Chat history region flag, and all Chat execution behavior.

`components/layout/ToolNavigation.tsx` reads labels from the registry; no CSS text override.

## Redundant Chat page heading removal

- **Source:** `components/chat/NexusChatWorkspace.tsx`
- Removed the `<h1>Nexus Chat</h1>` workspace heading above the message list.
- Preserved: History toggle, mode control, transcript, composer, loading/empty states, centered column layout.
- **Spacing:** `styles/chat.css` — workspace head now right-aligns controls only with reduced bottom margin (`0.5rem`).
- Section uses `aria-label="Chat"` instead of `aria-labelledby`.

## Sidebar identity authority

- **Sidebar brand area:** `components/layout/Sidebar.tsx` — Nexus symbol + signed-in display name.
- **Top horizontal bar:** `components/layout/AppHeader.tsx` — unchanged (`Nexus`).

Display name resolution is centralized in `lib/auth/nexusDisplayName.ts` (`resolveNexusDisplayName`).

### Fallback order

1. Nexus profile `displayName` (Convex `approvedUsers`, via `getNexusAccess` / `requireWorkspaceAccess`)
2. Clerk `firstName` (`getClerkDisplayNameHints` → `currentUser()`)
3. Clerk `username`
4. Email local-part (before `@`)
5. `User`

Clerk IDs and full email are not shown when a safer configured name exists.

### Server wiring

- `lib/workspace/requireWorkspaceAccess.ts` returns `sidebarIdentityLabel` alongside `userLabel`.
- `app/page.tsx`, `ToolPageFrame`, and `app/tasks/page.tsx` pass `sidebarIdentityLabel` through `NexusShell` / `WorkspacePageShell` → `AppShell` → `Sidebar`.

## Loading / auth behavior

- Sidebar identity is **server-resolved** from Clerk session hints + Convex access; the Sidebar component does not call Convex or `useQuery`.
- While `sidebarIdentityLabel` is absent, Sidebar shows the bounded neutral placeholder `Nexus` (`SIDEBAR_IDENTITY_LOADING_LABEL`).
- Chat private queries remain gated by `readyForPrivateQueries` in `ChatSessionProvider`; this package does not change that model.

## Responsive / truncation

- `styles/shell.css` — `.nexus-sidebar-identity-label` uses ellipsis truncation with `title` attribute for full name on hover/focus.

## Focused tests

`tests/nexus-chat-header-identity-cleanup.test.tsx`:

1. Sidebar navigation shows `Chat`.
2. Sidebar navigation does not show `Nexus Chat`.
3. Chat page no longer renders redundant `Nexus Chat` heading.
4. Chat messages area (Welcome) and composer remain.
5. Sidebar identity renders configured display name.
6. `Brett` derived from profile input, not hardcoded.
7. Full email hidden when display name exists.
8. Fallback order verified.
9. Top application header brand remains `Nexus`.
10. Sidebar does not import Convex hooks.
11. Loading placeholder `Nexus` when identity prop omitted.

## Out of scope

- Chat submission, history, conversation persistence, and task queue behavior.
- Top horizontal application bar branding.
- Claudia System repository.
