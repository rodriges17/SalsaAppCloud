// Start the OS/browser save action in the original click, before any await.
// A browser download has no completion callback; never report it as saved.
export function saveFile(file, { container = document.body, progress = () => {} } = {}) {
  if (window.stepFileDelivery?.save) return window.stepFileDelivery.save(file, progress);
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
