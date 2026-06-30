"""Claudia Gateway approval resolution payloads (Package 10).

Builds human decision metadata for Core forwarding only; no local execution.
"""

from __future__ import annotations

from typing import Any

ALLOWED_APPROVAL_DECISIONS = frozenset({
    "approved",
    "rejected",
    "needs_changes",
    "cancelled",
})


class ApprovalValidationError(ValueError):
    """Validation failure for approval resolution body."""

    def __init__(self, message: str, *, field: str | None = None):
        super().__init__(message)
        self.field = field


def build_approval_resolution(
    body: dict[str, Any],
    *,
    approval_id: str,
    resolved_by: str | None = None,
) -> dict[str, Any]:
    """Normalize POST body for Core ``POST /approvals/{id}/resolve``."""
    if not isinstance(body, dict):
        raise ApprovalValidationError("Request body must be a JSON object")

    aid = (approval_id or "").strip()
    if not aid:
        raise ApprovalValidationError("approval_id is required", field="approval_id")

    raw_decision = body.get("decision")
    if raw_decision is None or (isinstance(raw_decision, str) and not raw_decision.strip()):
        raise ApprovalValidationError("decision is required", field="decision")
    decision = str(raw_decision).strip().lower()
    if decision not in ALLOWED_APPROVAL_DECISIONS:
        raise ApprovalValidationError(
            f"decision must be one of: {', '.join(sorted(ALLOWED_APPROVAL_DECISIONS))}",
            field="decision",
        )

    actor = resolved_by
    if not actor and isinstance(body.get("resolved_by"), str) and body["resolved_by"].strip():
        actor = body["resolved_by"].strip()
    if not actor:
        actor = "gateway"

    out: dict[str, Any] = {
        "approval_id": aid,
        "decision": decision,
        "resolved_by": actor,
        "route": "approvals",
    }

    reason = body.get("reason")
    if reason is not None:
        if not isinstance(reason, str):
            raise ApprovalValidationError("reason must be a string", field="reason")
        out["reason"] = reason

    for key in ("packet_id", "trace_id", "workspace"):
        if key in body and body[key] is not None:
            out[key] = body[key]

    if "permissions" in body:
        perms = body["permissions"]
        if perms is not None and not isinstance(perms, dict):
            raise ApprovalValidationError("permissions must be a JSON object", field="permissions")
        out["permissions"] = dict(perms) if perms else {}

    return out
