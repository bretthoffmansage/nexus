# Nexus P4.4 — Legacy Frontend Port Inventory (v1)

**Package:** P4.4 workspace frontend migration
**Date:** 2026-06-30
**Legacy tree:** `legacy_local_console/static/`
**Hosted tree:** `app/`, `components/`, `lib/`

## Migration classification key

| Code | Meaning |
|------|---------|
| **PR** | Direct React port of legacy layout |
| **PA** | React port + adapter boundary (no legacy API) |
| **SC** | Shared component extraction |
| **LL** | Preserve in legacy only |
| **DF** | Deferred (unsafe or later package) |
| **OD** | Operator decision required |

## Inventory

| Legacy UI | Legacy modules | Backend / persistence | Nexus route | Nexus component | Class | Availability |
|-----------|----------------|----------------------|-------------|-----------------|-------|--------------|
| Nexus Chat (new) | — | Convex tasks (P5) | `/` | `NexusChatWorkspace` | SC | partially_available |
| Legacy Chat | `chat.js`, `chatRenderer.js`, `sessions.js` | `/api/chat_stream`, SQLite sessions | — (not ported) | — | LL | — |
| Email Inbox | `emailInbox.js`, `emailLibrary/*` | `/api/email/*` | `/email` | `EmailWorkspace` | PA | connector_required |
| Brain / Memory | `memory.js` | `/api/memory/*`, local JSON | `/memory` | `MemoryWorkspace` | PA | connector_required |
| Calendar | `calendar.js`, `calendar/` | `/api/calendar/*`, SQLite | `/calendar` | `CalendarWorkspace` | PA | connector_required |
| Deep Research | `research/panel.js`, `research/jobs.js` | `/api/research/*` | `/research` | `ResearchWorkspace` | PA | connector_required |
| Gallery | `gallery.js` | `/api/gallery/*` | `/gallery` | `GalleryWorkspace` | PA | connector_required |
| Image Editor | `galleryEditor.js`, `editor/*` | local canvas + API | — | — | DF | deferred |
| Library / Documents | `documentLibrary.js`, `document.js` | `/api/documents/*` | `/documents` | `DocumentsWorkspace` | PA | connector_required |
| Notes | `notes.js` | `/api/notes/*` | `/notes` | `NotesWorkspace` | PA | connector_required |
| Tasks | `tasks.js` | `/api/tasks/*` | `/tasks` | `TasksWorkspace` | PA | connector_required |
| Cookbook | `cookbook.js`, `cookbookServe.js` | local serve + install | `/knowledge` | `KnowledgeWorkspace` | PA | local_only |
| Skills | `skills.js` | `/api/skills/*`, filesystem | `/skills` | `SkillsWorkspace` | PA | local_only |
| Settings | `settings.js`, `index.html` settings modal | mixed local + API | `/settings` | `SettingsWorkspace` | PR | partially_available |
| Nexus Dashboard | `nexusDashboard.js` | local status APIs | `/status` | `StatusWorkspace` | PR | partially_available |
| CLI Mirror | `nexusCliMirror.js` | PTY / Hermes relay | `/operations` | `OperationsWorkspace` | DF | deferred |
| Compare | `compare` modules | local jobs | — | — | DF | deferred |
| Shell | `shell_routes` | RCE | — | — | LL | — |
| MCP / Webhooks | routes | local secrets | — | — | LL | — |
| Admin access | P4 Convex | Convex `approvedUsers` | `/admin/access` | `AccessAdminPanel` | SC | available (admin) |

## Adapter boundaries

| Tool | Adapter path | Future authority |
|------|--------------|------------------|
| Calendar | `lib/adapters/calendar/adapter.ts` | Connector → Nexus calendar store |
| Notes | `lib/adapters/notes/adapter.ts` | Connector |
| Documents | `lib/adapters/documents/adapter.ts` | Connector |
| Email | `lib/adapters/email/adapter.ts` | Connector |
| Research | `lib/adapters/research/adapter.ts` | Connector long-running jobs |
| Memory | `lib/adapters/memory/adapter.ts` | Connector (no Convex copy) |
| Gallery | `lib/adapters/gallery/adapter.ts` | Connector |
| Tasks | `lib/adapters/tasks/adapter.ts` | Convex `nexusTasks` (P5) + Connector |

## Navigation registry

Canonical source: `lib/navigation/toolRegistry.ts`

Legacy sidebar order preserved: Chat → Email → Tools (Brain, Calendar, Research, Gallery, Library, Notes, Tasks) → Cookbook → Settings/Status → Admin.

## Frontend behavior preserved (client-only)

- Calendar month/week/agenda view toggle and navigation chrome
- Notes archive/toggle/select UI modes
- Document library tabs and split editor layout
- Email folder list + three-pane inbox
- Research settings collapse and job sections
- Memory category chips and sort controls
- Gallery tabs and search toolbar
- Tasks schedule editor fieldset
- Settings sidebar tab navigation
- Sidebar collapse / mobile drawer (existing Nexus shell)

## Intentionally not ported

- PTY / CLI Mirror transport
- Shell execution
- Legacy chat stream / agent loop
- Image editor canvas tools (deferred)
- Model endpoint secret management
- Cookbook install/start/stop

**P5/P6 not started.**
