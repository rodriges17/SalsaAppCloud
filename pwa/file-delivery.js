// Start the OS/browser save action in the original click, before any await.
// A browser download has no completion callback; never report it as saved.
export function saveFile(file, { container = document.body, progress = () => {}, signal } = {}) {
  signal?.throwIfAborted();
  if (window.stepFileDelivery?.save) return window.stepFileDelivery.save(file, progress, signal);
  if (typeof window.showSaveFilePicker === 'function') {
    const picker = window.showSaveFilePicker({ suggestedName: file.name });
    return (async () => {
      const handle = await picker;
      progress('Datei wird gespeichert …');
      const writer = await handle.createWritable();
      try { await writer.write(file); await writer.close(); }
      catch (error) { try { await writer.abort(); } catch {} throw error; }
      return 'saved';
    })();
  }
  const url = URL.createObjectURL(file), link = document.createElement('a');
  link.href = url; link.download = file.name; link.className = 'sr-only';
  // Keep the link inside the active modal: the rest of the document is inert.
  container.append(link);
  try { link.click(); }
  catch (error) { link.remove(); URL.revokeObjectURL(url); throw error; }
  // The browser can consume the Blob after the dialog has been closed.
  setTimeout(() => { link.remove(); URL.revokeObjectURL(url); }, 60000);
  return Promise.resolve('download');
}
export const saveResult = result => result === 'saved'
  ? 'Datei gespeichert.'
  : result === 'native'
    ? 'Export bereit. Bitte im Android-Dialog „Auf Gerät speichern“ wählen.'
    : 'Download angefordert. Bitte die Downloads im Browser prüfen.';

export function canShareFile(file) {
  try { return !!(navigator.share && navigator.canShare?.({ files: [file] })); } catch { return false; }
}
export function shareFile(file, options) {
  if (window.stepFileDelivery?.save) return window.stepFileDelivery.save(file, options?.progress, options?.signal);
  return navigator.share({ files: [file] }).then(() => 'shared');
}

// Own one hand-off, including retry feedback. Adapters must start synchronously:
// inserting a Promise dispatcher here loses the original click's activation.
export function createFileDelivery({ adapter = { save: saveFile, share: shareFile, canShare: canShareFile },
  container, label = 'Datei', onChange = () => {}, minimumBusyMs = 350 } = {}) {
  let operation = 0;
  let state = { busy: false, message: '', error: '', result: null };
  const emit = patch => { state = { ...state, ...patch }; onChange({ ...state }); };
  return {
    getState: () => ({ ...state }),
    canShare: file => adapter.canShare(file),
    reset() { if (state.busy) return false; emit({ message: '', error: '', result: null }); return true; },
    deliver(file, kind = 'save') {
      if (state.busy) return Promise.resolve(null);
      const started = Date.now(), ticket = ++operation;
      let acceptingProgress = true;
      emit({ busy: true, error: '', result: null, message: `${label} wird zum ${kind === 'save' ? 'Speichern' : 'Teilen'} übergeben …` });
      let work;
      try { work = adapter[kind](file, { container, progress: message => { if (acceptingProgress && ticket === operation) emit({ message }); } }); }
      catch (error) { work = Promise.reject(error); }
      return Promise.resolve(work).then(result => {
        acceptingProgress = false;
        emit({ result, message: result === 'shared' ? 'Datei an die gewählte App übergeben.' : saveResult(result) });
        return result;
      }, error => {
        acceptingProgress = false;
        const cancelled = error.name === 'AbortError';
        emit({ result: cancelled ? 'cancelled' : 'failed',
          message: cancelled ? `Vorgang abgebrochen. Die ${label} bleibt zum erneuten Speichern oder Teilen bereit.` : `Die ${label} konnte nicht übergeben werden.`,
          error: cancelled ? '' : kind === 'save'
            ? 'Speichern fehlgeschlagen. Bitte erneut versuchen oder die Datei teilen und eine Dateien-App wählen. ' + (error.message ?? '')
            : 'Direktes Teilen ist nicht möglich. Bitte die Datei speichern und als Dokument anhängen.' });
        return cancelled ? 'cancelled' : 'failed';
      }).finally(async () => {
        await new Promise(resolve => setTimeout(resolve, Math.max(0, minimumBusyMs - (Date.now() - started))));
        emit({ busy: false });
      });
    }
  };
}
