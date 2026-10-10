// Content script entry on x.com / twitter.com: wires the TOC panel, the
// selection clip flow and the bookmark import, and handles popup messages.
import { areTocEntriesEqual, clampScrollTarget } from './navigation-utils.js';
import { isExtensionMutation } from './page-utils.js';
import { extractTOC, getPageKind } from './toc-extract.js';
import { TOCPanel } from './toc-panel.js';
import {
  destroyExcerptFeature,
  handleExcerptRouteChange,
  initExcerptFeature
} from './excerpt-capture.js';
import { captureCurrent } from './library-capture.js';
import { initBookmarkImport } from './bookmark-import-panel.js';
import { createLifecycle } from './lifecycle.js';

const TOC_SCROLL_OFFSET = 70;

let destroyLibraryCapture = null;
let pageObserver = null;
let initialExtractTimeout = null;
let active = true; // false once this instance is torn down
let tocData = [];
let headerElements = [];
let tocPanel = null;

function refreshTOC() {
  const { toc, headers } = extractTOC();
  tocData = toc;
  headerElements = headers;
  return toc;
}

const tocTitle = () =>
  tocData.find((item) => item.level === 1)?.text || headerElements[0]?.text || null;

// Scroll to specific header by index
function scrollToHeader(index) {
  const header = headerElements[index];
  if (header && header.element) {
    // Get the element's position
    const rect = header.element.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const maximumScroll = document.documentElement.scrollHeight - window.innerHeight;
    const targetScroll = clampScrollTarget(rect.top + scrollTop - TOC_SCROLL_OFFSET, maximumScroll);

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
  destroyLibraryCapture = initBookmarkImport();
  // Wait for page to fully load
  initialExtractTimeout = setTimeout(() => {
    refreshTOC();
  }, 1500);

  // Initialize TOC Panel
  tocPanel = new TOCPanel({ getHeaders: () => headerElements, onSelect: scrollToHeader });
  await tocPanel.init();
  if (!active) return tocPanel.destroy();
  initExcerptFeature({ getTocTitle: tocTitle });

  // Check if panel was visible before
  const storage = await chrome.storage.local.get('tocPanelVisible');
  if (!active) return;
  if (storage.tocPanelVisible && tocData.length > 0) {
    tocPanel.show(tocData);
  }

  // Watch for dynamic content (SPA navigation)
  const observer = new MutationObserver((mutations) => {
    handleExcerptRouteChange();
    if (mutations.every(isExtensionMutation)) return;
    clearTimeout(window.tocExtractTimeout);
    window.tocExtractTimeout = setTimeout(() => {
      const previous = tocData;
      const nextToc = refreshTOC();
      const tocChanged = !areTocEntriesEqual(previous, nextToc);
      if (tocPanel.isVisible && tocChanged) {
        tocPanel.show(nextToc);
      }
    }, 1000);
  });

  pageObserver = observer;
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Listen for messages from popup or background
function handleMessage(message, sender, sendResponse) {
  if (message.action === 'captureCurrent') {
    captureCurrent().then(
      (data) => sendResponse({ ok: true, data }),
      (error) => sendResponse({ ok: false, error: error.message })
    );
    return true;
  }
  if (message.action === 'getTOC') {
    refreshTOC();
    sendResponse({
      toc: tocData,
      isPanelVisible: tocPanel?.isVisible || false,
      pageKind: getPageKind()
    });
  } else if (message.action === 'scrollTo') {
    scrollToHeader(message.index);
    sendResponse({ success: true });
  } else if (message.action === 'togglePanel') {
    refreshTOC();
    tocPanel.toggle(tocData);
    sendResponse({ isVisible: tocPanel.isVisible });
  } else if (message.action === 'showPanel') {
    refreshTOC();
    tocPanel.show(tocData);
    sendResponse({ isVisible: true });
  } else if (message.action === 'hidePanel') {
    tocPanel.hide();
    sendResponse({ isVisible: false });
  }

  return true;
}
chrome.runtime.onMessage.addListener(handleMessage);

// Removes everything this instance added to the page. Runs when a newer
// instance replaces it, when the extension context is invalidated, or on
// Extension.js hot reload.
function teardown() {
  active = false;
  clearTimeout(initialExtractTimeout);
  clearTimeout(window.tocExtractTimeout);
  pageObserver?.disconnect();
  tocPanel?.destroy();
  destroyExcerptFeature();
  destroyLibraryCapture?.();
  try {
    chrome.runtime.onMessage.removeListener(handleMessage);
  } catch {
    // The extension context is already gone.
  }
}

// UI left behind by an older build that predates the replace event.
const STALE_ELEMENT_IDS = ['twitter-toc-panel', 'xtoc-save-excerpt-button', 'xtoc-library-capture'];

const isExtensionAlive = () => {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
};

const lifecycle = createLifecycle({ isAlive: isExtensionAlive, onTeardown: teardown });
lifecycle.start();
STALE_ELEMENT_IDS.forEach((id) => document.getElementById(id)?.remove());

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Export for Extension.js hot reload
export default function main() {
  return () => lifecycle.teardown();
}
