"""Tests for Nexus CLI Mirror UI (Bridge 09 shell + Bridge 10 transcript polish)."""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
HELPERS_JS = REPO / "static/js/nexusCliMirrorHelpers.js"
MIRROR_JS = REPO / "static/js/nexusCliMirror.js"
CONSOLE_MODE_JS = REPO / "static/js/nexusConsoleMode.js"
BRIDGE_09_DOC = REPO / "docs/console_reform/package_bridge_09_console_cli_mirror_ui_shell.md"
BRIDGE_10_DOC = REPO / "docs/console_reform/package_bridge_10_cli_mirror_transcript_polish.md"
BRIDGE_11_DOC = REPO / "docs/console_reform/package_bridge_11_cli_mirror_session_resume_operator_controls.md"
BRIDGE_11A_DOC = REPO / "docs/console_reform/package_bridge_11a_cli_mirror_viewport_scroll_fix.md"
BRIDGE_11B_DOC = REPO / "docs/console_reform/package_bridge_11b_cli_mirror_mode_switch_input_clarity_reattach.md"
BRIDGE_13_DOC = REPO / "docs/console_reform/package_bridge_13_cli_registry_transcript_pagination_ui_alignment.md"

GATEWAY_CLI_PREFIX = "/api/nexus/v1/cli/sessions"
FORBIDDEN_JS_PATTERNS = (
    "agent_loop",
    "stream_agent_loop",
    "/hermes/sessions",
    "8080/hermes",
)


def _node_eval(script: str) -> dict:
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=str(REPO),
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0 and "ENOENT" in (proc.stderr or ""):
        pytest.skip("node not available")
    assert proc.returncode == 0, proc.stderr or proc.stdout
    return json.loads(proc.stdout.strip())


def test_bridge_11a_implementation_note_exists():
    assert BRIDGE_11A_DOC.is_file()
    text = BRIDGE_11A_DOC.read_text(encoding="utf-8")
    for phrase in (
        "Bridge 11A",
        "viewport",
        "overflow",
        "Manual smoke",
        "Bridge 12",
    ):
        assert phrase in text, f"missing in implementation note: {phrase}"


def test_bridge_11_implementation_note_exists():
    assert BRIDGE_11_DOC.is_file()
    text = BRIDGE_11_DOC.read_text(encoding="utf-8")
    for phrase in (
        "Bridge 11",
        "Operator Mode",
        "Attach",
        "Manual smoke",
        "Bridge 12",
    ):
        assert phrase in text, f"missing in implementation note: {phrase}"


def test_bridge_10_implementation_note_exists():
    assert BRIDGE_10_DOC.is_file()
    text = BRIDGE_10_DOC.read_text(encoding="utf-8")
    for phrase in (
        "Bridge 10",
        "transcript",
        "ANSI",
        "Manual smoke",
        "Bridge 11",
    ):
        assert phrase in text, f"missing in implementation note: {phrase}"


def test_bridge_09_implementation_note_exists():
    assert BRIDGE_09_DOC.is_file()


def test_cli_mirror_helpers_module_exists():
    assert HELPERS_JS.is_file()
    src = HELPERS_JS.read_text(encoding="utf-8")
    assert GATEWAY_CLI_PREFIX in src
    assert "classifyStreamEvent" in src
    assert "extractTranscriptText" in src
    assert "hasVisibleTranscriptText" in src
    assert "sanitizeTranscriptText" in src
    assert "DISPLAY_CATEGORIES" in src
    assert "shouldCollapseDuplicate" in src
    assert "formatRawDrawerLine" in src


def test_cli_mirror_ui_module_uses_gateway_only():
    mirror_src = MIRROR_JS.read_text(encoding="utf-8")
    helpers_src = HELPERS_JS.read_text(encoding="utf-8")
    combined = mirror_src + helpers_src
    assert GATEWAY_CLI_PREFIX in combined
    assert "EventSource" in mirror_src
    assert "nexusCliMirrorHelpers.js" in mirror_src
    for forbidden in FORBIDDEN_JS_PATTERNS:
        assert forbidden not in combined, f"CLI mirror UI must not reference {forbidden}"


def test_cli_mirror_modules_no_core_fetch_urls():
    combined = MIRROR_JS.read_text(encoding="utf-8") + HELPERS_JS.read_text(encoding="utf-8")
    assert re.search(r"fetch\s*\(\s*['\"]https?://", combined) is None


def test_console_mode_wires_cli_mirror_init():
    src = CONSOLE_MODE_JS.read_text(encoding="utf-8")
    assert "initNexusCliMirror" in src
    assert "nexusCliMirror.js" in src


def test_cli_mirror_css_present():
    css = (REPO / "static/style.css").read_text(encoding="utf-8")
    assert ".nexus-cli-mirror-panel" in css
    assert ".nexus-cli-mirror-card-tool" in css
    assert ".nexus-cli-mirror-card-error" in css
    assert ".nexus-cli-mirror-session-list" in css
    assert ".nexus-cli-mirror-operator-warning" in css
    assert ".nexus-cli-mirror-attach-offer" in css


def test_bridge_11_operator_controls_in_ui_js():
    mirror = MIRROR_JS.read_text(encoding="utf-8")
    helpers = HELPERS_JS.read_text(encoding="utf-8")
    assert "Attach to running session" in mirror
    assert "Send Ctrl+C" in mirror
    assert "mapConflictError" in mirror
    assert "formatSessionTimes" in helpers
    assert "can_start_new" in helpers


def test_cli_mirror_header_copy_cleanup():
    mirror = MIRROR_JS.read_text(encoding="utf-8")
    assert "Mirrors the Core-owned Hermes session." in mirror
    assert "Operator Mode — admin/operator access" not in mirror
    assert "nexus-cli-mirror-operator-warning" not in mirror
    assert "Commands may trigger tools, file operations, or external actions" not in mirror
    console = CONSOLE_MODE_JS.read_text(encoding="utf-8")
    assert "Local execution and canonical writes are routed through Nexus Core" in console


def test_bridge_11_no_auto_attach_on_refresh():
    mirror = MIRROR_JS.read_text(encoding="utf-8")
    assert "await _attachSession(active)" not in mirror


def test_bridge_11a_cli_mirror_viewport_scroll_css():
    css = (REPO / "static/style.css").read_text(encoding="utf-8")
    active_block = css.split(".chat-container.nexus-cli-mirror-active {", 1)[1].split("}", 1)[0]
    assert "overflow-y: auto" in active_block
    assert "overflow-x: hidden" in active_block

    panel_block = css.split(".nexus-cli-mirror-panel {", 1)[1].split("}", 1)[0]
    assert "overflow: visible" in panel_block
    assert "min-height: min-content" in panel_block

    transcript_block = css.split(".nexus-cli-mirror-transcript {", 1)[1].split("}", 1)[0]
    assert "overflow-y: auto" in transcript_block
    assert "max-height:" in transcript_block
    assert "clamp(" in transcript_block

    input_block = css.split(".nexus-cli-mirror-input-bar {", 1)[1].split("}", 1)[0]
    assert "flex-shrink: 0" in input_block


def test_bridge_11a_simple_chat_container_still_overflow_hidden():
    css = (REPO / "static/style.css").read_text(encoding="utf-8")
    base_block = css.split(".chat-container {", 1)[1].split("}", 1)[0]
    assert "overflow:hidden" in base_block.replace(" ", "")


def test_bridge_10_ansi_escape_stripping():
    out = _node_eval(
        """
        import { sanitizeTranscriptText } from './static/js/nexusCliMirrorHelpers.js';
        const raw = '\\x1b[31mhello\\x1b[0m\\x1b[2K';
        console.log(JSON.stringify({ cleaned: sanitizeTranscriptText(raw) }));
        """
    )
    assert out["cleaned"] == "hello"


def test_bridge_10_heartbeat_hidden_from_main_transcript():
    out = _node_eval(
        """
        import { classifyStreamEvent } from './static/js/nexusCliMirrorHelpers.js';
        const meta = classifyStreamEvent('heartbeat', { type: 'heartbeat' });
        console.log(JSON.stringify({ visible: meta.visible, category: meta.category }));
        """
    )
    assert out["visible"] is False
    assert out["category"] == "heartbeat"


def test_bridge_10_error_and_warning_classification():
    out = _node_eval(
        """
        import { classifyStreamEvent, classifyContentCategory } from './static/js/nexusCliMirrorHelpers.js';
        const err = classifyStreamEvent('hermes_output', { text: 'Traceback (most recent call last): Error: failed' });
        const warn = classifyContentCategory('Warning: deprecated API', { source: 'output' });
        const slash = classifyContentCategory('/help', { source: 'input' });
        console.log(JSON.stringify({ err: err.category, warn, slash }));
        """
    )
    assert out["err"] == "error"
    assert out["warn"] == "warning"
    assert out["slash"] == "slash_command"


def test_bridge_10_noise_hidden_from_main_transcript():
    out = _node_eval(
        """
        import { classifyStreamEvent, isRawNoise } from './static/js/nexusCliMirrorHelpers.js';
        const noise = isRawNoise('⠋', '⠋');
        const meta = classifyStreamEvent('hermes_output', { text: '⠋', raw: '\\x1b[2K⠋' });
        console.log(JSON.stringify({ noise, visible: meta.visible, category: meta.category }));
        """
    )
    assert out["noise"] is True
    assert out["visible"] is False


def test_bridge_10_repeated_chunk_collapse():
    out = _node_eval(
        """
        import { shouldCollapseDuplicate } from './static/js/nexusCliMirrorHelpers.js';
        const yes = shouldCollapseDuplicate('same line', 'same line', 'hermes_output', 'hermes_output');
        const no = shouldCollapseDuplicate('a', 'b', 'hermes_output', 'hermes_output');
        console.log(JSON.stringify({ yes, no }));
        """
    )
    assert out["yes"] is True
    assert out["no"] is False


def test_bridge_10_raw_drawer_line_includes_seq_and_event():
    out = _node_eval(
        """
        import { formatRawDrawerLine } from './static/js/nexusCliMirrorHelpers.js';
        const line = formatRawDrawerLine('hermes_output', { seq: 7, ts: '2026-06-02T12:00:00Z', raw: 'hello' });
        console.log(JSON.stringify({ line }));
        """
    )
    assert "#7" in out["line"]
    assert "hermes_output" in out["line"]
    assert "hello" in out["line"]


def test_map_api_error_admin_and_core_states():
    src = HELPERS_JS.read_text(encoding="utf-8")
    for code in (
        "admin_required",
        "core_not_configured",
        "pty_disabled",
        "session_conflict",
        "unknown_session",
        "interrupt_failed",
        "stop_failed",
    ):
        assert code in src


def test_cli_mirror_js_syntax_check():
    node = subprocess.run(
        ["node", "--check", str(MIRROR_JS)],
        capture_output=True,
        text=True,
    )
    if node.returncode != 0 and "ENOENT" in (node.stderr or ""):
        pytest.skip("node not available for syntax check")
    assert node.returncode == 0, node.stderr or node.stdout


def test_helpers_js_syntax_check():
    node = subprocess.run(
        ["node", "--check", str(HELPERS_JS)],
        capture_output=True,
        text=True,
    )
    if node.returncode != 0 and "ENOENT" in (node.stderr or ""):
        pytest.skip("node not available for syntax check")
    assert node.returncode == 0, node.stderr or node.stdout


def test_no_agent_loop_in_cli_mirror_modules():
    for path in (MIRROR_JS, HELPERS_JS, CONSOLE_MODE_JS):
        text = path.read_text(encoding="utf-8")
        assert "agent_loop" not in text
        assert "stream_agent_loop" not in text


def test_local_storage_mode_key_documented():
    src = HELPERS_JS.read_text(encoding="utf-8")
    assert "console_interaction_mode" in src
    assert "console_cli_mirror_session_id" in src


def test_bridge_11b_implementation_note_exists():
    assert BRIDGE_11B_DOC.is_file()
    text = BRIDGE_11B_DOC.read_text(encoding="utf-8")
    for phrase in (
        "Bridge 11B",
        "Mode switch",
        "Session title",
        "Send input to Hermes",
        "reattach",
        "Manual smoke",
        "Bridge 12",
    ):
        assert phrase in text, f"missing in implementation note: {phrase}"


def test_bridge_11b_mode_toggle_in_chat_top_bar():
    mirror = MIRROR_JS.read_text(encoding="utf-8")
    assert "chat-top-bar" in mirror
    assert "nexus-interaction-mode-toggle" in mirror
    assert "nexus-mode-simple-chat" in mirror
    assert "nexus-mode-cli-mirror" in mirror
    assert "chat-input-right" not in mirror


def test_bridge_11b_mode_switch_persists_local_storage():
    mirror = MIRROR_JS.read_text(encoding="utf-8")
    helpers = HELPERS_JS.read_text(encoding="utf-8")
    assert "loadPersistedInteractionMode" in helpers
    assert "loadPersistedInteractionMode()" in mirror
    assert "localStorage.setItem(CLI_MIRROR_MODE_KEY" in mirror


def test_bridge_11b_session_id_persistence_helpers():
    helpers = HELPERS_JS.read_text(encoding="utf-8")
    mirror = MIRROR_JS.read_text(encoding="utf-8")
    for fn in ("loadPersistedSessionId", "savePersistedSessionId", "clearPersistedSessionId"):
        assert fn in helpers
        assert fn in mirror


def test_bridge_11b_input_clarity_labels_and_helpers():
    mirror = MIRROR_JS.read_text(encoding="utf-8")
    css = (REPO / "static/style.css").read_text(encoding="utf-8")
    assert "Session setup" in mirror
    assert "Used only to name the CLI Mirror session before starting it." in mirror
    assert 'for="nexus-cli-mirror-input">Send input to Hermes</label>' not in mirror
    assert "This sends text into the live Core-owned Hermes CLI session." not in mirror
    assert "Send input to Hermes (/help, commands, or instructions…)" in mirror
    assert 'aria-label="Send input to Hermes"' in mirror
    assert "nexus-cli-mirror-setup-inactive-labels" in mirror
    assert "nexus-cli-mirror-setup-header" in mirror
    assert "Active session title:" not in mirror
    assert ".nexus-cli-mirror-section-setup" in css
    assert ".nexus-cli-mirror-section-input" in css


def test_cli_mirror_active_session_setup_ui():
    mirror = MIRROR_JS.read_text(encoding="utf-8")
    css = (REPO / "static/style.css").read_text(encoding="utf-8")
    assert "_updateSetupPanelUi" in mirror
    assert "_hasRunningSession" in mirror
    assert "_setSetupPanelMinimized" in mirror
    assert "_onSetupPanelClick" in mirror
    assert "_isSetupPanelControlTarget" in mirror
    assert "_setupPanelMinimized" in mirror
    assert "has-active-session" in mirror
    assert "is-minimized" in mirror
    assert "nexus-cli-mirror-setup-header" in mirror
    assert "nexus-cli-mirror-setup-inactive-labels" in mirror
    assert "nexus-cli-mirror-setup-minimize" not in mirror
    assert "nexus-cli-mirror-setup-expand" not in mirror
    assert "setup-toggle" not in mirror
    assert "Active session title:" not in mirror
    assert "nexus-cli-mirror-active-title" not in mirror
    assert "titleInput.value = ''" in mirror
    assert "aria-expanded" in mirror
    assert "has-active-session" in css
    assert "is-minimized" in css
    assert ".nexus-cli-mirror-section-setup.is-minimized .nexus-cli-mirror-setup-header" in css
    assert "#nexus-cli-mirror-start:disabled" in css
    stop_block = mirror.split("async function _stopSession()", 1)[1].split("async function _interruptSession", 1)[0]
    assert "_updateSetupPanelUi" in stop_block
    assert "Start session" in mirror
    assert "Refresh sessions" in mirror
    assert "Stop session" in mirror
    assert "Send Ctrl+C" in mirror
    assert "Live Hermes transcript" in mirror
    assert "Send input to Hermes (/help, commands, or instructions…)" in mirror


def test_cli_mirror_minimized_panel_shows_stop_only():
    css = (REPO / "static/style.css").read_text(encoding="utf-8")
    assert ".nexus-cli-mirror-section-setup.is-minimized #nexus-cli-mirror-refresh" in css
    assert ".nexus-cli-mirror-section-setup.is-minimized .nexus-cli-mirror-session-row" in css
    assert ".nexus-cli-mirror-section-setup.is-minimized #nexus-cli-mirror-stop" in css
    assert "flex-direction: row" in css.split(".nexus-cli-mirror-section-setup.is-minimized .nexus-cli-mirror-control-row", 1)[1].split("}", 1)[0]
    mirror = MIRROR_JS.read_text(encoding="utf-8")
    assert "_setupPanelMinimized = false" in mirror
    click_block = mirror.split("function _onSetupPanelClick", 1)[1].split("function _updateInputState", 1)[0]
    assert "_isSetupPanelControlTarget" in click_block
    assert "_setSetupPanelMinimized(false)" in click_block
    assert "_setSetupPanelMinimized(true)" in click_block


def test_bridge_11b_switching_modes_does_not_stop_session():
    mirror = MIRROR_JS.read_text(encoding="utf-8")
    apply_block = mirror.split("function _applyInteractionMode(mode)", 1)[1].split("function _buildDom()", 1)[0]
    assert "_stopSession" not in apply_block
    assert "_closeStream()" in apply_block
    assert "savePersistedSessionId" in apply_block


def test_bridge_11b_reattach_on_return_to_cli_mirror():
    mirror = MIRROR_JS.read_text(encoding="utf-8")
    assert "_resumeCliMirror" in mirror
    assert "_fetchSessionMeta" in mirror
    assert "_loadTranscript()" in mirror.split("_resumeCliMirror", 1)[1]
    assert "Previous session not found" in mirror


def test_bridge_11b_no_duplicate_event_source_when_connected():
    mirror = MIRROR_JS.read_text(encoding="utf-8")
    assert "_streamAttachedSessionId" in mirror
    connect_block = mirror.split("function _connectStream()", 1)[1].split("async function _loadTranscript", 1)[0]
    assert "_streamAttachedSessionId === _sessionId" in connect_block


def test_bridge_11b_session_persistence_helpers_roundtrip():
    out = _node_eval(
        """
        import {
          savePersistedSessionId,
          loadPersistedSessionId,
          clearPersistedSessionId,
          loadPersistedInteractionMode,
          CLI_MIRROR_MODES,
        } from './static/js/nexusCliMirrorHelpers.js';

        const store = {};
        globalThis.localStorage = {
          getItem: (k) => store[k] ?? null,
          setItem: (k, v) => { store[k] = String(v); },
          removeItem: (k) => { delete store[k]; },
        };

        savePersistedSessionId('sess-abc');
        const loaded = loadPersistedSessionId();
        clearPersistedSessionId();
        const cleared = loadPersistedSessionId();
        globalThis.localStorage.setItem('console_interaction_mode', CLI_MIRROR_MODES.CLI_MIRROR);
        const mode = loadPersistedInteractionMode();
        console.log(JSON.stringify({ loaded, cleared, mode }));
        """
    )
    assert out["loaded"] == "sess-abc"
    assert out["cleared"] == ""
    assert out["mode"] == "cli_mirror"


def test_bridge_13_implementation_note_exists():
    assert BRIDGE_13_DOC.is_file()
    text = BRIDGE_13_DOC.read_text(encoding="utf-8")
    for phrase in (
        "Bridge 13",
        "registry",
        "transcript pagination",
        "Multi-console",
        "Manual smoke",
    ):
        assert phrase in text, f"missing in implementation note: {phrase}"


def test_bridge_13_session_list_sections_and_copy():
    mirror = MIRROR_JS.read_text(encoding="utf-8")
    css = (REPO / "static/style.css").read_text(encoding="utf-8")
    assert "Active session" in mirror
    assert "Stopped / viewable" in mirror
    assert "nexus-cli-mirror-session-section-title" in mirror
    assert "resume_unavailable_reason" in mirror
    assert "Load older transcript" in mirror
    assert "before_seq" in mirror


def test_cli_mirror_session_status_copy_cleanup():
    mirror = MIRROR_JS.read_text(encoding="utf-8")
    helpers = HELPERS_JS.read_text(encoding="utf-8")
    assert "No CLI Mirror session yet." in helpers
    assert "Use Simple Chat for separate one-shot requests from other devices" not in mirror
    assert "Use Simple Chat for separate one-shot requests from other devices" not in helpers
    assert "Multiple Console clients can attach to the same running session" not in mirror
    assert "Multiple Console clients may attach to the same active session" not in helpers
    assert "Idle cleanup not enabled" not in mirror
    assert "Idle cleanup not enabled" not in helpers
    assert "nexus-cli-mirror-multi-console-note" not in mirror
    assert "nexus-cli-mirror-session-empty" not in mirror
    assert "Start session" in mirror
    assert "Refresh sessions" in mirror
    assert "Stop session" in mirror
    assert "Send Ctrl+C" in mirror


def test_bridge_13_transcript_pagination_helpers():
    mirror = MIRROR_JS.read_text(encoding="utf-8")
    assert "_transcriptHasMoreBefore" in mirror
    assert "_renderTranscriptPaginationControls" in mirror
    assert "has_more_before" in mirror


def test_transcript_extracts_common_event_fields():
    out = _node_eval(
        """
        import { extractTranscriptText, classifyStreamEvent } from './static/js/nexusCliMirrorHelpers.js';
        const fromContent = extractTranscriptText({ content: 'Hello from Hermes.' });
        const fromDelta = extractTranscriptText({ delta: 'chunk text' });
        const fromPayload = extractTranscriptText({ payload: { content: 'nested content' } });
        const fromString = extractTranscriptText('plain string event');
        const empty = extractTranscriptText({ type: 'output', role: 'hermes' });
        const meta = classifyStreamEvent('hermes_output', { type: 'output', role: 'hermes' });
        console.log(JSON.stringify({ fromContent, fromDelta, fromPayload, fromString, empty, visible: meta.visible }));
        """
    )
    assert out["fromContent"] == "Hello from Hermes."
    assert out["fromDelta"] == "chunk text"
    assert out["fromPayload"] == "nested content"
    assert out["fromString"] == "plain string event"
    assert out["empty"] == ""
    assert out["visible"] is False


def test_transcript_skips_empty_label_only_rows():
    mirror = MIRROR_JS.read_text(encoding="utf-8")
    helpers = HELPERS_JS.read_text(encoding="utf-8")
    assert "hasVisibleTranscriptText" in helpers
    assert "_appendTranscriptEvent" in mirror
    assert "if (!chunkRaw && !alwaysShow.has(meta.category))" in mirror
    assert "nexus-cli-mirror-card-body body" not in mirror
    assert "msg-ai" not in helpers.split("CATEGORY_STYLES")[1].split("function _styleForCategory")[0]
    out = _node_eval(
        """
        import { classifyStreamEvent } from './static/js/nexusCliMirrorHelpers.js';
        const hermes = classifyStreamEvent('hermes_output', { type: 'output' });
        const response = classifyStreamEvent('output', { content: '   ' });
        console.log(JSON.stringify({ hermesVisible: hermes.visible, responseVisible: response.visible }));
        """
    )
    assert out["hermesVisible"] is False
    assert out["responseVisible"] is False


def test_continuous_transcript_stream_implementation_note_exists():
    doc = REPO / "docs/console_reform/cli_mirror_continuous_transcript_stream_rendering.md"
    assert doc.is_file()
    text = doc.read_text(encoding="utf-8")
    for phrase in (
        "CLI Mirror Continuous Transcript Stream Rendering Pass",
        "Matrix 1",
        "normalizeTerminalText",
        "createTranscriptPaintQueue",
        "Recommended live smoke test",
    ):
        assert phrase in text, f"missing in implementation note: {phrase}"


def test_continuous_transcript_grouping_helpers():
    out = _node_eval(
        """
        import {
          normalizeTranscriptGroupRole,
          shouldAppendToTranscriptGroup,
          classifyStreamEvent,
          getTranscriptGroupLabel,
          TRANSCRIPT_GROUP_ROLES,
        } from './static/js/nexusCliMirrorHelpers.js';

        const h1 = classifyStreamEvent('hermes_output', { text: 'line one' });
        const h2 = classifyStreamEvent('hermes_output', { text: 'line two' });
        const r1 = classifyStreamEvent('hermes_output', { text: 'Welcome to Hermes! Ask me anything and I will help you get started today.' });
        const r2 = classifyStreamEvent('response', { text: 'Here is a helpful tip for using the CLI mirror session.' });
        const u1 = classifyStreamEvent('hermes_input', { text: 'hello' });
        const s1 = classifyStreamEvent('session_status', { status: 'running', text: 'Session attached to Hermes PTY' });

        const roleH1 = normalizeTranscriptGroupRole(h1, 'hermes_output');
        const roleH2 = normalizeTranscriptGroupRole(h2, 'hermes_output');
        const roleR1 = normalizeTranscriptGroupRole(r1, 'hermes_output');
        const roleR2 = normalizeTranscriptGroupRole(r2, 'response');
        const roleU1 = normalizeTranscriptGroupRole(u1, 'hermes_input');
        const roleS1 = normalizeTranscriptGroupRole(s1, 'session_status');

        console.log(JSON.stringify({
          roleH1, roleH2, roleR1, roleR2, roleU1, roleS1,
          mergeHermes: shouldAppendToTranscriptGroup(roleH1, roleH2),
          mergeResponse: shouldAppendToTranscriptGroup(roleR1, roleR2),
          mergeHermesResponse: shouldAppendToTranscriptGroup(roleH1, roleR1),
          mergeResponseHermes: shouldAppendToTranscriptGroup(roleR1, roleH1),
          mergeUserHermes: shouldAppendToTranscriptGroup(roleU1, roleH1),
          labelHermes: getTranscriptGroupLabel(TRANSCRIPT_GROUP_ROLES.HERMES),
          labelResponse: getTranscriptGroupLabel(TRANSCRIPT_GROUP_ROLES.RESPONSE),
        }));
        """
    )
    assert out["roleH1"] == "hermes"
    assert out["roleH2"] == "hermes"
    assert out["roleR1"] == "response"
    assert out["roleR2"] == "response"
    assert out["roleU1"] == "user"
    assert out["roleS1"] == "system"
    assert out["mergeHermes"] is True
    assert out["mergeResponse"] is True
    assert out["mergeHermesResponse"] is False
    assert out["mergeResponseHermes"] is False
    assert out["mergeUserHermes"] is False
    assert out["labelHermes"] == "HERMES"
    assert out["labelResponse"] == "RESPONSE"


def test_response_role_grouping_refinement_implementation_note_exists():
    doc = REPO / "docs/console_reform/cli_mirror_response_role_grouping_refinement.md"
    assert doc.is_file()
    text = doc.read_text(encoding="utf-8")
    for phrase in (
        "CLI Mirror Response Role Grouping Refinement Pass",
        "Matrix 1",
        "RESPONSE",
        "Recommended live smoke test",
    ):
        assert phrase in text, f"missing in implementation note: {phrase}"


def test_response_role_grouping_refinement():
    out = _node_eval(
        """
        import {
          normalizeTranscriptGroupRole,
          shouldAppendToTranscriptGroup,
          classifyStreamEvent,
        } from './static/js/nexusCliMirrorHelpers.js';

        const prose = 'Welcome to Hermes! Ask me anything and I will help you get started today.';
        const h1 = classifyStreamEvent('hermes_output', { text: 'Hermes Agent v0.15.1' });
        const h2 = classifyStreamEvent('hermes_output', { text: 'Available Tools' });
        const r1 = classifyStreamEvent('hermes_output', { text: prose });
        const r2 = classifyStreamEvent('response', { text: prose + ' More tips here.' });
        const h3 = classifyStreamEvent('hermes_output', { text: '> ' });

        const roles = [
          normalizeTranscriptGroupRole(h1, 'hermes_output'),
          normalizeTranscriptGroupRole(h2, 'hermes_output'),
          normalizeTranscriptGroupRole(r1, 'hermes_output'),
          normalizeTranscriptGroupRole(r2, 'response'),
          normalizeTranscriptGroupRole(h3, 'hermes_output'),
        ];

        function groupCount(roleList) {
          let groups = 0;
          let prev = null;
          for (const role of roleList) {
            if (!shouldAppendToTranscriptGroup(prev, role)) groups += 1;
            prev = role;
          }
          return groups;
        }

        console.log(JSON.stringify({
          roles,
          hermesHermesMerge: shouldAppendToTranscriptGroup(roles[0], roles[1]),
          responseResponseMerge: shouldAppendToTranscriptGroup(roles[2], roles[3]),
          hermesResponseSplit: shouldAppendToTranscriptGroup(roles[1], roles[2]),
          responseHermesSplit: shouldAppendToTranscriptGroup(roles[3], roles[4]),
          threeGroupSequence: groupCount(roles),
        }));
        """
    )
    assert out["roles"] == ["hermes", "hermes", "response", "response", "hermes"]
    assert out["hermesHermesMerge"] is True
    assert out["responseResponseMerge"] is True
    assert out["hermesResponseSplit"] is False
    assert out["responseHermesSplit"] is False
    assert out["threeGroupSequence"] == 3


def test_continuous_transcript_split_word_and_newline_normalization():
    out = _node_eval(
        """
        import { normalizeTerminalText, extractTranscriptChunkRaw } from './static/js/nexusCliMirrorHelpers.js';

        const splitWord = normalizeTerminalText('ski' + 'lls');
        const joined = normalizeTerminalText('first' + 'second');
        const withNewline = normalizeTerminalText('line one\\nline two');
        const ansi = normalizeTerminalText('\\x1b[38;5;136mcolored\\x1b[0m');
        const orphanAnsi = normalizeTerminalText('[38;5;136mtext');
        const crRedraw = normalizeTerminalText('Loading...\\rDone');

        console.log(JSON.stringify({
          splitWord, joined, withNewline, ansi, orphanAnsi, crRedraw,
          deltaField: extractTranscriptChunkRaw({ delta: 'chunk text' }),
          payloadContent: extractTranscriptChunkRaw({ payload: { content: 'nested' } }),
        }));
        """
    )
    assert out["splitWord"] == "skills"
    assert out["joined"] == "firstsecond"
    assert out["withNewline"] == "line one\nline two"
    assert out["ansi"] == "colored"
    assert out["orphanAnsi"] == "text"
    assert out["crRedraw"] == "Done"
    assert out["deltaField"] == "chunk text"
    assert out["payloadContent"] == "nested"


def test_continuous_transcript_paint_queue_ordering():
    out = _node_eval(
        """
        import { createTranscriptPaintQueue } from './static/js/nexusCliMirrorHelpers.js';

        const flushed = [];
        const q = createTranscriptPaintQueue({
          onFlush: (text) => flushed.push(text),
          sliceSize: 2,
          maxPerFrame: 2,
          scheduleFrame: (fn) => { fn(); return 1; },
          cancelFrame: () => {},
        });

        q.enqueue('abcdefgh');
        q.enqueue('XY', { immediate: true });
        console.log(JSON.stringify({ flushed, pending: q.pending() }));
        """
    )
    assert out["flushed"] == ["abcd", "efgh", "XY"]
    assert out["pending"] == 0


def test_continuous_transcript_paint_queue_clears_on_reset():
    out = _node_eval(
        """
        import { createTranscriptPaintQueue } from './static/js/nexusCliMirrorHelpers.js';

        const flushed = [];
        const q = createTranscriptPaintQueue({
          onFlush: (text) => flushed.push(text),
          sliceSize: 4,
          maxPerFrame: 1,
          scheduleFrame: () => 99,
          cancelFrame: () => {},
        });
        q.enqueue('1234567890');
        q.clear();
        console.log(JSON.stringify({ flushed, pending: q.pending() }));
        """
    )
    assert out["flushed"] == []
    assert out["pending"] == 0


def test_continuous_transcript_stream_ui_static():
    mirror = MIRROR_JS.read_text(encoding="utf-8")
    css = (REPO / "static/style.css").read_text(encoding="utf-8")
    helpers = HELPERS_JS.read_text(encoding="utf-8")

    for needle in (
        "_appendTranscriptEvent",
        "_transcriptGroup",
        "appendTranscriptGroupBuffer",
        "nexus-cli-mirror-stream-body",
        "extractTranscriptChunkRaw",
        "normalizeTerminalText",
        "shouldAppendToTranscriptGroup",
    ):
        assert needle in mirror or needle in helpers or needle in css

    body_block = css.split(".nexus-cli-mirror-stream-body", 1)[1].split("}", 1)[0]
    hermes_body_block = css.split(".nexus-cli-mirror-stream-hermes .nexus-cli-mirror-stream-body", 1)[1].split("}", 1)[0]
    response_body_block = css.split(".nexus-cli-mirror-stream-response .nexus-cli-mirror-stream-body", 1)[1].split("}", 1)[0]
    assert "max-height: none" in body_block
    assert "white-space:pre" in hermes_body_block.replace(" ", "")
    assert "overflow-x: auto" in hermes_body_block
    assert "white-space: pre-wrap" in response_body_block
    assert "Send Ctrl+C" in mirror
    assert "Raw transcript" in mirror


def test_transcript_layout_polish_implementation_note_exists():
    doc = REPO / "docs/console_reform/cli_mirror_transcript_layout_polish_debug_toggle.md"
    assert doc.is_file()
    text = doc.read_text(encoding="utf-8")
    for phrase in (
        "CLI Mirror Transcript Layout Polish and Debug Toggle Pass",
        "Matrix 1",
        "Raw debug toggle",
        "Recommended live smoke test",
    ):
        assert phrase in text, f"missing in implementation note: {phrase}"


def test_transcript_layout_polish_terminal_formatting_css():
    css = (REPO / "static/style.css").read_text(encoding="utf-8")
    hermes = css.split(".nexus-cli-mirror-stream-hermes .nexus-cli-mirror-stream-body", 1)[1].split("}", 1)[0]
    response = css.split(".nexus-cli-mirror-stream-response .nexus-cli-mirror-stream-body", 1)[1].split("}", 1)[0]
    assert "white-space:pre" in hermes.replace(" ", "")
    assert "tab-size: 4" in hermes
    assert "font-variant-ligatures: none" in hermes
    assert "white-space: pre-wrap" in response
    assert "overflow-y: visible" in css.split(".nexus-cli-mirror-stream-body", 1)[1].split("}", 1)[0]


def test_transcript_layout_polish_raw_debug_toggle():
    mirror = MIRROR_JS.read_text(encoding="utf-8")
    css = (REPO / "static/style.css").read_text(encoding="utf-8")
    assert "nexus-cli-mirror-raw-toggle" in mirror
    assert "nexus-cli-mirror-raw-section" in mirror
    assert "nexus-cli-mirror-input-actions" in mirror
    assert ">db</button>" in mirror.replace(" ", "")
    assert "_setRawDebugVisible" in mirror
    assert "_toggleRawDebugVisible" in mirror
    assert "_setRawDebugVisible(false)" in mirror
    assert "nexus-cli-mirror-raw-toggle.is-active" in css
    assert "nexus-cli-mirror-raw-section.hidden" in css
    assert 'id="nexus-cli-mirror-raw-pre"' in mirror
    assert "formatRawDrawerLine" in HELPERS_JS.read_text(encoding="utf-8")
    input_block = mirror.split("nexus-cli-mirror-input-actions", 1)[1].split("</div>", 1)[0]
    assert "nexus-cli-mirror-send-btn" in input_block
    assert "nexus-cli-mirror-raw-toggle" in input_block


def test_transcript_layout_polish_expand_minimize():
    mirror = MIRROR_JS.read_text(encoding="utf-8")
    css = (REPO / "static/style.css").read_text(encoding="utf-8")
    assert "nexus-cli-mirror-transcript-expand" in mirror
    assert "_setTranscriptExpanded" in mirror
    assert "_toggleTranscriptExpanded" in mirror
    assert "nexus-cli-mirror-transcript-meta" in mirror
    assert "is-transcript-expanded" in css
    assert ".nexus-cli-mirror-panel.is-transcript-expanded .nexus-cli-mirror-header" in css
    assert ".nexus-cli-mirror-panel.is-transcript-expanded .nexus-cli-mirror-section-setup" in css
    assert "_setTranscriptExpanded(false)" in mirror


def test_hermes_grouping_truncation_tests_still_present():
    mirror = MIRROR_JS.read_text(encoding="utf-8")
    helpers = HELPERS_JS.read_text(encoding="utf-8")
    assert "appendTranscriptGroupBuffer" in mirror
    assert "simulateTranscriptGroupSequence" in helpers
    assert "shouldAppendToTranscriptGroup" in helpers


def test_send_input_compact_layout():
    mirror = MIRROR_JS.read_text(encoding="utf-8")
    css = (REPO / "static/style.css").read_text(encoding="utf-8")
    assert 'for="nexus-cli-mirror-input">Send input to Hermes</label>' not in mirror
    assert "This sends text into the live Core-owned Hermes CLI session." not in mirror
    assert "Send input to Hermes (/help, commands, or instructions…)" in mirror
    assert "nexus-cli-mirror-input-actions" in mirror
    assert ">db</button>" in mirror.replace(" ", "")
    assert "nexus-cli-mirror-send-btn" in mirror
    assert "nexus-cli-mirror-raw-toggle.is-active" in css
    assert ".nexus-cli-mirror-section-input.admin-card" in css
    assert "align-items: flex-end" in css.split(".nexus-cli-mirror-input-actions", 1)[1].split("}", 1)[0]
    assert "Start session" in mirror
    assert "Raw transcript" in mirror
    assert "Live Hermes transcript" in mirror


def test_send_input_compact_layout_implementation_note_exists():
    doc = REPO / "docs/console_reform/cli_mirror_send_input_compact_layout.md"
    assert doc.is_file()
    text = doc.read_text(encoding="utf-8")
    for phrase in (
        "CLI Mirror Send Input Panel Compact Layout Pass",
        "Matrix 1",
        "db",
        "Recommended live smoke test",
    ):
        assert phrase in text, f"missing in implementation note: {phrase}"


def test_transcript_border_metadata_polish_implementation_note_exists():
    doc = REPO / "docs/console_reform/cli_mirror_transcript_border_metadata_polish.md"
    assert doc.is_file()
    text = doc.read_text(encoding="utf-8")
    for phrase in (
        "CLI Mirror Transcript Border and Expanded Metadata Polish Pass",
        "Matrix 1",
        "border-color: transparent",
        "Recommended live smoke test",
    ):
        assert phrase in text, f"missing in implementation note: {phrase}"


def test_transcript_stream_group_borders_hidden():
    css = (REPO / "static/style.css").read_text(encoding="utf-8")
    group_block = css.split(".nexus-cli-mirror-stream-group {", 1)[1].split("}", 1)[0]
    assert "border:" in group_block
    assert "transparent" in group_block
    for role in ("hermes", "response", "user", "system", "error", "session"):
        role_block = css.split(f".nexus-cli-mirror-stream-{role} {{", 1)[1].split("}", 1)[0]
        assert "border-color:transparent" in role_block.replace(" ", "")
    assert "#2ecc71" not in css.split(".nexus-cli-mirror-stream-response {", 1)[1].split("}", 1)[0]
    transcript_block = css.split(".nexus-cli-mirror-transcript {", 1)[1].split("}", 1)[0]
    assert "border:" in transcript_block
    assert "border-color:transparent" not in transcript_block.replace(" ", "")


def test_transcript_expanded_metadata_inset():
    css = (REPO / "static/style.css").read_text(encoding="utf-8")
    meta_block = css.split(".nexus-cli-mirror-transcript-meta {", 1)[1].split("}", 1)[0]
    expanded_meta = css.split(
        ".nexus-cli-mirror-panel.is-transcript-expanded .nexus-cli-mirror-transcript-meta {", 1
    )[1].split("}", 1)[0]
    assert "right:" in meta_block
    assert "16px" in meta_block
    assert "padding-right:" in meta_block
    assert "18px" in expanded_meta


def test_transcript_role_formatting_unchanged_after_border_polish():
    css = (REPO / "static/style.css").read_text(encoding="utf-8")
    hermes = css.split(".nexus-cli-mirror-stream-hermes .nexus-cli-mirror-stream-body", 1)[1].split("}", 1)[0]
    response = css.split(".nexus-cli-mirror-stream-response .nexus-cli-mirror-stream-body", 1)[1].split("}", 1)[0]
    assert "white-space:pre" in hermes.replace(" ", "")
    assert "overflow-x:auto" in hermes.replace(" ", "")
    assert "white-space: pre-wrap" in response
    assert "getTranscriptGroupClass" in HELPERS_JS.read_text(encoding="utf-8")


def test_hermes_output_truncation_regression_implementation_note_exists():
    doc = REPO / "docs/console_reform/cli_mirror_hermes_output_truncation_regression_fix.md"
    assert doc.is_file()
    text = doc.read_text(encoding="utf-8")
    for phrase in (
        "CLI Mirror Hermes Output Truncation Regression Fix Pass",
        "Matrix 1",
        "paint queue",
        "Recommended live smoke test",
    ):
        assert phrase in text, f"missing in implementation note: {phrase}"


def test_hermes_startup_chunks_append_into_one_group():
    out = _node_eval(
        """
        import {
          classifyStreamEvent,
          simulateTranscriptGroupSequence,
        } from './static/js/nexusCliMirrorHelpers.js';

        const chunk1 = 'Hermes Agent v0.15.1\\nAvailable Tools\\nbrowser: browser_back, browser_click,\\n';
        const chunk2 = 'browser_dialog, clarify: clarify\\ncode_execution: execute_code\\n';
        const chunk3 = 'computer_use: computer_use\\ncronjob: cronjob\\n';

        const groups = simulateTranscriptGroupSequence([
          { meta: classifyStreamEvent('hermes_output', { text: chunk1 }), chunkRaw: chunk1 },
          { meta: classifyStreamEvent('hermes_output', { text: chunk2 }), chunkRaw: chunk2 },
          { meta: classifyStreamEvent('hermes_output', { text: chunk3 }), chunkRaw: chunk3 },
        ]);

        console.log(JSON.stringify({
          groupCount: groups.length,
          role: groups[0]?.role,
          text: groups[0]?.displayText,
        }));
        """
    )
    assert out["groupCount"] == 1
    assert out["role"] == "hermes"
    assert "Hermes Agent v0.15.1" in out["text"]
    assert "browser_dialog, clarify: clarify" in out["text"]
    assert "computer_use: computer_use" in out["text"]


def test_hermes_ansi_split_across_chunks():
    out = _node_eval(
        """
        import {
          classifyStreamEvent,
          simulateTranscriptGroupSequence,
        } from './static/js/nexusCliMirrorHelpers.js';

        const chunk1 = '\\u001b[38;5;136mAvailable Ski';
        const chunk2 = 'lls\\u001b[0m\\napple: apple-notes\\n';

        const groups = simulateTranscriptGroupSequence([
          { meta: classifyStreamEvent('hermes_output', { text: chunk1 }), chunkRaw: chunk1 },
          { meta: classifyStreamEvent('hermes_output', { text: chunk2 }), chunkRaw: chunk2 },
        ]);

        console.log(JSON.stringify({ text: groups[0]?.displayText }));
        """
    )
    assert "Available Skills" in out["text"]
    assert "apple: apple-notes" in out["text"]
    assert "[38;5;136m" not in out["text"]


def test_response_boundary_does_not_truncate_hermes():
    out = _node_eval(
        """
        import {
          classifyStreamEvent,
          simulateTranscriptGroupSequence,
        } from './static/js/nexusCliMirrorHelpers.js';

        const h1 = 'Hermes Agent v0.15.1\\nAvailable Tools\\n';
        const h2 = 'browser: browser_back, browser_click,\\n';
        const response = 'Welcome to Hermes Agent! Ask me anything and I will help you get started today.';

        const groups = simulateTranscriptGroupSequence([
          { meta: classifyStreamEvent('hermes_output', { text: h1 }), chunkRaw: h1 },
          { meta: classifyStreamEvent('hermes_output', { text: h2 }), chunkRaw: h2 },
          { meta: classifyStreamEvent('response', { text: response }), chunkRaw: response },
        ]);

        console.log(JSON.stringify({
          groupCount: groups.length,
          roles: groups.map((g) => g.role),
          hermesText: groups[0]?.displayText,
          responseText: groups[1]?.displayText,
        }));
        """
    )
    assert out["groupCount"] == 2
    assert out["roles"] == ["hermes", "response"]
    assert "Hermes Agent v0.15.1" in out["hermesText"]
    assert "browser: browser_back" in out["hermesText"]
    assert "Welcome to Hermes Agent" in out["responseText"]


def test_hermes_after_response_is_new_group():
    out = _node_eval(
        """
        import {
          classifyStreamEvent,
          simulateTranscriptGroupSequence,
        } from './static/js/nexusCliMirrorHelpers.js';

        const h1 = 'Hermes Agent v0.15.1\\n';
        const response = 'Welcome to Hermes Agent! Ask me anything and I will help you get started today.';
        const h2 = '> ';

        const groups = simulateTranscriptGroupSequence([
          { meta: classifyStreamEvent('hermes_output', { text: h1 }), chunkRaw: h1 },
          { meta: classifyStreamEvent('response', { text: response }), chunkRaw: response },
          { meta: classifyStreamEvent('hermes_output', { text: h2 }), chunkRaw: h2 },
        ]);

        console.log(JSON.stringify({
          groupCount: groups.length,
          roles: groups.map((g) => g.role),
          lastHermes: groups[2]?.displayText,
        }));
        """
    )
    assert out["groupCount"] == 3
    assert out["roles"] == ["hermes", "response", "hermes"]
    assert out["lastHermes"] == ">"


def test_paint_queue_flush_preserves_pending_text():
    out = _node_eval(
        """
        import { createTranscriptPaintQueue } from './static/js/nexusCliMirrorHelpers.js';

        const flushed = [];
        const q = createTranscriptPaintQueue({
          onFlush: (text) => flushed.push(text),
          sliceSize: 4,
          maxPerFrame: 1,
          scheduleFrame: () => 99,
          cancelFrame: () => {},
        });
        q.enqueue('abcdefgh');
        q.flush();
        console.log(JSON.stringify({ flushed, pending: q.pending() }));
        """
    )
    assert out["flushed"] == ["abcdefgh"]
    assert out["pending"] == 0


def test_hermes_similar_chunks_not_deduped_in_mirror():
    mirror = MIRROR_JS.read_text(encoding="utf-8")
    assert "shouldCollapseDuplicate" not in mirror
    assert "appendTranscriptGroupBuffer" in mirror


def test_send_echo_empty_response_fix_implementation_note_exists():
    doc = REPO / "docs/console_reform/cli_mirror_send_echo_empty_response_fix.md"
    assert doc.is_file()
    text = doc.read_text(encoding="utf-8")
    for phrase in (
        "CLI Mirror Send Echo and Empty Response Rendering Fix Pass",
        "Matrix 1",
        "resolveTranscriptChunkRaw",
        "Recommended live smoke test",
    ):
        assert phrase in text, f"missing in implementation note: {phrase}"


def test_user_input_echo_dedupe():
    out = _node_eval(
        """
        import {
          shouldSuppressUserInputEcho,
          classifyStreamEvent,
          simulateTranscriptGroupSequence,
        } from './static/js/nexusCliMirrorHelpers.js';

        const text = 'say hi! and tell me your name';
        const lastOptimistic = { text, sessionId: 'sess-1', at: Date.now() };
        const suppress = shouldSuppressUserInputEcho(text, {
          sessionId: 'sess-1',
          lastOptimistic,
        });
        const different = shouldSuppressUserInputEcho('other input', {
          sessionId: 'sess-1',
          lastOptimistic,
        });

        const optimistic = classifyStreamEvent('hermes_input', { text });
        const echoMeta = classifyStreamEvent('hermes_input', { text, type: 'input' });
        let groups = simulateTranscriptGroupSequence([
          { meta: optimistic, eventName: 'hermes_input', chunkRaw: text },
        ]);
        if (!shouldSuppressUserInputEcho(text, { sessionId: 'sess-1', lastOptimistic })) {
          groups = simulateTranscriptGroupSequence([
            { meta: optimistic, eventName: 'hermes_input', chunkRaw: text },
            { meta: echoMeta, eventName: 'hermes_input', chunkRaw: text },
          ]);
        }

        console.log(JSON.stringify({
          suppress,
          different,
          groupCount: groups.length,
          userText: groups[0]?.displayText,
        }));
        """
    )
    assert out["suppress"] is True
    assert out["different"] is False
    assert out["groupCount"] == 1
    assert out["userText"] == "say hi! and tell me your name"


def test_empty_hermes_event_does_not_create_visible_group():
    out = _node_eval(
        """
        import {
          classifyStreamEvent,
          simulateTranscriptGroupSequence,
          resolveTranscriptChunkRaw,
        } from './static/js/nexusCliMirrorHelpers.js';

        const empty = classifyStreamEvent('hermes_output', { type: 'hermes_output' });
        const emptyPayload = classifyStreamEvent('hermes_output', { type: 'hermes_output', payload: {} });
        const ansiOnly = classifyStreamEvent('hermes_output', { text: '\\x1b[2K\\x1b[0m' });
        const groups = simulateTranscriptGroupSequence([
          { meta: empty, eventName: 'hermes_output', payload: { type: 'hermes_output' } },
          { meta: emptyPayload, eventName: 'hermes_output', payload: { payload: {} } },
          { meta: ansiOnly, eventName: 'hermes_output', payload: { text: '\\x1b[2K\\x1b[0m' } },
        ]);

        console.log(JSON.stringify({
          emptyVisible: empty.visible,
          emptyPayloadVisible: emptyPayload.visible,
          ansiVisible: ansiOnly.visible,
          groupCount: groups.length,
          outputChunk: resolveTranscriptChunkRaw({ type: 'hermes_output', payload: { output: 'hello' } }),
        }));
        """
    )
    assert out["emptyVisible"] is False
    assert out["emptyPayloadVisible"] is False
    assert out["ansiVisible"] is False
    assert out["groupCount"] == 0
    assert out["outputChunk"] == "hello"


def test_nested_payload_extraction_renders_hermes_and_response():
    out = _node_eval(
        """
        import {
          classifyStreamEvent,
          simulateTranscriptGroupSequence,
          extractTranscriptChunkRaw,
        } from './static/js/nexusCliMirrorHelpers.js';

        const hMeta = classifyStreamEvent('hermes_output', { type: 'hermes_output', payload: { output: 'hello' } });
        const rMeta = classifyStreamEvent('response', { payload: { content: 'Hi Brett' } });
        const aMeta = classifyStreamEvent('assistant', { data: { message: 'Hello' } });
        const chunkMeta = classifyStreamEvent('hermes_output', { data: { chunk: 'partial' } });

        const groups = simulateTranscriptGroupSequence([
          { meta: hMeta, eventName: 'hermes_output', payload: { payload: { output: 'hello' } } },
          { meta: rMeta, eventName: 'response', payload: { payload: { content: 'Hi Brett' } } },
          { meta: aMeta, eventName: 'assistant', payload: { data: { message: 'Hello' } } },
          { meta: chunkMeta, eventName: 'hermes_output', payload: { data: { chunk: 'partial' } } },
        ]);

        console.log(JSON.stringify({
          roles: groups.map((g) => g.role),
          texts: groups.map((g) => g.displayText),
          stdout: extractTranscriptChunkRaw({ stdout: 'status line' }),
        }));
        """
    )
    assert out["roles"] == ["hermes", "response", "hermes"]
    assert "hello" in out["texts"][0]
    assert "Hi Brett" in out["texts"][1]
    assert "Hello" in out["texts"][1]
    assert "partial" in out["texts"][2]
    assert out["stdout"] == "status line"


def test_send_input_handler_guards_and_echo_state():
    mirror = MIRROR_JS.read_text(encoding="utf-8")
    assert "_sendInFlight" in mirror
    assert "_lastOptimisticUser" in mirror
    assert "shouldSuppressUserInputEcho" in mirror
    assert "resolveTranscriptChunkRaw" in mirror
    assert "_pruneEmptyTranscriptGroup" in mirror
    send_block = mirror.split("async function _sendInput()", 1)[1].split("async function _copySessionId", 1)[0]
    assert "if (_sendInFlight) return" in send_block
    assert "_appendTranscriptEvent" in send_block
    assert '_renderCard(classifyStreamEvent(\'hermes_input\'' not in send_block


def test_transcript_rendering_cleanup_static():
    mirror = MIRROR_JS.read_text(encoding="utf-8")
    assert "Raw transcript" in mirror
    assert "Live Hermes transcript" in mirror
    assert "Start session" in mirror
    assert "HERMES" in HELPERS_JS.read_text(encoding="utf-8")


def test_hermes_answer_output_classification_implementation_note_exists():
    doc = REPO / "docs/console_reform/cli_mirror_hermes_answer_output_classification.md"
    assert doc.is_file()
    text = doc.read_text(encoding="utf-8")
    for phrase in (
        "CLI Mirror Hermes Answer Output Classification Pass",
        "Matrix 1",
        "Matrix 2",
        "Matrix 3",
        "classifyHermesOutputText",
        "Recommended live smoke test",
    ):
        assert phrase in text, f"missing in implementation note: {phrase}"


def test_hermes_output_classifier_wired_in_mirror():
    mirror = MIRROR_JS.read_text(encoding="utf-8")
    assert "createHermesOutputClassifier" in mirror
    assert "_hermesOutputClassifier" in mirror
    assert "outputClassifier: _hermesOutputClassifier" in mirror


def test_realish_hermes_output_answer_sequence_renders_response():
    out = _node_eval(
        """
        import {
          classifyStreamEvent,
          simulateTranscriptGroupSequence,
          createHermesOutputClassifier,
        } from './static/js/nexusCliMirrorHelpers.js';

        const userText = 'say hi! and tell me your name';
        const lastOptimisticUser = { text: userText, sessionId: 'sess-1', at: Date.now() };
        const classifier = createHermesOutputClassifier();

        const events = [
          { type: 'input', text: userText },
          { type: 'output', text: '● say hi! and tell me your name' },
          { type: 'output', text: 'gpt-5.3-chat │ 0/128K │ [░░░░░░░░░░] 0% │ 42m │ ⏱ 0s' },
          { type: 'output', text: '╭─ ⚕ Hermes ─────╮' },
          { type: 'output', text: "    hi! i'm ChatGPT 😄" },
          { type: 'output', text: '╰──────────────╯' },
          { type: 'output', text: '❯' },
          {
            type: 'output',
            text: 'Auxiliary title generation failed: HTTP 401: Incorrect API key provided: vck_secretkey1234567890',
          },
        ];

        const groups = simulateTranscriptGroupSequence(
          events.map((payload) => ({
            eventName: payload.type === 'input' ? 'hermes_input' : 'hermes_output',
            payload,
          })),
          { outputClassifier: classifier, lastOptimisticUser },
        );

        console.log(JSON.stringify({
          roles: groups.map((g) => g.role),
          texts: groups.map((g) => g.displayText),
        }));
        """
    )
    assert out["roles"][0] == "user"
    assert "response" in out["roles"]
    assert "warning" in out["roles"]
    response_idx = out["roles"].index("response")
    assert out["texts"][0] == "say hi! and tell me your name"
    assert "hi! i'm ChatGPT" in out["texts"][response_idx]
    assert "ChatGPT" in out["texts"][response_idx]
    warning_idx = out["roles"].index("warning")
    assert "vck_…" in out["texts"][warning_idx]
    assert "vck_secretkey" not in out["texts"][2]


def test_hermes_answer_box_content_classifies_as_response():
    out = _node_eval(
        """
        import {
          classifyStreamEvent,
          createHermesOutputClassifier,
        } from './static/js/nexusCliMirrorHelpers.js';

        const classifier = createHermesOutputClassifier();
        const opts = { outputClassifier: classifier, lastOptimisticUser: null };

        classifier.noteUserInput('say hi! and tell me your name');
        classifyStreamEvent('output', { text: '╭─ ⚕ Hermes ─────╮' }, opts);
        const answer = classifyStreamEvent('output', { text: "    hi! i'm ChatGPT 😄" }, opts);
        classifyStreamEvent('output', { text: '╰──────────────╯' }, opts);

        console.log(JSON.stringify({
          category: answer.category,
          visible: answer.visible,
          text: answer.text,
        }));
        """
    )
    assert out["category"] == "final_like"
    assert out["visible"] is True
    assert "hi! i'm ChatGPT" in out["text"]


def test_output_user_echo_suppressed_by_classifier():
    out = _node_eval(
        """
        import {
          classifyStreamEvent,
          createHermesOutputClassifier,
        } from './static/js/nexusCliMirrorHelpers.js';

        const classifier = createHermesOutputClassifier();
        const lastOptimisticUser = {
          text: 'say hi! and tell me your name',
          sessionId: 'sess-1',
          at: Date.now(),
        };
        const meta = classifyStreamEvent(
          'output',
          { text: '● say hi! and tell me your name' },
          { outputClassifier: classifier, lastOptimisticUser },
        );

        console.log(JSON.stringify({ visible: meta.visible, category: meta.category }));
        """
    )
    assert out["visible"] is False


def test_status_progress_visible_as_hermes_not_response():
    out = _node_eval(
        """
        import {
          classifyStreamEvent,
          createHermesOutputClassifier,
        } from './static/js/nexusCliMirrorHelpers.js';

        const classifier = createHermesOutputClassifier();
        const status = classifyStreamEvent(
          'output',
          { text: 'gpt-5.3-chat │ 0/128K │ [░░░░░░░░░░] 0% │ 42m │ ⏱ 0s' },
          { outputClassifier: classifier },
        );
        const interrupt = classifyStreamEvent(
          'output',
          { text: '⚕ ❯ msg=interrupt · /queue · /bg · /steer · Ctrl+C cancel' },
          { outputClassifier: classifier },
        );
        const ruminating = classifyStreamEvent(
          'output',
          { text: '(⌐■_■) ruminating…' },
          { outputClassifier: classifier },
        );

        console.log(JSON.stringify({
          statusCategory: status.category,
          statusVisible: status.visible,
          interruptVisible: interrupt.visible,
          ruminatingVisible: ruminating.visible,
          ruminatingCategory: ruminating.category,
        }));
        """
    )
    assert out["statusVisible"] is True
    assert out["statusCategory"] == "hermes_output"
    assert out["interruptVisible"] is True
    assert out["ruminatingVisible"] is True
    assert out["ruminatingCategory"] == "hermes_output"


def test_status_progress_chrome_not_response():
    """Backward-compatible alias for renamed full-fidelity visibility test."""
    test_status_progress_visible_as_hermes_not_response()


def test_startup_banner_remains_hermes_with_classifier():
    out = _node_eval(
        """
        import {
          classifyStreamEvent,
          simulateTranscriptGroupSequence,
          createHermesOutputClassifier,
        } from './static/js/nexusCliMirrorHelpers.js';

        const classifier = createHermesOutputClassifier();
        const opts = { outputClassifier: classifier };

        const h1 = classifyStreamEvent('hermes_output', { text: 'Hermes Agent v0.15.1' }, opts);
        const h2 = classifyStreamEvent('hermes_output', { text: 'Available Tools' }, opts);

        const groups = simulateTranscriptGroupSequence([
          { meta: h1, chunkRaw: 'Hermes Agent v0.15.1' },
          { meta: h2, chunkRaw: 'Available Tools' },
        ]);

        console.log(JSON.stringify({
          h1Category: h1.category,
          h2Category: h2.category,
          roles: groups.map((g) => g.role),
        }));
        """
    )
    assert out["h1Category"] == "hermes_output"
    assert out["h2Category"] in ("tool_like", "hermes_output")
    assert out["roles"] == ["hermes"]


def test_auxiliary_title_warning_not_response():
    out = _node_eval(
        """
        import {
          classifyStreamEvent,
          createHermesOutputClassifier,
        } from './static/js/nexusCliMirrorHelpers.js';

        const classifier = createHermesOutputClassifier();
        const meta = classifyStreamEvent(
          'output',
          {
            text: 'Auxiliary title generation failed: HTTP 401: Incorrect API key provided: vck_abc123xyz',
          },
          { outputClassifier: classifier },
        );

        console.log(JSON.stringify({
          category: meta.category,
          visible: meta.visible,
          text: meta.text,
        }));
        """
    )
    assert out["category"] == "warning"
    assert out["visible"] is True
    assert "Auxiliary title generation failed" in out["text"]
    assert out["category"] != "final_like"
    assert "vck_…" in out["text"]


def test_control_only_chunks_skip_without_blank_groups():
    out = _node_eval(
        """
        import {
          classifyStreamEvent,
          simulateTranscriptGroupSequence,
          createHermesOutputClassifier,
        } from './static/js/nexusCliMirrorHelpers.js';

        const classifier = createHermesOutputClassifier();
        const ansiOnly = classifyStreamEvent(
          'hermes_output',
          { text: '\\x1b[2K\\x1b[0m' },
          { outputClassifier: classifier },
        );
        const events = [
          { text: '❯' },
          { text: '────────────────────────' },
          { text: '(⌐■_■) ruminating…' },
        ].map((payload) => ({
          eventName: 'hermes_output',
          payload,
        }));

        const groups = simulateTranscriptGroupSequence(events, { outputClassifier: classifier });
        console.log(JSON.stringify({
          ansiVisible: ansiOnly.visible,
          groupCount: groups.length,
          hermesText: groups[0]?.displayText,
        }));
        """
    )
    assert out["ansiVisible"] is False
    assert out["groupCount"] == 1
    assert "ruminating" in out["hermesText"]


def test_prompt_status_redraws_do_not_create_blank_groups():
    """Backward-compatible alias — meaningful CLI lines are now visible HERMES."""
    test_control_only_chunks_skip_without_blank_groups()


def test_transcript_classification_regression_stabilization_implementation_note_exists():
    doc = REPO / "docs/console_reform/cli_mirror_transcript_classification_regression_stabilization.md"
    assert doc.is_file()
    text = doc.read_text(encoding="utf-8")
    for phrase in (
        "CLI Mirror Transcript Classification Regression Stabilization Pass",
        "Matrix 1",
        "Matrix 2",
        "Matrix 3",
        "isHermesStartupBannerText",
        "Recommended live smoke test",
    ):
        assert phrase in text, f"missing in implementation note: {phrase}"


def test_startup_banner_stays_hermes_with_classifier():
    out = _node_eval(
        """
        import {
          classifyStreamEvent,
          simulateTranscriptGroupSequence,
          createHermesOutputClassifier,
        } from './static/js/nexusCliMirrorHelpers.js';

        const classifier = createHermesOutputClassifier();
        const opts = { outputClassifier: classifier };
        const chunk1 = 'Hermes Agent v0.15.1\\nAvailable Tools\\nbrowser: browser_back, browser_click,\\n';
        const chunk2 = 'browser_dialog, clarify: clarify\\ncode_execution: execute_code\\n';

        const h1 = classifyStreamEvent('hermes_output', { text: chunk1 }, opts);
        const h2 = classifyStreamEvent('hermes_output', { text: chunk2 }, opts);
        const state = classifier.getState();

        const groups = simulateTranscriptGroupSequence([
          { meta: h1, chunkRaw: chunk1 },
          { meta: h2, chunkRaw: chunk2 },
        ]);

        console.log(JSON.stringify({
          h1Category: h1.category,
          h2Category: h2.category,
          roles: groups.map((g) => g.role),
          inAnswerBox: state.inHermesAnswerBox,
          hasUserSentInput: state.hasUserSentInput,
          text: groups[0]?.displayText,
        }));
        """
    )
    assert out["h1Category"] == "hermes_output"
    assert out["h2Category"] == "hermes_output"
    assert out["roles"] == ["hermes"]
    assert out["inAnswerBox"] is False
    assert out["hasUserSentInput"] is False
    assert "Hermes Agent v0.15.1" in out["text"]
    assert "Available Tools" in out["text"]


def test_startup_welcome_and_tip_separate_from_hermes_banner():
    out = _node_eval(
        """
        import {
          classifyStreamEvent,
          simulateTranscriptGroupSequence,
          createHermesOutputClassifier,
        } from './static/js/nexusCliMirrorHelpers.js';

        const classifier = createHermesOutputClassifier();
        const opts = { outputClassifier: classifier };
        const banner = 'Hermes Agent v0.15.1\\nAvailable Tools\\nbrowser: browser_back\\n';
        const welcome = 'Welcome to Hermes Agent! Type your message or /help for commands.';
        const tip = 'Tip: /agents lists available agents.';

        const hMeta = classifyStreamEvent('hermes_output', { text: banner }, opts);
        const wMeta = classifyStreamEvent('hermes_output', { text: welcome }, opts);
        const tMeta = classifyStreamEvent('hermes_output', { text: tip }, opts);

        const groups = simulateTranscriptGroupSequence([
          { meta: hMeta, chunkRaw: banner },
          { meta: wMeta, chunkRaw: welcome },
          { meta: tMeta, chunkRaw: tip },
        ]);

        console.log(JSON.stringify({
          roles: groups.map((g) => g.role),
          texts: groups.map((g) => g.displayText),
        }));
        """
    )
    assert out["roles"] == ["hermes", "response"]
    assert "Hermes Agent v0.15.1" in out["texts"][0]
    assert "Welcome to Hermes Agent" in out["texts"][1]
    assert "Tip:" in out["texts"][1]


def test_answer_box_inactive_before_user_input():
    out = _node_eval(
        """
        import {
          classifyStreamEvent,
          createHermesOutputClassifier,
        } from './static/js/nexusCliMirrorHelpers.js';

        const classifier = createHermesOutputClassifier();
        const opts = { outputClassifier: classifier };

        classifyStreamEvent('output', { text: '╭─ ⚕ Hermes ─────╮' }, opts);
        const prose = classifyStreamEvent('output', { text: "    hi! i'm ChatGPT 😄" }, opts);

        console.log(JSON.stringify({
          category: prose.category,
          visible: prose.visible,
          inAnswerBox: classifier.getState().inHermesAnswerBox,
        }));
        """
    )
    assert out["inAnswerBox"] is False
    assert out["category"] != "final_like" or out["visible"] is False


def test_optimistic_user_not_suppressed_by_echo_dedupe():
    mirror = MIRROR_JS.read_text(encoding="utf-8")
    assert "optimistic: true" in mirror
    assert "nonPrunable" in mirror
    send_block = mirror.split("async function _sendInput()", 1)[1].split("async function _copySessionId", 1)[0]
    assert "optimistic: true" in send_block
    assert "!optimistic" in mirror


def test_user_input_stability_sequence():
    out = _node_eval(
        """
        import {
          classifyStreamEvent,
          simulateTranscriptGroupSequence,
          createHermesOutputClassifier,
          shouldSuppressUserInputEcho,
        } from './static/js/nexusCliMirrorHelpers.js';

        const userText = 'say hi! and tell me your name';
        const lastOptimisticUser = { text: userText, sessionId: 'sess-1', at: Date.now() };
        const classifier = createHermesOutputClassifier();
        classifier.noteUserInput(userText);

        const userMeta = classifyStreamEvent('hermes_input', { text: userText }, {
          outputClassifier: classifier,
          lastOptimisticUser,
        });
        const echoMeta = classifyStreamEvent('hermes_input', { text: userText, type: 'input' }, {
          outputClassifier: classifier,
          lastOptimisticUser,
        });
        const suppress = shouldSuppressUserInputEcho(userText, {
          sessionId: 'sess-1',
          lastOptimistic: lastOptimisticUser,
        });

        const groups = simulateTranscriptGroupSequence([
          { meta: userMeta, eventName: 'hermes_input', chunkRaw: userText },
        ]);

        console.log(JSON.stringify({
          suppress,
          groupCount: groups.length,
          userText: groups[0]?.displayText,
        }));
        """
    )
    assert out["suppress"] is True
    assert out["groupCount"] == 1
    assert out["userText"] == "say hi! and tell me your name"


def test_answer_box_state_persistence_implementation_note_exists():
    doc = REPO / "docs/console_reform/cli_mirror_answer_box_state_persistence_startup_prose_fix.md"
    assert doc.is_file()
    text = doc.read_text(encoding="utf-8")
    for phrase in (
        "CLI Mirror Answer Box State Persistence and Startup Prose Fix Pass",
        "Matrix 1",
        "Matrix 2",
        "Matrix 3",
        "no sequence numbers",
        "Recommended live smoke test",
    ):
        assert phrase in text, f"missing in implementation note: {phrase}"


def test_answer_box_state_survives_chrome_and_delayed_input_echo():
    out = _node_eval(
        """
        import {
          classifyStreamEvent,
          simulateTranscriptGroupSequence,
          createHermesOutputClassifier,
        } from './static/js/nexusCliMirrorHelpers.js';

        const userText = 'say hello! and what is your name';
        const lastOptimisticUser = { text: userText, sessionId: 'sess-1', at: Date.now() };
        const classifier = createHermesOutputClassifier();
        const opts = { outputClassifier: classifier, lastOptimisticUser, sessionId: 'sess-1' };

        // Dynamic event sequence — labels are not runtime sequence numbers
        const events = [
          { type: 'input', text: userText },
          { type: 'output', text: '╭─ ⚕ Hermes ─────────────────────────╮' },
          { type: 'output', text: 'gpt-5.3-chat │ 0/128K │ [░░░░░░░░░░] 0% │ 22s │ ⏱ 1s' },
          { type: 'output', text: '⚕ ❯ msg=interrupt · /queue · /bg · /steer · Ctrl+C cancel' },
          { type: 'input', text: userText },
          { type: 'output', text: '    hey! 👋 i\\'m chatgpt (you can just call me gpt if you want)' },
          { type: 'output', text: 'gpt-5.3-chat │ 0/128K │ [░░░░░░░░░░] 0% │ 25s │ ⏱ 2s' },
          { type: 'output', text: '    what should i call you?' },
          { type: 'output', text: '╰────────────────────────────────────╯' },
          { type: 'output', text: '❯' },
        ];

        const groups = simulateTranscriptGroupSequence(
          events.map((payload) => ({
            eventName: payload.type === 'input' ? 'hermes_input' : 'hermes_output',
            payload,
          })),
          { outputClassifier: classifier, lastOptimisticUser, sessionId: 'sess-1' },
        );

        console.log(JSON.stringify({
          roles: groups.map((g) => g.role),
          responseText: groups.find((g) => g.role === 'response')?.displayText,
          inBox: classifier.getState().inHermesAnswerBox,
        }));
        """
    )
    assert out["roles"] == ["user", "hermes", "response", "hermes"]
    assert "hey!" in out["responseText"]
    assert "chatgpt" in out["responseText"]
    assert "what should i call you?" in out["responseText"]
    assert out["inBox"] is False


def test_full_fidelity_transcript_visibility_implementation_note_exists():
    doc = REPO / "docs/console_reform/cli_mirror_full_fidelity_transcript_visibility.md"
    assert doc.is_file()
    text = doc.read_text(encoding="utf-8")
    for phrase in (
        "CLI Mirror Full Fidelity Hermes Transcript Visibility Pass",
        "Matrix 1",
        "Matrix 2",
        "Matrix 3",
        "Matrix 4",
        "no sequence numbers",
        "Recommended live smoke test",
    ):
        assert phrase in text, f"missing in implementation note: {phrase}"


def test_full_fidelity_hermes_activity_visibility():
    out = _node_eval(
        """
        import {
          classifyStreamEvent,
          simulateTranscriptGroupSequence,
          createHermesOutputClassifier,
        } from './static/js/nexusCliMirrorHelpers.js';

        const userText = 'say hello! and what is your name';
        const lastOptimisticUser = { text: userText, sessionId: 'sess-1', at: Date.now() };
        const classifier = createHermesOutputClassifier();
        const opts = { outputClassifier: classifier, lastOptimisticUser, sessionId: 'sess-1' };

        classifier.noteUserInput(userText);

        const activity = [
          { text: 'gpt-5.3-chat │ ctx – │ [░░░░░░░░░░] – │ 19s │ ⏲ 0s' },
          { text: '⚕ ❯ msg=interrupt · /queue · /bg · /steer · Ctrl+C cancel' },
          { text: '(⌐■_■) ruminating…' },
          { text: 'gpt-5.3-chat │ 15.1K/128K │ [█░░░░░░░░░] 12% │ 22s │ ⏲ 1s' },
        ];

        const metas = activity.map((payload) =>
          classifyStreamEvent('output', payload, opts),
        );

        const groups = simulateTranscriptGroupSequence(
          activity.map((payload, i) => ({
            eventName: 'hermes_output',
            payload,
            meta: metas[i],
          })),
          opts,
        );

        console.log(JSON.stringify({
          allVisible: metas.every((m) => m.visible),
          allHermes: metas.every((m) => m.category === 'hermes_output'),
          groupCount: groups.length,
          hermesText: groups[0]?.displayText,
        }));
        """
    )
    assert out["allVisible"] is True
    assert out["allHermes"] is True
    assert out["groupCount"] == 1
    assert "ruminating" in out["hermesText"]
    assert "msg=interrupt" in out["hermesText"]


def test_answer_box_with_visible_hermes_between_answer_lines():
    out = _node_eval(
        """
        import {
          classifyStreamEvent,
          simulateTranscriptGroupSequence,
          createHermesOutputClassifier,
        } from './static/js/nexusCliMirrorHelpers.js';

        const userText = 'say hello! and what is your name';
        const lastOptimisticUser = { text: userText, sessionId: 'sess-1', at: Date.now() };
        const classifier = createHermesOutputClassifier();
        const opts = { outputClassifier: classifier, lastOptimisticUser, sessionId: 'sess-1' };

        const events = [
          { type: 'input', text: userText },
          { type: 'output', text: '╭─ ⚕ Hermes ─────╮' },
          { type: 'output', text: 'gpt-5.3-chat │ 0/128K │ [░░░░░░░░░░] 0% │ 22s │ ⏱ 1s' },
          { type: 'output', text: '⚕ ❯ msg=interrupt · /queue · /bg · /steer · Ctrl+C cancel' },
          { type: 'output', text: '    hey! 👋 i\\'m chatgpt (you can just call me gpt if you want)' },
          { type: 'output', text: 'gpt-5.3-chat │ 15.1K/128K │ [█░░░░░░░░░] 12% │ 25s │ ⏲ 2s' },
          { type: 'output', text: '    what should i call you?' },
          { type: 'output', text: '╰────────────────────────╯' },
        ];

        const groups = simulateTranscriptGroupSequence(
          events.map((payload) => ({
            eventName: payload.type === 'input' ? 'hermes_input' : 'hermes_output',
            payload,
          })),
          opts,
        );

        console.log(JSON.stringify({
          roles: groups.map((g) => g.role),
          hermesText: groups.find((g) => g.role === 'hermes')?.displayText,
          responseText: groups.find((g) => g.role === 'response')?.displayText,
        }));
        """
    )
    assert out["roles"] == ["user", "hermes", "response"]
    assert "msg=interrupt" in out["hermesText"]
    assert "hey!" in out["responseText"]
    assert "what should i call you?" in out["responseText"]


def test_startup_tip_with_glyph_classifies_as_response():
    out = _node_eval(
        """
        import {
          classifyStreamEvent,
          createHermesOutputClassifier,
        } from './static/js/nexusCliMirrorHelpers.js';

        const classifier = createHermesOutputClassifier();
        const tip = '✦ Tip: context.engine in config.yaml can be set to a plugin name for alternative context management strategies.';
        const meta = classifyStreamEvent('hermes_output', { text: tip }, { outputClassifier: classifier });

        console.log(JSON.stringify({ category: meta.category, text: meta.text }));
        """
    )
    assert out["category"] == "final_like"
    assert out["text"].startswith("Tip:")
    assert "context.engine" in out["text"]


def test_startup_welcome_and_glyph_tip_merge_as_response():
    out = _node_eval(
        """
        import {
          classifyStreamEvent,
          simulateTranscriptGroupSequence,
          createHermesOutputClassifier,
        } from './static/js/nexusCliMirrorHelpers.js';

        const classifier = createHermesOutputClassifier();
        const opts = { outputClassifier: classifier };
        const banner = 'Hermes Agent v0.15.1\\nAvailable Tools\\nbrowser: browser_back\\n';
        const welcome = 'Welcome to Hermes Agent! Type your message or /help for commands.';
        const tip = '✦ Tip: context.engine in config.yaml can be set to a plugin name.';

        const groups = simulateTranscriptGroupSequence([
          { meta: classifyStreamEvent('hermes_output', { text: banner }, opts), chunkRaw: banner },
          { meta: classifyStreamEvent('hermes_output', { text: welcome }, opts), chunkRaw: welcome },
          { meta: classifyStreamEvent('hermes_output', { text: tip }, opts), chunkRaw: tip },
        ]);

        console.log(JSON.stringify({
          roles: groups.map((g) => g.role),
          texts: groups.map((g) => g.displayText),
        }));
        """
    )
    assert out["roles"] == ["hermes", "response"]
    assert "Hermes Agent v0.15.1" in out["texts"][0]
    assert "Welcome to Hermes Agent" in out["texts"][1]
    assert "Tip:" in out["texts"][1]
    assert "context.engine" in out["texts"][1]


def test_readable_pty_extraction_control_debris_suppression():
    out = _node_eval(
        """
        import {
          extractReadablePtyText,
          isControlDebrisOnly,
          classifyStreamEvent,
          simulateTranscriptGroupSequence,
          createHermesOutputClassifier,
        } from './static/js/nexusCliMirrorHelpers.js';

        const raw25h = '\\u001b[?12l\\u001b[?25h';
        const extracted = extractReadablePtyText(raw25h);
        const orphan = extractReadablePtyText('[?25h');
        const debrisSamples = ['[?7h', '[?2004h', '[?2004l', '[2 q', '[0 q', '[79C', '[4D', '[3A', '[K', '[J', '38;5;136m', '5;136m'];

        const classifier = createHermesOutputClassifier();
        classifier.noteUserInput('hi');
        const meta = classifyStreamEvent('hermes_output', { text: raw25h }, { outputClassifier: classifier });
        const groups = simulateTranscriptGroupSequence(
          [{ eventName: 'hermes_output', payload: { text: raw25h } }],
          { outputClassifier: classifier },
        );

        console.log(JSON.stringify({
          extracted,
          orphan,
          debrisOnly: debrisSamples.every((s) => isControlDebrisOnly(s)),
          metaVisible: meta.visible,
          groupCount: groups.length,
        }));
        """
    )
    assert out["extracted"] == ""
    assert out["orphan"] == ""
    assert out["debrisOnly"] is True
    assert out["metaVisible"] is False
    assert out["groupCount"] == 0


def test_meaningful_status_extraction_with_ansi():
    out = _node_eval(
        """
        import {
          extractReadablePtyText,
          classifyStreamEvent,
          createHermesOutputClassifier,
        } from './static/js/nexusCliMirrorHelpers.js';

        const raw = '\\x1b[38;5;136m\\x1b[38;5;173mgpt-5.3-chat │ ctx -- │ [░░░░░░░░░░] -- │ 11s │ ⏲ 0s\\x1b[0m';
        const display = extractReadablePtyText(raw);
        const classifier = createHermesOutputClassifier();
        classifier.noteUserInput('hi');
        const meta = classifyStreamEvent('hermes_output', { text: raw }, { outputClassifier: classifier });

        console.log(JSON.stringify({ display, category: meta.category, visible: meta.visible, text: meta.text }));
        """
    )
    assert "gpt-5.3-chat" in out["display"]
    assert out["visible"] is True
    assert out["category"] == "hermes_output"
    assert "gpt-5.3-chat" in out["text"]


def test_synthesizing_line_extraction():
    out = _node_eval(
        """
        import {
          classifyStreamEvent,
          createHermesOutputClassifier,
        } from './static/js/nexusCliMirrorHelpers.js';

        const classifier = createHermesOutputClassifier();
        classifier.noteUserInput('hi');
        const meta = classifyStreamEvent(
          'hermes_output',
          { text: '( •_•)>⌐■-■ synthesizing...' },
          { outputClassifier: classifier },
        );

        console.log(JSON.stringify({ category: meta.category, visible: meta.visible, text: meta.text }));
        """
    )
    assert out["visible"] is True
    assert out["category"] == "hermes_output"
    assert "synthesizing" in out["text"]


def test_answer_prose_extraction_persists_through_status_in_box():
    out = _node_eval(
        """
        import {
          classifyStreamEvent,
          simulateTranscriptGroupSequence,
          createHermesOutputClassifier,
        } from './static/js/nexusCliMirrorHelpers.js';

        const classifier = createHermesOutputClassifier();
        classifier.noteUserInput('hi! im brett. what is your name');
        const opts = { outputClassifier: classifier };

        const events = [
          { text: '╭─ ⚕ Hermes ─────╮' },
          { text: 'gpt-5.3-chat │ 15.1K/128K │ [█░░░░░░░░░] 12% │ 13s │ ⏲ 2s' },
          { text: '    hey brett! i\\'m chatgpt — you can call me whatever you want though 😄' },
          { text: '╰────────────────────────╯' },
        ];

        const groups = simulateTranscriptGroupSequence(
          events.map((payload) => ({ eventName: 'hermes_output', payload })),
          opts,
        );

        console.log(JSON.stringify({
          roles: groups.map((g) => g.role),
          texts: groups.map((g) => g.displayText),
        }));
        """
    )
    assert out["roles"] == ["hermes", "response"]
    assert "gpt-5.3-chat" in out["texts"][0]
    assert "hey brett!" in out["texts"][1]
    assert "chatgpt" in out["texts"][1]


def test_real_debug_post_send_sequence_readable_extraction():
    out = _node_eval(
        """
        import {
          classifyStreamEvent,
          simulateTranscriptGroupSequence,
          createHermesOutputClassifier,
        } from './static/js/nexusCliMirrorHelpers.js';

        const classifier = createHermesOutputClassifier();
        const userText = 'hi! im brett. what is your name';
        classifier.noteUserInput(userText);
        const opts = {
          outputClassifier: classifier,
          lastOptimisticUser: { text: userText, sessionId: 's1', at: Date.now() },
          sessionId: 's1',
        };

        const events = [
          { type: 'input', text: userText },
          { type: 'output', text: '\\u001b[?12l\\u001b[?25h' },
          { type: 'output', text: 'gpt-5.3-chat │ ctx -- │ [░░░░░░░░░░] -- │ 11s │ ⏲ 0s' },
          { type: 'output', text: '● hi! im brett. what is your name' },
          { type: 'output', text: '( •_•)>⌐■-■ synthesizing...' },
          { type: 'output', text: '╭─ ⚕ Hermes ─────╮' },
          { type: 'output', text: 'gpt-5.3-chat │ 15.1K/128K │ [█░░░░░░░░░] 12% │ 13s │ ⏲ 2s' },
          { type: 'output', text: '    hey brett! i\\'m chatgpt — you can call me whatever you want though 😄' },
          { type: 'output', text: '╰────────────────────────╯' },
          { type: 'output', text: 'Auxiliary title generation failed: HTTP 401: Incorrect API key provided: vck_abc123' },
        ];

        const groups = simulateTranscriptGroupSequence(
          events.map((p) => ({
            eventName: p.type === 'input' ? 'hermes_input' : 'hermes_output',
            payload: p,
          })),
          opts,
        );

        const allText = groups.map((g) => g.displayText).join('\\n');
        console.log(JSON.stringify({
          roles: groups.map((g) => g.role),
          texts: groups.map((g) => g.displayText),
          has25h: allText.includes('[?25h'),
        }));
        """
    )
    assert out["roles"] == ["user", "hermes", "response", "warning"]
    assert out["texts"][0] == "hi! im brett. what is your name"
    assert "synthesizing" in out["texts"][1] or "gpt-5.3-chat" in out["texts"][1]
    assert "hey brett!" in out["texts"][2]
    assert "chatgpt" in out["texts"][2]
    assert "Auxiliary title generation failed" in out["texts"][3]
    assert out["has25h"] is False


def test_startup_still_works_with_readable_extraction():
    out = _node_eval(
        """
        import {
          classifyStreamEvent,
          simulateTranscriptGroupSequence,
          createHermesOutputClassifier,
        } from './static/js/nexusCliMirrorHelpers.js';

        const classifier = createHermesOutputClassifier();
        const opts = { outputClassifier: classifier };
        const banner = 'Hermes Agent v0.15.1\\nAvailable Tools\\nbrowser: browser_back\\n';
        const welcome = 'Welcome to Hermes Agent! Type your message or /help for commands.';
        const tip = '✦ Tip: context.engine in config.yaml can be set to a plugin name.';
        const opener = '╭─ ⚕ Hermes ─────╮';

        const groups = simulateTranscriptGroupSequence([
          { meta: classifyStreamEvent('hermes_output', { text: banner }, opts), chunkRaw: banner },
          { meta: classifyStreamEvent('hermes_output', { text: welcome }, opts), chunkRaw: welcome },
          { meta: classifyStreamEvent('hermes_output', { text: tip }, opts), chunkRaw: tip },
          { meta: classifyStreamEvent('hermes_output', { text: opener }, opts), chunkRaw: opener },
        ]);

        console.log(JSON.stringify({
          roles: groups.map((g) => g.role),
          texts: groups.map((g) => g.displayText),
        }));
        """
    )
    assert out["roles"] == ["hermes", "response"]
    assert "Hermes Agent v0.15.1" in out["texts"][0]
    assert "Welcome to Hermes Agent" in out["texts"][1]
    assert "Tip:" in out["texts"][1]
    assert all("╭" not in t or "Hermes Agent" in t for t in out["texts"])


def test_readable_pty_extraction_stabilization_implementation_note_exists():
    doc = REPO / "docs/console_reform/cli_mirror_readable_pty_extraction_stabilization.md"
    assert doc.is_file()
    text = doc.read_text(encoding="utf-8")
    for phrase in (
        "CLI Mirror Readable PTY Extraction Stabilization Pass",
        "Matrix 1",
        "Matrix 2",
        "Matrix 3",
        "extractReadablePtyText",
        "isControlDebrisOnly",
        "does not use sequence numbers",
        "Recommended live smoke test",
    ):
        assert phrase in text, f"missing in implementation note: {phrase}"


def test_resolve_best_pty_payload_text_prefers_readable_field_over_control_text():
    out = _node_eval(
        """
        import {
          resolveBestPtyPayloadText,
          extractTranscriptChunkRaw,
          classifyStreamEvent,
          createHermesOutputClassifier,
        } from './static/js/nexusCliMirrorHelpers.js';

        const payload = {
          text: '\\u001b[?12l\\u001b[?25h',
          raw: '    hey brett! i\\'m chatgpt - but you can call me whatever you want :)',
        };
        const first = extractTranscriptChunkRaw(payload);
        const best = resolveBestPtyPayloadText(payload);

        const classifier = createHermesOutputClassifier();
        classifier.noteUserInput('hi! im brett. what is your name');
        classifyStreamEvent('hermes_output', { text: '\\u256d\\u2500 \\u2695 Hermes \\u2500\\u2500\\u256e' }, { outputClassifier: classifier });
        const meta = classifyStreamEvent('hermes_output', payload, {
          outputClassifier: classifier,
          lastOptimisticUser: { text: 'hi! im brett. what is your name', sessionId: 's1', at: Date.now() },
        });

        console.log(JSON.stringify({
          first: first.slice(0, 20),
          best: best.slice(0, 40),
          visible: meta.visible,
          category: meta.category,
          text: meta.text,
        }));
        """
    )
    assert "[?25h" in out["first"] or "\x1b" in out["first"]
    assert "hey brett!" in out["best"]
    assert out["visible"] is True
    assert "hey brett!" in out["text"]


def test_post_send_render_drop_fixture_with_split_payload_fields():
    out = _node_eval(
        """
        import {
          diagnoseTranscriptEvent,
          simulateTranscriptGroupSequence,
          createHermesOutputClassifier,
        } from './static/js/nexusCliMirrorHelpers.js';

        const userText = 'hi! im brett. what is your name';
        const classifier = createHermesOutputClassifier();
        classifier.noteUserInput(userText);
        const opts = {
          outputClassifier: classifier,
          lastOptimisticUser: { text: userText, sessionId: 's1', at: Date.now() },
          sessionId: 's1',
        };

        const events = [
          { type: 'input', text: userText },
          { type: 'output', text: '\\u001b[?12l\\u001b[?25h' },
          { type: 'output', text: '\\u001b[?25h', raw: 'gpt-5.3-chat \\u2502 ctx -- \\u2502 [\\u2591\\u2591\\u2591\\u2591\\u2591\\u2591\\u2591\\u2591\\u2591\\u2591] -- \\u2502 11s \\u2502 \\u23f2 0s' },
          { type: 'output', text: '\\u25cf hi! im brett. what is your name' },
          { type: 'output', text: '\\u001b[?25h', output: '\\u25c9_\\u25c9 musing...' },
          { type: 'output', text: '\\u001b[2K', raw: '\\u256d\\u2500 \\u2695 Hermes \\u2500\\u2500\\u2500\\u2500\\u256e' },
          { type: 'output', text: '[?25h', chunk: 'gpt-5.3-chat \\u2502 15.1K/128K \\u2502 [\\u2588\\u2591\\u2591\\u2591\\u2591\\u2591\\u2591\\u2591\\u2591\\u2591] 12% \\u2502 13s \\u2502 \\u23f2 2s' },
          { type: 'output', text: '\\u001b[?25h', raw: '    hey brett! i\\'m chatgpt - but you can call me whatever you want :)' },
          { type: 'output', text: '[?25h', output: '\\u2570\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u256f' },
          { type: 'output', text: 'Auxiliary title generation failed: HTTP 401: Incorrect API key provided: vck_abc123' },
        ];

        const diags = events
          .filter((e) => e.type === 'output')
          .map((payload) => diagnoseTranscriptEvent('hermes_output', payload, opts));

        const groups = simulateTranscriptGroupSequence(
          events.map((p) => ({
            eventName: p.type === 'input' ? 'hermes_input' : 'hermes_output',
            payload: p,
          })),
          opts,
        );

        const allText = groups.map((g) => g.displayText).join('\\n');
        console.log(JSON.stringify({
          roles: groups.map((g) => g.role),
          texts: groups.map((g) => g.displayText),
          visibleDiags: diags.filter((d) => d.visible).map((d) => ({ role: d.role, text: d.metaText.slice(0, 40) })),
          has25h: allText.includes('[?25h'),
          musingVisible: diags.some((d) => d.visible && d.metaText.includes('musing')),
        }));
        """
    )
    assert out["roles"] == ["user", "hermes", "response", "warning"]
    assert out["texts"][0] == "hi! im brett. what is your name"
    assert "musing" in out["texts"][1] or out["musingVisible"]
    assert "hey brett!" in out["texts"][2]
    assert "chatgpt" in out["texts"][2]
    assert "Auxiliary title generation failed" in out["texts"][3]
    assert out["has25h"] is False


def test_diagnose_transcript_event_reports_skip_reasons():
    out = _node_eval(
        """
        import {
          diagnoseTranscriptEvent,
          createHermesOutputClassifier,
        } from './static/js/nexusCliMirrorHelpers.js';

        const classifier = createHermesOutputClassifier();
        classifier.noteUserInput('hi');
        const opts = {
          outputClassifier: classifier,
          lastOptimisticUser: { text: 'hi', sessionId: 's1', at: Date.now() },
        };

        const debris = diagnoseTranscriptEvent('hermes_output', { text: '\\u001b[?25h' }, opts);
        const echo = diagnoseTranscriptEvent('hermes_output', { text: '\\u25cf hi' }, opts);
        const status = diagnoseTranscriptEvent('hermes_output', { text: '[?25h', raw: '\\u25c9_\\u25c9 musing...' }, opts);

        console.log(JSON.stringify({
          debrisSkip: debris.skipReason,
          echoSkip: echo.skipReason,
          statusVisible: status.visible,
          statusRole: status.role,
          statusDisplay: status.displayText,
        }));
        """
    )
    assert out["debrisSkip"] == "control_debris_or_empty"
    assert out["echoSkip"] == "user_output_echo"
    assert out["statusVisible"] is True
    assert out["statusRole"] == "hermes"
    assert "musing" in out["statusDisplay"]


def test_post_send_render_drop_implementation_note_exists():
    doc = REPO / "docs/console_reform/cli_mirror_post_send_render_drop_root_cause_fix.md"
    assert doc.is_file()
    text = doc.read_text(encoding="utf-8")
    for phrase in (
        "CLI Mirror Post-Send Render Drop Root-Cause Fix Pass",
        "resolveBestPtyPayloadText",
        "diagnoseTranscriptEvent",
        "does not use sequence numbers",
        "Recommended live smoke test",
    ):
        assert phrase in text, f"missing in implementation note: {phrase}"
