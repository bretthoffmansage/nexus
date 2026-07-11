"""Embedded Hermes runtime resolver for legacy local console (Gateway host).

Hermes lives inside Nexus System at ``system/hermes_runtime``.
Console must not discover Hermes from ``~/.hermes``, ``~/.local/bin/hermes``,
global PATH, or the raw ``hermes-agent/hermes`` launcher without venv Python.

Env overrides (first match wins for each path):
  NEXUS_SYSTEM_ROOT, NEXUS_HERMES_HOME, NEXUS_HERMES_CLI, NEXUS_HERMES_PYTHON
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

ENV_NEXUS_SYSTEM_ROOT = "NEXUS_SYSTEM_ROOT"
ENV_HERMES_HOME = "NEXUS_HERMES_HOME"
ENV_HERMES_CLI = "NEXUS_HERMES_CLI"
ENV_HERMES_PYTHON = "NEXUS_HERMES_PYTHON"

HERMES_HOME_REL = "hermes_runtime"
HERMES_CLI_REL = "hermes-agent/venv/bin/hermes"
HERMES_PYTHON_REL = "hermes-agent/venv/bin/python"
HERMES_RAW_LAUNCHER_REL = "hermes-agent/hermes"
HERMES_LAUNCHER_SCRIPT_REL = "scripts/hermes_nexus.sh"

FORBIDDEN_PATH_FRAGMENTS = (
    ".local/bin/hermes",
    str(Path.home() / ".hermes"),
)

_DEFAULT_NEXUS_SYSTEM_ROOT = Path(
    "/Users/bretthoffman/Documents/system"
)


class HermesRuntimeError(Exception):
    """Raised when embedded Hermes runtime resolution or validation fails."""


def _resolve_from_env(name: str) -> Path | None:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return None
    return Path(raw).expanduser().resolve()


def get_system_root() -> Path:
    """Nexus System repository root (embedded Hermes parent)."""
    env_root = _resolve_from_env(ENV_NEXUS_SYSTEM_ROOT)
    if env_root is not None:
        return env_root
    sibling = Path(__file__).resolve().parents[1].parent / "system"
    if sibling.is_dir():
        return sibling.resolve()
    return _DEFAULT_NEXUS_SYSTEM_ROOT.resolve()


def get_hermes_home() -> Path:
    """Embedded Hermes runtime home (HERMES_HOME)."""
    env_home = _resolve_from_env(ENV_HERMES_HOME)
    if env_home is not None:
        return env_home
    return (get_system_root() / HERMES_HOME_REL).resolve()


def get_hermes_cli() -> Path:
    """Embedded venv Hermes CLI — primary invocation entrypoint."""
    env_cli = _resolve_from_env(ENV_HERMES_CLI)
    if env_cli is not None:
        return env_cli
    return (get_hermes_home() / HERMES_CLI_REL).resolve()


def get_hermes_python() -> Path:
    """Embedded venv Python for Hermes fallback invocations."""
    env_python = _resolve_from_env(ENV_HERMES_PYTHON)
    if env_python is not None:
        return env_python
    return (get_hermes_home() / HERMES_PYTHON_REL).resolve()


def get_hermes_raw_launcher() -> Path:
    """Raw launcher script — not for direct Console use without venv Python."""
    return (get_hermes_home() / HERMES_RAW_LAUNCHER_REL).resolve()


def get_hermes_launcher_script() -> Path:
    """Nexus-side shell launcher (must delegate to venv CLI)."""
    return (get_system_root() / HERMES_LAUNCHER_SCRIPT_REL).resolve()


def get_hermes_config_path() -> Path:
    return (get_hermes_home() / "config.yaml").resolve()


def get_hermes_env_path() -> Path:
    return (get_hermes_home() / ".env").resolve()


def _assert_not_forbidden(path_text: str) -> None:
    for fragment in FORBIDDEN_PATH_FRAGMENTS:
        if fragment in path_text:
            raise HermesRuntimeError(f"forbidden_invocation_path:{fragment}")


def build_hermes_env(extra_env: dict[str, str] | None = None) -> dict[str, str]:
    """Environment for subprocess Hermes invocations."""
    env = os.environ.copy()
    env["HERMES_HOME"] = str(get_hermes_home())
    if extra_env:
        env.update(extra_env)
    return env


def build_hermes_command(args: list[str] | None = None) -> list[str]:
    """Argv for embedded venv Hermes CLI with optional subcommand args."""
    cli = str(get_hermes_cli())
    _assert_not_forbidden(cli)
    if cli.endswith(f"/{HERMES_RAW_LAUNCHER_REL}") or cli.endswith("/hermes-agent/hermes"):
        raise HermesRuntimeError("raw_hermes_launcher_not_allowed_as_primary_cli")
    return [cli, *(args or [])]


def validate_hermes_runtime() -> dict[str, Any]:
    """Validate embedded Hermes runtime layout on the Console host."""
    root = get_system_root()
    home = get_hermes_home()
    cli = get_hermes_cli()
    python_bin = get_hermes_python()
    raw_launcher = get_hermes_raw_launcher()
    launcher_script = get_hermes_launcher_script()
    config_path = get_hermes_config_path()
    env_path = get_hermes_env_path()

    errors: list[str] = []
    warnings: list[str] = []

    checks = {
        "system_root_exists": root.is_dir(),
        "hermes_runtime_exists": home.is_dir(),
        "hermes_config_yaml_exists": config_path.is_file(),
        "hermes_env_exists": env_path.is_file(),
        "hermes_cli_exists": cli.is_file(),
        "hermes_cli_executable": cli.is_file() and os.access(cli, os.X_OK),
        "hermes_python_exists": python_bin.is_file(),
        "hermes_python_executable": python_bin.is_file() and os.access(python_bin, os.X_OK),
        "raw_launcher_exists": raw_launcher.is_file(),
        "launcher_script_exists": launcher_script.is_file(),
    }

    if launcher_script.is_file():
        launcher_text = launcher_script.read_text(encoding="utf-8")
        launcher_body = "\n".join(line.split("#", 1)[0] for line in launcher_text.splitlines())
        checks["launcher_uses_venv_hermes"] = "venv/bin/hermes" in launcher_body
        checks["launcher_sets_hermes_home"] = (
            "HERMES_HOME" in launcher_text and "hermes_runtime" in launcher_text
        )
        checks["launcher_avoids_local_bin_default"] = ".local/bin/hermes" not in launcher_body
    else:
        checks["launcher_uses_venv_hermes"] = False
        checks["launcher_sets_hermes_home"] = False
        checks["launcher_avoids_local_bin_default"] = False

    for fragment in FORBIDDEN_PATH_FRAGMENTS:
        if fragment in str(cli) or fragment in str(python_bin):
            errors.append(f"forbidden_path_fragment_detected:{fragment}")

    try:
        build_hermes_command(["--help"])
    except HermesRuntimeError as exc:
        errors.append(str(exc))

    if not checks["hermes_cli_executable"] and checks["hermes_python_executable"]:
        warnings.append("hermes_cli_missing_using_python_fallback_only")

    for key, ok in checks.items():
        if not ok:
            errors.append(key)

    return {
        "validation_ok": not errors,
        "system_root": str(root),
        "hermes_home": str(home),
        "hermes_cli": str(cli),
        "hermes_python": str(python_bin),
        "hermes_config_path": str(config_path),
        "hermes_env_path": str(env_path),
        "hermes_launcher_script": str(launcher_script),
        "checks": checks,
        "errors": errors,
        "warnings": warnings,
    }


def hermes_runtime_status() -> dict[str, Any]:
    """Compact status for Gateway health / dashboard (no subprocess)."""
    report = validate_hermes_runtime()
    return {
        "validation_ok": report["validation_ok"],
        "system_root": report["system_root"],
        "hermes_home": report["hermes_home"],
        "hermes_cli": report["hermes_cli"],
        "hermes_python": report["hermes_python"],
        "hermes_config_path": report["hermes_config_path"],
        "errors": report["errors"],
        "warnings": report["warnings"],
    }
