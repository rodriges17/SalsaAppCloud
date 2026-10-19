export const STATUSES = ['Neu', 'Am Üben', 'Sitzt'];
export function cleanTags(value) { return [...new Set(value.split(',').map(s => s.trim()).filter(Boolean))]; }
export function timeLabel(value) { const n = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0; return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; }
export function filterFigures(figures, { query = '', status = '', tag = '', sort = 'newest' } = {}) {
  const search = query.trim().toLocaleLowerCase('de');
  return figures.filter(f => (!status || f.status === status) && (!tag || f.tags.includes(tag)) && (!search || [f.title, f.description, ...f.tags].join(' ').toLocaleLowerCase('de').includes(search))).sort((a, b) => {
    if (sort === 'name') return a.title.localeCompare(b.title, 'de');
    if (sort === 'status') return STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || a.title.localeCompare(b.title, 'de');
    return b.createdAt - a.createdAt;
  });
}
export class ABLoop {
  a = null; b = null;
  setA(time) { this.a = Math.max(0, time); this.b = null; }
  setB(time) { if (this.a !== null && time > this.a + 0.1) this.b = time; }
  clear() { this.a = this.b = null; }
  target(time, ended = false) { return this.a !== null && this.b !== null && (time >= this.b || ended) ? this.a : null; }
}
export function validateDraft(title, drafts) {
  if (!title.trim()) throw new Error('Bitte einen Namen für die Figur eingeben.');
  if (!drafts.length) throw new Error('Bitte mindestens ein Video hinzufügen.');
  if (!drafts.every(d => d.confirmed)) throw new Error('Bitte zuerst alle neuen Videos in der Vorschau bestätigen.');
  if (new Set(drafts.map(d => d.id)).size !== drafts.length) throw new Error('Ein Video ist mehrfach im Entwurf vorhanden.');
  if (drafts.some(d => !(d.blob instanceof Blob) || !d.blob.size || !Number.isFinite(d.duration) || d.duration <= 0)) throw new Error('Ein Video ist nicht abspielbar. Bitte ersetzen oder erneut prüfen.');
}
