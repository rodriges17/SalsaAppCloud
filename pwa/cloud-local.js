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
    copy(source, target) {
      const modified = this.status(source) === 'modified', link = this.link(source);
      if (!link) return;
      const pairs = link.pairs.map(pair => ({cloud: pair.cloud, local: target.videoIds[source.videoIds.indexOf(pair.local)]})).filter(pair => pair.local);
      if (pairs.length) this.remember(link.owner, link.revision, target, pairs, link.cloudFigure, modified ? '@locally-modified' : undefined);
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
    // Resolve one readable copy, never the union of several partial copies.
    // Provenance describes intentional edits; storageProblem describes unreadable files.
    resolve(revision, figures, { figureId = revision?.figure_id, revisionIds = [] } = {}) {
      if (!revision) return { kind: 'cloud', label: 'Nur in der Cloud', available: false, modified: false, figure: null, current: null };
      this.reconcile(revision, figures);
      const currentIds = new Set([revision.id, ...(revision.legacy_ids ?? [])]);
      const history = new Set([...currentIds, ...revisionIds]);
      const required = revision.videos ?? [];
      const candidates = [];
      for (const figure of figures) {
        const origin = this.link(figure);
        const imported = figure.importFingerprint?.split(':');
        const fallback = imported?.[0] === 'cloud' ? { revision: imported[1], pairs: (imported[2] ?? '').split(',').filter(Boolean).map((cloud, i) => ({ cloud, local: figure.videoIds[i] })) } : null;
        const link = origin ?? fallback;
        if (!link || !(history.has(link.revision) || figureId && link.cloudFigure === figureId)) continue;
        const modified = this.status(figure) === 'modified';
        const ids = new Set(figure.videoIds);
        const covered = new Set(link.pairs.filter(pair => ids.has(pair.local) || modified).map(pair => pair.cloud));
        const isCurrent = currentIds.has(link.revision);
        const readable = !figure.storageProblem && !figure.folderAccessRequired && ids.size > 0;
        const complete = isCurrent && required.length > 0 && required.every(video => covered.has(video.id));
        candidates.push({ figure, modified, isCurrent, readable, complete, covered });
      }
      const complete = candidates.find(c => c.readable && c.complete);
      const older = candidates.find(c => c.readable && !c.isCurrent);
      const partial = candidates.find(c => c.readable && c.isCurrent && c.covered.size);
      const blocked = candidates.find(c => c.figure.folderAccessRequired);
      const chosen = complete ?? older ?? partial ?? blocked ?? candidates[0];
      const kind = complete ? 'available' : older ? 'outdated' : partial ? 'partial' : blocked ? 'access-required' : chosen ? 'missing' : 'cloud';
      const labels = { available: 'Lokal verfügbar', outdated: 'Neuere Cloud-Version verfügbar', partial: 'Teilweise lokal verfügbar', 'access-required': 'Ordnerzugriff nötig', missing: 'Lokale Dateien fehlen', cloud: 'Nur in der Cloud' };
      const label = labels[kind];
      return { kind, label, available: !!complete, modified: !!chosen?.modified,
        figure: chosen?.readable ? chosen.figure : null, current: complete?.figure ?? null,
        detail: label + (chosen?.modified ? ' · lokal angepasst' : ''),
        copies: candidates.map(c => c.figure) };
    },
    // Conflict choices use the same origin knowledge, including uploaded originals
    // without an importFingerprint and copies whose title was changed locally.
    importCandidates({ title, fingerprint, revisionIds = [], figureId }, figures) {
      const normalize = value => (value ?? '').trim().normalize('NFC').toLocaleLowerCase('de');
      return figures.filter(figure => {
        const link = this.link(figure);
        return !!fingerprint && figure.importFingerprint === fingerprint || normalize(figure.title) === normalize(title)
          || revisionIds.some(id => link?.revision === id || figure.importFingerprint?.startsWith(`cloud:${id}:`))
          || !!figureId && link?.cloudFigure === figureId;
      });
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
