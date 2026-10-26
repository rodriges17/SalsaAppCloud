import { videoHash } from './cloud-dedup.js';
import { localVideoContent, rememberLocalVideoHash } from './cloud-local-content.js';

export function abortable(work, signal) {
  signal?.throwIfAborted();
  if (!signal) return Promise.resolve().then(work);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Abgebrochen', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(() => { signal.throwIfAborted(); return work(); }).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
const hashKey = (size, hash) => `${size}:${hash}`;
const validHash = hash => /^[a-f0-9]{64}$/.test(hash);

// One figure at a time: completed saves survive cancellation; retries re-index real files.
export async function downloadLibrary(revisions, services, { signal, targetFolder = null, progress = () => {} } = {}) {
  const { listFigures, readMedia, readCloudMedia, fetchVideo, inspectVideo, saveFigure } = services;
  const unique = [...new Map(revisions.filter(r => r?.videos?.length).map(r => [r.id, r])).values()];
  const result = { total: unique.length, saved: 0, skipped: 0, failed: [], cancelled: false };
  const emit = (phase, title = '', video = 0, videos = 0) => { result.remaining = result.total - result.saved - result.skipped - result.failed.length; progress({ ...result, phase, title, video, videos, done: result.total - result.remaining }); };
  const sources = new Map(), figureKeys = new Map();
  const identity = figure => JSON.stringify([figure.storageFolder ?? null, figure.id]);
  try {
    emit('index');
    const figures = await abortable(listFigures, signal);
    await abortable(() => localVideoContent(figures, readMedia, () => !signal?.aborted, undefined, ({ figure, record, size, hash }) => {
      const key = hashKey(size, hash); sources.set(key, { figure, recordId: record.id });
      if (!figureKeys.has(identity(figure))) figureKeys.set(identity(figure), new Set());
      figureKeys.get(identity(figure)).add(key);
    }), signal);
    const importTime = Math.max(Date.now(), ...figures.map(f => Number(f.createdAt) || 0)) + unique.length;
    for (const [position, revision] of unique.entries()) {
      signal?.throwIfAborted(); emit('check', revision.title);
      try {
        if (revision.videos.some(video => !Number.isSafeInteger(video.size) || video.size <= 0) || revision.videos.reduce((sum, video) => sum + video.size, 0) > 250 * 1024 * 1024) throw new Error('Diese Figur überschreitet 250 MB oder enthält ungültige Dateigrößen. Bitte einzeln übernehmen.');
        const media = [];
        for (const video of revision.videos) {
          signal?.throwIfAborted();
          const metadata = await abortable(() => readCloudMedia({ revision: revision.id, media: video.id }), signal);
          media.push({ video, hash: validHash(metadata.content_hash) ? metadata.content_hash : null });
        }
        if (media.every(({ video, hash }) => hash && sources.has(hashKey(video.size, hash)))) { result.skipped++; emit('skip', revision.title); continue; }
        const target = figures.find(f => !f.storageProblem && !f.folderAccessRequired && f.importFingerprint?.startsWith(`cloud:${revision.id}:`));
        const drafts = target ? await abortable(async () => Promise.all((await readMedia(target)).map(async record => ({ ...await record.load(), existing: true, confirmed: true }))), signal) : [];
        const targetKeys = new Set(target ? figureKeys.get(identity(target)) ?? [] : []);
        const completedMedia = [];
        for (let i = 0; i < media.length; i++) {
          signal?.throwIfAborted();
          const { video, hash } = media[i], key = hash ? hashKey(video.size, hash) : null;
          if (key && targetKeys.has(key)) continue;
          emit('download', revision.title, i + 1, media.length);
          const source = key ? sources.get(key) : null;
          let draft;
          if (source) {
            const loaded = await abortable(async () => {
              const record = (await readMedia(source.figure)).find(record => record.id === source.recordId);
              if (!record) throw new Error('Eine lokale Videodatei fehlt.');
              return record.load();
            }, signal);
            if (loaded.blob.size !== video.size || await abortable(() => videoHash(loaded.blob), signal) !== hash) throw new Error('Eine lokale Videodatei wurde inzwischen geändert. Bitte erneut versuchen.');
            draft = { ...loaded };
          } else {
            const blob = await abortable(() => fetchVideo(revision, video, signal), signal);
            if (blob.size !== video.size) throw new Error('Unvollständiger Download.');
            if (hash && await abortable(() => videoHash(blob), signal) !== hash) throw new Error('Die Prüfsumme des Downloads stimmt nicht.');
            draft = { ...await abortable(() => inspectVideo(blob, signal), signal), blob };
          }
          draft = { ...draft, id: crypto.randomUUID(), name: video.name || 'Video', confirmed: true, existing: false };
          drafts.push(draft); completedMedia.push({ hash, draft });
          if (key) targetKeys.add(key);
        }
        if (!target && services.readPoster) {
          try { const poster = await abortable(() => services.readPoster(revision), signal); if (poster && drafts[0]) drafts[0].poster = poster; }
          catch (error) { if (signal?.aborted) throw error; }
        }
        signal?.throwIfAborted(); emit('save', revision.title);
        const figure = target ? { ...target } : { id: crypto.randomUUID(), title: revision.title, description: revision.description ?? '', tags: revision.tags ?? [], status: 'Neu', createdAt: importTime - position };
        figure.importFingerprint = `cloud:${revision.id}:${revision.videos.map(v => v.id).join(',')}`;
        // Do not race an atomic save with cancellation: finish this figure, then stop.
        const saved = await saveFigure(figure, drafts, target?.revision ?? null, { targetFolder });
        result.saved++;
        if (target) figures.splice(figures.indexOf(target), 1, saved); else figures.push(saved);
        // Keep lazy locators, not all downloaded video blobs, between figures.
        for (const source of sources.values()) if (identity(source.figure) === identity(saved)) source.figure = saved;
        const savedRecords = await readMedia(saved).catch(() => []);
        figureKeys.set(identity(saved), targetKeys);
        for (const { hash, draft } of completedMedia) {
          if (!hash) continue;
          const record = savedRecords.find(r => r.id === draft.id);
          if (record) {
            sources.set(hashKey(draft.blob.size, hash), { figure: saved, recordId: record.id });
            await rememberLocalVideoHash(record, draft.blob.size, hash).catch(() => {});
          }
        }
        emit('saved', revision.title);
      } catch (error) {
        if (signal?.aborted) throw error;
        result.failed.push({ revision: revision.id, title: revision.title, message: error.name === 'QuotaExceededError' ? 'Der lokale Speicher ist voll. Bitte Platz freigeben und erneut starten.' : error.message }); emit('error', revision.title);
        if (error.name === 'QuotaExceededError') break;
      }
    }
  } catch (error) {
    if (!signal?.aborted) throw error;
    result.cancelled = true;
  }
  emit(result.cancelled ? 'cancelled' : 'done');
  return result;
}

export async function inspectCloudVideo(blob, signal) {
  const player = document.createElement('video'), url = URL.createObjectURL(blob);
  player.muted = true; player.playsInline = true; player.preload = 'auto';
  try {
    await new Promise((resolve, reject) => {
      const finish = error => { clearTimeout(timer); player.removeEventListener('loadeddata', ready); player.removeEventListener('error', failed); signal?.removeEventListener('abort', aborted); error ? reject(error) : resolve(); };
      const ready = () => finish(), failed = () => finish(new Error('Dieses Video kann auf deinem Gerät nicht gelesen werden.')), aborted = () => finish(signal.reason);
      const timer = setTimeout(() => finish(new Error('Das Video konnte nicht rechtzeitig geprüft werden.')), 30000);
      player.addEventListener('loadeddata', ready, { once: true }); player.addEventListener('error', failed, { once: true }); signal?.addEventListener('abort', aborted, { once: true });
      if (signal?.aborted) return aborted();
      player.src = url; player.load();
    });
    if (!Number.isFinite(player.duration) || player.duration <= 0 || !player.videoWidth || !player.videoHeight) throw new Error('Das Video ist nicht abspielbar.');
    let poster = null;
    try {
      const canvas = document.createElement('canvas'), ratio = Math.min(1, 360 / player.videoWidth);
      canvas.width = Math.max(1, Math.round(player.videoWidth * ratio)); canvas.height = Math.max(1, Math.round(player.videoHeight * ratio));
      canvas.getContext('2d').drawImage(player, 0, 0, canvas.width, canvas.height);
      poster = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.72));
    } catch { /* Poster is optional; decoded metadata is required. */ }
    return { duration: player.duration, width: player.videoWidth, height: player.videoHeight, poster };
  } finally { player.pause(); player.removeAttribute('src'); player.load(); URL.revokeObjectURL(url); }
}

// A single explicit import saves immediately; only replacing an existing figure
// needs the caller's conflict choice. Local file imports still use their editor.
export async function downloadFigure(revision, services, { target = null, targetFolder = null, signal } = {}) {
  const { listFigures, readMedia, readCloudMedia, fetchVideo, inspectVideo, saveFigure } = services;
  const sources = new Map(), drafts = [], verified = [];
  await abortable(async () => localVideoContent(await listFigures(), readMedia, () => !signal?.aborted, undefined, ({figure, record, size, hash}) => {
    sources.set(hashKey(size, hash), {figure, recordId: record.id});
  }), signal);
  for (const video of revision.videos) {
    signal?.throwIfAborted();
    const metadata = await abortable(() => readCloudMedia({ revision: revision.id, media: video.id }), signal);
    const hash = validHash(metadata.content_hash) ? metadata.content_hash : null;
    const source = hash && sources.get(hashKey(video.size, hash));
    let blob;
    if (source) blob = await abortable(async () => {
      const record = (await readMedia(source.figure)).find(record => record.id === source.recordId);
      if (!record) throw new Error('Eine lokale Videodatei fehlt.');
      return (await record.load()).blob;
    }, signal);
    else blob = await abortable(() => fetchVideo(revision, video, signal), signal);
    if (blob.size !== video.size) throw new Error('Unvollständiger Download.');
    if (hash && await abortable(() => videoHash(blob), signal) !== hash) throw new Error('Die Prüfsumme des Downloads stimmt nicht.');
    const info = await abortable(() => inspectVideo(blob, signal), signal);
    const draft = { ...info, blob, id: crypto.randomUUID(), name: video.name || 'Video', confirmed: true, existing: false };
    drafts.push(draft); verified.push({draft, hash});
  }
  if (services.readPoster) {
    try { const poster = await abortable(() => services.readPoster(revision), signal); if (poster && drafts[0]) drafts[0].poster = poster; }
    catch (error) { if (signal?.aborted) throw error; }
  }
  signal?.throwIfAborted();
  const figure = { ...target, id: target?.id ?? crypto.randomUUID(), title: revision.title, description: revision.description ?? '', tags: revision.tags ?? [], status: target?.status ?? 'Neu', importFingerprint: `cloud:${revision.id}:${revision.videos.map(v => v.id).join(',')}` };
  const saved = await saveFigure(figure, drafts, target?.revision ?? null, { targetFolder });
  const records = await readMedia(saved).catch(() => []);
  for (const {draft, hash} of verified) {
    const record = records.find(record => record.id === draft.id);
    if (record && hash) await rememberLocalVideoHash(record, draft.blob.size, hash).catch(() => {});
  }
  return saved;
}
