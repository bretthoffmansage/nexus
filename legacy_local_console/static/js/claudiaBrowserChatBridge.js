/**
 * legacy local console browser chat bridge — routes Chat mode through Gateway/Core
 * when Core model config is available. Never calls Hermes or local model endpoints.
 */

import { fetchConsoleModeFlag } from './nexusConsoleMode.js';

const MODEL_CONFIG_URL = '/api/nexus/v1/model-config';
const MESSAGES_URL = '/api/nexus/v1/messages';

export const EMPTY_CONTENT_FALLBACK =
  'Nexus Core responded, but no assistant content was returned.';

let _consoleMode = false;
let _coreConfigured = false;
let _initPromise = null;

export async function init() {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    _consoleMode = await fetchConsoleModeFlag();
    try {
      const res = await fetch(MODEL_CONFIG_URL, { credentials: 'same-origin' });
      if (res.ok) {
        const body = await res.json();
        _coreConfigured = body.core_configured === true;
      } else {
        _coreConfigured = false;
      }
    } catch (_) {
      _coreConfigured = false;
    }
    return { consoleMode: _consoleMode, coreConfigured: _coreConfigured };
  })();
  return _initPromise;
}

/** Use Gateway→Core chat bridge (Core URL configured on Console). */
export function shouldUseBridge() {
  return _coreConfigured;
}

export function isConsoleMode() {
  return _consoleMode;
}

export function getCoreUnavailableMessage() {
  if (!_coreConfigured && _consoleMode) {
    return (
      'Nexus Core is not configured. Set NEXUS_CORE_URL on the Console Gateway ' +
      'and ensure Core is running.'
    );
  }
  return 'Nexus Core is unavailable. Check that Core is running and reachable.';
}

/** Extract assistant-visible text from Gateway JSON or legacy SSE payloads. */
export function extractAssistantContent(json) {
  if (!json || typeof json !== 'object') return '';
  if (typeof json.delta === 'string' && json.delta.trim()) return json.delta.trim();
  if (typeof json.response === 'string' && json.response.trim()) return json.response.trim();

  const core = json.core;
  if (core && typeof core === 'object') {
    const resp = core.response;
    if (resp && typeof resp === 'object') {
      if (typeof resp.content === 'string' && resp.content.trim()) return resp.content.trim();
      if (typeof resp.message === 'string' && resp.message.trim()) return resp.message.trim();
    }
    if (typeof core.message === 'string' && core.message.trim()) return core.message.trim();
    if (typeof core.error === 'string' && core.error.trim()) return core.error.trim();
  }

  if (json.ok === false || json.status === 'core_unreachable' || json.status === 'core_error') {
    if (typeof json.message === 'string' && json.message.trim()) return json.message.trim();
  }

  if (typeof json.message === 'string' && json.message.trim()) return json.message.trim();
  return '';
}

/** Return extracted content or a non-empty diagnostic fallback. */
export function resolveAssistantContent(json) {
  const text = extractAssistantContent(json);
  return text || EMPTY_CONTENT_FALLBACK;
}

/**
 * POST JSON to Gateway /messages and return parsed assistant content.
 * Never calls Hermes or local model endpoints.
 */
export async function sendBridgeMessage(message, sessionId, options = {}) {
  const payload = { message: String(message || '') };
  if (sessionId) payload.session_id = sessionId;

  let res;
  try {
    res = await fetch(MESSAGES_URL, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: options.signal,
    });
  } catch (_) {
    return {
      ok: false,
      content: getCoreUnavailableMessage(),
      raw: null,
    };
  }

  let json = null;
  try {
    json = await res.json();
  } catch (_) {
    return {
      ok: false,
      content: res.ok ? EMPTY_CONTENT_FALLBACK : getCoreUnavailableMessage(),
      raw: null,
      httpStatus: res.status,
    };
  }

  if (!res.ok) {
    const errContent = extractAssistantContent(json) || getCoreUnavailableMessage();
    return { ok: false, content: errContent, raw: json, httpStatus: res.status };
  }

  return {
    ok: json.ok !== false,
    content: resolveAssistantContent(json),
    raw: json,
    httpStatus: res.status,
  };
}

export default {
  init,
  shouldUseBridge,
  isConsoleMode,
  getCoreUnavailableMessage,
  extractAssistantContent,
  resolveAssistantContent,
  sendBridgeMessage,
  EMPTY_CONTENT_FALLBACK,
};
