"""Tests for visible Claudia branding (Package 14)."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "static"


def test_login_page_visible_claudia_brand():
    html = (STATIC / "login.html").read_text(encoding="utf-8")
    assert "Claudia" in html
    assert "Claudia — Login" in html
    assert "<span>Claudia</span>" in html
    assert "Odysseus — Login" not in html


def test_manifest_claudia_name():
    import json

    data = json.loads((STATIC / "manifest.json").read_text(encoding="utf-8"))
    assert data["name"] == "Claudia"
    assert data["short_name"] == "Claudia"


def test_index_main_visible_brand():
    html = (STATIC / "index.html").read_text(encoding="utf-8")
    assert "Claudia Console" in html
    assert 'sidebar-brand-title">Claudia<' in html
    assert "Message Claudia..." in html
    assert "Claudia Chat" in html
    assert "<title>Odysseus Chat</title>" not in html
    assert 'sidebar-brand-title">Odysseus<' not in html


def test_internal_identifiers_preserved_in_index():
    html = (STATIC / "index.html").read_text(encoding="utf-8")
    assert "odysseus-theme" in html
    assert "_odysseusLoadTime" in html


def test_app_js_chat_placeholder_claudia():
    js = (STATIC / "app.js").read_text(encoding="utf-8")
    assert "Message Claudia..." in js
    assert "Claudia Chat" in js
    assert "startOdysseusApp" in js  # internal function name preserved


def test_odysseus_session_cookie_not_renamed_in_repo():
    """Cookie name remains internal compatibility identifier."""
    text = (ROOT / "routes" / "auth_routes.py").read_text(encoding="utf-8")
    assert 'SESSION_COOKIE = "odysseus_session"' in text
