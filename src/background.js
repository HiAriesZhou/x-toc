import { KEYS, readState, writeState, mutate, cleanItem, now } from './library/model.js';
import {
  aiEndpoint,
  aiInput,
  generateSuggestion,
  applySuggestion,
  undoSuggestion
} from './library/ai.js';
let writes = Promise.resolve();
let sessionConfig = null;
const requests = new Map();
const load = async () => readState(await chrome.storage.local.get(Object.values(KEYS)));
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
      throw new Error(
        'Could not save locally. Storage may be full. Export a backup or free space; existing records were not removed.'
      );
    }
    return result;
  });
  writes = work.catch(() => {});
  return work;
}
const trusted = (s) =>
  s.id === chrome.runtime.id && s.url?.startsWith(chrome.runtime.getURL('options/'));
const xPage = (s) => {
  try {
    const u = new URL(s.url);
    return (
      s.id === chrome.runtime.id &&
      s.tab &&
      u.protocol === 'https:' &&
      ['x.com', 'twitter.com'].includes(u.hostname)
    );
  } catch {
    return false;
  }
};
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() =>
    chrome.contextMenus.create({
      id: 'showTOC',
      title: 'Show Table of Contents',
      contexts: ['page'],
      documentUrlPatterns: ['https://x.com/*', 'https://twitter.com/*']
    })
  );
});
chrome.contextMenus.onClicked.addListener(() => {
  const action = chrome.action || chrome.browserAction;
  action?.openPopup?.()?.catch(() => {});
});
async function config() {
  return chrome.storage.session
    ? (await chrome.storage.session.get('xtocAIConfig')).xtocAIConfig
    : sessionConfig;
}
async function dispatch(message, sender) {
  const { action, payload = {} } = message;
  if (action === 'openClips' || action === 'openLibrary') {
    if (sender.id !== chrome.runtime.id) throw new Error('Not allowed.');
    await chrome.runtime.openOptionsPage();
    return {};
  }
  if (action === 'library:capture' || action === 'library:saveClip') {
    if (!xPage(sender)) throw new Error('Capture must originate on X.');
    return transaction((s) => mutate(s, action.slice(8), payload));
  }
  if (action === 'capture:importStatus') {
    if (!xPage(sender)) throw new Error('Not allowed.');
    return transaction((s) =>
      mutate(s, 'importStatus', {
        id: String(payload.id || ''),
        added: Number(payload.added) || 0,
        duplicates: Number(payload.duplicates) || 0,
        failed: Number(payload.failed) || 0,
        reason: String(payload.reason || '').slice(0, 500)
      })
    );
  }
  if (!trusted(sender)) throw new Error('Open Library to perform this action.');
  if (action === 'library:load') {
    await writes;
    return load();
  }
  if (action.startsWith('library:')) return transaction((s) => mutate(s, action.slice(8), payload));
  if (action === 'ai:configure') {
    if (
      typeof payload.key !== 'string' ||
      !payload.key ||
      /[^\x21-\x7e]/.test(payload.key) ||
      payload.key.length > 8192 ||
      typeof payload.model !== 'string' ||
      !payload.model.trim()
    )
      throw new Error('Enter a model and a valid API key.');
    const endpoint = aiEndpoint(payload.endpoint);
    if (!(await chrome.permissions.contains({ origins: [`${endpoint.origin}/*`] })))
      throw new Error('Grant access to this API origin first.');
    const value = {
      endpoint: endpoint.href,
      model: payload.model.trim().slice(0, 200),
      key: payload.key
    };
    if (chrome.storage.session) {
      await chrome.storage.session.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' });
      await chrome.storage.session.set({ xtocAIConfig: value });
    } else sessionConfig = value;
    return { endpoint: value.endpoint, model: value.model };
  }
  if (action === 'ai:status') {
    const c = await config();
    return c ? { endpoint: c.endpoint, model: c.model, configured: true } : { configured: false };
  }
  if (action === 'ai:forget') {
    for (const controller of requests.values()) controller.abort();
    sessionConfig = null;
    await chrome.storage.session?.remove('xtocAIConfig');
    return {};
  }
  if (action === 'ai:cancel') {
    requests.get(payload.requestId)?.abort();
    return {};
  }
  if (action === 'ai:preview') return aiInput(await load(), payload.type, payload.id);
  if (action === 'ai:apply')
    return transaction((s) => {
      applySuggestion(s, payload.id, payload.fields, now());
      return {};
    });
  if (action === 'ai:undo')
    return transaction((s) => {
      undoSuggestion(s, payload.id);
      return {};
    });
  if (action === 'ai:discard')
    return transaction((s) => {
      delete s.suggestions[payload.id];
      return {};
    });
  if (action === 'ai:generate' || action === 'ai:test') {
    const c = await config();
    if (!c) throw new Error('Configure AI for this browser session first.');
    if (action === 'ai:generate' && (payload.endpoint !== c.endpoint || payload.model !== c.model))
      throw new Error('AI configuration changed. Review the sending preview again.');
    if (!(await chrome.permissions.contains({ origins: [`${new URL(c.endpoint).origin}/*`] })))
      throw new Error('API permission was revoked.');
    if (requests.size) throw new Error('Another AI request is running. Cancel it or wait.');
    const input =
      action === 'ai:test'
        ? {
            text: 'Connection test. A short reference note.',
            type: 'clip',
            existingTags: [],
            collections: [],
            contentStatus: 'excerpt'
          }
        : aiInput(await load(), payload.type, payload.id);
    if (action === 'ai:generate' && JSON.stringify(input) !== payload.preview)
      throw new Error('Content or taxonomy changed. Review the sending preview again.');
    const controller = new AbortController();
    requests.set(payload.requestId, controller);
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const result = await generateSuggestion(c, input, controller.signal);
      if (controller.signal.aborted) throw new Error('Request cancelled.');
      if (action === 'ai:test') return { connected: true };
      const id = `suggestion_${crypto.randomUUID()}`;
      await transaction((s) => {
        if (input.type !== 'clip' && !s.items[input.id])
          s.items[input.id] = cleanItem({ contentStatus: 'excerpts_only' }, input.id);
        s.suggestions[id] = {
          ...result,
          id,
          targetId: input.id,
          type: input.type,
          updatedAt: input.updatedAt,
          model: c.model,
          createdAt: now()
        };
      });
      return { id, ...result };
    } catch (error) {
      if (controller.signal.aborted)
        throw new Error(
          'Request cancelled or timed out. A provider may still bill an in-flight request. Retry manually.'
        );
      throw new Error(
        error instanceof TypeError
          ? 'Could not contact the provider. Check endpoint and permission.'
          : error.message
      );
    } finally {
      clearTimeout(timer);
      requests.delete(payload.requestId);
    }
  }
  throw new Error('Unsupported action.');
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (typeof message?.action !== 'string') return false;
  dispatch(message, sender).then(
    (data) => respond({ ok: true, data }),
    (error) => respond({ ok: false, error: error.message })
  );
  return true;
});
