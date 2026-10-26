import { contentVideos } from './cloud-provenance.js';
import { validateDraft } from './logic.js';
import { checksum } from './package.js';
let dbPromise;
const scope = new URL('./', import.meta.url).pathname;
export const DB_NAME = `salsa-trainer:${scope}:v1`;
export const MEDIA_CACHE = `salsa-user-videos:${scope}:v1`;
const prefix = new URL('./__private_media__/', import.meta.url).href;
export function database() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('Dieser Browser bietet keinen lokalen App-Speicher. Bitte Safari im normalen Modus verwenden.'));
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { for (const name of ['figures', 'videos', 'imports']) request.result.createObjectStore(name, { keyPath: 'id' }); };
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); dbPromise = null; }; resolve(db); };
    request.onerror = () => { dbPromise = null; reject(request.error); };
    request.onblocked = () => { dbPromise = null; reject(new Error('Bitte andere Tabs dieser App schließen und erneut versuchen.')); };
  });
  return dbPromise;
}
function read(store, key) { return database().then(db => new Promise((resolve, reject) => { const tx = db.transaction(store); const request = key === undefined ? tx.objectStore(store).getAll() : tx.objectStore(store).get(key); let value; request.onsuccess = () => { value = request.result; }; tx.oncomplete = () => resolve(value); tx.onabort = () => reject(tx.error); tx.onerror = () => {}; })); }
function writeImport(record) { return database().then(db => new Promise((resolve, reject) => { const tx = db.transaction('imports', 'readwrite'); tx.objectStore('imports').put(record); tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); tx.onerror = () => {}; })); }
const hydratePoster = record => record ? { ...record, poster: record.posterBytes ? new Blob([record.posterBytes], { type: 'image/jpeg' }) : null } : record;
export async function listFigures() {
  const figures = (await read('figures')).map(hydratePoster);
  if (!figures.length) return figures;
  const records = new Map((await read('videos')).map(record => [record.id, record]));
  const cache = await caches.open(MEDIA_CACHE);
  return Promise.all(figures.map(async figure => {
    const present = await Promise.all(figure.videoIds.map(async id => {
      const record = records.get(id);
      return record?.figureId === figure.id && !!record.cacheKey && !!await cache.match(record.cacheKey);
    }));
    return { ...figure, storageProblem: present.every(Boolean) && present.length ? '' : 'Eine lokale Videodatei fehlt. Bitte die Figur bearbeiten und das Video ersetzen.' };
  }));
}
export async function getVideo(id) {
  const record = await read('videos', id); if (!record) return undefined;
  const response = await (await caches.open(MEDIA_CACHE)).match(record.cacheKey);
  if (!response) throw new Error('Eine lokale Videodatei fehlt. Bitte die Figur bearbeiten und das Video ersetzen.');
  return { ...hydratePoster(record), blob: await response.blob() };
}
// Staged media keys are immutable. Check existence without consuming the body.
export async function videoContentKey(record) {
  if (!record.cacheKey || !await (await caches.open(MEDIA_CACHE)).match(record.cacheKey)) throw new Error('Eine lokale Videodatei fehlt.');
  return JSON.stringify(['app', record.cacheKey]);
}
// Metadata is available without opening video bytes in Cache Storage.
export async function figureVideoRecords(figure) {
  const records = await Promise.all(figure.videoIds.map(id => read('videos', id)));
  if (records.some(v => !v || v.figureId !== figure.id)) throw new Error('Eine lokale Videodatei fehlt. Bitte die Figur bearbeiten.');
  return records.map(hydratePoster);
}
export async function figureVideos(figure) { const records = await Promise.all(figure.videoIds.map(getVideo)); if (records.some(v => !v || v.figureId !== figure.id)) throw new Error('Eine lokale Videodatei fehlt. Bitte die Figur bearbeiten.'); return records; }

// Cache-specific staging: journal fresh keys before writing, verify every new
// copy, and retain existing keys until the metadata transaction has completed.
async function cacheStaging(cache, signal) {
  const db = await database(), job = { id: crypto.randomUUID(), updatedAt: Date.now(), keys: [] };
  let committed = false;
  await writeImport(job);
  return {
    job,
    async video(draft, { id = draft.id, figureId, existing = false, name = draft.name, contentType = draft.blob.type || 'application/octet-stream' } = {}) {
      signal?.throwIfAborted();
      const cacheKey = existing ? draft.cacheKey : prefix + crypto.randomUUID();
      if (!cacheKey?.startsWith(prefix)) throw new Error('Ungültiger lokaler Videopfad.');
      if (existing) {
        if (!await cache.match(cacheKey)) throw new Error('Eine gespeicherte Videodatei fehlt.');
      } else {
        job.keys.push(cacheKey); await writeImport(job);
        signal?.throwIfAborted();
        await cache.put(cacheKey, new Response(draft.blob, { headers: { 'Content-Type': contentType } }));
        const stored = await cache.match(cacheKey), storedBlob = stored ? await stored.blob() : null;
        if (!storedBlob || storedBlob.size !== draft.blob.size || await checksum(storedBlob, signal) !== await checksum(draft.blob, signal)) throw new Error('Die gespeicherte Videokopie konnte nicht geprüft werden.');
      }
      signal?.throwIfAborted();
      return { id, figureId, name, cacheKey, size: draft.blob.size, type: draft.blob.type, duration: draft.duration, width: draft.width, height: draft.height, posterBytes: draft.poster ? await draft.poster.arrayBuffer() : null, existing };
    },
    async commit(obsolete) {
      committed = true;
      await Promise.all(obsolete.map(key => cache.delete(key).catch(() => {})));
    },
    async discard() {
      if (committed) return;
      await Promise.all(job.keys.map(key => cache.delete(key).catch(() => {})));
      await new Promise(resolve => { const tx = db.transaction('imports', 'readwrite'); tx.objectStore('imports').delete(job.id); tx.oncomplete = tx.onabort = resolve; tx.onerror = () => {}; });
    }
  };
}

// Only metadata and small poster buffers enter IndexedDB. Cache Storage streams video
// bytes without the WebKit IDB Blob limitation or a whole-file ArrayBuffer in JS memory.
// Fresh keys are staged before an atomic metadata/link commit. Failure removes all new
// keys; old media is removed only after that commit. No cache key is ever fetched online.
export async function saveFigure(figure, drafts, expectedRevision = null) {
  validateDraft(figure.title, drafts);
  if (!globalThis.caches) throw new Error('Der lokale Medienspeicher ist nicht verfügbar. Bitte die App über HTTPS in Safari oder Chrome öffnen.');
  const db = await database(), cache = await caches.open(MEDIA_CACHE);
  const stage = await cacheStaging(cache), job = stage.job, prepared = [];
  try {
    for (const draft of drafts) prepared.push(await stage.video(draft, { figureId: figure.id, existing: !!draft.existing, name: draft.name.trim() }));
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction(['figures', 'videos', 'imports'], 'readwrite');
      const figures = tx.objectStore('figures'), videos = tx.objectStore('videos'), imports = tx.objectStore('imports');
      let error, saved; const obsolete = [];
      const abort = message => { error = new Error(message); tx.abort(); };
      tx.onabort = () => reject(error ?? tx.error ?? new Error('Speichern abgebrochen.')); tx.onerror = () => {};
      tx.oncomplete = () => resolve({ saved, obsolete });
      const marker = imports.get(job.id);
      marker.onsuccess = () => {
        if (!marker.result) return abort('Dieser Import ist abgelaufen. Bitte erneut speichern.');
        const request = figures.get(figure.id);
        request.onsuccess = () => {
          const previous = request.result;
          if ((previous?.revision ?? null) !== expectedRevision) return abort('Diese Figur wurde inzwischen geändert. Bitte den Entwurf schließen und erneut öffnen.');
          const owned = new Set(previous?.videoIds ?? []);
          if (prepared.some(d => d.existing && !owned.has(d.id))) return abort('Ein Video gehört nicht zu dieser Figur.');
          const videoIds = prepared.map(d => d.id);
          for (const draft of prepared) {
            if (draft.existing) {
              const old = videos.get(draft.id);
              old.onsuccess = () => {
                if (!old.result || old.result.figureId !== figure.id || old.result.cacheKey !== draft.cacheKey) return abort('Ein gespeichertes Video wurde inzwischen geändert.');
                const { existing, ...record } = draft; videos.put(record);
              };
            } else { const { existing, ...record } = draft; videos.put(record); }
          }
          for (const id of owned) if (!videoIds.includes(id)) {
            const old = videos.get(id); old.onsuccess = () => { if (old.result) obsolete.push(old.result.cacheKey); }; videos.delete(id);
          }
          saved = { videoContent: contentVideos(prepared), id: figure.id, title: figure.title.trim(), description: figure.description, status: figure.status, tags: figure.tags, importFingerprint: figure.importFingerprint ?? previous?.importFingerprint ?? null, backupOrigin: previous?.backupOrigin ?? figure.backupOrigin ?? null, createdAt: previous?.createdAt ?? figure.createdAt ?? Date.now(), revision: crypto.randomUUID(), videoIds, duration: prepared[0].duration, posterBytes: prepared[0].posterBytes };
          figures.put(saved); imports.delete(job.id);
        };
      };
    });
    await stage.commit(result.obsolete);
    return hydratePoster(result.saved);
  } finally { await stage.discard(); }
}

export async function deleteFigure(figure) {
  const db = await database();
  const keys = await new Promise((resolve, reject) => {
    const tx = db.transaction(['figures', 'videos'], 'readwrite'); let error; const keys = [];
    tx.onabort = () => reject(error ?? tx.error); tx.onerror = () => {}; tx.oncomplete = () => resolve(keys);
    const figures = tx.objectStore('figures'), videos = tx.objectStore('videos'), request = figures.get(figure.id);
    request.onsuccess = () => {
      if (request.result?.revision !== figure.revision) { error = new Error('Die Figur wurde inzwischen geändert. Bitte neu laden.'); tx.abort(); return; }
      for (const id of request.result.videoIds) { const old = videos.get(id); old.onsuccess = () => { if (old.result) keys.push(old.result.cacheKey); }; videos.delete(id); }
      figures.delete(figure.id);
    };
  });
  const cache = await caches.open(MEDIA_CACHE); await Promise.all(keys.map(key => cache.delete(key)));
}
export async function cleanupInterruptedImports() {
  const db = await database(), cutoff = Date.now() - 86400000;
  const keys = await new Promise((resolve, reject) => {
    const tx = db.transaction('imports', 'readwrite'), imports = tx.objectStore('imports'), request = imports.openCursor(); const keys = [];
    request.onsuccess = () => { const cursor = request.result; if (!cursor) return; if (cursor.value.updatedAt < cutoff) { keys.push(...cursor.value.keys); cursor.delete(); } cursor.continue(); };
    tx.oncomplete = () => resolve(keys); tx.onabort = () => reject(tx.error); tx.onerror = () => {};
  });
  if (keys.length) { const cache = await caches.open(MEDIA_CACHE); await Promise.all(keys.map(key => cache.delete(key))); }
}
export function storageMessage(error) { return error?.name === 'QuotaExceededError' ? 'Der lokale Speicher ist voll. Bitte Speicher auf dem Gerät freigeben oder nicht mehr benötigte Figuren entfernen. Deine bisher gespeicherten Figuren bleiben erhalten.' : error?.message ?? 'Der lokale Speicher ist nicht verfügbar.'; }

// One metadata transaction makes a full restore visible only after every media copy is verified.
export async function restoreAppBatch(items, expected, { signal, progress = () => {} } = {}) {
  const db = await database(), cache = await caches.open(MEDIA_CACHE), stage = await cacheStaging(cache, signal), job = stage.job, prepared = [];
  try {
    for (const item of items) {
      signal?.throwIfAborted(); const videoRecords = [];
      for (const draft of item.records) {
        const { existing, ...record } = await stage.video(draft, { id: crypto.randomUUID(), figureId: item.id, contentType: draft.blob.type });
        videoRecords.push(record);
        progress({ phase: 'copy' });
      }
      const f = item.figure;
      prepared.push({ saved: { id: item.id, title: f.title, description: f.description, tags: f.tags, status: f.status, createdAt: f.createdAt, importFingerprint: f.importFingerprint ?? null, backupOrigin: f.source, revision: crypto.randomUUID(), duration: videoRecords[0].duration, videoIds: videoRecords.map(v => v.id), posterBytes: f.poster ? await f.poster.arrayBuffer() : videoRecords[0].posterBytes }, videos: videoRecords });
    }
    signal?.throwIfAborted(); if (!prepared.length) return 0;
    const obsolete = await new Promise((resolve, reject) => {
      const tx = db.transaction(['figures','videos','imports'],'readwrite'), figures = tx.objectStore('figures'), videos = tx.objectStore('videos'), imports = tx.objectStore('imports');
      let error; const oldKeys = [], abort = () => { error = new DOMException('Wiederherstellung abgebrochen.','AbortError'); try { tx.abort(); } catch {} };
      signal?.addEventListener('abort',abort,{once:true});
      tx.onabort = () => { signal?.removeEventListener('abort',abort); reject(error ?? tx.error); }; tx.onerror = () => {};
      tx.oncomplete = () => { signal?.removeEventListener('abort',abort); resolve(oldKeys); };
      const request = figures.getAll(); request.onsuccess = () => {
        const snapshot = records => JSON.stringify(records.map(f=>[f.id,f.revision]).sort((a,b)=>a[0].localeCompare(b[0])));
        if (snapshot(request.result) !== snapshot(expected)) { error = new Error('Der Zielspeicher wurde inzwischen geändert. Bitte die Wiederherstellung erneut prüfen.'); tx.abort(); return; }
        for (const {saved,videos:records} of prepared) {
          const previous = request.result.find(f=>f.id===saved.id);
          for (const id of previous?.videoIds ?? []) { const old = videos.get(id); old.onsuccess = () => { if(old.result)oldKeys.push(old.result.cacheKey); }; videos.delete(id); }
          figures.put(saved); records.forEach(v=>videos.put(v));
        }
        imports.delete(job.id);
      };
    });
    await stage.commit(obsolete); return prepared.length;
  } finally { await stage.discard(); }
}
