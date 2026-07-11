/**
 * legacy local console dashboard — Gateway/Core status and approval intake (Package 9–10).
 * GET /api/nexus/v1/* for status; POST approval resolve only (forwards to Core).
 */

import uiModule from './ui.js';
import { makeWindowDraggable } from './windowDrag.js';

const API = '/api/nexus/v1';
const READ_ENDPOINTS = [
  { key: 'health', path: '/health', label: 'Gateway health' },
  { key: 'packets', path: '/packets', label: 'Packet list' },
  { key: 'workers', path: '/workers', label: 'Workers' },
  { key: 'tools', path: '/tools', label: 'Tool Factory' },
  { key: 'connectors', path: '/connectors', label: 'Connectors' },
  { key: 'housekeeping', path: '/housekeeping', label: 'Housekeeping' },
  { key: 'approvals', path: '/approvals', label: 'Approvals' },
];

let _open = false;
let _escHandler = null;
let _refreshTimer = null;

function esc(s) {
  return uiModule.esc(String(s ?? ''));
}

async function _fetchJson(path) {
  const res = await fetch(`${API}${path}`, { credentials: 'same-origin' });
  let body = null;
  try {
    body = await res.json();
  } catch (_) {
    body = { message: res.statusText || 'Invalid JSON' };
  }
  return { ok: res.ok, status: res.status, body };
}

function _badge(text, tone) {
  const cls = tone ? ` nexus-dash-badge-${tone}` : '';
  return `<span class="nexus-dash-badge${cls}">${esc(text)}</span>`;
}

function _renderDeploymentWarnings(warnings) {
  if (!Array.isArray(warnings) || !warnings.length) {
    return '';
  }
  const items = warnings.map((w) => {
    const sev = w.severity || 'info';
    const tone = sev === 'critical' || sev === 'high' ? 'warn' : 'muted';
    return `<li class="nexus-deploy-warn nexus-deploy-warn-${esc(sev)}">${_badge(sev, tone)} ${esc(w.message || w.code || '')}</li>`;
  }).join('');
  return `
    <div class="nexus-dash-deploy-warnings">
      <h4 class="nexus-dash-subhead">Deployment posture</h4>
      <ul class="nexus-deploy-warn-list">${items}</ul>
    </div>
  `;
}

function _renderHermesRuntimeCard(runtime) {
  if (!runtime || typeof runtime !== 'object') return '';
  const ok = runtime.validation_ok;
  const tone = ok ? 'ok' : 'warn';
  const rows = [
    ['Runtime valid', ok ? 'yes' : 'no'],
    ['HERMES_HOME', runtime.hermes_home],
    ['Hermes CLI', runtime.hermes_cli],
    ['Config', runtime.hermes_config_path],
  ];
  const kv = rows
    .filter(([, v]) => v)
    .map(([k, v]) => `<div><span>${esc(k)}</span><code class="nexus-dash-path">${esc(v)}</code></div>`)
    .join('');
  const errBlock = Array.isArray(runtime.errors) && runtime.errors.length
    ? `<ul class="nexus-deploy-warn-list">${runtime.errors.map((e) => `<li class="nexus-deploy-warn">${esc(e)}</li>`).join('')}</ul>`
    : '';
  return `
    <div class="nexus-dash-subsection">
      <h4 class="nexus-dash-subhead">Embedded Hermes runtime ${_badge(ok ? 'ok' : 'invalid', tone)}</h4>
      <div class="nexus-dash-kv nexus-dash-kv-paths">${kv}</div>
      ${errBlock}
    </div>
  `;
}

function _renderHealthCard(health) {
  if (!health?.body) {
    return '<p class="nexus-dash-muted">Unable to load Gateway health.</p>';
  }
  const h = health.body;
  const coreConfigured = h.core_configured ? 'yes' : 'no';
  const coreTone = h.core_configured ? (h.forwarded ? 'ok' : 'warn') : 'muted';
  const gwTone = h.ok ? 'ok' : 'warn';
  return `
    <div class="nexus-dash-kv">
      <div><span>Gateway</span>${_badge(h.status || 'unknown', gwTone)}</div>
      <div><span>Core configured</span>${_badge(coreConfigured, coreTone)}</div>
      <div><span>Core reachable</span>${_badge(h.forwarded ? 'yes' : 'no', h.forwarded ? 'ok' : 'warn')}</div>
      <div><span>Console Mode</span>${_badge(h.console_mode ? 'on' : 'off', h.console_mode ? 'ok' : 'muted')}</div>
    </div>
    <p class="nexus-dash-msg">${esc(h.message || '')}</p>
    ${_renderHermesRuntimeCard(h.hermes_runtime)}
    ${_renderDeploymentWarnings(h.deployment_warnings)}
  `;
}

function _renderPacketsCard(packets) {
  if (!packets?.body) {
    return '<p class="nexus-dash-muted">Unable to load packet status.</p>';
  }
  const p = packets.body;
  return `
    <div class="nexus-dash-kv">
      <div><span>Persistence</span>${_badge(p.persistence ? 'yes' : 'no', p.persistence ? 'ok' : 'muted')}</div>
      <div><span>Status</span>${_badge(p.status || 'unknown', 'muted')}</div>
      <div><span>Stored count</span><code>${esc(p.count ?? 0)}</code></div>
    </div>
    <p class="nexus-dash-msg">${esc(p.message || '')}</p>
  `;
}

function _renderApprovalsCard(data) {
  if (!data?.body) {
    return '<p class="nexus-dash-muted">Unable to load approvals.</p>';
  }
  const b = data.body;
  const items = Array.isArray(b.approvals) ? b.approvals : (Array.isArray(b.items) ? b.items : []);
  const pending = b.pending_count != null ? b.pending_count : items.length;
  const statusTone = b.status === 'forwarded' ? 'ok' : 'muted';
  let listHtml = '<p class="nexus-dash-muted">No pending approvals in this view.</p>';
  if (items.length) {
    listHtml = `<ul class="nexus-approvals-list">${items.map((item) => {
      const id = typeof item === 'string' ? item : (item.approval_id || item.id || 'unknown');
      const summary = typeof item === 'object' && item.summary ? item.summary : '';
      return `<li><code>${esc(id)}</code>${summary ? ` — ${esc(summary)}` : ''}</li>`;
    }).join('')}</ul>`;
  }
  return `
    <div class="nexus-dash-kv">
      <div><span>Queue</span>${_badge(b.status || 'unknown', statusTone)}</div>
      <div><span>Pending</span><code>${esc(pending)}</code></div>
    </div>
    <p class="nexus-dash-msg">${esc(b.message || '')}</p>
    ${listHtml}
    <div class="nexus-approval-resolve">
      <p class="nexus-dash-foot">Forward a human decision to Nexus Core (requires session/admin). Gateway does not execute the approved action locally.</p>
      <label class="nexus-approval-field">Approval ID
        <input type="text" id="nexus-approval-id" placeholder="approval_id" autocomplete="off" />
      </label>
      <label class="nexus-approval-field">Decision
        <select id="nexus-approval-decision">
          <option value="approved">approved</option>
          <option value="rejected">rejected</option>
          <option value="needs_changes">needs_changes</option>
          <option value="cancelled">cancelled</option>
        </select>
      </label>
      <label class="nexus-approval-field">Reason (optional)
        <input type="text" id="nexus-approval-reason" placeholder="reason" autocomplete="off" />
      </label>
      <button type="button" class="admin-btn-sm" id="nexus-approval-submit">Forward resolution</button>
      <pre id="nexus-approval-result" class="nexus-approval-result nexus-dash-muted"></pre>
    </div>
  `;
}

function _wireApprovalsActions(root) {
  const btn = root.querySelector('#nexus-approval-submit');
  if (!btn || btn.dataset.wired === '1') return;
  btn.dataset.wired = '1';
  btn.addEventListener('click', async () => {
    const resultEl = root.querySelector('#nexus-approval-result');
    const id = root.querySelector('#nexus-approval-id')?.value?.trim();
    const decision = root.querySelector('#nexus-approval-decision')?.value;
    const reason = root.querySelector('#nexus-approval-reason')?.value?.trim();
    if (!id || !decision) {
      if (resultEl) resultEl.textContent = 'approval_id and decision are required.';
      return;
    }
    if (resultEl) resultEl.textContent = 'Forwarding…';
    try {
      const res = await fetch(`${API}/approvals/${encodeURIComponent(id)}/resolve`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          ...(reason ? { reason } : {}),
        }),
      });
      let body = null;
      try {
        body = await res.json();
      } catch (_) {
        body = { message: res.statusText };
      }
      if (resultEl) {
        resultEl.textContent = JSON.stringify(
          { http_status: res.status, ...body },
          null,
          2,
        );
      }
      if (res.ok) await _refresh();
    } catch (e) {
      if (resultEl) resultEl.textContent = `Request failed: ${e.message || e}`;
    }
  });
}

function _renderPlaceholderCard(data, title) {
  if (!data?.body) {
    return `<p class="nexus-dash-muted">Unable to load ${esc(title)}.</p>`;
  }
  const b = data.body;
  return `
    <div class="nexus-dash-kv">
      <div><span>Surface</span><code>${esc(b.surface || title)}</code></div>
      <div><span>Status</span>${_badge(b.status || 'placeholder', 'muted')}</div>
      ${b.pending_count != null ? `<div><span>Pending</span><code>${esc(b.pending_count)}</code></div>` : ''}
    </div>
    <p class="nexus-dash-msg">${esc(b.message || '')}</p>
  `;
}

async function _loadDashboardData() {
  const results = {};
  await Promise.all(
    READ_ENDPOINTS.map(async ({ key, path }) => {
      results[key] = await _fetchJson(path);
    }),
  );
  return results;
}

function _paintDashboard(root, data) {
  const health = data.health;
  const packets = data.packets;
  root.innerHTML = `
    <p class="nexus-dash-intro">
      legacy local console control room (read-first). Displays Gateway/Core status and approval queue;
      approval resolution forwards to Core only — no local agent or connector execution.
    </p>
    <div class="nexus-dash-grid">
      <section class="admin-card nexus-dash-card">
        <h2>Gateway status</h2>
        ${_renderHealthCard(health)}
      </section>
      <section class="admin-card nexus-dash-card">
        <h2>Core status</h2>
        ${_renderHealthCard(health)}
        <p class="nexus-dash-foot">Derived from Gateway <code>GET ${API}/health</code>.</p>
      </section>
      <section class="admin-card nexus-dash-card">
        <h2>Task packets</h2>
        ${_renderPacketsCard(packets)}
      </section>
      <section class="admin-card nexus-dash-card">
        <h2>Packet persistence</h2>
        ${_renderPacketsCard(packets)}
      </section>
      <section class="admin-card nexus-dash-card nexus-dash-card-wide">
        <h2>Pending approvals</h2>
        ${_renderApprovalsCard(data.approvals)}
      </section>
      <section class="admin-card nexus-dash-card">
        <h2>Worker outputs</h2>
        <p class="nexus-dash-muted">Recent worker output stream is not available in this phase. Use Gateway <code>POST /worker-output</code> for intake.</p>
        ${_renderPlaceholderCard(data.workers, 'worker outputs')}
      </section>
      <section class="admin-card nexus-dash-card">
        <h2>Workers</h2>
        ${_renderPlaceholderCard(data.workers, 'workers')}
      </section>
      <section class="admin-card nexus-dash-card">
        <h2>Nexus Tool Factory</h2>
        ${_renderPlaceholderCard(data.tools, 'tools')}
      </section>
      <section class="admin-card nexus-dash-card">
        <h2>Housekeeping</h2>
        ${_renderPlaceholderCard(data.housekeeping, 'housekeeping')}
      </section>
      <section class="admin-card nexus-dash-card">
        <h2>Connectors</h2>
        ${_renderPlaceholderCard(data.connectors, 'connectors')}
      </section>
    </div>
    <p class="nexus-dash-foot">Last refreshed: ${esc(new Date().toLocaleString())}</p>
  `;
  _wireApprovalsActions(root);
}

async function _refresh() {
  const body = document.querySelector('#nexus-dashboard-modal .nexus-dash-body');
  if (!body) return;
  body.innerHTML = '<p class="nexus-dash-muted">Loading Nexus Gateway status…</p>';
  try {
    const data = await _loadDashboardData();
    _paintDashboard(body, data);
  } catch (e) {
    console.error('Nexus dashboard refresh failed:', e);
    body.innerHTML = '<p class="nexus-dash-muted">Failed to refresh dashboard.</p>';
  }
}

function _ensureModal() {
  let modal = document.getElementById('nexus-dashboard-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.className = 'modal hidden';
  modal.id = 'nexus-dashboard-modal';
  modal.innerHTML = `
    <div class="modal-content nexus-dashboard-modal-content">
      <div class="modal-header">
        <h4>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:6px"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          legacy local console
        </h4>
        <span style="flex:1"></span>
        <button type="button" class="admin-btn-sm" id="nexus-dash-refresh" title="Refresh status">Refresh</button>
        <button class="close-btn" id="nexus-dash-close" type="button">✖</button>
      </div>
      <div class="modal-body nexus-dash-body" style="overflow:auto;max-height:min(70vh,640px);"></div>
    </div>
  `;
  document.body.appendChild(modal);

  const content = modal.querySelector('.modal-content');
  const header = modal.querySelector('.modal-header');
  if (content && header) {
    makeWindowDraggable(modal, { content, header });
  }

  document.getElementById('nexus-dash-close').addEventListener('click', closeDashboard);
  document.getElementById('nexus-dash-refresh').addEventListener('click', () => _refresh());

  modal.addEventListener('click', (e) => {
    if (uiModule.isTouchInsideModal?.()) return;
    if (e.target === modal) closeDashboard();
  });

  return modal;
}

export function isDashboardOpen() {
  return _open;
}

export async function openDashboard() {
  if (_open) {
    await _refresh();
    return;
  }
  _open = true;
  const modal = _ensureModal();
  modal.classList.remove('hidden');
  await _refresh();

  _escHandler = (e) => {
    if (e.key === 'Escape') closeDashboard();
  };
  document.addEventListener('keydown', _escHandler);

  if (!_refreshTimer) {
    _refreshTimer = setInterval(() => {
      if (_open) _refresh();
    }, 60000);
  }
}

export function closeDashboard() {
  if (!_open) return;
  _open = false;
  const modal = document.getElementById('nexus-dashboard-modal');
  if (modal) modal.classList.add('hidden');
  if (_escHandler) {
    document.removeEventListener('keydown', _escHandler);
    _escHandler = null;
  }
}

export function toggleDashboard() {
  if (_open) closeDashboard();
  else openDashboard();
}

export default {
  openDashboard,
  closeDashboard,
  toggleDashboard,
  isDashboardOpen,
};
