"""Tests for Console chat rendering Core message stub (Bridge 04B)."""

from __future__ import annotations

import json
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.nexus_chat_bridge import (
    MISSING_RESPONSE_CONTENT,
    _user_visible_from_result,
    build_chat_response_payload,
    console_mode_chat_stream,
    console_mode_sync_chat,
)


def _stub_core_body(user_message: str = "hello") -> dict:
    content = (
        f'Nexus Core received your message: "{user_message}". '
        "Full task execution is not enabled yet."
    )
    return {
        "ok": True,
        "status": "accepted",
        "packet_id": "core-pkt-1",
        "trace_id": "core-tr-1",
        "mode": "minimal_message_stub",
        "message": "Nexus Core accepted the message.",
        "response": {
            "role": "assistant",
            "content": content,
            "type": "message_stub",
            "execution": {
                "hermes_invoked": False,
                "workers_invoked": False,
                "task_loop_invoked": False,
            },
        },
    }


def _forwarded_stub_result(user_message: str = "hello") -> dict:
    core = _stub_core_body(user_message)
    return {
        "ok": True,
        "status": "forwarded",
        "message": "Message forwarded to Nexus Core.",
        "packet_id": core["packet_id"],
        "trace_id": core["trace_id"],
        "core_configured": True,
        "forwarded": True,
        "core_status": "200",
        "core_body": core,
    }


def test_user_visible_renders_core_response_content():
    visible = _user_visible_from_result(_forwarded_stub_result("Bridge 04B"))
    assert "Bridge 04B" in visible
    assert "Full task execution is not enabled yet" in visible


def test_user_visible_missing_response_content_fallback():
    result = _forwarded_stub_result()
    result["core_body"]["response"] = {"role": "assistant", "type": "message_stub"}
    result["core_body"]["message"] = ""
    assert _user_visible_from_result(result) == MISSING_RESPONSE_CONTENT


def test_user_visible_falls_back_to_core_message_when_no_content():
    result = _forwarded_stub_result()
    result["core_body"]["response"] = {"role": "assistant", "type": "message_stub"}
    assert _user_visible_from_result(result) == "Nexus Core accepted the message."


def test_user_visible_core_not_configured():
    visible = _user_visible_from_result(
        {"ok": False, "status": "core_not_configured", "core_configured": False, "forwarded": False},
    )
    assert "not configured" in visible.lower()


def test_user_visible_core_unreachable():
    visible = _user_visible_from_result(
        {
            "ok": False,
            "status": "core_unreachable",
            "core_configured": True,
            "forwarded": False,
        },
    )
    assert "unreachable" in visible.lower()


def test_user_visible_core_auth_error():
    visible = _user_visible_from_result(
        {
            "ok": False,
            "status": "core_error",
            "core_status": "401",
            "core_configured": True,
            "forwarded": True,
            "core_body": {"ok": False, "error": "unauthorized"},
        },
    )
    assert "authentication failed" in visible.lower()


def test_build_chat_response_preserves_metadata():
    payload = build_chat_response_payload(_forwarded_stub_result("meta-test"))
    assert payload["packet_id"] == "core-pkt-1"
    assert payload["trace_id"] == "core-tr-1"
    assert payload["core_mode"] == "minimal_message_stub"
    assert payload["response_type"] == "message_stub"
    assert payload["response_execution"]["hermes_invoked"] is False
    assert payload["response"] == payload["message"]
    assert "meta-test" in payload["response"]


@pytest.mark.asyncio
async def test_console_mode_sync_chat_renders_stub(monkeypatch):
    async def _fake_forward(_packet):
        return _forwarded_stub_result("sync hello")

    monkeypatch.setattr("src.nexus_chat_bridge.forward_message", _fake_forward)
    out = await console_mode_sync_chat(message="sync hello", session_id="s1", created_by="u")
    assert "sync hello" in out["response"]
    assert out["response_type"] == "message_stub"
    assert out["packet_id"] == "core-pkt-1"


@pytest.mark.asyncio
async def test_console_mode_chat_stream_renders_stub(monkeypatch):
    async def _fake_forward(_packet):
        return _forwarded_stub_result("stream hello")

    monkeypatch.setattr("src.nexus_chat_bridge.forward_message", _fake_forward)

    class _Req:
        state = SimpleNamespace(api_token=False, current_user="alice")

        async def form(self):
            return {"message": "stream hello", "session": "sess-1"}

    chunks = [c async for c in console_mode_chat_stream(_Req())]
    payload = json.loads(chunks[0].replace("data: ", "").strip())
    assert "stream hello" in payload["delta"]
    assert payload["response_type"] == "message_stub"
    assert payload["packet_id"] == "core-pkt-1"
    assert chunks[-1].strip() == "data: [DONE]"


@pytest.mark.asyncio
async def test_console_mode_chat_no_agent_loop_on_core_stub(monkeypatch):
    monkeypatch.setenv("NEXUS_CONSOLE_MODE", "true")

    async def _fake_forward(_packet):
        return _forwarded_stub_result("safe")

    monkeypatch.setattr("src.nexus_chat_bridge.forward_message", _fake_forward)

    class _Req:
        state = SimpleNamespace(api_token=False, current_user="alice")

        async def form(self):
            return {"message": "safe", "session": "s1"}

    chunks = [c async for c in console_mode_chat_stream(_Req())]
    payload = json.loads(chunks[0].replace("data: ", "").strip())
    assert payload["agent_disabled"] is True
    assert payload["console_mode"] is True
    assert "safe" in payload["delta"]


def _build_gateway_app():
    sys.modules.pop("routes.nexus_routes", None)
    sys.modules.pop("src.nexus_client", None)
    from routes.nexus_routes import setup_nexus_routes

    app = FastAPI()
    app.include_router(setup_nexus_routes())
    return app


def test_gateway_messages_renders_core_stub(monkeypatch):
    monkeypatch.setenv("NEXUS_CORE_URL", "http://core.test:9000")
    monkeypatch.setenv("AUTH_ENABLED", "false")

    core = _stub_core_body("Gateway message test")
    mock_resp = type(
        "R",
        (),
        {"status_code": 200, "text": "{}", "json": lambda self: core},
    )()
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    app = _build_gateway_app()
    with patch("src.nexus_client.httpx.AsyncClient", return_value=mock_client):
        with TestClient(app) as client:
            resp = client.post(
                "/api/nexus/v1/messages",
                json={"type": "message", "payload": {"message": "Gateway message test"}},
            )

    assert resp.status_code == 200
    data = resp.json()
    assert data["forwarded"] is True
    assert data["core"]["response"]["type"] == "message_stub"
    assert "Gateway message test" in data["core"]["response"]["content"]


def test_gateway_messages_core_401_safe(monkeypatch):
    monkeypatch.setenv("NEXUS_CORE_URL", "http://core.test:9000")
    monkeypatch.setenv("AUTH_ENABLED", "false")

    mock_resp = type(
        "R",
        (),
        {
            "status_code": 401,
            "text": "{}",
            "json": lambda self: {
                "ok": False,
                "error": "unauthorized",
                "message": "Invalid or missing Nexus Gateway secret.",
            },
        },
    )()
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    app = _build_gateway_app()
    with patch("src.nexus_client.httpx.AsyncClient", return_value=mock_client):
        with TestClient(app) as client:
            resp = client.post(
                "/api/nexus/v1/messages",
                json={"payload": {"message": "auth fail test"}},
            )

    data = resp.json()
    assert data["ok"] is False
    assert data["core_status"] == "401"


@pytest.mark.asyncio
async def test_forward_message_core_unreachable_no_agent(monkeypatch):
    monkeypatch.setenv("NEXUS_CORE_URL", "http://core.test:9000")
    sys.modules.pop("src.nexus_client", None)
    import importlib

    mod = importlib.import_module("src.nexus_client")
    from src.nexus_packets import create_chat_message_packet

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(side_effect=httpx.ConnectError("refused"))
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    pkt = create_chat_message_packet("x", session_id="s", created_by="u")
    with patch.object(mod.httpx, "AsyncClient", return_value=mock_client):
        result = await mod.forward_message(pkt)

    visible = _user_visible_from_result(result)
    assert "unreachable" in visible.lower()

    payload = build_chat_response_payload(result)
    assert "unreachable" in payload["response"].lower()
    assert payload["agent_disabled"] is True
