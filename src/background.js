// Background script for Twitter TOC extension

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'showTOC',
    title: 'Show Table of Contents',
    contexts: ['page'],
    documentUrlPatterns: [
      'https://x.com/*',
      'https://twitter.com/*'
    ]
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'showTOC') {
    // Open popup programmatically
    chrome.action.openPopup();
  }
});

// Open the clip library from the pinned in-page panel.
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'openClips') {
    chrome.runtime.openOptionsPage();
  }
});
