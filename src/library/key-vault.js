// Optional on-device storage for the AI API key ("Remember on this device").
//
// The key is encrypted with AES-GCM using a non-extractable WebCrypto key, and
// both live in the extension's own IndexedDB. That database belongs to the
// extension origin, so X pages and the content scripts XTOC injects into them
// cannot read it (unlike chrome.storage.local). The wrapping key is on the same
// device, so this keeps the API key out of plain-text files and backups; it does
// not protect against someone who controls the device.
const WRAPPING_KEY = 'wrapping-key';
const SECRET = 'api-key';
const DB_NAME = 'xtoc-vault';
const STORE_NAME = 'secrets';

export function memoryStore() {
  const map = new Map();
  return {
    get: async (name) => map.get(name),
    set: async (name, value) => void map.set(name, value),
    delete: async (name) => void map.delete(name),
    entries: () => [...map.entries()]
  };
}

export function idbStore(indexedDB = globalThis.indexedDB) {
  const open = () =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  const run = async (mode, operation) => {
    const db = await open();
    try {
      return await new Promise((resolve, reject) => {
        const request = operation(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  };
  return {
    get: (name) => run('readonly', (store) => store.get(name)),
    set: (name, value) => run('readwrite', (store) => store.put(value, name)),
    delete: (name) => run('readwrite', (store) => store.delete(name))
  };
}

export function createVault({ store, subtle = globalThis.crypto.subtle }) {
  async function wrappingKey() {
    const existing = await store.get(WRAPPING_KEY);
    if (existing) return existing;
    const created = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt'
    ]);
    await store.set(WRAPPING_KEY, created);
    return created;
  }

  return {
    // value: { key, endpoint } — the key is only reused for the endpoint it was saved with.
    async save(value) {
      const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
      const plain = new TextEncoder().encode(
        JSON.stringify({ key: value.key, endpoint: value.endpoint })
      );
      const data = new Uint8Array(
        await subtle.encrypt({ name: 'AES-GCM', iv }, await wrappingKey(), plain)
      );
      await store.set(SECRET, { iv, data });
    },
    async load() {
      try {
        const record = await store.get(SECRET);
        const key = await store.get(WRAPPING_KEY);
        if (!record || !key) return null;
        const plain = await subtle.decrypt({ name: 'AES-GCM', iv: record.iv }, key, record.data);
        const value = JSON.parse(new TextDecoder().decode(plain));
        return typeof value?.key === 'string' && typeof value?.endpoint === 'string' ? value : null;
      } catch {
        return null; // Corrupted or from another profile: behave as if nothing was saved.
      }
    },
    async clear() {
      await store.delete(SECRET);
      await store.delete(WRAPPING_KEY);
    }
  };
}
