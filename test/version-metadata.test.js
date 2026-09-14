import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
}

function versionParts(version) {
  return version.split('.').map(Number);
}

test('development version metadata stays aligned without advancing the published release', () => {
  const packageMetadata = readJson('package.json');
  const extensionManifest = readJson('src/manifest.json');
  const portfolioManifest = readJson('.portfolio/project.json');

  assert.equal(extensionManifest.version, packageMetadata.version);

  for (const readme of ['README.md', 'README.zh-CN.md']) {
    const contents = fs.readFileSync(path.join(root, readme), 'utf8');
    assert.match(contents, new RegExp(`version-${packageMetadata.version.replaceAll('.', '\\.')}-(?:blue|[0-9a-fA-F]{6})`));
    assert.match(contents, new RegExp(`Version ${packageMetadata.version.replaceAll('.', '\\.')}`));
  }

  const development = versionParts(packageMetadata.version);
  const published = versionParts(portfolioManifest.releaseVersion);
  assert.equal(development.length, 3);
  assert.equal(published.length, 3);
  assert.ok(
    development.some((part, index) => part > published[index] && development.slice(0, index).every((value, previousIndex) => value === published[previousIndex])) ||
      development.every((part, index) => part === published[index]),
    `Development version ${packageMetadata.version} must not be older than published version ${portfolioManifest.releaseVersion}`
  );
});
