// Popup entry point
document.addEventListener('DOMContentLoaded', async () => {
  const root = document.getElementById('root');

  function renderOptionsButton() {
    return '<button class="options-link-btn" id="optionsBtn" type="button">Clips</button>';
  }

  function bindOptionsButton() {
    const optionsBtn = document.getElementById('optionsBtn');
    optionsBtn?.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
      window.close();
    });
  }

  // Get current tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isTwitter = tab?.url?.includes('x.com') || tab?.url?.includes('twitter.com');

  if (!isTwitter) {
    root.innerHTML = `
      <div class="container">
        <div class="header">
          <h1>X & Twitter TOC</h1>
          ${renderOptionsButton()}
        </div>
        <div class="content">
          <p class="hint">Please use this extension on Twitter/X</p>
        </div>
      </div>
    `;
    bindOptionsButton();
    return;
  }

  // Request TOC data from content script
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getTOC' });

    if (response && response.toc && response.toc.length > 0) {
      renderTOC(response.toc, response.isPanelVisible, tab.id);
    } else {
      renderEmpty('No table of contents found. Make sure you are on a long-form article.');
    }
  } catch (error) {
    renderEmpty('Unable to get TOC. Please refresh the page and try again.');
  }

  function renderTOC(toc, isPanelVisible, tabId) {
    root.innerHTML = `
      <div class="container">
        <div class="header">
          <h1>Contents</h1>
          <div class="header-actions">
            ${renderOptionsButton()}
            <button class="pin-icon-btn ${isPanelVisible ? 'active' : ''}" id="pinBtn" type="button" title="${isPanelVisible ? 'Hide pinned contents' : 'Pin beside article'}" aria-label="${isPanelVisible ? 'Hide pinned table of contents' : 'Pin table of contents beside article'}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                ${isPanelVisible ? `
                <path d="M12 17v5"/>
                <path d="M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89"/>
                <path d="m2 2 20 20"/>
                <path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11"/>
                ` : `
                <path d="M12 17v5"/>
                <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>
                `}
              </svg>
            </button>
          </div>
        </div>
        <ul class="toc-list">
          ${toc.map((item, index) => `
            <li class="toc-item level-${item.level}" data-index="${index}" data-id="${item.id}">
              <a href="#" class="toc-link">${item.text}</a>
            </li>
          `).join('')}
        </ul>
      </div>
    `;

    // Add click handlers for TOC items
    root.querySelectorAll('.toc-link').forEach(link => {
      link.addEventListener('click', async (e) => {
        e.preventDefault();
        const index = e.target.closest('.toc-item').dataset.index;
        await chrome.tabs.sendMessage(tabId, {
          action: 'scrollTo',
          index: parseInt(index)
        });
      });
    });

    // Add click handler for pin button
    const pinBtn = document.getElementById('pinBtn');
    pinBtn.addEventListener('click', async () => {
      await chrome.tabs.sendMessage(tabId, { action: 'togglePanel' });
      // Close popup after pinning
      window.close();
    });

    bindOptionsButton();
  }

  function renderEmpty(message) {
    root.innerHTML = `
      <div class="container">
        <div class="header">
          <h1>X & Twitter TOC</h1>
          ${renderOptionsButton()}
        </div>
        <div class="content">
          <p class="empty">${message}</p>
        </div>
      </div>
    `;
    bindOptionsButton();
  }
});
