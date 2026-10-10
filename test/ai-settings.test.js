import test from 'node:test';
import assert from 'node:assert/strict';
import { aiFormSubmitAction } from '../src/options/ai-settings.js';

test('Enter connects when not yet connected', () => {
  assert.equal(aiFormSubmitAction(false, false), 'connect');
  assert.equal(aiFormSubmitAction(false, true), 'connect');
});

test('Enter saves model when connected with a Model ID field', () => {
  assert.equal(aiFormSubmitAction(true, true), 'save-model');
});

test('Enter is a no-op when connected with the model dropdown', () => {
  assert.equal(aiFormSubmitAction(true, false), 'noop');
});
