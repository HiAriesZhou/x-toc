import { normalizeClipTags } from '../options/clip-utils.js';

export const KEYS = {
  articles: 'twitterTocArticles',
  clips: 'twitterTocExcerpts',
  items: 'xtocLibraryItems',
  collections: 'xtocCollections',
  suggestions: 'xtocSuggestions',
  undo: 'xtocAIUndo',
  imports: 'xtocImports'
};
const IMPORT_HISTORY_LIMIT = 20;
export const now = () => new Date().toISOString();
export const cleanText = (v, max = 1000000) => (typeof v === 'string' ? v.slice(0, max) : '');
export const validId = (v) =>
  typeof v === 'string' &&
  /^[\w-]{1,160}$/.test(v) &&
  !['__proto__', 'constructor', 'prototype'].includes(v);
export function safeUrl(value) {
  try {
    const u = new URL(value);
    return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : '';
  } catch {
    return '';
  }
}
export function xUrl(value) {
  const url = safeUrl(value);
  if (!url) return '';
  const u = new URL(url);
  if (
    !['x.com', 'twitter.com', 'www.x.com', 'www.twitter.com'].includes(u.hostname) ||
    u.protocol !== 'https:'
  )
    return '';
  u.hostname = 'x.com';
  u.search = '';
  u.hash = '';
  return u.href;
}
export function contentId(url) {
  const value = xUrl(url);
  if (!value) throw new Error('Only X/Twitter sources can be saved.');
  const status = value.match(/\/(?:status|statuses|article)\/(\d+)/)?.[1];
  if (status) return `article_${status}`;
  let hash = 0;
  for (const ch of value) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  return `article_${Math.abs(hash)}`;
}
export function readState(raw = {}) {
  return Object.fromEntries(Object.entries(KEYS).map(([name, key]) => [name, raw[key] || {}]));
}
export function writeState(state) {
  return Object.fromEntries(Object.entries(KEYS).map(([name, key]) => [key, state[name]]));
}
export function itemsFor(state) {
  const grouped = new Map();
  for (const clip of Object.values(state.clips)) {
    if (!grouped.has(clip.articleId)) grouped.set(clip.articleId, []);
    grouped.get(clip.articleId).push(clip);
  }
  const ids = new Set([
    ...Object.keys(state.articles),
    ...Object.keys(state.items),
    ...Object.values(state.clips).map((c) => c.articleId)
  ]);
  return [...ids].map((id) => {
    const article = state.articles[id] || {};
    const clips = grouped.get(id) || [];
    return {
      id,
      title: article.title || 'Untitled',
      url: article.canonicalUrl || article.url || clips[0]?.pageUrl || '',
      authorName: article.authorName || '',
      authorHandle: article.authorHandle || '',
      publishedAt: article.publishedAt || '',
      createdAt: article.createdAt || clips[0]?.createdAt || '',
      kind: 'article',
      contentStatus: 'excerpts_only',
      markdown: '',
      tags: [],
      collectionIds: [],
      note: '',
      organized: false,
      bookmarked: false,
      ...state.items[id],
      clips
    };
  });
}
export function cleanArticle(a) {
  if (!a || !validId(a.id)) throw new Error('Invalid article ID.');
  const url = xUrl(a.canonicalUrl || a.url);
  if (!url) throw new Error('Invalid X source URL.');
  return {
    id: a.id,
    url,
    canonicalUrl: url,
    title: cleanText(a.title, 1000),
    authorName: cleanText(a.authorName, 300),
    authorHandle: cleanText(a.authorHandle, 100),
    publishedAt: cleanText(a.publishedAt, 50) || null,
    platform: 'x.com',
    createdAt: cleanText(a.createdAt, 50) || now(),
    updatedAt: cleanText(a.updatedAt, 50) || now()
  };
}
export function cleanClip(c) {
  if (!validId(c?.id) || !validId(c?.articleId)) throw new Error('Invalid clip.');
  return {
    id: c.id,
    articleId: c.articleId,
    text: cleanText(c.text),
    contextBefore: cleanText(c.contextBefore, 10000),
    contextAfter: cleanText(c.contextAfter, 10000),
    pageUrl: xUrl(c.pageUrl),
    selectionLength: cleanText(c.text).length,
    source: 'x.com',
    createdAt: cleanText(c.createdAt, 50) || now(),
    updatedAt: cleanText(c.updatedAt, 50) || now(),
    tags: normalizeClipTags(c.tags).slice(0, 100),
    note: cleanText(c.note, 50000),
    ...(c.trashedAt ? { trashedAt: cleanText(c.trashedAt, 50) } : {})
  };
}
export function cleanItem(i, id) {
  return {
    id,
    kind: i.kind === 'post' ? 'post' : 'article',
    markdown: cleanText(i.markdown),
    contentStatus: ['complete', 'partial', 'excerpts_only'].includes(i.contentStatus)
      ? i.contentStatus
      : 'partial',
    capturedAt: cleanText(i.capturedAt, 50),
    updatedAt: cleanText(i.updatedAt, 50),
    tags: normalizeClipTags(i.tags).slice(0, 100),
    collectionIds: Array.isArray(i.collectionIds) ? i.collectionIds.filter(validId) : [],
    note: cleanText(i.note, 50000),
    organized: i.organized === true,
    bookmarked: i.bookmarked === true,
    summary: cleanText(i.summary, 5000),
    summaryModel: cleanText(i.summaryModel, 200),
    trashedAt: cleanText(i.trashedAt, 50),
    lastExportedAt: cleanText(i.lastExportedAt, 50)
  };
}
export function backup(state) {
  return {
    format: 'xtoc-library',
    version: 1,
    exportedAt: now(),
    articles: Object.values(state.articles).map(cleanArticle),
    clips: Object.values(state.clips).map(cleanClip),
    items: Object.entries(state.items).map(([id, i]) => cleanItem(i, id)),
    collections: Object.values(state.collections).map((c) => ({
      id: c.id,
      name: cleanText(c.name, 100)
    }))
  };
}
export function parseBackup(value) {
  if (
    value?.format !== 'xtoc-library' ||
    value.version !== 1 ||
    !['articles', 'clips', 'items', 'collections'].every(
      (k) => Array.isArray(value[k]) && value[k].length <= 50000
    )
  )
    throw new Error('Unsupported library backup.');
  const state = readState();
  for (const a of value.articles) state.articles[a.id] = cleanArticle(a);
  for (const c of value.clips) {
    const clip = cleanClip(c);
    if (!state.articles[clip.articleId]) throw new Error('Backup contains orphan clips.');
    state.clips[clip.id] = clip;
  }
  for (const c of value.collections) {
    if (!validId(c.id) || !cleanText(c.name, 100).trim()) throw new Error('Invalid collection.');
    state.collections[c.id] = { id: c.id, name: cleanText(c.name, 100).trim() };
  }
  for (const i of value.items) {
    if (!validId(i.id) || !state.articles[i.id]) throw new Error('Invalid library item.');
    state.items[i.id] = cleanItem(i, i.id);
    if (state.items[i.id].collectionIds.some((id) => !state.collections[id]))
      throw new Error('Missing collection.');
  }
  return state;
}

// The background worker is the sole writer of library records. Reducers are also
// used in tests, so migration and merge behavior do not depend on the UI.
export function mutate(state, action, payload = {}, time = now()) {
  if (action === 'capture' || action === 'saveClip') {
    const a = cleanArticle(payload.article);
    const incomingId = a.id;
    const sameSource = Object.values(state.articles).find(
      (existing) =>
        xUrl(existing.canonicalUrl || existing.url) &&
        contentId(existing.canonicalUrl || existing.url) === contentId(a.canonicalUrl)
    );
    if (sameSource) a.id = sameSource.id;
    else if (state.articles[a.id])
      throw new Error('Source identity conflicts with an existing article.');
    const old = state.articles[a.id];
    state.articles[a.id] = {
      ...a,
      createdAt: old?.createdAt || a.createdAt,
      updatedAt: time,
      title: (payload.item?.bookmarked && old?.title) || a.title || old?.title || 'Untitled',
      authorName: a.authorName || old?.authorName || '',
      authorHandle: a.authorHandle || old?.authorHandle || '',
      publishedAt: a.publishedAt || old?.publishedAt || null
    };
    if (action === 'capture') {
      const oldItem = state.items[a.id];
      const input = cleanItem({ ...payload.item, capturedAt: time, updatedAt: time }, a.id);
      if (!input.markdown) input.contentStatus = 'excerpts_only';
      // A bookmark preview or empty capture must never downgrade a saved body or user metadata.
      const keepBody =
        oldItem?.markdown &&
        (input.bookmarked ||
          !input.markdown ||
          (oldItem.contentStatus === 'complete' && input.contentStatus !== 'complete'));
      state.items[a.id] = {
        ...input,
        ...oldItem,
        ...(keepBody
          ? {}
          : {
              markdown: input.markdown,
              contentStatus: input.contentStatus,
              capturedAt: time,
              kind: input.kind
            }),
        bookmarked: Boolean(oldItem?.bookmarked || input.bookmarked),
        updatedAt: time
      };
      return { duplicate: Boolean(oldItem), id: a.id };
    }
    const clip = cleanClip(payload.clip);
    if (clip.articleId !== incomingId) throw new Error('Clip source mismatch.');
    clip.articleId = a.id;
    if (Object.values(state.clips).some((c) => c.articleId === a.id && c.text === clip.text))
      return { duplicate: true };
    state.clips[clip.id] = clip;
    return { duplicate: false, article: state.articles[a.id], excerpt: clip };
  }
  if (action === 'restoreBackup') {
    const incoming = parseBackup(payload.backup);
    for (const [id, article] of Object.entries(incoming.articles)) {
      const existing = state.articles[id];
      if (
        existing &&
        contentId(existing.canonicalUrl || existing.url) !==
          contentId(article.canonicalUrl || article.url)
      )
        throw new Error(
          'Backup ID conflicts with a different local source. No records were changed.'
        );
    }
    for (const field of ['articles', 'clips', 'items', 'collections'])
      for (const [id, entry] of Object.entries(incoming[field])) {
        // Legacy articles without item records still own their existing metadata.
        if (!Object.hasOwn(state[field], id)) state[field][id] = entry;
      }
    return {};
  }
  if (action === 'collection') {
    const id = payload.id || `collection_${crypto.randomUUID()}`;
    if (!validId(id) || !cleanText(payload.name, 100).trim())
      throw new Error('Enter a collection name.');
    state.collections[id] = { id, name: cleanText(payload.name, 100).trim() };
    return { id };
  }
  if (action === 'deleteCollection') {
    delete state.collections[payload.id];
    for (const i of Object.values(state.items))
      i.collectionIds = (i.collectionIds || []).filter((id) => id !== payload.id);
    return {};
  }
  if (action === 'renameTag') {
    const from = cleanText(payload.from, 200).trim().toLowerCase();
    const to = cleanText(payload.to, 200).trim();
    if (!from) throw new Error('Select a tag.');
    for (const item of [...Object.values(state.items), ...Object.values(state.clips)]) {
      if (item.tags?.some((t) => t.toLowerCase() === from)) {
        item.tags = normalizeClipTags(
          item.tags.flatMap((t) => (t.toLowerCase() === from ? (to ? [to] : []) : [t]))
        );
        item.updatedAt = time;
      }
    }
    return {};
  }
  if (action === 'importStatus') {
    const id = /^import_\d{1,20}$/.test(payload.id)
      ? payload.id
      : `import_${Date.parse(time) || 0}`;
    // Re-insert so object key order stays oldest-first, then keep only recent runs.
    delete state.imports[id];
    state.imports[id] = { ...payload, id, updatedAt: time };
    const ids = Object.keys(state.imports);
    for (const old of ids.slice(0, Math.max(0, ids.length - IMPORT_HISTORY_LIMIT)))
      delete state.imports[old];
    return {};
  }
  const ids = Array.isArray(payload.ids) ? [...new Set(payload.ids)] : [];
  if (ids.some((id) => !validId(id))) throw new Error('Invalid selection.');
  if (action === 'edit' || action === 'batch') {
    const type = payload.type === 'clip' ? 'clip' : 'item';
    for (const id of ids) {
      if (type === 'clip' && !state.clips[id]) continue;
      if (type === 'item' && !state.articles[id]) continue;
      const item =
        type === 'clip'
          ? state.clips[id]
          : (state.items[id] ||= cleanItem({ contentStatus: 'excerpts_only' }, id));
      if (payload.operation === 'purge') {
        if (!item.trashedAt) throw new Error('Move to Trash before permanently deleting.');
        if (type === 'clip') delete state.clips[id];
        else {
          delete state.items[id];
          delete state.articles[id];
          for (const c of Object.values(state.clips))
            if (c.articleId === id) delete state.clips[c.id];
        }
        continue;
      }
      if (payload.operation === 'trash') item.trashedAt = time;
      if (payload.operation === 'restore') item.trashedAt = '';
      if (payload.operation === 'organized' && type === 'item')
        item.organized = payload.value !== false;
      if (payload.operation === 'exported' && type === 'item') item.lastExportedAt = time;
      if (payload.operation === 'complete' && type === 'item' && item.markdown)
        item.contentStatus = 'complete';
      if (payload.operation === 'addTags')
        item.tags = normalizeClipTags([...(item.tags || []), ...normalizeClipTags(payload.tags)]);
      if (payload.operation === 'removeTags') {
        const remove = normalizeClipTags(payload.tags).map((t) => t.toLowerCase());
        item.tags = (item.tags || []).filter((t) => !remove.includes(t.toLowerCase()));
      }
      if (payload.operation === 'collection' && type === 'item') {
        if (!state.collections[payload.collectionId])
          throw new Error('Collection no longer exists.');
        item.collectionIds = [...new Set([...(item.collectionIds || []), payload.collectionId])];
      }
      if (action === 'edit') {
        if (
          payload.expectedUpdatedAt !== undefined &&
          payload.expectedUpdatedAt !== (item.updatedAt || '')
        )
          throw new Error('This content changed in another tab. Reopen it before saving.');
        item.tags = normalizeClipTags(payload.tags).slice(0, 100);
        item.note = cleanText(payload.note, 50000);
        if (type === 'item')
          item.collectionIds = (payload.collectionIds || []).filter((c) =>
            Object.hasOwn(state.collections, c)
          );
      }
      if (payload.operation !== 'exported') item.updatedAt = time;
    }
    return {};
  }
  throw new Error('Unsupported library action.');
}
