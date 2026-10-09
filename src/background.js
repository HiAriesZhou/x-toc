import { KEYS, readState, writeState, mutate } from './library/model.js';
import { aiInput, generateSuggestion, listModels, normalizeBaseUrl } from './library/ai.js';
import { detectProvider, findProvider, parseModelList } from './library/ai-providers.js';
import { applySeed, removeSeed, SEED_PATH } from './library/dev-seed.js';
import { reinjectionTargets } from './reinject.js';
import { createVault, idbStore, memoryStore } from './library/key-vault.js';

const AI_CONFIG_KEY = 'xtocAIConfig'; // session storage: includes the key
const AI_PREFS_KEY = 'xtocAIPrefs'; // local storage: provider, URL, model, remember flag; never the key
const AI_TIMEOUT_MS = 25000;
const X_HOSTS = ['x.com', 'twitter.com'];

let writes = Promise.resolve();
let memoryConfig = null; // fallback when storage.session is unavailable
const requests = new Map();

const load = async () => readState(await chrome.storage.local.get(Object.values(KEYS)));

// Every library write runs here, one at a time, so concurrent saves from
// several tabs cannot overwrite each other. Only changed keys are written.
function transaction(fn) {
  const work = writes.then(async () => {
    const state = await load();
    const before = Object.fromEntries(
      Object.entries(writeState(state)).map(([k, v]) => [k, JSON.stringify(v)])
    );
    const result = await fn(state);
    const changes = Object.fromEntries(
      Object.entries(writeState(state)).filter(([k, v]) => JSON.stringify(v) !== before[k])
    );
    try {
      if (Object.keys(changes).length) await chrome.storage.local.set(changes);
    } catch {
      throw new Error('Could not save locally. Storage may be full; existing items were kept.');
    }
    return result;
  });
  writes = work.catch(() => {});
  return work;
}

const fromLibrary = (sender) =>
  sender.id === chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL('options/'));

function fromXPage(sender) {
  try {
    const url = new URL(sender.url);
    return (
      sender.id === chrome.runtime.id &&
      sender.tab &&
      url.protocol === 'https:' &&
      X_HOSTS.includes(url.hostname)
    );
  } catch {
    return false;
  }
}

// "Remember on this device" keeps an encrypted copy of the key in the
// extension's IndexedDB (see library/key-vault.js). Memory is used only where
// IndexedDB does not exist, such as unit tests.
const vault = createVault({ store: globalThis.indexedDB ? idbStore() : memoryStore() });

async function readSessionConfig() {
  return chrome.storage.session
    ? (await chrome.storage.session.get(AI_CONFIG_KEY))[AI_CONFIG_KEY]
    : memoryConfig;
}

async function writeSessionConfig(value) {
  if (chrome.storage.session) {
    await chrome.storage.session.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' });
    await chrome.storage.session.set({ [AI_CONFIG_KEY]: value });
  } else {
    memoryConfig = value;
  }
}

const readPrefs = async () => (await chrome.storage.local.get(AI_PREFS_KEY))[AI_PREFS_KEY] || {};
const writePrefs = async (prefs) => chrome.storage.local.set({ [AI_PREFS_KEY]: prefs });

// After a browser restart the session is empty; a remembered key for the same
// endpoint restores it.
async function readAIConfig() {
  const session = await readSessionConfig();
  if (session) return session;
  const prefs = await readPrefs();
  if (!prefs.remember) return null;
  const saved = await vault.load();
  if (!saved || saved.endpoint !== prefs.endpoint) return null;
  const restored = {
    provider: prefs.provider,
    endpoint: prefs.endpoint,
    model: prefs.model || '',
    key: saved.key
  };
  await writeSessionConfig(restored);
  return restored;
}

async function rememberKey(config, remember) {
  if (remember) await vault.save({ key: config.key, endpoint: config.endpoint });
  else await vault.clear();
}

const originPattern = (endpoint) => `${new URL(endpoint).origin}/*`;

const validKey = (key) =>
  typeof key === 'string' && key.length > 0 && key.length <= 8192 && !/[^\x21-\x7e]/.test(key);

// Saves provider, URL, model and key for this browser session. Omitting the key
// keeps the current one when the URL is unchanged, so switching models is cheap.
async function configureAI(payload) {
  const endpoint = normalizeBaseUrl(payload.endpoint);
  const current = await readAIConfig();
  const key = payload.key || (current?.endpoint === endpoint ? current.key : '');
  if (!validKey(key)) throw new Error('Enter a valid API key.');
  if (!(await chrome.permissions.contains({ origins: [originPattern(endpoint)] }))) {
    throw new Error('Grant access to this API origin first.');
  }
  const provider = findProvider(payload.provider).id;
  const model = String(payload.model || '')
    .trim()
    .slice(0, 200);
  const value = { provider, endpoint, model, key };
  const remember =
    typeof payload.remember === 'boolean'
      ? payload.remember
      : Boolean((await readPrefs()).remember);
  await writeSessionConfig(value);
  await rememberKey(value, remember);
  await writePrefs({ provider, endpoint, model, remember });
  return aiStatus();
}

async function aiStatus() {
  const config = await readAIConfig();
  const prefs = await readPrefs();
  const source = config || prefs;
  return {
    connected: Boolean(config?.key),
    configured: Boolean(config?.key && config?.model),
    remember: Boolean(prefs.remember),
    provider: source.provider || (source.endpoint ? detectProvider(source.endpoint).id : ''),
    endpoint: source.endpoint || '',
    model: source.model || ''
  };
}

async function setRemember(remember) {
  const config = await readAIConfig();
  if (remember && !config?.key) throw new Error('Connect a provider first.');
  if (config?.key) await rememberKey(config, remember);
  else await vault.clear();
  await writePrefs({ ...(await readPrefs()), remember });
  return aiStatus();
}

async function fetchModels() {
  const config = await readAIConfig();
  if (!config?.key) throw new Error('Connect a provider first.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    return parseModelList(await listModels(config, controller.signal));
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Listing models timed out.');
    throw new Error(
      error instanceof TypeError ? 'Could not reach the provider. Check the URL.' : error.message
    );
  } finally {
    clearTimeout(timer);
  }
}

async function forgetAI() {
  for (const controller of requests.values()) controller.abort();
  memoryConfig = null;
  await chrome.storage.session?.remove(AI_CONFIG_KEY);
  await vault.clear();
  await writePrefs({ ...(await readPrefs()), remember: false });
  return {};
}

async function runAI(action, payload) {
  // Reserve the single request slot before any await, so two requests that
  // arrive together cannot both pass the check and both be billed.
  if (requests.size) throw new Error('Another AI request is running.');
  const requestId = String(payload.requestId || crypto.randomUUID());
  const controller = new AbortController();
  requests.set(requestId, controller);
  let timer = null;
  try {
    const config = await readAIConfig();
    if (!config?.key || !config.model) throw new Error('Set up AI in Settings first.');
    if (!(await chrome.permissions.contains({ origins: [originPattern(config.endpoint)] }))) {
      throw new Error('API permission was removed. Save the AI settings again.');
    }
    const input =
      action === 'ai:test'
        ? {
            id: 'test',
            title: 'Connection test',
            text: 'A short note about reading tools.',
            existingTags: []
          }
        : aiInput(await load(), payload.id);
    timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    const suggestion = await generateSuggestion(config, input, controller.signal);
    return action === 'ai:test'
      ? { connected: true }
      : { ...suggestion, model: config.model, updatedAt: input.updatedAt };
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The request was cancelled or timed out.');
    throw new Error(
      error instanceof TypeError ? 'Could not reach the provider. Check the URL.' : error.message
    );
  } finally {
    clearTimeout(timer);
    requests.delete(requestId);
  }
}

// The seed file exists only in local development builds (see tooling/build-dev.mjs).
async function readSeed() {
  try {
    const response = await fetch(chrome.runtime.getURL(SEED_PATH));
    if (!response.ok) throw new Error();
    return await response.json();
  } catch {
    throw new Error('Sample data is only available in development builds.');
  }
}

async function dispatch(message, sender) {
  const { action, payload = {} } = message;
  if (action === 'openClips' || action === 'openLibrary') {
    if (sender.id !== chrome.runtime.id) throw new Error('Not allowed.');
    await chrome.runtime.openOptionsPage();
    return {};
  }
  if (action === 'library:capture' || action === 'library:saveClip') {
    if (!fromXPage(sender)) throw new Error('Saving must start on X.');
    return transaction((state) => mutate(state, action.slice('library:'.length), payload));
  }
  if (!fromLibrary(sender)) throw new Error('Open the Library to do this.');
  if (action === 'library:load') {
    await writes;
    return load();
  }
  if (action === 'library:edit' || action === 'library:delete') {
    return transaction((state) => mutate(state, action.slice('library:'.length), payload));
  }
  if (action === 'library:seed') {
    const seed = await readSeed();
    return transaction((state) =>
      payload.mode === 'remove' ? removeSeed(state) : applySeed(state, seed)
    );
  }
  if (action === 'ai:configure') return configureAI(payload);
  if (action === 'ai:status') return aiStatus();
  if (action === 'ai:models') return fetchModels();
  if (action === 'ai:forget') return forgetAI();
  if (action === 'ai:remember') return setRemember(payload.remember === true);
  if (action === 'ai:cancel') {
    requests.get(payload.requestId)?.abort();
    return {};
  }
  if (action === 'ai:suggest' || action === 'ai:test') return runAI(action, payload);
  throw new Error('Unsupported action.');
}

chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.removeAll(() =>
    chrome.contextMenus.create({
      id: 'showTOC',
      title: 'Show Table of Contents',
      contexts: ['page'],
      documentUrlPatterns: ['https://x.com/*', 'https://twitter.com/*']
    })
  );
  if (details.reason === 'install' || details.reason === 'update') {
    reinjectContentScripts().catch(() => {});
  }
});

// Open X tabs keep working after an install or update without a reload.
// Firefox (Manifest V2, no chrome.scripting) re-injects content scripts itself.
async function reinjectContentScripts() {
  if (!chrome.scripting) return;
  const tabs = await chrome.tabs.query({ url: ['https://x.com/*', 'https://twitter.com/*'] });
  for (const { tabId, js, css } of reinjectionTargets(chrome.runtime.getManifest(), tabs)) {
    try {
      if (css.length) await chrome.scripting.insertCSS({ target: { tabId }, files: css });
      await chrome.scripting.executeScript({ target: { tabId }, files: js });
    } catch {
      // The tab closed, navigated or is not scriptable; it loads the script on its next visit.
    }
  }
}

chrome.contextMenus.onClicked.addListener(() => {
  const action = chrome.action || chrome.browserAction;
  action?.openPopup?.()?.catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (typeof message?.action !== 'string') return false;
  dispatch(message, sender).then(
    (data) => respond({ ok: true, data }),
    (error) => respond({ ok: false, error: error.message })
  );
  return true;
});
