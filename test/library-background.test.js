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
          bookmark: { markdown: `Text ${i}` }
        },
        content
      )
    )
  );
  assert.ok(results.every((r) => r.ok));
  assert.equal(Object.keys(local.twitterTocArticles).length, 12);
  assert.equal(Object.keys(local.xtocLibraryItems).length, 12);
});
test('content scripts cannot read the library, configure AI, edit or delete', async () => {
  for (const action of [
    'library:load',
    'ai:configure',
    'ai:suggest',
    'library:edit',
    'library:delete'
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
    (await call('library:edit', { type: 'bookmark', id: 'article_1', tags: ['lost'], note: '' }))
      .ok,
    false
  );
  assert.deepEqual(local, before);
  failWrite = false;
  assert.equal(
    (await call('library:edit', { type: 'bookmark', id: 'article_1', tags: ['kept'], note: '' }))
      .ok,
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

test('switching models keeps the session key; local prefs never contain it', async () => {
  const endpoint = 'https://provider.example/v1';
  assert.equal(
    (
      await call('ai:configure', {
        provider: 'custom',
        endpoint,
        key: 'synthetic-key-2',
        model: ''
      })
    ).ok,
    true
  );
  const status = await call('ai:configure', { provider: 'custom', endpoint, model: 'model-b' });
  assert.equal(status.ok, true);
  assert.deepEqual(status.data, {
    connected: true,
    configured: true,
    remember: false,
    provider: 'custom',
    endpoint,
    model: 'model-b'
  });
  assert.equal(session.xtocAIConfig.key, 'synthetic-key-2');
  assert.deepEqual(local.xtocAIPrefs, {
    provider: 'custom',
    endpoint,
    model: 'model-b',
    remember: false
  });
  assert.equal(
    (await call('ai:configure', { endpoint: 'https://other.example/v1', model: 'x' })).ok,
    false
  );
  await call('ai:forget');
});

test('a remembered key survives a browser restart; Remove key forgets it everywhere', async () => {
  const endpoint = 'https://provider.example/v1';
  await call('ai:configure', {
    provider: 'custom',
    endpoint,
    key: 'synthetic-remembered',
    model: 'm',
    remember: true
  });
  assert.doesNotMatch(JSON.stringify(local), /synthetic-remembered/);
  delete session.xtocAIConfig; // browser restart clears session storage
  const restored = await call('ai:status');
  assert.equal(restored.data.connected, true);
  assert.equal(restored.data.remember, true);
  assert.equal(session.xtocAIConfig.key, 'synthetic-remembered');

  await call('ai:remember', { remember: false });
  delete session.xtocAIConfig;
  assert.equal((await call('ai:status')).data.connected, false);

  await call('ai:configure', {
    provider: 'custom',
    endpoint,
    key: 'synthetic-remembered',
    model: 'm',
    remember: true
  });
  await call('ai:forget');
  assert.equal((await call('ai:status')).data.connected, false);
  assert.equal(local.xtocAIPrefs.remember, false);
});

test('a remembered key is not reused for a different endpoint', async () => {
  await call('ai:configure', {
    provider: 'custom',
    endpoint: 'https://a.example/v1',
    key: 'synthetic-a',
    model: 'm',
    remember: true
  });
  local.xtocAIPrefs = { ...local.xtocAIPrefs, endpoint: 'https://b.example/v1' };
  delete session.xtocAIConfig;
  assert.equal((await call('ai:status')).data.connected, false);
  await call('ai:forget');
});

test('only one AI request runs at a time, even when two arrive together', async () => {
  const endpoint = 'https://provider.example/v1';
  await call('ai:configure', { provider: 'custom', endpoint, key: 'synthetic-key', model: 'm' });
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    await new Promise((resolve) => setTimeout(resolve, 20));
    const content = JSON.stringify({ tags: [], summary: '' });
    const body = JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content } }] });
    return { ok: true, status: 200, text: async () => body };
  };
  try {
    // ai:suggest reads the library before sending, which is where the race was.
    const results = await Promise.all([
      call('ai:suggest', { id: 'article_2', requestId: 'a' }),
      call('ai:suggest', { id: 'article_2', requestId: 'b' })
    ]);
    assert.deepEqual(results.map((r) => r.ok).sort(), [false, true]);
    assert.match(results.find((r) => !r.ok).error, /Another AI request/);
    assert.equal(requests, 1);
    assert.equal(
      (await call('ai:test', { requestId: 'c' })).ok,
      true,
      'the slot is released afterwards'
    );
  } finally {
    globalThis.fetch = originalFetch;
    await call('ai:forget');
  }
});
