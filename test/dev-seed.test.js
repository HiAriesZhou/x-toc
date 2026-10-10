import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applySeed, removeSeed, SEED_PREFIX } from '../src/library/dev-seed.js';
import { clipGroups, readState } from '../src/library/model.js';

const seed = JSON.parse(readFileSync('tooling/dev-seed.json', 'utf8'));

test('development seed provides 20 valid mock clips across several articles', () => {
  const state = readState();
  assert.deepEqual(applySeed(state, seed), { added: 20 });
  const groups = clipGroups(state);
  assert.equal(
    groups.reduce((sum, group) => sum + group.excerpts.length, 0),
    20
  );
  assert.ok(groups.length >= 4);
  assert.ok(
    [...Object.keys(state.articles), ...Object.keys(state.clips)].every((id) =>
      id.startsWith(SEED_PREFIX)
    )
  );
});

test('loading the seed twice adds nothing; removing it keeps real data', () => {
  const state = readState({
    twitterTocArticles: {
      article_1: { id: 'article_1', canonicalUrl: 'https://x.com/a/status/1', title: 'Real' }
    },
    twitterTocExcerpts: { real_clip: { id: 'real_clip', articleId: 'article_1', text: 'Mine' } }
  });
  applySeed(state, seed);
  assert.deepEqual(applySeed(state, seed), { added: 0 });
  assert.deepEqual(removeSeed(state), { removed: 20 });
  assert.deepEqual(Object.keys(state.clips), ['real_clip']);
  assert.deepEqual(Object.keys(state.articles), ['article_1']);
});

test('seed entries without the mock prefix are rejected', () => {
  const bad = { articles: seed.articles, clips: [{ ...seed.clips[0], id: 'real_id' }] };
  assert.throws(() => applySeed(readState(), bad), /must start with "mock_"/);
});
