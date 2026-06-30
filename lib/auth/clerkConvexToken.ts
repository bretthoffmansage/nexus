import type { auth } from "@clerk/nextjs/server";

export type ClerkConvexTokenErrorCode =
  | "not_signed_in"
  | "token_not_found"
  | "token_retrieval_failed"
  | "token_retrieval_not_found";

export type ClerkConvexTokenResult =
  | { ok: true; token: string; usesNativeConvexIntegration: boolean }
  | {
      ok: false;
      code: ClerkConvexTokenErrorCode;
      httpStatus?: number;
      clerkTraceId?: string;
    };

type AuthState = Awaited<ReturnType<typeof auth>>;

function sessionUsesNativeConvexIntegration(
  sessionClaims: AuthState["sessionClaims"],
): boolean {
  if (!sessionClaims) return false;
  const audience = sessionClaims.aud;
  if (audience === "convex") return true;
  if (Array.isArray(audience)) return audience.includes("convex");
  return false;
}

function clerkErrorMetadata(error: unknown): {
  httpStatus?: number;
  clerkTraceId?: string;
} {
  if (!error || typeof error !== "object") return {};
  const record = error as {
    status?: number;
    clerkTraceId?: string;
    errors?: Array<{ code?: string }>;
  };
  return {
    httpStatus: typeof record.status === "number" ? record.status : undefined,
    clerkTraceId:
      typeof record.clerkTraceId === "string" ? record.clerkTraceId : undefined,
  };
}

/**
 * Obtain a Clerk session token for Convex using the same contract as
 * `ConvexProviderWithClerk`: native Convex integration uses the session token
 * directly; legacy setups may still request the `convex` JWT template.
 */
export async function getClerkConvexSessionToken(
  authState: AuthState,
): Promise<ClerkConvexTokenResult> {
  if (!authState.userId) {
    return { ok: false, code: "not_signed_in" };
  }

  const usesNativeConvexIntegration = sessionUsesNativeConvexIntegration(
    authState.sessionClaims,
  );

  try {
    const token = usesNativeConvexIntegration
      ? await authState.getToken()
      : await authState.getToken({ template: "convex" });

    if (!token) {
      return { ok: false, code: "token_not_found" };
    }

    return { ok: true, token, usesNativeConvexIntegration };
  } catch (error) {
    const { httpStatus, clerkTraceId } = clerkErrorMetadata(error);
    if (httpStatus === 404) {
      return {
        ok: false,
        code: "token_retrieval_not_found",
        httpStatus,
        clerkTraceId,
      };
    }
    return {
      ok: false,
      code: "token_retrieval_failed",
      httpStatus,
      clerkTraceId,
    };
  }
}
