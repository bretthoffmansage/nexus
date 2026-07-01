import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// Override just the Convex hooks so these render tests don't need a live client.
// Convex auth defaults to "ready" here; P5.1 readiness-transition scenarios
// (loading/unauthenticated/sign-out/account-switch) live in
// tests/nexus-p5-1-auth-readiness.test.tsx, which mocks useConvexAuth per case.
vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useQuery: () => undefined,
  useMutation: () => async () => undefined,
  useConvexAuth: () => ({ isLoading: false, isAuthenticated: true, isRefreshing: false }),
}));

import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatSessionProvider } from "@/components/chat/ChatSessionContext";
import { NexusChatWorkspace } from "@/components/chat/NexusChatWorkspace";
import { TasksWorkspace } from "@/components/workspace/port/TasksWorkspace";
import { ToolAvailabilityBanner } from "@/components/workspace/ToolAvailabilityBanner";

describe("P5 ChatComposer", () => {
  it("is enabled and submits trimmed text, clearing on success", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ChatComposer disabled={false} onSubmit={onSubmit} />);

    const input = screen.getByLabelText(/Message Nexus/i);
    expect(input).not.toBeDisabled();
    await user.type(input, "  hello vault  ");
    await user.click(screen.getByRole("button", { name: /Send/i }));

    expect(onSubmit).toHaveBeenCalledWith("hello vault", "vault.agentic_retrieval");
    expect(input).toHaveValue("");
  });

  it("stays disabled and shows the help text when not allowed to submit", () => {
    render(<ChatComposer disabled onSubmit={vi.fn()} helpText="Sign in to submit" />);
    expect(screen.getByLabelText(/Message Nexus/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /Send/i })).toBeDisabled();
    expect(screen.getByText("Sign in to submit")).toBeInTheDocument();
  });

  it("surfaces an error message when provided", () => {
    render(<ChatComposer disabled={false} onSubmit={vi.fn()} errorText="Submission failed" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Submission failed");
  });
});

describe("P5 Nexus Chat workspace (approved reader)", () => {
  it("enables the composer and shows connector-absent messaging", () => {
    render(
      <ChatSessionProvider canSubmit>
        <NexusChatWorkspace />
      </ChatSessionProvider>,
    );
    expect(screen.getByRole("heading", { name: "Nexus Chat" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Message Nexus/i)).not.toBeDisabled();
    expect(screen.getByText(/waiting for the Claudia Connector|Execution waits for the Claudia Connector/i)).toBeInTheDocument();
  });

  it("keeps the composer disabled for users who cannot submit", () => {
    render(
      <ChatSessionProvider canSubmit={false}>
        <NexusChatWorkspace />
      </ChatSessionProvider>,
    );
    expect(screen.getByLabelText(/Message Nexus/i)).toBeDisabled();
  });
});

describe("P5 Tasks workspace", () => {
  it("announces persistence-available with execution pending", () => {
    render(<TasksWorkspace canQuery={false} />);
    expect(screen.getByText(/Saved · execution pending/i)).toBeInTheDocument();
    expect(screen.getByText(/available to approved knowledge readers/i)).toBeInTheDocument();
    // Preserves the legacy scheduled-prompt editor as a separate section.
    expect(screen.getByText(/Scheduled recurring prompts/i)).toBeInTheDocument();
  });
});

describe("P5 availability banner", () => {
  it("explains the persistence vs execution split", () => {
    render(<ToolAvailabilityBanner availability="persistence_available" />);
    expect(screen.getByText(/saved and queued privately/i)).toBeInTheDocument();
    expect(screen.getByText(/Claudia Connector/i)).toBeInTheDocument();
  });
});
