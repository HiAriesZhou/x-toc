// Packages the Chrome, Edge and Firefox builds for store upload, plus the
// source archive Mozilla reviewers need to reproduce the Firefox build.
// Run through `npm run build:zip`, which builds all three targets first.
//
// Output: release/xtoc-{chrome,edge,firefox,source}-v<version>.zip
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const RELEASE_DIR = path.join(root, 'release');

export const TARGETS = [
  { id: 'chrome', dir: 'dist/chromium', manifestVersion: 3 },
  { id: 'edge', dir: 'dist/edge', manifestVersion: 3 },
  { id: 'firefox', dir: 'dist/firefox', manifestVersion: 2 }
];

// Files that exist only in local development builds and must never ship.
const DEV_ONLY = /^(dev-icons\/|dev\/)/;

export const releaseFileName = (id, version) => `xtoc-${id}-v${version}.zip`;

export function manifestProblems(manifest, target, version) {
  const problems = [];
  if (manifest.version !== version) {
    problems.push(
      `${target.id}: manifest has version ${manifest.version}, package.json has ${version}`
    );
  }
  if (manifest.manifest_version !== target.manifestVersion) {
    problems.push(
      `${target.id}: expected Manifest V${target.manifestVersion}, found Manifest V${manifest.manifest_version}`
    );
  }
  if (/development/i.test(manifest.name || ''))
    problems.push(`${target.id}: manifest is a development build`);
  if (JSON.stringify(manifest.icons || {}).includes('dev-icons'))
    problems.push(`${target.id}: manifest uses dev icons`);
  return problems;
}

const run = (command, args, options = {}) =>
  execFileSync(command, args, { encoding: 'utf8', ...options });

function zipDirectory(sourceDir, outFile) {
  // -X drops extra file attributes so packages are reproducible across machines.
  run('zip', ['-r', '-X', '-q', outFile, '.'], { cwd: sourceDir });
  run('unzip', ['-tq', outFile]); // integrity check; throws on a corrupt archive
  const listing = run('unzip', ['-Z1', outFile]).split('\n').filter(Boolean);
  const leaked = listing.filter((entry) => DEV_ONLY.test(entry));
  if (leaked.length)
    throw new Error(`${path.basename(outFile)} contains development files: ${leaked.join(', ')}`);
  if (!listing.includes('manifest.json'))
    throw new Error(`${path.basename(outFile)} has no manifest.json at its root`);
}

function sourceArchive(outFile) {
  const dirty = run('git', ['status', '--porcelain'], { cwd: root }).trim();
  if (dirty) {
    return 'skipped: uncommitted changes would not match the built Firefox package. Commit, then run again.';
  }
  run('git', ['archive', '--format=zip', `--output=${outFile}`, 'HEAD'], { cwd: root });
  return `from commit ${run('git', ['rev-parse', '--short', 'HEAD'], { cwd: root }).trim()}`;
}

async function main() {
  const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const problems = [];
  for (const target of TARGETS) {
    const manifestPath = path.join(root, target.dir, 'manifest.json');
    if (!existsSync(manifestPath)) {
      problems.push(`${target.id}: ${target.dir} is missing; run the build first`);
      continue;
    }
    problems.push(
      ...manifestProblems(JSON.parse(await readFile(manifestPath, 'utf8')), target, version)
    );
  }
  if (problems.length) throw new Error(problems.join('\n'));

  await mkdir(RELEASE_DIR, { recursive: true });
  const lines = [];
  for (const target of TARGETS) {
    const outFile = path.join(RELEASE_DIR, releaseFileName(target.id, version));
    await rm(outFile, { force: true });
    zipDirectory(path.join(root, target.dir), outFile);
    lines.push(`${path.relative(root, outFile)}`);
  }
  const sourceFile = path.join(RELEASE_DIR, releaseFileName('source', version));
  await rm(sourceFile, { force: true });
  const sourceNote = sourceArchive(sourceFile);
  lines.push(`${path.relative(root, sourceFile)} (${sourceNote})`);
  console.log(`XTOC ${version} packages:\n  ${lines.join('\n  ')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await main();
  } catch (error) {
    console.error(`Packaging failed:\n${error.message}`);
    process.exitCode = 1;
  }
}
