// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import { scheduledEventIdempotencyKey } from "@/convex/lib/calendarScheduleConfig";
import {
  CALENDAR_SCHEDULED_TOOLS,
  getCalendarScheduledTool,
  buildVaultExpansionPassTaskMetadata,
  VAULT_EXPANSION_PASS_TASK_KIND,
  VAULT_EXPANSION_PASS_TOOL_ID,
} from "@/convex/lib/calendarScheduledTools";
import { KNOWN_CONNECTOR_TOOL_IDS, DEFAULT_CONNECTOR_TOOL_IDS } from "@/convex/lib/p6config";
import {
  NEXUS_SKILLS_CATALOG_TOOL_IDS,
  SKILLS_CATALOG_TOOL_DEFS,
  skillsCatalogToolIdsMatchAuthority,
} from "@/convex/lib/nexusSkillsCatalog";
import type { Id } from "@/convex/_generated/dataModel";
import {
  IDENTITY_A,
  p5Test,
  seedApprovedReader,
} from "./helpers/convexP5";
import { installConnectorEnv, clearConnectorEnv, seedConnector } from "./helpers/convexP6";

const EVENT_ID = "k1234567890abcdefghijklmn" as Id<"nexusScheduledEvents">;

describe("Vault Expansion Pass — Calendar registration", () => {
  it("is registered as a no-input, write-capable, Calendar-only scheduled tool", () => {
    const tool = getCalendarScheduledTool(VAULT_EXPANSION_PASS_TOOL_ID);
    expect(tool).toBeTruthy();
    expect(tool?.taskKind).toBe(VAULT_EXPANSION_PASS_TASK_KIND);
    expect(tool?.inputMode).toBe("no_input_action");
    expect(tool?.writeCapable).toBe(true);
    expect(tool?.chatAvailable).toBe(false);
    expect(tool?.requiresConnectorCapability).toBe(true);
    expect(tool?.singleFlightKey).toBe(VAULT_EXPANSION_PASS_TOOL_ID);
    expect(tool?.fixedRequestText).toBe("Run Vault Expansion Pass");
  });

  it("uses the same registry mechanism as Membership full sync (present, capability-gated)", () => {
    const ids = CALENDAR_SCHEDULED_TOOLS.map((t) => t.requestedToolId);
    expect(ids).toContain(VAULT_EXPANSION_PASS_TOOL_ID);
    // Requires an explicit Connector allowlist entry (not on the default set).
    expect(KNOWN_CONNECTOR_TOOL_IDS).toContain(VAULT_EXPANSION_PASS_TOOL_ID);
    expect(DEFAULT_CONNECTOR_TOOL_IDS).not.toContain(VAULT_EXPANSION_PASS_TOOL_ID);
  });

  it("builds the exact no-input Calendar metadata bound to the event", () => {
    const md = buildVaultExpansionPassTaskMetadata(EVENT_ID, Date.parse("2026-07-02T12:00:00Z"));
    expect(Object.keys(md).sort()).toEqual([
      "explicitUserAction",
      "idempotencyKey",
      "kind",
      "scheduledEventId",
      "scheduledForUtc",
      "sourcePage",
    ]);
    expect(md.kind).toBe("vault_expansion_pass");
    expect(md.sourcePage).toBe("nexus_calendar");
    expect(md.explicitUserAction).toBe("run");
    expect(md.scheduledForUtc).toBe("2026-07-02T12:00:00.000Z");
    expect(md.idempotencyKey).toBe(`${EVENT_ID}:2026-07-02T12:00:00.000Z`);
    // No free-text / model / provider / path / prompt fields ever cross.
    const serialized = JSON.stringify(md);
    for (const forbidden of ["model", "provider", "prompt", "worker", "requestText", "path"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe("Vault Expansion Pass — Skills page", () => {
  it("appears as a scheduled-maintenance, write-capable, Calendar-only skill", () => {
    const def = SKILLS_CATALOG_TOOL_DEFS.find((t) => t.toolId === VAULT_EXPANSION_PASS_TOOL_ID);
    expect(def).toBeTruthy();
    expect(def?.category).toBe("scheduled_maintenance");
    expect(def?.accessModes).toEqual(["calendar", "connector"]);
    expect(def?.inputType).toBe("no_input_action");
    expect(def?.ordinaryChatAvailable).toBe(false);
    expect(def?.calendarAvailable).toBe(true);
    expect(def?.calendarRequiresExplicitCapability).toBe(true);
    // No direct execution surface (chat/library) — Calendar only.
    expect(def?.accessModes).not.toContain("chat");
    expect(def?.accessModes).not.toContain("library");
  });

  it("is included in the canonical Skills authority set", () => {
    expect(NEXUS_SKILLS_CATALOG_TOOL_IDS).toContain(VAULT_EXPANSION_PASS_TOOL_ID);
    expect(skillsCatalogToolIdsMatchAuthority()).toBe(true);
  });
});

const FIXED_SCHEDULE_MS = Date.UTC(2026, 6, 2, 0, 55, 0);

async function insertDueExpansionEvent(t: ReturnType<typeof p5Test>, scheduledForUtcMs: number) {
  const now = Date.now();
  return t.run(async (ctx) =>
    ctx.db.insert("nexusScheduledEvents", {
      ownerClerkUserId: IDENTITY_A.subject,
      title: "Nightly Vault Expansion Pass",
      taskRequest: "Run Vault Expansion Pass",
      requestedToolId: VAULT_EXPANSION_PASS_TOOL_ID,
      timezone: "UTC",
      localScheduledDate: "2026-07-02",
      localScheduledTime: "00:55",
      scheduledForUtc: scheduledForUtcMs,
      oneTime: true,
      scheduleStatus: "due",
      dispatchState: "undispatched",
      revision: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: IDENTITY_A.subject,
    }),
  );
}

describe("Vault Expansion Pass — scheduled dispatch through the shared queue", () => {
  it("materializes one vault_expansion_pass task on the existing nexusTasks queue", async () => {
    installConnectorEnv();
    try {
      const t = p5Test();
      await seedApprovedReader(t, IDENTITY_A);
      await seedConnector(t, {
        allowedToolIds: [
          "vault.agentic_retrieval",
          "knowledge.asset_query",
          VAULT_EXPANSION_PASS_TOOL_ID,
        ],
      });
      const eventId = await insertDueExpansionEvent(t, FIXED_SCHEDULE_MS);

      await t.mutation(internal.scheduledEventDispatch.runScheduledEventMaintenance, {});

      const tasks = await t.run(async (ctx) =>
        ctx.db
          .query("nexusTasks")
          .withIndex("by_owner_and_idempotency_key", (q) =>
            q
              .eq("ownerClerkUserId", IDENTITY_A.subject)
              .eq("idempotencyKey", scheduledEventIdempotencyKey(eventId)),
          )
          .collect(),
      );
      expect(tasks).toHaveLength(1);
      const expansion = tasks[0];
      expect(expansion.taskKind).toBe(VAULT_EXPANSION_PASS_TASK_KIND);
      expect(expansion.requestedToolId).toBe(VAULT_EXPANSION_PASS_TOOL_ID);
      expect(expansion.requestText).toBe("Run Vault Expansion Pass");
      expect(expansion.conversationId ?? null).toBeNull();
      expect(expansion.taskMetadata?.kind).toBe("vault_expansion_pass");
      expect(expansion.taskMetadata?.sourcePage).toBe("nexus_calendar");
      expect(expansion.taskMetadata?.explicitUserAction).toBe("run");

      // Re-running maintenance must not create a duplicate (idempotent).
      await t.mutation(internal.scheduledEventDispatch.runScheduledEventMaintenance, {});
      const after = await t.run(async (ctx) =>
        ctx.db
          .query("nexusTasks")
          .withIndex("by_owner_and_idempotency_key", (q) =>
            q
              .eq("ownerClerkUserId", IDENTITY_A.subject)
              .eq("idempotencyKey", scheduledEventIdempotencyKey(eventId)),
          )
          .collect(),
      );
      expect(after).toHaveLength(1);
    } finally {
      clearConnectorEnv();
    }
  });
});
