/**
 * Nexus CLI Mirror UI shell (Bridge 09 + Bridge 10 transcript polish).
 * Operator panel for Core-owned Hermes PTY sessions via Gateway relay.
 */

import {
  CLI_SESSIONS_API,
  CLI_MIRROR_MODE_KEY,
  CLI_MIRROR_MODES,
  DISPLAY_CATEGORIES,
  classifyStreamEvent,
  deriveStatusChip,
  mapApiError,
  buildStreamUrl,
  extractSessionId,
  extractSessionStatus,
  formatRawDrawerLine,
  summarizeSessions,
  formatSessionTimes,
  truncateSessionId,
  isRunningSession,
  mapConflictError,
  loadPersistedSessionId,
  savePersistedSessionId,
  clearPersistedSessionId,
  loadPersistedInteractionMode,
  normalizeTerminalText,
  extractReadablePtyText,
  normalizeTranscriptGroupRole,
  shouldAppendToTranscriptGroup,
  getTranscriptGroupLabel,
  getTranscriptGroupClass,
  appendTranscriptGroupBuffer,
  resolveAnswerBoxResponseAppendTarget,
  resolveTranscriptAppendTarget,
  resolveTranscriptChunkRaw,
  shouldSuppressUserInputEcho,
  TRANSCRIPT_GROUP_ROLES,
  hasVisibleTranscriptText,
  createHermesOutputClassifier,
} from './nexusCliMirrorHelpers.js';

let _initialized = false;
let _mode = CLI_MIRROR_MODES.SIMPLE_CHAT;
let _sessionId = '';
let _sessionStatus = 'not_connected';
let _lastSeq = 0;
let _eventSource = null;
let _streamAttachedSessionId = '';
let _reconnectTimer = null;
let _reconnectAttempts = 0;
let _rawLines = [];
let _sessionsCache = [];
let _listMeta = {};
let _resumeDebounceTimer = null;
let _transcriptOldestSeq = 0;
let _transcriptHasMoreBefore = false;
let _setupPanelMinimized = false;
let _transcriptGroup = null;
let _transcriptExpanded = false;
let _rawDebugVisible = false;
let _sendInFlight = false;
let _lastOptimisticUser = { text: '', sessionId: '', at: 0 };
let _hermesOutputClassifier = createHermesOutputClassifier();
let _lastAnswerBoxResponseGroup = null;
let _lastAnswerBoxHermesGroup = null;

const MAX_RECONNECT = 6;

function _els() {
  return {
    panel: document.getElementById('nexus-cli-mirror-panel'),
    transcript: document.getElementById('nexus-cli-mirror-transcript'),
    rawPre: document.getElementById('nexus-cli-mirror-raw-pre'),
    alerts: document.getElementById('nexus-cli-mirror-alerts'),
    statusChip: document.getElementById('nexus-cli-mirror-status-chip'),
    sessionIdEl: document.getElementById('nexus-cli-mirror-session-id'),
    sessionList: document.getElementById('nexus-cli-mirror-session-list'),
    sessionNote: document.getElementById('nexus-cli-mirror-session-note'),
    attachOffer: document.getElementById('nexus-cli-mirror-attach-offer'),
    startBtn: document.getElementById('nexus-cli-mirror-start'),
    stopBtn: document.getElementById('nexus-cli-mirror-stop'),
    interruptBtn: document.getElementById('nexus-cli-mirror-interrupt'),
    titleInput: document.getElementById('nexus-cli-mirror-title-input'),
    input: document.getElementById('nexus-cli-mirror-input'),
    sendBtn: document.getElementById('nexus-cli-mirror-send-btn'),
    rawToggle: document.getElementById('nexus-cli-mirror-raw-toggle'),
    rawSection: document.getElementById('nexus-cli-mirror-raw-section'),
    transcriptExpandBtn: document.getElementById('nexus-cli-mirror-transcript-expand'),
    transcriptMeta: document.getElementById('nexus-cli-mirror-transcript-meta'),
    transcriptMetaTitle: document.getElementById('nexus-cli-mirror-transcript-meta-title'),
    transcriptMetaStatus: document.getElementById('nexus-cli-mirror-transcript-meta-status'),
    headerCard: document.querySelector('.nexus-cli-mirror-header'),
    setupSection: document.getElementById('nexus-cli-mirror-setup-section'),
    modeToggle: document.getElementById('nexus-interaction-mode-toggle'),
    simpleBtn: document.getElementById('nexus-mode-simple-chat'),
    mirrorBtn: document.getElementById('nexus-mode-cli-mirror'),
    chatHistory: document.getElementById('chat-history'),
    welcome: document.getElementById('welcome-screen'),
    chatInputBar: document.querySelector('.chat-input-bar'),
    chatContainer: document.getElementById('chat-container'),
  };
}

function _resetTranscriptState() {
  _lastSeq = 0;
  _rawLines = [];
  _transcriptGroup = null;
  _lastOptimisticUser = { text: '', sessionId: '', at: 0 };
  _hermesOutputClassifier.reset();
  _lastAnswerBoxResponseGroup = null;
  _lastAnswerBoxHermesGroup = null;
  const { transcript, rawPre } = _els();
  if (transcript) transcript.innerHTML = '';
  if (rawPre) rawPre.textContent = '';
}

function _pruneEmptyTranscriptGroup(group) {
  if (!group?.card || group.nonPrunable) return group;
  const visible =
    Boolean(group.displayText?.trim()) || hasVisibleTranscriptText(group.rawBuffer);
  if (visible) return group;
  group.card.remove();
  if (_transcriptGroup === group) _transcriptGroup = null;
  return null;
}

function _updateTranscriptGroupBody(group) {
  if (!group?.bodyEl) return;
  group.bodyEl.textContent = group.displayText ?? extractReadablePtyText(group.rawBuffer);
}

function _createTranscriptGroup(role, payload, { prepend = false } = {}) {
  const { transcript } = _els();
  if (!transcript) return null;

  const card = document.createElement('div');
  card.className = getTranscriptGroupClass(role);
  card.dataset.groupRole = role;

  const head = document.createElement('div');
  head.className = 'nexus-cli-mirror-stream-head';

  const label = document.createElement('span');
  label.className = 'nexus-cli-mirror-stream-label';
  label.textContent = getTranscriptGroupLabel(role);
  head.appendChild(label);

  const timeStr = _formatCardTime(payload);
  if (timeStr) {
    const timeEl = document.createElement('span');
    timeEl.className = 'nexus-cli-mirror-stream-time';
    timeEl.textContent = timeStr;
    head.appendChild(timeEl);
  }
  if (payload?.seq != null) {
    const seqEl = document.createElement('span');
    seqEl.className = 'nexus-cli-mirror-stream-seq';
    seqEl.textContent = `#${payload.seq}`;
    head.appendChild(seqEl);
    card.dataset.seq = String(payload.seq);
  }

  const body = document.createElement('pre');
  body.className = 'nexus-cli-mirror-stream-body';

  card.appendChild(head);
  card.appendChild(body);

  if (prepend && transcript.firstChild) {
    transcript.insertBefore(card, transcript.firstChild);
  } else {
    transcript.appendChild(card);
  }

  return { role, card, bodyEl: body, rawBuffer: '', displayText: '' };
}

function _appendTextToTranscriptGroup(group, chunkRaw, { classifiedDisplay = false } = {}) {
  if (!group || !chunkRaw) return;
  appendTranscriptGroupBuffer(group, chunkRaw, { classifiedDisplay });
  _updateTranscriptGroupBody(group);
}

function _setStatusChip(state) {
  const { statusChip } = _els();
  if (!statusChip) return;
  const chip = deriveStatusChip(state);
  statusChip.dataset.status = state;
  statusChip.textContent = chip.label;
  statusChip.className = `nexus-cli-mirror-status-chip tone-${chip.tone}`;
  _updateTranscriptExpandedMeta();
}

function _setRawDebugVisible(visible) {
  _rawDebugVisible = Boolean(visible);
  const { rawSection, rawToggle } = _els();
  if (rawSection) rawSection.classList.toggle('hidden', !_rawDebugVisible);
  if (rawToggle) {
    rawToggle.classList.toggle('is-active', _rawDebugVisible);
    rawToggle.setAttribute('aria-pressed', String(_rawDebugVisible));
  }
}

function _toggleRawDebugVisible() {
  _setRawDebugVisible(!_rawDebugVisible);
}

function _setTranscriptExpanded(expanded) {
  if (expanded && !_hasRunningSession()) return;
  _transcriptExpanded = Boolean(expanded);
  const { panel, transcriptExpandBtn } = _els();
  if (panel) panel.classList.toggle('is-transcript-expanded', _transcriptExpanded);
  if (transcriptExpandBtn) {
    transcriptExpandBtn.textContent = _transcriptExpanded ? '−' : '+';
    transcriptExpandBtn.setAttribute('aria-expanded', String(_transcriptExpanded));
    transcriptExpandBtn.title = _transcriptExpanded
      ? 'Minimize Live Hermes transcript'
      : 'Expand Live Hermes transcript';
  }
  _updateTranscriptExpandedMeta();
}

function _toggleTranscriptExpanded() {
  _setTranscriptExpanded(!_transcriptExpanded);
}

function _updateTranscriptExpandedMeta() {
  const { transcriptMeta, transcriptMetaTitle, transcriptMetaStatus } = _els();
  if (!transcriptMeta) return;

  const show = _transcriptExpanded && _hasRunningSession();
  transcriptMeta.classList.toggle('hidden', !show);
  transcriptMeta.setAttribute('aria-hidden', String(!show));
  if (!show) return;

  const sess =
    _sessionsCache.find((s) => (s.session_id || s.id) === _sessionId) || null;
  const titleInput = document.getElementById('nexus-cli-mirror-title-input');
  const title = sess?.title || titleInput?.value?.trim() || 'CLI Mirror session';
  if (transcriptMetaTitle) transcriptMetaTitle.textContent = title;

  if (transcriptMetaStatus) {
    const chip = deriveStatusChip(_sessionStatus);
    transcriptMetaStatus.textContent = chip.label;
    transcriptMetaStatus.className = `nexus-cli-mirror-status-chip tone-${chip.tone}`;
    transcriptMetaStatus.dataset.status = _sessionStatus;
  }
}

function _updateSessionIdDisplay() {
  const { sessionIdEl } = _els();
  if (sessionIdEl) {
    sessionIdEl.textContent = _sessionId || '—';
    sessionIdEl.title = _sessionId || '';
  }
  _updateSetupPanelUi();
  _updateInputState();
  _highlightAttachedSession();
}

function _hasRunningSession(sessionMeta = null) {
  if (sessionMeta) return isRunningSession(sessionMeta);
  return Boolean(_sessionId) && isRunningSession({ status: _sessionStatus });
}

function _updateSetupPanelUi(sessionMeta = null) {
  const { titleInput } = _els();
  const setupSection = document.getElementById('nexus-cli-mirror-setup-section');
  const active = _hasRunningSession(sessionMeta);
  const sess =
    sessionMeta ||
    _sessionsCache.find((s) => (s.session_id || s.id) === _sessionId) ||
    null;

  if (!active) {
    _setupPanelMinimized = false;
    _setTranscriptExpanded(false);
  }

  if (setupSection) {
    setupSection.classList.toggle('has-active-session', active);
    setupSection.classList.toggle('is-minimized', active && _setupPanelMinimized);
    setupSection.setAttribute('aria-expanded', active ? String(!_setupPanelMinimized) : 'true');
  }

  if (titleInput) {
    if (active) {
      titleInput.disabled = true;
      titleInput.classList.add('is-session-active');
      const title = sess?.title || titleInput.value.trim() || 'CLI Mirror session';
      titleInput.value = title;
    } else {
      titleInput.disabled = false;
      titleInput.classList.remove('is-session-active');
      titleInput.value = '';
    }
  }

  _updateInputState();
  _updateTranscriptExpandedMeta();
}

function _isSetupPanelControlTarget(target) {
  if (!target || !target.closest) return false;
  return Boolean(target.closest('input, textarea, button, a, select, code'));
}

function _onSetupPanelClick(e) {
  if (!_hasRunningSession()) return;
  if (_isSetupPanelControlTarget(e.target)) return;

  if (_setupPanelMinimized) {
    _setSetupPanelMinimized(false);
    return;
  }

  const header = document.getElementById('nexus-cli-mirror-setup-header');
  if (header && header.contains(e.target)) {
    _setSetupPanelMinimized(true);
  }
}

function _setSetupPanelMinimized(minimized) {
  if (!_hasRunningSession()) return;
  _setupPanelMinimized = Boolean(minimized);
  _updateSetupPanelUi();
}

function _updateInputState() {
  const { input, sendBtn, stopBtn, interruptBtn, startBtn } = _els();
  const running = isRunningSession({ status: _sessionStatus }) && Boolean(_sessionId);
  const stopped = _sessionStatus === 'stopped';
  const disabled = !running || stopped;
  if (input) input.disabled = disabled;
  if (sendBtn) sendBtn.disabled = disabled;
  if (stopBtn) {
    stopBtn.disabled = !running;
    stopBtn.title = running
      ? 'Stop ends the Core-owned Hermes PTY session'
      : 'No running session to stop';
  }
  if (interruptBtn) {
    interruptBtn.disabled = !running;
    interruptBtn.title = running
      ? 'Interrupt sends Ctrl+C to Hermes (does not stop the session)'
      : 'No running session to interrupt';
  }
  if (startBtn) {
    const runningAttached = _hasRunningSession();
    const otherRunning = _sessionsCache.some(isRunningSession);
    startBtn.disabled = runningAttached || (_listMeta.can_start_new === false && otherRunning);
    startBtn.title = runningAttached
      ? 'Stop the current session before starting a new one'
      : startBtn.disabled
        ? 'A session is already running — attach instead'
        : 'Start a new Core-owned Hermes PTY session';
  }
}

function _renderAttachOffer(summary) {
  const { attachOffer } = _els();
  if (!attachOffer) return;
  attachOffer.innerHTML = '';
  const running = summary?.running?.[0];
  if (!running || _sessionId === (running.session_id || running.id)) {
    attachOffer.classList.add('hidden');
    return;
  }
  const sid = running.session_id || running.id;
  const title = running.title || 'Running session';
  attachOffer.classList.remove('hidden');
  attachOffer.innerHTML =
    `<span class="nexus-cli-mirror-attach-text">` +
    `<strong>Attach to running session:</strong> ${title}` +
    `</span>`;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'admin-btn-sm nexus-cli-mirror-btn-primary';
  btn.textContent = 'Attach to running session';
  btn.addEventListener('click', () => _attachSession(running));
  attachOffer.appendChild(btn);
}

function _showAlert(err, { dismissible = true, attachSessionId = '' } = {}) {
  const { alerts } = _els();
  if (!alerts || !err) return;
  const card = document.createElement('div');
  card.className = 'nexus-cli-mirror-alert admin-card admin-danger-card';
  card.dataset.code = err.code || '';
  let html =
    `<div class="nexus-cli-mirror-alert-title">${err.title || 'Notice'}</div>` +
    `<div class="nexus-cli-mirror-alert-body">${err.message || ''}</div>`;
  if (err.action) {
    html += `<div class="nexus-cli-mirror-alert-action">${err.action}</div>`;
  }
  card.innerHTML = html;
  if (attachSessionId || err.attachSessionId) {
    const sid = attachSessionId || err.attachSessionId;
    const attachBtn = document.createElement('button');
    attachBtn.type = 'button';
    attachBtn.className = 'admin-btn-sm nexus-cli-mirror-btn-primary';
    attachBtn.textContent = 'Attach to running session';
    attachBtn.addEventListener('click', () => {
      const sess = _sessionsCache.find((s) => (s.session_id || s.id) === sid) || { session_id: sid, status: 'running' };
      _attachSession(sess);
      card.remove();
    });
    card.appendChild(attachBtn);
  }
  if (dismissible) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nexus-cli-mirror-alert-dismiss';
    btn.textContent = 'Dismiss';
    btn.addEventListener('click', () => card.remove());
    card.appendChild(btn);
  }
  alerts.appendChild(card);
}

function _clearAlerts() {
  const { alerts } = _els();
  if (alerts) alerts.innerHTML = '';
}

async function _apiFetch(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (_) {
      data = { raw: text };
    }
  }
  if (!res.ok) {
    const mapped = mapApiError(res.status, data?.detail ? data : data);
    return { ok: false, status: res.status, data, error: mapped };
  }
  if (data && data.status && !data.forwarded && data.status === 'core_not_configured') {
    return { ok: false, status: 200, data, error: mapApiError(200, data) };
  }
  return { ok: true, status: res.status, data, error: null };
}

function _appendRawLine(eventName, payload) {
  const line = formatRawDrawerLine(eventName, payload);
  _rawLines.push(line);
  if (_rawLines.length > 500) _rawLines.shift();
  const { rawPre } = _els();
  if (rawPre) rawPre.textContent = _rawLines.join('\n');
}

function _scrollTranscript() {
  const { transcript } = _els();
  if (!transcript) return;
  requestAnimationFrame(() => {
    transcript.scrollTop = transcript.scrollHeight;
  });
}

function _formatCardTime(payload) {
  const ts = payload?.ts || payload?.timestamp;
  if (!ts) return '';
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return String(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch (_) {
    return String(ts);
  }
}

function _appendTranscriptEvent(eventName, payload, meta, { prepend = false, prependGroup = null, optimistic = false } = {}) {
  if (!meta?.visible) {
    if (payload?.seq != null) _lastSeq = Math.max(_lastSeq, Number(payload.seq) || 0);
    return prepend ? prependGroup : null;
  }

  const alwaysShow = new Set(['status', 'stopped', 'error', 'warning']);
  let chunkRaw =
    resolveTranscriptChunkRaw(payload, meta) ||
    (alwaysShow.has(meta.category) ? meta.text || '' : '');

  if (
    meta.text &&
    (meta.category === DISPLAY_CATEGORIES.FINAL_LIKE ||
      meta.category === DISPLAY_CATEGORIES.WARNING ||
      meta.category === DISPLAY_CATEGORIES.ERROR ||
      meta.category === DISPLAY_CATEGORIES.HERMES_OUTPUT ||
      meta.category === DISPLAY_CATEGORIES.TOOL_LIKE ||
      meta.category === DISPLAY_CATEGORIES.SHELL_LIKE)
  ) {
    chunkRaw = meta.text;
  }

  const classifiedDisplay = Boolean(meta.text && chunkRaw === meta.text);

  if (!chunkRaw && !alwaysShow.has(meta.category)) {
    if (payload?.seq != null) _lastSeq = Math.max(_lastSeq, Number(payload.seq) || 0);
    return prepend ? prependGroup : null;
  }

  const groupRole = normalizeTranscriptGroupRole(meta, eventName, payload);
  if (!groupRole) return prepend ? prependGroup : null;

  if (
    !optimistic &&
    groupRole === TRANSCRIPT_GROUP_ROLES.USER &&
    shouldSuppressUserInputEcho(chunkRaw, {
      sessionId: _sessionId,
      lastOptimistic: _lastOptimisticUser,
    })
  ) {
    if (payload?.seq != null) _lastSeq = Math.max(_lastSeq, Number(payload.seq) || 0);
    return prepend ? prependGroup : _transcriptGroup?.card || null;
  }

  const activeGroup = prepend ? prependGroup : _transcriptGroup;
  let group;

  const appendTarget = resolveTranscriptAppendTarget(groupRole, meta, {
    current: activeGroup,
    lastAnswerBoxResponseGroup: _lastAnswerBoxResponseGroup,
    lastAnswerBoxHermesGroup: _lastAnswerBoxHermesGroup,
  });

  if (appendTarget && chunkRaw) {
    group = appendTarget;
    _appendTextToTranscriptGroup(group, chunkRaw, { classifiedDisplay });
    if (!prepend && group !== _transcriptGroup) {
      _transcriptGroup = group;
    }
  } else if (
    activeGroup &&
    shouldAppendToTranscriptGroup(activeGroup.role, groupRole) &&
    chunkRaw
  ) {
    group = activeGroup;
    _appendTextToTranscriptGroup(group, chunkRaw, { classifiedDisplay });
  } else {
    group = _createTranscriptGroup(groupRole, payload, { prepend });
    if (!group) return null;
    if (optimistic && groupRole === TRANSCRIPT_GROUP_ROLES.USER) {
      group.nonPrunable = true;
    }
    _appendTextToTranscriptGroup(group, chunkRaw, { classifiedDisplay });
    if (!prepend) _transcriptGroup = group;
  }

  if (groupRole === TRANSCRIPT_GROUP_ROLES.RESPONSE && meta.answerProse) {
    _lastAnswerBoxResponseGroup = group;
  } else if (groupRole === TRANSCRIPT_GROUP_ROLES.USER) {
    _lastAnswerBoxResponseGroup = null;
    _lastAnswerBoxHermesGroup = null;
  } else if (groupRole === TRANSCRIPT_GROUP_ROLES.HERMES && meta.answerBoxActivity) {
    if (!_lastAnswerBoxHermesGroup) _lastAnswerBoxHermesGroup = group;
  }

  if (!_hermesOutputClassifier.getState().inHermesAnswerBox) {
    _lastAnswerBoxHermesGroup = null;
  }

  group = _pruneEmptyTranscriptGroup(group);
  if (!group) {
    if (payload?.seq != null) _lastSeq = Math.max(_lastSeq, Number(payload.seq) || 0);
    return prepend ? prependGroup : null;
  }

  if (payload?.seq != null) {
    _lastSeq = Math.max(_lastSeq, Number(payload.seq) || 0);
  }
  if (!prepend) {
    _transcriptGroup = group;
    _scrollTranscript();
  }
  return group;
}

function _renderCard(meta, payload, { prepend = false } = {}) {
  return _appendTranscriptEvent('', payload, meta, { prepend })?.card || null;
}

function _handleStreamPayload(eventName, payload) {
  _appendRawLine(eventName, payload);
  const meta = classifyStreamEvent(eventName, payload, {
    outputClassifier: _hermesOutputClassifier,
    lastOptimisticUser: _lastOptimisticUser,
    sessionId: _sessionId,
  });
  _appendTranscriptEvent(eventName, payload, meta);

  if (meta.category === DISPLAY_CATEGORIES.STOPPED || meta.kind === DISPLAY_CATEGORIES.STOPPED) {
    _sessionStatus = 'stopped';
    _setStatusChip('stopped');
    _closeStream();
    _updateSetupPanelUi();
  } else if (meta.category === DISPLAY_CATEGORIES.ERROR) {
    _sessionStatus = 'error';
    _setStatusChip('error');
  } else if (payload?.status === 'running') {
    _sessionStatus = 'running';
    _setStatusChip('running');
  }
}

function _closeStream() {
  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }
  _reconnectAttempts = 0;
  if (_eventSource) {
    _eventSource.close();
    _eventSource = null;
  }
  _streamAttachedSessionId = '';
}

function _connectStream() {
  if (!_sessionId || _sessionStatus === 'stopped') return;
  if (_eventSource && _streamAttachedSessionId === _sessionId) return;
  _closeStream();
  _setStatusChip(_sessionStatus === 'running' ? 'running' : 'connecting');

  const url = buildStreamUrl(_sessionId, _lastSeq);
  const es = new EventSource(url);
  _eventSource = es;
  _streamAttachedSessionId = _sessionId;

  const onNamed = (name) => (ev) => {
    let payload = {};
    try {
      payload = ev.data ? JSON.parse(ev.data) : {};
    } catch (_) {
      payload = { text: ev.data };
    }
    _handleStreamPayload(name, payload);
  };

  [
    'hermes_output',
    'hermes_input',
    'session_status',
    'heartbeat',
    'session_stopped',
    'error',
  ].forEach((name) => {
    es.addEventListener(name, onNamed(name));
  });

  es.onmessage = (ev) => {
    let payload = {};
    try {
      payload = ev.data ? JSON.parse(ev.data) : {};
    } catch (_) {
      payload = { text: ev.data };
    }
    _handleStreamPayload(payload.type || 'message', payload);
  };

  es.onerror = () => {
    if (_sessionStatus === 'stopped') {
      _closeStream();
      return;
    }
    _setStatusChip('stream_disconnected');
    _closeStream();
    if (_reconnectAttempts >= MAX_RECONNECT) {
      _showAlert({
        code: 'stream_disconnected',
        title: 'Stream disconnected',
        message: 'Live CLI Mirror stream ended unexpectedly.',
        action: 'Click Refresh sessions or reload the transcript. Start a new session if needed.',
      });
      return;
    }
    _reconnectAttempts += 1;
    _reconnectTimer = setTimeout(() => {
      if (_mode === CLI_MIRROR_MODES.CLI_MIRROR && _sessionId) {
        _connectStream();
      }
    }, Math.min(2000 * _reconnectAttempts, 8000));
  };
}

async function _loadTranscript({ appendOlder = false } = {}) {
  if (!_sessionId) return;
  let url = `${CLI_SESSIONS_API}/${encodeURIComponent(_sessionId)}/transcript?limit=200`;
  if (appendOlder && _transcriptOldestSeq > 0) {
    url += `&before_seq=${encodeURIComponent(String(_transcriptOldestSeq))}`;
  }
  const result = await _apiFetch(url);
  if (!result.ok) {
    if (result.error) _showAlert(result.error);
    return;
  }
  const events = result.data?.events || result.data?.transcript || [];
  if (!Array.isArray(events)) return;

  _transcriptHasMoreBefore = Boolean(result.data?.has_more_before);
  const seqs = events.map((evt) => Number(evt.seq) || 0).filter((n) => n > 0);

  if (!appendOlder) {
    _resetTranscriptState();
    _transcriptOldestSeq = seqs.length ? Math.min(...seqs) : 0;
  } else if (seqs.length) {
    _transcriptOldestSeq = Math.min(_transcriptOldestSeq || seqs[0], ...seqs);
  }

  if (seqs.length) {
    _lastSeq = Math.max(_lastSeq, ...seqs);
  }

  let prependGroup = null;
  for (const evt of events) {
    const name =
      evt.type === 'output'
        ? 'hermes_output'
        : evt.type === 'input'
          ? 'hermes_input'
          : evt.type;
    if (appendOlder) {
      const meta = classifyStreamEvent(name, evt, {
        outputClassifier: _hermesOutputClassifier,
        lastOptimisticUser: _lastOptimisticUser,
        sessionId: _sessionId,
      });
      prependGroup = _appendTranscriptEvent(name, evt, meta, { prepend: true, prependGroup });
    } else {
      _handleStreamPayload(name, evt);
    }
  }

  _renderTranscriptPaginationControls();
}

function _renderTranscriptPaginationControls() {
  const section = document.querySelector('.nexus-cli-mirror-section-transcript');
  if (!section) return;
  let bar = document.getElementById('nexus-cli-mirror-transcript-pagination');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'nexus-cli-mirror-transcript-pagination';
    bar.className = 'nexus-cli-mirror-transcript-pagination';
    const transcript = document.getElementById('nexus-cli-mirror-transcript');
    if (transcript) transcript.insertAdjacentElement('afterend', bar);
  }
  bar.innerHTML = '';
  if (!_transcriptHasMoreBefore) {
    bar.classList.add('hidden');
    return;
  }
  bar.classList.remove('hidden');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'admin-btn-sm';
  btn.textContent = 'Load older transcript';
  btn.addEventListener('click', () => {
    void _loadTranscript({ appendOlder: true });
  });
  bar.appendChild(btn);
}

function _buildSessionRow(sess) {
  const sid = sess.session_id || sess.id || '';
  const row = document.createElement('div');
  row.className = 'nexus-cli-mirror-session-item';
  row.dataset.sessionId = sid;
  if (sid === _sessionId) row.classList.add('is-attached');

  const status = sess.status || 'unknown';
  const chip = document.createElement('span');
  chip.className = `nexus-cli-mirror-session-status tone-${isRunningSession(sess) ? 'ok' : 'muted'}`;
  chip.textContent = sess.phase || status;

  const main = document.createElement('div');
  main.className = 'nexus-cli-mirror-session-item-main';

  const titleEl = document.createElement('div');
  titleEl.className = 'nexus-cli-mirror-session-item-title';
  titleEl.textContent = sess.title || 'CLI Mirror session';

  const metaEl = document.createElement('div');
  metaEl.className = 'nexus-cli-mirror-session-item-meta';
  const times = formatSessionTimes(sess);
  const parts = [];
  if (times.started) parts.push(`Started ${times.started}`);
  if (times.lastActive) parts.push(`Active ${times.lastActive}`);
  if (times.idleSeconds != null && isRunningSession(sess)) {
    parts.push(`Idle ${times.idleSeconds}s`);
  }
  if (sess.output_event_count != null) parts.push(`${sess.output_event_count} events`);
  parts.push(truncateSessionId(sid, 18));
  metaEl.textContent = parts.join(' · ');

  main.appendChild(titleEl);
  main.appendChild(metaEl);

  if (!isRunningSession(sess) && sess.resume_unavailable_reason) {
    const reasonEl = document.createElement('div');
    reasonEl.className = 'nexus-cli-mirror-session-resume-note';
    reasonEl.textContent = sess.resume_unavailable_reason;
    main.appendChild(reasonEl);
  }

  row.appendChild(chip);
  row.appendChild(main);

  if (isRunningSession(sess)) {
    const attach = document.createElement('button');
    attach.type = 'button';
    attach.className = 'admin-btn-sm';
    attach.textContent = _sessionId === sid ? 'Attached' : 'Attach';
    attach.disabled = _sessionId === sid;
    attach.addEventListener('click', () => _attachSession(sess));
    row.appendChild(attach);
  } else if (sess.viewable !== false) {
    const view = document.createElement('button');
    view.type = 'button';
    view.className = 'admin-btn-sm';
    view.textContent = 'View transcript';
    view.addEventListener('click', () => _attachSession({ ...sess, status: 'stopped' }));
    row.appendChild(view);
  }

  return row;
}

function _renderSessionList(sessions, listMeta = {}) {
  const { sessionList, sessionNote } = _els();
  if (!sessionList) return;

  const summary = summarizeSessions(sessions, listMeta);
  if (sessionNote) sessionNote.textContent = summary.note || '';
  _renderAttachOffer(summary);

  sessionList.innerHTML = '';
  if (summary.empty) {
    _updateInputState();
    return;
  }

  const sections = [
    { title: 'Active session', items: summary.running },
    { title: 'Stopped / viewable', items: summary.stopped },
  ];

  for (const section of sections) {
    if (!section.items.length) continue;
    const heading = document.createElement('div');
    heading.className = 'nexus-cli-mirror-session-section-title';
    heading.textContent = section.title;
    sessionList.appendChild(heading);
    for (const sess of section.items) {
      const sid = sess.session_id || sess.id || '';
      if (!sid) continue;
      sessionList.appendChild(_buildSessionRow(sess));
    }
  }
  _updateInputState();
}

function _highlightAttachedSession() {
  const { sessionList } = _els();
  if (!sessionList) return;
  sessionList.querySelectorAll('.nexus-cli-mirror-session-item').forEach((row) => {
    const sid = row.dataset.sessionId;
    row.classList.toggle('is-attached', sid === _sessionId);
    const btn = row.querySelector('button');
    if (btn) {
      btn.textContent = sid === _sessionId ? 'Attached' : 'Attach';
      btn.disabled = sid === _sessionId;
    }
  });
}

async function _fetchSessionMeta(sessionId) {
  if (!sessionId) return { ok: false, status: 400, data: null, error: null };
  return _apiFetch(`${CLI_SESSIONS_API}/${encodeURIComponent(sessionId)}`);
}

async function _attachSession(sess) {
  const sid = sess.session_id || sess.id;
  if (!sid) return;
  _closeStream();
  _clearAlerts();
  _sessionId = sid;
  _sessionStatus = sess.status || 'running';
  savePersistedSessionId(sid);
  _updateSessionIdDisplay();
  _updateSetupPanelUi(sess);
  _setStatusChip(isRunningSession(sess) ? 'running' : 'stopped');
  await _loadTranscript();
  if (isRunningSession(sess)) _connectStream();
  _renderSessionList(_sessionsCache, _listMeta);
  const { attachOffer } = _els();
  if (attachOffer) attachOffer.classList.add('hidden');
}

async function _refreshSessions() {
  _clearAlerts();
  const result = await _apiFetch(CLI_SESSIONS_API);
  if (!result.ok) {
    if (result.error) _showAlert(result.error);
    _setStatusChip('error');
    return null;
  }

  const sessions = result.data?.sessions || [];
  _sessionsCache = sessions;
  _listMeta = {
    can_start_new: result.data?.can_start_new,
    active_session_id: result.data?.active_session_id,
    attachable_session_ids: result.data?.attachable_session_ids,
    cleanup_policy: result.data?.cleanup_policy,
    one_active_session_limit: result.data?.one_active_session_limit,
  };
  _renderSessionList(sessions, _listMeta);

  if (_sessionId) {
    const current = sessions.find((s) => (s.session_id || s.id) === _sessionId);
    if (current) {
      _sessionStatus = current.status || _sessionStatus;
      _setStatusChip(isRunningSession(current) ? 'running' : _sessionStatus === 'stopped' ? 'stopped' : 'ready');
      _updateSetupPanelUi(current);
      _updateSessionIdDisplay();
    }
  } else {
    _setStatusChip(sessions.some(isRunningSession) ? 'ready' : 'not_connected');
    _updateSetupPanelUi();
  }

  return sessions;
}

async function _startSession() {
  _clearAlerts();
  _closeStream();
  _setStatusChip('connecting');

  const { titleInput } = _els();
  const title = titleInput?.value?.trim() || 'legacy local console CLI Mirror';

  const result = await _apiFetch(CLI_SESSIONS_API, {
    method: 'POST',
    body: JSON.stringify({ title }),
  });

  if (!result.ok) {
    if (result.status === 409) {
      const err = mapConflictError(result.data?.detail ? result.data : result.data, 409);
      _showAlert(err, { attachSessionId: err.attachSessionId });
    } else if (result.error) {
      _showAlert(result.error);
    }
    _setStatusChip('error');
    await _refreshSessions();
    return;
  }

  _sessionId = extractSessionId(result.data);
  _sessionStatus = extractSessionStatus(result.data) || 'running';
  _resetTranscriptState();

  savePersistedSessionId(_sessionId);
  _updateSessionIdDisplay();
  _updateSetupPanelUi({ title, status: 'running' });
  _setStatusChip('running');
  await _refreshSessions();
  _connectStream();
}

async function _stopSession() {
  if (!_sessionId) return;
  _clearAlerts();
  const sid = _sessionId;
  const result = await _apiFetch(
    `${CLI_SESSIONS_API}/${encodeURIComponent(sid)}/stop`,
    { method: 'POST', body: '{}' },
  );
  _closeStream();
  if (!result.ok) {
    const err = result.error || mapApiError(result.status, result.data);
    if (result.status >= 400) {
      err.code = err.code || 'stop_failed';
      err.title = err.title || 'Stop failed';
    }
    _showAlert(err);
    _setStatusChip('error');
    return;
  }
  _sessionStatus = extractSessionStatus(result.data) || 'stopped';
  _setStatusChip('stopped');
  _setTranscriptExpanded(false);
  savePersistedSessionId(sid);
  _updateSetupPanelUi({ session_id: sid, status: 'stopped' });
  _handleStreamPayload('session_stopped', {
    status: 'stopped',
    message: 'Session stopped by operator.',
  });
  await _refreshSessions();
}

async function _interruptSession() {
  if (!_sessionId || !isRunningSession({ status: _sessionStatus })) return;
  const ok = window.confirm(
    'Send Ctrl+C to the Hermes session?\n\nInterrupt cancels the current Hermes action but keeps the PTY session running. Use Stop session to end the session.',
  );
  if (!ok) return;
  _clearAlerts();
  const result = await _apiFetch(
    `${CLI_SESSIONS_API}/${encodeURIComponent(_sessionId)}/interrupt`,
    { method: 'POST', body: '{}' },
  );
  if (!result.ok) {
    const err = result.error || mapApiError(result.status, result.data);
    if (result.status === 501 || err.code === 'gateway_error') {
      _showAlert(mapApiError(501, { status: 'interrupt_failed', message: err.message }));
    } else {
      _showAlert(err);
    }
    return;
  }
  if (result.data?.status === 'not_running') {
    _showAlert({
      title: 'Session not running',
      message: result.data.message || 'Interrupt ignored because the session is not running.',
    });
    return;
  }
  _renderCard(
    classifyStreamEvent('session_status', {
      status: 'interrupt_sent',
      text: 'Interrupt sent (Ctrl+C). Hermes PTY session remains active.',
    }),
    { type: 'status', ts: new Date().toISOString() },
  );
}

async function _sendInput() {
  const { input, sendBtn } = _els();
  if (!input || !_sessionId || !isRunningSession({ status: _sessionStatus })) return;
  if (_sendInFlight) return;
  const text = input.value;
  if (!text.trim()) return;

  _sendInFlight = true;
  if (sendBtn) sendBtn.disabled = true;
  input.value = '';

  try {
    _lastOptimisticUser = { text, sessionId: _sessionId, at: Date.now() };
    _hermesOutputClassifier.noteUserInput(text);
    _appendTranscriptEvent(
      'hermes_input',
      { type: 'input', text, ts: new Date().toISOString() },
      classifyStreamEvent('hermes_input', { text }, {
        outputClassifier: _hermesOutputClassifier,
        lastOptimisticUser: _lastOptimisticUser,
        sessionId: _sessionId,
      }),
      { optimistic: true },
    );

    const result = await _apiFetch(
      `${CLI_SESSIONS_API}/${encodeURIComponent(_sessionId)}/input`,
      { method: 'POST', body: JSON.stringify({ text }) },
    );
    if (!result.ok && result.error) {
      _showAlert(result.error);
    }
  } finally {
    _sendInFlight = false;
    _updateInputState();
  }
}

function _copySessionId() {
  if (!_sessionId || !navigator.clipboard) return;
  navigator.clipboard.writeText(_sessionId).catch(() => {});
}

function _copyRawTranscript() {
  if (!navigator.clipboard || !_rawLines.length) return;
  navigator.clipboard.writeText(_rawLines.join('\n')).catch(() => {});
}

function _scheduleResumeCliMirror() {
  if (_mode !== CLI_MIRROR_MODES.CLI_MIRROR) return;
  if (_resumeDebounceTimer) clearTimeout(_resumeDebounceTimer);
  _resumeDebounceTimer = setTimeout(() => {
    _resumeDebounceTimer = null;
    void _resumeCliMirror();
  }, 350);
}

async function _resumeCliMirror() {
  if (_mode !== CLI_MIRROR_MODES.CLI_MIRROR) return;

  const sessions = await _refreshSessions();
  const persisted = loadPersistedSessionId();
  const targetId = _sessionId || persisted;

  if (!targetId) {
    _setStatusChip(sessions?.some(isRunningSession) ? 'ready' : 'not_connected');
    return;
  }

  const metaResult = await _fetchSessionMeta(targetId);
  if (!metaResult.ok) {
    if (metaResult.status === 404) {
      _showAlert({
        title: 'Previous session not found',
        message: 'The saved CLI Mirror session is no longer available on Core.',
        action: 'Refresh sessions or attach to a running session if one exists.',
      });
      clearPersistedSessionId();
      if (_sessionId === targetId) {
        _sessionId = '';
        _sessionStatus = 'not_connected';
        _updateSessionIdDisplay();
        _setStatusChip('not_connected');
      }
    } else if (metaResult.error) {
      _showAlert(metaResult.error);
    }
    return;
  }

  const sess = metaResult.data?.session || metaResult.data;
  const sid = extractSessionId(sess) || targetId;
  _sessionId = sid;
  _sessionStatus = sess?.status || _sessionStatus || 'running';
  savePersistedSessionId(sid);
  _updateSetupPanelUi(sess);
  _updateSessionIdDisplay();
  _setStatusChip(
    isRunningSession(sess)
      ? 'running'
      : _sessionStatus === 'stopped'
        ? 'stopped'
        : 'ready',
  );

  await _loadTranscript();

  if (isRunningSession(sess)) {
    _connectStream();
  }

  _renderSessionList(_sessionsCache, _listMeta);
  _highlightAttachedSession();
}

function _applyInteractionMode(mode) {
  _mode = mode;
  try {
    localStorage.setItem(CLI_MIRROR_MODE_KEY, mode);
  } catch (_) { /* ignore */ }

  const {
    panel,
    chatHistory,
    welcome,
    chatInputBar,
    chatContainer,
    simpleBtn,
    mirrorBtn,
  } = _els();

  const mirror = mode === CLI_MIRROR_MODES.CLI_MIRROR;
  if (panel) panel.classList.toggle('hidden', !mirror);
  if (chatHistory) chatHistory.classList.toggle('nexus-cli-mirror-hidden', mirror);
  if (welcome) welcome.classList.toggle('nexus-cli-mirror-hidden', mirror);
  if (chatInputBar) chatInputBar.classList.toggle('nexus-cli-mirror-hidden', mirror);
  if (chatContainer) chatContainer.classList.toggle('nexus-cli-mirror-active', mirror);

  if (simpleBtn) {
    simpleBtn.classList.toggle('active', !mirror);
    simpleBtn.setAttribute('aria-pressed', String(!mirror));
  }
  if (mirrorBtn) {
    mirrorBtn.classList.toggle('active', mirror);
    mirrorBtn.setAttribute('aria-pressed', String(mirror));
  }

  if (mirror) {
    void _resumeCliMirror();
  } else {
    _closeStream();
    if (_sessionId) savePersistedSessionId(_sessionId);
  }
}

function _buildDom() {
  if (document.getElementById('nexus-cli-mirror-panel')) return;

  const chatContainer = document.getElementById('chat-container');
  const chatHistory = document.getElementById('chat-history');
  if (!chatContainer || !chatHistory) return;

  const panel = document.createElement('div');
  panel.id = 'nexus-cli-mirror-panel';
  panel.className = 'nexus-cli-mirror-panel hidden';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Nexus CLI Mirror');
  panel.innerHTML =
    '<div class="nexus-cli-mirror-header admin-card">' +
    '<div class="nexus-cli-mirror-header-row">' +
    '<h2>Nexus CLI Mirror</h2>' +
    '<span id="nexus-cli-mirror-status-chip" class="nexus-cli-mirror-status-chip tone-muted" data-status="not_connected">Not connected</span>' +
    '</div>' +
    '<p class="nexus-cli-mirror-desc">Mirrors the Core-owned Hermes session.</p>' +
    '</div>' +
    '<div id="nexus-cli-mirror-alerts" class="nexus-cli-mirror-alerts"></div>' +
    '<div id="nexus-cli-mirror-attach-offer" class="nexus-cli-mirror-attach-offer admin-card hidden"></div>' +
    '<div id="nexus-cli-mirror-setup-section" class="nexus-cli-mirror-section nexus-cli-mirror-section-setup admin-card" aria-expanded="true">' +
    '<div id="nexus-cli-mirror-setup-header" class="nexus-cli-mirror-setup-header">' +
    '<h3 class="nexus-cli-mirror-section-title">Session setup</h3>' +
    '</div>' +
    '<div id="nexus-cli-mirror-setup-inactive-labels" class="nexus-cli-mirror-setup-inactive-labels">' +
    '<label class="nexus-cli-mirror-field-label" for="nexus-cli-mirror-title-input">Session title</label>' +
    '<p class="nexus-cli-mirror-field-hint" id="nexus-cli-mirror-title-hint">Used only to name the CLI Mirror session before starting it.</p>' +
    '</div>' +
    '<input type="text" id="nexus-cli-mirror-title-input" class="nexus-cli-mirror-title-input" placeholder="legacy local console CLI Mirror" maxlength="120" autocomplete="off">' +
    '<div class="nexus-cli-mirror-control-row">' +
    '<button type="button" class="admin-btn-sm nexus-cli-mirror-btn-primary" id="nexus-cli-mirror-start">Start session</button>' +
    '<button type="button" class="admin-btn-sm" id="nexus-cli-mirror-refresh">Refresh sessions</button>' +
    '<button type="button" class="admin-btn-sm" id="nexus-cli-mirror-stop" title="Stop ends the Core-owned Hermes PTY session">Stop session</button>' +
    '<button type="button" class="admin-btn-sm" id="nexus-cli-mirror-interrupt" title="Interrupt sends Ctrl+C to Hermes">Send Ctrl+C</button>' +
    '</div>' +
    '<div class="nexus-cli-mirror-session-row">' +
    '<span class="nexus-cli-mirror-session-label">Session ID</span>' +
    '<code id="nexus-cli-mirror-session-id" class="nexus-cli-mirror-session-id">—</code>' +
    '<button type="button" class="admin-btn-sm" id="nexus-cli-mirror-copy-id">Copy</button>' +
    '</div>' +
    '<p id="nexus-cli-mirror-session-note" class="nexus-cli-mirror-session-note"></p>' +
    '<div id="nexus-cli-mirror-session-list" class="nexus-cli-mirror-session-list"></div>' +
    '</div>' +
    '<div class="nexus-cli-mirror-section nexus-cli-mirror-section-transcript">' +
    '<div class="nexus-cli-mirror-transcript-heading">' +
    '<h3 class="nexus-cli-mirror-section-title">Live Hermes transcript</h3>' +
    '<button type="button" id="nexus-cli-mirror-transcript-expand" class="nexus-cli-mirror-transcript-expand-btn" aria-expanded="false" title="Expand Live Hermes transcript">+</button>' +
    '</div>' +
    '<div class="nexus-cli-mirror-transcript-shell">' +
    '<div id="nexus-cli-mirror-transcript-meta" class="nexus-cli-mirror-transcript-meta hidden" aria-hidden="true">' +
    '<span id="nexus-cli-mirror-transcript-meta-title" class="nexus-cli-mirror-transcript-meta-title"></span>' +
    '<span id="nexus-cli-mirror-transcript-meta-status" class="nexus-cli-mirror-status-chip tone-muted"></span>' +
    '</div>' +
    '<div id="nexus-cli-mirror-transcript" class="nexus-cli-mirror-transcript" role="log" aria-live="polite"></div>' +
    '</div>' +
    '<div id="nexus-cli-mirror-raw-section" class="nexus-cli-mirror-raw-section hidden">' +
    '<details class="nexus-cli-mirror-raw-drawer admin-card">' +
    '<summary>Raw transcript <span class="nexus-cli-mirror-raw-hint">(debug only — collapsed by default)</span></summary>' +
    '<div class="nexus-cli-mirror-raw-toolbar">' +
    '<button type="button" class="admin-btn-sm" id="nexus-cli-mirror-copy-raw">Copy raw</button>' +
    '</div>' +
    '<pre id="nexus-cli-mirror-raw-pre" class="nexus-cli-mirror-raw-pre" aria-label="Raw CLI Mirror transcript"></pre>' +
    '</details>' +
    '</div>' +
    '</div>' +
    '<div class="nexus-cli-mirror-section nexus-cli-mirror-section-input admin-card">' +
    '<div class="nexus-cli-mirror-input-bar">' +
    '<textarea id="nexus-cli-mirror-input" class="nexus-cli-mirror-input" rows="2" placeholder="Send input to Hermes (/help, commands, or instructions…)" aria-label="Send input to Hermes"></textarea>' +
    '<div class="nexus-cli-mirror-input-actions">' +
    '<button type="button" class="send-btn" id="nexus-cli-mirror-send-btn">Send</button>' +
    '<button type="button" id="nexus-cli-mirror-raw-toggle" class="nexus-cli-mirror-raw-toggle" aria-pressed="false" title="Toggle raw transcript debug">db</button>' +
    '</div>' +
    '</div>' +
    '</div>';

  chatHistory.insertAdjacentElement('afterend', panel);

  const chatTopBar = document.querySelector('.chat-top-bar');
  if (chatTopBar && !document.getElementById('nexus-interaction-mode-toggle')) {
    const toggle = document.createElement('div');
    toggle.id = 'nexus-interaction-mode-toggle';
    toggle.className = 'nexus-interaction-mode-toggle mode-toggle';
    toggle.setAttribute('role', 'group');
    toggle.setAttribute('aria-label', 'Nexus interaction mode');
    toggle.innerHTML =
      '<button type="button" class="mode-toggle-btn active" id="nexus-mode-simple-chat" aria-pressed="true">Simple Chat</button>' +
      '<button type="button" class="mode-toggle-btn" id="nexus-mode-cli-mirror" aria-pressed="false">CLI Mirror</button>';
    chatTopBar.appendChild(toggle);
  }

  document.getElementById('nexus-cli-mirror-start')?.addEventListener('click', () => _startSession());
  document.getElementById('nexus-cli-mirror-refresh')?.addEventListener('click', () => _refreshSessions());
  document.getElementById('nexus-cli-mirror-stop')?.addEventListener('click', () => _stopSession());
  document.getElementById('nexus-cli-mirror-interrupt')?.addEventListener('click', () => _interruptSession());
  document.getElementById('nexus-cli-mirror-setup-section')?.addEventListener('click', _onSetupPanelClick);
  document.getElementById('nexus-cli-mirror-copy-id')?.addEventListener('click', () => _copySessionId());
  document.getElementById('nexus-cli-mirror-copy-raw')?.addEventListener('click', () => _copyRawTranscript());
  document.getElementById('nexus-cli-mirror-raw-toggle')?.addEventListener('click', () => _toggleRawDebugVisible());
  document.getElementById('nexus-cli-mirror-transcript-expand')?.addEventListener('click', () => _toggleTranscriptExpanded());
  document.getElementById('nexus-cli-mirror-send-btn')?.addEventListener('click', () => _sendInput());

  _setRawDebugVisible(false);

  const input = document.getElementById('nexus-cli-mirror-input');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        _sendInput();
      }
    });
  }

  document.getElementById('nexus-mode-simple-chat')?.addEventListener('click', () => {
    _applyInteractionMode(CLI_MIRROR_MODES.SIMPLE_CHAT);
  });
  document.getElementById('nexus-mode-cli-mirror')?.addEventListener('click', () => {
    _applyInteractionMode(CLI_MIRROR_MODES.CLI_MIRROR);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      _scheduleResumeCliMirror();
    }
  });
  window.addEventListener('focus', () => {
    _scheduleResumeCliMirror();
  });

  window.addEventListener('beforeunload', () => _closeStream());
}

/**
 * Initialize CLI Mirror shell when legacy local console Mode is active.
 */
export async function initNexusCliMirror() {
  if (_initialized) return;
  _initialized = true;

  _buildDom();

  const modeToggle = document.getElementById('nexus-interaction-mode-toggle');
  if (modeToggle) modeToggle.classList.remove('hidden');

  _applyInteractionMode(loadPersistedInteractionMode());

  if (window._isAdmin === false) {
    _showAlert(
      {
        title: 'Admin/operator access',
        message:
          'CLI Mirror (Operator Mode) requires admin/operator access. Gateway requests are enforced server-side.',
        action: 'Sign in as admin, then refresh this panel.',
      },
      { dismissible: true },
    );
  }
}

export default { initNexusCliMirror };
