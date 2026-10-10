import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { AI_DATA_COLLECTION, aiPermissions, isFirefoxExtension } from '../src/library/ai-permissions.js';

test('Chromium requests only the AI provider origin', () => {
  assert.deepEqual(aiPermissions('https://api.example.com/v1', false), { origins: ['https://api.example.com/*'] });
});

test('Firefox also requests consent to transmit website content', () => {
  assert.deepEqual(AI_DATA_COLLECTION, ['websiteContent']);
  assert.deepEqual(aiPermissions('https://api.example.com/v1', true), {
    origins: ['https://api.example.com/*'],
    data_collection: ['websiteContent']
  });
});

test('detects Firefox from the extension URL scheme', () => {
  assert.equal(isFirefoxExtension(() => 'moz-extension://abc/'), true);
  assert.equal(isFirefoxExtension(() => 'chrome-extension://abc/'), false);
});

test('the Firefox manifest declares no required data collection and optional website content', () => {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../src/manifest.json'), 'utf8'));
  assert.deepEqual(manifest['firefox:browser_specific_settings'], {
    gecko: {
      id: 'xtoc@arieszhou.com',
      // permissions.request({ data_collection }) needs Firefox 140 or later.
      strict_min_version: '140.0',
      data_collection_permissions: { required: ['none'], optional: AI_DATA_COLLECTION }
    },
    gecko_android: { strict_min_version: '142.0' }
  });
});
