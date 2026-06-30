"""Package 20B — Cursor / project display-name metadata checks."""

import json
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
REFORM = REPO / "docs/claudia_console_reform"

CONSOLE_PATH = "/Users/bretthoffman/Documents/claudia_console"
DISPLAY_NAME = "claudia-console"
DISPLAY_TITLE = "Claudia Console"

IMPLEMENTATION_NOTE = REFORM / "cursor_project_display_name_cleanup.md"

def test_implementation_note_exists():
    assert IMPLEMENTATION_NOTE.is_file()
    body = IMPLEMENTATION_NOTE.read_text(encoding="utf-8")
    assert "Package 20B" in body
    assert "Manual Cursor refresh steps" in body
    assert CONSOLE_PATH in body


def test_readme_h1_is_claudia_console():
    first = (REPO / "README.md").read_text(encoding="utf-8").splitlines()[0]
    assert first.strip() == f"# {DISPLAY_TITLE}"


def test_pyproject_display_name():
    text = (REPO / "pyproject.toml").read_text(encoding="utf-8")
    assert f'name = "{DISPLAY_NAME}"' in text


def test_package_json_display_name():
    data = json.loads((REPO / "package.json").read_text(encoding="utf-8"))
    assert data["name"] == DISPLAY_NAME
    assert data["description"]
    assert "odysseus.git" in data["repository"]["url"]


def test_package_lock_root_name_matches():
    data = json.loads((REPO / "package-lock.json").read_text(encoding="utf-8"))
    assert data["name"] == DISPLAY_NAME


def test_manifest_pwa_name_is_claudia():
    data = json.loads((REPO / "static/manifest.json").read_text(encoding="utf-8"))
    assert data["name"] == "Claudia"
    assert "Claudia Console" in data["description"]


def test_app_fastapi_title_is_claudia_console():
    text = (REPO / "app.py").read_text(encoding="utf-8")
    assert 'title="Claudia Console"' in text


def test_setup_script_display_banner():
    text = (REPO / "setup.py").read_text(encoding="utf-8")
    assert "Claudia Console Setup" in text
    assert "ODYSSEUS_ADMIN_USER" in text


def test_no_code_workspace_or_vscode_in_repo():
    assert not list(REPO.glob("*.code-workspace"))
    assert not (REPO / ".vscode").exists()


def test_git_remote_still_upstream_odysseus():
    """Upstream repo identity retained; local folder is claudia_console."""
    config = (REPO / ".git/config").read_text(encoding="utf-8")
    assert "odysseus.git" in config


@pytest.mark.parametrize(
    "path",
    (
        REPO / "docker-compose.yml",
        REPO / "start-macos.sh",
        REPO / "app.py",
    ),
)
def test_compatibility_identifiers_retained(path):
    text = path.read_text(encoding="utf-8")
    if path.name == "docker-compose.yml":
        assert "odysseus:" in text or "service" in text
    if path.name == "start-macos.sh":
        assert "ODYSSEUS_PORT" in text or "ODYSSEUS_HOST" in text
    if path.name == "app.py":
        assert "X-Odysseus-Internal-Token" in text


def test_scripts_odysseus_cli_names_exist():
    scripts = list((REPO / "scripts").glob("odysseus-*"))
    assert scripts, "expected odysseus-* CLI scripts for compatibility"
