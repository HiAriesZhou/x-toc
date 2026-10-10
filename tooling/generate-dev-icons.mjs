// Derive local-debug icons from the official logo so a Chrome load-unpacked
// build is recognizable at a glance. Output is committed under tooling/dev-icons
// and is never referenced by src/manifest.json, so it cannot ship to a store.
//
// Usage: node tooling/generate-dev-icons.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { decodePng, encodePng } from './png.mjs';

const root = path.resolve(import.meta.dirname, '..');
export const DEV_ICON_SIZES = [16, 32, 48, 128];
export const DEV_ICON_DIR = path.join(root, 'tooling', 'dev-icons');

const DEV_INK = [249, 115, 22]; // orange replaces the dark logo body
const DEV_STRIPE = [20, 184, 166]; // teal diagonal marks the corner
const INK_LUMINANCE_MAX = 0.35;
const STRIPE_START = 1.3; // band position along x + y, as a fraction of size
const STRIPE_END = 1.58;
const SAMPLES = 4; // supersampling per axis for anti-aliased stripe edges

const luminance = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

function stripeCoverage(x, y, size) {
  let hits = 0;
  for (let sy = 0; sy < SAMPLES; sy++) {
    for (let sx = 0; sx < SAMPLES; sx++) {
      const position = (x + (sx + 0.5) / SAMPLES + y + (sy + 0.5) / SAMPLES) / size;
      if (position >= STRIPE_START && position <= STRIPE_END) hits++;
    }
  }
  return hits / (SAMPLES * SAMPLES);
}

export function brandDevIcon({ width, height, pixels }) {
  const output = Buffer.from(pixels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let [r, g, b, a] = output.subarray(i, i + 4);
      if (a > 0 && luminance(r, g, b) < INK_LUMINANCE_MAX) [r, g, b] = DEV_INK;
      const coverage = stripeCoverage(x, y, width);
      if (coverage > 0) {
        const alpha = a / 255;
        const outAlpha = coverage + alpha * (1 - coverage);
        const blend = (stripe, base) =>
          Math.round((stripe * coverage + base * alpha * (1 - coverage)) / outAlpha);
        [r, g, b] = [blend(DEV_STRIPE[0], r), blend(DEV_STRIPE[1], g), blend(DEV_STRIPE[2], b)];
        a = Math.round(outAlpha * 255);
      }
      output.set([r, g, b, a], i);
    }
  }
  return { width, height, pixels: output };
}

async function main() {
  await mkdir(DEV_ICON_DIR, { recursive: true });
  for (const size of DEV_ICON_SIZES) {
    const source = decodePng(await readFile(path.join(root, 'src', 'icons', `logo-${size}.png`)));
    const target = path.join(DEV_ICON_DIR, `logo-${size}.png`);
    await writeFile(target, encodePng(brandDevIcon(source)));
    console.log(`Wrote ${path.relative(root, target)}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
