"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import {
  claudiaSystemStatus,
  deriveClaudiaSystemStatusCards,
  type ClaudiaSystemStatusCard,
  type ClaudiaSystemStatusQueryResult,
} from "@/lib/nexus/claudiaSystemStatusView";
import { useNexusAuthReadiness } from "@/lib/nexus/useNexusAuthReadiness";

const EMPTY_STATUS: ClaudiaSystemStatusQueryResult = {
  configured: false,
  presence: "not_configured",
  lastHeartbeatAt: null,
  operatingState: null,
  softwareVersion: null,
  hasSystemStatus: false,
  snapshotObservedAt: null,
  components: null,
};

function StatusCard({ card }: { card: ClaudiaSystemStatusCard }) {
  return (
    <article className="claudia-system-status-card">
      <header className="claudia-system-status-card-head">
        <h2 className="claudia-system-status-card-title">{card.title}</h2>
        <div className="claudia-system-status-card-indicator" aria-hidden={!card.live}>
          {card.live ? <span className="claudia-system-status-dot claudia-system-status-dot--live" /> : null}
        </div>
      </header>
      <p className="claudia-system-status-card-status">{card.statusText}</p>
      <p className="claudia-system-status-card-description">{card.description}</p>
      {card.secondaryDetail ? (
        <p className="claudia-system-status-card-detail">{card.secondaryDetail}</p>
      ) : null}
    </article>
  );
}

function StatusCardsBody({ status }: { status: ClaudiaSystemStatusQueryResult }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const cards = useMemo(() => deriveClaudiaSystemStatusCards(status, now), [status, now]);

  return (
    <div className="claudia-system-status-grid">
      {cards.map((card) => (
        <StatusCard key={card.key} card={card} />
      ))}
    </div>
  );
}

function StatusQuery() {
  const status = useQuery(claudiaSystemStatus, {});
  if (status === undefined) {
    return <p className="legacy-port-empty">Loading system status…</p>;
  }
  return <StatusCardsBody status={status} />;
}

export function ClaudiaSystemStatusPanel() {
  const { readyForPrivateQueries } = useNexusAuthReadiness();
  if (!readyForPrivateQueries) {
    return <StatusCardsBody status={EMPTY_STATUS} />;
  }
  return <StatusQuery />;
}
