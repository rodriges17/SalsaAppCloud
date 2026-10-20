import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBackupWorkflow } from '../pwa/backup-workflow.js';
import { createBackup } from '../pwa/backup-format.js';

const source = () => ({ figure: { id: 'source', title: 'Ocho', description: '', tags: [], status: 'Sitzt', createdAt: 1700000000000, videoIds: ['v'], poster: null }, records: [{ name: 'Video', blob: new Blob(['video bytes'], { type: 'video/mp4' }), duration: 6, width: 320, height: 180 }] });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function setup(overrides = {}) {
  const sources = [source()], result = await createBackup(sources), calls = { exported: [], restored: [], granted: [], changed: 0 };
  const storage = {
    backupFoldersNeedingAccess: async () => [], allowFolderAccess: async id => { calls.granted.push(id); },
    inspectLocalBackup: async () => ({ sources, snapshot: 'revision-1' }),
    exportLocalBackup: async snapshot => { calls.exported.push(snapshot); return result; },
    storageSettings: async () => ({ supported: true, folders: [{ id: 'folder', name: 'Documents' }] }),
    planBackupRestore: async (archive, target) => ({ targetFolder: target, rows: archive.sources.map(source => ({ source, kind: 'new', choice: 'add', candidates: [] })) }),
    restoreBackupPlan: async (plan, choices) => { calls.restored.push({ target: plan.targetFolder, choices }); return choices.filter(c => c !== 'keep').length; },
    ...overrides
  };
  const states = [], workflow = createBackupWorkflow(storage, { onChange: state => states.push(state), onStorageChange: async () => { calls.changed++; } });
  return { workflow, storage, result, files: result.parts.map(p => p.blob), calls, states };
}
test('workflow: review binds export to inspected snapshot and exposes downloadable original bytes', async () => {
  const { workflow: w, calls, result } = await setup();
  await w.startCreate(); assert.equal(w.getState().view, 'create-ready'); assert.deepEqual(calls.exported, []);
  assert.equal(w.getState().data.figures, 1); await w.create();
  assert.deepEqual(calls.exported, ['revision-1']); assert.equal(w.getState().view, 'created');
  assert.deepEqual(await w.getState().data.parts[0].blob.arrayBuffer(), await result.parts[0].blob.arrayBuffer());
  assert.equal(await w.create(), false); assert.equal(w.close(), true); assert.equal(w.getState().data, null);
});
test('workflow: denied multi-folder grants retry and resume review; expired export access resumes export', async () => {
  const missing = new Set(['a', 'b']); let denied = true;
  const { workflow: w, calls } = await setup({
    backupFoldersNeedingAccess: async () => [...missing].map(id => ({ id, name: id, figureCount: 1 })),
    allowFolderAccess: async id => { if (denied) throw Error('Nicht erlaubt'); missing.delete(id); }
  });
  await w.startCreate(); assert.equal(w.getState().view, 'access'); assert.equal(w.getState().data.folders.length, 2);
  assert.equal(await w.grantAccess('unrelated'), false); await w.grantAccess('a'); assert.match(w.getState().message, /Nicht erlaubt/);
  assert.equal(w.getState().busy, false); denied = false; await w.grantAccess('a'); assert.equal(w.getState().data.folders.length, 1);
  await w.grantAccess('b'); assert.equal(w.getState().view, 'create-ready');
  missing.add('a'); await w.create(); assert.deepEqual(calls.exported, []); await w.grantAccess('a');
  assert.equal(w.getState().view, 'created'); assert.deepEqual(calls.exported, ['revision-1']); assert.equal(calls.changed, 3);
});
test('workflow: changed inventory blocks creation and permits a fresh review', async () => {
  const { workflow: w, storage } = await setup({ exportLocalBackup: async () => { throw Error('Bestand geändert'); } });
  await w.startCreate(); await w.create(); assert.notEqual(w.getState().view, 'created'); assert.match(w.getState().message, /Bestand geändert/);
  storage.inspectLocalBackup = async () => ({ sources: [source()], snapshot: 'revision-2' });
  storage.exportLocalBackup = async snapshot => { assert.equal(snapshot, 'revision-2'); return (await setup()).result; };
  await w.startCreate(); await w.create(); assert.equal(w.getState().view, 'created');
});
test('workflow: cancellation suppresses late scan results and overlapping actions', async () => {
  const gate = deferred(); let scans = 0;
  const { workflow: w } = await setup({ inspectLocalBackup: async () => { scans++; await gate.promise; return { sources: [source()], snapshot: 'old' }; } });
  const running = w.startCreate(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(await w.startCreate(), false); assert.equal(w.startRestore(), false); assert.equal(w.close(), false);
  assert.equal(w.cancel(), true); gate.resolve(); await running;
  assert.equal(scans, 1); assert.notEqual(w.getState().view, 'create-ready'); assert.match(w.getState().message, /Abgebrochen/);
  assert.equal(w.getState().busy, false); assert.equal(w.close(), true);
});
test('workflow: invalid replacement files discard a formerly valid archive and restore plan', async () => {
  const { workflow: w, files, calls } = await setup();
  w.startRestore(); await w.readFiles(files); await w.checkRestore();
  await w.readFiles([new Blob(['broken'])]); assert.equal(w.getState().view, 'restore-files');
  assert.equal(await w.checkRestore(), false); assert.equal(await w.restore(async () => true), false); assert.deepEqual(calls.restored, []);
});
test('workflow: target change invalidates old choices and requires a new plan and explicit confirmation', async () => {
  const { workflow: w, files, calls } = await setup();
  w.startRestore(); await w.readFiles(files); await w.checkRestore();
  assert.throws(() => w.setTarget('not-a-folder'), /Ungültiger/); w.setTarget('folder');
  assert.equal(await w.restore(async () => true), false); await w.checkRestore();
  assert.equal(w.getState().data.target, 'folder'); assert.equal(await w.restore(), false);
  await w.restore(async () => false); assert.deepEqual(calls.restored, []);
  await w.restore(async question => { assert.match(question.message, /1 Figuren/); return true; });
  assert.deepEqual(calls.restored, [{ target: 'folder', choices: ['add'] }]); assert.equal(w.getState().view, 'restored'); assert.equal(calls.changed, 1);
});
test('workflow: conflicts keep by default and forward only validated explicit choices', async () => {
  const { workflow: w, files, calls } = await setup({ planBackupRestore: async (archive, target) => ({ targetFolder: target, rows: archive.sources.map(source => ({ source, kind: 'conflict', choice: 'keep', candidates: [{ id: 'existing', title: 'Ocho', status: 'Neu' }] })) }) });
  w.startRestore(); await w.readFiles(files); await w.checkRestore(); assert.equal(w.getState().data.rows[0].choice, 'keep');
  assert.throws(() => w.setChoice(0, 'replace:unrelated'), /Ungültige/); w.setChoice(0, 'replace:existing');
  await w.restore(async question => { assert.match(question.message, /1 vorhandene Figuren/); return true; });
  assert.deepEqual(calls.restored[0].choices, ['replace:existing']); assert.equal(await w.restore(async () => true), false);
});
test('workflow: stale restore plan errors never report success or emit a storage change', async () => {
  const { workflow: w, files, calls } = await setup({ restoreBackupPlan: async () => { throw Error('Zielspeicher geändert'); } });
  w.startRestore(); await w.readFiles(files); await w.checkRestore(); await w.restore(async () => true);
  assert.notEqual(w.getState().view, 'restored'); assert.match(w.getState().message, /Zielspeicher geändert/); assert.equal(calls.changed, 0);
});
test('workflow: cancellation while confirming performs no restore', async () => {
  const { workflow: w, files, calls } = await setup(); const gate = deferred();
  w.startRestore(); await w.readFiles(files); await w.checkRestore();
  const running = w.restore(() => gate.promise); assert.equal(w.cancel(), true); gate.resolve(true); await running;
  assert.deepEqual(calls.restored, []); assert.match(w.getState().message, /Abgebrochen/);
});
test('workflow: commit disables cancellation until completed and cannot be reentered', async () => {
  const gate = deferred(); let writes = 0;
  const { workflow: w, files } = await setup({ restoreBackupPlan: async (_plan, _choices, options) => { writes++; options.progress({ phase: 'commit' }); options.progress({ phase: 'cleanup' }); await gate.promise; return 1; } });
  w.startRestore(); await w.readFiles(files); await w.checkRestore(); const running = w.restore(async () => true);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(w.getState().canCancel, false); assert.equal(w.cancel(), false);
  assert.equal(await w.restore(async () => true), false); assert.equal(w.close(), false); gate.resolve(); await running;
  assert.equal(writes, 1); assert.equal(w.getState().view, 'restored'); assert.equal(w.getState().data.count, 1);
});
