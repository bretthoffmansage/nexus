import type { UserIdentity } from "convex/server";

const PLACEHOLDER_EMAIL_SUFFIX = "@unknown.local";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function getClerkUserId(identity: UserIdentity): string {
  return identity.subject;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isPlausibleEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  return normalized.length > 0 && EMAIL_PATTERN.test(normalized);
}

export function isPlaceholderEmail(email: string | undefined): boolean {
  if (!email) return false;
  return normalizeEmail(email).endsWith(PLACEHOLDER_EMAIL_SUFFIX);
}

/**
 * Canonical verified primary email from Clerk's native Convex session token.
 * Only `identity.email` is accepted — no guessed alternate claim names.
 */
export function getVerifiedPrimaryEmail(identity: UserIdentity): string | undefined {
  const raw = identity.email;
  if (!raw || typeof raw !== "string") return undefined;
  const normalized = normalizeEmail(raw);
  if (!isPlausibleEmail(normalized)) return undefined;
  if (isPlaceholderEmail(normalized)) return undefined;
  return normalized;
}

export function requireVerifiedPrimaryEmail(identity: UserIdentity): string {
  const email = getVerifiedPrimaryEmail(identity);
  if (!email) {
    throw new Error("verified_primary_email_required");
  }
  return email;
}

/** Development-safe claim shape diagnostic (keys and primitive types only). */
export function describeIdentityClaimShape(
  identity: UserIdentity,
): Record<string, string> {
  const shape: Record<string, string> = {};
  for (const [key, value] of Object.entries(identity)) {
    if (key === "tokenIdentifier") continue;
    shape[key] = value === null ? "null" : typeof value;
  }
  return shape;
}
