"""Unit tests for legacy local console Mode env gates (Package 1)."""

import importlib
import sys

import pytest


def _load_console_mode():
    """Import console_mode fresh so env changes apply."""
    sys.modules.pop("src.console_mode", None)
    return importlib.import_module("src.console_mode")


def test_console_mode_unset_is_legacy(monkeypatch):
    mod = _load_console_mode()
    monkeypatch.delenv("NEXUS_CONSOLE_MODE", raising=False)
    assert mod.is_console_mode() is False


@pytest.mark.parametrize("on", ("1", "true", "yes", "on", "TRUE", "On"))
def test_console_mode_enabled_values(monkeypatch, on):
    mod = _load_console_mode()
    monkeypatch.setenv("NEXUS_CONSOLE_MODE", on)
    assert mod.is_console_mode() is True


@pytest.mark.parametrize("off", ("0", "false", "no", "off", "", "maybe"))
def test_console_mode_disabled_values(monkeypatch, off):
    mod = _load_console_mode()
    monkeypatch.setenv("NEXUS_CONSOLE_MODE", off)
    assert mod.is_console_mode() is False


def test_console_mode_forces_tasks_off_even_when_inprocess_on(monkeypatch):
    mod = _load_console_mode()
    monkeypatch.setenv("NEXUS_CONSOLE_MODE", "true")
    monkeypatch.setenv("ODYSSEUS_INPROCESS_TASKS", "1")
    assert mod.inprocess_tasks_enabled() is False


def test_console_mode_forces_pollers_off_even_when_inprocess_on(monkeypatch):
    mod = _load_console_mode()
    monkeypatch.setenv("NEXUS_CONSOLE_MODE", "true")
    monkeypatch.setenv("ODYSSEUS_INPROCESS_POLLERS", "1")
    assert mod.inprocess_pollers_enabled() is False


def test_legacy_inprocess_tasks_kill_switch(monkeypatch):
    mod = _load_console_mode()
    monkeypatch.delenv("NEXUS_CONSOLE_MODE", raising=False)
    monkeypatch.delenv("ODYSSEUS_INPROCESS_TASKS", raising=False)
    assert mod.inprocess_tasks_enabled() is True
    for off in ("0", "false", "no", "off"):
        monkeypatch.setenv("ODYSSEUS_INPROCESS_TASKS", off)
        assert mod.inprocess_tasks_enabled() is False


def test_email_pollers_gate_delegates_to_console_mode(monkeypatch):
    """routes.email_pollers._inprocess_pollers_enabled honours console mode."""
    monkeypatch.setenv("NEXUS_CONSOLE_MODE", "true")
    monkeypatch.setenv("ODYSSEUS_INPROCESS_POLLERS", "1")
    sys.modules.pop("routes.email_pollers", None)
    sys.modules.pop("src.console_mode", None)
    from routes.email_pollers import _inprocess_pollers_enabled  # noqa: WPS433
    assert _inprocess_pollers_enabled() is False
