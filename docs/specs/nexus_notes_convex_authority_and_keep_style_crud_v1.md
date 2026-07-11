# Nexus Notes — Convex Authority and Keep-Style CRUD (v1)

**Package:** `nexus_notes_convex_authority_and_keep_style_crud_v1`

## Purpose

Provide a native Nexus Google Keep–style notes experience backed by private Convex records. Notes work fully while the Console Connector is offline.

## Authority

```
Nexus Notes page
  → authenticated Convex queries/mutations
  → private `nexusNotes` table
  → real-time UI subscriptions
```

Convex owns CRUD, ownership, archive/pin/checklist state, labels, and due-date metadata. Nexus is not required for routine note operations.

## Schema (`nexusNotes`)

| Field | Type | Notes |
|-------|------|-------|
| `ownerClerkUserId` | string | From verified auth only |
| `title` | string | Bounded |
| `content` | string | Plain note body |
| `noteType` | `note` \| `checklist` | |
| `checklistItems` | `{ id, text, completed, order }[]` | |
| `labels` | string[] | Normalized, deduped |
| `pinned` | boolean | |
| `archived` | boolean | |
| `dueAtUtc` | number? | Canonical instant |
| `dueLocalDate` | string? | Display round-trip |
| `dueLocalTime` | string? | Display round-trip |
| `timezone` | string? | IANA |
| `createdAt` / `updatedAt` | number | |
| `archivedAt` | number? | Set on archive |

Indexes: `by_owner_and_archived_and_updated_at`, `by_owner_and_archived_and_due_at`.

## API (`convex/notes.ts`)

- `listMyNotes({ archived })`
- `createMyNote`
- `updateMyNote`
- `setMyNotePinned`
- `setMyNotesArchived` (batch, max 50)
- `deleteMyNotes` (hard delete, batch)
- `toggleMyChecklistItem`

Validation lives in `convex/lib/notesConfig.ts`.

## Due dates

Local date + local time + IANA timezone → `dueAtUtc` via `localDateTimeToUtcMs` (same model as Calendar).

UI shows `upcoming`, `due soon` (within 24h), and `overdue`. **Notification delivery is deferred** — no browser/email/ntfy scanner and no `nexusTasks` rows.

## UI

- Route: `/notes` → `NotesWorkspace.tsx`
- Editor: `NoteEditorDialog.tsx`
- View mode preference: `localStorage` key `nexus.notes.viewMode`
- Archive view clears selection
- Bulk delete confirms via `LibraryConfirmDialog`

## Exclusions

- No legacy `/api/notes` calls
- No `nexusTasks` datastore
- No Connector tool for CRUD
- No vault/Obsidian/Brain sync
- No legacy SQLite import in v1

## Legacy migration (deferred)

Future path: legacy SQLite export → audited import mutation → `nexusNotes`.

## Focused tests

- `tests/nexus-notes-convex.test.ts`
- `tests/nexus-notes-ui.test.tsx`
- `tests/nexus-p4-4-legacy-workspace-port.test.tsx` (adapter availability)

## Rollback

Revert `nexusNotes` table, `convex/notes.ts`, Notes UI, navigation metadata, and spec. Existing note rows remain in Convex until manually removed.
