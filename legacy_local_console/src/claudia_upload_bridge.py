"""Console Mode upload → Claudia source packet bridge (Package 8).

Forwards staged upload metadata to Claudia Core via Gateway source packet path.
Does not import agent_loop, task scheduler, MCP, shell, or local models.
"""

from __future__ import annotations

from typing import Any

from src.claudia_client import forward_source_packet
from src.claudia_packets import PacketNormalizeError, create_upload_source_packet


def _safe_upload_response_snapshot(meta: dict[str, Any]) -> dict[str, Any]:
    """Subset of upload metadata safe to embed in a source packet payload."""
    keys = (
        "id",
        "name",
        "mime",
        "size",
        "hash",
        "uploaded_at",
        "width",
        "height",
        "is_duplicate",
    )
    out: dict[str, Any] = {}
    for key in keys:
        if key in meta:
            out[key] = meta[key]
    return out


def build_upload_source_packet(
    meta: dict[str, Any],
    *,
    created_by: str | None = None,
) -> dict[str, Any]:
    """Create a normalized Claudia source packet from ``save_upload`` metadata."""
    return create_upload_source_packet(
        upload_id=str(meta["id"]),
        filename=str(meta.get("name") or meta["id"]),
        mime=meta.get("mime"),
        size=meta.get("size"),
        file_hash=meta.get("hash"),
        created_by=created_by,
        upload_response=_safe_upload_response_snapshot(meta),
    )


def claudia_source_packet_status(result: dict[str, Any]) -> dict[str, Any]:
    """Compact status object for upload API responses."""
    return {
        "ok": result.get("ok"),
        "status": result.get("status"),
        "message": result.get("message"),
        "packet_id": result.get("packet_id"),
        "trace_id": result.get("trace_id"),
        "core_configured": result.get("core_configured"),
        "forwarded": result.get("forwarded"),
        "source_path": result.get("source_path"),
    }


async def bridge_upload_to_claudia_source(
    meta: dict[str, Any],
    *,
    created_by: str | None = None,
) -> dict[str, Any]:
    """Forward one staged upload to Claudia Core as a source packet (no local execution)."""
    try:
        packet = build_upload_source_packet(meta, created_by=created_by)
    except PacketNormalizeError as exc:
        return {
            "ok": False,
            "status": "validation_error",
            "message": str(exc),
            "packet_id": None,
            "trace_id": None,
            "core_configured": False,
            "forwarded": False,
            "field": exc.field,
        }
    result = await forward_source_packet(packet)
    return claudia_source_packet_status(result)
