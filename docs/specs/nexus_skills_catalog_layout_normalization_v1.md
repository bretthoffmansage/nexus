# Nexus Skills Catalog Layout Normalization v1

**Package:** `nexus_skills_catalog_layout_normalization_v1`  
**Repository:** `/Users/bretthoffman/Documents/claudia_console`  
**Branch at start:** `main`  
**Starting HEAD:** `98953b4`

## Observed layout problem

After the loading repair, the Skills catalog rendered correctly but:

1. Each category stacked as a full-width vertical block, pushing the full catalog far down the page.
2. Availability badges sat beside titles in a flex header, so badge position varied with title length and wrapping.

## Responsive category-grid design

Replaced the stacked `.skills-catalog-sections` flex column with a responsive CSS Grid:

- Base: `repeat(auto-fit, minmax(min(100%, 17rem), 1fr))`
- Desktop (`min-width: 56rem`): two category columns
- Multi-tool categories (`section.tools.length > 1`) receive `skills-catalog-section--span-wide` and span the full row (`grid-column: 1 / -1`)

This lets Knowledge & Research (two cards) occupy a wider row while Library & Documents and Scheduled Maintenance (one card each) share the next row on desktop — without hardcoding category IDs.

## Card normalization

Each tool card now uses:

- `.skills-catalog-card-body` — title, description, metadata
- `.skills-catalog-card-footer` — availability badge
- `display: flex; flex-direction: column; height: 100%; min-height` for consistent row height
- Subdued uppercase labels for Tool / Surfaces / Input
- Monospace tool ID with `word-break` / `overflow-wrap`

## Availability-footer design

Badge moved from the title header into a footer row:

- `margin-top: auto` pushes the footer to the card bottom
- `justify-content: flex-end` aligns the badge bottom-right
- `min-height` on footer reserves consistent space while live status is pending

## Responsive breakpoints

| Width | Behavior |
|-------|----------|
| `≥ 56rem` | Two category columns; wide sections span full width; inner card grids use `auto-fit` |
| `< 56rem` | Categories auto-fit or stack via `auto-fit` / `minmax` |
| `≤ 640px` | Single category column; single card column; relaxed card min-height |

`max-width` on the workspace increased from `56rem` to `72rem` for better desktop use of available space.

## Preserved behavior

Unchanged:

- Tool definitions and descriptions
- Availability calculation and pending **Checking availability…** state
- Auth readiness gating
- Read-only surface (no execution controls)
- Category order from `SKILLS_CATALOG_SECTIONS`
- Skills route and sidebar navigation

## Focused validation

| Test file | Coverage |
|-----------|----------|
| `tests/nexus-skills-catalog-layout.test.tsx` | Category order, footer badges, wide-span metadata, CSS grid rules, no execution controls |
| `tests/nexus-skills-catalog-loading.test.tsx` | Loading/auth behavior unchanged |

## Live verification

Component and CSS assertions pass locally. Signed-in browser screenshot verification is optional operator follow-up.
