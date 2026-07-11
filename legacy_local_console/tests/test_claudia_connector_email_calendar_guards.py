"""Tests for legacy local console Mode email/calendar connector write guards (Package 11)."""

import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


def _email_send_route(monkeypatch):
    import fastapi.dependencies.utils as dependency_utils
    from routes.email_routes import setup_email_routes

    monkeypatch.setattr(dependency_utils, "ensure_multipart_is_installed", lambda: None)
    router = setup_email_routes()
    for route in router.routes:
        if getattr(route, "endpoint", None) and route.endpoint.__name__ == "send_email":
            return route.endpoint
    raise AssertionError("send_email route not found")


def _calendar_create_route(monkeypatch):
    from routes.calendar_routes import setup_calendar_routes

    router = setup_calendar_routes()
    for route in router.routes:
        if getattr(route, "endpoint", None) and route.endpoint.__name__ == "create_event":
            return route.endpoint
    raise AssertionError("create_event route not found")


def test_connector_write_disabled_shape():
    from src.connector_console_guard import connector_write_disabled

    out = connector_write_disabled("email", "send")
    assert out["status"] == "connector_write_disabled"
    assert out["console_mode"] is True
    assert out["connector"] == "email"
    assert out["ok"] is False


@pytest.mark.asyncio
async def test_send_email_blocked_before_smtp(monkeypatch):
    monkeypatch.setenv("NEXUS_CONSOLE_MODE", "true")
    sys.modules.pop("src.console_mode", None)
    smtp_calls = []

    def _boom(*_a, **_k):
        smtp_calls.append(1)
        raise AssertionError("_send_smtp_message must not run")

    monkeypatch.setattr("routes.email_routes._send_smtp_message", _boom, raising=False)
    monkeypatch.setattr(
        "routes.email_routes._resolve_send_config",
        lambda *_a, **_k: {"from_address": "a@b.com", "account_id": "1"},
        raising=False,
    )

    send_email = _email_send_route(monkeypatch)
    from routes.email_routes import SendEmailRequest

    req = SendEmailRequest(to="x@y.com", subject="hi", body="body")
    bg = MagicMock()
    out = await send_email(req, bg, owner="alice")
    assert out["status"] == "connector_write_disabled"
    assert out["connector"] == "email"
    assert not smtp_calls
    bg.add_task.assert_not_called()


def test_block_connector_write_inactive_when_legacy_mode(monkeypatch):
    monkeypatch.delenv("NEXUS_CONSOLE_MODE", raising=False)
    sys.modules.pop("src.console_mode", None)
    from src.connector_console_guard import block_connector_write

    assert block_connector_write("email", "send") is None


def test_calendar_create_blocked_before_writeback(monkeypatch):
    monkeypatch.setenv("NEXUS_CONSOLE_MODE", "true")
    sys.modules.pop("src.console_mode", None)
    wb_calls = []

    async def _fake_wb(*_a, **_k):
        wb_calls.append(1)

    monkeypatch.setattr("src.caldav_writeback.writeback_event", _fake_wb, raising=False)

    app = FastAPI()
    from routes.calendar_routes import setup_calendar_routes

    app.include_router(setup_calendar_routes())
    with TestClient(app) as client:
        resp = client.post(
            "/api/calendar/events",
            json={
                "summary": "Meeting",
                "dtstart": "2026-06-03T15:00:00",
                "dtend": "2026-06-03T16:00:00",
            },
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "connector_write_disabled"
    assert data["connector"] == "calendar"
    assert not wb_calls


def test_calendar_list_events_still_allowed_in_console_mode(monkeypatch):
    monkeypatch.setenv("NEXUS_CONSOLE_MODE", "true")
    sys.modules.pop("src.console_mode", None)
    monkeypatch.setattr("routes.calendar_routes._require_user", lambda _r: "test-owner")

    app = FastAPI()
    from routes.calendar_routes import setup_calendar_routes

    app.include_router(setup_calendar_routes())
    with TestClient(app) as client:
        resp = client.get(
            "/api/calendar/events",
            params={"start": "2026-01-01", "end": "2026-12-31"},
        )
    assert resp.status_code == 200
    assert "events" in resp.json()


def test_email_poller_disabled_in_console_mode(monkeypatch):
    monkeypatch.setenv("NEXUS_CONSOLE_MODE", "true")
    from routes.email_pollers import _inprocess_pollers_enabled

    assert _inprocess_pollers_enabled() is False


def test_quick_parse_not_globally_disabled(monkeypatch):
    """quick-parse uses LLM for internal date metadata; not a connector write guard target."""
    monkeypatch.setenv("NEXUS_CONSOLE_MODE", "true")
    source = open(
        __import__("pathlib").Path(__file__).resolve().parents[1]
        / "routes/calendar_routes.py",
        encoding="utf-8",
    ).read()
    idx = source.find("async def quick_parse")
    assert idx != -1
    chunk = source[idx : idx + 400]
    assert "_calendar_write_blocked" not in chunk
