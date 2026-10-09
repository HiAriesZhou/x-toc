import test from 'node:test';
import assert from 'node:assert/strict';
import { isBookmarkedTweet, isBookmarksRoute } from '../src/content/bookmark-import-utils.js';

test('bookmark import runs on the legacy Bookmarks route and the History page', () => {
  assert.equal(isBookmarksRoute('/i/bookmarks'), true);
  assert.equal(isBookmarksRoute('/i/bookmarks/123'), true);
  assert.equal(isBookmarksRoute('/i/history'), true);
  assert.equal(isBookmarksRoute('/i/history/bookmarks'), true);
  assert.equal(isBookmarksRoute('/home'), false);
  assert.equal(isBookmarksRoute('/i/historyx'), false);
});

test('only posts whose bookmark button is in the saved state are imported', () => {
  const tweet = (testId) => ({
    querySelector: (selector) => (selector.includes(`"${testId}"`) ? {} : null)
  });
  assert.equal(isBookmarkedTweet(tweet('removeBookmark')), true);
  assert.equal(isBookmarkedTweet(tweet('bookmark')), false);
});

test('import status stays one short line for each state', async () => {
  const { importLabel } = await import('../src/content/bookmark-import-utils.js');
  const counts = { added: 23, duplicates: 0, failed: 0 };
  assert.deepEqual(importLabel({ phase: 'idle' }), { tone: 'info', text: 'Import to XTOC' });
  assert.deepEqual(importLabel({ phase: 'running', ...counts }), {
    tone: 'info',
    text: 'Importing · 23'
  });
  assert.deepEqual(importLabel({ phase: 'paused', ...counts }), {
    tone: 'info',
    text: 'Paused · 23'
  });
  assert.deepEqual(
    importLabel({ phase: 'done', reason: 'end', added: 39, duplicates: 1, failed: 2 }),
    {
      tone: 'success',
      text: '39 imported · 1 already saved · 2 skipped'
    }
  );
  assert.deepEqual(
    importLabel({ phase: 'done', reason: 'end', added: 0, duplicates: 5, failed: 0 }),
    {
      tone: 'success',
      text: 'All 5 already saved'
    }
  );
  assert.equal(
    importLabel({ phase: 'done', reason: 'cancelled', ...counts }).text,
    'Stopped · 23 imported'
  );
  assert.deepEqual(
    importLabel({ phase: 'done', reason: 'no-bookmarks', added: 0, duplicates: 0, failed: 0 }),
    {
      tone: 'warning',
      text: 'No bookmarks on this tab'
    }
  );
  assert.equal(
    importLabel({ phase: 'done', reason: 'limit', ...counts }).text,
    '23 imported · run again for more'
  );
  assert.equal(importLabel({ phase: 'done', reason: 'storage', ...counts }).tone, 'error');
  assert.equal(
    importLabel({ phase: 'done', reason: 'error', ...counts }).text,
    'Import failed · try again'
  );
});
