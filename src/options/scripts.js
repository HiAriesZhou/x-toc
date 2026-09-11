import {
  addClipTag,
  filterExcerptGroups,
  getClipDisplayMeta,
  getClipLibraryEmptyState,
  normalizeClipNote,
  removeClipTag,
  updateClipNote
} from './clip-utils.js';
import {
  renderAllJson,
  renderAllMarkdown
} from './export-utils.js';

// Options page script

const excerptStorageKeys = {
  articles: 'twitterTocArticles',
  excerpts: 'twitterTocExcerpts',
  settings: 'twitterTocExcerptSettings'
};

let excerptState = {
  articles: {},
  excerpts: {}
};

let selectedExcerptIds = new Set();
let editingExcerptIds = new Set();
let expandedExcerptIds = new Set();
let excerptSearchQuery = '';

async function loadExcerptData() {
  const data = await chrome.storage.local.get([
    excerptStorageKeys.articles,
    excerptStorageKeys.excerpts
  ]);

  excerptState = {
    articles: data[excerptStorageKeys.articles] || {},
    excerpts: data[excerptStorageKeys.excerpts] || {}
  };

  renderExcerptManager();
}

function groupExcerptsByArticle() {
  const groups = new Map();

  Object.values(excerptState.excerpts)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .forEach((excerpt) => {
      const article = excerptState.articles[excerpt.articleId] || {
        id: excerpt.articleId,
        title: 'Unknown Article',
        url: excerpt.pageUrl || '',
        canonicalUrl: excerpt.pageUrl || '',
        authorName: null,
        authorHandle: null,
        publishedAt: null,
        platform: excerpt.source || 'x.com'
      };

      if (!groups.has(article.id)) {
        groups.set(article.id, {
          article,
          excerpts: []
        });
      }

      groups.get(article.id).excerpts.push(excerpt);
    });

  return Array.from(groups.values())
    .sort((a, b) => {
      const latestA = a.excerpts[a.excerpts.length - 1]?.createdAt || '';
      const latestB = b.excerpts[b.excerpts.length - 1]?.createdAt || '';
      return new Date(latestB) - new Date(latestA);
    });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDisplayDate(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatShortDate(value) {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatAuthor(article) {
  if (article.authorName && article.authorHandle) {
    return `${article.authorName} (${article.authorHandle})`;
  }
  return article.authorName || article.authorHandle || 'Unknown';
}

function getSelectedExcerptCount() {
  selectedExcerptIds = new Set(
    Array.from(selectedExcerptIds).filter((excerptId) => excerptState.excerpts[excerptId])
  );
  return selectedExcerptIds.size;
}

function renderTagChips(excerpt, { editable }) {
  const displayMeta = getClipDisplayMeta(excerpt);
  if (!displayMeta.hasTags) return '';

  return `
    <div class="tag-list">
      ${displayMeta.tags.map((tag) => {
        if (!editable) {
          return `<span class="tag-chip tag-chip-readonly">${escapeHtml(tag)}</span>`;
        }

        return `
          <button class="tag-chip" type="button" data-action="remove-tag" data-excerpt-id="${escapeHtml(excerpt.id)}" data-tag="${escapeHtml(tag)}" title="Remove tag">
            <span>${escapeHtml(tag)}</span>
            <span aria-hidden="true">×</span>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function renderClipEditor(excerpt) {
  return `
    <div class="excerpt-editor">
      <div class="editor-section editor-tags-section" aria-label="Clip tags">
        <div class="editor-section-header">
          <span class="editor-label">Tags</span>
        </div>
        <div class="editor-section-content">
          ${renderTagChips(excerpt, { editable: true })}
          <button class="editor-add-btn" type="button" data-action="show-tag-input" data-excerpt-id="${escapeHtml(excerpt.id)}" aria-label="Add tag">+</button>
          <div class="tag-editor hidden" data-role="tag-editor">
            <input type="text" data-role="tag-input" aria-label="Add tag" placeholder="Add tag">
          </div>
        </div>
      </div>
      <div class="editor-section editor-note-section">
        <span class="editor-label">Note</span>
        <textarea data-role="note-input" rows="2" placeholder="Add a note">${escapeHtml(excerpt.note || '')}</textarea>
      </div>
    </div>
  `;
}

function renderClipMeta(excerpt) {
  const displayMeta = getClipDisplayMeta(excerpt);
  const tagsHtml = renderTagChips(excerpt, { editable: false });
  const note = normalizeClipNote(excerpt.note);
  const noteHtml = displayMeta.hasNote
    ? `<div class="clip-note">${escapeHtml(note)}</div>`
    : '';

  if (!tagsHtml && !noteHtml) return '';

  return `
    <div class="clip-meta">
      <div class="clip-meta-row">
        ${tagsHtml}
      </div>
      ${noteHtml}
    </div>
  `;
}

function renderExcerptManager() {
  const manager = document.getElementById('excerptManager');
  const searchInput = document.getElementById('excerptSearchInput');
  const exportMenuBtn = document.getElementById('exportMenuBtn');
  const exportMarkdownMenuItem = document.getElementById('exportMarkdownMenuItem');
  const exportJsonMenuItem = document.getElementById('exportJsonMenuItem');
  const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
  const clearSelectionBtn = document.getElementById('clearSelectionBtn');
  const selectionSummary = document.getElementById('selectionSummary');
  const articleCount = document.getElementById('articleCount');
  const excerptCount = document.getElementById('excerptCount');
  const allGroups = groupExcerptsByArticle();
  const groups = filterExcerptGroups(allGroups, excerptSearchQuery);
  const hasExcerpts = groups.length > 0;
  const hasSavedExcerpts = allGroups.length > 0;
  const hasSearchQuery = excerptSearchQuery.trim().length > 0;
  const emptyState = getClipLibraryEmptyState({
    hasSavedClips: hasSavedExcerpts,
    hasSearchQuery,
    hasMatchingClips: hasExcerpts
  });
  const totalExcerpts = groups.reduce((count, group) => count + group.excerpts.length, 0);
  const selectedCount = getSelectedExcerptCount();
  const hasSelection = selectedCount > 0;

  exportMenuBtn.disabled = !hasSavedExcerpts;
  exportMenuBtn.textContent = hasSelection ? `Export ${selectedCount} clip${selectedCount === 1 ? '' : 's'}` : 'Export all';
  exportMarkdownMenuItem.textContent = hasSelection ? 'Markdown' : 'All clips as Markdown';
  exportJsonMenuItem.textContent = hasSelection ? 'JSON' : 'All clips as JSON';
  selectionSummary.textContent = `${selectedCount} selected`;
  clearSelectionBtn.classList.toggle('hidden', !hasSelection);
  deleteSelectedBtn.classList.toggle('hidden', !hasSelection);
  articleCount.textContent = groups.length;
  excerptCount.textContent = totalExcerpts;
  if (searchInput && searchInput.value !== excerptSearchQuery) {
    searchInput.value = excerptSearchQuery;
  }

  if (emptyState) {
    manager.innerHTML = `
      <div class="empty-state">
        <strong>${escapeHtml(emptyState.title)}</strong>
        <span>${escapeHtml(emptyState.message)}</span>
      </div>
    `;
    return;
  }

  manager.innerHTML = groups.map(({ article, excerpts }) => `
    <article class="article-excerpt-group" data-article-id="${escapeHtml(article.id)}">
      <div class="article-group-header">
        <div class="article-title-block">
          <div class="article-title-row">
            <h3>
              <a class="article-title-link" href="${escapeHtml(article.url || article.canonicalUrl || '#')}" target="_blank" rel="noreferrer">
                <span>${escapeHtml(article.title || 'Unknown Article')}</span>
                <span class="external-link-mark" aria-hidden="true">↗</span>
              </a>
            </h3>
            <div class="article-meta-row">
              <span>${escapeHtml(formatAuthor(article))}</span>
              <span>${excerpts.length} clip${excerpts.length === 1 ? '' : 's'}</span>
            </div>
          </div>
        </div>
      </div>

      <ul class="excerpt-list">
        ${excerpts.map((excerpt) => {
          const isExpanded = expandedExcerptIds.has(excerpt.id);
          const canExpand = excerpt.text.length > 180 || excerpt.text.split('\n').length > 3;
          return `
          <li class="excerpt-item ${editingExcerptIds.has(excerpt.id) ? 'is-editing' : ''} ${isExpanded ? 'is-expanded' : ''}" data-excerpt-id="${escapeHtml(excerpt.id)}">
            <label class="excerpt-select" title="Select clip">
              <input type="checkbox" data-action="select-excerpt" data-excerpt-id="${escapeHtml(excerpt.id)}" ${selectedExcerptIds.has(excerpt.id) ? 'checked' : ''}>
            </label>
            <div class="excerpt-content">
              <blockquote id="clip-text-${escapeHtml(excerpt.id)}">${escapeHtml(excerpt.text)}</blockquote>
              ${editingExcerptIds.has(excerpt.id) ? renderClipEditor(excerpt) : renderClipMeta(excerpt)}
              <div class="excerpt-footer">
                <span title="Saved ${escapeHtml(formatDisplayDate(excerpt.createdAt))}">Saved ${escapeHtml(formatShortDate(excerpt.createdAt))}</span>
                <div class="clip-actions">
                  ${canExpand ? `<button class="text-action-btn" type="button" data-action="toggle-expanded" data-excerpt-id="${escapeHtml(excerpt.id)}" aria-expanded="${isExpanded}" aria-controls="clip-text-${escapeHtml(excerpt.id)}">${isExpanded ? 'Show less' : 'Show full clip'}</button>` : ''}
                  <button class="edit-clip-btn" type="button" data-action="${editingExcerptIds.has(excerpt.id) ? 'save-editor' : 'open-editor'}" data-excerpt-id="${escapeHtml(excerpt.id)}">
                    ${editingExcerptIds.has(excerpt.id) ? 'Save' : 'Tags & note'}
                  </button>
                </div>
              </div>
            </div>
          </li>
        `}).join('')}
      </ul>
    </article>
  `).join('');
}

async function saveExcerptState() {
  await chrome.storage.local.set({
    [excerptStorageKeys.articles]: excerptState.articles,
    [excerptStorageKeys.excerpts]: excerptState.excerpts
  });
}

async function deleteSelectedExcerpts() {
  const articleIds = new Set();

  selectedExcerptIds.forEach((excerptId) => {
    const articleId = excerptState.excerpts[excerptId]?.articleId;
    if (articleId) articleIds.add(articleId);
    delete excerptState.excerpts[excerptId];
  });

  articleIds.forEach((articleId) => {
    if (!Object.values(excerptState.excerpts).some((excerpt) => excerpt.articleId === articleId)) {
      delete excerptState.articles[articleId];
    }
  });

  selectedExcerptIds = new Set();
  await saveExcerptState();
  renderExcerptManager();
}

async function updateExcerpt(excerptId, updater) {
  const excerpt = excerptState.excerpts[excerptId];
  if (!excerpt) return;

  const nextExcerpt = updater(excerpt);
  if (nextExcerpt === excerpt) return;

  excerptState.excerpts[excerptId] = nextExcerpt;
  await saveExcerptState();
  renderExcerptManager();
}

async function saveClipEditor(actionTarget) {
  const excerptId = actionTarget.dataset.excerptId;
  const item = actionTarget.closest('.excerpt-item');
  const tagInput = item?.querySelector('[data-role="tag-input"]');
  const noteInput = item?.querySelector('[data-role="note-input"]');
  const tag = tagInput?.value || '';
  const note = noteInput?.value || '';

  await updateExcerpt(excerptId, (excerpt) => {
    const withTag = addClipTag(excerpt, tag);
    return updateClipNote(withTag, note);
  });

  editingExcerptIds.delete(excerptId);
  renderExcerptManager();
}

async function saveTagInput(input) {
  const item = input.closest('.excerpt-item');
  const excerptId = item?.dataset.excerptId;
  const noteInput = item?.querySelector('[data-role="note-input"]');
  const tag = input.value || '';
  const note = noteInput?.value || '';
  const excerpt = excerptState.excerpts[excerptId];
  if (!excerpt) return;

  if (!tag.trim()) {
    closeTagInput(input);
    return;
  }

  const withTag = addClipTag(excerpt, tag);
  excerptState.excerpts[excerptId] = updateClipNote(withTag, note);
  await saveExcerptState();
  renderExcerptManager();
}

function closeTagInput(input) {
  const editor = input.closest('[data-role="tag-editor"]');
  const addButton = editor?.parentElement?.querySelector('[data-action="show-tag-input"]');

  input.value = '';
  editor?.classList.add('hidden');
  addButton?.classList.remove('hidden');
}

function currentDateSlug() {
  return new Date().toISOString().slice(0, 10);
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getExportGroups() {
  const groups = groupExcerptsByArticle();
  if (selectedExcerptIds.size === 0) return groups;

  return groups
    .map(({ article, excerpts }) => ({
      article,
      excerpts: excerpts.filter((excerpt) => selectedExcerptIds.has(excerpt.id))
    }))
    .filter((group) => group.excerpts.length > 0);
}

function exportMarkdown() {
  const groups = getExportGroups();
  if (groups.length === 0) return;

  const markdown = renderAllMarkdown(groups, new Date().toISOString());
  const filenamePrefix = selectedExcerptIds.size > 0 ? 'x-twitter-selected-clips' : 'x-twitter-clips';
  downloadFile(`${filenamePrefix}-${currentDateSlug()}.md`, markdown, 'text/markdown;charset=utf-8');
}

function exportJson() {
  const groups = getExportGroups();
  if (groups.length === 0) return;

  const json = renderAllJson(groups, new Date().toISOString());
  const filenamePrefix = selectedExcerptIds.size > 0 ? 'x-twitter-selected-clips' : 'x-twitter-clips';
  downloadFile(`${filenamePrefix}-${currentDateSlug()}.json`, json, 'application/json;charset=utf-8');
}

function bindExcerptManagerEvents() {
  const manager = document.getElementById('excerptManager');

  manager.addEventListener('change', (event) => {
    if (event.target.dataset.action !== 'select-excerpt') return;

    if (event.target.checked) {
      selectedExcerptIds.add(event.target.dataset.excerptId);
    } else {
      selectedExcerptIds.delete(event.target.dataset.excerptId);
    }
    renderExcerptManager();
  });

  manager.addEventListener('click', async (event) => {
    const actionTarget = event.target.closest('[data-action]');
    const action = actionTarget?.dataset.action;
    if (action === 'remove-tag') {
      await updateExcerpt(actionTarget.dataset.excerptId, (excerpt) => removeClipTag(excerpt, actionTarget.dataset.tag));
    } else if (action === 'show-tag-input') {
      const item = actionTarget.closest('.excerpt-item');
      const editor = item?.querySelector('[data-role="tag-editor"]');
      const input = editor?.querySelector('[data-role="tag-input"]');
      actionTarget.classList.add('hidden');
      editor?.classList.remove('hidden');
      if (input) {
        input.value = '';
        input.focus();
      }
    } else if (action === 'open-editor') {
      editingExcerptIds.add(actionTarget.dataset.excerptId);
      renderExcerptManager();
    } else if (action === 'save-editor') {
      await saveClipEditor(actionTarget);
    } else if (action === 'toggle-expanded') {
      const excerptId = actionTarget.dataset.excerptId;
      const item = actionTarget.closest('.excerpt-item');
      const isExpanded = !expandedExcerptIds.has(excerptId);

      if (isExpanded) expandedExcerptIds.add(excerptId);
      else expandedExcerptIds.delete(excerptId);

      item?.classList.toggle('is-expanded', isExpanded);
      actionTarget.setAttribute('aria-expanded', String(isExpanded));
      actionTarget.textContent = isExpanded ? 'Show less' : 'Show full clip';
    }
  });

  manager.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter' || event.target.dataset.role !== 'tag-input') return;

    event.preventDefault();
    await saveTagInput(event.target);
  });

  manager.addEventListener('focusout', (event) => {
    if (event.target.dataset.role !== 'tag-input') return;

    setTimeout(async () => {
      if (!document.body.contains(event.target)) return;
      await saveTagInput(event.target);
    }, 0);
  });
}

function closeExportMenu() {
  document.getElementById('exportMenuBtn').setAttribute('aria-expanded', 'false');
  document.getElementById('exportDropdown').classList.remove('open');
}

function bindExportMenu() {
  const exportMenuBtn = document.getElementById('exportMenuBtn');
  const exportDropdown = document.getElementById('exportDropdown');

  exportMenuBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = exportDropdown.classList.toggle('open');
    exportMenuBtn.setAttribute('aria-expanded', String(isOpen));
  });

  document.getElementById('exportMenu').addEventListener('click', (event) => {
    const action = event.target.dataset.action;
    if (action === 'export-markdown') {
      exportMarkdown();
    } else if (action === 'export-json') {
      exportJson();
    }
    closeExportMenu();
  });

  document.addEventListener('click', closeExportMenu);
}

function bindSelectionActions() {
  document.getElementById('deleteSelectedBtn').addEventListener('click', async () => {
    const selectedCount = getSelectedExcerptCount();
    if (selectedCount > 0 && confirm(`Delete ${selectedCount} selected clip${selectedCount === 1 ? '' : 's'}?`)) {
      await deleteSelectedExcerpts();
    }
  });

  document.getElementById('clearSelectionBtn').addEventListener('click', () => {
    selectedExcerptIds = new Set();
    renderExcerptManager();
  });

}

function bindExcerptSearch() {
  const searchInput = document.getElementById('excerptSearchInput');
  if (!searchInput) return;

  const updateSearchQuery = () => {
    excerptSearchQuery = searchInput.value;
    renderExcerptManager();
  };

  searchInput.addEventListener('input', updateSearchQuery);
  searchInput.addEventListener('search', updateSearchQuery);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  bindExcerptSearch();
  bindExcerptManagerEvents();
  bindExportMenu();
  bindSelectionActions();
  loadExcerptData();
});
