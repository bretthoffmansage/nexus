// @vitest-environment edge-runtime
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  buildCalendarDeepResearchRequestId,
  CALENDAR_SCHEDULED_TOOLS,
  DEEP_RESEARCH_SCHEDULED_TOOL,
  getCalendarScheduledTool,
} from "@/convex/lib/calendarScheduledTools";
import { scheduledEventIdempotencyKey } from "@/convex/lib/calendarScheduleConfig";
import {
  buildDeepResearchEnvelope,
  DEEP_RESEARCH_SOURCE_PAGE,
  DEEP_RESEARCH_TASK_KIND,
  DEEP_RESEARCH_TOOL_ID,
} from "@/convex/lib/deepResearchConfig";
import {
  composeDeepResearchRequestText,
  DEFAULT_DEEP_RESEARCH_REPORT_RULES,
  DEEP_RESEARCH_RULES_DIVIDER,
  DEEP_RESEARCH_RULES_HEADING,
  validateComposedDeepResearchRequest,
} from "@/convex/lib/deepResearchRequestCompose";
import { MEMBERSHIP_FULL_SYNC_TOOL_ID } from "@/convex/lib/p6config";
import { P5_SUPPORTED_TOOL_IDS } from "@/convex/lib/p5config";
import { SKILLS_CATALOG_TOOL_DEFS } from "@/convex/lib/nexusSkillsCatalog";
import { IDENTITY_A, p5Test, seedApprovedReader } from "./helpers/convexP5";
import { clearConnectorEnv, installConnectorEnv, seedConnector } from "./helpers/convexP6";

const ROOT = path.resolve(import.meta.dirname, "..");
const FIXED_SCHEDULE_MS = Date.UTC(2026, 5, 1, 12, 0, 0);

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

async function insertDueDeepResearchEvent(
  t: ReturnType<typeof p5Test>,
  opts: {
    scheduledForUtcMs?: number;
    taskRequest?: string;
    reportRules?: string;
    researchRequestId?: string;
  } = {},
) {
  const now = Date.now();
  const scheduledForUtcMs = opts.scheduledForUtcMs ?? FIXED_SCHEDULE_MS;
  const eventId = await t.run(async (ctx) =>
    ctx.db.insert("nexusScheduledEvents", {
      ownerClerkUserId: IDENTITY_A.subject,
      title: "Scheduled research",
      taskRequest: opts.taskRequest ?? "What changed in vault policy?",
      requestedToolId: DEEP_RESEARCH_TOOL_ID,
      deepResearchReportRules: opts.reportRules,
      deepResearchRequestId: opts.researchRequestId,
      timezone: "UTC",
      localScheduledDate: "2026-06-01",
      localScheduledTime: "12:00",
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
  if (!opts.researchRequestId) {
    await t.run(async (ctx) =>
      ctx.db.patch(eventId, {
        deepResearchRequestId: buildCalendarDeepResearchRequestId(eventId),
      }),
    );
  }
  return eventId;
}

beforeEach(() => {
  installConnectorEnv();
});

afterEach(() => {
  clearConnectorEnv();
});

describe("Calendar Deep Research scheduling", () => {
  describe("registry and capability gating", () => {
    it("includes Deep Research in the scheduled-tool registry", () => {
      expect(CALENDAR_SCHEDULED_TOOLS.map((tool) => tool.requestedToolId)).toEqual([
        "vault.agentic_retrieval",
        "membership_io.transcript_retrieve",
        DEEP_RESEARCH_TOOL_ID,
        MEMBERSHIP_FULL_SYNC_TOOL_ID,
      ]);
      expect(DEEP_RESEARCH_SCHEDULED_TOOL.displayLabel).toBe("Deep Research");
      expect(DEEP_RESEARCH_SCHEDULED_TOOL.inputMode).toBe("structured_deep_research");
      expect(DEEP_RESEARCH_SCHEDULED_TOOL.taskKind).toBe(DEEP_RESEARCH_TASK_KIND);
      expect(DEEP_RESEARCH_SCHEDULED_TOOL.requiresConnectorCapability).toBe(true);
      expect(DEEP_RESEARCH_SCHEDULED_TOOL.chatAvailable).toBe(false);
    });

    it("marks Deep Research unavailable without Connector capability", async () => {
      const t = p5Test();
      await seedApprovedReader(t, IDENTITY_A);
      const tools = await t
        .withIdentity(IDENTITY_A)
        .query(api.scheduledEvents.listAllowedScheduledTools, {});
      const deepResearch = tools.find((tool) => tool.id === DEEP_RESEARCH_TOOL_ID);
      expect(deepResearch?.available).toBe(false);
      expect(deepResearch?.unavailableReason).toContain("Deep Research");
    });

    it("enables Deep Research when Connector advertises the tool", async () => {
      const t = p5Test();
      await seedApprovedReader(t, IDENTITY_A);
      await seedConnector(t, {
        allowedToolIds: [...P5_SUPPORTED_TOOL_IDS, DEEP_RESEARCH_TOOL_ID],
      });
      const tools = await t
        .withIdentity(IDENTITY_A)
        .query(api.scheduledEvents.listAllowedScheduledTools, {});
      const deepResearch = tools.find((tool) => tool.id === DEEP_RESEARCH_TOOL_ID);
      expect(deepResearch?.available).toBe(true);
    });

    it("leaves Chat and Library selectors unchanged", () => {
      expect(P5_SUPPORTED_TOOL_IDS).not.toContain(DEEP_RESEARCH_TOOL_ID);
      const dialogSrc = read("components/workspace/port/CalendarEventDialog.tsx");
      expect(dialogSrc).toContain("structured_deep_research");
      expect(dialogSrc).toContain("DeepResearchRequestFields");
      expect(dialogSrc).not.toContain("requestedModelId");
    });
  });

  describe("Calendar form and validation", () => {
    it("exposes research request, report rules default, and model UI in the dialog", () => {
      const dialogSrc = read("components/workspace/port/CalendarEventDialog.tsx");
      const fieldsSrc = read("components/workspace/DeepResearchRequestFields.tsx");
      const composeSrc = read("convex/lib/deepResearchRequestCompose.ts");
      expect(dialogSrc).toContain("Research request");
      expect(dialogSrc).toContain("Report rules");
      expect(composeSrc).toContain(DEFAULT_DEEP_RESEARCH_REPORT_RULES);
      expect(fieldsSrc).toContain("ResearchModelSelector");
      expect(dialogSrc).toContain("Notes (optional)");
      expect(dialogSrc).toContain('type="date"');
      expect(dialogSrc).toContain('type="time"');
      expect(dialogSrc).toContain("Timezone");
    });

    it("rejects blank research request and oversized composed payload server-side", async () => {
      const t = p5Test();
      await seedApprovedReader(t, IDENTITY_A);
      await seedConnector(t, {
        allowedToolIds: [...P5_SUPPORTED_TOOL_IDS, DEEP_RESEARCH_TOOL_ID],
      });
      await expect(
        t.withIdentity(IDENTITY_A).mutation(api.scheduledEvents.createMyScheduledEvent, {
          title: "Research",
          taskRequest: "   ",
          localScheduledDate: "2031-05-01",
          localScheduledTime: "09:00",
          timezone: "UTC",
          requestedToolId: DEEP_RESEARCH_TOOL_ID,
        }),
      ).rejects.toThrow(/Research request is required/);

      const oversized = "x".repeat(8001);
      await expect(
        t.withIdentity(IDENTITY_A).mutation(api.scheduledEvents.createMyScheduledEvent, {
          title: "Research",
          taskRequest: oversized,
          localScheduledDate: "2031-05-02",
          localScheduledTime: "09:00",
          timezone: "UTC",
          requestedToolId: DEEP_RESEARCH_TOOL_ID,
        }),
      ).rejects.toThrow(/too long/i);

      const exact = "a".repeat(8000);
      const validation = validateComposedDeepResearchRequest(exact, "");
      expect(validation.ok).toBe(true);
    });

    it("rejects scheduling when Connector capability is absent", async () => {
      const t = p5Test();
      await seedApprovedReader(t, IDENTITY_A);
      await expect(
        t.withIdentity(IDENTITY_A).mutation(api.scheduledEvents.createMyScheduledEvent, {
          title: "Research",
          taskRequest: "Analyze trends",
          localScheduledDate: "2031-05-03",
          localScheduledTime: "09:00",
          timezone: "UTC",
          requestedToolId: DEEP_RESEARCH_TOOL_ID,
        }),
      ).rejects.toThrow(/Deep Research requires Connector capability/);
    });
  });

  describe("task envelope and identifiers", () => {
    it("composes requestText with exact divider and omits blank rules", () => {
      const withRules = composeDeepResearchRequestText("Primary question", "No names");
      expect(withRules).toBe(
        `Primary question\n${DEEP_RESEARCH_RULES_DIVIDER}\n${DEEP_RESEARCH_RULES_HEADING}\nNo names`,
      );
      expect(composeDeepResearchRequestText("Only request", "   ")).toBe("Only request");
    });

    it("builds the exact Deep Research envelope with five metadata keys", () => {
      const eventId = "evt12345" as Id<"nexusScheduledEvents">;
      const researchRequestId = buildCalendarDeepResearchRequestId(eventId);
      const idempotencyKey = scheduledEventIdempotencyKey(eventId);
      const composed = composeDeepResearchRequestText("Question", DEFAULT_DEEP_RESEARCH_REPORT_RULES);
      const built = buildDeepResearchEnvelope({
        requestText: composed,
        researchRequestId,
        idempotencyKey,
      });
      expect(built.ok).toBe(true);
      if (!built.ok) return;
      expect(built.envelope.requestedToolId).toBe(DEEP_RESEARCH_TOOL_ID);
      expect(built.envelope.taskKind).toBe(DEEP_RESEARCH_TASK_KIND);
      expect(built.envelope.requestedModelId).toBeUndefined();
      expect(built.envelope.taskMetadata).toEqual({
        kind: DEEP_RESEARCH_TASK_KIND,
        sourcePage: DEEP_RESEARCH_SOURCE_PAGE,
        explicitUserAction: "research",
        researchRequestId,
        idempotencyKey,
      });
      expect(Object.keys(built.envelope.taskMetadata).sort()).toEqual([
        "explicitUserAction",
        "idempotencyKey",
        "kind",
        "researchRequestId",
        "sourcePage",
      ]);
    });

    it("dispatches one deep_research task into the global queue", async () => {
      const t = p5Test();
      await seedApprovedReader(t, IDENTITY_A);
      await seedConnector(t, {
        allowedToolIds: [...P5_SUPPORTED_TOOL_IDS, DEEP_RESEARCH_TOOL_ID],
      });
      const eventId = await insertDueDeepResearchEvent(t, {
        reportRules: "No employee names",
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
      const task = tasks[0];
      expect(task.requestedToolId).toBe(DEEP_RESEARCH_TOOL_ID);
      expect(task.taskKind).toBe(DEEP_RESEARCH_TASK_KIND);
      expect(task.scheduledEventId).toBe(eventId);
      expect(task.requestText).toBe(
        composeDeepResearchRequestText("What changed in vault policy?", "No employee names"),
      );
      expect(task.taskMetadata?.kind).toBe(DEEP_RESEARCH_TASK_KIND);
      if (task.taskMetadata?.kind === DEEP_RESEARCH_TASK_KIND) {
        expect(task.taskMetadata.scheduledEventId).toBeUndefined();
        expect(Object.keys(task.taskMetadata)).toHaveLength(5);
      }
      expect(task.requestedModelId).toBeUndefined();
      expect(task.conversationId).toBeUndefined();
      expect(task.requestMessageId).toBeUndefined();
    });

    it("reuses stable identifiers and creates only one task across scheduler passes", async () => {
      const t = p5Test();
      await seedApprovedReader(t, IDENTITY_A);
      await seedConnector(t, {
        allowedToolIds: [...P5_SUPPORTED_TOOL_IDS, DEEP_RESEARCH_TOOL_ID],
      });
      const eventId = await insertDueDeepResearchEvent(t);
      const researchRequestId = buildCalendarDeepResearchRequestId(eventId);
      const idempotencyKey = scheduledEventIdempotencyKey(eventId);

      await t.mutation(internal.scheduledEventDispatch.runScheduledEventMaintenance, {});
      await t.mutation(internal.scheduledEventDispatch.runScheduledEventMaintenance, {});

      const tasks = await t.run(async (ctx) =>
        ctx.db
          .query("nexusTasks")
          .withIndex("by_owner_and_idempotency_key", (q) =>
            q.eq("ownerClerkUserId", IDENTITY_A.subject).eq("idempotencyKey", idempotencyKey),
          )
          .collect(),
      );
      expect(tasks).toHaveLength(1);
      if (tasks[0].taskMetadata?.kind === DEEP_RESEARCH_TASK_KIND) {
        expect(tasks[0].taskMetadata.researchRequestId).toBe(researchRequestId);
        expect(tasks[0].taskMetadata.idempotencyKey).toBe(idempotencyKey);
      }
    });

    it("creates distinct execution identity for separate scheduled events", async () => {
      const t = p5Test();
      await seedApprovedReader(t, IDENTITY_A);
      await seedConnector(t, {
        allowedToolIds: [...P5_SUPPORTED_TOOL_IDS, DEEP_RESEARCH_TOOL_ID],
      });
      const eventA = await insertDueDeepResearchEvent(t, { taskRequest: "First" });
      const eventB = await insertDueDeepResearchEvent(t, {
        taskRequest: "Second",
        scheduledForUtcMs: FIXED_SCHEDULE_MS + 60_000,
      });
      await t.mutation(internal.scheduledEventDispatch.runScheduledEventMaintenance, {});

      const keys = [eventA, eventB].map((id) => scheduledEventIdempotencyKey(id));
      expect(keys[0]).not.toBe(keys[1]);

      const tasks = await t.run(async (ctx) =>
        ctx.db
          .query("nexusTasks")
          .withIndex("by_owner_and_created_at", (q) =>
            q.eq("ownerClerkUserId", IDENTITY_A.subject),
          )
          .collect(),
      );
      const researchTasks = tasks.filter((row) => row.taskKind === DEEP_RESEARCH_TASK_KIND);
      expect(researchTasks).toHaveLength(2);
    });
  });

  describe("history, projection, and skills", () => {
    it("lists Calendar-created research in Deep Research history and Tasks queue", async () => {
      const t = p5Test();
      await seedApprovedReader(t, IDENTITY_A);
      await seedConnector(t, {
        allowedToolIds: [...P5_SUPPORTED_TOOL_IDS, DEEP_RESEARCH_TOOL_ID],
      });
      await insertDueDeepResearchEvent(t);
      await t.mutation(internal.scheduledEventDispatch.runScheduledEventMaintenance, {});

      const history = await t
        .withIdentity(IDENTITY_A)
        .query(api.deepResearch.listMyDeepResearchTasks, { limit: 10 });
      expect(history.tasks).toHaveLength(1);
      expect(history.tasks[0].requestedToolId).toBe(DEEP_RESEARCH_TOOL_ID);

      const tasksPage = await t
        .withIdentity(IDENTITY_A)
        .query(api.tasks.listMyTasks, { limit: 10 });
      expect(tasksPage.tasks.some((task) => task.requestedToolId === DEEP_RESEARCH_TOOL_ID)).toBe(
        true,
      );
    });

    it("projects completion onto the linked Calendar event", async () => {
      const t = p5Test();
      await seedApprovedReader(t, IDENTITY_A);
      await seedConnector(t, {
        allowedToolIds: [...P5_SUPPORTED_TOOL_IDS, DEEP_RESEARCH_TOOL_ID],
      });
      const eventId = await insertDueDeepResearchEvent(t);
      await t.mutation(internal.scheduledEventDispatch.runScheduledEventMaintenance, {});

      const task = await t.run(async (ctx) =>
        ctx.db
          .query("nexusTasks")
          .withIndex("by_owner_and_idempotency_key", (q) =>
            q
              .eq("ownerClerkUserId", IDENTITY_A.subject)
              .eq("idempotencyKey", scheduledEventIdempotencyKey(eventId)),
          )
          .unique(),
      );
      expect(task).not.toBeNull();
      await t.run(async (ctx) => {
        await ctx.db.patch(task!._id, {
          status: "completed",
          completedAt: Date.now(),
          resultSummary: "Done",
          updatedAt: Date.now(),
        });
      });
      await t.mutation(internal.scheduledEventDispatch.reconcileScheduledEvents, {});

      const event = await t
        .withIdentity(IDENTITY_A)
        .query(api.scheduledEvents.getMyScheduledEvent, { eventId });
      expect(event.scheduleStatus).toBe("completed");
      expect(event.terminalResultSummary).toBe("Done");
    });

    it("includes Calendar in Deep Research Skills surfaces", () => {
      const def = SKILLS_CATALOG_TOOL_DEFS.find((tool) => tool.toolId === DEEP_RESEARCH_TOOL_ID)!;
      expect(def.calendarAvailable).toBe(true);
      expect(def.accessModes).toEqual(["deep_research", "calendar", "connector"]);
      expect(def.ordinaryChatAvailable).toBe(false);
      expect(def.libraryAvailable).toBe(false);
    });
  });

  describe("architecture guards", () => {
    it("does not add queues, endpoints, workers, or Claudia files", () => {
      const dispatchSrc = read("convex/scheduledEventDispatch.ts");
      expect(dispatchSrc).toContain('insert("nexusTasks"');
      expect(dispatchSrc).not.toContain("researchQueue");
      expect(dispatchSrc).not.toMatch(/tavily/i);
      expect(getCalendarScheduledTool(DEEP_RESEARCH_TOOL_ID)?.taskKind).toBe(DEEP_RESEARCH_TASK_KIND);
    });
  });
});
