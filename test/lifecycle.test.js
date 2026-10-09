import test from 'node:test';
import assert from 'node:assert/strict';
import { createLifecycle, REPLACE_EVENT } from '../src/content/lifecycle.js';

test('a newer instance tears down the previous one, but not itself', () => {
  const doc = new EventTarget();
  const calls = [];
  const first = createLifecycle({
    doc,
    isAlive: () => true,
    onTeardown: () => calls.push('first')
  });
  first.start();
  const second = createLifecycle({
    doc,
    isAlive: () => true,
    onTeardown: () => calls.push('second')
  });
  second.start();
  assert.deepEqual(calls, ['first']);
  doc.dispatchEvent(new Event(REPLACE_EVENT));
  assert.deepEqual(calls, ['first', 'second']);
  second.teardown();
  assert.deepEqual(calls, ['first', 'second'], 'teardown runs once');
});

test('an orphaned instance cleans up when the extension context is gone', async () => {
  const doc = new EventTarget();
  let alive = true;
  let tornDown = 0;
  const lifecycle = createLifecycle({
    doc,
    isAlive: () => alive,
    onTeardown: () => tornDown++,
    intervalMs: 5
  });
  lifecycle.start();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(tornDown, 0);
  alive = false;
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(tornDown, 1);
});
