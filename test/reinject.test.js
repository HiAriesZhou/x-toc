import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesPattern, reinjectionTargets } from '../src/reinject.js';

const manifest = {
  content_scripts: [
    {
      matches: ['https://x.com/*', 'https://twitter.com/*'],
      js: ['content_scripts/content-0.js'],
      css: ['content_scripts/content-0.css']
    }
  ]
};

test('match patterns accept the declared hosts only', () => {
  assert.equal(matchesPattern('https://x.com/i/history', 'https://x.com/*'), true);
  assert.equal(matchesPattern('https://x.com.evil.test/a', 'https://x.com/*'), false);
  assert.equal(matchesPattern('http://x.com/a', 'https://x.com/*'), false);
  assert.equal(matchesPattern('https://twitter.com/a/status/1', 'https://twitter.com/*'), true);
});

test('open X tabs get the content script again; other, discarded or unloaded tabs are skipped', () => {
  const tabs = [
    { id: 1, url: 'https://x.com/home' },
    { id: 2, url: 'https://example.com/' },
    { id: 3, url: 'https://twitter.com/a/status/1', discarded: true },
    { id: 4 },
    { id: 5, url: 'https://twitter.com/a/status/2' }
  ];
  assert.deepEqual(reinjectionTargets(manifest, tabs), [
    { tabId: 1, js: ['content_scripts/content-0.js'], css: ['content_scripts/content-0.css'] },
    { tabId: 5, js: ['content_scripts/content-0.js'], css: ['content_scripts/content-0.css'] }
  ]);
});
