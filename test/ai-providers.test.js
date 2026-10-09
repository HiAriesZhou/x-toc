import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROVIDERS,
  detectProvider,
  parseModelList,
  pickDefaultModel
} from '../src/library/ai-providers.js';
import { chatUrl, modelsUrl, normalizeBaseUrl, providerErrorMessage } from '../src/library/ai.js';

test('every preset has an HTTPS base URL and a key page; custom comes last', () => {
  for (const provider of PROVIDERS.filter((p) => p.id !== 'custom')) {
    assert.equal(normalizeBaseUrl(provider.baseUrl), provider.baseUrl);
    assert.match(provider.keyUrl, /^https:\/\//);
  }
  assert.equal(PROVIDERS.at(-1).id, 'custom');
  assert.equal(new Set(PROVIDERS.map((p) => p.id)).size, PROVIDERS.length);
});

test('base URLs are normalized and request URLs derived from them', () => {
  assert.equal(normalizeBaseUrl('https://api.deepseek.com/'), 'https://api.deepseek.com');
  assert.equal(normalizeBaseUrl('https://x.test/v1/chat/completions'), 'https://x.test/v1');
  assert.equal(chatUrl('https://x.test/v1'), 'https://x.test/v1/chat/completions');
  assert.equal(modelsUrl('https://x.test/v1'), 'https://x.test/v1/models');
  assert.throws(() => normalizeBaseUrl('http://x.test'));
  assert.throws(() => normalizeBaseUrl('https://user:pass@x.test'));
});

test('a stored base URL maps back to its preset, otherwise to custom', () => {
  assert.equal(detectProvider('https://api.deepseek.com').id, 'deepseek');
  assert.equal(detectProvider('https://llm.example.com/v1').id, 'custom');
});

test('model lists keep chat models, strip prefixes and sort', () => {
  const ids = parseModelList({
    data: [
      { id: 'models/gemini-flash-latest' },
      { id: 'text-embedding-3-small' },
      { id: 'whisper-1' },
      { id: 'gpt-image-1' },
      { id: 'deepseek-flash' },
      { id: 'deepseek-flash' }
    ]
  });
  assert.deepEqual(ids, ['deepseek-flash', 'gemini-flash-latest']);
  assert.deepEqual(parseModelList({}), []);
});

test('default model follows the provider preference, then the first model', () => {
  const gemini = PROVIDERS.find((p) => p.id === 'gemini');
  assert.equal(
    pickDefaultModel(gemini, ['gemini-pro', 'gemini-flash', 'gemini-flash-lite']),
    'gemini-flash'
  );
  const anthropic = PROVIDERS.find((p) => p.id === 'anthropic');
  assert.equal(pickDefaultModel(anthropic, ['claude-opus-x', 'claude-haiku-x']), 'claude-haiku-x');
  assert.equal(pickDefaultModel(PROVIDERS.at(-1), ['b-model', 'a-model']), 'b-model');
  assert.equal(pickDefaultModel(gemini, []), '');
});

test('provider error messages surface the provider explanation', () => {
  const body = JSON.stringify({
    error: { message: 'The supported API model names are deepseek-chat.' }
  });
  assert.equal(providerErrorMessage(400, body), 'The supported API model names are deepseek-chat.');
  assert.equal(providerErrorMessage(401, ''), 'Invalid API key.');
  assert.equal(providerErrorMessage(503, 'not json'), 'The provider returned HTTP 503.');
  assert.ok(
    providerErrorMessage(400, JSON.stringify({ error: { message: 'x'.repeat(500) } })).length <= 241
  );
});
