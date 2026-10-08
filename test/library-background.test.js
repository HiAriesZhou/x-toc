import test from 'node:test';
import assert from 'node:assert/strict';

let listener;
let failWrite = false;
let local = {},
  session = {};
const area = (ref) => ({
  async get(keys) {
    await new Promise((r) => setTimeout(r, 1));
    const data = ref();
    return Object.fromEntries(
      (keys === null ? Object.keys(data) : Array.isArray(keys) ? keys : [keys])
        .filter((k) => Object.hasOwn(data, k))
        .map((k) => [k, structuredClone(data[k])])
    );
  },
  async set(data) {
    await new Promise((r) => setTimeout(r, 1));
    if (failWrite && ref() === local) throw new Error('QUOTA');
    Object.assign(ref(), structuredClone(data));
  },
  async remove(key) {
    delete ref()[key];
  },
  async setAccessLevel() {}
});
globalThis.chrome = {
  runtime: {
    id: 'test-extension',
    getURL: (p) => `chrome-extension://test-extension/${p}`,
    onInstalled: { addListener() {} },
    onMessage: {
      addListener(fn) {
        listener = fn;
      }
    },
    async openOptionsPage() {}
  },
  storage: { local: area(() => local), session: area(() => session) },
  permissions: {
    async contains() {
      return true;
    }
  },
  contextMenus: { onClicked: { addListener() {} } }
};
await import('../src/background.js');
const trusted = {
  id: 'test-extension',
  url: 'chrome-extension://test-extension/options/index.html'
};
const content = { id: 'test-extension', url: 'https://x.com/example/status/1', tab: { id: 1 } };
const call = (action, payload = {}, sender = trusted) =>
  new Promise((resolve) => listener({ action, payload }, sender, resolve));
test('background serializes concurrent content saves and keeps all records', async () => {
  const results = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      call(
        'library:capture',
        {
          article: {
            id: `article_${i}`,
            canonicalUrl: `https://x.com/example/status/${i}`,
            title: `Article ${i}`
          },
          item: { markdown: `Text ${i}`, contentStatus: 'partial' }
        },
        content
      )
    )
  );
  assert.ok(results.every((r) => r.ok));
  assert.equal(Object.keys(local.twitterTocArticles).length, 12);
  assert.equal(Object.keys(local.xtocLibraryItems).length, 12);
});
test('content scripts cannot read library, configure AI, edit metadata or restore backups', async () => {
  for (const action of [
    'library:load',
    'ai:configure',
    'ai:generate',
    'library:edit',
    'library:restoreBackup'
  ])
    assert.equal((await call(action, {}, content)).ok, false);
  assert.equal(
    (await call('library:capture', {}, { ...content, url: 'https://x.com.evil.test/' })).ok,
    false
  );
});
test('failed storage write is non-destructive and does not poison subsequent transactions', async () => {
  const before = structuredClone(local);
  failWrite = true;
  assert.equal(
    (await call('library:batch', { ids: ['article_1'], operation: 'addTags', tags: ['lost'] })).ok,
    false
  );
  assert.deepEqual(local, before);
  failWrite = false;
  assert.equal(
    (await call('library:batch', { ids: ['article_1'], operation: 'addTags', tags: ['kept'] })).ok,
    true
  );
  assert.deepEqual(local.xtocLibraryItems.article_1.tags, ['kept']);
});
test('AI session configuration never appears in persistent library data', async () => {
  const configured = await call('ai:configure', {
    endpoint: 'https://provider.example/v1',
    model: 'test-model',
    key: 'synthetic-test-only'
  });
  assert.equal(configured.ok, true);
  assert.doesNotMatch(JSON.stringify(local), /synthetic-test-only/);
  assert.doesNotMatch(JSON.stringify(await call('ai:status')), /synthetic-test-only/);
  assert.equal((await call('ai:forget')).ok, true);
  assert.equal(session.xtocAIConfig, undefined);
});
