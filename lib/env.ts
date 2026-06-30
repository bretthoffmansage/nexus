/**
 * Nexus environment contract (P2 shell).
 *
 * Browser-visible (NEXT_PUBLIC_*):
 *   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY — Clerk frontend key
 *   NEXT_PUBLIC_CONVEX_URL — Convex deployment URL for the React client
 *
 * Server-only:
 *   CLERK_SECRET_KEY — Clerk backend key (never expose to the client)
 *
 * Convex CLI (local dev / deploy, not required at Next.js runtime for P2):
 *   CONVEX_DEPLOYMENT — deployment slug for `npx convex dev` / deploy
 */

const PLACEHOLDER_MARKERS = ["your_", "placeholder", "changeme", "example"];

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  const lower = value.toLowerCase();
  return PLACEHOLDER_MARKERS.some((m) => lower.includes(m));
}

export type EnvStatus = {
  clerk: boolean;
  convex: boolean;
  clerkPublishableKey?: string;
  convexUrl?: string;
};

export function getEnvStatus(): EnvStatus {
  const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  const clerk =
    !isPlaceholder(clerkPublishableKey) && !isPlaceholder(clerkSecretKey);

  const convex = !isPlaceholder(convexUrl);

  return {
    clerk,
    convex,
    clerkPublishableKey: clerk ? clerkPublishableKey : undefined,
    convexUrl: convex ? convexUrl : undefined,
  };
}

export function isClerkConfigured(): boolean {
  return getEnvStatus().clerk;
}

export function isConvexConfigured(): boolean {
  return getEnvStatus().convex;
}

/** Keys required for Clerk middleware and provider initialization. */
export function getClerkPublishableKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  return isPlaceholder(key) ? undefined : key;
}

export function getConvexUrl(): string | undefined {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  return isPlaceholder(url) ? undefined : url;
}
