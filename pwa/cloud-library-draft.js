// A library edit owns its membership and metadata until one atomic commit.
export function createLibraryDraft(library, entries) {
  const original = entries.map(e => e.figure_id), ids = [...original];
  const baseline = { title: library.title, description: library.description ?? '', visibility: library.visibility, collaborative: !!library.collaborative, moderated: !!library.moderated };
  const data = { ...baseline }, known = new Map(entries.map(e => [e.figure_id, e])), additions = new Map();
  return {
    data, known,
    get ids() { return [...ids]; },
    get dirty() { return JSON.stringify(data) !== JSON.stringify(baseline) || ids.length !== original.length || ids.some((id,i) => original[i] !== id); },
    move(id, index) { const from=ids.indexOf(id); if(from<0||index<0||index>=ids.length||from===index)return false;ids.splice(from,1);ids.splice(index,0,id);return true; },
    add(figure) {
      const revision=figure.revisions?.[0];if(!revision||ids.includes(figure.id))return false;
      known.set(figure.id,{figure_id:figure.id,owner_id:figure.owner_id,public_allowed:figure.public_allowed,published:revision});
      if(!original.includes(figure.id))additions.set(figure.id,revision.id);ids.push(figure.id);return true;
    },
    remove(id) { const i=ids.indexOf(id);if(i<0)return false;ids.splice(i,1);return true; },
    payload() { return { id:library.id,...data,expected_version:library.edit_version,order:[...ids],additions:ids.filter(id=>additions.has(id)).map(id=>({figure:id,revision:additions.get(id)})) }; }
  };
}

 
// One in-memory editing lifetime. Transport and identity are adapters; the view
// only displays the draft and outcomes and never parks a DOM save callback.
export function createLibrarySession({ detail: initial, owner, identity, commit, readState, read }) {
  let detail = structuredClone(initial);
  let model = createLibraryDraft(detail.library, detail.entries);
  let phase = 'editing', tab = 'figures', generation = 0, pending = null, error = null, operation = null, pendingFigure = null, conflict = false;
  const active = () => !['saved', 'discarded', 'expired'].includes(phase) && owner === identity();
  const current = epoch => active() && epoch === generation;
  const failed = (cause, previous) => {
    error = cause;
    if (cause.accessChanged || cause.status === 403) {
      phase = 'expired'; error.accessChanged = true; return { kind: 'denied', error };
    }
    phase = previous;
    conflict ||= cause.status === 409 || cause.code === 'PT409' || /inzwischen geändert|neu laden/i.test(cause.message);
    return { kind: 'failed', error };
  };
  const session = {
    get id() { return detail.library.id; },
    get detail() { return detail; },
    get model() { return model; },
    get active() { return active(); },
    get dirty() { return active() && (model.dirty || !!pendingFigure); },
    get phase() { return active() ? phase : owner === identity() ? phase : 'expired'; },
    get error() { return error; },
    get conflict() { return conflict; },
    get suspended() { return active() && ['suspended', 'resuming'].includes(phase); },
    get tab() { return tab; },
    set tab(value) { if (active() && ['figures', 'settings'].includes(value)) tab = value; },
    discard() { generation++; phase = 'discarded'; pending = null; },
    suspend() {
      if (!active() || pending) return false;
      phase = 'suspended'; return true;
    },
    resume(result = null) {
      if (!active()) return Promise.resolve({ kind: 'stale' });
      if (!session.suspended) return Promise.resolve({ kind: 'unchanged' });
      if (result) pendingFigure = structuredClone(result);
      if (pending) return operation === 'resume' ? pending : Promise.resolve({ kind: 'busy' });
      const epoch = generation; phase = 'resuming'; operation = 'resume'; error = null;
      const work = Promise.resolve().then(() => { if (current(epoch)) return readState(); }).then(snapshot => {
        if (!current(epoch)) return { kind: 'stale' };
        const library = snapshot.libraries?.find(l => l.id === detail.library.id);
        if (!snapshot.me || !(snapshot.me.is_admin || library?.manage || library?.owner_id === snapshot.me.id)) {
          phase = 'expired'; return { kind: 'denied', error: Object.assign(new Error('Keine Berechtigung zur Bibliotheksbearbeitung.'), { accessChanged: true }) };
        }
        if (pendingFigure) {
          const figure = snapshot.own_figures?.find(f => f.id === pendingFigure.figure && !f.deleted_at) ?? (pendingFigure.reference?.id === pendingFigure.figure ? pendingFigure.reference : null);
          const revision = pendingFigure.revision ? figure?.revisions?.find(r => r.id === pendingFigure.revision) : figure?.revisions?.[0];
          if (!figure || !revision) throw new Error('Figur gespeichert. Sie konnte noch nicht für die Bibliotheksbearbeitung geladen werden. Bitte die Rückkehr erneut versuchen.');
          model.add({ ...figure, revisions: [revision] }); pendingFigure = null;
        }
        phase = 'editing'; return { kind: 'resumed', state: snapshot };
      }).catch(cause => {
        if (!current(epoch)) return { kind: 'stale' };
        return failed(cause, 'suspended');
      }).finally(() => { if (pending === work) { pending = null; operation = null; } });
      pending = work; return work;
    },
    reload(confirmed) {
      if (!active()) return Promise.resolve({ kind: 'stale' });
      if (!confirmed) return Promise.resolve({ kind: 'kept' });
      if (pending) return operation === 'reload' ? pending : Promise.resolve({ kind: 'busy' });
      const epoch = generation, previous = phase; phase = 'reloading'; operation = 'reload';
      const work = Promise.resolve().then(() => { if (current(epoch)) return read(detail.library.id); }).then(fresh => {
        if (!current(epoch)) return { kind: 'stale' };
        if (!fresh.manage) { phase = 'expired'; return { kind: 'denied', error: Object.assign(new Error('Keine Berechtigung zur Bibliotheksbearbeitung.'), { accessChanged: true }) }; }
        const replacement = structuredClone(fresh);
        const draft = createLibraryDraft(replacement.library, replacement.entries);
        detail = replacement; model = draft; pendingFigure = null; conflict = false; error = null; phase = 'editing';
        return { kind: 'reloaded' };
      }).catch(cause => {
        if (!current(epoch)) return { kind: 'stale' };
        return failed(cause, previous);
      }).finally(() => { if (pending === work) { pending = null; operation = null; } });
      pending = work; return work;
    },
    save() {
      if (!active()) return Promise.resolve({ kind: 'stale' });
      if (pending) return operation === 'save' ? pending : Promise.resolve({ kind: 'busy' });
      if (pendingFigure) return session.resume().then(outcome => outcome.kind === 'resumed' ? session.save() : outcome);
      if (!model.data.title.trim() || model.data.title.length > 160) {
        error = new Error('Bitte einen gültigen Bibliotheksnamen eingeben.');
        tab = 'settings'; return Promise.resolve({ kind: 'failed', error });
      }
      const epoch = generation, previous = phase, payload = structuredClone(model.payload());
      phase = 'saving'; operation = 'save'; error = null;
      const work = Promise.resolve().then(() => { if (current(epoch)) return commit(payload); }).then(() => {
        if (!current(epoch)) return { kind: 'stale' };
        phase = 'saved'; return { kind: 'saved', id: detail.library.id };
      }, cause => {
        if (!current(epoch)) return { kind: 'stale' };
        return failed(cause, previous);
      }).finally(() => { if (pending === work) { pending = null; operation = null; } });
      pending = work; return work;
    },
    async leave(choice) {
      if (!active()) return { kind: 'stay' };
      if (choice === 'stay') return { kind: 'stay' };
      if (!session.dirty || choice === 'discard') { session.discard(); return { kind: 'left' }; }
      if (choice !== 'save') return { kind: 'stay' };
      const outcome = await session.save();
      return outcome.kind === 'saved' ? { kind: 'left', saved: true } : { kind: 'stay', error: outcome.error };
    }
  };
  return session;
}
