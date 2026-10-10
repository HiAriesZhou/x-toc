// Chrome does not inject content scripts into tabs that were already open when
// the extension is installed or updated. The background re-injects them so X
// tabs keep working without a reload. Firefox does this itself.

// Supports the scheme://host/* patterns this extension declares.
export function matchesPattern(url, pattern) {
  const match = /^(https?):\/\/([^/]+)\/\*$/.exec(pattern);
  if (!match) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === `${match[1]}:` && parsed.hostname === match[2];
  } catch {
    return false;
  }
}

export function reinjectionTargets(manifest, tabs) {
  const scripts = manifest.content_scripts || [];
  return tabs
    .filter((tab) => Number.isInteger(tab.id) && tab.url && !tab.discarded)
    .flatMap((tab) =>
      scripts
        .filter((script) => script.matches.some((pattern) => matchesPattern(tab.url, pattern)))
        .map((script) => ({ tabId: tab.id, js: script.js || [], css: script.css || [] }))
    );
}
