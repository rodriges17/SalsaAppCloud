// Cloud navigation owns transition ordering. The view adapter renders screens;
// the existing draft modules retain ownership of their editing lifetimes.
export function createCloudNavigation({ identity, view, drafts }) {
  let revision = 0, generation = 0, pending = null;
  const context = () => view.context();
  const capture = () => {
    const epoch = generation, owner = identity();
    return () => epoch === generation && owner === identity();
  };
  async function transition(work) {
    if (pending || context().busy) return;
    const token = {}; pending = token;
    try { return await work(capture()); }
    finally { if (pending === token) pending = null; }
  }
  async function load(library, mode) {
    if (pending) pending.loading = true;
    return view.load(library, mode);
  }
  const leave = async active => await drafts.peopleLeave(active) && active() && await drafts.leaveLibrary(active) && active();
  async function close(active) {
    if (context().busy || !await leave(active)) return;
    drafts.clearLibrary(); revision++; view.hide();
  }
  async function show(area, library, active) {
    if (context().busy || !await leave(active)) return;
    if (area === 'figures' || area === 'initial') view.resetFigures();
    drafts.clearLibrary(); view.select(area, library);
    if (['admin', 'create'].includes(area)) await view.run('Laden …', () => view.load(library));
    else await load(library, true);
  }
  async function leaveEditor(active) {
    const editor = drafts.library();
    if (context().busy || !editor?.active || !await drafts.leaveLibrary(active) || !active()) return;
    drafts.clearLibrary();
    if (editor.phase === 'saved') await view.load(editor.id);
    else await view.render(editor.id, editor.detail);
  }
  return {
    get revision() { return revision; },
    capture,
    invalidateView() { return ++revision; },
    viewReady(epoch) { if (epoch === revision && pending?.loading) pending = null; },
    close: () => transition(close),
    show: (area, library = null) => transition(active => show(area, library, active)),
    leaveEditor: () => transition(leaveEditor),
    open: (local = null, library = null) => transition(async active => {
      const screen = context();
      if (screen.busy || screen.open || local && !screen.signedIn) return;
      view.resetFigures(); await view.enter(local, library);
      if (!active() || !context().open) return;
      if (local) await view.run('Cloud-Inhalte werden geladen …', () => view.load(library));
      else {
        // The shell is already visible. Loading is not a navigation transition:
        // Back must work even before the first network response arrives.
        pending = null;
        await view.load(library, true);
      }
    }),
    back: () => transition(async active => {
      const screen = context();
      if (screen.busy) return;
      if (screen.account) { view.dismissAccount(); return; }
      if (screen.login) { view.dismissLogin(); return; }
      if (drafts.library()?.suspended) { await view.run('Bibliotheksbearbeitung wird geladen …', () => drafts.resumeLibrary()); return; }
      if (drafts.library()?.active) { await leaveEditor(active); return; }
      if (screen.area === 'admin') {
        if (!await drafts.peopleLeave(active) || !active()) return;
        view.select(view.initialArea()); await view.load(null); if (active()) view.showAccount(); return;
      }
      if (screen.library) { await show('libraries', null, active); return; }
      await close(active);
    }),
    refresh: () => transition(async active => {
      if (!context().busy && await drafts.peopleLeave(active) && active()) await load(context().library, 'refresh');
    }),
    settings: () => transition(async active => {
      if (!context().busy && await drafts.peopleLeave(active) && active()) view.settings();
    }),
    account: () => transition(async () => { view.showAccount(); }),
    login: () => transition(async () => { view.showLogin(); }),
    logout: () => transition(async active => {
      if (!await leave(active)) return;
      view.dismissAccount();
      await view.run('Abmelden …', async () => {
        await view.logout();
        // Logout deliberately changes the generation. A later login wins.
        if (!context().signedIn && context().open) { view.select('initial'); await view.load(null, true); }
      });
    }),
    async sessionChanged() {
      generation++; revision++; pending = null;
      drafts.clearLibrary(); view.resetSession();
      view.select('initial');
      if (context().open) await view.load(null, true);
    }
  };
}
