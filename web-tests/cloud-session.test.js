import { test } from 'node:test';
import assert from 'node:assert/strict';
const key = `salsa-cloud-session:${new URL('../pwa/', import.meta.url).pathname}:v1`;
const expired = () => ({ access_token: 'old-access', refresh_token: 'old-refresh', expires_at: Date.now() - 1000 });
const renewed = () => ({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 });
let sequence = 0;
async function setup(fetcher, locks) {
 const values = new Map([[key, JSON.stringify(expired())]]);
 globalThis.localStorage = { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) };
 globalThis.location = { hash: '', href: 'https://example.test/pwa/', pathname: '/pwa/', search: '' }; globalThis.history = { replaceState() {} };
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true,locks}});globalThis.fetch=fetcher;
 const api=await import(`../pwa/cloud-api.js?test=${++sequence}`);return {api,values};
}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
test('cloud session: transient server failure keeps login and retry restores the admin request token',async()=>{
 let calls=0;const {api,values}=await setup(async()=>++calls===1?json({error:'Temporary outage'},503):json(renewed()));
 await assert.rejects(api.accessToken(),/Temporary outage/);assert.equal(api.signedIn(),true);assert.equal(JSON.parse(values.get(key)).refresh_token,'old-refresh');
 assert.equal(await api.accessToken(),'new-access');assert.equal(JSON.parse(values.get(key)).refresh_token,'new-refresh');assert.equal(calls,2);
});
test('cloud session: network timeout while reported online must not erase credentials',async()=>{
 const {api,values}=await setup(async()=>{throw new DOMException('Timed out','TimeoutError');});
 await assert.rejects(api.accessToken(),{name:'TimeoutError'});assert.equal(api.signedIn(),true);assert.ok(values.has(key));
});
test('cloud session: only a definitive invalid refresh response clears the session',async()=>{
 const {api,values}=await setup(async()=>json({code:'refresh_token_not_found',msg:'Invalid Refresh Token'},400));
 await assert.rejects(api.accessToken(),/neuen persönlichen Link/);assert.equal(api.signedIn(),false);assert.equal(values.has(key),false);assert.equal(await api.accessToken(),null);
});
test('cloud session: incomplete refresh response preserves the original session for retry',async()=>{
 const {api,values}=await setup(async()=>json({access_token:'incomplete',expires_in:3600}));await assert.rejects(api.accessToken(),/nicht vollständig/);assert.equal(JSON.parse(values.get(key)).refresh_token,'old-refresh');
});
test('cloud session: concurrent calls rotate tokens only once',async()=>{
 let calls=0;const {api}=await setup(async()=>{calls++;await new Promise(r=>setImmediate(r));return json(renewed());});
 assert.deepEqual(await Promise.all([api.accessToken(),api.accessToken(),api.accessToken()]),['new-access','new-access','new-access']);assert.equal(calls,1);
});
test('cloud session: separate tabs re-read rotated credentials after their shared lock',async()=>{
 let queue=Promise.resolve(),calls=0;const locks={request(_key,work){const next=queue.then(work);queue=next.catch(()=>{});return next;}};
 const {api}=await setup(async()=>{calls++;return json(renewed());},locks);const other=await import(`../pwa/cloud-api.js?test=${++sequence}`);
 assert.deepEqual(await Promise.all([api.accessToken(),other.accessToken()]),['new-access','new-access']);assert.equal(calls,1);
});
test('cloud session: logout during refresh cannot be undone by a late response',async()=>{
 let release;const gate=new Promise(r=>{release=r;});const {api,values}=await setup(async url=>String(url).includes('/logout')?json({}):(await gate,json(renewed())));
 const pending=api.accessToken();await api.logout();release();assert.equal(await pending,null);assert.equal(api.signedIn(),false);assert.equal(values.has(key),false);
});
