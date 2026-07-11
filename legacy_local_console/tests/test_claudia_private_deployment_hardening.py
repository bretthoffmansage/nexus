"""Tests for Nexus private/PWA deployment hardening (Package 16)."""

import importlib
import re
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

REPO = Path(__file__).resolve().parents[1]
PRIVATE_GUIDE = REPO / "docs/console_reform/private_pwa_deployment_hardening.md"
ENV_EXAMPLE = REPO / ".env.example"
DASHBOARD_JS = REPO / "static/js/nexusDashboard.js"


def _reload_posture():
    """Reload posture module after monkeypatch env changes (do not clear env here)."""
    sys.modules.pop("src.nexus_deployment_posture", None)
    sys.modules.pop("src.nexus_client", None)
    sys.modules.pop("src.console_mode", None)
    return importlib.import_module("src.nexus_deployment_posture")


def _build_gateway_app():
    sys.modules.pop("routes.nexus_routes", None)
    sys.modules.pop("src.nexus_deployment_posture", None)
    from routes.nexus_routes import setup_nexus_routes

    app = FastAPI()
    app.include_router(setup_nexus_routes())
    return app


def test_private_deployment_guide_exists_with_key_phrases():
    assert PRIVATE_GUIDE.is_file()
    text = PRIVATE_GUIDE.read_text(encoding="utf-8").lower()
    for phrase in (
        "tailscale",
        "pwa",
        "auth_enabled",
        "localhost_bypass",
        "console_mode",
        "nexus_core_url",
        "ollama",
        "public internet",
        "127.0.0.1",
    ):
        assert phrase in text, f"missing phrase in guide: {phrase}"


def test_env_example_has_nexus_private_deployment_guidance():
    text = ENV_EXAMPLE.read_text(encoding="utf-8")
    assert "private_pwa_deployment_hardening.md" in text
    assert "NEXUS_CONSOLE_MODE" in text
    assert "NEXUS_CORE_URL" in text
    assert "NEXUS_GATEWAY_SHARED_SECRET" in text
    assert "AUTH_ENABLED" in text
    assert "LOCALHOST_BYPASS" in text
    assert "Tailscale" in text or "tailscale" in text.lower()
    # placeholders only — no realistic secret patterns
    assert not re.search(r"sk-[A-Za-z0-9]{20,}", text)


def test_collect_warnings_auth_disabled(monkeypatch):
    monkeypatch.delenv("NEXUS_CORE_URL", raising=False)
    monkeypatch.setenv("AUTH_ENABLED", "false")
    mod = _reload_posture()
    codes = [w["code"] for w in mod.collect_deployment_warnings()]
    assert "auth_disabled" in codes


def test_collect_warnings_localhost_bypass(monkeypatch):
    monkeypatch.setenv("LOCALHOST_BYPASS", "true")
    mod = _reload_posture()
    codes = [w["code"] for w in mod.collect_deployment_warnings()]
    assert "localhost_bypass_enabled" in codes


def test_collect_warnings_bind_all_interfaces(monkeypatch):
    monkeypatch.setenv("APP_BIND", "0.0.0.0")
    mod = _reload_posture()
    codes = [w["code"] for w in mod.collect_deployment_warnings()]
    assert "bind_all_interfaces" in codes


def test_collect_warnings_gateway_secret_missing(monkeypatch):
    monkeypatch.setenv("NEXUS_CORE_URL", "http://127.0.0.1:8080")
    monkeypatch.delenv("NEXUS_GATEWAY_SHARED_SECRET", raising=False)
    mod = _reload_posture()
    codes = [w["code"] for w in mod.collect_deployment_warnings()]
    assert "gateway_secret_missing" in codes


def test_collect_warnings_core_url_public(monkeypatch):
    monkeypatch.setenv("NEXUS_CORE_URL", "https://core.example.com")
    monkeypatch.setenv("NEXUS_GATEWAY_SHARED_SECRET", "test-secret")
    mod = _reload_posture()
    codes = [w["code"] for w in mod.collect_deployment_warnings()]
    assert "core_url_public_or_unknown" in codes


def test_warnings_never_include_secret_values(monkeypatch):
    secret = "super-secret-gateway-value-xyz"
    monkeypatch.setenv("NEXUS_CORE_URL", "http://127.0.0.1:8080")
    monkeypatch.setenv("NEXUS_GATEWAY_SHARED_SECRET", secret)
    mod = _reload_posture()
    blob = str(mod.collect_deployment_warnings())
    assert secret not in blob
    assert "NEXUS_GATEWAY_SHARED_SECRET" not in blob


def test_health_includes_deployment_warnings(monkeypatch):
    monkeypatch.delenv("NEXUS_CORE_URL", raising=False)
    monkeypatch.setenv("AUTH_ENABLED", "false")
    sys.modules.pop("src.nexus_deployment_posture", None)
    app = _build_gateway_app()
    with TestClient(app) as client:
        resp = client.get("/api/nexus/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert "deployment_warnings" in data
    assert isinstance(data["deployment_warnings"], list)
    assert any(w.get("code") == "auth_disabled" for w in data["deployment_warnings"])


def test_health_warnings_do_not_expose_gateway_secret(monkeypatch):
    monkeypatch.setenv("NEXUS_CORE_URL", "http://127.0.0.1:8080")
    monkeypatch.setenv("NEXUS_GATEWAY_SHARED_SECRET", "leaked-if-in-response")
    app = _build_gateway_app()
    with TestClient(app) as client:
        resp = client.get("/api/nexus/v1/health")
    assert "leaked-if-in-response" not in resp.text
    assert "NEXUS_GATEWAY_SHARED_SECRET" not in resp.text


def test_dashboard_renders_deployment_warnings_read_only():
    text = DASHBOARD_JS.read_text(encoding="utf-8")
    assert "deployment_warnings" in text
    assert "_renderDeploymentWarnings" in text
    assert "/api/chat_stream" not in text
    assert "/api/shell" not in text
