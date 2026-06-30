/**
 * Claudia CLI Mirror — pure helpers (Bridge 09 + Bridge 10 transcript polish).
 * Gateway-only paths; no direct Core URLs.
 */

export const CLI_SESSIONS_API = '/api/claudia/v1/cli/sessions';
export const CLI_MIRROR_MODE_KEY = 'claudia_console_interaction_mode';
export const CLI_MIRROR_SESSION_KEY = 'claudia_console_cli_mirror_session_id';
export const CLI_MIRROR_MODES = Object.freeze({
  SIMPLE_CHAT: 'simple_chat',
  CLI_MIRROR: 'cli_mirror',
});

export function loadPersistedSessionId() {
  try {
    return localStorage.getItem(CLI_MIRROR_SESSION_KEY) || '';
  } catch (_) {
    return '';
  }
}

export function savePersistedSessionId(sessionId) {
  const sid = String(sessionId || '').trim();
  if (!sid) return;
  try {
    localStorage.setItem(CLI_MIRROR_SESSION_KEY, sid);
  } catch (_) { /* ignore */ }
}

export function clearPersistedSessionId() {
  try {
    localStorage.removeItem(CLI_MIRROR_SESSION_KEY);
  } catch (_) { /* ignore */ }
}

export function loadPersistedInteractionMode(fallback = CLI_MIRROR_MODES.SIMPLE_CHAT) {
  try {
    const stored = localStorage.getItem(CLI_MIRROR_MODE_KEY);
    if (stored === CLI_MIRROR_MODES.CLI_MIRROR) return CLI_MIRROR_MODES.CLI_MIRROR;
    if (stored === CLI_MIRROR_MODES.SIMPLE_CHAT) return CLI_MIRROR_MODES.SIMPLE_CHAT;
  } catch (_) { /* ignore */ }
  return fallback;
}

/** Display categories for styled transcript cards (Bridge 10). */
export const DISPLAY_CATEGORIES = Object.freeze({
  USER_INPUT: 'user_input',
  HERMES_OUTPUT: 'hermes_output',
  COMMAND: 'command',
  SLASH_COMMAND: 'slash_command',
  STATUS: 'status',
  WARNING: 'warning',
  ERROR: 'error',
  TOOL_LIKE: 'tool_like',
  SHELL_LIKE: 'shell_like',
  FINAL_LIKE: 'final_like',
  HEARTBEAT: 'heartbeat',
  RAW_NOISE: 'raw_noise',
  STOPPED: 'stopped',
});

const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
const ANSI_OSC_RE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const CTRL_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const SECRET_RE = /(?:sk-[A-Za-z0-9]{20,}|CLAUDIA_GATEWAY_SHARED_SECRET\s*=\s*\S+)/g;

const ERROR_RE = /\b(error|traceback|exception|failed|fatal)\b/i;
const WARN_RE = /\b(warning|warn:|deprecated)\b/i;
const AUTH_ERR_RE = /\b(401|403|unauthorized|permission denied)\b/i;
const TOOL_RE =
  /\b(tool|running|executing|changed \d+ files?|tests? (passed|failed)|applying patch|invoking|read file|write file)\b/i;
const SPINNER_RE =
  /^[\s|/\\\-─═│└┌┐┘⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏●○◐◑◒◓…·.]+$/;

const CARD_BASE = 'claudia-cli-mirror-card';

const CATEGORY_STYLES = Object.freeze({
  user_input: { label: 'USER', card: `${CARD_BASE} ${CARD_BASE}-input` },
  slash_command: { label: 'USER', card: `${CARD_BASE} ${CARD_BASE}-slash` },
  command: { label: 'USER', card: `${CARD_BASE} ${CARD_BASE}-command` },
  hermes_output: { label: 'HERMES', card: `${CARD_BASE} ${CARD_BASE}-output` },
  final_like: { label: 'RESPONSE', card: `${CARD_BASE} ${CARD_BASE}-final` },
  tool_like: { label: 'TOOL', card: `${CARD_BASE} ${CARD_BASE}-tool` },
  shell_like: { label: 'SHELL', card: `${CARD_BASE} ${CARD_BASE}-shell` },
  status: { label: 'SYSTEM', card: `${CARD_BASE} ${CARD_BASE}-status` },
  warning: { label: 'WARNING', card: `${CARD_BASE} ${CARD_BASE}-warning admin-danger-card` },
  error: { label: 'ERROR', card: `${CARD_BASE} ${CARD_BASE}-error admin-danger-card` },
  stopped: { label: 'SESSION', card: `${CARD_BASE} ${CARD_BASE}-stopped admin-danger-card` },
  heartbeat: { label: '', card: '' },
  raw_noise: { label: '', card: '' },
});

/** Visual transcript group roles for consecutive stream merging. */
export const TRANSCRIPT_GROUP_ROLES = Object.freeze({
  HERMES: 'hermes',
  RESPONSE: 'response',
  USER: 'user',
  SYSTEM: 'system',
  WARNING: 'warning',
  ERROR: 'error',
  SESSION: 'session',
});

/** Window for suppressing PTY echo of optimistic user input. */
export const USER_INPUT_ECHO_DEDUPE_MS = 15000;

/** Apply carriage returns: overwrite the current line instead of inserting extra rows. */
function _applyCarriageReturns(raw) {
  let result = '';
  let line = '';
  const s = String(raw ?? '').replace(/\r\n/g, '\n').replace(/\r\r\n/g, '\n');
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === '\r') {
      line = '';
      continue;
    }
    if (ch === '\n') {
      result += line + '\n';
      line = '';
      continue;
    }
    line += ch;
  }
  return result + line;
}

/** Strip orphan CSI/control fragments left after ESC-prefixed sequences were removed or split. */
function _stripOrphanPtyControlFragments(text) {
  let out = text;
  out = out.replace(/\[\?[0-9;]*[a-zA-Z]/g, '');
  out = out.replace(/\[(?:\d{1,4};)*\d{1,4}[A-Za-z]/g, '');
  out = out.replace(/\[\d* [a-zA-Z]/g, '');
  out = out.replace(/\[(?:\d{1,4};)*\d{1,4}m/g, '');
  out = out.replace(/(?:^|[\s\n])\d{1,4};\d{1,4}m(?=[\s\n]|$)/g, '');
  out = out.replace(/(?:^|[\s\n])38;5;\d+m(?=[\s\n]|$)/g, '');
  out = out.replace(/(?:^|[\s\n])\d{1,3};\d{1,3}m(?=[\s\n]|$)/g, '');
  return out;
}

/**
 * Extract readable display text from PTY output for styled transcript rendering.
 * Strips ANSI/OSC/control and orphan fragments; preserves box drawing and prose.
 */
export function extractReadablePtyText(raw) {
  if (raw == null) return '';
  let text = _applyCarriageReturns(raw);
  text = text.replace(ANSI_OSC_RE, '');
  text = text.replace(ANSI_RE, '');
  text = _stripOrphanPtyControlFragments(text);
  text = text.replace(CTRL_RE, '');
  text = text.replace(/\n{3,}/g, '\n\n');
  return redactSecrets(text);
}

/** True when readable display text contains meaningful visible glyphs (not pure control). */
export function hasReadableDisplayGlyphs(text) {
  const readable = extractReadablePtyText(text);
  const t = readable.trim();
  if (!t) return false;
  if (/[\p{L}]/u.test(t)) return true;
  if (/[╭╮╰╯─│⚕❯░█⏲⏱●○◉⌐■_•▪·…>]/u.test(t)) return true;
  if (/[\u{1F300}-\u{1FAFF}]/u.test(t)) return true;
  return false;
}

/** True when a single line is orphan terminal control debris (not meaningful CLI content). */
export function isControlDebrisOnly(text) {
  const t = String(text ?? '').trim();
  if (!t) return true;
  const lines = t.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return true;
  if (lines.every((line) => _isControlDebrisLine(line))) return true;
  return !hasReadableDisplayGlyphs(t);
}

function _isControlDebrisLine(line) {
  const t = String(line ?? '').trim();
  if (!t) return true;
  if (/^\[\?[0-9;]*[a-zA-Z]$/.test(t)) return true;
  if (/^\[(?:\d{1,4};)*\d{1,4}[A-Za-z]$/.test(t)) return true;
  if (/^\[\d* [a-zA-Z]$/.test(t)) return true;
  if (/^\d{1,4};\d{1,4}m$/.test(t)) return true;
  if (/^38;5;\d+m$/.test(t)) return true;
  if (/^\d{1,3};\d{1,3}m$/.test(t)) return true;
  if (/^\[[KJ]$/i.test(t)) return true;
  if (/^[KJ]$/i.test(t)) return true;
  if (isRawNoise(t, t)) return true;
  return false;
}

/** Strip ANSI/controls and normalize PTY output for web pre-wrap rendering. */
export function normalizeTerminalText(raw) {
  if (raw == null) return '';
  let text = _applyCarriageReturns(raw);
  text = text.replace(ANSI_OSC_RE, '');
  text = text.replace(ANSI_RE, '');
  text = text.replace(/\[(?:\d{1,4};)*\d{1,4}m/g, '');
  text = text.replace(CTRL_RE, '');
  return redactSecrets(text);
}

/** Strip ANSI and harmful control characters; preserve newlines/tabs. */
export function sanitizeTranscriptText(raw) {
  return normalizeTerminalText(raw).trimEnd();
}

/** Redact obvious secret patterns from operator-visible text. */
export function redactSecrets(raw) {
  if (raw == null) return '';
  return String(raw)
    .replace(SECRET_RE, '[redacted]')
    .replace(/vck_[A-Za-z0-9]{4,}/g, 'vck_…');
}

export function normalizeForDedup(text) {
  return normalizeTerminalText(text).replace(/\s+/g, ' ').trim();
}

function _pickRawString(...values) {
  for (const value of values) {
    if (value == null) continue;
    if (typeof value === 'string' && value.length) return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
      const s = String(value);
      if (s.length) return s;
    }
  }
  return '';
}

/** Extract raw chunk text without normalization (for consecutive stream append). */
export function extractTranscriptChunkRaw(payload) {
  if (payload == null) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload !== 'object') return String(payload);

  const nested = payload.payload;
  const eventObj =
    payload.event && typeof payload.event === 'object' && !Array.isArray(payload.event)
      ? payload.event
      : null;
  const dataObj =
    payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
      ? payload.data
      : null;

  const text = _pickRawString(
    payload.text,
    payload.content,
    payload.message,
    payload.delta,
    payload.output,
    payload.line,
    payload.stdout,
    payload.stderr,
    payload.chunk,
    payload.value,
    typeof payload.data === 'string' ? payload.data : null,
    payload.raw,
    nested?.text,
    nested?.content,
    nested?.message,
    nested?.delta,
    nested?.output,
    nested?.line,
    nested?.stdout,
    nested?.stderr,
    nested?.chunk,
    nested?.value,
    nested?.data,
    dataObj?.text,
    dataObj?.content,
    dataObj?.message,
    dataObj?.delta,
    dataObj?.output,
    dataObj?.line,
    dataObj?.stdout,
    dataObj?.stderr,
    dataObj?.chunk,
    dataObj?.value,
    eventObj?.text,
    eventObj?.content,
    eventObj?.message,
    eventObj?.delta,
    eventObj?.output,
    eventObj?.data,
  );

  if (text) return text;

  if (Array.isArray(payload.lines)) {
    return payload.lines
      .map((line) => (typeof line === 'string' ? line : extractTranscriptChunkRaw(line)))
      .join('');
  }

  return '';
}

/** Collect every non-empty string payload field that may carry PTY bytes. */
function _collectPtyPayloadTextCandidates(payload) {
  if (payload == null) return [];
  if (typeof payload === 'string') return payload.length ? [payload] : [];
  if (typeof payload !== 'object') {
    const s = String(payload);
    return s.length ? [s] : [];
  }

  const nested = payload.payload;
  const eventObj =
    payload.event && typeof payload.event === 'object' && !Array.isArray(payload.event)
      ? payload.event
      : null;
  const dataObj =
    payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
      ? payload.data
      : null;

  const values = [
    payload.text,
    payload.content,
    payload.message,
    payload.delta,
    payload.output,
    payload.line,
    payload.stdout,
    payload.stderr,
    payload.chunk,
    payload.value,
    typeof payload.data === 'string' ? payload.data : null,
    payload.raw,
    nested?.text,
    nested?.content,
    nested?.message,
    nested?.delta,
    nested?.output,
    nested?.line,
    nested?.stdout,
    nested?.stderr,
    nested?.chunk,
    nested?.value,
    nested?.data,
    dataObj?.text,
    dataObj?.content,
    dataObj?.message,
    dataObj?.delta,
    dataObj?.output,
    dataObj?.line,
    dataObj?.stdout,
    dataObj?.stderr,
    dataObj?.chunk,
    dataObj?.value,
    eventObj?.text,
    eventObj?.content,
    eventObj?.message,
    eventObj?.delta,
    eventObj?.output,
    eventObj?.data,
  ];

  const out = [];
  const seen = new Set();
  for (const value of values) {
    if (typeof value !== 'string' || !value.length || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }

  if (Array.isArray(payload.lines)) {
    for (const line of payload.lines) {
      const s = typeof line === 'string' ? line : extractTranscriptChunkRaw(line);
      if (s && !seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    }
  }

  return out;
}

/**
 * Pick the payload field whose readable extraction yields the most meaningful text.
 * Styled transcript only — raw debug keeps first-field extractTranscriptChunkRaw fidelity.
 */
export function resolveBestPtyPayloadText(payload) {
  const candidates = _collectPtyPayloadTextCandidates(payload);
  let bestRaw = '';
  let bestScore = 0;
  for (const raw of candidates) {
    const readable = extractReadablePtyText(raw);
    if (!readable.trim() || isControlDebrisOnly(readable)) continue;
    const score = readable.replace(/\s+/g, '').length;
    if (score > bestScore) {
      bestScore = score;
      bestRaw = raw;
    }
  }
  return bestRaw;
}

/** Resolve raw chunk text for styled transcript classification (best readable candidate). */
export function resolveStyledTranscriptChunkRaw(payload, meta = null) {
  const best = resolveBestPtyPayloadText(payload);
  if (best) return best;
  const fallback = meta?.text || extractTranscriptChunkRaw(payload);
  if (fallback && hasVisibleTranscriptText(fallback)) return fallback;
  return '';
}

/** Resolve raw chunk text that will produce visible transcript content. */
export function resolveTranscriptChunkRaw(payload, meta = null) {
  const styled = resolveStyledTranscriptChunkRaw(payload, meta);
  if (styled) return styled;
  const candidates = [extractTranscriptChunkRaw(payload), meta?.text || ''];
  for (const raw of candidates) {
    if (raw && hasVisibleTranscriptText(raw)) return raw;
  }
  return '';
}

/** Normalize user input for optimistic/stream echo comparison. */
export function normalizeUserInputForEchoCompare(text) {
  return normalizeTerminalText(text).replace(/\s+/g, ' ').trim();
}

/** True when a streamed USER/input event duplicates recent optimistic send. */
export function shouldSuppressUserInputEcho(
  text,
  { sessionId = '', lastOptimistic = null, now = Date.now(), windowMs = USER_INPUT_ECHO_DEDUPE_MS } = {},
) {
  if (!text || !lastOptimistic?.text) return false;
  if (
    lastOptimistic.sessionId &&
    sessionId &&
    lastOptimistic.sessionId !== sessionId
  ) {
    return false;
  }
  if (
    normalizeUserInputForEchoCompare(text) !==
    normalizeUserInputForEchoCompare(lastOptimistic.text)
  ) {
    return false;
  }
  return now - (lastOptimistic.at || 0) <= windowMs;
}

/** Strip Hermes PTY bullet prefix from echoed user input in output events. */
export function stripOutputUserEchoPrefix(text) {
  return normalizeTerminalText(text).replace(/^●\s*/, '').trim();
}

/** True when output event duplicates recent optimistic USER send (PTY echo). */
export function shouldSuppressUserOutputEcho(
  text,
  { lastOptimisticUser = null, lastOptimistic = null } = {},
) {
  const optimistic = lastOptimisticUser || lastOptimistic;
  if (!text || !optimistic?.text) return false;
  const stripped = stripOutputUserEchoPrefix(text);
  return (
    normalizeUserInputForEchoCompare(stripped) ===
    normalizeUserInputForEchoCompare(optimistic.text)
  );
}

/** Hermes answer-box opener (e.g. "╭─ ⚕ Hermes ─────╮") — only after user input. */
export function isHermesAnswerBoxOpener(text, { hasUserSentInput = false } = {}) {
  if (!hasUserSentInput) return false;
  const t = normalizeTerminalText(text).trim();
  if (isHermesStartupBannerText(t)) return false;
  if (/hermes agent v/i.test(t)) return false;
  if (/available tools|available skills/i.test(t)) return false;
  return /╭/.test(t) && /⚕[\s─]*hermes|╭[\s─]*⚕[\s─]*hermes/i.test(t);
}

/** Hermes answer-box closer (e.g. "╰──────────────╯"). */
export function isHermesAnswerBoxCloser(text) {
  const t = normalizeTerminalText(text).trim();
  return /╰/.test(t) && /─/.test(t);
}

/** Box border / frame lines (answer-box opener/closer) — skip border itself. */
export function isHermesAnswerBoxBorderOnly(text) {
  const t = normalizeTerminalText(text).trim();
  if (isHermesAnswerBoxCloser(t)) return true;
  if (/╭/.test(t) && /⚕[\s─]*hermes|╭[\s─]*⚕[\s─]*hermes/i.test(t)) return true;
  return false;
}

/** True when chunk is only terminal control / empty — not meaningful CLI content. */
export function isControlOnlyChunk(text) {
  const readable = extractReadablePtyText(text);
  if (!readable.trim()) return true;
  return isControlDebrisOnly(readable);
}

/**
 * Hermes CLI status/progress/prompt activity lines.
 * Visible as HERMES — excluded from answer-box RESPONSE prose detection.
 */
export function isHermesCliStatusLine(text) {
  const t = normalizeTerminalText(text).trim();
  if (!t) return false;
  if (/^❯\s*$/.test(t) || /^>\s*$/.test(t)) return true;
  if (/\│/.test(t) && (
    /\d+\/\d+[KMG]?|[░▓█]{2,}|\d+%|[⏱⏲]/.test(t) ||
    /gpt-|claude-|o\d-/i.test(t) ||
    /ctx/i.test(t)
  )) {
    return true;
  }
  if (/msg=interrupt|\/queue|\/bg|\/steer|ctrl\+c cancel/i.test(t)) return true;
  if (/deliberating|ruminating|synthesizing|musing/i.test(t)) return true;
  return false;
}

/** @deprecated alias — use isHermesCliStatusLine */
export function isHermesPromptStatusChrome(text) {
  return isHermesCliStatusLine(text);
}

/** True when normalized text is meaningful visible Hermes CLI output. */
export function isVisibleHermesCliText(text) {
  const t = extractReadablePtyText(text).trim();
  if (!t || isControlDebrisOnly(t)) return false;
  return true;
}

/** True when line looks like assistant answer prose inside a Hermes answer box. */
export function isHermesAnswerProse(text) {
  const t = normalizeTerminalText(text).trim();
  if (!t || isHermesAnswerBoxBorderOnly(t)) return false;
  if (isHermesStartupBannerText(t) || isHermesStartupProseText(t)) return false;
  if (isHermesAnswerBoxOpener(t, { hasUserSentInput: true })) return false;
  if (isHermesAnswerBoxCloser(t)) return false;
  if (isHermesCliStatusLine(t)) return false;
  if (_isAuxiliaryTitleWarning(t)) return false;
  return /[\p{L}]/u.test(t) || /[a-zA-Z]/.test(t);
}

function _formatAnswerProseLine(text) {
  return extractReadablePtyText(text).replace(/^\s{1,8}/, '').trimEnd();
}

/** Startup terminal banner / tool list / skills list — always HERMES, never answer box. */
export function isHermesStartupBannerText(text) {
  const t = normalizeTerminalText(text).trim();
  if (!t) return false;
  const markers = [
    /hermes agent v\d/i,
    /available tools/i,
    /available skills/i,
    /\btoolsets?\b/i,
    /\bsession:/i,
    /\d+\s+tools\b/i,
    /\d+\s+skills\b/i,
    /browser:\s*browser_/i,
    /clarify:\s*clarify/i,
    /execute_code/i,
    /computer_use:/i,
    /cronjob:/i,
  ];
  return markers.some((re) => re.test(t));
}

/** Startup welcome/tip prose — RESPONSE, separate from terminal banner. */
export function normalizeStartupProseLine(text) {
  return normalizeTerminalText(text)
    .trim()
    .replace(/^[\s✦★●◆▸►▪·•]+/u, '')
    .trim();
}

/** Startup welcome/tip prose — RESPONSE, separate from terminal banner. */
export function isHermesStartupProseText(text) {
  const t = normalizeTerminalText(text).trim();
  if (!t) return false;
  const deglyph = normalizeStartupProseLine(t);
  if (/^welcome to hermes agent/i.test(t) || /^welcome to hermes agent/i.test(deglyph)) {
    return true;
  }
  if (/^tip:/i.test(deglyph)) return true;
  return false;
}

function _isAuxiliaryTitleWarning(text) {
  return /auxiliary title generation failed/i.test(text);
}

function _buildHermesClassifierResult(text, st, { answerBoxActivity = false } = {}) {
  const dedupeNorm = normalizeForDedup(text);
  if (dedupeNorm && dedupeNorm === st.lastHermesVisibleNorm) {
    return { category: DISPLAY_CATEGORIES.RAW_NOISE, visible: false, text: '' };
  }
  if (dedupeNorm) st.lastHermesVisibleNorm = dedupeNorm;
  return {
    category: DISPLAY_CATEGORIES.HERMES_OUTPUT,
    visible: true,
    text,
    answerBoxActivity: Boolean(answerBoxActivity && st.inHermesAnswerBox),
  };
}

/**
 * Classify Hermes PTY output chunk for styled transcript rendering.
 * Mutates answer-box state when `state` is provided.
 */
export function classifyHermesOutputText(rawText, context = {}, state = null) {
  const displayText = extractReadablePtyText(rawText);
  const st = state || {
    inHermesAnswerBox: false,
    hasUserSentInput: false,
    answerBoxHasRenderedContent: false,
    lastHermesVisibleNorm: '',
  };

  if (!displayText.trim() || isControlDebrisOnly(displayText)) {
    return { category: DISPLAY_CATEGORIES.RAW_NOISE, visible: false, text: '' };
  }

  if (shouldSuppressUserOutputEcho(displayText, context)) {
    return { category: DISPLAY_CATEGORIES.RAW_NOISE, visible: false, text: '' };
  }

  const hasUserSentInput = Boolean(
    context.hasUserSentInput ||
      st.hasUserSentInput ||
      context.lastOptimisticUser?.text?.trim(),
  );
  const boxCtx = { hasUserSentInput };

  const lines = displayText.split('\n');
  const responseLines = [];
  const warningLines = [];
  const errorLines = [];
  const hermesLines = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || isControlDebrisOnly(trimmed)) continue;

    if (_isAuxiliaryTitleWarning(trimmed)) {
      warningLines.push(redactSecrets(trimmed));
      continue;
    }

    if (isHermesStartupBannerText(trimmed)) {
      if (!st.inHermesAnswerBox || !st.answerBoxHasRenderedContent) {
        st.inHermesAnswerBox = false;
      }
      hermesLines.push(line);
      continue;
    }

    if (isHermesStartupProseText(trimmed)) {
      responseLines.push(normalizeStartupProseLine(trimmed));
      continue;
    }

    if (isHermesAnswerBoxOpener(trimmed, boxCtx)) {
      st.inHermesAnswerBox = true;
      st.answerBoxOpenedAt = Date.now();
      continue;
    }

    if (st.inHermesAnswerBox && isHermesAnswerBoxCloser(trimmed)) {
      st.inHermesAnswerBox = false;
      st.answerBoxHasRenderedContent = false;
      continue;
    }

    if (isHermesAnswerBoxBorderOnly(trimmed)) continue;

    if (st.inHermesAnswerBox && boxCtx.hasUserSentInput && isHermesAnswerProse(trimmed)) {
      st.answerBoxHasRenderedContent = true;
      responseLines.push(_formatAnswerProseLine(trimmed));
      continue;
    }

    const cat = classifyContentCategory(trimmed, { source: 'output' });
    if (cat === DISPLAY_CATEGORIES.ERROR) {
      errorLines.push(redactSecrets(trimmed));
    } else if (cat === DISPLAY_CATEGORIES.WARNING) {
      warningLines.push(redactSecrets(trimmed));
    } else if (isVisibleHermesCliText(trimmed)) {
      hermesLines.push(line);
    } else if (cat !== DISPLAY_CATEGORIES.RAW_NOISE) {
      hermesLines.push(line);
    }
  }

  if (responseLines.length) {
    return {
      category: DISPLAY_CATEGORIES.FINAL_LIKE,
      visible: true,
      text: responseLines.join('\n'),
      answerProse: true,
    };
  }
  if (errorLines.length) {
    return {
      category: DISPLAY_CATEGORIES.ERROR,
      visible: true,
      text: errorLines.join('\n'),
    };
  }
  if (warningLines.length) {
    return {
      category: DISPLAY_CATEGORIES.WARNING,
      visible: true,
      text: warningLines.join('\n'),
    };
  }
  if (hermesLines.length) {
    const joined = hermesLines.join('\n');
    if (isHermesStartupBannerText(joined)) {
      return _buildHermesClassifierResult(joined, st);
    }
    const cat = classifyContentCategory(joined, { source: 'output' });
    if (cat === DISPLAY_CATEGORIES.FINAL_LIKE) {
      return _buildHermesClassifierResult(joined, st, {
        answerBoxActivity: st.inHermesAnswerBox,
      });
    }
    if (cat === DISPLAY_CATEGORIES.RAW_NOISE || isRawNoise(joined, rawText)) {
      return { category: DISPLAY_CATEGORIES.RAW_NOISE, visible: false, text: '' };
    }
    const activity = st.inHermesAnswerBox && hermesLines.some((l) => isHermesCliStatusLine(l.trim()));
    return _buildHermesClassifierResult(joined, st, { answerBoxActivity: activity });
  }

  return { category: DISPLAY_CATEGORIES.RAW_NOISE, visible: false, text: '' };
}

/** Stateful classifier preserving Hermes answer-box context across output events. */
export function createHermesOutputClassifier() {
  const state = {
    inHermesAnswerBox: false,
    hasUserSentInput: false,
    lastUserInputText: '',
    answerBoxHasRenderedContent: false,
    answerBoxOpenedAt: 0,
    lastHermesVisibleNorm: '',
  };
  return {
    reset() {
      state.inHermesAnswerBox = false;
      state.hasUserSentInput = false;
      state.lastUserInputText = '';
      state.answerBoxHasRenderedContent = false;
      state.answerBoxOpenedAt = 0;
      state.lastHermesVisibleNorm = '';
    },
    noteUserInput(text) {
      const trimmed = normalizeTerminalText(text).trim();
      if (!trimmed) return;
      const isNew =
        !state.lastUserInputText ||
        normalizeUserInputForEchoCompare(trimmed) !==
          normalizeUserInputForEchoCompare(state.lastUserInputText);
      state.hasUserSentInput = true;
      state.lastUserInputText = trimmed;
      state.lastHermesVisibleNorm = '';
      if (isNew) {
        state.inHermesAnswerBox = false;
        state.answerBoxHasRenderedContent = false;
        state.answerBoxOpenedAt = 0;
      }
    },
    classifyOutput(rawText, context = {}) {
      const merged = {
        ...context,
        hasUserSentInput:
          state.hasUserSentInput || Boolean(context.lastOptimisticUser?.text?.trim()),
      };
      return classifyHermesOutputText(rawText, merged, state);
    },
    getState() {
      return { ...state };
    },
  };
}

/** Extract operator-visible transcript text from Gateway/Core event payloads. */
export function extractTranscriptText(payload) {
  const raw = extractTranscriptChunkRaw(payload);
  if (!raw) return '';
  const normalized = normalizeTerminalText(raw);
  return normalized.trim() ? normalized : '';
}

/** True when transcript text should appear in the main styled panel. */
export function hasVisibleTranscriptText(text) {
  const readable = extractReadablePtyText(text);
  if (!readable.trim() || isControlDebrisOnly(readable)) return false;
  return true;
}

/** Map classified event metadata to a visual transcript group role. */
export function normalizeTranscriptGroupRole(meta, eventName = '', payload = null) {
  const cat = meta?.category || meta?.kind;
  if (!cat || cat === DISPLAY_CATEGORIES.RAW_NOISE || cat === DISPLAY_CATEGORIES.HEARTBEAT) {
    return null;
  }
  if (
    cat === DISPLAY_CATEGORIES.USER_INPUT ||
    cat === DISPLAY_CATEGORIES.SLASH_COMMAND ||
    cat === DISPLAY_CATEGORIES.COMMAND
  ) {
    return TRANSCRIPT_GROUP_ROLES.USER;
  }
  if (cat === DISPLAY_CATEGORIES.FINAL_LIKE) {
    return TRANSCRIPT_GROUP_ROLES.RESPONSE;
  }
  if (
    cat === DISPLAY_CATEGORIES.HERMES_OUTPUT ||
    cat === DISPLAY_CATEGORIES.TOOL_LIKE ||
    cat === DISPLAY_CATEGORIES.SHELL_LIKE
  ) {
    return TRANSCRIPT_GROUP_ROLES.HERMES;
  }
  if (cat === DISPLAY_CATEGORIES.STATUS) return TRANSCRIPT_GROUP_ROLES.SYSTEM;
  if (cat === DISPLAY_CATEGORIES.WARNING) return TRANSCRIPT_GROUP_ROLES.WARNING;
  if (cat === DISPLAY_CATEGORIES.ERROR) {
    return TRANSCRIPT_GROUP_ROLES.ERROR;
  }
  if (cat === DISPLAY_CATEGORIES.STOPPED) return TRANSCRIPT_GROUP_ROLES.SESSION;

  const name = String(eventName || payload?.type || '').toLowerCase();
  const payloadRole = String(payload?.role || '').toLowerCase();
  if (name === 'hermes_input' || name === 'input') return TRANSCRIPT_GROUP_ROLES.USER;
  if (
    name === 'response' ||
    name === 'assistant' ||
    name === 'completion' ||
    name === 'final' ||
    payloadRole === 'response' ||
    payloadRole === 'assistant' ||
    payloadRole === 'final' ||
    payloadRole === 'completion'
  ) {
    return TRANSCRIPT_GROUP_ROLES.RESPONSE;
  }
  if (name === 'hermes_output' || name === 'output' || name === 'message') {
    return TRANSCRIPT_GROUP_ROLES.HERMES;
  }
  return TRANSCRIPT_GROUP_ROLES.HERMES;
}

/** True when the next event should append to the current visible transcript group. */
export function shouldAppendToTranscriptGroup(previousRole, nextRole) {
  if (!previousRole || !nextRole) return false;
  return previousRole === nextRole;
}

export function getTranscriptGroupLabel(role) {
  const labels = {
    [TRANSCRIPT_GROUP_ROLES.HERMES]: 'HERMES',
    [TRANSCRIPT_GROUP_ROLES.RESPONSE]: 'RESPONSE',
    [TRANSCRIPT_GROUP_ROLES.USER]: 'USER',
    [TRANSCRIPT_GROUP_ROLES.SYSTEM]: 'SYSTEM',
    [TRANSCRIPT_GROUP_ROLES.WARNING]: 'WARNING',
    [TRANSCRIPT_GROUP_ROLES.ERROR]: 'ERROR',
    [TRANSCRIPT_GROUP_ROLES.SESSION]: 'SESSION',
  };
  return labels[role] || 'HERMES';
}

export function getTranscriptGroupClass(role) {
  return `claudia-cli-mirror-stream-group claudia-cli-mirror-stream-${role || 'hermes'}`;
}

/** Append raw chunk text to a group buffer (visible transcript append policy). */
export function appendTranscriptGroupBuffer(group, chunkRaw, { classifiedDisplay = false } = {}) {
  if (!group || !chunkRaw) return group;
  let prefix = '';
  if (group.rawBuffer && !group.rawBuffer.endsWith('\n') && !String(chunkRaw).startsWith('\n')) {
    if (group.role === TRANSCRIPT_GROUP_ROLES.RESPONSE) {
      prefix = '\n';
    } else if (group.role === TRANSCRIPT_GROUP_ROLES.HERMES) {
      const prev = group.rawBuffer;
      const next = String(chunkRaw);
      const continuesSplitWord = /[a-zA-Z]$/.test(prev) && /^[a-z]/.test(next);
      if (!continuesSplitWord) prefix = '\n';
    }
  }
  group.rawBuffer = `${group.rawBuffer || ''}${prefix}${chunkRaw}`;
  const extracted = extractReadablePtyText(group.rawBuffer).trimEnd();
  if (classifiedDisplay && String(chunkRaw).trim()) {
    const chunkDisplay = extractReadablePtyText(chunkRaw).trimEnd() || String(chunkRaw).trimEnd();
    const prevDisplay = group.displayText || '';
    group.displayText = prevDisplay
      ? `${prevDisplay}${prefix}${chunkDisplay}`.trimEnd()
      : chunkDisplay;
  } else {
    group.displayText = extracted || group.displayText || '';
  }
  return group;
}

/** Resolve append target for answer-box RESPONSE merging across in-box HERMES activity. */
export function resolveAnswerBoxResponseAppendTarget(
  role,
  meta,
  { current = null, lastAnswerBoxResponseGroup = null } = {},
) {
  if (
    role === TRANSCRIPT_GROUP_ROLES.RESPONSE &&
    meta?.answerProse &&
    lastAnswerBoxResponseGroup
  ) {
    return lastAnswerBoxResponseGroup;
  }
  if (current && shouldAppendToTranscriptGroup(current.role, role)) {
    return current;
  }
  return null;
}

/** Resolve append target for in-box HERMES activity across RESPONSE boundaries. */
export function resolveAnswerBoxHermesAppendTarget(
  role,
  meta,
  { current = null, lastAnswerBoxHermesGroup = null } = {},
) {
  if (
    role === TRANSCRIPT_GROUP_ROLES.HERMES &&
    meta?.answerBoxActivity &&
    lastAnswerBoxHermesGroup
  ) {
    return lastAnswerBoxHermesGroup;
  }
  if (current && shouldAppendToTranscriptGroup(current.role, role)) {
    return current;
  }
  return null;
}

/** Pick transcript append target with answer-box merge rules. */
export function resolveTranscriptAppendTarget(
  role,
  meta,
  { current = null, lastAnswerBoxResponseGroup = null, lastAnswerBoxHermesGroup = null } = {},
) {
  return (
    resolveAnswerBoxResponseAppendTarget(role, meta, {
      current,
      lastAnswerBoxResponseGroup,
    }) ||
    resolveAnswerBoxHermesAppendTarget(role, meta, {
      current,
      lastAnswerBoxHermesGroup,
    }) ||
    (current && shouldAppendToTranscriptGroup(current.role, role) ? current : null)
  );
}

/** Per-event classification diagnostic for tests and dev debugging (no sequence numbers). */
export function diagnoseTranscriptEvent(eventName, payload, options = {}) {
  const name = String(eventName || payload?.type || '').toLowerCase();
  const chunkRaw = extractTranscriptChunkRaw(payload);
  const bestRaw = resolveBestPtyPayloadText(payload);
  const displayText = extractReadablePtyText(bestRaw || chunkRaw);
  const meta = classifyStreamEvent(eventName, payload, options);
  const role = meta?.visible
    ? normalizeTranscriptGroupRole(meta, eventName, payload)
    : null;

  let skipReason = '';
  if (!meta?.visible) {
    if (!displayText.trim() || isControlDebrisOnly(displayText)) {
      skipReason = 'control_debris_or_empty';
    } else if (
      (name === 'hermes_input' || name === 'input') &&
      shouldSuppressUserInputEcho(extractTranscriptText(payload), {
        sessionId: options.sessionId || '',
        lastOptimistic: options.lastOptimisticUser,
      })
    ) {
      skipReason = 'user_input_echo';
    } else if (
      (name === 'hermes_output' || name === 'output') &&
      shouldSuppressUserOutputEcho(displayText, { lastOptimisticUser: options.lastOptimisticUser })
    ) {
      skipReason = 'user_output_echo';
    } else if (meta.category === DISPLAY_CATEGORIES.RAW_NOISE) {
      skipReason = 'raw_noise';
    } else {
      skipReason = 'classifier_hidden';
    }
  }

  return {
    eventName: name,
    chunkRaw,
    bestRaw,
    displayText,
    category: meta?.category || null,
    role,
    visible: Boolean(meta?.visible),
    skipReason: meta?.visible ? '' : skipReason,
    appendTargetHint: role ? 'new_or_merge' : null,
    metaText: meta?.text || '',
    answerProse: Boolean(meta?.answerProse),
    answerBoxActivity: Boolean(meta?.answerBoxActivity),
    classifierState: options.outputClassifier?.getState?.() || null,
  };
}

/** Simulate visible transcript grouping for a sequence of classified events. */
export function simulateTranscriptGroupSequence(events, options = {}) {
  const groups = [];
  let current = null;
  let lastAnswerBoxResponseGroup = null;
  let lastAnswerBoxHermesGroup = null;
  const classifier = options.outputClassifier || null;
  const lastOptimisticUser = options.lastOptimisticUser || null;
  const sessionId = options.sessionId || '';

  for (const { meta: presetMeta, eventName = 'hermes_output', payload = {}, chunkRaw } of events) {
    const name = String(eventName || payload?.type || '').toLowerCase();
    if (
      (name === 'hermes_input' || name === 'input') &&
      groups.some((g) => g.role === TRANSCRIPT_GROUP_ROLES.USER) &&
      shouldSuppressUserInputEcho(extractTranscriptText(payload), {
        sessionId,
        lastOptimistic: lastOptimisticUser,
      })
    ) {
      continue;
    }

    const meta =
      presetMeta ??
      classifyStreamEvent(eventName, payload, {
        outputClassifier: classifier,
        lastOptimisticUser,
        sessionId,
      });
    if (!meta?.visible) continue;
    const raw = chunkRaw ?? resolveTranscriptChunkRaw(payload, meta);
    if (!raw && !(meta.category === DISPLAY_CATEGORIES.WARNING || meta.category === DISPLAY_CATEGORIES.ERROR)) {
      continue;
    }
    const appendRaw =
      meta.category === DISPLAY_CATEGORIES.FINAL_LIKE ||
      meta.category === DISPLAY_CATEGORIES.WARNING ||
      meta.category === DISPLAY_CATEGORIES.ERROR
        ? meta.text || raw
        : meta.text || raw;
    if (!appendRaw) continue;

    const role = normalizeTranscriptGroupRole(meta, eventName, payload);
    if (!role) continue;

    const classifiedDisplay = Boolean(meta.text && appendRaw === meta.text);
    const appendOpts = { classifiedDisplay };

    const appendTarget = resolveTranscriptAppendTarget(role, meta, {
      current,
      lastAnswerBoxResponseGroup,
      lastAnswerBoxHermesGroup,
    });

    if (appendTarget) {
      appendTranscriptGroupBuffer(appendTarget, appendRaw, appendOpts);
      current = appendTarget;
    } else {
      current = { role, rawBuffer: '', displayText: '' };
      appendTranscriptGroupBuffer(current, appendRaw, appendOpts);
      groups.push(current);
    }

    if (role === TRANSCRIPT_GROUP_ROLES.RESPONSE && meta.answerProse) {
      lastAnswerBoxResponseGroup = current;
    } else if (role === TRANSCRIPT_GROUP_ROLES.USER) {
      lastAnswerBoxResponseGroup = null;
      lastAnswerBoxHermesGroup = null;
    } else if (role === TRANSCRIPT_GROUP_ROLES.HERMES && meta.answerBoxActivity) {
      if (!lastAnswerBoxHermesGroup) lastAnswerBoxHermesGroup = current;
    }

    if (classifier && !classifier.getState().inHermesAnswerBox) {
      lastAnswerBoxHermesGroup = null;
    }
  }

  return groups;
}

/** Fast progressive paint queue for large PTY bursts (requestAnimationFrame by default). */
export function createTranscriptPaintQueue({
  onFlush,
  sliceSize = 48,
  maxPerFrame = 4,
  scheduleFrame = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (fn) => setTimeout(fn, 0),
  cancelFrame = typeof cancelAnimationFrame === 'function'
    ? cancelAnimationFrame
    : (id) => clearTimeout(id),
} = {}) {
  let queue = [];
  let frameId = null;

  function flushFrame() {
    frameId = null;
    if (!queue.length) return;
    let added = 0;
    let batch = '';
    while (queue.length && added < maxPerFrame) {
      batch += queue.shift();
      added += 1;
    }
    if (batch) onFlush(batch);
    if (queue.length) frameId = scheduleFrame(flushFrame);
  }

  return {
    enqueue(text, { immediate = false } = {}) {
      if (!text) return;
      if (immediate || text.length <= sliceSize * 2) {
        onFlush(text);
        return;
      }
      for (let i = 0; i < text.length; i += sliceSize) {
        queue.push(text.slice(i, i + sliceSize));
      }
      if (!frameId) frameId = scheduleFrame(flushFrame);
    },
    clear() {
      queue = [];
      if (frameId != null) cancelFrame(frameId);
      frameId = null;
    },
    /** Flush all queued text immediately (preserves order). */
    flush() {
      if (frameId != null) cancelFrame(frameId);
      frameId = null;
      if (!queue.length) return;
      onFlush(queue.join(''));
      queue = [];
    },
    pending() {
      return queue.length;
    },
  };
}

const NOOP_STATUS_RE = /^(running|connected|ready|alive|ok|started|attached)$/i;

/** True when styled transcript should hide this chunk. */
export function isRawNoise(text, rawText) {
  const cleaned = normalizeTerminalText(text || rawText);
  if (!cleaned.trim()) return true;
  // Partial PTY/tool-list/skill-list fragments are substantive output, not noise.
  if (/[a-zA-Z:/_.,\-]{3,}/.test(cleaned)) return false;
  if (cleaned.length <= 2 && SPINNER_RE.test(cleaned)) return true;
  if (SPINNER_RE.test(cleaned.replace(/\d+/g, '')) && cleaned.length <= 24) return true;
  return false;
}

/** Classify operator/Hermes text using lightweight heuristics. */
export function classifyContentCategory(text, { source = 'output' } = {}) {
  const t = normalizeTerminalText(text).trim();
  if (!t) return DISPLAY_CATEGORIES.RAW_NOISE;

  if (source === 'input') {
    if (t.startsWith('/')) return DISPLAY_CATEGORIES.SLASH_COMMAND;
    if (/^[$>#]\s/.test(t) || t.startsWith('$') || t.startsWith('>')) {
      return DISPLAY_CATEGORIES.COMMAND;
    }
    return DISPLAY_CATEGORIES.USER_INPUT;
  }

  const lower = t.toLowerCase();
  if (ERROR_RE.test(lower) || AUTH_ERR_RE.test(lower)) {
    if (WARN_RE.test(lower) && !ERROR_RE.test(lower)) return DISPLAY_CATEGORIES.WARNING;
    return DISPLAY_CATEGORIES.ERROR;
  }
  if (WARN_RE.test(lower)) return DISPLAY_CATEGORIES.WARNING;
  if (TOOL_RE.test(t)) return DISPLAY_CATEGORIES.TOOL_LIKE;
  if (/^\$\s|^>\s|^#/.test(t) || /^[\w./-]+:\d+:/.test(t)) {
    return DISPLAY_CATEGORIES.SHELL_LIKE;
  }

  const lines = t.split('\n').filter((l) => l.trim());
  const lastLine = lines[lines.length - 1] || '';
  const proseLike =
    t.length >= 48 &&
    lines.length <= 12 &&
    !/^[│─┌└┐┘╭╮╰╯]/.test(t) &&
    /[.!?]$/.test(lastLine.trim());
  if (proseLike) return DISPLAY_CATEGORIES.FINAL_LIKE;

  return DISPLAY_CATEGORIES.HERMES_OUTPUT;
}

/** Collapse repeated identical styled chunks (spinners/redraws). */
export function shouldCollapseDuplicate(previousNorm, nextNorm, previousCategory, nextCategory) {
  if (!previousNorm || !nextNorm || previousNorm !== nextNorm) return false;
  const collapsible = new Set([
    DISPLAY_CATEGORIES.HERMES_OUTPUT,
    DISPLAY_CATEGORIES.TOOL_LIKE,
    DISPLAY_CATEGORIES.SHELL_LIKE,
    DISPLAY_CATEGORIES.STATUS,
    DISPLAY_CATEGORIES.RAW_NOISE,
  ]);
  return collapsible.has(nextCategory) && collapsible.has(previousCategory);
}

function _styleForCategory(category) {
  return CATEGORY_STYLES[category] || CATEGORY_STYLES.hermes_output;
}

function _buildMeta(
  category,
  text,
  { visible = true, kind = category, answerProse = false, answerBoxActivity = false } = {},
) {
  const style = _styleForCategory(category);
  return {
    visible,
    category,
    kind,
    cardClass: style.card,
    label: style.label,
    text: redactSecrets(text),
    answerProse: Boolean(answerProse),
    answerBoxActivity: Boolean(answerBoxActivity),
  };
}

/** Map SSE event name + payload to transcript card metadata. */
export function classifyStreamEvent(eventName, payload, options = {}) {
  const { outputClassifier, lastOptimisticUser, sessionId = '' } = options;
  const name = (eventName || payload?.type || '').toLowerCase();
  const text = extractTranscriptText(payload);

  if (name === 'heartbeat' || payload?.heartbeat === true) {
    return _buildMeta(DISPLAY_CATEGORIES.HEARTBEAT, '', { visible: false });
  }

  if (name === 'hermes_input' || name === 'input') {
    const inputEcho = shouldSuppressUserInputEcho(text, {
      sessionId,
      lastOptimistic: lastOptimisticUser,
    });
    if (outputClassifier?.noteUserInput && hasVisibleTranscriptText(text) && !inputEcho) {
      outputClassifier.noteUserInput(text);
    }
    if (!hasVisibleTranscriptText(text)) {
      return _buildMeta(DISPLAY_CATEGORIES.RAW_NOISE, text, { visible: false });
    }
    const category = classifyContentCategory(text, { source: 'input' });
    return _buildMeta(category, text);
  }

  if (name === 'session_status' || name === 'status') {
    const statusText = hasVisibleTranscriptText(text)
      ? text
      : payload?.status
        ? String(payload.status)
        : '';
    if (!hasVisibleTranscriptText(statusText) || NOOP_STATUS_RE.test(statusText.trim())) {
      return _buildMeta(DISPLAY_CATEGORIES.RAW_NOISE, statusText, { visible: false });
    }
    return _buildMeta(DISPLAY_CATEGORIES.STATUS, statusText);
  }

  if (name === 'session_stopped' || name === 'stopped') {
    const stoppedText = hasVisibleTranscriptText(text)
      ? text
      : payload?.status
        ? String(payload.status)
        : 'Session stopped';
    return _buildMeta(DISPLAY_CATEGORIES.STOPPED, stoppedText);
  }

  if (name === 'error') {
    const errText =
      text ||
      payload?.status ||
      payload?.message ||
      extractTranscriptText(payload?.detail) ||
      'Stream error';
    return _buildMeta(DISPLAY_CATEGORIES.ERROR, String(errText));
  }

  if (
    name === 'response' ||
    name === 'assistant' ||
    name === 'completion' ||
    name === 'final' ||
    String(payload?.role || '').toLowerCase() === 'response' ||
    String(payload?.role || '').toLowerCase() === 'assistant' ||
    String(payload?.role || '').toLowerCase() === 'final' ||
    String(payload?.role || '').toLowerCase() === 'completion'
  ) {
    if (isRawNoise(text) || !hasVisibleTranscriptText(text)) {
      return _buildMeta(DISPLAY_CATEGORIES.RAW_NOISE, text, { visible: false });
    }
    return _buildMeta(DISPLAY_CATEGORIES.FINAL_LIKE, text);
  }

  if (name === 'hermes_output' || name === 'output' || name === 'message') {
    const raw =
      resolveBestPtyPayloadText(payload) ||
      extractTranscriptChunkRaw(payload) ||
      text;
    if (outputClassifier && typeof outputClassifier.classifyOutput === 'function') {
      const result = outputClassifier.classifyOutput(raw, { lastOptimisticUser });
      if (!result.visible) {
        return _buildMeta(
          result.category || DISPLAY_CATEGORIES.RAW_NOISE,
          result.text || '',
          { visible: false },
        );
      }
      return _buildMeta(result.category, result.text, {
        answerProse: result.answerProse,
        answerBoxActivity: result.answerBoxActivity,
      });
    }

    if (isRawNoise(text) || !hasVisibleTranscriptText(text)) {
      return _buildMeta(DISPLAY_CATEGORIES.RAW_NOISE, text, { visible: false });
    }
    const category = classifyContentCategory(text, { source: 'output' });
    if (category === DISPLAY_CATEGORIES.RAW_NOISE) {
      return _buildMeta(category, text, { visible: false });
    }
    return _buildMeta(category, text);
  }

  if (isRawNoise(text) || !hasVisibleTranscriptText(text)) {
    return _buildMeta(DISPLAY_CATEGORIES.RAW_NOISE, text, { visible: false });
  }

  const category = classifyContentCategory(text, { source: 'output' });
  return _buildMeta(category, text, { kind: category });
}

/** Format one raw drawer line (debug — keeps more detail than styled view). */
export function formatRawDrawerLine(eventName, payload) {
  const seq = payload?.seq != null ? `#${payload.seq}` : '';
  const ts = payload?.ts || payload?.timestamp || '';
  const tsPart = ts ? `[${ts}]` : '';
  const name = eventName || payload?.type || 'event';
  const safe = redactSecrets(extractTranscriptText(payload) || JSON.stringify(payload ?? {}));
  return `${tsPart}${seq ? ` ${seq}` : ''} [${name}] ${safe}`.trim();
}

/** Derive status chip label from session lifecycle state. */
export function deriveStatusChip(state) {
  const map = {
    not_connected: { label: 'Not connected', tone: 'muted' },
    ready: { label: 'Ready', tone: 'muted' },
    connecting: { label: 'Connecting', tone: 'warn' },
    running: { label: 'Running', tone: 'ok' },
    stopped: { label: 'Stopped', tone: 'muted' },
    error: { label: 'Error', tone: 'danger' },
    stream_disconnected: { label: 'Stream disconnected', tone: 'warn' },
  };
  return map[state] || { label: state || 'Unknown', tone: 'muted' };
}

/** Map Gateway/Core relay errors to operator-facing cards. */
export function mapApiError(httpStatus, body) {
  const status = (body?.status || body?.detail?.status || '').toLowerCase();
  const message =
    body?.message ||
    body?.detail?.message ||
    (typeof body?.detail === 'string' ? body.detail : '') ||
    '';

  if (httpStatus === 401 || httpStatus === 403) {
    return {
      code: 'admin_required',
      title: 'Admin access required',
      message:
        message ||
        'CLI Mirror is operator-only. Sign in as an admin or use a Claudia admin API token.',
      action: 'Sign in with an admin account, then refresh this panel.',
      recoverable: true,
    };
  }

  if (httpStatus === 409 || status === 'session_conflict' || status === 'conflict') {
    return {
      code: 'session_conflict',
      title: 'Session already active',
      message:
        message ||
        'Core already has an active Hermes PTY session. Attach the running session or stop it before starting a new one.',
      action: 'Click Refresh sessions, then Attach on the running session.',
      recoverable: true,
    };
  }

  if (httpStatus === 404 || status === 'not_found') {
    return {
      code: 'unknown_session',
      title: 'Session not found',
      message: message || 'That Hermes session no longer exists on Core.',
      action: 'Refresh sessions or start a new CLI Mirror session.',
      recoverable: true,
    };
  }

  if (status === 'core_not_configured') {
    return {
      code: 'core_not_configured',
      title: 'Claudia Core not configured',
      message:
        message ||
        'The Console Gateway has no Claudia Core URL. CLI Mirror cannot relay Hermes sessions.',
      action: 'Set CLAUDIA_CORE_URL on the Console host and restart the Console.',
      recoverable: false,
    };
  }

  if (status === 'core_unreachable' || status === 'unreachable') {
    return {
      code: 'core_unreachable',
      title: 'Claudia Core unreachable',
      message: message || 'The Gateway could not reach Claudia Core.',
      action: 'Start Core, verify CLAUDIA_CORE_URL, then click Refresh sessions.',
      recoverable: true,
    };
  }

  if (status === 'pty_disabled' || status === 'disabled') {
    return {
      code: 'pty_disabled',
      title: 'Hermes PTY disabled on Core',
      message:
        message ||
        'Claudia Core is reachable, but Hermes PTY mode is disabled.',
      action: 'Start Core with CLAUDIA_ENABLE_HERMES_PTY=true, then retry Start session.',
      recoverable: false,
    };
  }

  if (httpStatus === 501 || status === 'interrupt_failed') {
    return {
      code: 'interrupt_failed',
      title: 'Interrupt failed',
      message: message || 'Core did not accept interrupt for this session.',
      action: 'Try Stop session if the PTY is stuck.',
      recoverable: true,
    };
  }

  if (status === 'stop_failed') {
    return {
      code: 'stop_failed',
      title: 'Stop failed',
      message: message || 'Could not stop the Hermes session on Core.',
      action: 'Refresh sessions to confirm state, then retry Stop.',
      recoverable: true,
    };
  }

  if (httpStatus >= 500) {
    return {
      code: 'gateway_error',
      title: 'Gateway error',
      message: message || `Unexpected server error (${httpStatus}).`,
      action: 'Retry the action. Check Console Gateway logs if it persists.',
      recoverable: true,
    };
  }

  return {
    code: status || 'error',
    title: 'CLI Mirror error',
    message: message || `Request failed (${httpStatus || 'unknown'}).`,
    action: 'Retry or refresh sessions.',
    recoverable: true,
  };
}

export function buildStreamUrl(sessionId, afterSeq = 0) {
  const sid = encodeURIComponent(String(sessionId || '').trim());
  const seq = Math.max(0, Number(afterSeq) || 0);
  return `${CLI_SESSIONS_API}/${sid}/stream?after_seq=${seq}`;
}

export function extractSessionId(payload) {
  if (!payload || typeof payload !== 'object') return '';
  return (
    payload.session_id ||
    payload.session?.session_id ||
    payload.session?.id ||
    payload.id ||
    ''
  );
}

export function extractSessionStatus(payload) {
  if (!payload || typeof payload !== 'object') return '';
  return payload.status || payload.session?.status || '';
}

export function summarizeSessions(sessions, listMeta = {}) {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return {
      empty: true,
      running: [],
      stopped: [],
      note: 'No CLI Mirror session yet.',
      canStartNew: listMeta.can_start_new !== false,
      activeSessionId: listMeta.active_session_id || '',
      attachableIds: listMeta.attachable_session_ids || [],
    };
  }
  const running = sessions.filter((s) => s.status === 'running' || s.status === 'starting');
  const stopped = sessions.filter((s) => s.status !== 'running' && s.status !== 'starting');
  let note = '';
  if (running.length) {
    note = '';
  } else if (stopped.length) {
    note = 'No running session.';
  }
  return {
    empty: false,
    running,
    stopped,
    note,
    canStartNew: listMeta.can_start_new !== false,
    activeSessionId: listMeta.active_session_id || (running[0]?.session_id ?? ''),
    attachableIds: listMeta.attachable_session_ids || running.map((s) => s.session_id).filter(Boolean),
  };
}

/** Format session timestamps for operator list rows. */
export function formatSessionTimes(session) {
  const fmt = (ts) => {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) return String(ts);
      return d.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (_) {
      return String(ts);
    }
  };
  return {
    started: fmt(session?.started_at),
    lastActive: fmt(session?.last_activity_at),
    idleSeconds: session?.idle_seconds,
  };
}

export function truncateSessionId(sessionId, max = 14) {
  const sid = String(sessionId || '');
  if (sid.length <= max) return sid;
  return `${sid.slice(0, max)}…`;
}

export function isRunningSession(session) {
  const st = session?.status || '';
  return st === 'running' || st === 'starting';
}

export function mapConflictError(body, httpStatus = 409) {
  const detail =
    body?.detail && typeof body.detail === 'object' && !Array.isArray(body.detail)
      ? body.detail
      : body;
  const session = detail?.session || detail;
  const sessionId = extractSessionId(detail) || extractSessionId(session);
  const err = mapApiError(httpStatus, detail);
  err.attachSessionId = sessionId;
  if (sessionId) {
    err.action = `Click Attach on the running session (${truncateSessionId(sessionId)}) or use Refresh sessions.`;
  }
  return err;
}

export default {
  CLI_SESSIONS_API,
  CLI_MIRROR_MODE_KEY,
  CLI_MIRROR_SESSION_KEY,
  CLI_MIRROR_MODES,
  loadPersistedSessionId,
  savePersistedSessionId,
  clearPersistedSessionId,
  loadPersistedInteractionMode,
  DISPLAY_CATEGORIES,
  TRANSCRIPT_GROUP_ROLES,
  sanitizeTranscriptText,
  normalizeTerminalText,
  extractReadablePtyText,
  isControlDebrisOnly,
  hasReadableDisplayGlyphs,
  redactSecrets,
  normalizeForDedup,
  extractTranscriptText,
  extractTranscriptChunkRaw,
  resolveBestPtyPayloadText,
  resolveStyledTranscriptChunkRaw,
  resolveTranscriptChunkRaw,
  normalizeUserInputForEchoCompare,
  shouldSuppressUserInputEcho,
  shouldSuppressUserOutputEcho,
  stripOutputUserEchoPrefix,
  isHermesAnswerBoxOpener,
  isHermesAnswerBoxCloser,
  isHermesAnswerBoxBorderOnly,
  isControlOnlyChunk,
  isHermesCliStatusLine,
  isHermesPromptStatusChrome,
  isVisibleHermesCliText,
  isHermesAnswerProse,
  isHermesStartupBannerText,
  isHermesStartupProseText,
  normalizeStartupProseLine,
  classifyHermesOutputText,
  createHermesOutputClassifier,
  resolveAnswerBoxResponseAppendTarget,
  resolveAnswerBoxHermesAppendTarget,
  resolveTranscriptAppendTarget,
  USER_INPUT_ECHO_DEDUPE_MS,
  hasVisibleTranscriptText,
  normalizeTranscriptGroupRole,
  shouldAppendToTranscriptGroup,
  getTranscriptGroupLabel,
  getTranscriptGroupClass,
  appendTranscriptGroupBuffer,
  diagnoseTranscriptEvent,
  simulateTranscriptGroupSequence,
  createTranscriptPaintQueue,
  isRawNoise,
  classifyContentCategory,
  shouldCollapseDuplicate,
  classifyStreamEvent,
  formatRawDrawerLine,
  deriveStatusChip,
  mapApiError,
  buildStreamUrl,
  extractSessionId,
  extractSessionStatus,
  summarizeSessions,
  formatSessionTimes,
  truncateSessionId,
  isRunningSession,
  mapConflictError,
};
