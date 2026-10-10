// DOM and extension-context helpers shared by the content-script features.
export function isExtensionElement(element) {
  return Boolean(
    element?.closest?.('#twitter-toc-panel') || element?.closest?.('#xtoc-save-excerpt-button')
  );
}

export function isExtensionMutation(mutation) {
  const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
  if (changedNodes.length === 0) return isExtensionElement(mutation.target);

  return changedNodes.every((node) => {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return isExtensionElement(element);
  });
}

export function isExtensionContextAvailable() {
  try {
    return Boolean(globalThis.chrome?.runtime?.id);
  } catch {
    return false;
  }
}

export function isExtensionContextError(error) {
  return /extension context invalidated/i.test(error?.message || '');
}

export function getCanonicalUrl() {
  const currentUrl = `${window.location.origin}${window.location.pathname}`;
  if (getStatusId(currentUrl)) {
    return currentUrl;
  }

  const canonicalLink = document.querySelector('link[rel="canonical"]');
  if (canonicalLink?.href && getStatusId(canonicalLink.href)) {
    return canonicalLink.href.split('?')[0].split('#')[0];
  }

  return currentUrl;
}

export function getStatusId(url = getCanonicalUrl()) {
  const match = url.match(/\/status(?:es)?\/(\d+)/);
  return match ? match[1] : null;
}

// Find the article container (handles both regular tweet and fullscreen article views)
export function findArticleContainer() {
  // Try regular tweet article first
  let container = document.querySelector('article');
  if (container) return container;

  // Try fullscreen article view: data-testid="twitterArticleReadView"
  container = document.querySelector('[data-testid="twitterArticleReadView"]');
  if (container) return container;

  // Try main element as last resort
  container = document.querySelector('main[role="main"]');
  if (container) return container;

  return null;
}
