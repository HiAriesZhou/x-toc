import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filterExcerptGroups,
  getSelectionState,
  getVisibleExcerptIds,
  mergeClipTagInput,
  updateClipNote,
  updateClipTags
} from '../src/options/clip-utils.js';

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
    article: { id: 'article_1', title: 'Product lessons', authorName: 'Alice', authorHandle: '@alice' },
    excerpts: [
      clip,
      { id: 'excerpt_2', articleId: 'article_1', text: 'Implementation details matter.', tags: ['engineering'] }
    ]
  },
  {
    article: { id: 'article_2', title: 'Research notes', authorName: 'Bob', authorHandle: '@bob' },
    excerpts: [{ id: 'excerpt_3', articleId: 'article_2', text: 'Context helps readers.' }]
  }
];

function matchingIds(query) {
  return getVisibleExcerptIds(filterExcerptGroups(groups, query));
}

test('tag input splits pasted lists and reports existing tags case-insensitively', () => {
  assert.deepEqual(mergeClipTagInput(['Product'], 'research， product design\nproduct'), {
    tags: ['Product', 'research', 'product design'],
    added: ['research', 'product design'],
    duplicates: ['product']
  });
});

test('editing tags and notes keeps the rest of the clip intact', () => {
  const now = '2026-06-16T02:00:00.000Z';
  const tagged = updateClipTags(clip, [' quote ', 'Quote'], { now });
  assert.deepEqual(tagged, { ...clip, tags: ['quote'], updatedAt: now });

  const cleared = updateClipNote(tagged, '   ', { now });
  assert.equal(Object.hasOwn(cleared, 'note'), false);
  assert.deepEqual(cleared.tags, ['quote']);
  assert.equal(clip.note, 'Positioning quote');
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
  assert.equal(getSelectionState(visibleIds, new Set(['excerpt_1', 'excerpt_2', 'excerpt_3'])).allSelected, true);
});
