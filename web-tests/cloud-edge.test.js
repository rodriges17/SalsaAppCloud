import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
const source = stripTypeScriptTypes((await readFile('supabase/functions/cloud/index.ts', 'utf8')).replace(/^import .*?;\n/, ''));
async function fixture({ admin = true, manage = true, signedIn = true, ttl, upload = true, collaborative = true } = {}) {
  let handle; const calls = [];
  const state = { me: { id: 'admin', is_admin: admin }, people: [{ id: 'writer', email: 'writer@example.test' }] };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'admin' } }, error: null }), admin: {
      generateLink: async () => ({ data: { properties: { hashed_token: 'secret-once' }, user: { confirmation_sent_at: '2026-10-25T12:00:00Z' } }, error: null }),
      createUser: async () => { calls.push('createUser'); return { data: { user: { id: 'new' } } }; },
      listUsers: async () => ({ data: { users: [] } })
    } },
    rpc: async (name, { action, payload }) => { calls.push({ action, payload }); return { data: action === 'state' ? state : action === 'library' ? { manage, library: { collaborative } } : { ok: true }, error: null }; },
    from: table => ({ select(columns) { calls.push({ table, columns }); return { eq(key, value) { calls.push({ key, value }); return { maybeSingle: async () => ({ data: { upload_enabled: upload } }), then(resolve) { return Promise.resolve({ data: [{ library_id: 'private', role: 'reader' }] }).then(resolve); } }; } }; } })
  };
  vm.runInNewContext(source, { createClient: () => client, Deno: { env: { get: k => k === 'CLOUD_MAGIC_LINK_TTL_SECONDS' ? ttl : k === 'SUPABASE_URL' ? 'https://example.test' : 'test' }, serve: h => handle = h }, Response, Date, Number, Error, Object, String, JSON, encodeURIComponent });
  return { calls, async request(action, payload = {}) { const response = await handle(new Request('https://example.test/cloud', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(signedIn ? { Authorization: 'Bearer user-jwt' } : {}) }, body: JSON.stringify({ action, payload }) })); return { status: response.status, body: await response.json() }; } };
}
test('edge: only platform admins can inspect person memberships or generate links', async () => {
  for (const signedIn of [true, false]) { const f = await fixture({ admin: false, signedIn }); for (const action of ['admin_access', 'admin_link', 'admin_user']) assert.equal((await f.request(action, { id: 'writer', email: 'writer@example.test' })).status, 403); assert.ok(!f.calls.some(c => c.table)); }
});
test('edge: person access queries only the selected known person', async () => {
  const f = await fixture(); assert.equal((await f.request('admin_access', { id: 'writer' })).body.memberships[0].library_id, 'private'); assert.ok(f.calls.some(c => c.key === 'user_id' && c.value === 'writer'));
  assert.equal((await f.request('admin_access', { id: 'unknown' })).status, 400);
});
test('edge: library owners may check one exact email, without a directory; non-managers cannot', async () => {
  const denied = await fixture({ admin: false, manage: false }); assert.equal((await denied.request('member_check', { library: 'x', email: 'writer@example.test' })).status, 403); assert.ok(!denied.calls.some(c => c.table));
  const owner = await fixture({ admin: false }); assert.equal((await owner.request('member_check', { library: 'x', email: ' WRITER@example.test ' })).body.upload_enabled, true); assert.ok(owner.calls.some(c => c.key === 'email' && c.value === 'writer@example.test'));
});
test('edge: contributions require both upload approval and a collaborative library', async () => {
  for (const flags of [{ upload: false }, { collaborative: false }]) { const f = await fixture(flags); assert.equal((await f.request('member', { library: 'x', email: 'writer@example.test', role: 'contributor' })).status, 400); assert.ok(!f.calls.some(c => c.action === 'member')); }
});
test('edge: creating existing people and invalid quotas never create auth accounts', async () => {
  const f = await fixture(); assert.equal((await f.request('admin_user', { email: 'writer@example.test', quota: 250000000, create_only: true })).status, 400);
  assert.equal((await f.request('admin_user', { email: 'new@example.test', quota: -1 })).status, 400); assert.ok(!f.calls.includes('createUser'));
});
test('edge: link expiry has no guessed default and uses verified TTL with server issue time', async () => {
  const unknown = await fixture(); assert.equal((await unknown.request('admin_link', { email: 'writer@example.test' })).body.expires_at, null);
  const known = await fixture({ ttl: '3600' }); const r = await known.request('admin_link', { email: 'writer@example.test' }); assert.equal(r.body.expires_at, '2026-10-25T13:00:00.000Z'); assert.match(r.body.link, /token_hash=secret-once/);
});
