import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { CALENDAR_SCHEDULE, isAllowedScheduledToolId } from "./lib/calendarScheduleConfig";
import {
  isCalendarEventDeletable,
  isCalendarEventEditable,
} from "./lib/calendarProjection";
import {
  formatLocalDateTime,
  isValidIanaTimeZone,
  localDateTimeToUtcMs,
} from "./lib/calendarTimezone";
import { NEXUS_ERROR_CODES, nexusError } from "./lib/errors";
import {
  getCurrentApprovedClerkUserId,
  requireKnowledgeReader,
  requireOwnedScheduledEvent,
} from "./lib/ownership";
import { clampLength, P5_LIMITS } from "./lib/p5config";

function projectEvent(event: {
  _id: import("./_generated/dataModel").Id<"nexusScheduledEvents">;
  title: string;
  description?: string;
  taskRequest: string;
  requestedToolId: string;
  timezone: string;
  localScheduledDate: string;
  localScheduledTime: string;
  scheduledForUtc: number;
  scheduleStatus: string;
  dispatchState: string;
  linkedTaskId?: import("./_generated/dataModel").Id<"nexusTasks">;
  queueSequence?: number;
  lateDispatch?: boolean;
  latenessMs?: number;
  dispatchedAt?: number;
  progressMessage?: string;
  terminalResultSummary?: string;
  terminalErrorCode?: string;
  terminalUserSafeMessage?: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
}) {
  return {
    id: event._id,
    title: event.title,
    description: event.description ?? null,
    taskRequest: event.taskRequest,
    requestedToolId: event.requestedToolId,
    timezone: event.timezone,
    localScheduledDate: event.localScheduledDate,
    localScheduledTime: event.localScheduledTime,
    scheduledForUtc: event.scheduledForUtc,
    scheduleStatus: event.scheduleStatus,
    dispatchState: event.dispatchState,
    linkedTaskId: event.linkedTaskId ?? null,
    queueSequence: event.queueSequence ?? null,
    lateDispatch: event.lateDispatch ?? false,
    latenessMs: event.latenessMs ?? null,
    dispatchedAt: event.dispatchedAt ?? null,
    progressMessage: event.progressMessage ?? null,
    terminalResultSummary: event.terminalResultSummary ?? null,
    terminalErrorCode: event.terminalErrorCode ?? null,
    terminalUserSafeMessage: event.terminalUserSafeMessage ?? null,
    revision: event.revision,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

function validateScheduleInput(args: {
  title: string;
  taskRequest: string;
  requestedToolId: string;
  localScheduledDate: string;
  localScheduledTime: string;
  timezone: string;
}): number {
  const title = args.title.trim();
  const taskRequest = args.taskRequest.trim();
  if (!title) {
    nexusError(NEXUS_ERROR_CODES.INVALID_INPUT, "Event title is required");
  }
  if (!taskRequest) {
    nexusError(NEXUS_ERROR_CODES.INVALID_INPUT, "Task request is required");
  }
  if (title.length > CALENDAR_SCHEDULE.maxTitleLength) {
    nexusError(NEXUS_ERROR_CODES.REQUEST_TOO_LARGE, "Title is too long");
  }
  if (taskRequest.length > CALENDAR_SCHEDULE.maxTaskRequestLength) {
    nexusError(NEXUS_ERROR_CODES.REQUEST_TOO_LARGE, "Task request is too long");
  }
  if (!isAllowedScheduledToolId(args.requestedToolId)) {
    nexusError(NEXUS_ERROR_CODES.INVALID_TOOL, "Tool is not available for scheduled tasks");
  }
  if (!isValidIanaTimeZone(args.timezone)) {
    nexusError(NEXUS_ERROR_CODES.SCHEDULED_EVENT_INVALID_TIME, "Invalid timezone");
  }
  try {
    return localDateTimeToUtcMs(args.localScheduledDate, args.localScheduledTime, args.timezone);
  } catch {
    nexusError(NEXUS_ERROR_CODES.SCHEDULED_EVENT_INVALID_TIME, "Invalid date or time");
  }
}

function initialScheduleStatus(scheduledForUtc: number, now: number): "scheduled" | "due" {
  return scheduledForUtc > now ? "scheduled" : "due";
}

/** List the caller's scheduled events visible on calendar days in [startDate, endDate]. */
export const listMyScheduledEventsForRange = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const { clerkUserId } = await requireKnowledgeReader(ctx);
    if (args.startDate > args.endDate) {
      nexusError(NEXUS_ERROR_CODES.INVALID_INPUT, "Invalid date range");
    }
    const rows = await ctx.db
      .query("nexusScheduledEvents")
      .withIndex("by_owner_and_local_date", (q) =>
        q.eq("ownerClerkUserId", clerkUserId).gte("localScheduledDate", args.startDate),
      )
      .filter((q) => q.lte(q.field("localScheduledDate"), args.endDate))
      .collect();
    return rows
      .filter((row) => !row.deletedAt && !row.hiddenFromCalendar)
      .map(projectEvent);
  },
});

export const getMyScheduledEvent = query({
  args: { eventId: v.id("nexusScheduledEvents") },
  handler: async (ctx, args) => {
    const { clerkUserId } = await requireKnowledgeReader(ctx);
    const event = await requireOwnedScheduledEvent(ctx, clerkUserId, args.eventId);
    return projectEvent(event);
  },
});

export const getMyScheduledEventTaskResult = query({
  args: { eventId: v.id("nexusScheduledEvents") },
  handler: async (ctx, args) => {
    const { clerkUserId } = await requireKnowledgeReader(ctx);
    const event = await requireOwnedScheduledEvent(ctx, clerkUserId, args.eventId);
    if (!event.linkedTaskId) return null;
    const result = await ctx.db
      .query("nexusTaskResults")
      .withIndex("by_task", (q) => q.eq("taskId", event.linkedTaskId!))
      .unique();
    if (!result) return null;
    const sources = await ctx.db
      .query("nexusTaskSources")
      .withIndex("by_task_and_ordinal", (q) => q.eq("taskId", event.linkedTaskId!))
      .collect();
    return {
      answerText: result.answerText,
      format: result.format,
      createdAt: result.createdAt,
      durationMs: result.durationMs ?? null,
      sources: sources.map((s) => ({
        title: s.title,
        locator: s.locator ?? null,
        excerpt: s.excerpt ?? null,
        sourceType: s.sourceType,
      })),
    };
  },
});

export const createMyScheduledEvent = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    taskRequest: v.string(),
    requestedToolId: v.string(),
    localScheduledDate: v.string(),
    localScheduledTime: v.string(),
    timezone: v.string(),
  },
  handler: async (ctx, args) => {
    const { clerkUserId } = await getCurrentApprovedClerkUserId(ctx);
    const scheduledForUtc = validateScheduleInput(args);
    const now = Date.now();
    const { localScheduledDate, localScheduledTime } = formatLocalDateTime(
      scheduledForUtc,
      args.timezone,
    );
    const eventId = await ctx.db.insert("nexusScheduledEvents", {
      ownerClerkUserId: clerkUserId,
      title: clampLength(args.title.trim(), CALENDAR_SCHEDULE.maxTitleLength),
      description: args.description
        ? clampLength(args.description.trim(), CALENDAR_SCHEDULE.maxDescriptionLength)
        : undefined,
      taskRequest: clampLength(args.taskRequest.trim(), CALENDAR_SCHEDULE.maxTaskRequestLength),
      requestedToolId: args.requestedToolId,
      timezone: args.timezone,
      localScheduledDate,
      localScheduledTime,
      scheduledForUtc,
      oneTime: true,
      scheduleStatus: initialScheduleStatus(scheduledForUtc, now),
      dispatchState: "undispatched",
      revision: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: clerkUserId,
    });
    return { eventId, scheduledForUtc };
  },
});

export const updateMyScheduledEvent = mutation({
  args: {
    eventId: v.id("nexusScheduledEvents"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    taskRequest: v.optional(v.string()),
    requestedToolId: v.optional(v.string()),
    localScheduledDate: v.optional(v.string()),
    localScheduledTime: v.optional(v.string()),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { clerkUserId } = await getCurrentApprovedClerkUserId(ctx);
    const event = await requireOwnedScheduledEvent(ctx, clerkUserId, args.eventId);
    if (!isCalendarEventEditable(event)) {
      nexusError(NEXUS_ERROR_CODES.SCHEDULED_EVENT_NOT_EDITABLE, "Event cannot be edited");
    }

    const title = args.title !== undefined ? args.title.trim() : event.title;
    const taskRequest = args.taskRequest !== undefined ? args.taskRequest.trim() : event.taskRequest;
    const requestedToolId = args.requestedToolId ?? event.requestedToolId;
    const timezone = args.timezone ?? event.timezone;
    const localScheduledDate = args.localScheduledDate ?? event.localScheduledDate;
    const localScheduledTime = args.localScheduledTime ?? event.localScheduledTime;

    const scheduledForUtc = validateScheduleInput({
      title,
      taskRequest,
      requestedToolId,
      localScheduledDate,
      localScheduledTime,
      timezone,
    });
    const now = Date.now();
    const formatted = formatLocalDateTime(scheduledForUtc, timezone);

    await ctx.db.patch(event._id, {
      title: clampLength(title, CALENDAR_SCHEDULE.maxTitleLength),
      description:
        args.description !== undefined
          ? args.description
            ? clampLength(args.description.trim(), CALENDAR_SCHEDULE.maxDescriptionLength)
            : undefined
          : event.description,
      taskRequest: clampLength(taskRequest, CALENDAR_SCHEDULE.maxTaskRequestLength),
      requestedToolId,
      timezone,
      localScheduledDate: formatted.localScheduledDate,
      localScheduledTime: formatted.localScheduledTime,
      scheduledForUtc,
      scheduleStatus: initialScheduleStatus(scheduledForUtc, now),
      dispatchState: "undispatched",
      dispatchClaimToken: undefined,
      dispatchStartedAt: undefined,
      lastDispatchError: undefined,
      revision: event.revision + 1,
      updatedAt: now,
    });
    return { eventId: event._id, scheduledForUtc, revision: event.revision + 1 };
  },
});

export const deleteMyScheduledEvent = mutation({
  args: { eventId: v.id("nexusScheduledEvents") },
  handler: async (ctx, args) => {
    const { clerkUserId } = await getCurrentApprovedClerkUserId(ctx);
    const event = await requireOwnedScheduledEvent(ctx, clerkUserId, args.eventId);
    if (!isCalendarEventDeletable(event)) {
      nexusError(
        NEXUS_ERROR_CODES.SCHEDULED_EVENT_NOT_DELETABLE,
        "Active scheduled tasks cannot be removed from the calendar",
      );
    }
    const now = Date.now();
    await ctx.db.patch(event._id, {
      scheduleStatus: "deleted",
      hiddenFromCalendar: true,
      deletedAt: now,
      deletedBy: clerkUserId,
      updatedAt: now,
    });
    return { eventId: event._id };
  },
});

export const listAllowedScheduledTools = query({
  args: {},
  handler: async (ctx) => {
    await requireKnowledgeReader(ctx);
    return CALENDAR_SCHEDULE.allowedScheduledToolIds.map((id) => ({
      id,
      label:
        id === "vault.agentic_retrieval"
          ? "SAGE Knowledge Vault retrieval"
          : id === "membership_io.transcript_retrieve"
            ? "Membership.io transcript retrieval"
            : id,
    }));
  },
});
