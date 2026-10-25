// Library-scoped membership UI. No directory is requested by library owners.
export function createMemberView({ box, lib, members, me, people, node, action, field, select, call, run, confirm, refresh }) {
  let expanded = null, adding = false, candidate = null, emailDraft = '', roleDraft = 'reader';
  const drafts = new Map();
  const existing = members.filter(m => m.id !== lib.owner_id);
  const owner = lib.owner_id === me.id ? me : people.find(p => p.id === lib.owner_id);
  const choices = person => [['reader', 'Lesen'], ...(lib.collaborative && person.upload_enabled ? [['contributor', 'Mitwirken']] : [])];
  const hint = person => !lib.collaborative ? 'Diese Bibliothek erlaubt keine gemeinschaftlichen Beiträge.' : !person.upload_enabled ? 'Mitwirken benötigt die Upload-Freigabe des Plattform-Administrators.' : 'Lesen: ansehen und lokal übernehmen. Mitwirken: zusätzlich Figuren beitragen.';
  function formNode(parent) { const f = node('form'); f.onsubmit = e => e.preventDefault(); parent.append(f); return f; }
  function removalMessage() { return lib.visibility === 'private' ? 'Der Zugriff auf diese private Bibliothek entfällt. Bereits heruntergeladene lokale Kopien bleiben erhalten.' : 'Die Mitgliedschaft entfällt. Die öffentliche Bibliothek bleibt lesbar. Bereits heruntergeladene lokale Kopien bleiben erhalten.'; }
  function summary(person, label, open, work) {
    const row = node(work ? 'button' : 'div', undefined, 'cloud-member-summary'), copy = node('span');
    copy.append(node('strong', person.email ?? 'Bibliotheksbesitzer'), node('span', label)); row.append(copy);
    if (work) { row.type = 'button'; row.append(node('span', open ? '⌃' : '⌄')); row.setAttribute('aria-expanded', String(open)); row.setAttribute('aria-controls', `member-${person.id}`); row.onclick = work; }
    return row;
  }
  function draw() {
    box.replaceChildren();
    const heading = node('div', undefined, 'cloud-person-heading'); heading.append(node('h3', 'Mitglieder & Zugriff'), action('Mitglied hinzufügen', () => run('Mitgliederverwaltung öffnen …', async () => { if (me.is_admin) { const fresh = await call('state'); if (!fresh.me?.is_admin) throw Object.assign(new Error('Keine Berechtigung zur Plattform-Personenauswahl.'), { accessChanged: true }); people = fresh.people; } adding = true; expanded = null; candidate = null; renderAdd(); }))); box.append(heading);
    if (owner) { const row = node('div', undefined, 'cloud-member-entry'); row.append(summary(owner, lib.owner_id === me.id ? 'Du · Bibliotheksbesitzer' : 'Bibliotheksbesitzer', false)); box.append(row); }
    box.append(node('p', `${existing.length} ${existing.length === 1 ? 'Mitglied' : 'Mitglieder'}`, 'small muted'));
    if (!existing.length) box.append(node('p', 'Noch keine Mitglieder hinzugefügt.'));
    for (const m of [...existing].sort((a, b) => a.email.localeCompare(b.email))) {
      const entry = node('article', undefined, 'cloud-member-entry'), open = expanded === m.id;
      const button = summary(m, `${m.id === me.id ? 'Du · ' : ''}${m.role === 'reader' ? 'Lesen' : 'Mitwirken'}${m.role === 'contributor' && (!m.upload_enabled || !lib.collaborative) ? ' · derzeit nicht nutzbar' : ''}`, open, () => { expanded = open ? null : m.id; adding = false; candidate = null; draw(); box.querySelector(`[aria-controls="member-${m.id}"]`)?.focus({ preventScroll: true }); }); entry.append(button); box.append(entry);
      if (!open) continue;
      const content = node('div', undefined, 'cloud-member-details'); content.id = `member-${m.id}`; entry.append(content);
      const form = formNode(content), draft = drafts.get(m.id) ?? m.role, options = choices(m);
      // Existing, inactive contributor access can be retained or explicitly reduced to reading.
      if (m.role === 'contributor' && !options.some(([v]) => v === 'contributor')) options.push(['contributor', 'Mitwirken · derzeit nicht nutzbar']);
      const role = select(form, 'Bibliotheksrolle', options, draft); const save = action('Rolle speichern', async () => {
        if (role.value === m.role) return;
        if (m.role === 'contributor' && role.value === 'reader' && !await confirm({ title: `${m.email}: Mitwirken beenden?`, message: 'Die Person kann diese Bibliothek weiterhin lesen und lokal übernehmen, aber keine weiteren Figuren beitragen.', ok: 'Nur Lesen erlauben' })) return;
        await run('Rolle speichern …', async () => { await call('member', { library: lib.id, email: m.email, role: role.value }); await refresh(); });
      }); save.disabled = role.value === m.role;
      role.onchange = () => { drafts.set(m.id, role.value); save.disabled = role.value === m.role; }; form.append(node('p', hint(m), 'small muted'), save);
      content.append(action('Mitglied entfernen', async () => {
        if (!await confirm({ title: `${m.email}: Mitglied entfernen?`, message: removalMessage(), ok: 'Mitglied entfernen', destructive: true })) return;
        await run('Mitglied entfernen …', async () => { await call('member', { library: lib.id, email: m.email, role: 'remove' }); await refresh(); });
      }));
    }
    const addHost = node('div'); box.append(addHost);
    if (adding) addForm(addHost);
  }
  function renderAdd() { draw(); const target = box.querySelector('.cloud-member-add'); target?.scrollIntoView({ block: 'nearest' }); }
  function addForm(host) {
    const panel = node('div', undefined, 'cloud-member-add'); host.append(panel); panel.append(node('h4', 'Mitglied hinzufügen'), node('p', candidate ? '2 / 2 · Rolle festlegen' : '1 / 2 · Person auswählen', 'cloud-person-steps'));
    const form = formNode(panel);
    if (!candidate) {
      let input;
      if (me.is_admin) {
        const search = field(form, 'Person suchen', emailDraft, 'search'); search.autocomplete = 'off';
        const results = node('div', undefined, 'cloud-member-candidates'); form.append(results);
        const candidates = people.filter(p => p.id !== lib.owner_id && !existing.some(m => m.id === p.id));
        function filter() { emailDraft = search.value; results.replaceChildren(); for (const person of candidates.filter(p => p.email.toLowerCase().includes(search.value.toLowerCase()))) results.append(action(person.email, () => { emailDraft = person.email; candidate = person; roleDraft = 'reader'; renderAdd(); })); if (!results.childElementCount) results.append(node('p', 'Keine passende Person. Neue Personen werden in der Plattformverwaltung angelegt.')); }
        search.oninput = filter; filter();
      } else {
        input = field(form, 'Vollständige E-Mail-Adresse', emailDraft, 'email'); input.required = true; input.autocomplete = 'off'; input.maxLength = 254; input.oninput = () => emailDraft = input.value;
        form.append(node('p', 'Die Person muss bereits vom Plattform-Administrator angelegt sein.', 'small muted'));
        form.append(action('Weiter', () => {
          if (!form.reportValidity()) return;
          const email = input.value.trim().toLowerCase();
          if (email === owner?.email?.toLowerCase() || existing.some(m => m.email.toLowerCase() === email)) { error.textContent = 'Diese Person gehört bereits zur Bibliothek.'; error.hidden = false; return; }
          return run('Person wird geprüft …', async () => { const result = await call('member_check', { library: lib.id, email }); emailDraft = email; candidate = { email, upload_enabled: result.upload_enabled }; roleDraft = 'reader'; renderAdd(); }, error);
        }));
      }
    } else {
      form.append(node('p', candidate.email));
      const role = select(form, 'Bibliotheksrolle', choices(candidate), roleDraft); role.onchange = () => roleDraft = role.value;
      form.append(node('p', hint(candidate), 'small muted'));
      form.append(action('Zurück', () => { candidate = null; renderAdd(); }), action('Hinzufügen', () => run('Mitglied hinzufügen …', async () => { await call('member', { library: lib.id, email: candidate.email, role: role.value }); adding = false; await refresh(); }, error)));
    }
    const error = node('p', '', 'error'); error.hidden = true; error.setAttribute('role', 'alert'); form.append(error);
    form.append(action('Abbrechen', () => { adding = false; candidate = null; emailDraft = ''; roleDraft = 'reader'; draw(); }));
  }
  draw();
}
