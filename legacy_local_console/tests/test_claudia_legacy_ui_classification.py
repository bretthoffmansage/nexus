"""Tests for Claudia Console Mode legacy UI classification (Package 15)."""

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


def test_health_includes_claudia_console_mode_flag(monkeypatch):
    monkeypatch.setenv("CLAUDIA_CONSOLE_MODE", "true")
    sys.modules.pop("src.console_mode", None)
    sys.modules.pop("routes.claudia_routes", None)
    from routes.claudia_routes import setup_claudia_routes

    app = FastAPI()
    app.include_router(setup_claudia_routes())
    with TestClient(app) as client:
        resp = client.get("/api/claudia/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("claudia_console_mode") is True


def test_health_console_mode_false_when_legacy(monkeypatch):
    monkeypatch.delenv("CLAUDIA_CONSOLE_MODE", raising=False)
    sys.modules.pop("src.console_mode", None)
    sys.modules.pop("routes.claudia_routes", None)
    from routes.claudia_routes import setup_claudia_routes

    app = FastAPI()
    app.include_router(setup_claudia_routes())
    with TestClient(app) as client:
        resp = client.get("/api/claudia/v1/health")
    assert resp.json().get("claudia_console_mode") is False


def test_claudia_console_mode_module_exists():
    path = REPO / "static/js/claudiaConsoleMode.js"
    assert path.is_file()
    src = path.read_text(encoding="utf-8")
    assert "fetchConsoleModeFlag" in src
    assert "/api/claudia/v1/health" in src
    for forbidden in FORBIDDEN_IN_CONSOLE_MODE_JS:
        assert forbidden not in src, f"console mode module must not call {forbidden}"


def test_console_mode_css_hides_execution_controls():
    css = (REPO / "static/style.css").read_text(encoding="utf-8")
    assert "body.claudia-console-mode #bash-toggle-btn" in css
    assert "claudia-console-mode-banner" in css
    assert "claudia-console-mode-banner-dismiss" in css


def test_console_mode_banner_dismiss_wiring():
    src = (REPO / "static/js/claudiaConsoleMode.js").read_text(encoding="utf-8")
    assert "_bannerDismissed" in src
    assert "isConsoleModeBannerDismissed" in src
    assert "claudia-console-mode-banner-dismiss" in src
    assert 'aria-label="Dismiss console mode banner"' in src
    assert "_dismissConsoleModeBanner" in src
    assert "banner.remove()" in src
    assert "localStorage" not in src
    assert "sessionStorage" not in src


def test_app_imports_console_mode_module():
    app_js = (REPO / "static/app.js").read_text(encoding="utf-8")
    assert "claudiaConsoleMode" in app_js
    assert "initClaudiaConsoleMode" in app_js


def test_landing_page_claudia_branding():
    html = (REPO / "static/landing.html").read_text(encoding="utf-8")
    assert "Claudia — A Self-Hosted AI Workspace" in html
    assert "<title>Odysseus" not in html


def test_primary_index_still_claudia_branded():
    html = (REPO / "static/index.html").read_text(encoding="utf-8")
    assert "Claudia Console" in html
    assert 'sidebar-brand-title">Claudia<' in html
