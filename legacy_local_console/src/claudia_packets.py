"""Claudia Gateway packet envelope normalization (non-authoritative).

Normalizes intake JSON into the Claudia Core packet contract. Does not import
agent_loop, task_scheduler, or any autonomous Odysseus runtime.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

# Claudia Core packet types (claudia_system contract).
ALLOWED_PACKET_TYPES = frozenset({
    "task",
    "message",
    "source",
    "worker_output",
    "approval",
    "audit",
    "housekeeping",
    "system",
})

ALLOWED_PRIORITIES = frozenset({"low", "normal", "high", "urgent"})

ALLOWED_STATUSES = frozenset({
    "new",
    "accepted",
    "processing",
    "completed",
    "failed",
    "cancelled",
    "rejected",
})

DEFAULT_PACKET_TYPE = "task"
DEFAULT_PRIORITY = "normal"
DEFAULT_STATUS = "new"
DEFAULT_ROUTE = "gateway"
DEFAULT_CREATED_BY = "gateway"

# Envelope field names — not placed into payload when payload key is absent.
ENVELOPE_FIELDS = frozenset({
    "packet_id",
    "type",
    "route",
    "source_id",
    "reply_channel",
    "payload",
    "created_by",
    "created_at",
    "workspace",
    "priority",
    "permissions",
    "status",
    "parent_packet_id",
    "trace_id",
    "audit_required",
})


class PacketNormalizeError(ValueError):
    """Validation failure while normalizing an intake body."""

    def __init__(self, message: str, *, field: str | None = None):
        super().__init__(message)
        self.field = field


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _non_empty_str(value: Any) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _extract_payload(body: dict[str, Any]) -> dict[str, Any]:
    """Build payload: explicit ``payload`` dict, or non-envelope keys from body."""
    if "payload" in body:
        raw = body["payload"]
        if raw is None:
            return {}
        if not isinstance(raw, dict):
            raise PacketNormalizeError("payload must be a JSON object", field="payload")
        return dict(raw)
    extra = {k: v for k, v in body.items() if k not in ENVELOPE_FIELDS}
    return extra


def normalize_claudia_packet(
    body: dict[str, Any],
    *,
    created_by: str | None = None,
) -> dict[str, Any]:
    """Normalize a Gateway intake JSON object into a Claudia Core packet envelope.

    Caller-provided route/source/reply metadata is preserved. Technical fallbacks
    (route ``gateway``, source_id ``gateway:<packet_id>``) apply only when missing.
  """
    if not isinstance(body, dict):
        raise PacketNormalizeError("Request body must be a JSON object")

    packet_id = _non_empty_str(body.get("packet_id")) or str(uuid.uuid4())
    trace_id = _non_empty_str(body.get("trace_id")) or str(uuid.uuid4())

    raw_type = body.get("type")
    if raw_type is None or (isinstance(raw_type, str) and not raw_type.strip()):
        packet_type = DEFAULT_PACKET_TYPE
    else:
        packet_type = _non_empty_str(raw_type) or str(raw_type).strip()
        if packet_type not in ALLOWED_PACKET_TYPES:
            raise PacketNormalizeError(
                f"type must be one of: {', '.join(sorted(ALLOWED_PACKET_TYPES))}",
                field="type",
            )

    route = _non_empty_str(body.get("route")) or DEFAULT_ROUTE

    source_id = _non_empty_str(body.get("source_id"))
    if not source_id:
        source_id = f"gateway:{packet_id}"

    if "reply_channel" in body:
        reply_channel = body["reply_channel"]
    else:
        reply_channel = None

    payload = _extract_payload(body)

    author = _non_empty_str(body.get("created_by"))
    if not author:
        author = _non_empty_str(created_by) or DEFAULT_CREATED_BY

    created_at = _non_empty_str(body.get("created_at")) or _utc_now_iso()

    workspace = body.get("workspace") if "workspace" in body else None
    if workspace is not None and not isinstance(workspace, (str, dict)):
        raise PacketNormalizeError("workspace must be a string or object", field="workspace")

    raw_priority = body.get("priority")
    if raw_priority is None or (isinstance(raw_priority, str) and not raw_priority.strip()):
        priority = DEFAULT_PRIORITY
    else:
        priority = _non_empty_str(raw_priority) or str(raw_priority).strip().lower()
        if priority not in ALLOWED_PRIORITIES:
            raise PacketNormalizeError(
                f"priority must be one of: {', '.join(sorted(ALLOWED_PRIORITIES))}",
                field="priority",
            )

    if "permissions" in body:
        permissions = body["permissions"]
        if permissions is None:
            permissions = {}
        elif not isinstance(permissions, dict):
            raise PacketNormalizeError("permissions must be a JSON object", field="permissions")
        else:
            permissions = dict(permissions)
    else:
        permissions = {}

    raw_status = body.get("status")
    if raw_status is None or (isinstance(raw_status, str) and not raw_status.strip()):
        status = DEFAULT_STATUS
    else:
        status = _non_empty_str(raw_status) or str(raw_status).strip().lower()
        if status not in ALLOWED_STATUSES:
            raise PacketNormalizeError(
                f"status must be one of: {', '.join(sorted(ALLOWED_STATUSES))}",
                field="status",
            )

    if "parent_packet_id" in body:
        parent = body["parent_packet_id"]
        parent_packet_id = _non_empty_str(parent) if parent is not None else None
        if parent is not None and parent_packet_id is None and parent != "":
            parent_packet_id = str(parent)
    else:
        parent_packet_id = None

    if "audit_required" in body:
        audit_required = body["audit_required"]
        if not isinstance(audit_required, bool):
            raise PacketNormalizeError("audit_required must be a boolean", field="audit_required")
    else:
        audit_required = True

    return _finalize_envelope(
        packet_id=packet_id,
        packet_type=packet_type,
        route=route,
        source_id=source_id,
        reply_channel=reply_channel,
        payload=payload,
        author=author,
        created_at=created_at,
        workspace=workspace,
        priority=priority,
        permissions=permissions,
        status=status,
        parent_packet_id=parent_packet_id,
        trace_id=trace_id,
        audit_required=audit_required,
    )


def _finalize_envelope(
    *,
    packet_id: str,
    packet_type: str,
    route: str,
    source_id: str,
    reply_channel: Any,
    payload: dict[str, Any],
    author: str,
    created_at: str,
    workspace: Any,
    priority: str,
    permissions: dict[str, Any],
    status: str,
    parent_packet_id: str | None,
    trace_id: str,
    audit_required: bool,
) -> dict[str, Any]:
    return {
        "packet_id": packet_id,
        "type": packet_type,
        "route": route,
        "source_id": source_id,
        "reply_channel": reply_channel,
        "payload": payload,
        "created_by": author,
        "created_at": created_at,
        "workspace": workspace,
        "priority": priority,
        "permissions": permissions,
        "status": status,
        "parent_packet_id": parent_packet_id,
        "trace_id": trace_id,
        "audit_required": audit_required,
    }


def create_chat_message_packet(
    message: str,
    *,
    session_id: str | None = None,
    created_by: str | None = None,
    extra_metadata: dict[str, Any] | None = None,
    packet_id: str | None = None,
    trace_id: str | None = None,
) -> dict[str, Any]:
    """Build a normalized ``type=message`` packet for browser chat (route ``chat``)."""
    text = (message or "").strip()
    if not text:
        raise PacketNormalizeError("message text is required", field="payload")

    pid = packet_id or str(uuid.uuid4())
    tid = trace_id or str(uuid.uuid4())
    sid = (session_id or "").strip() or None
    source_id = f"chat:{sid}" if sid else f"chat:{pid}"
    reply_channel: dict[str, Any] = {"route": "chat"}
    if sid:
        reply_channel["session_id"] = sid

    payload: dict[str, Any] = {"message": text}
    if sid:
        payload["session_id"] = sid
    if extra_metadata:
        payload["metadata"] = {k: v for k, v in extra_metadata.items() if v}

    body: dict[str, Any] = {
        "packet_id": pid,
        "trace_id": tid,
        "type": "message",
        "route": "chat",
        "source_id": source_id,
        "reply_channel": reply_channel,
        "payload": payload,
        "audit_required": True,
    }
    if created_by:
        body["created_by"] = created_by
    return normalize_claudia_packet(body, created_by=created_by)


def normalize_source_packet(
    body: dict[str, Any],
    *,
    created_by: str | None = None,
) -> dict[str, Any]:
    """Normalize intake JSON to ``type=source``; preserve route/source/reply metadata."""
    if not isinstance(body, dict):
        raise PacketNormalizeError("Request body must be a JSON object")
    merged = dict(body)
    merged["type"] = "source"
    return normalize_claudia_packet(merged, created_by=created_by)


def create_upload_source_packet(
    *,
    upload_id: str,
    filename: str,
    mime: str | None = None,
    size: int | None = None,
    file_hash: str | None = None,
    created_by: str | None = None,
    upload_response: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build ``type=source`` packet for a staged file upload (route ``upload``)."""
    uid = (upload_id or "").strip()
    if not uid:
        raise PacketNormalizeError("upload_id is required", field="upload_id")
    name = (filename or "").strip() or uid

    payload: dict[str, Any] = {
        "source_type": "file_upload",
        "content_ref": f"upload:{uid}",
        "filename": name,
    }
    if mime is not None:
        payload["mime_type"] = mime
    if size is not None:
        payload["size"] = size
    if file_hash is not None:
        payload["hash"] = file_hash
    if upload_response:
        payload["original_upload_response"] = dict(upload_response)

    body: dict[str, Any] = {
        "type": "source",
        "route": "upload",
        "source_id": f"upload:{uid}",
        "reply_channel": {"route": "upload", "upload_id": uid},
        "payload": payload,
        "audit_required": True,
    }
    if created_by:
        body["created_by"] = created_by
    return normalize_source_packet(body, created_by=created_by)


def normalize_worker_output_packet(
    body: dict[str, Any],
    *,
    created_by: str | None = None,
) -> dict[str, Any]:
    """Normalize intake JSON to ``type=worker_output``; preserve route/source/reply metadata."""
    if not isinstance(body, dict):
        raise PacketNormalizeError("Request body must be a JSON object")
    merged = dict(body)
    merged["type"] = "worker_output"
    return normalize_claudia_packet(merged, created_by=created_by)
