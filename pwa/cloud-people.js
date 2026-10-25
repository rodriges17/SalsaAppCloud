// Administrator-only people UI. Drafts and generated links live only in this view.
export function createPeopleView({ node, action, field, select, checkbox, call, run, confirm, state, refresh, report, section }) {
  let expanded = null, adding = null, query = '';
  const drafts = new Map();
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
  function membershipEditor(box, person, memberships, reload) {
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
      const role = select(form, `Rolle in ${lib.title}`, choices, member?.role);
      if (!lib.collaborative || !person.upload_enabled) row.append(node('p', !lib.collaborative ? 'Diese Bibliothek erlaubt keine gemeinschaftlichen Beiträge.' : 'Mitwirken benötigt die Upload-Freigabe des Administrators.', 'small muted'));
      form.append(action(member ? 'Rolle speichern' : 'Zugriff zuweisen', () => run('Zugriff speichern …', async () => { await call('member', { library: lib.id, email: person.email, role: role.value }); await reload(); })));
      form.onsubmit = e => e.preventDefault();
      if (member) row.append(action('Mitglied entfernen', () => removeMember(person, lib, () => run('Mitglied entfernen …', async () => { await call('member', { library: lib.id, email: person.email, role: 'remove' }); await reload(); }))));
    }
  }
  async function details(box, person) {
    box.append(node('p', `${person.is_admin ? 'Administrator · ' : ''}${person.upload_enabled ? 'Uploads erlaubt' : 'Nur Lesen'} · ${mb(person.used)} / ${mb(person.quota)}`));
    const draft = drafts.get(person.id) ?? { enabled: person.upload_enabled, quota: person.quota / 1000000 }; drafts.set(person.id, draft);
    const form = node('form'); box.append(form);
    let save;
    const dirty = () => { if (save) save.disabled = draft.enabled === person.upload_enabled && Number(draft.quota) === person.quota / 1000000; };
    const fields = permissions(form, draft, dirty);
    if (person.id === state().me.id) { fields.enabled.disabled = true; form.append(node('p', 'Die eigene Upload-Freigabe kann hier nicht entzogen werden.', 'small muted')); }
    save = action('Änderungen speichern', async () => {
      if (!form.reportValidity()) return;
      if (person.upload_enabled && !draft.enabled && !await confirm({ title: `${person.email}: Uploads deaktivieren?`, message: 'Neue Uploads und neue Bibliotheken werden gesperrt. Bestehende Cloud-Figuren und Leserechte bleiben erhalten. Mitwirken ist ohne Upload-Freigabe nicht mehr nutzbar; eigene Bibliotheken bleiben verwaltbar.', ok: 'Uploads deaktivieren', destructive: true })) return;
      await run('Freigabe speichern …', async () => { await call('admin_user', { email: person.email, enabled: draft.enabled, quota: Math.floor(Number(draft.quota) * 1000000) }); drafts.delete(person.id); await refresh(); });
    }); save.className = 'primary'; form.append(save); dirty(); form.onsubmit = e => e.preventDefault();
    const access = node('div'); box.append(access, node('h4', 'Anmeldung'));
    const linkBox = node('div', undefined, 'cloud-login-link');
    box.append(action('Neuen Anmeldelink erstellen', () => run('Anmeldelink erstellen …', async () => {
      linkBox.replaceChildren(); const result = await call('admin_link', { email: person.email });
      const link = field(linkBox, 'Einmaliger persönlicher Anmeldelink', result.link); link.readOnly = true; link.autocomplete = 'off';
      const expiry = result.expires_at && new Date(result.expires_at);
      notice(linkBox, expiry && Number.isFinite(expiry.getTime()) ? `Einmalig verwendbar · gültig bis ${expiry.toLocaleString('de-CH')}` : 'Einmalig und zeitlich begrenzt. Die genaue Ablaufzeit ist derzeit nicht bestätigt.');
      linkBox.append(action('Anmeldelink kopieren', async () => { try { await navigator.clipboard.writeText(link.value); notice(linkBox, 'Anmeldelink kopiert.'); } catch { link.focus(); link.select(); notice(linkBox, 'Bitte den markierten Link kopieren.'); } }));
      if (navigator.share) linkBox.append(action('Anmeldelink teilen', async () => { try { await navigator.share({ title: 'Dein persönlicher Anmeldelink', text: 'Einmalig und zeitlich begrenzt. Persönlich verwenden.', url: link.value }); } catch (e) { if (e.name !== 'AbortError') throw e; } }));
    })), node('p', 'Persönlich weitergeben. Es wird keine E-Mail versendet. Alte Links werden hier nicht angezeigt.', 'small muted'), linkBox);
    const loading = node('p', 'Bibliothekszugriffe werden geladen …'); access.append(node('h4', 'Bibliotheken'), loading);
    try {
      const result = await call('admin_access', { id: person.id });
      if (!box.isConnected) return;
      loading.remove(); membershipEditor(access, person, result.memberships, refresh);
      if (!state().libraries.length) access.append(node('p', 'Noch keine Bibliotheken vorhanden.'));
    } catch (error) { if (box.isConnected) { loading.textContent = 'Bibliothekszugriffe konnten nicht geladen werden.'; access.append(action('Erneut versuchen', refresh)); report(error); } }
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
        if (!d.created) { await call('admin_user', { email: d.email, enabled: d.enabled, quota: Math.floor(Number(d.quota) * 1000000), create_only: true }); d.created = true; }
        let failed = false;
        for (const [library, role] of Object.entries(d.libraries)) {
          if (!role || d.done[library]) continue;
          try { await call('member', { library, email: d.email, role }); d.done[library] = true; delete d.failures?.[library]; }
          catch (e) { failed = true; (d.failures ??= {})[library] = e.message; const lib = state().libraries.find(l => l.id === library); notice(result, `Person angelegt. Zugriff auf „${lib?.title ?? library}“ konnte nicht gespeichert werden: ${e.message}`); }
        }
        if (failed) { render(); return; }
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
    const heading = node('div', undefined, 'cloud-person-heading'); heading.append(node('h3', 'Personen & Zugriff'), action('Person hinzufügen', () => { adding = { step: 0, email: '', enabled: false, quota: 250, libraries: {}, done: {}, created: false }; render(); })); host.append(heading);
    const search = field(host, 'Personen suchen', query, 'search'); search.autocomplete = 'off';
    const list = node('div', undefined, 'cloud-people-list'); host.append(list);
    function drawList() {
      list.replaceChildren();
      const people = [...state().people].sort((a, b) => a.email.localeCompare(b.email)).filter(p => p.email.toLowerCase().includes(query.toLowerCase()));
      for (const p of people) {
        const entry = node('article', undefined, 'cloud-person-entry'), button = node('button', undefined, 'cloud-person-summary'), copy = node('span'); button.type = 'button';
        copy.append(node('strong', p.email), node('span', `${p.is_admin ? 'Administrator · ' : ''}${p.upload_enabled ? 'Uploads erlaubt' : 'Nur Lesen'} · ${mb(p.used)} / ${mb(p.quota)}`));
        const open = expanded?.email === p.email; button.append(copy, node('span', open ? '⌃' : '⌄')); button.setAttribute('aria-expanded', String(open)); button.setAttribute('aria-controls', `person-details-${p.id}`); entry.append(button); list.append(entry);
        button.onclick = () => { if (busyView()) return; expanded = open ? null : { email: p.email }; drawList(); list.querySelector(`[aria-controls="person-details-${p.id}"]`)?.focus({ preventScroll: true }); };
        if (open) { const content = node('div', undefined, 'cloud-person-details'); content.id = `person-details-${p.id}`; entry.append(content); void details(content, p); }
      }
      if (!people.length) list.append(node('p', 'Keine Personen gefunden.'));
    }
    const busyView = () => !!host.closest('[inert]');
    search.oninput = () => { query = search.value; drawList(); }; drawList();
    const limits = node('details', undefined, 'cloud-platform-limits'); limits.append(node('summary', 'Plattform-Speicherlimit')); host.append(limits);
    limits.append(node('p', `${mb(state().settings.used)} / ${mb(state().settings.total_limit)} insgesamt belegt`));
    const total = field(limits, 'Gesamtlimit in MB (maximal 1000)', state().settings.total_limit / 1000000, 'number'); total.min = '0'; total.max = '1000';
    limits.append(action('Gesamtlimit speichern', () => run('Speichern …', async () => { if (!total.reportValidity()) return; await call('admin_limit', { bytes: Math.floor(Number(total.value) * 1000000) }); await refresh(); })));
  }
  return { mount(box) { host = box; render(); }, reset() { expanded = null; adding = null; drafts.clear(); query = ''; } };
}
