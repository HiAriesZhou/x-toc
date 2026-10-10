import test from 'node:test';
import assert from 'node:assert/strict';
import { TARGETS, manifestProblems, releaseFileName } from '../tooling/package-release.mjs';

test('one package per store plus the Firefox source archive', () => {
  assert.deepEqual(
    TARGETS.map((t) => [t.id, t.dir, t.manifestVersion]),
    [
      ['chrome', 'dist/chromium', 3],
      ['edge', 'dist/edge', 3],
      ['firefox', 'dist/firefox', 2]
    ]
  );
  assert.equal(releaseFileName('firefox', '0.7.0'), 'xtoc-firefox-v0.7.0.zip');
  assert.equal(releaseFileName('source', '0.7.0'), 'xtoc-source-v0.7.0.zip');
});

test('manifest checks catch wrong versions, wrong manifest versions and dev branding', () => {
  const chrome = TARGETS[0];
  const good = {
    manifest_version: 3,
    version: '0.7.0',
    name: 'XTOC: Navigate & Clip X Articles',
    icons: { 16: 'icons/logo-16.png' }
  };
  assert.deepEqual(manifestProblems(good, chrome, '0.7.0'), []);
  assert.match(
    manifestProblems({ ...good, version: '0.6.2' }, chrome, '0.7.0').join(),
    /version 0\.6\.2/
  );
  assert.match(
    manifestProblems({ ...good, manifest_version: 2 }, chrome, '0.7.0').join(),
    /Manifest V2/
  );
  assert.match(
    manifestProblems({ ...good, name: 'XTOC (Development)' }, chrome, '0.7.0').join(),
    /development/i
  );
  assert.match(
    manifestProblems({ ...good, icons: { 16: 'dev-icons/logo-16.png' } }, chrome, '0.7.0').join(),
    /dev icons/
  );
});
