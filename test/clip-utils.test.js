import assert from 'node:assert/strict';
import test from 'node:test';

import { filterExcerptGroups, getSelectionState } from '../src/options/clip-utils.js';
import { normalizeClipTags, splitClipTagInput } from '../src/library/tags.js';

const clip = {
  id: 'excerpt_1',
  articleId: 'article_1',
  text: 'Small tools stay close to the workflow.',
  createdAt: '2026-06-16T01:00:00.000Z',
  tags: ['product'],
  note: 'Positioning quote'
};

const groups = [
  {
    article: {
      id: 'article_1',
      title: 'Product lessons',
      authorName: 'Alice',
      authorHandle: '@alice'
    },
    excerpts: [
      clip,
      {
        id: 'excerpt_2',
        articleId: 'article_1',
        text: 'Implementation details matter.',
        tags: ['engineering']
      }
    ]
  },
  {
    article: { id: 'article_2', title: 'Research notes', authorName: 'Bob', authorHandle: '@bob' },
    excerpts: [{ id: 'excerpt_3', articleId: 'article_2', text: 'Context helps readers.' }]
  }
];

function matchingIds(query) {
  return filterExcerptGroups(groups, query).flatMap(({ excerpts }) => excerpts.map((e) => e.id));
}

test('tag input splits pasted lists and drops duplicates case-insensitively', () => {
  assert.deepEqual(splitClipTagInput('research， product design\nResearch,,'), [
    'research',
    'product design'
  ]);
  assert.deepEqual(normalizeClipTags([' quote ', 'Quote', '', null]), ['quote']);
  assert.deepEqual(normalizeClipTags('not a list'), []);
});

test('search matches clip text, article, author, tags, and notes', () => {
  assert.deepEqual(matchingIds('workflow'), ['excerpt_1']);
  assert.deepEqual(matchingIds('research notes'), ['excerpt_3']);
  assert.deepEqual(matchingIds('@alice'), ['excerpt_1', 'excerpt_2']);
  assert.deepEqual(matchingIds('engineering'), ['excerpt_2']);
  assert.deepEqual(matchingIds('positioning'), ['excerpt_1']);
  assert.deepEqual(filterExcerptGroups(groups, 'missing'), []);
  assert.equal(filterExcerptGroups(groups, '  '), groups);
});

test('selection state counts only clips visible in the current search', () => {
  const visibleIds = matchingIds('alice');
  assert.deepEqual(getSelectionState(visibleIds, new Set(['excerpt_1'])), {
    selectedVisibleCount: 1,
    allSelected: false,
    someSelected: true
  });
  assert.equal(
    getSelectionState(visibleIds, new Set(['excerpt_1', 'excerpt_2', 'excerpt_3'])).allSelected,
    true
  );
});
