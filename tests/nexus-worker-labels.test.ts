// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import {
  formatWorkerLabel,
  workerLabelOrFallback,
  WORKER_UNAVAILABLE_LABEL,
} from "@/lib/nexus/workerLabels";

describe("worker label formatter", () => {
  it("maps cursor_cli to Cursor CLI", () => {
    expect(formatWorkerLabel("cursor_cli")).toBe("Cursor CLI");
    expect(formatWorkerLabel("cursor")).toBe("Cursor CLI");
  });

  it("maps codex_cli to Codex CLI", () => {
    expect(formatWorkerLabel("codex_cli")).toBe("Codex CLI");
    expect(formatWorkerLabel("codex")).toBe("Codex CLI");
  });

  it("maps claude_cli to Claude CLI", () => {
    expect(formatWorkerLabel("claude_cli")).toBe("Claude CLI");
    expect(formatWorkerLabel("claude")).toBe("Claude CLI");
  });

  it("normalizes surrounding whitespace and casing before matching", () => {
    expect(formatWorkerLabel("  CURSOR_CLI  ")).toBe("Cursor CLI");
  });

  it("returns null for unknown worker values (never raw untrusted text)", () => {
    for (const value of ["evil_worker", "/usr/local/bin/cursor-agent", "<script>", "gpt-5"]) {
      expect(formatWorkerLabel(value)).toBeNull();
    }
  });

  it("returns null for missing, empty, or non-string values (backward compatible)", () => {
    expect(formatWorkerLabel(undefined)).toBeNull();
    expect(formatWorkerLabel(null)).toBeNull();
    expect(formatWorkerLabel("")).toBeNull();
    expect(formatWorkerLabel("   ")).toBeNull();
    expect(formatWorkerLabel(42)).toBeNull();
    expect(formatWorkerLabel({ worker: "cursor_cli" })).toBeNull();
  });

  it("falls back to a bounded Unavailable label for unknown/missing worker", () => {
    expect(workerLabelOrFallback("cursor_cli")).toBe("Cursor CLI");
    expect(workerLabelOrFallback(undefined)).toBe(WORKER_UNAVAILABLE_LABEL);
    expect(workerLabelOrFallback("mystery")).toBe(WORKER_UNAVAILABLE_LABEL);
  });
});
