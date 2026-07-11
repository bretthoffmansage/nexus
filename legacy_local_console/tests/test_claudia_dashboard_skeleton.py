"""Tests for legacy local console dashboard skeleton (Package 9)."""

import ast
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.middleware.base import BaseHTTPMiddleware


REPO = Path(__file__).resolve().parents[1]

FORBIDDEN_DASHBOARD_PATTERNS = (
    "/api/chat_stream",
    "/api/shell",
    "/api/mcp",
    "/api/email/send",
    "/api/calendar",
    "/api/tasks",
    "stream_agent_loop",
    "llm_call_async",
)


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
    from routes.nexus_routes import setup_nexus_routes

    app = FastAPI()
    if middleware_cls:
        app.add_middleware(middleware_cls)
    app.include_router(setup_nexus_routes())
    return app


@pytest.mark.parametrize(
    "path",
    [
        "/api/nexus/v1/workers",
        "/api/nexus/v1/tools",
        "/api/nexus/v1/connectors",
        "/api/nexus/v1/housekeeping",
        "/api/nexus/v1/approvals",
    ],
)
def test_dashboard_placeholder_routes_read_only(monkeypatch, path):
    monkeypatch.delenv("NEXUS_CORE_URL", raising=False)
    monkeypatch.setenv("AUTH_ENABLED", "false")
    app = _build_gateway_app()
    with TestClient(app) as client:
        resp = client.get(path)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "placeholder"
    assert data["read_only"] is True
    assert data["items"] == []


def test_dashboard_placeholder_requires_nexus_read_bearer(monkeypatch):
    monkeypatch.delenv("NEXUS_CORE_URL", raising=False)
    monkeypatch.setenv("AUTH_ENABLED", "true")
    app = _build_gateway_app(_token_middleware(["nexus_intake"]))
    with TestClient(app) as client:
        resp = client.get(
            "/api/nexus/v1/approvals",
            headers={"Authorization": "Bearer ody_fake"},
        )
    assert resp.status_code == 403


def test_health_still_unauthenticated(monkeypatch):
    monkeypatch.delenv("NEXUS_CORE_URL", raising=False)
    app = _build_gateway_app()
    with TestClient(app) as client:
        resp = client.get("/api/nexus/v1/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "gateway_ok"


def test_static_dashboard_files_exist():
    assert (REPO / "static/js/nexusDashboard.js").is_file()
    html = (REPO / "static/index.html").read_text(encoding="utf-8")
    assert "tool-nexus-dashboard-btn" in html
    app_js = (REPO / "static/app.js").read_text(encoding="utf-8")
    assert "nexusDashboard" in app_js


def test_dashboard_js_avoids_dangerous_routes():
    src = (REPO / "static/js/nexusDashboard.js").read_text(encoding="utf-8")
    for pattern in FORBIDDEN_DASHBOARD_PATTERNS:
        assert pattern not in src, f"dashboard must not reference {pattern}"
    assert "/api/nexus/v1" in src
    assert "/approvals/" in src and "/resolve" in src
    assert "method: 'POST'" in src or 'method: "POST"' in src
    for legacy in ("/api/chat_stream", "/api/shell", "/api/tasks/"):
        assert legacy not in src, f"dashboard must not call {legacy}"


def test_nexus_routes_no_agent_imports():
    tree = ast.parse((REPO / "routes/nexus_routes.py").read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            mod = node.module or ""
            assert "agent_loop" not in mod
            assert "task_scheduler" not in mod
