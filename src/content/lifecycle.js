// Keeps exactly one live XTOC instance per page. When the extension is updated
// the old content script loses its connection ("Extension context invalidated")
// while its panel stays on the page. The new instance announces itself with a
// DOM event (shared across script worlds) so the old one removes its UI, and
// an orphaned instance also cleans up once it notices the context is gone.
export const REPLACE_EVENT = 'xtoc:replace';
const ORPHAN_CHECK_MS = 3000;

export function createLifecycle({
  doc = document,
  isAlive,
  onTeardown,
  intervalMs = ORPHAN_CHECK_MS
}) {
  let timer = null;
  let done = false;

  function teardown() {
    if (done) return;
    done = true;
    clearInterval(timer);
    doc.removeEventListener(REPLACE_EVENT, teardown);
    onTeardown();
  }

  return {
    start() {
      doc.dispatchEvent(new Event(REPLACE_EVENT));
      doc.addEventListener(REPLACE_EVENT, teardown);
      timer = setInterval(() => {
        if (!isAlive()) teardown();
      }, intervalMs);
    },
    teardown
  };
}
