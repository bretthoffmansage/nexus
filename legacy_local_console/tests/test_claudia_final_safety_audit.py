"""Package 20 — final safety audit closeout static checks."""

import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
REFORM = REPO / "docs/console_reform"

AUDIT = REFORM / "package_20_final_safety_audit_operator_handoff.md"
HANDOFF = REFORM / "NEXUS_CONSOLE_OPERATOR_HANDOFF.md"
CHECKLIST = REFORM / "final_console_gateway_checklist.md"
PRIVATE_GUIDE = REFORM / "private_pwa_deployment_hardening.md"
START_MACOS = REPO / "start-macos.sh"

CONSOLE_PATH = "/Users/bretthoffman/Documents/console"
CORE_PATH = "/Users/bretthoffman/Documents/system"

OLD_CHECKOUT_PATTERNS = (
    r"/Users/bretthoffman/Documents/odysseus",
    r"~/Documents/odysseus",
)

REQUIRED_AUDIT_SECTIONS = (
    "Final architecture summary",
    "Final launch command",
    "Console Mode recommended env",
    "Gateway routes summary",
    "Console Mode safety matrix",
    "Preserved functionality matrix",
    "Known baseline pytest issue",
    "Final recommendation",
)

REQUIRED_SAFETY_ROWS = (
    "startup scheduler",
    "chat",
    "Gateway intake",
    "shell execution",
    "gallery/image generation",
    "agent loop",
    "tool execution",
)

REQUIRED_PRESERVED_ROWS = (
    "login/auth",
    "Gateway API",
    "Ollama/local model",
    "Gallery browsing",
)


@pytest.mark.parametrize("path", (AUDIT, HANDOFF, CHECKLIST))
def test_package_20_closeout_docs_exist(path):
    assert path.is_file(), f"missing closeout doc: {path}"


def test_audit_contains_required_sections():
    text = AUDIT.read_text(encoding="utf-8")
    for section in REQUIRED_AUDIT_SECTIONS:
        assert section in text, f"audit missing section: {section}"


def test_handoff_contains_launch_and_env():
    text = HANDOFF.read_text(encoding="utf-8")
    assert CONSOLE_PATH in text
    assert "./start-macos.sh" in text
    assert "NEXUS_CONSOLE_MODE=true" in text
    assert "AUTH_ENABLED=true" in text
    assert CORE_PATH in text
    assert "What this repo is not" in text


def test_audit_documents_nexus_core_separation():
    text = AUDIT.read_text(encoding="utf-8")
    assert CORE_PATH in text
    assert "must not become Core" in text or "NOT started by Console" in text


@pytest.mark.parametrize("row", REQUIRED_SAFETY_ROWS)
def test_audit_safety_matrix_covers_key_areas(row):
    text = AUDIT.read_text(encoding="utf-8").lower()
    assert row.lower() in text, f"safety matrix missing row keyword: {row}"


@pytest.mark.parametrize("row", REQUIRED_PRESERVED_ROWS)
def test_audit_preserved_matrix_covers_key_areas(row):
    text = AUDIT.read_text(encoding="utf-8").lower()
    assert row.lower() in text, f"preserved matrix missing row keyword: {row}"


def test_active_operator_docs_have_no_old_checkout_path():
    for path in (
        HANDOFF,
        AUDIT,
        PRIVATE_GUIDE,
        REPO / "README.md",
        REPO / ".env.example",
        START_MACOS,
    ):
        text = path.read_text(encoding="utf-8")
        for pat in OLD_CHECKOUT_PATTERNS:
            assert not re.search(pat, text), f"{path} still has old path pattern {pat}"


def test_audit_documents_baseline_pytest_issue():
    text = AUDIT.read_text(encoding="utf-8")
    assert "test_chat_image_routing.py" in text
    assert "test_webhook_ssrf_resilience.py" in text


def test_checklist_references_launch_path():
    text = CHECKLIST.read_text(encoding="utf-8")
    assert CONSOLE_PATH in text
    assert "./start-macos.sh" in text
