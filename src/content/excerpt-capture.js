// Selection → "save to xtoc": saves the selected passage, with its article and
// surrounding context, through the background Library writer.
import { KEYS, contentId } from '../library/model.js';
import {
  findArticleContainer,
  getCanonicalUrl,
  getStatusId,
  isExtensionElement
} from './page-utils.js';

let xtocExcerptFeatureInitialized = false;
let xtocSaveButton = null;
let xtocCurrentSelection = null;
let xtocLastUrl = window.location.href;
let xtocSelectionTimeout = null;
let xtocExcerptAbortController = null;
let getTocTitle = () => null;

const XTOC_STORAGE_KEYS = {
  articles: KEYS.articles,
  excerpts: KEYS.clips,
  settings: 'twitterTocExcerptSettings'
};

const DEFAULT_EXCERPT_SETTINGS = {
  contextLength: 80,
  defaultExportFormat: 'markdown'
};

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function getMeaningfulArticleLine(article) {
  const lines = (article?.textContent || '')
    .split('\n')
    .map((line) => normalizeWhitespace(line))
    .filter((line) => line.length >= 8 && line.length < 180 && !/^\d+$/.test(line));

  return lines[0] || null;
}

function getArticleTitle(article, canonicalUrl) {
  const titleElement = document.querySelector('[data-testid="twitter-article-title"]');
  const titleText = titleElement?.textContent?.trim();
  if (titleText) return titleText;

  const tocTitle = getTocTitle();
  if (tocTitle) return tocTitle;

  const heading = article?.querySelector?.('h1, h2, .longform-header-one, .longform-header-two');
  const headingText = heading?.textContent?.trim();
  if (headingText) return headingText;

  const firstLine = getMeaningfulArticleLine(article);
  if (firstLine) return firstLine;

  const statusId = getStatusId(canonicalUrl);
  if (statusId) return `X / Twitter Article - ${statusId}`;

  return 'X / Twitter Article';
}

function getArticleAuthor(article) {
  const userName = article?.querySelector?.('[data-testid="User-Name"]');
  const userNameText = userName?.textContent || '';
  const handleMatch = userNameText.match(/@[\w_]+/);
  const authorHandle = handleMatch ? handleMatch[0] : null;

  let authorName = null;
  if (userName) {
    const nameCandidate = Array.from(userName.querySelectorAll('span'))
      .map((span) => span.textContent?.trim())
      .find((text) => text && !text.startsWith('@') && !/^\d+[smhd]$/.test(text));
    authorName = nameCandidate || null;
  }

  if (!authorHandle) {
    const statusMatch = getCanonicalUrl().match(/^https?:\/\/(?:x|twitter)\.com\/([^/]+)\/status/);
    return {
      authorName,
      authorHandle: statusMatch ? `@${statusMatch[1]}` : null
    };
  }

  return { authorName, authorHandle };
}

function getPublishedAt(article) {
  const datetime = article?.querySelector?.('time[datetime]')?.getAttribute('datetime');
  return datetime || null;
}

function extractArticleMetadata(article = findArticleContainer()) {
  const canonicalUrl = getCanonicalUrl();
  const now = new Date().toISOString();
  const { authorName, authorHandle } = getArticleAuthor(article);

  return {
    id: contentId(canonicalUrl),
    url: window.location.href,
    canonicalUrl,
    title: getArticleTitle(article, canonicalUrl),
    authorName,
    authorHandle,
    publishedAt: getPublishedAt(article),
    platform: window.location.hostname,
    createdAt: now,
    updatedAt: now
  };
}

async function getStorageData() {
  const data = await chrome.storage.local.get([
    XTOC_STORAGE_KEYS.articles,
    XTOC_STORAGE_KEYS.excerpts,
    XTOC_STORAGE_KEYS.settings
  ]);

  return {
    articles: data[XTOC_STORAGE_KEYS.articles] || {},
    excerpts: data[XTOC_STORAGE_KEYS.excerpts] || {},
    settings: {
      ...DEFAULT_EXCERPT_SETTINGS,
      ...(data[XTOC_STORAGE_KEYS.settings] || {})
    }
  };
}

function isDuplicateExcerpt(excerpts, articleId, text) {
  return Object.values(excerpts).some(
    (excerpt) => excerpt.articleId === articleId && excerpt.text === text
  );
}

function getSelectionContext(article, selectedText, contextLength) {
  const articleText = article?.textContent || '';
  const index = articleText.indexOf(selectedText);

  if (index === -1) {
    return {
      contextBefore: '',
      contextAfter: ''
    };
  }

  return {
    contextBefore: articleText.slice(Math.max(0, index - contextLength), index).trim(),
    contextAfter: articleText
      .slice(index + selectedText.length, index + selectedText.length + contextLength)
      .trim()
  };
}

async function saveExcerptToStorage(selectedText) {
  const articleElement = xtocCurrentSelection?.articleElement || findArticleContainer();
  const article = extractArticleMetadata(articleElement);
  const { articles, excerpts, settings } = await getStorageData();

  if (isDuplicateExcerpt(excerpts, article.id, selectedText)) {
    return { duplicate: true };
  }

  const existingArticle = articles[article.id];
  const nextArticle = {
    ...article,
    createdAt: existingArticle?.createdAt || article.createdAt,
    updatedAt: new Date().toISOString()
  };

  const excerptId = `excerpt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const context = getSelectionContext(articleElement, selectedText, settings.contextLength);
  const excerpt = {
    id: excerptId,
    articleId: article.id,
    text: selectedText,
    contextBefore: context.contextBefore,
    contextAfter: context.contextAfter,
    pageUrl: window.location.href,
    selectionLength: selectedText.length,
    createdAt: new Date().toISOString(),
    source: window.location.hostname
  };

  const result = await chrome.runtime.sendMessage({
    action: 'library:saveClip',
    payload: { article: nextArticle, clip: excerpt }
  });
  if (!result?.ok) throw new Error(result?.error || 'Could not save excerpt.');
  return result.data;
}

function createSaveExcerptButton() {
  if (xtocSaveButton) return xtocSaveButton;

  xtocSaveButton = document.createElement('button');
  xtocSaveButton.id = 'xtoc-save-excerpt-button';
  xtocSaveButton.type = 'button';
  xtocSaveButton.textContent = 'save to xtoc';
  xtocSaveButton.dataset.state = 'idle';
  xtocSaveButton.setAttribute('aria-live', 'polite');
  xtocSaveButton.style.display = 'none';

  xtocSaveButton.addEventListener('mousedown', (event) => {
    event.preventDefault();
  });

  xtocSaveButton.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const selectedText = xtocCurrentSelection?.text;
    if (!selectedText) return;

    xtocSaveButton.dataset.state = 'saving';
    xtocSaveButton.disabled = true;
    xtocSaveButton.classList.add('xtoc-saving');
    xtocSaveButton.textContent = 'saving…';

    try {
      const result = await saveExcerptToStorage(selectedText);
      if (xtocSaveButton.dataset.state !== 'saving') return;

      xtocSaveButton.dataset.state = result.duplicate ? 'duplicate' : 'saved';
      xtocSaveButton.classList.remove('xtoc-saving');
      xtocSaveButton.classList.toggle('xtoc-duplicate', result.duplicate);
      xtocSaveButton.classList.toggle('xtoc-saved', !result.duplicate);
      xtocSaveButton.textContent = result.duplicate ? 'already saved' : 'saved ✓';

      if (!result.duplicate) {
        createSaveCelebration(xtocSaveButton);
      }

      setTimeout(() => {
        hideSaveExcerptButton();
        window.getSelection()?.removeAllRanges();
      }, 1200);
    } catch (error) {
      console.error('[TOC] Failed to save excerpt:', error);
      if (xtocSaveButton.dataset.state !== 'saving') return;

      xtocSaveButton.dataset.state = 'error';
      xtocSaveButton.classList.remove('xtoc-saving');
      xtocSaveButton.textContent = 'save failed';
      setTimeout(hideSaveExcerptButton, 1400);
    }
  });

  document.body.appendChild(xtocSaveButton);
  return xtocSaveButton;
}

function createSaveCelebration(button) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const rect = button.getBoundingClientRect();
  const celebration = document.createElement('span');
  celebration.className = 'xtoc-save-celebration';
  celebration.setAttribute('aria-hidden', 'true');
  celebration.style.left = `${rect.left + rect.width / 2}px`;
  celebration.style.top = `${rect.top + rect.height / 2}px`;

  for (let index = 0; index < 8; index += 1) {
    const particle = document.createElement('span');
    particle.className = 'xtoc-confetti-particle';
    celebration.appendChild(particle);
  }

  document.body.appendChild(celebration);
  setTimeout(() => celebration.remove(), 760);
}

function hideSaveExcerptButton() {
  if (!xtocSaveButton) return;

  xtocSaveButton.style.display = 'none';
  xtocSaveButton.style.width = '';
  xtocSaveButton.disabled = false;
  xtocSaveButton.dataset.state = 'idle';
  xtocSaveButton.textContent = 'save to xtoc';
  xtocSaveButton.classList.remove('xtoc-saving', 'xtoc-saved', 'xtoc-duplicate');
  xtocCurrentSelection = null;
}

function showSaveExcerptButton(range, text) {
  const rect = range.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) {
    hideSaveExcerptButton();
    return;
  }

  const button = createSaveExcerptButton();
  if (button.dataset.state !== 'idle') return;

  button.style.width = '';
  button.style.display = 'flex';
  button.disabled = false;
  button.textContent = 'save to xtoc';
  button.classList.remove('xtoc-saving', 'xtoc-saved', 'xtoc-duplicate');

  const buttonRect = button.getBoundingClientRect();
  button.style.width = `${Math.ceil(buttonRect.width)}px`;
  const gap = 8;
  const top =
    rect.top > buttonRect.height + gap ? rect.top - buttonRect.height - gap : rect.bottom + gap;
  const left = rect.left + rect.width / 2 - buttonRect.width / 2;

  button.style.top = `${Math.max(8, Math.min(top, window.innerHeight - buttonRect.height - 8))}px`;
  button.style.left = `${Math.max(8, Math.min(left, window.innerWidth - buttonRect.width - 8))}px`;

  xtocCurrentSelection = {
    text,
    range,
    articleElement: findArticleContainerForElement(range.commonAncestorContainer)
  };
}

function findArticleContainerForElement(element) {
  const parentElement = element.nodeType === Node.ELEMENT_NODE ? element : element.parentElement;
  return (
    parentElement?.closest?.('article') ||
    parentElement?.closest?.('[data-testid="twitterArticleReadView"]') ||
    findArticleContainer()
  );
}

function getSelectedArticleRange() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

  const selectedText = selection.toString().trim();
  if (selectedText.length < 6) return null;

  const range = selection.getRangeAt(0);
  const commonAncestor =
    range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;

  if (isExtensionElement(commonAncestor)) return null;

  const article = findArticleContainer();
  const readView = document.querySelector('[data-testid="twitterArticleReadView"]');
  const isInArticle = article?.contains(commonAncestor);
  const isInReadView = readView?.contains(commonAncestor);
  if ((article || readView) && !isInArticle && !isInReadView) return null;

  return { range, text: selectedText };
}

function updateExcerptSelection() {
  if (xtocSaveButton?.dataset.state && xtocSaveButton.dataset.state !== 'idle') return;

  const selectedRange = getSelectedArticleRange();
  if (!selectedRange) {
    hideSaveExcerptButton();
    return;
  }

  showSaveExcerptButton(selectedRange.range, selectedRange.text);
}

function scheduleSelectionUpdate() {
  clearTimeout(xtocSelectionTimeout);
  xtocSelectionTimeout = setTimeout(updateExcerptSelection, 60);
}

export function handleExcerptRouteChange() {
  if (window.location.href === xtocLastUrl) return;
  xtocLastUrl = window.location.href;
  hideSaveExcerptButton();
  window.getSelection()?.removeAllRanges();
}

// options.getTocTitle: () => the article title found while building the TOC, if any.
export function initExcerptFeature(options = {}) {
  if (xtocExcerptFeatureInitialized) return;
  getTocTitle = options.getTocTitle || (() => null);
  xtocExcerptFeatureInitialized = true;
  xtocExcerptAbortController = new AbortController();
  const listenerOptions = { signal: xtocExcerptAbortController.signal };

  createSaveExcerptButton();

  document.addEventListener('mouseup', scheduleSelectionUpdate, listenerOptions);
  document.addEventListener('selectionchange', scheduleSelectionUpdate, listenerOptions);
  document.addEventListener(
    'keyup',
    (event) => {
      if (event.key === 'Shift' || event.key.startsWith('Arrow')) {
        scheduleSelectionUpdate();
      }
    },
    listenerOptions
  );
  document.addEventListener(
    'mousedown',
    (event) => {
      if (!isExtensionElement(event.target)) {
        hideSaveExcerptButton();
      }
    },
    listenerOptions
  );
  window.addEventListener('scroll', hideSaveExcerptButton, {
    ...listenerOptions,
    capture: true
  });
}

export function destroyExcerptFeature() {
  xtocExcerptAbortController?.abort();
  xtocExcerptAbortController = null;
  hideSaveExcerptButton();
  xtocSaveButton?.remove();
  xtocSaveButton = null;
  xtocExcerptFeatureInitialized = false;
}
