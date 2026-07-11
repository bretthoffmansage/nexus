"""Tests for Nexus Gateway approval queue routes (Package 10)."""

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


def test_get_approvals_core_unconfigured_placeholder(monkeypatch):
    monkeypatch.delenv("NEXUS_CORE_URL", raising=False)
    monkeypatch.setenv("AUTH_ENABLED", "false")
    app = _build_gateway_app()
    with TestClient(app) as client:
        resp = client.get("/api/nexus/v1/approvals")
    assert resp.status_code == 200
    data = resp.json()
    assert data["surface"] == "approvals"
    assert data["pending_count"] == 0
    assert data["approvals"] == []


def test_get_approvals_requires_nexus_read_bearer(monkeypatch):
    monkeypatch.delenv("NEXUS_CORE_URL", raising=False)
    monkeypatch.setenv("AUTH_ENABLED", "true")
    app = _build_gateway_app(_token_middleware(["nexus_intake"]))
    with TestClient(app) as client:
        resp = client.get(
            "/api/nexus/v1/approvals",
            headers={"Authorization": "Bearer ody_fake"},
        )
    assert resp.status_code == 403


def test_resolve_requires_nexus_admin_bearer(monkeypatch):
    monkeypatch.delenv("NEXUS_CORE_URL", raising=False)
    monkeypatch.setenv("AUTH_ENABLED", "true")
    app = _build_gateway_app(_token_middleware(["nexus_read"]))
    with TestClient(app) as client:
        resp = client.post(
            "/api/nexus/v1/approvals/apr-1/resolve",
            json={"decision": "approved"},
            headers={"Authorization": "Bearer ody_fake"},
        )
    assert resp.status_code == 403
    assert "Nexus admin" in resp.json()["detail"]


def test_resolve_accepts_nexus_admin_when_core_unconfigured(monkeypatch):
    monkeypatch.delenv("NEXUS_CORE_URL", raising=False)
    monkeypatch.setenv("AUTH_ENABLED", "true")
    app = _build_gateway_app(_token_middleware(["nexus_admin"]))
    with TestClient(app) as client:
        resp = client.post(
            "/api/nexus/v1/approvals/apr-99/resolve",
            json={"decision": "rejected", "reason": "test"},
            headers={"Authorization": "Bearer ody_fake"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "core_not_configured"
    assert data["forwarded"] is False
    assert data["decision"] == "rejected"
    assert data["approval_id"] == "apr-99"


def test_resolve_rejects_invalid_decision(monkeypatch):
    monkeypatch.setenv("AUTH_ENABLED", "false")
    app = _build_gateway_app()
    with TestClient(app) as client:
        resp = client.post(
            "/api/nexus/v1/approvals/apr-1/resolve",
            json={"decision": "maybe"},
        )
    assert resp.status_code == 422


def test_resolve_rejects_missing_decision(monkeypatch):
    monkeypatch.setenv("AUTH_ENABLED", "false")
    app = _build_gateway_app()
    with TestClient(app) as client:
        resp = client.post(
            "/api/nexus/v1/approvals/apr-1/resolve",
            json={},
        )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_resolve_forwards_to_core_path(monkeypatch):
    monkeypatch.setenv("NEXUS_CORE_URL", "http://core.test:9000")
    sys.modules.pop("src.nexus_client", None)
    mod = importlib.import_module("src.nexus_client")

    mock_client = AsyncMock()
    mock_resp = AsyncMock()
    mock_resp.status_code = 200
    mock_resp.json = lambda: {"ok": True, "approval_id": "apr-1"}
    mock_client.post = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    resolution = {
        "approval_id": "apr-1",
        "decision": "approved",
        "resolved_by": "alice",
        "route": "approvals",
    }
    with patch("src.nexus_client.httpx.AsyncClient", return_value=mock_client):
        result = await mod.resolve_approval("apr-1", resolution)

    assert result["forwarded"] is True
    call_url = mock_client.post.call_args[0][0]
    assert call_url.endswith("/approvals/apr-1/resolve")
    posted = mock_client.post.call_args[1]["json"]
    assert posted["decision"] == "approved"


def test_build_approval_resolution_fields():
    from src.nexus_approvals import build_approval_resolution

    out = build_approval_resolution(
        {
            "decision": "needs_changes",
            "reason": "more info",
            "packet_id": "pkt-1",
            "trace_id": "tr-1",
        },
        approval_id="apr-42",
        resolved_by="brett@example.com",
    )
    assert out["decision"] == "needs_changes"
    assert out["resolved_by"] == "brett@example.com"
    assert out["packet_id"] == "pkt-1"
    assert out["trace_id"] == "tr-1"


def test_resolve_does_not_call_agent_loop(monkeypatch):
    monkeypatch.delenv("NEXUS_CORE_URL", raising=False)
    monkeypatch.setenv("AUTH_ENABLED", "false")
    agent_calls = []

    def _boom(*_a, **_k):
        agent_calls.append(1)
        raise AssertionError("stream_agent_loop must not run")

    monkeypatch.setattr("src.agent_loop.stream_agent_loop", _boom, raising=False)
    app = _build_gateway_app()
    with TestClient(app) as client:
        client.post(
            "/api/nexus/v1/approvals/x/resolve",
            json={"decision": "cancelled"},
        )
    assert not agent_calls
