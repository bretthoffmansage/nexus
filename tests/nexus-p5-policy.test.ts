import { describe, expect, it } from "vitest";
import {
  clampLength,
  clampPageSize,
  isSupportedToolId,
  isValidIdempotencyKey,
  normalizedRequestHash,
  normalizeWhitespace,
  P5_DEFAULT_TOOL_ID,
  P5_LIMITS,
  P5_QUEUE,
  P5_SUPPORTED_TOOL_IDS,
} from "@/convex/lib/p5config";
import {
  canTransition,
  isQueueEligible,
  isRetryable,
  isUserCancellable,
  RETRYABLE_STATUSES,
  TASK_STATUSES,
} from "@/convex/lib/taskStatus";
import { defaultQueuePriority } from "@/convex/lib/queue";
import {
  NEXUS_PERMISSIONS,
  permissionsForRoles,
  roleHasPermission,
} from "@/convex/lib/permissions";

describe("P5 tool allowlist", () => {
  it("only allows the two read-only retrieval tools", () => {
    expect(isSupportedToolId("vault.agentic_retrieval")).toBe(true);
    expect(isSupportedToolId("membership_io.transcript_retrieve")).toBe(true);
    expect(isSupportedToolId("shell.exec")).toBe(false);
    expect(isSupportedToolId("vault.write")).toBe(false);
    expect(P5_SUPPORTED_TOOL_IDS).toContain(P5_DEFAULT_TOOL_ID);
    expect(P5_SUPPORTED_TOOL_IDS).toHaveLength(2);
  });
});

describe("P5 idempotency key validation", () => {
  it("accepts URL/UUID-safe keys within bounds", () => {
    expect(isValidIdempotencyKey("abc-123_45")).toBe(true);
    expect(isValidIdempotencyKey("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });
  it("rejects too-short, too-long, empty, and unsafe keys", () => {
    expect(isValidIdempotencyKey("short")).toBe(false);
    expect(isValidIdempotencyKey("")).toBe(false);
    expect(isValidIdempotencyKey("x".repeat(P5_LIMITS.idempotencyKeyMaxLength + 1))).toBe(false);
    expect(isValidIdempotencyKey("has spaces")).toBe(false);
    expect(isValidIdempotencyKey("bad*chars!")).toBe(false);
  });
});

describe("P5 string + page helpers", () => {
  it("normalizes whitespace and clamps lengths", () => {
    expect(normalizeWhitespace("  a   b \n c ")).toBe("a b c");
    expect(clampLength("abcdef", 3)).toBe("abc");
    expect(clampLength("ab", 5)).toBe("ab");
  });
  it("clamps page sizes into [1, max]", () => {
    expect(clampPageSize(undefined, 30, 100)).toBe(30);
    expect(clampPageSize(0, 30, 100)).toBe(30);
    expect(clampPageSize(-5, 30, 100)).toBe(30);
    expect(clampPageSize(5_000, 30, 100)).toBe(100);
    expect(clampPageSize(42, 30, 100)).toBe(42);
  });
  it("hashes requests deterministically, ignoring case and surrounding space", () => {
    expect(normalizedRequestHash("Hello  World")).toBe(normalizedRequestHash("hello world"));
    expect(normalizedRequestHash("a")).not.toBe(normalizedRequestHash("b"));
  });
});

describe("P5 task status lifecycle", () => {
  it("allows only the documented transitions", () => {
    expect(canTransition("queued", "cancelled")).toBe(true);
    expect(canTransition("queued", "claimed")).toBe(true);
    expect(canTransition("claimed", "running")).toBe(true);
    expect(canTransition("running", "completed")).toBe(true);
    expect(canTransition("running", "failed")).toBe(true);
    // Forbidden jumps.
    expect(canTransition("queued", "completed")).toBe(false);
    expect(canTransition("queued", "running")).toBe(false);
    expect(canTransition("completed", "queued")).toBe(false);
    expect(canTransition("cancelled", "queued")).toBe(false);
    expect(canTransition("failed", "running")).toBe(false);
  });
  it("classifies retryable, cancellable, and queue-eligible states", () => {
    expect(isRetryable("failed")).toBe(true);
    expect(isRetryable("cancelled")).toBe(true);
    expect(isRetryable("queued")).toBe(false);
    expect(isRetryable("completed")).toBe(false);
    expect(isUserCancellable("queued")).toBe(true);
    expect(isUserCancellable("running")).toBe(false);
    expect(isQueueEligible("queued")).toBe(true);
    expect(isQueueEligible("cancelled")).toBe(false);
    expect(RETRYABLE_STATUSES).toEqual(["failed", "cancelled"]);
    expect(TASK_STATUSES).toContain("queued");
  });
});

describe("P5 queue policy", () => {
  it("uses a server-owned default priority and allows queue without connector", () => {
    expect(defaultQueuePriority()).toBe(P5_QUEUE.defaultPriority);
    expect(P5_QUEUE.allowQueueWithoutConnector).toBe(true);
  });
});

describe("P5 role/permission policy", () => {
  it("grants knowledge_reader the minimal owner-scoped P5 permissions", () => {
    const perms = permissionsForRoles(["knowledge_reader"]) as string[];
    for (const p of [
      "conversations.create",
      "conversations.read_own",
      "conversations.update_own",
      "messages.create_own",
      "messages.read_own",
      "tasks.create_own",
      "tasks.read_own",
      "tasks.cancel_own",
      "tasks.retry_own",
      "sources.read_own",
      "results.read_own",
    ]) {
      expect(perms).toContain(p);
    }
  });

  it("does NOT grant knowledge_reader any *_all or queue management permission", () => {
    expect(roleHasPermission("knowledge_reader", "diagnostics.read")).toBe(false);
    const all = Object.values(NEXUS_PERMISSIONS as Record<string, string>);
    for (const forbidden of [
      "tasks.read_all",
      "conversations.read_all",
      "messages.read_all",
      "results.read_all",
      "queue.read_global",
      "queue.manage",
      "tasks.claim",
      "tasks.complete",
      "tasks.fail",
    ]) {
      expect(all).not.toContain(forbidden);
    }
  });

  it("gives nexus_admin diagnostics but never private-content permissions", () => {
    expect(roleHasPermission("nexus_admin", "diagnostics.read")).toBe(true);
    const adminPerms = permissionsForRoles(["nexus_admin"]) as string[];
    for (const contentPerm of [
      "conversations.read_own",
      "messages.read_own",
      "tasks.read_own",
      "results.read_own",
      "sources.read_own",
    ]) {
      expect(adminPerms).not.toContain(contentPerm);
    }
  });
});
