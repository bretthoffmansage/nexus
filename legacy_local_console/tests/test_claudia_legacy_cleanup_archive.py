"""Package 18 — controlled legacy archive and doc cleanup checks."""

import json
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
ARCHIVE = REPO / "docs/claudia_console_reform/legacy_archive"
ARCHIVE_README = ARCHIVE / "README.md"
CLASSIFICATION = REPO / "docs/claudia_console_reform/legacy_file_classification.json"
PRIVATE_GUIDE = REPO / "docs/claudia_console_reform/private_pwa_deployment_hardening.md"
README = REPO / "README.md"

APPROVED_ARCHIVE_NAMES = frozenset({
    "install-service.sh",
    "odysseus-ui.service",
    "docs_index.html",
    "README.md",
})


def test_archive_readme_exists():
    assert ARCHIVE_README.is_file()


def test_approved_archived_files_present():
    for name in ("install-service.sh", "odysseus-ui.service", "docs_index.html"):
        assert (ARCHIVE / name).is_file(), f"missing archived file: {name}"


def test_archived_files_removed_from_original_paths():
    assert not (REPO / "install-service.sh").exists()
    assert not (REPO / "odysseus-ui.service").exists()
    assert not (REPO / "docs/index.html").exists()


def test_active_launch_paths_remain():
    assert (REPO / "start-macos.sh").is_file()
    assert (REPO / "launch-windows.ps1").is_file()
    assert (REPO / "Dockerfile").is_file()
    assert (REPO / "docker-compose.yml").is_file()
    assert (REPO / "companion").is_dir()
    assert (REPO / "scripts").is_dir()


def test_readme_claudia_console_gateway_note():
    text = README.read_text(encoding="utf-8")
    assert "Claudia Console" in text
    assert "Claudia Gateway" in text
    assert "claudia_system" in text
    assert "static/landing.html" in text


def test_private_deployment_guide_still_exists():
    assert PRIVATE_GUIDE.is_file()


def test_legacy_classification_json_parses():
    data = json.loads(CLASSIFICATION.read_text(encoding="utf-8"))
    assert data["root_and_deployment"]["install-service.sh"] == "archived_package_18"


def test_sw_cache_claudia_oriented():
    sw = (REPO / "static/sw.js").read_text(encoding="utf-8")
    assert "claudia-console-v1" in sw
    assert "odysseus-v326" not in sw


def test_archive_directory_only_expected_files_plus_readme():
    names = {p.name for p in ARCHIVE.iterdir() if p.is_file()}
    assert names <= APPROVED_ARCHIVE_NAMES
