import { localContentSignature } from './cloud-provenance.js';
// Local provenance is not a cloud permission or a media-integrity assertion.
// Keep it outside figure metadata so linking never rewrites videos or learning status.
export function createCloudLocalIndex(storage, key) {
  let links, persisted;
  function read() {
    try {
      const raw = storage.getItem(key) || '[]';
      if (!links || raw !== persisted) {
        const value = JSON.parse(raw);
        links = Array.isArray(value) ? value.filter(v => v && typeof v.owner === 'string' && typeof v.revision === 'string' && typeof v.figure === 'string' && (v.folder === null || typeof v.folder === 'string') && Array.isArray(v.pairs) && v.pairs.every(p => p && typeof p.cloud === 'string' && typeof p.local === 'string')) : [];
        persisted = raw;
      }
    } catch { links ??= []; }
    return links;
  }
  return {
    remember(owner, revision, figure, pairs, cloudFigure = null, baseline = localContentSignature(figure)) {
      if (!owner || !revision || !pairs.length) throw new Error('Die lokale Zuordnung ist unvollständig.');
      const folder = figure.storageFolder || null;
      const next = read().filter(v => !(v.owner === owner && v.revision === revision && v.figure === figure.id && v.folder === folder));
      next.push({ owner, revision, cloudFigure, baseline, figure: figure.id, folder, pairs: pairs.map(p => ({ cloud: p.cloud, local: p.local })) });
      links = next;
      try { const raw = JSON.stringify(next); storage.setItem(key, raw); persisted = raw; return true; } catch { return false; }
    },
    link(figure) {
      return read().findLast(v => v.figure === figure.id && v.folder === (figure.storageFolder || null)) ?? null;
    },
    status(figure) {
      const link = this.link(figure);
      if (link && !link.baseline) this.remember(link.owner, link.revision, figure, link.pairs, link.cloudFigure);
      if (link) return link.baseline && link.baseline !== localContentSignature(figure) ? 'modified' : 'cloud';
      if (figure.importFingerprint?.startsWith('cloud:')) {
        const [, revision, ids] = figure.importFingerprint.split(':');
        const pairs = (ids ?? '').split(',').filter(Boolean).map((cloud, i) => ({cloud, local: figure.videoIds[i]})).filter(p => p.local);
        if (pairs.length) this.remember('@device', revision, figure, pairs);
        return 'cloud';
      }
      return 'local';
    },
    reconcile(revision, figures) {
      for (const figure of figures) {
        const link = this.link(figure);
        const imported = figure.importFingerprint?.split(':');
        const old = link?.revision ?? (imported?.[0] === 'cloud' ? imported[1] : null);
        if (old && old !== revision.id && revision.legacy_ids?.includes(old)) {
          const pairs = link?.pairs ?? (imported[2] ?? '').split(',').map((cloud, i) => ({cloud, local: figure.videoIds[i]})).filter(p => p.local);
          if (pairs.length) this.remember(link?.owner ?? '@device', revision.id, figure, pairs, revision.figure_id, link?.baseline);
        }
      }
    },
    find(revision, figures) {
      const links = read().filter(v => v.revision === revision);
      return figures.find(f => !f.storageProblem && !f.folderAccessRequired && (links.some(v => v.figure === f.id && v.folder === (f.storageFolder || null)) || f.importFingerprint?.startsWith(`cloud:${revision}:`)));
    },
    availability(owner, revision, figures) {
      const available = [], accessRequired = [];
      for (const link of read().filter(v => v.owner === owner && v.revision === revision)) {
        const figure = figures.find(f => f.id === link.figure && (f.storageFolder || null) === link.folder);
        if (!figure || (figure.storageProblem && !figure.folderAccessRequired)) continue;
        const ids = new Set(figure.videoIds);
        const selected = new Set(link.pairs.filter(p => ids.has(p.local)).map(p => p.cloud));
        if (selected.size) (figure.folderAccessRequired ? accessRequired : available).push(selected);
      }
      return { available, accessRequired };
    },
    selections(owner, revision, figures) { return this.availability(owner, revision, figures).available; }
  };
}

export const cloudLocalIndex = createCloudLocalIndex({ getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) }, `salsa-cloud-local:${new URL('./', import.meta.url).pathname}:v1`);
