"""Tests for Claudia Gateway CLI Mirror relay (Bridge 08)."""

from __future__ import annotations

import importlib
import json
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.middleware.base import BaseHTTPMiddleware


def _build_cli_app(middleware_cls=None):
    sys.modules.pop("routes.claudia_routes", None)
    sys.modules.pop("src.claudia_client", None)
    from routes.claudia_routes import setup_claudia_routes

    app = FastAPI()
    if middleware_cls:
        app.add_middleware(middleware_cls)
    app.include_router(setup_claudia_routes())
    return app


class _AdminMw(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        request.state.api_token = True
        request.state.api_token_scopes = {"claudia_admin"}
        request.state.current_user = "admin"
        request.app.state.auth_manager = MagicMock(is_admin=lambda _u: True)
        return await call_next(request)


def test_cli_sessions_core_not_configured(monkeypatch):
    monkeypatch.delenv("CLAUDIA_CORE_URL", raising=False)
    monkeypatch.setenv("AUTH_ENABLED", "false")
    app = _build_cli_app(_AdminMw)
    with TestClient(app) as client:
        resp = client.get("/api/claudia/v1/cli/sessions")
    data = resp.json()
    assert data["status"] == "core_not_configured"
    assert data["forwarded"] is False


def test_cli_start_forwards_to_core(monkeypatch):
    monkeypatch.setenv("CLAUDIA_CORE_URL", "http://core.test:9000")
    monkeypatch.setenv("AUTH_ENABLED", "false")

    core_body = {
        "ok": True,
        "status": "running",
        "session_id": "sess-1",
        "session": {"session_id": "sess-1", "status": "running"},
    }
    mock_resp = type(
        "R",
        (),
        {"status_code": 200, "text": "{}", "json": lambda self: core_body},
    )()
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    app = _build_cli_app(_AdminMw)
    with patch("src.claudia_client.httpx.AsyncClient", return_value=mock_client):
        with TestClient(app) as client:
            resp = client.post(
                "/api/claudia/v1/cli/sessions",
                json={"title": "relay test"},
            )

    assert resp.status_code == 200
    data = resp.json()
    assert data["forwarded"] is True
    assert data["session_id"] == "sess-1"
    assert mock_client.post.await_args[0][0] == "http://core.test:9000/hermes/sessions"


def test_cli_input_forwards_to_core(monkeypatch):
    monkeypatch.setenv("CLAUDIA_CORE_URL", "http://core.test:9000")
    monkeypatch.setenv("AUTH_ENABLED", "false")

    mock_resp = type(
        "R",
        (),
        {"status_code": 200, "text": "{}", "json": lambda self: {"ok": True, "status": "accepted"}},
    )()
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    app = _build_cli_app(_AdminMw)
    with patch("src.claudia_client.httpx.AsyncClient", return_value=mock_client):
        with TestClient(app) as client:
            resp = client.post(
                "/api/claudia/v1/cli/sessions/s1/input",
                json={"text": "/help"},
            )

    assert resp.status_code == 200
    sent = mock_client.post.await_args[1]["json"]
    assert sent["text"] == "/help"


def test_cli_transcript_forwards_to_core(monkeypatch):
    monkeypatch.setenv("CLAUDIA_CORE_URL", "http://core.test:9000")
    monkeypatch.setenv("AUTH_ENABLED", "false")

    mock_resp = type(
        "R",
        (),
        {
            "status_code": 200,
            "text": "{}",
            "json": lambda self: {"ok": True, "events": [{"type": "output", "text": "x"}]},
        },
    )()
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    app = _build_cli_app(_AdminMw)
    with patch("src.claudia_client.httpx.AsyncClient", return_value=mock_client):
        with TestClient(app) as client:
            resp = client.get("/api/claudia/v1/cli/sessions/s1/transcript")

    assert resp.status_code == 200
    assert resp.json()["events"][0]["type"] == "output"


def test_cli_stream_relays_sse(monkeypatch):
    monkeypatch.setenv("CLAUDIA_CORE_URL", "http://core.test:9000")
    monkeypatch.setenv("AUTH_ENABLED", "false")

    async def _aiter_text(self):
        yield "event: hermes_output\ndata: {\"text\":\"hi\"}\n\n"

    mock_stream_resp = MagicMock()
    mock_stream_resp.status_code = 200
    mock_stream_resp.aiter_text = _aiter_text.__get__(mock_stream_resp, type(mock_stream_resp))

    mock_client = AsyncMock()
    mock_client.stream = MagicMock()
    mock_client.stream.return_value.__aenter__ = AsyncMock(return_value=mock_stream_resp)
    mock_client.stream.return_value.__aexit__ = AsyncMock(return_value=None)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    app = _build_cli_app(_AdminMw)
    with patch("src.claudia_client.httpx.AsyncClient", return_value=mock_client):
        with TestClient(app) as client:
            with client.stream("GET", "/api/claudia/v1/cli/sessions/s1/stream") as resp:
                body = "".join(resp.iter_text())

    assert "hermes_output" in body
    assert mock_client.stream.call_args[0][1] == "http://core.test:9000/hermes/sessions/s1/stream"


def test_cli_forwards_gateway_secret(monkeypatch):
    monkeypatch.setenv("CLAUDIA_CORE_URL", "http://core.test:9000")
    monkeypatch.setenv("CLAUDIA_GATEWAY_SHARED_SECRET", "relay-secret")
    monkeypatch.setenv("AUTH_ENABLED", "false")

    mock_resp = type("R", (), {"status_code": 200, "text": "{}", "json": lambda self: {"ok": True, "sessions": []}})()
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    app = _build_cli_app(_AdminMw)
    with patch("src.claudia_client.httpx.AsyncClient", return_value=mock_client):
        with TestClient(app) as client:
            resp = client.get("/api/claudia/v1/cli/sessions")

    headers = mock_client.get.await_args[1]["headers"]
    assert headers["X-Claudia-Gateway-Secret"] == "relay-secret"
    assert "relay-secret" not in resp.text


def test_cli_stop_forwards_to_core(monkeypatch):
    monkeypatch.setenv("CLAUDIA_CORE_URL", "http://core.test:9000")
    monkeypatch.setenv("AUTH_ENABLED", "false")

    mock_resp = type(
        "R",
        (),
        {"status_code": 200, "text": "{}", "json": lambda self: {"ok": True, "status": "stopped"}},
    )()
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    app = _build_cli_app(_AdminMw)
    with patch("src.claudia_client.httpx.AsyncClient", return_value=mock_client):
        with TestClient(app) as client:
            resp = client.post("/api/claudia/v1/cli/sessions/s1/stop")

    assert resp.status_code == 200
    assert mock_client.post.await_args[0][0].endswith("/hermes/sessions/s1/stop")


def test_cli_no_agent_loop_import(monkeypatch):
    monkeypatch.setenv("CLAUDIA_CORE_URL", "http://core.test:9000")
    import ast
    from pathlib import Path

    text = Path(__file__).resolve().parents[1] / "routes" / "claudia_routes.py"
    tree = ast.parse(text.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module and "agent_loop" in node.module:
            pytest.fail("claudia_routes must not import agent_loop")
