# Nexus P3 — UI Port Foundation (v1)

> **Path update (P3.5):** Components and tests formerly under `nexus/` now live at repository root (`app/`, `components/`, `tests/`). See [`nexus_repository_root_promotion_v1.md`](nexus_repository_root_promotion_v1.md).

**Package:** P3-ui-port-foundation  
**Status:** Complete  
**Depends on:** P2-nexus-shell  
**Does not include:** P4 Clerk approval/roles, P5 task persistence, P6 connector APIs, legacy FastAPI changes

## Goal

Port the visual identity, layout, and safe read-only presentation patterns from the legacy Claudia Console (`static/`) into the hosted Nexus Next.js application — without porting execution authority, FastAPI routes, or fake operational state.

## Legacy assets inspected

| Asset | Use in P3 |
|-------|-----------|
| `static/index.html` | Sidebar + centered chat layout concepts |
| `static/style.css` | Dark palette, borders, panel spacing (token extract only) |
| `static/js/theme.js` | Dark/light preset colors → `lib/theme/tokens.ts` |
| `static/js/chat.js`, `chatRenderer.js` | Read-only message column structure (no SSE) |
| `static/js/sessions.js` | Sidebar history section layout (empty state only) |
| `static/manifest.json` | PWA name/icon direction → `app/manifest.ts` |
| `static/login.html` | Sign-in shell remains Clerk-driven in P2 |

**Not ported (reviewed for boundary):**

- `static/js/claudiaBrowserChatBridge.js` — FastAPI chat bridge
- `static/js/claudiaConsoleMode.js` — local console mode banner
- `static/js/claudiaModelSelector.js` — model writes
- `static/js/claudiaCliMirror.js`, `claudiaCliMirrorHelpers.js` — CLI Mirror / PTY

## Components created

### Layout (`components/layout/`)

- `AppShell.tsx` — responsive shell, dismissible setup banner, sidebar state
- `Sidebar.tsx` — navigation, disabled new request, empty history, presence, theme, user
- `AppHeader.tsx` — mobile toggle, branding, Convex status badge
- `ThemeToggle.tsx` — dark/light switch via `nexus-theme-mode` localStorage

### Chat (`components/chat/`)

- `ChatWorkspace.tsx` — central read-only workspace
- `ChatComposer.tsx` — disabled textarea, “Ask Nexus…” placeholder
- `ModeToggle.tsx` — Chat selected; Agent hidden by default
- `AnswerPanel.tsx` — future answer rendering

### History (`components/history/`)

- `TaskHistorySection.tsx` — static empty state (no localStorage tasks)

### Status (`components/status/`)

- `ClaudiaPresence.tsx` — connector presentation (`not_configured` default)
- `SetupBanner.tsx` — “Nexus setup in progress” (not Claudia Console Mode)

### Sources (`components/sources/`)

- `SourceCard.tsx`, `SourceList.tsx` — future provenance display

### Diagnostics (`components/diagnostics/`)

- `DiagnosticsPanel.tsx` — collapsed `<details>` panel, empty state

### UI (`components/ui/`)

- `NexusIcon.tsx`, `TaskStatusBadge.tsx`, `PartialResultBanner.tsx`

### Shell integration

- `components/shell/NexusShell.tsx` — wires `AppShell` + `ChatWorkspace` (replaces P2 card layout)

## Visual elements preserved

- Dark Nexus default (`#282c34` bg, `#9cdef2` fg, `#355a66` border, `#e06c75` accent)
- Cyan/blue foreground identity with red accent
- Sidebar + centered chat column layout
- Panel borders, elevated surfaces, monospace tool chips
- Nexus wave/arrow icon (inline SVG, no `<img>` lint)
- Optional light theme toggle (legacy `theme.js` light preset)

## Visual elements intentionally not ported

- Full ~35k-line `static/style.css`
- Theme editor, pattern backgrounds, frosted glass effects
- Operational Web Search UI
- “Claudia Console Mode” hosted banner
- CLI Mirror transcript chrome
- Model selector writes
- Legacy `odysseus-*` localStorage keys
- Fake tasks, fake messages, fake online Claudia status
- Service worker / legacy PWA offline shell

## Theme token mapping

| Legacy (`theme.js` dark) | Nexus CSS variable |
|--------------------------|-------------------|
| `bg` `#282c34` | `--nexus-bg` |
| `fg` `#9cdef2` | `--nexus-fg` |
| `panel` `#111111` | `--nexus-panel`, `--nexus-sidebar-bg` |
| `border` `#355a66` | `--nexus-border` |
| `red` `#e06c75` | `--nexus-accent` |
| user/ai bubbles (style.css) | `--nexus-user-bubble-bg`, `--nexus-ai-bubble-bg` |

Persistence: `nexus-theme-mode` in localStorage via `ThemeProvider`.

## Accessibility work

- Semantic landmarks: `header`, `main`, `nav`, `aside`
- Skip link to main content
- Disabled composer/send with visible help text and `aria-disabled`
- Sidebar toggle: `aria-expanded`, `aria-controls`
- Diagnostics: native `<details>`/`<summary>` with focus styles
- Status badges use dot + text (not color alone)
- `prefers-reduced-motion` on sidebar transition
- Keyboard-visible `:focus-visible` on interactive controls

## Disabled / non-operational controls

| Control | Behavior |
|---------|----------|
| Composer textarea | `disabled`, placeholder “Ask Nexus…” |
| Send button | `disabled`, title explains backend setup |
| New request | `disabled` in sidebar |
| Agent mode | Hidden (`NEXUS_SHOW_AGENT_PLACEHOLDER=false`) |
| Chat mode button | Shown selected but disabled (read-only) |
| Task history | Empty copy only |
| Claudia presence | `not_configured` only |

## Presentation types (`lib/types/presentation.ts`)

Frontend-only contracts (not Convex schema):

- `TaskDisplayStatus`
- `ClaudiaPresenceState`
- `NexusAnswer`
- `NexusSource`
- `NexusDiagnostics`

## Feature flags (`lib/features.ts`)

- `NEXUS_SHOW_AGENT_PLACEHOLDER = false`

## Test setup

- **Vitest** + **jsdom** + **@testing-library/react**
- Config: `vitest.config.ts`, `vitest.setup.ts`
- Tests under `nexus/tests/`

Coverage:

- Nexus branding; no “Claudia Console” product title
- Disabled composer
- Truthful Claudia presence
- Agent mode non-operational
- Source card safe fields
- Diagnostics expand/collapse
- Sidebar toggle `aria-expanded`
- Static boundary scan for forbidden legacy strings

## PWA metadata

- `app/manifest.ts` — name/short_name Nexus, dark theme/background, `/icon.svg`
- No custom service worker in P3

## Backend / connector confirmation

P3 contains **no**:

- Real task submission or optimistic messages
- Claudia Core HTTP, FastAPI paths, EventSource/SSE
- Connector heartbeat, HMAC, claims, leases
- Convex product tables or task mutations beyond P2 `appMeta.get`
- Clerk approval/roles (P4)
- Modifications to `app.py`, `routes/`, `static/`, or `claudia_system`

## Boundary verification

`nexus/scripts/verify-nexus-boundary.sh` (repo root: `./scripts/verify-nexus-boundary.sh`) scans application source for forbidden legacy patterns.

## Exact next operator step (before P4)

```bash
cd nexus && npx convex dev
```

Link the real Convex project, confirm `NEXT_PUBLIC_CONVEX_URL` in `.env.local`, then begin **P4 Clerk approval/roles**. Do not start P4 until Convex is linked.

## Validation commands (P3 closeout)

```bash
cd nexus
npm run lint
npm run typecheck
npm test
npm run build
cd .. && ./scripts/verify-nexus-boundary.sh
```
