import { exportFigure, packageFilename, packageSize, MAX_PACKAGE_BYTES } from './package.js';

// Figur-ZIP owns its selection, prepared archive and lifetime. No DOM or storage
// implementation leaks through this interface. Full backups use another workflow.
export function createFigureZipWorkflow({ readVideos, delivery, onChange = () => {},
  yieldToUI = () => new Promise(resolve => setTimeout(resolve, 0)) }) {
  let active = null, generation = 0;
  const getState = () => {
    if (!active) return { open: false };
    const records = active.records.filter(r => active.selected.has(r.id));
    const size = packageSize(active.figure, records), transfer = delivery.getState();
    const busy = !!active.controller || transfer.busy;
    return { open: true, title: active.figure.title,
      videos: active.records.map((r, i) => ({ id: r.id, name: r.name || `Video ${i + 1}`, size: r.blob.size, selected: active.selected.has(r.id) })),
      count: records.length, size, busy, delivering: transfer.busy, canClose: !transfer.busy,
      canPrepare: !busy && records.length > 0 && records.length <= 100 && size <= MAX_PACKAGE_BYTES,
      ready: !!active.file, canShare: !!active.file && delivery.canShare(active.file),
      message: (transfer.message || active.message) + (transfer.result === 'download' && active.file && delivery.canShare(active.file) ? ' Falls keine Datei erscheint, ZIP teilen und eine Dateien-App wählen.' : ''), error: transfer.error || active.error };
  };
  const notify = () => onChange(getState());
  return {
    getState, refresh: notify,
    async open(figure) {
      if (active) return false;
      const ticket = ++generation, records = await readVideos(figure);
      if (ticket !== generation || active) return false;
      active = { figure, records, selected: new Set(records.map(r => r.id)), file: null, controller: null, message: '', error: '' };
      delivery.reset(); notify(); return true;
    },
    select(id, selected) {
      if (!active || getState().busy || !active.records.some(r => r.id === id)) return false;
      if (selected) active.selected.add(id); else active.selected.delete(id);
      active.file = null; active.message = ''; active.error = ''; delivery.reset(); notify(); return true;
    },
    async prepare() {
      if (!active || !getState().canPrepare) return;
      const current = active, controller = new AbortController();
      current.controller = controller; current.file = null; current.error = ''; current.message = 'ZIP inkl. Video(s) wird erstellt …';
      delivery.reset(); notify();
      try {
        await yieldToUI(); controller.signal.throwIfAborted();
        const blob = await exportFigure(current.figure, current.records.filter(r => current.selected.has(r.id)), controller.signal);
        if (active !== current) return;
        current.file = new File([blob], packageFilename(current.figure.title), { type: 'application/zip' });
        current.message = 'ZIP bereit. Jetzt speichern oder teilen.';
      } catch (error) {
        if (active !== current) return;
        current.message = error.name === 'AbortError' ? 'ZIP-Erstellung abgebrochen.' : 'ZIP-Erstellung fehlgeschlagen.';
        if (error.name !== 'AbortError') current.error = error.message;
      } finally { if (active === current) { current.controller = null; notify(); } }
    },
    deliver(kind) {
      if (!active?.file || getState().busy) return Promise.resolve(null);
      return delivery.deliver(active.file, kind);
    },
    close() {
      if (delivery.getState().busy) return false;
      generation++; active?.controller?.abort(); active = null; delivery.reset(); notify(); return true;
    }
  };
}
