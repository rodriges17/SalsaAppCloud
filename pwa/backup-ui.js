import * as storage from './storage.js';
import { createBackupWorkflow } from './backup-workflow.js';
const scope = new URL('./', import.meta.url).pathname, LAST = `salsa-last-backup:${scope}:v1`;
const n = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
const size = bytes => `${(bytes / 1048576).toFixed(1)} MiB`;
const date = value => new Date(value).toLocaleString('de');
let dialog, body, status, cancel, close, workflow, hooks, urls = [], rendered = -1, restoreDetails;
const action = (label, work) => { const b = n('button', label, 'secondary'); b.type = 'button'; b.onclick = () => Promise.resolve().then(work).catch(error => { status.textContent = error.message; }); return b; };
function release() { urls.forEach(url => URL.revokeObjectURL(url)); urls = []; }
function lastCreated() {
  try { const data = JSON.parse(localStorage.getItem(LAST)); return data?.createdAt ? `Zuletzt erstellt am ${date(data.createdAt)} · ${data.parts} Teil(e). Das bestätigt die Erstellung, nicht das Speichern der Downloads.` : 'Noch kein vollständiges Backup erstellt.'; }
  catch { return 'Noch kein vollständiges Backup erstellt.'; }
}
function updateLast() { document.getElementById('backupLastCreated').textContent = lastCreated(); }
function progressText(p) {
  if (p.phase === 'commit') return 'Wiederherstellung abschließen …';
  if (p.phase === 'scan') return `Lokalen Bestand prüfen: ${p.done} / ${p.total} Figuren …`;
  if (p.phase === 'compare') return `Vorhandene Figuren vergleichen: ${p.done} / ${p.total} …`;
  return p.total ? `${p.phase === 'verify' ? 'Sicherung prüfen' : 'Sicherung erstellen'}: ${size(p.done)} / ${size(p.total)} …` : 'Videos kopieren und prüfen …';
}
function createIntro() {
  return n('p', 'Sichert alle lokalen Figuren aus App-Speicher und verbundenen Geräteordnern, einschließlich Videos, Angaben und Lernständen. Cloud-Inhalte werden nur gesichert, wenn sie lokal übernommen wurden. Anmeldedaten und Ordnerberechtigungen sind nicht enthalten.');
}
function renderDownloads(data) {
  release();
  body.append(n('p', `${data.figures} Figuren wurden vollständig in ${data.parts.length} Teil(e) verpackt. Lade jeden Teil herunter und bewahre die Dateien gemeinsam auf.`));
  data.parts.forEach((part, i) => {
    const url = URL.createObjectURL(part.blob); urls.push(url);
    const box = n('section', undefined, 'cloud-card'), label = n('p', 'Noch nicht zum Download angefordert.');
    const download = n('a', `Teil ${i + 1} von ${data.parts.length} herunterladen`, 'secondary backup-download');
    download.href = url; download.download = part.name;
    download.onclick = () => { label.textContent = 'Download angefordert. Bitte im Browser prüfen, ob die Datei gespeichert wurde.'; };
    box.append(n('p', part.name), n('p', size(part.blob.size)), download, label); body.append(box);
  });
  try { localStorage.setItem(LAST, JSON.stringify({ createdAt: data.createdAt, parts: data.parts.length })); } catch { /* Download remains usable without bookkeeping. */ }
  updateLast();
}
function ensureRestoreInput() {
  if (restoreDetails?.isConnected) return;
  body.replaceChildren(n('p', 'Wähle alle zusammengehörigen .salsabackup-Dateien aus. Die App prüft zunächst alle Teile. Bestehende Figuren bleiben bis zur bestätigten Übernahme unverändert. Für Figur-ZIP-Dateien verwende „Figur importieren“.'));
  const label = n('label', 'Alle Sicherungsteile auswählen'), input = n('input');
  input.type = 'file'; input.multiple = true; input.accept = '.salsabackup,application/octet-stream';
  input.onchange = () => workflow.readFiles([...input.files]);
  label.append(input); restoreDetails = n('div'); body.append(label, restoreDetails);
}
function renderRestore(data) {
  ensureRestoreInput(); restoreDetails.replaceChildren();
  if (!data) return;
  restoreDetails.append(n('p', `Sicherung vom ${date(data.createdAt)}: ${data.figures} Figuren · ${data.videos} Videos · ${size(data.bytes)} · alle ${data.parts} Teile geprüft.`));
  const wrap = n('label', 'Ziel für die Wiederherstellung'), target = n('select'); target.setAttribute('aria-label', 'Ziel für die Wiederherstellung'); target.append(new Option('App-Speicher', ''));
  if (data.supported) data.folders.forEach(f => target.append(new Option(`Geräteordner: ${f.name}`, f.id)));
  target.value = data.target ?? ''; target.onchange = () => workflow.setTarget(target.value || null); wrap.append(target); restoreDetails.append(wrap);
  restoreDetails.append(n('p', 'Konflikte werden mit Figuren am ausgewählten Zielspeicher verglichen. Figuren an anderen Speicherorten bleiben erhalten.'));
  if (!data.supported) restoreDetails.append(n('p', 'Dieser Browser unterstützt keine Geräteordner. Die Wiederherstellung verwendet den App-Speicher.'));
  else if (!data.folders.length) restoreDetails.append(n('p', 'Für einen Geräteordner richte zuerst unter Speicherort einen Ordner ein. Du kannst dieses Fenster schließen und danach die Sicherung erneut auswählen.'));
  restoreDetails.append(action('Wiederherstellung prüfen', () => workflow.checkRestore()));
  if (!data.rows) return;
  const counts = { new: 0, identical: 0, conflict: 0 }, conflicts = n('div');
  data.rows.forEach((row, index) => {
    counts[row.kind]++;
    const box = n('section', undefined, 'cloud-card'), select = n('select');
    box.append(n('h3', row.title), n('p', `Lernstand: ${row.status} · ${row.videos} Video(s)`)); select.setAttribute('aria-label', `Wiederherstellung für ${row.title}`);
    if (row.kind === 'new') select.append(new Option('Als neue Figur wiederherstellen', 'add'), new Option('Überspringen', 'keep'));
    else {
      select.append(new Option(row.kind === 'identical' ? 'Identische Figur überspringen' : 'Vorhandene behalten', 'keep'), new Option('Zusätzliche Kopie wiederherstellen', 'copy'));
      row.candidates.forEach(f => select.append(new Option(`Ersetzen: ${f.title} · ${f.status}`, `replace:${f.id}`)));
    }
    select.value = row.choice; select.onchange = () => workflow.setChoice(index, select.value); box.append(select); conflicts.append(box);
  });
  conflicts.prepend(n('p', `${counts.new} neue Figuren · ${counts.identical} identische Figuren · ${counts.conflict} Konflikte. Standard bei vorhandenen Figuren: behalten.`));
  conflicts.append(action('Auswahl wiederherstellen', () => workflow.restore(hooks.confirm))); restoreDetails.append(conflicts);
}
function render(state) {
  if (state.revision !== rendered) {
    rendered = state.revision;
    if (state.view.startsWith('restore-')) renderRestore(state.data);
    else {
      body.replaceChildren(); restoreDetails = undefined;
      if (state.view === 'create-start') {
        const retry = action('Bestand erneut prüfen', () => workflow.startCreate()); retry.dataset.retry = 'true'; body.append(createIntro(), retry);
      } else if (state.view === 'access') {
        body.append(n('p', 'Für ein vollständiges Backup benötigt die App Zugriff auf alle Geräteordner mit gespeicherten Figuren. Die Ordnerauswahl ist gespeichert. Bitte erlaube den Zugriff; anschließend geht es automatisch weiter.'));
        state.data.folders.forEach(folder => {
          const box = n('section', undefined, 'cloud-card'); box.append(n('h3', folder.name), n('p', `${folder.figureCount} Figur(en) im Geräteordner`), action('Ordnerzugriff erlauben', () => workflow.grantAccess(folder.id))); body.append(box);
        });
      } else if (state.view === 'create-ready') {
        const data = state.data;
        body.append(createIntro(), n('p', `${data.figures} Figuren · ${data.videos} Videos · ${size(data.bytes)} Videodaten · ${data.parts} Sicherungsteil(e), jeweils höchstens 250 MiB.`), n('p', 'Die Sicherung ist nicht verschlüsselt. Bewahre alle Teile gemeinsam auf. Für eine vollständige Wiederherstellung werden alle Teile benötigt.'), action('Backup jetzt erstellen', () => workflow.create()));
      } else if (state.view === 'created') renderDownloads(state.data);
      else if (state.view === 'restored') body.append(n('p', `${state.data.count} Figuren erfolgreich wiederhergestellt. Lernstände und Erstellungsdaten wurden übernommen.`));
    }
  }
  body.inert = state.busy; cancel.hidden = !state.busy; cancel.disabled = !state.canCancel; close.disabled = state.busy;
  const retry = body.querySelector('[data-retry]'); if (retry) retry.hidden = state.busy;
  status.textContent = state.progress ? progressText(state.progress) : state.message;
}
function show(title, start) {
  if (workflow.getState().busy) return;
  release(); document.getElementById('backupTitle').textContent = title;
  if (!dialog.open) dialog.showModal();
  start();
}
export function initBackup(callbacks) {
  hooks = callbacks; dialog = document.getElementById('backupDialog'); body = document.getElementById('backupBody'); status = document.getElementById('backupStatus'); cancel = document.getElementById('backupCancel'); close = document.getElementById('backupClose');
  workflow = createBackupWorkflow(storage, { onChange: render, onStorageChange: async () => { hooks.changed(); await hooks.refresh(); } });
  cancel.onclick = () => workflow.cancel();
  close.onclick = () => {
    if (!workflow.close()) return;
    dialog.close(); const old = urls; urls = []; setTimeout(() => old.forEach(url => URL.revokeObjectURL(url)), 30000);
  };
  dialog.addEventListener('cancel', event => { event.preventDefault(); if (!workflow.getState().busy) close.onclick(); });
  document.getElementById('createBackup').onclick = () => show('Vollständiges Backup erstellen', () => workflow.startCreate());
  document.getElementById('restoreBackup').onclick = () => show('Vollständiges Backup wiederherstellen', () => workflow.startRestore());
  document.getElementById('infoButton').addEventListener('click', updateLast);
  window.addEventListener('beforeunload', event => { if (workflow.getState().busy) { event.preventDefault(); event.returnValue = ''; } }); updateLast();
}
