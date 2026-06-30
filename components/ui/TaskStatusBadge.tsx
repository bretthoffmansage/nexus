import type { TaskDisplayStatus } from "@/lib/types/presentation";

const LABELS: Record<TaskDisplayStatus, string> = {
  queued: "Queued",
  claimed: "Claimed",
  running: "Running",
  needs_clarification: "Needs clarification",
  needs_confirmation: "Needs confirmation",
  complete: "Complete",
  partial: "Partial",
  failed: "Failed",
  expired: "Expired",
  cancelled: "Cancelled",
};

type TaskStatusBadgeProps = {
  status: TaskDisplayStatus;
};

export function TaskStatusBadge({ status }: TaskStatusBadgeProps) {
  return (
    <span className="nexus-status-badge" data-status={status}>
      <span className="nexus-status-badge-dot" aria-hidden />
      {LABELS[status]}
    </span>
  );
}
