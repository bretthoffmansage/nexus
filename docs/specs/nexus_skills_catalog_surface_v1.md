# Nexus Skills Catalog Surface v1

**Package:** `nexus_skills_catalog_surface_v1`  
**Repository:** `/Users/bretthoffman/Documents/console`  
**Branch at start:** `main`  
**Starting HEAD:** `7a9aec4`

## Purpose

Replace the legacy Odysseus Skills placeholder with a read-only catalog of Nexus-accessible tools. The page does not execute tools.

## Canonical data sources

| Source | Role |
|--------|------|
| `convex/lib/p5config.ts` | Chat-supported tool IDs |
| `convex/lib/libraryDropzoneConfig.ts` | Library Dropzone tool |
| `convex/lib/p6config.ts` | Known Connector tool universe, safety classes |
| `convex/lib/calendarScheduledTools.ts` | Calendar scheduling + capability checks |
| `convex/lib/nexusSkillsCatalog.ts` | Normalized catalog model (single presentation layer) |
| `convex/skillsCatalog.ts` | Live query joining Connector state |

No second tool registry — static defs reference canonical IDs only.

## Included tools

1. `vault.agentic_retrieval` — SAGE Knowledge Vault  
2. `membership_io.transcript_retrieve` — Membership.io Transcript Search  
3. `vault.dropzone.process_document` — Library Dropzone Processing  
4. `membership_io.catalog_refresh_and_vault_update` — Membership.io Full Sync  

Nexus-internal-only tools are excluded.

## Sections

- **Knowledge & Research** — vault + transcript tools  
- **Library & Documents** — Dropzone processing  
- **Scheduled Maintenance** — Membership.io full sync  

## Availability semantics

Derived from Connector configuration and `allowedToolIds`, not from source-code presence alone:

| Status | Meaning |
|--------|---------|
| Available | Connector online and tool advertised |
| Connector required | No active Connector configured |
| Connector offline | Connector not recently heartbeating |
| Unavailable | Connector lacks explicit capability |
| Library only | Dropzone ready via Library |
| Scheduled via Calendar | Full sync ready for Calendar scheduling |

## Access modes

Shown per tool: Chat, Calendar, Library, Connector (as applicable).

- Dropzone: Library only (not ordinary Chat)  
- Full sync: Calendar only, no-input  
- Vault / transcript: Chat + Calendar  

## Sidebar cleanup

Skills navigation `availability` changed from `local_only` to `available`, removing the `−` badge (same policy as Calendar and Library).

## Legacy content removed

- “Local Nexus only” banner  
- “No skills loaded in hosted Nexus”  
- “Markdown editor and audit tools require the legacy local console”  
- Two-panel empty editor shell  

## No-execution scope

No run buttons, task creation, or arbitrary arguments on this page.

## Focused tests

`tests/nexus-skills-catalog.test.ts` — catalog content, grouping, availability honesty, legacy copy absence, sidebar policy.

## Future extension

Add a row to `SKILLS_CATALOG_TOOL_DEFS` when a new tool enters canonical Nexus registries; UI and query pick it up automatically.

## Live verification

Open `/skills` when authenticated — grouped cards with names, descriptions, tool IDs, surfaces, and availability.

Not automated in this package.
