/**
 * legacy local console Mode — frontend UI classification and legacy surface gating (Package 15).
 * Fetches /api/nexus/v1/health for console_mode; hides local-execution controls.
 */

import { initNexusCliMirror } from './nexusCliMirror.js';

const HEALTH_URL = '/api/nexus/v1/health';

/** Static elements hidden when Console Mode is on (backend guards already block these routes). */
const HIDE_SELECTORS = [
  '#bash-toggle-btn',
  '#rail-research',
  '#tool-research-btn',
  '#email-compose-btn',
  '#memory-tidy-btn',
  '#memory-import-btn',
  '#add-skill-btn',
  '#skills-audit-btn',
  '#skills-bulk-publish',
  '#skills-bulk-audit',
  '#memory-session-option',
  '.memory-tab[data-memory-tab="add"]',
  '#library-new-doc-btn',
  '#doclib-tidy-btn',
];

/** Dynamic targets matched via CSS in style.css (data-act, task run, research start). */
const DYNAMIC_HIDE_SELECTORS = [
  '#research-start-btn',
  '[data-act="ai-reply"]',
  '[data-act="summarize"]',
  '.task-card-run-btn',
  '#documents-ai-tidy-btn',
  '.doc-ai-tidy-btn',
];

let _consoleMode = false;
let _initialized = false;
/** In-memory only — survives in-SPA mode switches; resets on full page reload. */
let _bannerDismissed = false;

export function isConsoleModeBannerDismissed() {
  return _bannerDismissed;
}

function _dismissConsoleModeBanner() {
  _bannerDismissed = true;
  const banner = document.getElementById('nexus-console-mode-banner');
  if (banner) banner.remove();
}

export function isNexusConsoleMode() {
  return _consoleMode;
}

export async function fetchConsoleModeFlag() {
  try {
    const res = await fetch(HEALTH_URL, { credentials: 'same-origin' });
    if (!res.ok) return false;
    const body = await res.json();
    return Boolean(body?.console_mode);
  } catch (_) {
    return false;
  }
}

function _hideElements(selectors) {
  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach((el) => {
      el.classList.add('nexus-console-hide');
      el.setAttribute('aria-hidden', 'true');
      if (el instanceof HTMLButtonElement) {
        el.disabled = true;
      }
    });
  }
}

function _injectBanner() {
  if (_bannerDismissed) return;
  if (document.getElementById('nexus-console-mode-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'nexus-console-mode-banner';
  banner.className = 'nexus-console-mode-banner';
  banner.setAttribute('role', 'status');
  banner.innerHTML =
    '<button type="button" class="nexus-console-mode-banner-dismiss" aria-label="Dismiss console mode banner">&times;</button>' +
    '<div class="nexus-console-mode-banner-content">' +
    '<span class="nexus-console-mode-banner-title">legacy local console Mode</span>' +
    '<span class="nexus-console-mode-banner-text">Local execution and canonical writes are routed through Nexus Core. Read-only and admin surfaces remain available.</span>' +
    '</div>';
  const dismissBtn = banner.querySelector('.nexus-console-mode-banner-dismiss');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      _dismissConsoleModeBanner();
    });
  }
  const host = document.querySelector('.chat-container') || document.getElementById('chat') || document.body;
  host.insertBefore(banner, host.firstChild);
}

function _relabelExecutionControls() {
  const agentBtn = document.getElementById('mode-agent-btn');
  if (agentBtn) {
    agentBtn.title = 'Agent tools are limited in legacy local console Mode — work is routed through Nexus Core';
  }
  const bashBtn = document.getElementById('bash-toggle-btn');
  if (bashBtn) {
    bashBtn.title = 'Disabled in legacy local console Mode';
  }
  const researchBtn = document.getElementById('tool-research-btn');
  if (researchBtn) {
    researchBtn.title = 'Deep Research start is disabled in legacy local console Mode';
  }
}

function _observeDynamicSurfaces() {
  const obs = new MutationObserver(() => {
    if (!_consoleMode) return;
    _hideElements(DYNAMIC_HIDE_SELECTORS);
  });
  obs.observe(document.body, { childList: true, subtree: true });
}

export function applyConsoleModeUi() {
  if (!_consoleMode) return;
  document.documentElement.classList.add('nexus-console-mode');
  document.body.classList.add('nexus-console-mode');
  _hideElements(HIDE_SELECTORS);
  _hideElements(DYNAMIC_HIDE_SELECTORS);
  _injectBanner();
  _relabelExecutionControls();
  _observeDynamicSurfaces();
}

/**
 * Load Console Mode flag and apply UI gating. Safe to call once at app startup.
 */
export async function initNexusConsoleMode() {
  if (_initialized) return _consoleMode;
  _initialized = true;
  _consoleMode = await fetchConsoleModeFlag();
  if (_consoleMode) {
    applyConsoleModeUi();
    try {
      await initNexusCliMirror();
    } catch (_) {
      /* non-fatal — Simple Chat remains available */
    }
  }
  try {
    const bridge = await import('./nexusBrowserChatBridge.js');
    await bridge.init();
    window.nexusBrowserChatBridge = bridge.default || bridge;
  } catch (_) {
    /* bridge optional until first chat send */
  }
  return _consoleMode;
}

export default {
  initNexusConsoleMode,
  isNexusConsoleMode,
  fetchConsoleModeFlag,
  applyConsoleModeUi,
  isConsoleModeBannerDismissed,
};
