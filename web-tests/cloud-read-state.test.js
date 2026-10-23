import { test } from 'node:test';
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem: () => null };
globalThis.location = { hash: '', href: 'https://example.test/', pathname: '/', search: '' };
const { createCloudReadState } = await import('../pwa/cloud-read-state.js');
function fixture() {
  let owner = 'a', revision = 0, time = 100000, connected = true, calls = [], handler;
  const records = new Map();
  const state = { me: { id: 'a' }, libraries: [], own_figures: [], people: ['secret'], settings: { secret: true } };
  const read = async (o,k) => records.get(`${o}:${k}`) ?? null;
  const clear = async () => { revision++; records.clear(); };
  const mod = createCloudReadState({ identity: () => owner, generation: () => revision, login: async () => {}, now: () => time, online: () => connected,
    read, clear, write: async (o,k,value,r=revision) => { if(r!==revision) return null; const record={ value, updatedAt:time }; records.set(`${o}:${k}`,record); return record; },
    call: async (action) => { calls.push(action); return handler ? handler(action) : action === 'state' ? structuredClone(state) : { library: { id: 'l' }, entries: [] }; }
  });
  return { mod, records, calls, state, clear, owner: v => owner=v, time: v => time=v, online: v => connected=v, handle: v => handler=v };
}
const deferred = () => { let resolve; const promise = new Promise(r=>resolve=r); return {promise,resolve}; };
test('read-state: cold load, sanitized persistence, freshness boundary and offline snapshot', async () => {
 const f=fixture(); await f.mod.open(); await f.mod.refresh('a','l');
 const saved=await f.mod.cached('a','l'); assert.equal(saved.fresh,true); assert.deepEqual(saved.state.value.people,[]); assert.equal(saved.state.value.settings,null);
 f.time(159999); assert.equal((await f.mod.cached('a','l')).fresh,true);
 f.time(160000); assert.equal((await f.mod.cached('a','l')).fresh,false);
 f.online(false); assert.equal((await f.mod.cached('a','l')).online,false); assert.equal(f.calls.length,2);
});
test('read-state: concurrent refreshes coalesce and manual refresh bypasses fresh cache',async()=>{
 const f=fixture(), gate=deferred(); f.handle(async a=>{await gate.promise; return a==='state'?f.state:{entries:[]};});
 const a=f.mod.refresh('a'),b=f.mod.refresh('a');gate.resolve();await Promise.all([a,b]);assert.deepEqual(f.calls,['state']);
 const available=(await f.mod.cached('a')).state;await f.mod.refresh('a',null,{available});assert.equal(f.calls.length,1);
 await f.mod.refresh('a',null,{available,force:true});assert.equal(f.calls.length,2);
});
test('read-state: mutation or logout during a response cannot repopulate cache',async()=>{
 for(const change of ['mutation','logout']) {const f=fixture(),gate=deferred();f.handle(async()=>{await gate.promise;return f.state;});
 const pending=f.mod.refresh('a');await f.clear();if(change==='logout')f.owner('public');gate.resolve();await assert.rejects(pending,/inzwischen/);assert.equal(f.records.size,0);}
});
test('read-state: permission changes discard library and poster snapshots',async()=>{
 const f=fixture();await f.mod.refresh('a','l');f.records.set('a:poster:r',{value:'poster'});f.state.me.is_admin=true;
 const result=await f.mod.refresh('a');assert.equal(result.snapshot.accessChanged,true);assert.equal(f.records.has('a:library:l'),false);assert.equal(f.records.has('a:poster:r'),false);
});
test('read-state: access denial clears cache; stale denial must not clear newer content',async()=>{
 const f=fixture();await f.mod.refresh('a');f.handle(()=>{throw Object.assign(new Error('denied'),{status:403});});
 await assert.rejects(f.mod.refresh('a'),e=>e.cacheCleared);assert.equal(f.records.size,0);
 const gate=deferred();f.handle(async()=>{await gate.promise;throw Object.assign(new Error('old denied'),{status:403});});
 const pending=f.mod.refresh('a');await f.clear();f.records.set('a:state',{value:'new'});gate.resolve();await assert.rejects(pending,/inzwischen/);assert.equal(f.records.get('a:state').value,'new');
});
test('read-state: invalidation during library write rejects entire result',async()=>{
 const f=fixture(),gate=deferred();f.handle(async action=>{if(action==='state')return f.state;await gate.promise;return {entries:[]};});
 const pending=f.mod.refresh('a','l');while(f.calls.length<2)await new Promise(r=>setImmediate(r));await f.clear();gate.resolve();await assert.rejects(pending,/inzwischen/);assert.equal(f.records.size,0);
});
test('read-state: a formerly fresh snapshot cannot bypass a successful mutation',async()=>{
 const f=fixture();await f.mod.refresh('a');const available=(await f.mod.cached('a')).state;await f.clear();f.state.own_figures=[{id:'new'}];
 const result=await f.mod.refresh('a',null,{available});assert.equal(f.calls.length,2);assert.equal(result.snapshot.value.own_figures[0].id,'new');
});
test('read-state: permission revocation notifies the view before loading details',async()=>{
 const f=fixture();await f.mod.refresh('a');f.state.me.upload_enabled=true;let cleared=false;
 f.handle(action=>{if(action==='library')assert.equal(cleared,true);return action==='state'?f.state:{entries:[]};});
 await f.mod.refresh('a','l',{onAccessChanged:()=>cleared=true});assert.equal(cleared,true);
});
