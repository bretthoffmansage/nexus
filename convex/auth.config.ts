import type { AuthConfig } from "convex/server";

const clerkDomain = process.env.CLERK_JWT_ISSUER_DOMAIN;

if (!clerkDomain) {
  console.warn(
    "CLERK_JWT_ISSUER_DOMAIN is not set. Configure Clerk JWT issuer in Convex environment variables.",
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
