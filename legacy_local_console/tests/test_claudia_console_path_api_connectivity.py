"""Console path / Core API connectivity verification (standalone layout pass)."""

import importlib
import re
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

REPO = Path(__file__).resolve().parents[1]
REFORM = REPO / "docs/console_reform"

CONSOLE_PATH = "/Users/bretthoffman/Documents/console"
CORE_PATH = "/Users/bretthoffman/Documents/system"
CORE_API_URL = "http://127.0.0.1:8080"

NESTED_OLD_PATH_PATTERNS = (
    r"/Users/bretthoffman/Documents/nexus/system",
    r"/Users/bretthoffman/Documents/nexus/console",
    r"/Users/bretthoffman/Documents/Nexus/system",
    r"/Users/bretthoffman/Documents/Nexus/console",
    r"Documents/nexus/system",
    r"Documents/nexus/console",
    r"cd ~/Documents/nexus/system",
    r"cd ~/Documents/nexus/console",
)

ACTIVE_OPERATOR_FILES = (
    REPO / "README.md",
    REPO / "start-macos.sh",
    REPO / ".env.example",
    REFORM / "NEXUS_CONSOLE_OPERATOR_HANDOFF.md",
    REFORM / "final_console_gateway_checklist.md",
    REFORM / "private_pwa_deployment_hardening.md",
    REFORM / "package_20_final_safety_audit_operator_handoff.md",
    REPO / "scripts/README.md",
    REPO / "docker/README.md",
    REPO / "launch-windows.ps1",
    REPO / "SECURITY.md",
    REPO / "THREAT_MODEL.md",
)

COMPAT_FILES_NO_NESTED_PATH = (
    REPO / "Dockerfile",
    REPO / "docker-compose.yml",
)

VERIFICATION_NOTE = REFORM / "console_path_api_connectivity_verification.md"


def _has_nested_old_path(text: str) -> bool:
    return any(re.search(p, text) for p in NESTED_OLD_PATH_PATTERNS)


@pytest.mark.parametrize("path", ACTIVE_OPERATOR_FILES + COMPAT_FILES_NO_NESTED_PATH, ids=lambda p: p.name)
def test_active_operator_files_have_no_nested_old_paths(path):
    assert path.is_file(), f"missing active file: {path}"
    text = path.read_text(encoding="utf-8")
    assert not _has_nested_old_path(text), f"{path} still references nested nexus/ layout"


@pytest.mark.parametrize("path", ACTIVE_OPERATOR_FILES, ids=lambda p: p.name)
def test_active_operator_files_document_console_path(path):
    text = path.read_text(encoding="utf-8")
    assert CONSOLE_PATH in text, f"{path} should document {CONSOLE_PATH}"


def test_env_example_documents_core_api_default_port():
    text = (REPO / ".env.example").read_text(encoding="utf-8")
    assert CORE_API_URL in text
    assert CONSOLE_PATH in text


def test_handoff_documents_core_path_and_api_url():
    text = (REFORM / "NEXUS_CONSOLE_OPERATOR_HANDOFF.md").read_text(encoding="utf-8")
    assert CORE_PATH in text
    assert CORE_API_URL in text


def test_start_macos_repo_relative_no_nested_paths():
    text = (REPO / "start-macos.sh").read_text(encoding="utf-8")
    assert 'REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"' in text
    assert not _has_nested_old_path(text)
    assert CONSOLE_PATH in text


def test_verification_implementation_note_exists():
    assert VERIFICATION_NOTE.is_file()
    body = VERIFICATION_NOTE.read_text(encoding="utf-8")
    assert "Path compatibility matrix" in body
    assert "Gateway-to-Core API connectivity matrix" in body
    assert CONSOLE_PATH in body
    assert CORE_PATH in body


def test_bridge_package_notes_may_retain_nested_paths_as_historical():
    """Bridge integration notes record the temporary nested workspace layout."""
    bridge_notes = sorted(REFORM.glob("package_bridge_*.md"))
    assert bridge_notes, "expected bridge package notes"
    with_nested = [p.name for p in bridge_notes if _has_nested_old_path(p.read_text(encoding="utf-8"))]
    assert with_nested, "bridge notes should retain nested paths as historical record"


def _reload_client(monkeypatch):
    monkeypatch.delenv("NEXUS_GATEWAY_SHARED_SECRET", raising=False)
    sys.modules.pop("src.nexus_client", None)
    return importlib.import_module("src.nexus_client")


def _mock_post_sequence(responses: list):
    """Build AsyncMock client whose post() returns each response in order."""
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(side_effect=responses)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    return mock_client


def _resp(status_code: int, body: dict | None = None):
    return type(
        "R",
        (),
        {
            "status_code": status_code,
            "text": str(body or {}),
            "json": lambda self, b=body: b or {},
        },
    )()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "forward_fn,primary_path,key",
    [
        ("forward_source_packet", "/source-packets", "source_path"),
        ("forward_worker_output", "/worker-outputs", "worker_output_path"),
        ("forward_message", "/messages", "message_path"),
    ],
)
async def test_core_404_falls_back_to_intake(monkeypatch, forward_fn, primary_path, key):
    mod = _reload_client(monkeypatch)
    monkeypatch.setenv("NEXUS_CORE_URL", CORE_API_URL)

    from src.nexus_packets import (
        create_chat_message_packet,
        normalize_source_packet,
        normalize_worker_output_packet,
    )

    if forward_fn == "forward_source_packet":
        packet = normalize_source_packet(
            {"source_type": "file", "content_ref": "ref-1"},
            created_by="gateway",
        )
    elif forward_fn == "forward_worker_output":
        packet = normalize_worker_output_packet(
            {"task_id": "t1", "worker": "w1", "summary": "done"},
            created_by="gateway",
        )
    else:
        packet = create_chat_message_packet("hi", session_id="s1", created_by="gateway")

    mock_client = _mock_post_sequence(
        [
            _resp(404, {"detail": "not found"}),
            _resp(200, {"ok": True, "packet_id": "pkt-fallback"}),
        ]
    )

    with patch("src.nexus_client.httpx.AsyncClient", return_value=mock_client):
        result = await getattr(mod, forward_fn)(packet)

    assert result["forwarded"] is True
    assert result[key] == "intake_fallback"
    urls = [call[0][0] for call in mock_client.post.await_args_list]
    assert urls[0].endswith(primary_path)
    assert urls[1].endswith("/intake")


@pytest.mark.asyncio
async def test_list_approvals_honest_placeholder_when_core_missing(monkeypatch):
    mod = _reload_client(monkeypatch)
    monkeypatch.setenv("NEXUS_CORE_URL", CORE_API_URL)

    mock_client = AsyncMock()
    mock_resp = _resp(404, {"detail": "not implemented"})
    mock_client.get = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch("src.nexus_client.httpx.AsyncClient", return_value=mock_client):
        result = await mod.list_approvals()

    assert result["surface"] == "approvals"
    assert result["status"] == "placeholder"
    assert result["approvals"] == []
    assert result["pending_count"] == 0
    assert "unavailable" in result["message"].lower()


@pytest.mark.asyncio
async def test_probe_core_health_targets_health_endpoint(monkeypatch):
    mod = _reload_client(monkeypatch)
    monkeypatch.setenv("NEXUS_CORE_URL", CORE_API_URL)

    mock_client = AsyncMock()
    mock_resp = _resp(200, {"ok": True, "service": "nexus-core"})
    mock_client.get = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch("src.nexus_client.httpx.AsyncClient", return_value=mock_client):
        reachable, err, body = await mod.probe_core_health()

    assert reachable is True
    assert err is None
    assert body == {"ok": True, "service": "nexus-core"}
    assert mock_client.get.await_args[0][0] == f"{CORE_API_URL}/health"
