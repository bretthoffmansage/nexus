import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const SCAN_DIRS = ["app", "components", "lib"];
const SCAN_FILES = ["proxy.ts"];

const FORBIDDEN = [
  "CLAUDIA_CORE_URL",
  "/api/claudia/v1",
  "/api/chat_stream",
  "claudiaCliMirror",
  "CLI Mirror",
  "Hermes PTY",
  "shell_routes",
  "odysseus_session",
  "stream_agent_loop",
  "EventSource",
  "NEXT_PUBLIC_CLERK_SECRET_KEY",
  "selfApprove",
];

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      files.push(...collectSourceFiles(full));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) files.push(full);
  }
  return files;
}

describe("Nexus source boundary", () => {
  it("does not reference legacy execution paths in application code", () => {
    const files = [
      ...SCAN_DIRS.flatMap((d) => collectSourceFiles(path.join(ROOT, d))),
      ...SCAN_FILES.map((f) => path.join(ROOT, f)),
    ];

    const violations: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const needle of FORBIDDEN) {
        if (text.includes(needle)) {
          violations.push(`${path.relative(ROOT, file)}: ${needle}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
