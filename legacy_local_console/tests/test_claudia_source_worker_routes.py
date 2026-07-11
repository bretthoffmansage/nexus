"""Tests for Nexus Gateway source/worker-output and packet list routes (Package 7)."""

import importlib
import sys
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.middleware.base import BaseHTTPMiddleware


def _token_middleware(scopes: list[str]):
    class _Mw(BaseHTTPMiddleware):
        async def dispatch(self, request, call_next):
            request.state.api_token = True
            request.state.api_token_scopes = scopes
            request.state.api_token_owner = "machine-user"
            request.state.current_user = "api"
            return await call_next(request)

    return _Mw


def _build_gateway_app(middleware_cls=None):
    sys.modules.pop("routes.nexus_routes", None)
    sys.modules.pop("src.nexus_client", None)
    from routes.nexus_routes import setup_nexus_routes

    app = FastAPI()
    if middleware_cls:
        app.add_middleware(middleware_cls)
    app.include_router(setup_nexus_routes())
    return app


def test_normalize_source_packet_type():
    from src.nexus_packets import normalize_source_packet

    pkt = normalize_source_packet(
        {
            "route": "email",
            "source_id": "email:thread-1",
            "source_type": "email",
            "content_ref": "s3://bucket/key",
        },
        created_by="worker-a",
    )
    assert pkt["type"] == "source"
    assert pkt["route"] == "email"
    assert pkt["source_id"] == "email:thread-1"
    assert pkt["payload"]["source_type"] == "email"
    assert pkt["payload"]["content_ref"] == "s3://bucket/key"


def test_normalize_worker_output_packet_type():
    from src.nexus_packets import normalize_worker_output_packet

    pkt = normalize_worker_output_packet(
        {
            "route": "task",
            "task_id": "task-99",
            "worker": "research",
            "summary": "done",
        },
        created_by="worker-b",
    )
    assert pkt["type"] == "worker_output"
    assert pkt["payload"]["task_id"] == "task-99"
    assert pkt["payload"]["worker"] == "research"
    assert pkt["payload"]["summary"] == "done"


def test_post_sources_core_unconfigured(monkeypatch):
    monkeypatch.delenv("NEXUS_CORE_URL", raising=False)
    monkeypatch.setenv("AUTH_ENABLED", "false")
    app = _build_gateway_app()
    with TestClient(app) as client:
        resp = client.post(
            "/api/nexus/v1/sources",
            json={
                "route": "ingest",
                "source_type": "file",
                "content_ref": "ref-1",
            },
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is False
    assert data["status"] == "core_not_configured"
    assert data["forwarded"] is False

@pytest.mark.asyncio
async def test_post_sources_normalizes_and_forwards(monkeypatch):
    monkeypatch.setenv("NEXUS_CORE_URL", "http://core.test:9000")
    sys.modules.pop("src.nexus_client", None)
    mod = importlib.import_module("src.nexus_client")

    mock_client = AsyncMock()
    mock_resp = AsyncMock()
    mock_resp.status_code = 200
    mock_resp.json = lambda: {"ok": True, "packet_id": "pkt-src"}
    mock_client.post = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    from src.nexus_packets import normalize_source_packet

    packet = normalize_source_packet(
        {"source_type": "api", "content_ref": "c1"},
        created_by="gateway",
    )

    with patch("src.nexus_client.httpx.AsyncClient", return_value=mock_client):
        result = await mod.forward_source_packet(packet)

    assert result["forwarded"] is True
    call_url = mock_client.post.call_args[0][0]
    assert call_url.endswith("/source-packets")


def test_bearer_intake_can_post_sources(monkeypatch):
    monkeypatch.delenv("NEXUS_CORE_URL", raising=False)
    monkeypatch.setenv("AUTH_ENABLED", "true")
    app = _build_gateway_app(_token_middleware(["nexus_intake"]))
    with TestClient(app) as client:
        resp = client.post(
            "/api/nexus/v1/sources",
            json={"source_type": "x", "content_ref": "y"},
            headers={"Authorization": "Bearer ody_fake"},
        )
    assert resp.status_code == 200
    assert resp.json()["status"] == "core_not_configured"


def test_bearer_worker_required_for_worker_output(monkeypatch):
    monkeypatch.delenv("NEXUS_CORE_URL", raising=False)
    monkeypatch.setenv("AUTH_ENABLED", "true")
    app = _build_gateway_app(_token_middleware(["nexus_worker"]))
    with TestClient(app) as client:
        resp = client.post(
            "/api/nexus/v1/worker-output",
            json={"task_id": "t1", "worker": "w1", "summary": "s"},
            headers={"Authorization": "Bearer ody_fake"},
        )
    assert resp.status_code == 200
    assert resp.json()["status"] == "core_not_configured"


def test_bearer_intake_alone_rejected_for_worker_output(monkeypatch):
    monkeypatch.delenv("NEXUS_CORE_URL", raising=False)
    monkeypatch.setenv("AUTH_ENABLED", "true")
    app = _build_gateway_app(_token_middleware(["nexus_intake"]))
    with TestClient(app) as client:
        resp = client.post(
            "/api/nexus/v1/worker-output",
            json={"task_id": "t1", "worker": "w1", "summary": "s"},
            headers={"Authorization": "Bearer ody_fake"},
        )
    assert resp.status_code == 403
    assert "Nexus worker" in resp.json()["detail"]


def test_bearer_read_required_for_packets_list(monkeypatch):
    monkeypatch.delenv("NEXUS_CORE_URL", raising=False)
    monkeypatch.setenv("AUTH_ENABLED", "true")
    app = _build_gateway_app(_token_middleware(["nexus_read"]))
    with TestClient(app) as client:
        resp = client.get(
            "/api/nexus/v1/packets",
            headers={"Authorization": "Bearer ody_fake"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "core_not_configured"
    assert data["persistence"] is False
    assert data["packets"] == []


def test_bearer_without_read_rejected_for_packets(monkeypatch):
    monkeypatch.delenv("NEXUS_CORE_URL", raising=False)
    monkeypatch.setenv("AUTH_ENABLED", "true")
    app = _build_gateway_app(_token_middleware(["nexus_intake"]))
    with TestClient(app) as client:
        resp = client.get(
            "/api/nexus/v1/packets",
            headers={"Authorization": "Bearer ody_fake"},
        )
    assert resp.status_code == 403
    assert "Nexus read" in resp.json()["detail"]


def test_packet_detail_placeholder(monkeypatch):
    monkeypatch.delenv("NEXUS_CORE_URL", raising=False)
    monkeypatch.setenv("AUTH_ENABLED", "false")
    app = _build_gateway_app()
    with TestClient(app) as client:
        resp = client.get("/api/nexus/v1/packets/pkt-detail-1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["packet_id"] == "pkt-detail-1"
    assert data["status"] == "core_not_configured"
    assert data["persistence"] is False
    assert data["packet"] is None


def test_sources_route_no_agent_loop(monkeypatch):
    monkeypatch.delenv("NEXUS_CORE_URL", raising=False)
    monkeypatch.setenv("AUTH_ENABLED", "false")
    agent_calls = []

    def _boom(*_a, **_k):
        agent_calls.append(True)
        raise AssertionError("stream_agent_loop must not run")

    monkeypatch.setattr("src.agent_loop.stream_agent_loop", _boom, raising=False)
    app = _build_gateway_app()
    with TestClient(app) as client:
        client.post(
            "/api/nexus/v1/sources",
            json={"source_type": "t", "content_ref": "r"},
        )
        client.post(
            "/api/nexus/v1/worker-output",
            json={"task_id": "1", "worker": "w", "summary": "s"},
        )
    assert not agent_calls
