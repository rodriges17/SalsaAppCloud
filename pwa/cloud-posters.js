import { readCloudCache, writeCloudCache, cloudCacheRevision } from './cloud-cache.js';
import { cloudCall, cloudIdentity } from './cloud-api.js';
import { listFigures, figureVideos } from './storage.js';
const LIMIT = 65536;
async function cachedPoster(owner, revision, blob, kind = 'local', generation = cloudCacheRevision(owner)) {
  if (blob) return writeCloudCache(owner, `poster:${revision}`, { bytes: await blob.arrayBuffer(), kind }, generation);
  const record = await readCloudCache(owner, `poster:${revision}`);
  return record ? { ...record, blob: new Blob([record.value.bytes], { type: 'image/jpeg' }) } : null;
}
const fromBase64 = value => {
  if (typeof value !== 'string' || value.length > 90000) return null;
  const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0));
  return new Blob([bytes], { type: 'image/jpeg' });
};
export async function posterPayload(blob, kind = 'local') {
  if (!blob) return null;
  let image;
  if (blob.type !== 'image/jpeg' || blob.size > LIMIT) {
    const url = URL.createObjectURL(blob);
    try {
      image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement('canvas'), ratio = Math.min(1, 360 / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio)); canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.72));
    } finally { URL.revokeObjectURL(url); }
  }
  if (!blob?.size || blob.size > LIMIT) return null;
  const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = '';
  for (let i = 0; i < bytes.length; i += 16384) binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return { data: btoa(binary), kind };
}
async function localPoster(user, revision, figures) {
  const matches = [];
  for (const figure of await figures()) {
    if (!figure.poster) continue;
    if (figure.importFingerprint === `cloud:${revision.id}:${revision.videos.map(v => v.id).join(',')}`) { matches.push(figure); continue; }
    if (figure.title !== revision.title || (figure.description ?? '') !== (revision.description ?? '') || JSON.stringify(figure.tags) !== JSON.stringify(revision.tags)) continue;
    try {
      const records = figure.videos ?? await figureVideos(figure);
      if (revision.videos.every(media => records.some(v => v.name === media.name && (v.size ?? v.blob?.size) === media.size && (v.type ?? v.blob?.type) === media.type))) matches.push(figure);
    } catch { /* Cached folder metadata can still supply the original poster without permission. */ }
  }
  return matches.length === 1 ? matches[0].poster : null;
}
function waitFor(player, event, signal, work) {
  return new Promise((resolve, reject) => {
    const finish = error => { clearTimeout(timer); player.removeEventListener(event, ready); player.removeEventListener('error', failed); signal.removeEventListener('abort', aborted); error ? reject(error) : resolve(); };
    const ready = () => finish(), failed = () => finish(new Error('Video kann nicht gelesen werden.')), aborted = () => finish(new DOMException('Cancelled', 'AbortError'));
    const timer = setTimeout(failed, 10000);
    player.addEventListener(event, ready, { once: true }); player.addEventListener('error', failed, { once: true }); signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) return aborted();
    try { work(); } catch (error) { finish(error); }
  });
}
async function videoPoster(revision, signal) {
  const media = revision.videos?.[0]; if (!media) return null;
  const signed = await cloudCall('media_url', { revision: revision.id, media: media.id }); signal.throwIfAborted();
  const player = document.createElement('video'); player.crossOrigin = 'anonymous'; player.muted = true; player.playsInline = true; player.preload = 'metadata';
  try {
    await waitFor(player, 'loadedmetadata', signal, () => { player.src = signed.url; });
    if (!Number.isFinite(player.duration) || player.duration <= 0) return null;
    const canvas = document.createElement('canvas'), ratio = Math.min(1, 240 / Math.max(player.videoWidth, player.videoHeight));
    canvas.width = Math.max(1, Math.round(player.videoWidth * ratio)); canvas.height = Math.max(1, Math.round(player.videoHeight * ratio));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    for (const seconds of [1, 2, 4, 0.25]) {
      const target = Math.min(seconds, player.duration * 0.8);
      await waitFor(player, 'seeked', signal, () => { player.currentTime = target; });
      context.drawImage(player, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let brightness = 0; for (let i = 0; i < pixels.length; i += 16) brightness += pixels[i] + pixels[i + 1] + pixels[i + 2];
      if (brightness / Math.ceil(pixels.length / 16) < 24) continue;
      return await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.72));
    }
    return null;
  } finally { player.pause(); player.removeAttribute('src'); player.load(); }
}
export function createPosterView(root, user) {
  const controller = new AbortController(), urls = new Set(), jobs = new Map(), owner = cloudIdentity(), generation = cloudCacheRevision(owner); let figures;
  const locals = () => figures ??= listFigures().catch(() => []);
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) { observer.unobserve(entry.target); jobs.get(entry.target)?.(); }
  }, { root: root.closest('.cloud-scroll') ?? root, rootMargin: '100px' });
  return {
    add(heading, revision) {
      const placeholder = document.createElement('span'); placeholder.className = 'cloud-thumbnail-placeholder'; placeholder.setAttribute('aria-hidden', 'true');
      placeholder.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m4 18 5-6 4 4 3-4 4 6"/></svg>';
      heading.prepend(placeholder);
      jobs.set(heading, async () => {
        const active = () => !controller.signal.aborted && heading.isConnected && owner === cloudIdentity() && generation === cloudCacheRevision(owner);
        let displayed = placeholder;
        const show = async blob => {
          if (!blob || !active()) return;
          const image = document.createElement('img'), url = URL.createObjectURL(blob); urls.add(url);
          image.className = 'cloud-thumbnail'; image.alt = ''; image.width = 64; image.height = 64; image.src = url;
          try { await image.decode(); if (active()) { const previous = displayed; displayed.replaceWith(image); displayed = image; if (previous.tagName === 'IMG') { URL.revokeObjectURL(previous.src); urls.delete(previous.src); } } else { URL.revokeObjectURL(url); urls.delete(url); } } catch { URL.revokeObjectURL(url); urls.delete(url); }
        };
        try {
          const saved = await cachedPoster(owner, revision.id);
          if (saved) { await show(saved.blob); if (Date.now() - saved.updatedAt < 60000 || !navigator.onLine) return; }
          if (!active()) return;
          const remote = await cloudCall('poster_get', { revision: revision.id }); if (!active()) return;
          let blob = remote.poster ? fromBase64(remote.poster) : saved?.blob, local;
          if (!remote.poster || !blob || (remote.kind === 'frame' && remote.can_write)) local = await localPoster(user, revision, locals);
          if (!active()) return;
          if (local) blob = local;
          const kind = local ? 'local' : (remote.poster ? remote.kind : saved?.value.kind) ?? 'frame';
          if (!blob) blob = await videoPoster(revision, controller.signal);
          if (!blob || !active()) return;
          if (remote.can_write && (!remote.poster || (local && remote.kind === 'frame'))) {
            const payload = await posterPayload(blob, kind); if (!active()) return;
            if (payload) {
              try { const saved = await cloudCall('poster_put', { revision: revision.id, ...payload }); if (saved.poster) blob = fromBase64(saved.poster); }
              catch { /* A poster failure must leave the figure's actions usable. Retry on next visit. */ }
            }
          }
          if (!blob || !active()) return;
          await cachedPoster(owner, revision.id, blob, kind, generation).catch(() => {});
          if (!active()) return;
          await show(blob);
        } catch { /* Keep the neutral image placeholder, including for anonymous/offline readers. */ }
      });
      observer.observe(heading);
    },
    dispose() { controller.abort(); observer.disconnect(); jobs.clear(); for (const url of urls) URL.revokeObjectURL(url); urls.clear(); }
  };
}
