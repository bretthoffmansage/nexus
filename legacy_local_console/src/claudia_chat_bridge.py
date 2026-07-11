"""Console Mode browser chat → Nexus Gateway message packets (Package 6, Bridge 04B).

Routes chat through Gateway/Core without local agent, LLM, or tool execution.
Renders Nexus Core message stub ``response.content`` when available.
"""

from __future__ import annotations

import json
from typing import Any, AsyncGenerator

from fastapi import Request

from src.auth_helpers import effective_user
from src.nexus_client import forward_message
from src.nexus_packets import PacketNormalizeError, create_chat_message_packet

MISSING_RESPONSE_CONTENT = (
    "Nexus Core accepted the message, but no response content was returned."
)


def _core_body_from_result(result: dict[str, Any]) -> dict[str, Any] | None:
    core = result.get("core") or result.get("core_body")
    return core if isinstance(core, dict) else None


def _core_response_from_result(result: dict[str, Any]) -> dict[str, Any] | None:
    core = _core_body_from_result(result)
    if not core:
        return None
    response = core.get("response")
    return response if isinstance(response, dict) else None


def _is_core_auth_error(result: dict[str, Any]) -> bool:
    if result.get("core_status") == "401":
        return True
    core = _core_body_from_result(result)
    if isinstance(core, dict) and core.get("error") == "unauthorized":
        return True
    return False


def _user_visible_from_result(result: dict[str, Any]) -> str:
    if not result.get("core_configured"):
        return (
            "Nexus Core is not configured. Local Odysseus chat execution is disabled; "
            "your message was not run by the local agent."
        )

    if _is_core_auth_error(result):
        return (
            "Nexus Core rejected the Gateway request (authentication failed). "
            "Local Odysseus chat execution is disabled; your message was not run locally."
        )

    if result.get("status") == "core_timeout":
        return (
            "Nexus Core did not respond in time. Local Odysseus chat execution "
            "is disabled; your message was not run locally."
        )

    if result.get("status") == "core_unreachable":
        return (
            "Nexus Core is unreachable. Local Odysseus chat execution is disabled; "
            "your message was not run locally."
        )

    if result.get("status") == "core_error" or (
        result.get("forwarded") and result.get("ok") is False
    ):
        return (
            "Nexus Core is unavailable. Local Odysseus chat execution is disabled; "
            "your message was not run locally."
        )

    if result.get("forwarded") and result.get("ok"):
        response = _core_response_from_result(result)
        if response:
            content = response.get("content")
            if isinstance(content, str) and content.strip():
                return content.strip()

        core = _core_body_from_result(result)
        if core:
            message = core.get("message")
            if isinstance(message, str) and message.strip():
                return message.strip()

        return MISSING_RESPONSE_CONTENT

    return result.get("message") or "Message accepted by Nexus Gateway."


def _metadata_from_result(result: dict[str, Any]) -> dict[str, Any]:
    core = _core_body_from_result(result) or {}
    response = _core_response_from_result(result) or {}
    meta: dict[str, Any] = {
        "packet_id": result.get("packet_id") or core.get("packet_id"),
        "trace_id": result.get("trace_id") or core.get("trace_id"),
        "core_status": core.get("status") or result.get("status"),
        "core_mode": core.get("mode"),
        "response_type": response.get("type"),
        "response_role": response.get("role"),
        "response_execution": response.get("execution"),
    }
    return {key: value for key, value in meta.items() if value is not None}


def build_chat_response_payload(result: dict[str, Any]) -> dict[str, Any]:
    """Build sync chat JSON or SSE metadata from a Gateway forward result."""
    visible = _user_visible_from_result(result)
    payload: dict[str, Any] = {
        "response": visible,
        "message": visible,
        "ok": result.get("ok"),
        "status": result.get("status"),
        "core_configured": result.get("core_configured"),
        "forwarded": result.get("forwarded"),
        "console_mode": True,
        "agent_disabled": True,
    }
    payload.update(_metadata_from_result(result))
    core = _core_body_from_result(result)
    if core is not None:
        payload["core"] = core
    return payload


async def sse_from_gateway_result(result: dict[str, Any]) -> AsyncGenerator[str, None]:
    """Frontend-safe SSE from a Gateway forward result (no local agent output)."""
    payload = build_chat_response_payload(result)
    payload["type"] = "nexus_message"
    payload["delta"] = payload["response"]
    yield f"data: {json.dumps(payload)}\n\n"
    yield "data: [DONE]\n\n"


async def console_mode_chat_stream(request: Request) -> AsyncGenerator[str, None]:
    """Handle ``POST /api/chat_stream`` in legacy local console Mode."""
    form = await request.form()
    message = form.get("message")
    session = form.get("session")
    if message is None or (isinstance(message, str) and not message.strip()):
        err = {
            "type": "error",
            "message": "Message is required",
            "console_mode": True,
        }
        yield f"data: {json.dumps(err)}\n\n"
        yield "data: [DONE]\n\n"
        return

    actor = effective_user(request) or "gateway"
    session_id = str(session).strip() if session else None
    try:
        packet = create_chat_message_packet(
            str(message),
            session_id=session_id,
            created_by=actor,
            extra_metadata={
                "mode": str(form.get("mode") or ""),
                "preset_id": str(form.get("preset_id") or ""),
            },
        )
    except PacketNormalizeError as exc:
        err = {
            "type": "validation_error",
            "message": str(exc),
            "field": exc.field,
            "console_mode": True,
        }
        yield f"data: {json.dumps(err)}\n\n"
        yield "data: [DONE]\n\n"
        return

    result = await forward_message(packet)
    async for chunk in sse_from_gateway_result(result):
        yield chunk


async def console_mode_resume_stream(session_id: str) -> AsyncGenerator[str, None]:
    """``GET /api/chat/resume`` — no detached Odysseus agent runs in Console Mode."""
    visible = (
        "Detached agent resume is disabled in legacy local console Mode. "
        "Send chat messages to forward them to Nexus Core."
    )
    payload = {
        "type": "nexus_message",
        "message": visible,
        "delta": visible,
        "session_id": session_id,
        "console_mode": True,
        "agent_disabled": True,
        "status": "resume_disabled",
    }
    yield f"data: {json.dumps(payload)}\n\n"
    yield "data: [DONE]\n\n"


async def console_mode_sync_chat(
    *,
    message: str,
    session_id: str | None,
    created_by: str | None,
) -> dict[str, Any]:
    """Handle ``POST /api/chat`` in legacy local console Mode."""
    packet = create_chat_message_packet(
        message,
        session_id=session_id,
        created_by=created_by,
    )
    result = await forward_message(packet)
    return build_chat_response_payload(result)
