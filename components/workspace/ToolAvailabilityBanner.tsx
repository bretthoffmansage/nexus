import type { ToolAvailability } from "@/lib/adapters/types";

const LABELS: Record<ToolAvailability, string> = {
  available: "Available",
  partially_available: "Partially available",
  setup_required: "Setup required",
  connector_required: "Connector required",
  persistence_available: "",
  execution_connector_required: "Execution: Connector required",
  local_only: "Local system only",
  deferred: "Deferred",
};

const MESSAGES: Record<ToolAvailability, string> = {
  available: "This tool is connected to Nexus.",
  partially_available:
    "The interface is available; some actions remain disabled until backend connectivity is configured.",
  setup_required: "Complete Nexus or Clerk setup before this tool can load data.",
  connector_required:
    "Data and actions require the private Console Connector on your Nexus Mac. The interface below is preserved; controls that need the local system are disabled.",
  persistence_available:
    "Your requests are saved and queued privately in Nexus. Execution waits for the Connector",
  execution_connector_required:
    "This feature is stored in Nexus, but running it requires the private Console Connector on your Nexus Mac (not configured yet).",
  local_only:
    "This capability remains on the Nexus Control Center / legacy local console. Hosted Nexus shows a read-only or disabled view.",
  deferred:
    "This capability is intentionally deferred from hosted Nexus. The layout is preserved for a future governed operations surface.",
};

type ToolAvailabilityBannerProps = {
  availability: ToolAvailability;
  detail?: string;
};

export function ToolAvailabilityBanner({ availability, detail }: ToolAvailabilityBannerProps) {
  const label = LABELS[availability];
  const message = detail ?? MESSAGES[availability];
  return (
    <div className={`legacy-port-banner legacy-port-banner--${availability}`} role="status">
      {label ? <strong>{label}</strong> : null}
      <span>{message}</span>
    </div>
  );
}
