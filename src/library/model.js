import { normalizeClipTags } from './tags.js';

// Storage keys. Articles and clips keep their published names; bookmark
// records reuse the key from the 0.7.0 development line.
export const KEYS = {
  articles: 'twitterTocArticles',
  clips: 'twitterTocExcerpts',
  bookmarks: 'xtocLibraryItems'
};

const X_HOSTS = ['x.com', 'twitter.com', 'www.x.com', 'www.twitter.com'];
const RESERVED_IDS = ['__proto__', 'constructor', 'prototype'];

export const now = () => new Date().toISOString();
export const cleanText = (value, max = 1000000) =>
  typeof value === 'string' ? value.slice(0, max) : '';
export const validId = (value) =>
  typeof value === 'string' && /^[\w-]{1,160}$/.test(value) && !RESERVED_IDS.includes(value);

export function safeUrl(value) {
  try {
    const url = new URL(value);
    const allowed = ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
    return allowed ? url.href : '';
  } catch {
    return '';
  }
}

export function xUrl(value) {
  const href = safeUrl(value);
  if (!href) return '';
  const url = new URL(href);
  if (url.protocol !== 'https:' || !X_HOSTS.includes(url.hostname)) return '';
  url.hostname = 'x.com';
  url.search = '';
  url.hash = '';
  return url.href;
}

export function contentId(value) {
  const url = xUrl(value);
  if (!url) throw new Error('Only X/Twitter sources can be saved.');
  const status = url.match(/\/(?:status|statuses|article)\/(\d+)/)?.[1];
  if (status) return `article_${status}`;
  let hash = 0;
  for (const ch of url) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  return `article_${Math.abs(hash)}`;
}

export function readState(raw = {}) {
  return Object.fromEntries(Object.entries(KEYS).map(([name, key]) => [name, raw[key] || {}]));
}

export function writeState(state) {
  return Object.fromEntries(Object.entries(KEYS).map(([name, key]) => [key, state[name]]));
}

export function cleanArticle(article) {
  if (!article || !validId(article.id)) throw new Error('Invalid article ID.');
  const url = xUrl(article.canonicalUrl || article.url);
  if (!url) throw new Error('Invalid X source URL.');
  return {
    id: article.id,
    url,
    canonicalUrl: url,
    title: cleanText(article.title, 1000),
    authorName: cleanText(article.authorName, 300),
    authorHandle: cleanText(article.authorHandle, 100),
    publishedAt: cleanText(article.publishedAt, 50) || null,
    platform: 'x.com',
    createdAt: cleanText(article.createdAt, 50) || now(),
    updatedAt: cleanText(article.updatedAt, 50) || now()
  };
}

export function cleanClip(clip) {
  if (!validId(clip?.id) || !validId(clip?.articleId)) throw new Error('Invalid clip.');
  const text = cleanText(clip.text);
  return {
    id: clip.id,
    articleId: clip.articleId,
    text,
    contextBefore: cleanText(clip.contextBefore, 10000),
    contextAfter: cleanText(clip.contextAfter, 10000),
    pageUrl: xUrl(clip.pageUrl),
    selectionLength: text.length,
    source: 'x.com',
    createdAt: cleanText(clip.createdAt, 50) || now(),
    updatedAt: cleanText(clip.updatedAt, 50) || now(),
    tags: normalizeClipTags(clip.tags).slice(0, 100),
    note: cleanText(clip.note, 50000)
  };
}

export function cleanBookmark(bookmark, id) {
  return {
    id,
    kind: bookmark.kind === 'post' ? 'post' : 'article',
    markdown: cleanText(bookmark.markdown),
    fromXBookmarks: bookmark.fromXBookmarks === true || bookmark.bookmarked === true,
    capturedAt: cleanText(bookmark.capturedAt, 50),
    updatedAt: cleanText(bookmark.updatedAt, 50),
    tags: normalizeClipTags(bookmark.tags).slice(0, 100),
    note: cleanText(bookmark.note, 50000),
    summary: cleanText(bookmark.summary, 5000),
    summaryModel: cleanText(bookmark.summaryModel, 200),
    sortKey: Number.isFinite(bookmark.sortKey)
      ? bookmark.sortKey
      : Date.parse(bookmark.capturedAt) || 0
  };
}

function articleFields(state, id, fallbackUrl = '') {
  const article = state.articles[id] || {};
  return {
    title: article.title || 'Untitled',
    url: article.canonicalUrl || article.url || fallbackUrl,
    authorName: article.authorName || '',
    authorHandle: article.authorHandle || '',
    publishedAt: article.publishedAt || ''
  };
}

const byNewest = (field) => (a, b) => (Date.parse(b[field]) || 0) - (Date.parse(a[field]) || 0);

// Bookmarks joined with their article metadata, newest first.
export function bookmarkList(state) {
  return Object.values(state.bookmarks)
    .filter((bookmark) => validId(bookmark?.id))
    .map((bookmark) => ({
      ...articleFields(state, bookmark.id),
      ...cleanBookmark(bookmark, bookmark.id),
      clips: Object.values(state.clips).filter((clip) => clip.articleId === bookmark.id)
    }))
    .sort((a, b) => b.sortKey - a.sortKey);
}

// Clips grouped by article in the shape the clip filters and JSON v1 export use.
export function clipGroups(state) {
  const groups = new Map();
  for (const clip of Object.values(state.clips)) {
    if (!groups.has(clip.articleId)) {
      const article = state.articles[clip.articleId] || {
        id: clip.articleId,
        ...articleFields(state, clip.articleId, clip.pageUrl)
      };
      groups.set(clip.articleId, { article, excerpts: [] });
    }
    groups
      .get(clip.articleId)
      .excerpts.push({ ...clip, tags: clip.tags || [], note: clip.note || '' });
  }
  const latest = (group) =>
    Math.max(...group.excerpts.map((clip) => Date.parse(clip.createdAt) || 0));
  return [...groups.values()]
    .map((group) => ({ ...group, excerpts: group.excerpts.sort(byNewest('createdAt')) }))
    .sort((a, b) => latest(b) - latest(a));
}

function upsertArticle(state, payload, time) {
  const article = cleanArticle(payload.article);
  const incomingId = article.id;
  const sameSource = Object.values(state.articles).find((existing) => {
    const url = existing.canonicalUrl || existing.url;
    return xUrl(url) && contentId(url) === contentId(article.canonicalUrl);
  });
  if (sameSource) article.id = sameSource.id;
  else if (state.articles[article.id])
    throw new Error('Source identity conflicts with an existing article.');
  const old = state.articles[article.id];
  // A bookmark preview keeps the title of a previously saved article.
  const keepTitle = payload.bookmark?.fromXBookmarks && old?.title;
  state.articles[article.id] = {
    ...article,
    createdAt: old?.createdAt || article.createdAt,
    updatedAt: time,
    title: keepTitle ? old.title : article.title || old?.title || 'Untitled',
    authorName: article.authorName || old?.authorName || '',
    authorHandle: article.authorHandle || old?.authorHandle || '',
    publishedAt: article.publishedAt || old?.publishedAt || null
  };
  return { id: article.id, incomingId };
}

// Imports pass a key that follows X's order. A re-import keeps an item's stored
// position; records saved before keys existed adopt the imported one.
function sortKeyFor(old, incoming, time) {
  if (Number.isFinite(old?.sortKey)) return old.sortKey;
  if (Number.isFinite(incoming?.sortKey)) return incoming.sortKey;
  return old ? cleanBookmark(old, old.id).sortKey : Date.parse(time);
}

function capture(state, payload, time) {
  const { id } = upsertArticle(state, payload, time);
  const old = state.bookmarks[id];
  const input = cleanBookmark({ ...payload.bookmark, capturedAt: time, updatedAt: time }, id);
  // Bookmark-page previews and empty captures never replace saved text.
  const keepText = old?.markdown && (input.fromXBookmarks || !input.markdown);
  state.bookmarks[id] = {
    ...input,
    ...old,
    ...(keepText
      ? {}
      : { markdown: input.markdown, kind: input.kind, capturedAt: old?.capturedAt || time }),
    fromXBookmarks: Boolean(old?.fromXBookmarks || input.fromXBookmarks),
    sortKey: sortKeyFor(old, payload.bookmark, time),
    updatedAt: time
  };
  return { duplicate: Boolean(old), id };
}

function saveClip(state, payload, time) {
  const { id, incomingId } = upsertArticle(state, payload, time);
  const clip = cleanClip(payload.clip);
  if (clip.articleId !== incomingId) throw new Error('Clip source mismatch.');
  clip.articleId = id;
  const duplicate = Object.values(state.clips).some(
    (c) => c.articleId === id && c.text === clip.text
  );
  if (duplicate) return { duplicate: true };
  state.clips[clip.id] = clip;
  return { duplicate: false, article: state.articles[id], excerpt: clip };
}

function edit(state, payload, time) {
  const field = payload.type === 'clip' ? 'clips' : 'bookmarks';
  const record = state[field][payload.id];
  if (!record) throw new Error('This item no longer exists.');
  if (
    payload.expectedUpdatedAt !== undefined &&
    payload.expectedUpdatedAt !== (record.updatedAt || '')
  ) {
    throw new Error('This item changed in another tab. Reopen it before saving.');
  }
  state[field][payload.id] = {
    ...record,
    tags: normalizeClipTags(payload.tags).slice(0, 100),
    note: cleanText(payload.note, 50000),
    ...(field === 'bookmarks' && payload.summary !== undefined
      ? {
          summary: cleanText(payload.summary, 5000),
          summaryModel: cleanText(payload.summaryModel, 200)
        }
      : {}),
    updatedAt: time
  };
  return {};
}

// Deleting a clip or bookmark removes its article only when nothing else uses it.
function remove(state, payload) {
  const ids = Array.isArray(payload.ids) ? payload.ids : [];
  if (ids.some((id) => !validId(id))) throw new Error('Invalid selection.');
  const touched = new Set();
  for (const id of ids) {
    if (payload.type === 'clip') {
      if (state.clips[id]) touched.add(state.clips[id].articleId);
      delete state.clips[id];
    } else {
      touched.add(id);
      delete state.bookmarks[id];
    }
  }
  for (const articleId of touched) {
    const inUse =
      state.bookmarks[articleId] ||
      Object.values(state.clips).some((clip) => clip.articleId === articleId);
    if (!inUse) delete state.articles[articleId];
  }
  return {};
}

const ACTIONS = { capture, saveClip, edit, delete: remove };

// The background worker is the sole writer; reducers stay pure for tests.
export function mutate(state, action, payload = {}, time = now()) {
  const handler = ACTIONS[action];
  if (!handler) throw new Error('Unsupported library action.');
  return handler(state, payload, time);
}
