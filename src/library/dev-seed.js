import { cleanArticle, cleanClip } from './model.js';

// Sample data for local development builds only. The data file is copied into
// dist/chromium-dev by tooling/build-dev.mjs and never ships in a release, and
// every sample ID carries this prefix so removal cannot touch real records.
export const SEED_PREFIX = 'mock_';
export const SEED_PATH = 'dev/seed.json';

const isMock = (id) => typeof id === 'string' && id.startsWith(SEED_PREFIX);

export function applySeed(state, seed) {
  const articles = (seed?.articles || []).map(cleanArticle);
  const clips = (seed?.clips || []).map(cleanClip);
  const ids = [...articles.map((a) => a.id), ...clips.flatMap((c) => [c.id, c.articleId])];
  if (!ids.length || !ids.every(isMock))
    throw new Error(`Every sample ID must start with "${SEED_PREFIX}".`);
  for (const article of articles) state.articles[article.id] ??= article;
  let added = 0;
  for (const clip of clips) {
    if (state.clips[clip.id]) continue;
    state.clips[clip.id] = clip;
    added++;
  }
  return { added };
}

export function removeSeed(state) {
  let removed = 0;
  for (const id of Object.keys(state.clips)) {
    if (!isMock(id)) continue;
    delete state.clips[id];
    removed++;
  }
  for (const field of ['articles', 'bookmarks']) {
    for (const id of Object.keys(state[field])) if (isMock(id)) delete state[field][id];
  }
  return { removed };
}
