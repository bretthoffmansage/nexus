"""Tests for Nexus Gateway routes (/api/nexus/v1) — Package 2."""

import importlib
import sys
from unittest.mock import AsyncMock, patch

import pytest
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


def test_health_core_unconfigured(monkeypatch):
    monkeypatch.delenv("NEXUS_CORE_URL", raising=False)
    app = _build_gateway_app()
    with TestClient(app) as client:
        resp = client.get("/api/nexus/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["status"] == "gateway_ok"
    assert data["core_configured"] is False
    assert data["forwarded"] is False


def test_intake_core_unconfigured(monkeypatch):
    monkeypatch.delenv("NEXUS_CORE_URL", raising=False)
    monkeypatch.setenv("AUTH_ENABLED", "false")
    app = _build_gateway_app()
    with TestClient(app) as client:
        resp = client.post(
            "/api/nexus/v1/intake",
            json={"packet_id": "pkt-1", "trace_id": "trace-abc", "payload": {"x": 1}},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is False
    assert data["status"] == "core_not_configured"
    assert data["core_configured"] is False
    assert data["forwarded"] is False
    assert data["packet_id"] == "pkt-1"
    assert data["trace_id"] == "trace-abc"


def test_intake_does_not_call_stream_agent_loop(monkeypatch):
    monkeypatch.delenv("NEXUS_CORE_URL", raising=False)
    monkeypatch.setenv("AUTH_ENABLED", "false")
    agent_calls = []

    def _boom(*args, **kwargs):
        agent_calls.append(True)
        raise AssertionError("stream_agent_loop must not be called from Gateway intake")

    monkeypatch.setattr(
        "src.agent_loop.stream_agent_loop", _boom, raising=False
    )
    app = _build_gateway_app()
    with TestClient(app) as client:
        resp = client.post("/api/nexus/v1/intake", json={"hello": "world"})
    assert resp.status_code == 200
    assert not agent_calls


def test_intake_generates_trace_id_when_missing(monkeypatch):
    monkeypatch.delenv("NEXUS_CORE_URL", raising=False)
    monkeypatch.setenv("AUTH_ENABLED", "false")
    app = _build_gateway_app()
    with TestClient(app) as client:
        resp = client.post("/api/nexus/v1/intake", json={"packet_id": "p2"})
    data = resp.json()
    assert data["trace_id"]
    assert isinstance(data["trace_id"], str)


@pytest.mark.asyncio
async def test_forward_intake_to_core(monkeypatch):
    from src.nexus_packets import normalize_nexus_packet

    mod = _reload_client(monkeypatch)
    monkeypatch.setenv("NEXUS_CORE_URL", "http://core.test:9000")
    monkeypatch.setenv("NEXUS_GATEWAY_SHARED_SECRET", "test-secret")

    packet = normalize_nexus_packet({"trace_id": "t1", "data": 1}, created_by="gateway")

    mock_resp = type(
        "R",
        (),
        {
            "status_code": 200,
            "text": '{"ok": true, "packet_id": "core-pkt"}',
            "json": lambda self: {"ok": True, "packet_id": "core-pkt"},
        },
    )()

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch("src.nexus_client.httpx.AsyncClient", return_value=mock_client):
        result = await mod.forward_intake(packet)

    assert result["forwarded"] is True
    assert result["ok"] is True
    assert result["status"] == "forwarded"
    assert result["core_configured"] is True
    mock_client.post.assert_awaited_once()
    call_kwargs = mock_client.post.await_args
    assert call_kwargs[0][0] == "http://core.test:9000/intake"
    sent_body = call_kwargs[1]["json"]
    assert sent_body["trace_id"] == "t1"
    assert sent_body["payload"] == {"data": 1}
    headers = call_kwargs[1]["headers"]
    assert headers[mod.GATEWAY_SECRET_HEADER] == "test-secret"


@pytest.mark.asyncio
async def test_forward_intake_core_unreachable(monkeypatch):
    mod = _reload_client(monkeypatch)
    monkeypatch.setenv("NEXUS_CORE_URL", "http://core.test:9000")

    import httpx

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(side_effect=httpx.ConnectError("refused"))
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    from src.nexus_packets import normalize_nexus_packet

    packet = normalize_nexus_packet({"trace_id": "t2"}, created_by="gateway")
    with patch("src.nexus_client.httpx.AsyncClient", return_value=mock_client):
        result = await mod.forward_intake(packet)

    assert result["ok"] is False
    assert result["status"] == "core_unreachable"
    assert result["forwarded"] is False
    assert "no local execution" in result["message"].lower()


def test_gateway_modules_do_not_import_agent_loop():
    import ast
    from pathlib import Path

    repo = Path(__file__).resolve().parents[1]
    for rel in ("routes/nexus_routes.py", "src/nexus_client.py", "src/nexus_packets.py"):
        tree = ast.parse((repo / rel).read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    assert "agent_loop" not in alias.name
            elif isinstance(node, ast.ImportFrom):
                mod = node.module or ""
                assert "agent_loop" not in mod
                assert "task_scheduler" not in mod
