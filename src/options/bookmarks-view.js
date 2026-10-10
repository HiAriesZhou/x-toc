import { bookmarkList } from '../library/model.js';
import { bookmarkFiles, zipFiles } from '../library/obsidian.js';
import { normalizeClipTags, splitClipTagInput } from '../library/tags.js';
import { getSelectionState } from './clip-utils.js';
import { createDropdown } from './dropdown.js';
import {
  author,
  chips,
  createSearch,
  download,
  emptyState,
  bookmarkDate,
  esc,
  icon,
  iconButton,
  selectionActions,
  tagChoices,
  today
} from './ui.js';

const X_BOOKMARKS_URL = 'https://x.com/i/bookmarks';

// Readable preview from saved Markdown: drop syntax, keep words.
function plainSnippet(markdown) {
  return String(markdown || '')
    .replace(/^(`{3,}|~{3,})[\s\S]*?^\1\s*$/gm, ' ')
    .replace(/^\s{0,3}#{1,6}\s.*$/gm, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-+]|\d+[.)])\s+/gm, '')
    .replace(/[*_`\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

const squash = (text) =>
  String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);

// A post's title is its opening text, so skip a preview that only repeats it.
function rowPreview(bookmark) {
  if (bookmark.summary) return bookmark.summary;
  const snippet = plainSnippet(bookmark.markdown);
  if (!snippet) return 'Only the link was saved.';
  return squash(snippet) === squash(bookmark.title) ? '' : snippet;
}

function matches(bookmark, query) {
  if (!query) return true;
  const haystack = [
    bookmark.title,
    bookmark.authorName,
    bookmark.authorHandle,
    bookmark.note,
    bookmark.summary,
    bookmark.markdown,
    ...bookmark.tags
  ];
  return haystack.join(' ').toLowerCase().includes(query.toLowerCase().trim());
}

export function createBookmarksView(ctx) {
  const view = {
    query: '',
    tag: '',
    selected: new Set(),
    openId: '',
    suggestion: null,
    requestId: ''
  };
  let main = null;

  const visible = () =>
    bookmarkList(ctx.state).filter(
      (bookmark) => matches(bookmark, view.query) && (!view.tag || bookmark.tags.includes(view.tag))
    );

  function renderRow(bookmark) {
    const preview = rowPreview(bookmark);
    const date = bookmarkDate(bookmark);
    return `
      <div class="row ${bookmark.id === view.openId ? 'is-open' : ''}">
        <input class="check" type="checkbox" data-select="${esc(bookmark.id)}" aria-label="Select bookmark" ${view.selected.has(bookmark.id) ? 'checked' : ''}>
        <button class="row-body" type="button" data-open="${esc(bookmark.id)}">
          <span class="row-title clamp-2">${esc(bookmark.title)}</span>
          ${preview ? `<span class="row-text clamp-2">${esc(preview)}</span>` : ''}
          <span class="row-meta">
            <span class="badge">${bookmark.kind === 'post' ? 'Post' : 'Article'}</span>
            ${author(bookmark) ? `<span>${esc(author(bookmark))}</span>` : ''}
            ${date.text ? `<span title="${date.title}">${esc(date.text)}</span>` : ''}
            ${bookmark.note ? `<span class="meta-icon" title="Has note">${icon('note', 13)}</span>` : ''}
            ${chips(bookmark.tags)}
          </span>
        </button>
      </div>`;
  }

  let tagFilter = null;
  const allTags = () =>
    Object.values(ctx.state.bookmarks).flatMap((bookmark) => bookmark.tags || []);

  function renderList() {
    // Edits can add or remove tags; keep the filter's options current.
    view.tag = tagFilter.setOptions(tagChoices(allTags()), view.tag);
    const all = bookmarkList(ctx.state);
    const items = visible();
    const ids = items.map((item) => item.id);
    view.selected = new Set([...view.selected].filter((id) => ctx.state.bookmarks[id]));
    main.querySelector('#subtitle').textContent =
      `${all.length} ${all.length === 1 ? 'bookmark' : 'bookmarks'}`;
    main.querySelector('#list').innerHTML = items.length
      ? `<section class="group">${items.map(renderRow).join('')}</section>`
      : all.length
        ? emptyState('search', 'No matching bookmarks', 'Try another search or tag.')
        : emptyState(
            'bookmarks',
            'No bookmarks yet',
            'Save a post from the XTOC popup, or import your X bookmarks.'
          );
    // With a selection, the toolbar switches to selection mode in place (same height).
    main.querySelector('.toolbar').classList.toggle('is-selecting', view.selected.size > 0);
    main.querySelector('#selectionCount').textContent = `${view.selected.size} selected`;
    const { allSelected, someSelected } = getSelectionState(ids, view.selected);
    const selectAll = main.querySelector('#selectAll');
    selectAll.checked = allSelected;
    selectAll.indeterminate = someSelected;
    selectAll.disabled = !ids.length;
    main.querySelector('#exportLabel').textContent = view.selected.size
      ? `Export ${view.selected.size}`
      : 'Export';
    main.querySelector('[data-action="export"]').disabled = !all.length;
  }

  function exportMarkdown() {
    const ids = view.selected.size ? [...view.selected] : visible().map((item) => item.id);
    download(`xtoc-bookmarks-${today()}.zip`, zipFiles(bookmarkFiles(ctx.state, ids)));
  }

  async function deleteBookmarks(ids) {
    const message = ids.length === 1 ? 'Delete this bookmark?' : `Delete ${ids.length} bookmarks?`;
    if (!confirm(`${message} Your X bookmarks are not affected.`)) return;
    await ctx.rpc('library:delete', { type: 'bookmark', ids });
    ids.forEach((id) => view.selected.delete(id));
    if (ids.includes(view.openId)) {
      view.openId = '';
      ctx.closeDrawer();
    }
    await ctx.reload();
    renderList();
    ctx.toast(ids.length === 1 ? 'Bookmark deleted.' : `${ids.length} bookmarks deleted.`);
  }

  function renderAI(bookmark) {
    if (!ctx.ai.configured) {
      return '<p class="hint"><a href="#settings">Set up AI</a> to suggest tags and a summary.</p>';
    }
    const suggestion = view.suggestion?.id === bookmark.id ? view.suggestion : null;
    if (suggestion) {
      return `
        <div class="suggestion">
          <span class="eyebrow">${icon('sparkles', 13)}Suggestion</span>
          <div class="chips">${chips(suggestion.tags) || '<span class="hint">No tags</span>'}</div>
          ${suggestion.summary ? `<p>${esc(suggestion.summary)}</p>` : ''}
          <div class="inline-actions">
            <button class="btn btn-ghost btn-sm" type="button" data-action="ai-dismiss">Dismiss</button>
            <button class="btn btn-primary btn-sm" type="button" data-action="ai-apply">Apply</button>
          </div>
        </div>`;
    }
    const running = Boolean(view.requestId);
    return `
      <div class="inline-actions start">
        <button class="btn btn-secondary btn-sm" type="button" data-action="ai-suggest" ${running ? 'disabled' : ''}>${icon('sparkles', 14)}${running ? 'Suggesting…' : 'Suggest tags & summary'}</button>
        ${running ? '<button class="btn btn-ghost btn-sm" type="button" data-action="ai-cancel">Cancel</button>' : ''}
      </div>`;
  }

  function renderDetail(bookmark) {
    const meta = [author(bookmark), bookmarkDate(bookmark).text].filter(Boolean);
    return `
      <header class="drawer-head">
        <span class="eyebrow">${bookmark.kind === 'post' ? 'Post' : 'Article'}</span>
        ${iconButton({ name: 'close', label: 'Close', action: 'close-drawer' })}
      </header>
      <form class="drawer-body" id="editForm">
        <div>
          <h2 class="drawer-title">${
            bookmark.url
              ? `<a href="${esc(bookmark.url)}" target="_blank" rel="noopener noreferrer" title="Open on X">${esc(bookmark.title)}${icon('external', 14)}</a>`
              : esc(bookmark.title)
          }</h2>
          <p class="subtle">${esc(meta.join(' · '))}</p>
        </div>
        ${bookmark.summary ? `<div class="summary"><span class="eyebrow">AI summary</span><p>${esc(bookmark.summary)}</p></div>` : ''}
        <div id="ai">${renderAI(bookmark)}</div>
        <label class="field"><span>Tags</span><input class="input" name="tags" value="${esc(bookmark.tags.join(', '))}" placeholder="Separate with commas"></label>
        <label class="field"><span>Note</span><textarea class="input" name="note" rows="5">${esc(bookmark.note)}</textarea></label>
        ${
          bookmark.markdown
            ? `<details class="saved-text"><summary>Saved text</summary><pre>${esc(bookmark.markdown)}</pre></details>`
            : '<p class="hint">Only the link was saved. Open the post and save it again from the popup to keep its text.</p>'
        }
      </form>
      <footer class="drawer-foot">
        <button class="btn btn-ghost-danger" type="button" data-action="delete-one">${icon('trash', 14)}Delete</button>
        <button class="btn btn-primary" type="submit" form="editForm">Save</button>
      </footer>`;
  }

  async function save(bookmark, fields) {
    await ctx.rpc('library:edit', {
      type: 'bookmark',
      id: bookmark.id,
      expectedUpdatedAt: bookmark.updatedAt || '',
      ...fields
    });
    ctx.dirty = false;
    await ctx.reload();
    renderList();
    openDetail(bookmark.id);
  }

  async function suggest(bookmark) {
    view.requestId = crypto.randomUUID();
    refreshAI(bookmark);
    try {
      const suggestion = await ctx.rpc('ai:suggest', {
        id: bookmark.id,
        requestId: view.requestId
      });
      view.suggestion = { ...suggestion, id: bookmark.id };
    } finally {
      view.requestId = '';
      if (view.openId === bookmark.id) refreshAI(bookmark);
    }
  }

  async function applySuggestion(bookmark, form) {
    const suggestion = view.suggestion;
    if (suggestion.updatedAt !== (bookmark.updatedAt || '')) {
      view.suggestion = null;
      throw new Error('This bookmark changed. Ask for a new suggestion.');
    }
    view.suggestion = null;
    await save(bookmark, {
      tags: normalizeClipTags([...splitClipTagInput(form.tags.value), ...suggestion.tags]),
      note: form.note.value,
      summary: suggestion.summary,
      summaryModel: suggestion.model
    });
    ctx.toast('Suggestion applied.');
  }

  function refreshAI(bookmark) {
    const container = document.querySelector('#drawer #ai');
    if (container) container.innerHTML = renderAI(bookmark);
  }

  function openDetail(id) {
    const bookmark = bookmarkList(ctx.state).find((item) => item.id === id);
    if (!bookmark || !ctx.confirmDiscard()) return;
    if (view.openId !== id) view.suggestion = null;
    view.openId = id;
    const drawer = ctx.openDrawer(renderDetail(bookmark));
    const form = drawer.querySelector('#editForm');
    form.onsubmit = ctx.guard(async (event) => {
      event.preventDefault();
      await save(bookmark, {
        tags: splitClipTagInput(form.elements.tags.value),
        note: form.elements.note.value
      });
      ctx.toast('Saved.');
    });
    drawer.onclick = ctx.guard(async (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'delete-one') await deleteBookmarks([id]);
      if (action === 'ai-suggest') await suggest(bookmark);
      if (action === 'ai-cancel') await ctx.rpc('ai:cancel', { requestId: view.requestId });
      if (action === 'ai-dismiss') {
        view.suggestion = null;
        refreshAI(bookmark);
      }
      if (action === 'ai-apply') await applySuggestion(bookmark, form);
    });
    renderList();
  }

  function bind() {
    main.onclick = ctx.guard(async (event) => {
      const target = event.target.closest('[data-action], [data-open]');
      if (!target) return;
      if (target.dataset.open) return openDetail(target.dataset.open);
      const action = target.dataset.action;
      if (action === 'export') exportMarkdown();
      if (action === 'import') chrome.tabs.create({ url: X_BOOKMARKS_URL });
      if (action === 'clear-selection') {
        view.selected.clear();
        renderList();
      }
      if (action === 'delete-selected') await deleteBookmarks([...view.selected]);
    });
    main.onchange = (event) => {
      const id = event.target.dataset.select;
      if (id) {
        event.target.checked ? view.selected.add(id) : view.selected.delete(id);
      } else if (event.target.id === 'selectAll') {
        visible().forEach((item) =>
          event.target.checked ? view.selected.add(item.id) : view.selected.delete(item.id)
        );
      }
      renderList();
    };
    main.oninput = null;
    createSearch(main.querySelector('#search'), {
      placeholder: 'Search bookmarks',
      value: view.query,
      onInput: (query) => {
        view.query = query;
        renderList();
      }
    });
    tagFilter = createDropdown(main.querySelector('#tagFilter'), {
      ariaLabel: 'Filter by tag',
      align: 'end',
      options: tagChoices(allTags()),
      value: view.tag,
      onSelect: (tag) => {
        view.tag = tag;
        renderList();
      }
    });
  }

  return {
    render(container) {
      main = container;
      main.innerHTML = `
        <div class="page-top">
        <header class="page-head">
          <div class="page-title"><h1>Bookmarks</h1><span class="subtle" id="subtitle"></span></div>
          <div class="inline-actions">
            <button class="btn btn-secondary" type="button" data-action="import">${icon('import')}Import from X</button>
            <button class="btn btn-primary" type="button" data-action="export">${icon('download')}<span id="exportLabel">Export</span></button>
          </div>
        </header>
        <div class="toolbar">
          <input class="check" type="checkbox" id="selectAll" aria-label="Select all visible bookmarks">
          <div class="toolbar-filters"><div id="search"></div><div id="tagFilter"></div></div>
          ${selectionActions()}
        </div>
        </div>
        <div class="list" id="list"></div>`;
      bind();
      if (view.openId && ctx.isDrawerOpen() && ctx.state.bookmarks[view.openId]) {
        openDetail(view.openId);
      } else {
        view.openId = '';
        renderList();
      }
    }
  };
}
