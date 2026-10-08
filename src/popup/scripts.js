// Popup entry point
document.addEventListener('DOMContentLoaded', async () => {
  const root = document.getElementById('root');
  const repositoryUrl = 'https://github.com/HiAriesZhou/x-toc';

  function renderOptionsButton() {
    return '<button class="options-link-btn" id="optionsBtn" type="button">Library</button>';
  }

  function renderFooter() {
    return `
      <footer class="popup-footer">
        <span>Enjoying XTOC? Give it a</span>
        <a href="${repositoryUrl}" target="_blank" rel="noopener noreferrer" aria-label="Star XTOC on GitHub">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3.28-.36 6.72-1.61 6.72-7A5.4 5.4 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.4 5.4 0 0 0-1.42 2.73c0 5.42 3.44 6.66 6.72 7A4.8 4.8 0 0 0 9 18v4"/>
            <path d="M9 18c-4.51 2-5-2-7-2"/>
          </svg>
          <span>Star</span>
        </a>
        <span>on GitHub ⭐</span>
      </footer>
    `;
  }

  function bindOptionsButton() {
    const optionsBtn = document.getElementById('optionsBtn');
    optionsBtn?.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
      window.close();
    });
    if (isTwitter) {
      const box = document.createElement('div'); box.className = 'capture-actions';
      const save = document.createElement('button'); save.type = 'button'; save.className = 'options-link-btn'; save.textContent = 'Save page to Library';
      const status = document.createElement('p'); status.className = 'hint'; status.setAttribute('role', 'status');
      box.append(save, status); root.querySelector('.container').insertBefore(box, root.querySelector('.popup-footer'));
      save.onclick = async () => {
        save.disabled = true;
        try { const result = await chrome.tabs.sendMessage(tab.id, { action: 'captureCurrent' }); if (!result?.ok) throw new Error(result?.error || 'Capture failed.'); status.textContent = result.data?.duplicate ? 'Already in Library. Saved text was refreshed unless a verified body exists.' : 'Saved as a partial capture. Review completeness in Library.'; }
        catch (e) { status.textContent = e.message; }
        finally { save.disabled = false; }
      };
    }
  }

  // Get current tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isTwitter = /^https:\/\/(x\.com|twitter\.com)\//.test(tab?.url || '');

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
        ${renderFooter()}
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
              <a href="#" class="toc-link">${String(item.text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</a>
            </li>
          `).join('')}
        </ul>
        ${renderFooter()}
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
        ${renderFooter()}
      </div>
    `;
    bindOptionsButton();
  }
});
