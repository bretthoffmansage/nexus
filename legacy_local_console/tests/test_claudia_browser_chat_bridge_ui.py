"""Static checks for legacy local console browser chat bridge UI (direct JSON path)."""

from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
CHAT = REPO / "static/js/chat.js"
BRIDGE = REPO / "static/js/nexusBrowserChatBridge.js"
SESSIONS = REPO / "static/js/sessions.js"
RENDERER = REPO / "static/js/chatRenderer.js"
APP = REPO / "static/app.js"
NOTE = REPO / "docs/console_reform/browser_chat_direct_json_bridge_fix.md"
LEGACY_NOTE = REPO / "docs/console_reform/browser_chat_bridge_ui_fix.md"

LEGACY_WARNING = "No chat session active"
EMPTY_FALLBACK = "no assistant content was returned"


def test_direct_json_implementation_note_exists():
    assert NOTE.is_file()
    body = NOTE.read_text(encoding="utf-8")
    assert "Browser chat transport" in body
    assert "/api/nexus/v1/messages" in body


def test_bridge_module_uses_messages_endpoint():
    text = BRIDGE.read_text(encoding="utf-8")
    assert "/api/nexus/v1/messages" in text
    assert "sendBridgeMessage" in text
    assert "resolveAssistantContent" in text
    assert EMPTY_FALLBACK in text.lower()


def test_extract_assistant_content_handles_core_response():
    text = BRIDGE.read_text(encoding="utf-8")
    assert "resp.content" in text
    assert "resp.message" in text
    assert "core.message" in text


def test_empty_content_fallback_is_non_empty():
    text = BRIDGE.read_text(encoding="utf-8")
    assert "EMPTY_CONTENT_FALLBACK" in text
    assert EMPTY_FALLBACK in text.lower()


def test_sessions_has_bridge_session_helper():
    text = SESSIONS.read_text(encoding="utf-8")
    assert "ensureNexusBridgeSession" in text
    assert "skip_validation" in text


def test_chat_js_uses_send_bridge_message_before_chat_stream():
    text = CHAT.read_text(encoding="utf-8")
    assert "sendBridgeMessage" in text
    send_idx = text.index("sendBridgeMessage")
    stream_idx = text.index("/api/chat_stream")
    assert send_idx < stream_idx
    bridge_block = text[send_idx:stream_idx]
    assert "return" in bridge_block
    assert "shouldUseBridge()" in text


def test_chat_js_bridge_path_does_not_reference_chat_stream():
    text = CHAT.read_text(encoding="utf-8")
    marker = "// --- legacy local console direct JSON bridge"
    start = text.index(marker)
    end = text.index("const abortCtrl = new AbortController();", start)
    block = text[start:end]
    assert "/api/chat_stream" not in block
    assert "sendBridgeMessage" in block


def test_chat_js_legacy_warning_is_dismissible():
    text = CHAT.read_text(encoding="utf-8")
    idx = text.index(LEGACY_WARNING)
    snippet = text[idx : idx + 400]
    assert "dismissible: true" in snippet


def test_chat_renderer_dismiss_button():
    text = RENDERER.read_text(encoding="utf-8")
    assert "msg-dismiss-btn" in text


def test_app_preserves_model_picker_when_bridge_active():
    text = APP.read_text(encoding="utf-8")
    assert "nexusBrowserChatBridge" in text
    assert "model-picker-autohide" in text


def test_chat_finally_refreshes_model_picker():
    text = CHAT.read_text(encoding="utf-8")
    idx = text.rfind("_syncModelPickerAutohide")
    assert idx > 0
    snippet = text[idx : idx + 120]
    assert "updateModelPicker" in snippet


def test_frontend_no_direct_hermes_or_config_paths():
    for rel in (
        "static/js/nexusBrowserChatBridge.js",
        "static/js/nexusModelSelector.js",
    ):
        text = (REPO / rel).read_text(encoding="utf-8")
        assert "~/.hermes/config.yaml" not in text
        assert "hermes" not in text.lower() or "/api/nexus/" in text


def test_prior_bridge_note_still_exists():
    assert LEGACY_NOTE.is_file()
