import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Records every useQuery call so we can assert the admin queries are gated
// ("skip") until Convex confirms an authenticated session.
const queryCalls = vi.hoisted(() => [] as Array<{ fn: unknown; args: unknown }>);
const authState = vi.hoisted(() => ({
  isLoading: false,
  isAuthenticated: true,
  isRefreshing: false,
}));

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useQuery: (fn: unknown, args: unknown) => {
    queryCalls.push({ fn, args });
    return undefined;
  },
  useMutation: () => vi.fn(),
  useConvexAuth: () => ({ ...authState }),
}));

import { AccessAdminPanel } from "@/components/admin/AccessAdminPanel";

// AccessAdminPanel issues exactly three useQuery calls (pending/active/suspended
// listUsersByStatus), so the recorded args ARE the admin-query args.
function recordedQueryArgs(): unknown[] {
  return queryCalls.map((c) => c.args);
}

beforeEach(() => {
  queryCalls.length = 0;
  authState.isLoading = false;
  authState.isAuthenticated = true;
  authState.isRefreshing = false;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("AccessAdminPanel auth gating", () => {
  it("skips admin queries until Convex auth is ready (prevents hard-refresh crash)", () => {
    authState.isAuthenticated = false; // Clerk signed in, Convex token not yet exchanged
    render(<AccessAdminPanel />);

    const args = recordedQueryArgs();
    expect(args.length).toBe(3);
    expect(args.every((a) => a === "skip")).toBe(true);
  });

  it("issues the admin queries once Convex auth is confirmed", () => {
    render(<AccessAdminPanel />);

    const args = recordedQueryArgs();
    expect(args).toEqual(
      expect.arrayContaining([
        { status: "pending" },
        { status: "active" },
        { status: "suspended" },
      ]),
    );
    expect(args).not.toContain("skip");
  });

  it("does not run queries while Convex is refreshing its token", () => {
    authState.isRefreshing = true;
    render(<AccessAdminPanel />);

    const args = recordedQueryArgs();
    expect(args.length).toBe(3);
    expect(args.every((a) => a === "skip")).toBe(true);
  });
});
