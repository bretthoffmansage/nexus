import type { SystemPresenceState } from "@/lib/types/presentation";

const STATE_COPY: Record<
  SystemPresenceState,
  { label: string; detail: string }
> = {
  not_configured: {
    label: "Connector not configured",
    detail:
      "System connection not yet linked. Nexus will reach the local system through the private Console Connector.",
  },
  offline: {
    label: "System offline",
    detail: "The Console Connector has not reported recently.",
  },
  online: {
    label: "System online",
    detail: "Console Connector is connected.",
  },
  reconnecting: {
    label: "Reconnecting",
    detail: "Waiting for the Console Connector to resume heartbeats.",
  },
  error: {
    label: "Connector error",
    detail: "The Console Connector reported an error.",
  },
  busy: {
    label: "System busy",
    detail: "A task is currently running on the system.",
  },
};

type SystemPresenceProps = {
  /** P3 default — truthful placeholder only. */
  state?: SystemPresenceState;
};

export function SystemPresence({ state = "not_configured" }: SystemPresenceProps) {
  const copy = STATE_COPY[state];

  return (
    <section
      className="nexus-presence-card"
      aria-labelledby="system-presence-title"
      data-presence={state}
    >
      <div className="nexus-presence-head">
        <h2 className="nexus-presence-title" id="system-presence-title">
          System
        </h2>
        <span className="nexus-presence-pill">
          <span className="nexus-presence-dot" aria-hidden />
          {copy.label}
        </span>
      </div>
      <p className="nexus-presence-detail">{copy.detail}</p>
    </section>
  );
}
