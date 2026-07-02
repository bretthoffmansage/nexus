// @vitest-environment edge-runtime
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import {
  CALENDAR_SCHEDULE,
  scheduledEventIdempotencyKey,
} from "@/convex/lib/calendarScheduleConfig";
import { localDateTimeToUtcMs } from "@/convex/lib/calendarTimezone";
import { NEXUS_TOOL_REGISTRY } from "@/lib/navigation/toolRegistry";
import { IDENTITY_A, IDENTITY_B, p5Test, seedApprovedReader } from "./helpers/convexP5";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("Nexus Calendar scheduler cadence", () => {
  it("uses a 5-minute centralized scheduler interval", () => {
    expect(CALENDAR_SCHEDULE.schedulerIntervalMinutes).toBe(5);
    expect(CALENDAR_SCHEDULE.schedulerIntervalSeconds).toBe(300);
    expect(CALENDAR_SCHEDULE.schedulingPrecisionMs).toBe(5 * 60 * 1000);

    const cronsSrc = readFileSync(path.join(ROOT, "convex/crons.ts"), "utf8");
    expect(cronsSrc).toContain("CALENDAR_SCHEDULE.schedulerIntervalMinutes");
    expect(cronsSrc).toContain('{ minutes: CALENDAR_SCHEDULE.schedulerIntervalMinutes }');
    expect(cronsSrc).not.toMatch(
      /dispatch due scheduled calendar events[\s\S]*?\{ seconds: 60 \}/,
    );
  });
});

describe("Nexus Calendar navigation and badge policy", () => {
  it("Calendar has no Connector badge (availability is available)", () => {
    const calendar = NEXUS_TOOL_REGISTRY.find((t) => t.id === "calendar");
    expect(calendar?.availability).toBe("available");
    expect(calendar?.href).toBe("/calendar");
  });

  it("Library still has no Connector badge", () => {
    const library = NEXUS_TOOL_REGISTRY.find((t) => t.id === "documents");
    expect(library?.availability).toBe("available");
    expect(library?.label).toBe("Vault Library");
  });

  it("Tasks has no Connector badge (availability is available)", () => {
    const tasks = NEXUS_TOOL_REGISTRY.find((t) => t.id === "tasks");
    expect(tasks?.availability).toBe("available");
    expect(tasks?.href).toBe("/tasks");
  });

  it("unrelated legacy tools retain Connector badges", () => {
    for (const id of ["email", "memory", "research"] as const) {
      const tool = NEXUS_TOOL_REGISTRY.find((t) => t.id === id);
      expect(tool?.availability).toBe("connector_required");
    }
  });

  it("Calendar workspace is first-class Nexus without Connector banner copy", () => {
    const workspaceSrc = readFileSync(
      path.join(ROOT, "components/workspace/port/CalendarWorkspace.tsx"),
      "utf8",
    );
    const adapterSrc = readFileSync(path.join(ROOT, "lib/adapters/calendar/adapter.ts"), "utf8");

    expect(workspaceSrc).not.toContain("ToolAvailabilityBanner");
    expect(workspaceSrc).not.toContain("Connector required");
    expect(workspaceSrc).not.toContain("CalDAV");
    expect(workspaceSrc).toContain("nexusCalendar");
    expect(workspaceSrc).toContain("Schedule one-time Nexus tasks");

    expect(adapterSrc).toContain('availability: "available"');
    expect(adapterSrc).not.toContain("connector_required");
  });

  it("ToolNavigation hides Connector badge for available tools only", () => {
    const navSrc = readFileSync(path.join(ROOT, "components/layout/ToolNavigation.tsx"), "utf8");
    expect(navSrc).toContain('tool.availability !== "available"');
    expect(navSrc).toContain('tool.availability === "connector_required" ? "Connector"');
  });
});

describe("Nexus Calendar scheduled task dispatch", () => {
  it("authenticated user can create a private scheduled event", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const localScheduledDate = future.toISOString().slice(0, 10);
    const localScheduledTime = `${String(future.getUTCHours()).padStart(2, "0")}:${String(future.getUTCMinutes()).padStart(2, "0")}`;
    const result = await t.withIdentity(IDENTITY_A).mutation(api.scheduledEvents.createMyScheduledEvent, {
      title: "Cleanup",
      taskRequest: "Run vault cleanup for approved area",
      localScheduledDate,
      localScheduledTime,
      timezone: "UTC",
      requestedToolId: "vault.agentic_retrieval",
    });
    expect(result.eventId).toBeTruthy();

    const listed = await t.withIdentity(IDENTITY_A).query(api.scheduledEvents.listMyScheduledEventsForRange, {
      startDate: localScheduledDate,
      endDate: localScheduledDate,
    });
    expect(listed).toHaveLength(1);
    expect(listed[0].title).toBe("Cleanup");
    expect(listed[0].taskRequest).toBe("Run vault cleanup for approved area");
    expect(listed[0].scheduleStatus).toBe("scheduled");
  });

  it("rejects unauthenticated creation", async () => {
    const t = p5Test();
    await expect(
      t.mutation(api.scheduledEvents.createMyScheduledEvent, {
        title: "X",
        taskRequest: "Y",
        localScheduledDate: "2030-01-01",
        localScheduledTime: "12:00",
        timezone: "UTC",
        requestedToolId: "vault.agentic_retrieval",
      }),
    ).rejects.toThrow();
  });

  it("user A cannot read user B events", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await seedApprovedReader(t, IDENTITY_B);
    const { eventId } = await t.withIdentity(IDENTITY_A).mutation(api.scheduledEvents.createMyScheduledEvent, {
      title: "Private",
      taskRequest: "Secret task",
      localScheduledDate: "2030-06-01",
      localScheduledTime: "09:00",
      timezone: "UTC",
      requestedToolId: "vault.agentic_retrieval",
    });

    await expect(
      t.withIdentity(IDENTITY_B).query(api.scheduledEvents.getMyScheduledEvent, { eventId }),
    ).rejects.toThrow();

    const bList = await t.withIdentity(IDENTITY_B).query(api.scheduledEvents.listMyScheduledEventsForRange, {
      startDate: "2030-06-01",
      endDate: "2030-06-30",
    });
    expect(bList).toHaveLength(0);
  });

  it("converts local date/time to correct UTC", () => {
    const utc = localDateTimeToUtcMs("2026-06-15", "15:00", "America/New_York");
    const asUtc = new Date(utc).toISOString();
    expect(asUtc).toMatch(/2026-06-15T19:00:00.000Z/);
  });

  it("does not dispatch before scheduled UTC instant", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    const futureMs = Date.now() + 5 * 60 * 1000 + 30_000;
    const d = new Date(futureMs);
    const localScheduledDate = d.toISOString().slice(0, 10);
    const { eventId } = await t.withIdentity(IDENTITY_A).mutation(api.scheduledEvents.createMyScheduledEvent, {
      title: "Later",
      taskRequest: "Do later",
      localScheduledDate,
      localScheduledTime: `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`,
      timezone: "UTC",
      requestedToolId: "vault.agentic_retrieval",
    });

    await t.mutation(internal.scheduledEventDispatch.runScheduledEventMaintenance, {});
    const event = await t.withIdentity(IDENTITY_A).query(api.scheduledEvents.getMyScheduledEvent, { eventId });
    expect(event.linkedTaskId).toBeNull();
    expect(event.scheduleStatus).toBe("scheduled");
    expect(event.scheduledForUtc).toBeGreaterThan(Date.now());
  });

  it("dispatches exactly one task when due and preserves owner", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    const past = Date.now() - 60_000;
    const d = new Date(past);
    const { eventId } = await t.run(async (ctx) => {
      const now = Date.now();
      const id = await ctx.db.insert("nexusScheduledEvents", {
        ownerClerkUserId: IDENTITY_A.subject,
        title: "Due task",
        taskRequest: "Run when due",
        requestedToolId: "vault.agentic_retrieval",
        timezone: "UTC",
        localScheduledDate: d.toISOString().slice(0, 10),
        localScheduledTime: "10:00",
        scheduledForUtc: past,
        oneTime: true,
        scheduleStatus: "due",
        dispatchState: "undispatched",
        revision: 1,
        createdAt: now,
        updatedAt: now,
        createdBy: IDENTITY_A.subject,
      });
      return { eventId: id };
    });

    await t.mutation(internal.scheduledEventDispatch.runScheduledEventMaintenance, {});
    await t.mutation(internal.scheduledEventDispatch.runScheduledEventMaintenance, {});

    const event = await t.withIdentity(IDENTITY_A).query(api.scheduledEvents.getMyScheduledEvent, { eventId });
    expect(event.linkedTaskId).toBeTruthy();
    expect(event.scheduleStatus).toBe("queued");

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
    expect(tasks[0].ownerClerkUserId).toBe(IDENTITY_A.subject);
    expect(tasks[0].taskKind).toBe("scheduled_task");
    expect(tasks[0].scheduledEventId).toBe(eventId);
  });

  it("deleted future events never dispatch", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    const past = Date.now() - 30_000;
    const eventId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("nexusScheduledEvents", {
        ownerClerkUserId: IDENTITY_A.subject,
        title: "Deleted",
        taskRequest: "Should not run",
        requestedToolId: "vault.agentic_retrieval",
        timezone: "UTC",
        localScheduledDate: "2030-01-01",
        localScheduledTime: "08:00",
        scheduledForUtc: past,
        oneTime: true,
        scheduleStatus: "due",
        dispatchState: "undispatched",
        revision: 1,
        createdAt: now,
        updatedAt: now,
        createdBy: IDENTITY_A.subject,
        deletedAt: now,
        hiddenFromCalendar: true,
      });
    });

    await t.mutation(internal.scheduledEventDispatch.runScheduledEventMaintenance, {});
    const tasks = await t.run(async (ctx) =>
      ctx.db
        .query("nexusTasks")
        .withIndex("by_scheduled_event", (q) => q.eq("scheduledEventId", eventId))
        .collect(),
    );
    expect(tasks).toHaveLength(0);
  });

  it("future undispatched events remain editable", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    const { eventId } = await t.withIdentity(IDENTITY_A).mutation(api.scheduledEvents.createMyScheduledEvent, {
      title: "Original",
      taskRequest: "Original request",
      localScheduledDate: "2031-03-01",
      localScheduledTime: "14:00",
      timezone: "UTC",
      requestedToolId: "vault.agentic_retrieval",
    });

    await t.withIdentity(IDENTITY_A).mutation(api.scheduledEvents.updateMyScheduledEvent, {
      eventId,
      title: "Renamed",
      taskRequest: "Updated request",
    });

    const event = await t.withIdentity(IDENTITY_A).query(api.scheduledEvents.getMyScheduledEvent, { eventId });
    expect(event.title).toBe("Renamed");
    expect(event.taskRequest).toBe("Updated request");
    expect(event.revision).toBe(2);
  });

  it("rejects arbitrary tool IDs", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await expect(
      t.withIdentity(IDENTITY_A).mutation(api.scheduledEvents.createMyScheduledEvent, {
        title: "Bad tool",
        taskRequest: "x",
        localScheduledDate: "2030-01-01",
        localScheduledTime: "12:00",
        timezone: "UTC",
        requestedToolId: "obsidian.dropzone.process_document",
      }),
    ).rejects.toThrow();
  });
});
