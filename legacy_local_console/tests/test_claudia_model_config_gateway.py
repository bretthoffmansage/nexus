"""Tests for Claudia Gateway model-config routes (Core Hermes model relay)."""

import ast
import importlib
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.middleware.base import BaseHTTPMiddleware

REPO = Path(__file__).resolve().parents[1]


def _token_middleware(scopes: list[str]):
    class _Mw(BaseHTTPMiddleware):
        async def dispatch(self, request, call_next):
            request.state.api_token = True
            request.state.api_token_scopes = scopes
            request.state.current_user = "api"
            return await call_next(request)

    return _Mw


def _build_gateway_app(middleware_cls=None):
    sys.modules.pop("routes.claudia_routes", None)
    sys.modules.pop("src.claudia_client", None)
    from routes.claudia_routes import setup_claudia_routes

    app = FastAPI()
    if middleware_cls:
        app.add_middleware(middleware_cls)
    app.include_router(setup_claudia_routes())
    return app


def test_get_model_config_core_unconfigured(monkeypatch):
    monkeypatch.delenv("CLAUDIA_CORE_URL", raising=False)
    monkeypatch.setenv("AUTH_ENABLED", "false")
    app = _build_gateway_app()
    with TestClient(app) as client:
        resp = client.get("/api/claudia/v1/model-config")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is False
    assert data["status"] == "core_not_configured"
    assert data["core_configured"] is False
    assert data["available_models"] == []


def test_get_model_config_requires_claudia_read_bearer(monkeypatch):
    monkeypatch.delenv("CLAUDIA_CORE_URL", raising=False)
    monkeypatch.setenv("AUTH_ENABLED", "true")
    app = _build_gateway_app(_token_middleware(["claudia_intake"]))
    with TestClient(app) as client:
        resp = client.get(
            "/api/claudia/v1/model-config",
            headers={"Authorization": "Bearer ody_fake"},
        )
    assert resp.status_code == 403


def test_post_model_config_requires_claudia_admin_bearer(monkeypatch):
    monkeypatch.delenv("CLAUDIA_CORE_URL", raising=False)
    monkeypatch.setenv("AUTH_ENABLED", "true")
    app = _build_gateway_app(_token_middleware(["claudia_read"]))
    with TestClient(app) as client:
        resp = client.post(
            "/api/claudia/v1/model-config",
            json={"model": "anthropic/claude-opus-4.6"},
            headers={"Authorization": "Bearer ody_fake"},
        )
    assert resp.status_code == 403
    assert "Claudia admin" in resp.json()["detail"]


def test_post_model_config_rejects_missing_model(monkeypatch):
    monkeypatch.setenv("AUTH_ENABLED", "false")
    app = _build_gateway_app()
    with TestClient(app) as client:
        resp = client.post("/api/claudia/v1/model-config", json={})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_get_model_config_forwards_to_core(monkeypatch):
    monkeypatch.setenv("CLAUDIA_CORE_URL", "http://core.test:8080")
    sys.modules.pop("src.claudia_client", None)
    mod = importlib.import_module("src.claudia_client")

    core_payload = {
        "ok": True,
        "status": "ok",
        "model": "anthropic/claude-opus-4.6",
        "available_models": [
            {"id": "anthropic/claude-opus-4.6", "label": "Claude Opus 4.6", "current": True},
        ],
    }
    mock_client = AsyncMock()
    mock_resp = type(
        "R",
        (),
        {
            "status_code": 200,
            "text": str(core_payload),
            "json": lambda self: core_payload,
        },
    )()
    mock_client.get = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch("src.claudia_client.httpx.AsyncClient", return_value=mock_client):
        result = await mod.get_model_config()

    assert result["forwarded"] is True
    assert result["model"] == "anthropic/claude-opus-4.6"
    assert len(result["available_models"]) == 1
    assert mock_client.get.await_args[0][0] == "http://core.test:8080/model-config"


@pytest.mark.asyncio
async def test_update_model_config_forwards_to_core(monkeypatch):
    monkeypatch.setenv("CLAUDIA_CORE_URL", "http://core.test:8080")
    sys.modules.pop("src.claudia_client", None)
    mod = importlib.import_module("src.claudia_client")

    core_payload = {
        "ok": True,
        "status": "updated",
        "model": "openai/gpt-4.1",
        "available_models": [{"id": "openai/gpt-4.1", "label": "GPT-4.1", "current": True}],
    }
    mock_client = AsyncMock()
    mock_resp = type(
        "R",
        (),
        {
            "status_code": 200,
            "text": str(core_payload),
            "json": lambda self: core_payload,
        },
    )()
    mock_client.post = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch("src.claudia_client.httpx.AsyncClient", return_value=mock_client):
        result = await mod.update_model_config("openai/gpt-4.1")

    assert result["forwarded"] is True
    assert result["model"] == "openai/gpt-4.1"
    call_kwargs = mock_client.post.await_args
    assert call_kwargs[0][0] == "http://core.test:8080/model-config"
    assert call_kwargs[1]["json"] == {"model": "openai/gpt-4.1"}


def test_gateway_does_not_import_hermes_config_modules():
    for rel in ("routes/claudia_routes.py", "src/claudia_client.py"):
        tree = ast.parse((REPO / rel).read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    assert "hermes" not in alias.name.lower()
                    assert "model_config" not in alias.name
            elif isinstance(node, ast.ImportFrom):
                mod = (node.module or "").lower()
                assert "hermes" not in mod
                assert "model_config" not in mod


def test_gateway_client_does_not_reference_hermes_yaml_path():
    text = (REPO / "src/claudia_client.py").read_text(encoding="utf-8")
    assert ".hermes" not in text
    assert "config.yaml" not in text
