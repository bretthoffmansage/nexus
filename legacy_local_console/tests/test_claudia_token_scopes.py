"""Tests for Nexus API token scopes (Package 3)."""

import sys
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI, HTTPException
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


def _session_middleware(username: str):
    class _Mw(BaseHTTPMiddleware):
        async def dispatch(self, request, call_next):
            request.state.api_token = False
            request.state.current_user = username
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


def test_validate_scopes_csv_accepts_nexus_intake():
  from src.nexus_scopes import validate_scopes_csv

  assert validate_scopes_csv("nexus_intake") == "nexus_intake"
  assert validate_scopes_csv("chat,nexus_intake") == "chat,nexus_intake"


def test_validate_scopes_csv_rejects_unknown():
  from src.nexus_scopes import validate_scopes_csv

  with pytest.raises(ValueError, match="Unknown"):
    validate_scopes_csv("nexus_intake,superadmin")


def test_bearer_nexus_intake_can_post_intake(monkeypatch):
  monkeypatch.delenv("NEXUS_CORE_URL", raising=False)
  monkeypatch.setenv("AUTH_ENABLED", "true")
  app = _build_gateway_app(_token_middleware(["nexus_intake"]))
  with TestClient(app) as client:
    resp = client.post(
      "/api/nexus/v1/intake",
      json={"packet_id": "p1"},
      headers={"Authorization": "Bearer ody_fake"},
    )
  assert resp.status_code == 200
  assert resp.json()["status"] == "core_not_configured"


def test_bearer_without_nexus_intake_rejected(monkeypatch):
  monkeypatch.delenv("NEXUS_CORE_URL", raising=False)
  monkeypatch.setenv("AUTH_ENABLED", "true")
  app = _build_gateway_app(_token_middleware(["chat"]))
  with TestClient(app) as client:
    resp = client.post(
      "/api/nexus/v1/intake",
      json={"packet_id": "p1"},
      headers={"Authorization": "Bearer ody_fake"},
    )
  assert resp.status_code == 403
  assert "Nexus intake" in resp.json()["detail"]


def test_session_user_can_post_intake(monkeypatch):
  monkeypatch.delenv("NEXUS_CORE_URL", raising=False)
  monkeypatch.setenv("AUTH_ENABLED", "true")
  app = _build_gateway_app(_session_middleware("brett@poweredbysage.com"))
  with TestClient(app) as client:
    resp = client.post("/api/nexus/v1/intake", json={"trace_id": "t1"})
  assert resp.status_code == 200


def test_nexus_intake_does_not_satisfy_legacy_chat_scope():
  from src.nexus_scopes import SCOPE_CHAT, SCOPE_NEXUS_INTAKE

  scopes = {SCOPE_NEXUS_INTAKE}
  assert SCOPE_CHAT not in scopes


def test_require_legacy_chat_rejects_nexus_intake_only():
  from src.nexus_scopes import require_legacy_chat_api_token

  req = SimpleNamespace(
    state=SimpleNamespace(
      api_token=True,
      api_token_scopes=["nexus_intake"],
    )
  )
  with pytest.raises(HTTPException) as exc:
    require_legacy_chat_api_token(req)
  assert exc.value.status_code == 403
  assert "chat" in exc.value.detail.lower()


def test_require_legacy_chat_accepts_chat_scope():
  from src.nexus_scopes import require_legacy_chat_api_token

  req = SimpleNamespace(
    state=SimpleNamespace(
      api_token=True,
      api_token_scopes=["chat"],
    )
  )
  require_legacy_chat_api_token(req)


def test_health_remains_unauthenticated_without_middleware(monkeypatch):
  monkeypatch.delenv("NEXUS_CORE_URL", raising=False)
  app = _build_gateway_app()
  with TestClient(app) as client:
    resp = client.get("/api/nexus/v1/health")
  assert resp.status_code == 200
