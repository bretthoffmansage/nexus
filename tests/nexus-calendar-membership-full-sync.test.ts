// @vitest-environment edge-runtime
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  buildMembershipFullSyncTaskMetadata,
  CALENDAR_SCHEDULED_TOOLS,
  getCalendarScheduledTool,
  membershipFullSyncScheduledForUtcIso,
  MEMBERSHIP_FULL_SYNC_REQUEST_TEXT,
  MEMBERSHIP_FULL_SYNC_TASK_KIND,
  MEMBERSHIP_FULL_SYNC_TOOL_ID,
} from "@/convex/lib/calendarScheduledTools";
import { CALENDAR_SCHEDULE, scheduledEventIdempotencyKey } from "@/convex/lib/calendarScheduleConfig";
import { isSupportedToolId, P5_SUPPORTED_TOOL_IDS, P5_TOOL_DISPLAY_TITLES } from "@/convex/lib/p5config";
import { KNOWN_CONNECTOR_TOOL_IDS } from "@/convex/lib/p6config";
import { IDENTITY_A, p5Test, seedApprovedReader } from "./helpers/convexP5";
import {
  clearConnectorEnv,
  installConnectorEnv,
  seedConnector,
  TEST_CONNECTOR_ID,
} from "./helpers/convexP6";

const ROOT = path.resolve(import.meta.dirname, "..");
const FIXED_SCHEDULE_MS = Date.UTC(2026, 6, 2, 0, 55, 0);
const FIXED_SCHEDULE_ISO = "2026-07-02T00:55:00.000Z";

async function insertDueMembershipEvent(
  t: ReturnType<typeof p5Test>,
  scheduledForUtcMs: number,
) {
  const now = Date.now();
  return t.run(async (ctx) =>
    ctx.db.insert("nexusScheduledEvents", {
      ownerClerkUserId: IDENTITY_A.subject,
      title: "Membership refresh",
      taskRequest: MEMBERSHIP_FULL_SYNC_REQUEST_TEXT,
      requestedToolId: MEMBERSHIP_FULL_SYNC_TOOL_ID,
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

describe("Membership.io full sync Calendar option", () => {
  it("emits ISO UTC scheduledForUtc and matching idempotency key from one helper", () => {
    expect(membershipFullSyncScheduledForUtcIso(FIXED_SCHEDULE_MS)).toBe(FIXED_SCHEDULE_ISO);
    const eventId = "abc123" as Id<"nexusScheduledEvents">;
    const metadata = buildMembershipFullSyncTaskMetadata(eventId, FIXED_SCHEDULE_MS);
    expect(metadata.scheduledForUtc).toBe(FIXED_SCHEDULE_ISO);
    expect(metadata.idempotencyKey).toBe(`abc123:${FIXED_SCHEDULE_ISO}`);
    expect(Object.keys(metadata).sort()).toEqual([
      "explicitUserAction",
      "idempotencyKey",
      "kind",
      "scheduledEventId",
      "scheduledForUtc",
    ]);
  });
  it("registry includes all scheduled tools with correct input modes", () => {
    expect(CALENDAR_SCHEDULED_TOOLS.map((t) => t.requestedToolId)).toEqual([
      "vault.agentic_retrieval",
      "membership_io.transcript_retrieve",
      "research.hermes_deep_research",
      MEMBERSHIP_FULL_SYNC_TOOL_ID,
      "vault.expansion_pass",
    ]);
    const fullSync = CALENDAR_SCHEDULED_TOOLS.find(
      (t) => t.requestedToolId === MEMBERSHIP_FULL_SYNC_TOOL_ID,
    );
    const transcript = getCalendarScheduledTool("membership_io.transcript_retrieve");
    expect(transcript?.displayLabel).toBe(P5_TOOL_DISPLAY_TITLES["membership_io.transcript_retrieve"]);
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
    expect(src).toContain("isTextRequestTool");
    expect(src).toContain("saveDisabled");
    expect(src).toContain("toolUnavailable");
    expect(src).toContain("unavailableReason");
    expect(src).toContain("getCalendarScheduledTool");
  });

  it("listAllowedScheduledTools marks full sync unavailable without Connector capability", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    const tools = await t.withIdentity(IDENTITY_A).query(api.scheduledEvents.listAllowedScheduledTools, {});
    expect(tools).toHaveLength(5);
    const fullSync = tools.find((tool) => tool.id === MEMBERSHIP_FULL_SYNC_TOOL_ID);
    expect(fullSync?.available).toBe(false);
    expect(fullSync?.inputMode).toBe("no_input_action");
    const expansion = tools.find((tool) => tool.id === "vault.expansion_pass");
    expect(expansion?.available).toBe(false);
    expect(expansion?.inputMode).toBe("no_input_action");
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

  it("dispatches membership full sync with Claudia contract metadata when Connector allows it", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await seedConnector(t, {
      allowedToolIds: [...P5_SUPPORTED_TOOL_IDS, MEMBERSHIP_FULL_SYNC_TOOL_ID],
    });
    const eventId = await insertDueMembershipEvent(t, FIXED_SCHEDULE_MS);

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
    const task = tasks[0];
    expect(task.requestedToolId).toBe(MEMBERSHIP_FULL_SYNC_TOOL_ID);
    expect(task.taskKind).toBe(MEMBERSHIP_FULL_SYNC_TASK_KIND);
    expect(task.requestText).toBe(MEMBERSHIP_FULL_SYNC_REQUEST_TEXT);
    expect(task.conversationId).toBeUndefined();
    expect(task.requestMessageId).toBeUndefined();
    expect(task.libraryDocumentId).toBeUndefined();
    expect(task.libraryDocumentVersionId).toBeUndefined();
    expect(task.taskMetadata?.kind).toBe(MEMBERSHIP_FULL_SYNC_TASK_KIND);
    if (task.taskMetadata?.kind === MEMBERSHIP_FULL_SYNC_TASK_KIND) {
      expect(task.taskMetadata.explicitUserAction).toBe("sync");
      expect(task.taskMetadata.scheduledEventId).toBe(eventId);
      expect(task.taskMetadata.scheduledForUtc).toBe(FIXED_SCHEDULE_ISO);
      expect(task.taskMetadata.idempotencyKey).toBe(`${eventId}:${FIXED_SCHEDULE_ISO}`);
      expect(Object.keys(task.taskMetadata).sort()).toEqual([
        "explicitUserAction",
        "idempotencyKey",
        "kind",
        "scheduledEventId",
        "scheduledForUtc",
      ]);
    }
    const attachments = await t.run(async (ctx) =>
      ctx.db
        .query("nexusTaskAttachments")
        .withIndex("by_task", (q) => q.eq("taskId", task._id))
        .collect(),
    );
    expect(attachments).toHaveLength(0);
  });

  it("duplicate scheduler passes create only one membership task", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await seedConnector(t, {
      allowedToolIds: [...P5_SUPPORTED_TOOL_IDS, MEMBERSHIP_FULL_SYNC_TOOL_ID],
    });
    const eventId = await insertDueMembershipEvent(t, FIXED_SCHEDULE_MS);
    await t.mutation(internal.scheduledEventDispatch.runScheduledEventMaintenance, {});
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

describe("Membership.io full sync Calendar terminal projection", () => {
  beforeEach(() => installConnectorEnv());
  afterEach(() => clearConnectorEnv());

  async function dispatchRunningMembershipTask(t: ReturnType<typeof p5Test>) {
    await seedApprovedReader(t, IDENTITY_A);
    await seedConnector(t, {
      allowedToolIds: [...P5_SUPPORTED_TOOL_IDS, MEMBERSHIP_FULL_SYNC_TOOL_ID],
    });
    const eventId = await insertDueMembershipEvent(t, FIXED_SCHEDULE_MS);
    await t.mutation(internal.scheduledEventDispatch.runScheduledEventMaintenance, {});
    const claim = await t.mutation(internal.connectorTasks.claimNextTask, {
      connectorId: TEST_CONNECTOR_ID,
    });
    const taskId = claim.task!.taskId as Id<"nexusTasks">;
    const leaseId = claim.task!.leaseId!;
    await t.mutation(internal.connectorTasks.startTask, {
      connectorId: TEST_CONNECTOR_ID,
      taskId,
      leaseId,
    });
    return { eventId, taskId, leaseId };
  }

  it("normal completion marks the Calendar event completed with safe summary", async () => {
    const t = p5Test();
    const { eventId, taskId, leaseId } = await dispatchRunningMembershipTask(t);
    await t.mutation(internal.connectorTasks.completeTask, {
      connectorId: TEST_CONNECTOR_ID,
      taskId,
      leaseId,
      answerText: "Membership.io synchronization completed.",
    });
    const event = await t.withIdentity(IDENTITY_A).query(api.scheduledEvents.getMyScheduledEvent, {
      eventId,
    });
    expect(event.scheduleStatus).toBe("completed");
    expect(event.terminalResultSummary).toContain("Membership.io synchronization completed");
  });

  it("normal failure marks the Calendar event failed with safe message", async () => {
    const t = p5Test();
    const { eventId, taskId, leaseId } = await dispatchRunningMembershipTask(t);
    await t.mutation(internal.connectorTasks.failTask, {
      connectorId: TEST_CONNECTOR_ID,
      taskId,
      leaseId,
      errorCode: "membership_sync_failed",
      userSafeMessage: "Membership.io synchronization could not be completed.",
      retryable: true,
    });
    const event = await t.withIdentity(IDENTITY_A).query(api.scheduledEvents.getMyScheduledEvent, {
      eventId,
    });
    expect(event.scheduleStatus).toBe("failed");
    expect(event.terminalUserSafeMessage).toContain("could not be completed");
  });

  it("execution_state_uncertain maps to needs_review without creating another task", async () => {
    const t = p5Test();
    const { eventId, taskId, leaseId } = await dispatchRunningMembershipTask(t);
    await t.mutation(internal.connectorTasks.failTask, {
      connectorId: TEST_CONNECTOR_ID,
      taskId,
      leaseId,
      errorCode: "execution_state_uncertain",
      userSafeMessage: "Membership.io sync outcome is uncertain and requires review.",
      retryable: false,
    });
    const event = await t.withIdentity(IDENTITY_A).query(api.scheduledEvents.getMyScheduledEvent, {
      eventId,
    });
    expect(event.scheduleStatus).toBe("needs_review");
    expect(event.terminalUserSafeMessage).toContain("uncertain");

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
    expect(tasks[0]._id).toBe(taskId);
  });
});
