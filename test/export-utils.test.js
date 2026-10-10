import assert from 'node:assert/strict';
import test from 'node:test';

import { renderAllJson } from '../src/options/export-utils.js';

const exportedAt = '2026-06-16T04:00:00.000Z';

const article = {
  id: 'article_1',
  url: 'https://x.com/alice/status/1',
  canonicalUrl: 'https://x.com/alice/status/1',
  title: 'Product notes',
  authorName: 'Alice',
  authorHandle: '@alice',
  platform: 'x.com'
};

const clip = {
  id: 'excerpt_1',
  text: 'Useful saved text',
  contextBefore: 'Before',
  contextAfter: 'After',
  pageUrl: 'https://x.com/alice/status/1',
  createdAt: '2026-06-16T02:30:00.000Z',
  updatedAt: '2026-06-16T03:30:00.000Z',
  source: 'x.com',
  tags: ['AI Coding', '中文 标签'],
  note: 'Use this later.'
};

const legacyClip = {
  id: 'excerpt_2',
  text: 'Old saved text',
  pageUrl: 'https://x.com/alice/status/1',
  createdAt: '2026-06-16T02:30:00.000Z',
  source: 'x.com'
};

test('JSON export keeps the v1 contract and fills defaults for older clips', () => {
  const json = JSON.parse(renderAllJson([{ article, excerpts: [clip, legacyClip] }], exportedAt));

  assert.equal(json.version, 1);
  assert.equal(json.source, 'twitter-toc-extension');
  assert.equal(json.articles[0].canonicalUrl, article.canonicalUrl);

  const [current, legacy] = json.articles[0].excerpts;
  assert.deepEqual(current.tags, clip.tags);
  assert.equal(current.note, clip.note);
  assert.deepEqual(
    {
      tags: legacy.tags,
      note: legacy.note,
      updatedAt: legacy.updatedAt,
      selectionLength: legacy.selectionLength
    },
    { tags: [], note: '', updatedAt: null, selectionLength: legacyClip.text.length }
  );
});
