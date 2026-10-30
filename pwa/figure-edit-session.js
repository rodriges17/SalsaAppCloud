import { validateDraft } from './logic.js';

const draftKey = drafts => JSON.stringify(drafts.map(({ id, name, confirmed }) => ({ id, name, confirmed })));
const metadata = figure => ({ title: figure?.title ?? '', description: figure?.description ?? '', tags: [...(figure?.tags ?? [])], status: figure?.status ?? 'Neu' });

// The view and tests use this same seam. Storage and media presentation remain adapters.
export function createFigureEditSession({ figure = null, imported = null, readVideos, readFigure, commit, refresh }) {
  let data = metadata(figure), drafts = [], active = true, saving = null, saved = null;
  let preview = null, reviewing = false;
  const id = figure?.id ?? crypto.randomUUID();
  let initialForm = JSON.stringify(data), conflict = false, reloadWork = null, refreshWork = null, refreshError = null;
  let initialDrafts = draftKey(drafts), loading = !!figure && !imported, loadFailed = false;
  const controller = new AbortController();
  let loadWork;
  let fingerprint = imported?.fingerprint ?? figure?.importFingerprint ?? null;
  if (imported) {
    data = { ...metadata(imported), status: figure?.status ?? 'Neu' };
    drafts = imported.drafts.map(d => ({ ...d, id: crypto.randomUUID(), existing: false, confirmed: false }));
  }
  const editable = () => active && !saving && !saved && !reloadWork;
  const mediaEditable = () => editable() && !loading && !loadFailed;
  const session = {
    get data() { return { ...data, tags: [...data.tags] }; },
    get drafts() { return drafts.map(d => ({ ...d })); },
    get active() { return active; },
    get busy() { return !!saving || !!reloadWork || !!refreshWork; },
    get reloading() { return !!reloadWork; },
    get refreshError() { return refreshError; },
    get saved() { return saved; },
    get loading() { return loading; },
    get loadFailed() { return loadFailed; },
    get conflict() { return conflict; },
    get dirty() { return !saved && (JSON.stringify(data) !== initialForm || draftKey(drafts) !== initialDrafts); },
    get canSave() { return editable() && !conflict && !loading && !loadFailed && !preview && !!data.title.trim() && drafts.length > 0 && drafts.every(d => d.confirmed && !d.missing); },
    load({ progress = () => {} } = {}) {
      if (loadWork) return loadWork;
      if (!active) return Promise.resolve({ kind: 'stale' });
      if (!loading) return Promise.resolve({ kind: 'unchanged' });
      loadWork = (async () => {
        try {
          const fresh = readFigure ? await readFigure(figure, { signal: controller.signal }) : figure;
          if (!active) return { kind: 'stale' };
          if (!fresh) throw new Error('Die Figur ist nicht mehr vorhanden. Dein Entwurf bleibt erhalten.');
          const loaded = await readVideos(fresh, true, { signal: controller.signal, progress: value => { if (active) progress(value); } });
          if (!active) return { kind: 'stale' };
          const original = metadata(figure), current = metadata(fresh);
          for (const key of Object.keys(current)) if (JSON.stringify(data[key]) === JSON.stringify(original[key])) data[key] = current[key];
          figure = fresh; fingerprint = fresh.importFingerprint ?? null; initialForm = JSON.stringify(current);
          drafts = loaded.map(d => ({ ...d, existing: !d.missing, confirmed: !d.missing }));
          initialDrafts = draftKey(drafts); return { kind: 'loaded' };
        } catch (error) { if (!active) return { kind: 'stale' }; loadFailed = true; return { kind: 'failed', error }; }
        finally { if (active) loading = false; }
      })();
      return loadWork;
    },
    reload(confirmed = false) {
      if (!confirmed) return Promise.resolve({ kind: 'kept' });
      if (reloadWork) return reloadWork;
      if (!editable() || loading || !figure) return Promise.resolve({ kind: 'stale' });
      reloadWork = Promise.resolve().then(async () => {
        try {
          const fresh = await readFigure(figure, { signal: controller.signal });
          if (!active) return { kind: 'stale' };
          if (!fresh) throw new Error('Die Figur ist nicht mehr vorhanden. Dein Entwurf bleibt erhalten.');
          const loaded = await readVideos(fresh, true, { signal: controller.signal });
          if (!active) return { kind: 'stale' };
          figure = fresh; data = metadata(fresh); drafts = loaded.map(d => ({ ...d, existing: !d.missing, confirmed: !d.missing }));
          fingerprint = fresh.importFingerprint ?? null;
          initialForm = JSON.stringify(data); initialDrafts = draftKey(drafts); conflict = false; loadFailed = false;
          return { kind: 'reloaded' };
        } catch (error) { return active ? { kind: 'failed', error } : { kind: 'stale' }; }
      }).finally(() => { reloadWork = null; });
      return reloadWork;
    },
    update(value) { if (editable()) data = metadata({ ...data, ...value }); },
    addFiles(files) {
      if (!mediaEditable()) return;
      if (files.some(file => !file.size || (!file.type.startsWith('video/') && !/\.(mov|mp4|m4v|webm|ogv)$/i.test(file.name)))) throw new Error('Bitte eine nicht leere Videodatei wählen.');
      const added = files.map(file => ({ id: crypto.randomUUID(), name: file.name.replace(/\.[^.]+$/, ''), blob: file, confirmed: false, existing: false, duration: 0, poster: null }));
      drafts.push(...added);
      if (!data.title.trim() && !figure?.revision && added.length) data.title = added[0].name;
      return added;
    },
    rename(id, name) { if (mediaEditable()) { const d = drafts.find(d => d.id === id); if (d) d.name = name; } },
    move(id, position) {
      if (!mediaEditable() || position < 0 || position >= drafts.length) return;
      const index = drafts.findIndex(d => d.id === id); if (index < 0) return;
      drafts.splice(position, 0, drafts.splice(index, 1)[0]);
    },
    remove(id) { if (mediaEditable() && drafts.length > 1) drafts = drafts.filter(d => d.id !== id); },
    startPreview(draft, replacing = null) {
      if (!replacing) draft = drafts.find(d => d.id === draft?.id);
      if (!mediaEditable() || draft?.missing || !draft?.blob) return null;
      preview = { draft: { ...draft }, replacing, accepted: false }; return preview;
    },
    startReplacement(file, id) {
      if (!mediaEditable() || !drafts.some(d => d.id === id)) return null;
      if (!file.size || (!file.type.startsWith('video/') && !/\.(mov|mp4|m4v|webm|ogv)$/i.test(file.name))) throw new Error('Bitte eine nicht leere Videodatei wählen.');
      return session.startPreview({ id: crypto.randomUUID(), name: file.name.replace(/\.[^.]+$/, ''), blob: file, existing: false, confirmed: false, duration: 0, poster: null }, id);
    },
    review() { reviewing = true; const draft = drafts.find(d => !d.confirmed && !d.missing); return draft ? session.startPreview(draft) : null; },
    async acceptPreview(token, inspect) {
      if (!editable() || preview !== token || token.accepted) return { kind: 'stale' };
      try {
        const details = await inspect();
        if (!editable() || preview !== token) return { kind: 'stale' };
        if (!Number.isFinite(details.duration) || details.duration <= 0) throw new Error('Ein Video ist nicht abspielbar. Bitte ersetzen oder erneut prüfen.');
        const index = drafts.findIndex(d => d.id === (token.replacing ?? token.draft.id));
        if (index < 0) return { kind: 'stale' };
        drafts[index] = { ...token.draft, ...details, poster: details.poster ?? token.draft.poster, confirmed: true };
        token.accepted = true;
        return { kind: 'accepted' };
      } catch (error) { return editable() && preview === token ? { kind: 'failed', error } : { kind: 'stale' }; }
    },
    endPreview() {
      const more = reviewing && preview?.accepted; preview = null;
      if (more) { const next = drafts.find(d => !d.confirmed && !d.missing); if (next) return session.startPreview(next); }
      reviewing = false; return null;
    },
    leave(discard = false) {
      if (!active) return { kind: 'left' };
      if (saving || refreshWork) return { kind: 'busy' };
      if (session.dirty && !discard) return { kind: 'confirm' };
      active = false; preview = null; controller.abort(); return { kind: 'left' };
    },
    save() {
      if (saving) return saving;
      if (saved) return session.retryRefresh();
      if (!session.canSave) return Promise.resolve({ kind: 'invalid' });
      saving = Promise.resolve().then(async () => {
        try {
          validateDraft(data.title, drafts);
          saved = await commit({ id, ...data, storageFolder: figure?.storageFolder, importFingerprint: fingerprint }, drafts, figure?.revision ?? null);
          return await session.retryRefresh();
        } catch (error) { conflict = error.code === 'FIGURE_CONFLICT'; return { kind: 'failed', error }; }
      }).finally(() => { saving = null; });
      return saving;
    },
    retryRefresh() {
      if (refreshWork) return refreshWork;
      if (!active || !saved) return Promise.resolve({ kind: 'stale' });
      refreshWork = Promise.resolve().then(async () => {
        try { await refresh(); refreshError = null; return { kind: 'saved', figure: saved }; }
        catch (error) { refreshError = error; return { kind: 'refresh-needed', figure: saved, error }; }
      }).finally(() => { refreshWork = null; });
      return refreshWork;
    }
  };
  return session;
}
