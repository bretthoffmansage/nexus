"""Tests for Nexus Gateway messages and Console Mode chat routing (Package 6)."""

import importlib
import json
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.middleware.base import BaseHTTPMiddleware


def _build_nexus_app(middleware_cls=None):
    sys.modules.pop("routes.nexus_routes", None)
    from routes.nexus_routes import setup_nexus_routes

    app = FastAPI()
    if middleware_cls:
        app.add_middleware(middleware_cls)
    app.include_router(setup_nexus_routes())
    return app


def test_create_chat_message_packet_route_and_session():
    from src.nexus_packets import create_chat_message_packet

    pkt = create_chat_message_packet(
        "hello",
        session_id="sess-1",
        created_by="alice",
    )
    assert pkt["type"] == "message"
    assert pkt["route"] == "chat"
    assert pkt["source_id"] == "chat:sess-1"
    assert pkt["reply_channel"] == {"route": "chat", "session_id": "sess-1"}
    assert pkt["payload"]["message"] == "hello"
    assert pkt["audit_required"] is True


@pytest.mark.asyncio
async def test_forward_message_core_unconfigured(monkeypatch):
    monkeypatch.delenv("NEXUS_CORE_URL", raising=False)
    sys.modules.pop("src.nexus_client", None)
    from src.nexus_packets import create_chat_message_packet
    from src.nexus_client import forward_message

    pkt = create_chat_message_packet("hi", session_id="s1", created_by="u")
    result = await forward_message(pkt)
    assert result["core_configured"] is False
    assert result["forwarded"] is False
    assert result["packet_id"] == pkt["packet_id"]


def test_post_messages_normalizes(monkeypatch):
    monkeypatch.delenv("NEXUS_CORE_URL", raising=False)
    monkeypatch.setenv("AUTH_ENABLED", "false")

    class _Mw(BaseHTTPMiddleware):
        async def dispatch(self, request, call_next):
            return await call_next(request)

    app = _build_nexus_app(_Mw)
    with TestClient(app) as client:
        resp = client.post(
            "/api/nexus/v1/messages",
            json={"message": "hello", "session_id": "sess-9"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["packet_id"]
    assert data["status"] == "core_not_configured"


def test_get_stream_returns_sse(monkeypatch):
    monkeypatch.delenv("NEXUS_CORE_URL", raising=False)
    monkeypatch.setenv("AUTH_ENABLED", "false")

    app = _build_nexus_app()
    with TestClient(app) as client:
        resp = client.get("/api/nexus/v1/stream/pkt-abc")
    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers.get("content-type", "")
    assert "nexus_stream_placeholder" in resp.text
    assert "[DONE]" in resp.text


@pytest.mark.asyncio
async def test_console_mode_chat_stream_sse(monkeypatch):
    monkeypatch.setenv("NEXUS_CONSOLE_MODE", "true")
    monkeypatch.delenv("NEXUS_CORE_URL", raising=False)
    sys.modules.pop("src.console_mode", None)

    from src.nexus_chat_bridge import console_mode_chat_stream

    class _Req:
        state = SimpleNamespace(api_token=False, current_user="alice")

        async def form(self):
            return {"message": "hello", "session": "sess-x"}

    chunks = [c async for c in console_mode_chat_stream(_Req())]
    assert any("nexus_message" in c for c in chunks)
    payload = json.loads(chunks[0].replace("data: ", "").strip())
    assert payload["packet_id"]
    assert payload["trace_id"]
    assert chunks[-1].strip() == "data: [DONE]"


@pytest.mark.asyncio
async def test_console_mode_chat_stream_no_agent_loop(monkeypatch):
    monkeypatch.setenv("NEXUS_CONSOLE_MODE", "true")
    monkeypatch.delenv("NEXUS_CORE_URL", raising=False)

    from src.nexus_chat_bridge import console_mode_chat_stream

    class _Req:
        state = SimpleNamespace(api_token=False, current_user="alice")

        async def form(self):
            return {"message": "test", "session": "s1"}

    chunks = [c async for c in console_mode_chat_stream(_Req())]
    assert chunks
    payload = json.loads(chunks[0].replace("data: ", "").strip())
    assert payload.get("agent_disabled") is True
    assert payload.get("console_mode") is True


@pytest.mark.asyncio
async def test_forward_message_to_core_mocked(monkeypatch):
    monkeypatch.setenv("NEXUS_CORE_URL", "http://core.test:9000")
    sys.modules.pop("src.nexus_client", None)
    from src.nexus_packets import create_chat_message_packet

    sys.modules.pop("src.nexus_client", None)
    mod = importlib.import_module("src.nexus_client")
    pkt = create_chat_message_packet("forwarded", session_id="s2", created_by="u")

    mock_resp = type(
        "R",
        (),
        {
            "status_code": 200,
            "text": "{}",
            "json": lambda self: {"ok": True},
        },
    )()
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch.object(mod.httpx, "AsyncClient", return_value=mock_client):
        result = await mod.forward_message(pkt)

    assert result["forwarded"] is True
    assert mock_client.post.await_args[0][0] == "http://core.test:9000/messages"
    sent = mock_client.post.await_args[1]["json"]
    assert sent["type"] == "message"
    assert sent["route"] == "chat"
