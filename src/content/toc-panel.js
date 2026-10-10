// Floating, draggable table-of-contents panel pinned beside the article.
import { getActiveSectionIndex, hasReachedScrollTarget } from './navigation-utils.js';
import {
  findArticleContainer,
  isExtensionContextAvailable,
  isExtensionContextError
} from './page-utils.js';

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

function escapeTocHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// TOC Panel Class - manages floating pinnable panel
export class TOCPanel {
  // getHeaders: () => the current heading elements; onSelect: (index) => scroll to one.
  constructor({ getHeaders, onSelect }) {
    this.getHeaders = getHeaders;
    this.onSelect = onSelect;
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
    this.panel.setAttribute('aria-label', 'XTOC article contents');
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
      <span class="panel-title"><span class="panel-brand">XTOC</span><span class="panel-title-separator" aria-hidden="true"> · </span>Contents</span>
      <span class="panel-actions">
        <button class="clips-btn" type="button" title="Open clips" aria-label="Open clips">
          <svg class="panel-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
          <span class="clips-label">Library</span>
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

    const availableHeight = Math.max(
      0,
      window.innerHeight * 0.6 - header.getBoundingClientRect().height
    );
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
    button.setAttribute(
      'aria-label',
      isCollapsed ? 'Expand table of contents' : 'Collapse table of contents'
    );
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

    console.error('[XTOC] Extension action failed:', error);
  }

  showReconnectMessage() {
    const title = this.panel?.querySelector('.panel-title');
    const clipsButton = this.panel?.querySelector('.clips-btn');
    if (title) {
      title.textContent = 'Reload page to reconnect XTOC';
      title.classList.add('context-invalid');
    }
    if (clipsButton) {
      clipsButton.disabled = true;
      clipsButton.setAttribute('title', 'Reload this page to reconnect XTOC');
      clipsButton.setAttribute('aria-label', 'Reload this page to reconnect XTOC');
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
        this.onSelect(index);
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
    const preferredX = articleRect
      ? articleRect.right + articleGap
      : window.innerWidth - width - 20;
    const x = Math.max(
      viewportPadding,
      Math.min(preferredX, window.innerWidth - width - viewportPadding)
    );
    const y = Math.max(72, Math.min(articleRect?.top || 100, window.innerHeight - 180));
    return { x, y, width, collapsed: !hasExpandedSpace };
  }

  updateActiveSection() {
    const headerElements = this.getHeaders();
    if (!this.isVisible || headerElements.length === 0) return;
    const headerTops = headerElements.map(
      (header) => header.element?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY
    );
    const isAtPageEnd =
      window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
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
        ${toc
          .map(
            (item, index) => `
          <li class="toc-row level-${item.level}">
            <button class="toc-item" type="button" data-index="${index}">${escapeTocHtml(item.text)}</button>
          </li>
        `
          )
          .join('')}
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
