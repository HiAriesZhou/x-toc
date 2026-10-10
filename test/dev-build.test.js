import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { decodePng, encodePng } from '../tooling/png.mjs';
import { DEV_ICON_SIZES, brandDevIcon } from '../tooling/generate-dev-icons.mjs';
import { DEV_ICONS, applyDevBranding } from '../tooling/build-dev.mjs';

const productionManifest = {
  manifest_version: 3,
  name: 'XTOC: Navigate & Clip X Articles',
  version: '0.7.0',
  icons: { 16: 'icons/logo-16.png', 128: 'icons/logo-128.png' },
  action: { default_title: 'XTOC', default_icon: { 16: 'icons/logo-16.png' } }
};

test('dev branding renames the build and swaps every icon without mutating the input', () => {
  const branded = applyDevBranding(productionManifest);
  assert.equal(branded.name, 'XTOC (Development)');
  assert.equal(branded.action.default_title, 'XTOC DEV');
  assert.deepEqual(branded.icons, DEV_ICONS);
  assert.deepEqual(branded.action.default_icon, DEV_ICONS);
  assert.equal(branded.version, '0.7.0');
  assert.equal(productionManifest.name, 'XTOC: Navigate & Clip X Articles');
  assert.equal(productionManifest.icons[16], 'icons/logo-16.png');
});

test('dev branding rejects non-Chromium manifests', () => {
  assert.throws(() => applyDevBranding({ ...productionManifest, manifest_version: 2 }), /Chromium/);
});

test('committed dev icons match the generator output for the official logo', () => {
  for (const size of DEV_ICON_SIZES) {
    const official = decodePng(readFileSync(`src/icons/logo-${size}.png`));
    // Compare pixels, not PNG bytes: zlib output differs between Node versions.
    const committed = decodePng(readFileSync(`tooling/dev-icons/logo-${size}.png`));
    const expected = decodePng(encodePng(brandDevIcon(official)));
    assert.equal(committed.width, expected.width, `logo-${size}.png width`);
    assert.ok(committed.pixels.equals(expected.pixels), `logo-${size}.png is stale`);
  }
});

test('production manifest never references dev icons', () => {
  assert.doesNotMatch(readFileSync('src/manifest.json', 'utf8'), /dev-icons/);
  assert.ok(existsSync('tooling/dev-icons/logo-16.png'));
});

test('dev build seed path matches the runtime path and is absent from src', async () => {
  const { DEV_SEED_TARGET } = await import('../tooling/build-dev.mjs');
  const { SEED_PATH } = await import('../src/library/dev-seed.js');
  assert.equal(DEV_SEED_TARGET, SEED_PATH);
  assert.equal(existsSync(`src/${SEED_PATH}`), false);
});
