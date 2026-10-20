import { readBackup, partLayout } from './backup-format.js';

function summary(sources) {
  const videos = sources.flatMap(source => source.records);
  return { figures: sources.length, videos: videos.length, bytes: videos.reduce((total, video) => total + video.blob.size, 0) };
}
function choicesFor(row) {
  return row.kind === 'new' ? ['add', 'keep'] : ['keep', 'copy', ...row.candidates.map(f => 'replace:' + f.id)];
}
function immutable(value) {
  if (!value || typeof value !== 'object' || (Object.getPrototypeOf(value) !== Object.prototype && !Array.isArray(value))) return value;
  Object.values(value).forEach(immutable); return Object.freeze(value);
}
// No DOM, dialogs, downloads or browser storage bookkeeping live in this module.
// The storage adapter owns persistence; this workflow owns ordering and decisions.
export function createBackupWorkflow(storage, { onChange = () => {}, onStorageChange = async () => {} } = {}) {
  let state = { view: 'closed', data: null, busy: false, canCancel: false, message: '', progress: null, revision: 0 };
  let controller, inventory, archive, settings, plan, choices = [], target = null, resume;
  const snapshot = () => Object.freeze({ ...state });
  const emit = patch => { state = { ...state, ...patch }; onChange(snapshot()); };
  const view = (name, data, message = '') => emit({ view: name, data: immutable(data), message, progress: null, revision: state.revision + 1 });
  const clear = () => { inventory = archive = settings = plan = resume = undefined; choices = []; target = null; };
  async function run(work) {
    if (state.busy || state.view === 'closed') return false;
    controller = new AbortController();
    const signal = controller.signal;
    emit({ busy: true, canCancel: true, message: 'Bitte warten …', progress: null });
    try {
      await work({ signal, progress: progress => emit({ progress, canCancel: state.canCancel && progress.phase !== 'commit' }) });
      return true;
    } catch (error) {
      emit({ progress: null, message: error.name === 'AbortError' ? 'Abgebrochen. Der bisherige Bestand wurde nicht verändert.' : error.message });
      return false;
    } finally {
      controller = undefined;
      emit({ busy: false, canCancel: false, progress: null });
    }
  }
  function reset(name) {
    if (state.busy) return false;
    clear(); view(name, null); return true;
  }
  async function createStep(phase, options) {
    const missing = await storage.backupFoldersNeedingAccess();
    options.signal.throwIfAborted();
    if (missing.length) {
      resume = phase;
      view('access', { folders: missing.map(f => ({ id: f.id, name: f.name, figureCount: f.figureCount })) }, 'Ordnerzugriff erforderlich. Ohne Freigabe wird kein unvollständiges Backup erstellt.');
      return;
    }
    if (phase === 'inspect') {
      inventory = await storage.inspectLocalBackup(options);
      options.signal.throwIfAborted();
      const sizes = [];
      for (const source of inventory.sources) {
        if (source.figure.poster?.size) sizes.push(source.figure.poster.size);
        for (const video of source.records) { sizes.push(video.blob.size); if (video.poster?.size) sizes.push(video.poster.size); }
      }
      view('create-ready', { ...summary(inventory.sources), parts: partLayout(sizes).count }, 'Bestand vollständig geprüft.');
    } else {
      const result = await storage.exportLocalBackup(inventory.snapshot, options);
      options.signal.throwIfAborted();
      view('created', { figures: result.manifest.figures.length, createdAt: result.manifest.createdAt, parts: result.parts }, 'Backup erstellt. Die Dateien sind zum Herunterladen bereit.');
      inventory = undefined;
    }
  }
  function planView(message = 'Bitte die Auswahl prüfen und bestätigen.') {
    const rows = plan.rows.map((row, index) => ({
      title: row.source.figure.title, status: row.source.figure.status, videos: row.source.records.length,
      kind: row.kind, choice: choices[index], candidates: row.candidates.map(f => ({ id: f.id, title: f.title, status: f.status }))
    }));
    view('restore-plan', { ...archiveView(), rows }, message);
  }
  function archiveView() {
    return { ...summary(archive.sources), createdAt: archive.manifest.createdAt, parts: archive.manifest.partCount,
      supported: settings.supported, folders: settings.folders.map(f => ({ id: f.id, name: f.name })), target };
  }
  return {
    getState: snapshot,
    async startCreate() {
      if (!reset('create-start')) return false;
      return run(options => createStep('inspect', options));
    },
    async create() {
      if (state.view !== 'create-ready') return false;
      return run(options => createStep('export', options));
    },
    async grantAccess(id) {
      if (state.view !== 'access' || !state.data.folders.some(folder => folder.id === id)) return false;
      return run(async options => {
        await storage.allowFolderAccess(id, { signal: options.signal });
        options.signal.throwIfAborted();
        await onStorageChange();
        options.signal.throwIfAborted();
        await createStep(resume, options);
      });
    },
    startRestore() { return reset('restore-files'); },
    async readFiles(files) {
      if (state.busy || !state.view.startsWith('restore-') || !files.length) return false;
      clear(); view('restore-files', null);
      return run(async options => {
        const verified = await readBackup(files, options);
        options.signal.throwIfAborted();
        const available = await storage.storageSettings();
        options.signal.throwIfAborted();
        archive = verified; settings = available;
        view('restore-ready', archiveView(), 'Alle Sicherungsdateien sind gültig.');
      });
    },
    setTarget(id = null) {
      if (state.busy || !archive || !['restore-ready', 'restore-plan'].includes(state.view)) return false;
      if (id && (!settings.supported || !settings.folders.some(f => f.id === id))) throw new Error('Ungültiger Zielspeicher.');
      target = id; plan = undefined; choices = [];
      view('restore-ready', archiveView(), 'Ziel geändert. Bitte Wiederherstellung erneut prüfen.');
      return true;
    },
    async checkRestore() {
      if (!archive || !['restore-ready', 'restore-plan'].includes(state.view)) return false;
      return run(async options => {
        // Invalidate the previous plan before checking, including on failure.
        plan = undefined; choices = [];
        view('restore-ready', archiveView());
        const checked = await storage.planBackupRestore(archive, target, options);
        options.signal.throwIfAborted();
        plan = checked; choices = plan.rows.map(row => row.choice);
        planView();
      });
    },
    setChoice(index, value) {
      if (state.busy || state.view !== 'restore-plan' || !plan?.rows[index]) return false;
      if (!choicesFor(plan.rows[index]).includes(value)) throw new Error('Ungültige Wiederherstellungsauswahl.');
      choices[index] = value;
      // Selection is already displayed by the input; don't replace focused DOM.
      state = { ...state, data: immutable({ ...state.data, rows: state.data.rows.map((row, i) => i === index ? { ...row, choice: value } : row) }) };
      return true;
    },
    async restore(confirm) {
      if (state.view !== 'restore-plan' || !plan || typeof confirm !== 'function') return false;
      return run(async options => {
        const selection = [...choices];
        const accepted = await confirm({ title: 'Backup wiederherstellen?', message: `${selection.filter(c => c !== 'keep').length} Figuren übernehmen, davon ${selection.filter(c => c.startsWith('replace:')).length} vorhandene Figuren ausdrücklich ersetzen? Andere Figuren bleiben erhalten.`, ok: 'Wiederherstellen' });
        options.signal.throwIfAborted();
        if (!accepted) { emit({ message: 'Bitte die Auswahl prüfen und bestätigen.' }); return; }
        const count = await storage.restoreBackupPlan(plan, selection, options);
        clear(); view('restored', { count }, 'Wiederherstellung abgeschlossen.');
        await onStorageChange();
      });
    },
    cancel() {
      if (!controller || !state.canCancel) return false;
      controller.abort(); emit({ canCancel: false, message: 'Abbruch angefordert …' }); return true;
    },
    close() {
      if (state.busy) return false;
      clear(); view('closed', null); return true;
    }
  };
}
