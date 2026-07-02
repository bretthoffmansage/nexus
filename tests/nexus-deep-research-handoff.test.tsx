// @vitest-environment edge-runtime
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useQuery: () => undefined,
  useMutation: () => vi.fn(),
  useConvexAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    isRefreshing: false,
  }),
}));

import { api } from "@/convex/_generated/api";
import {
  buildDeepResearchEnvelope,
  buildDeepResearchTaskMetadata,
  DEEP_RESEARCH_BLOCKED_CODES,
  DEEP_RESEARCH_EXPLICIT_USER_ACTION,
  DEEP_RESEARCH_MAX_REQUEST_LENGTH,
  DEEP_RESEARCH_SOURCE_PAGE,
  DEEP_RESEARCH_TASK_KIND,
  DEEP_RESEARCH_TOOL_ID,
  isDeepResearchBlockedCode,
  isValidDeepResearchIdentifier,
} from "@/convex/lib/deepResearchConfig";
import {
  NEXUS_SKILLS_CATALOG_TOOL_IDS,
  SKILLS_CATALOG_TOOL_DEFS,
  skillsCatalogToolIdsMatchAuthority,
} from "@/convex/lib/nexusSkillsCatalog";
import { CALENDAR_SCHEDULED_TOOLS } from "@/convex/lib/calendarScheduledTools";
import { P5_SUPPORTED_TOOL_IDS } from "@/convex/lib/p5config";
import { KNOWN_CONNECTOR_TOOL_IDS } from "@/convex/lib/p6config";
import { NEXUS_TOOL_REGISTRY } from "@/lib/navigation/toolRegistry";
import {
  loadOrCreateIdempotencyKey,
  loadOrCreateResearchRequestId,
  rotateIdempotencyKey,
  rotateResearchRequestSession,
  validateResearchRequestLength,
} from "@/lib/nexus/deepResearchSession";
import {
  blockedResearchMessage,
  deepResearchLifecycleLabel,
  deriveDeepResearchLifecycle,
  formatResearchDuration,
} from "@/lib/nexus/deepResearchView";
import { isSafeHttpUrl } from "@/lib/nexus/safeHttpUrl";
import { IDENTITY_A, p5Test, seedApprovedReader } from "./helpers/convexP5";

const ROOT = path.resolve(import.meta.dirname, "..");

function read(relPath: string): string {
  return readFileSync(path.join(ROOT, relPath), "utf8");
}

const VALID_REQUEST_ID = "nexus-research_test-request";
const VALID_IDEM_KEY = "nexus-research-run_test-exec";

beforeEach(() => {
  const store: Record<string, string> = {};
  let uuidCounter = 0;
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const key of Object.keys(store)) delete store[key];
    },
  });
  vi.stubGlobal("crypto", {
    randomUUID: () => {
      uuidCounter += 1;
      return `00000000-0000-4000-8000-${String(uuidCounter).padStart(12, "0")}`;
    },
  });
});

describe("Nexus Deep Research handoff", () => {
  describe("envelope construction", () => {
    it("builds the exact canonical envelope", () => {
      const result = buildDeepResearchEnvelope({
        requestText: "  What changed in vault policy?\n\nFocus on 2024.  ",
        researchRequestId: VALID_REQUEST_ID,
        idempotencyKey: VALID_IDEM_KEY,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.envelope).toEqual({
        requestedToolId: DEEP_RESEARCH_TOOL_ID,
        taskKind: DEEP_RESEARCH_TASK_KIND,
        requestText: "What changed in vault policy?\n\nFocus on 2024.",
        taskMetadata: {
          kind: DEEP_RESEARCH_TASK_KIND,
          sourcePage: DEEP_RESEARCH_SOURCE_PAGE,
          explicitUserAction: DEEP_RESEARCH_EXPLICIT_USER_ACTION,
          researchRequestId: VALID_REQUEST_ID,
          idempotencyKey: VALID_IDEM_KEY,
        },
      });
    });

    it("rejects blank, oversized, and invalid identifiers", () => {
      expect(buildDeepResearchEnvelope({
        requestText: "   ",
        researchRequestId: VALID_REQUEST_ID,
        idempotencyKey: VALID_IDEM_KEY,
      })).toEqual({ ok: false, code: "empty_request" });

      const exact = "x".repeat(DEEP_RESEARCH_MAX_REQUEST_LENGTH);
      expect(buildDeepResearchEnvelope({
        requestText: exact,
        researchRequestId: VALID_REQUEST_ID,
        idempotencyKey: VALID_IDEM_KEY,
      }).ok).toBe(true);

      expect(buildDeepResearchEnvelope({
        requestText: `${exact}x`,
        researchRequestId: VALID_REQUEST_ID,
        idempotencyKey: VALID_IDEM_KEY,
      })).toEqual({ ok: false, code: "request_too_large" });
    });

    it("metadata contains exactly five allowed keys with fixed values", () => {
      const metadata = buildDeepResearchTaskMetadata(VALID_REQUEST_ID, VALID_IDEM_KEY);
      expect(Object.keys(metadata).sort()).toEqual([
        "explicitUserAction",
        "idempotencyKey",
        "kind",
        "researchRequestId",
        "sourcePage",
      ]);
      expect(metadata.kind).toBe("deep_research");
      expect(metadata.sourcePage).toBe("nexus_deep_research");
      expect(metadata.explicitUserAction).toBe("research");
    });

    it("never includes forbidden execution fields", () => {
      const result = buildDeepResearchEnvelope({
        requestText: "safe request",
        researchRequestId: VALID_REQUEST_ID,
        idempotencyKey: VALID_IDEM_KEY,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const serialized = JSON.stringify(result.envelope);
      for (const forbidden of [
        "conversationId",
        "requestMessageId",
        "attachments",
        "model",
        "provider",
        "maxTurns",
        "maxIterations",
        "systemPrompt",
        "toolsets",
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
    });
  });

  describe("identifiers", () => {
    it("accepts valid identifier format", () => {
      expect(isValidDeepResearchIdentifier(VALID_REQUEST_ID)).toBe(true);
      expect(isValidDeepResearchIdentifier("short")).toBe(false);
    });

    it("keeps researchRequestId stable until intentional rotation", () => {
      const first = loadOrCreateResearchRequestId();
      const second = loadOrCreateResearchRequestId();
      expect(first).toBe(second);
      const rotated = rotateResearchRequestSession();
      expect(rotated.researchRequestId).not.toBe(first);
    });

    it("keeps idempotencyKey stable until intentional new run", () => {
      const first = loadOrCreateIdempotencyKey();
      const second = loadOrCreateIdempotencyKey();
      expect(first).toBe(second);
      const rotated = rotateIdempotencyKey();
      expect(rotated).not.toBe(first);
    });
  });

  describe("submission through nexusTasks", () => {
    it("creates a deep_research task without conversation fields", async () => {
      const t = p5Test();
      await seedApprovedReader(t, IDENTITY_A);
      const asUser = t.withIdentity(IDENTITY_A);

      const submit = await asUser.mutation(api.deepResearch.submitDeepResearch, {
        requestText: "Summarize membership onboarding changes.",
        researchRequestId: VALID_REQUEST_ID,
        idempotencyKey: VALID_IDEM_KEY,
      });
      expect(submit.duplicate).toBe(false);

      const duplicate = await asUser.mutation(api.deepResearch.submitDeepResearch, {
        requestText: "Summarize membership onboarding changes.",
        researchRequestId: VALID_REQUEST_ID,
        idempotencyKey: VALID_IDEM_KEY,
      });
      expect(duplicate.duplicate).toBe(true);
      expect(duplicate.taskId).toBe(submit.taskId);

      const task = await asUser.query(api.tasks.getMyTask, { taskId: submit.taskId });
      expect(task?.requestedToolId).toBe(DEEP_RESEARCH_TOOL_ID);
      expect(task?.conversationId ?? null).toBeNull();
      expect(task?.requestMessageId ?? null).toBeNull();

      const listed = await asUser.query(api.deepResearch.listMyDeepResearchTasks, { limit: 5 });
      expect(listed.tasks.some((row) => row.id === submit.taskId)).toBe(true);
    });
  });

  describe("page UI", () => {
    it("renders multiline request, character count, and the model selector", () => {
      const src = read("components/workspace/port/ResearchWorkspace.tsx");
      const fieldsSrc = read("components/workspace/DeepResearchRequestFields.tsx");
      expect(src).toContain("DeepResearchRequestFields");
      expect(fieldsSrc).toContain("research-request-input");
      expect(fieldsSrc).toContain("textarea");
      expect(fieldsSrc).toContain("DEEP_RESEARCH_MAX_REQUEST_LENGTH");
      expect(fieldsSrc).toContain("ResearchModelSelector");
      expect(src).not.toContain("Managed by Claudia");
      expect(src).not.toContain("Max rounds");
      expect(src).not.toContain("ToolAvailabilityBanner");
      expect(src).not.toContain("Hide settings");
    });

    it("disables Research until request text is valid", () => {
      const src = read("components/workspace/port/ResearchWorkspace.tsx");
      expect(src).toContain("disabled={!canSubmit}");
      expect(src).toContain("validateComposedDeepResearchRequest");
    });
  });

  describe("sidebar and skills", () => {
    it("removes legacy Connector badge from Deep Research sidebar item", () => {
      const research = NEXUS_TOOL_REGISTRY.find((tool) => tool.id === "research");
      expect(research?.availability).toBe("available");
      expect(research?.label).toBe("Deep Research");
    });

    it("includes Deep Research in Skills catalog only on dedicated surfaces", () => {
      expect(skillsCatalogToolIdsMatchAuthority()).toBe(true);
      expect(NEXUS_SKILLS_CATALOG_TOOL_IDS).toContain(DEEP_RESEARCH_TOOL_ID);
      const def = SKILLS_CATALOG_TOOL_DEFS.find((tool) => tool.toolId === DEEP_RESEARCH_TOOL_ID)!;
      expect(def.displayName).toBe("Deep Research");
      expect(def.ordinaryChatAvailable).toBe(false);
      expect(def.calendarAvailable).toBe(true);
      expect(def.libraryAvailable).toBe(false);
      expect(def.accessModes).toEqual(["deep_research", "calendar", "connector"]);
    });

    it("includes Deep Research in Calendar selectors when Connector allows it", () => {
      expect(P5_SUPPORTED_TOOL_IDS).not.toContain(DEEP_RESEARCH_TOOL_ID);
      expect(CALENDAR_SCHEDULED_TOOLS.map((tool) => tool.requestedToolId)).toContain(
        DEEP_RESEARCH_TOOL_ID,
      );
    });
  });

  describe("lifecycle and blocked results", () => {
    it("maps task statuses to page lifecycle states", () => {
      expect(deriveDeepResearchLifecycle({ taskStatus: "queued" })).toBe("queued");
      expect(deriveDeepResearchLifecycle({ taskStatus: "claimed" })).toBe("preparing");
      expect(deriveDeepResearchLifecycle({ taskStatus: "running" })).toBe("running");
      expect(deriveDeepResearchLifecycle({ taskStatus: "completed" })).toBe("completed");
      expect(
        deriveDeepResearchLifecycle({ taskStatus: "failed", errorCode: "research_disabled" }),
      ).toBe("blocked");
      expect(
        deriveDeepResearchLifecycle({ taskStatus: "failed", errorCode: "connector_error" }),
      ).toBe("failed");
      expect(deepResearchLifecycleLabel("blocked")).toBe("Blocked");
    });

    it("handles blocked codes with safe fallback messaging", () => {
      for (const code of DEEP_RESEARCH_BLOCKED_CODES) {
        expect(isDeepResearchBlockedCode(code)).toBe(true);
      }
      expect(blockedResearchMessage("research_disabled", "Research is disabled.")).toBe(
        "Research is disabled.",
      );
      expect(blockedResearchMessage("research_disabled", null)).toBe(
        "Deep Research is currently unavailable.",
      );
      expect(blockedResearchMessage("unsupported_tool", "")).toBe(
        "Deep Research is currently unavailable.",
      );
    });
  });

  describe("result rendering", () => {
    it("guards external links to http/https only", () => {
      expect(isSafeHttpUrl("https://example.com")).toBe(true);
      expect(isSafeHttpUrl("http://example.com")).toBe(true);
      expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
      expect(isSafeHttpUrl("file:///etc/passwd")).toBe(false);
      const safeLinkSrc = read("components/nexus/SafeExternalLink.tsx");
      expect(safeLinkSrc).toContain("isSafeHttpUrl");
      expect(safeLinkSrc).toContain('rel="noopener noreferrer"');
      const markdownSrc = read("components/nexus/SafeMarkdown.tsx");
      expect(markdownSrc).toContain("isSafeHttpUrl");
      expect(markdownSrc).not.toContain("dangerouslySetInnerHTML");
    });

    it("formats optional duration safely", () => {
      expect(formatResearchDuration(450)).toBe("450 ms");
      expect(formatResearchDuration(65000)).toBe("1m 5s");
    });
  });

  describe("architecture guards", () => {
    it("does not introduce direct Claudia/Hermes/Tavily integrations or second queue", () => {
      const workspaceSrc = read("components/workspace/port/ResearchWorkspace.tsx");
      const convexSrc = read("convex/deepResearch.ts");
      for (const src of [workspaceSrc, convexSrc]) {
        expect(src).not.toMatch(/tavily/i);
        expect(src).not.toContain("/api/research");
      }
      expect(workspaceSrc).not.toMatch(/research\.hermes/i);
      expect(convexSrc).not.toMatch(/hermes/i);
      expect(convexSrc).toContain('insert("nexusTasks"');
      expect(convexSrc).not.toContain("submitKnowledgeRequest");
      expect(KNOWN_CONNECTOR_TOOL_IDS).toContain(DEEP_RESEARCH_TOOL_ID);
      expect(read("convex/schema.ts")).toContain('v.literal("deep_research")');
    });

    it("validates request length helper matches envelope limits", () => {
      const ok = validateResearchRequestLength("hello");
      expect(ok.ok).toBe(true);
      const bad = validateResearchRequestLength("x".repeat(DEEP_RESEARCH_MAX_REQUEST_LENGTH + 1));
      expect(bad.ok).toBe(false);
      if (!bad.ok) expect(bad.code).toBe("too_large");
    });
  });
});
