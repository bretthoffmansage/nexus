import type { ClaudiaPresenceState } from "@/lib/types/presentation";

const STATE_COPY: Record<
  ClaudiaPresenceState,
  { label: string; detail: string }
> = {
  not_configured: {
    label: "Connector not configured",
    detail:
      "Claudia connection not yet linked. Nexus will reach Claudia through the private Console Connector.",
  },
  offline: {
    label: "Claudia offline",
    detail: "The Console Connector has not reported recently.",
  },
  online: {
    label: "Claudia online",
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
    label: "Claudia busy",
    detail: "A task is currently running on Claudia.",
  },
};

type ClaudiaPresenceProps = {
  /** P3 default — truthful placeholder only. */
  state?: ClaudiaPresenceState;
};

export function ClaudiaPresence({ state = "not_configured" }: ClaudiaPresenceProps) {
  const copy = STATE_COPY[state];

  return (
    <section
      className="nexus-presence-card"
      aria-labelledby="claudia-presence-title"
      data-presence={state}
    >
      <div className="nexus-presence-head">
        <h2 className="nexus-presence-title" id="claudia-presence-title">
          Claudia
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
