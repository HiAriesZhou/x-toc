// Reads the table of contents from a long-form X article.
import { classifyXPage } from './navigation-utils.js';
import { findArticleContainer } from './page-utils.js';

// Get heading level from element (handles Twitter/X custom classes)
function getHeaderLevel(header) {
  if (header.classList.contains('longform-header-one')) return 2;
  if (header.classList.contains('longform-header-two')) return 3;
  if (header.classList.contains('longform-header-three')) return 4;
  // Fallback for standard h2-h6
  return parseInt(header.tagName.charAt(1));
}

const LONGFORM_MARKERS = [
  '[data-testid="twitterArticleReadView"]',
  '[data-testid="twitter-article-title"]',
  '[data-testid="longformRichTextComponent"]',
  '.longform-header-one, .longform-header-two, .longform-header-three'
].join(', ');

export function getPageKind() {
  return classifyXPage(window.location.href, Boolean(document.querySelector(LONGFORM_MARKERS)));
}

// Extract headers from the article. Returns the serializable entries and the
// matching elements used for scrolling and active-section tracking.
export function extractTOC() {
  // Timelines, profiles and plain posts have no article structure; their page
  // headings (for example "Your Home Timeline") must not become a contents list.
  if (getPageKind() !== 'article') {
    return { toc: [], headers: [] };
  }

  const article = findArticleContainer();

  if (!article) {
    console.log('[TOC] No article container found');
    return { toc: [], headers: [] };
  }

  const toc = [];
  const headerElements = [];

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
  const headers = article.querySelectorAll(
    '.longform-header-one, .longform-header-two, .longform-header-three, h2, h3, h4, h5, h6'
  );
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
  return { toc, headers: headerElements };
}
