// Popup entry point. Holds no state: it asks the content script what the
// current X page is, then renders one of a few states.
const REPOSITORY_URL = 'https://github.com/HiAriesZhou/x-toc';
const X_PAGE = /^https:\/\/(x\.com|twitter\.com)\//;

const ICONS = {
  pin: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
  unpin:
    '<path d="M12 17v5"/><path d="M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89"/><path d="m2 2 20 20"/><path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11"/>',
  save: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/><line x1="12" x2="12" y1="7" y2="13"/><line x1="15" x2="9" y1="10" y2="10"/>',
  saved: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/><path d="m9 10 2 2 4-4"/>',
  error:
    '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  article:
    '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  timeline:
    '<rect width="18" height="7" x="3" y="3" rx="1"/><rect width="18" height="7" x="3" y="14" rx="1"/>',
  refresh:
    '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  library: '<path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>',
  github:
    '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3.28-.36 6.72-1.61 6.72-7A5.4 5.4 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.4 5.4 0 0 0-1.42 2.73c0 5.42 3.44 6.66 6.72 7A4.8 4.8 0 0 0 9 18v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>'
};

const SAVE_TITLES = {
  idle: 'Save to Bookmarks',
  saving: 'Saving…',
  saved: 'Saved to Bookmarks',
  error: 'Save failed · try again'
};
const SAVE_ICONS = { idle: 'save', saving: 'save', saved: 'saved', error: 'error' };

const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

const icon = (name, size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

// Uses the running build's own icon, so a local debug build shows its DEV logo.
function brandIconUrl() {
  const path = chrome.runtime.getManifest().icons?.['32'];
  return path ? chrome.runtime.getURL(path) : '';
}

// Icon buttons show their name in a tooltip (data-tip) and to screen readers.
const iconButton = ({ id, name, label, extraClass = '', attrs = '' }) => `
  <button class="icon-btn ${extraClass}" id="${id}" type="button" data-tip="${label}" aria-label="${label}" ${attrs}>${icon(name)}</button>`;

const saveButton = () =>
  iconButton({
    id: 'saveBtn',
    name: SAVE_ICONS.idle,
    label: SAVE_TITLES.idle,
    extraClass: 'save-btn',
    attrs: 'data-state="idle"'
  });

function renderHeader(pinState, canSave) {
  const pin = pinState
    ? iconButton({
        id: 'pinBtn',
        name: pinState.visible ? 'unpin' : 'pin',
        label: pinState.visible ? 'Unpin contents' : 'Pin beside article',
        extraClass: pinState.visible ? 'active' : ''
      })
    : '';
  return `
    <header class="header">
      <div class="brand"><img src="${brandIconUrl()}" alt="" width="20" height="20"><span>XTOC</span></div>
      <div class="header-actions">
        ${canSave ? saveButton() : ''}
        ${iconButton({ id: 'libraryBtn', name: 'library', label: 'Library' })}
        ${pin}
      </div>
    </header>`;
}

function renderFooter() {
  return `
    <footer class="popup-footer">
      <span>Enjoying XTOC? Give it a</span>
      <a href="${REPOSITORY_URL}" target="_blank" rel="noopener noreferrer" aria-label="Star XTOC on GitHub">
        ${icon('github', 15)}<span>Star</span>
      </a>
      <span>on GitHub ⭐</span>
    </footer>`;
}

function renderNotice({ iconName, title, text, action = '' }) {
  return `
    <section class="notice">
      <span class="notice-icon">${icon(iconName, 22)}</span>
      <h2>${title}</h2>
      <p>${text}</p>
      ${action}
    </section>`;
}

function renderToc(toc) {
  return `
    <p class="section-label">Contents · ${toc.length} ${toc.length === 1 ? 'section' : 'sections'}</p>
    <ul class="toc-list">
      ${toc
        .map(
          (item, index) => `
        <li class="toc-item level-${item.level}" data-index="${index}">
          <a href="#" class="toc-link">${escapeHtml(item.text)}</a>
        </li>`
        )
        .join('')}
    </ul>`;
}

function bodyFor(page) {
  if (page.kind === 'unsupported') {
    return renderNotice({
      iconName: 'article',
      title: 'Open an X article',
      text: 'XTOC works on x.com articles and posts.'
    });
  }
  if (page.kind === 'unreachable') {
    return renderNotice({
      iconName: 'refresh',
      title: 'Reload this tab',
      text: 'XTOC starts with the page. Reload the tab, then open XTOC again.',
      action: `<button class="text-btn" id="reloadBtn" type="button">Reload tab</button>`
    });
  }
  if (page.kind === 'other') {
    return renderNotice({
      iconName: 'timeline',
      title: 'No article on this page',
      text: 'Open an article for its contents, or a single post to save it to Bookmarks.'
    });
  }
  if (page.kind === 'post') {
    return '<p class="muted-line">Posts have no contents. Use the save button to keep this one in Bookmarks.</p>';
  }
  const contents = page.toc.length
    ? renderToc(page.toc)
    : '<p class="muted-line">No section headings found in this article yet.</p>';
  return contents;
}

function render(root, page) {
  const pinState =
    page.kind === 'article' && page.toc.length ? { visible: page.isPanelVisible } : null;
  root.innerHTML = `
    <div class="container">
      ${renderHeader(pinState, page.kind === 'article' || page.kind === 'post')}
      <main class="body">${bodyFor(page)}</main>
      ${renderFooter()}
    </div>`;
}

// Saved and error states are brief; the button then returns to idle. The
// tooltip and accessible name carry the outcome, so the layout never shifts.
const SAVE_RESET_MS = { saved: 1800, error: 4000 };

function setSaveState(button, state, label = SAVE_TITLES[state]) {
  clearTimeout(button.resetTimer);
  button.dataset.state = state;
  button.disabled = state === 'saving';
  button.dataset.tip = label;
  button.setAttribute('aria-label', label);
  button.innerHTML = icon(SAVE_ICONS[state]);
  if (SAVE_RESET_MS[state]) {
    button.resetTimer = setTimeout(() => setSaveState(button, 'idle'), SAVE_RESET_MS[state]);
  }
}

function bindSave(button, tabId) {
  button.addEventListener('click', async () => {
    setSaveState(button, 'saving');
    try {
      const result = await chrome.tabs.sendMessage(tabId, { action: 'captureCurrent' });
      if (!result?.ok)
        throw new Error(result?.error || 'Save failed. Reload the page and try again.');
      setSaveState(
        button,
        'saved',
        result.data?.duplicate ? 'Already in Bookmarks' : SAVE_TITLES.saved
      );
    } catch (error) {
      setSaveState(button, 'error', error.message);
    }
  });
}

function bindActions(root, page, tabId) {
  root.querySelector('#libraryBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });
  root.querySelector('#reloadBtn')?.addEventListener('click', () => {
    chrome.tabs.reload(tabId);
    window.close();
  });
  root.querySelector('#pinBtn')?.addEventListener('click', async () => {
    await chrome.tabs.sendMessage(tabId, { action: 'togglePanel' });
    window.close();
  });
  root.querySelectorAll('.toc-link').forEach((link) => {
    link.addEventListener('click', async (event) => {
      event.preventDefault();
      const index = Number(event.target.closest('.toc-item').dataset.index);
      await chrome.tabs.sendMessage(tabId, { action: 'scrollTo', index });
    });
  });
  const save = root.querySelector('#saveBtn');
  if (save) bindSave(save, tabId);
}

async function describePage(tab) {
  if (!X_PAGE.test(tab?.url || '')) return { kind: 'unsupported' };
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getTOC' });
    return {
      kind: response?.pageKind || 'other',
      toc: response?.toc || [],
      isPanelVisible: Boolean(response?.isPanelVisible)
    };
  } catch {
    return { kind: 'unreachable' };
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const root = document.getElementById('root');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const page = await describePage(tab);
  render(root, page);
  bindActions(root, page, tab?.id);
});
