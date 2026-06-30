import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getClerkConvexSessionToken } from "@/lib/auth/clerkConvexToken";
import { assessClerkInstanceConsistency } from "@/lib/env/clerkInstance";

const ROOT = path.resolve(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("Nexus P4.2 Clerk Convex token repair", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses native session token when aud is convex", async () => {
    const getToken = vi.fn(async () => "native-token");
    const result = await getClerkConvexSessionToken({
      userId: "user_1",
      sessionClaims: { aud: "convex" },
      getToken,
    } as never);

    expect(result).toEqual({
      ok: true,
      token: "native-token",
      usesNativeConvexIntegration: true,
    });
    expect(getToken).toHaveBeenCalledWith();
    expect(getToken).not.toHaveBeenCalledWith({ template: "convex" });
  });

  it("falls back to convex template only when native audience is absent", async () => {
    const getToken = vi.fn(async () => "template-token");
    const result = await getClerkConvexSessionToken({
      userId: "user_1",
      sessionClaims: { aud: "other" },
      getToken,
    } as never);

    expect(result.ok).toBe(true);
    expect(getToken).toHaveBeenCalledWith({ template: "convex" });
  });

  it("maps Clerk 404 token retrieval to token_retrieval_not_found", async () => {
    const getToken = vi.fn(async () => {
      throw { status: 404, clerkTraceId: "trace_404" };
    });

    const result = await getClerkConvexSessionToken({
      userId: "user_1",
      sessionClaims: { aud: "convex" },
      getToken,
    } as never);

    expect(result).toEqual({
      ok: false,
      code: "token_retrieval_not_found",
      httpStatus: 404,
      clerkTraceId: "trace_404",
    });
  });

  it("returns not_signed_in without requesting a token", async () => {
    const getToken = vi.fn();
    const result = await getClerkConvexSessionToken({
      userId: null,
      sessionClaims: null,
      getToken,
    } as never);

    expect(result).toEqual({ ok: false, code: "not_signed_in" });
    expect(getToken).not.toHaveBeenCalled();
  });
});

describe("Nexus P4.2 getNexusAccess failure handling", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("does not grant access when token retrieval fails for a signed-in user", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_live_abc");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_live_abc");
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://happy-fox-123.convex.cloud");

    vi.doMock("@clerk/nextjs/server", () => ({
      auth: vi.fn(async () => ({ userId: "user_signed_in" })),
    }));
    vi.doMock("@/lib/auth/clerkConvexToken", () => ({
      getClerkConvexSessionToken: vi.fn(async () => ({
        ok: false,
        code: "token_retrieval_not_found",
        httpStatus: 404,
      })),
    }));

    const { getNexusAccess } = await import("@/lib/auth/getNexusAccess");
    const access = await getNexusAccess();
    expect(access.state).toBe("identity_service_unavailable");
    expect(access.errorCode).toBe("token_retrieval_not_found");
    expect(access.clerkUserId).toBe("user_signed_in");
  });
});

describe("Nexus P4.2 Convex auth configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefers CLERK_FRONTEND_API_URL in auth.config.ts", () => {
    const src = read("convex/auth.config.ts");
    expect(src).toContain("CLERK_FRONTEND_API_URL");
    expect(src).toContain('applicationID: "convex"');
    expect(src).toContain("CLERK_JWT_ISSUER_DOMAIN");
  });

  it("reports conflicting issuer aliases", () => {
    vi.stubEnv("CLERK_FRONTEND_API_URL", "https://alpha.clerk.accounts.dev");
    vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", "https://beta.clerk.accounts.dev");
    const result = assessClerkInstanceConsistency();
    expect(result.issuerConflict).toBe(true);
    expect(result.issuerAliasesMatch).toBe(false);
  });
});

describe("Nexus P4.2 auth card centering", () => {
  it("centers the auth card in the full viewport", () => {
    const css = read("styles/auth.css");
    expect(css).toContain(".nexus-auth-stage");
    expect(css).toContain("place-items: center");
    expect(css).toContain("position: absolute");
    expect(css).toContain("inset: 0");
    expect(css).not.toContain("grid-template-columns");
  });

  it("keeps aside content independent from card positioning", () => {
    const shell = read("components/auth/NexusAuthShell.tsx");
    expect(shell).toContain("nexus-auth-aside");
    expect(shell).toContain("nexus-auth-stage");
    expect(shell).not.toContain("nexus-auth-layout");
  });

  it("shares the centered shell across sign-in and sign-up", () => {
    expect(read("app/sign-in/[[...sign-in]]/page.tsx")).toContain("NexusAuthShell");
    expect(read("app/sign-up/[[...sign-up]]/page.tsx")).toContain("NexusAuthShell");
  });
});

describe("Nexus P4.2 routing and secrets", () => {
  it("routes infrastructure failures to auth-service-error", () => {
    const routing = read("lib/auth/nexusAccessRouting.ts");
    expect(routing).toContain("/auth-service-error");
    expect(routing).toContain("identity_service_unavailable");
  });

  it("keeps Clerk secrets server-only", () => {
    const access = read("lib/auth/getNexusAccess.ts");
    expect(access).not.toContain("CLERK_SECRET_KEY");
    expect(access).toContain("await auth()");
  });

  it("does not accept browser-supplied Clerk user IDs", () => {
    const convexAuth = read("convex/lib/auth.ts");
    expect(convexAuth).toContain("ctx.auth.getUserIdentity()");
    expect(convexAuth).not.toMatch(/args\.clerkUserId/);
  });
});
