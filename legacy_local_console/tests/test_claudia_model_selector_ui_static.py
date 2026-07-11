"""Static checks for Nexus Core model selector UI wiring."""

from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
MODEL_PICKER = REPO / "static/js/modelPicker.js"
NEXUS_SELECTOR = REPO / "static/js/nexusModelSelector.js"
IMPLEMENTATION_NOTE = REPO / "docs/console_reform/model_selector_gateway_ui_wiring.md"

GATEWAY_MODEL_CONFIG = "/api/nexus/v1/model-config"


def test_implementation_note_exists():
    assert IMPLEMENTATION_NOTE.is_file()
    body = IMPLEMENTATION_NOTE.read_text(encoding="utf-8")
    assert "Model config authority" in body
    assert GATEWAY_MODEL_CONFIG in body


def test_nexus_model_selector_module_exists():
    assert NEXUS_SELECTOR.is_file()
    text = NEXUS_SELECTOR.read_text(encoding="utf-8")
    assert GATEWAY_MODEL_CONFIG in text
    assert "method: 'POST'" in text or "method: \"POST\"" in text
    assert "config.yaml" not in text


def test_model_picker_imports_nexus_selector():
    text = MODEL_PICKER.read_text(encoding="utf-8")
    assert "nexusModelSelector.js" in text
    assert "_populateCoreModels" in text
    assert "_pickCoreModel" in text


def test_model_picker_core_path_does_not_patch_session_for_switch():
    picker = MODEL_PICKER.read_text(encoding="utf-8")
    selector = NEXUS_SELECTOR.read_text(encoding="utf-8")
    core_fn = picker.split("async function _pickCoreModel")[1].split("async function _pick(")[0]
    assert GATEWAY_MODEL_CONFIG in selector
    assert "/api/session/" not in core_fn
    assert "selectModel" in core_fn


def test_nexus_selector_does_not_call_legacy_model_endpoints():
    text = NEXUS_SELECTOR.read_text(encoding="utf-8")
    assert "/api/model-endpoints" not in text
    assert "/api/session/" not in text
    assert "probe-local" not in text


def test_model_picker_core_populate_uses_core_unavailable_message():
    text = MODEL_PICKER.read_text(encoding="utf-8")
    assert "getUnavailableListMessage" in text
    assert "No Core model options configured" in text or "getSearchPlaceholder" in text
