// A small key-value store over IndexedDB, with localStorage as a fallback.
//
// Client records and orders live here and nowhere else — no sync, no server.
// Writes are whole-value replacements, so a half-written record never exists.

const DB = 'loeil';
const STORE = 'kv';
let dbPromise = null;

function idb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) { reject(new Error('no indexedDB')); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch((e) => { dbPromise = null; throw e; });
  return dbPromise;
}

function tx(mode, fn) {
  return idb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const req = fn(store);
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

const lsKey = (k) => 'loeil:' + k;

export async function get(key) {
  try {
    return await tx('readonly', (s) => s.get(key));
  } catch {
    try { const v = localStorage.getItem(lsKey(key)); return v == null ? undefined : JSON.parse(v); } catch { return undefined; }
  }
}

export async function set(key, value) {
  try {
    await tx('readwrite', (s) => s.put(value, key));
  } catch {
    try { localStorage.setItem(lsKey(key), JSON.stringify(value)); } catch { /* storage full or blocked */ }
  }
}

export async function del(key) {
  try { await tx('readwrite', (s) => s.delete(key)); } catch { /* ignore */ }
  try { localStorage.removeItem(lsKey(key)); } catch { /* ignore */ }
}

/** Ask the browser not to evict this site's storage. Best effort. */
export async function persist() {
  try {
    if (navigator.storage?.persisted && await navigator.storage.persisted()) return true;
    return Boolean(await navigator.storage?.persist?.());
  } catch { return false; }
}
