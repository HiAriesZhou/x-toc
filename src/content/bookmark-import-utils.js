// X moved Bookmarks from /i/bookmarks into a tab of /i/history. Both routes are
// supported; the History page also has a Likes tab, so each post is checked.
export function isBookmarksRoute(pathname) {
  return /^\/i\/(?:bookmarks|history)(?:\/|$)/.test(pathname);
}

// X renders the bookmark action as "removeBookmark" once a post is saved. This
// does not depend on UI language or which History tab is open.
export function isBookmarkedTweet(node) {
  return Boolean(node.querySelector('[data-testid="removeBookmark"]'));
}

const join = (...parts) => parts.filter(Boolean).join(' · ');

// One short line per import state. Reasons: end, cancelled, no-bookmarks,
// limit, page-changed, storage, error.
export function importLabel({ phase, reason, added = 0, duplicates = 0, failed = 0 }) {
  if (phase === 'idle') return { tone: 'info', text: 'Import to XTOC' };
  if (phase === 'running') return { tone: 'info', text: `Importing · ${added + duplicates}` };
  if (phase === 'paused') return { tone: 'info', text: `Paused · ${added + duplicates}` };
  const skipped = failed ? `${failed} skipped` : '';
  if (reason === 'no-bookmarks') return { tone: 'warning', text: 'No bookmarks on this tab' };
  if (reason === 'error') return { tone: 'error', text: 'Import failed · try again' };
  if (reason === 'storage')
    return { tone: 'error', text: join('Storage is full', `${added} imported`) };
  if (reason === 'cancelled')
    return { tone: 'info', text: join('Stopped', `${added} imported`, skipped) };
  if (reason === 'page-changed')
    return { tone: 'info', text: join('Page changed', `${added} imported`) };
  if (reason === 'limit')
    return { tone: 'success', text: join(`${added} imported`, 'run again for more') };
  if (!added && duplicates)
    return { tone: 'success', text: join(`All ${duplicates} already saved`, skipped) };
  return {
    tone: 'success',
    text: join(`${added} imported`, duplicates ? `${duplicates} already saved` : '', skipped)
  };
}
