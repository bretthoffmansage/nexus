# Nexus Library Auth, Upload, and Create to Vault v1

**Package:** `nexus_library_auth_upload_and_create_to_vault_v1`  
**Repository:** `claudia_console` (Nexus only)  
**Builds on:** `7be92ac` (Library Dropzone upload + attachment protocol)

## Summary

Focused Nexus UI and access repair for the hosted Library page, plus a **Create** view mode that submits freeform Markdown through the existing upload and Process pipeline. No changes to P6/P7 attachment protocol, queue schema, or Claudia contracts.

## Library sidebar badge

**Root cause:** `lib/navigation/toolRegistry.ts` listed Library (`documents`) as `connector_required` despite hosted Convex implementation.

**Fix:** Set `availability: "available"` for the `documents` tool only. `ToolNavigation` hides badges for `available` and `partially_available`; legacy tools (Email, Calendar, etc.) remain `connector_required`.

## Sign-in message root cause

**Root cause:** `DocumentsWorkspace` destructured `{ ready }` from `useNexusAuthReadiness()`, but the hook exports `readyForPrivateQueries`. `ready` was always `undefined` (falsy), so:

- queries were always skipped;
- upload controls were always disabled;
- stale copy `Sign in to use the Library.` always rendered.

This was **not** a Clerk/Convex integration failure — a property name mismatch.

**Fix:** Use `readyForPrivateQueries`, plus distinct loading / unauthenticated / ready states.

## Choose files root cause

Same as sign-in: `disabled={!ready}` with `ready` always falsy.

**Fix:** `disabled={!readyForPrivateQueries || isLoading}` with proper auth readiness.

## Create view architecture

Explicit view mode (not a processing status):

```typescript
type LibraryViewMode =
  | { kind: "list"; filter: LibraryStatusFilter }
  | { kind: "create" };
```

- Status filters query Convex only in `list` mode.
- **Create** is a detached tab beside the filter group (visible gap).
- Selecting Create deselects status filters; selecting a filter exits Create mode.
- Draft text lives in component state only (no localStorage).

## Markdown generation

- Module: `lib/nexus/libraryCreateVault.ts`
- Body: exact `textarea` value encoded as **UTF-8** via `TextEncoder` (no trim, no frontmatter, no wrappers).
- Empty detection: `text.trim().length === 0` only for validation.
- Line endings: browser `textarea.value` as-is (typically `\n`; pasted `\r\n` preserved).
- Size: `utf8ByteLength(text)` against `LIBRARY_MAX_UPLOAD_BYTES` before upload.

## Generated filename policy

UTC pattern: `nexus-created-YYYY-MM-DD-HHmmss.md`  
Example: `nexus-created-2026-07-01-143025.md`

## Canonical upload and Process reuse

1. `markdownFileFromText` → `File`
2. `uploadLibraryFile` (`lib/nexus/libraryUploadFlow.ts`) — same path as manual file picker
3. `libraryUpload.finalizeUpload` action (server SHA-256 authority)
4. `libraryDocuments.processMyDocumentVersion` mutation (same as Process button)

No separate queue, route, or Claudia call.

## Post-success UX

After successful upload + queue: clear draft, switch to **Queued** filter, show success banner on list view.

## Failure behavior

On upload/finalize/process failure: preserve draft, show safe error, allow retry. Submit/Clear disabled only during in-flight submission.

## Security

- Server ownership unchanged
- No document body in `requestText` or task metadata
- No logging of draft content

## Tests

- `tests/nexus-library-create-vault.test.ts` — helpers, filename, navigation metadata
- `tests/nexus-library-auth-upload.test.tsx` — auth states, Create UI, confirmations
- Full suite: 322 tests passing

## Live verification

Not performed against a deployed Nexus instance in this package (automated verification only).

## Rollback

Revert commit; no schema changes.

## Limitations

- No cross-session draft persistence
- Create success banner is ephemeral (component state)
- Build may still fail on pre-existing unrelated TypeScript errors outside this package
