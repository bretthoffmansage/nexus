/**
 * Claudia Core model selector — Gateway relay for Hermes model config.
 * Console UI reads/writes via /api/claudia/v1/model-config only; never touches
 * local Hermes config files or local model endpoints directly.
 */

const MODEL_CONFIG_URL = '/api/claudia/v1/model-config';

let _state = null;
let _initPromise = null;

/** True when Core URL is configured on Gateway (use Claudia selector path). */
export function useCoreSelector() {
  if (!_state) return false;
  return _state.core_configured !== false;
}

export function getState() {
  return _state;
}

export async function refresh() {
  try {
    const res = await fetch(MODEL_CONFIG_URL, { credentials: 'same-origin' });
    if (res.status === 403) {
      _state = {
        ok: false,
        status: 'auth_required',
        message: 'Sign in to view Claudia Core model config.',
        core_configured: true,
        available_models: [],
        model: null,
      };
      return _state;
    }
    _state = await res.json();
    if (!Array.isArray(_state.available_models)) {
      _state.available_models = [];
    }
  } catch (err) {
    _state = {
      ok: false,
      status: 'core_unreachable',
      message: 'Core model config unavailable.',
      core_configured: true,
      forwarded: false,
      available_models: [],
      model: null,
    };
  }
  return _state;
}

export async function init() {
  if (!_initPromise) {
    _initPromise = refresh();
  }
  return _initPromise;
}

export function getButtonLabel() {
  if (!useCoreSelector()) return null;
  if (!_state) return 'Select model';
  if (_state.status === 'core_not_configured') return null;
  if (!_state.ok && _state.status !== 'ok') {
    if (_state.status === 'auth_required') return 'Sign in for model config';
    return 'Core model config unavailable';
  }
  const current = getCurrentEntry();
  if (current) return current.label || current.id;
  if (_state.model) return _state.model.split('/').pop();
  return 'Select model';
}

export function getButtonTitle() {
  if (!useCoreSelector() || !_state) return '';
  if (_state.model) return _state.model;
  return _state.message || '';
}

export function getSearchPlaceholder() {
  if (!useCoreSelector() || !_state) return 'Search models…';
  if (!_state.ok && _state.status !== 'ok') {
    return _state.message || 'Core model config unavailable';
  }
  const models = _state.available_models || [];
  if (!models.length) return 'No Core model options configured';
  return 'Search Core models…';
}

export function getUnavailableListMessage() {
  if (!_state) return 'Core model config unavailable';
  if (_state.status === 'core_not_configured') return null;
  if (!_state.ok && _state.status !== 'ok') {
    return _state.message || 'Core model config unavailable';
  }
  if (!(_state.available_models || []).length) {
    return 'No Core model options configured.';
  }
  return null;
}

export function getAvailableModels(filter) {
  const models = (_state && _state.available_models) || [];
  const q = (filter || '').trim().toLowerCase();
  if (!q) return models;
  return models.filter((m) => {
    const id = (m.id || '').toLowerCase();
    const label = (m.label || '').toLowerCase();
    return id.includes(q) || label.includes(q);
  });
}

function getCurrentEntry() {
  const models = (_state && _state.available_models) || [];
  const current = models.find((m) => m.current);
  if (current) return current;
  const mid = _state && _state.model;
  if (!mid) return null;
  return models.find((m) => m.id === mid) || { id: mid, label: mid.split('/').pop() };
}

export async function selectModel(modelId) {
  const res = await fetch(MODEL_CONFIG_URL, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelId }),
  });
  let body;
  try {
    body = await res.json();
  } catch (_) {
    body = { ok: false, message: 'Invalid response from Gateway.' };
  }
  if (res.ok && body.ok !== false) {
    _state = body;
    if (!Array.isArray(_state.available_models)) {
      _state.available_models = [];
    }
    return { ok: true, body };
  }
  const message = body.message || body.detail?.message || `Model switch failed (${res.status})`;
  return { ok: false, message, body };
}

export default {
  init,
  refresh,
  useCoreSelector,
  getState,
  getButtonLabel,
  getButtonTitle,
  getSearchPlaceholder,
  getUnavailableListMessage,
  getAvailableModels,
  selectModel,
};
