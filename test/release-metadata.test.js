import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readText = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const readJson = (file) => JSON.parse(readText(file));

const packageVersion = readJson('package.json').version;
const portfolio = readJson('.portfolio/project.json');

function compareVersions(left, right) {
  const [a, b] = [left, right].map((version) => version.split('.').map(Number));
  return a.reduce((result, part, index) => result || part - b[index], 0);
}

test('extension, package, and README versions agree and never fall behind the published release', () => {
  assert.equal(readJson('src/manifest.json').version, packageVersion);
  const lock = readJson('package-lock.json');
  assert.equal(lock.version, packageVersion, 'package-lock.json');
  assert.equal(lock.packages[''].version, packageVersion, 'package-lock.json root package');

  const escaped = packageVersion.replaceAll('.', '\\.');
  for (const readme of ['README.md', 'README.zh-CN.md']) {
    assert.match(readText(readme), new RegExp(`version-${escaped}-[^"]+" alt="Version ${escaped}"`), readme);
  }

  assert.ok(
    compareVersions(packageVersion, portfolio.releaseVersion) >= 0,
    `${packageVersion} is older than published ${portfolio.releaseVersion}`
  );
});

test('portfolio manifest points at its release and existing assets', () => {
  assert.equal(portfolio.slug, 'x-toc');
  assert.equal(
    portfolio.links.release,
    `https://github.com/HiAriesZhou/x-toc/releases/tag/v${portfolio.releaseVersion}`
  );

  for (const asset of Object.values(portfolio.assets)) {
    assert.ok(!path.isAbsolute(asset) && !asset.includes('..'), `Unsafe asset path: ${asset}`);
    assert.ok(fs.existsSync(path.join(root, asset)), `Missing asset: ${asset}`);
  }
});
