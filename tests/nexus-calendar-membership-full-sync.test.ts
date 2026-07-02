// @vitest-environment edge-runtime
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  CALENDAR_SCHEDULED_TOOLS,
  MEMBERSHIP_FULL_SYNC_REQUEST_TEXT,
  MEMBERSHIP_FULL_SYNC_TASK_KIND,
  MEMBERSHIP_FULL_SYNC_TOOL_ID,
} from "@/convex/lib/calendarScheduledTools";
import { CALENDAR_SCHEDULE, scheduledEventIdempotencyKey } from "@/convex/lib/calendarScheduleConfig";
import { isSupportedToolId, P5_SUPPORTED_TOOL_IDS } from "@/convex/lib/p5config";
import { KNOWN_CONNECTOR_TOOL_IDS } from "@/convex/lib/p6config";
import { IDENTITY_A, p5Test, seedApprovedReader } from "./helpers/convexP5";
import { seedConnector } from "./helpers/convexP6";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("Membership.io full sync Calendar option", () => {
  it("registry includes all three scheduled tools with correct input modes", () => {
    expect(CALENDAR_SCHEDULED_TOOLS.map((t) => t.requestedToolId)).toEqual([
      "vault.agentic_retrieval",
      "membership_io.transcript_retrieve",
      MEMBERSHIP_FULL_SYNC_TOOL_ID,
    ]);
    const fullSync = CALENDAR_SCHEDULED_TOOLS.find(
      (t) => t.requestedToolId === MEMBERSHIP_FULL_SYNC_TOOL_ID,
    );
    expect(fullSync?.displayLabel).toBe("Membership.io full sync");
    expect(fullSync?.inputMode).toBe("no_input_action");
    expect(fullSync?.taskKind).toBe(MEMBERSHIP_FULL_SYNC_TASK_KIND);
    expect(fullSync?.chatAvailable).toBe(false);
  });

  it("Calendar dialog hides task request for no-input tools and disables save when unavailable", () => {
    const src = readFileSync(
      path.join(ROOT, "components/workspace/port/CalendarEventDialog.tsx"),
      "utf8",
    );
    expect(src).toContain('inputMode === "no_input_action"');
    expect(src).toContain("!isNoInputTool");
    expect(src).toContain("disabled={busy || toolUnavailable}");
    expect(src).toContain("toolUnavailable");
    expect(src).toContain("unavailableReason");
    expect(src).toContain("getCalendarScheduledTool");
  });

  it("listAllowedScheduledTools marks full sync unavailable without Connector capability", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    const tools = await t.withIdentity(IDENTITY_A).query(api.scheduledEvents.listAllowedScheduledTools, {});
    expect(tools).toHaveLength(3);
    const fullSync = tools.find((tool) => tool.id === MEMBERSHIP_FULL_SYNC_TOOL_ID);
    expect(fullSync?.available).toBe(false);
    expect(fullSync?.inputMode).toBe("no_input_action");
  });

  it("rejects server-side save when Connector capability is absent", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await expect(
      t.withIdentity(IDENTITY_A).mutation(api.scheduledEvents.createMyScheduledEvent, {
        title: "Membership refresh",
        taskRequest: "ignored user text",
        localScheduledDate: "2031-04-01",
        localScheduledTime: "09:00",
        timezone: "UTC",
        requestedToolId: MEMBERSHIP_FULL_SYNC_TOOL_ID,
      }),
    ).rejects.toThrow(/Claudia support required/);
  });

  it("does not place hidden stale task text in requestText for no-input save", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await seedConnector(t, {
      allowedToolIds: [...P5_SUPPORTED_TOOL_IDS, MEMBERSHIP_FULL_SYNC_TOOL_ID],
    });
    const { eventId } = await t.withIdentity(IDENTITY_A).mutation(
      api.scheduledEvents.createMyScheduledEvent,
      {
        title: "Membership refresh",
        taskRequest: "stale hidden text should not persist",
        localScheduledDate: "2031-04-02",
        localScheduledTime: "10:00",
        timezone: "UTC",
        requestedToolId: MEMBERSHIP_FULL_SYNC_TOOL_ID,
      },
    );
    const event = await t.withIdentity(IDENTITY_A).query(api.scheduledEvents.getMyScheduledEvent, {
      eventId,
    });
    expect(event.taskRequest).toBe(MEMBERSHIP_FULL_SYNC_REQUEST_TEXT);
    expect(event.taskRequest).not.toContain("stale hidden text");
  });

  it("text tools still require task request", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await expect(
      t.withIdentity(IDENTITY_A).mutation(api.scheduledEvents.createMyScheduledEvent, {
        title: "Vault run",
        taskRequest: "",
        localScheduledDate: "2031-04-03",
        localScheduledTime: "11:00",
        timezone: "UTC",
        requestedToolId: "vault.agentic_retrieval",
      }),
    ).rejects.toThrow(/Task request is required/);
  });

  it("ordinary Chat cannot invoke the full sync tool id", () => {
    expect(isSupportedToolId(MEMBERSHIP_FULL_SYNC_TOOL_ID)).toBe(false);
    expect(P5_SUPPORTED_TOOL_IDS).not.toContain(MEMBERSHIP_FULL_SYNC_TOOL_ID);
  });

  it("dispatches membership full sync with structured metadata when Connector allows it", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await seedConnector(t, {
      allowedToolIds: [...P5_SUPPORTED_TOOL_IDS, MEMBERSHIP_FULL_SYNC_TOOL_ID],
    });
    const past = Date.now() - 60_000;
    const eventId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("nexusScheduledEvents", {
        ownerClerkUserId: IDENTITY_A.subject,
        title: "Membership refresh",
        taskRequest: MEMBERSHIP_FULL_SYNC_REQUEST_TEXT,
        requestedToolId: MEMBERSHIP_FULL_SYNC_TOOL_ID,
        timezone: "UTC",
        localScheduledDate: "2031-04-04",
        localScheduledTime: "08:00",
        scheduledForUtc: past,
        oneTime: true,
        scheduleStatus: "due",
        dispatchState: "undispatched",
        revision: 1,
        createdAt: now,
        updatedAt: now,
        createdBy: IDENTITY_A.subject,
      });
    });

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
    expect(tasks[0].requestedToolId).toBe(MEMBERSHIP_FULL_SYNC_TOOL_ID);
    expect(tasks[0].taskKind).toBe(MEMBERSHIP_FULL_SYNC_TASK_KIND);
    expect(tasks[0].requestText).toBe(MEMBERSHIP_FULL_SYNC_REQUEST_TEXT);
    expect(tasks[0].taskMetadata?.kind).toBe(MEMBERSHIP_FULL_SYNC_TASK_KIND);
    if (tasks[0].taskMetadata?.kind === MEMBERSHIP_FULL_SYNC_TASK_KIND) {
      expect(tasks[0].taskMetadata.explicitUserAction).toBe("sync");
      expect(tasks[0].taskMetadata.scheduledEventId).toBe(eventId);
    }
  });

  it("blocks overlapping active full sync tasks and retries later", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await seedConnector(t, {
      allowedToolIds: [...P5_SUPPORTED_TOOL_IDS, MEMBERSHIP_FULL_SYNC_TOOL_ID],
    });
    const past = Date.now() - 60_000;
    const now = Date.now();
    const activeTaskId = await t.run(async (ctx) => {
      const queueSequence = 9001;
      return await ctx.db.insert("nexusTasks", {
        ownerClerkUserId: IDENTITY_A.subject,
        taskKind: MEMBERSHIP_FULL_SYNC_TASK_KIND,
        requestedToolId: MEMBERSHIP_FULL_SYNC_TOOL_ID,
        requestText: MEMBERSHIP_FULL_SYNC_REQUEST_TEXT,
        status: "running",
        queueSequence,
        priority: 100,
        createdAt: now,
        updatedAt: now,
        queuedAt: now,
        attemptNumber: 1,
        idempotencyKey: "active-sync-test",
      });
    });

    const eventId = await t.run(async (ctx) =>
      ctx.db.insert("nexusScheduledEvents", {
        ownerClerkUserId: IDENTITY_A.subject,
        title: "Blocked sync",
        taskRequest: MEMBERSHIP_FULL_SYNC_REQUEST_TEXT,
        requestedToolId: MEMBERSHIP_FULL_SYNC_TOOL_ID,
        timezone: "UTC",
        localScheduledDate: "2031-04-05",
        localScheduledTime: "08:00",
        scheduledForUtc: past,
        oneTime: true,
        scheduleStatus: "due",
        dispatchState: "undispatched",
        revision: 1,
        createdAt: now,
        updatedAt: now,
        createdBy: IDENTITY_A.subject,
      }),
    );

    await t.mutation(internal.scheduledEventDispatch.runScheduledEventMaintenance, {});

    const event = await t.withIdentity(IDENTITY_A).query(api.scheduledEvents.getMyScheduledEvent, {
      eventId,
    });
    expect(event.linkedTaskId).toBeNull();
    expect(event.scheduleStatus).toBe("due");
    expect(event.progressMessage).toContain("Waiting for existing Membership.io sync");

    await t.run(async (ctx) => {
      await ctx.db.patch(activeTaskId, { status: "completed", completedAt: Date.now() });
    });

    await t.mutation(internal.scheduledEventDispatch.runScheduledEventMaintenance, {});

    const eventAfter = await t.withIdentity(IDENTITY_A).query(
      api.scheduledEvents.getMyScheduledEvent,
      { eventId },
    );
    expect(eventAfter.linkedTaskId).toBeTruthy();

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
  });

  it("dispatch rechecks Connector capability server-side", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    const past = Date.now() - 60_000;
    const now = Date.now();
    const eventId = await t.run(async (ctx) =>
      ctx.db.insert("nexusScheduledEvents", {
        ownerClerkUserId: IDENTITY_A.subject,
        title: "Forged dispatch",
        taskRequest: MEMBERSHIP_FULL_SYNC_REQUEST_TEXT,
        requestedToolId: MEMBERSHIP_FULL_SYNC_TOOL_ID,
        timezone: "UTC",
        localScheduledDate: "2031-04-06",
        localScheduledTime: "08:00",
        scheduledForUtc: past,
        oneTime: true,
        scheduleStatus: "due",
        dispatchState: "undispatched",
        revision: 1,
        createdAt: now,
        updatedAt: now,
        createdBy: IDENTITY_A.subject,
      }),
    );

    await t.mutation(internal.scheduledEventDispatch.runScheduledEventMaintenance, {});

    const tasks = await t.run(async (ctx) =>
      ctx.db
        .query("nexusTasks")
        .withIndex("by_scheduled_event", (q) => q.eq("scheduledEventId", eventId as Id<"nexusScheduledEvents">))
        .collect(),
    );
    expect(tasks).toHaveLength(0);
  });

  it("existing text scheduled task still dispatches normally", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    const past = Date.now() - 60_000;
    const now = Date.now();
    const eventId = await t.run(async (ctx) =>
      ctx.db.insert("nexusScheduledEvents", {
        ownerClerkUserId: IDENTITY_A.subject,
        title: "Vault task",
        taskRequest: "Run vault cleanup",
        requestedToolId: "vault.agentic_retrieval",
        timezone: "UTC",
        localScheduledDate: "2031-04-07",
        localScheduledTime: "08:00",
        scheduledForUtc: past,
        oneTime: true,
        scheduleStatus: "due",
        dispatchState: "undispatched",
        revision: 1,
        createdAt: now,
        updatedAt: now,
        createdBy: IDENTITY_A.subject,
      }),
    );

    await t.mutation(internal.scheduledEventDispatch.runScheduledEventMaintenance, {});

    const event = await t.withIdentity(IDENTITY_A).query(api.scheduledEvents.getMyScheduledEvent, {
      eventId,
    });
    expect(event.linkedTaskId).toBeTruthy();
    expect(event.scheduleStatus).toBe("queued");
  });

  it("five-minute Calendar scheduler cadence is unchanged", () => {
    expect(CALENDAR_SCHEDULE.schedulerIntervalMinutes).toBe(5);
    const cronsSrc = readFileSync(path.join(ROOT, "convex/crons.ts"), "utf8");
    expect(cronsSrc).toContain('{ minutes: CALENDAR_SCHEDULE.schedulerIntervalMinutes }');
  });

  it("membership full sync is in the known Connector tool universe but not default allowlist", async () => {
    const { DEFAULT_CONNECTOR_TOOL_IDS } = await import("@/convex/lib/p6config");
    expect(KNOWN_CONNECTOR_TOOL_IDS).toContain(MEMBERSHIP_FULL_SYNC_TOOL_ID);
    expect(DEFAULT_CONNECTOR_TOOL_IDS).not.toContain(MEMBERSHIP_FULL_SYNC_TOOL_ID);
  });
});
