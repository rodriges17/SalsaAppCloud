import { videoHash } from './cloud-dedup.js';
import { createMemberView } from './cloud-members.js';
import { createPeopleView } from './cloud-people.js';
import { cloudReadState, contentState } from './cloud-read-state.js';
import { cloudCall, signedIn, uploadMedia, logout, loginWithLink, loginWithPassword, setAdminPassword, cloudIdentity } from './cloud-api.js';
import { CLOUD_FILE_LIMIT } from './cloud-config.js';
import { figureVideos, figureMedia, listFigures, saveFigure, storageSettings } from './storage.js';
import { downloadLibrary, inspectCloudVideo } from './cloud-library-download.js';
import { localVideoContent, matchingLocalVideos } from './cloud-local-content.js';
import { readCloudCache, writeCloudCache, cloudCacheRevision } from './cloud-cache.js';
import { createCloudLocalIndex } from './cloud-local.js';
const localIndex = createCloudLocalIndex({ getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) }, `salsa-cloud-local:${new URL('./', import.meta.url).pathname}:v1`);
import { createPosterView, posterPayload } from './cloud-posters.js';
const node = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
const MB = value => `${(Number(value ?? 0) / 1000000).toFixed(1)} MB`;
const action = (label, work) => { const b = node('button', label, 'secondary'); b.type = 'button'; b.onclick = () => Promise.resolve().then(work).catch(report); return b; };
let peopleView;
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
async function run(message, work, errorTarget = errorBox) {
  if (busy) return; busy = true; errorBox.hidden = true; errorTarget.hidden = true; statusBox.textContent = message;
  body.inert = true; document.getElementById('cloudBack').disabled = true; dialog.querySelectorAll('[data-nav]').forEach(button => { button.disabled = true; });
  try { return await work(); } catch (error) { if (error.accessChanged) await recoverAccess(); report(error, errorTarget.isConnected ? errorTarget : errorBox); }
  finally { busy = false; body.inert = false; document.getElementById('cloudBack').disabled = false; dialog.querySelectorAll('[data-nav]').forEach(button => { button.disabled = false; }); statusBox.textContent = ''; if (authReloadPending && dialog.open) { authReloadPending = false; source = null; area = 'initial'; void load(null, true); } }
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
function close() { if (busy) return; viewEpoch++; renderedView = null; clearTimeout(statusTimer); cancelThumbnails(); dialog.close(); body.querySelectorAll('video').forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); }); source = null; hooks.closed?.(); }
async function navigate(next, library = null) {
  source = null; area = next; if (['admin', 'create'].includes(next)) await run('Laden …', () => load(library)); else await load(library, true);
}
function focusSection(box) {
  box.tabIndex = -1; box.focus(); box.scrollIntoView({ block: 'start' });
}
let viewEpoch = 0, statusTimer, displayedOwner = null, renderedView = null, authReloadPending = false;
let localUpdates = [];
let localContent = new Map();
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
const sameContent = (a, b) => a.size === b.size && [...a].every(([size, hashes]) => hashes.size === b.get(size)?.size && [...hashes].every(hash => b.get(size).has(hash)));
function cacheStatus(message, temporary = false) {
  clearTimeout(statusTimer); statusBox.textContent = message;
  if (temporary) statusTimer = setTimeout(() => { if (!busy) statusBox.textContent = ''; }, 3500);
}
const lastStand = at => `Letzter Stand: ${new Date(at).toLocaleString('de')}`;
function maintainCloud(owner, me) { cloudReadState.maintain(owner, me, async () => {
  if (dialog.open && !busy && !source && ['figures', 'libraries'].includes(area)) await load(current);
}); }
async function load(library = current, allowCache = false) {
  let epoch = ++viewEpoch;
  let owner, cached, detail, available;
  try {
    const beforeLogin = cloudIdentity(); owner = await cloudReadState.open();
    if (beforeLogin !== owner && dialog.open) epoch = ++viewEpoch;
    if (epoch !== viewEpoch || !dialog.open) return;
    current = library;
    const active = () => epoch === viewEpoch && dialog.open && owner === cloudIdentity();
    void Promise.resolve().then(() => hooks.localFigures()).then(figures => {
      if (active()) {
        localFigures = figures; localUpdates.forEach(update => update());
        void localVideoContent(figures, figureMedia, active).then(content => {
          if (active() && !sameContent(localContent, content)) { localContent = content; localUpdates.forEach(update => update()); }
        });
      }
      return figures;
    }).catch(() => localFigures);
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
    const editing = !snapshot.accessChanged && cached && (busy || allowCache !== 'refresh' && body.querySelector('details[open], video, form input:focus, form textarea:focus, input[type=checkbox]:not(:checked)'));
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
  current = library; localUpdates = [];
  if (area === 'initial' || area === 'figures' && !source && !hasOwnArea(state)) area = initialArea(state);
  renderedView = { owner: cloudIdentity(), area, library };
  if (!state.me && !['figures', 'libraries'].includes(area)) area = 'libraries';
  cancelThumbnails(); clearPreviews(body); body.replaceChildren();
  posterView = createPosterView(body, state.me);
  const toolbar = node('div', undefined, 'cloud-tabs');
  toolbar.setAttribute('aria-label', 'Cloud-Bereiche');
  for (const [key, label] of [...(hasOwnArea(state) ? [['figures', 'Meine Figuren']] : []), ['libraries', 'Bibliotheken']]) {
    const button = action(label, () => navigate(key)); if (key === 'figures') button.setAttribute('aria-label', 'Meine Cloud-Figuren'); button.setAttribute('aria-pressed', String(!source && (current ? key === 'libraries' : area === key || (area === 'create' && key === 'libraries')))); toolbar.append(button);
  }
  const utilities = node('div', undefined, 'cloud-utilities');
  if (state.me?.is_admin) utilities.append(action('Plattformverwaltung', () => navigate('admin')));
  utilities.append(action('Aktualisieren', () => load(current, 'refresh')));
  if (signedIn()) utilities.append(action('Abmelden', async () => { await logout(); await run('Laden …', () => load(null)); }));
  if (state.me) body.append(toolbar, utilities);
  if (state.me?.is_admin) body.append(node('p', 'Plattform-Administrator', 'cloud-role-badge'));
  if (state.me) body.append(node('p', `${state.me.email} · ${MB(state.me.used)} / ${MB(state.me.quota)} belegt${state.me.upload_enabled ? '' : ' · Lesen erlaubt, Uploads gesperrt'}`, 'cloud-account'));
  else {
    if (current) {
      const back = action('‹ Alle öffentlichen Bibliotheken', () => load(null, true)); back.className = 'cloud-public-back'; body.append(back);
      await libraryView(current, detail);
    }
    else publicLibraries();
    guestLogin();
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
    const box = section(lib.title); if (lib.owner_id === state.me?.id) box.append(node('p', 'Besitzer · Bibliothek verwalten', 'cloud-role-badge')); else if (lib.manage) box.append(node('p', 'Plattform-Administrator · Bibliothek verwalten', 'cloud-role-badge')); else if (lib.contribute) box.append(node('p', 'Mitwirkender', 'cloud-role-badge')); else box.append(node('p', 'Lesen', 'cloud-role-badge')); box.append(node('p', `${lib.visibility === 'public' ? 'Öffentlich' : 'Privat'} · ${lib.collaborative ? 'Mitwirkende erlaubt' : 'Nur Besitzer'} · ${lib.moderated ? 'Mit Freigabe' : 'Sofort veröffentlichen'}`));
    box.append(action('Öffnen', () => load(lib.id, true)));
  }
  if (!state.libraries.length) body.append(node('p', 'Noch keine zugänglichen Bibliotheken.'));

}
function libraryForm(lib = null) {
  const box = section(lib ? 'Bibliothek einstellen' : 'Bibliothek erstellen'), form = node('form'); box.append(form);
  const title = field(form, 'Name', lib?.title ?? ''), description = field(form, 'Beschreibung', lib?.description ?? '', 'textarea'); title.required = true; title.maxLength = 160;
  const visibility = select(form, 'Sichtbarkeit', [['private', 'Privat'], ['public', 'Öffentlich']], lib?.visibility ?? 'private');
  const collaborative = checkbox(form, 'Eingeladene Mitwirkende dürfen beitragen', lib?.collaborative ?? false), moderated = checkbox(form, 'Beiträge zuerst freigeben', lib?.moderated ?? true);
  form.append(action('Bibliothek speichern', () => {
    if (!form.reportValidity()) return;
    return run('Speichern …', async () => { const result = await cloudCall('library_save', { id: lib?.id, title: title.value, description: description.value, visibility: visibility.value, collaborative: collaborative.checked, moderated: moderated.checked }); await load(result.id); });
  }));
  if (!lib) form.append(action('Abbrechen', () => navigate('libraries')));
  form.onsubmit = event => event.preventDefault();
}
async function libraryView(id, detail) {
  const lib = detail.library;
  const intro = section(lib.title); intro.append(node('p', lib.description));
  intro.append(node('p', lib.owner_id === state.me?.id ? 'Besitzer · Bibliothek verwalten' : detail.manage ? 'Plattform-Administrator · Bibliothek verwalten' : detail.contribute ? 'Mitwirkender' : 'Lesen', 'cloud-role-badge'));
  if (state.me && !state.me.upload_enabled && detail.members?.some(m => m.id === state.me.id && m.role === 'contributor')) intro.append(node('p', 'Mitwirken benötigt eine Upload-Freigabe.', 'cloud-person-notice'));
  // Share the public entry point, never this WebView's internal or preview URL.
  const share = new URL('https://rodriges17.github.io/SalsaAppCloud/'); share.searchParams.set('library', id);
  const link = field(intro, 'Bibliothekslink', share.href); link.readOnly = true;
  intro.append(action('Link kopieren', async () => {
    try { await navigator.clipboard.writeText(link.value); }
    catch { link.focus(); link.select(); report(new Error('Bitte den markierten Link kopieren.')); }
  }));
  if (lib.visibility === 'private') intro.append(node('p', 'Zum Öffnen sind Anmeldung und Bibliotheksberechtigung erforderlich.'));
  if (lib.visibility === 'public') intro.append(node('p', 'Figuren ohne Zustimmung zur öffentlichen Veröffentlichung bleiben für Lesende verborgen.'));
  libraryDownloadControls(intro, detail.entries);
  for (const entry of detail.entries) {
    const box = section(entry.published?.title ?? entry.pending?.title ?? 'Figur ohne veröffentlichte Version');
    if (entry.published) revisionCard(box, entry.published, 'Veröffentlicht');
    if (entry.pending) {
      revisionCard(box, entry.pending, 'Zur Freigabe');
      if (detail.manage) box.append(action('Freigeben', () => review(true)), action('Ablehnen', () => review(false)));
    }
    async function review(accept) { await run('Prüfung speichern …', async () => { await cloudCall('review', { library: id, figure: entry.figure_id, accept }); await load(id); }); }
    if (detail.manage || entry.owner_id === state.me?.id) box.append(action('Aus Bibliothek entfernen', () => run('Entfernen …', async () => { await cloudCall('detach', { library: id, figure: entry.figure_id }); await load(id); })));
    if (state.me?.upload_enabled && entry.published) variantButton(box, entry.published);
    if (detail.contribute && entry.published) box.append(action('In weitere Bibliothek aufnehmen', () => attachForm(entry.published)));
  }
  if (detail.manage) {
    libraryForm(lib);
    createMemberView({ box: section('Mitglieder & Zugriff'), lib, members: detail.members, me: state.me, people: state.people ?? [], node, action, field, select, call: cloudCall, run, confirm: options => hooks.confirm(options), refresh: () => load(id) });
    const danger = section('Gefahrenbereich'); danger.classList.add('danger-zone');
    danger.append(node('p', 'Beim Löschen werden diese Bibliothek und ihre Mitgliedschaften entfernt. Cloud-Figuren, Videos und lokale Kopien bleiben erhalten.'));
    const remove = action('Bibliothek löschen', async () => {
      if (await hooks.confirm({ title: `Bibliothek „${lib.title}“ löschen?`, message: `„${lib.title}“ und ihre Mitgliedschaften werden entfernt. Cloud-Figuren, Videos und lokale Kopien bleiben erhalten.`, ok: 'Bibliothek löschen', destructive: true })) {
        await run('Löschen …', async () => { await cloudCall('library_delete', { id }); area = 'libraries'; await load(null); });
      }
    }); remove.className = 'danger-button'; danger.append(remove);
  }
}
function libraryDownloadControls(parent, entries) {
  const revisions = [...new Map(entries.filter(entry => entry.published?.videos?.length).map(entry => [entry.published.id, entry.published])).values()];
  if (!revisions.length) return;
  const box = node('div', undefined, 'cloud-library-download');
  const resultText = node('p', undefined, 'cloud-library-download-result'); resultText.setAttribute('role', 'status'); resultText.hidden = true;
  const failures = node('ul'); failures.hidden = true;
  const progress = node('progress'); progress.setAttribute('aria-label', 'Bibliothek lokal verfügbar machen'); progress.hidden = true;
  const start = action('Alle Figuren lokal verfügbar machen', () => run('Lokalen Bestand prüfen …', async () => {
    const settings = await storageSettings();
    if (settings.activeFolder && settings.folders.find(folder => folder.id === settings.activeFolder)?.access !== 'granted') throw new Error('Bitte den gewählten Geräteordner in den Einstellungen freigeben, bevor du die Bibliothek herunterlädst.');
    controller = new AbortController(); const signal = controller.signal;
    const cancel = document.getElementById('cloudCancelUpload'); cancel.textContent = 'Download abbrechen'; cancel.hidden = false;
    progress.hidden = false; progress.max = revisions.length; progress.value = 0; resultText.hidden = false; failures.replaceChildren(); failures.hidden = true;
    try {
      const result = await downloadLibrary(revisions, {
        listFigures, readMedia: figureMedia, readCloudMedia: cloudMediaHash, inspectVideo: inspectCloudVideo, saveFigure,
        async fetchVideo(revision, video, signal) {
          const signed = await cloudCall('media_url', { revision: revision.id, media: video.id }); signal.throwIfAborted();
          const response = await fetch(signed.url, { signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]) });
          if (!response.ok) throw new Error('Video konnte nicht geladen werden. Bitte erneut versuchen.');
          const blob = await response.blob(); return blob.slice(0, blob.size, video.type);
        },
        async readPoster(revision) {
          const cached = await readCloudCache(cloudIdentity(), `poster:${revision.id}`);
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
      localFigures = await hooks.localFigures();
      localContent = await localVideoContent(localFigures, figureMedia); localUpdates.forEach(update => update());
    } finally { controller = null; cancel.hidden = true; cancel.textContent = 'Upload abbrechen'; progress.hidden = true; }
  }));
  start.className = 'primary';
  box.append(start, node('p', 'Alle veröffentlichten Figuren direkt im gewählten lokalen Speicher sichern. Vorhandene Videos werden wiederverwendet; bestehende Lernstände und Notizen bleiben erhalten.'), progress, resultText, failures);
  parent.append(box);
}
function versionLabel(revision) {
  const date = new Date(revision.created_at);
  return Number.isFinite(date.getTime()) ? `Version vom ${date.toLocaleString('de', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Version ohne Datumsangabe';
}
function clearPreviews(root) { root.querySelectorAll('video').forEach(player => { player.pause(); player.removeAttribute('src'); player.load(); player.remove(); }); }
async function previewVideo(box, revision, video) {
  const signed = await cloudCall('media_url', { revision: revision.id, media: video.id });
  if (!box.isConnected || box.closest('details')?.open === false) return;
  clearPreviews(box);
  const player = node('video'); player.controls = true; player.playsInline = true; player.src = signed.url; box.append(player);
}
function revisionCard(parent, rev, label) {
  const box = node('article', undefined, 'cloud-revision'), heading = node('div', undefined, 'revision-heading');
  const copy = node('div'); copy.append(node('h4', label), node('p', versionLabel(rev))); heading.append(copy);
  if (rev.videos?.[0]) thumbnail(heading, rev);
  box.append(heading);
  if (rev.title !== parent.querySelector('h3').textContent) box.append(node('p', rev.title, 'revision-title'));
  parent.append(box);
  box.append(node('p', rev.description), node('p', rev.tags.join(' · ')));
  downloadControls(box, rev);
}
function downloadControls(box, rev, { own = false, revisionIds = [rev.id] } = {}) {
  if (!rev.videos.length) return;
  const chosen = [], multiple = rev.videos.length > 1;
  const localStatus = node('p', '', 'cloud-local-status'); localStatus.hidden = true; localStatus.setAttribute('role', 'status');
  box.firstElementChild?.after(localStatus);
  if (multiple) box.append(node('h4', 'Videos zum Herunterladen auswählen'));
  for (const v of rev.videos) {
    const label = `${v.name || 'Video'} · ${MB(v.size)}`;
    const check = multiple ? checkbox(box, label, true) : null;
    if (!multiple) box.append(node('p', label));
    chosen.push([check, v]);
    box.append(action(`Video: ${v.name || 'Ohne Namen'}`, () => previewVideo(box, rev, v)));
  }
  const fingerprint = selected => `cloud:${rev.id}:${selected.map(v => v.id).join(',')}`;
  const label = own ? 'Lokal übernehmen' : multiple ? 'Ausgewählte Videos in meine Figuren übernehmen' : 'In meine Figuren übernehmen';
  const download = () => run('Videos herunterladen …', async () => {
    const selected = chosen.filter(([check]) => !check || check.checked).map(([, v]) => v);
    if (!selected.length) throw new Error('Bitte mindestens ein Video auswählen.');
    if (selected.reduce((n, v) => n + v.size, 0) > 250 * 1024 * 1024) throw new Error('Bitte weniger Videos wählen: maximal 250 MB pro Übernahme.');
    const target = await hooks.chooseImport({ title: rev.title, fingerprint: fingerprint(selected), revisionIds });
    if (!target) return;
    const drafts = [];
    for (const v of selected) {
      const signed = await cloudCall('media_url', { revision: rev.id, media: v.id });
      const response = await fetch(signed.url, { signal: AbortSignal.timeout(120000) }); if (!response.ok) throw new Error('Video konnte nicht geladen werden. Bitte erneut versuchen.');
      const blob = await response.blob(); if (blob.size !== v.size) throw new Error('Unvollständiger Download.');
      drafts.push({ name: v.name, blob: blob.slice(0, blob.size, v.type), confirmed: false, existing: false, duration: 0, poster: null });
    }
    const imported = { title: rev.title, description: rev.description, tags: rev.tags, fingerprint: fingerprint(selected), drafts };
    // Leave the busy state before opening the local editor.
    busy = false; close(); await hooks.imported(imported, target.figure);
  });
  const take = action(label, download);
  // Keep recovery available when files were removed or modified outside the app.
  const repair = action('Lokale Kopie erneut herunterladen', download); repair.className = 'subtle'; repair.hidden = true;
  if (own) take.className = 'primary';
  box.append(take, repair);
  let checkedContent, contentMatches = new Set();
  const update = () => {
    if (checkedContent !== localContent) {
      checkedContent = localContent; contentMatches = new Set();
      const content = localContent;
      void matchingLocalVideos(rev, content, cloudMediaHash, () => dialog.open && box.isConnected && content === localContent).then(matches => {
        if (box.isConnected && content === localContent) { contentMatches = matches; update(); }
      });
    }
    const selected = chosen.filter(([check]) => !check || check.checked).map(([, v]) => v);
    const prefix = `cloud:${rev.id}:`;
    const linked = localIndex.availability(state.me?.id, rev.id, localFigures);
    const selections = [...localFigures.filter(f => f.importFingerprint?.startsWith(prefix))
      .map(f => new Set(f.importFingerprint.slice(prefix.length).split(','))), ...linked.available];
    const available = new Set([...selections.flatMap(ids => [...ids]), ...contentMatches]);
    const accessRequired = linked.accessRequired.some(ids => rev.videos.some(v => ids.has(v.id) && !available.has(v.id)));
    const exists = selected.length > 0 && selected.every(v => available.has(v.id));
    const complete = rev.videos.every(v => available.has(v.id));
    localStatus.hidden = !available.size && !accessRequired;
    localStatus.dataset.accessRequired = String(accessRequired);
    localStatus.textContent = !available.size && accessRequired ? 'Lokal zugeordnet · Ordnerzugriff erforderlich'
      : (complete ? '✓ Bereits lokal vorhanden' : '✓ Teilweise lokal vorhanden') + (accessRequired ? ' · Ordnerzugriff erforderlich' : '');
    take.textContent = exists ? '✓ Lokal vorhanden' : label; take.disabled = exists;
    repair.hidden = !exists;
    take.title = exists ? 'Die ausgewählten Videos dieser Version sind bereits in deinen lokalen Figuren vorhanden.' : '';
  };
  chosen.forEach(([check]) => { if (check) check.onchange = update; }); localUpdates.push(update); update();
}
function attachForm(revision) {
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
    if (!await hooks.confirm({ title: 'Eigene Variante erstellen?', message: 'Die Variante ist unabhängig bearbeitbar. Vorhandene Videos und Bilder werden ohne zusätzliche Dateikopie referenziert.', ok: 'Variante erstellen' })) return;
    await run('Variante erstellen …', async () => { await cloudCall('variant', { revision: revision.id }); area = 'figures'; await load(null); });
  }));
}
function ownFigures() {
  for (const f of state.trash ?? []) {
    const box = section('Papierkorb · ' + f.title);
    box.append(node('p', 'Wiederherstellbar bis ' + new Date(Date.parse(f.deleted_at) + 30 * 86400000).toLocaleDateString('de')));
    box.append(action('Figur wiederherstellen', () => run('Wiederherstellen …', async () => { await cloudCall('restore_figure', { figure: f.id }); await load(null); })));
  }
  if (!state.own_figures.length) body.append(node('p', 'Noch keine eigenen Cloud-Figuren. Lade eine lokale Figur über „In Cloud veröffentlichen“ hoch.'));
  for (const f of state.own_figures) {
    const revisions = [...f.revisions].sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
    const latest = revisions[0], box = section(latest?.title ?? 'Noch nicht fertig hochgeladene Figur');
    if (latest?.videos?.[0]) { box.querySelector('h3').classList.add('has-thumbnail'); thumbnail(box.querySelector('h3'), latest); }
    box.append(node('p', `Öffentliche Veröffentlichung: ${f.public_allowed ? 'Erlaubt' : 'Nicht erlaubt'}`));
    if (f.owner_id === state.me?.id) box.append(action(f.public_allowed ? 'Öffentliche Veröffentlichung widerrufen' : 'Öffentliche Veröffentlichung erlauben', () => run('Freigabe ändern …', async () => {
      if (f.public_allowed && !await hooks.confirm({ title: 'Öffentliche Freigabe widerrufen?', message: 'Alle Zuordnungen zu öffentlichen Bibliotheken werden entfernt. Private Zuordnungen bleiben bestehen.', ok: 'Freigabe widerrufen' })) return;
      await cloudCall('public_permission', { figure: f.id, allowed: !f.public_allowed }); await load(null);
    })));
    box.append(node('p', 'Die Freigabe gilt für alle Versionen dieser Figur und alle öffentlichen Bibliotheken, denen sie zugeordnet ist. Beim Widerrufen werden öffentliche Zuordnungen entfernt. Private Bibliotheken bleiben unverändert.'));
    if (latest) {
      if (state.me.upload_enabled) variantButton(box, latest);
      if (f.owner_id === state.me.id) {
        const editors = node('details'); editors.append(node('summary', 'Bearbeiter verwalten')); box.append(editors);
        const email = field(editors, 'E-Mail des Bearbeiters');
        const list = node('p'); editors.append(list);
        const refreshEditors = async () => { const result = await cloudCall('editor', { figure: f.id }); list.textContent = result.editors.map(e => e.email).join(', ') || 'Keine zusätzlichen Bearbeiter'; };
        editors.addEventListener('toggle', () => { if (editors.open) void run('Bearbeiter laden …', refreshEditors); });
        for (const [label, remove] of [['Bearbeiter hinzufügen', false], ['Bearbeiter entfernen', true]]) editors.append(action(label, () => run('Berechtigung speichern …', async () => { await cloudCall('editor', { figure: f.id, email: email.value, remove }); await refreshEditors(); })));
      }
      downloadControls(box, latest, { own: true, revisionIds: revisions.map(r => r.id) });
      const assign = action('Einer Bibliothek zuordnen', () => attachForm(latest)); assign.className = 'secondary'; if (state.me.upload_enabled) box.append(assign);
      const history = node('details', undefined, 'cloud-history');
      history.append(node('summary', `Versionsverlauf · ${revisions.length} ${revisions.length === 1 ? 'Version' : 'Versionen'}`));
      for (const revision of revisions) {
        const entry = node('article', undefined, 'version-entry');
        entry.append(node('h4', `${versionLabel(revision)}${revision.id === latest.id ? ' · Neueste Version' : ''}`), node('p', revision.title));
        for (const video of revision.id === latest.id ? revision.videos : []) entry.append(action(`Video: ${video.name || 'Ohne Namen'}`, () => previewVideo(entry, revision, video)));
        if (revision.id !== latest.id) downloadControls(entry, revision, { own: true, revisionIds: revisions.map(r => r.id) });
        if (revision.id !== latest.id && state.me.upload_enabled) entry.append(action('Diese Version einer Bibliothek zuordnen', () => attachForm(revision)));
        history.append(entry);
      }
      history.addEventListener('toggle', () => {
        if (!history.open) clearPreviews(history);
      });
      box.append(history);
    }
    if (f.owner_id === state.me?.id) box.append(action('Cloud-Figur samt Videos löschen', async () => {
      if (!await hooks.confirm({ title: 'Cloud-Figur löschen?', message: 'Die Figur wird für 30 Tage in den Papierkorb verschoben. Entferne zuvor alle Bibliothekszuordnungen. Gemeinsam verwendete Dateien bleiben erhalten.', ok: 'Cloud-Figur löschen' })) return;
      await run('Cloud-Figur löschen …', async () => { await cloudCall('delete_figure', { figure: f.id }); await load(null); });
    }));
  }
}
async function publishForm() {
  const me = state.me;
  if (!me?.upload_enabled) { body.append(node('p', 'Für Cloud-Uploads brauchst du die Freischaltung des Administrators.')); return; }
  const local = source, records = await figureVideos(local), libs = state.libraries.filter(l => l.contribute);
  const box = section(`„${local.title}“ hochladen`), selected = [];
  const step = (number, title) => { const group = node('div', undefined, 'upload-step'); group.append(node('h4', `${number} · ${title}`)); box.append(group); return group; };
  const videoStep = step(1, 'Video'), targetStep = step(2, 'Ziel'), optionsStep = step(3, 'Hochladen');
  for (const record of records) selected.push([checkbox(videoStep, `${record.name || 'Video'} · ${MB(record.blob.size)}`, true), record]);
  videoStep.append(node('p', 'Maximal 50 MB pro Video. Identische Videos werden erkannt und nur einmal gespeichert. Bereits zugängliche Videos können ohne erneuten Upload übernommen werden.'));
  const library = select(targetStep, 'Bibliothek', [['', 'Nur in Meine Cloud-Figuren hochladen'], ...libs.map(l => [l.id, l.title])]);
  // Reservations can create a figure before any revision exists. They are not
  // valid version targets until the first upload has completed.
  const targets = state.own_figures.filter(f => f.revisions?.length);
  const names = new Map();
  for (const f of targets) { const title = f.revisions[0].title; names.set(title, (names.get(title) ?? 0) + 1); }
  const figure = select(optionsStep, 'Neue Figur oder neue Version', [['', 'Neue Cloud-Figur'], ...targets.map(f => {
    const latest = f.revisions[0], title = latest.title;
    return [f.id, names.get(title) > 1 ? `${title} · ${new Date(latest.created_at).toLocaleString('de')}` : title];
  })]);
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
    if (figure.value) visibilityHint.textContent += ' Bei einer neuen Version gelten bestehende Bibliothekszuordnungen und deren Freigaberegeln weiterhin.';
    uploadError.hidden = true;
  };
  library.onchange = updateVisibility; allowed.onchange = updateVisibility;
  figure.onchange = () => { allowed.checked = state.own_figures.find(f => f.id === figure.value)?.public_allowed ?? false; updateVisibility(); };
  updateVisibility();
  const upload = action('Ausgewählte Figur hochladen', () => run('Upload vorbereiten …', async () => {
    const videos = selected.filter(([check]) => check.checked).map(([, v]) => v);
    if (!videos.length) throw new Error('Bitte mindestens ein Video auswählen.');
    if (videos.some(v => v.blob.size > CLOUD_FILE_LIMIT)) throw new Error('Ein Video überschreitet 50 MB. Bitte ein kleineres Originalvideo auswählen.');
    if (state.libraries.find(l => l.id === library.value)?.visibility === 'public' && !allowed.checked) throw new Error('Für diese öffentliche Bibliothek musst du der öffentlichen Veröffentlichung zustimmen.');
    const owner = state.me.id;
    let job = null; controller = new AbortController(); document.getElementById('cloudCancelUpload').hidden = false;
    try {
      statusBox.textContent = 'Videos auf Duplikate prüfen …';
      const hashes = [];
      for (const video of videos) { controller.signal.throwIfAborted(); hashes.push(await videoHash(video.blob)); }
      const { matches } = await cloudCall('duplicates', { hashes });
      duplicateBox.replaceChildren();
      if (!figure.value && !explicitVariant.checked && matches.length) {
        duplicateBox.append(node('p', 'Dieses Video gehört bereits zu einer zugänglichen Figur. Verwende die bestehende Figur oder wähle ausdrücklich eine eigene Variante.'));
        const unique = [...new Map(matches.map(m => [m.figure, m])).values()];
        const choice = select(duplicateBox, 'Bestehende Figur', unique.map(m => [m.revision, m.title]));
        duplicateBox.append(action('Bestehende Figur verwenden', () => run('Figur referenzieren …', async () => {
          if (library.value) { await cloudCall('attach', { library: library.value, revision: choice.value }); source = null; area = 'libraries'; await load(library.value); }
          else { const match = unique.find(m => m.revision === choice.value); attachForm({ ...match, id: match.revision }); }
        })));
        return;
      }
      if (figure.value && !allowed.checked && state.own_figures.find(f => f.id === figure.value)?.public_allowed && !await hooks.confirm({ title: 'Öffentliche Freigabe widerrufen?', message: 'Öffentliche Bibliothekszuordnungen werden entfernt.', ok: 'Widerrufen und speichern' })) return;
      const reserved = await cloudCall('reserve', { figure: figure.value || null, variant: explicitVariant.checked, videos: videos.map((v, i) => ({ size: v.blob.size, type: v.blob.type, reuse: matches.find(m => m.hash === hashes[i])?.media })) }); job = reserved.job;
      for (let i = 0; i < videos.length; i++) {
        controller.signal.throwIfAborted(); statusBox.textContent = `Video ${i + 1} von ${videos.length} hochladen …`;
        if (!reserved.media[i].reused) {
          await uploadMedia(reserved.media[i].path, videos[i].blob, controller.signal);
          await cloudCall('finalize', { id: reserved.media[i].id });
        }
      }
      controller.signal.throwIfAborted();
      const poster = await posterPayload(local.poster).catch(() => null);
      const saved = await cloudCall('commit', { job, ...(poster ? { poster } : {}), public_allowed: allowed.checked, title: local.title, description: local.description, tags: local.tags, videos: reserved.media.map((m, i) => ({ id: m.id, name: videos[i].name })) }); job = null;
      const linked = localIndex.remember(owner, saved.revision, local, reserved.media.map((media, i) => ({ cloud: media.id, local: videos[i].id })));
      if (library.value) await cloudCall('attach', { library: library.value, revision: saved.revision });
      source = null; area = library.value ? 'libraries' : 'figures'; await load(library.value || null);
      if (!linked) report(new Error('Upload erfolgreich. Die lokale Zuordnung konnte nicht dauerhaft gespeichert werden. Bitte freien App-Speicher prüfen.'));
    } catch (error) {
      if (job) await cloudCall('abort', { job }).catch(() => {});
      throw error;
    } finally { controller = null; document.getElementById('cloudCancelUpload').hidden = true; }
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
    const card = section(library.title, catalog);
    card.append(node('p', 'Öffentlich', 'cloud-public-badge'));
    if (library.description) card.append(node('p', library.description));
    card.append(action('Öffnen', () => load(library.id, true)));
  }
  if (!catalog.childElementCount) catalog.append(node('p', 'Noch keine öffentlichen Bibliotheken.'));
}
function guestLogin() {
  const details = node('details', undefined, 'cloud-guest-login');
  const summary = node('summary');
  summary.append(node('span', 'Anmelden', 'cloud-guest-login-title'), node('span', 'Für private Bibliotheken und Verwaltung', 'cloud-guest-login-hint'));
  details.append(summary);
  const content = node('div', undefined, 'cloud-guest-login-content'); details.append(content);
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
  form.append(action('Anmelden', () => run('Anmelden …', async () => { await loginWithLink(link.value.trim()); area = 'initial'; await load(null); }, error)), error);
  form.onsubmit = event => event.preventDefault();
  adminLoginForm(adminPanel);
  if (signedIn()) content.append(action('Abmelden', async () => { await logout(); await run('Laden …', () => load(null)); }));
  body.append(details);
}
function adminLoginForm(parent) {
  const form = node('form'); parent.append(form);
  const email = field(form, 'Admin-E-Mail-Adresse', '', 'email'); email.autocomplete = 'username'; email.required = true;
  const password = field(form, 'Admin-Passwort', '', 'password'); password.autocomplete = 'current-password'; password.required = true;
  const error = node('p', '', 'error'); error.setAttribute('role', 'alert'); error.hidden = true;
  const submit = async () => {
    if (!form.reportValidity()) return;
    await run('Admin anmelden …', async () => {
      try { await loginWithPassword(email.value, password.value); area = 'initial'; await load(null); }
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
  peopleView = createPeopleView({ node, action, field, select, checkbox, call: cloudCall, run, confirm: options => hooks.confirm(options), state: () => state, refresh: () => load(null), report, section });
  dialog = document.getElementById('cloudDialog'); body = document.getElementById('cloudBody'); errorBox = document.getElementById('cloudError'); statusBox = document.getElementById('cloudStatus');
  addEventListener('cloud-session-changed', event => {
    peopleView.reset(); viewEpoch++; renderedView = null; state = null; displayedOwner = null; localFigures = []; localUpdates = [];
    cancelThumbnails(); clearPreviews(body); body.replaceChildren(); errorBox.hidden = true; cacheStatus('');
    // Explicit login/logout reload their own destination; token rotation leaves forms intact.
    if ((event.detail?.external || event.detail?.expired) && dialog.open) {
      if (busy) authReloadPending = true;
      else { source = null; area = 'initial'; void load(null, true); }
    }
  });
  document.getElementById('cloudBack').onclick = close;
  dialog.querySelector('[data-nav=figures]').onclick = close;
  dialog.querySelector('[data-nav=cloud]').onclick = () => { if (!busy) navigate('initial'); };
  document.getElementById('cloudCancelUpload').onclick = () => controller?.abort();
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
  document.getElementById('cloudButton').onclick = () => openCloud();
  const query = new URLSearchParams(location.search); if (query.has('library') || query.has('cloud')) setTimeout(() => openCloud(null, query.get('library')), 0);
}
export async function openCloud(local = null, library = null) {
  if (busy || dialog.open) return; source = local; current = library; area = 'initial';
  errorBox.hidden = true; if (displayedOwner !== cloudIdentity() || local) { cancelThumbnails(); clearPreviews(body); body.replaceChildren(); }
  // Do not let dialog focus restoration reopen the search keyboard on return.
  if (document.activeElement?.matches('input, textarea, [contenteditable=true]')) document.activeElement.blur();
  dialog.showModal();
  if (local) await run('Cloud-Inhalte werden geladen …', () => load(library)); else await load(library, true);
}
