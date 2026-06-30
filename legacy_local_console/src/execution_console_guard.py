"""Claudia Console Mode guards for local execution surfaces (Package 12).

Blocks shell command execution, MCP host connections/tool paths, workspace file
mutations, and autonomous research starts when Console Mode is on.
"""

from __future__ import annotations

import json
from typing import Any, AsyncIterator

from src.console_mode import is_claudia_console_mode

CORE_ROUTING_GUIDANCE = (
    "Route execution requests through Claudia Core worker/task governance. "
    "Use Claudia Gateway packets (intake, messages, source packets) for intake."
)


def local_execution_disabled(
    surface: str,
    operation: str,
    *,
    message: str | None = None,
) -> dict[str, Any]:
    """Structured JSON when direct local execution is disabled."""
    return {
        "ok": False,
        "success": False,
        "status": "local_execution_disabled",
        "claudia_console_mode": True,
        "surface": surface,
        "operation": operation,
        "message": message
        or (
            "Claudia Console Mode is active. Direct local execution is disabled. "
            "Route this request through Claudia Core worker/task governance."
        ),
        "guidance": CORE_ROUTING_GUIDANCE,
    }


def block_local_execution(surface: str, operation: str) -> dict[str, Any] | None:
    """Return a blocked-response dict in Console Mode, else None."""
    if not is_claudia_console_mode():
        return None
    return local_execution_disabled(surface, operation)


async def local_execution_disabled_sse(
    surface: str,
    operation: str,
) -> AsyncIterator[str]:
    """Frontend-safe SSE when a streaming execution route is blocked."""
    payload = {
        "type": "local_execution_disabled",
        **local_execution_disabled(surface, operation),
    }
    yield f"data: {json.dumps(payload)}\n\n"
    yield "data: [DONE]\n\n"
