"""Package 17 — audit artifact presence and structure checks (read-only)."""

import json
import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
AUDIT = REPO / "docs/claudia_console_reform/package_17_competing_authority_legacy_file_audit.md"
CLASSIFICATION = REPO / "docs/claudia_console_reform/legacy_file_classification.json"

REQUIRED_AUDIT_SECTIONS = (
    "Matrix 1",
    "Matrix 2",
    "Matrix 3",
    "Internal identifiers intentionally retained",
    "Recommended cleanup sequence",
    "High-priority remaining authority risks",
)

REQUIRED_MATRIX_ROWS = (
    "src/agent_loop.py",
    "src/task_scheduler.py",
    "routes/task_routes.py",
    "routes/cookbook_routes.py",
    "routes/gallery_routes.py",
    "start-macos.sh",
    "launch-windows.ps1",
    "Dockerfile",
    "static/landing.html",
    "static/login.html",
)


def test_audit_file_exists():
    assert AUDIT.is_file()


@pytest.mark.parametrize("section", REQUIRED_AUDIT_SECTIONS)
def test_audit_contains_required_sections(section):
    text = AUDIT.read_text(encoding="utf-8")
    assert section in text


@pytest.mark.parametrize("row", REQUIRED_MATRIX_ROWS)
def test_audit_mentions_key_classification_targets(row):
    text = AUDIT.read_text(encoding="utf-8")
    assert row in text


def test_audit_states_read_only_no_deletes():
    text = AUDIT.read_text(encoding="utf-8").lower()
    assert "no files deleted" in text or "no files deleted, moved" in text


def test_legacy_classification_json_exists_and_parses():
    assert CLASSIFICATION.is_file()
    data = json.loads(CLASSIFICATION.read_text(encoding="utf-8"))
    assert data.get("schema_version") == 1
    assert "authority_surfaces" in data
    assert "root_and_deployment" in data
    assert data["authority_surfaces"].get("src/agent_loop.py")


def test_classification_includes_retained_identifiers():
    data = json.loads(CLASSIFICATION.read_text(encoding="utf-8"))
    ids = data.get("internal_identifiers_retained", [])
    assert "odysseus_session" in ids
    assert "startOdysseusApp" in ids


def test_audit_recommends_package_18():
    text = AUDIT.read_text(encoding="utf-8")
    assert "Package 18" in text


def test_no_secrets_in_audit_artifacts():
    for path in (AUDIT, CLASSIFICATION):
        body = path.read_text(encoding="utf-8")
        assert not re.search(r"sk-[A-Za-z0-9]{20,}", body)
