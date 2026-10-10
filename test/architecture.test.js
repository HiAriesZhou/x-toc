import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const libraryDir = path.resolve(import.meta.dirname, '../src/library');

test('src/library stays independent of the content script and Library page', () => {
  for (const file of fs.readdirSync(libraryDir).filter((name) => name.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(libraryDir, file), 'utf8');
    const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);
    for (const target of imports) {
      assert.doesNotMatch(target, /\.\.\/(options|content|popup)\//, `${file} imports ${target}`);
    }
  }
});
