"""Tests for legacy local console Mode legacy UI classification (Package 15)."""

import re
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

REPO = Path(__file__).resolve().parents[1]

FORBIDDEN_IN_CONSOLE_MODE_JS = (
    "/api/shell/exec",
    "/api/shell/stream",
    "/api/research/start",
    "/api/memory/add",
    "stream_agent_loop",
    "llm_call_async",
)


def test_health_includes_console_mode_flag(monkeypatch):
    monkeypatch.setenv("NEXUS_CONSOLE_MODE", "true")
    sys.modules.pop("src.console_mode", None)
    sys.modules.pop("routes.nexus_routes", None)
    from routes.nexus_routes import setup_nexus_routes

    app = FastAPI()
    app.include_router(setup_nexus_routes())
    with TestClient(app) as client:
        resp = client.get("/api/nexus/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("console_mode") is True


def test_health_console_mode_false_when_legacy(monkeypatch):
    monkeypatch.delenv("NEXUS_CONSOLE_MODE", raising=False)
    sys.modules.pop("src.console_mode", None)
    sys.modules.pop("routes.nexus_routes", None)
    from routes.nexus_routes import setup_nexus_routes

    app = FastAPI()
    app.include_router(setup_nexus_routes())
    with TestClient(app) as client:
        resp = client.get("/api/nexus/v1/health")
    assert resp.json().get("console_mode") is False


def test_console_mode_module_exists():
    path = REPO / "static/js/nexusConsoleMode.js"
    assert path.is_file()
    src = path.read_text(encoding="utf-8")
    assert "fetchConsoleModeFlag" in src
    assert "/api/nexus/v1/health" in src
    for forbidden in FORBIDDEN_IN_CONSOLE_MODE_JS:
        assert forbidden not in src, f"console mode module must not call {forbidden}"


def test_console_mode_css_hides_execution_controls():
    css = (REPO / "static/style.css").read_text(encoding="utf-8")
    assert "body.nexus-console-mode #bash-toggle-btn" in css
    assert "nexus-console-mode-banner" in css
    assert "nexus-console-mode-banner-dismiss" in css


def test_console_mode_banner_dismiss_wiring():
    src = (REPO / "static/js/nexusConsoleMode.js").read_text(encoding="utf-8")
    assert "_bannerDismissed" in src
    assert "isConsoleModeBannerDismissed" in src
    assert "nexus-console-mode-banner-dismiss" in src
    assert 'aria-label="Dismiss console mode banner"' in src
    assert "_dismissConsoleModeBanner" in src
    assert "banner.remove()" in src
    assert "localStorage" not in src
    assert "sessionStorage" not in src


def test_app_imports_console_mode_module():
    app_js = (REPO / "static/app.js").read_text(encoding="utf-8")
    assert "nexusConsoleMode" in app_js
    assert "initNexusConsoleMode" in app_js


def test_landing_page_nexus_branding():
    html = (REPO / "static/landing.html").read_text(encoding="utf-8")
    assert "Nexus — A Self-Hosted AI Workspace" in html
    assert "<title>Odysseus" not in html


def test_primary_index_still_nexus_branded():
    html = (REPO / "static/index.html").read_text(encoding="utf-8")
    assert "legacy local console" in html
    assert 'sidebar-brand-title">Nexus<' in html
