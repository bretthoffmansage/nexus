# Nexus P6.2 — Centered Chat Layout and Compact History Panel (v1)

## Summary

P6.2 corrects the desktop visual composition introduced in P6.1. Conversation history stays inside Nexus Chat, but the main Chat surface returns to a centered bounded column and the history control becomes a compact upper-right card instead of a full-height right rail.

## Issue introduced by P6.1

P6.1 used a permanent two-column grid (`1fr + 280–320px`) that:

- pushed the main Chat column to the far left;
- removed the pre-P6.1 centered `var(--nexus-content-max)` presentation;
- stretched the history panel to full workspace height (`height: 100%`, `flex: 1` list).

## Why the full-height right rail was rejected

The history panel behaved like a secondary page sidebar rather than the compact sidebar block users expected. It consumed horizontal and vertical space even with only one or two conversations.

## Restored centered Chat composition

- `.nexus-chat-main` uses `width: min(100%, var(--nexus-content-max))` and `margin-inline: auto` (960px token).
- Header, welcome/transcript, answer, sources, composer, and diagnostics all live inside `.nexus-chat-main`.
- Composer footer shares the same centered width.

## Compact history panel

- Width: up to 300px.
- Height: `auto` with `max-height: min(26rem, 48vh)`.
- `align-self: start` — does not stretch to viewport bottom.
- List region: `max-height: 12rem; overflow-y: auto` (header/footer fixed within card).
- New chat, Conversations heading, status chips, and View all tasks preserved.

## Desktop anchoring strategy (≥1200px)

Four-column grid on `.nexus-chat-stage`:

`1fr | centered main (min(100%, --nexus-content-max)) | history (≤300px) | 1fr`

Main column stays visually centered; history occupies spare space to the right without shifting the main column left.

## Responsive fallback (<1200px)

- Main column remains centered at bounded width.
- History collapses to the existing slide-over drawer via **History** toggle.
- Breakpoint chosen before the compact panel would overlap the centered column.

## Internal scrolling preservation

Unchanged from P6.1:

- Viewport-bounded app shell (`100dvh`, `min-height: 0`).
- `.nexus-chat-scroll` for conversation content.
- `.nexus-chat-footer` for composer at workspace bottom.
- No document-level scroll required to reach composer.

## Tool display labels (PART I)

Implemented in `lib/nexus/toolDisplayLabels.ts` (prior pass, preserved):

- `vault.agentic_retrieval` → **SAGE Knowledge Vault**
- `membership_io.transcript_retrieve` → **Transcripts**

Canonical IDs unchanged in submission payloads.

## Tests

- `tests/nexus-p6-2-centered-chat-layout.test.tsx`
- Updated `tests/nexus-p6-1-chat-layout.test.tsx` (layout assertions)

## Manual visual results

Dev server on port 3000 was already running; `/` redirects to Clerk sign-in without an operator session. Layout verified via:

- CSS structural assertions in P6.2 tests
- Sign-in shell viewport check at 1440×900 (no document scroll)

Full authenticated visual smoke at listed sizes requires an approved knowledge-reader session.

## Functional / protocol confirmation

No changes to conversation queries, New chat semantics, task status, queue protocol, P5 ownership, or P5.1 auth readiness.
