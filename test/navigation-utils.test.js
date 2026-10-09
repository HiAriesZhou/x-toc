import assert from 'node:assert/strict';
import test from 'node:test';

import {
  areTocEntriesEqual,
  clampScrollTarget,
  classifyXPage,
  getActiveSectionIndex
} from '../src/content/navigation-utils.js';

test('active section follows the reading line and holds the final section at page end', () => {
  assert.equal(getActiveSectionIndex([-400, -20, 240, 800], 96), 1);
  assert.equal(getActiveSectionIndex([180, 420, 800], 96), 0);
  assert.equal(getActiveSectionIndex([-600, -120, 240], 96, true), 2);
});

test('heading jumps stay within page bounds', () => {
  assert.equal(clampScrollTarget(-70, 2000), 0);
  assert.equal(clampScrollTarget(2400, 2000), 2000);
});

test('pinned panel re-renders only when the heading structure changes', () => {
  const toc = [{ id: 'title', text: 'Article', level: 1 }];
  assert.equal(areTocEntriesEqual(toc, toc.map((entry) => ({ ...entry }))), true);
  assert.equal(areTocEntriesEqual(toc, [{ ...toc[0], text: 'New article' }]), false);
});

test('page classification only treats status and article routes as saveable content', () => {
  assert.equal(classifyXPage('https://x.com/home', true), 'other');
  assert.equal(classifyXPage('https://x.com/i/bookmarks', true), 'other');
  assert.equal(classifyXPage('https://x.com/example', false), 'other');
  assert.equal(classifyXPage('https://x.com/example/status/123', false), 'post');
  assert.equal(classifyXPage('https://x.com/example/status/123', true), 'article');
  assert.equal(classifyXPage('https://twitter.com/i/article/456', false), 'article');
  assert.equal(classifyXPage('not a url', true), 'other');
});
