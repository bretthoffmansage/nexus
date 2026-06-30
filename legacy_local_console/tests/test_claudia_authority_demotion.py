"""Tests for Claudia Console Mode memory/skills/model authority demotion (Package 13)."""

import asyncio
import sys
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


def test_authority_disabled_shape():
    from src.authority_console_guard import authority_disabled

    out = authority_disabled("memory", "add")
    assert out["status"] == "authority_disabled"
    assert out["claudia_console_mode"] is True
    assert out["surface"] == "memory"
    assert out["ok"] is False


@pytest.mark.asyncio
async def test_memory_add_blocked_before_mutation(monkeypatch):
    monkeypatch.setenv("CLAUDIA_CONSOLE_MODE", "true")
    sys.modules.pop("src.console_mode", None)

    mm = MagicMock()
    mm.add_entry.side_effect = AssertionError("add_entry must not run")
    sm = MagicMock()

    from routes.memory_routes import setup_memory_routes
    from src.request_models import MemoryAddRequest

    router = setup_memory_routes(mm, sm)
    add_route = next(
        r.endpoint for r in router.routes if getattr(r.endpoint, "__name__", "") == "api_add_memory"
    )
    req = SimpleNamespace()
    req.state = SimpleNamespace(current_user="alice")
    body = MemoryAddRequest(text="remember this", category="fact", source="user")
    out = await add_route(req, body)
    assert out["status"] == "authority_disabled"
    assert out["surface"] == "memory"
    mm.add_entry.assert_not_called()


def test_memory_list_allowed_in_console_mode(monkeypatch):
    monkeypatch.setenv("CLAUDIA_CONSOLE_MODE", "true")
    sys.modules.pop("src.console_mode", None)

    mm = MagicMock()
    mm.load.return_value = [{"id": "1", "text": "fact", "owner": "alice"}]
    sm = MagicMock()

    from routes.memory_routes import setup_memory_routes

    router = setup_memory_routes(mm, sm)
    get_route = next(
        r.endpoint for r in router.routes if getattr(r.endpoint, "__name__", "") == "api_get_memory"
    )
    req = SimpleNamespace()
    req.state = SimpleNamespace(current_user="alice")
    out = get_route(req)
    assert "memory" in out
    mm.load.assert_called_once()


@pytest.mark.asyncio
async def test_skill_add_blocked_before_mutation(monkeypatch):
    monkeypatch.setenv("CLAUDIA_CONSOLE_MODE", "true")
    sys.modules.pop("src.console_mode", None)

    mgr = MagicMock()
    mgr.add_skill.side_effect = AssertionError("add_skill must not run")

    from routes.skills_routes import setup_skills_routes, SkillAddRequest

    router = setup_skills_routes(mgr)
    add_route = next(
        r.endpoint for r in router.routes if getattr(r.endpoint, "__name__", "") == "add_skill"
    )
    req = SimpleNamespace()
    req.state = SimpleNamespace(current_user="alice")
    body = SkillAddRequest(name="test-skill", description="d", category="general")
    out = await add_route(req, body)
    assert out["status"] == "authority_disabled"
    assert out["surface"] == "skills"
    mgr.add_skill.assert_not_called()


@pytest.mark.asyncio
async def test_skills_list_allowed_in_console_mode(monkeypatch):
    monkeypatch.setenv("CLAUDIA_CONSOLE_MODE", "true")
    sys.modules.pop("src.console_mode", None)

    mgr = MagicMock()
    mgr.load.return_value = [{"name": "s1", "owner": "alice"}]

    from routes.skills_routes import setup_skills_routes

    router = setup_skills_routes(mgr)
    list_route = next(
        r.endpoint for r in router.routes if getattr(r.endpoint, "__name__", "") == "list_skills"
    )
    req = SimpleNamespace()
    req.state = SimpleNamespace(current_user="alice")
    out = await list_route(req)
    assert out["count"] == 1
    mgr.load.assert_called_once()


@pytest.mark.asyncio
async def test_email_ai_reply_blocked_before_llm(monkeypatch):
    monkeypatch.setenv("CLAUDIA_CONSOLE_MODE", "true")
    sys.modules.pop("src.console_mode", None)

    async def _boom(*_a, **_k):
        raise AssertionError("llm_call_async must not run")

    monkeypatch.setattr("src.llm_core.llm_call_async", _boom)
    monkeypatch.setattr("src.llm_core.llm_call_async_with_fallback", _boom)

    import fastapi.dependencies.utils as dependency_utils
    from routes.email_routes import setup_email_routes

    monkeypatch.setattr(dependency_utils, "ensure_multipart_is_installed", lambda: None)
    router = setup_email_routes()
    ai_reply = next(
        r.endpoint for r in router.routes if getattr(r, "endpoint", None) and r.endpoint.__name__ == "ai_reply"
    )
    out = await ai_reply(
        {"original_body": "hello", "subject": "hi", "to": "a@b.com"},
        owner="alice",
    )
    assert out["status"] == "authority_disabled"
    assert out["surface"] == "llm_assist"


def test_block_authority_inactive_when_legacy_mode(monkeypatch):
    monkeypatch.delenv("CLAUDIA_CONSOLE_MODE", raising=False)
    sys.modules.pop("src.console_mode", None)
    from src.authority_console_guard import block_authority

    assert block_authority("memory", "add") is None


def test_ollama_model_routes_still_importable():
    """Ollama/model admin modules remain present (not removed in P13)."""
    import routes.model_routes  # noqa: F401
    import routes.cookbook_routes  # noqa: F401
    src = open(routes.model_routes.__file__, encoding="utf-8").read()
    assert "ollama" in src.lower() or "11434" in src
