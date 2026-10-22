import { checksum } from './package.js';
import { validateDraft, STATUSES } from './logic.js';
const FORMAT = 'salsa-device-library', LIMIT = 8 * 1024 * 1024;
const validId = s => typeof s === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(s);
const validFile = s => typeof s === 'string' && /^[a-f0-9-]{36}\.(mp4|mov|m4v|webm|ogv|media)$/.test(s);
export const folderSupported = () => typeof globalThis.showDirectoryPicker === 'function' && !!globalThis.isSecureContext;
export function validateLibrary(data) {
  if (!data || data.format !== FORMAT || data.version !== 1 || !validId(data.id) || !Array.isArray(data.figures) || data.figures.length > 10000 || !Array.isArray(data.garbage) || data.garbage.some(f => !validFile(f))) throw new Error('Keine unterstützte Salsa-Bibliothek. Vorhandene Dateien werden nicht verändert.');
  const ids = new Set(), paths = new Set();
  for (const f of data.figures) {
    if (!validId(f.id) || ids.has(f.id) || !validId(f.revision) || typeof f.title !== 'string' || !f.title.trim() || typeof f.description !== 'string' || !Array.isArray(f.tags) || f.tags.some(t => typeof t !== 'string') || !STATUSES.includes(f.status) || !Array.isArray(f.videos) || !f.videos.length || f.videos.length > 100) throw new Error('Beschädigte Figurenangaben im Geräteordner. Die Bibliothek wird nicht überschrieben.');
    ids.add(f.id);
    for (const v of f.videos) {
      if (!validId(v.id) || ids.has(v.id) || !validFile(v.file) || paths.has(v.file) || typeof v.name !== 'string' || typeof v.type !== 'string' || !(v.type.startsWith('video/') || v.type==='' || v.type==='application/octet-stream') || !Number.isSafeInteger(v.size) || v.size <= 0 || !Number.isFinite(v.duration) || v.duration <= 0 || !Number.isInteger(v.crc)) throw new Error('Ungültige Videodaten im Geräteordner.');
      ids.add(v.id); paths.add(v.file);
    }
    if (f.posterBytes !== null && f.posterBytes !== undefined && (!Array.isArray(f.posterBytes) || f.posterBytes.length > 1000000 || f.posterBytes.some(b => !Number.isInteger(b) || b < 0 || b > 255))) throw new Error('Ungültiges Vorschaubild.');
  }
  if (data.garbage.some(f => paths.has(f))) throw new Error('Ungültige Dateibereinigung im Bibliotheksordner.');
  return data;
}
export async function permission(handle, request = false) {
  if (typeof handle.queryPermission !== 'function') return; // Native OPFS handles used by browser tests have implicit grants.
  let state = await handle.queryPermission({ mode: 'readwrite' });
  if (state !== 'granted' && request) state = await handle.requestPermission({ mode: 'readwrite' });
  if (state !== 'granted') { const error = new Error('Ordner gespeichert – Zugriff erneut erlauben.'); error.code = 'folder-permission-required'; throw error; }
}
export async function readLibrary(handle) {
  const file = await (await handle.getFileHandle('library.json')).getFile();
  if (file.size > LIMIT) throw new Error('Die Bibliotheksdatei ist zu groß.');
  try { return validateLibrary(JSON.parse(await file.text())); } catch (e) { throw new Error('Bibliotheksdatei nicht lesbar: ' + e.message); }
}
async function writeLibrary(handle, data) {
  validateLibrary(data); const text = JSON.stringify(data);
  if (new Blob([text]).size > LIMIT) throw new Error('Die Bibliotheksdatei ist zu groß.');
  const file = await handle.getFileHandle('library.json', { create: true }), writer = await file.createWritable();
  try { await writer.write(text); await writer.close(); } catch (e) { await writer.abort().catch(() => {}); throw e; }
}
export async function selectDirectory() {
  if (!folderSupported()) throw new Error('Ordnerspeicher wird von diesem Browser nicht unterstützt. Bitte aktuelles Chrome auf Android oder Desktop verwenden.');
  const chosen = await globalThis.showDirectoryPicker({ mode: 'readwrite', id: 'salsa-library' });
  await permission(chosen, true);
  let handle = chosen;
  try { await chosen.getFileHandle('library.json'); }
  catch (e) { if (e.name !== 'NotFoundError') throw e; handle = await chosen.getDirectoryHandle('SalsaTrainer', { create: true }); }
  let library;
  try { library = await readLibrary(handle); }
  catch (e) {
    if (e.name !== 'NotFoundError') throw e;
    for await (const _ of handle.keys()) throw new Error('Der Ordner SalsaTrainer enthält unbekannte Dateien. Bitte einen anderen Ordner auswählen.');
    library = { format: FORMAT, version: 1, id: crypto.randomUUID(), figures: [], garbage: [] };
    await writeLibrary(handle, library);
  }
  return { id: library.id, name: chosen.name, handle, library };
}
export const hydrateFolder = (f, folderId) => ({ ...f, storageFolder: folderId, videoIds: f.videos.map(v => v.id), poster: f.posterBytes ? new Blob([new Uint8Array(f.posterBytes)], { type: 'image/jpeg' }) : null });
const verifiedDrafts = new WeakMap();
export async function readFolderVideo(folder, figure, record) {
  try {
    await permission(folder.handle);
    const media = await folder.handle.getDirectoryHandle('media');
    const file = await (await media.getFileHandle(record.file)).getFile();
    if (file.size !== record.size || await checksum(file) !== record.crc) throw new Error('Video wurde außerhalb der App verändert.');
    const blob = file.slice(0, file.size, record.type);
    verifiedDrafts.set(blob, { folder: folder.id, figure: figure.id, revision: figure.revision, file: record.file, crc: record.crc, size: file.size, modifiedAt: file.lastModified });
    return { ...record, modifiedAt: file.lastModified ?? record.modifiedAt, figureId: figure.id, storageFolder: folder.id, blob, poster: record.posterBytes ? new Blob([new Uint8Array(record.posterBytes)], { type: 'image/jpeg' }) : null };
  } catch (e) { throw new Error(`„${record.name || 'Video'}“ nicht verfügbar: ${e.message} Ordner erneut verbinden oder die Figur bearbeiten und das Video ersetzen.`); }
}
// File-system-specific staging preserves files referenced by the on-disk
// catalog even if closing a catalog writer reports an ambiguous failure.
async function folderStaging(folder, signal) {
  const media = await folder.handle.getDirectoryHandle('media', { create: true }), staged = [];
  let committed = false;
  return {
    async video(draft, { id = draft.id, name = draft.name, type = draft.blob.type, width = draft.width, height = draft.height } = {}) {
      signal?.throwIfAborted();
      const extension = ({ 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/x-m4v': 'm4v', 'video/webm': 'webm', 'video/ogg': 'ogv' })[draft.blob.type.split(';')[0]] ?? 'media';
      const file = crypto.randomUUID() + '.' + extension; staged.push(file);
      const handle = await media.getFileHandle(file, { create: true }), writer = await handle.createWritable();
      try { await writer.write(draft.blob); signal?.throwIfAborted(); await writer.close(); } catch (error) { await writer.abort().catch(() => {}); throw error; }
      const stored = await handle.getFile(), crc = await checksum(draft.blob, signal);
      if (stored.size !== draft.blob.size || await checksum(stored, signal) !== crc) throw new Error('Die Videokopie im Geräteordner ist unvollständig.');
      signal?.throwIfAborted();
      return { id, name, file, type, size: stored.size, crc, modifiedAt: stored.lastModified ?? null, posterBytes: draft.poster ? Array.from(new Uint8Array(await draft.poster.arrayBuffer())) : null, duration: draft.duration, width, height };
    },
    async commit(library, mirror) {
      await writeLibrary(folder.handle, library); committed = true;
      await mirror(library); await cleanupFolder(folder, library, mirror);
    },
    async discard() {
      if (committed) return;
      try {
        const disk = await readLibrary(folder.handle), referenced = new Set(disk.figures.flatMap(f => f.videos.map(v => v.file)));
        await Promise.all(staged.filter(file => !referenced.has(file)).map(file => media.removeEntry(file).catch(() => {})));
      } catch { /* Preserve uncertain files for recovery. */ }
    }
  };
}
export async function writeFolderFigure(folder, figure, drafts, expectedRevision, mirror) {
  validateDraft(figure.title, drafts); await permission(folder.handle);
  const library = await readLibrary(folder.handle), previous = library.figures.find(f => f.id === figure.id);
  if (library.id !== folder.id || (previous?.revision ?? null) !== expectedRevision) throw new Error('Diese Figur oder der Geräteordner wurde inzwischen geändert. Bitte neu laden.');
  const original = JSON.stringify(library);
  const stage = await folderStaging(folder), videos = [];
  try {
    for (const d of drafts) {
      if (d.existing) {
        const old = previous?.videos.find(v => v.id === d.id && v.file === d.file);
        if (!old) throw new Error('Ein gespeichertes Video gehört nicht zu dieser Figur.');
        const proof = verifiedDrafts.get(d.blob);
        let modifiedAt = old.modifiedAt;
        if (proof && proof.folder === folder.id && proof.figure === previous.id && proof.revision === previous.revision && proof.file === old.file && proof.crc === old.crc && proof.size === old.size && Number.isFinite(proof.modifiedAt) && proof.modifiedAt > 0) {
          const handle = await (await folder.handle.getDirectoryHandle('media')).getFileHandle(old.file);
          const current = handle.getMetadata ? await handle.getMetadata() : await handle.getFile();
          if (current.size !== proof.size || current.lastModified !== proof.modifiedAt) throw new Error('Video wurde während der Bearbeitung verändert. Bitte den Entwurf schließen und erneut öffnen.');
          modifiedAt = proof.modifiedAt;
        } else {
          modifiedAt = (await readFolderVideo(folder, previous, old)).modifiedAt;
        }
        videos.push({ ...old, modifiedAt, name: d.name.trim() }); continue;
      }
      videos.push(await stage.video(d, { name: d.name.trim(), type: d.blob.type || 'video/mp4', width: d.width ?? 0, height: d.height ?? 0 }));
    }
    const posterBytes = drafts[0].poster ? Array.from(new Uint8Array(await drafts[0].poster.arrayBuffer())) : previous?.posterBytes ?? null;
    const saved = { id: figure.id, title: figure.title.trim(), description: figure.description, tags: figure.tags, status: figure.status, createdAt: previous?.createdAt ?? figure.createdAt ?? Date.now(), revision: crypto.randomUUID(), importFingerprint: figure.importFingerprint ?? previous?.importFingerprint ?? null, backupOrigin: previous?.backupOrigin ?? figure.backupOrigin ?? null, duration: videos[0].duration, posterBytes, videos };
    library.figures = library.figures.filter(f => f.id !== saved.id); library.figures.push(saved);
    library.garbage.push(...(previous?.videos ?? []).filter(v => !videos.some(n => n.file === v.file)).map(v => v.file));
    if (JSON.stringify(await readLibrary(folder.handle)) !== original) throw new Error('Der Bibliotheksordner wurde während des Kopierens geändert. Bitte erneut versuchen.');
    await stage.commit(library, mirror);
    return hydrateFolder(saved, folder.id);
  } finally { await stage.discard(); }
}

export async function cleanupFolder(folder, library, mirror) {
  if (!library.garbage.length) return;
  const media = await folder.handle.getDirectoryHandle('media', { create: true }), remaining = [];
  for (const file of new Set(library.garbage)) try { await media.removeEntry(file); } catch (e) { if (e.name !== 'NotFoundError') remaining.push(file); }
  library.garbage = remaining; await writeLibrary(folder.handle, library); await mirror(library);
}
export async function deleteFolderFigure(folder, figure, mirror) {
  await permission(folder.handle); const library = await readLibrary(folder.handle);
  const previous = library.figures.find(f => f.id === figure.id);
  if (library.id !== folder.id || previous?.revision !== figure.revision) throw new Error('Diese Figur wurde inzwischen geändert. Bitte neu laden.');
  library.figures = library.figures.filter(f => f.id !== figure.id); library.garbage.push(...previous.videos.map(v => v.file));
  await writeLibrary(folder.handle, library); await mirror(library); await cleanupFolder(folder, library, mirror);
}

export async function restoreFolderBatch(folder, items, expected, mirror, { signal, progress = () => {} } = {}) {
  await permission(folder.handle); const library = await readLibrary(folder.handle), original = JSON.stringify(library);
  const snapshot = records => JSON.stringify(records.map(f=>[f.id,f.revision]).sort((a,b)=>a[0].localeCompare(b[0])));
  if (library.id !== folder.id || snapshot(library.figures) !== snapshot(expected)) throw new Error('Der Zielspeicher wurde inzwischen geändert. Bitte erneut prüfen.');
  const stage = await folderStaging(folder, signal);
  try {
    for (const item of items) {
      signal?.throwIfAborted(); const videos=[];
      for (const v of item.records) {
        videos.push(await stage.video(v, { id: crypto.randomUUID() })); progress({phase:'copy'});
      }
      const f=item.figure,previous=library.figures.find(f=>f.id===item.id);
      library.garbage.push(...(previous?.videos??[]).map(v=>v.file));library.figures=library.figures.filter(f=>f.id!==item.id);
      library.figures.push({id:item.id,title:f.title,description:f.description,tags:f.tags,status:f.status,createdAt:f.createdAt,importFingerprint:f.importFingerprint??null,backupOrigin:f.source,revision:crypto.randomUUID(),duration:videos[0].duration,posterBytes:f.poster?Array.from(new Uint8Array(await f.poster.arrayBuffer())):null,videos});
    }
    signal?.throwIfAborted();if(JSON.stringify(await readLibrary(folder.handle))!==original)throw new Error('Der Geräteordner wurde inzwischen geändert.');
    validateLibrary(library);progress({phase:'commit'});await stage.commit(library,mirror);return items.length;
  } finally { await stage.discard(); }
}
