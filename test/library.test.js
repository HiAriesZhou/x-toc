import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bookmarkList,
  cleanArticle,
  cleanClip,
  clipGroups,
  contentId,
  mutate,
  readState,
  xUrl
} from '../src/library/model.js';
import {
  bookmarkFiles,
  clipFiles,
  noteName,
  obsidianTag,
  zipFiles
} from '../src/library/obsidian.js';
import {
  aiInput,
  generateSuggestion,
  normalizeBaseUrl,
  parseSuggestion
} from '../src/library/ai.js';

const article = {
  id: 'article_123',
  title: 'A reference: 中文',
  canonicalUrl: 'https://x.com/example/status/123',
  authorHandle: '@example',
  publishedAt: '2026-09-30T08:00:00Z',
  createdAt: '2026-10-01T00:00:00Z'
};
const clip = (id, text, extra = {}) => ({
  id,
  articleId: article.id,
  text,
  pageUrl: article.canonicalUrl,
  ...extra
});

function seeded() {
  const state = readState();
  mutate(
    state,
    'capture',
    { article, bookmark: { markdown: '### A heading\n\nOriginal reference text.' } },
    '2026-10-02T00:00:00Z'
  );
  mutate(
    state,
    'edit',
    { type: 'bookmark', id: article.id, tags: ['manual'], note: 'Private personal note' },
    't1'
  );
  return state;
}

test('canonical identity deduplicates X/Twitter URLs and rejects unrelated sources', () => {
  assert.equal(contentId('https://twitter.com/a/status/123?x=1'), 'article_123');
  assert.equal(xUrl('https://x.com.evil.test/a/status/123'), '');
  assert.throws(() => contentId('javascript:alert(1)'));
});

test('cleanArticle/cleanClip keep original visit URLs; only canonicalUrl is normalized', () => {
  const visit = 'https://twitter.com/example/status/123?s=20&t=abc#reply';
  const cleaned = cleanArticle({
    id: 'article_123',
    url: visit,
    canonicalUrl: visit,
    title: 'Kept visit URL'
  });
  assert.equal(cleaned.url, visit);
  assert.equal(cleaned.canonicalUrl, 'https://x.com/example/status/123');
  assert.equal(contentId(cleaned.canonicalUrl), 'article_123');

  const clip = cleanClip({
    id: 'clip_visit',
    articleId: 'article_123',
    text: 'passage',
    pageUrl: visit
  });
  assert.equal(clip.pageUrl, visit);

  const state = readState();
  mutate(
    state,
    'saveClip',
    {
      article: {
        id: 'article_123',
        url: visit,
        canonicalUrl: 'https://x.com/example/status/123',
        title: 'Visit URL article'
      },
      clip: {
        id: 'clip_roundtrip',
        articleId: 'article_123',
        text: 'roundtrip passage',
        pageUrl: visit
      }
    },
    '2026-10-10T12:00:00Z'
  );
  const stored = state.articles.article_123;
  assert.equal(stored.url, visit);
  assert.equal(stored.canonicalUrl, 'https://x.com/example/status/123');
  assert.equal(state.clips.clip_roundtrip.pageUrl, visit);
  const [group] = clipGroups(state);
  assert.equal(group.article.url, visit);
  assert.equal(group.article.canonicalUrl, 'https://x.com/example/status/123');
  assert.equal(group.excerpts[0].pageUrl, visit);
});

test('bookmark-page previews and empty captures never replace saved text or annotations', () => {
  const state = seeded();
  const preview = mutate(state, 'capture', {
    article: { ...article, title: 'Preview title' },
    bookmark: { markdown: 'Preview only', fromXBookmarks: true }
  });
  assert.equal(preview.duplicate, true);
  mutate(state, 'capture', { article, bookmark: { markdown: '' } });
  const [bookmark] = bookmarkList(state);
  assert.match(bookmark.markdown, /Original reference/);
  assert.equal(bookmark.note, 'Private personal note');
  assert.deepEqual(bookmark.tags, ['manual']);
  assert.equal(bookmark.title, article.title);
  assert.equal(bookmark.fromXBookmarks, true);
});

test('clips deduplicate, and deleting the last clip keeps a bookmarked article', () => {
  const state = seeded();
  assert.equal(
    mutate(state, 'saveClip', { article, clip: clip('clip_1', 'A passage') }).duplicate,
    false
  );
  assert.equal(
    mutate(state, 'saveClip', { article, clip: clip('clip_2', 'A passage') }).duplicate,
    true
  );
  mutate(state, 'delete', { type: 'clip', ids: ['clip_1'] });
  assert.ok(state.articles[article.id]);
  assert.equal(Object.keys(state.clips).length, 0);
});

test('deleting a bookmark keeps clips; deleting both removes the orphan article', () => {
  const state = seeded();
  mutate(state, 'saveClip', { article, clip: clip('clip_1', 'A passage') });
  mutate(state, 'delete', { type: 'bookmark', ids: [article.id] });
  assert.equal(bookmarkList(state).length, 0);
  assert.equal(clipGroups(state)[0].excerpts.length, 1);
  mutate(state, 'delete', { type: 'clip', ids: ['clip_1'] });
  assert.deepEqual(state.articles, {});
});

test('legacy clips appear in Clips without becoming bookmarks', () => {
  const state = readState({
    twitterTocArticles: { [article.id]: article },
    twitterTocExcerpts: { c: { id: 'c', articleId: article.id, text: 'Legacy' } }
  });
  assert.equal(clipGroups(state)[0].excerpts[0].text, 'Legacy');
  assert.equal(bookmarkList(state).length, 0);
});

test('capture reuses an existing legacy ID for the same canonical source', () => {
  const state = readState({ twitterTocArticles: { legacy_id: { ...article, id: 'legacy_id' } } });
  mutate(state, 'capture', { article, bookmark: { markdown: 'Captured body' } });
  assert.deepEqual(Object.keys(state.articles), ['legacy_id']);
  assert.ok(state.bookmarks.legacy_id);
});

test('stale editors cannot overwrite newer edits', () => {
  const state = seeded();
  mutate(
    state,
    'edit',
    { type: 'bookmark', id: article.id, expectedUpdatedAt: 't1', tags: ['edited'], note: 'New' },
    't2'
  );
  assert.throws(
    () =>
      mutate(state, 'edit', {
        type: 'bookmark',
        id: article.id,
        expectedUpdatedAt: 't1',
        tags: [],
        note: 'Stale'
      }),
    /another tab/
  );
  assert.equal(state.bookmarks[article.id].note, 'New');
});

test('Obsidian bookmark note has properties, tag list, summary callout and clip callouts', () => {
  const state = seeded();
  mutate(state, 'edit', {
    type: 'bookmark',
    id: article.id,
    tags: ['deep work', 'manual'],
    note: '# My take',
    summary: 'Grounded summary.',
    summaryModel: 'm'
  });
  mutate(state, 'saveClip', {
    article,
    clip: clip('clip_1', 'Keep the source close', { tags: ['quote'], note: 'Why it matters' })
  });
  const files = bookmarkFiles(state, [article.id]);
  const [path] = Object.keys(files);
  assert.equal(path, 'XTOC/A reference 中文.md');
  const note = files[path];
  assert.match(
    note,
    /^---\ntitle: "A reference: 中文"\nsource: "https:\/\/x\.com\/example\/status\/123"\nauthor: "@example"\npublished: 2026-09-30\nsaved: 2026-10-02\ntype: "x-article"\ntags:\n {2}- "deep-work"\n {2}- "manual"\n {2}- "quote"\nxtoc_id: "article_123"\n---/
  );
  assert.match(note, /> \[!summary\] AI summary\n> Grounded summary\./);
  assert.match(note, /## Note\n\n\\# My take/);
  assert.match(note, /## Content\n\n### A heading\n\nOriginal reference text\./);
  assert.match(
    note,
    /## Clips\n\n> \[!quote\]\n> Keep the source close\n\n#quote\n\nWhy it matters/
  );
});

test('clip export holds only the selected clips and never the saved body', () => {
  const state = seeded();
  mutate(state, 'saveClip', { article, clip: clip('clip_1', 'First') });
  mutate(state, 'saveClip', { article, clip: clip('clip_2', 'Second') });
  const files = clipFiles(state, ['clip_2']);
  const note = files['XTOC/A reference 中文 (clips).md'];
  assert.match(note, /type: "x-clips"/);
  assert.match(note, /Second/);
  assert.doesNotMatch(note, /First|Original reference|Private personal note/);
});

test('note names are filesystem-safe and unique; tags follow Obsidian rules', () => {
  assert.equal(noteName('a/b: c?*"<>|#^[x]', 'id'), 'a b c x');
  assert.equal(noteName('...', 'article_1'), 'article_1');
  assert.equal(obsidianTag('deep work!'), 'deep-work');
  assert.equal(obsidianTag('2026'), 'tag-2026');
  const state = seeded();
  mutate(state, 'capture', {
    article: { ...article, id: 'article_456', canonicalUrl: 'https://x.com/b/status/456' },
    bookmark: { markdown: 'x' }
  });
  const paths = Object.keys(bookmarkFiles(state, [article.id, 'article_456'])).sort();
  assert.deepEqual(paths, ['XTOC/A reference 中文 (2).md', 'XTOC/A reference 中文.md']);
});

test('ZIP has valid signatures and rejects unsafe paths', async () => {
  const files = bookmarkFiles(seeded(), [article.id]);
  const bytes = new Uint8Array(await zipFiles(files).arrayBuffer());
  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50);
  assert.equal(view.getUint16(bytes.length - 12, true), 1);
  assert.throws(() => zipFiles({ '../AGENTS.md': 'bad' }), /Unsafe/);
  assert.throws(() => zipFiles({ 'XTOC/a/b.md': 'bad' }), /Unsafe/);
});

test('AI input sends saved text and tag vocabulary, never notes', () => {
  const input = aiInput(seeded(), article.id);
  assert.match(input.text, /Original reference text/);
  assert.deepEqual(input.existingTags, ['manual']);
  assert.doesNotMatch(JSON.stringify(input), /Private personal note/);
  assert.throws(() => normalizeBaseUrl('http://example.com'));
  assert.throws(() => normalizeBaseUrl('https://key@example.com'));
});

test('AI suggestions are capped at three tags and validated', () => {
  assert.deepEqual(
    parseSuggestion('{"tags":["one","ONE","two","three","four"],"summary":" Short. "}'),
    {
      tags: ['one', 'two', 'three'],
      summary: 'Short.'
    }
  );
  assert.throws(() => parseSuggestion('not JSON'));
  assert.throws(() => parseSuggestion('{"tags":"x","summary":""}'));
});

test('AI requests omit cookies, refuse redirects and report rate limits', async () => {
  let sent;
  const input = aiInput(seeded(), article.id);
  const fake = async (url, init) => {
    sent = { url, init };
    const content = '{"tags":["reference"],"summary":"Grounded text."}';
    return {
      ok: true,
      text: async () =>
        JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content } }] })
    };
  };
  const result = await generateSuggestion(
    { endpoint: 'https://example.com/v1', key: 'synthetic', model: 'test' },
    input,
    undefined,
    fake
  );
  assert.deepEqual(result, { tags: ['reference'], summary: 'Grounded text.' });
  assert.equal(sent.url, 'https://example.com/v1/chat/completions');
  assert.equal(sent.init.credentials, 'omit');
  assert.equal(sent.init.redirect, 'error');
  await assert.rejects(
    generateSuggestion(
      { endpoint: 'https://example.com/v1', key: 'k', model: 'm' },
      input,
      undefined,
      async () => ({ ok: false, status: 429, text: async () => '' })
    ),
    /Rate limit/
  );
});

test('imported bookmarks keep X order; later saves appear first; re-imports keep position', () => {
  const state = readState();
  const post = (n) => ({
    id: `article_${n}`,
    canonicalUrl: `https://x.com/u/status/${n}`,
    title: `Post ${n}`
  });
  const runStart = Date.parse('2026-10-09T10:00:00Z');
  // X lists newest bookmark first; the importer saves top to bottom.
  [3, 2, 1].forEach((n, index) =>
    mutate(
      state,
      'capture',
      {
        article: post(n),
        bookmark: { markdown: `p${n}`, fromXBookmarks: true, sortKey: runStart - index }
      },
      `2026-10-09T10:00:0${index}Z`
    )
  );
  mutate(
    state,
    'capture',
    { article: post(9), bookmark: { markdown: 'manual' } },
    '2026-10-09T11:00:00Z'
  );
  mutate(
    state,
    'capture',
    {
      article: post(2),
      bookmark: {
        markdown: 'again',
        fromXBookmarks: true,
        sortKey: Date.parse('2026-10-09T12:00:00Z')
      }
    },
    '2026-10-09T12:00:00Z'
  );
  assert.deepEqual(
    bookmarkList(state).map((b) => b.id),
    ['article_9', 'article_3', 'article_2', 'article_1']
  );
});

test('bookmarks saved before sort keys existed take the order of the next import', () => {
  const state = readState({
    twitterTocArticles: {
      article_5: { id: 'article_5', canonicalUrl: 'https://x.com/u/status/5', title: 'Old' }
    },
    xtocLibraryItems: {
      article_5: { id: 'article_5', markdown: 'x', capturedAt: '2026-10-01T00:00:00Z' }
    }
  });
  const sortKey = Date.parse('2026-10-09T00:00:00Z');
  mutate(state, 'capture', {
    article: { id: 'article_5', canonicalUrl: 'https://x.com/u/status/5' },
    bookmark: { fromXBookmarks: true, sortKey }
  });
  assert.equal(state.bookmarks.article_5.sortKey, sortKey);
});

test('providers that reject JSON mode get one retry without response_format', async () => {
  const bodies = [];
  const content = '```json\n{"tags":["x"],"summary":"ok"}\n```';
  const fake = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    if (bodies.length === 1) {
      const error = JSON.stringify({ error: { message: 'response_format is not supported' } });
      return { ok: false, status: 400, text: async () => error };
    }
    const ok = JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content } }] });
    return { ok: true, status: 200, text: async () => ok };
  };
  const input = aiInput(seeded(), article.id);
  const result = await generateSuggestion(
    { endpoint: 'https://example.com/v1', key: 'k', model: 'm' },
    input,
    undefined,
    fake
  );
  assert.deepEqual(result, { tags: ['x'], summary: 'ok' });
  assert.ok(bodies[0].response_format);
  assert.equal(bodies[1].response_format, undefined);
});

test('other 400 errors are reported with the provider message, without retrying', async () => {
  let calls = 0;
  const error = JSON.stringify({
    error: { message: 'The supported API model names are deepseek-chat.' }
  });
  const fake = async () => (calls++, { ok: false, status: 400, text: async () => error });
  await assert.rejects(
    generateSuggestion(
      { endpoint: 'https://example.com/v1', key: 'k', model: 'bad' },
      aiInput(seeded(), article.id),
      undefined,
      fake
    ),
    /supported API model names/
  );
  assert.equal(calls, 1);
});
