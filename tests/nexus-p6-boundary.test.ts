import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONNECTOR_PROGRESS_STAGES,
  DEFAULT_CONNECTOR_TOOL_IDS,
  executionSafetyForTool,
  isConnectorProgressStage,
  P6_CONCURRENCY,
  P6_PROTOCOL_VERSION,
} from "@/convex/lib/p6config";

const ROOT = path.resolve(__dirname, "..");
function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("P6 config policy (pure)", () => {
  it("classifies P5 tools as read-only-idempotent and unknown tools as non-idempotent", () => {
    expect(executionSafetyForTool("vault.agentic_retrieval")).toBe("read_only_idempotent");
    expect(executionSafetyForTool("knowledge.asset_query")).toBe("read_only_idempotent");
    expect(executionSafetyForTool("shell.exec")).toBe("non_idempotent");
    expect(executionSafetyForTool("unknown.future.tool")).toBe("non_idempotent");
  });

  it("ships single-worker mode and a v1 protocol", () => {
    expect(P6_CONCURRENCY.maxConcurrentTasksPerConnector).toBe(1);
    expect(P6_PROTOCOL_VERSION).toBe("v1");
    expect(DEFAULT_CONNECTOR_TOOL_IDS).toContain("vault.agentic_retrieval");
  });

  it("bounds the Connector progress stage vocabulary", () => {
    expect(isConnectorProgressStage("retrieving")).toBe(true);
    expect(isConnectorProgressStage("rm -rf")).toBe(false);
    expect(CONNECTOR_PROGRESS_STAGES).toContain("finalizing");
  });
});

describe("P6 boundary — worker functions are internal-only", () => {
  it("connector task/read/nonce modules export no public mutation or query", () => {
    for (const mod of ["connectorTasks", "connectorReads", "connectorAuthStore"]) {
      const src = read(`convex/${mod}.ts`);
      expect(src).not.toMatch(/export const \w+ = mutation\(/);
      expect(src).not.toMatch(/export const \w+ = query\(/);
      expect(src).not.toMatch(/export const \w+ = action\(/);
    }
  });

  it("registry bootstrap and lifecycle changes are internalMutation (no self-registration)", () => {
    const registry = read("convex/connectorRegistry.ts");
    expect(registry).toMatch(/export const bootstrapConnector = internalMutation/);
    expect(registry).toMatch(/export const setConnectorStatus = internalMutation/);
    expect(registry).not.toMatch(/export const bootstrapConnector = mutation\(/);
    // The one public export is the content-free status projection.
    expect(registry).toMatch(/export const getConnectorStatusPublic = query/);
  });

  it("the browser client boundary references only the public Connector status query", () => {
    const client = read("lib/nexus/p5Client.ts");
    expect(client).toContain("getConnectorStatusPublic");
    for (const worker of [
      "claimNextTask",
      "completeTask",
      "failTask",
      "startTask",
      "heartbeatTaskLease",
      "acknowledgeCancellation",
      "verifyAndConsumeNonce",
    ]) {
      expect(client).not.toContain(worker);
    }
  });
});

describe("P6 boundary — no secret storage, no task deletion, one queue", () => {
  it("the schema stores no plaintext Connector secret", () => {
    const schema = read("convex/schema.ts");
    expect(schema).not.toMatch(/sharedSecret|plaintextSecret|rawSecret/);
  });

  it("the shared secret is read only in the canonical auth module", () => {
    expect(read("convex/lib/connectorAuth.ts")).toContain("NEXUS_CONNECTOR_SHARED_SECRET");
    for (const mod of [
      "convex/connectorTasks.ts",
      "convex/connectorRegistry.ts",
      "convex/http.ts",
      "convex/schema.ts",
    ]) {
      expect(read(mod)).not.toContain("NEXUS_CONNECTOR_SHARED_SECRET");
    }
  });

  it("completion never deletes the task row (tasks persist for history/retry)", () => {
    const src = read("convex/connectorTasks.ts");
    expect(src).not.toMatch(/ctx\.db\.delete\([^)]*task/i);
  });

  it("adds no second task-queue table — nexusTasks stays canonical", () => {
    const schema = read("convex/schema.ts");
    expect(schema).not.toMatch(/nexusQueueTasks|nexusWorkQueue|nexusClaimQueue|nexusTaskQueue/);
  });

  it("worker mutations copy ownership from the task, never from a client arg", () => {
    const src = read("convex/connectorTasks.ts");
    // No connector-facing arg validator carries an owner/priority/queue field.
    expect(src).not.toMatch(/(ownerClerkUserId|ownerId|userId|priority|queueSequence)\s*:\s*v\./);
    // Ownership is taken from the fetched task record.
    expect(src).toContain("task.ownerClerkUserId");
  });
});

describe("P6 boundary — no Claudia-side / P7 code in Nexus", () => {
  it("Nexus source contains no Claudia poller or inbound Claudia endpoint", () => {
    for (const mod of ["convex/http.ts", "convex/connectorTasks.ts"]) {
      const src = read(mod);
      expect(src).not.toContain("claudia_system");
      expect(src).not.toMatch(/pollClaudia|ClaudiaPoller/);
    }
  });
});
