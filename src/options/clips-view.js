import { clipGroups } from '../library/model.js';
import { clipFiles, zipFiles } from '../library/obsidian.js';
import { splitClipTagInput } from '../library/tags.js';
import { filterExcerptGroups, getSelectionState } from './clip-utils.js';
import { renderAllJson } from './export-utils.js';
import { createDropdown } from './dropdown.js';
import {
  author,
  chips,
  createSearch,
  download,
  emptyState,
  esc,
  formatDate,
  icon,
  iconButton,
  selectionActions,
  tagChoices,
  today
} from './ui.js';

const EXPORT_FORMATS = [
  { value: 'markdown', label: 'Markdown (Obsidian)' },
  { value: 'json', label: 'JSON' }
];

export function createClipsView(ctx) {
  const view = { query: '', tag: '', selected: new Set(), openId: '' };
  let main = null;
  let tagFilter = null;
  let exportMenu = null;

  const allTags = () => Object.values(ctx.state.clips).flatMap((clip) => clip.tags || []);

  function visibleGroups() {
    const groups = filterExcerptGroups(clipGroups(ctx.state), view.query);
    if (!view.tag) return groups;
    return groups
      .map((group) => ({
        ...group,
        excerpts: group.excerpts.filter((clip) => clip.tags.includes(view.tag))
      }))
      .filter((group) => group.excerpts.length);
  }

  const visibleIds = (groups) => groups.flatMap((group) => group.excerpts.map((clip) => clip.id));

  function renderRow(clip) {
    return `
      <div class="row ${clip.id === view.openId ? 'is-open' : ''}">
        <input class="check" type="checkbox" data-select="${esc(clip.id)}" aria-label="Select clip" ${view.selected.has(clip.id) ? 'checked' : ''}>
        <button class="row-body" type="button" data-open="${esc(clip.id)}">
          <span class="row-text clamp-3">${esc(clip.text)}</span>
          <span class="row-meta">
            <span>${esc(formatDate(clip.createdAt))}</span>
            ${clip.note ? `<span class="meta-icon" title="Has note">${icon('note', 13)}</span>` : ''}
            ${chips(clip.tags)}
          </span>
        </button>
      </div>`;
  }

  function renderGroup({ article, excerpts }) {
    const url = article.canonicalUrl || article.url;
    const meta = [
      author(article),
      `${excerpts.length} ${excerpts.length === 1 ? 'clip' : 'clips'}`
    ].filter(Boolean);
    return `
      <section class="group">
        <header class="group-head">
          ${url ? `<a class="group-title" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(article.title || 'Untitled')}${icon('external', 13)}</a>` : `<span class="group-title">${esc(article.title || 'Untitled')}</span>`}
          <span class="subtle">${esc(meta.join(' · '))}</span>
        </header>
        ${excerpts.map(renderRow).join('')}
      </section>`;
  }

  function renderList() {
    // Edits can add or remove tags; keep the filter's options current.
    view.tag = tagFilter.setOptions(tagChoices(allTags()), view.tag);
    const all = clipGroups(ctx.state);
    const groups = visibleGroups();
    const ids = visibleIds(groups);
    view.selected = new Set([...view.selected].filter((id) => ctx.state.clips[id]));
    const total = all.reduce((sum, group) => sum + group.excerpts.length, 0);
    main.querySelector('#subtitle').textContent =
      `${total} ${total === 1 ? 'clip' : 'clips'} · ${all.length} ${all.length === 1 ? 'article' : 'articles'}`;
    main.querySelector('#list').innerHTML = groups.length
      ? groups.map(renderGroup).join('')
      : total
        ? emptyState('search', 'No matching clips', 'Try another search or tag.')
        : emptyState(
            'clips',
            'No clips yet',
            'Select text in an X article and click "save to xtoc".'
          );
    // With a selection, the toolbar switches to selection mode in place (same height).
    main.querySelector('.toolbar').classList.toggle('is-selecting', view.selected.size > 0);
    main.querySelector('#selectionCount').textContent = `${view.selected.size} selected`;
    const { allSelected, someSelected } = getSelectionState(ids, view.selected);
    const selectAll = main.querySelector('#selectAll');
    selectAll.checked = allSelected;
    selectAll.indeterminate = someSelected;
    selectAll.disabled = !ids.length;
    exportMenu.setLabel(view.selected.size ? `Export ${view.selected.size}` : 'Export');
    exportMenu.setDisabled(!total);
  }

  function exportIds() {
    return view.selected.size ? [...view.selected] : visibleIds(visibleGroups());
  }

  function exportMarkdown() {
    const files = clipFiles(ctx.state, exportIds());
    download(`xtoc-clips-${today()}.zip`, zipFiles(files));
  }

  function exportJson() {
    const ids = new Set(exportIds());
    const groups = clipGroups(ctx.state)
      .map((group) => ({ ...group, excerpts: group.excerpts.filter((clip) => ids.has(clip.id)) }))
      .filter((group) => group.excerpts.length);
    const prefix = view.selected.size ? 'x-twitter-selected-clips' : 'x-twitter-clips';
    download(
      `${prefix}-${today()}.json`,
      renderAllJson(groups, new Date().toISOString()),
      'application/json;charset=utf-8'
    );
  }

  async function deleteClips(ids) {
    if (!confirm(ids.length === 1 ? 'Delete this clip?' : `Delete ${ids.length} clips?`)) return;
    await ctx.rpc('library:delete', { type: 'clip', ids });
    ids.forEach((id) => view.selected.delete(id));
    if (ids.includes(view.openId)) closeDetail();
    await ctx.reload();
    renderList();
    ctx.toast(ids.length === 1 ? 'Clip deleted.' : `${ids.length} clips deleted.`);
  }

  function closeDetail() {
    view.openId = '';
    ctx.closeDrawer();
  }

  function openDetail(id) {
    const clip = ctx.state.clips[id];
    if (!clip || !ctx.confirmDiscard()) return;
    view.openId = id;
    const article =
      clipGroups(ctx.state).find((group) => group.article.id === clip.articleId)?.article || {};
    const url = article.canonicalUrl || article.url;
    const drawer = ctx.openDrawer(`
      <header class="drawer-head">
        <span class="eyebrow">Clip</span>
        ${iconButton({ name: 'close', label: 'Close', action: 'close-drawer' })}
      </header>
      <form class="drawer-body" id="editForm">
        <blockquote class="quote">${esc(clip.text)}</blockquote>
        ${url ? `<a class="source" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(article.title || 'Untitled')}${icon('external', 13)}</a>` : ''}
        <label class="field"><span>Tags</span><input class="input" name="tags" value="${esc((clip.tags || []).join(', '))}" placeholder="Separate with commas"></label>
        <label class="field"><span>Note</span><textarea class="input" name="note" rows="6">${esc(clip.note || '')}</textarea></label>
      </form>
      <footer class="drawer-foot">
        <button class="btn btn-ghost-danger" type="button" data-action="delete-one">${icon('trash', 14)}Delete</button>
        <button class="btn btn-primary" type="submit" form="editForm">Save</button>
      </footer>`);
    drawer.querySelector('#editForm').onsubmit = ctx.guard(async (event) => {
      event.preventDefault();
      const form = event.target.elements;
      await ctx.rpc('library:edit', {
        type: 'clip',
        id,
        expectedUpdatedAt: clip.updatedAt || '',
        tags: splitClipTagInput(form.tags.value),
        note: form.note.value
      });
      ctx.dirty = false;
      await ctx.reload();
      renderList();
      openDetail(id);
      ctx.toast('Saved.');
    });
    drawer.querySelector('[data-action="delete-one"]').onclick = ctx.guard(() => deleteClips([id]));
    renderList();
  }

  function bind() {
    main.onclick = ctx.guard(async (event) => {
      const target = event.target.closest('[data-action], [data-open]');
      if (!target) return;
      if (target.dataset.open) return openDetail(target.dataset.open);
      const action = target.dataset.action;
      if (action === 'clear-selection') {
        view.selected.clear();
        renderList();
      }
      if (action === 'delete-selected') await deleteClips([...view.selected]);
    });
    main.onchange = (event) => {
      const id = event.target.dataset.select;
      if (id) {
        event.target.checked ? view.selected.add(id) : view.selected.delete(id);
        renderList();
      } else if (event.target.id === 'selectAll') {
        const ids = visibleIds(visibleGroups());
        ids.forEach((clipId) =>
          event.target.checked ? view.selected.add(clipId) : view.selected.delete(clipId)
        );
        renderList();
      }
    };
    main.oninput = null;
    createSearch(main.querySelector('#search'), {
      placeholder: 'Search clips',
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
    exportMenu = createDropdown(main.querySelector('#exportMenu'), {
      mode: 'menu',
      variant: 'primary',
      iconName: 'download',
      label: 'Export',
      align: 'end',
      options: EXPORT_FORMATS,
      onSelect: ctx.guard((format) => (format === 'json' ? exportJson() : exportMarkdown()))
    });
  }

  return {
    render(container) {
      main = container;
      main.innerHTML = `
        <div class="page-top">
        <header class="page-head">
          <div class="page-title"><h1>Clips</h1><span class="subtle" id="subtitle"></span></div>
          <div id="exportMenu"></div>
        </header>
        <div class="toolbar">
          <input class="check" type="checkbox" id="selectAll" aria-label="Select all visible clips">
          <div class="toolbar-filters"><div id="search"></div><div id="tagFilter"></div></div>
          ${selectionActions()}
        </div>
        </div>
        <div class="list" id="list"></div>`;
      bind();
      if (view.openId && ctx.isDrawerOpen() && ctx.state.clips[view.openId]) {
        openDetail(view.openId);
      } else {
        view.openId = '';
        renderList();
      }
    }
  };
}
