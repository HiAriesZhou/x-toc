import { domToMarkdown } from '../library/markdown.js';
import { contentId, xUrl } from '../library/model.js';

const send = async (action, payload) => {
  const result = await chrome.runtime.sendMessage({ action, payload });
  if (!result?.ok) throw new Error(result?.error || 'Could not save. Reload X and try again.');
  return result.data;
};
export function captureNode(node, url, bookmarked = false) {
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
  const canonicalUrl = xUrl(url);
  const time = new Date().toISOString();
  const markdown = body ? domToMarkdown(body) : '';
  if (!markdown.trim() && !bookmarked)
    throw new Error('No loaded text found. Open the original article first.');
  return {
    article: {
      id: contentId(canonicalUrl),
      canonicalUrl,
      url: canonicalUrl,
      title,
      authorName: author.split('@')[0].trim(),
      authorHandle: handle,
      publishedAt: node.querySelector('time')?.dateTime || null,
      createdAt: time
    },
    item: {
      markdown,
      contentStatus: 'partial',
      kind:
        node.querySelector(
          '[data-testid="twitterArticleReadView"], [data-testid="longformRichTextComponent"], [data-testid="twitter-article-title"]'
        ) || body?.matches('[data-testid="twitterArticleReadView"]')
          ? 'article'
          : 'post',
      bookmarked,
      capturedAt: time
    }
  };
}
export function captureCurrent() {
  const current = xUrl(location.href);
  const canonical = xUrl(document.querySelector('link[rel="canonical"]')?.href);
  const url =
    /\/article\/\d+/.test(current) && /\/status\/\d+/.test(canonical) ? canonical : current;
  if (!/\/(?:status|statuses|article)\/\d+/.test(url))
    throw new Error('Open an individual X post or long-form article first.');
  const readView = document.querySelector('[data-testid="twitterArticleReadView"]');
  const postId = url.match(/\/(?:status|statuses|article)\/(\d+)/)?.[1];
  const node =
    readView ||
    [...document.querySelectorAll('article')].find((a) =>
      [...a.querySelectorAll('time')].some((t) =>
        t.closest('a')?.href.includes(`/status/${postId}`)
      )
    );
  if (!node) throw new Error('Article body is not loaded yet. Open the full article and retry.');
  return send('library:capture', captureNode(node, url));
}

export function initLibraryCapture() {
  const host = document.createElement('div');
  host.id = 'xtoc-library-capture';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>:host{position:fixed;left:18px;bottom:18px;z-index:2147483646;font:13px system-ui;color:#0f1419}section{max-width:350px;padding:12px;border:1px solid #dfe5eb;border-radius:12px;background:#fff;box-shadow:0 6px 28px #0002}button{font:inherit;border:1px solid #dfe5eb;border-radius:7px;padding:7px 10px;background:#f6f8fa;cursor:pointer;margin:3px}button:focus-visible{outline:2px solid #1d9bf0}button:disabled{opacity:.5}p{margin:7px 3px;line-height:1.4}small{color:#536471} @media(prefers-color-scheme:dark){section{background:#15202b;color:#f7f9f9;border-color:#394957}button{background:#20313f;color:inherit;border-color:#394957}small{color:#aab8c2}}</style><section aria-label="XTOC bookmark import"><strong>XTOC · Import bookmarks</strong><p><small>Only loaded previews are captured. Keep this tab open. Import never changes your X bookmarks.</small></p><button id="start">Start import</button><button id="pause" disabled>Pause</button><button id="cancel" disabled>Cancel</button><button id="library">Library ↗</button><p id="status" role="status">Ready. Existing items are deduplicated.</p></section>`;
  const status = shadow.querySelector('#status');
  let running = false,
    paused = false,
    stopped = false,
    route = '',
    importId = '';
  let added = 0,
    duplicates = 0,
    failed = 0;
  const seen = new Set();
  const isBookmarkPage = () => /^\/i\/bookmarks(?:\/|$)/.test(location.pathname);
  function setButtons() {
    shadow.querySelector('#start').disabled = running;
    shadow.querySelector('#pause').disabled = !running;
    shadow.querySelector('#cancel').disabled = !running;
    shadow.querySelector('#pause').textContent = paused ? 'Continue' : 'Pause';
  }
  const delay = () => new Promise((resolve) => setTimeout(resolve, 1500));
  async function run() {
    if (running) return;
    running = true;
    paused = stopped = false;
    added = duplicates = failed = 0;
    seen.clear();
    route = location.href;
    importId = `import_${Date.now()}`;
    setButtons();
    let idle = 0;
    let halted = false;
    let reason = 'Stopped at the current loading boundary; this is not a full-history guarantee.';
    try {
      while (!stopped && route === location.href && isBookmarkPage()) {
        if (paused) {
          await delay();
          continue;
        }
        let found = 0;
        for (const node of document.querySelectorAll('article[data-testid="tweet"]')) {
          if (stopped || paused) break;
          const link = node.querySelector('time')?.closest('a')?.href;
          if (!link || !xUrl(link)) continue;
          const id = contentId(link);
          if (seen.has(id)) continue;
          seen.add(id);
          found++;
          try {
            const result = await send('library:capture', captureNode(node, link, true));
            result.duplicate ? duplicates++ : added++;
          } catch (error) {
            failed++;
            // Storage failures stop the run so nothing else is attempted; a single
            // unreadable preview is skipped and the import continues.
            if (/save locally/i.test(error.message)) {
              reason = error.message;
              halted = stopped = true;
              break;
            }
          }
          status.textContent = `${added} new · ${duplicates} duplicates · ${failed} failed`;
        }
        idle = found ? 0 : idle + 1;
        if (idle >= 4 || seen.size >= 1000) {
          if (seen.size >= 1000)
            reason = '1,000-item safety limit reached. Start another import to continue scanning.';
          break;
        }
        if (!paused && !stopped)
          window.scrollBy({ top: Math.round(innerHeight * 0.8), behavior: 'instant' });
        await delay();
      }
      if (stopped && !halted) reason = 'Cancelled. Already imported items are retained.';
      if (route !== location.href) reason = 'Page changed. Already imported items are retained.';
    } finally {
      running = false;
      setButtons();
      status.textContent = `${added} new · ${duplicates} duplicates · ${failed} failed. ${reason}`;
      // Import counts contain no page text or account credentials.
      chrome.runtime
        .sendMessage({
          action: 'capture:importStatus',
          payload: { id: importId, added, duplicates, failed, reason }
        })
        .catch(() => {});
    }
  }
  shadow.querySelector('#start').onclick = () =>
    run().catch((e) => {
      status.textContent = e.message;
      running = false;
      setButtons();
    });
  shadow.querySelector('#pause').onclick = () => {
    paused = !paused;
    setButtons();
    status.textContent = paused ? 'Paused. Keep this tab open.' : 'Continuing…';
  };
  shadow.querySelector('#cancel').onclick = () => {
    stopped = true;
    status.textContent = 'Stopping…';
  };
  shadow.querySelector('#library').onclick = () =>
    chrome.runtime.sendMessage({ action: 'openLibrary' });
  const refresh = () => {
    if (isBookmarkPage()) {
      if (!host.isConnected) document.body.append(host);
    } else {
      stopped = true;
      host.remove();
    }
  };
  const timer = setInterval(refresh, 1500);
  refresh();
  return () => {
    stopped = true;
    clearInterval(timer);
    host.remove();
  };
}
