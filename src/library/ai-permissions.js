// Optional AI sends saved text to the provider the user configures. Firefox treats
// that as transmitting website content and asks for consent alongside the origin;
// Chromium has no data-collection permission and rejects the extra key.
export const AI_DATA_COLLECTION = ['websiteContent'];

export const isFirefoxExtension = (getURL = (path) => chrome.runtime.getURL(path)) =>
  getURL('').startsWith('moz-extension:');

export const originPattern = (endpoint) => `${new URL(endpoint).origin}/*`;

export function aiPermissions(endpoint, firefox = isFirefoxExtension()) {
  return {
    origins: [originPattern(endpoint)],
    ...(firefox ? { data_collection: AI_DATA_COLLECTION } : {})
  };
}
