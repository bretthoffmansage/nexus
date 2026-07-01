# Nexus P6.1 — Chat History Placement and Viewport Layout Repair (v1)

## Summary

P6.1 is a focused frontend layout and navigation repair. It moves chat-specific conversation controls out of the global sidebar into Nexus Chat, removes the duplicate Claudia Connector status card from the sidebar, and makes the authenticated workspace viewport-fitted with internal scrolling.

## Original UX problems

1. **Chat history in the global sidebar** — When Nexus Chat was selected, the left sidebar showed New request, a Requests heading, and conversation history. Switching tools hid that section, making history feel global rather than chat-specific.
2. **Duplicate Claudia status** — `ClaudiaPresenceLive` appeared in the sidebar while the same Connector projection already existed on `/status`.
3. **Document-level scrolling** — The shell could grow taller than the viewport, forcing browser scroll to reach the chat composer.

## Prior sidebar behavior

On `/` only, `Sidebar.tsx` rendered:

- New request button
- `TaskHistorySection` (Requests heading + `listMyConversations`)
- `ClaudiaPresenceLive` at the footer

## New chat history placement

`ChatHistoryPanel` (`components/chat/ChatHistoryPanel.tsx`) is rendered inside `NexusChatWorkspace` in a right column (desktop) or slide-over drawer (≤900px via History toggle).

The panel contains:

- **New chat** button with supporting hint copy
- **Conversations** heading
- Private conversation list with status chips (`taskStatusLabel`)
- Relative updated time
- Loading / empty / signed-out states
- **View all tasks** link to `/tasks`

`TaskHistorySection` re-exports `ChatHistoryPanel` for P5/P5.1 test compatibility.

## New request / New chat semantics

- Label: **New chat** with tooltip/hint: “Start a new conversation. Existing requests remain saved in your history.”
- Calls `startNewRequest()` → clears `activeConversationId` only.
- Does not cancel, delete, archive, or hide prior conversations.
- Does not call `submitRequest` or create an empty persisted conversation.
- Composer draft text is cleared only after successful submit (existing `ChatComposer` behavior).

## Conversation restoration

Selecting a conversation from the history panel:

- Sets `activeConversationId` via `ChatSessionContext`
- Loads transcript (`getConversationTranscript`), task status, answer (`getMyTaskResult`), and sources (`listMyTaskSources`)
- Highlights the active row with `aria-current="true"`
- History panel remains visible (desktop) or can be reopened (mobile)

## Duplicate Claudia status removal

Removed `ClaudiaPresenceLive` from `Sidebar.tsx`.

Retained on:

- `/status` (`StatusWorkspace`)
- Nexus Chat execution copy (composer help + welcome text)
- `ClaudiaPresenceLive` component itself (used by status surfaces)

## Application height hierarchy

```
html, body (height 100%; body overflow hidden for app shell)
└── .nexus-app (height/max-height 100dvh; overflow hidden)
    ├── SetupBanner (intrinsic height)
    └── .nexus-app-body (flex 1; min-height 0)
        ├── .nexus-sidebar (min-height 0; nav scrolls in .nexus-sidebar-nav-scroll)
        └── .nexus-app-main
            ├── AppHeader
            └── .nexus-workspace (flex 1; min-height 0; overflow hidden)
                └── active route (tool page or Nexus Chat)
```

Auth/sign-in pages opt back into document scroll via `body:has(.nexus-sign-in-shell)`.

## Internal scrolling model

| Surface | Scroll behavior |
|---------|-----------------|
| Global sidebar nav | `.nexus-sidebar-nav-scroll { overflow-y: auto }` |
| Tool pages | `.nexus-tool-page-inner { overflow-y: auto }` |
| Chat messages/results | `.nexus-chat-scroll { overflow-y: auto }` |
| Chat history list | `.nexus-chat-history-list-wrap { overflow-y: auto }` |
| Chat composer | Fixed in `.nexus-chat-footer` within workspace grid |

Flex/grid children that must shrink use `min-height: 0` / `min-width: 0`.

## Responsive history behavior

- **Desktop (>900px):** two-column grid — main chat + ~280–320px history panel.
- **Narrow (≤900px):** History button in chat header opens slide-over panel with backdrop; composer stays full width at bottom.

## Affected routes

All authenticated tool routes inherit the viewport-fitted shell. Tool page wrappers use `min-height: 0` + internal scroll. Smoke-tested routes: `/`, `/email`, `/calendar`, `/research`, `/gallery`, `/documents`, `/notes`, `/tasks`, `/settings`, `/status`, `/operations`, `/admin/access`.

## Accessibility

- History panel: `aria-labelledby="nexus-history-title"`, list region labeled “Conversation history”
- New chat: clear button label + `title` hint
- Selected conversation: `aria-current="true"`
- Loading: `aria-live="polite"`
- Status chips: text labels (not color-only)
- Mobile drawer: backdrop button to close; focus returns via normal tab order

## Tests

- `tests/nexus-p6-1-chat-layout.test.tsx` — placement, status removal, CSS structure
- Updated `tests/nexus-p4-4-legacy-workspace-port.test.tsx` — sidebar no longer hosts history
- P5.1 auth-readiness tests continue via `TaskHistorySection` re-export

## Manual viewport smoke results

Dev server (`npm run dev`) started for P6.1 validation. Navigating to `/` redirects to Clerk sign-in (approval-controlled access), so **authenticated Nexus Chat layout was verified via automated component/CSS tests**; live browser checks below cover the reachable sign-in shell and document scroll behavior.

| Viewport | Result |
|----------|--------|
| 1440×900 | Sign-in shell: no document scroll (`scrollHeight === clientHeight`); `body { overflow: hidden }` on app shell |
| 390×844 (mobile) | Sign-in shell: no document scroll |
| 1280×720 / 1024×768 / 768×900 / 1280×600 | Covered by CSS structural tests + component render tests (chat grid, history panel, internal scroll classes) |
| Zoom 100% / 125% | Not re-tested live (auth gate); flex/grid `min-height: 0` model should reflow |

**Authenticated chat checks (automated):** history panel in workspace, New chat, selection highlight, internal scroll containers defined in `styles/chat.css`, composer in `.nexus-chat-footer`.

## Remaining limitations

- Conversation deep-linking via URL query param not added (selection remains in React state; Convex still verifies ownership on load).
- Unsent composer draft is not preserved when switching conversations (no draft model in P5).
- Mobile history drawer does not implement focus trap (backdrop close only).

## Boundary

No changes to Convex queue protocol, task ownership, Connector HMAC, or `claudia_system`.
