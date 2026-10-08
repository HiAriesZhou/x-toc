import { itemsFor, backup, parseBackup, safeUrl } from '../library/model.js';
import { knowledgeFiles, zipFiles } from '../library/knowledge.js';
import { aiEndpoint } from '../library/ai.js';
import { renderAllJson, renderAllMarkdown } from './export-utils.js';
import { splitClipTagInput } from './clip-utils.js';

const $ = (id) => document.getElementById(id);
const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const labelStatus = (s) =>
  ({
    complete: 'Complete text · user verified',
    partial: 'Partial capture',
    excerpts_only: 'Excerpts only'
  })[s] || 'Partial capture';
const date = (v) =>
  v && !Number.isNaN(Date.parse(v)) ? new Date(v).toLocaleDateString() : 'Unknown date';
const rpc = async (action, payload = {}) => {
  const r = await chrome.runtime.sendMessage({ action, payload });
  if (!r?.ok) throw new Error(r?.error || 'Extension unavailable. Reload Library.');
  return r.data;
};
let state,
  view = 'all',
  focusId = '',
  selected = new Set(),
  limit = 50,
  dirty = false,
  rows = [],
  preview = [],
  aiRunning = false,
  activeRequest = '',
  stopAI = false;
const type = () =>
  view === 'clips' || (view === 'trash' && $('trashType').value === 'clip') ? 'clip' : 'item';
const say = (text, modal = false) => {
  $(modal ? 'modalStatus' : 'status').textContent = text;
};
const run =
  (fn) =>
  async (...args) => {
    try {
      await fn(...args);
    } catch (e) {
      say(e.message, $('modal').open);
    }
  };
function download(name, content, mime) {
  const url = URL.createObjectURL(
    content instanceof Blob ? content : new Blob([content], { type: mime })
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
const day = () => new Date().toISOString().slice(0, 10);
async function load() {
  state = await rpc('library:load');
  render();
}
function modal(title, html) {
  $('modalTitle').textContent = title;
  $('modalBody').onclick = null;
  $('modalBody').innerHTML = html;
  $('modalStatus').textContent = '';
  if (!$('modal').open) $('modal').showModal();
}
function canLeave() {
  if (dirty && !confirm('Discard unsaved edits?')) return false;
  dirty = false;
  return true;
}
function scopeIds() {
  return selected.size ? [...selected] : rows.map((r) => r.id);
}
function currentRows() {
  const parents = itemsFor(state);
  const parentMap = new Map(parents.map((i) => [i.id, i]));
  let list =
    type() === 'clip'
      ? Object.values(state.clips).map((c) => ({
          ...parentMap.get(c.articleId),
          ...c,
          tags: c.tags || [],
          note: c.note || '',
          trashedAt: c.trashedAt || '',
          title: parentMap.get(c.articleId)?.title || 'Untitled',
          parent: parentMap.get(c.articleId),
          kind: 'clip'
        }))
      : parents;
  const q = $('search').value.toLowerCase().trim(),
    author = $('author').value.toLowerCase().trim(),
    tag = $('tag').value;
  list = list.filter((i) => {
    if (Boolean(i.trashedAt) !== (view === 'trash')) return false;
    if (type() === 'clip' && i.parent?.trashedAt) return false;
    if (view === 'inbox' && i.organized) return false;
    if (view === 'bookmarks' && !i.bookmarked) return false;
    if (view.startsWith('collection:') && !i.collectionIds.includes(view.slice(11))) return false;
    if ($('kind').value && i.kind !== $('kind').value) return false;
    if (tag && !(i.tags || []).includes(tag)) return false;
    if (author && !`${i.authorName} ${i.authorHandle}`.toLowerCase().includes(author)) return false;
    if ($('organized').value && Boolean(i.organized) !== ($('organized').value === 'yes'))
      return false;
    const clipText = (i.clips || [])
      .filter((c) => !c.trashedAt)
      .map((c) => `${c.text} ${(c.tags || []).join(' ')} ${c.note || ''}`)
      .join(' ');
    return (
      !q ||
      `${i.title} ${i.markdown || i.text || ''} ${i.authorName} ${i.authorHandle} ${(i.tags || []).join(' ')} ${i.note || ''} ${i.summary || ''} ${clipText}`
        .toLowerCase()
        .includes(q)
    );
  });
  return list.sort(
    (a, b) =>
      (Date.parse($('sort').value === 'published' ? b.publishedAt : b.createdAt) || 0) -
      (Date.parse($('sort').value === 'published' ? a.publishedAt : a.createdAt) || 0)
  );
}
function render() {
  const title =
    { all: 'All content', inbox: 'Inbox', bookmarks: 'Bookmarks', clips: 'Clips', trash: 'Trash' }[
      view
    ] ||
    state.collections[view.slice(11)]?.name ||
    'Collection';
  $('viewTitle').textContent = title;
  $('allCount').textContent = itemsFor(state).filter((i) => !i.trashedAt).length;
  $('collections').innerHTML =
    Object.values(state.collections)
      .map((c) => `<button data-view="collection:${esc(c.id)}">${esc(c.name)}</button>`)
      .join('') || '<p class="muted">No collections yet</p>';
  document.querySelectorAll('[data-view]').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === view);
    b.setAttribute('aria-current', b.dataset.view === view ? 'page' : 'false');
  });
  const oldTag = $('tag').value;
  const tags = [
    ...new Set(
      [...Object.values(state.items), ...Object.values(state.clips)].flatMap((i) => i.tags || [])
    )
  ].sort();
  $('tag').innerHTML =
    '<option value="">All tags</option>' + tags.map((t) => `<option>${esc(t)}</option>`).join('');
  $('tag').value = tags.includes(oldTag) ? oldTag : '';
  $('trashType').hidden = view !== 'trash';
  $('kind').disabled = type() === 'clip';
  $('organized').disabled = type() === 'clip';
  rows = currentRows();
  selected = new Set([...selected].filter((id) => rows.some((r) => r.id === id)));
  $('count').textContent =
    `${rows.length} ${type() === 'clip' ? 'clips' : 'articles / posts'}${view === 'inbox' ? ' waiting to be organized' : ''}`;
  $('list').innerHTML =
    rows
      .slice(0, limit)
      .map(
        (i) =>
          `<article class="item-row ${focusId === i.id ? 'selected' : ''}"><input type="checkbox" data-select="${esc(i.id)}" aria-label="Select ${esc(i.title)}" ${selected.has(i.id) ? 'checked' : ''}><div><button class="item-open" data-open="${esc(i.id)}"><div class="item-meta"><span>${esc(i.kind.toUpperCase())}</span><span>${esc(i.authorHandle || i.authorName || 'Unknown author')}</span><span>${date(i.createdAt)}</span></div><h2>${esc(i.title)}</h2><p class="item-preview">${esc(i.text || i.summary || i.markdown || i.clips?.[0]?.text || 'Only metadata saved. Open the original to capture text.')}</p></button><div class="chips"><span class="chip capture-status">${type() === 'clip' ? 'Excerpt' : labelStatus(i.contentStatus)}</span>${(i.tags || []).map((t) => `<span class="chip">${esc(t)}</span>`).join('')}${type() === 'item' ? `<span class="chip">${i.clips.filter((c) => !c.trashedAt).length} clips</span>` : ''}</div></div></article>`
      )
      .join('') ||
    '<div class="empty"><h2>Room for your next discovery.</h2><p>Save an X article from the extension popup,<br>import bookmarks, or adjust your filters.</p></div>';
  $('more').hidden = rows.length <= limit;
  const visible = rows.slice(0, limit);
  $('selectAll').checked = visible.length > 0 && visible.every((i) => selected.has(i.id));
  $('selectAll').indeterminate = visible.some((i) => selected.has(i.id)) && !$('selectAll').checked;
  $('selectionCount').textContent = selected.size ? `${selected.size} selected` : 'Select visible';
  $('batch').disabled = !selected.size;
  $('ai').disabled = !selected.size || view === 'trash';
  $('knowledge').disabled = !rows.length || type() === 'clip' || view === 'trash';
  $('exportClips').disabled = view === 'trash' || !rows.length;
  if (!dirty) renderDetail();
}
function renderDetail() {
  const i = rows.find((r) => r.id === focusId);
  if (!i) {
    $('detail').classList.remove('open');
    $('detail').innerHTML =
      '<div class="detail-empty"><span class="detail-symbol">↗</span><h2>A place for what stays.</h2><p>Select an article or clip to see its source, saved text and notes.</p></div>';
    return;
  }
  const clip = type() === 'clip';
  const url = safeUrl(i.url || i.pageUrl);
  $('detail').classList.add('open');
  $('detail').innerHTML =
    `<div class="detail-top"><span class="eyebrow">${clip ? 'EXCERPT' : 'SAVED REFERENCE'}</span><button data-detail="close" aria-label="Close detail">×</button></div><h2>${esc(i.title)}</h2><p class="muted">${esc(i.authorName || i.authorHandle)} · ${date(i.publishedAt)}</p>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open original${i.contentStatus !== 'complete' && !clip ? ' to capture full text' : ''} ↗</a>` : ''}<p class="complete-note">${clip ? 'Linked to its original article.' : `${labelStatus(i.contentStatus)} · Last exported: ${i.lastExportedAt ? date(i.lastExportedAt) : 'Never'}`}</p>${!clip && i.markdown && i.contentStatus !== 'complete' ? '<button data-detail="complete">I verified the saved body is complete</button>' : ''}<details open><summary>${clip ? 'Saved excerpt' : 'Saved Markdown'}</summary><pre>${esc(clip ? i.text : i.markdown || 'No article body captured. Existing excerpts are preserved below.')}</pre></details>${i.summary && !clip ? `<details open><summary>AI summary · user accepted</summary><p>${esc(i.summary)}</p></details>` : ''}<form id="editor"><label for="editTags">Tags · separate with commas</label><input id="editTags" value="${esc((i.tags || []).join(', '))}"><label for="editNote">Personal note · not sent to AI</label><textarea id="editNote">${esc(i.note || '')}</textarea>${
      !clip
        ? `<label for="editCollections">Collections · select multiple</label><select id="editCollections" multiple size="3">${Object.values(
            state.collections
          )
            .map(
              (c) =>
                `<option value="${esc(c.id)}" ${i.collectionIds.includes(c.id) ? 'selected' : ''}>${esc(c.name)}</option>`
            )
            .join('')}</select>`
        : ''
    }<div class="detail-actions"><button class="primary" type="submit">Save changes</button><button type="button" data-detail="${i.trashedAt ? 'restore' : 'trash'}">${i.trashedAt ? 'Restore' : 'Move to Trash'}</button></div></form>${
      !clip
        ? `<details open><summary>Clips (${i.clips.filter((c) => !c.trashedAt).length})</summary>${i.clips
            .filter((c) => !c.trashedAt)
            .map(
              (c) =>
                `<div class="clip-card"><p>${esc(c.text)}</p><button data-clip="${esc(c.id)}">Edit clip</button></div>`
            )
            .join('')}</details>`
        : ''
    }`;
  $('editor').oninput = () => {
    dirty = true;
  };
  $('editor').onsubmit = run(async (e) => {
    e.preventDefault();
    await rpc('library:edit', {
      type: type(),
      ids: [i.id],
      expectedUpdatedAt: i.updatedAt || '',
      tags: splitClipTagInput($('editTags').value),
      note: $('editNote').value,
      collectionIds: [...($('editCollections')?.selectedOptions || [])].map((o) => o.value)
    });
    dirty = false;
    await load();
    say('Saved locally.');
  });
}
async function changeView(next) {
  if (!canLeave()) return;
  view = next;
  focusId = '';
  selected.clear();
  limit = 50;
  $('kind').value = '';
  $('organized').value = '';
  $('sidebar').classList.remove('open');
  $('menu').setAttribute('aria-expanded', 'false');
  render();
}
document.addEventListener(
  'click',
  run(async (e) => {
    const nav = e.target.closest('[data-view]');
    if (nav) return changeView(nav.dataset.view);
    const open = e.target.closest('[data-open]');
    if (open && canLeave()) {
      focusId = open.dataset.open;
      render();
    }
    const clip = e.target.closest('[data-clip]');
    if (clip && canLeave()) {
      view = 'clips';
      $('search').value = '';
      $('tag').value = '';
      $('author').value = '';
      selected.clear();
      focusId = clip.dataset.clip;
      render();
    }
    const detail = e.target.closest('[data-detail]');
    if (detail) {
      if (!canLeave()) return;
      if (detail.dataset.detail === 'close') {
        focusId = '';
        render();
        return;
      }
      if (
        detail.dataset.detail === 'complete' &&
        !confirm(
          'Confirm you compared the saved Markdown with the fully loaded original article. This does not fetch missing text.'
        )
      )
        return;
      await rpc('library:batch', {
        type: type(),
        ids: [focusId],
        operation: detail.dataset.detail
      });
      await load();
    }
  })
);
$('list').onchange = (e) => {
  const id = e.target.dataset.select;
  if (!id) return;
  e.target.checked ? selected.add(id) : selected.delete(id);
  render();
};
$('selectAll').onchange = (e) => {
  for (const i of rows.slice(0, limit))
    e.target.checked ? selected.add(i.id) : selected.delete(i.id);
  render();
};
for (const id of ['search', 'kind', 'tag', 'author', 'organized', 'sort', 'trashType'])
  $(id).addEventListener(id === 'search' || id === 'author' ? 'input' : 'change', () => {
    selected.clear();
    limit = 50;
    render();
  });
$('more').onclick = () => {
  limit += 50;
  render();
};
$('refresh').onclick = run(async () => {
  if (canLeave()) await load();
});
$('menu').onclick = () => {
  const open = $('sidebar').classList.toggle('open');
  $('menu').setAttribute('aria-expanded', String(open));
};
$('import').onclick = () => chrome.tabs.create({ url: 'https://x.com/i/bookmarks' });
$('newCollection').onclick = run(async () => {
  const name = prompt('Collection name');
  if (name?.trim()) {
    await rpc('library:collection', { name });
    await load();
  }
});
$('manageTags').onclick = () => {
  const tags = [
    ...new Set(
      [...Object.values(state.items), ...Object.values(state.clips)].flatMap((i) => i.tags || [])
    )
  ].sort();
  modal(
    'Rename or merge tags',
    `<p>Applies to articles and clips. Using an existing name merges both tags. Leave the new name empty to remove a tag.</p><label for="tagFrom">Existing tag</label><select id="tagFrom">${tags.map((t) => `<option>${esc(t)}</option>`).join('')}</select><label for="tagTo">New name</label><input id="tagTo"><div class="actions"><button id="tagSave" class="primary">Apply</button></div>`
  );
  $('tagSave').onclick = run(async () => {
    if (!confirm('Apply this tag change throughout your local library?')) return;
    await rpc('library:renameTag', { from: $('tagFrom').value, to: $('tagTo').value });
    $('modal').close();
    await load();
  });
};
$('batch').onchange = run(async (e) => {
  let operation = e.target.value;
  e.target.value = '';
  if (!operation || !selected.size) return;
  const payload = { type: type(), ids: [...selected], operation };
  if (['organized', 'unorganized', 'collection'].includes(operation) && type() === 'clip')
    throw new Error('Organize the parent article from All content.');
  if (operation === 'unorganized') {
    payload.operation = 'organized';
    payload.value = false;
  }
  if (
    operation === 'purge' &&
    !confirm('Permanently delete the selected trashed content? This cannot be undone.')
  )
    return;
  if (operation === 'addTags' || operation === 'removeTags') {
    const tags = prompt('Tags, separated by commas');
    if (tags === null) return;
    payload.tags = splitClipTagInput(tags);
  }
  if (operation === 'collection') {
    modal(
      'Add to collection',
      `<select id="batchCollection" aria-label="Collection">${Object.values(state.collections)
        .map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`)
        .join(
          ''
        )}</select><div class="actions"><button id="collectionApply" class="primary">Add selected</button></div>`
    );
    $('collectionApply').onclick = run(async () => {
      payload.collectionId = $('batchCollection').value;
      await rpc('library:batch', payload);
      $('modal').close();
      await load();
    });
    return;
  }
  if (!canLeave()) return;
  await rpc('library:batch', payload);
  selected.clear();
  await load();
});

$('knowledge').onclick = () => {
  const ids = scopeIds();
  modal(
    'Export Markdown knowledge pack',
    `<p>${ids.length} articles / posts from the current selection or filtered view. Each file includes its source, completeness label, saved excerpts and accepted AI summary.</p><p class="muted">Download only. No local folder synchronization and no automatic Agent memory integration.</p><label><input type="checkbox" id="includeNotes" checked> Include personal notes</label><div class="actions"><button id="downloadPack" class="primary">Download ZIP</button></div>`
  );
  $('downloadPack').onclick = run(async () => {
    const fresh = await rpc('library:load');
    const files = knowledgeFiles(fresh, ids, { includeNotes: $('includeNotes').checked });
    download(`xtoc-knowledge-${day()}.zip`, zipFiles(files));
    await rpc('library:batch', { ids, operation: 'exported' });
    $('modal').close();
    await load();
    say('Knowledge pack download requested. Keep the ZIP private if it contains personal notes.');
  });
};
$('exportClips').onclick = () => {
  const ids = new Set(scopeIds());
  const isClips = type() === 'clip';
  const groups = itemsFor(state)
    .filter((i) => !i.trashedAt)
    .map((i) => ({
      article: state.articles[i.id] || { id: i.id, url: i.url, title: i.title },
      excerpts: i.clips.filter((c) => !c.trashedAt && (isClips ? ids.has(c.id) : ids.has(i.id)))
    }))
    .filter((g) => g.excerpts.length);
  modal(
    'Export clips',
    `<p>${groups.reduce((n, g) => n + g.excerpts.length, 0)} clips. Existing Markdown and JSON v1 formats are preserved; this is not a full library backup.</p><div class="actions"><button id="clipsMd">Markdown</button><button id="clipsJson">JSON v1</button></div>`
  );
  const prefix = selected.size ? 'x-twitter-selected-clips' : 'x-twitter-clips';
  $('clipsMd').onclick = () =>
    download(
      `${prefix}-${day()}.md`,
      renderAllMarkdown(groups, new Date().toISOString()),
      'text/markdown;charset=utf-8'
    );
  $('clipsJson').onclick = () =>
    download(
      `${prefix}-${day()}.json`,
      renderAllJson(groups, new Date().toISOString()),
      'application/json'
    );
};

$('settings').onclick = run(async () => {
  const ai = await rpc('ai:status');
  const bytes = await chrome.storage.local.getBytesInUse?.(null);
  modal(
    'Library settings',
    `<h3>Data stays in this browser</h3><p class="muted">${bytes ? `${(bytes / 1048576).toFixed(1)} MB stored. ` : ''}Backups contain private content, not keys or pending AI suggestions.</p><div class="actions"><button id="backup">Download backup</button><button id="restoreBackup">Restore backup</button></div><hr><h3>AI · bring your own key</h3><p class="muted">Optional. Only explicitly selected text and the previewed tag / collection vocabulary are sent. Notes are excluded. Provider charges apply; exact cost is unavailable. Compatibility requires Chat Completions with JSON mode.</p><label for="endpoint">HTTPS API base URL</label><input id="endpoint" type="url" placeholder="https://api.example.com/v1" value="${esc(ai.endpoint || '')}"><label for="model">Model ID</label><input id="model" value="${esc(ai.model || '')}" autocomplete="off"><label for="key">API key · session only</label><input id="key" type="password" autocomplete="off" spellcheck="false"><p class="muted">${ai.configured ? 'Configured for this session.' : 'Not configured.'} Keys never enter exports. Without session-storage support, worker restart also clears the key. Local browser compromise can expose credentials.</p><div class="actions"><button id="configure" class="primary">Use for this session</button><button id="testAI">Test connection</button><button id="forgetAI">Forget key</button></div><hr><h3>Collections</h3><select id="manageCollection" aria-label="Manage collection">${Object.values(
      state.collections
    )
      .map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`)
      .join(
        ''
      )}</select><div class="actions"><button id="renameCollection">Rename</button><button id="deleteCollection">Delete collection only</button></div><hr><h3>Recent imports</h3>${
      Object.values(state.imports)
        .map(
          (i) =>
            `<p>${date(i.updatedAt)} · ${i.added} new · ${i.duplicates} duplicate · ${i.failed} failed<br>${esc(i.reason)}</p>`
        )
        .join('') || '<p class="muted">No completed imports.</p>'
    }`
  );
  $('backup').onclick = run(async () =>
    download(
      `xtoc-library-backup-${day()}.json`,
      JSON.stringify(backup(await rpc('library:load')), null, 2),
      'application/json'
    )
  );
  $('restoreBackup').onclick = () => $('backupFile').click();
  $('configure').onclick = run(async () => {
    const endpoint = aiEndpoint($('endpoint').value);
    const key = $('key').value;
    const model = $('model').value;
    if (!key || !model.trim()) throw new Error('Enter both model and key.');
    const granted = await chrome.permissions.request({ origins: [`${endpoint.origin}/*`] });
    if (!granted) throw new Error('Permission declined. Local features remain available.');
    await rpc('ai:configure', { endpoint: endpoint.href, model, key });
    $('key').value = '';
    say('Configured for this session. No library data has been sent.', true);
  });
  $('testAI').onclick = run(async () => {
    say(
      'Sending a synthetic connection test, not library content. Provider charges may apply.',
      true
    );
    const result = await rpc('ai:test', { requestId: crypto.randomUUID() });
    say(result.connected ? 'Connection and JSON output validated.' : 'Test failed.', true);
  });
  $('forgetAI').onclick = run(async () => {
    const old = await rpc('ai:status');
    await rpc('ai:forget');
    if (old.endpoint)
      await chrome.permissions.remove({ origins: [`${new URL(old.endpoint).origin}/*`] });
    $('key').value = '';
    say('Key forgotten and this provider permission removed.', true);
  });
  $('renameCollection').onclick = run(async () => {
    const id = $('manageCollection').value;
    if (!id) return;
    const name = prompt('New collection name', state.collections[id]?.name);
    if (name?.trim()) {
      await rpc('library:collection', { id, name });
      await load();
      $('modal').close();
    }
  });
  $('deleteCollection').onclick = run(async () => {
    const id = $('manageCollection').value;
    if (!id || !confirm('Delete this collection? Its articles and clips will remain.')) return;
    await rpc('library:deleteCollection', { id });
    await load();
    $('modal').close();
  });
});
$('backupFile').onchange = run(async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) throw new Error('Backup exceeds the 20 MB import limit.');
  const raw = JSON.parse(await file.text());
  const incoming = parseBackup(raw);
  modal(
    'Review backup restore',
    `<p>${Object.keys(incoming.articles).length} articles, ${Object.keys(incoming.clips).length} clips, ${Object.keys(incoming.collections).length} collections.</p><p>Existing IDs and local edits win. This merges missing records and never replaces the library.</p><div class="actions"><button id="confirmRestore" class="primary">Merge backup</button></div>`
  );
  $('confirmRestore').onclick = run(async () => {
    if (!canLeave()) return;
    await rpc('library:restoreBackup', { backup: raw });
    $('modal').close();
    await load();
    say('Backup merged. Existing records were preserved.');
  });
});

$('ai').onclick = run(async () => {
  if (!canLeave()) return;
  const config = await rpc('ai:status');
  if (!config.configured) throw new Error('Open Settings and configure AI first.');
  preview = [];
  for (const id of selected) preview.push(await rpc('ai:preview', { type: type(), id }));
  modal(
    'Review what will be sent',
    `<p><strong>${preview.length} requests</strong> to ${esc(new URL(config.endpoint).origin)} · ${esc(config.model)}.</p><p>No private notes, unrelated article text or API key are included in the content below. Existing tag names and collection names shown below are sent for classification. Exact cost is unavailable.</p>${preview.map((i) => `<details><summary>${esc(i.id)} · ${i.text.length.toLocaleString()} characters</summary><pre>${esc(JSON.stringify({ text: i.text, type: i.type, contentStatus: i.contentStatus, existingTags: i.existingTags, collections: i.collections }, null, 2))}</pre></details>`).join('')}<div class="actions"><button id="generate" class="primary">Send selected content</button><button id="cancelAI">Cancel requests</button><button id="reviewSuggestions">Review saved suggestions</button></div><div id="suggestions"></div>`
  );
  $('generate').onclick = run(async () => {
    if (aiRunning) return;
    aiRunning = true;
    stopAI = false;
    $('generate').disabled = true;
    let success = 0,
      failures = 0;
    const remaining = [];
    try {
      for (const input of preview) {
        if (stopAI) {
          remaining.push(input);
          continue;
        }
        activeRequest = crypto.randomUUID();
        say(`Processing ${success + failures + 1} / ${preview.length}…`, true);
        try {
          await rpc('ai:generate', {
            type: input.type,
            id: input.id,
            preview: JSON.stringify(input),
            endpoint: config.endpoint,
            model: config.model,
            requestId: activeRequest
          });
          success++;
        } catch (e) {
          remaining.push(input);
          failures++;
          const p = document.createElement('p');
          p.textContent = `${input.id}: ${e.message}`;
          $('suggestions').append(p);
        }
      }
    } finally {
      preview = remaining;
      aiRunning = false;
      activeRequest = '';
      $('generate').disabled = !preview.length;
      $('generate').textContent = 'Retry unfinished requests';
      await load();
      say(
        `${success} suggestions saved, ${failures} failed. No content has been changed. Review suggestions or retry unfinished requests.`,
        true
      );
    }
  });
  $('cancelAI').onclick = run(async () => {
    stopAI = true;
    if (activeRequest) await rpc('ai:cancel', { requestId: activeRequest });
    say('Stopping. Already generated suggestions are retained.', true);
  });
  $('reviewSuggestions').onclick = run(async () => {
    if (aiRunning) throw new Error('Wait or cancel the active request first.');
    await showSuggestions();
  });
});
async function showSuggestions() {
  await load();
  const suggestions = Object.values(state.suggestions);
  modal(
    'Review AI suggestions',
    `<p>Nothing is applied until you choose Apply. Tags are merged; notes and original text are never overwritten.</p>${suggestions.map((s) => `<section class="suggestion" data-suggestion="${esc(s.id)}"><h3>${esc(state.articles[s.targetId]?.title || state.clips[s.targetId]?.text?.slice(0, 80) || s.targetId)}</h3><p>${esc(s.reason)}</p><label><input type="checkbox" data-field="tags" checked> Tags: ${s.tags.map(esc).join(', ') || 'none'}</label>${s.type !== 'clip' ? `<label><input type="checkbox" data-field="collections" checked> Collections: ${s.collectionIds.map((id) => esc(state.collections[id]?.name || 'Removed collection')).join(', ') || 'none'}</label><label><input type="checkbox" data-field="summary" checked> AI summary</label><p>${esc(s.summary || 'No summary suggested.')}</p>` : ''}<div class="actions"><button data-apply="${esc(s.id)}" class="primary">Apply checked fields</button><button data-discard="${esc(s.id)}">Discard</button></div></section>`).join('') || '<p>No pending suggestions.</p>'}<h3>Undo accepted suggestions</h3>${
      Object.keys(state.undo)
        .map(
          (id) => `<button data-undo="${esc(id)}">Undo · ${esc(state.undo[id].targetId)}</button>`
        )
        .join('') || '<p>None.</p>'
    }`
  );
  $('modalBody').onclick = run(async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.apply) {
      const section = b.closest('[data-suggestion]');
      const fields = Object.fromEntries(
        [...section.querySelectorAll('[data-field]')].map((c) => [c.dataset.field, c.checked])
      );
      if (!Object.values(fields).some(Boolean)) throw new Error('Select at least one field.');
      await rpc('ai:apply', { id: b.dataset.apply, fields });
    } else if (b.dataset.discard) await rpc('ai:discard', { id: b.dataset.discard });
    else if (b.dataset.undo) await rpc('ai:undo', { id: b.dataset.undo });
    else return;
    await showSuggestions();
  });
}
$('savedSuggestions').onclick = run(showSuggestions);
function closeModal() {
  if (aiRunning) {
    say('Cancel or wait for requests before closing.', true);
    return;
  }
  $('modal').close();
  $('modalBody').onclick = null;
}
$('closeModal').onclick = closeModal;
$('modal').addEventListener('cancel', (e) => {
  e.preventDefault();
  closeModal();
});
window.addEventListener('beforeunload', (e) => {
  if (dirty || aiRunning) {
    e.preventDefault();
    e.returnValue = '';
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local')
    say('Local data changed. Refresh to see updates; unsaved edits are preserved.');
});
await load().catch((e) => say(e.message));
