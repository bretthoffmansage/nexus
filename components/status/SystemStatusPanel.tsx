"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import {
  systemStatus,
  deriveSystemStatusCards,
  type SystemStatusCard,
  type SystemStatusQueryResult,
} from "@/lib/nexus/systemStatusView";
import { useNexusAuthReadiness } from "@/lib/nexus/useNexusAuthReadiness";

const EMPTY_STATUS: SystemStatusQueryResult = {
  configured: false,
  presence: "not_configured",
  lastHeartbeatAt: null,
  operatingState: null,
  softwareVersion: null,
  hasSystemStatus: false,
  snapshotObservedAt: null,
  components: null,
};

function StatusCard({ card }: { card: SystemStatusCard }) {
  return (
    <article className="system-status-card">
      <header className="system-status-card-head">
        <h2 className="system-status-card-title">{card.title}</h2>
        <div className="system-status-card-indicator" aria-hidden={!card.live}>
          {card.live ? <span className="system-status-dot system-status-dot--live" /> : null}
        </div>
      </header>
      <p className="system-status-card-status">{card.statusText}</p>
      <p className="system-status-card-description">{card.description}</p>
      {card.secondaryDetail ? (
        <p className="system-status-card-detail">{card.secondaryDetail}</p>
      ) : null}
    </article>
  );
}

function StatusCardsBody({ status }: { status: SystemStatusQueryResult }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const cards = useMemo(() => deriveSystemStatusCards(status, now), [status, now]);

  return (
    <div className="system-status-grid">
      {cards.map((card) => (
        <StatusCard key={card.key} card={card} />
      ))}
    </div>
  );
}

function StatusQuery() {
  const status = useQuery(systemStatus, {});
  if (status === undefined) {
    return <p className="legacy-port-empty">Loading system status…</p>;
  }
  return <StatusCardsBody status={status} />;
}

export function SystemStatusPanel() {
  const { readyForPrivateQueries } = useNexusAuthReadiness();
  if (!readyForPrivateQueries) {
    return <StatusCardsBody status={EMPTY_STATUS} />;
  }
  return <StatusQuery />;
}
