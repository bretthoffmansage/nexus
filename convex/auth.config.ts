import type { AuthConfig } from "convex/server";

function normalizeIssuer(value: string): string {
  return value.trim().replace(/\/$/, "");
}

function resolveClerkIssuerDomain(): string | undefined {
  const frontendApiUrl = process.env.CLERK_FRONTEND_API_URL;
  const legacyIssuer = process.env.CLERK_JWT_ISSUER_DOMAIN;

  const frontend = frontendApiUrl ? normalizeIssuer(frontendApiUrl) : undefined;
  const legacy = legacyIssuer ? normalizeIssuer(legacyIssuer) : undefined;

  if (frontend && legacy && frontend !== legacy) {
    console.warn(
      "CLERK_FRONTEND_API_URL and CLERK_JWT_ISSUER_DOMAIN differ; using CLERK_FRONTEND_API_URL for Convex auth.",
    );
    return frontend;
  }

  return frontend ?? legacy;
}

const clerkDomain = resolveClerkIssuerDomain();

if (!clerkDomain) {
  console.warn(
    "CLERK_FRONTEND_API_URL (or CLERK_JWT_ISSUER_DOMAIN) is not set. Configure Clerk issuer in Convex environment variables.",
  );
}

export default {
  providers: clerkDomain
    ? [
        {
          domain: clerkDomain,
          applicationID: "convex",
        },
      ]
    : [],
} satisfies AuthConfig;
