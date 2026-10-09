// Library shell: hash routing between Clips, Bookmarks and Settings, shared
// state loading, the detail drawer and status toasts.
import { clipGroups, KEYS } from '../library/model.js';
import { createClipsView } from './clips-view.js';
import { createBookmarksView } from './bookmarks-view.js';
import { createSettingsView } from './settings-view.js';

const ROUTES = ['clips', 'bookmarks', 'settings'];
const TOAST_MS = 3200;

const main = document.getElementById('main');
const drawer = document.getElementById('drawer');
const toastEl = document.getElementById('toast');
let toastTimer = null;

async function rpc(action, payload = {}) {
  const response = await chrome.runtime.sendMessage({ action, payload });
  if (!response?.ok) throw new Error(response?.error || 'XTOC is unavailable. Reload this page.');
  return response.data;
}

const ctx = {
  state: { articles: {}, clips: {}, bookmarks: {} },
  ai: { configured: false },
  dirty: false,
  rpc,
  toast(message, tone = 'info') {
    toastEl.textContent = message;
    toastEl.dataset.tone = tone;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.hidden = true), TOAST_MS);
  },
  // Wraps a handler so failures surface as an error toast.
  guard(fn) {
    return async (...args) => {
      try {
        await fn(...args);
      } catch (error) {
        ctx.toast(error.message, 'error');
      }
    };
  },
  confirmDiscard() {
    if (ctx.dirty && !confirm('Discard unsaved changes?')) return false;
    ctx.dirty = false;
    return true;
  },
  openDrawer(html) {
    drawer.innerHTML = html;
    drawer.hidden = false;
    ctx.dirty = false;
    drawer.querySelector('form')?.addEventListener('input', () => (ctx.dirty = true));
    return drawer;
  },
  isDrawerOpen: () => !drawer.hidden,
  closeDrawer() {
    drawer.hidden = true;
    drawer.innerHTML = '';
    ctx.dirty = false;
  },
  async reload() {
    ctx.state = await rpc('library:load');
    renderCounts();
  },
  render: () => render()
};

const views = {
  clips: createClipsView(ctx),
  bookmarks: createBookmarksView(ctx),
  settings: createSettingsView(ctx)
};

const currentRoute = () => {
  const route = location.hash.slice(1);
  return ROUTES.includes(route) ? route : 'clips';
};

function renderCounts() {
  const clipCount = clipGroups(ctx.state).reduce((sum, group) => sum + group.excerpts.length, 0);
  document.getElementById('count-clips').textContent = clipCount || '';
  document.getElementById('count-bookmarks').textContent =
    Object.keys(ctx.state.bookmarks).length || '';
}

function render() {
  const route = currentRoute();
  document.querySelectorAll('[data-route]').forEach((link) => {
    const active = link.dataset.route === route;
    link.classList.toggle('active', active);
    link.toggleAttribute('aria-current', active);
  });
  views[route].render(main);
}

let lastRoute = currentRoute();
window.addEventListener('hashchange', () => {
  if (!ctx.confirmDiscard()) {
    history.replaceState(null, '', `#${lastRoute}`);
    return;
  }
  lastRoute = currentRoute();
  ctx.closeDrawer();
  render();
});

drawer.addEventListener('click', (event) => {
  if (event.target.closest('[data-action="close-drawer"]') && ctx.confirmDiscard()) {
    ctx.closeDrawer();
    render();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !drawer.hidden && ctx.confirmDiscard()) {
    ctx.closeDrawer();
    render();
  }
});

// Saves from X tabs show up live unless an edit is in progress.
// Only library keys matter here; settings such as AI preferences do not re-render.
const LIBRARY_KEYS = Object.values(KEYS);
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || ctx.dirty) return;
  if (!Object.keys(changes).some((key) => LIBRARY_KEYS.includes(key))) return;
  await ctx.reload();
  render();
});

// Shadow under the sticky page header once content scrolls beneath it.
window.addEventListener(
  'scroll',
  () => main.querySelector('.page-top')?.classList.toggle('is-stuck', window.scrollY > 0),
  { passive: true }
);

window.addEventListener('beforeunload', (event) => {
  if (ctx.dirty) event.preventDefault();
});

const brandIcon = chrome.runtime.getManifest().icons?.['32'];
if (brandIcon) document.getElementById('brandIcon').src = chrome.runtime.getURL(brandIcon);

try {
  [ctx.ai] = await Promise.all([rpc('ai:status'), ctx.reload()]);
} catch (error) {
  ctx.toast(error.message, 'error');
}
render();
