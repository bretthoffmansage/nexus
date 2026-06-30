import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("Nexus P4.1 Clerk integration", () => {
  it("keeps the Nexus auth shell wrapper on sign-in", () => {
    const signIn = read("app/sign-in/[[...sign-in]]/page.tsx");
    expect(signIn).toContain("NexusAuthShell");
    expect(signIn).toContain("ClerkSignInPanel");
    expect(signIn).not.toMatch(/type=["']password["']/);
    expect(signIn).not.toMatch(/#username|username.*password/i);
  });

  it("embeds Clerk SignIn inside the shared auth shell", () => {
    const panel = read("components/auth/ClerkSignInPanel.tsx");
    expect(panel).toContain('from "@clerk/nextjs"');
    expect(panel).toContain("<SignIn");
    expect(panel).toContain("nexusClerkAppearance");
  });

  it("uses the shared auth shell for sign-up when enabled", () => {
    const signUp = read("app/sign-up/[[...sign-up]]/page.tsx");
    expect(signUp).toContain("NexusAuthShell");
    expect(signUp).toContain("ClerkSignUpPanel");
    expect(signUp).toContain("pending");
  });

  it("places ClerkProvider inside body via AppProviders only", () => {
    const layout = read("app/layout.tsx");
    const providers = read("components/providers/AppProviders.tsx");
    expect(layout).toContain("<body>");
    expect(layout).not.toContain("ClerkProvider");
    expect(providers).toContain("ClerkProvider");
    expect(layout).toMatch(/<body>[\s\S]*<AppProviders/);
  });

  it("keeps sign-in and sign-up routes public in proxy", () => {
    const proxy = read("proxy.ts");
    expect(proxy).toContain("/sign-in(.*)");
    expect(proxy).toContain("/sign-up(.*)");
    expect(proxy).toContain("/__clerk/:path*");
    expect(proxy).toContain("/(api|trpc)(.*)");
  });

  it("does not introduce @clerk/clerk-react", () => {
    const pkg = read("package.json");
    expect(pkg).not.toContain("@clerk/clerk-react");
    expect(pkg).toContain("@clerk/nextjs");
  });

  it("does not expose Clerk secret keys in client modules", () => {
    const providers = read("components/providers/AppProviders.tsx");
    const panel = read("components/auth/ClerkSignInPanel.tsx");
    expect(providers).not.toContain("CLERK_SECRET_KEY");
    expect(panel).not.toContain("CLERK_SECRET_KEY");
    expect(providers).not.toContain(["NEXT_PUBLIC_CLERK_", "SECRET"].join(""));
  });

  it("keeps UserButton in the signed-in shell", () => {
    const sidebar = read("components/layout/Sidebar.tsx");
    expect(sidebar).toContain("UserButton");
  });

  it("preserves Convex-based pending routing", () => {
    const home = read("app/page.tsx");
    const access = read("lib/auth/getNexusAccess.ts");
    expect(home).toContain('redirect("/pending-approval")');
    expect(access).toContain("api.users.currentUserAccess");
    expect(access).not.toMatch(/args\.role/);
  });

  it("keeps production fail-closed behavior", () => {
    const access = read("lib/auth/getNexusAccess.ts");
    const layout = read("app/layout.tsx");
    expect(access).toContain("isProductionFailClosed");
    expect(layout).toContain('process.env.NODE_ENV !== "production"');
  });
});
