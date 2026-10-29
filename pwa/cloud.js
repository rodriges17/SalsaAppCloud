import { createCloudNavigation } from './cloud-navigation.js';
import { connectTagSuggestions } from './tag-suggestions.js';
import { mountTagPicker } from './tag-picker.js';
import { createFigureUpload } from './cloud-upload.js';
import { cloudIcon } from './cloud-provenance.js';
import { createLibrarySession } from './cloud-library-draft.js';
import { mountLibraryOrder } from './cloud-library-order.js';
import { videoHash } from './cloud-dedup.js';
import { createMemberView } from './cloud-members.js';
import { createPeopleView } from './cloud-people.js';
import { cloudReadState, contentState } from './cloud-read-state.js';
import { cloudCall, signedIn, uploadMedia, logout, loginWithLink, loginWithPassword, setAdminPassword, cloudIdentity, setLinkLoginConfirmation } from './cloud-api.js';
import { CLOUD_FILE_LIMIT } from './cloud-config.js';
import { figureVideos, figureMedia, listFigures, saveFigure, storageSettings } from './storage.js';
import { downloadLibrary, downloadFigure, inspectCloudVideo, enrichCloudMetadata } from './cloud-library-download.js';
import { readCloudCache, writeCloudCache, cloudCacheRevision } from './cloud-cache.js';
import { cloudLocalIndex as localIndex } from './cloud-local.js';
import { createPosterView, posterPayload } from './cloud-posters.js';
const node = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
const MB = value => `${(Number(value ?? 0) / 1000000).toFixed(1)} MB`;
const action = (label, work) => {
  const button = node('button', label, 'secondary'); button.type = 'button';
  button.onclick = () => {
    const active = navigation.capture();
    return Promise.resolve().then(() => { if (active()) return work(); })
      .catch(error => { if (active()) report(error); });
  };
  return button;
};
// Lucide icon shapes (ISC), kept local so Cloud UI also works offline.
const UI_ICONS = {"play":[["path",{"d":"M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"}]],"tag":[["path",{"d":"M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"}],["circle",{"cx":"7.5","cy":"7.5","r":".5","fill":"currentColor"}]],"settings":[["path",{"d":"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"}],["circle",{"cx":"12","cy":"12","r":"3"}]],"refresh-cw":[["path",{"d":"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"}],["path",{"d":"M21 3v5h-5"}],["path",{"d":"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"}],["path",{"d":"M8 16H3v5"}]],"user-round":[["circle",{"cx":"12","cy":"8","r":"5"}],["path",{"d":"M20 21a8 8 0 0 0-16 0"}]],"library":[["path",{"d":"m16 6 4 14"}],["path",{"d":"M12 6v14"}],["path",{"d":"M8 8v12"}],["path",{"d":"M4 4v16"}]],"copy-plus":[["line",{"x1":"15","x2":"15","y1":"12","y2":"18"}],["line",{"x1":"12","x2":"18","y1":"15","y2":"15"}],["rect",{"width":"14","height":"14","x":"8","y":"8","rx":"2","ry":"2"}],["path",{"d":"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"}]],"shield-check":[["path",{"d":"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"}],["path",{"d":"m9 12 2 2 4-4"}]],"shield-off":[["path",{"d":"m2 2 20 20"}],["path",{"d":"M5 5a1 1 0 0 0-1 1v7c0 5 3.5 7.5 7.67 8.94a1 1 0 0 0 .67.01c2.35-.82 4.48-1.97 5.9-3.71"}],["path",{"d":"M9.309 3.652A12.252 12.252 0 0 0 11.24 2.28a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1v7a9.784 9.784 0 0 1-.08 1.264"}]],"trash-2":[["path",{"d":"M10 11v6"}],["path",{"d":"M14 11v6"}],["path",{"d":"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"}],["path",{"d":"M3 6h18"}],["path",{"d":"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"}]]};
function uiIcon(name) {
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
 for(const [key,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.7,'stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false'}))svg.setAttribute(key,value);
 for(const [tag,attrs] of UI_ICONS[name]){const shape=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs))shape.setAttribute(key,value);svg.append(shape);}
 return svg;
}
function tagPills(tags=[]) {
 const list=node('ul',undefined,'cloud-tag-pills');list.setAttribute('aria-label','Tags');list.setAttribute('role','list');
 for(const tag of tags){const item=node('li',undefined,'cloud-tag-pill');item.append(uiIcon('tag'),node('span',tag));list.append(item);}
 return list;
}
let uploadWorkflow = null, uploadRecovery, uploadViewError = null;
let peopleView, librarySession = null, uploadTagPicker = null, stopUploadTags = null;
function clearLibrarySession(){if(librarySession?.active)librarySession.discard();librarySession=null;}
function beginLibrarySession(detail){
 clearLibrarySession();
 librarySession=createLibrarySession({detail,owner:cloudIdentity(),identity:cloudIdentity,commit:payload=>cloudCall('library_commit',payload),read:id=>cloudCall('library',{id}),readState:()=>cloudCall('state')});
 return librarySession;
}
async function leaveLibraryDraft(active = navigation.capture()){
 const session=librarySession;
 if(!session?.active){clearLibrarySession();return true;}
 if(!session.dirty){clearLibrarySession();return true;}
 const choice=await new Promise(resolve=>{
  const prompt=node('dialog',undefined,'cloud-unsaved-dialog');
  prompt.append(node('h3','Bibliothek noch nicht gespeichert'),node('p','Möchtest du deine Änderungen speichern oder verwerfen?'));
  const finish=value=>{prompt.close();prompt.remove();resolve(value);};
  prompt.append(action('Speichern',()=>finish('save')),action('Verwerfen',()=>finish('discard')),action('Weiter bearbeiten',()=>finish('stay')));
  prompt.oncancel=event=>{event.preventDefault();finish('stay');};
  document.body.append(prompt);prompt.showModal();
 });
 if(!active()||librarySession!==session||!session.active)return false;
 let outcome;
 const leave=async()=>{
  outcome=await session.leave(choice);
  if(outcome.error){
   if(source&&!session.suspended&&session.active){source=null;area='libraries';await renderCloud(session.id,session.detail);}
   if(session.conflict)showLibraryConflict();throw outcome.error;
  }
  if(outcome.kind==='left'&&librarySession===session){clearLibrarySession();source=null;}
 };
 if(choice==='save')await run('Bibliothek speichern …',leave);else await leave();
 return outcome?.kind==='left';
}

let loginDialog, loginTrigger, cloudNavigation, accountDialog, accountTrigger;
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
    event.preventDefault(); void navigate('libraries', library.id).catch(report);
  };
  return card;
}
function setCloudBusy(value) {
  busy = value; statusBox.closest('footer').setAttribute('aria-busy', String(value));
  body.inert = value; if (loginDialog) loginDialog.inert = value; if (accountDialog) accountDialog.inert = value;
  document.getElementById('cloudBack').disabled = value;
  dialog.querySelectorAll('[data-nav], #cloudNavigation button, .cloud-refresh-trigger, #cloudAccountOpen, #cloudSettings').forEach(button => { button.disabled = value; });
}
let pendingConfirmations = 0;
async function confirmCloud(options) {
  const active = navigation.capture(); pendingConfirmations++;
  try { const accepted = await hooks.confirm(options); return active() && accepted; }
  finally { pendingConfirmations--; }
}
async function run(message, work, errorTarget = errorBox, retainStatus = false) {
  if (busy) return;
  const active = navigation.capture(); setCloudBusy(true);
  errorBox.hidden = true; errorTarget.hidden = true; statusBox.textContent = message;
  try { const result = await work(active); return active() ? result : undefined; }
  catch (error) {
    if (!active()) return;
    if (error.accessChanged) { clearLibrarySession(); await recoverAccess(); }
    if (!active()) return;
    if (retainStatus) statusBox.textContent = error?.message ?? 'Download fehlgeschlagen.';
    report(error, errorTarget.isConnected ? errorTarget : errorBox);
  } finally {
    if (active()) { setCloudBusy(false); if (!retainStatus) statusBox.textContent = ''; focusUploadedFigure(); }
  }
}
function resetCloudSession() {
  controller?.abort(); controller = null; uploadWorkflow?.cancel();
  uploadRecovery.hidden = true; uploadRecovery.replaceChildren();
  document.querySelectorAll('.cloud-unsaved-dialog').forEach(prompt => prompt.dispatchEvent(new Event('cancel', { cancelable: true })));
  if (pendingConfirmations && document.getElementById('confirmDialog')?.open) document.getElementById('confirmDialog').dispatchEvent(new Event('cancel', { cancelable: true }));
  document.querySelectorAll('.cloud-library-picker').forEach(picker => { picker.close(); picker.remove(); });
  peopleView.reset(); resetOwnFigures(); savedLibraryFigure = null; renderedView = null; state = null; displayedOwner = null;
  localInventoryEpoch++; localFigures = []; localUpdates = [];
  disposeUploadTags(); cancelThumbnails(); clearPreviews(body); body.replaceChildren();
  cloudNavigation.replaceChildren(); cloudNavigation.hidden = true; errorBox.hidden = true; cacheStatus('');
  if (loginTrigger) loginTrigger.hidden = signedIn();
  dismissLogin(); dismissAccount(); accountTrigger.hidden = true; accountDialog.replaceChildren();
  const cancel = document.getElementById('cloudCancelUpload'); cancel.hidden = true; cancel.disabled = false;
  document.getElementById('cloudDownloadProgress').hidden = true; setCloudBusy(false);
}

async function recoverAccess() {
  const owner = cloudIdentity(), epoch = navigation.revision;
  const active = () => owner === cloudIdentity() && epoch === navigation.revision && dialog.open;
  const inputs = [...body.querySelectorAll('label')].map(label => { const input = label.querySelector('input,textarea,select'); return input && input.type !== 'password' ? { label: label.firstChild?.textContent, value: input.value, checked: input.checked } : null; }).filter(Boolean);
  try {
    const refreshed = await cloudCall('state'); if (!active()) return; let detail;
    if (current) { try { detail = await cloudCall('library', { id: current }); } catch { current = null; area = 'libraries'; } }
    if (!active()) return; state = refreshed;
    if (area === 'admin' && !state.me?.is_admin) area = 'libraries';
    await renderCloud(current, detail);
    for (const saved of inputs) { const label = [...body.querySelectorAll('label')].find(l => l.firstChild?.textContent === saved.label); const input = label?.querySelector('input,textarea,select'); if (input && !input.readOnly && !input.disabled) { input.value = saved.value; if (input.type === 'checkbox') input.checked = saved.checked; input.dispatchEvent(new Event('input')); input.dispatchEvent(new Event('change')); } }
  } catch { /* Keep drafts and the original error when refreshing is unavailable. */ }
}
const hasOwnArea = value => !!value?.me && (value.me.upload_enabled || value.own_figures?.length > 0);
const initialArea = value => hasOwnArea(value) ? 'figures' : 'libraries';
let navigation;
const close = () => navigation.close();
const cloudBack = () => navigation.back();
const leaveLibraryEditor = () => navigation.leaveEditor();

function dismissAccount() {
  if (!accountDialog?.open) return;
  accountDialog.close(); accountTrigger.setAttribute('aria-expanded', 'false'); accountTrigger.focus();
}
function renderAccount() {
  accountTrigger.hidden = !state?.me;
  if (!state?.me) { dismissAccount(); accountDialog.replaceChildren(); return; }
  const me = state.me;
  accountDialog.replaceChildren();
  const heading = node('div', undefined, 'cloud-account-heading'), title = node('h3', 'Mein Konto'); title.id = 'cloudAccountTitle';
  const closeButton = action('×', dismissAccount); closeButton.setAttribute('aria-label', 'Kontomenü schließen'); heading.append(title, closeButton);
  accountDialog.append(heading, node('p', me.email, 'cloud-account-email'), node('p', me.is_admin ? 'Plattform-Administrator' : me.upload_enabled ? 'Figuren hochladen erlaubt' : 'Lesen erlaubt, Uploads gesperrt', 'cloud-account-role'));
  const usage = node('div', undefined, 'cloud-account-usage'), meter = node('meter'); meter.min = 0; meter.max = Math.max(1, Number(me.quota) || 0); meter.value = Math.max(0, Number(me.used) || 0); meter.setAttribute('aria-label', 'Belegter Cloud-Speicher'); meter.setAttribute('aria-valuetext', `${MB(me.used)} / ${MB(me.quota)} belegt`);
  usage.append(node('h4', 'Cloud-Speicher'), meter, node('p', `${MB(me.used)} / ${MB(me.quota)} belegt`)); accountDialog.append(usage);
  if (me.is_admin) {
    const passwordPanel = node('div'); passwordPanel.hidden = true;
    const passwordAction = action('Passwort einrichten / ändern', () => { passwordPanel.hidden = !passwordPanel.hidden; passwordAction.setAttribute('aria-expanded', String(!passwordPanel.hidden)); if (!passwordPanel.hidden) { passwordPanel.replaceChildren(); adminPasswordForm(passwordPanel); } else passwordPanel.replaceChildren(); });
    passwordAction.setAttribute('aria-expanded', 'false'); accountDialog.append(passwordAction, passwordPanel, action('Plattformverwaltung', () => { dismissAccount(); return navigate('admin'); }));
  }
  accountDialog.append(action('Abmelden', () => navigation.logout()));
}

function cloudStatusLabel(target, text, modified = false) {
  const icon = node('span', undefined, 'cloud-status-icon'); icon.innerHTML = cloudIcon(modified);
  target.replaceChildren(icon, node('span', text));
}
const navigate = (next, library = null) => navigation.show(next, library);

function focusSection(box) {
  box.tabIndex = -1; box.focus(); box.scrollIntoView({ block: 'start' });
}
let statusTimer, displayedOwner = null, renderedView = null;
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
  if (librarySession?.active) {
    if (!librarySession.suspended && library === librarySession.id) {
      if (allowCache === 'refresh') await reloadLibrarySession();
      return; // Background refresh never replaces an edit, even a clean one.
    }
    if (!await leaveLibraryDraft()) return;
  }
  const epoch = navigation.invalidateView();
  let owner, cached, detail, available;
  try {
    owner = await cloudReadState.open();
    if (epoch !== navigation.revision || !dialog.open) return;
    current = library;
    const active = () => epoch === navigation.revision && dialog.open && owner === cloudIdentity();
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
      if (active()) { clearLibrarySession(); disposeUploadTags(); cancelThumbnails(); clearPreviews(body); body.replaceChildren(); renderedView = null; state = null; displayedOwner = null; cached = null; cloudNavigation.replaceChildren(); cloudNavigation.hidden = true; renderAccount(); }
    } });
    if (!active()) return;
    // Do not interrupt a form, an active download, expanded history or a video preview.
    const editing = !snapshot.accessChanged && (librarySession?.active || cached && (busy || allowCache !== 'refresh' && body.querySelector('details[open], video, form input:focus, form textarea:focus, input[type=checkbox]:not(:checked)')));
    const changed = allowCache === 'refresh' || !cached || JSON.stringify(contentState(state)) !== JSON.stringify(contentState(snapshot.value)) || library && JSON.stringify(detail?.value) !== JSON.stringify(freshDetail?.value);
    if (!editing && changed) {
      const scroll = cached ? body.parentElement.scrollTop : 0;
      state = snapshot.value; displayedOwner = owner;
      await renderCloud(library, freshDetail?.value); body.parentElement.scrollTop = scroll;
    }
    if (active() && !busy) { errorBox.hidden = true; cacheStatus(editing && changed ? 'Änderungen geladen – bitte nach Abschluss deines Vorgangs aktualisieren.' : 'Alles aktuell', !editing); }
    maintainCloud(owner, snapshot.value.me);
  } catch (error) {
    if (epoch !== navigation.revision || !dialog.open || owner && owner !== cloudIdentity()) return;
    if (error.cacheCleared && owner) {
      if (epoch !== navigation.revision || !dialog.open || owner !== cloudIdentity()) return;
      clearLibrarySession(); disposeUploadTags(); cancelThumbnails(); clearPreviews(body); body.replaceChildren(); state = null; displayedOwner = null; cached = null; cloudNavigation.replaceChildren(); cloudNavigation.hidden = true; renderAccount();
    }
    if (cached) cacheStatus(`Aktualisierung nicht möglich – letzter geladener Stand wird angezeigt. ${lastStand(cached.updatedAt)}`);
    else { cacheStatus(''); report(error); if (!body.childElementCount) body.append(action('Erneut versuchen', () => load(library, true))); }
  }
}
async function renderCloud(library, detail) {
  if (librarySession && (!librarySession.active || !state.me)) clearLibrarySession();
  current = library; localUpdates = [];
  for (const f of state.own_figures ?? []) for (const rev of f.revisions ?? []) localIndex.observe(rev);
  if (area === 'initial' || area === 'figures' && !source && !hasOwnArea(state)) area = initialArea(state);
  renderedView = { owner: cloudIdentity(), area, library };
  if (!state.me && !['figures', 'libraries'].includes(area)) area = 'libraries';
  disposeUploadTags(); cancelThumbnails(); clearPreviews(body); body.replaceChildren(); body.parentElement.scrollTop = 0;
  posterView = createPosterView(body, state.me);
  loginTrigger.hidden = !!state.me; if (state.me) dismissLogin();
  const toolbar = node('div', undefined, 'cloud-tabs');
  toolbar.setAttribute('aria-label', 'Cloud-Bereiche');
  for (const [key, label] of [...(hasOwnArea(state) ? [['figures', 'Meine Figuren']] : []), ['libraries', 'Bibliotheken']]) {
    const button = action(label, () => navigate(key)); if (key === 'figures') button.setAttribute('aria-label', 'Meine Cloud-Figuren'); button.setAttribute('aria-pressed', String(!source && (current ? key === 'libraries' : area === key || (area === 'create' && key === 'libraries')))); toolbar.append(button);
  }
  cloudNavigation.replaceChildren(); cloudNavigation.hidden = !state.me || area === 'admin';
  if (state.me && area !== 'admin') cloudNavigation.append(toolbar);
  dialog.querySelector('.screen-header h2').textContent = area === 'admin' ? 'Plattformverwaltung' : 'Cloud-Speicher';
  document.getElementById('cloudBack').setAttribute('aria-label', area === 'admin' ? 'Zurück zu Mein Konto' : 'Zurück aus der Cloud');
  renderAccount();
  if (!state.me) {
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
function libraryForm(){
 const box=section('Bibliothek erstellen'),form=node('form');box.append(form);
 const title=field(form,'Name');title.required=true;title.maxLength=160;
 const description=field(form,'Beschreibung','','textarea');
 const visibility=select(form,'Sichtbarkeit',[['private','Privat'],['public','Öffentlich']],'private');
 const collaborative=checkbox(form,'Eingeladene Mitwirkende dürfen beitragen'),moderated=checkbox(form,'Beiträge zuerst freigeben',true);
 form.append(action('Bibliothek speichern',()=>{
  if(!form.reportValidity())return;
  return run('Speichern …',async()=>{
   const result=await cloudCall('library_save',{title:title.value,description:description.value,visibility:visibility.value,collaborative:collaborative.checked,moderated:moderated.checked});
   await load(result.id);
  });
 }),action('Abbrechen',()=>navigate('libraries')));
 form.onsubmit=event=>event.preventDefault();
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
function revealLibraryFigure(card) {
  // Measure after mounting details and collapsing the previous figure.
  requestAnimationFrame(() => {
    if (!card.isConnected || !card.open) return;
    const scroller = card.closest('.cloud-scroll');
    if (!scroller) return;
    const viewport = scroller.getBoundingClientRect(), end = card.getBoundingClientRect().bottom;
    const bottom = Math.min(viewport.bottom, window.innerHeight) - 8;
    if (end > bottom || end < viewport.top) scroller.scrollTop += end - bottom;
  });
}
async function libraryView(id, detail) {
  for (const entry of detail.entries) localIndex.observe(entry.published ?? entry.pending);
  const lib = detail.library, manage = !!state.me && !!detail.manage;
  if (librarySession?.active && librarySession.id === id && !librarySession.suspended && manage) { renderLibraryEditor(id); return; }
  if (!librarySession?.suspended) clearLibrarySession();
  const back = action('< Zurück zu allen Bibliotheken', () => navigate('libraries')); back.className = 'cloud-public-back'; body.append(back);
  const intro = section(lib.title); intro.classList.add('cloud-library-hero');
  const title = intro.querySelector('h3'); title.className = 'cloud-library-title';
  intro.prepend(node('p', lib.visibility === 'public' ? 'Öffentliche Bibliothek' : 'Private Bibliothek', 'cloud-library-eyebrow'));
  if (manage) {
    const edit = action('Bibliothek bearbeiten', () => {
      beginLibrarySession(detail);
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
    const name = node('div', undefined, 'cloud-library-name');
    name.append(node('h3', rev?.title ?? 'Noch nicht veröffentlicht'));
    if (rev?.tags?.length) { const tags = tagPills(rev.tags); tags.title = rev.tags.join(', '); name.append(tags); }
    summary.append(name);
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
        if (entry.published) revisionCard(content, { ...entry.published, figure_id: entry.figure_id }, 'Aktuelle Figur', rev.title, true, true);
        if (entry.pending && entry.pending.id !== entry.published?.id) revisionCard(content, { ...entry.pending, figure_id: entry.figure_id }, 'Zur Freigabe', rev.title, true, rev.id === entry.pending.id);
        if (!entry.published && entry.pending) content.append(node('p', 'Diese Figur ist noch nicht für Besucher freigegeben.'));
      }
      revealLibraryFigure(box);
    };
    entriesBox.append(box);
    if (savedLibraryFigure === entry.figure_id) { box.open = true; savedLibraryFigure = null; }
  }
  if (!detail.entries.length) entriesBox.append(node('p', 'Noch keine sichtbaren Figuren in dieser Bibliothek.'));
  libraryShare(id, lib);
}
function renderLibraryEditor(id) {
  const editor = librarySession, detail = editor.detail, model = editor.model, lib = detail.library;
  const head = section('Bibliothek bearbeiten'); head.classList.add('cloud-library-editor-heading');
  head.append(node('p', 'Änderungen werden erst mit „Bibliothek speichern“ übernommen.'));
  const tabs = node('div', undefined, 'cloud-library-editor-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Bibliothek bearbeiten');
  const figures = node('div'), settings = node('div');
  const figureTab = action(`Figuren (${model.ids.length})`, () => chooseTab('figures')), settingsTab = action('Einstellungen', () => chooseTab('settings'));
  figureTab.setAttribute('role', 'tab'); settingsTab.setAttribute('role', 'tab');
  function chooseTab(tab) { editor.tab = tab; figures.hidden = tab !== 'figures'; settings.hidden = tab !== 'settings'; figureTab.setAttribute('aria-selected', String(tab === 'figures')); settingsTab.setAttribute('aria-selected', String(tab === 'settings')); }
  tabs.append(figureTab, settingsTab); body.append(tabs, figures, settings);
  const toolbar = node('div', undefined, 'cloud-library-editor-toolbar'); toolbar.append(node('h3', 'Figuren verwalten'));
  if (state.me.upload_enabled) toolbar.append(action('Figuren hinzufügen', () => libraryAddPicker(editor, () => { drawRows(); figureTab.textContent = `Figuren (${model.ids.length})`; }))); figures.append(toolbar);
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
        await cloudCall('review', { library: id, figure: entry.figure_id, accept: true }); clearLibrarySession(); await load(id);
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
  createMemberView({ box: memberBox, lib, members: detail.members, me: state.me, people: state.people ?? [], node, action, field, select, call: cloudCall, run: async (...args) => { if (await leaveLibraryDraft()) return run(...args); }, confirm: options => confirmCloud(options), refresh: async () => { const fresh = await cloudCall('library', { id }); if (!fresh.manage) throw Object.assign(new Error('Keine Berechtigung.'), { accessChanged: true }); beginLibrarySession(fresh).tab = 'settings'; await renderCloud(id, fresh); } });
  const danger = section('Gefahrenbereich', settings); danger.classList.add('danger-zone');
  danger.append(node('p', 'Die Bibliothek und ihre Mitgliedschaften werden entfernt. Cloud-Figuren, Videos und lokale Kopien bleiben erhalten.'));
  danger.append(action('Bibliothek löschen', async () => {
    if (!await leaveLibraryDraft()) return;
    if (await confirmCloud({ title: `Bibliothek „${lib.title}“ löschen?`, message: 'Cloud-Figuren, Videos und lokale Kopien bleiben erhalten.', ok: 'Bibliothek löschen', destructive: true })) {
      clearLibrarySession(); await run('Löschen …', async () => { await cloudCall('library_delete', { id }); area = 'libraries'; await load(null); });
    }
  }));
  const conflict = node('div', undefined, 'cloud-library-conflict'); conflict.hidden = !editor.conflict; conflict.setAttribute('role', 'alert');
  conflict.append(node('p', 'Die Bibliothek wurde inzwischen geändert. Dein Entwurf wurde nicht gespeichert.'), action('Aktuellen Stand neu laden', reloadLibrarySession)); body.append(conflict);
  const save = () => run('Bibliothek speichern …', async () => {
    sync();
    if (!form.reportValidity() || !model.data.title.trim()) { chooseTab('settings'); name.reportValidity(); return; }
    const outcome = await editor.save();
    if (outcome.error) { conflict.hidden = !editor.conflict; throw outcome.error; }
    if (outcome.kind !== 'saved' || librarySession !== editor) return;
    clearLibrarySession(); source = null; await load(id);
  });
  const footer = node('div', undefined, 'cloud-library-editor-footer'); footer.append(dirtyText, action('Abbrechen', leaveLibraryEditor), action('Bibliothek speichern', save)); footer.lastChild.className = 'primary'; body.append(footer);
  drawRows(); chooseTab(editor.tab);
}
function libraryAddPicker(editor, redraw) {
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
    if (librarySession !== editor || !editor.active) { picker.close(); picker.remove(); return; }
    for (const [check, f] of choices) if (check.checked && !check.disabled) editor.model.add(f);
    picker.close(); picker.remove(); redraw();
  })); picker.addEventListener('close', () => picker.remove(), { once: true }); document.body.append(picker); picker.showModal();
}
async function libraryUploadPicker(editor) {
  const picker = node('dialog', undefined, 'cloud-library-picker'); picker.append(node('h3', 'Lokale Figur hochladen'), node('p', 'Die Figur wird in Meine Cloud-Figuren gespeichert. Ihre Bibliothekszuordnung bleibt bis zum Speichern ein Entwurf.'));
  const local = await hooks.localFigures();
  if (librarySession !== editor || !editor.active) return;
  for (const f of local.filter(f => !f.storageProblem && !f.folderAccessRequired)) picker.append(action(f.title, async () => {
    if (librarySession !== editor || !editor.suspend()) return;
    picker.close(); picker.remove(); source = f; area = 'figures'; await renderCloud(null);
  }));
  if (!local.length) picker.append(node('p', 'Erstelle oder importiere zuerst eine Figur unter Meine Figuren.'));
  picker.append(action('Abbrechen', () => { picker.close(); picker.remove(); })); picker.addEventListener('close', () => picker.remove(), { once: true }); document.body.append(picker); picker.showModal();
}
function showLibraryConflict(){const box=body.querySelector('.cloud-library-conflict');if(box)box.hidden=false;}
async function reloadLibrarySession(){
 const session=librarySession;if(!session?.active)return;
 if(!await confirmCloud({title:'Aktuellen Stand laden?',message:'Deine ungespeicherten Bibliotheksänderungen werden verworfen. Hochgeladene Cloud-Figuren bleiben erhalten.',ok:'Neu laden'}))return;
 if(librarySession!==session||!session.active)return;
 await run('Aktuellen Stand laden …',async()=>{
  const outcome=await session.reload(true);if(outcome.error)throw outcome.error;
  if(outcome.kind==='reloaded'&&librarySession===session)await renderCloud(session.id,session.detail);
 });
}
async function resumeLibraryUpload(result=null){
 const session=librarySession;if(!session?.suspended)return;
 const outcome=await session.resume(result);if(outcome.error)throw outcome.error;
 if(outcome.kind!=='resumed'||librarySession!==session)return;
 state=outcome.state;source=null;area='libraries';await renderCloud(session.id,session.detail);
}
function libraryDownloadControls(parent, entries) {
  const revisions = [...new Map(entries.filter(entry => entry.published?.videos?.length).map(entry => [entry.published.id, { ...entry.published, figure_id: entry.figure_id }])).values()];
  if (!revisions.length) return;
  const box = node('div', undefined, 'cloud-library-download');
  const resultText = statusBox;
  const failures = node('ul'); failures.hidden = true;
  const progress = document.getElementById('cloudDownloadProgress');
  const start = action('Alle Figuren lokal verfügbar machen', async () => {
    if (!await confirmCloud({ title: 'Alle Figuren lokal verfügbar machen?', message: 'Alle veröffentlichten Figuren direkt im gewählten lokalen Speicher sichern. Vorhandene Videos werden wiederverwendet; bestehende Lernstände und Notizen bleiben erhalten.', ok: 'Lokal verfügbar machen' })) return;
    return run('Lokalen Bestand prüfen …', async active => {
    if (librarySession?.dirty) throw new Error('Bitte zuerst die Bibliothek speichern, bevor du alle Figuren lokal verfügbar machst.');
    const settings = await storageSettings();
    if (settings.activeFolder && settings.folders.find(folder => folder.id === settings.activeFolder)?.access !== 'granted') throw new Error('Bitte den gewählten Geräteordner in den Einstellungen freigeben, bevor du die Bibliothek herunterlädst.');
    if (!active()) return;
    const downloadController = new AbortController(); controller = downloadController; const signal = downloadController.signal;
    const cancel = document.getElementById('cloudCancelUpload'); cancel.textContent = 'Abbrechen'; cancel.hidden = false;
    progress.hidden = false; progress.max = revisions.length; progress.value = 0; resultText.hidden = false; failures.replaceChildren(); failures.hidden = true;
    try {
      const result = await downloadLibrary(revisions, {
        listFigures, readMedia: figureMedia, readCloudMedia: cloudMediaHash, confirmReplace: figure => confirmCloud({ title: 'Lokale Änderungen überschreiben?', message: `„${figure.title}“ wurde lokal geändert. Mit der Cloud-Version überschreiben?`, ok: 'Mit Cloud-Version überschreiben' }), inspectVideo: inspectCloudVideo, saveFigure,
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
        if (!active()) return;
        progress.value = state.done;
        const phase = { index: 'Lokalen Bestand prüfen', check: 'Vorhandene Videos prüfen', download: `Video ${state.video} von ${state.videos} laden`, save: 'Figur speichern', saved: 'Figur gespeichert', skip: 'Bereits vorhanden', error: 'Figur konnte nicht gespeichert werden', done: 'Abgeschlossen', cancelled: 'Abgebrochen' }[state.phase];
        resultText.textContent = `${phase}${state.title ? `: ${state.title}` : ''} · ${state.done} / ${state.total} Figuren`;
      } });
      if (!active()) return;
      resultText.textContent = `${result.cancelled ? 'Abgebrochen' : 'Fertig'}: ${result.saved} gespeichert · ${result.skipped} bereits vorhanden${result.failed.length ? ` · ${result.failed.length} fehlgeschlagen` : ''}.`;
      if (result.failed.length) { failures.hidden = false; result.failed.forEach(error => failures.append(node('li', `${error.title}: ${error.message}`))); }
      if (result.remaining) resultText.textContent += ` ${result.remaining} Figuren noch offen.`;
      if (result.cancelled || result.failed.length) resultText.textContent += ' Erneut starten lädt nur die noch fehlenden Figuren.';
      await hooks.localChanged?.();
      await refreshLocalFigures();
    } finally { if (controller === downloadController) { controller = null; cancel.hidden = true; cancel.textContent = 'Upload abbrechen'; progress.hidden = true; } }
  }, errorBox, true);
  });
  start.className = 'primary';
  box.append(start, failures);
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
function revisionCard(parent, rev, label, parentTitle = parent.querySelector('h3')?.textContent, compact = false, tagsInSummary = false) {
  const box = node('article', undefined, 'cloud-revision'), heading = node('div', undefined, 'revision-heading');
  const copy = node('div'); copy.append(node('h4', label), node('p', versionLabel(rev))); heading.append(copy);
  if (!compact && rev.videos?.[0]) thumbnail(heading, rev);
  box.append(heading);
  if (rev.title !== parentTitle) box.append(node('p', rev.title, 'revision-title'));
  parent.append(box);
  box.append(node('p', rev.description)); if(!tagsInSummary && rev.tags?.length)box.append(tagPills(rev.tags));
  downloadControls(box, rev);
}
const videoSize=value=>Number.isFinite(Number(value)) && Number(value)>0?MB(value):'Größe unbekannt';
function downloadControls(box, rev, { own = false, revisionIds = [rev.id] } = {}) {
  if (!rev.videos.length) return;
  const chosen = [], multiple = rev.videos.length > 1;
  const localStatus = node('p', '', 'cloud-local-status'); localStatus.hidden = true; localStatus.setAttribute('role', 'status');
  if(box.firstElementChild)box.firstElementChild.after(localStatus);else box.append(localStatus);
  const choiceHeading = multiple ? node('h4', 'Videos für die lokale Kopie auswählen') : null; if (choiceHeading) box.append(choiceHeading);
  for (const v of rev.videos) {
    const row=node('div',undefined,'cloud-video-row');box.append(row);
    const check = multiple ? checkbox(row, `Video „${v.name || 'Ohne Namen'}“ lokal übernehmen`, true) : null;
    if(check)check.parentElement.querySelector('span').className='sr-only';
    chosen.push([check, v]);
    const play=action('',()=>previewVideo(box,rev,v));play.className='cloud-video-play';
    play.setAttribute('aria-label',`Video „${v.name || 'Ohne Namen'}“ abspielen`);play.setAttribute('aria-description',videoSize(v.size));
    const copy=node('span',undefined,'cloud-video-copy');copy.append(node('span',v.name || 'Ohne Namen','cloud-video-name'),node('small',videoSize(v.size),'cloud-video-size'));
    play.append(uiIcon('play'),copy);row.append(play);
  }
  const fingerprint = selected => `cloud:${rev.id}:${selected.map(v => v.id).join(',')}`;
  const label = 'Lokal verfügbar machen';
  const download = async (replace = false) => {
    const activeDownload = navigation.capture();
    await refreshLocalFigures(); if (!activeDownload()) return;
    const linked = localIndex.resolve(rev, localFigures, { revisionIds }).current;
    if (linked && !replace) {
      const saved = await run('Angaben ergänzen …', () => enrichCloudMetadata(linked, rev, { readMedia: figureMedia, saveFigure }));
      if (!saved) return;
      await hooks.localChanged?.(); if (!activeDownload()) return; await close(); if (activeDownload() && !dialog.open) return hooks.openLocal?.(saved); return;
    }
    return run('Figur wird lokal verfügbar gemacht …', async active => {
    if (librarySession?.dirty) throw new Error('Bitte zuerst die Bibliothek speichern, bevor du eine Figur übernimmst.');
    const selected = chosen.filter(([check]) => !check || check.checked).map(([, v]) => v);
    if (!selected.length) throw new Error('Bitte mindestens ein Video auswählen.');
    if (selected.reduce((n, v) => n + v.size, 0) > 250 * 1024 * 1024) throw new Error('Bitte weniger Videos wählen: maximal 250 MB pro Übernahme.');
    const resolved = localIndex.resolve(rev, localFigures, { revisionIds });
    const target = resolved.figure && !resolved.modified ? { figure: resolved.figure } : await hooks.chooseImport({ title: rev.title, fingerprint: fingerprint(selected), revisionIds, figureId: rev.figure_id });
    if (!target || !active()) return;
    const settings = await storageSettings();
    if (!target.figure && settings.activeFolder && settings.folders.find(folder => folder.id === settings.activeFolder)?.access !== 'granted') throw new Error('Bitte den gewählten Geräteordner in den Einstellungen freigeben.');
    if (!active()) return;
    const downloadController = new AbortController(); controller = downloadController; const signal = downloadController.signal;
    const cancel = document.getElementById('cloudCancelUpload'); cancel.textContent = 'Abbrechen'; cancel.hidden = false;
    try {
      await downloadFigure({ ...rev, videos: selected }, {
        listFigures, readMedia: figureMedia, readCloudMedia: cloudMediaHash, confirmReplace: figure => confirmCloud({ title: 'Lokale Änderungen überschreiben?', message: `„${figure.title}“ wurde lokal geändert. Mit der Cloud-Version überschreiben?`, ok: 'Mit Cloud-Version überschreiben' }), inspectVideo: inspectCloudVideo, saveFigure,
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
      }, { signal, target: target.figure ?? null, targetFolder: settings.activeFolder ?? null, progress: text => { if (active()) statusBox.textContent = text; } });
      if (!active()) return;
      await hooks.localChanged?.();
      if (!active()) return;
      busy = false; await close(); if (active()) hooks.localSaved?.();
    } finally { if (controller === downloadController) { controller = null; cancel.hidden = true; cancel.textContent = 'Upload abbrechen'; } }

  });
  };
  const take = action(label, () => download());
  // Keep recovery available when files were removed or modified outside the app.
  const repair = action('Lokale Kopie aktualisieren', () => download(true)); repair.className = 'subtle'; repair.hidden = true;
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
    chosen.forEach(([check]) => {
      if (check) check.parentElement.hidden = local.available;
    });
    take.textContent = local.available ? 'Lokal öffnen' : local.kind === 'outdated' ? 'Lokale Kopie aktualisieren' : label;
    take.classList.toggle('cloud-local-open', !own && local.available);
    take.disabled = accessRequired;
    repair.hidden = !local.modified;
    take.title = local.available ? 'Die zugehörige lokale Figur öffnen.' : '';
    openOlder.hidden = local.kind !== 'outdated';

  };
  chosen.forEach(([check]) => { if (check) check.onchange = update; }); localUpdates.push(update); update();
}
async function attachForm(revision) {
  if (!await leaveLibraryDraft()) return;
  navigation.invalidateView(); renderedView = null;
  disposeUploadTags(); cancelThumbnails(); clearPreviews(body); body.replaceChildren();
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
function managementAction(label,icon,work,destructive=false){
 const button=action('',work);button.className='cloud-manage-action'+(destructive?' destructive':'');
 button.append(uiIcon(icon),node('span',label));return button;
}
function variantButton(box, revision) {
  box.append(managementAction('Variante erstellen','copy-plus', async () => {
    if (!await leaveLibraryDraft()) return;
    if (!await confirmCloud({ title: 'Variante erstellen?', message: 'Die Variante ist unabhängig bearbeitbar. Vorhandene Videos und Bilder werden ohne zusätzliche Dateikopie referenziert.', ok: 'Variante erstellen' })) return;
    await run('Variante erstellen …', async () => { await cloudCall('variant', { revision: revision.id }); area = 'figures'; await load(null); });
  }));
}
let savedLibraryFigure = null;
let uploadedFigureFocus = null;
let ownFigureSelection = { id: null, tab: 'videos', owner: null };
function resetOwnFigures() {
  uploadedFigureFocus = null;
  ownFigureSelection = { id: null, tab: 'videos', owner: state?.me?.id };
  for (const card of body.querySelectorAll('.cloud-own-figure')) { clearPreviews(card); card.open = false; }
}
function focusUploadedFigure() {
  const pending = uploadedFigureFocus; uploadedFigureFocus = null;
  if (!pending || source || current || area !== 'figures' || pending.owner !== cloudIdentity() || !dialog.open) return;
  const card = [...body.querySelectorAll('.cloud-own-figure')].find(card => card.dataset.ownFigure === pending.id);
  const tab = card?.querySelector('[role=tab][aria-selected=true]');
  if (card?.open && tab) { tab.focus({ preventScroll: true }); card.scrollIntoView({ block: 'nearest' }); }
}
function ownFigures() {
  if (ownFigureSelection.owner !== state.me?.id) ownFigureSelection = { id: null, tab: 'videos', owner: state.me?.id };
  if (!state.own_figures.some(f => f.id === ownFigureSelection.id)) ownFigureSelection.id = null;
  if (!state.own_figures.length) body.append(node('p', 'Noch keine eigenen Cloud-Figuren. Lade eine lokale Figur über „In Cloud veröffentlichen“ hoch.'));
  const list = node('div', undefined, 'cloud-own-list'); body.append(list);
  const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });
  const figures = state.own_figures.map(f => ({ ...f, revisions: [...f.revisions].sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0)) }));
  const title = f => f.revisions[0]?.title ?? 'Noch nicht fertig hochgeladene Figur';
  figures.sort((a, b) => collator.compare(title(a), title(b)));
  for (const f of figures) {
    const revisions = f.revisions;
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
      const videoTab = action('Figur', () => chooseTab('videos')), manageTab = action('Verwalten', () => chooseTab('manage'));
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
        if (latest.description) videos.append(node('p', latest.description));
        if (latest.tags?.length) videos.append(tagPills(latest.tags));
        downloadControls(videos, { ...latest, figure_id: f.id }, { own: true, revisionIds: revisions.map(r => r.id) });
      } else videos.append(node('p', 'Der Upload dieser Figur ist noch nicht abgeschlossen.'));
      const permission=f.public_allowed?'Erlaubt':'Nicht erlaubt';
      const consent=node('div',undefined,'cloud-consent');consent.dataset.allowed=String(f.public_allowed);
      consent.setAttribute('role','status');consent.setAttribute('aria-label',`Öffentliche Freigabe: ${permission}`);
      const consentCopy=node('span');consentCopy.append(node('span','Öffentliche Freigabe'),node('strong',permission));
      consent.append(uiIcon(f.public_allowed?'shield-check':'shield-off'),consentCopy);box.append(consent);
      const actions=node('div',undefined,'cloud-manage-actions');box.append(actions);
      if(latest && state.me?.upload_enabled){
        actions.append(managementAction('Bibliothek zuordnen','library',()=>attachForm(latest)));
        variantButton(actions,latest);
      }
      if(f.owner_id===state.me?.id)actions.append(managementAction(f.public_allowed?'Freigabe widerrufen':'Freigabe erlauben',f.public_allowed?'shield-off':'shield-check',()=>run('Freigabe ändern …',async()=>{
        if(f.public_allowed && !await confirmCloud({title:'Öffentliche Freigabe widerrufen?',message:'Alle Zuordnungen zu öffentlichen Bibliotheken werden entfernt. Private Zuordnungen bleiben bestehen.',ok:'Freigabe widerrufen'}))return;
        await cloudCall('public_permission',{figure:f.id,allowed:!f.public_allowed});await load(null);
      })));
      if(f.owner_id===state.me?.id || state.me?.is_admin)actions.append(managementAction('Cloud-Figur löschen','trash-2',async()=>{
        const affected=await cloudCall('delete_preview',{figure:f.id});
        if(!await confirmCloud({title:'Cloud-Figur löschen?',message:`Die Cloud-Figur und ihre Videos werden gelöscht und aus folgenden Bibliotheken entfernt: ${affected.libraries.join(', ') || 'keinen'}. Lokale Kopien bleiben erhalten.`,ok:'Cloud-Figur löschen',destructive:true}))return;
        await run('Cloud-Figur löschen …',async()=>{await cloudCall('delete_figure',{figure:f.id,expected_token:f.content_token});await load(null);});
      },true));
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
function disposeUploadTags(){stopUploadTags?.();stopUploadTags=null;uploadTagPicker?.destroy();uploadTagPicker=null;}
async function publishForm() {
  const me = state.me;
  if (!me?.upload_enabled) { body.append(node('p', 'Für Cloud-Uploads brauchst du die Freischaltung des Administrators.')); return; }
  if (librarySession?.suspended) body.append(action('Zurück zur Bibliotheksbearbeitung', () => run('Bibliotheksbearbeitung wird geladen …', () => resumeLibraryUpload())));
  const local = source, account = cloudIdentity(), epoch = navigation.revision;
  const records = await figureVideos(local);
  if (!dialog.open || source !== local || account !== cloudIdentity() || epoch !== navigation.revision) return;
  const libs = state.libraries.filter(l => l.contribute);
  const box = section(`„${local.title}“ hochladen`), selected = [];
  const step = (number, title) => { const group = node('div', undefined, 'upload-step'); group.append(node('h4', `${number} · ${title}`)); box.append(group); return group; };
  const videoStep = step(1, 'Video'), targetStep = step(2, 'Ziel'), optionsStep = step(3, 'Hochladen');
  for (const record of records) selected.push([checkbox(videoStep, `${record.name || 'Video'} · ${MB(record.blob.size)}`, true), record]);
  videoStep.append(node('p', 'Maximal 50 MB pro Video. Identische Videos werden erkannt und nur einmal gespeichert. Bereits zugängliche Videos können ohne erneuten Upload übernommen werden.'));
  const tagLabel=node('label','Tags');tagLabel.htmlFor='cloudUploadTags';const tagInput=node('input');tagInput.id='cloudUploadTags';targetStep.append(tagLabel,tagInput);
  const tags=uploadTagPicker=mountTagPicker(tagInput,{value:local.tags,suggestions:local.tags});
  stopUploadTags=connectTagSuggestions(tags,local.tags);
  const library = select(targetStep, 'Bibliothek', [['', 'Nur in Meine Cloud-Figuren hochladen'], ...(librarySession?.suspended ? [] : libs.map(l => [l.id, l.title]))]);
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
  if (linkedTarget && !librarySession?.suspended) figure.value = linkedTarget.id;
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
      if (account !== cloudIdentity()) throw new Error('Das Konto wurde inzwischen gewechselt.');
      if (args[5]) return localIndex.remember(...args.slice(0, 5), undefined, args[5]);
      const current = await cloudCall('state');
      if (account !== cloudIdentity()) throw new Error('Das Konto wurde inzwischen gewechselt.');
      const revision = current.own_figures?.find(f => f.id === args[4])?.revisions?.find(r => r.id === args[1]);
      if (revision) localIndex.observe(revision);
      return localIndex.remember(...args.slice(0, 5));
    } });
    uploadWorkflow = workflow; uploadViewError = null;
    const returnSession = librarySession?.suspended ? librarySession : null;
    const afterSaved = async result => {
      if (!workflow.currentAccount || result.kind !== 'saved') return;
      ownFigureSelection = { id: result.saved.figure, tab: 'manage', owner }; savedLibraryFigure = returnSession ? result.saved.figure : null;
      // A failed read or render is follow-up work, never an upload failure.
      try {
        if (returnSession) {
          if (librarySession !== returnSession || !returnSession.active) return;
          if (returnSession.suspended) await resumeLibraryUpload(result.saved);
          if (!workflow.currentAccount) return;
          await hooks.localChanged?.(); uploadViewError = null;
          renderUploadRecovery(afterSaved); return;
        }
        const committed = await cloudCall('state');
        if (!workflow.currentAccount) return;
        const revision = committed.own_figures?.find(f => f.id === result.saved.figure)?.revisions?.find(r => r.id === result.saved.revision);
        if (revision) localIndex.observe(revision);
        await hooks.localChanged?.();
        if (!workflow.currentAccount) return;
        source = null; area = 'figures'; await load(null);
        if (workflow.currentAccount) uploadedFigureFocus = { id: result.saved.figure, owner: cloudIdentity() };
        uploadViewError = null;
      } catch (error) { if (error.accessChanged) throw error; if (workflow.currentAccount) uploadViewError = 'Figur gespeichert. Die Ansicht konnte nicht aktualisiert werden.'; }
      if (workflow.currentAccount) renderUploadRecovery(afterSaved);
    };
    try {
      const result = await workflow.start({ owner, local:{...local,tags:tags.value}, videos, target: targets.find(f => f.id === figure.value), library: libraryId, variant: explicitVariant.checked, allowed: allowed.checked, remoteChanged: localIndex.remoteChanged(local), publicLibrary: state.libraries.find(l => l.id === libraryId)?.visibility === 'public', fileLimit: CLOUD_FILE_LIMIT }, {
        confirm: confirmCloud,
        progress: value => {
          if (!workflow.currentAccount) return;
          statusBox.textContent = value.message;
          const cancel = document.getElementById('cloudCancelUpload'); cancel.hidden = !value.canCancel; cancel.disabled = !value.canCancel;
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
          else { const match = unique.find(m => m.revision === choice.value); if (librarySession?.suspended) await resumeLibraryUpload({ figure: match.figure, revision: match.revision, reference: { id: match.figure, revisions: [{ id: match.revision, title: match.title, videos: [] }] } }); else attachForm({ ...match, id: match.revision }); }
        })));
        return;
      }
      if (result.kind === 'saved') await afterSaved(result);
      else if (result.kind === 'cancelled') report(new Error('Upload abgebrochen.'), uploadError);
      else renderUploadRecovery(afterSaved);
    } finally {
      if (account === cloudIdentity()) { document.getElementById('cloudCancelUpload').hidden = true; document.getElementById('cloudCancelUpload').disabled = false; }
    }
  }, uploadError));
  upload.className = 'primary'; box.append(upload, uploadError);
}
function publicLibraries() {
  const intro = node('div', undefined, 'cloud-public-intro');
  const heading = node('div', undefined, 'cloud-public-heading');
  heading.append(node('h3', 'Öffentliche Bibliotheken'));
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
// Separate from the busy login form so Escape and Android Back remain available.
function confirmLinkAccount({ email, previousEmail, sameAccount, signal }) {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise(resolve => {
    const prompt = node('dialog', undefined, 'cloud-login-dialog');
    prompt.id = 'cloudLoginConfirmation'; prompt.setAttribute('aria-labelledby', 'cloudLoginConfirmationTitle');
    const title = node('h3', previousEmail ? (sameAccount ? 'Anmeldung erneuern?' : 'Konto wechseln?') : 'Anmeldung bestätigen');
    title.id = 'cloudLoginConfirmationTitle';
    const message = previousEmail && !sameAccount ? `Von ${previousEmail} zu ${email} wechseln?` : (sameAccount ? `Anmeldung als ${email} erneuern?` : `Als ${email} anmelden?`);
    prompt.append(title, node('p', message), node('p', 'Erst nach deiner Bestätigung wird diese Anmeldung aktiv. Beim Abbrechen ist der geprüfte Einmallink verbraucht; du benötigst danach einen neuen Link.'));
    let settled = false;
    const finish = accepted => {
      if (settled) return; settled = true;
      signal.removeEventListener('abort', aborted);
      prompt.close(); prompt.remove(); resolve(accepted);
    };
    const aborted = () => finish(false);
    const cancel = action('Abbrechen', () => finish(false));
    const accept = action(previousEmail ? (sameAccount ? 'Anmeldung erneuern' : 'Konto wechseln') : 'Anmelden', () => finish(true)); accept.className = 'primary';
    const actions = node('div', undefined, 'actions'); actions.append(cancel, accept); prompt.append(actions);
    prompt.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
    prompt.addEventListener('close', () => finish(false));
    signal.addEventListener('abort', aborted, { once: true });
    document.body.append(prompt); prompt.showModal(); cancel.focus();
  });
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
  const help = node('details'); help.append(node('summary', 'Erstes Passwort oder Passwort vergessen?'), node('p', 'Wenn du noch angemeldet bist: Mein Konto → Passwort einrichten / ändern. Sonst einmalig mit einem neuen persönlichen Anmeldelink anmelden und dort ein Passwort setzen. Einen neuen Link kann ein anderer Plattform-Admin erzeugen; wenn niemand mehr angemeldet ist, erfolgt die Wiederherstellung über Supabase.'));
  parent.append(help);
}
function adminPasswordForm(parent) {
  const box = section('Passwort einrichten / ändern', parent), form = node('form'); box.append(form);
  box.append(node('p', 'Einmal einrichten und nach dem Abmelden mit E-Mail und Passwort zurückkehren. Dein Passwort gilt für dein eigenes Admin-Konto in Cloud-PWA und Android.'));
  const email = field(form, 'Deine E-Mail-Adresse', state.me.email, 'email'); email.readOnly = true; email.autocomplete = 'username';
  const current = field(form, 'Bisheriges Passwort (falls bereits gesetzt)', '', 'password'); current.autocomplete = 'current-password';
  const password = field(form, 'Neues Passwort', '', 'password'); password.autocomplete = 'new-password'; password.minLength = 12; password.required = true;
  const repeat = field(form, 'Neues Passwort wiederholen', '', 'password'); repeat.autocomplete = 'new-password'; repeat.required = true;
  form.append(node('p', 'Mindestens 12 Zeichen. Du kannst ein Passwort aus deinem Passwortmanager einfügen.'));
  const error = node('p', '', 'error'); error.setAttribute('role', 'alert'); error.hidden = true;
  const status = node('p'); status.setAttribute('role', 'status');
  const submit = async () => {
    status.textContent = ''; error.hidden = true;
    if (!form.reportValidity()) return;
    if (password.value !== repeat.value) { report(new Error('Die neuen Passwörter stimmen nicht überein.'), error); return; }
    status.textContent = 'Passwort wird gespeichert …'; status.setAttribute('aria-busy', 'true');
    await run('Passwort speichern …', async () => {
      try { await setAdminPassword(password.value, current.value); status.textContent = 'Passwort gespeichert. Du kannst dich jetzt mit deiner E-Mail-Adresse und diesem Passwort wieder anmelden.'; }
      finally { current.value = ''; password.value = ''; repeat.value = ''; status.setAttribute('aria-busy', 'false'); if (status.textContent === 'Passwort wird gespeichert …') status.textContent = ''; }
    }, error);
  };
  form.append(action('Passwort speichern', submit), error, status);
  form.onsubmit = event => { event.preventDefault(); void submit(); };
}
function adminForm() {
  const box = node('section', undefined, 'cloud-admin'); body.append(box);
  peopleView.mount(box);
}
function extraManagement() {
  return action('Bestehende Videos auf Duplikate prüfen', () => run('Videos prüfen …', async () => {
    let result;
    do { result = await cloudCall('admin_optimize'); statusBox.textContent = 'Vorhandene Videos werden geprüft und zusammengeführt …'; } while (result.processed > 0);
    await load(null);
  }));
}
export function initCloud(callbacks) {
  setLinkLoginConfirmation(confirmLinkAccount);
  hooks = callbacks;
  navigation = createCloudNavigation({ identity: cloudIdentity, view: {
    context: () => ({ open: dialog.open, busy, signedIn: signedIn(), area, library: current, account: accountDialog?.open, login: loginDialog?.open }),
    enter: enterCloud,
    hide() { clearLibrarySession(); disposeUploadTags(); renderedView = null; clearTimeout(statusTimer); cancelThumbnails(); dialog.close(); clearPreviews(body); source = null; hooks.closed?.(); },
    select(next, library = null) { source = null; area = next; current = library; },
    initialArea: () => initialArea(state), resetFigures: resetOwnFigures,
    load, render: renderCloud, run, logout, resetSession: resetCloudSession,
    dismissAccount, dismissLogin, showLogin: showGuestLogin,
    showAccount() { renderAccount(); if (state?.me) { accountDialog.showModal(); accountTrigger.setAttribute('aria-expanded', 'true'); } },
    settings() { document.getElementById('cloudSettings').focus({ preventScroll: true }); hooks.settings?.(); }
  }, drafts: {
    peopleLeave: active => peopleView.leave(active), library: () => librarySession,
    leaveLibrary: leaveLibraryDraft, clearLibrary: clearLibrarySession, resumeLibrary: resumeLibraryUpload
  } });
  const refreshLocal = () => { if (dialog.open) void refreshLocalFigures().catch(() => {}); };
  addEventListener('local-figures-changed', refreshLocal);
  addEventListener('focus', refreshLocal);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshLocal(); });
  addEventListener('storage', refreshLocal);
  addEventListener('beforeunload', event => { if (librarySession?.dirty || peopleView.dirty) { event.preventDefault(); event.returnValue = ''; } });
  peopleView = createPeopleView({ node, action, field, select, checkbox, call: cloudCall, run, confirm: options => confirmCloud(options), state: () => state, refresh: () => load(null), report, section, extraManagement, account: () => { renderAccount(); accountDialog.showModal(); accountTrigger.setAttribute('aria-expanded', 'true'); } });
  dialog = document.getElementById('cloudDialog'); body = document.getElementById('cloudBody'); errorBox = document.getElementById('cloudError'); statusBox = document.getElementById('cloudStatus');
  const downloadProgress = node('progress'); downloadProgress.id = 'cloudDownloadProgress'; downloadProgress.setAttribute('aria-label', 'Bibliothek lokal verfügbar machen'); downloadProgress.hidden = true; statusBox.after(downloadProgress);
  cloudNavigation = node('div', undefined, 'cloud-navigation'); cloudNavigation.id = 'cloudNavigation'; cloudNavigation.hidden = true; dialog.querySelector('.screen-header').after(cloudNavigation);
  const settingsTrigger = document.getElementById('infoButton').cloneNode(true); settingsTrigger.id = 'cloudSettings'; settingsTrigger.onclick = () => navigation.settings(); settingsTrigger.replaceChildren(uiIcon('settings')); dialog.querySelector('.cloud-brand-header').append(settingsTrigger);
  document.getElementById('infoButton').replaceChildren(uiIcon('settings'));
  const refreshTrigger = action('Aktualisieren', () => navigation.refresh()); refreshTrigger.className = 'cloud-refresh-trigger'; refreshTrigger.setAttribute('aria-label', 'Aktualisieren'); refreshTrigger.title = 'Aktualisieren'; refreshTrigger.replaceChildren(uiIcon('refresh-cw')); dialog.querySelector('.screen-header').append(refreshTrigger);
  uploadRecovery = node('section', undefined, 'cloud-card'); uploadRecovery.id = 'cloudUploadRecovery'; uploadRecovery.setAttribute('role', 'status'); uploadRecovery.hidden = true; body.before(uploadRecovery);
  addEventListener('cloud-session-changed', event => { void navigation.sessionChanged(event.detail).catch(report); });
  loginDialog = node('dialog', undefined, 'cloud-login-dialog'); loginDialog.id = 'cloudLoginDialog'; loginDialog.setAttribute('aria-labelledby', 'cloudLoginTitle');
  loginDialog.addEventListener('cancel', event => { event.preventDefault(); if (!busy) dismissLogin(); }); document.body.append(loginDialog);
  loginTrigger = action('', () => navigation.login()); loginTrigger.id = 'cloudLoginOpen'; loginTrigger.className = 'cloud-login-trigger'; loginTrigger.hidden = true;
  loginTrigger.setAttribute('aria-label', 'Anmeldedialog öffnen'); loginTrigger.title = 'Anmelden'; loginTrigger.setAttribute('aria-haspopup', 'dialog'); loginTrigger.setAttribute('aria-controls', loginDialog.id);
  loginTrigger.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5M3 12h12m-4-4 4 4-4 4"/></svg>';
  dialog.querySelector('.screen-header').append(loginTrigger);
  accountDialog = node('dialog', undefined, 'cloud-account-menu'); accountDialog.id = 'cloudAccountMenu'; accountDialog.setAttribute('aria-labelledby', 'cloudAccountTitle'); dialog.append(accountDialog);
  accountDialog.addEventListener('cancel', event => { event.preventDefault(); event.stopPropagation(); if (!busy) dismissAccount(); });
  accountDialog.addEventListener('click', event => { if (event.target !== accountDialog) return; const rect = accountDialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dismissAccount(); });
  accountDialog.addEventListener('close', () => accountTrigger.setAttribute('aria-expanded', 'false'));
  accountTrigger = action('', () => navigation.account());
  accountTrigger.id = 'cloudAccountOpen'; accountTrigger.className = 'cloud-login-trigger'; accountTrigger.hidden = true; accountTrigger.title = 'Mein Konto'; accountTrigger.setAttribute('aria-label', 'Kontomenü öffnen'); accountTrigger.setAttribute('aria-haspopup', 'dialog'); accountTrigger.setAttribute('aria-controls', accountDialog.id); accountTrigger.setAttribute('aria-expanded', 'false');
  accountTrigger.replaceChildren(uiIcon('user-round')); dialog.querySelector('.screen-header').append(accountTrigger);
  document.getElementById('cloudBack').onclick = cloudBack;
  dialog.querySelector('[data-nav=figures]').onclick = close;
  dialog.querySelector('[data-nav=cloud]').onclick = () => { if (!busy) navigate('initial'); };
  document.getElementById('cloudCancelUpload').onclick = () => { if (uploadWorkflow?.currentAccount && ['hashing', 'reserving', 'uploading', 'poster'].includes(uploadWorkflow.phase)) uploadWorkflow.cancel(); else controller?.abort(); };
  dialog.addEventListener('cancel', e => { e.preventDefault(); void cloudBack(); });
  document.getElementById('cloudButton').onclick = () => openCloud();
  const query = new URLSearchParams(location.search); if (query.has('library') || query.has('cloud')) setTimeout(() => openCloud(null, query.get('library')), 0);
}
async function enterCloud(local, library) {
  source = local; current = library; area = 'initial';
  errorBox.hidden = true; if (displayedOwner !== cloudIdentity()) { cloudNavigation.replaceChildren(); cloudNavigation.hidden = true; } if (displayedOwner !== cloudIdentity() || local) { disposeUploadTags(); cancelThumbnails(); clearPreviews(body); body.replaceChildren(); }
  // Do not let dialog focus restoration reopen the search keyboard on return.
  if (document.activeElement?.matches('input, textarea, [contenteditable=true]')) document.activeElement.blur();
  loginTrigger.hidden = signedIn(); accountTrigger.hidden = !state?.me || displayedOwner !== cloudIdentity();
  dialog.showModal();
}
export const openCloud = (local = null, library = null) => navigation.open(local, library);

export { close as closeCloud };
