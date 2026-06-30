/**
 * Derived tool-state banners for Simple Chat (not chat history messages).
 */

const WEB_SEARCH_COPY = {
  role: 'Web Search',
  text:
    'Searches the web for relevant information to include in the response. Results are fetched and summarized before the AI answers.',
};

let _webBannerEl = null;
let _hideTimer = null;
let _historyObserverStarted = false;

function _startHistoryObserver() {
  if (_historyObserverStarted) return;
  const history = document.getElementById('chat-history');
  if (!history || typeof MutationObserver === 'undefined') return;
  _historyObserverStarted = true;
  new MutationObserver(() => {
    const chk = document.getElementById('web-toggle');
    if (!chk?.checked) return;
    if (_webBannerEl?.isConnected) return;
    _webBannerEl = null;
    syncWebSearchStateBanner(true);
  }).observe(history, { childList: true });
}

function _ensureWebBannerEl() {
  if (_webBannerEl?.isConnected) return _webBannerEl;
  _webBannerEl = null;

  const history = document.getElementById('chat-history');
  if (!history) return null;

  _startHistoryObserver();

  _webBannerEl = document.createElement('div');
  _webBannerEl.id = 'web-search-state-banner';
  _webBannerEl.className = 'msg msg-ai tool-splash tool-state-banner hidden';
  _webBannerEl.setAttribute('role', 'status');
  _webBannerEl.setAttribute('aria-live', 'polite');
  _webBannerEl.dataset.toolState = 'web';
  _webBannerEl.innerHTML =
    `<div class="role">${WEB_SEARCH_COPY.role}</div>` +
    `<div class="body" style="opacity:0.7;font-size:0.92em">${WEB_SEARCH_COPY.text}</div>`;
  history.insertBefore(_webBannerEl, history.firstChild);
  return _webBannerEl;
}

/** Remove legacy Web Search splash nodes appended to chat history. */
export function removeLegacyWebSearchSplashes() {
  const history = document.getElementById('chat-history');
  if (!history) return;
  history.querySelectorAll('.tool-splash:not(.tool-state-banner)').forEach((node) => {
    const role = node.querySelector('.role')?.textContent?.trim();
    if (role === WEB_SEARCH_COPY.role) node.remove();
  });
}

/** Show or hide the Web Search state banner (exactly one instance). */
export function syncWebSearchStateBanner(active) {
  removeLegacyWebSearchSplashes();
  const banner = _ensureWebBannerEl();
  if (!banner) return;

  if (_hideTimer) {
    clearTimeout(_hideTimer);
    _hideTimer = null;
  }

  if (active) {
    // Keep state banner at top of the chat column when history is repopulated.
    const history = document.getElementById('chat-history');
    if (history && banner.parentNode === history && history.firstChild !== banner) {
      history.insertBefore(banner, history.firstChild);
    }
    banner.classList.remove('hidden', 'is-hiding');
    if (banner.getAnimations) banner.getAnimations().forEach((a) => a.cancel());
    banner.style.animation = 'msg-enter 0.3s ease-out both';
    return;
  }

  if (banner.classList.contains('hidden')) return;

  banner.classList.add('is-hiding');
  banner.style.animation = 'tool-state-exit 0.25s ease-in forwards';
  const onEnd = (ev) => {
    if (ev.target !== banner || ev.animationName !== 'tool-state-exit') return;
    banner.removeEventListener('animationend', onEnd);
    banner.classList.add('hidden');
    banner.classList.remove('is-hiding');
    banner.style.animation = '';
  };
  banner.addEventListener('animationend', onEnd);
  _hideTimer = setTimeout(() => {
    banner.classList.add('hidden');
    banner.classList.remove('is-hiding');
    banner.style.animation = '';
  }, 300);
}

export default {
  syncWebSearchStateBanner,
  removeLegacyWebSearchSplashes,
};
