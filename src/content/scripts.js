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

function isExtensionElement(element) {
  return Boolean(
    element?.closest?.('#twitter-toc-panel') ||
    element?.closest?.('#xtoc-save-excerpt-button')
  );
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
  xtocSaveButton.style.display = 'none';

  xtocSaveButton.addEventListener('mousedown', (event) => {
    event.preventDefault();
  });

  xtocSaveButton.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const selectedText = xtocCurrentSelection?.text;
    if (!selectedText) return;

    xtocSaveButton.disabled = true;

    try {
      const result = await saveExcerptToStorage(selectedText);
      xtocSaveButton.classList.toggle('xtoc-duplicate', result.duplicate);
      xtocSaveButton.classList.toggle('xtoc-saved', !result.duplicate);
      xtocSaveButton.textContent = result.duplicate ? 'already saved' : 'saved';

      setTimeout(() => {
        hideSaveExcerptButton();
        window.getSelection()?.removeAllRanges();
      }, 900);
    } catch (error) {
      console.error('[TOC] Failed to save excerpt:', error);
      xtocSaveButton.textContent = 'save failed';
      setTimeout(hideSaveExcerptButton, 1200);
    }
  });

  document.body.appendChild(xtocSaveButton);
  return xtocSaveButton;
}

function hideSaveExcerptButton() {
  if (!xtocSaveButton) return;

  xtocSaveButton.style.display = 'none';
  xtocSaveButton.disabled = false;
  xtocSaveButton.textContent = 'save to xtoc';
  xtocSaveButton.classList.remove('xtoc-saved', 'xtoc-duplicate');
  xtocCurrentSelection = null;
}

function showSaveExcerptButton(range, text) {
  const rect = range.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) {
    hideSaveExcerptButton();
    return;
  }

  const button = createSaveExcerptButton();
  button.style.display = 'block';
  button.disabled = false;
  button.textContent = 'save to xtoc';
  button.classList.remove('xtoc-saved', 'xtoc-duplicate');

  const buttonRect = button.getBoundingClientRect();
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
    this.handleScroll = () => {
      if (this.scrollFrame) return;
      this.scrollFrame = requestAnimationFrame(() => {
        this.scrollFrame = null;
        this.updateActiveSection();
      });
    };
    this.handleResize = () => this.keepInViewport();
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
      this.panel.remove();
    }

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
      <span class="panel-title"><span class="panel-brand">X-TOC</span><span aria-hidden="true"> · </span>Contents</span>
      <span class="panel-actions">
        <button class="collapse-btn" type="button" title="Collapse panel" aria-label="Collapse table of contents" aria-expanded="true">
          <span aria-hidden="true">−</span>
        </button>
        <button class="close-btn" type="button" title="Hide panel" aria-label="Hide table of contents">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M14 1.41L12.59 0 7 5.59 1.41 0 0 1.41 5.59 7 0 12.59 1.41 14 7 8.41 12.59 14 14 12.59 8.41 7z"/>
          </svg>
        </button>
      </span>
    `;

    // Create body with TOC list
    const body = document.createElement('div');
    body.className = 'toc-panel-body';

    this.panel.appendChild(header);
    this.panel.appendChild(body);

    document.body.appendChild(this.panel);

    // Add event listeners
    this.setupEventListeners(header);
  }

  setupEventListeners(header) {
    const collapseBtn = header.querySelector('.collapse-btn');
    const closeBtn = header.querySelector('.close-btn');

    // Drag functionality
    header.addEventListener('mousedown', (event) => {
      if (!event.target.closest('button')) this.startDrag(event);
    });
    document.addEventListener('mousemove', (e) => this.drag(e));
    document.addEventListener('mouseup', () => this.endDrag());

    // Close button
    collapseBtn.addEventListener('click', () => this.toggleCollapsed(collapseBtn));
    closeBtn.addEventListener('click', () => this.hide());
    this.panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.hide();
    });
    window.addEventListener('resize', this.handleResize);
  }

  toggleCollapsed(button) {
    this.isCollapsed = !this.isCollapsed;
    this.panel.classList.toggle('collapsed', this.isCollapsed);
    button.setAttribute('aria-expanded', String(!this.isCollapsed));
    button.setAttribute('aria-label', this.isCollapsed ? 'Expand table of contents' : 'Collapse table of contents');
    button.setAttribute('title', this.isCollapsed ? 'Expand panel' : 'Collapse panel');
    button.querySelector('span').textContent = this.isCollapsed ? '+' : '−';
    this.keepInViewport();
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
    chrome.storage.local.set({ tocPanelPosition: this.position });
  }

  show(toc) {
    if (!this.panel) {
      this.create();
    }

    // Update TOC content
    const body = this.panel.querySelector('.toc-panel-body');
    this.activeIndex = -1;
    body.innerHTML = this.renderTOC(toc);
    if (!this.hasSavedPosition) {
      this.position = this.getArticleSidePosition();
      this.panel.style.left = `${this.position.x}px`;
      this.panel.style.top = `${this.position.y}px`;
    }
    this.panel.style.display = 'flex';
    this.isVisible = true;
    this.keepInViewport();

    // Add click handlers to TOC items
    body.querySelectorAll('.toc-item').forEach((item, index) => {
      item.addEventListener('click', () => {
        scrollToHeader(index);
        this.setActiveIndex(index);
      });
    });
    window.addEventListener('scroll', this.handleScroll, { passive: true });
    this.updateActiveSection();
  }

  getArticleSidePosition() {
    const panelWidth = Math.min(560, Math.max(340, window.innerWidth * 0.34));
    const articleRect = findArticleContainer()?.getBoundingClientRect();
    const preferredX = articleRect ? articleRect.right + 18 : window.innerWidth - panelWidth - 20;
    const x = Math.max(10, Math.min(preferredX, window.innerWidth - panelWidth - 10));
    const y = Math.max(72, Math.min(articleRect?.top || 100, window.innerHeight - 180));
    return { x, y };
  }

  updateActiveSection() {
    if (!this.isVisible || headerElements.length === 0) return;
    const readingLine = 96;
    let nextIndex = 0;

    headerElements.forEach((header, index) => {
      if (header.element?.getBoundingClientRect().top <= readingLine) nextIndex = index;
    });

    this.setActiveIndex(nextIndex);
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
        item.scrollIntoView({ block: 'nearest' });
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
    chrome.storage.local.set({ tocPanelVisible: false });
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
      chrome.storage.local.set({ tocPanelVisible: true });
    }
  }

  destroy() {
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    }
    window.removeEventListener('scroll', this.handleScroll);
    window.removeEventListener('resize', this.handleResize);
    if (this.scrollFrame) cancelAnimationFrame(this.scrollFrame);
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
    // Calculate scroll position with offset for Twitter's fixed header (approx 60px)
    const offset = 70;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const targetScroll = rect.top + scrollTop - offset;

    window.scrollTo({
      top: targetScroll,
      behavior: 'smooth'
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
    clearTimeout(window.tocExtractTimeout);
    window.tocExtractTimeout = setTimeout(() => {
      tocData = extractTOC();
      if (tocPanel.isVisible) {
        tocPanel.show(tocData);
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
