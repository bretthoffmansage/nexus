"""Static checks for Claudia Core model selector UI wiring."""

from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
MODEL_PICKER = REPO / "static/js/modelPicker.js"
CLAUDIA_SELECTOR = REPO / "static/js/claudiaModelSelector.js"
IMPLEMENTATION_NOTE = REPO / "docs/claudia_console_reform/model_selector_gateway_ui_wiring.md"

GATEWAY_MODEL_CONFIG = "/api/claudia/v1/model-config"


def test_implementation_note_exists():
    assert IMPLEMENTATION_NOTE.is_file()
    body = IMPLEMENTATION_NOTE.read_text(encoding="utf-8")
    assert "Model config authority" in body
    assert GATEWAY_MODEL_CONFIG in body


def test_claudia_model_selector_module_exists():
    assert CLAUDIA_SELECTOR.is_file()
    text = CLAUDIA_SELECTOR.read_text(encoding="utf-8")
    assert GATEWAY_MODEL_CONFIG in text
    assert "method: 'POST'" in text or "method: \"POST\"" in text
    assert "config.yaml" not in text


def test_model_picker_imports_claudia_selector():
    text = MODEL_PICKER.read_text(encoding="utf-8")
    assert "claudiaModelSelector.js" in text
    assert "_populateCoreModels" in text
    assert "_pickCoreModel" in text


def test_model_picker_core_path_does_not_patch_session_for_switch():
    picker = MODEL_PICKER.read_text(encoding="utf-8")
    selector = CLAUDIA_SELECTOR.read_text(encoding="utf-8")
    core_fn = picker.split("async function _pickCoreModel")[1].split("async function _pick(")[0]
    assert GATEWAY_MODEL_CONFIG in selector
    assert "/api/session/" not in core_fn
    assert "selectModel" in core_fn


def test_claudia_selector_does_not_call_legacy_model_endpoints():
    text = CLAUDIA_SELECTOR.read_text(encoding="utf-8")
    assert "/api/model-endpoints" not in text
    assert "/api/session/" not in text
    assert "probe-local" not in text


def test_model_picker_core_populate_uses_core_unavailable_message():
    text = MODEL_PICKER.read_text(encoding="utf-8")
    assert "getUnavailableListMessage" in text
    assert "No Core model options configured" in text or "getSearchPlaceholder" in text
