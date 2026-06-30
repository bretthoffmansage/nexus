import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseBootstrapAdminEmails } from "@/convex/lib/bootstrap";
import {
  describeIdentityClaimShape,
  getClerkUserId,
  getVerifiedPrimaryEmail,
  isPlaceholderEmail,
  normalizeEmail,
} from "@/convex/lib/identity";

const ROOT = path.resolve(__dirname, "..");

function mockIdentity(overrides: Record<string, unknown> = {}) {
  return {
    subject: "user_abc123",
    tokenIdentifier: "https://issuer.example|user_abc123",
    issuer: "https://issuer.example",
    ...overrides,
  } as import("convex/server").UserIdentity;
}

describe("Nexus P4.3 identity claims", () => {
  it("maps identity.subject to Clerk user ID", () => {
    const identity = mockIdentity({ subject: "user_clerk_1" });
    expect(getClerkUserId(identity)).toBe("user_clerk_1");
  });

  it("normalizes verified email claim", () => {
    const identity = mockIdentity({ email: "  Admin@Example.com  " });
    expect(getVerifiedPrimaryEmail(identity)).toBe("admin@example.com");
  });

  it("does not create unknown.local for missing email", () => {
    const identity = mockIdentity();
    expect(getVerifiedPrimaryEmail(identity)).toBeUndefined();
    const usersSrc = readFileSync(path.join(ROOT, "convex/users.ts"), "utf8");
    expect(usersSrc).not.toContain("@unknown.local");
    const webhookSrc = readFileSync(path.join(ROOT, "convex/webhookIngest.ts"), "utf8");
    expect(webhookSrc).not.toContain("@unknown.local");
  });

  it("rejects placeholder emails as verified identity", () => {
    const identity = mockIdentity({ email: "user_abc@unknown.local" });
    expect(getVerifiedPrimaryEmail(identity)).toBeUndefined();
    expect(isPlaceholderEmail("user_abc@unknown.local")).toBe(true);
  });

  it("missing email never bootstraps via shouldBootstrapAdmin contract", () => {
    const bootstrapSrc = readFileSync(path.join(ROOT, "convex/lib/bootstrap.ts"), "utf8");
    expect(bootstrapSrc).toContain("normalizeEmail");
    expect(parseBootstrapAdminEmails()).toEqual([]);
    expect(
      parseBootstrapAdminEmails().includes(normalizeEmail("")),
    ).toBe(false);
  });

  it("maps missing email to identity_claims_incomplete access state", () => {
    const accessSrc = readFileSync(path.join(ROOT, "lib/auth/getNexusAccess.ts"), "utf8");
    expect(accessSrc).toContain("identity_claims_incomplete");
    const routingSrc = readFileSync(path.join(ROOT, "lib/auth/nexusAccessRouting.ts"), "utf8");
    expect(routingSrc).toContain("/identity-setup-required");
    const usersSrc = readFileSync(path.join(ROOT, "convex/users.ts"), "utf8");
    expect(usersSrc).toContain("identity_claims_incomplete");
  });

  it("ignores browser-supplied email for Convex identity authority", () => {
    const usersSrc = readFileSync(path.join(ROOT, "convex/users.ts"), "utf8");
    expect(usersSrc).not.toMatch(/args\.(email|primaryEmail)/);
    const identitySrc = readFileSync(path.join(ROOT, "convex/lib/identity.ts"), "utf8");
    expect(identitySrc).toContain("identity.email");
    expect(identitySrc).not.toContain("primary_email_address");
  });

  it("repairs placeholder email by Clerk user ID in provisioning helper", () => {
    const src = readFileSync(path.join(ROOT, "convex/lib/userProvisioning.ts"), "utf8");
    expect(src).toContain("repairPlaceholderEmail");
    expect(src).toContain("identity_email_repaired");
    expect(src).toContain("isPlaceholderEmail");
  });

  it("bootstrap grants nexus_admin and knowledge_reader", () => {
    const src = readFileSync(path.join(ROOT, "convex/lib/userProvisioning.ts"), "utf8");
    expect(src).toContain("grantBootstrapRoles");
    const bootstrapSrc = readFileSync(path.join(ROOT, "convex/lib/bootstrap.ts"), "utf8");
    expect(bootstrapSrc).toContain('"nexus_admin"');
    expect(bootstrapSrc).toContain('"knowledge_reader"');
  });

  it("bootstrap actor remains system:bootstrap", () => {
    const src = readFileSync(path.join(ROOT, "convex/lib/userProvisioning.ts"), "utf8");
    expect(src).toContain("system:bootstrap");
  });

  it("bootstrap comparison is normalized exact match", () => {
    process.env.NEXUS_BOOTSTRAP_ADMIN_EMAILS = " Admin@Example.com ";
    expect(parseBootstrapAdminEmails()).toEqual(["admin@example.com"]);
    delete process.env.NEXUS_BOOTSTRAP_ADMIN_EMAILS;
    const bootstrapSrc = readFileSync(path.join(ROOT, "convex/lib/bootstrap.ts"), "utf8");
    expect(bootstrapSrc).not.toMatch(/includes\(.*@/);
    expect(bootstrapSrc).not.toContain("wildcard");
  });

  it("rejects username as email substitute", () => {
    const identity = mockIdentity({ name: "operator", nickname: "operator_user" });
    expect(getVerifiedPrimaryEmail(identity)).toBeUndefined();
  });

  it("describes identity claim shape without values", () => {
    const shape = describeIdentityClaimShape(
      mockIdentity({ email: "secret@example.com", name: "Secret Name" }),
    );
    expect(shape.email).toBe("string");
    expect(shape.name).toBe("string");
    expect(shape).not.toHaveProperty("tokenIdentifier");
    expect(JSON.stringify(shape)).not.toContain("secret@example.com");
  });

  it("Convex auth config keeps applicationID convex", () => {
    const src = readFileSync(path.join(ROOT, "convex/auth.config.ts"), "utf8");
    expect(src).toContain('applicationID: "convex"');
    expect(src).toContain("CLERK_FRONTEND_API_URL");
  });

  it("auth card layout remains full-viewport centered from P4.2", () => {
    const css = readFileSync(path.join(ROOT, "styles/auth.css"), "utf8");
    expect(css).toContain("nexus-auth-stage");
    expect(css).toContain("place-items: center");
  });

  it("proxy allows identity-setup-required for signed-in users", () => {
    const proxySrc = readFileSync(path.join(ROOT, "proxy.ts"), "utf8");
    expect(proxySrc).toContain("/identity-setup-required");
  });

  it("last-admin safety remains intact", () => {
    const rolesSrc = readFileSync(path.join(ROOT, "convex/roles.ts"), "utf8");
    expect(rolesSrc).toContain("LAST_ADMIN");
    const adminSrc = readFileSync(path.join(ROOT, "convex/admin.ts"), "utf8");
    expect(adminSrc).toContain("countActiveAdmins");
  });

  it("pending and suspended routes remain separate from identity setup", () => {
    const routingSrc = readFileSync(path.join(ROOT, "lib/auth/nexusAccessRouting.ts"), "utf8");
    expect(routingSrc).toContain("/pending-approval");
    expect(routingSrc).toContain("/access-suspended");
  });

  it("mobile auth styles remain defined", () => {
    const css = readFileSync(path.join(ROOT, "styles/auth.css"), "utf8");
    expect(css).toMatch(/@media/);
  });
});
