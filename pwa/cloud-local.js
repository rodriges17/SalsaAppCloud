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
    remember(owner, revision, figure, pairs) {
      if (!owner || !revision || !pairs.length) throw new Error('Die lokale Zuordnung ist unvollständig.');
      const folder = figure.storageFolder || null;
      const next = read().filter(v => !(v.owner === owner && v.revision === revision && v.figure === figure.id && v.folder === folder));
      next.push({ owner, revision, figure: figure.id, folder, pairs: pairs.map(p => ({ cloud: p.cloud, local: p.local })) });
      links = next;
      try { const raw = JSON.stringify(next); storage.setItem(key, raw); persisted = raw; return true; } catch { return false; }
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
