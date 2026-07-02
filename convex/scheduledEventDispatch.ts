import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import {
  CALENDAR_SCHEDULE,
  scheduledEventIdempotencyKey,
} from "./lib/calendarScheduleConfig";
import {
  buildMembershipFullSyncTaskMetadata,
  buildVaultExpansionPassTaskMetadata,
  buildCalendarDeepResearchRequestId,
  calendarScheduledToolUnavailableReason,
  findActiveSingleFlightTask,
  getCalendarScheduledTool,
  isCalendarScheduledToolAvailable,
  isCalendarScheduledToolId,
  DEEP_RESEARCH_TASK_KIND,
  MEMBERSHIP_FULL_SYNC_TASK_KIND,
  MEMBERSHIP_FULL_SYNC_WAIT_MESSAGE,
  VAULT_EXPANSION_PASS_TASK_KIND,
} from "./lib/calendarScheduledTools";
import { composeDeepResearchRequestText } from "./lib/deepResearchRequestCompose";
import {
  buildDeepResearchEnvelope,
  DEEP_RESEARCH_TOOL_ID,
} from "./lib/deepResearchConfig";
import {
  patchScheduledEventForTaskStatus,
  projectScheduledEventFromTask,
} from "./lib/calendarProjection";
import { clampLength, P5_LIMITS } from "./lib/p5config";
import { allocateQueueSequence, defaultQueuePriority } from "./lib/queue";
import { appendProgress, recordAudit } from "./lib/p5writes";

const SCHEDULED_TASK_KIND = "scheduled_task" as const;

async function findExistingScheduledTask(
  ctx: Parameters<typeof dispatchOneEvent>[0],
  ownerClerkUserId: string,
  eventId: string,
) {
  const idempotencyKey = scheduledEventIdempotencyKey(eventId);
  return await ctx.db
    .query("nexusTasks")
    .withIndex("by_owner_and_idempotency_key", (q) =>
      q.eq("ownerClerkUserId", ownerClerkUserId).eq("idempotencyKey", idempotencyKey),
    )
    .unique();
}

async function linkEventToTask(
  ctx: import("./_generated/server").MutationCtx,
  event: Doc<"nexusScheduledEvents">,
  taskId: Id<"nexusTasks">,
  queueSequence: number,
  now: number,
) {
  const lateDispatch = now > event.scheduledForUtc;
  await ctx.db.patch(event._id, {
    linkedTaskId: taskId,
    dispatchState: "dispatched",
    scheduleStatus: "queued",
    dispatchedAt: now,
    lateDispatch: lateDispatch || undefined,
    latenessMs: lateDispatch ? now - event.scheduledForUtc : undefined,
    queueSequence,
    queuedAt: now,
    dispatchClaimToken: undefined,
    lastDispatchError: undefined,
    progressMessage: undefined,
    updatedAt: now,
  });
}

async function releaseDispatchWait(
  ctx: import("./_generated/server").MutationCtx,
  eventId: Id<"nexusScheduledEvents">,
  now: number,
  progressMessage: string,
) {
  await ctx.db.patch(eventId, {
    dispatchState: "undispatched",
    scheduleStatus: "due",
    dispatchClaimToken: undefined,
    dispatchStartedAt: undefined,
    progressMessage,
    updatedAt: now,
  });
}

async function dispatchOneEvent(
  ctx: import("./_generated/server").MutationCtx,
  eventId: import("./_generated/dataModel").Id<"nexusScheduledEvents">,
  now: number,
): Promise<"dispatched" | "skipped" | "failed"> {
  const event = await ctx.db.get(eventId);
  if (!event || event.deletedAt || event.hiddenFromCalendar) return "skipped";
  if (event.linkedTaskId) return "skipped";
  if (event.scheduledForUtc > now) return "skipped";
  if (!["scheduled", "due"].includes(event.scheduleStatus)) return "skipped";
  if (event.dispatchState === "dispatched") return "skipped";
  if (!isCalendarScheduledToolId(event.requestedToolId)) return "failed";

  const toolDef = getCalendarScheduledTool(event.requestedToolId);
  if (!toolDef) return "failed";

  if (!(await isCalendarScheduledToolAvailable(ctx, event.requestedToolId))) {
    await releaseDispatchWait(
      ctx,
      event._id,
      now,
      calendarScheduledToolUnavailableReason(event.requestedToolId),
    );
    return "skipped";
  }

  if (toolDef.singleFlightKey) {
    const active = await findActiveSingleFlightTask(ctx, toolDef.singleFlightKey);
    if (active) {
      await releaseDispatchWait(ctx, event._id, now, MEMBERSHIP_FULL_SYNC_WAIT_MESSAGE);
      return "skipped";
    }
  }

  if (event.dispatchState === "dispatching" && event.dispatchStartedAt) {
    if (now - event.dispatchStartedAt < CALENDAR_SCHEDULE.dispatchClaimTimeoutMs) {
      return "skipped";
    }
  }

  const claimToken = crypto.randomUUID();
  await ctx.db.patch(event._id, {
    scheduleStatus: "dispatching",
    dispatchState: "dispatching",
    dispatchClaimToken: claimToken,
    dispatchStartedAt: now,
    updatedAt: now,
  });

  const fresh = await ctx.db.get(event._id);
  if (
    !fresh ||
    fresh.dispatchClaimToken !== claimToken ||
    fresh.linkedTaskId ||
    fresh.deletedAt
  ) {
    return "skipped";
  }

  if (!(await isCalendarScheduledToolAvailable(ctx, fresh.requestedToolId))) {
    await releaseDispatchWait(
      ctx,
      fresh._id,
      now,
      calendarScheduledToolUnavailableReason(fresh.requestedToolId),
    );
    return "skipped";
  }

  if (toolDef.singleFlightKey) {
    const active = await findActiveSingleFlightTask(ctx, toolDef.singleFlightKey);
    if (active) {
      await releaseDispatchWait(ctx, fresh._id, now, MEMBERSHIP_FULL_SYNC_WAIT_MESSAGE);
      return "skipped";
    }
  }

  const existingTask = await findExistingScheduledTask(ctx, fresh.ownerClerkUserId, fresh._id);
  if (existingTask) {
    await linkEventToTask(ctx, fresh, existingTask._id, existingTask.queueSequence, now);
    await projectScheduledEventFromTask(ctx, fresh, existingTask);
    return "dispatched";
  }

  try {
    const queueSequence = await allocateQueueSequence(ctx);
    const idempotencyKey = scheduledEventIdempotencyKey(fresh._id);
    const lateDispatch = now > fresh.scheduledForUtc;
    const requestText =
      toolDef.inputMode === "no_input_action"
        ? (toolDef.fixedRequestText ?? "")
        : clampLength(fresh.taskRequest, P5_LIMITS.maxRequestLength);

    const taskInsertBase = {
      ownerClerkUserId: fresh.ownerClerkUserId,
      scheduledEventId: fresh._id,
      requestedToolId: fresh.requestedToolId,
      requestText,
      status: "queued" as const,
      queueSequence,
      priority: defaultQueuePriority(),
      createdAt: now,
      updatedAt: now,
      queuedAt: now,
      attemptNumber: 1,
      idempotencyKey,
    };

    const taskId = await (async () => {
      if (toolDef.taskKind === MEMBERSHIP_FULL_SYNC_TASK_KIND) {
        return await ctx.db.insert("nexusTasks", {
          ...taskInsertBase,
          taskKind: MEMBERSHIP_FULL_SYNC_TASK_KIND,
          taskMetadata: buildMembershipFullSyncTaskMetadata(fresh._id, fresh.scheduledForUtc),
        });
      }

      if (toolDef.taskKind === VAULT_EXPANSION_PASS_TASK_KIND) {
        return await ctx.db.insert("nexusTasks", {
          ...taskInsertBase,
          taskKind: VAULT_EXPANSION_PASS_TASK_KIND,
          taskMetadata: buildVaultExpansionPassTaskMetadata(fresh._id, fresh.scheduledForUtc),
        });
      }

      if (toolDef.taskKind === DEEP_RESEARCH_TASK_KIND) {
        const composed = composeDeepResearchRequestText(
          fresh.taskRequest,
          fresh.deepResearchReportRules ?? "",
        );
        const researchRequestId =
          fresh.deepResearchRequestId ?? buildCalendarDeepResearchRequestId(fresh._id);
        const built = buildDeepResearchEnvelope({
          requestText: composed,
          researchRequestId,
          idempotencyKey,
        });
        if (!built.ok) {
          throw new Error(`deep_research_dispatch_${built.code}`);
        }
        const { envelope } = built;
        return await ctx.db.insert("nexusTasks", {
          ...taskInsertBase,
          requestedToolId: DEEP_RESEARCH_TOOL_ID,
          requestText: clampLength(envelope.requestText, P5_LIMITS.maxRequestLength),
          taskKind: DEEP_RESEARCH_TASK_KIND,
          taskMetadata: envelope.taskMetadata,
          idempotencyKey: envelope.taskMetadata.idempotencyKey,
        });
      }

      return await ctx.db.insert("nexusTasks", {
        ...taskInsertBase,
        taskKind: SCHEDULED_TASK_KIND,
        taskMetadata: {
          kind: SCHEDULED_TASK_KIND,
          scheduledEventId: fresh._id,
          scheduledForUtc: fresh.scheduledForUtc,
          explicitUserAction: "schedule",
          lateDispatch: lateDispatch || undefined,
        },
      });
    })();

    await appendProgress(ctx, {
      taskId,
      ownerClerkUserId: fresh.ownerClerkUserId,
      eventType: "task_created",
      now,
    });
    await appendProgress(ctx, {
      taskId,
      ownerClerkUserId: fresh.ownerClerkUserId,
      eventType: "task_queued",
      message: "Queued from a scheduled calendar event.",
      now,
    });
    await recordAudit(ctx, {
      ownerClerkUserId: fresh.ownerClerkUserId,
      eventType: "task_created",
      taskId,
      now,
      metadata: {
        requestedToolId: fresh.requestedToolId,
        queueSequence,
        scheduledEventId: fresh._id,
      },
    });

    await linkEventToTask(ctx, fresh, taskId, queueSequence, now);
    const task = await ctx.db.get(taskId);
    if (task) {
      await projectScheduledEventFromTask(ctx, fresh, task);
    }
    return "dispatched";
  } catch (err) {
    const message = err instanceof Error ? err.message : "dispatch_failed";
    await ctx.db.patch(event._id, {
      dispatchState: "undispatched",
      scheduleStatus: "due",
      dispatchClaimToken: undefined,
      lastDispatchError: clampLength(message, P5_LIMITS.maxErrorMessageLength),
      updatedAt: now,
    });
    return "failed";
  }
}

/** Mark future scheduled events as due once their UTC instant has passed. */
export const markDueScheduledEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const dueCandidates = await ctx.db
      .query("nexusScheduledEvents")
      .withIndex("by_schedule_status_and_scheduled_for_utc", (q) =>
        q.eq("scheduleStatus", "scheduled"),
      )
      .filter((q) => q.lte(q.field("scheduledForUtc"), now))
      .take(CALENDAR_SCHEDULE.maxReconcilePerRun);

    for (const event of dueCandidates) {
      if (event.deletedAt || event.hiddenFromCalendar || event.linkedTaskId) continue;
      await ctx.db.patch(event._id, { scheduleStatus: "due", updatedAt: now });
    }
  },
});

/** Dispatch due, undispatched scheduled events into the normal nexusTasks queue. */
export const dispatchDueScheduledEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let dispatched = 0;

    for (const status of ["due", "scheduled"] as const) {
      if (dispatched >= CALENDAR_SCHEDULE.maxDispatchPerRun) break;
      const batch = await ctx.db
        .query("nexusScheduledEvents")
        .withIndex("by_schedule_status_and_scheduled_for_utc", (q) =>
          q.eq("scheduleStatus", status),
        )
        .filter((q) => q.lte(q.field("scheduledForUtc"), now))
        .take(CALENDAR_SCHEDULE.maxDispatchPerRun - dispatched);

      for (const event of batch) {
        if (dispatched >= CALENDAR_SCHEDULE.maxDispatchPerRun) break;
        const result = await dispatchOneEvent(ctx, event._id, now);
        if (result === "dispatched") dispatched += 1;
      }
    }
  },
});

/** Recover stale dispatch claims and project linked task status onto events. */
export const reconcileScheduledEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const staleDispatching = await ctx.db
      .query("nexusScheduledEvents")
      .withIndex("by_dispatch_state_and_scheduled_for_utc", (q) =>
        q.eq("dispatchState", "dispatching"),
      )
      .take(CALENDAR_SCHEDULE.maxReconcilePerRun);

    for (const event of staleDispatching) {
      if (!event.dispatchStartedAt) continue;
      if (now - event.dispatchStartedAt < CALENDAR_SCHEDULE.dispatchClaimTimeoutMs) continue;
      if (event.linkedTaskId) continue;
      await ctx.db.patch(event._id, {
        dispatchState: "undispatched",
        scheduleStatus: event.scheduledForUtc <= now ? "due" : "scheduled",
        dispatchClaimToken: undefined,
        updatedAt: now,
      });
    }

    const linked: import("./_generated/dataModel").Doc<"nexusScheduledEvents">[] = [];
    for (const status of ["queued", "running", "dispatching"] as const) {
      const batch = await ctx.db
        .query("nexusScheduledEvents")
        .withIndex("by_schedule_status_and_scheduled_for_utc", (q) =>
          q.eq("scheduleStatus", status),
        )
        .take(CALENDAR_SCHEDULE.maxReconcilePerRun);
      linked.push(...batch);
    }

    let reconciled = 0;
    for (const event of linked) {
      if (reconciled >= CALENDAR_SCHEDULE.maxReconcilePerRun) break;
      if (!event.linkedTaskId || event.deletedAt) continue;
      if (["completed", "failed", "cancelled", "deleted"].includes(event.scheduleStatus)) {
        continue;
      }
      const task = await ctx.db.get(event.linkedTaskId);
      if (!task) continue;
      await patchScheduledEventForTaskStatus(ctx, task);
      reconciled += 1;
    }
  },
});

export const runScheduledEventMaintenance = internalMutation({
  args: {},
  handler: async (ctx) => {
    await ctx.runMutation(internal.scheduledEventDispatch.markDueScheduledEvents, {});
    await ctx.runMutation(internal.scheduledEventDispatch.dispatchDueScheduledEvents, {});
    await ctx.runMutation(internal.scheduledEventDispatch.reconcileScheduledEvents, {});
  },
});
