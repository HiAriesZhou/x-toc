import test from 'node:test';
import assert from 'node:assert/strict';
import { createVault, memoryStore } from '../src/library/key-vault.js';

test('a remembered key round-trips and is never stored in plain text', async () => {
  const store = memoryStore();
  const vault = createVault({ store });
  await vault.save({ key: 'synthetic-secret-key', endpoint: 'https://api.example.com/v1' });
  assert.deepEqual(await vault.load(), {
    key: 'synthetic-secret-key',
    endpoint: 'https://api.example.com/v1'
  });
  const raw = JSON.stringify(
    [...store.entries()].map(([name, value]) => [
      name,
      value?.data ? Buffer.from(value.data).toString('latin1') : String(value)
    ])
  );
  assert.doesNotMatch(raw, /synthetic-secret-key/);
});

test('the wrapping key cannot be exported', async () => {
  const store = memoryStore();
  await createVault({ store }).save({ key: 'k', endpoint: 'https://a.example' });
  const wrappingKey = store.entries().find(([name]) => name === 'wrapping-key')[1];
  assert.equal(wrappingKey.extractable, false);
  await assert.rejects(crypto.subtle.exportKey('raw', wrappingKey));
});

test('clearing removes the key; missing or corrupted records load as nothing', async () => {
  const store = memoryStore();
  const vault = createVault({ store });
  assert.equal(await vault.load(), null);
  await vault.save({ key: 'k', endpoint: 'https://a.example' });
  await vault.clear();
  assert.equal(await vault.load(), null);
  await vault.save({ key: 'k', endpoint: 'https://a.example' });
  await store.set('api-key', { iv: new Uint8Array(12), data: new Uint8Array([1, 2, 3]) });
  assert.equal(await vault.load(), null);
});
