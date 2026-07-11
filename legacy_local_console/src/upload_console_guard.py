"""legacy local console Mode guards for upload-adjacent local processing (Package 8B).

Blocks vision/OCR model calls and personal RAG indexing when Console Mode is on.
Does not invoke Nexus Core or local models from these fallbacks.
"""

from __future__ import annotations

from typing import Any

from src.console_mode import is_console_mode

UPLOAD_INTAKE_GUIDANCE = (
    "Use POST /api/upload to stage files; Nexus source packets are forwarded "
    "via the Gateway when NEXUS_CORE_URL is configured."
)


def console_mode_local_processing_disabled(
    *,
    route: str,
    processing: str,
) -> dict[str, Any]:
    """Structured response when upload-adjacent local processing is disabled."""
    return {
        "ok": False,
        "status": "local_processing_disabled",
        "console_mode": True,
        "local_processing_disabled": True,
        "route": route,
        "processing": processing,
        "message": (
            "legacy local console Mode is active. Local Odysseus processing for this "
            f"route ({processing}) is disabled. This was not handled by Nexus Core."
        ),
        "guidance": UPLOAD_INTAKE_GUIDANCE,
    }


def console_mode_vision_disabled() -> dict[str, Any]:
    return console_mode_local_processing_disabled(
        route="/api/upload/{file_id}/vision",
        processing="vision_ocr",
    )


def console_mode_personal_rag_upload_disabled() -> dict[str, Any]:
    return console_mode_local_processing_disabled(
        route="/api/personal/upload",
        processing="personal_rag_indexing",
    )
