import { createBackup, figureSignature, sourceKey } from './backup-format.js';
import { checksum } from './package.js';
import * as app from './app-storage.js';
import { folderSupported, selectDirectory, permission, readLibrary, hydrateFolder, readFolderVideo, writeFolderFigure, deleteFolderFigure, restoreFolderBatch } from './folder-storage.js';
export { database, DB_NAME, MEDIA_CACHE, storageMessage, cleanupInterruptedImports } from './app-storage.js';
export { folderSupported } from './folder-storage.js';
const scope = new URL('./', import.meta.url).pathname;
let settingsDB;
function settings() {
  if (!settingsDB) settingsDB = new Promise((resolve, reject) => {
    const r = indexedDB.open(`salsa-folders:${scope}:v1`, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('entries', { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result); r.onerror = () => { settingsDB = null; reject(r.error); };
  });
  return settingsDB;
}
async function entries(key) {
  const db = await settings(); return new Promise((resolve, reject) => {
    const tx = db.transaction('entries'), r = key === undefined ? tx.objectStore('entries').getAll() : tx.objectStore('entries').get(key); let value;
    r.onsuccess = () => { value = r.result; }; tx.oncomplete = () => resolve(value); tx.onabort = () => reject(tx.error);
  });
}
async function put(value) {
  const db = await settings(); return new Promise((resolve, reject) => { const tx = db.transaction('entries', 'readwrite'); tx.objectStore('entries').put(value); tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); tx.onerror = () => {}; });
}
const knownFolders = new Map();
const chosenFolders = new WeakMap();
const folders = async () => {
  const all = (await entries()).filter(e => e.id !== 'config');
  knownFolders.clear(); all.forEach(folder => knownFolders.set(folder.id, folder));
  return all;
};
const folderSummary = folder => ({ id: folder.id, name: folder.name, figureCount: folder.library.figures.length, pendingCleanup: folder.library.garbage.length > 0 });
const mirror = folder => async library => { folder.library = library; await put(folder); };
const locked = work => navigator.locks ? navigator.locks.request(`salsa-storage:${scope}`, work) : work();
export async function storageSettings() {
  const config = await entries('config') ?? { id: 'config', activeFolder: null }; return { ...config, folders: (await folders()).map(folderSummary), supported: folderSupported() };
}
// The UI sees folder summaries, not persisted handles or catalog internals.
export async function chooseFolder() {
  const folder = await selectDirectory(), choice = folderSummary(folder);
  chosenFolders.set(choice, folder);
  return choice;
}
async function readRegisteredFolder(folder) {
  await permission(folder.handle);
  const library = await readLibrary(folder.handle);
  if (library.id !== folder.id) throw new Error('Der Ordner enthält eine andere Bibliothek.');
  await mirror(folder)(library);
  return library;
}
async function folderAvailability(folder) {
  try { await readRegisteredFolder(folder); return { problem: '', accessRequired: false }; }
  catch (error) { return { problem: error.message, accessRequired: error.code === 'folder-permission-required' }; }
}
export async function connectFolder(choice) {
  const folder = chosenFolders.get(choice);
  if (!folder) throw new Error('Bitte den Bibliotheksordner neu auswählen.');
  return locked(async () => {
    await permission(folder.handle, true);
    await readRegisteredFolder(folder);
    await put({ id: 'config', activeFolder: folder.id });
    knownFolders.set(folder.id, folder); chosenFolders.delete(choice);
  });
}
export async function setStorageFolder(id = null) {
  if (id && (!folderSupported() || !await entries(id))) throw new Error('Kein verfügbarer Geräteordner.');
  await put({ id: 'config', activeFolder: id });
}
export async function allowFolderAccess(id, { signal } = {}) {
  signal?.throwIfAborted();
  // Views preload summaries; use the remembered handle in the click task.
  const folder = knownFolders.get(id) ?? await entries(id);
  if (!folder) throw new Error('Bitte den Bibliotheksordner neu auswählen.');
  await permission(folder.handle, true);
  signal?.throwIfAborted();
  return locked(async () => {
    signal?.throwIfAborted();
    const current = await entries(id);
    if (!current) throw new Error('Bitte den Bibliotheksordner neu auswählen.');
    await readRegisteredFolder(current);
    return folderSummary(current);
  });
}
export async function backupFoldersNeedingAccess() {
  const missing = [];
  for (const folder of await folders()) {
    if (!folder.library.figures.length) continue;
    const state = await folderAvailability(folder);
    if (state.accessRequired) missing.push(folderSummary(folder));
    else if (state.problem) throw new Error(state.problem);
  }
  return missing;
}
export async function listFigures() {
  const result = await app.listFigures();
  for (const folder of await folders()) {
    const { problem, accessRequired } = await folderAvailability(folder);
    for (const f of folder.library.figures) {
      let fileProblem = problem;
      if (!fileProblem) try {
        const media = await folder.handle.getDirectoryHandle('media');
        for (const v of f.videos) {
          const file = await (await media.getFileHandle(v.file)).getFile();
          if (file.size !== v.size || (v.modifiedAt != null && file.lastModified !== v.modifiedAt)) { fileProblem = 'Videodatei wurde verändert. Bitte bearbeiten und ersetzen.'; break; }
        }
      } catch { fileProblem = 'Videodatei fehlt. Bitte bearbeiten und ersetzen.'; }
      result.push({ ...hydrateFolder(f, folder.id), folderName: folder.name, storageProblem: fileProblem, folderAccessRequired: accessRequired });
    }
  }
  return result;
}
async function folderFor(figure) {
  const folder = await entries(figure.storageFolder); if (!folder) throw new Error('Ordner erneut verbinden.');
  return folder;
}
// A media session owns lazy reads, concurrent requests and retry. Its cache
// lasts only for this view; a newly opened view verifies folder bytes again.
export async function figureMedia(figure, { verifyAccess = false, signal } = {}) {
  signal?.throwIfAborted();
  let records, read;
  if (!figure.storageFolder) {
    records = await app.figureVideoRecords(figure);
    read = async record => {
      const loaded = await app.getVideo(record.id);
      if (!loaded || loaded.figureId !== figure.id) throw new Error('Eine lokale Videodatei fehlt. Bitte die Figur bearbeiten.');
      return loaded;
    };
  } else {
    const folder = await folderFor(figure), current = folder.library.figures.find(f => f.id === figure.id);
    if (!current || current.revision !== figure.revision) throw new Error('Figur wurde inzwischen geändert. Bitte neu laden.');
    if (verifyAccess) await permission(folder.handle);
    records = current.videos;
    read = record => readFolderVideo(folder, current, record, signal);
  }
  return records.map(record => {
    let pending;
    const load = () => {
      if (signal?.aborted) return Promise.reject(signal.reason);
      if (!pending) pending = Promise.resolve().then(() => { signal?.throwIfAborted(); return read(record); }).then(loaded => {
        signal?.throwIfAborted(); return loaded;
      }).catch(error => { pending = null; throw error; });
      return pending;
    };
    return { ...record, load, async describe() {
      // Older app-cache records predate size/type metadata. An explicitly empty
      // MIME type is valid metadata and does not require reading video bytes.
      if (record.size != null && typeof record.type === 'string') return { ...record };
      const loaded = await load();
      return { ...record, size: loaded.blob.size, type: loaded.blob.type };
    } };
  });
}
// Editing/export/backup require all bytes, including full folder verification.
export async function figureVideos(figure, repair = false, { signal, progress = () => {} } = {}) {
  signal?.throwIfAborted();
  const records = await figureMedia(figure, { signal }); let done = 0;
  signal?.throwIfAborted();
  progress({ done, total: records.length });
  return Promise.all(records.map(async record => {
    try {
      signal?.throwIfAborted();
      const loaded = await record.load(); signal?.throwIfAborted();
      progress({ done: ++done, total: records.length });
      return loaded;
    } catch (error) {
      signal?.throwIfAborted();
      if (!repair || !figure.storageFolder) throw error;
      progress({ done: ++done, total: records.length });
      const { load, describe, ...metadata } = record;
      return { ...metadata, figureId: figure.id, storageFolder: figure.storageFolder, blob: new Blob(), missing: true, problem: error.message, poster: null };
    }
  }));
}
export async function getVideo(id) {
  const all = await folders();
  for (const folder of all) for (const f of folder.library.figures) { const v = f.videos.find(v => v.id === id); if (v) return readFolderVideo(folder, f, v); }
  return app.getVideo(id);
}
export async function saveFigure(figure, drafts, expectedRevision = null) {
  return locked(async () => {
    const id = figure.storageFolder ?? (expectedRevision ? null : (await storageSettings()).activeFolder);
    if (!id) return app.saveFigure(figure, drafts, expectedRevision);
    const folder = await entries(id); if (!folder) throw new Error('Geräteordner fehlt. Bitte erneut verbinden.');
    return writeFolderFigure(folder, figure, drafts, expectedRevision, mirror(folder));
  });
}
export async function deleteFigure(figure) {
  return locked(async () => {
    if (!figure.storageFolder) return app.deleteFigure(figure);
    const folder = await folderFor(figure); return deleteFolderFigure(folder, figure, mirror(folder));
  });
}
export async function transferFigure(figure, targetFolder) {
  const records = await figureVideos(figure);
  const copy = { ...figure, id: crypto.randomUUID(), storageFolder: targetFolder ?? undefined };
  const drafts = records.map((v, i) => ({ ...v, poster: v.poster ?? (i === 0 ? figure.poster : null), id: crypto.randomUUID(), existing: false, confirmed: true }));
  return locked(async () => {
    if (!targetFolder) {
      const saved = await app.saveFigure(copy, drafts), verified = await app.figureVideos(saved);
      for (let i = 0; i < records.length; i++) if (records[i].blob.size !== verified[i].blob.size || await checksum(records[i].blob) !== await checksum(verified[i].blob)) throw new Error('Die neue App-Kopie konnte nicht geprüft werden. Die bisherige Figur bleibt erhalten.');
      return saved;
    }
    const folder = await entries(targetFolder); if (!folder) throw new Error('Bitte zuerst einen Geräteordner auswählen.');
    return writeFolderFigure(folder, copy, drafts, null, mirror(folder));
  });
}

const revisionSnapshot = figures => JSON.stringify(figures.map(f=>[sourceKey(f),f.revision]).sort((a,b)=>a[0].localeCompare(b[0])));
async function collectBackupSources(signal, progress = () => {}) {
  const figures = await listFigures(), sources = [], problems = [];
  for (let i=0;i<figures.length;i++) {
    signal?.throwIfAborted(); const figure = figures[i];
    try { sources.push({ figure, records: await figureVideos(figure) }); }
    catch(e) { problems.push(`„${figure.title}“: ${e.message}`); }
    progress({ phase:'scan',done:i+1,total:figures.length });
  }
  signal?.throwIfAborted();
  if(problems.length) { const error=new Error('Keine vollständige Sicherung möglich:\n'+problems.join('\n'));error.problems=problems;throw error; }
  if(!sources.length)throw new Error('Es sind keine lokalen Figuren vorhanden.');
  return { sources,snapshot:revisionSnapshot(figures) };
}
export async function inspectLocalBackup(options={}) { return locked(()=>collectBackupSources(options.signal,options.progress)); }
export async function exportLocalBackup(expectedSnapshot,options={}) {
  return locked(async()=>{
    const inventory=await collectBackupSources(options.signal,options.progress);
    if(inventory.snapshot!==expectedSnapshot)throw new Error('Der lokale Bestand wurde inzwischen geändert. Bitte erneut prüfen.');
    const backup=await createBackup(inventory.sources,options);
    if(revisionSnapshot(await listFigures())!==inventory.snapshot)throw new Error('Der lokale Bestand wurde während der Sicherung geändert. Bitte erneut prüfen.');
    return backup;
  });
}
export async function planBackupRestore(archive,targetFolder=null,{signal,progress=()=>{}}={}) {
  return locked(async()=>{
    if(targetFolder){if(!folderSupported())throw new Error('Geräteordner werden hier nicht unterstützt.');const folder=await entries(targetFolder);if(!folder)throw new Error('Zielordner fehlt.');await permission(folder.handle);}
    const existing=(await listFigures()).filter(f=>(f.storageFolder??null)===targetFolder),signatures=new Map();
    for(let i=0;i<existing.length;i++){signal?.throwIfAborted();const f=existing[i];try{signatures.set(f.id,await figureSignature(f,await figureVideos(f),archive.manifest.chunkBytes,signal));}catch(e){if(e.name==='AbortError')throw e;signatures.set(f.id,null);}progress({phase:'compare',done:i+1,total:existing.length});}
    const rows=archive.sources.map(source=>{
      const identity=existing.filter(f=>sourceKey(f)===source.figure.source||f.backupOrigin===source.figure.source);
      const identical=existing.filter(f=>signatures.get(f.id)===source.signature);
      const candidates=identity.length?identity:identical;
      const same=candidates.some(f=>signatures.get(f.id)===source.signature);
      return {source,candidates,kind:same?'identical':candidates.length?'conflict':'new',choice:same||candidates.length?'keep':'add'};
    });
    return {archive,targetFolder,existing:existing.map(f=>({id:f.id,revision:f.revision})),rows};
  });
}
export async function restoreBackupPlan(plan,choices,{signal,progress=()=>{}}={}) {
  return locked(async()=>{
    signal?.throwIfAborted();if(choices.length!==plan.rows.length)throw new Error('Bitte die Wiederherstellung erneut prüfen.');
    const used=new Set(),items=[];
    for(let i=0;i<plan.rows.length;i++){
      const row=plan.rows[i],choice=choices[i];if(choice==='keep')continue;
      let id;if(choice==='add'||choice==='copy')id=crypto.randomUUID();else if(choice.startsWith('replace:')){id=choice.slice(8);if(!row.candidates.some(f=>f.id===id))throw new Error('Ungültige Konfliktauswahl.');}else throw new Error('Ungültige Wiederherstellungsauswahl.');
      if(used.has(id))throw new Error('Mehrere Sicherungsfiguren würden dieselbe vorhandene Figur ersetzen. Bitte zusätzliche Kopien wählen.');used.add(id);items.push({id,figure:row.source.figure,records:row.source.records});
    }
    if(!items.length)return 0;
    if(!plan.targetFolder)return app.restoreAppBatch(items,plan.existing,{signal,progress});
    const folder=await entries(plan.targetFolder);if(!folder||!folderSupported())throw new Error('Geräteordner nicht verfügbar.');
    return restoreFolderBatch(folder,items,plan.existing,mirror(folder),{signal,progress});
  });
}
