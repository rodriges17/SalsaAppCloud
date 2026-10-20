import { checksum } from './package.js';
import * as app from './app-storage.js';
import { folderSupported, selectDirectory, permission, readLibrary, hydrateFolder, readFolderVideo, writeFolderFigure, deleteFolderFigure, cleanupFolder } from './folder-storage.js';
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
const folders = async () => (await entries()).filter(e => e.id !== 'config');
const mirror = folder => async library => { folder.library = library; await put(folder); };
const locked = work => navigator.locks ? navigator.locks.request(`salsa-storage:${scope}`, work) : work();
export async function storageSettings() {
  const config = await entries('config') ?? { id: 'config', activeFolder: null }; return { ...config, folders: await folders(), supported: folderSupported() };
}
export async function chooseFolder() { return selectDirectory(); }
export async function connectFolder(folder) {
  return locked(async () => {
    await permission(folder.handle, true); const library = await readLibrary(folder.handle);
    if (library.id !== folder.id) throw new Error('Falscher Bibliotheksordner.');
    await put({ ...folder, library }); await put({ id: 'config', activeFolder: folder.id });
  });
}
export async function setStorageFolder(id = null) {
  if (id && (!folderSupported() || !await entries(id))) throw new Error('Kein verfügbarer Geräteordner.');
  await put({ id: 'config', activeFolder: id });
}
export async function reconnectFolder(id) {
  const folder = await entries(id); if (!folder) throw new Error('Bitte den Bibliotheksordner neu auswählen.');
  await permission(folder.handle, true);
  return locked(async () => { const library = await readLibrary(folder.handle); if (library.id !== id) throw new Error('Der Ordner enthält eine andere Bibliothek.'); await mirror(folder)(library); await cleanupFolder(folder, library, mirror(folder)); });
}
export async function listFigures() {
  const result = await app.listFigures();
  for (const folder of await folders()) {
    let problem = '';
    try { await permission(folder.handle); const library = await readLibrary(folder.handle); if (library.id !== folder.id) throw new Error('Andere Bibliothek im Ordner.'); await mirror(folder)(library); }
    catch (e) { problem = e.message; }
    for (const f of folder.library.figures) {
      let fileProblem = problem;
      if (!fileProblem) try {
        const media = await folder.handle.getDirectoryHandle('media');
        for (const v of f.videos) {
          const file = await (await media.getFileHandle(v.file)).getFile();
          if (file.size !== v.size || (v.modifiedAt != null && file.lastModified !== v.modifiedAt)) { fileProblem = 'Videodatei wurde verändert. Bitte bearbeiten und ersetzen.'; break; }
        }
      } catch { fileProblem = 'Videodatei fehlt. Bitte bearbeiten und ersetzen.'; }
      result.push({ ...hydrateFolder(f, folder.id), folderName: folder.name, storageProblem: fileProblem });
    }
  }
  return result;
}
async function folderFor(figure) {
  const folder = await entries(figure.storageFolder); if (!folder) throw new Error('Ordner erneut verbinden.');
  return folder;
}
export async function figureVideos(figure, repair = false) {
  if (!figure.storageFolder) return app.figureVideos(figure);
  const folder = await folderFor(figure), f = folder.library.figures.find(f => f.id === figure.id);
  if (!f || f.revision !== figure.revision) throw new Error('Figur wurde inzwischen geändert. Bitte neu laden.');
  return Promise.all(f.videos.map(async v => {
    try { return await readFolderVideo(folder, f, v); }
    catch (e) {
      if (!repair) throw e;
      return { ...v, figureId: f.id, storageFolder: folder.id, blob: new Blob(), missing: true, problem: e.message, poster: null };
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
