import { cloudLocalIndex } from './cloud-local.js';
import { provenanceIcon, provenanceLabel } from './cloud-provenance.js';
const APP_VERSION = '2026-10-27-content-sync-v1';
import { initBackup } from './backup-ui.js';
import { createFileDelivery } from './file-delivery.js';
import { createFigureZipWorkflow } from './figure-zip.js';
import { signedIn } from './cloud-api.js';
import { initCloud, openCloud } from './cloud.js';
import { importFigure } from './package.js';
import { checksum } from './package.js';
import { STATUSES, cleanTags, timeLabel, filterFigures, ABLoop } from './logic.js';
import { listFigures, figureVideos, figureMedia, saveFigure, deleteFigure, storageMessage, cleanupInterruptedImports, folderSupported, storageSettings, chooseFolder, connectFolder, allowFolderAccess, setStorageFolder, transferFigure } from './storage.js';

const $ = id => document.getElementById(id);
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const button = (text, action, className = '') => { const node = el('button', className, text); node.type = 'button'; node.addEventListener('click', action); return node; };
function focusFiguresNavigation() { document.querySelector('#overview + .bottom-nav [data-nav=figures]')?.focus({ preventScroll: true }); }
let figures = [], statusFilter = '', selectedTag = '', editor = null, preview = null, learning = null;
let route = 'home', opening = false, toastTimer, reviewNext = false;
let posterURLs = [], videoURL = null, previewURL = null;
const channel = 'BroadcastChannel' in window ? new BroadcastChannel(`salsa-trainer-library:${new URL('./', import.meta.url).pathname}`) : null;
const loop = new ABLoop();
let playIntent = false, wakeLock = null;
const video = $('learningVideo');
if ('ResizeObserver' in window) {
  for (const [selector, variable] of [['.overview > .heading', '--brand-header-height'], ['.page-intro', '--overview-intro-height'], ['.overview-filters', '--overview-filters-height']]) {
    const row = document.querySelector(selector); if (!row) continue;
    const measure = () => document.documentElement.style.setProperty(variable, `${row.getBoundingClientRect().height}px`);
    new ResizeObserver(measure).observe(row); measure();
  }
}


function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500); }
function setError(id, message) { $(id).textContent = message ?? ''; $(id).hidden = !message; }
function pushRoute(view) { route = view; history.pushState({ salsa: true, view }, '', `#${view === 'editor' ? 'figur' : view === 'preview' ? 'vorschau' : 'lernen'}`); }
history.replaceState({ salsa: true, view: 'home' }, '', location.pathname + location.search);

function confirmAction({ title, message = '', ok = 'Bestätigen', cancel = 'Abbrechen', destructive = false }) {
  if ($('confirmDialog').open) return Promise.resolve(false);
  $('confirmTitle').textContent = title; $('confirmMessage').textContent = message;
  $('confirmOK').classList.toggle('danger-button', destructive);
  $('confirmOK').textContent = ok; $('confirmCancel').textContent = cancel;
  return new Promise(resolve => {
    const finish = value => { $('confirmDialog').close(); $('confirmOK').onclick = null; $('confirmCancel').onclick = null; $('confirmDialog').oncancel = null; resolve(value); };
    $('confirmOK').onclick = () => finish(true); $('confirmCancel').onclick = () => finish(false);
    $('confirmDialog').oncancel = event => { event.preventDefault(); finish(false); };
    $('confirmDialog').showModal(); $('confirmCancel').focus();
  });
}
function placeFigureMenu(menu, anchor) {
  const margin = 8;
  const header = document.querySelector('.overview-filters')?.getBoundingClientRect();
  const footer = document.querySelector('body > .bottom-nav')?.getBoundingClientRect();
  const top = Math.max(margin, (header?.bottom ?? 0) + margin);
  const bottom = Math.min(window.innerHeight, footer?.top ?? window.innerHeight) - margin;
  menu.style.maxHeight = `${Math.max(44, bottom - top)}px`;
  const size = menu.getBoundingClientRect();
  const trigger = anchor.getBoundingClientRect();
  const below = trigger.bottom + margin;
  const y = below + size.height <= bottom ? below : trigger.top - size.height - margin;
  menu.style.top = `${Math.max(top, Math.min(y, bottom - size.height))}px`;
  menu.style.left = `${Math.max(margin, Math.min(trigger.right - size.width, window.innerWidth - size.width - margin))}px`;
  menu.style.right = 'auto';
}
window.addEventListener('scroll', () => closeMenus(), { passive: true });
window.addEventListener('resize', () => closeMenus());
addEventListener('cloud-session-changed', () => closeMenus());
function closeMenus() { document.querySelectorAll('.card-menu').forEach(n => n.remove()); document.querySelectorAll('.card-options').forEach(n => n.setAttribute('aria-expanded', 'false')); }
async function refresh() {
  try { figures = await listFigures(); renderOverview(); }
  catch (error) { $('empty').hidden = false; $('empty').replaceChildren(el('h2', '', 'Speicher nicht verfügbar'), el('p', '', storageMessage(error))); }
}
// Tag chips share the exact icon used by the tag filter.
const tagIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 3 8 0 10 10-8 8L3 11V3Z"/><circle cx="7" cy="7" r="1"/></svg>';
function fitCardTags(row) {
  const chips = [...row.querySelectorAll('.card-tag-chip')];
  const more = row.querySelector('.card-tags-more');
  chips.forEach(chip => { chip.hidden = false; });
  more.hidden = false;
  const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
  const available = row.clientWidth;
  let used = 0, count = 0;
  for (const chip of chips) {
    const width = chip.getBoundingClientRect().width;
    const reserve = count < Number(row.dataset.total) - 1 ? more.getBoundingClientRect().width + gap : 0;
    if (used + width + reserve > available + 0.5) break;
    used += width + gap; count++;
  }
  chips.forEach((chip, index) => { chip.hidden = index >= count; });
  more.hidden = count === Number(row.dataset.total);
}
const tagRowsObserver = new ResizeObserver(entries => entries.forEach(({ target }) => fitCardTags(target)));
document.fonts.ready.then(() => document.querySelectorAll('.card-tags').forEach(fitCardTags));
function createCardTags(tags) {
  const row = el('span', 'card-tags');
  row.dataset.total = tags.length;
  row.title = tags.join(' · ');
  row.setAttribute('role', 'group'); row.setAttribute('aria-label', `Tags: ${tags.join(', ')}`);
  tags.slice(0, 3).forEach(tag => {
    const chip = el('span', 'card-tag-chip'); chip.setAttribute('aria-hidden', 'true');
    chip.innerHTML = tagIcon; chip.append(el('span', 'card-tag-text', tag)); row.append(chip);
  });
  const more = el('span', 'card-tags-more', '…'); more.setAttribute('aria-hidden', 'true'); row.append(more);
  tagRowsObserver.observe(row);
  return row;
}

function renderOverview() {
  tagRowsObserver.disconnect();
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
    const copy = el('span', 'card-copy'); copy.append(el('span', 'card-title', figure.title));
    const learningStatus = el('span', 'card-status status-' + (figure.status === 'Sitzt' ? 'learned' : figure.status === 'Am Üben' ? 'practice' : 'new'), figure.status);
    learningStatus.title = `Lernstand: ${figure.status}`;
    if (figure.tags.length) copy.append(createCardTags(figure.tags));
    main.append(copy);
    const thumbnailButton = button('', () => openPlayer(figure), 'card-thumbnail-button');
    thumbnailButton.setAttribute('aria-label', `Vorschaubild von ${figure.title} abspielen`); thumbnailButton.append(thumb);
    thumbnailButton.addEventListener('contextmenu', event => { event.preventDefault(); closeMenus(); showMenu(); });
    const statusBar = el('div', 'card-storage-status');
    const cloudStatus = cloudLocalIndex.status(figure);
    const badge = button('', () => toast(provenanceLabel(cloudStatus)), 'card-provenance');
    badge.innerHTML = provenanceIcon(cloudStatus); badge.title = provenanceLabel(cloudStatus);
    badge.setAttribute('aria-label', badge.title); badge.dataset.cloudStatus = cloudStatus;
    const folderName = figure.storageFolder ? figure.folderName || 'SalsaTrainer' : 'App-Speicher';
    const folder = el('span', 'card-storage-folder', folderName); folder.title = folderName;
    const metadata = el('span', 'card-meta', `${timeLabel(figure.duration)} · ${figure.videoIds.length} Video${figure.videoIds.length === 1 ? '' : 's'}`);
    const folderIcon = el('span', 'card-folder-icon'); folderIcon.setAttribute('aria-hidden', 'true');
    folderIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2Z"/></svg>';
    statusBar.append(folderIcon);
    statusBar.append(folder, learningStatus, badge);
    metadata.title = metadata.textContent;
    const learningLine = el('span', 'card-learning-line'); learningLine.append(metadata);
    copy.insertBefore(learningLine, copy.querySelector('.card-tags'));
    const options = button('⋮', event => { event.stopPropagation(); const wasOpen = options.getAttribute('aria-expanded') === 'true'; closeMenus(); if (!wasOpen) showMenu(); }, 'card-options');
    options.setAttribute('aria-label', `Optionen für ${figure.title}`); options.setAttribute('aria-expanded', 'false');
    function showMenu() {
      options.setAttribute('aria-expanded', 'true'); const menu = el('div', 'card-menu');
      if (signedIn()) menu.append(button('In Cloud veröffentlichen', () => { closeMenus(); openCloud(figure); }));
      menu.append(button('Figur teilen', () => { closeMenus(); openShare(figure); }), button('Bearbeiten', () => { closeMenus(); openEditor(figure); }), button('Löschen', async () => {
        closeMenus(); const accepted = await confirmAction({ title: `„${figure.title}“ löschen?`, message: (figure.storageFolder ? 'Die Figur und ihre zugehörigen Videos werden aus dem verknüpften Geräteordner gelöscht.' : 'Die Figur und ihre zugehörigen Videos werden aus dem App-Speicher gelöscht.') + ' Deine ursprünglichen Importdateien bleiben erhalten.', ok: 'Löschen' });
        if (accepted) { try { await deleteFigure(figure); changed(); await refresh(); toast('Figur gelöscht.'); } catch (error) { toast(storageMessage(error)); await refresh(); } }
      }, 'danger'));
      if (figure.storageFolder || folderSupported()) menu.append(button(figure.storageFolder ? 'In App-Speicher übertragen' : 'In Geräteordner übertragen', () => { closeMenus(); moveFigure(figure); }));
      card.append(menu);
      placeFigureMenu(menu, options);
    }
    main.addEventListener('contextmenu', event => { event.preventDefault(); closeMenus(); showMenu(); });
    const details = el('div', 'card-details'); details.append(main, statusBar); card.append(thumbnailButton, details, options);
    if (figure.folderAccessRequired || figure.storageProblem) {
      card.append(el('span', 'card-storage-warning', figure.folderAccessRequired ? 'Ordner gespeichert – Zugriff erneut erlauben' : `${figure.storageFolder ? 'Geräteordner' : 'App-Speicher'}: ${figure.storageProblem}`));
    }
    if (figure.folderAccessRequired && folderSupported()) {
      card.classList.add('needs-folder-access');
      const allow = button('Ordnerzugriff erlauben', async () => {
        if (deviceBusy) return;
        deviceBusy = true; allow.disabled = true; allow.textContent = 'Zugriff wird angefragt …';
        try { await allowFolderAccess(figure.storageFolder); changed(); await refresh(); toast('Ordnerzugriff erlaubt. Die Figuren sind wieder verfügbar.'); }
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
    const node = button(value || 'Alle', () => { statusFilter = value; renderFilters(); renderOverview(); });
    node.setAttribute('aria-pressed', String(value === statusFilter)); $('statusFilters').append(node);
  }
}
function changed() { channel?.postMessage('changed'); dispatchEvent(new Event('local-figures-changed')); }
channel?.addEventListener('message', () => { dispatchEvent(new Event('local-figures-changed')); void refresh(); });
window.addEventListener('focus', () => refresh());
$('search').addEventListener('input', renderOverview);
// Native select pickers can retain :focus-visible after a touch selection.
// Keep focus for keyboard users, but dismiss the completed touch interaction.
let sortPointerType = '';
$('sort').addEventListener('pointerdown', event => { sortPointerType = event.pointerType; });
$('sort').addEventListener('keydown', () => { sortPointerType = ''; });
$('sort').addEventListener('change', () => {
  renderOverview();
  if (sortPointerType === 'touch' || sortPointerType === 'pen') $('sort').blur();
  sortPointerType = '';
});
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
  let active;
  try {
    editor = { id: figure?.id ?? crypto.randomUUID(), revision: figure?.revision ?? null, storageFolder: figure?.storageFolder, drafts: [], busy: false, loading: !!figure && !imported, loadFailed: false, controller: new AbortController(), allowClose: false, replacing: null, reviewAll: false };
    $('figureTitle').value = figure?.title ?? ''; $('figureDescription').value = figure?.description ?? '';
    $('figureStatus').value = figure?.status ?? 'Neu'; $('figureTags').value = figure?.tags.join(', ') ?? '';
    editor.initialForm = JSON.stringify(formValue()); editor.initialDrafts = draftSignature(editor.drafts);
    editor.importFingerprint = figure?.importFingerprint ?? null;
    if (imported) {
      editor.importFingerprint = imported.fingerprint;
      editor.drafts = imported.drafts.map(d => ({ ...d, id: crypto.randomUUID() }));
      $('figureTitle').value = imported.title; $('figureDescription').value = imported.description;
      $('figureTags').value = imported.tags.join(', '); $('figureStatus').value = figure?.status ?? 'Neu';
    }
    $('editorHeading').textContent = figure ? 'Figur bearbeiten' : 'Figur hinzufügen'; setError('editorError', null);
    active = editor;
    renderDrafts(); setBusy(false); setEditorLoading(active.loading); $('editor').showModal(); pushRoute('editor');
    opening = false;
    if (!active.loading) { if (!figure) $('figureTitle').focus(); return; }
    $('editorBack').focus();
    // Paint the editor and its spinner before starting video verification.
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    if (editor !== active) return;
    const loaded = await figureVideos(figure, true, { signal: active.controller.signal, progress: ({ done, total }) => {
      if (editor === active) $('editorLoading').textContent = `Videos werden geladen und geprüft … ${done} von ${total}`;
    } });
    if (editor !== active) return;
    active.drafts = loaded.map(r => ({ ...r, existing: !r.missing, confirmed: !r.missing }));
    active.initialDrafts = draftSignature(active.drafts);
    renderDrafts(); setEditorLoading(false);
  } catch (error) {
    if (editor === active && error.name !== 'AbortError') {
      active.loadFailed = true; setEditorLoading(false); setError('editorError', storageMessage(error));
    }
  } finally { if (!active || editor === active) opening = false; }
}
$('openAddFigure').onclick = () => $('addChoiceDialog').showModal();
$('closeAddChoice').onclick = () => $('addChoiceDialog').close();
$('addChoiceDialog').addEventListener('close', () => {
  if (!opening && !editor && !$('importChoiceDialog').open) $('openAddFigure').focus({ preventScroll: true });
});
$('addChoiceDialog').addEventListener('click', event => {
  if (event.target !== $('addChoiceDialog')) return;
  const rect = $('addChoiceDialog').getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('addChoiceDialog').close();
});
$('addFigure').onclick = () => { $('addChoiceDialog').close(); openEditor(); };
function updateSave() { $('saveFigure').disabled = !editor || editor.busy || editor.loading || editor.loadFailed || !$('figureTitle').value.trim() || !editor.drafts.length || editor.drafts.some(d => !d.confirmed); }
function setBusy(value) { editor.busy = value; $('editorFields').disabled = value; $('pickVideos').disabled = value || editor.loading || editor.loadFailed; $('reviewAll').disabled = $('pickVideos').disabled; $('editorBack').disabled = value; $('saveProgress').hidden = !value; $('saveIndicator').hidden = !value; updateSave(); }
function setEditorLoading(value) {
  editor.loading = value;
  $('editorLoading').hidden = !value;
  $('editorLoading').classList.toggle('is-busy', value);
  $('editorLoading').textContent = value ? 'Videos werden geladen und geprüft …' : '';
  $('draftVideos').setAttribute('aria-busy', String(value));
  $('editorFields').disabled = editor.busy;
  $('pickVideos').disabled = value || editor.busy || editor.loadFailed; $('reviewAll').disabled = $('pickVideos').disabled;
  updateSave();
}
$('editorForm').addEventListener('input', updateSave);
function chooseFiles(replacing = null) { if (!editor || editor.busy || editor.loading || editor.loadFailed) return; editor.replacing = replacing; $('videoFiles').multiple = !replacing; $('videoFiles').value = ''; $('videoFiles').click(); }
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
    // Paint the saving state before starting video copies and verification.
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    await saveFigure({ id: active.id, ...formValue(), importFingerprint: active.importFingerprint, storageFolder: active.storageFolder }, active.drafts, active.revision);
    changed(); await refresh();
    if (editor === active) { active.allowClose = true; setBusy(false); history.back(); toast('Figur lokal gespeichert.'); }
  } catch (error) { if (editor === active) { setBusy(false); setError('editorError', storageMessage(error)); } }
});
function cleanupEditor() { editor?.controller.abort(); $('editor').close(); editor = null; $('videoFiles').value = ''; }

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
window.addEventListener('beforeunload', event => { if ($('transferProgressDialog').open || (editor && (editor.busy || isDirty()))) { event.preventDefault(); event.returnValue = ''; } });

async function openPlayer(figure) {
  if (opening || editor || learning) return; opening = true;
  try {
    const records = await figureMedia(figure, { verifyAccess: true });
    learning = { figure, records, index: 0, crop: false, landscape: false, fullLoop: false, speed: 1 };
    loop.clear(); $('playerTitle').textContent = figure.title; $('playerDescription').textContent = figure.description;
    $('playerVideoChoice').replaceChildren(); records.forEach((record, index) => { const option = el('option', '', record.name || `Video ${index + 1}`); option.value = String(index); $('playerVideoChoice').append(option); });
    $('playerVideoChoice').parentElement.hidden = records.length <= 1; $('speed').value = '1'; $('fitCrop').textContent = 'Fit'; $('fitCrop').setAttribute('aria-pressed', 'false'); $('fullLoop').setAttribute('aria-pressed', 'false'); $('rotatePlayer').setAttribute('aria-pressed', 'false');
    $('videoStage').classList.remove('crop'); $('playerScreen').classList.remove('is-landscape'); $('playerScreen').hidden = false; $('overview').hidden = true; $('overview').inert = true; document.body.classList.add('playing-screen');
    pushRoute('player'); loadPlayerVideo(0, false); $('playerBack').focus();
  } catch (error) { toast(storageMessage(error)); } finally { opening = false; }
}
let playerLoad = 0;
async function loadPlayerVideo(index, autoplay) {
  if (!learning?.records[index]) return;
  const active = learning, request = ++playerLoad, record = active.records[index];
  playIntent = autoplay; video.pause(); releaseWakeLock();
  if (videoURL) { video.removeAttribute('src'); video.load(); releaseURL(videoURL); }
  learning.index = index; $('playerVideoChoice').value = String(index); loop.clear(); updateLoop(); setError('playerError', null); $('videoLoading').hidden = false;
  $('seek').value = '0'; $('position').textContent = '0:00'; $('duration').textContent = timeLabel(learning.records[index].duration);
  $('playPause').textContent = '▶'; $('playPause').setAttribute('aria-label', 'Abspielen');
  try {
    const loaded = await record.load();
    if (learning !== active || request !== playerLoad) return;
    videoURL = URL.createObjectURL(loaded.blob); video.src = videoURL; video.playbackRate = active.speed; video.load();
  } catch (error) {
    if (learning !== active || request !== playerLoad) return;
    playIntent = false; $('videoLoading').hidden = true;
    setError('playerError', storageMessage(error));
  }
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
  window.stepNativePlayer?.reset();
  $('playerScreen').classList.remove('is-native-fullscreen');
  ++playerLoad;
  pause(); video.removeAttribute('src'); video.load(); releaseURL(videoURL); videoURL = null; learning = null; loop.clear();
  $('playerScreen').hidden = true; $('overview').hidden = false; $('overview').inert = false; document.body.classList.remove('playing-screen');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); if (video.webkitDisplayingFullscreen) video.webkitExitFullscreen();
}
document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); previewVideo.pause(); } else refresh(); });
window.addEventListener('pagehide', () => { pause(); previewVideo.pause(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && learning && !document.fullscreenElement) { event.preventDefault(); history.back(); } });


let deviceBusy = false, storageChoicePending = false;
async function deviceWork(work) {
  if (deviceBusy) return; deviceBusy = true; $('closeInfoTop').disabled = true;
  $('deviceStorageStatus').textContent = 'Bitte warten …';
  $('deviceStorageControls').inert = true;
  try { await work(); changed(); await refresh(); await renderDeviceStorage(); $('deviceStorageStatus').textContent = 'Gespeichert.'; }
  catch (e) { $('deviceStorageStatus').textContent = storageMessage(e); }
  finally { deviceBusy = false; $('closeInfoTop').disabled = false; $('deviceStorageControls').inert = false; }
}
async function renderDeviceStorage() {
  const settings = await storageSettings(), controls = $('deviceStorageControls'); controls.replaceChildren();
  const selected = settings.folders.find(f => f.id === settings.activeFolder);
  $('deviceStorageActive').textContent = `Neue Figuren: ${selected ? 'Geräteordner „' + selected.name + '“' : 'App-Speicher'}. Vorhandene Figuren bleiben an ihrem bisherigen Speicherort.`;
  const choices = el('div', 'storage-options'); choices.setAttribute('role', 'group'); choices.setAttribute('aria-label', 'Speicherort für neue Figuren');
  choices.append(el('strong', '', 'Neue Figuren speichern in …'));
  function choice(id, title, detail, active, action, unavailable = false) {
    const control = button('', action, 'storage-choice'); control.dataset.storageTarget = id;
    control.setAttribute('aria-label', title); control.setAttribute('aria-pressed', String(active));
    const mark = el('span', 'storage-choice-mark'); mark.setAttribute('aria-hidden', 'true');
    const description = el('small', 'storage-choice-detail', detail); description.id = `storage-choice-${id}-detail`;
    control.setAttribute('aria-describedby', description.id);
    control.append(mark, el('span', 'storage-choice-title', title), description);
    control.disabled = active || unavailable;
    return control;
  }
  async function changeStorage(id, name) {
    if (deviceBusy || storageChoicePending || id === settings.activeFolder) return;
    storageChoicePending = true;
    try {
      const destination = id ? `im Geräteordner „${name}“` : 'im App-Speicher';
      if (!await confirmAction({ title: 'Speicherort wechseln?', message: `Neue Figuren künftig ${destination} speichern? Vorhandene Figuren und Videos bleiben an ihrem bisherigen Speicherort.`, ok: 'Wechseln' })) return;
      await deviceWork(async () => {
        if (id) await allowFolderAccess(id);
        await setStorageFolder(id);
      });
    } finally { storageChoicePending = false; }
  }
  async function chooseDeviceFolder() {
    if (deviceBusy || storageChoicePending) return;
    storageChoicePending = true;
    try {
      // Open the OS picker directly in this click task. Choosing a folder does
      // not change the default until the following app confirmation is accepted.
      let candidate; try { candidate = await chooseFolder(); } catch (e) { if (e.name !== 'AbortError') $('deviceStorageStatus').textContent = storageMessage(e); return; }
      const count = candidate.figureCount;
      if (!await confirmAction({ title: count ? 'Bibliotheksordner öffnen?' : 'Geräteordner verwenden?', message: `„${candidate.name}“ enthält ${count} Figuren. Videos, Angaben und Lernstände werden eingelesen. Neue Figuren werden hier gespeichert. Vorhandene App-Figuren werden nicht verschoben.`, ok: count ? 'Bibliothek öffnen' : 'Ordner verwenden' })) return;
      await deviceWork(() => connectFolder(candidate));
    } finally { storageChoicePending = false; }
  }
  choices.append(choice('app', 'App-Speicher', !settings.activeFolder ? 'Privat in dieser App · Für neue Figuren aktiv' : 'Privat in dieser App', !settings.activeFolder, () => changeStorage(null, 'App-Speicher')));
  for (const folder of settings.folders) {
    const row = el('div', 'storage-folder'); row.dataset.folderId = folder.id;
    const granted = folder.access === 'granted', active = folder.id === settings.activeFolder;
    const detail = `${folder.figureCount} Figur${folder.figureCount === 1 ? '' : 'en'} · ${active ? granted ? 'Für neue Figuren aktiv' : 'Ausgewählt · Zugriff erforderlich' : granted ? 'Für neue Figuren auswählen' : 'Zugriff erforderlich'}`;
    row.append(choice(folder.id, folder.name, detail, active, () => changeStorage(folder.id, folder.name), !settings.supported));
    const status = el('p', 'storage-access-state', granted ? '✓ Verbunden · Zugriff erlaubt' : 'Verbunden · Zugriff erforderlich');
    status.dataset.state = granted ? 'granted' : 'required'; row.append(status);
    if (settings.supported && !granted) row.append(button('Ordnerzugriff erlauben', () => deviceWork(() => allowFolderAccess(folder.id)), 'secondary'));
    if (active && !granted && settings.supported) row.append(el('p', 'error', 'Bitte den Ordnerzugriff erlauben, bevor du hier speicherst.'));
    if (folder.access === 'unavailable') row.append(el('p', 'error', 'Der Ordnerzugriff konnte nicht geprüft werden. Bitte erneut erlauben oder den Ordner neu auswählen.'));
    if (folder.pendingCleanup) row.append(el('p', 'error', 'Dateibereinigung ausstehend. Sie wird beim nächsten Speichern oder Löschen erneut versucht.'));
    choices.append(row);
  }
  if (settings.supported) {
    if (settings.folders.length) choices.append(button('Weiteren Geräteordner auswählen', chooseDeviceFolder, 'secondary'));
    else choices.append(choice('choose', 'Geräteordner auswählen', 'Videos in einem Ordner auf diesem Gerät', false, chooseDeviceFolder));
  } else choices.append(el('p', 'muted', 'Geräteordner werden in diesem Browser nicht unterstützt. Verwende aktuelles Chrome auf Android oder Desktop. Auf iPhone/Safari bleibt der App-Speicher mit ZIP-Sicherung verfügbar.'));
  controls.append(choices);
}
$('transferProgressDialog').addEventListener('cancel', event => event.preventDefault());
async function showTransferProgress(figure, target) {
  $('transferProgressName').textContent = `„${figure.title}“`;
  $('transferProgressDirection').textContent = target ? 'App-Speicher → Geräteordner' : 'Geräteordner → App-Speicher';
  $('transferProgressDialog').showModal();
  // Paint the dialog before copying or verifying video data.
  await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
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
    await showTransferProgress(figure, target);
    await transferFigure(figure, target);
    await refresh(); changed();
    $('transferProgressDialog').close();
    if (await confirmAction({ title: 'Kopie erfolgreich geprüft', message: 'Die neue Kopie ist gespeichert. Sollen die bisherigen verwalteten Videos und Angaben dieser Figur am alten Speicherort jetzt entfernt werden? Ursprüngliche Importdateien bleiben erhalten.', ok: 'Bisherige Kopie entfernen', cancel: 'Beide behalten' })) {
      await showTransferProgress(figure, target);
      await deleteFigure(figure);
    }
    changed(); await refresh(); $('transferProgressDialog').close(); toast('Übertragung abgeschlossen.');
  } catch (e) { $('transferProgressDialog').close(); toast(storageMessage(e)); await refresh(); }
  finally { $('transferProgressDialog').close(); opening = false; }
}

let offlineReady = false;
async function storageInfo() {
  const request = $('persistStorage');
  request.hidden = true;
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (window.AndroidPlatform) {
      $('storageDetails').textContent = `${estimate ? `Ungefähr ${Math.round((estimate.usage ?? 0) / 1048576)} MB lokal belegt. ` : ''}Die App verwendet den privaten Android-App-Speicher.`;
      $('persistenceResult').textContent = 'Keine zusätzliche Speicherfreigabe erforderlich. Eine Deinstallation oder „App-Daten löschen“ entfernt deine lokalen Daten. Nutze Backups.';
    } else {
      const persistent = await navigator.storage?.persisted?.();
      $('storageDetails').textContent = `${estimate ? `Ungefähr ${Math.round((estimate.usage ?? 0) / 1048576)} MB lokal belegt. ` : ''}${persistent ? 'Dauerhafter Speicher ist aktiv.' : 'Dauerhafter Speicher ist bisher nicht bestätigt.'}`;
      request.hidden = persistent || typeof navigator.storage?.persist !== 'function';
      if (persistent) $('persistenceResult').textContent = '';
    }
  } catch {
    $('storageDetails').textContent = 'Der Speicherstatus konnte nicht geprüft werden.';
    request.hidden = !!window.AndroidPlatform || typeof navigator.storage?.persist !== 'function';
  }
  try { await renderDeviceStorage(); } catch (e) { $('deviceStorageStatus').textContent = storageMessage(e); }
  $('offlineDetails').textContent = offlineReady ? 'Die App ist für Offline-Aufrufe bereit. Gespeicherte Videos funktionieren ohne Netz.' : document.documentElement.dataset.offlineStatus === 'error' ? 'Die Offline-Vorbereitung ist fehlgeschlagen. Bitte die App mit Internetverbindung neu laden.' : 'Die Offline-Nutzung wird beim ersten Online-Aufruf vorbereitet.';
}
function showInfoDialog() {
  const dialog = $('infoDialog');
  if (document.activeElement === $('search')) $('search').blur();
  dialog.showModal();
  $('infoTitle').focus({ preventScroll: true });
  dialog.scrollTop = 0;
}
$('infoButton').onclick = () => { $('themeChoice').value = window.stepAppearance.get(); storageInfo(); showInfoDialog(); };
$('themeChoice').onchange = () => { $('themeStatus').textContent = window.stepAppearance.set($('themeChoice').value) ? 'Die Auswahl wird auf diesem Gerät gespeichert.' : 'Das Farbschema gilt für diesen Aufruf. Der Browser konnte die Auswahl nicht speichern.'; };
$('closeInfoTop').onclick = () => { if (!deviceBusy) $('infoDialog').close(); };
$('infoDialog').addEventListener('cancel', event => { if (deviceBusy) event.preventDefault(); });
$('persistStorage').onclick = async () => {
  const request = $('persistStorage'); if (request.disabled || request.hidden) return;
  request.disabled = true; request.setAttribute('aria-busy', 'true'); request.textContent = 'Speicherfreigabe wird geprüft …';
  try {
    const granted = await navigator.storage.persist();
    $('persistenceResult').textContent = granted ? 'Dauerhafter Speicher ist aktiv.' : 'Der Browser hat die Anfrage nicht bestätigt. Die App bleibt nutzbar. Auf dem Home-Bildschirm installierte Apps werden bevorzugt berücksichtigt.';
    await storageInfo();
  } catch { $('persistenceResult').textContent = 'Die Speicheranfrage konnte nicht abgeschlossen werden. Bitte erneut versuchen.'; }
  finally { request.disabled = false; request.removeAttribute('aria-busy'); request.textContent = 'Dauerhaften Speicher anfragen'; }
};
if ('serviceWorker' in navigator) {
  document.documentElement.dataset.offlineStatus = 'preparing';
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(registration => {
    const update = () => { if (navigator.onLine) registration.update().catch(() => {}); };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
    window.addEventListener('online', update);
    return navigator.serviceWorker.ready;
  }).then(() => {
    offlineReady = true; document.documentElement.dataset.offlineStatus = 'ready';
  }).catch(() => { document.documentElement.dataset.offlineStatus = 'error'; });
}
window.addEventListener('offline', () => toast('Du bist offline. Deine gespeicherten Videos bleiben verfügbar.'));
renderFilters();

// Keep the fixed save footer above the iOS software keyboard where Visual Viewport is available.
function updateViewport() { document.documentElement.style.setProperty('--app-height', `${window.visualViewport?.height ?? innerHeight}px`); }
window.visualViewport?.addEventListener('resize', updateViewport); updateViewport();

// Preparation and hand-off have separate clicks to preserve user activation.
let sharing = false, packageImport = null;
const zipDelivery = createFileDelivery({ container: $('shareDialog'), label: 'ZIP', onChange: () => zipWorkflow.refresh() });
const zipWorkflow = createFigureZipWorkflow({ readVideos: figureVideos, delivery: zipDelivery,
  yieldToUI: () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0))), onChange: renderShare });
function renderShare(state) {
  sharing = state.open;
  if (!state.open) return;
  $('shareTitle').textContent = `„${state.title}“ teilen`;
  const choices = state.videos.map(video => {
    const label = el('label', 'share-choice'), input = el('input'); input.type = 'checkbox'; input.checked = video.selected;
    input.onchange = () => zipWorkflow.select(video.id, input.checked);
    label.append(input, el('span', '', `${video.name} · ${(video.size / 1048576).toFixed(1)} MB`)); return label;
  });
  $('shareVideos').replaceChildren(...choices); $('shareVideos').disabled = state.busy;
  $('shareSize').textContent = `${state.count} Videos · ca. ${(state.size / 1048576).toFixed(1)} MB / 250 MB`;
  $('preparePackage').disabled = !state.canPrepare; $('preparePackage').hidden = state.ready;
  $('downloadPackage').hidden = !state.ready; $('sendPackage').hidden = !state.canShare;
  for (const id of ['downloadPackage', 'sendPackage']) {
    $(id).disabled = state.busy; $(id).setAttribute('aria-busy', String(state.delivering));
  }
  $('shareProgress').textContent = state.message; $('shareProgress').hidden = !state.message;
  $('shareProgress').classList.toggle('is-busy', state.busy);
  $('closeShare').disabled = !state.canClose; setError('shareError', state.error || null);
}
async function openShare(figure) {
  if (opening || editor || learning || sharing || packageImport) return;
  opening = true;
  try { if (await zipWorkflow.open(figure)) $('shareDialog').showModal(); }
  catch (error) { toast(storageMessage(error)); } finally { opening = false; }
}
function closeShare() { if (zipWorkflow.close()) $('shareDialog').close(); }
$('closeShare').onclick = closeShare;
$('shareDialog').addEventListener('cancel', event => { event.preventDefault(); closeShare(); });
$('preparePackage').onclick = () => zipWorkflow.prepare();
$('downloadPackage').onclick = () => zipWorkflow.deliver('save');
$('sendPackage').onclick = () => zipWorkflow.deliver('share');
$('importFigure').onclick = () => {
  if (editor || opening || packageImport) { toast('Bitte zuerst den aktuellen Vorgang beenden.'); return; }
  $('addChoiceDialog').close(); $('packageFile').value = ''; $('importChoiceDialog').showModal();
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
  if (editor || preview || learning || sharing || packageImport || $('addChoiceDialog').open || $('importChoiceDialog').open) {
    toast('Bitte zuerst den aktuellen Vorgang beenden und zur Übersicht zurückkehren.'); return;
  }
  location.reload();
};
document.querySelectorAll('[data-nav]').forEach(nav => {
  if (nav.id === 'cloudButton' || nav.closest('#cloudDialog')) return;
  nav.onclick = async () => {
    if (nav.closest('#infoDialog')) { if (deviceBusy) return; $('infoDialog').close(); }
    if (learning) { await new Promise(resolve => { window.addEventListener('popstate', resolve, { once: true }); history.back(); }); }
    if (nav.dataset.nav === 'cloud') openCloud();
    else { window.scrollTo({ top: 0 }); focusFiguresNavigation(); }
  };
});
async function chooseCloudImport({ title, fingerprint, revisionIds, figureId }) {
  const current = await listFigures();
  const matches = cloudLocalIndex.importCandidates({ title, fingerprint, revisionIds, figureId }, current);
  if (!matches.length) return {};
  const dialog = el('dialog', 'small-dialog'); dialog.id = 'cloudImportConflict';
  const heading = el('h2', '', 'Figur bereits lokal vorhanden'); heading.id = 'cloudImportConflictTitle'; dialog.setAttribute('aria-labelledby', heading.id);
  dialog.append(heading, el('p', '', 'Vorhandene Figur ersetzen oder eine neue lokale Figur speichern? Die Cloud-Figur und ihre Bibliothekszuordnungen bleiben erhalten.'));
  const select = document.createElement('select'); select.setAttribute('aria-label', 'Zu ersetzende lokale Figur');
  for (const f of matches) { const option = document.createElement('option'); option.value = f.id + ':' + (f.storageFolder ?? 'app'); option.textContent = `${f.title} · ${f.storageFolder ? `Geräteordner ${f.folderName ?? ''}`.trim() : 'App-Speicher'} · ${f.status}`; select.append(option); }
  dialog.append(select);
  return new Promise(resolve => {
    const finish = value => { dialog.close(); dialog.remove(); resolve(value); };
    const actions = el('div', 'dialog-actions');
    actions.append(button('Abbrechen', () => finish(null), 'secondary'), button('Als neue Figur speichern', () => finish({}), 'secondary'), button('Vorhandene Figur ersetzen', () => finish({ figure: matches[select.selectedIndex] }), 'primary'));
    dialog.append(actions); dialog.oncancel = event => { event.preventDefault(); finish(null); };
    document.body.append(dialog); dialog.showModal(); actions.firstChild.focus();
  });
}
initCloud({ openLocal: figure => { openEditor(figure); }, confirm: confirmAction, closed: () => { void refresh(); if (!$('overview').hidden) focusFiguresNavigation(); }, localChanged: async () => { changed(); await refresh(); }, localFigures: listFigures, chooseImport: chooseCloudImport, localSaved: () => toast('Figur lokal gespeichert.') });
try { await cleanupInterruptedImports(); } catch { /* Refresh reports unavailable storage. */ }
await refresh();
