"""Tests for Claudia Gateway packet normalization (Package 4)."""

import importlib
import sys
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.claudia_packets import PacketNormalizeError, normalize_claudia_packet


def test_fully_formed_packet_preserved():
    body = {
        "packet_id": "pkt-keep",
        "type": "message",
        "route": "slack:channel-1",
        "source_id": "slack:U123",
        "reply_channel": {"kind": "slack", "id": "C1"},
        "payload": {"text": "hello"},
        "created_by": "operator",
        "created_at": "2026-01-01T00:00:00Z",
        "workspace": "ws-main",
        "priority": "high",
        "permissions": {"read": True},
        "status": "accepted",
        "parent_packet_id": "pkt-parent",
        "trace_id": "trace-keep",
        "audit_required": False,
    }
    out = normalize_claudia_packet(body, created_by="ignored")
    assert out["packet_id"] == "pkt-keep"
    assert out["trace_id"] == "trace-keep"
    assert out["route"] == "slack:channel-1"
    assert out["source_id"] == "slack:U123"
    assert out["reply_channel"] == {"kind": "slack", "id": "C1"}
    assert out["payload"] == {"text": "hello"}
    assert out["type"] == "message"
    assert out["priority"] == "high"
    assert out["status"] == "accepted"
    assert out["audit_required"] is False
    assert out["parent_packet_id"] == "pkt-parent"


def test_missing_packet_id_and_trace_id_generated():
    out = normalize_claudia_packet({"payload": {"x": 1}}, created_by="alice")
    assert out["packet_id"]
    assert out["trace_id"]
    assert len(out["packet_id"]) >= 32
    assert out["type"] == "task"
    assert out["status"] == "new"
    assert out["priority"] == "normal"
    assert out["audit_required"] is True


def test_non_envelope_keys_become_payload():
    out = normalize_claudia_packet({"hello": "world", "count": 2}, created_by="gateway")
    assert out["payload"] == {"hello": "world", "count": 2}


def test_route_source_fallback_documented():
    out = normalize_claudia_packet({"payload": {}}, created_by="gateway")
    assert out["route"] == "gateway"
    assert out["source_id"] == f"gateway:{out['packet_id']}"


def test_created_by_from_actor():
    out = normalize_claudia_packet({"payload": {}}, created_by="brett@example.com")
    assert out["created_by"] == "brett@example.com"


def test_invalid_type_rejected():
    with pytest.raises(PacketNormalizeError, match="type"):
        normalize_claudia_packet({"type": "not_a_real_type"})


def test_invalid_priority_rejected():
    with pytest.raises(PacketNormalizeError, match="priority"):
        normalize_claudia_packet({"priority": "critical"})


def test_invalid_status_rejected():
    with pytest.raises(PacketNormalizeError, match="status"):
        normalize_claudia_packet({"status": "unknown"})


def test_invalid_payload_type_rejected():
    with pytest.raises(PacketNormalizeError, match="payload"):
        normalize_claudia_packet({"payload": "not-an-object"})


def _build_gateway_app():
    sys.modules.pop("routes.claudia_routes", None)
    from routes.claudia_routes import setup_claudia_routes

    app = FastAPI()
    app.include_router(setup_claudia_routes())
    return app


def test_intake_validation_error_422(monkeypatch):
    monkeypatch.delenv("CLAUDIA_CORE_URL", raising=False)
    monkeypatch.setenv("AUTH_ENABLED", "false")
    app = _build_gateway_app()
    with TestClient(app) as client:
        resp = client.post("/api/claudia/v1/intake", json={"type": "bogus"})
    assert resp.status_code == 422
    assert resp.json()["detail"]["status"] == "validation_error"


def test_intake_core_unconfigured_returns_normalized_ids(monkeypatch):
    monkeypatch.delenv("CLAUDIA_CORE_URL", raising=False)
    monkeypatch.setenv("AUTH_ENABLED", "false")
    app = _build_gateway_app()
    with TestClient(app) as client:
        resp = client.post("/api/claudia/v1/intake", json={"payload": {"a": 1}})
    data = resp.json()
    assert data["packet_id"]
    assert data["trace_id"]
    assert data["status"] == "core_not_configured"


@pytest.mark.asyncio
async def test_forward_sends_normalized_packet(monkeypatch):
    monkeypatch.setenv("CLAUDIA_CORE_URL", "http://core.test:9000")
    sys.modules.pop("src.claudia_client", None)
    mod = importlib.import_module("src.claudia_client")

    normalized = normalize_claudia_packet(
        {
            "packet_id": "pkt-n",
            "trace_id": "tr-n",
            "route": "custom:route",
            "payload": {"k": "v"},
        },
        created_by="machine",
    )

    mock_resp = type(
        "R",
        (),
        {
            "status_code": 200,
            "text": "{}",
            "json": lambda self: {"ok": True},
        },
    )()
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch("src.claudia_client.httpx.AsyncClient", return_value=mock_client):
        await mod.forward_intake(normalized)

    sent = mock_client.post.await_args[1]["json"]
    assert sent["packet_id"] == "pkt-n"
    assert sent["route"] == "custom:route"
    assert sent["type"] == "task"
    assert sent["payload"] == {"k": "v"}
    assert "created_at" in sent


def test_packets_module_does_not_import_agent_loop():
    import ast
    from pathlib import Path

    tree = ast.parse(
        (Path(__file__).resolve().parents[1] / "src/claudia_packets.py").read_text(
            encoding="utf-8"
        )
    )
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            mod = node.module or ""
            assert "agent_loop" not in mod
            assert "task_scheduler" not in mod
