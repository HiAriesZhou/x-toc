import { domToMarkdown } from '../library/markdown.js';
import { contentId, safeUrl, xUrl } from '../library/model.js';

export const sendToLibrary = async (action, payload) => {
  const result = await chrome.runtime.sendMessage({ action, payload });
  if (!result?.ok) throw new Error(result?.error || 'Could not save. Reload X and try again.');
  return result.data;
};
export function captureNode(node, sourceUrl, bookmarked = false, visitUrl = sourceUrl) {
  const body =
    node.querySelector('[data-testid="longformRichTextComponent"]') ||
    node.querySelector('[data-testid="twitterArticleReadView"]') ||
    node.querySelector('[data-testid="tweetText"]') ||
    (node.matches('[data-testid="twitterArticleReadView"]') ? node : null);
  const title =
    node.querySelector('[data-testid="twitter-article-title"]')?.textContent?.trim() ||
    body?.querySelector('h1')?.textContent?.trim() ||
    body?.textContent?.trim().slice(0, 140) ||
    'Media post — open original';
  const author = node.querySelector('[data-testid="User-Name"]')?.textContent?.trim() || '';
  const handle = author.match(/@[\w]+/)?.[0] || '';
  const canonicalUrl = xUrl(sourceUrl);
  const originalUrl = safeUrl(visitUrl) || canonicalUrl;
  const time = new Date().toISOString();
  const markdown = body ? domToMarkdown(body) : '';
  if (!markdown.trim() && !bookmarked)
    throw new Error('No loaded text found. Open the original article first.');
  return {
    article: {
      id: contentId(canonicalUrl),
      canonicalUrl,
      url: originalUrl,
      title,
      authorName: author.split('@')[0].trim(),
      authorHandle: handle,
      publishedAt: node.querySelector('time')?.dateTime || null,
      createdAt: time
    },
    bookmark: {
      markdown,
      kind:
        node.querySelector(
          '[data-testid="twitterArticleReadView"], [data-testid="longformRichTextComponent"], [data-testid="twitter-article-title"]'
        ) || body?.matches('[data-testid="twitterArticleReadView"]')
          ? 'article'
          : 'post',
      fromXBookmarks: bookmarked
    }
  };
}
export function captureCurrent() {
  const visitHref = location.href;
  const current = xUrl(visitHref);
  const canonical = xUrl(document.querySelector('link[rel="canonical"]')?.href);
  const sourceUrl =
    /\/article\/\d+/.test(current) && /\/status\/\d+/.test(canonical) ? canonical : current;
  if (!/\/(?:status|statuses|article)\/\d+/.test(sourceUrl))
    throw new Error('Open an individual X post or long-form article first.');
  const readView = document.querySelector('[data-testid="twitterArticleReadView"]');
  const postId = sourceUrl.match(/\/(?:status|statuses|article)\/(\d+)/)?.[1];
  const node =
    readView ||
    [...document.querySelectorAll('article')].find((a) =>
      [...a.querySelectorAll('time')].some((t) =>
        t.closest('a')?.href.includes(`/status/${postId}`)
      )
    );
  if (!node) throw new Error('Article body is not loaded yet. Open the full article and retry.');
  return sendToLibrary('library:capture', captureNode(node, sourceUrl, false, visitHref));
}
