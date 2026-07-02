# Nexus First GitHub and Vercel Deployment Readiness v1

**Package:** `nexus_first_github_and_vercel_deployment_readiness_v1`  
**Repository:** `/Users/bretthoffman/Documents/claudia_console`  
**Branch at audit:** `main`  
**HEAD at audit:** `ab7e122` (*Initial Push*)  
**Remote:** `origin` → `https://github.com/bretthoffmansage/nexus.git` (configured; not pushed during this pass)  
**Date:** 2026-07-02  
**Scope:** Read-only audit + this spec. No push, deploy, cloud provisioning, or `claudia_system` edits.

---

## Executive summary

Nexus is **structurally ready** for a private GitHub repository and Vercel + Convex + Clerk production deployment. Secrets hygiene in Git is **good** (`.env` / `.env.local` gitignored, not tracked). The canonical navigation registry already supports hiding legacy pages without deleting routes.

**Primary blockers before production deploy:**

1. **`npm run build` fails** — TypeScript error in `components/chat/NexusChatWorkspace.tsx` (line 128). Vercel production build will fail until repaired.
2. **Cloud resources not yet provisioned** — production Convex deployment, production Clerk instance, Vercel project env vars, and Connector secrets must be operator-configured.
3. **README build instructions are incomplete** — recommends separate `npx convex deploy` + `npm run build`; production should use integrated Convex deploy during Vercel build (see §6).

No tracked secrets, private keys, or runtime databases were found in Git. Local `.env` / `.env.local` exist on disk and are correctly ignored.

---

## 1. Working tree and GitHub push readiness

| Check | Status |
|-------|--------|
| Repository initialized | Yes |
| Branch | `main` |
| Working tree | Clean except minor local `next-env.d.ts` modification (generated; safe to discard or regenerate) |
| Unresolved merge state | None |
| Remote configured | `origin` → `https://github.com/bretthoffmansage/nexus.git` |
| Sync with `origin/main` | Up to date at audit HEAD |
| Intended implementation committed | Yes — `ab7e122 Initial Push` aggregates prior feature commits |
| Safe for private GitHub | **Yes**, assuming operator confirms no secrets in commit history (spot-check found no live keys) |

### Files that must remain untracked

| Path | Reason |
|------|--------|
| `.env`, `.env.local`, `.env.*.local` | Clerk, Convex, webhook, internal API, Connector secrets |
| `.convex/` | Local Convex CLI deployment linkage |
| `.next/`, `out/` | Next.js build output |
| `node_modules/` | Dependencies |
| `data/`, `logs/`, `*.db`, `*.sqlite*` | Runtime data |
| `legacy_local_console/data/`, `legacy_local_console/logs/`, `legacy_local_console/venv/` | Legacy local runtime |
| `/tasks/`, `research_data/` | Local task/research artifacts |
| Media uploads (`*.jpg`, etc., except `docs/`) | User/generated media |

### Tracked and intentional

| Path | Notes |
|------|-------|
| `.env.example` | Placeholders only — **keep tracked** |
| `convex/_generated/` | Standard Convex codegen — **keep tracked** |
| `legacy_local_console/` | Local-only reference tree — safe in private repo; not deployed to Vercel |

---

## 2. Secret and repository audit

**No secret values are recorded below.**

| Item | Location | Tracked? | Remediation |
|------|----------|----------|-------------|
| `.env` | repo root | No (gitignored) | Keep untracked |
| `.env.local` | repo root | No (gitignored) | Keep untracked |
| `.env.example` | repo root | Yes | OK — placeholders only |
| `legacy_local_console/.env.example` | legacy | Yes | OK — placeholders only |
| Live Clerk keys | — | Not found in tracked files | None |
| Live Convex URLs/keys | — | Not found in tracked files | None |
| Webhook secrets | — | Not found in tracked files | Set in Vercel + Clerk dashboard |
| Connector shared secret | Convex env only | Never in Git | Set via `npx convex env set` on prod deployment |
| `CONVEX_DEPLOY_KEY` | Vercel CI only | Never in Git | Create in Convex dashboard → Deploy Key |
| Local paths (`/Users/bretthoffman/...`) | docs/specs only | Yes | Acceptable in private repo; scrub if repo ever goes public |
| `legacy_local_console/src/secret_storage.py` | legacy code | Yes | Filename only — not a credential file |
| Test fixture secrets | `tests/helpers/convexP6.ts` | Yes | Test-only constants — OK |
| Historical `sk_live` grep hits | `lib/env/clerkInstance.ts` | Yes | Prefix detection strings only — OK |

**Git history spot-check:** no committed `.env` files; no live `sk_live_*` / `whsec_*` values in source (only test stubs and prefix matchers).

---

## 3. Production deployment architecture

```
GitHub (private) → Vercel (Next.js 16)
                 ↳ npx convex deploy --cmd 'npm run build'
                 ↳ CONVEX_DEPLOY_KEY (Vercel env)

Browser → Clerk (auth) → Next.js (proxy.ts / clerkMiddleware)
                      → Convex (.convex.cloud client, .convex.site HTTP actions)

Claudia Mac Connector (outbound only) → https://<prod-deployment>.convex.site/api/connector/v1/*
```

**Human auth:** Clerk session → Convex native integration (`applicationID: "convex"`).  
**Machine auth:** HMAC-signed Connector requests to Convex HTTP routes (not Vercel Route Handlers).  
**Identity sync:** Clerk webhook → `POST /api/webhooks/clerk` (Next.js) → Convex `webhookIngest.processClerkWebhook`.

---

## 4. Vercel build contract

### Correct production Build Command

```bash
npx convex deploy --cmd 'npm run build'
```

**Why:** `NEXT_PUBLIC_CONVEX_URL` must be injected at **build time** so the client bundle points at the same Convex deployment whose schema/functions were just deployed. The integrated command sets this automatically (default `--cmd-url-env-var-name` = `NEXT_PUBLIC_CONVEX_URL`).

The README currently documents a **two-step** manual flow (`npm run build` + separate `npx convex deploy`). That works only if `NEXT_PUBLIC_CONVEX_URL` is manually kept in sync with the production Convex deployment — error-prone. **Prefer the integrated command for Vercel Production.**

### Vercel project settings

| Setting | Value | Source |
|---------|-------|--------|
| **Root Directory** | `.` (repository root) | `README.md`, current layout (`app/`, `package.json` at root) |
| **Framework** | Next.js | Auto-detected |
| **Install Command** | `npm ci` | Standard; `package-lock.json` present |
| **Build Command** | `npx convex deploy --cmd 'npm run build'` | Convex + Vercel integration |
| **Output Directory** | (default) | Next.js — no override |
| **Node.js Version** | **22.x** | `convex.json` → `"nodeVersion": "22"`; `package.json` engines `>=20.9.0` |
| **Custom `--cmd-url-env-var-name`** | Not required | Default `NEXT_PUBLIC_CONVEX_URL` matches codebase |
| **`vercel.json`** | Not present | Not required for MVP |

### Vercel env required for build

| Variable | Build-time |
|----------|------------|
| `CONVEX_DEPLOY_KEY` | **Yes** — enables `convex deploy` during build |

All other vars are runtime (or injected by `convex deploy --cmd` for `NEXT_PUBLIC_CONVEX_URL`).

---

## 5. Environment variable matrix

Legend: **S** = secret, **P** = public (browser-safe), **R** = runtime, **B** = build-time.

### 5.1 Vercel Production

| Variable | S/P | B/R | Required | Currently configured | Notes |
|----------|-----|-----|----------|----------------------|-------|
| `CONVEX_DEPLOY_KEY` | S | B | **Yes** | Operator | Convex dashboard → Settings → Deploy Key |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | P | R | **Yes** | Operator | Production Clerk `pk_live_*` |
| `CLERK_SECRET_KEY` | S | R | **Yes** | Operator | Production Clerk `sk_live_*` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | P | R | **Yes** | Default `/sign-in` | Match Clerk dashboard paths |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | P | R | **Yes** | Default `/sign-up` | Public signup is intentional (pending approval gate) |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | P | R | **Yes** | Default `/` | |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | P | R | **Yes** | Default `/` | |
| `NEXT_PUBLIC_CONVEX_URL` | P | B+R | **Yes** | Auto via `convex deploy --cmd` | Manual override only if not using integrated build |
| `CLERK_WEBHOOK_SECRET` | S | R | **Yes** | Operator | Clerk Dashboard → Webhooks signing secret |
| `NEXUS_INTERNAL_API_SECRET` | S | R | **Yes** | Operator | Must match Convex prod value exactly |
| `CLERK_FRONTEND_API_URL` | P | R | Recommended | Operator | Next.js consistency checks; Convex auth uses this too |
| `CLERK_JWT_ISSUER_DOMAIN` | P | R | Optional alias | Operator | Compatibility alias; prefer `CLERK_FRONTEND_API_URL` |
| `CLERK_WEBHOOK_SIGNING_SECRET` | S | R | Optional alias | Operator | Fallback for `CLERK_WEBHOOK_SECRET` in `lib/env.ts` |
| `AI_GATEWAY_API_KEY` | S | R | Optional | Operator | Deep Research model catalog enrichment only |
| `NEXUS_BOOTSTRAP_ADMIN_EMAILS` | S | R | Optional on Vercel | Prefer Convex only | Read by Convex functions; mirror optional |

### 5.2 Vercel Preview

Same as Production **unless** preview Convex deployments are enabled.

**Recommendation for first deploy:** **Disable Vercel Preview deployments** or use a dedicated Preview Convex project with separate Clerk test keys. Mixing preview frontends with production Convex is unsafe.

If previews enabled later:

| Variable | Notes |
|----------|-------|
| `CONVEX_DEPLOY_KEY` | Preview deploy key or same key with `convex deploy --preview-create` |
| Clerk keys | Use **test** Clerk instance (`pk_test_` / `sk_test_`) |
| `NEXUS_INTERNAL_API_SECRET` | Unique per environment |
| Connector secrets | Do **not** point preview at production Connector |

### 5.3 Production Convex deployment

Set via `npx convex env set --prod`:

| Variable | S/P | Required | Notes |
|----------|-----|----------|-------|
| `CLERK_FRONTEND_API_URL` | P | **Yes** | Production Clerk Frontend API URL (issuer for `auth.config.ts`) |
| `CLERK_JWT_ISSUER_DOMAIN` | P | Optional alias | Same value as above if only one set |
| `NEXUS_INTERNAL_API_SECRET` | S | **Yes** | Must match Vercel; gates `webhookIngest.processClerkWebhook` |
| `NEXUS_BOOTSTRAP_ADMIN_EMAILS` | S | **Yes until first admin** | Comma-separated admin emails for first-login bootstrap |
| `NEXUS_CONNECTOR_ID` | P | **Yes before Connector** | e.g. `claudia-mac-prod` |
| `NEXUS_CONNECTOR_SHARED_SECRET` | S | **Yes before Connector** | ≥32 random chars; never logged |
| `NEXUS_CONNECTOR_SECRET_<NORMALIZED_ID>` | S | Optional | Additional Connectors |

**Not on Convex:** `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET` (Vercel-only), `NEXT_PUBLIC_*` (Vercel/build).

### 5.4 Development Convex deployment

Same variable **names** as production; values point at dev Clerk (`pk_test_`/`sk_test_`) and dev Convex deployment URL. Set via `npx convex dev` / `npx convex env set` (dev).

### 5.5 Clerk production instance

| Configuration | Value |
|---------------|-------|
| Sign-in URL | `https://<nexus-domain>/sign-in` |
| Sign-up URL | `https://<nexus-domain>/sign-up` |
| After sign-in redirect | `https://<nexus-domain>/` |
| After sign-up redirect | `https://<nexus-domain>/` |
| Allowed redirect origins | Production Vercel domain + custom domain if used |
| Native Convex integration | Enabled; application ID `convex` |
| Session claim **email** | **Required** — `{{user.primary_email_address}}` (or Convex integration managed claims) for bootstrap + identity |
| Public sign-up | **Intentional** — new users land `pending` until admin approval (`/pending-approval`) |

### 5.6 Claudia Mac only (never GitHub / never Vercel)

| Variable | Purpose |
|----------|---------|
| `NEXUS_CONNECTOR_BASE_URL` | `https://<prod-deployment>.convex.site` |
| `NEXUS_CONNECTOR_ID` | Same as Convex prod |
| `NEXUS_CONNECTOR_SHARED_SECRET` | Same as Convex prod (local secret store) |
| `allowedToolIds` / Connector config | Claudia System — see §10 |
| `status_publication.enabled` | Claudia System heartbeat projection |
| All `CLAUDIA_*`, `legacy_local_console/.env` | Local execution only |

### 5.7 Never stored in GitHub

`CONVEX_DEPLOY_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, `NEXUS_INTERNAL_API_SECRET`, `NEXUS_CONNECTOR_SHARED_SECRET`, `AI_GATEWAY_API_KEY`, any `.env` with real values, local database files, logs, uploads.

---

## 6. Clerk production audit

| Item | Detail |
|------|--------|
| Webhook route | `POST https://<nexus-domain>/api/webhooks/clerk` |
| Implementation | `app/api/webhooks/clerk/route.ts` |
| Signing variable | `CLERK_WEBHOOK_SECRET` (alias: `CLERK_WEBHOOK_SIGNING_SECRET`) |
| Required webhook events | `user.created`, `user.updated`, `user.deleted` |
| Bridge secret | `NEXUS_INTERNAL_API_SECRET` passed to Convex mutation |
| Convex auth issuer | `CLERK_FRONTEND_API_URL` in Convex env → `convex/auth.config.ts` |
| Custom domain | Optional; if used, update Clerk allowed origins + webhook URL |
| Middleware | `proxy.ts` — `clerkMiddleware`, public routes include webhook + auth pages |
| Fail-closed production | `isProductionFailClosed()` — missing Clerk/Convex → `/configuration-required` |

---

## 7. Convex production audit

| Item | Detail |
|------|--------|
| Production deployment exists | **Unknown / operator** — not verified in this pass (no `convex deploy` run) |
| `CONVEX_DEPLOY_KEY` permissions | Deploy functions, schema, crons; set env vars |
| Schema/functions/crons | `convex/schema.ts`, `convex/crons.ts` (lease recovery, nonce prune, calendar dispatch) — deploy with schema migration |
| Production starts empty | **Yes** — no seed data; first users via Clerk webhook |
| First `nexus_admin` bootstrap | `NEXUS_BOOTSTRAP_ADMIN_EMAILS` in Convex + verified Clerk email claim → first sign-in grants `nexus_admin` + `knowledge_reader` when no active admin exists (`convex/lib/bootstrap.ts`) |
| Post-bootstrap | Remove or clear `NEXUS_BOOTSTRAP_ADMIN_EMAILS`; use `/admin/access` for approvals |
| HTTP routes (Connector) | `POST /api/connector/v1/heartbeat`, `/claim`, `/task`, `/attachment` on `*.convex.site` |
| File storage | Convex `_storage` for Library uploads and Connector attachments — no external bucket required |
| Preview deployments | **Disable initially** (see §5.2) |

---

## 8. Connector production handoff (Claudia System — do not edit in this pass)

After Nexus production Convex is live, configure Claudia System:

| Item | Production value |
|------|------------------|
| `NEXUS_CONNECTOR_BASE_URL` | `https://<prod-deployment>.convex.site` |
| `NEXUS_CONNECTOR_ID` | Match Convex `NEXUS_CONNECTOR_ID` |
| `NEXUS_CONNECTOR_SHARED_SECRET` | Match Convex `NEXUS_CONNECTOR_SHARED_SECRET` |
| `allowedToolIds` | Default allowlist: P5 tools + Library dropzone (`convex/lib/p6config.ts` `DEFAULT_CONNECTOR_TOOL_IDS`). Explicitly add for calendar-only tools: `membership_io.catalog_refresh_and_vault_update`, `vault.expansion_pass`, `research.hermes_deep_research` |
| `status_publication.enabled` | `true` on Claudia for heartbeat/status projection |
| Restart | Restart Claudia Connector poller after secret/URL changes |

Reference: `docs/specs/nexus_p6_p7_connector_handoff_contract_v1.md`

---

## 9. First deployment order

1. **Fix build blocker** — resolve `NexusChatWorkspace.tsx` TypeScript error; confirm `npm run build` passes locally.
2. **Create production Convex project** — `npx convex deploy` (manual once) or via Vercel integrated build.
3. **Set Convex production env vars** — issuer, internal secret, bootstrap emails, Connector id/secret.
4. **Create production Clerk application** — configure URLs, Convex integration, email session claim.
5. **Create Vercel project** — import private GitHub repo; set build command + `CONVEX_DEPLOY_KEY`.
6. **Set Vercel production env vars** — Clerk keys, webhook secret, internal secret (match Convex).
7. **Deploy Vercel Production** — verify build succeeds.
8. **Configure Clerk webhook** — point to `https://<domain>/api/webhooks/clerk`.
9. **Bootstrap first admin** — sign up with bootstrap email; verify `nexus_admin` in Convex.
10. **Configure Claudia Connector** — point at prod `.convex.site`; restart; smoke-test heartbeat + claim.
11. **Clear bootstrap allowlist** — remove `NEXUS_BOOTSTRAP_ADMIN_EMAILS` from Convex prod.
12. **Approve additional users** — `/admin/access`.

---

## 10. Production smoke-test plan

| # | Test | Expected |
|---|------|----------|
| 1 | Load `/` unauthenticated | Redirect to `/sign-in` |
| 2 | `/configuration-required` | Not shown when env complete |
| 3 | Sign up new non-bootstrap user | `/pending-approval` after auth |
| 4 | Bootstrap admin sign-in | Chat shell loads; admin nav visible |
| 5 | `/admin/access` | Approve pending user |
| 6 | Approved user sign-in | Chat + private Convex queries work |
| 7 | Clerk webhook delivery | User appears in Convex `approvedUsers` |
| 8 | Connector heartbeat | `connectorPresence` online in Status UI |
| 9 | Submit chat task | Queued in `nexusTasks`; Connector claims |
| 10 | Library upload | Convex storage upload URL works |
| 11 | `/gallery`, `/knowledge` direct URL | Pages load (hidden from sidebar) |
| 12 | Deep Research model catalog | `/api/deep-research/models` returns list (optional gateway key) |

---

## 11. Blockers and gaps

| Priority | Blocker | Owner |
|----------|---------|-------|
| **P0** | `npm run build` fails — TS error `NexusChatWorkspace.tsx:128` | Engineering |
| **P0** | Production Convex + Clerk + Vercel env not yet provisioned | Operator |
| **P1** | README Vercel section omits integrated Convex build command | Docs |
| **P1** | Clerk webhook + `NEXUS_INTERNAL_API_SECRET` must be coordinated before identity sync | Operator |
| **P1** | Clerk email session claim required for bootstrap | Operator |
| **P2** | P7 Connector poller not built — tasks queue but do not execute locally | `claudia_system` |
| **P2** | Preview deployment strategy undefined | Operator |
| **P3** | `AI_GATEWAY_API_KEY` optional — catalog works without it | Operator |

---

## 12. Focused validation performed

| Check | Result |
|-------|--------|
| `git diff --check` | Clean |
| Tracked secret file scan | No `.env` tracked; only `.env.example` |
| `git check-ignore .env .env.local .next` | All ignored |
| `tests/nexus-p4-auth.test.ts -t "secret hygiene"` | **2/2 passed** |
| `npm run build` (local, no deploy) | **Failed** — TypeScript error (blocker) |
| `npx convex deploy` | **Not run** (per instructions) |
| Push / deploy | **Not performed** |

---

## 13. Files changed in this pass

| File | Change |
|------|--------|
| `docs/specs/nexus_first_github_and_vercel_deployment_readiness_v1.md` | Created (this document) |

No application code, env files, or `claudia_system` changes.
