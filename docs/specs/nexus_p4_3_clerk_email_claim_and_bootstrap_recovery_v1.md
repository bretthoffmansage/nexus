# Nexus P4.3 — Clerk Email Claim and Bootstrap Recovery (v1)

**Package:** P4.3 corrective identity claims + first-admin recovery
**Status:** Complete
**Date:** 2026-06-30

## Observed behavior

After P4.2 repaired Clerk-to-Convex token authentication, Google sign-in succeeded but the operator was routed to `/pending-approval` with identity displayed as `user_<ClerkUserId>@unknown.local`.

## Root cause

Clerk's native Convex session token included `aud: "convex"` but did **not** include a verified `email` claim. `ensurePendingUser` fell back to `${clerkUserId}@unknown.local`, which never matched `NEXUS_BOOTSTRAP_ADMIN_EMAILS`, so bootstrap failed and the first admin remained locked out.

## Convex identity claim shape (without email mapping)

`ctx.auth.getUserIdentity()` exposes standard JWT claims mapped by Clerk. With only the default native Convex integration:

| Claim key | Type | Notes |
|-----------|------|-------|
| `subject` | string | Clerk user ID |
| `issuer` | string | Clerk Frontend API URL |
| `tokenIdentifier` | string | Convex internal identifier |
| `name` | string | Optional; may be present |
| `email` | — | **Absent** until explicitly mapped |

## Canonical verified-email claim

**Claim name:** `email`
**Source:** Clerk session token via native Convex integration
**Convex access:** `identity.email` through `getVerifiedPrimaryEmail()` in `convex/lib/identity.ts`

## Clerk dashboard claim mapping required

**Operator action (not completed by this package unless verified locally):**

1. Clerk Dashboard → **Developers** → **Integrations** → **Convex** → **Manage integration**
   - or **Sessions** → **Claims** (depending on dashboard layout)
2. Add session claim:
   - **Name:** `email`
   - **Value:** `{{user.primary_email_address}}` (Clerk shortcode for primary verified email)
3. Save integration / session claims.
4. Restart `npx convex dev` and `npm run dev`.
5. Sign out, incognito sign-in, visit `/`.

## `unknown.local` disposition

Removed from all authority-bearing paths (`convex/users.ts`, `convex/webhookIngest.ts`). `isPlaceholderEmail()` detects legacy placeholder records for repair only.

## Schema change

Added audit event type `identity_email_repaired`. `approvedUsers.primaryEmail` remains required; new users are not created without a verified email claim.

## New access state

`identity_claims_incomplete` — authenticated Clerk session without verified `email` claim. Routed to `/identity-setup-required` (not `/pending-approval`).

## Pending-record recovery

`repairPlaceholderEmail()` + `repairAndMaybeBootstrap()` in `convex/lib/userProvisioning.ts`:

1. Match existing record by `identity.subject` (Clerk user ID).
2. Replace `@unknown.local` placeholder with verified normalized email.
3. Re-evaluate `shouldBootstrapAdmin()` when status is `pending`.
4. Grant `nexus_admin` + `knowledge_reader` if no active admin exists and email matches allowlist.
5. Write `identity_email_repaired` and bootstrap audit events.
6. Idempotent on repeat calls.

## Bootstrap comparison rules

- Normalize via `normalizeEmail()` (trim + lowercase).
- Exact full-string match against `NEXUS_BOOTSTRAP_ADMIN_EMAILS`.
- No wildcards, domain-only, substring, or username fallback.
- Actor: `system:bootstrap`.

## Error-state behavior

`/identity-setup-required` explains missing verified email claim, offers retry and sign out. Development includes diagnostic code `identity_claims_incomplete`.

## Tests

`tests/nexus-p4-3-clerk-email-claim-bootstrap.test.ts` — identity helper, routing, repair contracts, bootstrap rules, layout preservation.

## Validation results

| Command | Result |
|---------|--------|
| `npx convex codegen` | PASS |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS |
| `npm run build` | PASS |
| `./scripts/verify-nexus-boundary.sh` | PASS |
| `./scripts/check-nexus-env.sh` | PASS |

## Manual smoke test

- Without Clerk `email` claim configured: `/` routes to `/identity-setup-required` (expected).
- Full bootstrap recovery requires operator to add Clerk claim and re-sign-in.

## Operator checklist

1. Add `email: {{user.primary_email_address}}` to Clerk Convex session claims.
2. Save integration.
3. Restart `npx convex dev` and `npm run dev`.
4. Sign out; incognito sign-in with bootstrap email.
5. Visit `/` — automatic recovery from pending placeholder to active admin.
6. Confirm roles: `nexus_admin`, `knowledge_reader`.
7. Confirm `/admin/access` loads.
8. Confirm placeholder email no longer appears.

## Remaining before P5

1. Operator completes Clerk dashboard email claim step.
2. Operator verifies first-admin bootstrap recovery.
3. Configure `CLERK_WEBHOOK_SECRET` when public webhook exists.

## Exact next step

Operator adds Clerk `email` claim, re-signs in, verifies bootstrap recovery, then begin **P5 — task persistence**.

**P5 was not started.**
