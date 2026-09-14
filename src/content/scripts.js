import {
  areTocEntriesEqual,
  clampScrollTarget,
  getActiveSectionIndex,
  hasReachedScrollTarget
} from './navigation-utils.js';

// Content script for extracting TOC from Twitter/X articles

let tocData = [];
let headerElements = [];
let tocPanel = null;
let xtocExcerptFeatureInitialized = false;
let xtocSaveButton = null;
let xtocCurrentSelection = null;
let xtocLastUrl = window.location.href;
let xtocSelectionTimeout = null;
let xtocExcerptAbortController = null;

const XTOC_STORAGE_KEYS = {
  articles: 'twitterTocArticles',
  excerpts: 'twitterTocExcerpts',
  settings: 'twitterTocExcerptSettings'
};

const DEFAULT_EXCERPT_SETTINGS = {
  contextLength: 80,
  defaultExportFormat: 'markdown'
};

const TOC_SCROLL_OFFSET = 70;
const TOC_READING_LINE = 96;
const TOC_NAVIGATION_TIMEOUT = 2500;
const TOC_NAVIGATION_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  ' '
]);

function isExtensionElement(element) {
  return Boolean(
    element?.closest?.('#twitter-toc-panel') ||
    element?.closest?.('#xtoc-save-excerpt-button')
  );
}

function isExtensionMutation(mutation) {
  const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
  if (changedNodes.length === 0) return isExtensionElement(mutation.target);

  return changedNodes.every((node) => {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return isExtensionElement(element);
  });
}

function isExtensionContextAvailable() {
  try {
    return Boolean(globalThis.chrome?.runtime?.id);
  } catch {
    return false;
  }
}

function isExtensionContextError(error) {
  return /extension context invalidated/i.test(error?.message || '');
}

function getCanonicalUrl() {
  const currentUrl = `${window.location.origin}${window.location.pathname}`;
  if (getStatusId(currentUrl)) {
    return currentUrl;
  }

  const canonicalLink = document.querySelector('link[rel="canonical"]');
  if (canonicalLink?.href && getStatusId(canonicalLink.href)) {
    return canonicalLink.href.split('?')[0].split('#')[0];
  }

  return currentUrl;
}

function getStatusId(url = getCanonicalUrl()) {
  const match = url.match(/\/status(?:es)?\/(\d+)/);
  return match ? match[1] : null;
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function getArticleId(canonicalUrl) {
  const statusId = getStatusId(canonicalUrl);
  return statusId ? `article_${statusId}` : `article_${hashString(canonicalUrl)}`;
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function escapeTocHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

  const tocTitle = tocData.find((item) => item.level === 1)?.text || headerElements[0]?.text;
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
    id: getArticleId(canonicalUrl),
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
  return Object.values(excerpts).some((excerpt) => (
    excerpt.articleId === articleId &&
    excerpt.text === text
  ));
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
    contextAfter: articleText.slice(index + selectedText.length, index + selectedText.length + contextLength).trim()
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

  await chrome.storage.local.set({
    [XTOC_STORAGE_KEYS.articles]: {
      ...articles,
      [article.id]: nextArticle
    },
    [XTOC_STORAGE_KEYS.excerpts]: {
      ...excerpts,
      [excerpt.id]: excerpt
    },
    [XTOC_STORAGE_KEYS.settings]: settings
  });

  return { duplicate: false, article: nextArticle, excerpt };
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
  celebration.style.left = `${rect.left + (rect.width / 2)}px`;
  celebration.style.top = `${rect.top + (rect.height / 2)}px`;

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
  const top = rect.top > buttonRect.height + gap
    ? rect.top - buttonRect.height - gap
    : rect.bottom + gap;
  const left = rect.left + (rect.width / 2) - (buttonRect.width / 2);

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
  return parentElement?.closest?.('article') ||
    parentElement?.closest?.('[data-testid="twitterArticleReadView"]') ||
    findArticleContainer();
}

function getSelectedArticleRange() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

  const selectedText = selection.toString().trim();
  if (selectedText.length < 6) return null;

  const range = selection.getRangeAt(0);
  const commonAncestor = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
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

function handleExcerptRouteChange() {
  if (window.location.href === xtocLastUrl) return;
  xtocLastUrl = window.location.href;
  hideSaveExcerptButton();
  window.getSelection()?.removeAllRanges();
}

function initExcerptFeature() {
  if (xtocExcerptFeatureInitialized) return;
  xtocExcerptFeatureInitialized = true;
  xtocExcerptAbortController = new AbortController();
  const listenerOptions = { signal: xtocExcerptAbortController.signal };

  createSaveExcerptButton();

  document.addEventListener('mouseup', scheduleSelectionUpdate, listenerOptions);
  document.addEventListener('selectionchange', scheduleSelectionUpdate, listenerOptions);
  document.addEventListener('keyup', (event) => {
    if (event.key === 'Shift' || event.key.startsWith('Arrow')) {
      scheduleSelectionUpdate();
    }
  }, listenerOptions);
  document.addEventListener('mousedown', (event) => {
    if (!isExtensionElement(event.target)) {
      hideSaveExcerptButton();
    }
  }, listenerOptions);
  window.addEventListener('scroll', hideSaveExcerptButton, {
    ...listenerOptions,
    capture: true
  });
}

function destroyExcerptFeature() {
  xtocExcerptAbortController?.abort();
  xtocExcerptAbortController = null;
  hideSaveExcerptButton();
  xtocSaveButton?.remove();
  xtocSaveButton = null;
  xtocExcerptFeatureInitialized = false;
}

// TOC Panel Class - manages floating pinnable panel
class TOCPanel {
  constructor() {
    this.panel = null;
    this.isVisible = false;
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    this.defaultPosition = { x: 20, y: 100 };
    this.hasSavedPosition = false;
    this.activeIndex = -1;
    this.isCollapsed = false;
    this.scrollFrame = null;
    this.navigationTargetIndex = null;
    this.navigationTargetScroll = null;
    this.navigationTimeout = null;
    this.collapseLayoutTimeout = null;
    this.layoutResizeObserver = null;
    this.layoutResizeFrame = null;
    this.layoutSignature = null;
    this.handleScroll = () => {
      if (this.scrollFrame) return;
      this.scrollFrame = requestAnimationFrame(() => {
        this.scrollFrame = null;
        if (this.navigationTargetIndex !== null) {
          if (hasReachedScrollTarget(window.scrollY, this.navigationTargetScroll)) {
            this.finishNavigation();
          } else {
            this.setActiveIndex(this.navigationTargetIndex);
          }
          return;
        }
        this.updateActiveSection();
      });
    };
    this.handleUserScrollIntent = (event) => {
      if (this.navigationTargetIndex === null) return;
      if (event.type === 'keydown' && !TOC_NAVIGATION_KEYS.has(event.key)) return;
      this.cancelNavigation();
    };
    this.handleResize = () => {
      this.syncCurtainHeight();
      this.keepInViewport();
    };
  }

  async init() {
    // Load saved position
    const storage = await chrome.storage.local.get('tocPanelPosition');
    this.hasSavedPosition = Boolean(storage.tocPanelPosition);
    this.position = storage.tocPanelPosition || this.defaultPosition;
    this.create();
  }

  create() {
    // Remove existing panel if any
    if (this.panel) {
      this.layoutResizeObserver?.disconnect();
      if (this.layoutResizeFrame) cancelAnimationFrame(this.layoutResizeFrame);
      this.panel.remove();
    }
    this.layoutResizeObserver = null;
    this.layoutResizeFrame = null;
    this.layoutSignature = null;

    // Create panel element
    this.panel = document.createElement('div');
    this.panel.id = 'twitter-toc-panel';
    this.panel.className = 'twitter-toc-panel';
    this.panel.setAttribute('role', 'complementary');
    this.panel.setAttribute('aria-label', 'X-TOC article contents');
    this.panel.style.cssText = `
      position: fixed;
      z-index: 999999;
      width: clamp(340px, 34vw, 560px);
      min-width: 320px;
      max-width: calc(100vw - 20px);
      max-height: 60vh;
      background: var(--bg-primary, #ffffff);
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      display: none;
      flex-direction: column;
      overflow: hidden;
      resize: horizontal;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    `;

    // Apply saved position
    this.panel.style.left = this.position.x + 'px';
    this.panel.style.top = this.position.y + 'px';

    // Create header with drag handle and close button
    const header = document.createElement('div');
    header.className = 'toc-panel-header';
    header.innerHTML = `
      <span class="drag-handle" title="Drag to move" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="6" r="1.5"/>
          <circle cx="15" cy="6" r="1.5"/>
          <circle cx="9" cy="12" r="1.5"/>
          <circle cx="15" cy="12" r="1.5"/>
          <circle cx="9" cy="18" r="1.5"/>
          <circle cx="15" cy="18" r="1.5"/>
        </svg>
      </span>
      <span class="panel-title"><span class="panel-brand">X-TOC</span><span class="panel-title-separator" aria-hidden="true"> · </span>Contents</span>
      <span class="panel-actions">
        <button class="clips-btn" type="button" title="Open clips" aria-label="Open clips">
          <svg class="panel-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
          <span class="clips-label">Clips</span>
        </button>
        <button class="collapse-btn" type="button" title="Collapse panel" aria-label="Collapse table of contents" aria-expanded="true">
          <svg class="panel-action-icon collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m6 15 6-6 6 6"/>
          </svg>
        </button>
        <button class="close-btn" type="button" title="Hide panel" aria-label="Hide table of contents">
          <svg class="panel-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
      </span>
    `;

    // Create body with TOC list
    const body = document.createElement('div');
    body.className = 'toc-panel-body';

    const curtain = document.createElement('div');
    curtain.className = 'toc-panel-curtain';
    const curtainInner = document.createElement('div');
    curtainInner.className = 'toc-panel-curtain-inner';
    curtainInner.appendChild(body);
    curtain.appendChild(curtainInner);

    this.panel.appendChild(header);
    this.panel.appendChild(curtain);

    document.body.appendChild(this.panel);

    // Add event listeners
    this.setupEventListeners(header);
    this.setupLayoutObserver(header, body);
  }

  setupLayoutObserver(header, body) {
    if (typeof ResizeObserver !== 'function') return;

    this.layoutResizeObserver = new ResizeObserver(() => {
      const panelWidth = Math.round(this.panel?.getBoundingClientRect().width || 0);
      const headerHeight = Math.round(header.getBoundingClientRect().height);
      const bodyHeight = Math.round(body.scrollHeight);
      const signature = `${panelWidth}:${headerHeight}:${bodyHeight}`;
      if (signature === this.layoutSignature) return;
      this.layoutSignature = signature;
      if (this.layoutResizeFrame) return;

      this.layoutResizeFrame = requestAnimationFrame(() => {
        this.layoutResizeFrame = null;
        this.syncCurtainHeight();
        this.keepInViewport();
      });
    });
    this.layoutResizeObserver.observe(this.panel);
    this.layoutResizeObserver.observe(header);
    this.layoutResizeObserver.observe(body);
  }

  setupEventListeners(header) {
    const clipsBtn = header.querySelector('.clips-btn');
    const collapseBtn = header.querySelector('.collapse-btn');
    const closeBtn = header.querySelector('.close-btn');

    // Drag functionality
    header.addEventListener('mousedown', (event) => {
      if (!event.target.closest('button')) this.startDrag(event);
    });
    document.addEventListener('mousemove', (e) => this.drag(e));
    document.addEventListener('mouseup', () => this.endDrag());

    clipsBtn.addEventListener('click', () => this.openClips());
    collapseBtn.addEventListener('click', () => this.toggleCollapsed(collapseBtn));
    closeBtn.addEventListener('click', () => this.hide());
    this.panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.hide();
    });
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('wheel', this.handleUserScrollIntent, { passive: true });
    window.addEventListener('touchstart', this.handleUserScrollIntent, { passive: true });
    window.addEventListener('keydown', this.handleUserScrollIntent);
  }

  toggleCollapsed(button) {
    this.setCollapsed(!this.isCollapsed, button);
    this.keepInViewport();
    clearTimeout(this.collapseLayoutTimeout);
    this.collapseLayoutTimeout = setTimeout(() => this.keepInViewport(), 280);
  }

  syncCurtainHeight() {
    const curtain = this.panel?.querySelector('.toc-panel-curtain');
    const body = this.panel?.querySelector('.toc-panel-body');
    const header = this.panel?.querySelector('.toc-panel-header');
    if (!curtain || !body || !header) return;

    const availableHeight = Math.max(0, window.innerHeight * 0.6 - header.getBoundingClientRect().height);
    const expandedHeight = Math.min(body.scrollHeight, availableHeight);
    curtain.style.setProperty('--toc-curtain-height', `${expandedHeight}px`);
  }

  setCollapsed(isCollapsed, button = this.panel?.querySelector('.collapse-btn')) {
    this.isCollapsed = isCollapsed;
    this.syncCurtainHeight();
    this.panel?.classList.toggle('collapsed', isCollapsed);
    const body = this.panel?.querySelector('.toc-panel-body');
    const curtain = this.panel?.querySelector('.toc-panel-curtain');
    body?.toggleAttribute('inert', isCollapsed);
    curtain?.setAttribute('aria-hidden', String(isCollapsed));
    if (!button) return;

    button.setAttribute('aria-expanded', String(!isCollapsed));
    button.setAttribute('aria-label', isCollapsed ? 'Expand table of contents' : 'Collapse table of contents');
    button.setAttribute('title', isCollapsed ? 'Expand panel' : 'Collapse panel');
  }

  openClips() {
    if (!isExtensionContextAvailable()) {
      this.showReconnectMessage();
      return;
    }

    try {
      const pendingMessage = chrome.runtime.sendMessage({ action: 'openClips' });
      pendingMessage?.catch((error) => this.handleExtensionError(error));
    } catch (error) {
      this.handleExtensionError(error);
    }
  }

  persistLocalState(values) {
    if (!isExtensionContextAvailable()) {
      this.showReconnectMessage();
      return;
    }

    try {
      const pendingWrite = chrome.storage.local.set(values);
      pendingWrite?.catch((error) => this.handleExtensionError(error));
    } catch (error) {
      this.handleExtensionError(error);
    }
  }

  handleExtensionError(error) {
    if (isExtensionContextError(error) || !isExtensionContextAvailable()) {
      this.showReconnectMessage();
      return;
    }

    console.error('[X-TOC] Extension action failed:', error);
  }

  showReconnectMessage() {
    const title = this.panel?.querySelector('.panel-title');
    const clipsButton = this.panel?.querySelector('.clips-btn');
    if (title) {
      title.textContent = 'Reload page to reconnect X-TOC';
      title.classList.add('context-invalid');
    }
    if (clipsButton) {
      clipsButton.disabled = true;
      clipsButton.setAttribute('title', 'Reload this page to reconnect X-TOC');
      clipsButton.setAttribute('aria-label', 'Reload this page to reconnect X-TOC');
    }
  }

  startDrag(e) {
    this.isDragging = true;
    const rect = this.panel.getBoundingClientRect();
    this.dragOffset.x = e.clientX - rect.left;
    this.dragOffset.y = e.clientY - rect.top;
    this.panel.classList.add('dragging');
    e.preventDefault();
  }

  drag(e) {
    if (!this.isDragging) return;

    let newX = e.clientX - this.dragOffset.x;
    let newY = e.clientY - this.dragOffset.y;

    // Keep within viewport bounds
    const maxX = window.innerWidth - this.panel.offsetWidth - 10;
    const maxY = window.innerHeight - this.panel.offsetHeight - 10;
    newX = Math.max(10, Math.min(newX, maxX));
    newY = Math.max(10, Math.min(newY, maxY));

    this.panel.style.left = newX + 'px';
    this.panel.style.top = newY + 'px';
  }

  endDrag() {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.panel.classList.remove('dragging');

    // Save position
    this.position = {
      x: parseInt(this.panel.style.left),
      y: parseInt(this.panel.style.top)
    };
    this.hasSavedPosition = true;
    this.persistLocalState({ tocPanelPosition: this.position });
  }

  show(toc) {
    if (!this.panel) {
      this.create();
    }

    // Update TOC content
    const body = this.panel.querySelector('.toc-panel-body');
    this.clearNavigation();
    this.activeIndex = -1;
    body.innerHTML = this.renderTOC(toc);
    if (!this.hasSavedPosition) {
      const placement = this.getArticleSidePlacement();
      this.position = { x: placement.x, y: placement.y };
      this.panel.style.width = `${placement.width}px`;
      this.panel.style.left = `${this.position.x}px`;
      this.panel.style.top = `${this.position.y}px`;
      this.setCollapsed(placement.collapsed);
    }
    this.panel.style.display = 'flex';
    this.syncCurtainHeight();
    this.isVisible = true;
    this.keepInViewport();

    // Add click handlers to TOC items
    body.querySelectorAll('.toc-item').forEach((item, index) => {
      item.addEventListener('click', () => {
        scrollToHeader(index);
      });
    });
    window.addEventListener('scroll', this.handleScroll, { passive: true });
    this.updateActiveSection();
  }

  getArticleSidePlacement() {
    const viewportPadding = 10;
    const articleGap = 18;
    const minimumExpandedWidth = 320;
    const preferredWidth = Math.min(560, Math.max(340, window.innerWidth * 0.34));
    const articleRect = findArticleContainer()?.getBoundingClientRect();
    const availableRight = articleRect
      ? window.innerWidth - articleRect.right - articleGap - viewportPadding
      : preferredWidth;
    const hasExpandedSpace = availableRight >= minimumExpandedWidth;
    const width = hasExpandedSpace ? Math.min(preferredWidth, availableRight) : preferredWidth;
    const preferredX = articleRect ? articleRect.right + articleGap : window.innerWidth - width - 20;
    const x = Math.max(viewportPadding, Math.min(preferredX, window.innerWidth - width - viewportPadding));
    const y = Math.max(72, Math.min(articleRect?.top || 100, window.innerHeight - 180));
    return { x, y, width, collapsed: !hasExpandedSpace };
  }

  updateActiveSection() {
    if (!this.isVisible || headerElements.length === 0) return;
    const headerTops = headerElements.map((header) => (
      header.element?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY
    ));
    const isAtPageEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
    const nextIndex = getActiveSectionIndex(headerTops, TOC_READING_LINE, isAtPageEnd);
    this.setActiveIndex(nextIndex);
  }

  startNavigation(index, targetScroll) {
    this.clearNavigation();
    this.navigationTargetIndex = index;
    this.navigationTargetScroll = targetScroll;
    this.setActiveIndex(index);
    this.navigationTimeout = setTimeout(() => this.finishNavigation(), TOC_NAVIGATION_TIMEOUT);
  }

  finishNavigation() {
    if (this.navigationTargetIndex === null) return;
    this.clearNavigation();
    this.updateActiveSection();
  }

  clearNavigation() {
    clearTimeout(this.navigationTimeout);
    this.navigationTimeout = null;
    this.navigationTargetIndex = null;
    this.navigationTargetScroll = null;
  }

  cancelNavigation() {
    this.finishNavigation();
  }

  setActiveIndex(index) {
    if (this.activeIndex === index) return;
    this.activeIndex = index;
    const items = this.panel?.querySelectorAll('.toc-item') || [];
    items.forEach((item, itemIndex) => {
      const isActive = itemIndex === index;
      item.classList.toggle('active', isActive);
      if (isActive) {
        item.setAttribute('aria-current', 'location');
        const body = this.panel?.querySelector('.toc-panel-body');
        const itemRect = item.getBoundingClientRect();
        const bodyRect = body?.getBoundingClientRect();
        if (body && bodyRect && itemRect.top < bodyRect.top) {
          body.scrollTop -= bodyRect.top - itemRect.top;
        } else if (body && bodyRect && itemRect.bottom > bodyRect.bottom) {
          body.scrollTop += itemRect.bottom - bodyRect.bottom;
        }
      } else {
        item.removeAttribute('aria-current');
      }
    });
  }

  renderTOC(toc) {
    if (!toc || toc.length === 0) {
      return '<div class="toc-empty">No sections found</div>';
    }

    return `
      <ul class="toc-list">
        ${toc.map((item, index) => `
          <li class="toc-row level-${item.level}">
            <button class="toc-item" type="button" data-index="${index}">${escapeTocHtml(item.text)}</button>
          </li>
        `).join('')}
      </ul>
    `;
  }

  hide() {
    if (this.panel) {
      this.panel.style.display = 'none';
    }
    this.isVisible = false;
    window.removeEventListener('scroll', this.handleScroll);
    this.clearNavigation();
    this.persistLocalState({ tocPanelVisible: false });
  }

  keepInViewport() {
    if (!this.panel || !this.isVisible) return;
    const rect = this.panel.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - 10;
    const maxY = window.innerHeight - rect.height - 10;
    const nextX = Math.max(10, Math.min(rect.left, maxX));
    const nextY = Math.max(10, Math.min(rect.top, maxY));

    this.panel.style.left = nextX + 'px';
    this.panel.style.top = nextY + 'px';
  }

  toggle(toc) {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show(toc);
      this.persistLocalState({ tocPanelVisible: true });
    }
  }

  destroy() {
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    }
    window.removeEventListener('scroll', this.handleScroll);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('wheel', this.handleUserScrollIntent);
    window.removeEventListener('touchstart', this.handleUserScrollIntent);
    window.removeEventListener('keydown', this.handleUserScrollIntent);
    if (this.scrollFrame) cancelAnimationFrame(this.scrollFrame);
    if (this.layoutResizeFrame) cancelAnimationFrame(this.layoutResizeFrame);
    this.layoutResizeObserver?.disconnect();
    this.layoutResizeFrame = null;
    this.layoutResizeObserver = null;
    this.layoutSignature = null;
    clearTimeout(this.collapseLayoutTimeout);
    this.clearNavigation();
  }
}

// Get heading level from element (handles Twitter/X custom classes)
function getHeaderLevel(header) {
  if (header.classList.contains('longform-header-one')) return 2;
  if (header.classList.contains('longform-header-two')) return 3;
  if (header.classList.contains('longform-header-three')) return 4;
  // Fallback for standard h2-h6
  return parseInt(header.tagName.charAt(1));
}

// Find the article container (handles both regular tweet and fullscreen article views)
function findArticleContainer() {
  // Try regular tweet article first
  let container = document.querySelector('article');
  if (container) return container;

  // Try fullscreen article view: data-testid="twitterArticleReadView"
  container = document.querySelector('[data-testid="twitterArticleReadView"]');
  if (container) return container;

  // Try main element as last resort
  container = document.querySelector('main[role="main"]');
  if (container) return container;

  return null;
}

// Extract headers from the article
function extractTOC() {
  const article = findArticleContainer();

  if (!article) {
    console.log('[TOC] No article container found');
    return [];
  }

  const toc = [];
  headerElements = [];

  console.log('[TOC] Article found, extracting headers...');

  // First, try to find the article title using data-testid="twitter-article-title"
  let titleText = null;
  let titleElement = document.querySelector('[data-testid="twitter-article-title"]');

  // If not found, try h1 outside of nav/header/footer
  if (!titleElement) {
    const h1Elements = document.querySelectorAll('h1');
    for (const h1 of h1Elements) {
      if (!h1.closest('nav') && !h1.closest('footer') && !h1.closest('header')) {
        const text = h1.textContent?.trim();
        if (text && text.length >= 2 && !/^\d+$/.test(text) && text.length < 200) {
          titleElement = h1;
          break;
        }
      }
    }
  }

  // Get the text from the title element
  if (titleElement) {
    titleText = titleElement.textContent?.trim();
  }

  // Add article title as level 1 if found
  if (titleText && titleText.length >= 2 && !/^\d+$/.test(titleText)) {
    headerElements.push({
      id: 'toc-header-title',
      element: titleElement,
      text: titleText,
      level: 1
    });
    toc.push({
      id: 'toc-header-title',
      text: titleText,
      level: 1
    });
  }

  // Get all other headers (h2-h6) from the article
  const headers = article.querySelectorAll('.longform-header-one, .longform-header-two, .longform-header-three, h2, h3, h4, h5, h6');
  console.log(`[TOC] Found ${headers.length} headers`);

  headers.forEach((header, index) => {
    if (header.closest('nav') || header.closest('footer') || header.closest('header')) {
      return;
    }

    const text = header.textContent?.trim();

    if (!text || text.length < 2) {
      return;
    }

    if (/^\d+$/.test(text)) {
      return;
    }

    const level = getHeaderLevel(header);
    const id = `toc-header-${index}`;

    headerElements.push({
      id,
      element: header,
      text,
      level
    });

    toc.push({
      id,
      text,
      level
    });
  });

  console.log('[TOC] Extracted TOC:', toc);
  return toc;
}

// Scroll to specific header by index
function scrollToHeader(index) {
  const header = headerElements[index];
  if (header && header.element) {
    // Get the element's position
    const rect = header.element.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const maximumScroll = document.documentElement.scrollHeight - window.innerHeight;
    const targetScroll = clampScrollTarget(
      rect.top + scrollTop - TOC_SCROLL_OFFSET,
      maximumScroll
    );

    if (tocPanel?.isVisible) tocPanel.startNavigation(index, targetScroll);

    window.scrollTo({
      top: targetScroll,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });

    header.element.style.transition = 'background-color 0.3s ease';
    header.element.style.backgroundColor = 'rgba(29, 155, 240, 0.2)';

    setTimeout(() => {
      header.element.style.backgroundColor = '';
    }, 2000);
  }
}

// Initialize
async function init() {
  // Wait for page to fully load
  setTimeout(() => {
    tocData = extractTOC();
  }, 1500);

  // Initialize TOC Panel
  tocPanel = new TOCPanel();
  await tocPanel.init();
  initExcerptFeature();

  // Check if panel was visible before
  const storage = await chrome.storage.local.get('tocPanelVisible');
  if (storage.tocPanelVisible && tocData.length > 0) {
    tocPanel.show(tocData);
  }

  // Watch for dynamic content (SPA navigation)
  const observer = new MutationObserver((mutations) => {
    handleExcerptRouteChange();
    if (mutations.every(isExtensionMutation)) return;
    clearTimeout(window.tocExtractTimeout);
    window.tocExtractTimeout = setTimeout(() => {
      const nextToc = extractTOC();
      const tocChanged = !areTocEntriesEqual(tocData, nextToc);
      tocData = nextToc;
      if (tocPanel.isVisible && tocChanged) {
        tocPanel.show(nextToc);
      }
    }, 1000);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getTOC') {
    tocData = extractTOC();
    sendResponse({ toc: tocData, isPanelVisible: tocPanel?.isVisible || false });
  } else if (message.action === 'scrollTo') {
    scrollToHeader(message.index);
    sendResponse({ success: true });
  } else if (message.action === 'togglePanel') {
    tocData = extractTOC();
    tocPanel.toggle(tocData);
    sendResponse({ isVisible: tocPanel.isVisible });
  } else if (message.action === 'showPanel') {
    tocData = extractTOC();
    tocPanel.show(tocData);
    sendResponse({ isVisible: true });
  } else if (message.action === 'hidePanel') {
    tocPanel.hide();
    sendResponse({ isVisible: false });
  }

  return true;
});

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Export for Extension.js hot reload
export default function main() {
  return () => {
    if (tocPanel) {
      tocPanel.destroy();
    }
    destroyExcerptFeature();
  };
}
