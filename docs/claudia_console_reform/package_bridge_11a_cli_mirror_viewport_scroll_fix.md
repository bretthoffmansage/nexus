# Bridge 11A — CLI Mirror Viewport Scroll and Input Accessibility Fix

| Field | Value |
|-------|-------|
| **Package** | Bridge 11A — CLI Mirror Viewport Scroll and Input Accessibility Fix |
| **Date** | 2026-06-02 |
| **Repo** | `console` |

## Objective

Fix CLI Mirror layout clipping so the full operator panel (controls, transcript, raw drawer, input bar) is reachable on normal laptop and mobile viewports.

## Root cause of clipping

The app shell uses a fixed-height flex layout:

- `body { overflow: hidden; height: 100dvh; }` — page does not scroll
- `.chat-container { overflow: hidden; flex: 1; min-height: 0; }` — main column clips overflow
- `.nexus-cli-mirror-panel { flex: 1; overflow: hidden; }` — panel tried to fill remaining height and hid content below the fold

Bridge 11 added operator warning, session list, title input, and attach UI — increasing total panel height beyond the viewport. With `overflow: hidden` at both container and panel levels, the lower input bar was trapped off-screen with no scroll path.

## Files changed

| File | Change |
|------|--------|
| `static/style.css` | CLI Mirror scroll/overflow layout fix (Bridge 11A rules) |
| `tests/test_nexus_cli_mirror_ui.py` | Static CSS checks for scroll behavior |
| `docs/console_reform/package_bridge_11a_cli_mirror_viewport_scroll_fix.md` | This note |

## CSS/layout changes made

**`.chat-container.nexus-cli-mirror-active`**

- `overflow-y: auto` — main column scrolls when mirror content exceeds viewport
- `overflow-x: hidden`, `overscroll-behavior-y: contain`
- Bottom padding + safe-area inset so input is not flush against viewport edge

**`.nexus-cli-mirror-panel`**

- `overflow: visible` (was `hidden`)
- `flex: 0 0 auto` + `min-height: min-content` — panel sizes to content instead of clipping
- Extra bottom padding

**`.nexus-cli-mirror-transcript`**

- Bounded internal scroll: `max-height: clamp(160px, 36vh, 400px)`
- `overflow-y: auto` — transcript scrolls independently

**`.nexus-cli-mirror-input-bar`**

- `flex-shrink: 0` + `scroll-margin-bottom` — input stays reachable when scrolling

**Media queries**

- Mobile: shorter transcript clamp, extra container padding
- `@media (max-height: 820px)`: tighter transcript max-height on short laptop windows

Simple Chat unchanged: base `.chat-container { overflow: hidden; }` remains; only `.nexus-cli-mirror-active` enables scroll.

## Tests/checks run

```bash
cd console
pytest tests/test_nexus_cli_mirror_ui.py tests/test_nexus_cli_relay.py tests/test_nexus_messages.py -q
```

Static checks verify:

- CLI Mirror active container has `overflow-y: auto`
- Panel uses `overflow: visible`
- Transcript has bounded `overflow-y: auto`
- Input bar has `flex-shrink: 0`
- Base chat container still `overflow: hidden`

## Manual smoke instructions

**Core:** `NEXUS_ENABLE_HERMES_PTY=true ./start-core-api.sh`  
**Console:** `NEXUS_CONSOLE_MODE=true NEXUS_CORE_URL=http://127.0.0.1:8080 ./start-macos.sh`

1. Open http://127.0.0.1:7860 — admin login
2. Switch to **CLI Mirror**
3. Scroll the main column — full panel reachable; input bar fully visible
4. Start session → send `/help`
5. Transcript scrolls internally; input remains accessible after page scroll
6. Open raw drawer — page still usable
7. Resize browser shorter/narrower — input still reachable
8. Switch to **Simple Chat** — normal chat layout unchanged

## Known limitations

- Hybrid scroll: page scroll + transcript internal scroll (intentional)
- Input is not sticky/fixed (avoids covering transcript)
- Very small viewports still require scrolling — by design

## Next recommended package

**Bridge 12 — CLI Mirror Session Persistence and Resume Design**
