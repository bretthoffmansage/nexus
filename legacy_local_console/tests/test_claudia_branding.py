"""Tests for visible Nexus branding (Package 14)."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "static"


def test_login_page_visible_nexus_brand():
    html = (STATIC / "login.html").read_text(encoding="utf-8")
    assert "Nexus" in html
    assert "Nexus — Login" in html
    assert "<span>Nexus</span>" in html
    assert "Odysseus — Login" not in html


def test_manifest_nexus_name():
    import json

    data = json.loads((STATIC / "manifest.json").read_text(encoding="utf-8"))
    assert data["name"] == "Nexus"
    assert data["short_name"] == "Nexus"


def test_index_main_visible_brand():
    html = (STATIC / "index.html").read_text(encoding="utf-8")
    assert "legacy local console" in html
    assert 'sidebar-brand-title">Nexus<' in html
    assert "Message Nexus..." in html
    assert "Nexus Chat" in html
    assert "<title>Odysseus Chat</title>" not in html
    assert 'sidebar-brand-title">Odysseus<' not in html


def test_internal_identifiers_preserved_in_index():
    html = (STATIC / "index.html").read_text(encoding="utf-8")
    assert "odysseus-theme" in html
    assert "_odysseusLoadTime" in html


def test_app_js_chat_placeholder_nexus():
    js = (STATIC / "app.js").read_text(encoding="utf-8")
    assert "Message Nexus..." in js
    assert "Nexus Chat" in js
    assert "startOdysseusApp" in js  # internal function name preserved


def test_odysseus_session_cookie_not_renamed_in_repo():
    """Cookie name remains internal compatibility identifier."""
    text = (ROOT / "routes" / "auth_routes.py").read_text(encoding="utf-8")
    assert 'SESSION_COOKIE = "odysseus_session"' in text
