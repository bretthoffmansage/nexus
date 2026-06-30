"""Tests for Package 19 — final authority hardening in Claudia Console Mode."""

import asyncio
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


def _admin_request():
    req = SimpleNamespace()
    req.state = SimpleNamespace(current_user="admin")
    req.app = SimpleNamespace(state=SimpleNamespace(auth_manager=MagicMock(is_admin=lambda u: True)))
    req.headers = {}
    return req


@pytest.mark.asyncio
async def test_task_run_blocked_before_scheduler(monkeypatch):
    monkeypatch.setenv("CLAUDIA_CONSOLE_MODE", "true")
    sys.modules.pop("src.console_mode", None)

    scheduler = MagicMock()
    scheduler.run_task_now = AsyncMock(side_effect=AssertionError("run_task_now must not run"))

    from routes.task_routes import setup_task_routes

    router = setup_task_routes(scheduler)
    run_route = next(
        r.endpoint for r in router.routes if getattr(r.endpoint, "__name__", "") == "run_task_now"
    )
    out = await run_route(_admin_request(), "task-1", False)
    assert out["status"] == "local_execution_disabled"
    assert out["surface"] == "tasks"
    scheduler.run_task_now.assert_not_called()


@pytest.mark.asyncio
async def test_assistant_run_blocked_before_scheduler(monkeypatch):
    monkeypatch.setenv("CLAUDIA_CONSOLE_MODE", "true")
    sys.modules.pop("src.console_mode", None)

    scheduler = MagicMock()
    scheduler.run_task_now = AsyncMock(side_effect=AssertionError("run_task_now must not run"))

    from routes.assistant_routes import setup_assistant_routes

    router = setup_assistant_routes(scheduler)
    run_route = next(
        r.endpoint for r in router.routes if getattr(r.endpoint, "__name__", "") == "run_check_in_now"
    )
    out = await run_route("t1", _admin_request())
    assert out["status"] == "local_execution_disabled"
    assert out["surface"] == "assistant"
    scheduler.run_task_now.assert_not_called()


@pytest.mark.asyncio
async def test_cookbook_download_blocked_before_subprocess(monkeypatch):
    monkeypatch.setenv("CLAUDIA_CONSOLE_MODE", "true")
    sys.modules.pop("src.console_mode", None)

    from routes.cookbook_routes import setup_cookbook_routes, ModelDownloadRequest

    router = setup_cookbook_routes()
    download_route = next(
        r.endpoint for r in router.routes if getattr(r.endpoint, "__name__", "") == "model_download"
    )
    req = ModelDownloadRequest(repo_id="org/model")
    with patch("routes.cookbook_routes.asyncio.create_subprocess_exec", side_effect=AssertionError("subprocess")):
        with patch("routes.cookbook_routes.require_admin", return_value=None):
            out = await download_route(_admin_request(), req)
    assert out["status"] == "local_execution_disabled"
    assert out["surface"] == "cookbook"


def test_gallery_inpaint_blocked_before_provider_call(monkeypatch):
    monkeypatch.setenv("CLAUDIA_CONSOLE_MODE", "true")
    sys.modules.pop("src.console_mode", None)

    from routes.gallery_routes import setup_gallery_routes

    app = FastAPI()
    app.include_router(setup_gallery_routes())
    with TestClient(app) as client:
        with patch("routes.gallery_routes.require_privilege", return_value="admin"):
            resp = client.post("/api/image/inpaint", json={"prompt": "test"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "authority_disabled"
    assert data["surface"] == "gallery"


def test_gallery_library_read_allowed_in_console_mode(monkeypatch):
    monkeypatch.setenv("CLAUDIA_CONSOLE_MODE", "true")
    sys.modules.pop("src.console_mode", None)

    from routes.gallery_routes import setup_gallery_routes

    db = MagicMock()
    q = db.query.return_value
    q.filter.return_value = q
    q.outerjoin.return_value = q
    q.order_by.return_value = q
    q.offset.return_value = q
    q.limit.return_value = q
    q.distinct.return_value = q
    q.count.return_value = 0
    q.all.return_value = []

    app = FastAPI()
    app.include_router(setup_gallery_routes())
    with TestClient(app) as client:
        with patch("routes.gallery_routes.SessionLocal", return_value=db):
            with patch("routes.gallery_routes.get_current_user", return_value="admin"):
                resp = client.get("/api/gallery/library")
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert data.get("status") != "authority_disabled"


@pytest.mark.asyncio
async def test_document_restore_blocked_before_db_write(monkeypatch):
    monkeypatch.setenv("CLAUDIA_CONSOLE_MODE", "true")
    sys.modules.pop("src.console_mode", None)

    from routes.document_routes import setup_document_routes

    router = setup_document_routes(session_manager=MagicMock())
    restore_route = next(
        r.endpoint for r in router.routes if getattr(r.endpoint, "__name__", "") == "restore_version"
    )
    req = _admin_request()
    with patch("routes.document_routes.SessionLocal", side_effect=AssertionError("SessionLocal")):
        out = await restore_route(req, "doc-1", 1)
    assert out["status"] == "local_execution_disabled"
    assert out["surface"] == "file"


@pytest.mark.asyncio
async def test_stream_agent_loop_blocked_in_console_mode(monkeypatch):
    monkeypatch.setenv("CLAUDIA_CONSOLE_MODE", "true")
    sys.modules.pop("src.console_mode", None)
    sys.modules.pop("src.agent_loop", None)

    from src.agent_loop import stream_agent_loop

    chunks = []
    async for chunk in stream_agent_loop("http://x", "m", []):
        chunks.append(chunk)
    body = "".join(chunks)
    assert "local_execution_disabled" in body
    assert "[DONE]" in body


@pytest.mark.asyncio
async def test_execute_tool_block_blocked_in_console_mode(monkeypatch):
    monkeypatch.setenv("CLAUDIA_CONSOLE_MODE", "true")
    sys.modules.pop("src.console_mode", None)

    from src.tool_execution import execute_tool_block

    block = SimpleNamespace(tool_type="bash", content="echo hi")
    desc, result = await execute_tool_block(block)
    assert "blocked" in desc
    assert result.get("exit_code") == 1
    assert "local_execution_disabled" in result.get("status", "")


@pytest.mark.asyncio
async def test_mcp_connect_all_skipped_when_console_mode(monkeypatch):
    monkeypatch.setenv("CLAUDIA_CONSOLE_MODE", "true")
    sys.modules.pop("src.console_mode", None)

    mgr = MagicMock()
    mgr.connect_all_enabled = AsyncMock(side_effect=AssertionError("connect_all_enabled"))

    async def _startup_connect():
        from src.console_mode import is_claudia_console_mode

        if not is_claudia_console_mode():
            await mgr.connect_all_enabled()

    await _startup_connect()
    mgr.connect_all_enabled.assert_not_called()
