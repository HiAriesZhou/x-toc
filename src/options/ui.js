// Shared rendering helpers for the Library page. Every dynamic value passes
// through esc() before it reaches innerHTML.
const ICON_PATHS = {
  clips:
    '<path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M3 16v5h5"/><path d="M21 16v5h-5"/><path d="M8 10h8"/><path d="M8 14h5"/>',
  bookmarks: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
  settings:
    '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  external:
    '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  sparkles:
    '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
  download:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  import:
    '<path d="M12 3v12"/><path d="m8 11 4 4 4-4"/><path d="M8 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4"/>',
  trash:
    '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  note: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  github:
    '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3.28-.36 6.72-1.61 6.72-7A5.4 5.4 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.4 5.4 0 0 0-1.42 2.73c0 5.42 3.44 6.66 6.72 7A4.8 4.8 0 0 0 9 18v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>'
};

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);

export const icon = (name, size = 16) =>
  `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;

export function formatDate(value) {
  if (!value || Number.isNaN(Date.parse(value))) return '';
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// Bookmarks are dated by the X post itself; the save date is only a labeled fallback.
export function bookmarkDate(bookmark) {
  const posted = formatDate(bookmark.publishedAt);
  if (posted) return { text: posted, title: 'Posted on X' };
  const saved = formatDate(bookmark.capturedAt);
  return saved ? { text: `Saved ${saved}`, title: 'Saved to XTOC' } : { text: '', title: '' };
}

export const chips = (tags) =>
  (tags || []).map((tag) => `<span class="chip">${esc(tag)}</span>`).join('');

export const author = (item) => item.authorHandle || item.authorName || '';

export function emptyState(iconName, title, text) {
  return `
    <div class="empty">
      <span class="empty-icon">${icon(iconName, 22)}</span>
      <h2>${esc(title)}</h2>
      <p>${esc(text)}</p>
    </div>`;
}

// Options for the tag filter dropdown: "All tags" first, then tags A–Z.
export function tagChoices(tags) {
  const sorted = [...new Set(tags)].sort((a, b) => a.localeCompare(b));
  return [{ value: '', label: 'All tags' }, ...sorted.map((tag) => ({ value: tag, label: tag }))];
}

/**
 * Square icon-only button with a hover background, focus ring and an instant
 * tooltip. Every icon-only control in the Library uses this.
 * @param {{ name: string, label: string, action?: string, size?: 'sm'|'md', attrs?: string }} options
 */
export function iconButton({ name, label, action = '', size = 'md', attrs = '' }) {
  const iconSize = size === 'sm' ? 14 : 16;
  return `<button class="icon-btn icon-btn-${size}" type="button" aria-label="${esc(label)}" data-tip="${esc(label)}" ${action ? `data-action="${esc(action)}"` : ''} ${attrs}>${icon(name, iconSize)}</button>`;
}

/**
 * Search field with a leading icon and a clear button that appears only when
 * there is text. Calls onInput with the current query on every change.
 */
export function createSearch(container, { placeholder, value = '', onInput }) {
  container.classList.add('search');
  container.innerHTML = `
    ${icon('search')}
    <input type="search" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}" value="${esc(value)}">
    ${iconButton({ name: 'close', label: 'Clear search', size: 'sm', action: 'clear-search' })}`;
  const input = container.querySelector('input');
  const clear = container.querySelector('[data-action="clear-search"]');
  const sync = () => (clear.hidden = !input.value);
  input.addEventListener('input', (event) => {
    event.stopPropagation();
    sync();
    onInput(input.value);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && input.value) {
      event.stopPropagation();
      clear.click();
    }
  });
  clear.addEventListener('click', (event) => {
    event.stopPropagation();
    input.value = '';
    sync();
    onInput('');
    input.focus();
  });
  sync();
}

// Shown in place of the search and tag filter while items are selected.
export function selectionActions() {
  return `
    <div class="toolbar-selection" role="group" aria-label="Selection">
      <span id="selectionCount" aria-live="polite"></span>
      <button class="btn btn-ghost btn-sm" type="button" data-action="clear-selection">Clear</button>
      <button class="btn btn-danger btn-sm" type="button" data-action="delete-selected">${icon('trash', 14)}Delete</button>
    </div>`;
}

export function download(name, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export const today = () => new Date().toISOString().slice(0, 10);
