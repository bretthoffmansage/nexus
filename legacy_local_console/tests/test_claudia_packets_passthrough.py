"""Tests for Nexus Gateway packet read passthrough to Core (Bridge 03)."""

import asyncio
import importlib
import json
import sys
from unittest.mock import AsyncMock, patch
import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient


def _build_gateway_app():
    sys.modules.pop("routes.nexus_routes", None)
    sys.modules.pop("src.nexus_client", None)
    from routes.nexus_routes import setup_nexus_routes

    app = FastAPI()
    app.include_router(setup_nexus_routes())
    return app


def _reload_client(monkeypatch):
    monkeypatch.delenv("NEXUS_CORE_URL", raising=False)
    monkeypatch.delenv("NEXUS_GATEWAY_SHARED_SECRET", raising=False)
    sys.modules.pop("src.nexus_client", None)
    return importlib.import_module("src.nexus_client")


def test_packets_placeholder_when_core_not_configured(monkeypatch):
    monkeypatch.delenv("NEXUS_CORE_URL", raising=False)
    monkeypatch.setenv("AUTH_ENABLED", "false")
    app = _build_gateway_app()
    with TestClient(app) as client:
        resp = client.get("/api/nexus/v1/packets")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "core_not_configured"
    assert data["packets"] == []
    assert data["items"] == []
    assert data["forwarded"] is False
    assert data["source"] == "gateway_placeholder"


def test_packets_forwards_to_core_tasks(monkeypatch):
    monkeypatch.setenv("NEXUS_CORE_URL", "http://core.test:9000")
    monkeypatch.setenv("AUTH_ENABLED", "false")

    mock_resp = type(
        "R",
        (),
        {
            "status_code": 200,
            "text": "{}",
            "json": lambda self: {
                "ok": True,
                "tasks": [{"packet_id": "pkt-1", "status": "accepted"}],
                "count": 1,
            },
        },
    )()

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    app = _build_gateway_app()
    with patch("src.nexus_client.httpx.AsyncClient", return_value=mock_client):
        with TestClient(app) as client:
            resp = client.get("/api/nexus/v1/packets")

    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["forwarded"] is True
    assert data["source"] == "nexus_core"
    assert data["core_url"] == "core.test:9000"
    assert data["packets"][0]["packet_id"] == "pkt-1"
    mock_client.get.assert_awaited_once()
    assert mock_client.get.await_args[0][0] == "http://core.test:9000/tasks"


def test_packet_detail_forwards_to_core_tasks_id(monkeypatch):
    monkeypatch.setenv("NEXUS_CORE_URL", "http://core.test:9000")
    monkeypatch.setenv("AUTH_ENABLED", "false")

    mock_resp = type(
        "R",
        (),
        {
            "status_code": 200,
            "text": "{}",
            "json": lambda self: {
                "ok": True,
                "task": {"packet_id": "pkt-detail", "trace_id": "tr-1"},
            },
        },
    )()

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    app = _build_gateway_app()
    with patch("src.nexus_client.httpx.AsyncClient", return_value=mock_client):
        with TestClient(app) as client:
            resp = client.get("/api/nexus/v1/packets/pkt-detail")

    assert resp.status_code == 200
    data = resp.json()
    assert data["forwarded"] is True
    assert data["source"] == "nexus_core"
    assert data["packet"]["packet_id"] == "pkt-detail"
    assert mock_client.get.await_args[0][0] == "http://core.test:9000/tasks/pkt-detail"


def test_packet_detail_core_404_is_not_found(monkeypatch):
    monkeypatch.setenv("NEXUS_CORE_URL", "http://core.test:9000")
    monkeypatch.setenv("AUTH_ENABLED", "false")

    mock_resp = type(
        "R",
        (),
        {
            "status_code": 404,
            "text": '{"ok": false}',
            "json": lambda self: {"ok": False, "error": "not_found"},
        },
    )()

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    app = _build_gateway_app()
    with patch("src.nexus_client.httpx.AsyncClient", return_value=mock_client):
        with TestClient(app) as client:
            resp = client.get("/api/nexus/v1/packets/missing-pkt")

    assert resp.status_code == 404
    detail = resp.json()["detail"]
    assert detail["error"] == "not_found"


def test_packets_core_unreachable(monkeypatch):
    monkeypatch.setenv("NEXUS_CORE_URL", "http://core.test:9000")
    monkeypatch.setenv("AUTH_ENABLED", "false")

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(side_effect=httpx.ConnectError("refused"))
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    app = _build_gateway_app()
    with patch("src.nexus_client.httpx.AsyncClient", return_value=mock_client):
        with TestClient(app) as client:
            resp = client.get("/api/nexus/v1/packets")

    data = resp.json()
    assert data["ok"] is False
    assert data["status"] == "core_unreachable"
    assert data["forwarded"] is False


def test_list_packets_forwards_shared_secret(monkeypatch):
    mod = _reload_client(monkeypatch)
    monkeypatch.setenv("NEXUS_CORE_URL", "http://core.test:9000")
    monkeypatch.setenv("NEXUS_GATEWAY_SHARED_SECRET", "bridge-secret-xyz")

    mock_resp = type(
        "R",
        (),
        {
            "status_code": 200,
            "text": "{}",
            "json": lambda self: {"ok": True, "tasks": [], "count": 0},
        },
    )()

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    async def _run():
        with patch("src.nexus_client.httpx.AsyncClient", return_value=mock_client):
            return await mod.list_packets()

    result = asyncio.run(_run())

    headers = mock_client.get.await_args[1]["headers"]
    assert headers[mod.GATEWAY_SECRET_HEADER] == "bridge-secret-xyz"
    assert result["forwarded"] is True
    blob = json.dumps(result)
    assert "bridge-secret-xyz" not in blob
    assert mod.ENV_GATEWAY_SECRET not in blob


def test_packets_route_does_not_call_agent_loop(monkeypatch):
    monkeypatch.setenv("NEXUS_CORE_URL", "http://core.test:9000")
    monkeypatch.setenv("AUTH_ENABLED", "false")
    agent_calls = []

    def _boom(*_a, **_k):
        agent_calls.append(True)
        raise AssertionError("stream_agent_loop must not run")

    monkeypatch.setattr("src.agent_loop.stream_agent_loop", _boom, raising=False)

    mock_resp = type(
        "R",
        (),
        {
            "status_code": 200,
            "json": lambda self: {"ok": True, "tasks": [], "count": 0},
        },
    )()
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    app = _build_gateway_app()
    with patch("src.nexus_client.httpx.AsyncClient", return_value=mock_client):
        with TestClient(app) as client:
            client.get("/api/nexus/v1/packets")
            client.get("/api/nexus/v1/packets/pkt-x")
    assert not agent_calls
