import { cloudCall, signedIn, uploadMedia, logout, loginWithLink, finishLogin } from './cloud-api.js';
import { CLOUD_FILE_LIMIT } from './cloud-config.js';
import { figureVideos } from './storage.js';
const node = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
const MB = value => `${(Number(value ?? 0) / 1000000).toFixed(1)} MB`;
const action = (label, work) => { const b = node('button', label, 'secondary'); b.type = 'button'; b.onclick = () => Promise.resolve().then(work).catch(report); return b; };
let dialog, body, errorBox, statusBox, hooks, state, current, busy = false, controller, source = null, area = 'libraries';
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
  body.inert = true; document.getElementById('cloudBack').disabled = true;
  try { return await work(); } catch (error) { report(error, errorTarget); }
  finally { busy = false; body.inert = false; document.getElementById('cloudBack').disabled = false; statusBox.textContent = ''; }
}
function close() { if (busy) return; dialog.close(); body.querySelectorAll('video').forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); }); source = null; }
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
  clearPreviews(body); body.replaceChildren();
  const toolbar = node('div', undefined, 'cloud-actions');
  for (const [key, label] of [['libraries', 'Bibliotheken'], ...(state.me ? [['figures', 'Meine Cloud-Figuren']] : []), ...(state.me?.is_admin ? [['admin', 'Verwaltung']] : [])]) {
    const button = action(label, () => navigate(key)); button.setAttribute('aria-pressed', String(area === key && !current && !source)); toolbar.append(button);
  }
  toolbar.append(action('Aktualisieren', () => run('Laden …', () => load(current))));
  if (signedIn()) toolbar.append(action('Abmelden', async () => { await logout(); await run('Laden …', () => load(null)); }));
  body.append(toolbar);
  if (state.me) body.append(node('p', `${state.me.email} · ${MB(state.me.used)} / ${MB(state.me.quota)} belegt${state.me.upload_enabled ? '' : ' · Lesen erlaubt, Uploads gesperrt'}`));
  else {
    body.append(node('p', 'Öffentliche Bibliotheken sind ohne Anmeldung lesbar. Für private Bibliotheken und Beiträge erhältst du einen persönlichen Anmeldelink vom Administrator.'));
    body.append(node('p', 'Du bist derzeit nicht angemeldet. Bibliotheken erstellen und Verwaltung erscheinen nach der Anmeldung mit einem berechtigten Konto.'));
    const box = section('Mit persönlichem Link anmelden'), form = node('form'); box.append(form);
    const link = field(form, 'Anmeldelink einfügen', '', 'password'); link.autocomplete = 'off';
    box.append(node('p', 'In einer installierten iPhone-App den Link hier einfügen, damit die Anmeldung in dieser App erfolgt.'));
    form.append(action('Anmelden', () => run('Anmelden …', async () => { await loginWithLink(link.value.trim()); await load(null); }))); form.onsubmit = e => e.preventDefault();
  }
  if (source) { await publishForm(); return; }
  if (current) { await libraryView(current); return; }
  if (area === 'create') { libraryForm(); return; }
  if (area === 'figures') {
    body.append(node('h3', 'Meine Cloud-Figuren'), node('p', 'Alle deine hochgeladenen Figuren – auch ohne Bibliothekszuordnung. Eine Figur kann in mehreren Bibliotheken verwendet werden.'));
    ownFigures(); return;
  }
  if (area === 'admin' && state.me?.is_admin) { adminForm(); return; }
  body.append(node('h3', 'Bibliotheken'));
  if (state.me?.upload_enabled) body.append(action('Bibliothek erstellen', () => navigate('create')));
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
    if (entry.published) revisionCard(box, entry.published);
    if (entry.pending) {
      box.append(node('p', `Zur Prüfung: ${entry.pending.title}`)); revisionCard(box, entry.pending);
      if (detail.manage) box.append(action('Freigeben', () => review(true)), action('Ablehnen', () => review(false)));
    }
    async function review(accept) { await run('Prüfung speichern …', async () => { await cloudCall('review', { library: id, figure: entry.figure_id, accept }); await load(id); }); }
    if (detail.manage || entry.owner_id === state.me?.id) box.append(action('Aus Bibliothek entfernen', () => run('Entfernen …', async () => { await cloudCall('detach', { library: id, figure: entry.figure_id }); await load(id); })));
    if (detail.contribute && entry.published) box.append(action('In weitere Bibliothek aufnehmen', () => attachForm(entry.published)));
  }
  if (detail.manage) {
    intro.append(action('Bibliothek löschen', async () => {
      if (await hooks.confirm({ title: 'Bibliothek löschen?', message: 'Die Sammlung und ihre Mitgliedschaften werden entfernt. Cloud-Figuren bleiben in deinem Besitz und können weiterverwendet werden.', ok: 'Bibliothek löschen' })) {
        await run('Löschen …', async () => { await cloudCall('library_delete', { id }); await load(null); });
      }
    }));
    libraryForm(lib);
    const members = section('Mitglieder');
    members.append(node('p', 'Mitwirkende müssen vom Plattform-Administrator zum Upload freigeschaltet sein.'));
    for (const m of detail.members) members.append(node('p', `${m.email} · ${m.role === 'reader' ? 'Lesen' : 'Mitwirken'}`));
    const form = node('form'); members.append(form); const email = field(form, 'E-Mail-Adresse', '', 'email'); email.required = true;
    const role = select(form, 'Rolle', [['reader', 'Lesen'], ['contributor', 'Mitwirken'], ['remove', 'Entfernen']]);
    form.append(action('Mitglied speichern', () => { if (form.reportValidity()) return run('Speichern …', async () => { await cloudCall('member', { library: id, email: email.value, role: role.value }); await load(id); }); })); form.onsubmit = e => e.preventDefault();
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
function revisionCard(box, rev) {
  box.append(node('p', rev.description), node('p', rev.tags.join(' · ')));
  const chosen = [];
  for (const v of rev.videos) {
    const check = checkbox(box, `${v.name || 'Video'} · ${MB(v.size)}`, true); chosen.push([check, v]);
    box.append(action(`Video: ${v.name || 'Ohne Namen'}`, () => previewVideo(box, rev, v)));
  }
  box.append(action('In meine Figuren übernehmen', () => run('Videos herunterladen …', async () => {
    const selected = chosen.filter(([check]) => check.checked).map(([, v]) => v);
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
  clearPreviews(body); body.replaceChildren();
  body.append(action('Zurück zu Meine Cloud-Figuren', () => navigate('figures')));
  const box = section(`„${revision.title}“ zuordnen`);
  box.append(node('p', versionLabel(revision)));
  focusSection(box);
  const libs = state.libraries.filter(l => l.contribute);
  if (!libs.length) { box.append(node('p', 'Keine Bibliothek mit Beitragsberechtigung. Erstelle eine Bibliothek oder lass dich zum Mitwirken einladen.')); if (state.me?.upload_enabled) box.append(action('Bibliothek erstellen', () => navigate('create'))); return; }
  const choice = select(box, 'Zielbibliothek', libs.map(l => [l.id, l.title]));
  box.append(action('Figur zuordnen', () => run('Zuordnen …', async () => { await cloudCall('attach', { library: choice.value, revision: revision.id }); await load(choice.value); })));
}
function ownFigures() {
  if (!state.own_figures.length) body.append(node('p', 'Noch keine eigenen Cloud-Figuren. Lade eine lokale Figur über „In Cloud veröffentlichen“ hoch.'));
  for (const f of state.own_figures) {
    const revisions = [...f.revisions].sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
    const latest = revisions[0], box = section(latest?.title ?? 'Noch nicht fertig hochgeladene Figur');
    const allowed = checkbox(box, 'Öffentliche Veröffentlichung erlauben', f.public_allowed);
    box.append(action('Sichtbarkeit speichern', () => run('Speichern …', async () => { await cloudCall('public_permission', { figure: f.id, allowed: allowed.checked }); await load(null); })));
    if (latest) {
      box.append(action('Einer Bibliothek zuordnen', () => attachForm(latest)));
      const history = node('details', undefined, 'cloud-history');
      history.append(node('summary', `Versionsverlauf · ${revisions.length} ${revisions.length === 1 ? 'Version' : 'Versionen'}`));
      for (const revision of revisions) {
        const entry = node('article', undefined, 'cloud-card');
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
  for (const record of records) selected.push([checkbox(box, `${record.name || 'Video'} · ${MB(record.blob.size)}`, true), record]);
  box.append(node('p', 'Maximal 50 MB pro Video. Während eines Uploads wird vorübergehend der maximale Platz pro Video reserviert. Alte Versionen zählen weiterhin zum Speicher.'));
  const library = select(box, 'Bibliothek', [['', 'Nur in Meine Cloud-Figuren hochladen'], ...libs.map(l => [l.id, l.title])]);
  // Reservations can create a figure before any revision exists. They are not
  // valid version targets until the first upload has completed.
  const targets = state.own_figures.filter(f => f.revisions?.length);
  const names = new Map();
  for (const f of targets) { const title = f.revisions[0].title; names.set(title, (names.get(title) ?? 0) + 1); }
  const figure = select(box, 'Neue Figur oder neue Version', [['', 'Neue Cloud-Figur'], ...targets.map(f => {
    const latest = f.revisions[0], title = latest.title;
    return [f.id, names.get(title) > 1 ? `${title} · ${new Date(latest.created_at).toLocaleString('de')}` : title];
  })]);
  box.append(node('p', 'Hier stehen deine vorhandenen Cloud-Figuren. Lokales Löschen oder Entfernen aus einer Bibliothek löscht die Cloud-Figur nicht. Dauerhaft löschen kannst du sie unter „Meine Cloud-Figuren“ mit „Cloud-Figur samt Videos löschen“.'));
  const allowed = checkbox(box, 'Öffentliche Veröffentlichung dieser Figur erlauben');
  box.append(node('p', 'Mit Häkchen darf diese Figur in öffentlichen Bibliotheken ohne Anmeldung sichtbar sein. Ohne Häkchen ist sie nur in privaten Bibliotheken nutzbar. Das Häkchen allein veröffentlicht die Figur noch nicht.'));
  const visibilityHint = node('p'); visibilityHint.setAttribute('role', 'status'); box.append(visibilityHint);
  const uploadError = node('p', undefined, 'error'); uploadError.setAttribute('role', 'alert'); uploadError.hidden = true;
  const updateVisibility = () => {
    const isPublic = state.libraries.find(l => l.id === library.value)?.visibility === 'public';
    visibilityHint.textContent = !library.value
      ? 'Die Figur wird in „Meine Cloud-Figuren“ gespeichert und keiner weiteren Bibliothek zugeordnet. Du kannst sie später einer Bibliothek zuordnen.'
      : isPublic
      ? allowed.checked ? 'Öffentliche Bibliothek: Diese Figur darf für alle sichtbar werden.' : 'Diese Bibliothek ist öffentlich. Zum Hochladen musst du oben die öffentliche Veröffentlichung dieser Figur erlauben. Alternativ wähle eine private Bibliothek.'
      : 'Private Bibliothek: Die Figur ist nur für berechtigte Personen sichtbar.';
    if (figure.value) visibilityHint.textContent += ' Bei einer neuen Version gelten bestehende Bibliothekszuordnungen und deren Freigaberegeln weiterhin.';
    uploadError.hidden = true;
  };
  library.onchange = updateVisibility; allowed.onchange = updateVisibility;
  figure.onchange = () => { allowed.checked = state.own_figures.find(f => f.id === figure.value)?.public_allowed ?? false; updateVisibility(); };
  updateVisibility();
  box.append(action('Ausgewählte Figur hochladen', () => run('Upload vorbereiten …', async () => {
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
      const saved = await cloudCall('commit', { job, public_allowed: allowed.checked, title: local.title, description: local.description, tags: local.tags, videos: reserved.media.map((m, i) => ({ id: m.id, name: videos[i].name })) }); job = null;
      if (library.value) await cloudCall('attach', { library: library.value, revision: saved.revision });
      source = null; area = library.value ? 'libraries' : 'figures'; await load(library.value || null);
    } catch (error) {
      if (job) await cloudCall('abort', { job }).catch(() => {});
      throw error;
    } finally { controller = null; document.getElementById('cloudCancelUpload').hidden = true; }
  }, uploadError)));
  box.append(uploadError);
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
  document.getElementById('cloudCancelUpload').onclick = () => controller?.abort();
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
  document.getElementById('cloudButton').onclick = () => openCloud();
  const query = new URLSearchParams(location.search); if (query.has('library') || query.has('cloud')) setTimeout(() => openCloud(null, query.get('library')), 0);
}
export async function openCloud(local = null, library = null) {
  if (busy || dialog.open) return; source = local; current = library; area = 'libraries';
  errorBox.hidden = true; body.replaceChildren(); dialog.showModal();
  await run('Cloud-Bibliotheken laden …', () => load(library));
  if (!body.childElementCount) body.append(action('Erneut versuchen', () => run('Laden …', () => load(library))));
}
