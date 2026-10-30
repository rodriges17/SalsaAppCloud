import { createPeopleGrant } from './cloud-people-grant.js';
// Administrator-only people UI. Drafts and generated links live only in this view.
export function createPeopleView({ node, action, field, select, checkbox, call, run, confirm, state, refresh, report, account, extraManagement = () => null }) {
  let expanded = null, adding = null, query = '', filter = 'Alle', activeTab = 'Konto', more, platformDraft = null;
  const grants = createPeopleGrant({ call });
  const dirty = () => grants.pending;
  async function leave(active = () => true) {
    const current = grants.capture();
    if (!dirty() && !adding && platformDraft === null) return true;
    if (!await confirm({title:'Ungespeicherte Änderungen', message:'Möchtest du die Änderungen verwerfen oder weiter bearbeiten?', ok:'Verwerfen', cancel:'Weiter bearbeiten', destructive:true})) return false;
    if (!active() || !current()) return false;
    grants.discard(); adding = null; platformDraft = null; return true;
  }
  const mb = n => `${(Number(n ?? 0) / 1000000).toFixed(1)} MB`;
  const manageable = () => state().libraries.filter(l => l.manage);
  function permissions(form, draft, onChange = () => {}) {
    const enabled = checkbox(form, 'Figuren hochladen und Bibliotheken erstellen', draft.enabled);
    const quota = field(form, 'Speicherlimit in MB', draft.quota, 'number'); quota.min = '0'; quota.max = '1000'; quota.step = '1'; quota.required = true; quota.disabled = !draft.enabled;
    enabled.onchange = () => { draft.enabled = enabled.checked; quota.disabled = !enabled.checked; onChange(); };
    quota.oninput = () => { draft.quota = quota.value; onChange(); };
    return { enabled, quota };
  }
  function notice(box, text) { const p = node('p', text, 'cloud-person-notice'); p.setAttribute('role', 'status'); box.append(p); }
  async function removeMember(person, lib, work) {
    const message = lib.visibility === 'private' ? 'Der Zugriff auf diese private Bibliothek entfällt. Bereits heruntergeladene lokale Kopien bleiben erhalten.' : 'Die Mitgliedschaft entfällt. Die öffentliche Bibliothek bleibt lesbar. Bereits heruntergeladene lokale Kopien bleiben erhalten.';
    if (await confirm({ title: `${person.email}: Mitglied entfernen?`, message, ok: 'Mitglied entfernen', destructive: true })) await work();
  }
  function membershipEditor(box, person, memberships, reload, draft, changed) {
    for (const lib of state().libraries) {
      const member = memberships.find(m => m.library_id === lib.id), owner = lib.owner_id === person.id;
      if (!owner && !member && !lib.manage) continue;
      const row = node('div', undefined, 'cloud-person-library'); row.append(node('h4', lib.title)); box.append(row);
      if (owner) { row.append(node('p', 'Besitzer · Verwaltung bleibt unabhängig von der Upload-Freigabe möglich.')); continue; }
      row.append(node('p', member ? `${member.role === 'contributor' ? 'Mitwirken' : 'Lesen'}${member.role === 'contributor' && !person.upload_enabled ? ' · Mitwirken derzeit ohne Upload-Freigabe nicht nutzbar' : ''}` : 'Kein zugewiesener Zugriff'));
      if (!lib.manage) continue;
      const choices = [['reader', 'Lesen']];
      if (lib.collaborative && person.upload_enabled) choices.push(['contributor', 'Mitwirken']);
      const form = node('form'); row.append(form);
      const role = select(form, `Rolle in ${lib.title}`, member ? choices : [['','Kein Zugriff'],...choices], draft.members?.[lib.id] ?? member?.role ?? '');
      role.onchange = () => { draft.members ??= {}; if (role.value === (member?.role ?? '')) delete draft.members[lib.id]; else draft.members[lib.id] = role.value || 'remove'; changed(); };
      if (!lib.collaborative || !person.upload_enabled) row.append(node('p', !lib.collaborative ? 'Diese Bibliothek erlaubt keine gemeinschaftlichen Beiträge.' : 'Mitwirken benötigt die Upload-Freigabe des Administrators.', 'small muted'));
      form.onsubmit = e => e.preventDefault();
      if (member) row.append(action('Mitglied entfernen', async () => { if (!await leave()) return; return removeMember(person, lib, () => run('Mitglied entfernen …', async () => { await call('member', { library: lib.id, email: person.email, role: 'remove' }); await reload(); })); }));
    }
  }
  async function details(box, person) {
    const tabs = node('div', undefined, 'cloud-person-tabs'); tabs.setAttribute('role','tablist'); tabs.setAttribute('aria-label','Benutzerbereiche'); box.append(tabs);
    const panels = {};
    for (const name of ['Konto','Berechtigungen','Aktionen']) {
      const button = action(name, async () => { if (name === activeTab || !await leave()) return; activeTab = name; render(); });
      const id = `person-${person.id}-${name}`;
      button.id = `${id}-tab`; button.setAttribute('role','tab'); button.setAttribute('aria-selected',String(activeTab === name)); button.setAttribute('aria-controls',id); tabs.append(button);
      const panel = node('div',undefined,'cloud-person-panel'); panel.id=id; panel.setAttribute('role','tabpanel'); panel.setAttribute('aria-labelledby',button.id); panel.hidden=activeTab!==name; panels[name]=panel; box.append(panel);
    }
    const original = box; box = panels.Konto;
    box.append(node('h4','Kontoinformationen'),node('p',person.email),node('p',person.is_admin ? 'Plattform-Administrator' : 'Benutzer'));
    box.append(node('p', `${person.is_admin ? 'Administrator · ' : ''}${person.upload_enabled ? 'Uploads erlaubt' : 'Nur Lesen'} · ${mb(person.used)} / ${mb(person.quota)}`));
    const draft = grants.edit(person);
    box = panels.Berechtigungen;
    box.append(node('h4','Cloud-Freigabe'), node('p','Die Upload-Freigabe gilt für neue Figuren und neue Bibliotheken. Lesen bleibt möglich.','small muted'));
    const form = node('form'), saveError = node('p','','error'); saveError.setAttribute('role','alert'); saveError.hidden=true; box.append(form,saveError);
    let save;
    const dirty = () => { if (save) save.disabled = !grants.dirty(draft); };
    const fields = permissions(form, draft, dirty);
    if (person.id === state().me.id) { fields.enabled.disabled = true; form.append(node('p', 'Die eigene Upload-Freigabe kann hier nicht entzogen werden.', 'small muted')); }
    save = action('Änderungen speichern', async () => {
      if (!form.reportValidity()) return;
      await run('Freigabe speichern …', async () => {
        const outcome = await grants.save(draft, { confirm: () => !draft.saved.enabled || draft.enabled || confirm({
          title: `${person.email}: Uploads deaktivieren?`,
          message: 'Neue Uploads und neue Bibliotheken werden gesperrt. Bestehende Cloud-Figuren und Leserechte bleiben erhalten. Mitwirken ist ohne Upload-Freigabe nicht mehr nutzbar; eigene Bibliotheken bleiben verwaltbar.',
          ok: 'Uploads deaktivieren', destructive: true,
        }) });
        if (outcome.kind !== 'saved') return;
        await refresh();
        if (!grants.current(draft)) return;
        const target = host.querySelector('.cloud-person-details');
        if (target) notice(target, 'Änderungen gespeichert.');
      }, saveError);
    }); save.className = 'primary'; form.append(save); dirty(); form.onsubmit = e => e.preventDefault();
    const access = node('div'); panels.Berechtigungen.append(access); box = panels.Aktionen;
    if (person.id === state().me.id && person.is_admin) box.append(action('Passwort unter „Mein Konto“ ändern', account));
    box.append(node('h4', 'Anmeldung'));
    const linkBox = node('div', undefined, 'cloud-login-link'), linkError = node('p','','error'); linkError.hidden=true; linkError.setAttribute('role','alert');
    box.append(action('Neuen Anmeldelink erstellen', () => run('Anmeldelink erstellen …', async () => {
      linkBox.replaceChildren(); const result = await call('admin_link', { email: person.email });
      const link = field(linkBox, 'Einmaliger persönlicher Anmeldelink', result.link); link.readOnly = true; link.autocomplete = 'off';
      const expiry = result.expires_at && new Date(result.expires_at);
      notice(linkBox, expiry && Number.isFinite(expiry.getTime()) ? `Einmalig verwendbar · gültig bis ${expiry.toLocaleString('de-CH')}` : 'Einmalig und zeitlich begrenzt. Die genaue Ablaufzeit ist derzeit nicht bestätigt.');
      linkBox.append(action('Anmeldelink kopieren', async () => { try { await navigator.clipboard.writeText(link.value); notice(linkBox, 'Anmeldelink kopiert.'); } catch { link.focus(); link.select(); notice(linkBox, 'Bitte den markierten Link kopieren.'); } }));
      if (navigator.share) linkBox.append(action('Anmeldelink teilen', async () => { try { await navigator.share({ title: 'Dein persönlicher Anmeldelink', text: 'Einmalig und zeitlich begrenzt. Persönlich verwenden.', url: link.value }); } catch (e) { if (e.name !== 'AbortError') throw e; } }));
    }, linkError)), node('p', 'Persönlich weitergeben. Es wird keine E-Mail versendet. Alte Links werden hier nicht angezeigt.', 'small muted'), linkBox, linkError);
    const loading = node('p', 'Bibliothekszugriffe werden geladen …'); access.append(node('h4', 'Bibliotheken'), loading);
    try {
      const result = await call('admin_access', { id: person.id });
      if (!original.isConnected) return;
      loading.remove(); membershipEditor(access, person, result.memberships, refresh, draft, dirty);
      if (!state().libraries.length) access.append(node('p', 'Noch keine Bibliotheken vorhanden.'));
    } catch (error) { if (original.isConnected) { loading.textContent = 'Bibliothekszugriffe konnten nicht geladen werden.'; access.append(action('Erneut versuchen', async()=>{if(await leave())await refresh();})); report(error); } }
  }
  function wizard(box) {
    const d = adding;
    box.append(node('h3', 'Person hinzufügen'), node('p', `${d.step + 1} / 3 · ${['Person', 'Cloud-Freigabe', 'Bibliotheken'][d.step]}`, 'cloud-person-steps'));
    if (d.created) {
      notice(box, 'Person angelegt. Nur die noch offenen Bibliothekszuweisungen werden erneut gespeichert.');
      box.append(node('p', d.email));
    }
    const form = node('form'); box.append(form);
    let email;
    if (d.step === 0) { email = field(form, 'E-Mail-Adresse der neuen Person', d.email, 'email'); email.required = true; email.maxLength = 254; email.autocomplete = 'off'; email.oninput = () => d.email = email.value; }
    if (d.step === 1) { permissions(form, d); form.append(node('p', 'Ohne Upload-Freigabe kann die Person öffentliche und ausdrücklich freigegebene Bibliotheken lesen. Vorgeschlagenes Upload-Limit: 250 MB.')); }
    if (d.step === 2) {
      form.append(node('p', 'Private Bibliotheken werden nur durch ausdrückliche Auswahl freigegeben.'));
      for (const lib of manageable()) {
        if (d.libraries[lib.id] === 'contributor' && (!d.enabled || !lib.collaborative)) d.libraries[lib.id] = 'reader';
        const options = [['', 'Kein Zugriff'], ['reader', 'Lesen']]; if (d.enabled && lib.collaborative) options.push(['contributor', 'Mitwirken']);
        const role = select(form, lib.title, options, d.libraries[lib.id] ?? ''); role.disabled = !!d.done[lib.id]; role.onchange = () => d.libraries[lib.id] = role.value;
        if (d.done[lib.id]) form.append(node('p', `${lib.title}: gespeichert`, 'small muted'));
      }
      if (!manageable().length) form.append(node('p', 'Noch keine verwaltbaren Bibliotheken vorhanden.'));
    }
    const result = node('div'); result.setAttribute('role', 'status'); form.append(result);
    if (d.step && !d.created) form.append(action('Zurück', () => { d.step--; render(); }));
    form.append(action(d.step === 2 ? d.created ? 'Offene Zuweisungen erneut speichern' : 'Person anlegen' : 'Weiter', async () => {
      if (!form.reportValidity()) return;
      if (d.step === 0) { d.email = email.value.trim().toLowerCase(); if (state().people.some(p => p.email.toLowerCase() === d.email)) { result.textContent = 'Diese Person ist bereits angelegt. Bitte öffne ihren Eintrag in der Personenliste.'; return; } }
      if (d.step < 2) { d.step++; render(); return; }
      await run('Person und Zugriffe speichern …', async () => {
        const outcome = await grants.save(d);
        if (!grants.current(d) || outcome.kind === 'busy' || outcome.kind === 'stale') return;
        if (outcome.kind === 'partial') { render(); return; }
        adding = null; query = ''; expanded = { email: d.email }; await refresh();
      });
    }));
    form.append(action(d.created ? 'Zur Personenliste' : 'Abbrechen', async () => { adding = null; if (d.created) await refresh(); else render(); }));
    form.onsubmit = e => e.preventDefault();
    if (d.created) for (const [id, role] of Object.entries(d.libraries)) if (role && !d.done[id]) notice(box, `Person angelegt. Zugriff auf „${state().libraries.find(l => l.id === id)?.title ?? id}“ noch nicht gespeichert.${d.failures?.[id] ? ` ${d.failures[id]}` : ''}`);
  }
  let host;
  function render() {
    host.replaceChildren();
    if (!state()?.me?.is_admin) return;
    if (adding) { wizard(host); return; }
    const heading = node('div', undefined, 'cloud-person-heading'); heading.append(node('h3', 'Benutzer'), action('Person hinzufügen', async () => { if (!await leave()) return; adding = grants.create(); render(); })); host.append(heading);
    const search = field(host, 'Benutzer suchen', query, 'search'); search.autocomplete = 'off'; search.placeholder = 'Name oder E-Mail';
    const filters = node('div',undefined,'cloud-person-filters'); filters.setAttribute('aria-label','Benutzer filtern'); host.append(filters);
    for (const name of ['Alle','Admins','Gesperrt']) { const button = action(name,async()=>{ if (!await leave()) return; filter=name; render(); }); button.setAttribute('aria-pressed',String(filter===name)); filters.append(button); }
    if (filter==='Gesperrt') host.append(node('p','Zeigt Benutzer mit gesperrten Uploads. Das Konto bleibt zum Lesen nutzbar.','small muted'));
    const list = node('div', undefined, 'cloud-people-list'); host.append(list);
    function drawList() {
      list.replaceChildren();
      const people = [...state().people].sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, 'de')).filter(p => `${p.name || ''} ${p.email}`.toLowerCase().includes(query.toLowerCase()) && (filter !== 'Admins' || p.is_admin) && (filter !== 'Gesperrt' || !p.upload_enabled));
      for (const p of people) {
        const entry = node('article', undefined, 'cloud-person-entry'), button = node('button', undefined, 'cloud-person-summary'), copy = node('span'); button.type = 'button';
        copy.append(node('strong', p.name || p.email)); if (p.name) copy.append(node('span',p.email));
        const badges = node('span',undefined,'cloud-person-badges');
        for (const text of [p.is_admin ? 'Admin' : 'Benutzer', p.upload_enabled ? 'Uploads erlaubt' : 'Nur Lesen', ...(p.id===state().me.id ? ['Du'] : [])]) badges.append(node('span',text,'cloud-person-badge')); copy.append(badges);
        const open = expanded?.email === p.email; button.append(copy, node('span', open ? '⌃' : '⌄')); button.setAttribute('aria-expanded', String(open)); button.setAttribute('aria-controls', `person-details-${p.id}`); entry.append(button); list.append(entry);
        button.onclick = async () => { if (busyView() || !await leave()) return; activeTab='Konto'; expanded = open ? null : { email: p.email }; drawList(); list.querySelector(`[aria-controls="person-details-${p.id}"]`)?.focus({ preventScroll: true }); };
        if (open) { const content = node('div', undefined, 'cloud-person-details'); content.id = `person-details-${p.id}`; entry.append(content); void details(content, p); }
      }
      if (!people.length) list.append(node('p', 'Keine Personen gefunden.'));
    }
    const busyView = () => !!host.closest('[inert]');
    search.onchange = async () => { if (!await leave()) { search.value=query; return; } query = search.value; drawList(); };
    search.oninput = () => { if (!dirty() && !adding && platformDraft === null) { query=search.value; drawList(); } }; drawList();
    more = node('details',undefined,'cloud-platform-limits'); more.append(node('summary','Weitere Verwaltung')); host.append(more);
    const extra = extraManagement(); if (extra) more.append(extra);
    const limits = node('section'); limits.append(node('h4','Plattform-Speicherlimit')); more.append(limits);
    limits.append(node('p', `${mb(state().settings.used)} / ${mb(state().settings.total_limit)} insgesamt belegt`));
    const total = field(limits, 'Gesamtlimit in MB (maximal 1000)', state().settings.total_limit / 1000000, 'number'); total.min = '0'; total.max = '1000'; total.step='1'; total.required=true;
    total.oninput=()=>{ platformDraft=Number(total.value)===state().settings.total_limit/1000000 ? null : total.value; };
    limits.append(action('Gesamtlimit speichern', () => run('Speichern …', async () => { if (!total.reportValidity()) return; await call('admin_limit', { bytes: Math.floor(Number(total.value) * 1000000) }); platformDraft=null; await refresh(); })));
  }
  return { get more() { return more; }, get dirty() { return dirty() || !!adding || platformDraft !== null; }, leave, mount(box) { host = box; render(); }, reset() { expanded = null; adding = null; grants.reset(); platformDraft = null; query = ''; filter = 'Alle'; activeTab = 'Konto'; } };
}
