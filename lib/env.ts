/**
 * Nexus environment contract.
 *
 * Browser-visible (NEXT_PUBLIC_*):
 *   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
 *   NEXT_PUBLIC_CONVEX_URL
 *
 * Server-only:
 *   CLERK_SECRET_KEY
 *   CLERK_WEBHOOK_SECRET (or CLERK_WEBHOOK_SIGNING_SECRET for Clerk verifyWebhook fallback)
 *   CLERK_FRONTEND_API_URL (canonical Clerk issuer for native Convex integration)
 *   CLERK_JWT_ISSUER_DOMAIN (compatibility alias for Convex auth.config.ts)
 *   NEXUS_BOOTSTRAP_ADMIN_EMAILS (Convex dashboard + optional local mirror)
 *   NEXUS_INTERNAL_API_SECRET (server webhook → Convex bridge)
 *   CONVEX_DEPLOYMENT
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

export function isNexusFullyConfigured(): boolean {
  return isClerkConfigured() && isConvexConfigured();
}

/** Production deployments must not expose the shell without Clerk + Convex. */
export function isProductionFailClosed(): boolean {
  return process.env.NODE_ENV === "production" && !isNexusFullyConfigured();
}

export function getClerkPublishableKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  return isPlaceholder(key) ? undefined : key;
}

export function getConvexUrl(): string | undefined {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  return isPlaceholder(url) ? undefined : url;
}

export function getClerkWebhookSecret(): string | undefined {
  const secret =
    process.env.CLERK_WEBHOOK_SECRET ?? process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  return isPlaceholder(secret) ? undefined : secret;
}

export function getInternalApiSecret(): string | undefined {
  const secret = process.env.NEXUS_INTERNAL_API_SECRET;
  return isPlaceholder(secret) ? undefined : secret;
}
