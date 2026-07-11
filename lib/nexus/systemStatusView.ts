import { api } from "@/convex/_generated/api";
import {
  SYSTEM_COMPONENT_KEYS,
  type SystemComponentKey,
  componentObservationTtlMs,
  isCliWorkerComponent,
  systemStatusSnapshotTtlMs,
} from "@/convex/lib/systemStatus";
import { P6_LEASE } from "@/convex/lib/p6config";

export const systemStatus = api.connectorRegistry.getSystemStatusForPage;

export type SystemStatusQueryResult = {
  configured: boolean;
  presence: string;
  lastHeartbeatAt: number | null;
  operatingState: string | null;
  softwareVersion: string | null;
  hasSystemStatus: boolean;
  snapshotObservedAt: number | null;
  components: Record<SystemComponentKey, { active: boolean; observedAt: number } | null> | null;
};

export type SystemStatusCard = {
  key: SystemComponentKey;
  title: string;
  description: string;
  live: boolean;
  statusText: string;
  secondaryDetail?: string;
};

const CARD_COPY: Record<
  SystemComponentKey,
  { title: string; description: string; liveStatus: string; inactiveStatus: string }
> = {
  core_api: {
    title: "Nexus Core API",
    description: "Core system service and governed tool runtime.",
    liveStatus: "Running",
    inactiveStatus: "Stopped",
  },
  nexus_connector: {
    title: "Console Connector",
    description: "Trusted queue bridge between Nexus and the local system.",
    liveStatus: "Online",
    inactiveStatus: "Offline",
  },
  vault_retrieval: {
    title: "Vault Retrieval",
    description: "Read-only vault retrieval service.",
    liveStatus: "Ready",
    inactiveStatus: "Not ready",
  },
  vault: {
    title: "Vault",
    description: "Approved read-only knowledge vault connection.",
    liveStatus: "Connected",
    inactiveStatus: "Unavailable",
  },
  cursor_cli: {
    title: "Cursor CLI",
    description: "Cursor command-line runtime used by governed system workflows.",
    liveStatus: "Connected",
    inactiveStatus: "Not recently verified",
  },
  codex_cli: {
    title: "Codex CLI",
    description: "Codex command-line runtime used by governed system workflows.",
    liveStatus: "Connected",
    inactiveStatus: "Not recently verified",
  },
  claude_cli: {
    title: "Claude CLI",
    description: "Claude command-line runtime used by governed system workflows.",
    liveStatus: "Connected",
    inactiveStatus: "Not recently verified",
  },
  cleanup_storage: {
    title: "Cleanup & Storage",
    description: "Automatic system runtime cleanup and retention scheduling.",
    liveStatus: "Automatic",
    inactiveStatus: "Disabled",
  },
};

export function formatRelativeTimestamp(timestamp: number | null, now: number): string | null {
  if (timestamp === null) return null;
  const deltaMs = Math.max(0, now - timestamp);
  const seconds = Math.floor(deltaMs / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function isHeartbeatFresh(lastHeartbeatAt: number | null, now: number): boolean {
  if (!lastHeartbeatAt) return false;
  return now - lastHeartbeatAt <= P6_LEASE.connectorOfflineThresholdMs;
}

function isSnapshotFresh(snapshotObservedAt: number | null, now: number): boolean {
  if (!snapshotObservedAt) return false;
  return now - snapshotObservedAt <= systemStatusSnapshotTtlMs();
}

function isComponentObservationFresh(
  key: SystemComponentKey,
  observedAt: number | null,
  now: number,
): boolean {
  if (!observedAt) return false;
  return now - observedAt <= componentObservationTtlMs(key);
}

function connectorOperatingLabel(operatingState: string | null): string {
  switch (operatingState) {
    case "idle":
      return "Idle";
    case "claiming":
      return "Claiming";
    case "running":
      return "Running";
    case "degraded":
      return "Degraded";
    default:
      return "Online";
  }
}

function isComponentLive(
  key: SystemComponentKey,
  input: SystemStatusQueryResult,
  now: number,
): boolean {
  if (!input.configured) return false;
  if (!isHeartbeatFresh(input.lastHeartbeatAt, now)) return false;

  if (!input.hasSystemStatus) {
    return key === "nexus_connector";
  }

  if (!isSnapshotFresh(input.snapshotObservedAt, now)) return false;

  const component = input.components?.[key] ?? null;
  if (!component?.active) return false;
  if (!isComponentObservationFresh(key, component.observedAt, now)) return false;
  return true;
}

function statusTextForCard(
  key: SystemComponentKey,
  input: SystemStatusQueryResult,
  now: number,
  live: boolean,
): string {
  const copy = CARD_COPY[key];

  if (!input.configured) return "Unavailable";
  if (!isHeartbeatFresh(input.lastHeartbeatAt, now)) {
    return key === "nexus_connector" ? "Offline" : copy.inactiveStatus;
  }

  if (!input.hasSystemStatus) {
    if (key === "nexus_connector") {
      return connectorOperatingLabel(input.operatingState);
    }
    return "Detailed system status unavailable";
  }

  if (!live) {
    if (isCliWorkerComponent(key)) {
      const component = input.components?.[key];
      if (!component) return "Unavailable";
      if (!component.active) return "Disconnected";
      return "Not recently verified";
    }
    if (key === "core_api") return "Offline";
    if (key === "cleanup_storage") return "Unavailable";
    return copy.inactiveStatus;
  }

  if (key === "nexus_connector") {
    return connectorOperatingLabel(input.operatingState);
  }

  return copy.liveStatus;
}

function secondaryDetailForCard(
  key: SystemComponentKey,
  input: SystemStatusQueryResult,
  now: number,
): string | undefined {
  if (key === "nexus_connector") {
    const parts: string[] = [];
    if (input.lastHeartbeatAt) {
      const relative = formatRelativeTimestamp(input.lastHeartbeatAt, now);
      if (relative) parts.push(`Last heartbeat: ${relative}`);
    }
    if (input.softwareVersion) {
      parts.push(`Software: ${input.softwareVersion}`);
    }
    return parts.length ? parts.join(" · ") : undefined;
  }

  if (isCliWorkerComponent(key)) {
    const observedAt = input.components?.[key]?.observedAt ?? null;
    const relative = formatRelativeTimestamp(observedAt, now);
    return relative ? `Last verified: ${relative}` : undefined;
  }

  return undefined;
}

export function deriveSystemStatusCards(
  input: SystemStatusQueryResult,
  now: number,
): SystemStatusCard[] {
  return SYSTEM_COMPONENT_KEYS.map((key) => {
    const copy = CARD_COPY[key];
    const live = isComponentLive(key, input, now);
    return {
      key,
      title: copy.title,
      description: copy.description,
      live,
      statusText: statusTextForCard(key, input, now, live),
      secondaryDetail: secondaryDetailForCard(key, input, now),
    };
  });
}
