import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * P6 — UI/status (Part AA). Convex hooks are mocked so these render tests do
 * not need a live client; `useConvexAuth` defaults to authenticated so the
 * live presence/history paths render.
 */
vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useQuery: () => undefined,
  useMutation: () => async () => undefined,
  useConvexAuth: () => ({ isLoading: false, isAuthenticated: true, isRefreshing: false }),
}));

import { ChatSessionProvider } from "@/components/chat/ChatSessionContext";
import { ChatEmptyState, NexusChatWorkspace } from "@/components/chat/NexusChatWorkspace";
import { ClaudiaPresenceLive } from "@/components/status/ClaudiaPresenceLive";
import { StatusWorkspace } from "@/components/workspace/port/StatusWorkspace";
import { connectorPresenceToClaudiaState } from "@/lib/nexus/connectorPresence";

describe("P6 Connector presence mapping", () => {
  it("maps every P6 presence state to a truthful visual state", () => {
    expect(connectorPresenceToClaudiaState("online_idle")).toBe("online");
    expect(connectorPresenceToClaudiaState("online_busy")).toBe("busy");
    expect(connectorPresenceToClaudiaState("offline")).toBe("offline");
    expect(connectorPresenceToClaudiaState("degraded")).toBe("error");
    expect(connectorPresenceToClaudiaState("disabled")).toBe("not_configured");
    expect(connectorPresenceToClaudiaState("not_configured")).toBe("not_configured");
  });
});

describe("P6 Nexus Chat copy (Part AA)", () => {
  it("1-2. keeps the Nexus Chat heading and Welcome panel", () => {
    render(
      <ChatSessionProvider canSubmit>
        <NexusChatWorkspace />
      </ChatSessionProvider>,
    );
    expect(screen.getByRole("heading", { name: "Nexus Chat" })).toBeInTheDocument();
  });

  it("3-4. distinguishes persistence from execution, without stale 'planned' copy", () => {
    render(<ChatEmptyState />);
    expect(screen.getByText("Welcome")).toBeInTheDocument();
    const body = screen.getByText(/Nexus saves it privately and queues it/i);
    expect(body).toBeInTheDocument();
    // Stale "(planned)" markers are gone.
    expect(screen.queryByText(/\(planned\)/i)).not.toBeInTheDocument();
  });

  it("9. shows no fabricated answer in the empty state", () => {
    render(<ChatEmptyState />);
    expect(screen.queryByText(/^Answer:/i)).not.toBeInTheDocument();
  });
});

describe("P6 Connector status card (Part AA)", () => {
  it("5. renders the truthful not-configured presence while status is unknown", () => {
    // useQuery mocked → undefined → falls back to not_configured.
    render(<ClaudiaPresenceLive />);
    expect(screen.getByText(/Connector not configured/i)).toBeInTheDocument();
    expect(screen.queryByText(/Claudia online/i)).not.toBeInTheDocument();
  });

  it("10-11. status workspace exposes no private task content", () => {
    render(<StatusWorkspace />);
    expect(screen.getByRole("heading", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByText(/Execution begins when the Claudia Connector is online/i)).toBeInTheDocument();
  });
});
