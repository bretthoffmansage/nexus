import { AccessStatusPage } from "@/components/access/AccessStatusPage";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  token_retrieval_not_found:
    "Clerk signed you in, but Nexus could not obtain the Convex session token. Verify the native Clerk Convex integration is enabled and that no legacy JWT template lookup is required.",
  token_retrieval_failed:
    "Clerk signed you in, but Nexus could not verify your access with the identity service.",
  token_not_found:
    "Clerk signed you in, but no Convex session token was returned.",
  convex_rejected_token:
    "Nexus could not authenticate your session with Convex. Verify the Clerk issuer configuration matches this deployment.",
  convex_identity_missing:
    "Convex did not receive an authenticated identity for your Clerk session.",
  convex_access_lookup_failed:
    "Nexus could not load your access state from Convex.",
  identity_service_unavailable:
    "Nexus could not complete identity verification after sign-in.",
  convex_authentication_failed:
    "Nexus could not authenticate your session with Convex.",
};

type AuthServiceErrorPageProps = {
  searchParams: Promise<{ code?: string }>;
};

export default async function AuthServiceErrorPage({ searchParams }: AuthServiceErrorPageProps) {
  const params = await searchParams;
  const code = params.code ?? "identity_service_unavailable";
  const message = MESSAGES[code] ?? MESSAGES.identity_service_unavailable;
  const devSuffix =
    process.env.NODE_ENV !== "production" ? ` Diagnostic code: ${code}.` : "";

  return (
    <AccessStatusPage
      title="Authentication could not be verified"
      message={`${message}${devSuffix} Sign out and try again, or contact your administrator if this persists.`}
    />
  );
}
