import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('portfolio manifest has the public identity and referenced assets', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, '.portfolio/project.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.slug, 'x-toc');
  assert.equal(manifest.releaseStatus, 'published');
  assert.match(manifest.releaseVersion, /^\d+\.\d+\.\d+$/);
  assert.match(manifest.links.repository, /^https:\/\/github\.com\/HiAriesZhou\/x-toc$/);
  assert.equal(manifest.links.release, `https://github.com/HiAriesZhou/x-toc/releases/tag/v${manifest.releaseVersion}`);
  assert.deepEqual(Object.keys(manifest.locales).sort(), ['en', 'zh']);

  for (const asset of Object.values(manifest.assets)) {
    assert.equal(path.isAbsolute(asset), false);
    assert.equal(asset.includes('..'), false);
    assert.equal(fs.existsSync(path.join(root, asset)), true, `Missing manifest asset: ${asset}`);
  }
});
