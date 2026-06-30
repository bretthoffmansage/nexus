const PLACEHOLDER_MARKERS = ["your_", "placeholder", "changeme", "example"];

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  const lower = value.toLowerCase();
  return PLACEHOLDER_MARKERS.some((m) => lower.includes(m));
}

function normalizeIssuer(value: string): string {
  return value.trim().replace(/\/$/, "");
}

export type ClerkKeyEnvironment = "development" | "production" | "unknown";

export type ClerkInstanceConsistency = {
  publishableKeyPresent: boolean;
  secretKeyPresent: boolean;
  frontendApiUrlPresent: boolean;
  legacyIssuerPresent: boolean;
  publishableKeyEnvironment: ClerkKeyEnvironment;
  secretKeyEnvironment: ClerkKeyEnvironment;
  keysEnvironmentMatch: boolean;
  issuerAliasesMatch: boolean;
  issuerConflict: boolean;
};

function keyEnvironment(value: string | undefined): ClerkKeyEnvironment {
  if (!value || isPlaceholder(value)) return "unknown";
  if (value.startsWith("pk_test_") || value.startsWith("sk_test_")) return "development";
  if (value.startsWith("pk_live_") || value.startsWith("sk_live_")) return "production";
  return "unknown";
}

export function getClerkIssuerDomain(): string | undefined {
  const frontend = process.env.CLERK_FRONTEND_API_URL;
  const legacy = process.env.CLERK_JWT_ISSUER_DOMAIN;
  const normalizedFrontend = frontend && !isPlaceholder(frontend) ? normalizeIssuer(frontend) : undefined;
  const normalizedLegacy = legacy && !isPlaceholder(legacy) ? normalizeIssuer(legacy) : undefined;

  if (normalizedFrontend && normalizedLegacy && normalizedFrontend !== normalizedLegacy) {
    console.warn(
      "CLERK_FRONTEND_API_URL and CLERK_JWT_ISSUER_DOMAIN differ; using CLERK_FRONTEND_API_URL.",
    );
    return normalizedFrontend;
  }

  return normalizedFrontend ?? normalizedLegacy;
}

export function assessClerkInstanceConsistency(): ClerkInstanceConsistency {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const secretKey = process.env.CLERK_SECRET_KEY;
  const frontendApiUrl = process.env.CLERK_FRONTEND_API_URL;
  const legacyIssuer = process.env.CLERK_JWT_ISSUER_DOMAIN;

  const publishableKeyEnvironment = keyEnvironment(publishableKey);
  const secretKeyEnvironment = keyEnvironment(secretKey);

  const normalizedFrontend =
    frontendApiUrl && !isPlaceholder(frontendApiUrl) ? normalizeIssuer(frontendApiUrl) : undefined;
  const normalizedLegacy =
    legacyIssuer && !isPlaceholder(legacyIssuer) ? normalizeIssuer(legacyIssuer) : undefined;

  const issuerConflict = Boolean(
    normalizedFrontend && normalizedLegacy && normalizedFrontend !== normalizedLegacy,
  );

  return {
    publishableKeyPresent: Boolean(publishableKey && !isPlaceholder(publishableKey)),
    secretKeyPresent: Boolean(secretKey && !isPlaceholder(secretKey)),
    frontendApiUrlPresent: Boolean(normalizedFrontend),
    legacyIssuerPresent: Boolean(normalizedLegacy),
    publishableKeyEnvironment,
    secretKeyEnvironment,
    keysEnvironmentMatch:
      publishableKeyEnvironment !== "unknown" &&
      secretKeyEnvironment !== "unknown" &&
      publishableKeyEnvironment === secretKeyEnvironment,
    issuerAliasesMatch: !issuerConflict,
    issuerConflict,
  };
}
