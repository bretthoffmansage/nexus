# Nexus P2 Shell Implementation v1

| Field | Value |
|-------|-------|
| **Package** | P2-nexus-shell |
| **Date** | 2026-06-30 |
| **Spec** | `docs/specs/nexus_vercel_convex_architecture_correction_v1.md` |

> **Path update (P3.5):** Application paths formerly under `nexus/` were promoted to the **repository root**. See [`nexus_repository_root_promotion_v1.md`](nexus_repository_root_promotion_v1.md). Historical references to `nexus/` below describe the P2 layout at implementation time.

---

## 1. Summary

Implemented the hosted **Nexus** application foundation under `nexus/` as a **Next.js 16** App Router project with **TypeScript strict**, **Clerk** middleware/provider scaffolding, and **Convex** bootstrap (`appMeta.get` query only). The legacy FastAPI Claudia Console tree is unchanged.

---

## 2. Installed dependency versions (pinned in `package-lock.json`)

| Package | Version |
|---------|---------|
| Node (local CI) | 20.20.1 |
| npm | 10.8.2 |
| next | **16.2.9** |
| react | **19.2.7** |
| react-dom | **19.2.7** |
| @clerk/nextjs | **7.5.10** |
| convex | **1.42.1** |
| typescript | **6.0.3** |
| eslint | 9.39.4 |
| eslint-config-next | 16.2.9 |

**Note:** Correction doc mentioned “Next 15” illustratively. Installed **Next.js 16.2.9** (current stable at implementation time), verified compatible with Clerk 7.5.10 and Convex 1.42.1.

**Package manager:** npm (`nexus/package-lock.json`).

---

## 3. Directory layout (selected)

```
nexus/
├── app/
│   ├── layout.tsx              # Root layout, metadata, providers
│   ├── page.tsx                # Protected home (dynamic)
│   ├── globals.css
│   └── sign-in/[[...sign-in]]/page.tsx
├── components/
│   ├── providers/              # Clerk, Convex, Theme
│   └── shell/                  # Nexus UI shell components
├── convex/
│   ├── schema.ts               # Empty bootstrap schema
│   ├── appMeta.ts              # Harmless connectivity query
│   ├── _generated/             # Bootstrap codegen (see §5)
│   └── tsconfig.json
├── lib/env.ts                  # Env contract + placeholder detection
├── middleware.ts               # Clerk route protection
├── styles/                     # tokens.css, layout.css (legacy extract)
├── public/icon.svg
├── scripts/verify-nexus-boundary.sh
├── package.json
├── convex.json
├── .env.example
└── README.md
```

**Vercel Root Directory:** `nexus`

---

## 4. Why `nexus/convex/` (not repo-root `convex/`)

| Requirement | `nexus/convex/` | Repo-root `convex/` |
|-------------|-----------------|---------------------|
| Vercel Root = `nexus` | ✓ Convex CLI runs beside `package.json` | ✗ Cross-root imports from Next app |
| `import { api } from "@/convex/_generated/api"` | ✓ Stays inside deployment root | Requires path hacks |
| `npx convex dev` from app dir | ✓ Standard Convex monorepo leaf | Split working directories |
| Generated types in CI before first cloud login | ✓ Bootstrap `_generated` committed | Same |

**Decision:** **Option A — `nexus/convex/`** co-located with the Next.js `package.json`.

---

## 5. Convex generated-code strategy

`npx convex codegen` requires `CONVEX_DEPLOYMENT` (from `npx convex dev` cloud login).

For P2 build/typecheck without provisioning:

- Added **bootstrap** files under `convex/_generated/` with a header comment: *replaced by `npx convex dev`*.
- After operator runs `npx convex dev`, Convex CLI overwrites these files with typed schema-aware output.

**First-time operator command:**

```bash
cd nexus
npx convex dev
```

This creates/links a Convex project, writes `.env.local` (`NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOYMENT`), and regenerates `_generated/`.

---

## 6. Clerk integration pattern

| Piece | Implementation |
|-------|----------------|
| Provider | `ClerkProvider` in `components/providers/AppProviders.tsx` (only when publishable key configured) |
| Middleware | `clerkMiddleware` + `createRouteMatcher` — public: `/sign-in(.*)`; all else `auth.protect()` when Clerk configured |
| Sign-in | `app/sign-in/[[...sign-in]]/page.tsx` with `<SignIn />` |
| Home | `app/page.tsx` — `dynamic = "force-dynamic"`; redirects unsigned users to `/sign-in` |
| Missing keys | Config banner + sign-in page explains `.env.local`; middleware no-ops when keys absent |

No `data/auth.json`, `odysseus_session`, or localhost bypass.

---

## 7. Convex integration pattern

| Piece | Implementation |
|-------|----------------|
| Schema | Empty `defineSchema({})` |
| Query | `appMeta.get` — returns `{ productName, environment, version }` |
| Client | `ConvexReactClient` in `ConvexClientProvider` when `NEXT_PUBLIC_CONVEX_URL` set |
| UI proof | `ConvexConnectivityBadge` — only mounted when Convex configured (avoids `useQuery` without provider at build) |

No task tables, mutations, crons, or connector APIs.

---

## 8. Environment contract (`nexus/.env.example`)

| Variable | Visibility | Purpose |
|----------|------------|---------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Browser | Clerk frontend |
| `NEXT_PUBLIC_CONVEX_URL` | Browser | Convex React client |
| `CLERK_SECRET_KEY` | **Server only** | Clerk middleware + server auth |
| `CONVEX_DEPLOYMENT` | CLI / local | Set by `npx convex dev` |

Placeholder detection in `lib/env.ts` treats values containing `your_`, `placeholder`, etc. as unconfigured.

---

## 9. Vercel / GitHub deployment

| Setting | Value |
|---------|-------|
| Root Directory | `nexus` |
| Install Command | `npm ci` (default) |
| Build Command | `npm run build` (default) |
| Output | Next.js default (`.next`) |
| `vercel.json` | **Not added** — Vercel Next.js preset sufficient |

**Build without credentials:** Passes (Convex/Clerk optional at build; home page is `force-dynamic`).

**Production:** Requires real Clerk + Convex env vars in Vercel project settings + `npx convex deploy` for production Convex URL.

---

## 10. Legacy boundary

| Path | Role |
|------|------|
| `nexus/` | Hosted Nexus (Vercel) |
| `app.py`, `static/`, `routes/`, … | Local Claudia Console — **not in Vercel build** |
| `static/style.css` | Visual reference — tokens extracted to `nexus/styles/tokens.css` |

Documented in `nexus/README.md` and root `README.md` (two-application table).

**Not ported:** CLI Mirror, shell, Hermes PTY, Gateway chat bridge, model selector writes, Core HTTP forward.

---

## 11. Visual foundation reused from legacy

From `static/style.css` `:root` (lines ~18–50):

- `--bg: #282c34`, `--fg: #9cdef2`, `--panel: #111`, `--border: #355a66`, `--red: #e06c75`

Mapped to Nexus tokens: `--nexus-bg`, `--nexus-fg`, `--nexus-panel`, `--nexus-border`, `--nexus-accent`.

From `static/index.html`:

- Favicon / brand SVG (sail + wave) → `public/icon.svg`

**Deferred to P3:** chat bubbles, sidebar, full theme editor, `theme.js` presets, ~35k lines of component CSS.

---

## 12. Routes

| Route | Access |
|-------|--------|
| `/` | Protected when Clerk configured; open shell with notice when not |
| `/sign-in/[[...sign-in]]` | Public |

---

## 13. Commands run and results

```bash
cd nexus && npm install          # 361 packages added
npm run typecheck                # pass
npm run lint                     # pass (1 img warning)
npm run build                    # pass (no env)
npm run build                    # pass (with placeholder Clerk/Convex env)
./scripts/verify-nexus-boundary.sh  # pass
```

`npx convex codegen` — **not run** (requires `CONVEX_DEPLOYMENT`; documented for operator).

---

## 14. Files created (primary)

- Entire `nexus/` tree (app, components, convex, lib, styles, public, scripts)
- `docs/specs/nexus_p2_shell_implementation_v1.md` (this file)

## 15. Files changed (outside nexus/)

- `README.md` — two-application boundary table only

**FastAPI / `app.py` / `static/` application code:** unchanged.

---

## 16. Remaining for next packages

| Package | Scope |
|---------|-------|
| **P3** | Port CSS/layout, theme provider, chat chrome |
| **P4** | `approvedUsers`, `userRoles`, Clerk webhook, `knowledge_reader` |
| **P5** | `nexusTasks`, user task APIs |
| **P6** | Connector route handlers + claim/lease Convex mutations |
| **P7+** | `claudia_system` Console Connector |

---

## 17. Manual setup steps (operator)

1. Create Clerk application → copy keys to `nexus/.env.local`
2. `cd nexus && npx convex dev` → link Convex project, regenerate `_generated/`
3. Import repo in Vercel → Root Directory `nexus` → add env vars
4. `npx convex deploy` for production Convex URL

---

## 18. Risks / blockers before P3

- Next.js 16 deprecates `middleware` in favor of `proxy` — monitor Clerk docs for migration.
- Bootstrap `_generated` must be replaced by real `npx convex dev` output before relying on typed Convex APIs in production.
- Clerk + Convex cloud resources not provisioned in this pass — first `npm run dev` with real keys required for end-to-end auth/query smoke test.

---

*End of P2 implementation note.*
