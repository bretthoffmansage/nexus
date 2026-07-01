import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");

/** Public, browser-callable P5 function modules. */
const PUBLIC_MODULES = [
  "convex/conversations.ts",
  "convex/messages.ts",
  "convex/tasks.ts",
  "convex/taskProgress.ts",
  "convex/taskResults.ts",
  "convex/taskSources.ts",
  "convex/diagnostics.ts",
];

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("P5 boundary — no client-trusted ownership/queue inputs", () => {
  it("public modules never accept owner/role/queue/priority as client args", () => {
    // A declared arg validator looks like `name: v.something(...)`. These field
    // names must never appear as arg validators — ownership and queue position
    // are derived server-side, never trusted from the browser.
    const forbiddenArgValidators = [
      /ownerClerkUserId\s*:\s*v\./,
      /clerkUserId\s*:\s*v\./,
      /\bownerId\s*:\s*v\./,
      /\buserId\s*:\s*v\./,
      /requestingUserId\s*:\s*v\./,
      /queueSequence\s*:\s*v\./,
      /\bpriority\s*:\s*v\./,
      /\brole\s*:\s*v\./,
      /\bpermission\s*:\s*v\./,
    ];
    const violations: string[] = [];
    for (const mod of PUBLIC_MODULES) {
      const src = read(mod);
      for (const pattern of forbiddenArgValidators) {
        if (pattern.test(src)) violations.push(`${mod}: ${pattern}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("ownership is always derived from the verified identity", () => {
    const ownership = read("convex/lib/ownership.ts");
    expect(ownership).toContain("getUserIdentity");
    expect(ownership).toContain("ownerClerkUserId !== clerkUserId");
  });
});

describe("P5 boundary — worker writes are internal-only", () => {
  it("assistant/system messages, results, sources, progress and transitions use internalMutation", () => {
    expect(read("convex/messages.ts")).toMatch(
      /export const appendAssistantMessage = internalMutation/,
    );
    expect(read("convex/messages.ts")).toMatch(
      /export const appendSystemMessage = internalMutation/,
    );
    expect(read("convex/taskResults.ts")).toMatch(
      /export const writeTaskResultInternal = internalMutation/,
    );
    expect(read("convex/taskSources.ts")).toMatch(
      /export const replaceTaskSourcesInternal = internalMutation/,
    );
    expect(read("convex/taskProgress.ts")).toMatch(
      /export const appendTaskProgressInternal = internalMutation/,
    );
    expect(read("convex/tasks.ts")).toMatch(
      /export const transitionTaskInternal = internalMutation/,
    );
  });

  it("no public mutation authors an assistant message", () => {
    const messages = read("convex/messages.ts");
    // The only public export in messages.ts is the read query.
    expect(messages).toMatch(/export const listMyConversationMessages = query/);
    expect(messages).not.toMatch(/export const \w+ = mutation\(/);
  });

  it("user-facing task mutations are limited to submit/cancel/retry", () => {
    const tasks = read("convex/tasks.ts");
    expect(tasks).toMatch(/export const submitKnowledgeRequest = mutation/);
    expect(tasks).toMatch(/export const cancelMyTask = mutation/);
    expect(tasks).toMatch(/export const retryMyTask = mutation/);
    // No public completion/failure mutation exists.
    expect(tasks).not.toMatch(/export const completeMyTask = mutation/);
    expect(tasks).not.toMatch(/export const failMyTask = mutation/);
  });
});

describe("P5 boundary — no inline connector-execution primitives in P5 modules", () => {
  // P6 legitimately implements claim/lease/heartbeat/HMAC — in its own
  // dedicated modules (connectorAuth.ts, connectorRegistry.ts,
  // connectorTasks.ts, http.ts; see tests/nexus-p6-boundary.test.ts). This
  // test now checks a narrower, still-real invariant: the original P5
  // user-facing modules never duplicate that protocol logic inline.
  it("P5 Convex code contains no inline connector-execution primitives", () => {
    const forbidden = ["claimNextTask", "leaseToken", "renewLease", "releaseTask", "createHmac"];
    const modules = [...PUBLIC_MODULES, "convex/lib/queue.ts", "convex/lib/taskStatus.ts"];
    const violations: string[] = [];
    for (const mod of modules) {
      const src = read(mod);
      for (const needle of forbidden) {
        if (src.includes(needle)) violations.push(`${mod}: ${needle}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("global queue indexes exist but are not exposed through public list queries", () => {
    const tasks = read("convex/tasks.ts");
    // The only cross-owner reader is the admin-gated diagnostics query.
    expect(tasks).not.toContain("by_status_and_queue_sequence");
    expect(tasks).not.toContain("by_queue_sequence");
    const diagnostics = read("convex/diagnostics.ts");
    expect(diagnostics).toContain("requireApprovedRole");
    expect(diagnostics).toContain("nexus_admin");
  });
});
