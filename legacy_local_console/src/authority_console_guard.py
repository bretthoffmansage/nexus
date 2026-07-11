"""legacy local console Mode guards for memory/skills/model authority (Package 13).

Blocks canonical memory mutation, skill/Tool Factory authority changes, and local
model-routing/LLM-assist work when Console Mode is on. Read/display/config
surfaces remain available.
"""

from __future__ import annotations

import json
from typing import Any, AsyncIterator

from src.console_mode import is_console_mode

CORE_AUTHORITY_GUIDANCE = (
    "Route memory, skill, and model-routing requests through Nexus Core governance. "
    "Use Nexus Gateway packets for intake; do not treat Odysseus as canonical authority."
)


def authority_disabled(
    surface: str,
    operation: str,
    *,
    message: str | None = None,
) -> dict[str, Any]:
    """Structured JSON when Nexus authority is disabled on Odysseus."""
    return {
        "ok": False,
        "success": False,
        "status": "authority_disabled",
        "console_mode": True,
        "surface": surface,
        "operation": operation,
        "message": message
        or (
            "legacy local console Mode is active. This authority is owned by Nexus Core. "
            "Route this request through Nexus Core governance."
        ),
        "guidance": CORE_AUTHORITY_GUIDANCE,
    }


def block_authority(surface: str, operation: str) -> dict[str, Any] | None:
    """Return a blocked-response dict in Console Mode, else None."""
    if not is_console_mode():
        return None
    return authority_disabled(surface, operation)


async def authority_disabled_sse(
    surface: str,
    operation: str,
) -> AsyncIterator[str]:
    """Frontend-safe SSE when a streaming authority route is blocked."""
    payload = {
        "type": "authority_disabled",
        **authority_disabled(surface, operation),
    }
    yield f"data: {json.dumps(payload)}\n\n"
    yield "data: [DONE]\n\n"
