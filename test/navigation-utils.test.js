import assert from 'node:assert/strict';
import test from 'node:test';

import {
  areTocEntriesEqual,
  clampScrollTarget,
  getActiveSectionIndex,
  hasReachedScrollTarget
} from '../src/content/navigation-utils.js';

test('getActiveSectionIndex follows the last heading above the reading line', () => {
  assert.equal(getActiveSectionIndex([-400, -20, 240, 800], 96), 1);
  assert.equal(getActiveSectionIndex([180, 420, 800], 96), 0);
});

test('getActiveSectionIndex keeps the final section active at the page boundary', () => {
  assert.equal(getActiveSectionIndex([-600, -120, 240], 96, true), 2);
});

test('clampScrollTarget keeps first and last sections within page bounds', () => {
  assert.equal(clampScrollTarget(-70, 2000), 0);
  assert.equal(clampScrollTarget(2400, 2000), 2000);
  assert.equal(clampScrollTarget(700, 2000), 700);
});

test('hasReachedScrollTarget tolerates small final smooth-scroll differences', () => {
  assert.equal(hasReachedScrollTarget(996, 1000), true);
  assert.equal(hasReachedScrollTarget(995, 1000), false);
});

test('areTocEntriesEqual detects real structure changes', () => {
  const toc = [{ id: 'title', text: 'Article', level: 1 }];
  assert.equal(areTocEntriesEqual(toc, toc.map((entry) => ({ ...entry }))), true);
  assert.equal(areTocEntriesEqual(toc, [{ ...toc[0], text: 'New article' }]), false);
  assert.equal(areTocEntriesEqual(toc, [...toc, { id: 'section', text: 'Section', level: 2 }]), false);
});
