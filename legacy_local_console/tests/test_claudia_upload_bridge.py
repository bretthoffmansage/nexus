"""Tests for Console Mode upload → Claudia source packet bridge (Package 8)."""

import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import UploadFile


def _upload_endpoints(upload_handler, monkeypatch):
    import fastapi.dependencies.utils as dependency_utils
    from routes.upload_routes import router, setup_upload_routes

    monkeypatch.setattr(dependency_utils, "ensure_multipart_is_installed", lambda: None)
    before = len(router.routes)
    setup_upload_routes(upload_handler)
    routes = router.routes[before:]
    return {route.endpoint.__name__: route.endpoint for route in routes}


class _Request:
    def __init__(self, user="alice"):
        self.state = SimpleNamespace(
            api_token=False,
            current_user=user,
            api_token_owner=None,
        )
        self.client = SimpleNamespace(host="127.0.0.1")
        self.app = SimpleNamespace(state=SimpleNamespace(auth_manager=None))


def test_create_upload_source_packet_fields():
    from src.claudia_packets import create_upload_source_packet

    pkt = create_upload_source_packet(
        upload_id="abc123def4567890abcdef1234567890.png",
        filename="doc.pdf",
        mime="application/pdf",
        size=1024,
        file_hash="sha256:deadbeef",
        created_by="alice",
        upload_response={"id": "abc123def4567890abcdef1234567890.png", "name": "doc.pdf"},
    )
    assert pkt["type"] == "source"
    assert pkt["route"] == "upload"
    assert pkt["source_id"] == "upload:abc123def4567890abcdef1234567890.png"
    assert pkt["reply_channel"] == {
        "route": "upload",
        "upload_id": "abc123def4567890abcdef1234567890.png",
    }
    assert pkt["payload"]["source_type"] == "file_upload"
    assert pkt["payload"]["content_ref"] == "upload:abc123def4567890abcdef1234567890.png"
    assert pkt["payload"]["filename"] == "doc.pdf"
    assert pkt["payload"]["mime_type"] == "application/pdf"
    assert pkt["payload"]["size"] == 1024
    assert pkt["payload"]["hash"] == "sha256:deadbeef"
    assert pkt["audit_required"] is True
    assert pkt["created_by"] == "alice"


@pytest.mark.asyncio
async def test_bridge_core_unconfigured(monkeypatch):
    monkeypatch.delenv("CLAUDIA_CORE_URL", raising=False)
    sys.modules.pop("src.claudia_client", None)
    from src.claudia_upload_bridge import bridge_upload_to_claudia_source

    meta = {
        "id": "f" * 32,
        "name": "t.txt",
        "mime": "text/plain",
        "size": 3,
        "hash": "h1",
        "uploaded_at": "2026-06-02T00:00:00Z",
    }
    status = await bridge_upload_to_claudia_source(meta, created_by="alice")
    assert status["ok"] is False
    assert status["status"] == "core_not_configured"
    assert status["forwarded"] is False
    assert status["core_configured"] is False


@pytest.mark.asyncio
async def test_api_upload_console_mode_adds_claudia_source_packet(monkeypatch):
    monkeypatch.setenv("CLAUDIA_CONSOLE_MODE", "true")
    monkeypatch.delenv("CLAUDIA_CORE_URL", raising=False)
    sys.modules.pop("src.console_mode", None)

    handler = MagicMock()
    meta = {
        "id": "a" * 32 + ".txt",
        "name": "hello.txt",
        "mime": "text/plain",
        "size": 5,
        "hash": "abc",
        "uploaded_at": "2026-06-02T00:00:00Z",
        "is_duplicate": False,
    }
    handler.save_upload = MagicMock(return_value=meta)
    handler.max_concurrent_uploads = 10
    handler.upload_rate_log = {}

    endpoints = _upload_endpoints(handler, monkeypatch)
    api_upload = endpoints["api_upload"]

    fake_file = MagicMock(spec=UploadFile)
    fake_file.filename = "hello.txt"

    with patch("routes.upload_routes.get_current_user", return_value="alice"):
        resp = await api_upload(_Request(), files=[fake_file])

    assert "files" in resp
    assert len(resp["files"]) == 1
    f0 = resp["files"][0]
    assert f0["id"] == meta["id"]
    assert "claudia_source_packet" in f0
    csp = f0["claudia_source_packet"]
    assert csp["status"] == "core_not_configured"
    assert csp["forwarded"] is False


@pytest.mark.asyncio
async def test_api_upload_legacy_mode_unchanged_shape(monkeypatch):
    monkeypatch.delenv("CLAUDIA_CONSOLE_MODE", raising=False)
    sys.modules.pop("src.console_mode", None)

    handler = MagicMock()
    meta = {
        "id": "b" * 32,
        "name": "x.bin",
        "mime": "application/octet-stream",
        "size": 1,
        "hash": "h",
        "uploaded_at": "2026-06-02T00:00:00Z",
    }
    handler.save_upload = MagicMock(return_value=meta)
    handler.max_concurrent_uploads = 10
    handler.upload_rate_log = {}

    endpoints = _upload_endpoints(handler, monkeypatch)
    api_upload = endpoints["api_upload"]
    fake_file = MagicMock(spec=UploadFile)

    with patch("routes.upload_routes.get_current_user", return_value="bob"):
        resp = await api_upload(_Request(), files=[fake_file])

    assert "claudia_source_packet" not in resp["files"][0]


@pytest.mark.asyncio
async def test_api_upload_forwards_source_packet(monkeypatch):
    monkeypatch.setenv("CLAUDIA_CONSOLE_MODE", "true")
    monkeypatch.setenv("CLAUDIA_CORE_URL", "http://core.test:9000")
    sys.modules.pop("src.console_mode", None)

    handler = MagicMock()
    meta = {
        "id": "c" * 32,
        "name": "data.csv",
        "mime": "text/csv",
        "size": 10,
        "hash": "hh",
        "uploaded_at": "2026-06-02T00:00:00Z",
    }
    handler.save_upload = MagicMock(return_value=meta)
    handler.max_concurrent_uploads = 10
    handler.upload_rate_log = {}

    forwarded_packets = []

    async def _fake_forward(packet):
        forwarded_packets.append(packet)
        return {
            "ok": True,
            "status": "forwarded",
            "message": "ok",
            "packet_id": packet["packet_id"],
            "trace_id": packet["trace_id"],
            "core_configured": True,
            "forwarded": True,
            "source_path": "source-packets",
        }

    endpoints = _upload_endpoints(handler, monkeypatch)
    api_upload = endpoints["api_upload"]

    with patch("routes.upload_routes.get_current_user", return_value="alice"), patch(
        "src.claudia_upload_bridge.forward_source_packet", _fake_forward
    ):
        resp = await api_upload(_Request(), files=[MagicMock(spec=UploadFile)])

    assert forwarded_packets
    pkt = forwarded_packets[0]
    assert pkt["type"] == "source"
    assert pkt["route"] == "upload"
    assert pkt["payload"]["source_type"] == "file_upload"
    assert resp["files"][0]["claudia_source_packet"]["forwarded"] is True


@pytest.mark.asyncio
async def test_api_upload_no_agent_loop(monkeypatch):
    monkeypatch.setenv("CLAUDIA_CONSOLE_MODE", "true")
    monkeypatch.delenv("CLAUDIA_CORE_URL", raising=False)
    sys.modules.pop("src.console_mode", None)

    agent_calls = []

    def _boom(*_a, **_k):
        agent_calls.append(1)
        raise AssertionError("stream_agent_loop must not run from upload bridge")

    monkeypatch.setattr("src.agent_loop.stream_agent_loop", _boom, raising=False)

    handler = MagicMock()
    handler.save_upload = MagicMock(
        return_value={
            "id": "d" * 32,
            "name": "f.txt",
            "mime": "text/plain",
            "size": 1,
            "hash": "x",
            "uploaded_at": "2026-06-02T00:00:00Z",
        }
    )
    handler.max_concurrent_uploads = 10
    handler.upload_rate_log = {}

    endpoints = _upload_endpoints(handler, monkeypatch)
    with patch("routes.upload_routes.get_current_user", return_value="u"):
        await endpoints["api_upload"](_Request(), files=[MagicMock(spec=UploadFile)])

    assert not agent_calls


def test_upload_bridge_modules_avoid_agent_loop():
    import ast
    from pathlib import Path

    repo = Path(__file__).resolve().parents[1]
    for rel in ("routes/upload_routes.py", "src/claudia_upload_bridge.py"):
        tree = ast.parse((repo / rel).read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    assert "agent_loop" not in alias.name
            elif isinstance(node, ast.ImportFrom):
                mod = node.module or ""
                assert "agent_loop" not in mod
                assert "task_scheduler" not in mod
