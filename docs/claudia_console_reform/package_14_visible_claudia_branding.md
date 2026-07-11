# Package 14 — Visible Nexus branding pass

| Field | Value |
|-------|-------|
| **Package** | Package 14 — Visible Nexus branding pass |
| **Date/time** | 2026-06-02 |
| **Repo path** | `/Users/bretthoffman/Documents/odysseus` |
| **Prior notes** | `package_00` … `package_13_memory_skills_model_demotion.md` |

## Objective

Replace visible user-facing “Odysseus” branding with “Nexus” / “legacy local console” while preserving login design, layout, auth, and internal compatibility identifiers.

## Files changed

| File | Change |
|------|--------|
| `static/login.html` | Title + logo text → Nexus |
| `static/manifest.json` | PWA name/short_name/description |
| `static/index.html` | Title, sidebar, welcome, placeholder, route titles, theme labels |
| `static/app.js` | Default session name, chat placeholder |
| `static/js/sessions.js`, `keyboard-shortcuts.js` | Default “Nexus Chat” |
| `static/js/chatRenderer.js`, `chat.js`, `slashCommands.js` | Assistant role label + tour copy |
| `static/js/theme.js` | “Nexus Logo” color label |
| `static/js/emailLibrary.js`, `settings.js`, `cookbook.js`, `cookbookServe.js` | User-visible helper strings |
| `companion/routes.py` | Pairing page warning text |
| `app.py` | FastAPI title → “legacy local console” |
| `tests/test_nexus_branding.py` | **New** |
| `docs/console_reform/package_14_visible_nexus_branding.md` | **New** |

## Behavior changed

Visible UI copy, PWA manifest display names, chat assistant role labels in the main renderer/tour, and OpenAPI app title now say **Nexus** / **legacy local console** instead of Odysseus.

## Behavior intentionally unchanged

- Packages 1–13 (Console Mode, gateway, guards, demotions).
- Auth flow, cookies, tokens, routes, Gateway API.
- Login page layout, animations, CSS structure.
- `startOdysseusApp`, `odysseus-theme`, `_odysseusLoadTime`, internal headers.

## Visible branding changed

Login, main app chrome, welcome screen, chat placeholder, PWA manifest, per-route bookmark titles, settings/cookbook/email helper text, companion pairing warning, FastAPI title.

## Branding change matrix

| File | Visible string changed | New visible string | Reason |
|------|------------------------|-------------------|--------|
| `static/login.html` | `Odysseus — Login`, logo span | `Nexus — Login`, `Nexus` | Primary sign-in brand |
| `static/index.html` | `Odysseus Chat`, sidebar, welcome, placeholder | `legacy local console`, `Nexus`, `Message Nexus...` | Main app chrome |
| `static/index.html` | Route titles `— Odysseus` | `— Nexus` | Bookmarks/PWA per-route |
| `static/manifest.json` | name/short_name `Odysseus` | `Nexus` | Install-to-homescreen |
| `static/app.js` | `Odysseus Chat`, `Message Odysseus...` | `Nexus Chat`, `Message Nexus...` | Runtime defaults |
| `static/js/chatRenderer.js` | Role `Odysseus` | `Nexus` | Chat message headers |
| `static/js/slashCommands.js` | Tour + role labels | `Nexus` | Onboarding + UI |
| `companion/routes.py` | “your Odysseus” | “your legacy local console” | Pairing page |
| `app.py` | FastAPI title | `legacy local console` | API/docs title |

## Internal identifiers intentionally unchanged

| Identifier | Location | Notes |
|------------|----------|-------|
| `odysseus_session` | `routes/auth_routes.py` `SESSION_COOKIE` | Session cookie name |
| `ody_` token prefix | API tokens (unchanged) | Machine/user tokens |
| `odysseus-theme` | `static/index.html`, theme.js | localStorage theme key |
| `X-Odysseus-*` | `app.py` CORS/headers | Internal request headers |
| `startOdysseusApp` | `static/app.js` | JS bootstrap function |
| `_odysseusLoadTime` | `static/index.html` | Load timing global |
| Python modules/routes/DB | repo-wide | No renames in P14 |
| `presets.js` “Odysseus” persona | literary preset | Intentional persona, not app brand |

This package is **visible branding only**. Internal compatibility cleanup may be a later package if ever needed.

## Login/home design preservation status

**Preserved.** Only text strings and manifest metadata changed; no layout, animation, or CSS structure rewrites on `login.html`.

## Static grep results (post-change)

**No “Odysseus” in:** `static/login.html`, `static/manifest.json`.

**Remaining “Odysseus” in static (intentional or low-priority):**

| Location | Notes |
|----------|-------|
| `static/index.html` | HTML comment re theme (non-visible) |
| `static/app.js` | File header comment; `startOdysseusApp` function name |
| `static/landing.html` | Marketing page not in primary app shell (unchanged) |
| `static/js/presets.js` | “Odysseus” chat persona preset (literary) |
| `static/js/slashCommands.js` | Epic easter-egg quote (2 refs) |
| `static/js/research/panel.js` | Example query text (Homer reference) |
| `static/style.css`, `sw.js`, `init.js` | Comments only |
| Various JS | Internal comments (“Odysseus format”, etc.) |

## Tests/checks run

```bash
python3 -m compileall -q app.py core routes src
venv/bin/python -m pytest -q tests/test_nexus_branding.py + P1–P13 Nexus tests
```

## Results

- `compileall`: pass
- Focused Nexus tests (P1–P14): **129 passed**
- New branding tests: **6 passed**

## Known pytest baseline issue from Package 0

Collect-only may still report 2 pre-existing errors in `tests/test_chat_image_routing.py` and `tests/test_webhook_ssrf_resilience.py`.

## Risks

- `static/landing.html` still says Odysseus if users open that page directly.
- Some tour/easter-egg/persona strings still reference Odysseus by name.
- Users with cached PWA manifest may need reinstall to see new name.

## Follow-ups

- Package 15: legacy UI cleanup, landing page, comment churn.
- Optional: rename internal identifiers only if migration plan exists.

## Next recommended package

**Package 15 — Legacy Odysseus UI cleanup and module classification**
