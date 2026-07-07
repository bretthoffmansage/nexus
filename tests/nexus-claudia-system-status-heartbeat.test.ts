// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import {
  CLAUDIA_SYSTEM_COMPONENT_KEYS,
  CLAUDIA_SYSTEM_STATUS_CONTRACT_VERSION,
  parseClaudiaSystemStatus,
  parseUtcInstantZ,
} from "@/convex/lib/claudiaSystemStatus";
import { P6_LEASE } from "@/convex/lib/p6config";
import { deriveClaudiaSystemStatusCards } from "@/lib/nexus/claudiaSystemStatusView";
import { IDENTITY_A, p5Test, seedApprovedReader } from "./helpers/convexP5";
import {
  clearConnectorEnv,
  fetchSigned,
  installConnectorEnv,
  seedConnector,
  TEST_CONNECTOR_ID,
} from "./helpers/convexP6";

const HEARTBEAT = "/api/connector/v1/heartbeat";

function validSystemStatus(overrides?: {
  observedAt?: string;
  components?: Record<string, { active: boolean; observedAt: string }>;
}) {
  const nowIso = "2026-07-02T16:00:00Z";
  const components = overrides?.components ?? Object.fromEntries(
    CLAUDIA_SYSTEM_COMPONENT_KEYS.map((key) => [key, { active: true, observedAt: nowIso }]),
  );
  return {
    contractVersion: CLAUDIA_SYSTEM_STATUS_CONTRACT_VERSION,
    snapshotId: "cc-7f3c2a1b-4d5e-6f70-8192-a3b4c5d6e7f8:fedcba987654",
    observedAt: overrides?.observedAt ?? nowIso,
    sessionId: "cc-7f3c2a1b-4d5e-6f70-8192-a3b4c5d6e7f8",
    components,
  };
}

beforeEach(() => installConnectorEnv());
afterEach(() => clearConnectorEnv());

describe("Claudia systemStatus heartbeat contract", () => {
  it("accepts heartbeats without systemStatus", async () => {
    const t = p5Test();
    await seedConnector(t);
    const res = await fetchSigned(t, { path: HEARTBEAT, body: { operatingState: "idle" } });
    expect(res.status).toBe(200);
    const row = await t.run(async (ctx) =>
      ctx.db
        .query("nexusConnectors")
        .withIndex("by_connector_id", (q) => q.eq("connectorId", TEST_CONNECTOR_ID))
        .unique(),
    );
    expect(row?.lastHeartbeatAt).toBeTypeOf("number");
    expect(row?.claudiaSystemStatus).toBeUndefined();
  });

  it("accepts and persists a valid systemStatus snapshot", async () => {
    const t = p5Test();
    await seedConnector(t);
    const res = await fetchSigned(t, {
      path: HEARTBEAT,
      body: { operatingState: "idle", systemStatus: validSystemStatus() },
    });
    expect(res.status).toBe(200);
    const row = await t.run(async (ctx) =>
      ctx.db
        .query("nexusConnectors")
        .withIndex("by_connector_id", (q) => q.eq("connectorId", TEST_CONNECTOR_ID))
        .unique(),
    );
    expect(row?.claudiaSystemStatus?.contractVersion).toBe(CLAUDIA_SYSTEM_STATUS_CONTRACT_VERSION);
    expect(row?.claudiaSystemStatus?.components?.core_api?.active).toBe(true);
    expect(row?.claudiaSystemStatus?.snapshotId).toContain(":");
    expect(JSON.stringify(row)).not.toContain("rawHeartbeat");
  });

  it("rejects unknown contract versions and unknown component keys", () => {
    expect(parseClaudiaSystemStatus(validSystemStatus())).not.toBeNull();
    expect(
      parseClaudiaSystemStatus({
        ...validSystemStatus(),
        contractVersion: "claudia_system_status_v2",
      }),
    ).toBeNull();
    expect(
      parseClaudiaSystemStatus({
        ...validSystemStatus(),
        components: { ...validSystemStatus().components, rogue_service: { active: true, observedAt: "2026-07-02T16:00:00Z" } },
      }),
    ).toBeNull();
  });

  it("fails closed on invalid timestamps and does not persist malformed snapshots", async () => {
    expect(parseUtcInstantZ("2026-07-02T16:00:00")).toBeNull();
    expect(
      parseClaudiaSystemStatus({
        ...validSystemStatus(),
        components: { core_api: { active: true, observedAt: "not-a-date" } },
      })?.components?.core_api,
    ).toBeUndefined();

    const t = p5Test();
    await seedConnector(t);
    await fetchSigned(t, {
      path: HEARTBEAT,
      body: { systemStatus: { contractVersion: "bad", components: {} } },
    });
    const row = await t.run(async (ctx) =>
      ctx.db
        .query("nexusConnectors")
        .withIndex("by_connector_id", (q) => q.eq("connectorId", TEST_CONNECTOR_ID))
        .unique(),
    );
    expect(row?.claudiaSystemStatus).toBeUndefined();
  });

  it("replaces snapshots with newer heartbeats and uses Nexus server receive time", async () => {
    const t = p5Test();
    await seedConnector(t);
    const before = Date.now();
    await fetchSigned(t, {
      path: HEARTBEAT,
      body: { systemStatus: validSystemStatus({ observedAt: "2026-07-02T15:00:00Z" }) },
    });
    await fetchSigned(t, {
      path: HEARTBEAT,
      body: { systemStatus: validSystemStatus({ observedAt: "2026-07-02T16:00:00Z" }) },
    });
    const row = await t.run(async (ctx) =>
      ctx.db
        .query("nexusConnectors")
        .withIndex("by_connector_id", (q) => q.eq("connectorId", TEST_CONNECTOR_ID))
        .unique(),
    );
    expect(row?.lastHeartbeatAt).toBeGreaterThanOrEqual(before);
    expect(row?.claudiaSystemStatus?.snapshotObservedAt).toBe(Date.parse("2026-07-02T16:00:00Z"));
  });
});

const SEVEN_LEGACY_KEYS = [
  "core_api",
  "nexus_connector",
  "viktor_retrieval",
  "sage_knowledge_base",
  "claude_cli",
  "codex_cli",
  "cleanup_storage",
] as const;

describe("Cursor CLI heartbeat contract (eighth component)", () => {
  it("accepts and persists a valid eight-component heartbeat including cursor_cli", async () => {
    const t = p5Test();
    await seedConnector(t);
    const res = await fetchSigned(t, {
      path: HEARTBEAT,
      body: { operatingState: "idle", systemStatus: validSystemStatus() },
    });
    expect(res.status).toBe(200);
    const row = await t.run(async (ctx) =>
      ctx.db
        .query("nexusConnectors")
        .withIndex("by_connector_id", (q) => q.eq("connectorId", TEST_CONNECTOR_ID))
        .unique(),
    );
    expect(row?.claudiaSystemStatus?.components?.cursor_cli?.active).toBe(true);
    expect(row?.claudiaSystemStatus?.components?.cursor_cli?.observedAt).toBe(
      Date.parse("2026-07-02T16:00:00Z"),
    );
  });

  it("accepts an older seven-component heartbeat without cursor_cli", async () => {
    const t = p5Test();
    await seedConnector(t);
    const legacyComponents = Object.fromEntries(
      SEVEN_LEGACY_KEYS.map((key) => [key, { active: true, observedAt: "2026-07-02T16:00:00Z" }]),
    );
    const res = await fetchSigned(t, {
      path: HEARTBEAT,
      body: { systemStatus: validSystemStatus({ components: legacyComponents }) },
    });
    expect(res.status).toBe(200);
    const row = await t.run(async (ctx) =>
      ctx.db
        .query("nexusConnectors")
        .withIndex("by_connector_id", (q) => q.eq("connectorId", TEST_CONNECTOR_ID))
        .unique(),
    );
    expect(row?.claudiaSystemStatus?.components?.claude_cli?.active).toBe(true);
    expect(row?.claudiaSystemStatus?.components?.cursor_cli).toBeUndefined();
  });

  it("recognizes cursor_cli as an allowlisted component key", () => {
    expect(CLAUDIA_SYSTEM_COMPONENT_KEYS).toContain("cursor_cli");
    const parsed = parseClaudiaSystemStatus(validSystemStatus());
    expect(parsed?.components?.cursor_cli?.active).toBe(true);
  });

  it("fails closed when cursor active is not boolean (drops only cursor)", () => {
    const parsed = parseClaudiaSystemStatus(
      validSystemStatus({
        components: {
          core_api: { active: true, observedAt: "2026-07-02T16:00:00Z" },
          cursor_cli: { active: "yes" as unknown as boolean, observedAt: "2026-07-02T16:00:00Z" },
        },
      }),
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.components?.cursor_cli).toBeUndefined();
    expect(parsed?.components?.core_api?.active).toBe(true);
  });

  it("fails closed on an invalid cursor observedAt", () => {
    const parsed = parseClaudiaSystemStatus(
      validSystemStatus({
        components: { cursor_cli: { active: true, observedAt: "2026-07-02 16:00:00" } },
      }),
    );
    expect(parsed?.components?.cursor_cli).toBeUndefined();
  });

  it("exposes cursor_cli through the private page query", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await seedConnector(t);
    await fetchSigned(t, { path: HEARTBEAT, body: { systemStatus: validSystemStatus() } });
    const page = await t
      .withIdentity(IDENTITY_A)
      .query(api.connectorRegistry.getClaudiaSystemStatusForPage, {});
    expect(page.components?.cursor_cli?.active).toBe(true);
  });
});

describe("Cursor CLI freshness derivation", () => {
  const now = Date.parse("2026-07-02T16:00:00Z");
  const freshBase = {
    configured: true as const,
    presence: "online_idle" as const,
    lastHeartbeatAt: now - 10_000,
    operatingState: "idle" as const,
    softwareVersion: null,
    hasSystemStatus: true as const,
    snapshotObservedAt: now - 10_000,
  };

  function cardsWithCursor(cursor: { active: boolean; observedAt: number } | null) {
    const components: Record<string, { active: boolean; observedAt: number }> = Object.fromEntries(
      CLAUDIA_SYSTEM_COMPONENT_KEYS.filter((k) => k !== "cursor_cli").map((key) => [
        key,
        { active: true, observedAt: now - 10_000 },
      ]),
    );
    if (cursor) components.cursor_cli = cursor;
    return deriveClaudiaSystemStatusCards({ ...freshBase, components: components as never }, now);
  }

  function cursorLive(cards: ReturnType<typeof deriveClaudiaSystemStatusCards>) {
    return cards.find((c) => c.key === "cursor_cli")?.live;
  }

  it("is green when active and fresh with a fresh heartbeat and snapshot", () => {
    expect(cursorLive(cardsWithCursor({ active: true, observedAt: now - 10_000 }))).toBe(true);
  });

  it("is not green when cursor is inactive", () => {
    expect(cursorLive(cardsWithCursor({ active: false, observedAt: now - 10_000 }))).toBe(false);
  });

  it("is not green when cursor is missing entirely", () => {
    const cards = cardsWithCursor(null);
    expect(cursorLive(cards)).toBe(false);
    expect(cards.find((c) => c.key === "cursor_cli")?.statusText).toBe("Unavailable");
  });

  it("is not green when the cursor observation is stale beyond the CLI TTL", () => {
    const stale = now - 86_400_000 - 1;
    expect(cursorLive(cardsWithCursor({ active: true, observedAt: stale }))).toBe(false);
  });

  it("does not affect Claude or Codex when only cursor fails", () => {
    const cards = cardsWithCursor({ active: false, observedAt: now - 10_000 });
    expect(cards.find((c) => c.key === "claude_cli")?.live).toBe(true);
    expect(cards.find((c) => c.key === "codex_cli")?.live).toBe(true);
    expect(cards.find((c) => c.key === "nexus_connector")?.live).toBe(true);
  });
});

describe("Claudia system status freshness derivation", () => {
  const now = Date.parse("2026-07-02T16:00:00Z");

  it("shows green only for active fresh components with a fresh heartbeat", () => {
    const cards = deriveClaudiaSystemStatusCards(
      {
        configured: true,
        presence: "online_idle",
        lastHeartbeatAt: now - 10_000,
        operatingState: "idle",
        softwareVersion: "claudia-p7-connector-v1",
        hasSystemStatus: true,
        snapshotObservedAt: now - 10_000,
        components: Object.fromEntries(
          CLAUDIA_SYSTEM_COMPONENT_KEYS.map((key) => [
            key,
            { active: true, observedAt: now - 10_000 },
          ]),
        ) as never,
      },
      now,
    );
    expect(cards.every((card) => card.live)).toBe(true);
  });

  it("forces all cards not green when the Connector heartbeat is stale", () => {
    const staleHeartbeat = now - P6_LEASE.connectorOfflineThresholdMs - 1;
    const cards = deriveClaudiaSystemStatusCards(
      {
        configured: true,
        presence: "offline",
        lastHeartbeatAt: staleHeartbeat,
        operatingState: "idle",
        softwareVersion: null,
        hasSystemStatus: true,
        snapshotObservedAt: now - 10_000,
        components: Object.fromEntries(
          CLAUDIA_SYSTEM_COMPONENT_KEYS.map((key) => [
            key,
            { active: true, observedAt: now - 10_000 },
          ]),
        ) as never,
      },
      now,
    );
    expect(cards.every((card) => !card.live)).toBe(true);
  });

  it("keeps only the Nexus Connector live for fresh heartbeats without systemStatus", () => {
    const cards = deriveClaudiaSystemStatusCards(
      {
        configured: true,
        presence: "online_idle",
        lastHeartbeatAt: now - 5_000,
        operatingState: "idle",
        softwareVersion: null,
        hasSystemStatus: false,
        snapshotObservedAt: null,
        components: null,
      },
      now,
    );
    const liveKeys = cards.filter((card) => card.live).map((card) => card.key);
    expect(liveKeys).toEqual(["nexus_connector"]);
    expect(cards.find((card) => card.key === "core_api")?.statusText).toBe(
      "Detailed system status unavailable",
    );
  });

  it("exposes bounded status through the private page query", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await seedConnector(t);
    await fetchSigned(t, {
      path: HEARTBEAT,
      body: { systemStatus: validSystemStatus() },
    });
    const page = await t.withIdentity(IDENTITY_A).query(
      api.connectorRegistry.getClaudiaSystemStatusForPage,
      {},
    );
    expect(page.configured).toBe(true);
    expect(page.hasSystemStatus).toBe(true);
    expect(page.components?.core_api?.active).toBe(true);
    expect(JSON.stringify(page)).not.toContain("snapshotId");
    expect(JSON.stringify(page)).not.toContain("sessionId");
  });
});
