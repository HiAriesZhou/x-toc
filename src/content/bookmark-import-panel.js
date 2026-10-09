// Bookmark import control shown on X's Bookmarks page: a compact pill at the
// bottom centre that walks through idle → importing ↔ paused → done. Each state
// is one short line (see importLabel) plus only the buttons that apply.
import { contentId, xUrl } from '../library/model.js';
import { captureNode, sendToLibrary } from './library-capture.js';
import { importLabel, isBookmarkedTweet, isBookmarksRoute } from './bookmark-import-utils.js';

const SCAN_DELAY_MS = 1500;
const ROUTE_CHECK_MS = 1500;
const MAX_ITEMS = 1000;
const IDLE_ROUNDS = 4; // rounds without new posts before the end of the list is assumed
const UNMATCHED_ROUNDS = 3; // rounds of posts without any bookmark (e.g. the Likes tab)

const PATHS = {
  import:
    '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/><path d="M12 7v6"/><path d="m9 10 3 3 3-3"/>',
  pause:
    '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/>'
};

const icon = (name) =>
  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;
const iconButton = (action, name, label) =>
  `<button class="icon-btn" type="button" data-action="${action}" aria-label="${label}" title="${label}">${icon(name)}</button>`;

const STYLE = `
  :host { all: initial; }
  .pill {
    --surface: #fff; --text: #0f1419; --muted: #536471; --border: #e6ecf0; --hover: #f2f5f7;
    --accent: #1d9bf0; --accent-tint: #e8f5fe; --success: #00a36c; --warning: #b86e00; --danger: #d0283c;
    position: fixed; left: 50%; bottom: 24px; z-index: 2147483646; transform: translateX(-50%);
    display: flex; align-items: center; gap: 6px; height: 44px; padding: 0 6px 0 16px; overflow: hidden;
    border: 1px solid var(--border); border-radius: 999px; background: var(--surface); color: var(--text);
    box-shadow: 0 8px 28px rgb(15 20 25 / 0.18);
    font: 600 14px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    animation: rise 0.2s ease-out;
  }
  .pill[data-phase='idle'] { padding-left: 4px; }
  button { font: inherit; cursor: pointer; border: 0; }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .start { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 16px 0 12px; border-radius: 999px; background: var(--accent); color: #fff; }
  .start:hover { filter: brightness(0.94); }
  .icon-btn { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 999px; background: none; color: var(--muted); }
  .icon-btn:hover { background: var(--hover); color: var(--text); }
  .text-btn { height: 32px; padding: 0 12px; border-radius: 999px; background: var(--accent-tint); color: var(--accent); }
  .text-btn:hover { filter: brightness(0.96); }
  .lead { display: inline-grid; color: var(--accent); }
  .pill[data-tone='success'] .lead { color: var(--success); }
  .pill[data-tone='warning'] .lead { color: var(--warning); }
  .pill[data-tone='error'] .lead { color: var(--danger); }
  .label { padding-right: 6px; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .spinner { width: 14px; height: 14px; border: 2px solid var(--accent-tint); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
  .progress { position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: linear-gradient(90deg, transparent, var(--accent), transparent) no-repeat; background-size: 40% 100%; animation: slide 1.2s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes slide { from { background-position: -40% 0; } to { background-position: 140% 0; } }
  @keyframes rise { from { opacity: 0; transform: translate(-50%, 8px); } }
  @media (prefers-color-scheme: dark) {
    .pill { --surface: #15202b; --text: #f7f9f9; --muted: #8b98a5; --border: #2f3b47; --hover: #1c2834; --accent-tint: #1b3448; --success: #2fc48d; --warning: #f0a830; --danger: #ff6c7b; box-shadow: 0 8px 28px rgb(0 0 0 / 0.5); }
  }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
`;

export function initBookmarkImport() {
  const host = document.createElement('div');
  host.id = 'xtoc-library-capture';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>${STYLE}</style><div class="pill" role="region" aria-label="XTOC bookmark import"></div>`;
  const pill = shadow.querySelector('.pill');
  const state = { phase: 'idle', reason: '', added: 0, duplicates: 0, failed: 0 };
  let paused = false;
  let stopped = false;
  let dismissed = false;

  function body() {
    const { tone } = importLabel(state);
    const label = '<span class="label" role="status" aria-live="polite"></span>';
    if (state.phase === 'idle') {
      return `<button class="start" type="button" data-action="start" title="Save the bookmarks on this page to XTOC">${icon('import')}<span class="label"></span></button>${iconButton('close', 'close', 'Hide')}`;
    }
    if (state.phase === 'running') {
      return `<span class="lead"><span class="spinner"></span></span>${label}${iconButton('pause', 'pause', 'Pause')}${iconButton('stop', 'stop', 'Stop')}<span class="progress"></span>`;
    }
    if (state.phase === 'paused') {
      return `<span class="lead">${icon('pause')}</span>${label}${iconButton('resume', 'play', 'Resume')}${iconButton('stop', 'stop', 'Stop')}`;
    }
    const library =
      state.reason === 'no-bookmarks'
        ? ''
        : '<button class="text-btn" type="button" data-action="library">Open Library</button>';
    return `<span class="lead">${icon(tone === 'success' ? 'check' : 'alert')}</span>${label}${library}${iconButton('close', 'close', 'Close')}`;
  }

  // Rebuild on phase changes; while importing only the count text changes,
  // so focus stays on the Pause/Stop buttons.
  function render() {
    const { tone, text } = importLabel(state);
    if (pill.dataset.phase !== state.phase || pill.dataset.reason !== state.reason) {
      pill.dataset.phase = state.phase;
      pill.dataset.reason = state.reason;
      pill.innerHTML = body();
    }
    pill.dataset.tone = tone;
    pill.querySelector('.label').textContent = text;
  }

  const delay = () => new Promise((resolve) => setTimeout(resolve, SCAN_DELAY_MS));

  async function importVisible({ seen, runStart, nextPosition }) {
    let found = 0;
    let matched = 0;
    for (const node of document.querySelectorAll('article[data-testid="tweet"]')) {
      if (stopped || paused) break;
      const link = node.querySelector('time')?.closest('a')?.href;
      if (!link || !xUrl(link)) continue;
      const id = contentId(link);
      if (seen.has(id)) continue;
      seen.add(id);
      found++;
      if (!isBookmarkedTweet(node)) continue;
      matched++;
      try {
        const payload = captureNode(node, link, true);
        // Posts are saved top to bottom; descending keys keep X's newest-first order.
        payload.bookmark.sortKey = runStart - nextPosition();
        const result = await sendToLibrary('library:capture', payload);
        result.duplicate ? state.duplicates++ : state.added++;
      } catch (error) {
        state.failed++;
        // A full disk stops the run; a single unreadable preview is skipped.
        if (/save locally/i.test(error.message)) return { found, matched, storageFull: true };
      }
      render();
    }
    return { found, matched, storageFull: false };
  }

  async function run() {
    Object.assign(state, { phase: 'running', reason: '', added: 0, duplicates: 0, failed: 0 });
    paused = stopped = false;
    render();
    const route = location.href;
    const seen = new Set();
    const runStart = Date.now();
    let position = 0;
    let idle = 0;
    let unmatched = 0;
    let reason = 'end';
    while (!stopped && route === location.href && isBookmarksRoute(location.pathname)) {
      if (paused) {
        await delay();
        continue;
      }
      const round = await importVisible({ seen, runStart, nextPosition: () => position++ });
      if (round.storageFull) {
        reason = 'storage';
        break;
      }
      idle = round.found ? 0 : idle + 1;
      unmatched = round.found && !round.matched ? unmatched + 1 : 0;
      if (unmatched >= UNMATCHED_ROUNDS && !state.added && !state.duplicates) {
        reason = 'no-bookmarks';
        break;
      }
      if (seen.size >= MAX_ITEMS) {
        reason = 'limit';
        break;
      }
      if (idle >= IDLE_ROUNDS) break;
      if (!paused && !stopped)
        window.scrollBy({ top: Math.round(innerHeight * 0.8), behavior: 'instant' });
      await delay();
    }
    if (stopped && reason === 'end') reason = 'cancelled';
    if (route !== location.href) reason = 'page-changed';
    Object.assign(state, { phase: 'done', reason });
    render();
  }

  const actions = {
    start: () => run(),
    pause: () => {
      paused = true;
      state.phase = 'paused';
      render();
    },
    resume: () => {
      paused = false;
      state.phase = 'running';
      render();
    },
    stop: () => {
      stopped = true;
      paused = false;
    },
    library: () => chrome.runtime.sendMessage({ action: 'openLibrary' }),
    close: () => {
      dismissed = true;
      host.remove();
      Object.assign(state, { phase: 'idle', reason: '' });
    }
  };

  pill.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    Promise.resolve(actions[action]?.()).catch(() => {
      Object.assign(state, { phase: 'done', reason: 'error' });
      render();
    });
  });

  // Show only on the Bookmarks page; leaving it stops an import and resets a dismissal.
  function refresh() {
    if (isBookmarksRoute(location.pathname)) {
      if (!dismissed && !host.isConnected) document.body.append(host);
      return;
    }
    stopped = true;
    dismissed = false;
    host.remove();
    if (state.phase === 'done') {
      Object.assign(state, { phase: 'idle', reason: '' });
      render();
    }
  }

  render();
  refresh();
  const timer = setInterval(refresh, ROUTE_CHECK_MS);
  return () => {
    stopped = true;
    clearInterval(timer);
    host.remove();
  };
}
