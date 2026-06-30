"""Tests for embedded Hermes runtime resolver (Claudia Console host)."""

from __future__ import annotations

import importlib
import os
import stat
import sys
import tempfile
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]


def _load_module():
    sys.modules.pop("src.hermes_runtime", None)
    return importlib.import_module("src.hermes_runtime")


def _install_fake_runtime(base: Path) -> None:
    home = base / "hermes_runtime"
    agent = home / "hermes-agent"
    venv_bin = agent / "venv" / "bin"
    venv_bin.mkdir(parents=True)
    for name, body in (
        ("hermes", "#!/bin/sh\necho help\n"),
        ("python", "#!/bin/sh\necho python\n"),
    ):
        path = venv_bin / name
        path.write_text(body, encoding="utf-8")
        path.chmod(path.stat().st_mode | stat.S_IXUSR)
    raw = agent / "hermes"
    raw.write_text("#!/bin/sh\necho raw\n", encoding="utf-8")
    raw.chmod(raw.stat().st_mode | stat.S_IXUSR)
    (home / "config.yaml").write_text("version: 1\n", encoding="utf-8")
    (home / ".env").write_text("HERMES_HOME=\n", encoding="utf-8")
    scripts = base / "scripts"
    scripts.mkdir(exist_ok=True)
    (scripts / "hermes_claudia.sh").write_text(
        "#!/usr/bin/env bash\n"
        'export HERMES_HOME="${CLAUDIA_SYSTEM_ROOT}/hermes_runtime"\n'
        'exec "${HERMES_HOME}/hermes-agent/venv/bin/hermes" "$@"\n',
        encoding="utf-8",
    )


def test_defaults_use_embedded_venv_cli_not_global_paths(monkeypatch):
    monkeypatch.delenv("CLAUDIA_SYSTEM_ROOT", raising=False)
    monkeypatch.delenv("CLAUDIA_HERMES_HOME", raising=False)
    monkeypatch.delenv("CLAUDIA_HERMES_CLI", raising=False)
    monkeypatch.delenv("CLAUDIA_HERMES_PYTHON", raising=False)
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        _install_fake_runtime(base)
        monkeypatch.setenv("CLAUDIA_SYSTEM_ROOT", str(base))
        mod = _load_module()
        cli = mod.get_hermes_cli()
        home = mod.get_hermes_home()
        assert str(home).endswith("hermes_runtime")
        assert str(cli).endswith("hermes-agent/venv/bin/hermes")
        assert ".local/bin/hermes" not in str(cli)
        assert str(Path.home() / ".hermes") not in str(cli)
        assert not str(cli).endswith("hermes-agent/hermes")


def test_build_hermes_command_uses_venv_cli(monkeypatch):
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        _install_fake_runtime(base)
        monkeypatch.setenv("CLAUDIA_SYSTEM_ROOT", str(base))
        mod = _load_module()
        argv = mod.build_hermes_command(["config"])
        assert argv[0].endswith("hermes-agent/venv/bin/hermes")
        assert argv[1:] == ["config"]
        env = mod.build_hermes_env()
        assert env["HERMES_HOME"] == str((base / "hermes_runtime").resolve())


def test_env_overrides(monkeypatch):
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        _install_fake_runtime(base)
        custom_home = base / "custom_hermes"
        custom_home.mkdir()
        custom_cli = custom_home / "bin" / "hermes"
        custom_cli.parent.mkdir(parents=True)
        custom_cli.write_text("#!/bin/sh\n", encoding="utf-8")
        custom_cli.chmod(custom_cli.stat().st_mode | stat.S_IXUSR)
        custom_python = custom_home / "bin" / "python"
        custom_python.write_text("#!/bin/sh\n", encoding="utf-8")
        custom_python.chmod(custom_python.stat().st_mode | stat.S_IXUSR)
        monkeypatch.setenv("CLAUDIA_SYSTEM_ROOT", str(base))
        monkeypatch.setenv("CLAUDIA_HERMES_HOME", str(custom_home))
        monkeypatch.setenv("CLAUDIA_HERMES_CLI", str(custom_cli))
        monkeypatch.setenv("CLAUDIA_HERMES_PYTHON", str(custom_python))
        mod = _load_module()
        assert mod.get_hermes_home() == custom_home.resolve()
        assert mod.get_hermes_cli() == custom_cli.resolve()
        assert mod.get_hermes_python() == custom_python.resolve()


def test_validate_hermes_runtime_success(monkeypatch):
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        _install_fake_runtime(base)
        monkeypatch.setenv("CLAUDIA_SYSTEM_ROOT", str(base))
        mod = _load_module()
        report = mod.validate_hermes_runtime()
        assert report["validation_ok"] is True
        assert report["checks"]["hermes_cli_executable"] is True
        assert report["checks"]["hermes_config_yaml_exists"] is True
        assert report["checks"]["hermes_env_exists"] is True


def test_validate_rejects_forbidden_cli_path(monkeypatch):
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        _install_fake_runtime(base)
        monkeypatch.setenv("CLAUDIA_SYSTEM_ROOT", str(base))
        monkeypatch.setenv("CLAUDIA_HERMES_CLI", str(Path.home() / ".local/bin/hermes"))
        mod = _load_module()
        with pytest.raises(mod.HermesRuntimeError):
            mod.build_hermes_command(["--help"])


def test_gateway_health_includes_hermes_runtime(monkeypatch):
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        _install_fake_runtime(base)
        monkeypatch.setenv("CLAUDIA_SYSTEM_ROOT", str(base))
        monkeypatch.delenv("CLAUDIA_CORE_URL", raising=False)
        monkeypatch.setenv("AUTH_ENABLED", "false")
        sys.modules.pop("routes.claudia_routes", None)
        sys.modules.pop("src.claudia_deployment_posture", None)
        sys.modules.pop("src.hermes_runtime", None)
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from routes.claudia_routes import setup_claudia_routes

        app = FastAPI()
        app.include_router(setup_claudia_routes())
        with TestClient(app) as client:
            resp = client.get("/api/claudia/v1/health")
        assert resp.status_code == 200
        data = resp.json()
        assert "hermes_runtime" in data
        assert "hermes_home" in data["hermes_runtime"]
        assert data["hermes_runtime"]["hermes_cli"].endswith("venv/bin/hermes")


def test_claudia_client_does_not_shell_out_to_hermes():
    text = (REPO / "src/claudia_client.py").read_text(encoding="utf-8")
    assert "subprocess" not in text
    assert "Popen" not in text
    assert ".hermes" not in text
    assert ".local/bin/hermes" not in text


def test_no_active_old_hermes_home_in_python_sources():
    skip_prefixes = ("tests/", "docs/")
    offenders = []
    for path in REPO.rglob("*.py"):
        rel = str(path.relative_to(REPO))
        if rel == "src/hermes_runtime.py" or rel.startswith(skip_prefixes):
            continue
        text = path.read_text(encoding="utf-8")
        if "~/.hermes" in text or ".local/bin/hermes" in text:
            offenders.append(rel)
    assert offenders == []


def test_model_selector_frontend_uses_gateway_only():
    text = (REPO / "static/js/claudiaModelSelector.js").read_text(encoding="utf-8")
    assert "/api/claudia/v1/model-config" in text
    assert ".hermes" not in text
    assert "venv/bin/hermes" not in text
