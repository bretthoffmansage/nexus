"""Tests for Claudia Console Mode shell/MCP/research/file execution guards (Package 12)."""

import asyncio
import json
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


def _shell_route(monkeypatch, endpoint_name: str):
    from routes.shell_routes import setup_shell_routes

    router = setup_shell_routes()
    for route in router.routes:
        ep = getattr(route, "endpoint", None)
        if ep and ep.__name__ == endpoint_name:
            return ep
    raise AssertionError(f"{endpoint_name} route not found")


def _mcp_route(endpoint_name: str):
    from routes.mcp_routes import setup_mcp_routes

    mgr = MagicMock()
    router = setup_mcp_routes(mgr)
    for route in router.routes:
        ep = getattr(route, "endpoint", None)
        if ep and ep.__name__ == endpoint_name:
            return ep, mgr
    raise AssertionError(f"{endpoint_name} route not found")


def _research_route(endpoint_name: str):
    from routes.research_routes import setup_research_routes

    rh = MagicMock()
    rh._active_tasks = {}
    router = setup_research_routes(rh)
    for route in router.routes:
        ep = getattr(route, "endpoint", None)
        if ep and ep.__name__ == endpoint_name:
            return ep, rh
    raise AssertionError(f"{endpoint_name} route not found")


def _admin_request():
    req = SimpleNamespace()
    req.state = SimpleNamespace(current_user="admin")
    req.app = SimpleNamespace(state=SimpleNamespace(auth_manager=MagicMock(is_admin=lambda u: True)))
    req.headers = {}
    return req


def test_local_execution_disabled_shape():
    from src.execution_console_guard import local_execution_disabled

    out = local_execution_disabled("shell", "exec")
    assert out["status"] == "local_execution_disabled"
    assert out["claudia_console_mode"] is True
    assert out["surface"] == "shell"
    assert out["ok"] is False


@pytest.mark.asyncio
async def test_shell_exec_blocked_before_subprocess(monkeypatch):
    monkeypatch.setenv("CLAUDIA_CONSOLE_MODE", "true")
    sys.modules.pop("src.console_mode", None)

    async def _boom(*_a, **_k):
        raise AssertionError("_exec_shell must not run")

    monkeypatch.setattr("routes.shell_routes._exec_shell", _boom)

    from routes.shell_routes import ShellExecRequest

    shell_exec = _shell_route(monkeypatch, "shell_exec")
    req = ShellExecRequest(command="echo hi")
    out = await shell_exec(_admin_request(), req)
    assert out["status"] == "local_execution_disabled"
    assert out["surface"] == "shell"
    assert out["operation"] == "exec"


@pytest.mark.asyncio
async def test_shell_stream_blocked_before_subprocess(monkeypatch):
    monkeypatch.setenv("CLAUDIA_CONSOLE_MODE", "true")
    sys.modules.pop("src.console_mode", None)

    shell_stream = _shell_route(monkeypatch, "shell_stream")
    from routes.shell_routes import ShellExecRequest

    resp = await shell_stream(_admin_request(), ShellExecRequest(command="echo hi"))
    chunks = []
    async for chunk in resp.body_iterator:
        chunks.append(chunk.decode() if isinstance(chunk, bytes) else chunk)
    body = "".join(chunks)
    assert "local_execution_disabled" in body
    assert "[DONE]" in body


@pytest.mark.asyncio
async def test_mcp_add_server_blocked_before_connect(monkeypatch):
    monkeypatch.setenv("CLAUDIA_CONSOLE_MODE", "true")
    sys.modules.pop("src.console_mode", None)

    add_server, mgr = _mcp_route("add_server")
    mgr.connect_server = AsyncMock(side_effect=AssertionError("connect_server must not run"))

    request = MagicMock()
    with patch("routes.mcp_routes.require_admin", return_value=None):
        out = await add_server(
            request,
            name="test",
            transport="stdio",
            command="echo",
            args="[]",
            env="{}",
            url=None,
            oauth_file=None,
            oauth_config=None,
        )
    assert out["status"] == "local_execution_disabled"
    assert out["surface"] == "mcp"
    mgr.connect_server.assert_not_called()


@pytest.mark.asyncio
async def test_research_start_blocked_before_handler(monkeypatch):
    monkeypatch.setenv("CLAUDIA_CONSOLE_MODE", "true")
    sys.modules.pop("src.console_mode", None)

    research_start, rh = _research_route("research_start")
    from routes.research_routes import setup_research_routes

    class Body:
        query = "test topic"
        max_rounds = 0
        search_provider = None
        endpoint_id = None
        model = None
        max_time = 300
        extraction_timeout = None
        extraction_concurrency = None
        category = None

    request = MagicMock()
    out = await research_start(Body(), request)
    assert out["status"] == "local_execution_disabled"
    assert out["surface"] == "research"
    rh.start_research.assert_not_called()


def test_research_status_still_allowed_in_console_mode(monkeypatch):
    monkeypatch.setenv("CLAUDIA_CONSOLE_MODE", "true")
    sys.modules.pop("src.console_mode", None)

    rh = MagicMock()
    rh._active_tasks = {"x": {"owner": "alice", "status": "running"}}
    rh.get_status.return_value = {"status": "running", "progress": {}}

    from routes.research_routes import setup_research_routes

    router = setup_research_routes(rh)
    target = next(
        r.endpoint for r in router.routes if getattr(r, "path", "") == "/api/research/status/{session_id}"
    )
    req = SimpleNamespace()
    req.state = SimpleNamespace(current_user="alice")
    req.client = SimpleNamespace(host="127.0.0.1")
    out = asyncio.run(target(session_id="x", request=req))
    assert out["status"] == "running"


def test_mcp_list_servers_still_allowed_in_console_mode(monkeypatch):
    monkeypatch.setenv("CLAUDIA_CONSOLE_MODE", "true")
    sys.modules.pop("src.console_mode", None)

    mgr = MagicMock()
    mgr.get_server_status.return_value = {"status": "disconnected", "tool_count": 0}

    app = FastAPI()
    from routes.mcp_routes import setup_mcp_routes

    app.include_router(setup_mcp_routes(mgr))

    with patch("routes.mcp_routes.require_admin", return_value=None), patch(
        "routes.mcp_routes.SessionLocal"
    ) as mock_session:
        db = MagicMock()
        db.query.return_value.all.return_value = []
        mock_session.return_value = db

        with TestClient(app) as client:
            resp = client.get("/api/mcp/servers")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_block_local_execution_inactive_when_legacy_mode(monkeypatch):
    monkeypatch.delenv("CLAUDIA_CONSOLE_MODE", raising=False)
    sys.modules.pop("src.console_mode", None)
    from src.execution_console_guard import block_local_execution

    assert block_local_execution("shell", "exec") is None
