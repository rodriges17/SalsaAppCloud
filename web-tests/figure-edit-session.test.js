import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFigureEditSession } from '../pwa/figure-edit-session.js';

const video = (id = 'one') => ({ id, name: id, blob: new Blob(['video'], { type: 'video/mp4' }), duration: 1, confirmed: true });
const figure = { id: 'figure', title: 'Drehung', description: 'Zählzeit', tags: ['Salsa'], status: 'Am Üben', revision: 'v1' };
const adapters = { readVideos: async () => [video()], commit: async f => ({ ...f, revision: 'v2' }), refresh: async () => {} };

test('new and imported figures require review, preserve ordering and save through the shared session', async () => {
  for (const imported of [null, { title: 'Importiert', description: 'Text', tags: ['Kurs'], fingerprint: 'zip', drafts: [video('import')] }]) {
    let stored;
    const s = createFigureEditSession({ imported, ...adapters, commit: async (f, drafts) => { stored = { ...f, videos: drafts.map(v => v.name) }; return { ...f, revision: 'saved' }; } });
    if (!imported) { s.update({ title: 'Neu' }); s.addFiles([new File(['first'], 'erstes.mp4', { type: 'video/mp4' })]); }
    s.addFiles([new File(['second'], 'zweites.mp4', { type: 'video/mp4' })]);
    assert.equal(s.canSave, false);
    let p = s.review();
    while (p) { assert.equal((await s.acceptPreview(p, async () => ({ duration: 2, width: 160, height: 240 }))).kind, 'accepted'); p = s.endPreview(); }
    s.move(s.drafts[1].id, 0); s.rename(s.drafts[0].id, 'Vorne');
    assert.equal(s.canSave, true);
    assert.equal(s.leave().kind, 'confirm'); assert.equal(s.leave(false).kind, 'confirm');
    assert.equal((await s.save()).kind, 'saved');
    assert.deepEqual(stored.videos, ['Vorne', imported ? 'import' : 'erstes']);
    assert.equal(stored.importFingerprint, imported ? 'zip' : null);
    assert.equal(s.dirty, false); assert.equal(s.leave().kind, 'left');
  }
});

test('existing figures retain their revision, support replacement and protect a pending save from leaving', async () => {
  const gate = deferred(); let stored;
  const s = createFigureEditSession({ figure, ...adapters, commit: async (f, drafts, revision) => { stored = { f, drafts, revision }; await gate.promise; return { ...f, revision: 'v2' }; } });
  await s.load(); assert.equal(s.dirty, false);
  s.update({ description: 'Neu', status: 'Sitzt' });
  const p = s.startReplacement(new File(['replacement'], 'ersatz.mp4', { type: 'video/mp4' }), s.drafts[0].id);
  await s.acceptPreview(p, async () => ({ duration: 3, width: 320, height: 240 })); s.endPreview();
  const saving = s.save(); assert.equal(s.leave(true).kind, 'busy'); await Promise.resolve();
  assert.equal(stored.revision, 'v1'); assert.equal(stored.drafts[0].existing, false);
  gate.resolve(); assert.equal((await saving).kind, 'saved');
  assert.equal(stored.f.status, 'Sitzt'); assert.equal(stored.f.description, 'Neu');
});

function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }

test('metadata stays editable during verification while media changes wait and closed sessions ignore late results', async () => {
  const gate = deferred(); let signal, progress, updates = 0;
  const s = createFigureEditSession({ figure, ...adapters, readVideos: async (f, repair, options) => { signal = options.signal; progress = options.progress; return gate.promise; } });
  const loading = s.load({ progress: () => { updates++; } });
  s.update({ title: 'Während Prüfung' }); s.addFiles([new File(['x'], 'neu.mp4', { type: 'video/mp4' })]);
  assert.equal(s.canSave, false); assert.equal(s.drafts.length, 0);
  assert.equal(s.data.title, 'Während Prüfung');
  assert.equal(s.leave(true).kind, 'left'); assert.equal(signal.aborted, true);
  progress({ done: 1, total: 1 }); gate.resolve([video()]);
  assert.equal((await loading).kind, 'stale'); assert.equal(updates, 0); assert.equal(s.drafts.length, 0);
  const fresh = createFigureEditSession({ figure, ...adapters });
  const pending = fresh.load(); fresh.update({ description: 'Bearbeitet' }); await pending;
  assert.equal(fresh.data.description, 'Bearbeitet'); assert.equal(fresh.canSave, true); assert.equal(fresh.dirty, true);
});

test('save failure retains the complete draft and conflicts require a confirmed successful reload', async () => {
  let mode = 'offline', expected, reads = 0;
  const s = createFigureEditSession({ figure, ...adapters,
    commit: async (f, drafts, revision) => { expected = revision; throw Object.assign(Error(mode), { code: mode === 'conflict' ? 'FIGURE_CONFLICT' : 'OFFLINE' }); },
    readFigure: async () => { if (++reads === 1) return figure; if (mode === 'offline') throw Error('offline'); return { ...figure, revision: 'v3', title: 'Fremde Änderung' }; }
  });
  await s.load(); s.update({ title: 'Mein Entwurf', tags: ['Eigene Tags'] }); s.rename('one', 'Umbenannt');
  assert.equal((await s.save()).kind, 'failed'); assert.equal(s.saved, null); assert.equal(s.canSave, true);
  assert.equal(s.data.title, 'Mein Entwurf'); assert.equal(s.drafts[0].name, 'Umbenannt');
  mode = 'conflict'; await s.save(); assert.equal(s.conflict, true); assert.equal(expected, 'v1'); assert.equal(s.canSave, false);
  assert.equal((await s.reload(false)).kind, 'kept'); assert.equal(s.data.title, 'Mein Entwurf');
  mode = 'offline'; assert.equal((await s.reload(true)).kind, 'failed');
  assert.equal(s.data.title, 'Mein Entwurf'); assert.equal(s.drafts[0].name, 'Umbenannt'); assert.equal(s.conflict, true);
  mode = 'conflict'; assert.equal((await s.reload(true)).kind, 'reloaded');
  assert.equal(s.data.title, 'Fremde Änderung'); assert.equal(s.dirty, false); assert.equal(s.conflict, false);
  await s.save(); assert.equal(expected, 'v3');
});

test('a committed figure survives refresh failure and concurrent retries never save it twice', async () => {
  let writes = 0, reads = 0, fail = true;
  const gate = deferred();
  const s = createFigureEditSession({ figure, ...adapters,
    commit: async f => { writes++; return { ...f, revision: 'committed' }; },
    refresh: async () => { reads++; if (fail) throw Error('Übersicht offline'); await gate.promise; }
  });
  await s.load(); s.update({ description: 'Gespeichert' });
  const first = s.save(); assert.equal(s.save(), first);
  assert.equal((await first).kind, 'refresh-needed'); assert.equal(s.saved.revision, 'committed');
  assert.equal(s.dirty, false); assert.equal(s.canSave, false);
  assert.equal((await s.retryRefresh()).kind, 'refresh-needed'); assert.equal(writes, 1);
  fail = false; const retry = s.retryRefresh(); assert.equal(s.retryRefresh(), retry);
  assert.equal(s.leave().kind, 'busy'); gate.resolve(); assert.equal((await retry).kind, 'saved');
  assert.equal(writes, 1); assert.equal(reads, 3); assert.equal(s.leave().kind, 'left');
});

test('preview uses the current video name and a cancelled inspection cannot confirm a later preview', async () => {
  const s = createFigureEditSession({ figure, ...adapters }); await s.load();
  const rendered = s.drafts[0]; s.rename(rendered.id, 'Aktueller Name');
  const p = s.startPreview(rendered); const gate = deferred();
  const accepting = s.acceptPreview(p, () => gate.promise); s.endPreview();
  const current = s.startPreview(rendered);
  gate.resolve({ duration: 2, poster: new Blob(['late']) });
  assert.equal((await accepting).kind, 'stale');
  await s.acceptPreview(current, async () => ({ duration: 3 })); s.endPreview();
  assert.equal(s.drafts[0].name, 'Aktueller Name'); assert.equal(s.drafts[0].duration, 3);
});

test('failed or invalid preview inspection keeps new media unconfirmed and can be retried', async () => {
  const s = createFigureEditSession({ ...adapters }); s.update({ title: 'Test' });
  s.addFiles([new File(['video'], 'probe.mp4', { type: 'video/mp4' })]);
  const p = s.review();
  assert.equal((await s.acceptPreview(p, async () => { throw Error('Vorschau fehlgeschlagen'); })).kind, 'failed');
  assert.equal((await s.acceptPreview(p, async () => ({ duration: 0 }))).kind, 'failed');
  assert.equal(s.drafts[0].confirmed, false);
  assert.equal((await s.acceptPreview(p, async () => ({ duration: 1 }))).kind, 'accepted');
  s.endPreview(); assert.equal(s.canSave, true);
});

test('invalid stored media does not leave saving locked and can be repaired', async () => {
  const s = createFigureEditSession({ figure, ...adapters, readVideos: async () => [{ ...video(), duration: 0 }] });
  await s.load(); assert.equal((await s.save()).kind, 'failed'); assert.equal(s.busy, false);
  const p = s.startReplacement(new File(['repair'], 'repariert.mp4', { type: 'video/mp4' }), 'one');
  await s.acceptPreview(p, async () => ({ duration: 1 })); s.endPreview();
  assert.equal((await s.save()).kind, 'saved');
});

test('opening from an old overview reads the stored revision without losing edits made during loading', async () => {
  const gate = deferred(); let readRevision;
  const s = createFigureEditSession({ figure, ...adapters, readFigure: () => gate.promise,
    readVideos: async current => { readRevision = current.revision; return [video('fresh')]; }
  });
  const loading = s.load(); s.update({ description: 'Schon eingegeben' });
  gate.resolve({ ...figure, title: 'Gespeicherter Stand', revision: 'v4', tags: ['Neu'] }); await loading;
  assert.equal(s.data.title, 'Gespeicherter Stand'); assert.equal(s.data.description, 'Schon eingegeben');
  assert.deepEqual(s.data.tags, ['Neu']); assert.equal(readRevision, 'v4'); assert.equal(s.dirty, true);
});

test('confirmed discard stays closed when navigation completes a second leave', () => {
  const s = createFigureEditSession(adapters);
  s.update({ title: 'Ungespeichert' });
  assert.equal(s.leave().kind, 'confirm');
  assert.equal(s.leave(true).kind, 'left');
  assert.equal(s.leave().kind, 'left');
});
