import { createFigureUpload } from './cloud-upload.js';
import { cloudIcon } from './cloud-provenance.js';
import { createLibraryDraft } from './cloud-library-draft.js';
import { mountLibraryOrder } from './cloud-library-order.js';
import { videoHash } from './cloud-dedup.js';
import { createMemberView } from './cloud-members.js';
import { createPeopleView } from './cloud-people.js';
import { cloudReadState, contentState } from './cloud-read-state.js';
import { cloudCall, signedIn, uploadMedia, logout, loginWithLink, loginWithPassword, setAdminPassword, cloudIdentity } from './cloud-api.js';
import { CLOUD_FILE_LIMIT } from './cloud-config.js';
import { figureVideos, figureMedia, listFigures, saveFigure, storageSettings } from './storage.js';
import { downloadLibrary, downloadFigure, inspectCloudVideo, enrichCloudMetadata } from './cloud-library-download.js';
import { readCloudCache, writeCloudCache, cloudCacheRevision } from './cloud-cache.js';
import { cloudLocalIndex as localIndex } from './cloud-local.js';
import { createPosterView, posterPayload } from './cloud-posters.js';
const node = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
const MB = value => `${(Number(value ?? 0) / 1000000).toFixed(1)} MB`;
const action = (label, work) => { const b = node('button', label, 'secondary'); b.type = 'button'; b.onclick = () => Promise.resolve().then(work).catch(report); return b; };
let uploadWorkflow = null, uploadRecovery, uploadViewError = null;
let peopleView, libraryDraft = null, libraryEditing = null, libraryUpload = null, lastLibraryDetail = null;
async function leaveLibraryDraft() {
  const activeDraft = libraryDraft ?? libraryUpload?.hook;
  if (!activeDraft?.dirty()) return true;
  const choice = await new Promise(resolve => {
    const prompt = node('dialog', undefined, 'cloud-unsaved-dialog');
    prompt.append(node('h3', 'Bibliothek noch nicht gespeichert'), node('p', 'Möchtest du deine Änderungen speichern oder verwerfen?'));
    const finish = value => { prompt.close(); prompt.remove(); resolve(value); };
    prompt.append(action('Speichern', () => finish('save')), action('Verwerfen', () => finish('discard')), action('Weiter bearbeiten', () => finish('stay')));
    prompt.oncancel = event => { event.preventDefault(); finish('stay'); };
    document.body.append(prompt); prompt.showModal();
  });
  if (choice === 'stay') return false;
  if (choice === 'save') { await activeDraft.save(); return !(libraryDraft ?? libraryUpload?.hook)?.dirty(); }
  libraryDraft = null; libraryEditing = null; libraryUpload = null; source = null; return true;
}

let loginDialog, loginTrigger;
let dialog, body, errorBox, statusBox, hooks, state, current, busy = false, controller, source = null, area = 'figures';
function report(error, target = errorBox) { target.textContent = error?.message ?? 'Cloud-Aufruf fehlgeschlagen.'; target.hidden = false; target.scrollIntoView({ block: 'nearest' }); }
function field(form, label, value = '', type = 'text') {
  const wrap = node('label', label), input = node(type === 'textarea' ? 'textarea' : 'input');
  if (type !== 'textarea') input.type = type; input.value = value; wrap.append(input); form.append(wrap); return input;
}
function select(form, label, options, selected) {
  const wrap = node('label', label), input = node('select'); input.setAttribute('aria-label', label);
  for (const [value, name] of options) { const o = node('option', name); o.value = value; input.append(o); }
  if (selected !== undefined) input.value = selected; wrap.append(input); form.append(wrap); return input;
}
function checkbox(form, label, checked = false) { const wrap = node('label', undefined, 'cloud-check'), input = node('input'); input.type = 'checkbox'; input.checked = checked; wrap.append(input, node('span', label)); form.append(wrap); return input; }
function section(title, parent = body) { const s = node('section', undefined, 'cloud-card'); s.append(node('h3', title)); parent.append(s); return s; }
function libraryCard(library, parent = body) {
  const card = node('a', undefined, 'cloud-card cloud-library-card');
  const url = new URL('./', location.href); url.searchParams.set('cloud', '1'); url.searchParams.set('library', library.id);
  card.href = url.href; card.dataset.libraryId = library.id;
  card.setAttribute('aria-label', `Bibliothek „${library.title}“ öffnen`);
  card.append(node('h3', library.title)); parent.append(card);
  card.onclick = event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); if (!busy) void load(library.id, true).catch(report);
  };
  return card;
}
async function run(message, work, errorTarget = errorBox) {
  if (busy) return; busy = true; errorBox.hidden = true; errorTarget.hidden = true; statusBox.textContent = message;
  body.inert = true; if (loginDialog) loginDialog.inert = true; document.getElementById('cloudBack').disabled = true; dialog.querySelectorAll('[data-nav]').forEach(button => { button.disabled = true; });
  try { return await work(); } catch (error) { if (error.accessChanged) await recoverAccess(); report(error, errorTarget.isConnected ? errorTarget : errorBox); }
  finally { busy = false; body.inert = false; if (loginDialog) loginDialog.inert = false; document.getElementById('cloudBack').disabled = false; dialog.querySelectorAll('[data-nav]').forEach(button => { button.disabled = false; }); statusBox.textContent = ''; if (authReloadPending && dialog.open) { authReloadPending = false; source = null; area = 'initial'; void load(null, true); } }
}
async function recoverAccess() {
  const inputs = [...body.querySelectorAll('label')].map(label => { const input = label.querySelector('input,textarea,select'); return input && input.type !== 'password' ? { label: label.firstChild?.textContent, value: input.value, checked: input.checked } : null; }).filter(Boolean);
  try {
    state = await cloudCall('state'); let detail;
    if (current) { try { detail = await cloudCall('library', { id: current }); } catch { current = null; area = 'libraries'; } }
    if (area === 'admin' && !state.me?.is_admin) area = 'libraries';
    await renderCloud(current, detail);
    for (const saved of inputs) { const label = [...body.querySelectorAll('label')].find(l => l.firstChild?.textContent === saved.label); const input = label?.querySelector('input,textarea,select'); if (input && !input.readOnly && !input.disabled) { input.value = saved.value; if (input.type === 'checkbox') input.checked = saved.checked; input.dispatchEvent(new Event('input')); input.dispatchEvent(new Event('change')); } }
  } catch { /* Keep drafts and the original error when refreshing is unavailable. */ }
}
const hasOwnArea = value => !!value?.me && (value.me.upload_enabled || value.own_figures?.length > 0);
const initialArea = value => hasOwnArea(value) ? 'figures' : 'libraries';
async function close() { if (busy || !await leaveLibraryDraft()) return; libraryDraft = null; libraryEditing = null; libraryUpload = null; viewEpoch++; renderedView = null; clearTimeout(statusTimer); cancelThumbnails(); dialog.close(); body.querySelectorAll('video').forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); }); source = null; hooks.closed?.(); }
async function cloudBack() {
  if (busy) return;
  if (loginDialog?.open) { dismissLogin(); return; }
  if (libraryUpload) { await resumeLibraryUpload(); return; }
  if (libraryEditing) {
    const id = current;
    if (!await leaveLibraryDraft()) return;
    libraryEditing = null; libraryDraft = null; await load(id); return;
  }
  if (current) { await navigate('libraries'); return; }
  await close();
}
function cloudStatusLabel(target, text, modified = false) {
  const icon = node('span', undefined, 'cloud-status-icon'); icon.innerHTML = cloudIcon(modified);
  target.replaceChildren(icon, node('span', text));
}
async function navigate(next, library = null) {
  if (!await leaveLibraryDraft()) return;
  libraryEditing = null; libraryDraft = null; libraryUpload = null; source = null; area = next; if (['admin', 'create'].includes(next)) await run('Laden …', () => load(library)); else await load(library, true);
}
function focusSection(box) {
  box.tabIndex = -1; box.focus(); box.scrollIntoView({ block: 'start' });
}
let viewEpoch = 0, statusTimer, displayedOwner = null, renderedView = null, authReloadPending = false;
let localUpdates = [], localInventoryEpoch = 0;
async function refreshLocalFigures() {
  const epoch = ++localInventoryEpoch;
  const figures = await hooks.localFigures();
  if (epoch === localInventoryEpoch) { localFigures = figures; localUpdates.forEach(update => update()); }
  return figures;
}
const mediaHashRequests = new Map();
async function cloudMediaHash(payload) {
  const owner = cloudIdentity(), generation = cloudCacheRevision(owner);
  const key = `media-hash:${payload.revision}:${payload.media}`;
  const requestKey = JSON.stringify([owner, generation, key]);
  if (mediaHashRequests.has(requestKey)) return mediaHashRequests.get(requestKey);
  const work = (async () => {
    const saved = await readCloudCache(owner, key);
    if (owner !== cloudIdentity() || generation !== cloudCacheRevision(owner)) throw new Error('Cloud-Ansicht wurde geändert.');
    if (saved?.value.content_hash) return saved.value;
    const media = await cloudCall('media', payload);
    // Revision media is immutable. Store just the hash, never paths or signed URLs.
    const value = { content_hash: media.content_hash };
    if (/^[a-f0-9]{64}$/.test(value.content_hash) && owner === cloudIdentity()) await writeCloudCache(owner, key, value, generation);
    return value;
  })();
  mediaHashRequests.set(requestKey, work);
  try { return await work; } finally { mediaHashRequests.delete(requestKey); }
}
function cacheStatus(message, temporary = false) {
  clearTimeout(statusTimer); statusBox.textContent = message;
  if (temporary) statusTimer = setTimeout(() => { if (!busy) statusBox.textContent = ''; }, 3500);
}
const lastStand = at => `Letzter Stand: ${new Date(at).toLocaleString('de')}`;
function maintainCloud(owner, me) { cloudReadState.maintain(owner, me, async () => {
  if (dialog.open && !busy && !source && ['figures', 'libraries'].includes(area)) await load(current);
}); }
async function load(library = current, allowCache = false) {
  if (libraryDraft?.dirty()) {
    // Background refreshes must never replace an unsaved order or form.
    if (library === current && allowCache !== 'refresh') return;
    if (!await leaveLibraryDraft()) return;
  }
  if (libraryEditing && library === current && !allowCache) return;
  let epoch = ++viewEpoch;
  let owner, cached, detail, available;
  try {
    const beforeLogin = cloudIdentity(); owner = await cloudReadState.open();
    if (beforeLogin !== owner && dialog.open) epoch = ++viewEpoch;
    if (epoch !== viewEpoch || !dialog.open) return;
    current = library;
    const active = () => epoch === viewEpoch && dialog.open && owner === cloudIdentity();
    void refreshLocalFigures().catch(() => {});
    const reusable = !!allowCache && !source && ['initial', 'figures', 'libraries'].includes(area);
    if (reusable) {
      const saved = await cloudReadState.cached(owner, library);
      available = cached = saved.state; detail = saved.detail;
      if (!active()) return;
      if (cached && (!library || detail)) {
        const sameView = renderedView?.owner === owner && renderedView.area === (area === 'initial' ? 'figures' : area) && renderedView.library === library;
        if (!sameView) { state = cached.value; displayedOwner = owner; await renderCloud(library, detail?.value); }
        if (!active()) return;
        if (!saved.online) { cacheStatus(`Offline – ${lastStand(cached.updatedAt)}`); return; }
        if (allowCache !== 'refresh' && saved.fresh) { cacheStatus(''); maintainCloud(owner, state.me); return; }
      } else cached = null;
    }
    cacheStatus(cached ? 'Änderungen werden geladen …' : 'Cloud-Inhalte werden geladen …');
    const { snapshot, detail: freshDetail } = await cloudReadState.refresh(owner, library, { available, force: allowCache === 'refresh', onAccessChanged: () => {
      if (active()) { cancelThumbnails(); clearPreviews(body); body.replaceChildren(); renderedView = null; state = null; displayedOwner = null; cached = null; }
    } });
    if (!active()) return;
    // Do not interrupt a form, an active download, expanded history or a video preview.
    const editing = !snapshot.accessChanged && (libraryEditing || libraryDraft?.dirty() || cached && (busy || allowCache !== 'refresh' && body.querySelector('details[open], video, form input:focus, form textarea:focus, input[type=checkbox]:not(:checked)')));
    const changed = allowCache === 'refresh' || !cached || JSON.stringify(contentState(state)) !== JSON.stringify(contentState(snapshot.value)) || library && JSON.stringify(detail?.value) !== JSON.stringify(freshDetail?.value);
    if (!editing && changed) {
      const scroll = cached ? body.scrollTop : 0;
      state = snapshot.value; displayedOwner = owner;
      await renderCloud(library, freshDetail?.value); body.scrollTop = scroll;
    }
    if (active() && !busy) { errorBox.hidden = true; cacheStatus(editing && changed ? 'Änderungen geladen – bitte nach Abschluss deines Vorgangs aktualisieren.' : 'Alles aktuell', !editing); }
    maintainCloud(owner, snapshot.value.me);
  } catch (error) {
    if (epoch !== viewEpoch || !dialog.open || owner && owner !== cloudIdentity()) return;
    if (error.cacheCleared && owner) {
      if (epoch !== viewEpoch || !dialog.open || owner !== cloudIdentity()) return;
      cancelThumbnails(); clearPreviews(body); body.replaceChildren(); state = null; displayedOwner = null; cached = null;
    }
    if (cached) cacheStatus(`Aktualisierung nicht möglich – letzter geladener Stand wird angezeigt. ${lastStand(cached.updatedAt)}`);
    else { cacheStatus(''); report(error); if (!body.childElementCount) body.append(action('Erneut versuchen', () => load(library, true))); }
  }
}
async function renderCloud(library, detail) {
  libraryDraft = null;
  current = library; localUpdates = [];
  for (const f of state.own_figures ?? []) for (const rev of f.revisions ?? []) localIndex.observe(rev);
  if (area === 'initial' || area === 'figures' && !source && !hasOwnArea(state)) area = initialArea(state);
  renderedView = { owner: cloudIdentity(), area, library };
  if (!state.me && !['figures', 'libraries'].includes(area)) area = 'libraries';
  cancelThumbnails(); clearPreviews(body); body.replaceChildren();
  posterView = createPosterView(body, state.me);
  loginTrigger.hidden = !!state.me; if (state.me) dismissLogin();
  const toolbar = node('div', undefined, 'cloud-tabs');
  toolbar.setAttribute('aria-label', 'Cloud-Bereiche');
  for (const [key, label] of [...(hasOwnArea(state) ? [['figures', 'Meine Figuren']] : []), ['libraries', 'Bibliotheken']]) {
    const button = action(label, () => navigate(key)); if (key === 'figures') button.setAttribute('aria-label', 'Meine Cloud-Figuren'); button.setAttribute('aria-pressed', String(!source && (current ? key === 'libraries' : area === key || (area === 'create' && key === 'libraries')))); toolbar.append(button);
  }
  const utilities = node('div', undefined, 'cloud-utilities');
  if (state.me?.is_admin) utilities.append(action('Plattformverwaltung', () => navigate('admin')));
  utilities.append(action('Aktualisieren', () => load(current, 'refresh')));
  if (signedIn()) utilities.append(action('Abmelden', async () => { if (!await leaveLibraryDraft()) return; await logout(); await run('Laden …', () => load(null)); }));
  if (state.me) body.append(toolbar, utilities);
  if (state.me?.is_admin) body.append(node('p', 'Plattform-Administrator', 'cloud-role-badge'));
  if (state.me) body.append(node('p', `${state.me.email} · ${MB(state.me.used)} / ${MB(state.me.quota)} belegt${state.me.upload_enabled ? '' : ' · Lesen erlaubt, Uploads gesperrt'}`, 'cloud-account'));
  else {
    if (current) {
      await libraryView(current, detail);
    }
    else publicLibraries();
    return;
  }
  if (source) { await publishForm(); return; }
  if (current) { await libraryView(current, detail); return; }
  if (area === 'create') { libraryForm(); return; }
  if (area === 'figures') {
    if (!state.me.upload_enabled) body.append(node('p', 'Uploads sind für dein Konto deaktiviert. Vorhandene Cloud-Figuren bleiben erreichbar und lokal übernehmbar.', 'cloud-person-notice'));
    body.append(node('h3', 'Meine Cloud-Figuren'), node('p', 'Alle deine hochgeladenen Figuren – auch ohne Bibliothekszuordnung. Eine Figur kann in mehreren Bibliotheken verwendet werden.'));
    ownFigures(); return;
  }
  if (area === 'admin' && state.me?.is_admin) { adminForm(); return; }
  body.append(node('h3', 'Bibliotheken'));
  if (state.me?.upload_enabled) { const create = action('Bibliothek erstellen', () => navigate('create')); create.className = 'primary'; body.append(create); }
  for (const lib of state.libraries) {
    const box = libraryCard(lib); if (lib.owner_id === state.me?.id) box.append(node('p', 'Besitzer · Bibliothek verwalten', 'cloud-role-badge')); else if (lib.manage) box.append(node('p', 'Plattform-Administrator · Bibliothek verwalten', 'cloud-role-badge')); else if (lib.contribute) box.append(node('p', 'Mitwirkender', 'cloud-role-badge')); else box.append(node('p', 'Lesen', 'cloud-role-badge')); box.append(node('p', `${lib.visibility === 'public' ? 'Öffentlich' : 'Privat'} · ${lib.collaborative ? 'Mitwirkende erlaubt' : 'Nur Besitzer'} · ${lib.moderated ? 'Mit Freigabe' : 'Sofort veröffentlichen'}`));
  }
  if (!state.libraries.length) body.append(node('p', 'Noch keine zugänglichen Bibliotheken.'));

}
function libraryForm(lib = null, order = null) {
  const box = section(lib ? 'Bibliothek einstellen' : 'Bibliothek erstellen'), form = node('form'); box.append(form);
  const title = field(form, 'Name', lib?.title ?? ''), description = field(form, 'Beschreibung', lib?.description ?? '', 'textarea'); title.required = true; title.maxLength = 160;
  const visibility = select(form, 'Sichtbarkeit', [['private', 'Privat'], ['public', 'Öffentlich']], lib?.visibility ?? 'private');
  const collaborative = checkbox(form, 'Eingeladene Mitwirkende dürfen beitragen', lib?.collaborative ?? false), moderated = checkbox(form, 'Beiträge zuerst freigeben', lib?.moderated ?? true);
  const save = () => {
    if (!form.reportValidity()) return;
    return run('Speichern …', async () => {
      try {
        const result = await cloudCall('library_save', { id: lib?.id, title: title.value, description: description.value, visibility: visibility.value, collaborative: collaborative.checked, moderated: moderated.checked, ...(order ? { order: order.ids, expected_version: lib.edit_version } : {}) });
        libraryDraft = null; await load(result.id);
      } catch (error) {
        if (error.status === 409 || error.code === 'PT409' || /inzwischen geändert|neu laden/i.test(error.message)) {
          if (!box.querySelector('[data-order-reload]')) {
            const reload = action('Aktuellen Stand neu laden', async () => {
              if (await hooks.confirm({ title: 'Aktuellen Stand laden?', message: 'Deine ungespeicherten Änderungen werden verworfen.', ok: 'Neu laden' })) { libraryDraft = null; await load(lib.id, 'refresh'); }
            }); reload.dataset.orderReload = 'true'; box.append(reload);
          }
        }
        throw error;
      }
    });
  };
  form.append(action('Bibliothek speichern', save));
  if (order) {
    let formDirty = false;
    form.addEventListener('input', () => { formDirty = true; });
    form.addEventListener('change', () => { formDirty = true; });
    libraryDraft = { dirty: () => order.dirty || formDirty, save };
  }
  if (!lib) form.append(action('Abbrechen', () => navigate('libraries')));
  form.onsubmit = event => event.preventDefault();
}
function libraryShare(id, lib) {
  const box = section('Bibliothek teilen'); box.classList.add('cloud-library-share');
  box.append(node('p', lib.visibility === 'public' ? 'Dieser Link ist ohne Anmeldung lesbar.' : 'Zum Öffnen sind Anmeldung und Bibliotheksberechtigung erforderlich.'));
  const share = new URL('https://rodriges17.github.io/SalsaAppCloud/'); share.searchParams.set('library', id);
  const row = node('div', undefined, 'cloud-library-link'); const link = field(row, 'Bibliothekslink', share.href); link.readOnly = true;
  row.append(action('Link kopieren', async () => {
    try { await navigator.clipboard.writeText(link.value); }
    catch { link.focus(); link.select(); report(new Error('Bitte den markierten Link kopieren.')); }
  })); box.append(row);
}
async function libraryView(id, detail) {
  lastLibraryDetail = detail;
  for (const entry of detail.entries) localIndex.observe(entry.published ?? entry.pending);
  const lib = detail.library, manage = !!state.me && !!detail.manage;
  if (libraryEditing?.id === id && manage) { renderLibraryEditor(id, detail); return; }
  libraryEditing = null;
  const back = action('< Zurück zu allen Bibliotheken', () => navigate('libraries')); back.className = 'cloud-public-back'; body.append(back);
  const intro = section(lib.title); intro.classList.add('cloud-library-hero');
  const title = intro.querySelector('h3'); title.className = 'cloud-library-title';
  intro.prepend(node('p', lib.visibility === 'public' ? 'Öffentliche Bibliothek' : 'Private Bibliothek', 'cloud-library-eyebrow'));
  if (manage) {
    const edit = action('Bibliothek bearbeiten', () => {
      libraryEditing = { id, detail, model: createLibraryDraft(lib, detail.entries), tab: 'figures' };
      return renderCloud(id, detail);
    }); edit.className = 'cloud-library-edit'; title.after(edit);
  }
  if (lib.description) intro.append(node('p', lib.description, 'cloud-library-description'));
  intro.append(node('p', `${detail.entries.length} Figuren${manage ? lib.owner_id === state.me.id ? ' · Besitzer' : ' · Plattform-Administrator' : ''}`, 'cloud-library-meta'));
  libraryDownloadControls(intro, detail.entries);
  const entriesBox = node('div', undefined, 'cloud-library-entries cloud-library-compact'); body.append(entriesBox);
  entriesBox.setAttribute('aria-label', 'Figuren in Bibliotheksreihenfolge');
  for (const [index, entry] of detail.entries.entries()) {
    const rev = entry.published ?? entry.pending, box = node('details', undefined, 'cloud-library-figure'); box.dataset.libraryFigure = entry.figure_id;
    const summary = node('summary', undefined, 'cloud-library-summary');
    summary.append(node('span', String(index + 1), 'cloud-order-number'));
    const picture = node('span', undefined, 'cloud-library-picture'); if (rev?.videos?.length) thumbnail(picture, rev); summary.append(picture);
    summary.append(node('h3', rev?.title ?? 'Noch nicht veröffentlicht'));
    const availability = node('span', undefined, 'cloud-library-availability');
    const update = () => {
      const local = localIndex.resolve(rev, localFigures, { figureId: entry.figure_id });
      cloudStatusLabel(availability, local.label, local.modified);
      availability.dataset.local = String(local.available); availability.title = local.detail ?? local.label;
    }; localUpdates.push(update); update(); summary.append(availability);
    box.append(summary); const content = node('div', undefined, 'cloud-library-content'); box.append(content); let mounted = false;
    box.ontoggle = () => {
      if (!box.open) { clearPreviews(content); return; }
      for (const other of entriesBox.querySelectorAll('details[open]')) if (other !== box) other.open = false;
      if (!mounted) {
        mounted = true;
        if (entry.published) revisionCard(content, { ...entry.published, figure_id: entry.figure_id }, 'Aktuelle Figur', rev.title, true);
        if (entry.pending && entry.pending.id !== entry.published?.id) revisionCard(content, { ...entry.pending, figure_id: entry.figure_id }, 'Zur Freigabe', rev.title, true);
        if (!entry.published && entry.pending) content.append(node('p', 'Diese Figur ist noch nicht für Besucher freigegeben.'));
      }
    };
    entriesBox.append(box);
    if (savedLibraryFigure === entry.figure_id) { box.open = true; savedLibraryFigure = null; }
  }
  if (!detail.entries.length) entriesBox.append(node('p', 'Noch keine sichtbaren Figuren in dieser Bibliothek.'));
  libraryShare(id, lib);
}
function renderLibraryEditor(id, detail) {
  const editor = libraryEditing, model = editor.model, lib = detail.library;
  const head = section('Bibliothek bearbeiten'); head.classList.add('cloud-library-editor-heading');
  head.append(node('p', 'Änderungen werden erst mit „Bibliothek speichern“ übernommen.'));
  const tabs = node('div', undefined, 'cloud-library-editor-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Bibliothek bearbeiten');
  const figures = node('div'), settings = node('div');
  const figureTab = action(`Figuren (${model.ids.length})`, () => chooseTab('figures')), settingsTab = action('Einstellungen', () => chooseTab('settings'));
  figureTab.setAttribute('role', 'tab'); settingsTab.setAttribute('role', 'tab');
  function chooseTab(tab) { editor.tab = tab; figures.hidden = tab !== 'figures'; settings.hidden = tab !== 'settings'; figureTab.setAttribute('aria-selected', String(tab === 'figures')); settingsTab.setAttribute('aria-selected', String(tab === 'settings')); }
  tabs.append(figureTab, settingsTab); body.append(tabs, figures, settings);
  const toolbar = node('div', undefined, 'cloud-library-editor-toolbar'); toolbar.append(node('h3', 'Figuren verwalten'));
  if (state.me.upload_enabled) toolbar.append(action('Figuren hinzufügen', () => libraryAddPicker(editor))); figures.append(toolbar);
  figures.append(node('p', 'Neue Figuren erscheinen am Ende. Am Griff ziehen oder mit den Pfeilen verschieben.', 'cloud-library-order-help'));
  const list = node('div', undefined, 'cloud-library-entries cloud-library-editor-list'); figures.append(list);
  const dirtyText = node('p', undefined, 'cloud-library-dirty'); dirtyText.setAttribute('role', 'status');
  const drawRows = () => {
    list.replaceChildren();
    const entries = model.ids.map(fid => model.known.get(fid));
    const ordering = mountLibraryOrder(list, entries, { manage: true, node, action, order: model, changed: () => { dirtyText.textContent = model.dirty ? 'Ungespeicherte Änderungen' : 'Noch keine Änderungen'; } });
    for (const entry of entries) {
      const rev = entry.published ?? entry.pending, card = node('article', undefined, 'cloud-library-editor-row');
      card.append(node('h3', rev?.title ?? 'Figur')); ordering.add(entry, card);
      const remove = action('×', () => { model.remove(entry.figure_id); drawRows(); figureTab.textContent = `Figuren (${model.ids.length})`; }); remove.setAttribute('aria-label', 'Aus Bibliothek entfernen'); remove.title = 'Aus Bibliothek entfernen'; card.append(remove);
      if (entry.pending) card.append(action('Freigeben', () => run('Freigeben …', async () => {
        if (model.dirty) throw new Error('Bitte zuerst die Bibliothek speichern, bevor du Beiträge freigibst.');
        await cloudCall('review', { library: id, figure: entry.figure_id, accept: true }); libraryEditing = null; libraryDraft = null; await load(id);
      })));
    }
    if (!entries.length) list.append(node('p', 'Noch keine Figuren. Füge Cloud-Figuren hinzu.'));
    list.append(ordering.announce);
  };
  const form = node('form'); form.className = 'cloud-card cloud-library-settings'; form.onsubmit = e => e.preventDefault(); settings.append(form);
  const name = field(form, 'Name', model.data.title); name.required = true; name.maxLength = 160;
  const description = field(form, 'Beschreibung', model.data.description, 'textarea');
  const visibility = select(form, 'Sichtbarkeit', [['private', 'Privat'], ['public', 'Öffentlich']], model.data.visibility);
  const collaborative = checkbox(form, 'Eingeladene Mitwirkende dürfen beitragen', model.data.collaborative), moderated = checkbox(form, 'Beiträge zuerst freigeben', model.data.moderated);
  const sync = () => { Object.assign(model.data, { title: name.value, description: description.value, visibility: visibility.value, collaborative: collaborative.checked, moderated: moderated.checked }); dirtyText.textContent = model.dirty ? 'Ungespeicherte Änderungen' : 'Noch keine Änderungen'; };
  form.addEventListener('input', sync); form.addEventListener('change', sync);
  const memberBox = section('Mitglieder & Zugriff', settings);
  createMemberView({ box: memberBox, lib, members: detail.members, me: state.me, people: state.people ?? [], node, action, field, select, call: cloudCall, run: async (...args) => { if (await leaveLibraryDraft()) return run(...args); }, confirm: options => hooks.confirm(options), refresh: async () => { const fresh = await cloudCall('library', { id }); editor.detail = fresh; editor.model = createLibraryDraft(fresh.library, fresh.entries); editor.tab = 'settings'; libraryEditing = editor; await renderCloud(id, fresh); } });
  const danger = section('Gefahrenbereich', settings); danger.classList.add('danger-zone');
  danger.append(node('p', 'Die Bibliothek und ihre Mitgliedschaften werden entfernt. Cloud-Figuren, Videos und lokale Kopien bleiben erhalten.'));
  danger.append(action('Bibliothek löschen', async () => {
    if (!await leaveLibraryDraft()) return;
    if (await hooks.confirm({ title: `Bibliothek „${lib.title}“ löschen?`, message: 'Cloud-Figuren, Videos und lokale Kopien bleiben erhalten.', ok: 'Bibliothek löschen', destructive: true })) {
      libraryEditing = null; libraryDraft = null; await run('Löschen …', async () => { await cloudCall('library_delete', { id }); area = 'libraries'; await load(null); });
    }
  }));
  const conflict = node('div', undefined, 'cloud-library-conflict'); conflict.hidden = true; conflict.setAttribute('role', 'alert');
  conflict.append(node('p', 'Die Bibliothek wurde inzwischen geändert. Dein Entwurf wurde nicht gespeichert.'), action('Aktuellen Stand neu laden', async () => {
    if (await hooks.confirm({ title: 'Aktuellen Stand laden?', message: 'Deine ungespeicherten Bibliotheksänderungen werden verworfen. Hochgeladene Cloud-Figuren bleiben erhalten.', ok: 'Neu laden' })) { libraryEditing = null; libraryDraft = null; await load(id, 'refresh'); }
  })); body.append(conflict);
  const save = () => run('Bibliothek speichern …', async () => {
    sync();
    if (!model.data.title.trim()) { chooseTab('settings'); name.reportValidity(); return; }
    try { await cloudCall('library_commit', model.payload()); libraryEditing = null; libraryDraft = null; source = null; libraryUpload = null; await load(id); }
    catch (error) { if (/inzwischen geändert|neu laden/i.test(error.message) || error.status === 409) conflict.hidden = false; throw error; }
  });
  libraryDraft = { dirty: () => model.dirty, save };
  const footer = node('div', undefined, 'cloud-library-editor-footer'); footer.append(dirtyText, action('Abbrechen', async () => { if (await leaveLibraryDraft()) { libraryEditing = null; libraryDraft = null; await renderCloud(id, lastLibraryDetail); } }), action('Bibliothek speichern', save)); footer.lastChild.className = 'primary'; body.append(footer);
  editor.redraw = () => { drawRows(); figureTab.textContent = `Figuren (${model.ids.length})`; };
  drawRows(); chooseTab(editor.tab);
}
function libraryAddPicker(editor) {
  const picker = node('dialog', undefined, 'cloud-library-picker'); picker.append(node('h3', 'Figuren hinzufügen'), node('p', 'Aus Meine Cloud-Figuren auswählen. Neue Zuordnungen werden erst beim Speichern übernommen.'));
  const candidates = state.own_figures.filter(f => f.revisions?.length && !f.deleted_at), choices = [];
  for (const f of candidates) {
    const check = checkbox(picker, f.revisions[0].title, editor.model.ids.includes(f.id)); check.disabled = editor.model.ids.includes(f.id); choices.push([check, f]);
    if (check.disabled) check.parentElement.append(node('small', 'Bereits enthalten'));
    else if (editor.model.data.visibility === 'public' && !f.public_allowed) { check.disabled = true; check.parentElement.append(node('small', 'Öffentliche Freigabe fehlt')); }
  }
  if (!candidates.length) picker.append(node('p', 'Noch keine eigenen Cloud-Figuren. Lade zuerst eine lokale Figur hoch.'));
  picker.append(action('Neue Figur hochladen', () => { picker.close(); picker.remove(); libraryUploadPicker(editor); }));
  picker.append(action('Abbrechen', () => { picker.close(); picker.remove(); }), action('Auswahl hinzufügen', () => {
    for (const [check, f] of choices) if (check.checked && !check.disabled) editor.model.add(f);
    picker.close(); picker.remove(); editor.redraw();
  })); picker.addEventListener('close', () => picker.remove(), { once: true }); document.body.append(picker); picker.showModal();
}
async function libraryUploadPicker(editor) {
  const picker = node('dialog', undefined, 'cloud-library-picker'); picker.append(node('h3', 'Lokale Figur hochladen'), node('p', 'Die Figur wird in Meine Cloud-Figuren gespeichert. Ihre Bibliothekszuordnung bleibt bis zum Speichern ein Entwurf.'));
  const local = await hooks.localFigures();
  for (const f of local.filter(f => !f.storageProblem && !f.folderAccessRequired)) picker.append(action(f.title, async () => {
    picker.close(); picker.remove(); libraryUpload = { editor, hook: libraryDraft };
    libraryEditing = null; libraryDraft = null; source = f; area = 'figures'; await renderCloud(null);
  }));
  if (!local.length) picker.append(node('p', 'Erstelle oder importiere zuerst eine Figur unter Meine Figuren.'));
  picker.append(action('Abbrechen', () => { picker.close(); picker.remove(); })); picker.addEventListener('close', () => picker.remove(), { once: true }); document.body.append(picker); picker.showModal();
}
async function resumeLibraryUpload(result = null) {
  const suspended = libraryUpload; if (!suspended) return;
  const fresh = await cloudCall('state'); state = fresh;
  if (result) { const f = state.own_figures.find(f => f.id === result.figure); if (f) suspended.editor.model.add(f); }
  libraryUpload = null; source = null; area = 'libraries'; libraryEditing = suspended.editor;
  await renderCloud(libraryEditing.id, libraryEditing.detail);
}
function libraryDownloadControls(parent, entries) {
  const revisions = [...new Map(entries.filter(entry => entry.published?.videos?.length).map(entry => [entry.published.id, { ...entry.published, figure_id: entry.figure_id }])).values()];
  if (!revisions.length) return;
  const box = node('div', undefined, 'cloud-library-download');
  const resultText = node('p', undefined, 'cloud-library-download-result'); resultText.setAttribute('role', 'status'); resultText.hidden = true;
  const failures = node('ul'); failures.hidden = true;
  const progress = node('progress'); progress.setAttribute('aria-label', 'Bibliothek lokal verfügbar machen'); progress.hidden = true;
  const start = action('Alle Figuren lokal verfügbar machen', () => run('Lokalen Bestand prüfen …', async () => {
    if (libraryDraft?.dirty()) throw new Error('Bitte zuerst die Bibliothek speichern, bevor du alle Figuren lokal verfügbar machst.');
    const settings = await storageSettings();
    if (settings.activeFolder && settings.folders.find(folder => folder.id === settings.activeFolder)?.access !== 'granted') throw new Error('Bitte den gewählten Geräteordner in den Einstellungen freigeben, bevor du die Bibliothek herunterlädst.');
    controller = new AbortController(); const signal = controller.signal;
    const cancel = document.getElementById('cloudCancelUpload'); cancel.textContent = 'Download abbrechen'; cancel.hidden = false;
    progress.hidden = false; progress.max = revisions.length; progress.value = 0; resultText.hidden = false; failures.replaceChildren(); failures.hidden = true;
    try {
      const result = await downloadLibrary(revisions, {
        listFigures, readMedia: figureMedia, readCloudMedia: cloudMediaHash, confirmReplace: figure => hooks.confirm({ title: 'Lokale Änderungen überschreiben?', message: `„${figure.title}“ wurde lokal geändert. Mit der Cloud-Version überschreiben?`, ok: 'Mit Cloud-Version überschreiben' }), inspectVideo: inspectCloudVideo, saveFigure,
        async fetchVideo(revision, video, signal) {
          const signed = await cloudCall('media_url', { revision: revision.id, media: video.id }); signal.throwIfAborted();
          const response = await fetch(signed.url, { signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]) });
          if (!response.ok) throw new Error('Video konnte nicht geladen werden. Bitte erneut versuchen.');
          const blob = await response.blob(); return blob.slice(0, blob.size, video.type);
        },
        async readPoster(revision) {
          const cached = await readCloudCache(cloudIdentity(), `poster:${revision.id}:${revision.created_at ?? ''}`);
          if (cached?.value.bytes) return new Blob([cached.value.bytes], { type: 'image/jpeg' });
          const value = await cloudCall('poster_get', { revision: revision.id });
          return value.poster ? new Blob([Uint8Array.from(atob(value.poster), character => character.charCodeAt(0))], { type: 'image/jpeg' }) : null;
        }
      }, { signal, targetFolder: settings.activeFolder ?? null, progress: state => {
        progress.value = state.done;
        const phase = { index: 'Lokalen Bestand prüfen', check: 'Vorhandene Videos prüfen', download: `Video ${state.video} von ${state.videos} laden`, save: 'Figur speichern', saved: 'Figur gespeichert', skip: 'Bereits vorhanden', error: 'Figur konnte nicht gespeichert werden', done: 'Abgeschlossen', cancelled: 'Abgebrochen' }[state.phase];
        resultText.textContent = `${phase}${state.title ? `: ${state.title}` : ''} · ${state.done} / ${state.total} Figuren`;
        statusBox.textContent = resultText.textContent;
      } });
      resultText.textContent = `${result.cancelled ? 'Abgebrochen' : 'Fertig'}: ${result.saved} gespeichert · ${result.skipped} bereits vorhanden${result.failed.length ? ` · ${result.failed.length} fehlgeschlagen` : ''}.`;
      if (result.failed.length) { failures.hidden = false; result.failed.forEach(error => failures.append(node('li', `${error.title}: ${error.message}`))); }
      if (result.remaining) resultText.textContent += ` ${result.remaining} Figuren noch offen.`;
      if (result.cancelled || result.failed.length) resultText.textContent += ' Erneut starten lädt nur die noch fehlenden Figuren.';
      await hooks.localChanged?.();
      await refreshLocalFigures();
    } finally { controller = null; cancel.hidden = true; cancel.textContent = 'Upload abbrechen'; progress.hidden = true; }
  }));
  start.className = 'primary';
  box.append(start, node('p', 'Alle veröffentlichten Figuren direkt im gewählten lokalen Speicher sichern. Vorhandene Videos werden wiederverwendet; bestehende Lernstände und Notizen bleiben erhalten.'), progress, resultText, failures);
  parent.append(box);
}
function versionLabel(revision) {
  const date = new Date(revision.created_at);
  return Number.isFinite(date.getTime()) ? `Stand vom ${date.toLocaleString('de', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Version ohne Datumsangabe';
}
function clearPreviews(root) { root.querySelectorAll('video').forEach(player => { player.pause(); player.removeAttribute('src'); player.load(); player.remove(); }); }
async function previewVideo(box, revision, video) {
  const signed = await cloudCall('media_url', { revision: revision.id, media: video.id });
  if (!box.isConnected || box.closest('details')?.open === false) return;
  clearPreviews(box);
  const player = node('video'); player.controls = true; player.playsInline = true; player.src = signed.url; box.append(player);
}
function revisionCard(parent, rev, label, parentTitle = parent.querySelector('h3')?.textContent, compact = false) {
  const box = node('article', undefined, 'cloud-revision'), heading = node('div', undefined, 'revision-heading');
  const copy = node('div'); copy.append(node('h4', label), node('p', versionLabel(rev))); heading.append(copy);
  if (!compact && rev.videos?.[0]) thumbnail(heading, rev);
  box.append(heading);
  if (rev.title !== parentTitle) box.append(node('p', rev.title, 'revision-title'));
  parent.append(box);
  box.append(node('p', rev.description), node('p', rev.tags.join(' · ')));
  downloadControls(box, rev);
}
function downloadControls(box, rev, { own = false, revisionIds = [rev.id] } = {}) {
  if (!rev.videos.length) return;
  const chosen = [], localLabels = [], multiple = rev.videos.length > 1;
  const localStatus = node('p', '', 'cloud-local-status'); localStatus.hidden = true; localStatus.setAttribute('role', 'status');
  box.firstElementChild?.after(localStatus);
  const choiceHeading = multiple ? node('h4', 'Videos zum Herunterladen auswählen') : null; if (choiceHeading) box.append(choiceHeading);
  for (const v of rev.videos) {
    const label = `${v.name || 'Video'} · ${MB(v.size)}`;
    const check = multiple ? checkbox(box, label, true) : null;
    const localLabel = node('p', label); box.append(localLabel); localLabel.hidden = multiple; localLabels.push(localLabel);
    chosen.push([check, v]);
    box.append(action(`Video: ${v.name || 'Ohne Namen'}`, () => previewVideo(box, rev, v)));
  }
  const fingerprint = selected => `cloud:${rev.id}:${selected.map(v => v.id).join(',')}`;
  const label = own ? 'Lokal übernehmen' : multiple ? 'Ausgewählte Videos in meine Figuren übernehmen' : 'In meine Figuren übernehmen';
  const download = async (replace = false) => {
    await refreshLocalFigures();
    const linked = localIndex.resolve(rev, localFigures, { revisionIds }).current;
    if (linked && !replace) {
      const saved = await run('Angaben ergänzen …', () => enrichCloudMetadata(linked, rev, { readMedia: figureMedia, saveFigure }));
      if (!saved) return;
      await hooks.localChanged?.(); await close(); if (!dialog.open) return hooks.openLocal?.(saved); return;
    }
    return run('Videos herunterladen …', async () => {
    if (libraryDraft?.dirty()) throw new Error('Bitte zuerst die Bibliothek speichern, bevor du eine Figur übernimmst.');
    const selected = chosen.filter(([check]) => !check || check.checked).map(([, v]) => v);
    if (!selected.length) throw new Error('Bitte mindestens ein Video auswählen.');
    if (selected.reduce((n, v) => n + v.size, 0) > 250 * 1024 * 1024) throw new Error('Bitte weniger Videos wählen: maximal 250 MB pro Übernahme.');
    const resolved = localIndex.resolve(rev, localFigures, { revisionIds });
    const target = resolved.figure && !resolved.modified ? { figure: resolved.figure } : await hooks.chooseImport({ title: rev.title, fingerprint: fingerprint(selected), revisionIds, figureId: rev.figure_id });
    if (!target) return;
    const settings = await storageSettings();
    if (!target.figure && settings.activeFolder && settings.folders.find(folder => folder.id === settings.activeFolder)?.access !== 'granted') throw new Error('Bitte den gewählten Geräteordner in den Einstellungen freigeben.');
    controller = new AbortController(); const signal = controller.signal;
    const cancel = document.getElementById('cloudCancelUpload'); cancel.textContent = 'Download abbrechen'; cancel.hidden = false;
    try {
      await downloadFigure({ ...rev, videos: selected }, {
        listFigures, readMedia: figureMedia, readCloudMedia: cloudMediaHash, confirmReplace: figure => hooks.confirm({ title: 'Lokale Änderungen überschreiben?', message: `„${figure.title}“ wurde lokal geändert. Mit der Cloud-Version überschreiben?`, ok: 'Mit Cloud-Version überschreiben' }), inspectVideo: inspectCloudVideo, saveFigure,
        async fetchVideo(revision, video, signal) {
          const signed = await cloudCall('media_url', { revision: revision.id, media: video.id }); signal.throwIfAborted();
          const response = await fetch(signed.url, { signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]) });
          if (!response.ok) throw new Error('Video konnte nicht geladen werden. Bitte erneut versuchen.');
          const blob = await response.blob(); return blob.slice(0, blob.size, video.type);
        },
        async readPoster(revision) {
          const cached = await readCloudCache(cloudIdentity(), `poster:${revision.id}:${revision.created_at ?? ''}`);
          if (cached?.value.bytes) return new Blob([cached.value.bytes], { type: 'image/jpeg' });
          const value = await cloudCall('poster_get', { revision: revision.id });
          return value.poster ? new Blob([Uint8Array.from(atob(value.poster), character => character.charCodeAt(0))], { type: 'image/jpeg' }) : null;
        }
      }, { signal, target: target.figure ?? null, targetFolder: settings.activeFolder ?? null, progress: text => { statusBox.textContent = text; } });
      await hooks.localChanged?.();
      busy = false; close(); hooks.localSaved?.();
    } finally { controller = null; cancel.hidden = true; cancel.textContent = 'Upload abbrechen'; }

  });
  };
  const take = action(label, () => download());
  // Keep recovery available when files were removed or modified outside the app.
  const repair = action('Cloud-Version übernehmen', () => download(true)); repair.className = 'subtle'; repair.hidden = true;
  if (own) take.className = 'primary';
  const openOlder = action('Ältere lokale Figur öffnen', async () => {
    await refreshLocalFigures();
    const local = localIndex.resolve(rev, localFigures, { revisionIds });
    if (local.kind !== 'outdated' || !local.figure) return;
    await close(); if (!dialog.open) hooks.openLocal?.(local.figure);
  }); openOlder.hidden = true;
  box.append(take, repair, openOlder);
  const update = () => {
    const local = localIndex.resolve(rev, localFigures, { revisionIds });
    const accessRequired = local.kind === 'access-required';
    localStatus.hidden = local.available || local.kind === 'cloud';
    localStatus.dataset.accessRequired = String(accessRequired);
    cloudStatusLabel(localStatus, local.label, local.modified);
    localStatus.dataset.modified = String(local.modified); localStatus.title = local.detail;
    if (choiceHeading) choiceHeading.hidden = local.available;
    chosen.forEach(([check], index) => {
      if (check) check.parentElement.hidden = local.available;
      localLabels[index].hidden = multiple && !local.available;
    });
    take.textContent = local.available ? 'Lokale Figur öffnen' : label;
    take.disabled = accessRequired;
    repair.hidden = !local.modified;
    take.title = local.available ? 'Die zugehörige lokale Figur öffnen.' : '';
    openOlder.hidden = local.kind !== 'outdated';

  };
  chosen.forEach(([check]) => { if (check) check.onchange = update; }); localUpdates.push(update); update();
}
async function attachForm(revision) {
  if (!await leaveLibraryDraft()) return;
  viewEpoch++; renderedView = null;
  cancelThumbnails(); clearPreviews(body); body.replaceChildren();
  body.append(action('Zurück zu Meine Cloud-Figuren', () => navigate('figures')));
  const box = section(`„${revision.title}“ zuordnen`);
  box.append(node('p', versionLabel(revision)));
  focusSection(box);
  const libs = state.libraries.filter(l => l.contribute);
  if (!libs.length) { box.append(node('p', 'Keine Bibliothek mit Beitragsberechtigung. Erstelle eine Bibliothek oder lass dich zum Mitwirken einladen.')); if (state.me?.upload_enabled) box.append(action('Bibliothek erstellen', () => navigate('create'))); return; }
  const choice = select(box, 'Zielbibliothek', libs.map(l => [l.id, l.title]));
  box.append(action('Figur zuordnen', () => run('Zuordnen …', async () => { await cloudCall('attach', { library: choice.value, revision: revision.id }); await load(choice.value); })));
}
let posterView;
let localFigures = [];
function cancelThumbnails() { posterView?.dispose(); posterView = null; }
function thumbnail(heading, revision) { posterView?.add(heading, revision); }
function variantButton(box, revision) {
  box.append(action('Eigene Variante erstellen', async () => {
    if (!await leaveLibraryDraft()) return;
    if (!await hooks.confirm({ title: 'Eigene Variante erstellen?', message: 'Die Variante ist unabhängig bearbeitbar. Vorhandene Videos und Bilder werden ohne zusätzliche Dateikopie referenziert.', ok: 'Variante erstellen' })) return;
    await run('Variante erstellen …', async () => { await cloudCall('variant', { revision: revision.id }); area = 'figures'; await load(null); });
  }));
}
let savedLibraryFigure = null;
let ownFigureSelection = { id: null, tab: 'videos', owner: null };
function ownFigures() {
  if (ownFigureSelection.owner !== state.me?.id) ownFigureSelection = { id: null, tab: 'videos', owner: state.me?.id };
  if (!state.own_figures.some(f => f.id === ownFigureSelection.id)) ownFigureSelection.id = null;
  if (!state.own_figures.length) body.append(node('p', 'Noch keine eigenen Cloud-Figuren. Lade eine lokale Figur über „In Cloud veröffentlichen“ hoch.'));
  const list = node('div', undefined, 'cloud-own-list'); body.append(list);
  for (const f of state.own_figures) {
    const revisions = [...f.revisions].sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
    const latest = revisions[0], card = node('details', undefined, 'cloud-own-figure'); card.dataset.ownFigure = f.id;
    const summary = node('summary', undefined, 'cloud-own-summary');
    const picture = node('span', undefined, 'cloud-library-picture'); if (latest?.videos?.length) thumbnail(picture, latest);
    const name = node('div', undefined, 'cloud-own-name'); name.append(node('h3', latest?.title ?? 'Noch nicht fertig hochgeladene Figur'));
    name.append(node('small', `${latest?.videos?.length ?? 0} Video${latest?.videos?.length === 1 ? '' : 's'} · ${f.public_allowed ? 'Öffentliche Freigabe erlaubt' : 'Privat verwendbar'}`));
    const availability = node('span', undefined, 'cloud-own-availability');
    const update = () => {
      const local = localIndex.resolve(latest, localFigures, { figureId: f.id, revisionIds: revisions.map(rev => rev.id) });
      cloudStatusLabel(availability, local.label, local.modified);
      availability.dataset.local = String(local.available); availability.title = local.detail ?? local.label;
    }; localUpdates.push(update); update();
    summary.append(picture, name, availability); card.append(summary);
    const content = node('div', undefined, 'cloud-own-content'); card.append(content); let mounted = false, selectedTab = 'videos';
    const mount = () => {
      if (mounted) return; mounted = true;
      const tabs = node('div', undefined, 'cloud-library-editor-tabs cloud-own-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', `Optionen für ${latest?.title ?? 'Cloud-Figur'}`);
      const videos = node('div', undefined, 'cloud-own-panel'), box = node('div', undefined, 'cloud-own-panel');
      const videoTab = action('Videos & lokal', () => chooseTab('videos')), manageTab = action('Verwalten', () => chooseTab('manage'));
      const key = `cloud-own-${f.id}`;
      for (const [tab, panel, suffix] of [[videoTab, videos, 'videos'], [manageTab, box, 'manage']]) {
        tab.id = `${key}-${suffix}-tab`; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', `${key}-${suffix}`);
        panel.id = `${key}-${suffix}`; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', tab.id);
        tab.onkeydown = event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault(); const next = event.key === 'Home' ? 'videos' : event.key === 'End' ? 'manage' : suffix === 'videos' ? 'manage' : 'videos';
          chooseTab(next); (next === 'videos' ? videoTab : manageTab).focus();
        };
      }
      function chooseTab(tab) {
        selectedTab = tab; ownFigureSelection = { id: f.id, tab, owner: state.me?.id };
        clearPreviews(content); videos.hidden = tab !== 'videos'; box.hidden = tab !== 'manage';
        videoTab.setAttribute('aria-selected', String(tab === 'videos')); manageTab.setAttribute('aria-selected', String(tab === 'manage'));
        videoTab.tabIndex = tab === 'videos' ? 0 : -1; manageTab.tabIndex = tab === 'manage' ? 0 : -1;
      }
      tabs.append(videoTab, manageTab); content.append(tabs, videos, box);
      if (latest) {
        videos.append(node('h4', 'Videos und lokale Kopie'));
        if (latest.description) videos.append(node('p', latest.description));
        if (latest.tags?.length) videos.append(node('p', latest.tags.join(' · ')));
        downloadControls(videos, { ...latest, figure_id: f.id }, { own: true, revisionIds: revisions.map(r => r.id) });
      } else videos.append(node('p', 'Der Upload dieser Figur ist noch nicht abgeschlossen.'));
    box.append(node('p', `Öffentliche Veröffentlichung: ${f.public_allowed ? 'Erlaubt' : 'Nicht erlaubt'}`));
    if (f.owner_id === state.me?.id) box.append(action(f.public_allowed ? 'Öffentliche Veröffentlichung widerrufen' : 'Öffentliche Veröffentlichung erlauben', () => run('Freigabe ändern …', async () => {
      if (f.public_allowed && !await hooks.confirm({ title: 'Öffentliche Freigabe widerrufen?', message: 'Alle Zuordnungen zu öffentlichen Bibliotheken werden entfernt. Private Zuordnungen bleiben bestehen.', ok: 'Freigabe widerrufen' })) return;
      await cloudCall('public_permission', { figure: f.id, allowed: !f.public_allowed }); await load(null);
    })));
    box.append(node('p', 'Die Freigabe gilt für diese Figur und alle öffentlichen Bibliotheken, denen sie zugeordnet ist. Beim Widerrufen werden öffentliche Zuordnungen entfernt. Private Bibliotheken bleiben unverändert.'));
    if (latest) {
      if (state.me.upload_enabled) variantButton(box, latest);

      const assign = action('Einer Bibliothek zuordnen', () => attachForm(latest)); assign.className = 'secondary'; if (state.me.upload_enabled) box.append(assign);

    }
    if (f.owner_id === state.me?.id || state.me?.is_admin) box.append(action('Cloud-Figur samt Videos löschen', async () => {
      const affected = await cloudCall('delete_preview', { figure: f.id });
      if (!await hooks.confirm({ title: 'Cloud-Figur löschen?', message: `Die Cloudfigur wird gelöscht und aus folgenden Bibliotheken entfernt: ${affected.libraries.join(', ') || 'keinen'}. Lokale Kopien bleiben erhalten.`, ok: 'Cloud-Figur löschen' })) return;
      await run('Cloud-Figur löschen …', async () => { await cloudCall('delete_figure', { figure: f.id, expected_token: f.content_token }); await load(null); });
    }));
      chooseTab(ownFigureSelection.id === f.id ? ownFigureSelection.tab : 'videos');
    };
    card.ontoggle = () => {
      if (!card.isConnected) return;
      if (!card.open) { clearPreviews(content); if (ownFigureSelection.id === f.id) ownFigureSelection.id = null; return; }
      for (const other of list.querySelectorAll('details[open]')) if (other !== card) other.open = false;
      mount(); ownFigureSelection = { id: f.id, tab: selectedTab, owner: state.me?.id };
    };
    list.append(card);
    if (ownFigureSelection.id === f.id) { mount(); card.open = true; }
  }
}
function renderUploadRecovery(afterSaved = uploadRecovery?.afterSaved) {
  if (!uploadRecovery) return;
  uploadRecovery.afterSaved = afterSaved;
  uploadRecovery.replaceChildren();
  const workflow = uploadWorkflow, result = workflow?.outcome;
  uploadRecovery.hidden = !workflow?.currentAccount || !(result?.kind === 'unknown' || result?.kind === 'not-saved' || result?.localPending || result?.attachPending || uploadViewError);
  if (uploadRecovery.hidden) return;
  const retry = (label, work) => uploadRecovery.append(action(label, () => run(label + ' …', async () => {
    const result = await work();
    if (!workflow.currentAccount || uploadWorkflow !== workflow) return;
    if (result.kind === 'saved') await afterSaved?.(result);
    renderUploadRecovery(afterSaved);
  })));
  if (result.kind === 'unknown') {
    uploadRecovery.append(node('p', 'Speicherstand unklar. Bitte vor einem erneuten Upload prüfen.'));
    retry('Speicherstand erneut prüfen', () => workflow.reconcile());
  } else if (result.kind === 'not-saved') uploadRecovery.append(node('p', 'Figur wurde nicht gespeichert. Du kannst erneut hochladen.'));
  else {
    if (result.attachPending) { uploadRecovery.append(node('p', 'Figur gespeichert. Bibliothekszuordnung fehlgeschlagen.')); retry('Zuordnung erneut versuchen', () => workflow.retryAttach()); }
    if (result.localPending) { uploadRecovery.append(node('p', 'Upload erfolgreich. Die lokale Cloud-Zuordnung konnte nicht gespeichert werden. Bitte freien App-Speicher prüfen.')); retry('Lokale Zuordnung erneut speichern', () => workflow.retryLocal()); }
    if (uploadViewError) { uploadRecovery.append(node('p', uploadViewError)); retry('Ansicht erneut laden', async () => result); }
  }
}
async function publishForm() {
  const me = state.me;
  if (!me?.upload_enabled) { body.append(node('p', 'Für Cloud-Uploads brauchst du die Freischaltung des Administrators.')); return; }
  if (libraryUpload) body.append(action('Zurück zur Bibliotheksbearbeitung', () => resumeLibraryUpload()));
  const local = source, records = await figureVideos(local), libs = state.libraries.filter(l => l.contribute);
  const box = section(`„${local.title}“ hochladen`), selected = [];
  const step = (number, title) => { const group = node('div', undefined, 'upload-step'); group.append(node('h4', `${number} · ${title}`)); box.append(group); return group; };
  const videoStep = step(1, 'Video'), targetStep = step(2, 'Ziel'), optionsStep = step(3, 'Hochladen');
  for (const record of records) selected.push([checkbox(videoStep, `${record.name || 'Video'} · ${MB(record.blob.size)}`, true), record]);
  videoStep.append(node('p', 'Maximal 50 MB pro Video. Identische Videos werden erkannt und nur einmal gespeichert. Bereits zugängliche Videos können ohne erneuten Upload übernommen werden.'));
  const library = select(targetStep, 'Bibliothek', [['', 'Nur in Meine Cloud-Figuren hochladen'], ...(libraryUpload ? [] : libs.map(l => [l.id, l.title]))]);
  // Reservations can create a figure before any revision exists. They are not
  // valid version targets until the first upload has completed.
  const targets = state.own_figures.filter(f => f.revisions?.length && (f.owner_id === state.me.id || state.me.is_admin));
  const names = new Map();
  for (const f of targets) { const title = f.revisions[0].title; names.set(title, (names.get(title) ?? 0) + 1); }
  const figure = select(optionsStep, 'Cloudfigur speichern', [['', 'Neue Cloud-Figur'], ...targets.map(f => {
    const latest = f.revisions[0], title = latest.title;
    return [f.id, names.get(title) > 1 ? `${title} · ${new Date(latest.created_at).toLocaleString('de')}` : title];
  })]);
  const existingLink = localIndex.link(local);
  const linkedTarget = targets.find(f => f.id === existingLink?.cloudFigure || f.revisions.some(r => r.id === existingLink?.revision || local.importFingerprint?.startsWith(`cloud:${r.id}:`)));
  if (linkedTarget && !libraryUpload) figure.value = linkedTarget.id;
  optionsStep.append(node('p', 'Hier stehen deine vorhandenen Cloud-Figuren. Lokales Löschen oder Entfernen aus einer Bibliothek löscht die Cloud-Figur nicht. Dauerhaft löschen kannst du sie unter „Meine Cloud-Figuren“ mit „Cloud-Figur samt Videos löschen“.'));
  const explicitVariant = checkbox(optionsStep, 'Bewusst eine eigene Figur / Variante erstellen, auch wenn das Video bereits existiert');
  const duplicateBox = node('div'); optionsStep.append(duplicateBox);
  const allowed = checkbox(optionsStep, 'Öffentliche Veröffentlichung dieser Figur erlauben');
  optionsStep.append(node('p', 'Mit Häkchen darf diese Figur in öffentlichen Bibliotheken ohne Anmeldung sichtbar sein. Ohne Häkchen ist sie nur in privaten Bibliotheken nutzbar. Das Häkchen allein veröffentlicht die Figur noch nicht.'));
  const visibilityHint = node('p'); visibilityHint.setAttribute('role', 'status'); targetStep.append(visibilityHint);
  const uploadError = node('p', undefined, 'error'); uploadError.setAttribute('role', 'alert'); uploadError.hidden = true;
  const updateVisibility = () => {
    const isPublic = state.libraries.find(l => l.id === library.value)?.visibility === 'public';
    visibilityHint.textContent = !library.value
      ? 'Die Figur wird in „Meine Cloud-Figuren“ gespeichert und keiner weiteren Bibliothek zugeordnet. Du kannst sie später einer Bibliothek zuordnen.'
      : isPublic
      ? allowed.checked ? 'Öffentliche Bibliothek: Diese Figur darf für alle sichtbar werden.' : 'Diese Bibliothek ist öffentlich. Zum Hochladen musst du die öffentliche Veröffentlichung dieser Figur erlauben. Alternativ wähle eine private Bibliothek.'
      : 'Private Bibliothek: Die Figur ist nur für berechtigte Personen sichtbar.';
    if (figure.value) visibilityHint.textContent += ' Beim Aktualisieren wird der aktuelle Inhalt in allen verknüpften Bibliotheken ersetzt.';
    uploadError.hidden = true;
  };
  library.onchange = updateVisibility; allowed.onchange = updateVisibility;
  figure.onchange = () => { allowed.checked = state.own_figures.find(f => f.id === figure.value)?.public_allowed ?? false; updateVisibility(); };
  allowed.checked = linkedTarget?.public_allowed ?? false;
  updateVisibility();
  const upload = action('Ausgewählte Figur hochladen', () => run('Upload vorbereiten …', async () => {
    if (uploadWorkflow?.currentAccount && uploadWorkflow.pending) { renderUploadRecovery(); throw new Error('Bitte zuerst den Speicherstand prüfen oder offene Zuordnungen abschließen.'); }
    const videos = selected.filter(([check]) => check.checked).map(([, v]) => v);
    const owner = state.me.id, libraryId = library.value, account = cloudIdentity();
    const workflow = createFigureUpload({ call: cloudCall, upload: uploadMedia, hash: videoHash, mediaHash: cloudMediaHash, poster: posterPayload, identity: cloudIdentity, remember: async (...args) => {
      const current = await cloudCall('state');
      if (account !== cloudIdentity()) throw new Error('Das Konto wurde inzwischen gewechselt.');
      const revision = current.own_figures?.find(f => f.id === args[4])?.revisions?.find(r => r.id === args[1]);
      if (revision) localIndex.observe(revision);
      return localIndex.remember(...args);
    } });
    uploadWorkflow = workflow; uploadViewError = null;
    const afterSaved = async result => {
      if (!workflow.currentAccount || result.kind !== 'saved') return;
      ownFigureSelection = { id: result.saved.figure, tab: 'videos', owner }; savedLibraryFigure = result.saved.figure;
      // A failed read or render is follow-up work, never an upload failure.
      try {
        const committed = await cloudCall('state');
        if (!workflow.currentAccount) return;
        const revision = committed.own_figures?.find(f => f.id === result.saved.figure)?.revisions?.find(r => r.id === result.saved.revision);
        if (revision) localIndex.observe(revision);
        await hooks.localChanged?.();
        if (!workflow.currentAccount) return;
        if (libraryUpload) await resumeLibraryUpload(result.saved);
        else { source = null; area = libraryId && !result.attachPending ? 'libraries' : 'figures'; await load(libraryId && !result.attachPending ? libraryId : null); }
        uploadViewError = null;
      } catch { if (workflow.currentAccount) uploadViewError = 'Figur gespeichert. Die Ansicht konnte nicht aktualisiert werden.'; }
      if (workflow.currentAccount) renderUploadRecovery(afterSaved);
    };
    try {
      const result = await workflow.start({ owner, local, videos, target: targets.find(f => f.id === figure.value), library: libraryId, variant: explicitVariant.checked, allowed: allowed.checked, remoteChanged: localIndex.remoteChanged(local), publicLibrary: state.libraries.find(l => l.id === libraryId)?.visibility === 'public', fileLimit: CLOUD_FILE_LIMIT }, {
        confirm: hooks.confirm,
        progress: value => {
          if (!workflow.currentAccount) return;
          statusBox.textContent = value.message;
          const cancel = document.getElementById('cloudCancelUpload'); cancel.hidden = false; cancel.disabled = !value.canCancel;
        }
      });
      if (!workflow.currentAccount || result.kind === 'account-changed') return;
      duplicateBox.replaceChildren();
      if (result.kind === 'duplicates') {
        duplicateBox.append(node('p', 'Dieses Video gehört bereits zu einer zugänglichen Figur. Verwende die bestehende Figur oder wähle ausdrücklich eine eigene Variante.'));
        const unique = [...new Map(result.matches.map(m => [m.figure, m])).values()];
        const choice = select(duplicateBox, 'Bestehende Figur', unique.map(m => [m.revision, m.title]));
        duplicateBox.append(action('Bestehende Figur verwenden', () => run('Figur referenzieren …', async () => {
          if (library.value) { await cloudCall('attach', { library: library.value, revision: choice.value }); source = null; area = 'libraries'; await load(library.value); }
          else { const match = unique.find(m => m.revision === choice.value); if (libraryUpload) await resumeLibraryUpload({ figure: match.figure }); else attachForm({ ...match, id: match.revision }); }
        })));
        return;
      }
      if (result.kind === 'saved') await afterSaved(result);
      else if (result.kind === 'cancelled') report(new Error('Upload abgebrochen.'), uploadError);
      else renderUploadRecovery(afterSaved);
    } finally {
      document.getElementById('cloudCancelUpload').hidden = true;
      document.getElementById('cloudCancelUpload').disabled = false;
    }
  }, uploadError));
  upload.className = 'primary'; box.append(upload, uploadError);
}
function publicLibraries() {
  const intro = node('div', undefined, 'cloud-public-intro');
  const heading = node('div', undefined, 'cloud-public-heading');
  const refresh = action('↻', () => load(null, 'refresh')); refresh.className = 'cloud-public-refresh'; refresh.setAttribute('aria-label', 'Bibliotheken aktualisieren'); refresh.title = 'Bibliotheken aktualisieren';
  heading.append(node('h3', 'Öffentliche Bibliotheken'), refresh);
  intro.append(heading, node('p', 'Entdecke Figuren und übernimm sie zum Üben auf dein Gerät. Öffentliche Bibliotheken sind ohne Anmeldung lesbar.'));
  body.append(intro);
  const catalog = node('div', undefined, 'cloud-public-libraries');
  body.append(catalog);
  for (const library of state.libraries.filter(library => library.visibility === 'public')) {
    const card = libraryCard(library, catalog);
    card.append(node('p', 'Öffentlich', 'cloud-public-badge'));
    if (library.description) card.append(node('p', library.description));
  }
  if (!catalog.childElementCount) catalog.append(node('p', 'Noch keine öffentlichen Bibliotheken.'));
}
function dismissLogin() {
  if (!loginDialog?.open) return;
  loginDialog.close(); loginDialog.replaceChildren();
  if (!loginTrigger.hidden) loginTrigger.focus();
}
function showGuestLogin() {
  if (busy || state?.me || loginDialog.open) return;
  const destination = { library: current, area: 'libraries' };
  const finish = async authenticate => {
    await authenticate(); dismissLogin(); area = destination.area; await load(destination.library);
  };
  const heading = node('div', undefined, 'cloud-login-heading'), title = node('h3', 'Anmelden'); title.id = 'cloudLoginTitle';
  const dismiss = action('×', dismissLogin); dismiss.setAttribute('aria-label', 'Anmeldedialog schließen'); heading.append(title, dismiss);
  const content = node('div', undefined, 'cloud-guest-login-content'); loginDialog.replaceChildren(heading, content);
  content.append(node('p', 'Du bist derzeit nicht angemeldet. Nutze deinen persönlichen Anmeldelink oder melde dich als Admin mit E-Mail und Passwort an.'));
  const tabs = node('div', undefined, 'cloud-login-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Anmeldemethode');
  const linkPanel = node('div', undefined, 'cloud-login-panel'), adminPanel = node('div', undefined, 'cloud-login-panel');
  const panels = [linkPanel, adminPanel];
  const buttons = ['Mit Anmeldelink', 'Admin-Anmeldung'].map((label, index) => {
    const button = action(label, () => choose(index));
    button.id = `cloudLoginTab${index}`; button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', `cloudLoginPanel${index}`);
    panels[index].id = `cloudLoginPanel${index}`; panels[index].setAttribute('role', 'tabpanel'); panels[index].setAttribute('aria-labelledby', button.id);
    button.onkeydown = event => {
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : ['ArrowLeft', 'ArrowRight'].includes(event.key) ? 1 - index : null;
      if (next !== null) { event.preventDefault(); choose(next); buttons[next].focus(); }
    };
    tabs.append(button); return button;
  });
  function choose(selected) {
    buttons.forEach((button, index) => { button.setAttribute('aria-selected', String(index === selected)); button.tabIndex = index === selected ? 0 : -1; panels[index].hidden = index !== selected; });
  }
  content.append(tabs, ...panels); choose(0);
  const form = node('form'); linkPanel.append(form);
  const link = field(form, 'Anmeldelink einfügen', '', 'password'); link.autocomplete = 'off';
  linkPanel.append(node('p', 'Füge deinen persönlichen Anmeldelink hier ein. Die Anmeldung in einer anderen App oder einem anderen Browser wird nicht automatisch übernommen.'));
  const error = node('p', '', 'error'); error.setAttribute('role', 'alert'); error.hidden = true;
  const submit = () => run('Anmelden …', () => finish(() => loginWithLink(link.value.trim())), error);
  form.append(action('Anmelden', submit), error);
  form.onsubmit = event => { event.preventDefault(); void submit(); };
  adminLoginForm(adminPanel, finish);
  if (signedIn()) content.append(action('Abmelden', async () => { if (!await leaveLibraryDraft()) return; await logout(); await run('Laden …', () => load(null)); }));
  loginDialog.showModal();
}
function adminLoginForm(parent, finish) {
  const form = node('form'); parent.append(form);
  const email = field(form, 'Admin-E-Mail-Adresse', '', 'email'); email.autocomplete = 'username'; email.required = true;
  const password = field(form, 'Admin-Passwort', '', 'password'); password.autocomplete = 'current-password'; password.required = true;
  const error = node('p', '', 'error'); error.setAttribute('role', 'alert'); error.hidden = true;
  const submit = async () => {
    if (!form.reportValidity()) return;
    await run('Admin anmelden …', async () => {
      try { await finish(() => loginWithPassword(email.value, password.value)); }
      finally { password.value = ''; }
    }, error);
  };
  form.append(action('Als Admin anmelden', submit), error);
  form.onsubmit = event => { event.preventDefault(); void submit(); };
  const help = node('details'); help.append(node('summary', 'Erstes Passwort oder Passwort vergessen?'), node('p', 'Wenn du noch angemeldet bist: Plattformverwaltung → Admin-Passwort. Sonst einmalig mit einem neuen persönlichen Anmeldelink anmelden und dort ein Passwort setzen. Einen neuen Link kann ein anderer Plattform-Admin erzeugen; wenn niemand mehr angemeldet ist, erfolgt die Wiederherstellung über Supabase.'));
  parent.append(help);
}
function adminPasswordForm() {
  const box = section('Admin-Passwort'), form = node('form'); box.append(form);
  box.append(node('p', 'Einmal einrichten und nach dem Abmelden mit E-Mail und Passwort zurückkehren. Dein Passwort gilt für dein eigenes Admin-Konto in Cloud-PWA und Android.'));
  const email = field(form, 'Deine Admin-E-Mail-Adresse', state.me.email, 'email'); email.readOnly = true; email.autocomplete = 'username';
  const current = field(form, 'Bisheriges Passwort (falls bereits gesetzt)', '', 'password'); current.autocomplete = 'current-password';
  const password = field(form, 'Neues Admin-Passwort', '', 'password'); password.autocomplete = 'new-password'; password.minLength = 12; password.required = true;
  const repeat = field(form, 'Neues Admin-Passwort wiederholen', '', 'password'); repeat.autocomplete = 'new-password'; repeat.required = true;
  form.append(node('p', 'Mindestens 12 Zeichen. Du kannst ein Passwort aus deinem Passwortmanager einfügen.'));
  const error = node('p', '', 'error'); error.setAttribute('role', 'alert'); error.hidden = true;
  const status = node('p'); status.setAttribute('role', 'status');
  const submit = async () => {
    status.textContent = ''; error.hidden = true;
    if (!form.reportValidity()) return;
    if (password.value !== repeat.value) { report(new Error('Die neuen Passwörter stimmen nicht überein.'), error); return; }
    await run('Admin-Passwort speichern …', async () => {
      try { await setAdminPassword(password.value, current.value); status.textContent = 'Passwort gespeichert. Du kannst dich jetzt mit deiner E-Mail-Adresse und diesem Passwort wieder anmelden.'; }
      finally { current.value = ''; password.value = ''; repeat.value = ''; }
    }, error);
  };
  form.append(action('Admin-Passwort speichern', submit), error, status);
  form.onsubmit = event => { event.preventDefault(); void submit(); };
}
function adminForm() {
  adminPasswordForm();
  const box = section('Plattformverwaltung');
  peopleView.mount(box);
  box.append(action('Bestehende Videos auf Duplikate prüfen', () => run('Videos prüfen …', async () => {
    let result;
    do { result = await cloudCall('admin_optimize'); statusBox.textContent = 'Vorhandene Videos werden geprüft und zusammengeführt …'; } while (result.processed > 0);
    await load(null);
  })));
}
export function initCloud(callbacks) {
  hooks = callbacks;
  const refreshLocal = () => { if (dialog.open) void refreshLocalFigures().catch(() => {}); };
  addEventListener('local-figures-changed', refreshLocal);
  addEventListener('focus', refreshLocal);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshLocal(); });
  addEventListener('storage', refreshLocal);
  addEventListener('beforeunload', event => { if ((libraryDraft ?? libraryUpload?.hook)?.dirty()) { event.preventDefault(); event.returnValue = ''; } });
  peopleView = createPeopleView({ node, action, field, select, checkbox, call: cloudCall, run, confirm: options => hooks.confirm(options), state: () => state, refresh: () => load(null), report, section });
  dialog = document.getElementById('cloudDialog'); body = document.getElementById('cloudBody'); errorBox = document.getElementById('cloudError'); statusBox = document.getElementById('cloudStatus');
  uploadRecovery = node('section', undefined, 'cloud-card'); uploadRecovery.id = 'cloudUploadRecovery'; uploadRecovery.setAttribute('role', 'status'); uploadRecovery.hidden = true; body.before(uploadRecovery);
  addEventListener('cloud-session-changed', event => {
    uploadWorkflow?.cancel(); uploadRecovery.hidden = true; uploadRecovery.replaceChildren();
    libraryDraft = null; libraryEditing = null; libraryUpload = null; peopleView.reset(); viewEpoch++; renderedView = null; state = null; displayedOwner = null; localInventoryEpoch++; localFigures = []; localUpdates = [];
    cancelThumbnails(); clearPreviews(body); body.replaceChildren(); errorBox.hidden = true; cacheStatus('');
    if (loginTrigger) loginTrigger.hidden = signedIn();
    // Explicit login/logout reload their own destination; token rotation leaves forms intact.
    if ((event.detail?.external || event.detail?.expired) && dialog.open) {
      if (busy) authReloadPending = true;
      else { source = null; area = 'initial'; void load(null, true); }
    }
  });
  loginDialog = node('dialog', undefined, 'cloud-login-dialog'); loginDialog.id = 'cloudLoginDialog'; loginDialog.setAttribute('aria-labelledby', 'cloudLoginTitle');
  loginDialog.addEventListener('cancel', event => { event.preventDefault(); if (!busy) dismissLogin(); }); document.body.append(loginDialog);
  loginTrigger = action('', showGuestLogin); loginTrigger.id = 'cloudLoginOpen'; loginTrigger.className = 'cloud-login-trigger'; loginTrigger.hidden = true;
  loginTrigger.setAttribute('aria-label', 'Anmeldedialog öffnen'); loginTrigger.title = 'Anmelden'; loginTrigger.setAttribute('aria-haspopup', 'dialog'); loginTrigger.setAttribute('aria-controls', loginDialog.id);
  loginTrigger.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5M3 12h12m-4-4 4 4-4 4"/></svg>';
  dialog.querySelector('.screen-header').append(loginTrigger);
  document.getElementById('cloudBack').onclick = cloudBack;
  dialog.querySelector('[data-nav=figures]').onclick = close;
  dialog.querySelector('[data-nav=cloud]').onclick = () => { if (!busy) navigate('initial'); };
  document.getElementById('cloudCancelUpload').onclick = () => { if (uploadWorkflow?.currentAccount && ['hashing', 'reserving', 'uploading', 'poster'].includes(uploadWorkflow.phase)) uploadWorkflow.cancel(); else controller?.abort(); };
  dialog.addEventListener('cancel', e => { e.preventDefault(); void cloudBack(); });
  document.getElementById('cloudButton').onclick = () => openCloud();
  const query = new URLSearchParams(location.search); if (query.has('library') || query.has('cloud')) setTimeout(() => openCloud(null, query.get('library')), 0);
}
export async function openCloud(local = null, library = null) {
  if (busy || dialog.open) return; if (local && !signedIn()) return; source = local; current = library; area = 'initial';
  errorBox.hidden = true; if (displayedOwner !== cloudIdentity() || local) { cancelThumbnails(); clearPreviews(body); body.replaceChildren(); }
  // Do not let dialog focus restoration reopen the search keyboard on return.
  if (document.activeElement?.matches('input, textarea, [contenteditable=true]')) document.activeElement.blur();
  loginTrigger.hidden = signedIn();
  dialog.showModal();
  if (local) await run('Cloud-Inhalte werden geladen …', () => load(library)); else await load(library, true);
}
