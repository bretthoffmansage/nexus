"""Tests for Console Mode upload-adjacent processing guards (Package 8B)."""

import asyncio
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException, UploadFile


class _AuthManager:
    is_configured = True

    def __init__(self, admins=()):
        self._admins = set(admins)

    def is_admin(self, user):
        return user in self._admins


class _Request:
    def __init__(self, user=None, auth_manager=None, body=None):
        self.state = SimpleNamespace(current_user=user)
        self.app = SimpleNamespace(state=SimpleNamespace(auth_manager=auth_manager))
        self.client = SimpleNamespace(host="127.0.0.1")
        self._body = body

    async def json(self):
        return self._body


def _upload_endpoints(upload_handler, monkeypatch):
    import fastapi.dependencies.utils as dependency_utils
    from routes.upload_routes import router, setup_upload_routes

    monkeypatch.setattr(dependency_utils, "ensure_multipart_is_installed", lambda: None)
    before = len(router.routes)
    setup_upload_routes(upload_handler)
    routes = router.routes[before:]
    return {route.endpoint.__name__: route.endpoint for route in routes}


def _make_upload_store(tmp_path, monkeypatch):
    from src.upload_handler import UploadHandler
    from src import constants

    upload_dir = tmp_path / "uploads"
    dated = upload_dir / "2026" / "06" / "02"
    dated.mkdir(parents=True)
    alice_id = "a" * 32 + ".png"
    alice_path = dated / alice_id
    alice_path.write_bytes(b"\x89PNG\r\n\x1a\n")
    import json

    index = {
        "alice:h1": {
            "id": alice_id,
            "path": str(alice_path),
            "mime": "image/png",
            "size": alice_path.stat().st_size,
            "name": "alice.png",
            "owner": "alice",
        },
    }
    (upload_dir / "uploads.json").write_text(json.dumps(index), encoding="utf-8")
    monkeypatch.setattr(constants, "UPLOAD_DIR", str(upload_dir))
    return UploadHandler(str(tmp_path), str(upload_dir)), alice_id


def _personal_upload_endpoint(monkeypatch):
    import fastapi.dependencies.utils as dependency_utils
    from routes.personal_routes import setup_personal_routes

    monkeypatch.setattr(dependency_utils, "ensure_multipart_is_installed", lambda: None)
    router = setup_personal_routes(MagicMock(), MagicMock(), True)
    for route in router.routes:
        if route.endpoint.__name__ == "upload_files_to_rag":
            return route.endpoint
    raise AssertionError("personal upload route not found")


@pytest.mark.asyncio
async def test_vision_console_mode_disabled_before_vl(tmp_path, monkeypatch):
    monkeypatch.setenv("NEXUS_CONSOLE_MODE", "true")
    sys.modules.pop("src.console_mode", None)
    handler, alice_id = _make_upload_store(tmp_path, monkeypatch)
    get_vision_text = _upload_endpoints(handler, monkeypatch)["get_vision_text"]

    vl_calls = []

    def _boom(*_a, **_k):
        vl_calls.append(1)
        raise AssertionError("analyze_image_with_vl must not run in Console Mode")

    monkeypatch.setattr(
        "src.document_processor.analyze_image_with_vl", _boom, raising=False
    )

    result = await get_vision_text(
        _Request(user="alice", auth_manager=_AuthManager()),
        alice_id,
        force=1,
    )
    assert result["status"] == "local_processing_disabled"
    assert result["console_mode"] is True
    assert not vl_calls


@pytest.mark.asyncio
async def test_vision_legacy_mode_can_call_vl_mock(tmp_path, monkeypatch):
    monkeypatch.delenv("NEXUS_CONSOLE_MODE", raising=False)
    sys.modules.pop("src.console_mode", None)
    handler, alice_id = _make_upload_store(tmp_path, monkeypatch)
    get_vision_text = _upload_endpoints(handler, monkeypatch)["get_vision_text"]

    vl_calls = []

    def _fake_vl(path):
        vl_calls.append(path)
        return "mock ocr"

    monkeypatch.setattr(
        "src.document_processor.analyze_image_with_vl", _fake_vl, raising=False
    )

    result = await get_vision_text(
        _Request(user="alice", auth_manager=_AuthManager()),
        alice_id,
        force=1,
    )
    assert result["text"] == "mock ocr"
    assert result["cached"] is False
    assert len(vl_calls) == 1


@pytest.mark.asyncio
async def test_personal_upload_console_mode_blocks_indexing(monkeypatch):
    monkeypatch.setenv("NEXUS_CONSOLE_MODE", "true")
    sys.modules.pop("src.console_mode", None)
    upload_files_to_rag = _personal_upload_endpoint(monkeypatch)

    rag = MagicMock()
    rag.add_document = MagicMock(return_value=True)
    rag._split_into_chunks = MagicMock(return_value=["chunk"])

    fake = MagicMock(spec=UploadFile)
    fake.filename = "notes.txt"
    fake.read = AsyncMock(return_value=b"hello world")

    with patch("routes.personal_routes.get_current_user", return_value="alice"), patch(
        "routes.personal_routes.get_rag_manager", return_value=rag
    ):
        result = await upload_files_to_rag(_Request(user="alice"), files=[fake])

    assert result["status"] == "local_processing_disabled"
    rag.add_document.assert_not_called()
    rag._split_into_chunks.assert_not_called()


@pytest.mark.asyncio
async def test_personal_upload_legacy_mode_indexes_with_mock(monkeypatch, tmp_path):
    monkeypatch.delenv("NEXUS_CONSOLE_MODE", raising=False)
    sys.modules.pop("src.console_mode", None)
    monkeypatch.setattr("routes.personal_routes.UPLOADS_DIR", str(tmp_path))
    upload_files_to_rag = _personal_upload_endpoint(monkeypatch)

    rag = MagicMock()
    rag.add_document = MagicMock(return_value=True)
    rag._split_into_chunks = MagicMock(return_value=["one chunk"])

    fake = MagicMock(spec=UploadFile)
    fake.filename = "notes.txt"
    fake.read = AsyncMock(return_value=b"hello world")

    with patch("routes.personal_routes.get_current_user", return_value="alice"), patch(
        "routes.personal_routes.get_rag_manager", return_value=rag
    ):
        result = await upload_files_to_rag(_Request(user="alice"), files=[fake])

    assert result["success"] is True
    rag._split_into_chunks.assert_called()
    rag.add_document.assert_called()


def test_upload_bridge_still_present_in_console_mode(monkeypatch):
    """Regression: Package 8 POST /api/upload bridge unchanged."""
    from src.upload_console_guard import console_mode_vision_disabled
    from src.nexus_upload_bridge import bridge_upload_to_nexus_source

    assert "nexus_source_packet" not in console_mode_vision_disabled()
    assert callable(bridge_upload_to_nexus_source)
