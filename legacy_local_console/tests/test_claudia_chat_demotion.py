"""Tests for Claudia Console Mode chat backend demotion (Package 5)."""

import importlib
import sys
from pathlib import Path

import pytest

_REPO = Path(__file__).resolve().parents[1]
_CHAT_ROUTES = _REPO / "routes" / "chat_routes.py"


def _reload_console_mode(monkeypatch, enabled: bool):
    if enabled:
        monkeypatch.setenv("CLAUDIA_CONSOLE_MODE", "true")
    else:
        monkeypatch.delenv("CLAUDIA_CONSOLE_MODE", raising=False)
    sys.modules.pop("src.console_mode", None)
    return importlib.import_module("src.console_mode")


def test_chat_stream_console_guard_calls_claudia_bridge():
    text = _CHAT_ROUTES.read_text(encoding="utf-8")
    stream_start = text.index("async def chat_stream")
    resume_start = text.index("async def chat_resume", stream_start)
    segment = text[stream_start:resume_start]
    assert "console_mode_chat_stream" in segment
    assert segment.index("console_mode_chat_stream") < segment.index("stream_agent_loop(")


def test_guard_precedes_agent_loop_in_chat_stream_source():
    text = _CHAT_ROUTES.read_text(encoding="utf-8")
    stream_start = text.index("async def chat_stream")
    resume_start = text.index("async def chat_resume", stream_start)
    segment = text[stream_start:resume_start]
    assert "is_claudia_console_mode()" in segment
    guard_pos = segment.index("is_claudia_console_mode()")
    agent_pos = segment.index("stream_agent_loop(")
    assert guard_pos < agent_pos


def test_guard_precedes_llm_call_in_chat_endpoint_source():
    text = _CHAT_ROUTES.read_text(encoding="utf-8")
    ep_start = text.index("async def chat_endpoint")
    stream_start = text.index("async def chat_stream", ep_start)
    segment = text[ep_start:stream_start]
    assert segment.index("is_claudia_console_mode()") < segment.index("llm_call_async(")


def test_console_mode_false_does_not_force_guard(monkeypatch):
    mod = _reload_console_mode(monkeypatch, False)
    assert mod.is_claudia_console_mode() is False


def test_chat_guard_module_has_no_agent_loop_import():
    import ast

    tree = ast.parse((_REPO / "src/claudia_chat_bridge.py").read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            mod = node.module or ""
            assert "agent_loop" not in mod
