/**
 * Shared, allowlisted worker/runtime label formatter.
 *
 * Nexus must display the *actual* command-line worker that executed a governed
 * Claudia task (Cursor CLI / Codex CLI / Claude CLI), never a value inferred
 * from route priority. Worker identifiers arriving from a Connector terminal
 * result are untrusted, so this module maps only a fixed allowlist of canonical
 * identifiers to bounded, hardcoded labels. Anything else — including empty,
 * malformed, or unexpected strings — resolves to `null` (render the bounded
 * `WORKER_UNAVAILABLE_LABEL` fallback), so raw untrusted text is never shown.
 *
 * The canonical machine keys mirror the system-status heartbeat component keys
 * (`cursor_cli`, `codex_cli`, `claude_cli`); the bare aliases are accepted only
 * as a convenience mapping to the same fixed labels.
 *
 * NOTE (cross-repo dependency): as of this package the Connector task-result
 * contract does NOT carry a worker field — only `model`. This formatter is the
 * Nexus-side landing point for a future authoritative worker value and is not
 * yet wired into any task/result projection. See
 * docs/specs/nexus_cursor_cli_status_and_worker_runtime_projection_v1.md.
 */

/** Fixed label shown when a worker value is missing/unknown/untrusted. */
export const WORKER_UNAVAILABLE_LABEL = "Unavailable";

/** Allowlisted canonical worker identifier → fixed display label. */
const WORKER_LABELS: Record<string, string> = {
  cursor_cli: "Cursor CLI",
  cursor: "Cursor CLI",
  codex_cli: "Codex CLI",
  codex: "Codex CLI",
  claude_cli: "Claude CLI",
  claude: "Claude CLI",
};

/**
 * Resolve an untrusted worker identifier to a bounded label, or `null` when the
 * value is absent or not on the allowlist. Callers should render
 * `WORKER_UNAVAILABLE_LABEL` (or omit the field) for `null`.
 */
export function formatWorkerLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (!key) return null;
  return WORKER_LABELS[key] ?? null;
}

/**
 * Convenience wrapper for surfaces that always render a Worker field: returns
 * the bounded label or the fixed unavailable fallback (never raw text).
 */
export function workerLabelOrFallback(value: unknown): string {
  return formatWorkerLabel(value) ?? WORKER_UNAVAILABLE_LABEL;
}
