export type ToolAvailability =
  | "available"
  | "partially_available"
  | "setup_required"
  | "connector_required"
  | "local_only"
  | "deferred";

export type AdapterAuthority =
  | "convex"
  | "claudia_connector"
  | "claudia_local"
  | "none";

export type AdapterReadResult<T> =
  | { ok: true; data: T; availability: ToolAvailability }
  | { ok: false; availability: ToolAvailability; reason: string; data: T };

export type ToolAdapterMeta = {
  toolId: string;
  availability: ToolAvailability;
  authority: AdapterAuthority;
  futureConvexCollection?: string;
  futureClaudiaTaskKind?: string;
};
