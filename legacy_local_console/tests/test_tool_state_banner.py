"""Focused checks for Simple Chat Web Search state banner and send-button wiring."""

import json
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
APP = REPO / "static/app.js"
BANNER = REPO / "static/js/toolStateBanner.js"
STYLE = REPO / "static/style.css"
SLASH = REPO / "static/js/slashCommands.js"
CLI_MIRROR = REPO / "static/js/nexusCliMirror.js"


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


def test_tool_state_banner_module_exports():
    text = BANNER.read_text(encoding="utf-8")
    assert "export function syncWebSearchStateBanner" in text
    assert "export function removeLegacyWebSearchSplashes" in text
    assert "web-search-state-banner" in text
    assert "tool-state-banner" in text


def test_app_wires_web_toggle_to_state_banner_not_splash():
    text = APP.read_text(encoding="utf-8")
    assert "from './js/toolStateBanner.js'" in text
    assert "syncWebSearchStateBanner(chk.checked)" in text
    assert "removeLegacyWebSearchSplashes()" in text
    assert "window.syncWebSearchStateBanner = syncWebSearchStateBanner" in text
    # Web toggle must not append splash cards to chat history
    setup = text.split("function setupToggle(")[1].split("setupToggle('web-toggle-btn'")[0]
    assert "stateKey === 'web'" in setup
    assert "_showToolSplash(stateKey)" not in setup.split("stateKey === 'web'")[1].split("else if")[0]


def test_send_button_new_chat_uses_preferred_model_helper():
    text = APP.read_text(encoding="utf-8")
    idx = text.index("sendBtn.dataset.mode === 'newchat'")
    block = text[idx : idx + 500]
    assert "_createDirectChatFromPreferredModel()" in block


def test_style_has_tool_state_exit_animation():
    text = STYLE.read_text(encoding="utf-8")
    assert "@keyframes tool-state-exit" in text
    assert ".chat-history > .tool-state-banner" in text


def test_banner_lives_in_chat_history_column():
    text = BANNER.read_text(encoding="utf-8")
    assert "history.insertBefore(_webBannerEl, history.firstChild)" in text
    assert "tool-splash tool-state-banner" in text


def test_message_count_excludes_state_banner():
    text = APP.read_text(encoding="utf-8")
    assert ":scope > .msg:not(.tool-state-banner)" in text


def test_slash_search_syncs_web_banner():
    text = SLASH.read_text(encoding="utf-8")
    assert "window.syncWebSearchStateBanner(true)" in text


def test_cli_mirror_send_button_untouched():
    text = CLI_MIRROR.read_text(encoding="utf-8")
    assert "toolStateBanner" not in text
    assert "syncWebSearchStateBanner" not in text


def test_web_search_banner_single_instance_toggle():
    out = _node_eval(
        r"""
import { syncWebSearchStateBanner, removeLegacyWebSearchSplashes } from './static/js/toolStateBanner.js';

function makeEl(tag = 'div') {
  const classes = new Set();
  const listeners = [];
  const el = {
    tagName: tag.toUpperCase(),
    id: '',
    className: '',
    innerHTML: '',
    style: {},
    dataset: {},
    parentNode: null,
    children: [],
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      contains: (c) => classes.has(c),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
    },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    insertBefore(node, ref) {
      const existing = this.children.indexOf(node);
      if (existing >= 0) this.children.splice(existing, 1);
      const idx = ref ? this.children.indexOf(ref) : this.children.length;
      this.children.splice(idx < 0 ? this.children.length : idx, 0, node);
      node.parentNode = this;
      return node;
    },
    remove() {
      if (this.parentNode) {
        const i = this.parentNode.children.indexOf(this);
        if (i >= 0) this.parentNode.children.splice(i, 1);
        this.parentNode = null;
      }
    },
    querySelector(sel) {
      if (sel === '.role') return { textContent: 'Web Search' };
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '.tool-splash') return legacySplashes;
      return [];
    },
    addEventListener(type, fn) { listeners.push({ type, fn }); },
    removeEventListener(type, fn) {
      const i = listeners.findIndex((l) => l.type === type && l.fn === fn);
      if (i >= 0) listeners.splice(i, 1);
    },
    getAnimations: () => [],
    setAttribute() {},
    getAttribute: () => null,
    dispatchAnimationEnd() {
      listeners.filter((l) => l.type === 'animationend').forEach((l) => {
        l.fn({ target: el, animationName: 'tool-state-exit' });
      });
    },
  };
  Object.defineProperty(el, 'className', {
    get: () => [...classes].join(' '),
    set: (v) => { classes.clear(); v.split(/\s+/).filter(Boolean).forEach((c) => classes.add(c)); },
  });
  Object.defineProperty(el, 'isConnected', {
    get: () => el.parentNode != null,
  });
  return el;
}

const container = makeEl();
const history = makeEl();
const legacySplashes = [makeEl(), makeEl()];
legacySplashes.forEach((n) => {
  const role = makeEl();
  role.textContent = 'Web Search';
  n.querySelector = (sel) => (sel === '.role' ? role : null);
  history.appendChild(n);
});
history.querySelectorAll = (sel) => {
  if (sel === '.tool-splash:not(.tool-state-banner)') return legacySplashes.filter((n) => n.parentNode);
  return [];
};
Object.defineProperty(history, 'firstChild', {
  get: () => history.children[0] || null,
});

global.MutationObserver = class { observe() {} disconnect() {} };

global.document = {
  getElementById(id) {
    if (id === 'chat-container') return container;
    if (id === 'chat-history') return history;
    if (id === 'web-toggle') return { checked: false };
    return null;
  },
  createElement(tag) { return makeEl(tag); },
};

removeLegacyWebSearchSplashes();
syncWebSearchStateBanner(true);
syncWebSearchStateBanner(true);
const bannersAfterOn = history.children.filter((c) => c.classList.contains('tool-state-banner'));
const visibleOn = bannersAfterOn.filter((b) => !b.classList.contains('hidden'));
const inHistory = bannersAfterOn.length > 0 && bannersAfterOn[0].parentNode === history;

syncWebSearchStateBanner(false);
bannersAfterOn[0]?.dispatchAnimationEnd();
const hiddenAfterOff = bannersAfterOn.every((b) => b.classList.contains('hidden'));

syncWebSearchStateBanner(true);
const bannersAfterReOn = history.children.filter((c) => c.classList.contains('tool-state-banner'));

console.log(JSON.stringify({
  legacyRemoved: legacySplashes.every((n) => n.parentNode == null),
  inHistory,
  bannerCountAfterDoubleOn: bannersAfterOn.length,
  visibleOnCount: visibleOn.length,
  hiddenAfterOff,
  bannerCountAfterReOn: bannersAfterReOn.length,
  sameNodeReused: bannersAfterReOn.length === 1 && bannersAfterReOn[0] === bannersAfterOn[0],
}));
"""
    )
    assert out["legacyRemoved"] is True
    assert out["inHistory"] is True
    assert out["bannerCountAfterDoubleOn"] == 1
    assert out["visibleOnCount"] == 1
    assert out["hiddenAfterOff"] is True
    assert out["bannerCountAfterReOn"] == 1
    assert out["sameNodeReused"] is True
