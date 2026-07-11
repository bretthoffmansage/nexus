# Nexus P4.1 — Real Clerk Linkage and Login Integration (v1)

**Package:** P4.1 Clerk application linkage and embedded sign-in
**Status:** Complete
**Date:** 2026-06-30

## Summary

P4.1 connects the repository-root Nexus application to the real Clerk application and embeds Clerk’s sign-in/sign-up panels inside the existing Nexus auth page design. P4 Convex approval, roles, webhooks, and fail-closed behavior were preserved.

No P5 task persistence, P6 connector work, or Nexus execution was added.

## Remote warning

`origin` still points to `https://github.com/pewdiepie-archdaemon/odysseus.git`. Do not push Nexus to this remote.

## Clerk application linkage

| Field | Value |
|-------|-------|
| Application ID | `app_3Fs2O1H0hUQP6RDrT9W1RXdL5hp` |
| Application name (CLI) | Nexus |
| Link command | `clerk init --app app_3Fs2O1H0hUQP6RDrT9W1RXdL5hp --yes --mode agent` |
| Second app created | No |

## Clerk CLI

| Step | Result |
|------|--------|
| Install | `npm install -g clerk` → **clerk@1.5.0** |
| Authentication | Succeeded (`clerk auth login` via init agent flow) |
| Init | Linked Nexus app; wrote `.env.local` Clerk keys and route env vars; skipped existing `proxy.ts` and sign-in page; created sign-up route scaffold (replaced with Nexus shell) |
| Doctor | `clerk doctor` hangs without output in non-interactive agent shell; run locally: `clerk doctor` |

## Existing P4 code preserved

- `getNexusAccess()` and Convex `approvedUsers` / `userRoles` authority
- `/pending-approval`, `/access-suspended`, `/configuration-required`, `/admin/access`
- `app/api/webhooks/clerk` signature verification and idempotency
- `AppProviders` + `ConvexProviderWithClerk` (no duplicate provider after merge)
- Production fail-closed behavior

`clerk init` proposed adding `ClerkProvider` directly in `app/layout.tsx`; that duplicate wrapper was **reverted**. Clerk remains in `AppProviders` inside `<body>`.

## Login page structure

### Before P4.1

- `nexus-sign-in-shell` + `nexus-sign-in-panel` wrapper
- Clerk `<SignIn>` placed directly in panel with minimal styling
- `signUpUrl="/sign-in"` (no dedicated sign-up page)

### After P4.1

- **`NexusAuthShell`** — decorative background (grid, glow, aside copy), centered `nexus-auth-card`
- **`ClerkSignInPanel`** / **`ClerkSignUpPanel`** — Clerk-owned credentials in the card slot
- **`nexusClerkAppearance`** — transparent Clerk card chrome, Nexus token colors
- No custom username/password form; no credential POST to Nexus

## Sign-up decision

Clerk sign-up is enabled via `/sign-up` using the same `NexusAuthShell`. Footer copy states that Clerk account creation does **not** grant Nexus access; Convex pending lifecycle applies.

## UserButton placement

Existing P4 placement retained: `components/layout/Sidebar.tsx` footer (`UserButton` beside user label).

## ClerkProvider placement

`ClerkProvider` in `components/providers/AppProviders.tsx`, rendered inside `<body>` from `app/layout.tsx`. `ConvexProviderWithClerk` remains nested inside for authenticated Convex queries.

## Proxy matcher

Public routes: `/sign-in(.*)`, `/sign-up(.*)`, pending/suspended/configuration pages, webhook.

Matcher includes:

- `/(api|trpc)(.*)`
- `/__clerk/:path*`

## Environment variables (names only)

Written locally by `clerk init` (not committed):

| Variable | Status |
|----------|--------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | present |
| `CLERK_SECRET_KEY` | present |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | present (`/sign-in`) |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | present (`/sign-up`) |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | present |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | present |
| `NEXT_PUBLIC_CONVEX_URL` | present |
| `CLERK_WEBHOOK_SECRET` | missing (dashboard step) |
| `CLERK_JWT_ISSUER_DOMAIN` | missing (Convex + Next.js) |
| `NEXUS_INTERNAL_API_SECRET` | missing |
| `NEXUS_BOOTSTRAP_ADMIN_EMAILS` | missing |

Use `./scripts/check-nexus-env.sh` for safe presence checks (never prints values).

## Clerk / Convex JWT (manual steps still required)

1. Clerk Dashboard → JWT templates → create template named exactly **`convex`**
2. Copy **Issuer** URL → set `CLERK_JWT_ISSUER_DOMAIN` in Convex dashboard and `.env.local`
3. Replace Convex placeholder issuer (`https://placeholder.clerk.accounts.dev` from P4 codegen) with the real issuer
4. Confirm `convex/auth.config.ts` uses `applicationID: "convex"`

Without the JWT template, Clerk sign-in works visually but authenticated Convex calls will not receive identity.

## Webhook status

`app/api/webhooks/clerk/route.ts` unchanged in behavior. Future endpoint:

`https://<nexus-domain>/api/webhooks/clerk`

Requires `CLERK_WEBHOOK_SECRET` and `NEXUS_INTERNAL_API_SECRET`.

## Validation results

| Command | Result |
|---------|--------|
| `npx convex codegen` | PASS |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS (43 tests) |
| `npm run build` | PASS |
| `./scripts/verify-nexus-boundary.sh` | PASS |
| `clerk doctor` | Not completed in agent shell (run locally) |

## Manual smoke test

Run `npx convex dev` and `npm run dev`, then verify:

1. `/sign-in` shows Nexus decorative shell with embedded Clerk panel
2. No duplicate credential form
3. Sign-up link routes to `/sign-up` with matching shell
4. Successful Clerk auth redirects to `/` then P4 access resolver (`pending` or shell)
5. `UserButton` visible when approved

## What remains before P5

1. Configure Convex JWT issuer (real `CLERK_JWT_ISSUER_DOMAIN`)
2. Configure Clerk webhook + internal secret
3. Bootstrap or approve first `nexus_admin`
4. Replace Git remote before deployment

## Exact next step

Complete Clerk JWT template + Convex issuer configuration, then approve the first operator and begin **P5 — task persistence**.
