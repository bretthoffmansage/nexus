# Nexus Legacy Notes Functionality Audit (v1)

**Package:** `nexus_legacy_notes_functionality_audit_v1`  
**Date:** 2026-07-02  
**Repository:** `console`  
**Scope:** Read-only audit — no implementation

## Executive summary

The hosted Nexus `/notes` page is a **P4.4 layout port** of the legacy Nexus local console Notes panel. It preserves header controls (search, Select, Archive, Toggle, New note) and availability chrome, but **does not load, create, edit, or sync any notes**. The original feature was a **Google Keep–style notes + checklist + reminder** system backed by **local SQLite** on the Nexus Mac (`notes` table, `/api/notes/*`). It was **not** Obsidian, not Vault Library markdown, and not Nexus `nexusTasks`.

The current Connector banner and sidebar badge describe a **planned** `notes.sync` handoff that **was never implemented** in hosted Convex or P6 connector tooling.

**Classification:** placeholder over a missing backend (dead legacy UI shell; legacy backend exists only under `legacy_local_console/` and is unreachable from hosted Nexus).

---

## Current Nexus surface

| Item | Location |
|------|----------|
| Route | `app/notes/page.tsx` → `/notes` |
| Component | `components/workspace/port/NotesWorkspace.tsx` |
| Adapter | `lib/adapters/notes/adapter.ts` |
| Navigation | `lib/navigation/toolRegistry.ts` (`availability: "connector_required"`) |
| Styles | `styles/legacy-port.css` (`.notes-*`) |
| Introduced | `329270d` — *Port legacy workspace tools into Nexus* |

### Visible controls (hosted) — audit

| Control | File | Handler | Status | Original intent |
|---------|------|---------|--------|-----------------|
| Connector banner | `NotesWorkspace.tsx` | `ToolAvailabilityBanner` | Always shown (`connector_required`) | Defer until Connector sync exists |
| Search | `NotesWorkspace.tsx` | None | Disabled when `disconnected` | Client-side filter (legacy) |
| Select | `NotesWorkspace.tsx` | `setSelectMode` only | Toggles UI shell; bulk actions disabled | Bulk-select mode |
| Archive (header) | `NotesWorkspace.tsx` | `setArchiveView` | Toggles label only; no data | Active ↔ archived **view** |
| Toggle | `NotesWorkspace.tsx` | None | **Always disabled** | List ↔ grid **layout** (legacy) |
| Bulk Archive/Delete | `NotesWorkspace.tsx` | None | Always disabled | Bulk archive/delete selected notes |
| New note | `NotesWorkspace.tsx` | None | Always disabled | Open inline create form → POST |

`listNotes()` in the adapter always returns `{ ok: false, availability: "connector_required", data: [] }`.

---

## Original intended purpose (legacy)

Source: `legacy_local_console/static/js/notes.js` (module header + first-open hint), `legacy_local_console/routes/note_routes.py` (module docstring).

**Google Keep–style capture:**

- Plain **notes** (`note_type: "note"`) with title, body, color, label/tags, pin, image
- **Checklists / todos** (`note_type: "checklist"`, `items: [{text, done}]`)
- **Goals** (`note_type: "goal"`) with multi-step progress and a “Today” view
- **Reminders** via `due_date` (ISO datetime with time component) — not a separate reminder table
- **Archiving** (`archived: bool`) — reversible via unarchive
- **Pinning** and manual **sort_order**
- **Recurring reminders** (`repeat`: none/daily/weekly/monthly/yearly)
- **Agent-created notes** (`source: "agent"`, `manage_notes` tool)
- **“Agent: solve this”** — spawns chat session linked by `agent_session_id`
- Optional **AI classification** (`ai_classification`, `/classify` flows in legacy)

First-open copy: *“Notes is your basic todo list, and also where reminders are managed.”*

**Not in scope of legacy Notes:**

- Obsidian / vault markdown files (no references in `notes.js`)
- Nexus Vault Library documents
- Nexus “memory” JSON store (`manage_memory` is explicitly separate in `agent_loop.py`)

---

## Data model (legacy SQLite)

**Table:** `notes` (`legacy_local_console/core/database.py` — `class Note`)

| Field | Type | Purpose |
|-------|------|---------|
| `id` | String PK | UUID |
| `owner` | String | User scope |
| `title` | String | Title |
| `content` | Text | Body |
| `items` | Text (JSON) | Checklist `[{text, done}]` |
| `note_type` | String | `"note"`, `"checklist"`, `"goal"`, etc. |
| `color` | String | Card color |
| `label` | String | Space-separated tags |
| `pinned` | Boolean | Pin to top |
| `archived` | Boolean | Archive flag |
| `due_date` | String | Reminder / due datetime |
| `source` | String | `"user"` or `"agent"` |
| `session_id` | String | Optional chat linkage |
| `sort_order` | Integer | Manual ordering |
| `image_url` | String | Uploaded image |
| `repeat` | String | Recurrence |
| `ai_classification` | Text (JSON) | Auto-AI metadata |
| `ai_content_hash` | String | Re-classify gate |
| `agent_session_id` | String | Solve-this-todo session |
| `created_at` / `updated_at` | DateTime | Timestamps (via `TimestampMixin`) |

**Hosted Convex:** no `nexusNotes` table or notes collection. Incidental `notes` strings elsewhere (`vault_note` source type, `notesCreatedCount` on library processing) are unrelated.

---

## Backend path (legacy)

**API:** `legacy_local_console/routes/note_routes.py` — prefix `/api/notes`

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/api/notes` | List (`archived`, `label` filters) |
| POST | `/api/notes` | Create |
| GET | `/api/notes/{id}` | Read one |
| PUT | `/api/notes/{id}` | Update |
| DELETE | `/api/notes/{id}` | Delete |
| POST | `/api/notes/{id}/pin` | Toggle pin |
| POST | `/api/notes/{id}/archive` | Toggle archive |
| POST | `/api/notes/{id}/items/{index}/toggle` | Toggle checklist item |
| POST | `/api/notes/fire-reminder` | Dispatch reminder (browser/email/ntfy) |
| POST | `/api/notes/reorder` | Reorder |

**CLI:** `legacy_local_console/scripts/odysseus-notes` — same SQLite.

**Agent tool:** `manage_notes` in `legacy_local_console/src/tool_implementations.py` — CRUD + natural-language `due_date`.

**Reminder dispatch:** `dispatch_reminder()` — reads user settings (`reminder_channel`, `reminder_llm_synthesis`), may send email/ntfy, queues browser notifications; frontend polls/scans `due_date` on loaded notes.

**Still exists?** Yes, inside `legacy_local_console/` tree shipped in repo. **Not exposed** to hosted Nexus (`NotesWorkspace` has no `fetch`, no Convex calls — enforced by `tests/nexus-p4-4-legacy-workspace-port.test.tsx`).

---

## Control behavior (legacy — authoritative)

### Search

- **Where:** `notes.js` — `_searchQuery`, input listener ~L1196, filter ~L1681
- **Scope:** Client-side on loaded notes
- **Fields:** `title`, `content`, `label`, checklist `items[].text` (case-insensitive substring)
- **Does not:** Hit server; does not search archived unless archive view active

### Select

- **Where:** `notes-select-btn`, `_enterSelectMode` / `_exitSelectMode` (~L1381)
- **Behavior:** Enters **bulk-selection mode** — checkboxes on cards, “All” checkbox, count label
- **Bulk actions:** Archive selected (`archived: true` via PATCH), Delete selected (with confirm)
- **Exit:** “Cancel” / Escape

### Archive (header button)

- **Where:** `notes-archive-toggle` (~L1201)
- **Behavior:** Toggles **`_showingArchived`** — switches between active notes and archived notes list
- **Data:** `GET /api/notes?archived=true` vs default `archived=false`
- **Reversible:** Yes — archive is a field; header toggles view, bulk/single unarchive supported in legacy

### Toggle (header button)

- **Where:** `notes-view-toggle` (~L1238)
- **Behavior:** Toggles **`_viewMode`** between **`list` and `grid`** (persisted `localStorage` key `odysseus-notes-view`)
- **Label:** Shows “Grid” or “List” for the *next* mode
- **Not:** Notes vs reminders (that is `_activeFilter` / label chips: `reminders`, `no-reminders`, `today`, `goals`, etc.)

### New note

- **Where:** `_createNote()` (~L4178)
- **Flow:** Inline form at top of pane (`_editingId = '__new__'`), draft restore from localStorage
- **Save:** POST `/api/notes` on submit
- **Types:** note, checklist/todo, goal variants

### Reminders

- **Storage:** `due_date` on note row
- **Firing:** Client scanner + `/api/notes/fire-reminder` + scheduler notification queue
- **Channels:** browser (default), email, ntfy (settings in `settings.js`)
- **Calendar overlap:** `manage_calendar` with `reminder_minutes` creates Notes reminder; agent told not to duplicate with `manage_notes` for same event

---

## Connector / Nexus relationship

| Question | Finding |
|----------|---------|
| What did “Connector required” mean? | P4.4 **adapter boundary** — future read/sync from Nexus Mac; **not built** |
| Planned tool/kind | `lib/adapters/notes/adapter.ts`: `futureNexusTaskKind: "notes.sync"`, `futureConvexCollection: "notes"` |
| In `KNOWN_CONNECTOR_TOOL_IDS`? | **No** |
| Convex notes functions? | **None** |
| Nexus-side notes in hosted repo? | Only **legacy** `manage_notes` + SQLite |
| Sync vs task execution? | Adapter naming implies **state sync**, not `nexusTasks` job pattern |
| Legacy local console authority? | **Yes** — SQLite `notes` table was source of truth |
| Nexus ever had hosted notes backend? | **No** |
| Notes stored authoritatively today (hosted)? | **No** |

Migration matrix (`nexus_legacy_capability_migration_matrix_v1.md`): Notes → disposition **D8**, phase **P11+**, future presentation via Connector.

---

## Overlap with other surfaces

| Surface | Relationship |
|---------|----------------|
| **Nexus Tasks** (`nexusTasks`) | Different — P5 knowledge/connector task queue; not user quick notes |
| **Legacy Tasks** (`tasks.js`) | Recurring **AI background jobs**; not the Notes tool |
| **Nexus Calendar** | Different — `nexusScheduledEvents` + dispatch; legacy calendar reminders often materialize as **Notes** `due_date` |
| **Vault Library** | Unrelated; `notesCreatedCount` = dropzone processing output count |
| **`vault_note` sources** | Task result provenance type only |
| **Cookbook** | Separate local serve surface |
| **Memory / Brain** | Persistent facts; agent instructions forbid storing note content in memory |

---

## Tests, specs, history

| Artifact | Notes |
|----------|-------|
| `tests/nexus-p4-4-legacy-workspace-port.test.tsx` | Route + no `/api/` in `NotesWorkspace` |
| `docs/specs/nexus_p4_4_legacy_frontend_port_inventory_v1.md` | PA port, `connector_required` |
| `docs/specs/nexus_legacy_capability_migration_matrix_v1.md` | D8 / P11+ |
| `legacy_local_console/tests/test_notes_update_due_date.py` | `manage_notes` due_date parsing |
| Git history | Single Nexus commit `329270d` for Notes port |

No hosted Notes-specific functional tests beyond port inventory guards.

---

## Reuse assessment

| Piece | Verdict |
|-------|---------|
| Page layout / pane structure | **Reusable with repair** — matches legacy chrome |
| Search bar UI | **Reusable with repair** — needs wiring + enabled state |
| Select + bulk bar | **Reusable with repair** — pattern matches legacy/Memory |
| Header Archive toggle | **Reusable with repair** — correct semantics (view switch) |
| Header Toggle | **Reusable with repair** — rename to “Grid/List” to avoid ambiguity |
| New note button | **Reusable with repair** |
| Empty state copy | **Misleading** — implies Connector sync that does not exist |
| Connector banner | **Misleading** — no sync path implemented |
| Sidebar Connector badge | **Misleading** — accurate only as “not implemented on Nexus” |
| `listNotes` adapter stub | **Obsolete as-is** — needs real authority |
| `notes.sync` placeholder | **Obsolete contract name** until designed |

---

## Recommendation (audit only — not implementation)

1. **Keep** `/notes` as a standalone surface if product wants quick capture + reminders distinct from Chat tasks and Calendar scheduled events.
2. **Do not revive** by reconnecting to `legacy_local_console` HTTP from the browser — hosted architecture explicitly forbids that (`p4-4` tests).
3. **Choose authority** before UI work:
   - **Option A (matrix-aligned):** Nexus-owned SQLite on Mac, exposed via future Connector read/write sync (`D8`).
   - **Option B:** Convex-owned `nexusNotes` table for hosted-first capture (would diverge from matrix D8 unless Nexus sync is added later).
   - **Not recommended:** `nexusTasks` queue — wrong model for CRUD/sync notes (unlike Deep Research jobs).
4. **Next package:** `nexus_notes_authority_and_handoff_v1` — decide authority, envelope/sync contract, reminder model, then port legacy behaviors (grid/list, bulk select, archive view, due_date reminders) onto real data.

---

## Dormant smoke (future — not applicable today)

No hosted smoke path exists. Legacy smoke: run local Nexus console, open Notes panel, CRUD via UI or `odysseus-notes` CLI against SQLite.
