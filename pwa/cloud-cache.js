// Content snapshots only: never store access tokens or signed media URLs here.
const scope = new URL('./', import.meta.url).pathname;
const memory = new Map(), revisions = new Map();
let opening;
export const cloudCacheRevision = owner => revisions.get(owner) ?? 0;
const id = (owner, key) => JSON.stringify([owner, key]);
function database() {
  return opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(`step-cloud-cache:${scope}:v1`, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('content', { keyPath: 'id' });
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); opening = null; }; resolve(request.result); };
    request.onerror = () => { opening = null; reject(request.error); };
  });
}
export async function readCloudCache(owner, key) {
  const cacheId = id(owner, key), revision = cloudCacheRevision(owner);
  if (memory.has(cacheId)) return memory.get(cacheId);
  try {
    const db = await database();
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction('content'), request = tx.objectStore('content').get(cacheId);
      tx.oncomplete = () => resolve(request.result ?? null); tx.onabort = () => reject(tx.error);
    });
    if (revision !== cloudCacheRevision(owner)) return null;
    if (record) memory.set(cacheId, record);
    return record;
  } catch { return null; }
}
export async function writeCloudCache(owner, key, value, revision = cloudCacheRevision(owner)) {
  if (revision !== cloudCacheRevision(owner)) return null;
  const record = { id: id(owner, key), owner, key, value, updatedAt: Date.now() };
  memory.set(record.id, record);
  try {
    const db = await database();
    if (revision !== cloudCacheRevision(owner)) return null;
    await new Promise((resolve, reject) => {
      const tx = db.transaction('content', 'readwrite'); tx.objectStore('content').put(record);
      tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); tx.onerror = () => {};
    });
  } catch { /* Memory caching still works if persistent storage is unavailable. */ }
  return revision === cloudCacheRevision(owner) ? record : null;
}
export async function clearCloudCache(owner, metadataOnly = false) {
  revisions.set(owner, cloudCacheRevision(owner) + 1);
  const matches = record => record.owner === owner && (!metadataOnly || record.key === 'state' || record.key === 'tags' || record.key.startsWith('library:'));
  for (const [key, record] of memory) if (matches(record)) memory.delete(key);
  try {
    const db = await database();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('content', 'readwrite'), request = tx.objectStore('content').openCursor();
      request.onsuccess = () => { const cursor = request.result; if (cursor) { if (matches(cursor.value)) cursor.delete(); cursor.continue(); } };
      tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); tx.onerror = () => {};
    });
  } catch { /* No persistent content exists when IndexedDB is unavailable. */ }
  globalThis.dispatchEvent?.(new CustomEvent('cloud-cache-cleared',{detail:{owner}}));
}
