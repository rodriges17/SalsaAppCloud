import { cloudCall, signedIn, uploadMedia, logout, loginWithLink, finishLogin } from './cloud-api.js';
import { CLOUD_FILE_LIMIT } from './cloud-config.js';
import { figureVideos } from './storage.js';
import { createPosterView, posterPayload } from './cloud-posters.js';
const node = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
const MB = value => `${(Number(value ?? 0) / 1000000).toFixed(1)} MB`;
const action = (label, work) => { const b = node('button', label, 'secondary'); b.type = 'button'; b.onclick = () => Promise.resolve().then(work).catch(report); return b; };
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
function section(title) { const s = node('section', undefined, 'cloud-card'); s.append(node('h3', title)); body.append(s); return s; }
async function run(message, work, errorTarget = errorBox) {
  if (busy) return; busy = true; errorBox.hidden = true; errorTarget.hidden = true; statusBox.textContent = message;
  body.inert = true; document.getElementById('cloudBack').disabled = true; dialog.querySelectorAll('[data-nav]').forEach(button => { button.disabled = true; });
  try { return await work(); } catch (error) { report(error, errorTarget); }
  finally { busy = false; body.inert = false; document.getElementById('cloudBack').disabled = false; dialog.querySelectorAll('[data-nav]').forEach(button => { button.disabled = false; }); statusBox.textContent = ''; }
}
function close() { if (busy) return; cancelThumbnails(); dialog.close(); body.querySelectorAll('video').forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); }); source = null; }
async function navigate(next, library = null) {
  source = null; area = next; await run('Laden …', () => load(library));
}
function focusSection(box) {
  box.tabIndex = -1; box.focus(); box.scrollIntoView({ block: 'start' });
}
async function load(library = current) {
  await finishLogin(); state = await cloudCall('state'); current = library;
  if (state.me) {
    const cleaned = await cloudCall(state.me.is_admin ? 'admin_cleanup' : 'cleanup').catch(() => null);
    if (cleaned?.cleaned) state = await cloudCall('state');
  }
  if (area === 'initial') area = state.me ? 'figures' : 'libraries';
  if (!state.me && !['figures', 'libraries'].includes(area)) area = 'libraries';
  cancelThumbnails(); clearPreviews(body); body.replaceChildren();
  posterView = createPosterView(body, state.me);
  const toolbar = node('div', undefined, 'cloud-tabs');
  toolbar.setAttribute('aria-label', 'Cloud-Bereiche');
  for (const [key, label] of [['libraries', 'Bibliotheken'], ['figures', 'Meine Figuren']]) {
    const button = action(label, () => navigate(key)); if (key === 'figures') button.setAttribute('aria-label', 'Meine Cloud-Figuren'); button.setAttribute('aria-pressed', String(!source && (current ? key === 'libraries' : area === key || (area === 'create' && key === 'libraries')))); toolbar.append(button);
  }
  const utilities = node('div', undefined, 'cloud-utilities');
  if (state.me?.is_admin) utilities.append(action('Verwaltung', () => navigate('admin')));
  utilities.append(action('Aktualisieren', () => run('Laden …', () => load(current))));
  if (signedIn()) utilities.append(action('Abmelden', async () => { await logout(); await run('Laden …', () => load(null)); }));
  body.append(toolbar, utilities);
  if (state.me) body.append(node('p', `${state.me.email} · ${MB(state.me.used)} / ${MB(state.me.quota)} belegt${state.me.upload_enabled ? '' : ' · Lesen erlaubt, Uploads gesperrt'}`, 'cloud-account'));
  else {
    if (area === 'figures') body.append(node('h3', 'Meine Cloud-Figuren'), node('p', 'Melde dich an, um deine hochgeladenen Figuren zu sehen.'));
    else body.append(node('p', 'Öffentliche Bibliotheken sind ohne Anmeldung lesbar. Für private Bibliotheken und Beiträge erhältst du einen persönlichen Anmeldelink vom Administrator.'));
    body.append(node('p', 'Du bist derzeit nicht angemeldet. Bibliotheken erstellen und Verwaltung erscheinen nach der Anmeldung mit einem berechtigten Konto.'));
    const box = section('Mit persönlichem Link anmelden'), form = node('form'); box.append(form);
    const link = field(form, 'Anmeldelink einfügen', '', 'password'); link.autocomplete = 'off';
    box.append(node('p', 'Füge deinen persönlichen Anmeldelink hier ein, um dich in dieser App anzumelden. Die Anmeldung in einer anderen App oder einem anderen Browser wird nicht automatisch übernommen.'));
    form.append(action('Anmelden', () => run('Anmelden …', async () => { await loginWithLink(link.value.trim()); area = 'figures'; await load(null); }))); form.onsubmit = e => e.preventDefault();
  }
  if (!state.me && area === 'figures') return;
  if (source) { await publishForm(); return; }
  if (current) { await libraryView(current); return; }
  if (area === 'create') { libraryForm(); return; }
  if (area === 'figures') {
    body.append(node('h3', 'Meine Cloud-Figuren'), node('p', 'Alle deine hochgeladenen Figuren – auch ohne Bibliothekszuordnung. Eine Figur kann in mehreren Bibliotheken verwendet werden.'));
    ownFigures(); return;
  }
  if (area === 'admin' && state.me?.is_admin) { adminForm(); return; }
  body.append(node('h3', 'Bibliotheken'));
  if (state.me?.upload_enabled) { const create = action('Bibliothek erstellen', () => navigate('create')); create.className = 'primary'; body.append(create); }
  for (const lib of state.libraries) {
    const box = section(lib.title); box.append(node('p', `${lib.visibility === 'public' ? 'Öffentlich' : 'Privat'} · ${lib.collaborative ? 'Mitwirkende erlaubt' : 'Nur Besitzer'} · ${lib.moderated ? 'Mit Freigabe' : 'Sofort veröffentlichen'}`));
    box.append(action('Öffnen', () => run('Laden …', () => load(lib.id))));
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
async function libraryView(id) {
  const detail = await cloudCall('library', { id }), lib = detail.library;
  const intro = section(lib.title); intro.append(node('p', lib.description));
  const share = new URL(location.href); share.hash = ''; share.search = ''; share.searchParams.set('library', id);
  const link = field(intro, 'Bibliothekslink', share.href); link.readOnly = true;
  intro.append(action('Link kopieren', () => navigator.clipboard.writeText(link.value).catch(() => { link.select(); report(new Error('Bitte den markierten Link kopieren.')); })));
  if (lib.visibility === 'public') intro.append(node('p', 'Figuren ohne Zustimmung zur öffentlichen Veröffentlichung bleiben für Lesende verborgen.'));
  for (const entry of detail.entries) {
    const box = section(entry.published?.title ?? entry.pending?.title ?? 'Figur ohne veröffentlichte Version');
    if (entry.published) revisionCard(box, entry.published, 'Veröffentlicht');
    if (entry.pending) {
      revisionCard(box, entry.pending, 'Zur Freigabe');
      if (detail.manage) box.append(action('Freigeben', () => review(true)), action('Ablehnen', () => review(false)));
    }
    async function review(accept) { await run('Prüfung speichern …', async () => { await cloudCall('review', { library: id, figure: entry.figure_id, accept }); await load(id); }); }
    if (detail.manage || entry.owner_id === state.me?.id) box.append(action('Aus Bibliothek entfernen', () => run('Entfernen …', async () => { await cloudCall('detach', { library: id, figure: entry.figure_id }); await load(id); })));
    if (detail.contribute && entry.published) box.append(action('In weitere Bibliothek aufnehmen', () => attachForm(entry.published)));
  }
  if (detail.manage) {
    libraryForm(lib);
    const members = section('Mitglieder');
    members.append(node('p', 'Mitwirkende müssen vom Plattform-Administrator zum Upload freigeschaltet sein.'));
    for (const m of detail.members) members.append(node('p', `${m.email} · ${m.role === 'reader' ? 'Lesen' : 'Mitwirken'}`));
    const form = node('form'); members.append(form); const email = field(form, 'E-Mail-Adresse', '', 'email'); email.required = true;
    const role = select(form, 'Rolle', [['reader', 'Lesen'], ['contributor', 'Mitwirken'], ['remove', 'Entfernen']]);
    form.append(action('Mitglied speichern', () => { if (form.reportValidity()) return run('Speichern …', async () => { await cloudCall('member', { library: id, email: email.value, role: role.value }); await load(id); }); })); form.onsubmit = e => e.preventDefault();
    const danger = section('Gefahrenbereich'); danger.classList.add('danger-zone');
    danger.append(node('p', 'Beim Löschen werden diese Bibliothek und ihre Mitgliedschaften entfernt. Cloud-Figuren, Videos und lokale Kopien bleiben erhalten.'));
    const remove = action('Bibliothek löschen', async () => {
      if (await hooks.confirm({ title: `Bibliothek „${lib.title}“ löschen?`, message: `„${lib.title}“ und ihre Mitgliedschaften werden entfernt. Cloud-Figuren, Videos und lokale Kopien bleiben erhalten.`, ok: 'Bibliothek löschen', destructive: true })) {
        await run('Löschen …', async () => { await cloudCall('library_delete', { id }); area = 'libraries'; await load(null); });
      }
    }); remove.className = 'danger-button'; danger.append(remove);
  }
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
  const chosen = [], multiple = rev.videos.length > 1;
  if (multiple) box.append(node('h4', 'Videos zum Herunterladen auswählen'));
  for (const v of rev.videos) {
    const label = `${v.name || 'Video'} · ${MB(v.size)}`;
    const check = multiple ? checkbox(box, label, true) : null;
    if (!multiple) box.append(node('p', label));
    chosen.push([check, v]);
    box.append(action(`Video: ${v.name || 'Ohne Namen'}`, () => previewVideo(box, rev, v)));
  }
  box.append(action(multiple ? 'Ausgewählte Videos in meine Figuren übernehmen' : 'In meine Figuren übernehmen', () => run('Videos herunterladen …', async () => {
    const selected = chosen.filter(([check]) => !check || check.checked).map(([, v]) => v);
    if (!selected.length) throw new Error('Bitte mindestens ein Video auswählen.');
    if (selected.reduce((n, v) => n + v.size, 0) > 250 * 1024 * 1024) throw new Error('Bitte weniger Videos wählen: maximal 250 MB pro Übernahme.');
    const drafts = [];
    for (const v of selected) {
      const signed = await cloudCall('media_url', { revision: rev.id, media: v.id });
      const response = await fetch(signed.url, { signal: AbortSignal.timeout(120000) }); if (!response.ok) throw new Error('Video konnte nicht geladen werden. Bitte erneut versuchen.');
      const blob = await response.blob(); if (blob.size !== v.size) throw new Error('Unvollständiger Download.');
      drafts.push({ name: v.name, blob: blob.slice(0, blob.size, v.type), confirmed: false, existing: false, duration: 0, poster: null });
    }
    const imported = { title: rev.title, description: rev.description, tags: rev.tags, fingerprint: `cloud:${rev.id}:${selected.map(v => v.id).join(',')}`, drafts };
    // Leave the busy state before opening the local editor.
    busy = false; close(); await hooks.imported(imported);
  })));
}
function attachForm(revision) {
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
function cancelThumbnails() { posterView?.dispose(); posterView = null; }
function thumbnail(heading, revision) { posterView?.add(heading, revision); }
function ownFigures() {
  if (!state.own_figures.length) body.append(node('p', 'Noch keine eigenen Cloud-Figuren. Lade eine lokale Figur über „In Cloud veröffentlichen“ hoch.'));
  for (const f of state.own_figures) {
    const revisions = [...f.revisions].sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
    const latest = revisions[0], box = section(latest?.title ?? 'Noch nicht fertig hochgeladene Figur');
    if (latest?.videos?.[0]) { box.querySelector('h3').classList.add('has-thumbnail'); thumbnail(box.querySelector('h3'), latest); }
    box.append(node('p', `Öffentliche Veröffentlichung: ${f.public_allowed ? 'Erlaubt' : 'Nicht erlaubt'}`));
    box.append(action(f.public_allowed ? 'Öffentliche Veröffentlichung widerrufen' : 'Öffentliche Veröffentlichung erlauben', () => run('Freigabe ändern …', async () => {
      await cloudCall('public_permission', { figure: f.id, allowed: !f.public_allowed }); await load(null);
    })));
    box.append(node('p', 'Die Freigabe gilt für alle Versionen dieser Figur und alle öffentlichen Bibliotheken, denen sie zugeordnet ist. Ohne Freigabe bleibt sie dort für Lesende verborgen. Private Bibliotheken bleiben unverändert.'));
    if (latest) {
      const assign = action('Einer Bibliothek zuordnen', () => attachForm(latest)); assign.className = 'primary'; box.append(assign);
      const history = node('details', undefined, 'cloud-history');
      history.append(node('summary', `Versionsverlauf · ${revisions.length} ${revisions.length === 1 ? 'Version' : 'Versionen'}`));
      for (const revision of revisions) {
        const entry = node('article', undefined, 'version-entry');
        entry.append(node('h4', `${versionLabel(revision)}${revision.id === latest.id ? ' · Neueste Version' : ''}`), node('p', revision.title));
        for (const video of revision.videos) entry.append(action(`Video: ${video.name || 'Ohne Namen'}`, () => previewVideo(entry, revision, video)));
        if (revision.id !== latest.id) entry.append(action('Diese Version einer Bibliothek zuordnen', () => attachForm(revision)));
        history.append(entry);
      }
      history.addEventListener('toggle', () => {
        if (!history.open) clearPreviews(history);
      });
      box.append(history);
    }
    box.append(action('Cloud-Figur samt Videos löschen', async () => {
      if (!await hooks.confirm({ title: 'Cloud-Figur löschen?', message: 'Alle Cloud-Versionen und Verknüpfungen in Bibliotheken werden entfernt. Bereits lokal heruntergeladene Kopien bleiben bestehen.', ok: 'Cloud-Figur löschen' })) return;
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
  videoStep.append(node('p', 'Maximal 50 MB pro Video. Während eines Uploads wird vorübergehend der maximale Platz pro Video reserviert. Alte Versionen zählen weiterhin zum Speicher.'));
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
    let job = null; controller = new AbortController(); document.getElementById('cloudCancelUpload').hidden = false;
    try {
      const reserved = await cloudCall('reserve', { figure: figure.value || null, videos: videos.map(v => ({ size: v.blob.size, type: v.blob.type })) }); job = reserved.job;
      for (let i = 0; i < videos.length; i++) {
        controller.signal.throwIfAborted(); statusBox.textContent = `Video ${i + 1} von ${videos.length} hochladen …`;
        await uploadMedia(reserved.media[i].path, videos[i].blob, controller.signal);
        await cloudCall('finalize', { id: reserved.media[i].id });
      }
      controller.signal.throwIfAborted();
      const poster = await posterPayload(local.poster).catch(() => null);
      const saved = await cloudCall('commit', { job, ...(poster ? { poster } : {}), public_allowed: allowed.checked, title: local.title, description: local.description, tags: local.tags, videos: reserved.media.map((m, i) => ({ id: m.id, name: videos[i].name })) }); job = null;
      if (library.value) await cloudCall('attach', { library: library.value, revision: saved.revision });
      source = null; area = library.value ? 'libraries' : 'figures'; await load(library.value || null);
    } catch (error) {
      if (job) await cloudCall('abort', { job }).catch(() => {});
      throw error;
    } finally { controller = null; document.getElementById('cloudCancelUpload').hidden = true; }
  }, uploadError));
  upload.className = 'primary'; box.append(upload, uploadError);
}
function adminForm() {
  const box = section('Plattform verwalten'); box.append(node('p', `${MB(state.settings.used)} / ${MB(state.settings.total_limit)} insgesamt belegt`));
  const total = field(box, 'Gesamtlimit in MB (maximal 1000)', state.settings.total_limit / 1000000, 'number');
  box.append(action('Gesamtlimit speichern', () => run('Speichern …', async () => { await cloudCall('admin_limit', { bytes: Math.floor(Number(total.value) * 1000000) }); await load(null); })));
  for (const p of state.people) box.append(node('p', `${p.email}: ${p.upload_enabled ? 'Uploads erlaubt' : 'Nur Lesen'} · ${MB(p.used)} / ${MB(p.quota)}`));
  const form = node('form'); box.append(form); const email = field(form, 'Person: E-Mail-Adresse', '', 'email'); email.required = true;
  const quota = field(form, 'Speicherlimit dieser Person in MB', 250, 'number'), enabled = checkbox(form, 'Cloud-Bibliotheken und Uploads erlauben');
  form.append(action('Person anlegen / Freigabe speichern', () => { if (form.reportValidity()) return run('Speichern …', async () => { await cloudCall('admin_user', { email: email.value, enabled: enabled.checked, quota: Math.floor(Number(quota.value) * 1000000) }); await load(null); }); }));
  const link = field(form, 'Einmaliger persönlicher Anmeldelink'); link.readOnly = true; link.autocomplete = 'off';
  form.append(action('Anmeldelink erstellen', () => run('Link erstellen …', async () => { const r = await cloudCall('admin_link', { email: email.value }); link.value = r.link; })), action('Anmeldelink kopieren', () => navigator.clipboard.writeText(link.value)));
  form.append(node('p', 'Den Anmeldelink nur der betreffenden Person schicken. Er ist einmalig und zeitlich begrenzt. Es wird keine E-Mail versendet.')); form.onsubmit = e => e.preventDefault();
}
export function initCloud(callbacks) {
  hooks = callbacks; dialog = document.getElementById('cloudDialog'); body = document.getElementById('cloudBody'); errorBox = document.getElementById('cloudError'); statusBox = document.getElementById('cloudStatus');
  document.getElementById('cloudBack').onclick = close;
  dialog.querySelector('[data-nav=figures]').onclick = close;
  dialog.querySelector('[data-nav=cloud]').onclick = () => { if (!busy) navigate('figures'); };
  document.getElementById('cloudCancelUpload').onclick = () => controller?.abort();
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
  document.getElementById('cloudButton').onclick = () => openCloud();
  const query = new URLSearchParams(location.search); if (query.has('library') || query.has('cloud')) setTimeout(() => openCloud(null, query.get('library')), 0);
}
export async function openCloud(local = null, library = null) {
  if (busy || dialog.open) return; source = local; current = library; area = 'initial';
  errorBox.hidden = true; body.replaceChildren(); dialog.showModal();
  await run('Cloud-Bibliotheken laden …', () => load(library));
  if (!body.childElementCount) body.append(action('Erneut versuchen', () => run('Laden …', () => load(library))));
}
