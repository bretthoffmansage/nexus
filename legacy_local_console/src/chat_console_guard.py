"""Claudia Console Mode guards for legacy chat endpoints (Package 5).

Blocks local Odysseus chat/agent execution when ``CLAUDIA_CONSOLE_MODE`` is on.
Does not call Claudia Core, local models, or ``stream_agent_loop``.
"""

from __future__ import annotations

import json
from typing import Any, AsyncGenerator

from src.console_mode import is_claudia_console_mode

CONSOLE_MODE_CHAT_MESSAGE = (
    "Claudia Console Mode is active. Local Odysseus chat execution is disabled. "
    "Claudia Core message routing is not enabled yet."
)


def console_mode_chat_json() -> dict[str, Any]:
    """Safe JSON body for ``POST /api/chat`` and similar sync chat endpoints."""
    return {
        "response": CONSOLE_MODE_CHAT_MESSAGE,
        "claudia_console_mode": True,
        "agent_disabled": True,
    }


async def console_mode_sse_stream() -> AsyncGenerator[str, None]:
    """Frontend-safe SSE when streaming chat is disabled in Console Mode."""
    payload = {
        "type": "claudia_console_mode",
        "message": CONSOLE_MODE_CHAT_MESSAGE,
        "delta": CONSOLE_MODE_CHAT_MESSAGE,
        "claudia_console_mode": True,
        "agent_disabled": True,
    }
    yield f"data: {json.dumps(payload)}\n\n"
    yield "data: [DONE]\n\n"


def console_mode_http_detail() -> dict[str, Any]:
    """Structured detail for non-streaming HTTP errors (e.g. resume while disabled)."""
    return {
        "status": "claudia_console_mode",
        "message": CONSOLE_MODE_CHAT_MESSAGE,
        "claudia_console_mode": True,
        "agent_disabled": True,
    }
