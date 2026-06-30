"""Claudia Console Mode — env-driven startup gates for in-process autonomy.

When enabled, Odysseus serves UI/API without starting background systems that
compete with Claudia Core (task runner, email pollers, agent auto-continuation).
"""

from __future__ import annotations

import os

_ENV_CONSOLE = "CLAUDIA_CONSOLE_MODE"
_ENV_TASKS = "ODYSSEUS_INPROCESS_TASKS"
_ENV_POLLERS = "ODYSSEUS_INPROCESS_POLLERS"

# Values that mean "off" for ODYSSEUS_INPROCESS_* (legacy kill switches).
_INPROCESS_OFF = frozenset({"0", "false", "no", "off", ""})

# Values that mean "on" for CLAUDIA_CONSOLE_MODE (explicit enable).
_CONSOLE_ON = frozenset({"1", "true", "yes", "on"})


def is_claudia_console_mode() -> bool:
    """True when Odysseus runs as Claudia Console UI/API shell only."""
    raw = os.environ.get(_ENV_CONSOLE, "").strip().lower()
    return raw in _CONSOLE_ON


def inprocess_tasks_enabled() -> bool:
    """Whether the in-process TaskScheduler runner may start at startup."""
    if is_claudia_console_mode():
        return False
    raw = os.environ.get(_ENV_TASKS, "1").strip().lower()
    return raw not in _INPROCESS_OFF


def inprocess_pollers_enabled() -> bool:
    """Whether in-process email pollers may start at startup."""
    if is_claudia_console_mode():
        return False
    raw = os.environ.get(_ENV_POLLERS, "1").strip().lower()
    return raw not in _INPROCESS_OFF
