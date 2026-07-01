import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatWorkspace } from "@/components/chat/ChatWorkspace";
import { ThemeProvider } from "@/components/providers/ThemeProvider";

// The chat workspace now uses Convex hooks; override just those two so the
// render test does not require a live ConvexProvider (the real app has one).
vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useQuery: () => undefined,
  useMutation: () => async () => undefined,
}));

function renderWithTheme(ui: React.ReactNode) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("Nexus branding", () => {
  it("renders Nexus Chat heading", () => {
    renderWithTheme(<ChatWorkspace />);
    expect(screen.getByRole("heading", { level: 1, name: "Nexus Chat" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Ask Nexus/i)).toBeInTheDocument();
  });

  it("does not show Claudia Console as hosted product title", () => {
    renderWithTheme(<ChatWorkspace />);
    expect(screen.queryByText(/Claudia Console/i)).not.toBeInTheDocument();
  });
});
