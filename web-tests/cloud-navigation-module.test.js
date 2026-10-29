import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCloudNavigation } from '../pwa/cloud-navigation.js';

function fixture() {
  const screen = { open: false, busy: false, signedIn: true, area: 'figures', library: null, source: null, account: false, login: false };
  const shown = [];
  let editor = null, peopleLeave = async () => true, owner = 'account-a';
  let load = async (library, mode) => { screen.library = library; shown.push({ library, mode }); };
  const nav = createCloudNavigation({ identity: () => owner, view: {
    context: () => screen,
    enter(local, library) { Object.assign(screen, { open: true, source: local, library, area: 'initial' }); },
    hide() { screen.open = false; },
    select(area, library = null) { Object.assign(screen, { area, library, source: null }); },
    initialArea: () => 'figures', resetFigures() {},
    load: (...args) => load(...args),
    async render(library, detail) { screen.library = library; shown.push(detail.library.title); },
    dismissAccount() { screen.account = false; }, dismissLogin() { screen.login = false; },
    showAccount() { screen.account = true; }, settings() {},
    resetSession() { shown.length = 0; screen.account = false; screen.login = false; screen.busy = false; },
    run: async (_message, work) => work()
  }, drafts: {
    peopleLeave: () => peopleLeave(), library: () => editor,
    async leaveLibrary() { editor?.discard(); editor = null; return true; },
    clearLibrary() { editor = null; }, resumeLibrary: async () => {},
  } });
  return { nav, screen, shown, setEditor: value => editor = value, setPeopleLeave: value => peopleLeave = value,
    setLoad: value => load = value,
    changeOwner(value) { owner = value; screen.signedIn = value !== 'public'; return nav.sessionChanged({ external: true }); } };
}

test('Cloud navigation prioritizes account and login dialogs, then returns from an unchanged library without loading', async () => {
  const f = fixture(); await f.nav.open();
  const detail = { library: { title: 'Kurs' } };
  f.screen.account = true; f.screen.login = true;
  f.setEditor({ active: true, id: 'course', detail, phase: 'editing', discard() { this.active = false; } });
  await f.nav.back(); assert.equal(f.screen.account, false); assert.equal(f.screen.login, true);
  await f.nav.back(); assert.equal(f.screen.login, false);
  f.shown.length = 0;
  await f.nav.back();
  assert.deepEqual(f.shown, ['Kurs']); assert.equal(f.screen.open, true);
  await f.nav.back(); assert.equal(f.screen.area, 'libraries');
  await f.nav.back(); assert.equal(f.screen.open, false);
});

test('account change preempts a pending leave and its late answer cannot close the new account screen', async () => {
  const f = fixture(); await f.nav.open();
  let decide;
  f.setPeopleLeave(() => new Promise(resolve => decide = resolve));
  const closing = f.nav.close(); await Promise.resolve();
  await f.changeOwner('account-b');
  assert.deepEqual(f.shown, [{ library: null, mode: true }]);
  assert.equal(f.screen.area, 'initial');
  decide(true); await closing;
  assert.equal(f.screen.open, true, 'old close cannot hide the new account');
  f.setPeopleLeave(async () => true);
  await f.nav.show('libraries'); assert.equal(f.screen.area, 'libraries');
});

test('repeated navigation while a leave decision is pending is ignored and staying releases navigation', async () => {
  const f = fixture(); await f.nav.open(); f.shown.length = 0;
  let resolveLeave, prompts = 0;
  f.setPeopleLeave(() => { prompts++; return new Promise(resolve => resolveLeave = resolve); });
  const leaving = f.nav.show('libraries');
  await Promise.resolve();
  const repeated = Promise.all([f.nav.back(), f.nav.show('figures'), f.nav.close(), f.nav.refresh(), f.nav.settings()]);
  await Promise.resolve();
  assert.equal(prompts, 1, 'there is only one pending decision');
  resolveLeave(false); await leaving; await repeated;
  assert.equal(f.screen.open, true); assert.deepEqual(f.shown, []);
  f.setPeopleLeave(async () => true);
  await f.nav.show('libraries');
  assert.equal(f.screen.area, 'libraries'); assert.equal(f.shown.length, 1);
});

test('a failed leave releases navigation and keeps the current screen', async () => {
  const f = fixture(); await f.nav.open();
  f.setPeopleLeave(async () => { throw new Error('Rückfrage fehlgeschlagen'); });
  await assert.rejects(f.nav.show('libraries'), /Rückfrage fehlgeschlagen/);
  assert.equal(f.screen.area, 'initial'); assert.equal(f.screen.open, true);
  f.setPeopleLeave(async () => true); await f.nav.close();
  assert.equal(f.screen.open, false);
});

test('an already displayed cached screen allows navigation while its background refresh waits', async () => {
  const f = fixture(); await f.nav.open(); let release, painted;
  const visible = new Promise(resolve => painted = resolve);
  f.setLoad(async () => {
    f.nav.viewReady(f.nav.revision); painted();
    await new Promise(resolve => release = resolve);
  });
  const opening = f.nav.show('libraries'); await visible;
  await f.nav.close(); assert.equal(f.screen.open, false);
  release(); await opening; assert.equal(f.screen.open, false);
});
