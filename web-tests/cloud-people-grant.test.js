import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPeopleGrant } from '../pwa/cloud-people-grant.js';

// Controlled external writes expose duplicate account creation or assignments.
function fixture() {
  const writes = []; let failLibrary = 'second';
  const grants = createPeopleGrant({ call: async (action, payload) => {
    if (action === 'member' && payload.library === failLibrary) {
      failLibrary = null; throw new Error('Zuweisung fehlgeschlagen');
    }
    writes.push({ action, ...payload });
  } });
  return { grants, writes };
}

test('new person retries only unsaved assignments after a partial success', async () => {
  const { grants, writes } = fixture();
  const draft = grants.create(); draft.email = 'new@test.ch';
  draft.libraries = { first: 'reader', second: 'contributor', third: 'reader' };
  const partial = await grants.save(draft);
  assert.equal(partial.kind, 'partial');
  assert.equal(draft.created, true);
  assert.deepEqual(draft.done, { first: true, third: true });
  assert.equal(draft.failures.second, 'Zuweisung fehlgeschlagen');
  assert.equal((await grants.save(draft)).kind, 'saved');
  assert.deepEqual(writes.map(w => w.action === 'member' ? w.library : w.action), ['admin_user', 'first', 'third', 'second']);
  assert.equal(writes[0].create_only, true);
  assert.deepEqual(draft.failures, {});
});

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const person = { id: 'writer', email: 'writer@test.ch', upload_enabled: true, quota: 250000000 };

test('concurrent save attempts do not duplicate the pending account write', async () => {
  const account = deferred(), writes = [];
  const grants = createPeopleGrant({ call: async (action, payload) => { writes.push({ action, ...payload }); if (action === 'admin_user') await account.promise; } });
  const draft = grants.edit(person); draft.quota = 300; draft.members.first = 'reader';
  const saving = grants.save(draft);
  const repeated = grants.save(draft);
  account.resolve();
  assert.equal((await repeated).kind, 'busy');
  assert.equal((await saving).kind, 'saved');
  assert.deepEqual(writes.map(w => w.action), ['admin_user', 'member']);
});

for (const stage of ['admin_user', 'member']) for (const rejected of [false, true]) {
  test(`session reset during ${stage} ignores a late ${rejected ? 'error' : 'success'} and allows a new save`, async () => {
    const waiting = deferred(), writes = [];
    let held = false;
    const grants = createPeopleGrant({ call: async (action, payload) => {
      writes.push({ action, ...payload });
      if (action === stage && !held) { held = true; await waiting.promise; }
    } });
    const draft = grants.edit(person); draft.quota = 300; draft.members = { first: 'reader', second: 'reader' };
    const old = grants.save(draft);
    await Promise.resolve();
    grants.reset();
    const next = grants.create(); next.email = 'next@test.ch'; next.libraries = { next: 'reader' };
    assert.equal((await grants.save(next)).kind, 'saved');
    if (rejected) waiting.reject(new Error('old session failed')); else waiting.resolve();
    assert.equal((await old).kind, 'stale');
    assert.equal(writes.some(w => w.email === person.email && w.library === 'second'), false);
    assert.equal(draft.saved.quota, stage === 'admin_user' ? 250000000 : 300000000);
    assert.deepEqual(draft.members, { first: 'reader', second: 'reader' });
    assert.equal(next.created, true);
  });
}

test('removing a failed assignment from the wizard lets remaining saved work finish', async () => {
  const { grants, writes } = fixture(), draft = grants.create(); draft.email = 'new@test.ch';
  draft.libraries = { first: 'reader', second: 'reader' };
  assert.equal((await grants.save(draft)).kind, 'partial');
  draft.libraries.second = '';
  assert.equal((await grants.save(draft)).kind, 'saved');
  assert.deepEqual(writes.map(w => w.action === 'member' ? w.library : w.action), ['admin_user', 'first']);
});

test('editing retries the failed second assignment without repeating the saved account or first assignment', async () => {
  const { grants, writes } = fixture(), draft = grants.edit(person);
  draft.quota = 300; draft.members = { first: 'reader', second: 'reader', third: 'reader' };
  await assert.rejects(grants.save(draft), /Zuweisung fehlgeschlagen/);
  assert.equal(grants.pending, true);
  assert.equal((await grants.save(draft)).kind, 'saved');
  assert.deepEqual(writes.map(w => w.action === 'member' ? w.library : w.action), ['admin_user', 'first', 'second', 'third']);
  assert.equal(grants.pending, false);
  draft.quota = 350;
  assert.equal((await grants.save(draft)).kind, 'saved');
  assert.equal(writes.at(-1).quota, 350000000);
});

test('a rejected account write is retriable and does not start assignments', async () => {
  let fail = true; const writes = [];
  const grants = createPeopleGrant({ call: async (action, payload) => {
    if (action === 'admin_user' && fail) { fail = false; throw new Error('Konto fehlgeschlagen'); }
    writes.push({ action, ...payload });
  } });
  const draft = grants.create(); draft.email = 'new@test.ch'; draft.libraries = { first: 'reader' };
  await assert.rejects(grants.save(draft), /Konto fehlgeschlagen/);
  assert.equal(draft.created, false); assert.deepEqual(writes, []);
  assert.equal((await grants.save(draft)).kind, 'saved');
  assert.deepEqual(writes.map(w => w.action), ['admin_user', 'member']);
});

test('late cleanup from an old session cannot unlock a newer pending save', async () => {
  const oldGate = deferred(), newGate = deferred();
  const grants = createPeopleGrant({ call: async (action, payload) => {
    if (action === 'admin_user') await (payload.email === person.email ? oldGate.promise : newGate.promise);
  } });
  const draft = grants.edit(person); draft.quota = 300;
  const old = grants.save(draft); grants.reset();
  const next = grants.create(); next.email = 'next@test.ch'; const saving = grants.save(next);
  oldGate.resolve(); assert.equal((await old).kind, 'stale');
  assert.equal((await grants.save(next)).kind, 'busy');
  newGate.resolve(); assert.equal((await saving).kind, 'saved');
});

test('cancelling upload removal preserves the draft and releases the save lock', async () => {
  const { grants, writes } = fixture(), draft = grants.edit(person); draft.enabled = false;
  assert.equal((await grants.save(draft, { confirm: async () => false })).kind, 'cancelled');
  assert.equal(grants.pending, true); assert.deepEqual(writes, []);
  assert.equal((await grants.save(draft, { confirm: async () => true })).kind, 'saved');
});
