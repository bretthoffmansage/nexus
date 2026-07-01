import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  isLoading: false,
  isAuthenticated: true,
}));

const queryCalls = vi.hoisted(() => [] as Array<{ fn: unknown; args: unknown }>);
const queryResults = vi.hoisted(() => new Map<unknown, unknown>());
const mutationFn = vi.hoisted(() => vi.fn(async () => ({})));
const actionFn = vi.hoisted(() => vi.fn(async () => ({ documentVersionId: "ver_create_1" })));

const uploadLibraryFileFn = vi.hoisted(() =>
  vi.fn(async () => ({ documentVersionId: "ver_create_1" })),
);

vi.mock("@/lib/nexus/libraryUploadFlow", () => ({
  uploadLibraryFile: uploadLibraryFileFn,
}));

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useQuery: (fn: unknown, args: unknown) => {
    queryCalls.push({ fn, args });
    if (args === "skip") return undefined;
    return queryResults.get(fn) ?? [];
  },
  useMutation: () => mutationFn,
  useAction: () => actionFn,
  useConvexAuth: () => ({ ...authState, isRefreshing: false }),
}));

import { DocumentsWorkspace } from "@/components/workspace/port/DocumentsWorkspace";
import { nexusLibrary } from "@/lib/nexus/libraryClient";

beforeEach(() => {
  queryCalls.length = 0;
  queryResults.clear();
  mutationFn.mockClear();
  actionFn.mockClear();
  uploadLibraryFileFn.mockClear();
  authState.isLoading = false;
  authState.isAuthenticated = true;
  vi.stubGlobal(
    "crypto",
    {
      randomUUID: () => "test-uuid",
      subtle: {
        digest: async () => new Uint8Array(32).buffer,
      },
    } as Crypto,
  );
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ storageId: "storage_1" }),
  })) as unknown as typeof fetch;
});

describe("Library auth and Create view", () => {
  it("does not show stale sign-in copy when Convex auth is ready", () => {
    render(<DocumentsWorkspace />);
    expect(screen.queryByText("Sign in to use the Library.")).not.toBeInTheDocument();
  });

  it("shows sign-in only when unauthenticated", () => {
    authState.isAuthenticated = false;
    render(<DocumentsWorkspace />);
    expect(screen.getByText("Sign in to use the Library.")).toBeInTheDocument();
  });

  it("enables Choose files when auth is ready", () => {
    render(<DocumentsWorkspace />);
    expect(screen.getByRole("button", { name: "Choose files" })).toBeEnabled();
  });

  it("Create is detached and switches view mode", async () => {
    const user = userEvent.setup();
    render(<DocumentsWorkspace />);
    await user.click(screen.getByRole("tab", { name: "Create" }));
    expect(screen.getByLabelText("Markdown draft")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Choose files" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Queued" }));
    expect(screen.getByRole("button", { name: "Choose files" })).toBeInTheDocument();
    const lastList = queryCalls.filter((c) => c.fn === nexusLibrary.listVersions).at(-1);
    expect(lastList?.args).toMatchObject({ statusFilter: "queued" });
  });

  it("Clear confirmation preserves text on No", async () => {
    const user = userEvent.setup();
    render(<DocumentsWorkspace />);
    await user.click(screen.getByRole("tab", { name: "Create" }));
    const area = screen.getByLabelText("Markdown draft");
    await user.type(area, "keep me");
    await user.click(screen.getByRole("button", { name: "Clear" }));
    await user.click(screen.getByRole("button", { name: "No" }));
    expect(area).toHaveValue("keep me");
  });

  it("Submit Yes uploads and queues through canonical mutations", async () => {
    const user = userEvent.setup();
    const processSpy = vi.fn(async () => ({}));
    mutationFn.mockImplementation(processSpy);
    render(<DocumentsWorkspace />);
    await user.click(screen.getByRole("tab", { name: "Create" }));
    await user.type(screen.getByLabelText("Markdown draft"), "# hello");
    await user.click(screen.getByRole("button", { name: "Submit to Vault" }));
    await user.click(screen.getByRole("button", { name: "Yes" }));
    expect(uploadLibraryFileFn).toHaveBeenCalled();
    expect(processSpy).toHaveBeenCalled();
    expect(screen.getByText(/queued for vault processing/i)).toBeInTheDocument();
  });
});
