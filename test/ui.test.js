import test from 'node:test';
import assert from 'node:assert/strict';
import { bookmarkDate, formatDate } from '../src/options/ui.js';

test('bookmarks show when the post was published, falling back to a labeled save date', () => {
  const posted = bookmarkDate({
    publishedAt: '2026-09-21T08:00:00Z',
    capturedAt: '2026-10-09T10:00:00Z'
  });
  assert.deepEqual(posted, { text: formatDate('2026-09-21T08:00:00Z'), title: 'Posted on X' });
  const saved = bookmarkDate({ publishedAt: '', capturedAt: '2026-10-09T10:00:00Z' });
  assert.deepEqual(saved, {
    text: `Saved ${formatDate('2026-10-09T10:00:00Z')}`,
    title: 'Saved to XTOC'
  });
  assert.deepEqual(bookmarkDate({}), { text: '', title: '' });
});
