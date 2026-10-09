import test from 'node:test';
import assert from 'node:assert/strict';
import { moveIndex, typeaheadIndex } from '../src/options/dropdown.js';

test('arrow keys wrap around and Home/End jump to the ends', () => {
  assert.equal(moveIndex(0, 'ArrowDown', 3), 1);
  assert.equal(moveIndex(2, 'ArrowDown', 3), 0);
  assert.equal(moveIndex(0, 'ArrowUp', 3), 2);
  assert.equal(moveIndex(-1, 'ArrowDown', 3), 0);
  assert.equal(moveIndex(-1, 'ArrowUp', 3), 2);
  assert.equal(moveIndex(1, 'Home', 3), 0);
  assert.equal(moveIndex(1, 'End', 3), 2);
  assert.equal(moveIndex(1, 'Enter', 3), 1);
  assert.equal(moveIndex(0, 'ArrowDown', 0), -1);
});

test('typeahead finds the next label starting with the typed character', () => {
  const labels = ['All tags', 'design', 'Deep work', 'reading'];
  assert.equal(typeaheadIndex(labels, 0, 'd'), 1);
  assert.equal(typeaheadIndex(labels, 1, 'D'), 2);
  assert.equal(typeaheadIndex(labels, 2, 'd'), 1);
  assert.equal(typeaheadIndex(labels, 0, 'z'), -1);
});
