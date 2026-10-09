// Local Chrome debug build. Copies the Chromium build to dist/chromium-dev and
// rebrands it (name, toolbar title, icons) so it is never confused with the
// published extension. dist/chromium and release ZIPs stay untouched.
//
// Usage: npm run build:dev   (then load dist/chromium-dev in chrome://extensions)
import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const SOURCE_DIR = path.join(root, 'dist', 'chromium');
export const DEV_BUILD_DIR = path.join(root, 'dist', 'chromium-dev');
const DEV_ICON_SOURCE = path.join(root, 'tooling', 'dev-icons');
const DEV_SEED_SOURCE = path.join(root, 'tooling', 'dev-seed.json');
export const DEV_SEED_TARGET = 'dev/seed.json'; // must match SEED_PATH in src/library/dev-seed.js
const DEV_NAME = 'XTOC (Development)';
const DEV_TITLE = 'XTOC DEV';

export const DEV_ICONS = Object.freeze({
  16: 'dev-icons/logo-16.png',
  32: 'dev-icons/logo-32.png',
  48: 'dev-icons/logo-48.png',
  128: 'dev-icons/logo-128.png'
});

export function applyDevBranding(manifest) {
  if (manifest.manifest_version !== 3) {
    throw new Error('Dev branding expects the Chromium (Manifest V3) build.');
  }
  return {
    ...manifest,
    name: DEV_NAME,
    icons: { ...DEV_ICONS },
    action: { ...manifest.action, default_title: DEV_TITLE, default_icon: { ...DEV_ICONS } }
  };
}

async function main() {
  const manifestPath = path.join(DEV_BUILD_DIR, 'manifest.json');
  await rm(DEV_BUILD_DIR, { recursive: true, force: true });
  await cp(SOURCE_DIR, DEV_BUILD_DIR, { recursive: true });
  await cp(DEV_ICON_SOURCE, path.join(DEV_BUILD_DIR, 'dev-icons'), { recursive: true });
  await cp(DEV_SEED_SOURCE, path.join(DEV_BUILD_DIR, DEV_SEED_TARGET));
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const branded = applyDevBranding(manifest);
  await writeFile(manifestPath, `${JSON.stringify(branded, null, 2)}\n`);
  console.log(`${branded.name} ${branded.version} → ${path.relative(root, DEV_BUILD_DIR)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await main();
  } catch (error) {
    console.error(`Dev build failed: ${error.message}. Run "npm run build" first.`);
    process.exitCode = 1;
  }
}
