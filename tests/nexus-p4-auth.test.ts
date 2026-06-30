import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NEXUS_PERMISSIONS,
  permissionsForRoles,
  roleHasPermission,
} from "@/convex/lib/permissions";
import { parseBootstrapAdminEmails } from "@/convex/lib/bootstrap";
import { isProductionFailClosed, getEnvStatus } from "@/lib/env";

const ROOT = path.resolve(__dirname, "..");

describe("Nexus P4 permissions", () => {
  it("knowledge_reader can access Nexus shell but not admin functions", () => {
    const perms = permissionsForRoles(["knowledge_reader"]);
    expect(perms).toContain(NEXUS_PERMISSIONS["nexus.access"]);
    expect(perms).not.toContain(NEXUS_PERMISSIONS["users.approve"]);
    expect(perms).not.toContain(NEXUS_PERMISSIONS["roles.manage"]);
    expect(roleHasPermission("knowledge_reader", "users.approve")).toBe(false);
  });

  it("nexus_admin can approve users and manage roles", () => {
    const perms = permissionsForRoles(["nexus_admin"]);
    expect(perms).toContain(NEXUS_PERMISSIONS["users.approve"]);
    expect(perms).toContain(NEXUS_PERMISSIONS["roles.manage"]);
  });

  it("ordinary knowledge_reader cannot self-approve via permission policy", () => {
    expect(roleHasPermission("knowledge_reader", "users.approve")).toBe(false);
  });

  it("browser-supplied roles are not used in Convex auth helpers", () => {
    const authSrc = readFileSync(path.join(ROOT, "convex/lib/auth.ts"), "utf8");
    expect(authSrc).toContain("ctx.auth.getUserIdentity()");
    expect(authSrc).not.toMatch(/args\.(role|clerkUserId)/);
  });
});

describe("Nexus P4 bootstrap", () => {
  const original = process.env.NEXUS_BOOTSTRAP_ADMIN_EMAILS;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXUS_BOOTSTRAP_ADMIN_EMAILS;
    } else {
      process.env.NEXUS_BOOTSTRAP_ADMIN_EMAILS = original;
    }
  });

  it("parses bootstrap admin emails from env", () => {
    process.env.NEXUS_BOOTSTRAP_ADMIN_EMAILS = " Admin@Example.com ,other@test.io ";
    expect(parseBootstrapAdminEmails()).toEqual(["admin@example.com", "other@test.io"]);
  });

  it("fails closed when bootstrap env is absent", () => {
    delete process.env.NEXUS_BOOTSTRAP_ADMIN_EMAILS;
    expect(parseBootstrapAdminEmails()).toEqual([]);
  });

  it("does not hardcode operator emails in source", () => {
    const bootstrapSrc = readFileSync(path.join(ROOT, "convex/lib/bootstrap.ts"), "utf8");
    expect(bootstrapSrc).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i);
  });
});

describe("Nexus P4 getNexusAccess", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns unauthenticated when Clerk session is missing", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_live_abc");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_live_abc");
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://happy-fox-123.convex.cloud");

    vi.doMock("@clerk/nextjs/server", () => ({
      auth: vi.fn(async () => ({ userId: null })),
    }));
    vi.doMock("@/lib/auth/convexServerClient", () => ({
      createAuthenticatedConvexClient: vi.fn(),
    }));

    const { getNexusAccess } = await import("@/lib/auth/getNexusAccess");
    const access = await getNexusAccess();
    expect(access.state).toBe("unauthenticated");
  });

  it("returns pending for authenticated user awaiting approval", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_live_abc");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_live_abc");
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://happy-fox-123.convex.cloud");

    const mockClient = {
      mutation: vi.fn(async () => ({ status: "pending" })),
      query: vi.fn(async () => ({
        state: "pending",
        clerkUserId: "user_1",
        primaryEmail: "pending@example.com",
      })),
    };

    vi.doMock("@clerk/nextjs/server", () => ({
      auth: vi.fn(async () => ({ userId: "user_1" })),
    }));
    vi.doMock("@/lib/auth/clerkConvexToken", () => ({
      getClerkConvexSessionToken: vi.fn(async () => ({
        ok: true,
        token: "token",
        usesNativeConvexIntegration: true,
      })),
    }));
    vi.doMock("@/lib/auth/convexServerClient", () => ({
      createAuthenticatedConvexClient: vi.fn(() => ({ ok: true, client: mockClient })),
    }));

    const { getNexusAccess } = await import("@/lib/auth/getNexusAccess");
    const access = await getNexusAccess();
    expect(access.state).toBe("pending");
    expect(access.primaryEmail).toBe("pending@example.com");
  });

  it("returns suspended for suspended users", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_live_abc");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_live_abc");
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://happy-fox-123.convex.cloud");

    const mockClient = {
      mutation: vi.fn(async () => ({ status: "active" })),
      query: vi.fn(async () => ({
        state: "suspended",
        clerkUserId: "user_2",
      })),
    };

    vi.doMock("@clerk/nextjs/server", () => ({
      auth: vi.fn(async () => ({ userId: "user_2" })),
    }));
    vi.doMock("@/lib/auth/clerkConvexToken", () => ({
      getClerkConvexSessionToken: vi.fn(async () => ({
        ok: true,
        token: "token",
        usesNativeConvexIntegration: true,
      })),
    }));
    vi.doMock("@/lib/auth/convexServerClient", () => ({
      createAuthenticatedConvexClient: vi.fn(() => ({ ok: true, client: mockClient })),
    }));

    const { getNexusAccess } = await import("@/lib/auth/getNexusAccess");
    const access = await getNexusAccess();
    expect(access.state).toBe("suspended");
  });

  it("returns approved for active knowledge_reader", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_live_abc");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_live_abc");
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://happy-fox-123.convex.cloud");

    const mockClient = {
      mutation: vi.fn(async () => ({ status: "active" })),
      query: vi.fn(async () => ({
        state: "approved",
        clerkUserId: "user_3",
        primaryEmail: "reader@example.com",
        displayName: "Reader",
        roles: ["knowledge_reader"],
      })),
    };

    vi.doMock("@clerk/nextjs/server", () => ({
      auth: vi.fn(async () => ({ userId: "user_3" })),
    }));
    vi.doMock("@/lib/auth/clerkConvexToken", () => ({
      getClerkConvexSessionToken: vi.fn(async () => ({
        ok: true,
        token: "token",
        usesNativeConvexIntegration: true,
      })),
    }));
    vi.doMock("@/lib/auth/convexServerClient", () => ({
      createAuthenticatedConvexClient: vi.fn(() => ({ ok: true, client: mockClient })),
    }));

    const { getNexusAccess } = await import("@/lib/auth/getNexusAccess");
    const access = await getNexusAccess();
    expect(access.state).toBe("approved");
    expect(access.roles).toContain("knowledge_reader");
  });

  it("returns approved_without_role when active user has no roles", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_live_abc");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_live_abc");
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://happy-fox-123.convex.cloud");

    const mockClient = {
      mutation: vi.fn(async () => ({ status: "active" })),
      query: vi.fn(async () => ({
        state: "approved_without_role",
        clerkUserId: "user_4",
        primaryEmail: "norole@example.com",
      })),
    };

    vi.doMock("@clerk/nextjs/server", () => ({
      auth: vi.fn(async () => ({ userId: "user_4" })),
    }));
    vi.doMock("@/lib/auth/clerkConvexToken", () => ({
      getClerkConvexSessionToken: vi.fn(async () => ({
        ok: true,
        token: "token",
        usesNativeConvexIntegration: true,
      })),
    }));
    vi.doMock("@/lib/auth/convexServerClient", () => ({
      createAuthenticatedConvexClient: vi.fn(() => ({ ok: true, client: mockClient })),
    }));

    const { getNexusAccess } = await import("@/lib/auth/getNexusAccess");
    const access = await getNexusAccess();
    expect(access.state).toBe("approved_without_role");
  });

  it("fails closed in production without Clerk configuration", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "your_clerk_publishable_key");
    vi.stubEnv("CLERK_SECRET_KEY", "your_clerk_secret_key");
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "your_convex_deployment_url");

    expect(isProductionFailClosed()).toBe(true);

    vi.doMock("@clerk/nextjs/server", () => ({
      auth: vi.fn(async () => ({ userId: "user_x", getToken: vi.fn() })),
    }));

    const { getNexusAccess } = await import("@/lib/auth/getNexusAccess");
    const access = await getNexusAccess();
    expect(access.state).toBe("configuration_required");
  });
});

describe("Nexus P4 routing policy", () => {
  it("home page routes through the shared access resolver", () => {
    const pageSrc = readFileSync(path.join(ROOT, "app/page.tsx"), "utf8");
    expect(pageSrc).toContain("nexusAccessRedirectPath");
    expect(pageSrc).toContain("getNexusAccess");
  });

  it("admin page requires nexus_admin role server-side", () => {
    const pageSrc = readFileSync(path.join(ROOT, "app/admin/access/page.tsx"), "utf8");
    expect(pageSrc).toContain('"nexus_admin"');
    expect(pageSrc).toContain("ToolPageFrame");
    expect(pageSrc).toContain("requiredRole");
  });

  it("proxy marks pending, suspended, and webhook routes as public", () => {
    const proxySrc = readFileSync(path.join(ROOT, "proxy.ts"), "utf8");
    expect(proxySrc).toContain("/pending-approval");
    expect(proxySrc).toContain("/access-suspended");
    expect(proxySrc).toContain("/identity-setup-required");
    expect(proxySrc).toContain("/api/webhooks/clerk");
  });
});

describe("Nexus P4 last-admin safety", () => {
  it("revokeRoleInternal blocks revoking the last nexus_admin", () => {
    const src = readFileSync(path.join(ROOT, "convex/roles.ts"), "utf8");
    expect(src).toContain("LAST_ADMIN");
    expect(src).toContain("activeAdmins <= 1");
  });

  it("suspendUser blocks suspending the last nexus_admin", () => {
    const src = readFileSync(path.join(ROOT, "convex/admin.ts"), "utf8");
    expect(src).toContain("LAST_ADMIN");
    expect(src).toContain("countActiveAdmins");
  });
});

describe("Nexus P4 Clerk webhook route", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("requires webhook signature verification", async () => {
    vi.stubEnv("CLERK_WEBHOOK_SECRET", "whsec_abc123");
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://happy-fox-123.convex.cloud");
    vi.stubEnv("NEXUS_INTERNAL_API_SECRET", "internal_abc123");

    vi.doMock("@clerk/nextjs/webhooks", () => ({
      verifyWebhook: vi.fn(async () => {
        throw new Error("invalid signature");
      }),
    }));

    const { POST } = await import("@/app/api/webhooks/clerk/route");
    const response = await POST(
      new Request("http://localhost/api/webhooks/clerk", {
        method: "POST",
        body: "{}",
        headers: { "svix-id": "evt_bad" },
      }) as import("next/server").NextRequest,
    );
    expect(response.status).toBe(400);
  });

  it("returns 503 when webhook secrets are not configured", async () => {
    vi.stubEnv("CLERK_WEBHOOK_SECRET", "your_clerk_webhook_signing_secret");
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "your_convex_deployment_url");
    vi.stubEnv("NEXUS_INTERNAL_API_SECRET", "your_internal_api_secret");

    const { POST } = await import("@/app/api/webhooks/clerk/route");
    const response = await POST(
      new Request("http://localhost/api/webhooks/clerk", {
        method: "POST",
        body: "{}",
        headers: { "svix-id": "evt_bad" },
      }) as import("next/server").NextRequest,
    );
    expect(response.status).toBe(503);
  });

  it("processes verified events idempotently via Convex dedupe key", async () => {
    vi.stubEnv("CLERK_WEBHOOK_SECRET", "whsec_abc123");
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://happy-fox-123.convex.cloud");
    vi.stubEnv("NEXUS_INTERNAL_API_SECRET", "internal_abc123");

    const mutation = vi.fn(async () => ({ duplicate: false }));
    vi.doMock("convex/browser", () => ({
      ConvexHttpClient: vi.fn(() => ({ mutation })),
    }));
    vi.doMock("@clerk/nextjs/webhooks", () => ({
      verifyWebhook: vi.fn(async () => ({
        type: "user.created",
        data: { id: "user_w1", email_addresses: [{ email_address: "new@example.com" }] },
      })),
    }));

    const { POST } = await import("@/app/api/webhooks/clerk/route");
    const makeRequest = () =>
      new Request("http://localhost/api/webhooks/clerk", {
        method: "POST",
        body: "{}",
        headers: { "svix-id": "evt_1" },
      });
    const first = await POST(makeRequest() as import("next/server").NextRequest);
    const second = await POST(makeRequest() as import("next/server").NextRequest);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mutation).toHaveBeenCalledTimes(2);
    expect(mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventId: "evt_1", eventType: "user.created" }),
    );
  });

  it("deactivates roles on Clerk user deletion in webhook ingest", () => {
    const src = readFileSync(path.join(ROOT, "convex/webhookIngest.ts"), "utf8");
    expect(src).toContain("user.deleted");
    expect(src).toContain("deactivateAllRoles");
    expect(src).toContain("dedupeKey");
    expect(src).not.toContain("@unknown.local");
  });
});

describe("Nexus P4 secret hygiene", () => {
  it("does not expose server secrets via NEXT_PUBLIC env helpers", () => {
    const envSrc = readFileSync(path.join(ROOT, "lib/env.ts"), "utf8");
    expect(envSrc).not.toContain(["NEXT_PUBLIC_CLERK_", "SECRET_KEY"].join(""));
    expect(getEnvStatus().clerk).toBe(false);
  });

  it(".env.example documents server-only secrets without real values", () => {
    const example = readFileSync(path.join(ROOT, ".env.example"), "utf8");
    expect(example).toContain("CLERK_SECRET_KEY=");
    expect(example).toContain("CLERK_WEBHOOK_SECRET=");
    expect(example).not.toMatch(/sk_live_|whsec_[a-zA-Z0-9]{10,}/);
  });
});
