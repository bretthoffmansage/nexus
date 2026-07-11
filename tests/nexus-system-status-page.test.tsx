// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StatusWorkspace } from "@/components/workspace/port/StatusWorkspace";
import { SYSTEM_COMPONENT_KEYS, P6_SYSTEM_STATUS } from "@/convex/lib/systemStatus";
import { P6_LEASE } from "@/convex/lib/p6config";
import { deriveSystemStatusCards } from "@/lib/nexus/systemStatusView";

const ROOT = path.resolve(import.meta.dirname, "..");

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useQuery: () => ({
    configured: true,
    presence: "online_idle",
    lastHeartbeatAt: Date.now() - 5_000,
    operatingState: "idle",
    softwareVersion: "claudia-p7-connector-v1",
    hasSystemStatus: true,
    snapshotObservedAt: Date.now() - 5_000,
    components: Object.fromEntries(
      SYSTEM_COMPONENT_KEYS.map((key) => [
        key,
        { active: true, observedAt: Date.now() - 5_000 },
      ]),
    ),
  }),
  useConvexAuth: () => ({ isLoading: false, isAuthenticated: true, isRefreshing: false }),
}));

const CARD_TITLES = [
  "Nexus Core API",
  "Console Connector",
  "Vault Retrieval",
  "Vault",
  "Cursor CLI",
  "Codex CLI",
  "Claude CLI",
  "Cleanup & Storage",
];

describe("Nexus system status page", () => {
  it("renders the updated subtitle and eight cards without the legacy banner", () => {
    render(<StatusWorkspace />);
    expect(screen.getByRole("heading", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByText("Nexus system connectivity and service health")).toBeInTheDocument();
    expect(screen.queryByText("Partially available")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/interface is available; some actions remain disabled/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Connector presence and Nexus diagnostics/i)).not.toBeInTheDocument();
    for (const title of CARD_TITLES) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(document.querySelectorAll(".system-status-card").length).toBe(8);
  });

  it("renders the Cursor CLI card with the same style as Claude and Codex", () => {
    render(<StatusWorkspace />);
    const cursorHeading = screen.getByRole("heading", { name: "Cursor CLI" });
    const cursorCard = cursorHeading.closest(".system-status-card");
    const claudeCard = screen
      .getByRole("heading", { name: "Claude CLI" })
      .closest(".system-status-card");
    expect(cursorCard).not.toBeNull();
    expect(cursorCard?.className).toBe(claudeCard?.className);
    expect(
      screen.getByText("Cursor command-line runtime used by governed system workflows."),
    ).toBeInTheDocument();
  });

  it("shows green indicators only for live cards and omits yellow connector copy", () => {
    render(<StatusWorkspace />);
    expect(screen.queryByText(/System online/i)).not.toBeInTheDocument();
    expect(document.querySelectorAll(".system-status-dot--live").length).toBe(8);
    expect(document.querySelector(".nexus-presence-dot")).toBeNull();
  });

  it("does not render paths, URLs, or raw payload fields", () => {
    for (const file of [
      "components/workspace/port/StatusWorkspace.tsx",
      "components/status/SystemStatusPanel.tsx",
      "lib/nexus/systemStatusView.ts",
    ]) {
      const content = readFileSync(path.join(ROOT, file), "utf8");
      expect(content).not.toMatch(/localhost/i);
      expect(content).not.toMatch(/127\.0\.0\.1/);
      expect(content).not.toContain("snapshotId");
      expect(content).not.toContain("sessionId");
    }
  });
});

describe("System status view-model guards", () => {
  const now = Date.parse("2026-07-02T16:00:00Z");

  it("uses the CLI freshness threshold for Claude and Codex", () => {
    const freshCli = now - 60_000;
    const staleCli = now - P6_SYSTEM_STATUS.cliObservationTtlMs - 1;
    const base = {
      configured: true,
      presence: "online_idle",
      lastHeartbeatAt: now - 5_000,
      operatingState: "idle",
      softwareVersion: null,
      hasSystemStatus: true,
      snapshotObservedAt: now - 5_000,
      components: Object.fromEntries(
        SYSTEM_COMPONENT_KEYS.map((key) => [
          key,
          { active: true, observedAt: key === "claude_cli" ? staleCli : freshCli },
        ]),
      ) as never,
    };
    const cards = deriveSystemStatusCards(base, now);
    expect(cards.find((card) => card.key === "claude_cli")?.live).toBe(false);
    expect(cards.find((card) => card.key === "codex_cli")?.live).toBe(true);
  });

  it("simulates power loss after the Connector TTL", () => {
    const stale = now - P6_LEASE.connectorOfflineThresholdMs - 1;
    const cards = deriveSystemStatusCards(
      {
        configured: true,
        presence: "offline",
        lastHeartbeatAt: stale,
        operatingState: "idle",
        softwareVersion: null,
        hasSystemStatus: true,
        snapshotObservedAt: now - 5_000,
        components: Object.fromEntries(
          SYSTEM_COMPONENT_KEYS.map((key) => [
            key,
            { active: true, observedAt: now - 5_000 },
          ]),
        ) as never,
      },
      now,
    );
    expect(cards.every((card) => !card.live)).toBe(true);
  });
});
