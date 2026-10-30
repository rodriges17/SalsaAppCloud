// A person's account grant and library assignments form one resumable workflow.
// Drafts are memory-only and belong to the current signed-in session.
export function createPeopleGrant({ call }) {
  let revision = 0, saving = null;
  const drafts = new Map();
  const account = d => ({ enabled: d.enabled, quota: Math.floor(Number(d.quota) * 1000000) });
  const same = (a, b) => a?.enabled === b.enabled && a?.quota === b.quota;
  const current = d => d.revision === revision;
  function edit(person) {
    if (!drafts.has(person.id) || !dirty(drafts.get(person.id))) drafts.set(person.id, {
      revision, email: person.email, enabled: person.upload_enabled, quota: person.quota / 1000000,
      saved: { enabled: person.upload_enabled, quota: person.quota }, members: {},
    });
    return drafts.get(person.id);
  }
  const dirty = d => !same(d.saved, account(d)) || Object.keys(d.members).length > 0;
  function create() {
    return { revision, step: 0, email: '', enabled: false, quota: 250,
      libraries: {}, done: {}, failures: {}, created: false };
  }
  async function write(d) {
    const desired = account(d), adding = !!d.libraries;
    if (adding ? !d.created : !same(d.saved, desired)) {
      await call('admin_user', { email: d.email, ...desired, ...(adding ? { create_only: true } : {}) });
      if (!current(d)) return { kind: 'stale' };
      d.saved = desired;
      if (adding) d.created = true;
    }
    for (const [library, role] of Object.entries(adding ? d.libraries : d.members)) {
      if (!current(d)) return { kind: 'stale' };
      if (!role) { if (adding) delete d.failures[library]; continue; }
      if (adding && d.done[library]) continue;
      try {
        await call('member', { library, email: d.email, role });
        if (!current(d)) return { kind: 'stale' };
        if (adding) { d.done[library] = true; delete d.failures[library]; }
        else if (d.members[library] === role) delete d.members[library];
      } catch (error) {
        if (!current(d)) return { kind: 'stale' };
        if (!adding) throw error;
        d.failures[library] = error.message;
      }
    }
    return { kind: adding && Object.keys(d.failures).length ? 'partial' : 'saved' };
  }
  async function save(d, { confirm } = {}) {
    if (!current(d)) return { kind: 'stale' };
    if (saving) return { kind: 'busy' };
    const operation = {}; saving = operation;
    try {
      if (confirm && !await confirm()) return { kind: current(d) ? 'cancelled' : 'stale' };
      if (!current(d)) return { kind: 'stale' };
      return await write(d);
    }
    catch (error) { if (!current(d)) return { kind: 'stale' }; throw error; }
    finally { if (saving === operation) saving = null; }
  }
  return { edit, create, dirty, save, current,
    capture() { const expected = revision; return () => revision === expected; },
    get pending() { return [...drafts.values()].some(dirty); },
    discard() { revision++; drafts.clear(); }, reset() { revision++; saving = null; drafts.clear(); } };
}
