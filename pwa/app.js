const APP_VERSION = '2026-10-20-info-top-v1';
import { initBackup } from './backup-ui.js';
import { initCloud, openCloud } from './cloud.js';
import { exportFigure, importFigure, packageSize, packageFilename, MAX_PACKAGE_BYTES } from './package.js';
import { checksum } from './package.js';
import { STATUSES, cleanTags, timeLabel, filterFigures, ABLoop } from './logic.js';
import { listFigures, figureVideos, saveFigure, deleteFigure, storageMessage, cleanupInterruptedImports, folderSupported, storageSettings, chooseFolder, connectFolder, reconnectFolder, setStorageFolder, transferFigure } from './storage.js';

const $ = id => document.getElementById(id);
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const button = (text, action, className = '') => { const node = el('button', className, text); node.type = 'button'; node.addEventListener('click', action); return node; };
let figures = [], statusFilter = '', selectedTag = '', editor = null, preview = null, learning = null;
let route = 'home', opening = false, toastTimer, reviewNext = false;
let posterURLs = [], videoURL = null, previewURL = null;
const channel = 'BroadcastChannel' in window ? new BroadcastChannel(`salsa-trainer-library:${new URL('./', import.meta.url).pathname}`) : null;
const loop = new ABLoop();
let playIntent = false, wakeLock = null;
const video = $('learningVideo');

function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500); }
function setError(id, message) { $(id).textContent = message ?? ''; $(id).hidden = !message; }
function pushRoute(view) { route = view; history.pushState({ salsa: true, view }, '', `#${view === 'editor' ? 'figur' : view === 'preview' ? 'vorschau' : 'lernen'}`); }
history.replaceState({ salsa: true, view: 'home' }, '', location.pathname + location.search);

function confirmAction({ title, message = '', ok = 'Bestätigen', cancel = 'Abbrechen' }) {
  if ($('confirmDialog').open) return Promise.resolve(false);
  $('confirmTitle').textContent = title; $('confirmMessage').textContent = message;
  $('confirmOK').textContent = ok; $('confirmCancel').textContent = cancel;
  return new Promise(resolve => {
    const finish = value => { $('confirmDialog').close(); $('confirmOK').onclick = null; $('confirmCancel').onclick = null; $('confirmDialog').oncancel = null; resolve(value); };
    $('confirmOK').onclick = () => finish(true); $('confirmCancel').onclick = () => finish(false);
    $('confirmDialog').oncancel = event => { event.preventDefault(); finish(false); };
    $('confirmDialog').showModal(); $('confirmCancel').focus();
  });
}
function closeMenus() { document.querySelectorAll('.card-menu').forEach(n => n.remove()); document.querySelectorAll('.card-options').forEach(n => n.setAttribute('aria-expanded', 'false')); }
async function refresh() {
  try { figures = await listFigures(); renderOverview(); }
  catch (error) { $('empty').hidden = false; $('empty').replaceChildren(el('h2', '', 'Speicher nicht verfügbar'), el('p', '', storageMessage(error))); }
}
function renderOverview() {
  closeMenus(); posterURLs.forEach(url => URL.revokeObjectURL(url)); posterURLs = [];
  const visible = filterFigures(figures, { query: $('search').value, status: statusFilter, tag: selectedTag, sort: $('sort').value });
  $('figureCount').textContent = `${visible.length} Figuren`;
  $('figureList').replaceChildren(); $('activeTag').replaceChildren();
  if (selectedTag) $('activeTag').append(button(`${selectedTag} ×`, () => { selectedTag = ''; renderOverview(); }));
  $('empty').hidden = visible.length > 0;
  $('empty').replaceChildren(el('span', 'dance-icon', '♪'), el('h2', '', figures.length ? 'Keine Treffer' : 'Deine erste Figur'), el('p', '', figures.length ? 'Ändere deine Suche oder die Filter.' : 'Füge eigene Videos hinzu und übe in deinem Tempo.'));
  for (const figure of visible) {
    const card = el('article', 'figure-card'); card.dataset.figureId = figure.id;
    const main = button('', () => openPlayer(figure), 'card-main'); main.setAttribute('aria-label', `${figure.title} lernen`);
    let thumb;
    if (figure.poster) { const url = URL.createObjectURL(figure.poster); posterURLs.push(url); thumb = el('img', 'card-thumb'); thumb.src = url; thumb.alt = ''; }
    else { thumb = el('span', 'card-thumb thumb-placeholder', '▷'); thumb.setAttribute('aria-hidden', 'true'); }
    const copy = el('span', 'card-copy'); copy.append(el('span', 'card-title', figure.title), el('span', 'card-status', figure.status));
    if (figure.tags.length) copy.append(el('span', 'card-tags', figure.tags.join(' · ')));
    if (figure.storageFolder) copy.append(el('span', 'card-meta', figure.folderAccessRequired ? 'Ordner gespeichert – Zugriff erneut erlauben' : figure.storageProblem ? `Geräteordner: ${figure.storageProblem}` : `Geräteordner · ${figure.folderName || 'SalsaTrainer'}`));
    copy.append(el('span', 'card-meta', `${timeLabel(figure.duration)} · ${figure.videoIds.length} Video${figure.videoIds.length === 1 ? '' : 's'}`)); main.append(thumb, copy);
    const options = button('⋮', event => { event.stopPropagation(); const wasOpen = options.getAttribute('aria-expanded') === 'true'; closeMenus(); if (!wasOpen) showMenu(); }, 'card-options');
    options.setAttribute('aria-label', `Optionen für ${figure.title}`); options.setAttribute('aria-expanded', 'false');
    function showMenu() {
      options.setAttribute('aria-expanded', 'true'); const menu = el('div', 'card-menu');
      menu.append(button('In Cloud veröffentlichen', () => { closeMenus(); openCloud(figure); }), button('Figur teilen', () => { closeMenus(); openShare(figure); }), button('Bearbeiten', () => { closeMenus(); openEditor(figure); }), button('Löschen', async () => {
        closeMenus(); const accepted = await confirmAction({ title: `„${figure.title}“ löschen?`, message: 'Die Figur und alle zugehörigen verwalteten Videos werden gelöscht, auch Dateien im Geräteordner. Deine ursprünglichen Importdateien bleiben erhalten.', ok: 'Löschen' });
        if (accepted) { try { await deleteFigure(figure); changed(); await refresh(); toast('Figur gelöscht.'); } catch (error) { toast(storageMessage(error)); await refresh(); } }
      }, 'danger'));
      if (figure.storageFolder || folderSupported()) menu.append(button(figure.storageFolder ? 'In App-Speicher übertragen' : 'In Geräteordner übertragen', () => { closeMenus(); moveFigure(figure); }));
      card.append(menu);
    }
    main.addEventListener('contextmenu', event => { event.preventDefault(); closeMenus(); showMenu(); });
    card.append(main, options);
    if (figure.folderAccessRequired && folderSupported()) {
      card.classList.add('needs-folder-access');
      const allow = button('Ordnerzugriff erlauben', async () => {
        if (deviceBusy) return;
        deviceBusy = true; allow.disabled = true; allow.textContent = 'Zugriff wird angefragt …';
        try { await reconnectFolder(figure.storageFolder); changed(); await refresh(); toast('Ordnerzugriff erlaubt. Die Figuren sind wieder verfügbar.'); }
        catch (error) { toast(storageMessage(error)); }
        finally { deviceBusy = false; allow.disabled = false; allow.textContent = 'Ordnerzugriff erlauben'; }
      }, 'secondary folder-access-action');
      allow.setAttribute('aria-label', `Ordnerzugriff erlauben für ${figure.title}`); card.append(allow);
    }
    $('figureList').append(card);
  }
}
function renderFilters() {
  $('statusFilters').replaceChildren();
  for (const value of ['', ...STATUSES]) {
    const node = button(value || 'Alle Lernstände', () => { statusFilter = value; renderFilters(); renderOverview(); });
    node.setAttribute('aria-pressed', String(value === statusFilter)); $('statusFilters').append(node);
  }
}
function changed() { channel?.postMessage('changed'); }
channel?.addEventListener('message', () => refresh());
window.addEventListener('focus', () => refresh());
$('search').addEventListener('input', renderOverview); $('sort').addEventListener('change', renderOverview);
document.addEventListener('click', event => { if (!event.target.closest('.card-menu,.card-options')) closeMenus(); });
$('tagsButton').onclick = () => {
  const tags = [...new Set(figures.flatMap(f => f.tags))].sort((a, b) => a.localeCompare(b, 'de'));
  $('tagOptions').replaceChildren(button('Alle Tags', () => { selectedTag = ''; $('tagsDialog').close(); renderOverview(); }));
  tags.forEach(tag => $('tagOptions').append(button(tag, () => { selectedTag = tag; $('tagsDialog').close(); renderOverview(); })));
  if (!tags.length) $('tagOptions').append(el('p', 'muted', 'Tags kannst du beim Bearbeiten einer Figur hinzufügen.'));
  $('tagsDialog').showModal();
};
$('closeTags').onclick = () => $('tagsDialog').close();

function formValue() { return { title: $('figureTitle').value, description: $('figureDescription').value, status: $('figureStatus').value, tags: cleanTags($('figureTags').value) }; }
function draftSignature(drafts) { return JSON.stringify(drafts.map(d => ({ id: d.id, name: d.name, confirmed: d.confirmed }))); }
function isDirty() { return editor && (JSON.stringify(formValue()) !== editor.initialForm || draftSignature(editor.drafts) !== editor.initialDrafts); }
async function openEditor(figure = null, imported = null) {
  if (opening || editor || learning) return; opening = true;
  try {
    const records = figure ? await figureVideos(figure, true) : [];
    editor = { id: figure?.id ?? crypto.randomUUID(), revision: figure?.revision ?? null, storageFolder: figure?.storageFolder, drafts: records.map(r => ({ ...r, existing: !r.missing, confirmed: !r.missing })), busy: false, allowClose: false, replacing: null, reviewAll: false };
    $('figureTitle').value = figure?.title ?? ''; $('figureDescription').value = figure?.description ?? '';
    $('figureStatus').value = figure?.status ?? 'Neu'; $('figureTags').value = figure?.tags.join(', ') ?? '';
    editor.initialForm = JSON.stringify(formValue()); editor.initialDrafts = draftSignature(editor.drafts);
    editor.importFingerprint = figure?.importFingerprint ?? null;
    if (imported) {
      editor.importFingerprint = imported.fingerprint;
      editor.drafts = imported.drafts.map(d => ({ ...d, id: crypto.randomUUID() }));
      $('figureTitle').value = imported.title; $('figureDescription').value = imported.description;
      $('figureTags').value = imported.tags.join(', '); $('figureStatus').value = 'Neu';
    }
    $('editorHeading').textContent = figure ? 'Figur bearbeiten' : 'Figur hinzufügen'; setError('editorError', null);
    renderDrafts(); setBusy(false); $('editor').showModal(); pushRoute('editor'); $('figureTitle').focus();
  } catch (error) { toast(storageMessage(error)); } finally { opening = false; }
}
$('addFigure').onclick = () => openEditor();
function updateSave() { $('saveFigure').disabled = !editor || editor.busy || !$('figureTitle').value.trim() || !editor.drafts.length || editor.drafts.some(d => !d.confirmed); }
function setBusy(value) { editor.busy = value; $('editorFields').disabled = value; $('editorBack').disabled = value; $('saveProgress').hidden = !value; updateSave(); }
$('editorForm').addEventListener('input', updateSave);
function chooseFiles(replacing = null) { if (!editor || editor.busy) return; editor.replacing = replacing; $('videoFiles').multiple = !replacing; $('videoFiles').value = ''; $('videoFiles').click(); }
$('pickVideos').onclick = () => chooseFiles();
$('videoFiles').addEventListener('cancel', () => { if (editor) editor.replacing = null; });
$('videoFiles').addEventListener('change', () => {
  if (!editor) return;
  const files = [...$('videoFiles').files]; const replacing = editor.replacing; editor.replacing = null;
  if (!files.length) return;
  if (files.some(file => !file.size || (!file.type.startsWith('video/') && !/\.(mov|mp4|m4v|webm|ogv)$/i.test(file.name)))) { toast('Bitte eine nicht leere Videodatei wählen.'); return; }
  const drafts = files.map(file => ({ id: crypto.randomUUID(), name: file.name.replace(/\.[^.]+$/, ''), blob: file, confirmed: false, existing: false, duration: 0, poster: null }));
  if (replacing) { openPreview(drafts[0], replacing); }
  else {
    editor.drafts.push(...drafts);
    if (!$('figureTitle').value.trim() && !editor.revision) $('figureTitle').value = drafts[0].name;
    renderDrafts();
  }
});
function renderDrafts() {
  $('draftVideos').replaceChildren(); $('videoCount').textContent = `Videos · ${editor.drafts.length}`;
  editor.drafts.forEach((draft, index) => {
    const card = el('div', 'draft-card'); card.dataset.videoId = draft.id;
    const input = el('input'); input.value = draft.name; input.placeholder = 'Videoname (optional)'; input.maxLength = 160; input.setAttribute('aria-label', `Name von Video ${index + 1}`);
    input.addEventListener('input', () => { draft.name = input.value; });
    const note = el('p', `draft-status${draft.confirmed ? ' confirmed' : ''}`, draft.missing ? 'Datei fehlt oder wurde verändert – bitte ersetzen' : draft.confirmed ? 'Bestätigt' : 'Vorschau erforderlich');
    const actions = el('div', 'draft-actions');
    const previewButton = button('Vorschau', () => { editor.reviewAll = false; openPreview(draft); }); previewButton.disabled = !!draft.missing;
    actions.append(previewButton, button('Ersetzen', () => chooseFiles(draft.id)));
    const up = button('↑', () => { [editor.drafts[index - 1], editor.drafts[index]] = [editor.drafts[index], editor.drafts[index - 1]]; renderDrafts(); }); up.disabled = index === 0; up.setAttribute('aria-label', `Video ${index + 1} nach oben`);
    const down = button('↓', () => { [editor.drafts[index + 1], editor.drafts[index]] = [editor.drafts[index], editor.drafts[index + 1]]; renderDrafts(); }); down.disabled = index === editor.drafts.length - 1; down.setAttribute('aria-label', `Video ${index + 1} nach unten`);
    const remove = button('Entfernen', () => { editor.drafts.splice(index, 1); renderDrafts(); }, 'danger'); remove.disabled = editor.drafts.length <= 1;
    actions.append(up, down, remove); card.append(input, note, actions); $('draftVideos').append(card);
  });
  $('reviewAll').hidden = !editor.drafts.some(d => !d.confirmed && !d.missing); updateSave();
}
$('reviewAll').onclick = () => { editor.reviewAll = true; const draft = editor.drafts.find(d => !d.confirmed && !d.missing); if (draft) openPreview(draft); };
$('editorBack').onclick = () => history.back();
$('editor').addEventListener('cancel', event => { event.preventDefault(); history.back(); });
$('editorForm').addEventListener('submit', async event => {
  event.preventDefault(); if (!editor || editor.busy || $('saveFigure').disabled) return;
  const active = editor; setError('editorError', null); setBusy(true);
  try {
    await saveFigure({ id: active.id, ...formValue(), importFingerprint: active.importFingerprint, storageFolder: active.storageFolder }, active.drafts, active.revision);
    changed(); await refresh();
    if (editor === active) { active.allowClose = true; setBusy(false); history.back(); toast('Figur lokal gespeichert.'); }
  } catch (error) { if (editor === active) { setBusy(false); setError('editorError', storageMessage(error)); } }
});
function cleanupEditor() { $('editor').close(); editor = null; $('videoFiles').value = ''; }

const previewVideo = $('previewVideo');
function openPreview(draft, replacing = null) {
  preview = { draft, replacing, accepted: false, ready: false };
  $('previewTitle').textContent = draft.name || 'Video'; setError('previewError', null); $('acceptVideo').disabled = true;
  previewURL = URL.createObjectURL(draft.blob); previewVideo.src = previewURL; previewVideo.load();
  $('preview').showModal(); pushRoute('preview');
}
previewVideo.addEventListener('loadeddata', () => {
  if (!preview) return;
  if (previewVideo.videoWidth > 0 && Number.isFinite(previewVideo.duration) && previewVideo.duration > 0) { preview.ready = true; $('acceptVideo').disabled = false; }
});
previewVideo.addEventListener('error', () => { if (preview) { preview.ready = false; $('acceptVideo').disabled = true; setError('previewError', 'Dieses Video ist beschädigt oder wird von diesem Browser nicht unterstützt. Versuche ein MP4-Video mit H.264.'); } });
$('previewBack').onclick = () => { if (editor) editor.reviewAll = false; history.back(); };
$('preview').addEventListener('cancel', event => { event.preventDefault(); if (editor) editor.reviewAll = false; history.back(); });
async function capturePoster(source) {
  try {
    const canvas = document.createElement('canvas'); const ratio = Math.min(1, 360 / source.videoWidth); canvas.width = Math.max(1, Math.round(source.videoWidth * ratio)); canvas.height = Math.max(1, Math.round(source.videoHeight * ratio));
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    return await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.72));
  } catch { return null; }
}
$('acceptVideo').onclick = async () => {
  if (!preview?.ready || !editor) return;
  const active = preview; previewVideo.pause(); $('acceptVideo').disabled = true;
  const duration = previewVideo.duration, width = previewVideo.videoWidth, height = previewVideo.videoHeight;
  const poster = await capturePoster(previewVideo);
  if (preview !== active || !editor) return;
  const confirmed = { ...active.draft, confirmed: true, duration, width, height, poster: poster ?? active.draft.poster };
  if (active.replacing) { const index = editor.drafts.findIndex(d => d.id === active.replacing); if (index < 0) return; editor.drafts[index] = confirmed; }
  else { const index = editor.drafts.findIndex(d => d.id === active.draft.id); if (index >= 0) editor.drafts[index] = confirmed; }
  active.accepted = true; reviewNext = editor.reviewAll; renderDrafts(); history.back();
};
function releaseURL(url) { if (url) setTimeout(() => URL.revokeObjectURL(url), 1000); }
function cleanupPreview() { previewVideo.pause(); previewVideo.removeAttribute('src'); previewVideo.load(); releaseURL(previewURL); previewURL = null; $('preview').close(); preview = null; }

window.addEventListener('popstate', async event => {
  const target = event.state?.view ?? 'home';
  if (route === 'preview') {
    const accepted = preview?.accepted; cleanupPreview(); route = target;
    if (!accepted && editor) editor.reviewAll = false;
    if (target === 'editor') {
      if (reviewNext && accepted && editor) { reviewNext = false; const next = editor.drafts.find(d => !d.confirmed && !d.missing); if (next) setTimeout(() => { if (editor && route === 'editor') openPreview(next); }, 0); else editor.reviewAll = false; }
      return;
    }
  }
  if (editor && target !== 'editor') {
    if (editor.busy) { pushRoute('editor'); toast('Bitte warten, bis das Speichern abgeschlossen ist.'); return; }
    if (!editor.allowClose && isDirty()) {
      pushRoute('editor');
      if (await confirmAction({ title: 'Änderungen verwerfen?', message: 'Die Änderungen und noch nicht gespeicherten Videos werden verworfen.', ok: 'Änderungen verwerfen', cancel: 'Weiter bearbeiten' })) { if (editor) { editor.allowClose = true; history.back(); } }
      return;
    }
    cleanupEditor();
  }
  if (learning && target !== 'player') closePlayer();
  route = target === 'home' ? 'home' : 'home';
});
window.addEventListener('beforeunload', event => { if (editor && (editor.busy || isDirty())) { event.preventDefault(); event.returnValue = ''; } });

async function openPlayer(figure) {
  if (opening || editor || learning) return; opening = true;
  try {
    const records = await figureVideos(figure);
    learning = { figure, records, index: 0, crop: false, landscape: false, fullLoop: false, speed: 1 };
    loop.clear(); $('playerTitle').textContent = figure.title; $('playerDescription').textContent = figure.description;
    $('playerVideoChoice').replaceChildren(); records.forEach((record, index) => { const option = el('option', '', record.name || `Video ${index + 1}`); option.value = String(index); $('playerVideoChoice').append(option); });
    $('playerVideoChoice').parentElement.hidden = records.length <= 1; $('speed').value = '1'; $('fitCrop').textContent = 'Fit'; $('fitCrop').setAttribute('aria-pressed', 'false'); $('fullLoop').setAttribute('aria-pressed', 'false'); $('rotatePlayer').setAttribute('aria-pressed', 'false');
    $('videoStage').classList.remove('crop'); $('playerScreen').classList.remove('is-landscape'); $('playerScreen').hidden = false; $('overview').hidden = true; $('overview').inert = true; document.body.classList.add('playing-screen');
    pushRoute('player'); loadPlayerVideo(0, false); $('playerBack').focus();
  } catch (error) { toast(storageMessage(error)); } finally { opening = false; }
}
function loadPlayerVideo(index, autoplay) {
  if (!learning?.records[index]) return;
  playIntent = autoplay; video.pause(); releaseWakeLock();
  if (videoURL) { video.removeAttribute('src'); video.load(); releaseURL(videoURL); }
  learning.index = index; $('playerVideoChoice').value = String(index); loop.clear(); updateLoop(); setError('playerError', null); $('videoLoading').hidden = false;
  $('seek').value = '0'; $('position').textContent = '0:00'; $('duration').textContent = timeLabel(learning.records[index].duration);
  videoURL = URL.createObjectURL(learning.records[index].blob); video.src = videoURL; video.playbackRate = learning.speed; video.load();
  $('playPause').textContent = '▶'; $('playPause').setAttribute('aria-label', 'Abspielen');
}
video.addEventListener('loadedmetadata', () => { if (!learning) return; if (!Number.isFinite(video.duration) || video.duration <= 0) { setError('playerError', 'Das Video konnte nicht geladen werden.'); return; } $('seek').max = String(video.duration); $('duration').textContent = timeLabel(video.duration); video.playbackRate = learning.speed; });
video.addEventListener('loadeddata', () => { $('videoLoading').hidden = true; if (learning && playIntent && !document.hidden) play(); });
video.addEventListener('error', () => { if (learning) { playIntent = false; $('videoLoading').hidden = true; setError('playerError', 'Dieses Video wird vom Browser nicht unterstützt oder ist nicht mehr lesbar. Bitte die Figur bearbeiten und das Video ersetzen.'); } });
async function play() {
  if (!learning) return; playIntent = true;
  if (video.readyState < 2) return;
  if (video.ended || video.currentTime >= video.duration) video.currentTime = loop.b !== null ? loop.a : 0;
  try { video.playbackRate = learning.speed; await video.play(); }
  catch { playIntent = false; toast('Bitte auf Abspielen tippen, um die Wiedergabe zu starten.'); }
}
function pause() { playIntent = false; video.pause(); releaseWakeLock(); }
async function requestWakeLock() {
  if (!navigator.wakeLock || document.hidden || video.paused) return;
  try { const lock = await navigator.wakeLock.request('screen'); if (video.paused || document.hidden || !learning) await lock.release(); else wakeLock = lock; } catch { /* Optional browser capability. */ }
}
function releaseWakeLock() { wakeLock?.release().catch(() => {}); wakeLock = null; }
video.addEventListener('play', () => { $('playPause').textContent = '❚❚'; $('playPause').setAttribute('aria-label', 'Pause'); requestWakeLock(); });
video.addEventListener('pause', () => { $('playPause').textContent = '▶'; $('playPause').setAttribute('aria-label', 'Abspielen'); releaseWakeLock(); });
function tick() {
  if (!learning) return;
  const position = video.currentTime;
  $('seek').value = String(Number.isFinite(position) ? position : 0); $('position').textContent = timeLabel(position);
  $('markB').disabled = loop.a === null || position <= loop.a + 0.1;
  if (!video.paused && !video.seeking) { const target = loop.target(position); if (target !== null) video.currentTime = target; }
}
video.addEventListener('timeupdate', tick);
setInterval(() => { if (learning && !video.paused && !document.hidden) tick(); }, 30);
video.addEventListener('ended', () => {
  if (!learning) return; const target = loop.target(video.duration, true);
  if (target !== null || learning.fullLoop) { video.currentTime = target ?? 0; play(); }
  else { playIntent = false; releaseWakeLock(); }
});
$('playPause').onclick = () => { if (video.paused) play(); else pause(); };
$('rewind').onclick = () => { if (learning) { video.currentTime = Math.max(0, video.currentTime - 5); tick(); } };
$('seek').addEventListener('input', () => { if (learning && Number.isFinite(video.duration)) { video.currentTime = Math.max(0, Math.min(video.duration, Number($('seek').value))); $('position').textContent = timeLabel(video.currentTime); } });
$('speed').onchange = () => { if (learning) { learning.speed = Number($('speed').value); video.playbackRate = learning.speed; } };
$('fitCrop').onclick = () => { if (learning) { learning.crop = !learning.crop; $('videoStage').classList.toggle('crop', learning.crop); $('fitCrop').textContent = learning.crop ? 'Crop' : 'Fit'; $('fitCrop').setAttribute('aria-pressed', String(learning.crop)); } };
$('rotatePlayer').onclick = () => { if (learning) { learning.landscape = !learning.landscape; $('playerScreen').classList.toggle('is-landscape', learning.landscape); $('rotatePlayer').setAttribute('aria-pressed', String(learning.landscape)); } };
$('fullLoop').onclick = () => { if (learning) { learning.fullLoop = !learning.fullLoop; if (learning.fullLoop) loop.clear(); updateLoop(); } };
$('markA').onclick = () => { if (learning) { learning.fullLoop = false; loop.setA(video.currentTime); updateLoop(); } };
$('markB').onclick = () => { if (learning) { learning.fullLoop = false; loop.setB(video.currentTime); updateLoop(); } };
$('clearAB').onclick = () => { loop.clear(); updateLoop(); };
function updateLoop() { $('fullLoop').setAttribute('aria-pressed', String(!!learning?.fullLoop)); $('abStatus').textContent = loop.a === null ? '' : `A ${timeLabel(loop.a)} · B ${loop.b === null ? '–' : timeLabel(loop.b)}`; $('clearAB').disabled = loop.a === null; $('markB').disabled = loop.a === null || video.currentTime <= loop.a + 0.1; }
$('playerVideoChoice').onchange = () => { if (learning) loadPlayerVideo(Number($('playerVideoChoice').value), !video.paused); };
$('fullscreen').onclick = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else if ($('playerScreen').requestFullscreen) await $('playerScreen').requestFullscreen(); else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen(); else toast('Diese Ansicht nutzt bereits die verfügbare Displayfläche.'); } catch { toast('Vollbild wird von diesem Browser nicht freigegeben.'); } };
$('playerBack').onclick = () => history.back();
function closePlayer() {
  pause(); video.removeAttribute('src'); video.load(); releaseURL(videoURL); videoURL = null; learning = null; loop.clear();
  $('playerScreen').hidden = true; $('overview').hidden = false; $('overview').inert = false; document.body.classList.remove('playing-screen');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); if (video.webkitDisplayingFullscreen) video.webkitExitFullscreen();
}
document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); previewVideo.pause(); } else refresh(); });
window.addEventListener('pagehide', () => { pause(); previewVideo.pause(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && learning && !document.fullscreenElement) { event.preventDefault(); history.back(); } });


let deviceBusy = false;
async function deviceWork(work) {
  if (deviceBusy) return; deviceBusy = true; $('closeInfo').disabled = true;
  $('deviceStorageStatus').textContent = 'Bitte warten …';
  $('deviceStorageControls').inert = true;
  try { await work(); changed(); await refresh(); await renderDeviceStorage(); $('deviceStorageStatus').textContent = 'Gespeichert.'; }
  catch (e) { $('deviceStorageStatus').textContent = storageMessage(e); }
  finally { deviceBusy = false; $('closeInfo').disabled = false; $('deviceStorageControls').inert = false; }
}
async function renderDeviceStorage() {
  const settings = await storageSettings(), controls = $('deviceStorageControls'); controls.replaceChildren();
  const selected = settings.folders.find(f => f.id === settings.activeFolder);
  $('deviceStorageActive').textContent = `Neue Figuren: ${selected ? 'Geräteordner „' + selected.name + '“' : 'App-Speicher'}. Vorhandene Figuren bleiben an ihrem bisherigen Speicherort.`;
  controls.append(button('App-Speicher verwenden', () => deviceWork(() => setStorageFolder(null)), 'secondary'));
  if (settings.supported) {
    controls.append(button('Geräteordner auswählen', async () => {
      // Open the OS picker directly in the click handler, before any other async work.
      let candidate; try { candidate = await chooseFolder(); } catch (e) { if (e.name !== 'AbortError') $('deviceStorageStatus').textContent = storageMessage(e); return; }
      const count = candidate.library.figures.length;
      if (!await confirmAction({ title: count ? 'Bibliotheksordner öffnen?' : 'Geräteordner verwenden?', message: `„${candidate.name}“ enthält ${count} Figuren. Videos, Angaben und Lernstände werden eingelesen. Neue Figuren werden hier gespeichert. Vorhandene App-Figuren werden nicht verschoben.`, ok: count ? 'Bibliothek öffnen' : 'Ordner verwenden' })) return;
      await deviceWork(() => connectFolder(candidate));
    }, 'secondary'));
  } else controls.append(el('p', 'muted', 'Geräteordner werden in diesem Browser nicht unterstützt. Verwende aktuelles Chrome auf Android oder Desktop. Auf iPhone/Safari bleibt der App-Speicher mit ZIP-Sicherung verfügbar.'));
  for (const folder of settings.folders) {
    const row = el('div', 'cloud-card'); row.append(el('strong', '', `${folder.name} · ${folder.library.figures.length} Figuren${folder.id === settings.activeFolder ? ' · aktiv' : ''}`));
    if (settings.supported) row.append(button('Ordnerzugriff erlauben', () => deviceWork(() => reconnectFolder(folder.id)), 'secondary'), button('Für neue Figuren verwenden', () => deviceWork(async () => { await reconnectFolder(folder.id); await setStorageFolder(folder.id); }), 'secondary'));
    if (folder.library.garbage.length) row.append(el('p', 'error', 'Dateibereinigung ausstehend. Bitte Ordner erneut verbinden.'));
    controls.append(row);
  }
}
async function moveFigure(figure) {
  if (opening || editor || learning) return; opening = true;
  try {
    const settings = await storageSettings();
    let target = null;
    if (!figure.storageFolder) {
      if (!folderSupported()) throw new Error('Geräteordner werden hier nicht unterstützt. Bitte aktuelles Chrome auf Android oder Desktop verwenden.');
      target = settings.activeFolder ?? settings.folders[0]?.id;
      if (!target) { await storageInfo(); showInfoDialog(); toast('Bitte zuerst unter Speicherort einen Geräteordner auswählen.'); return; }
    }
    const destination = target ? settings.folders.find(f => f.id === target)?.name : 'App-Speicher';
    if (!await confirmAction({ title: 'Figur übertragen?', message: `„${figure.title}“ nach „${destination}“ kopieren und prüfen? Die bisherige Kopie bleibt zunächst erhalten.`, ok: 'Kopieren und prüfen' })) return;
    toast('Figur wird kopiert und geprüft …');
    await transferFigure(figure, target);
    await refresh(); changed();
    if (await confirmAction({ title: 'Kopie erfolgreich geprüft', message: 'Die neue Kopie ist gespeichert. Sollen die bisherigen verwalteten Videos und Angaben dieser Figur am alten Speicherort jetzt entfernt werden? Ursprüngliche Importdateien bleiben erhalten.', ok: 'Bisherige Kopie entfernen', cancel: 'Beide behalten' })) await deleteFigure(figure);
    changed(); await refresh(); toast('Übertragung abgeschlossen.');
  } catch (e) { toast(storageMessage(e)); await refresh(); }
  finally { opening = false; }
}

let offlineReady = false;
async function storageInfo() {
  try {
    const estimate = await navigator.storage?.estimate?.(); const persistent = await navigator.storage?.persisted?.();
    $('storageDetails').textContent = `${estimate ? `Ungefähr ${Math.round((estimate.usage ?? 0) / 1048576)} MB lokal belegt. ` : ''}${persistent ? 'Der Browser hat dauerhaften Speicher gewährt.' : 'Dauerhafter Speicher ist bisher nicht bestätigt.'}`;
  } catch { $('storageDetails').textContent = 'Der Browser kann keine Speicherinformationen anzeigen.'; }
  try { await renderDeviceStorage(); } catch (e) { $('deviceStorageStatus').textContent = storageMessage(e); }
  $('offlineDetails').textContent = offlineReady ? 'Die App ist für Offline-Aufrufe bereit. Gespeicherte Videos funktionieren ohne Netz.' : 'Bitte die App einmal online laden und warten, bis „Offline bereit“ angezeigt wird.';
}
function showInfoDialog() {
  const dialog = $('infoDialog');
  dialog.showModal();
  $('infoTitle').focus({ preventScroll: true });
  dialog.scrollTop = 0;
}
$('infoButton').onclick = () => { storageInfo(); showInfoDialog(); };
$('closeInfo').onclick = () => $('infoDialog').close();
$('infoDialog').addEventListener('cancel', event => { if (deviceBusy) event.preventDefault(); });
$('persistStorage').onclick = async () => {
  try { const granted = await navigator.storage?.persist?.(); $('persistenceResult').textContent = granted ? 'Dauerhafter Speicher wurde gewährt.' : 'Der Browser hat die Anfrage nicht bestätigt. Die App bleibt nutzbar. Auf dem Home-Bildschirm installierte Apps werden bevorzugt berücksichtigt.'; await storageInfo(); }
  catch { $('persistenceResult').textContent = 'Dieser Browser unterstützt die Speicheranfrage nicht.'; }
};
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(registration => {
    const update = () => { if (navigator.onLine) registration.update().catch(() => {}); };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
    window.addEventListener('online', update);
    return navigator.serviceWorker.ready;
  }).then(() => {
    offlineReady = true; $('offlineStatus').textContent = 'Offline bereit · lokal gespeichert';
  }).catch(() => { $('offlineStatus').textContent = 'Offline-Vorbereitung fehlgeschlagen · bitte online neu laden'; });
}
window.addEventListener('offline', () => toast('Du bist offline. Deine gespeicherten Videos bleiben verfügbar.'));
renderFilters();

// Keep the fixed save footer above the iOS software keyboard where Visual Viewport is available.
function updateViewport() { document.documentElement.style.setProperty('--app-height', `${window.visualViewport?.height ?? innerHeight}px`); }
window.visualViewport?.addEventListener('resize', updateViewport); updateViewport();

// Export preparation is separate from the Share click, preserving user activation.
let sharing = null, packageImport = null;
async function openShare(figure) {
  if (opening || editor || learning || sharing || packageImport) return;
  opening = true;
  try {
    const records = await figureVideos(figure);
    sharing = { figure, records, selected: new Set(records.map(r => r.id)), file: null, controller: null, url: null };
    $('shareTitle').textContent = `„${figure.title}“ teilen`;
    $('shareVideos').replaceChildren(); setError('shareError', null);
    records.forEach((record, index) => {
      const label = el('label', 'share-choice'), input = el('input'); input.type = 'checkbox'; input.checked = true;
      input.onchange = () => {
        if (!sharing) return;
        if (input.checked) sharing.selected.add(record.id); else sharing.selected.delete(record.id);
        clearShareFile(); updateShare();
      };
      label.append(input, el('span', '', `${record.name || `Video ${index + 1}`} · ${(record.blob.size / 1048576).toFixed(1)} MB`));
      $('shareVideos').append(label);
    });
    updateShare(); $('shareDialog').showModal();
  } catch (error) { toast(storageMessage(error)); } finally { opening = false; }
}
function clearShareFile() {
  if (!sharing) return;
  releaseURL(sharing.url); sharing.url = null; sharing.file = null;
  $('sendPackage').hidden = true; $('downloadPackage').hidden = true;
}
function updateShare() {
  if (!sharing) return;
  const records = sharing.records.filter(r => sharing.selected.has(r.id));
  const size = packageSize(sharing.figure, records);
  $('shareSize').textContent = `${records.length} Videos · ca. ${(size / 1048576).toFixed(1)} MB / 250 MB`;
  $('preparePackage').disabled = !!sharing.controller || !records.length || records.length > 100 || size > MAX_PACKAGE_BYTES;
  $('shareVideos').disabled = !!sharing.controller;
  $('shareProgress').hidden = !sharing.controller;
  $('preparePackage').hidden = !!sharing.file;
  if (!sharing.file) { $('sendPackage').hidden = true; $('downloadPackage').hidden = true; }
}
function closeShare() {
  sharing?.controller?.abort(); clearShareFile(); sharing = null; $('shareDialog').close();
}
$('closeShare').onclick = closeShare;
$('shareDialog').addEventListener('cancel', event => { event.preventDefault(); closeShare(); });
$('preparePackage').onclick = async () => {
  const active = sharing; if (!active || active.controller) return;
  active.controller = new AbortController(); setError('shareError', null); updateShare();
  try {
    const blob = await exportFigure(active.figure, active.records.filter(r => active.selected.has(r.id)), active.controller.signal);
    if (sharing !== active) return;
    active.file = new File([blob], packageFilename(active.figure.title), { type: 'application/zip' });
    active.url = URL.createObjectURL(active.file);
    $('downloadPackage').href = active.url; $('downloadPackage').download = active.file.name;
    $('downloadPackage').hidden = false;
    $('sendPackage').hidden = !(navigator.share && navigator.canShare?.({ files: [active.file] }));
  } catch (error) { if (sharing === active && error.name !== 'AbortError') setError('shareError', storageMessage(error)); }
  finally { if (sharing === active) { active.controller = null; updateShare(); } }
};
$('sendPackage').onclick = async () => {
  if (!sharing?.file) return;
  try { await navigator.share({ files: [sharing.file] }); }
  catch (error) { if (error.name !== 'AbortError') setError('shareError', 'Direktes Teilen ist nicht möglich. Bitte ZIP speichern und in WhatsApp als Dokument anhängen.'); }
};
$('importFigure').onclick = () => {
  if (editor || opening || packageImport) { toast('Bitte zuerst den aktuellen Vorgang beenden.'); return; }
  $('packageFile').value = ''; $('importChoiceDialog').showModal();
};
$('closeImportChoice').onclick = () => $('importChoiceDialog').close();
$('cancelImport').onclick = () => { packageImport?.abort(); packageImport = null; $('importProgressDialog').close(); };
$('importProgressDialog').addEventListener('cancel', event => { event.preventDefault(); $('cancelImport').click(); });
$('packageFile').onchange = async () => {
  const file = $('packageFile').files[0]; if (!file || editor || opening || packageImport) return;
  const controller = new AbortController(); packageImport = controller; $('importChoiceDialog').close(); $('importProgressDialog').showModal();
  try {
    const imported = await importFigure(file, controller.signal);
    if (packageImport !== controller) return;
    $('importProgressDialog').close();
    const current = await listFigures();
    if (current.some(f => f.importFingerprint === imported.fingerprint)) {
      const accepted = await confirmAction({ title: 'Figur bereits importiert', message: 'Dieses Paket wurde bereits importiert. Trotzdem eine weitere eigene Kopie anlegen?', ok: 'Weitere Kopie anlegen' });
      if (!accepted || packageImport !== controller) return;
    }
    if (packageImport !== controller) return;
    await openEditor(null, imported);
  } catch (error) {
    if (packageImport === controller && error.name !== 'AbortError') {
      $('importProgressDialog').close();
      await confirmAction({ title: 'Import nicht möglich', message: storageMessage(error), ok: 'Verstanden', cancel: 'Schließen' });
    }
  } finally {
    if (packageImport === controller) { packageImport = null; $('importProgressDialog').close(); $('packageFile').value = ''; }
  }
};

initBackup({ confirm: confirmAction, changed, refresh });

// Register interaction handlers before storage recovery, which may wait for another tab.
$('appVersion').textContent = `Version ${APP_VERSION}`;
document.documentElement.dataset.appVersion = APP_VERSION;
if ('serviceWorker' in navigator) {
  let controlled = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (controlled) $('updateNotice').hidden = false;
    controlled = true;
  });
}
$('applyUpdate').onclick = () => {
  if (editor || preview || learning || sharing || packageImport || $('importChoiceDialog').open) {
    toast('Bitte zuerst den aktuellen Vorgang beenden und zur Übersicht zurückkehren.'); return;
  }
  location.reload();
};
initCloud({ confirm: confirmAction, imported: async imported => {
  const current = await listFigures();
  if (current.some(f => f.importFingerprint === imported.fingerprint) && !await confirmAction({ title: 'Cloud-Version bereits übernommen', message: 'Trotzdem eine weitere lokale Kopie erstellen?', ok: 'Weitere Kopie erstellen' })) return;
  await openEditor(null, imported);
} });
try { await cleanupInterruptedImports(); } catch { /* Refresh reports unavailable storage. */ }
await refresh();
