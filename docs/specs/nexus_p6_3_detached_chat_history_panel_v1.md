# Nexus P6.3 — Detached Chat History Panel (v1)

## Summary

P6.3 corrects the remaining desktop visual issue after P6.2: the compact history panel was still placed in a grid column adjacent to the centered Chat column, making it appear attached to Chat content.

## Remaining issue after P6.2

P6.2 used a four-column grid (`1fr | centered main | history | 1fr`). The history card sat in column 3 directly beside the Chat boundary, so it read as part of the same content block rather than an independent page-edge control.

## Right-edge anchoring strategy

- `.nexus-chat-stage` is `position: relative` with `container-type: inline-size`.
- `.nexus-chat-main` remains in normal flow: `width: min(100%, var(--nexus-content-max)); margin-inline: auto` at all widths.
- When the stage is wide enough, `.nexus-chat-history-shell` is `position: absolute; top: 0; right: 0` inside the stage (active route area), inset by existing workspace padding (`1.25rem` on `.nexus-chat-workspace`).
- The panel does not reserve a grid column and does not participate in Chat centering.

## Chat centering independence

Centering is computed only on `.nexus-chat-main` within the full stage width, as if the history panel were absent. Showing or hiding the detached panel does not change Chat horizontal position.

## Overlap breakpoint

Token in `styles/tokens.css`:

`--nexus-chat-history-min-stage = content-max + 2 × (panel width + gap)` → **1592px** stage width.

Container query:

`@container nexus-chat-stage (min-width: 1592px)`

Below that width, the P6.2 drawer pattern remains (History toggle + slide-over). Fallback `@media (min-width: 1880px)` when container queries are unavailable (~280px sidebar + 1592px stage).

## Vertical alignment

Panel uses `top: 0` within the stage (aligned with Chat header / welcome area). It is not full-height, not sticky to the composer, and does not scroll with the internal Chat transcript.

## Responsive fallback

Unchanged drawer behavior for narrow stages: centered full-width Chat, history via **History** button, no absolute panel overlapping content.

## Overflow preservation

P6.1 viewport shell and P6.2 internal scroll regions unchanged.

## Accessibility

DOM order unchanged (main, then history). Detached positioning does not remove panel from tab order on wide stages. Drawer backdrop and toggle remain for narrow stages.

## Tests

- `tests/nexus-p6-3-detached-history-panel.test.tsx`
- Updated P6.1/P6.2 layout assertions

## Manual visual results

Authenticated `/` requires Clerk sign-in; layout verified via CSS/container-query structural tests. Dev server may already be running on port 3000.

## Functional confirmation

No changes to conversation queries, New chat, task status, queue protocol, or tool display labels.
