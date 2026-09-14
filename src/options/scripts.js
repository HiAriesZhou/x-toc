import {
  filterExcerptGroups,
  getAuthorProfileUrl,
  getClipDisplayMeta,
  getClipLibraryEmptyState,
  getSelectionState,
  getVisibleExcerptIds,
  mergeClipTagInput,
  normalizeClipNote,
  normalizeClipTags,
  splitClipTagInput,
  updateClipNote,
  updateClipTags
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
let expandedExcerptIds = new Set();
let excerptSearchQuery = '';
let clipEditorState = null;
let isTagInputComposing = false;

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

function renderAuthorMeta(article) {
  const label = formatAuthor(article);
  const profileUrl = getAuthorProfileUrl(article.authorHandle);
  if (!profileUrl) {
    return `<span class="article-meta-pill">${escapeHtml(label)}</span>`;
  }

  return `
    <a class="article-meta-pill author-profile-link" href="${escapeHtml(profileUrl)}" target="_blank" rel="noreferrer" title="View ${escapeHtml(article.authorHandle)} on X">
      ${escapeHtml(label)}
    </a>
  `;
}

function getSelectedExcerptCount() {
  selectedExcerptIds = new Set(
    Array.from(selectedExcerptIds).filter((excerptId) => excerptState.excerpts[excerptId])
  );
  return selectedExcerptIds.size;
}

function renderTagChips(excerpt) {
  const displayMeta = getClipDisplayMeta(excerpt);
  if (!displayMeta.hasTags) return '';

  return `
    <div class="tag-list">
      ${displayMeta.tags.map((tag) => `<span class="tag-chip tag-chip-readonly">${escapeHtml(tag)}</span>`).join('')}
    </div>
  `;
}

function renderClipMeta(excerpt) {
  const displayMeta = getClipDisplayMeta(excerpt);
  const tagsHtml = renderTagChips(excerpt);
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
  const selectAllVisible = document.getElementById('selectAllVisible');
  const selectAllLabel = document.getElementById('selectAllLabel');
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
  const visibleExcerptIds = getVisibleExcerptIds(groups);
  const visibleSelection = getSelectionState(visibleExcerptIds, selectedExcerptIds);
  const hiddenSelectedCount = selectedCount - visibleSelection.selectedVisibleCount;

  exportMenuBtn.disabled = !hasSavedExcerpts;
  exportMenuBtn.textContent = hasSelection ? `Export ${selectedCount} clip${selectedCount === 1 ? '' : 's'}` : 'Export all';
  exportMarkdownMenuItem.textContent = hasSelection ? 'Markdown' : 'All clips as Markdown';
  exportJsonMenuItem.textContent = hasSelection ? 'JSON' : 'All clips as JSON';
  selectionSummary.textContent = hiddenSelectedCount > 0
    ? `${selectedCount} selected · ${hiddenSelectedCount} hidden`
    : `${selectedCount} selected`;
  clearSelectionBtn.classList.toggle('hidden', !hasSelection);
  deleteSelectedBtn.classList.toggle('hidden', !hasSelection);
  articleCount.textContent = groups.length;
  excerptCount.textContent = totalExcerpts;
  selectAllVisible.checked = visibleSelection.allSelected;
  selectAllVisible.indeterminate = visibleSelection.someSelected;
  selectAllVisible.disabled = visibleExcerptIds.length === 0;
  selectAllLabel.textContent = hasSearchQuery ? 'Select results' : 'Select all';
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

  manager.innerHTML = groups.map(({ article, excerpts }) => {
    const groupExcerptIds = excerpts.map((excerpt) => excerpt.id);
    const groupSelection = getSelectionState(groupExcerptIds, selectedExcerptIds);
    const groupSelectControl = excerpts.length > 1
      ? `
        <label class="group-select" title="Select clips in this article">
          <input class="clip-checkbox" type="checkbox" data-action="select-group" data-article-id="${escapeHtml(article.id)}" aria-label="Select clips in ${escapeHtml(article.title || 'this article')}" ${groupSelection.allSelected ? 'checked' : ''}>
        </label>
      `
      : '<span class="group-select-placeholder" aria-hidden="true"></span>';
    return `
    <article class="article-excerpt-group" data-article-id="${escapeHtml(article.id)}">
      <div class="article-group-header">
        ${groupSelectControl}
        <div class="article-title-block">
          <div class="article-title-row">
            <h3>
              <a class="article-title-link" href="${escapeHtml(article.url || article.canonicalUrl || '#')}" target="_blank" rel="noreferrer">
                <span>${escapeHtml(article.title || 'Unknown Article')}</span>
                <span class="external-link-mark" aria-hidden="true">↗</span>
              </a>
            </h3>
            <div class="article-meta-row">
              ${renderAuthorMeta(article)}
              <span class="article-meta-pill">${excerpts.length} clip${excerpts.length === 1 ? '' : 's'}</span>
            </div>
          </div>
        </div>
      </div>

      <ul class="excerpt-list">
        ${excerpts.map((excerpt) => {
          const isExpanded = expandedExcerptIds.has(excerpt.id);
          const canExpand = excerpt.text.length > 180 || excerpt.text.split('\n').length > 3;
          return `
          <li class="excerpt-item ${clipEditorState?.excerptId === excerpt.id ? 'is-editing' : ''} ${selectedExcerptIds.has(excerpt.id) ? 'is-selected' : ''} ${isExpanded ? 'is-expanded' : ''}" data-excerpt-id="${escapeHtml(excerpt.id)}">
            <label class="excerpt-select" title="Select clip">
              <input class="clip-checkbox" type="checkbox" data-action="select-excerpt" data-excerpt-id="${escapeHtml(excerpt.id)}" aria-label="Select clip" ${selectedExcerptIds.has(excerpt.id) ? 'checked' : ''}>
            </label>
            <div class="excerpt-content">
              <div class="excerpt-primary-row">
                <blockquote id="clip-text-${escapeHtml(excerpt.id)}">${escapeHtml(excerpt.text)}</blockquote>
                <div class="clip-primary-actions">
                  <time datetime="${escapeHtml(excerpt.createdAt)}" title="Saved ${escapeHtml(formatDisplayDate(excerpt.createdAt))}">${escapeHtml(formatShortDate(excerpt.createdAt))}</time>
                  ${canExpand ? `<button class="text-action-btn" type="button" data-action="toggle-expanded" data-excerpt-id="${escapeHtml(excerpt.id)}" aria-expanded="${isExpanded}" aria-controls="clip-text-${escapeHtml(excerpt.id)}">${isExpanded ? 'Show less' : 'Show full clip'}</button>` : ''}
                  <button class="edit-clip-btn" type="button" data-action="open-editor" data-excerpt-id="${escapeHtml(excerpt.id)}" aria-expanded="${clipEditorState?.excerptId === excerpt.id}" aria-controls="clipEditorPopover">
                    Edit
                  </button>
                </div>
              </div>
              ${renderClipMeta(excerpt)}
            </div>
          </li>
        `}).join('')}
      </ul>
    </article>
  `;
  }).join('');

  manager.querySelectorAll('[data-action="select-group"]').forEach((checkbox) => {
    const group = groups.find(({ article }) => article.id === checkbox.dataset.articleId);
    const groupSelection = getSelectionState(
      group?.excerpts.map((excerpt) => excerpt.id) || [],
      selectedExcerptIds
    );
    checkbox.indeterminate = groupSelection.someSelected;
  });

  if (clipEditorState) {
    const nextAnchor = manager.querySelector(
      `[data-action="open-editor"][data-excerpt-id="${CSS.escape(clipEditorState.excerptId)}"]`
    );
    if (nextAnchor) requestAnimationFrame(() => positionClipEditor(nextAnchor));
  }
}

async function saveExcerptState() {
  await chrome.storage.local.set({
    [excerptStorageKeys.articles]: excerptState.articles,
    [excerptStorageKeys.excerpts]: excerptState.excerpts
  });
}

async function deleteSelectedExcerpts() {
  const articleIds = new Set();

  if (clipEditorState && selectedExcerptIds.has(clipEditorState.excerptId)) {
    hideClipEditor();
  }

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

function isClipEditorDirty() {
  if (!clipEditorState) return false;
  return JSON.stringify(normalizeClipTags(clipEditorState.tags)) !== JSON.stringify(clipEditorState.initialTags)
    || normalizeClipNote(clipEditorState.note) !== clipEditorState.initialNote
    || splitClipTagInput(document.getElementById('clipTagInput')?.value).length > 0;
}

function setClipEditorStatus(message = '') {
  document.getElementById('clipEditorStatus').textContent = message;
}

function renderClipEditorTags() {
  const tags = document.getElementById('clipEditorTags');
  if (!clipEditorState || clipEditorState.tags.length === 0) {
    tags.innerHTML = '<span class="clip-editor-empty-tags">No tags yet</span>';
    return;
  }

  tags.innerHTML = clipEditorState.tags.map((tag) => `
    <button class="tag-chip editor-tag-chip" type="button" data-action="remove-editor-tag" data-tag="${escapeHtml(tag)}" title="Remove tag">
      <span>${escapeHtml(tag)}</span>
      <span aria-hidden="true">×</span>
    </button>
  `).join('');
}

function emphasizeDuplicateTags(duplicateTags) {
  if (duplicateTags.length === 0) return;
  const duplicateKeys = new Set(duplicateTags.map((tag) => tag.toLocaleLowerCase()));

  document.querySelectorAll('#clipEditorTags [data-tag]').forEach((chip) => {
    if (!duplicateKeys.has(chip.dataset.tag.toLocaleLowerCase())) return;
    chip.classList.remove('is-duplicate');
    requestAnimationFrame(() => chip.classList.add('is-duplicate'));
  });
}

function resizeNoteInput() {
  const noteInput = document.getElementById('clipNoteInput');
  noteInput.style.height = 'auto';
  noteInput.style.height = `${Math.min(Math.max(noteInput.scrollHeight, 50), 84)}px`;
}

function positionClipEditor(anchor = clipEditorState?.anchor) {
  const popover = document.getElementById('clipEditorPopover');
  if (!clipEditorState || !anchor?.isConnected) return;

  clipEditorState.anchor = anchor;
  const anchorRect = anchor.getBoundingClientRect();
  const popoverRect = popover.getBoundingClientRect();
  const margin = 12;
  const gap = 10;
  const isNarrowViewport = window.innerWidth < 700;
  const left = isNarrowViewport
    ? Math.max(margin, Math.min(anchorRect.right - popoverRect.width, window.innerWidth - popoverRect.width - margin))
    : Math.max(margin, Math.min(anchorRect.right + gap, window.innerWidth - popoverRect.width - margin));
  const preferredTop = isNarrowViewport ? anchorRect.bottom + gap : anchorRect.top - 18;
  const top = Math.min(Math.max(margin, preferredTop), Math.max(margin, window.innerHeight - popoverRect.height - margin));

  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
}

function markEditingClip(excerptId, isEditing) {
  const item = document.querySelector(`.excerpt-item[data-excerpt-id="${CSS.escape(excerptId)}"]`);
  item?.classList.toggle('is-editing', isEditing);
  const button = item?.querySelector('[data-action="open-editor"]');
  button?.setAttribute('aria-expanded', String(isEditing));
}

function hideClipEditor() {
  if (!clipEditorState) return;
  markEditingClip(clipEditorState.excerptId, false);
  clipEditorState = null;
  const popover = document.getElementById('clipEditorPopover');
  popover.classList.remove('open');
  popover.setAttribute('aria-hidden', 'true');
  popover.toggleAttribute('inert', true);
  setClipEditorStatus('');
}

function requestCloseClipEditor() {
  if (!clipEditorState) return;
  if (isClipEditorDirty()) {
    setClipEditorStatus('Save or cancel your changes first.');
    document.querySelector('#clipEditorForm .primary-button')?.focus();
    return;
  }
  hideClipEditor();
}

function openClipEditor(actionTarget) {
  const excerptId = actionTarget.dataset.excerptId;
  const excerpt = excerptState.excerpts[excerptId];
  if (!excerpt) return;

  if (clipEditorState?.excerptId === excerptId) {
    document.getElementById('clipTagInput').focus();
    return;
  }
  if (clipEditorState && isClipEditorDirty()) {
    setClipEditorStatus('Save or cancel your current changes first.');
    document.querySelector('#clipEditorForm .primary-button')?.focus();
    return;
  }
  if (clipEditorState) hideClipEditor();

  const tags = normalizeClipTags(excerpt.tags);
  const note = normalizeClipNote(excerpt.note);
  clipEditorState = {
    excerptId,
    tags: [...tags],
    note,
    initialTags: tags,
    initialNote: note,
    anchor: actionTarget
  };

  const preview = excerpt.text.replace(/\s+/g, ' ').trim();
  document.getElementById('clipEditorTitle').textContent = preview.length > 96
    ? `${preview.slice(0, 96).trim()}…`
    : preview;
  document.getElementById('clipTagInput').value = '';
  document.getElementById('clipNoteInput').value = note;
  renderClipEditorTags();
  resizeNoteInput();
  setClipEditorStatus('');
  markEditingClip(excerptId, true);

  const popover = document.getElementById('clipEditorPopover');
  popover.toggleAttribute('inert', false);
  popover.setAttribute('aria-hidden', 'false');
  popover.classList.add('open');
  requestAnimationFrame(() => {
    positionClipEditor(actionTarget);
    document.getElementById('clipTagInput').focus();
  });
}

function addDraftTags() {
  if (!clipEditorState) return;
  const input = document.getElementById('clipTagInput');
  const result = mergeClipTagInput(clipEditorState.tags, input.value);
  if (result.added.length === 0 && result.duplicates.length === 0) {
    setClipEditorStatus('Type a tag first.');
    return;
  }

  clipEditorState.tags = result.tags;
  input.value = '';
  renderClipEditorTags();
  if (result.duplicates.length > 0) {
    const duplicateLabel = result.duplicates.length === 1
      ? `“${result.duplicates[0]}” is already added.`
      : `${result.duplicates.length} tags are already added.`;
    setClipEditorStatus(duplicateLabel);
    emphasizeDuplicateTags(result.duplicates);
  } else {
    setClipEditorStatus('');
  }
  input.focus();
}

async function saveClipEditor() {
  if (!clipEditorState) return;
  const excerpt = excerptState.excerpts[clipEditorState.excerptId];
  if (!excerpt) {
    hideClipEditor();
    return;
  }

  const now = new Date().toISOString();
  const pendingTag = document.getElementById('clipTagInput').value;
  const { tags } = mergeClipTagInput(clipEditorState.tags, pendingTag);
  const withTags = updateClipTags(excerpt, tags, { now });
  excerptState.excerpts[clipEditorState.excerptId] = updateClipNote(withTags, clipEditorState.note, { now });
  await saveExcerptState();
  hideClipEditor();
  renderExcerptManager();
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
    const action = event.target.dataset.action;
    if (action === 'select-excerpt') {
      if (event.target.checked) {
        selectedExcerptIds.add(event.target.dataset.excerptId);
      } else {
        selectedExcerptIds.delete(event.target.dataset.excerptId);
      }
    } else if (action === 'select-group') {
      const groups = filterExcerptGroups(groupExcerptsByArticle(), excerptSearchQuery);
      const group = groups.find(({ article }) => article.id === event.target.dataset.articleId);
      group?.excerpts.forEach((excerpt) => {
        if (event.target.checked) selectedExcerptIds.add(excerpt.id);
        else selectedExcerptIds.delete(excerpt.id);
      });
    } else {
      return;
    }
    renderExcerptManager();
  });

  manager.addEventListener('click', async (event) => {
    const actionTarget = event.target.closest('[data-action]');
    const action = actionTarget?.dataset.action;
    if (action === 'open-editor') {
      openClipEditor(actionTarget);
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
  document.getElementById('selectAllVisible').addEventListener('change', (event) => {
    const groups = filterExcerptGroups(groupExcerptsByArticle(), excerptSearchQuery);
    getVisibleExcerptIds(groups).forEach((excerptId) => {
      if (event.target.checked) selectedExcerptIds.add(excerptId);
      else selectedExcerptIds.delete(excerptId);
    });
    renderExcerptManager();
  });

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

function bindClipEditor() {
  const popover = document.getElementById('clipEditorPopover');
  popover.toggleAttribute('inert', true);

  document.getElementById('closeClipEditorBtn').addEventListener('click', requestCloseClipEditor);
  document.getElementById('cancelClipEditorBtn').addEventListener('click', hideClipEditor);
  const tagInput = document.getElementById('clipTagInput');
  tagInput.addEventListener('compositionstart', () => {
    isTagInputComposing = true;
  });
  tagInput.addEventListener('compositionend', () => {
    isTagInputComposing = false;
    if (/[,，\r\n]/.test(tagInput.value)) addDraftTags();
  });
  tagInput.addEventListener('input', () => {
    if (isTagInputComposing || !/[,，\r\n]/.test(tagInput.value)) return;
    addDraftTags();
  });
  tagInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing || isTagInputComposing) return;
    event.preventDefault();
    addDraftTags();
  });
  document.getElementById('clipNoteInput').addEventListener('input', (event) => {
    if (!clipEditorState) return;
    clipEditorState.note = event.target.value;
    setClipEditorStatus('');
    resizeNoteInput();
  });
  document.getElementById('clipEditorTags').addEventListener('click', (event) => {
    const removeButton = event.target.closest('[data-action="remove-editor-tag"]');
    if (!removeButton || !clipEditorState) return;
    const targetTag = removeButton.dataset.tag.toLocaleLowerCase();
    clipEditorState.tags = clipEditorState.tags.filter((tag) => tag.toLocaleLowerCase() !== targetTag);
    setClipEditorStatus('');
    renderClipEditorTags();
  });
  document.getElementById('clipEditorForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    await saveClipEditor();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && clipEditorState) requestCloseClipEditor();
  });
  let positionFrame = null;
  const scheduleEditorPosition = () => {
    if (!clipEditorState || positionFrame) return;
    positionFrame = requestAnimationFrame(() => {
      positionFrame = null;
      positionClipEditor();
    });
  };
  window.addEventListener('resize', scheduleEditorPosition);
  window.addEventListener('scroll', scheduleEditorPosition, { passive: true });
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
  bindClipEditor();
  loadExcerptData();
});
