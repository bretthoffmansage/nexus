"""Package 20A — folder rename compatibility (odysseus → claudia_console)."""

import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
START_MACOS = REPO / "start-macos.sh"
README = REPO / "README.md"
PRIVATE_GUIDE = REPO / "docs/claudia_console_reform/private_pwa_deployment_hardening.md"
ENV_EXAMPLE = REPO / ".env.example"
REFORM_DIR = REPO / "docs/claudia_console_reform"

OLD_PATH_PATTERNS = (
    r"/Users/bretthoffman/Documents/odysseus",
    r"~/Documents/odysseus",
    r"Documents/odysseus",
    r"cd ~/Documents/odysseus",
)
NEW_PATH = "/Users/bretthoffman/Documents/claudia_console"
PACKAGE_20A = REFORM_DIR / "package_20a_folder_rename_compatibility.md"

ACTIVE_OPERATOR_FILES = (
    START_MACOS,
    README,
    PRIVATE_GUIDE,
    ENV_EXAMPLE,
    REPO / "SECURITY.md",
    REPO / "scripts/README.md",
    REPO / "docker/README.md",
    REPO / "docs/claudia_console_reform/legacy_archive/README.md",
)


def _has_old_operator_path(text: str) -> bool:
    return any(re.search(p, text) for p in OLD_PATH_PATTERNS)


@pytest.mark.parametrize("path", ACTIVE_OPERATOR_FILES, ids=lambda p: p.name)
def test_active_operator_docs_use_claudia_console_path(path):
    assert path.is_file(), f"missing active doc: {path}"
    text = path.read_text(encoding="utf-8")
    assert NEW_PATH in text, f"{path} should document {NEW_PATH}"
    assert not _has_old_operator_path(text), f"{path} still references old odysseus checkout path"


def test_start_macos_uses_repo_relative_paths_not_odysseus_folder_name():
    text = START_MACOS.read_text(encoding="utf-8")
    assert 'REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"' in text
    assert 'cd "$REPO_DIR"' in text
    assert "/Users/bretthoffman/Documents/odysseus" not in text
    assert "Documents/odysseus" not in text
    assert NEW_PATH in text


def test_start_macos_does_not_require_odysseus_as_folder_name():
    text = START_MACOS.read_text(encoding="utf-8")
    # Must not cd into a hardcoded odysseus directory or require that folder name.
    assert not re.search(r'cd\s+["\']?[^"\']*odysseus', text)
    assert not re.search(r'REPO_DIR=.*/odysseus', text)


def test_package_20a_implementation_note_exists():
    assert PACKAGE_20A.is_file()
    body = PACKAGE_20A.read_text(encoding="utf-8")
    assert "Package 20A" in body
    assert NEW_PATH in body
    assert "historical" in body.lower()


def test_old_path_only_in_historical_package_notes_if_present():
    """Earlier reform package notes may retain the old path as historical context."""
    historical = []
    for path in sorted(REFORM_DIR.glob("package_*.md")):
        if path.name == "package_20a_folder_rename_compatibility.md":
            continue
        text = path.read_text(encoding="utf-8")
        if _has_old_operator_path(text):
            historical.append(path.name)
    # Package 00–19 notes recorded the old path at implementation time — expected.
    assert historical, "expected at least one historical package note with old path"
    for name in historical:
        assert re.match(r"package_\d", name)


@pytest.mark.parametrize(
    "path",
    (
        REPO / "launch-windows.ps1",
        REPO / "Dockerfile",
        REPO / "docker-compose.yml",
    ),
)
def test_launch_and_docker_files_have_no_hardcoded_odysseus_checkout_path(path):
    text = path.read_text(encoding="utf-8")
    assert not _has_old_operator_path(text)
