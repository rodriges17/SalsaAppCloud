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
test('cloud session: late magic-link verification cannot undo logout',async()=>{
 let release;const gate=new Promise(r=>release=r);const {api}=await setup(async url=>String(url).includes('/verify')?(await gate,json(renewed())):json({}));
 const pending=api.loginWithLink('https://example.test/?token_hash=one&type=magiclink');await api.logout();release();await assert.rejects(pending,/abgebrochen/);assert.equal(api.signedIn(),false);
});
test('cloud session: superseded magic-link verification cannot replace newer login',async()=>{
 let release,calls=0;const gate=new Promise(r=>release=r);const {api,values}=await setup(async()=>++calls===1?(await gate,json({...renewed(),access_token:'late'})):json({...renewed(),access_token:'latest'}));
 const first=api.loginWithLink('https://example.test/?token_hash=one&type=magiclink');await api.loginWithLink('https://example.test/?token_hash=two&type=magiclink');release();await assert.rejects(first,/abgebrochen/);assert.equal(JSON.parse(values.get(key)).access_token,'latest');
});
test('cloud session: changed identity during token refresh prevents sending cloud request',async()=>{
 let release,calls=0;const gate=new Promise(r=>release=r);const {api}=await setup(async url=>{if(String(url).includes('/logout'))return json({});calls++;await gate;return json(renewed());});
 const pending=api.cloudCall('state');await api.logout();release();await assert.rejects(pending,/Konto/);assert.equal(calls,1);
});
test('admin password login verifies the server role before publishing a session and never stores credentials',async()=>{
 const calls=[];const {api,values}=await setup(async(url,init)=>{calls.push({url:String(url),init});return String(url).includes('/functions/')?json({me:{is_admin:true}}):json(renewed());});
 await api.loginWithPassword(' Admin@Example.Test ','test-password-only');
 assert.equal(JSON.parse(calls[0].init.body).email,'admin@example.test');assert.equal(calls[1].init.headers.Authorization,'Bearer new-access');
 assert.equal(JSON.parse(values.get(key)).access_token,'new-access');assert.ok(!values.get(key).includes('test-password-only'));assert.ok(!values.get(key).includes('admin@example.test'));
});
test('password login rejects non-admins, revokes only the candidate and preserves an existing session',async()=>{
 const calls=[];const {api,values}=await setup(async(url,init)=>{calls.push({url:String(url),init});return String(url).includes('/functions/')?json({me:{is_admin:false}}):json(renewed());});
 api.cloudIdentity();api.cloudIdentity();const before=values.get(key);await assert.rejects(api.loginWithPassword('reader@example.test','password'),/nur für Plattform-Admins/);
 assert.equal(values.get(key),before);assert.ok(calls.some(c=>c.url.endsWith('/logout?scope=local')&&c.init.headers.Authorization==='Bearer new-access'));
});
test('password login errors and failed role checks preserve the current account',async()=>{
 for(const failure of ['credentials','role']){const {api,values}=await setup(async url=>failure==='credentials'?json({error_code:'invalid_credentials',msg:'Invalid login credentials'},400):String(url).includes('/functions/')?json({error:'Temporary outage'},503):json(renewed()));api.cloudIdentity();const before=values.get(key);await assert.rejects(api.loginWithPassword('admin@example.test','bad'));assert.equal(values.get(key),before);}
});
test('a late password login cannot undo logout or a newer accepted login',async()=>{
 let release;const gate=new Promise(r=>release=r);let count=0;
 const {api,values}=await setup(async url=>String(url).includes('/functions/')?json({me:{is_admin:true}}):String(url).includes('/logout')?json({}):++count===1?(await gate,json({...renewed(),access_token:'late-candidate'})):json({...renewed(),access_token:'accepted'}));
 const pending=api.loginWithPassword('admin@example.test','one');await api.loginWithPassword('admin@example.test','two');release();await assert.rejects(pending,/abgebrochen/);assert.equal(JSON.parse(values.get(key)).access_token,'accepted');
 let release2;const gate2=new Promise(r=>release2=r);const second=await setup(async url=>String(url).includes('/logout')?json({}):(await gate2,json(renewed())));
 const late=second.api.loginWithPassword('admin@example.test','one');await second.api.logout();release2();await assert.rejects(late,/abgebrochen/);assert.equal(second.api.signedIn(),false);
});
test('password setup checks admin rights and identity and sends secrets only to the authenticated Auth endpoint',async()=>{
 const calls=[];const {api,values}=await setup(async(url,init)=>{calls.push({url:String(url),init});return String(url).includes('/token')?json(renewed()):String(url).includes('/functions/')?json({me:{is_admin:true}}):json({id:'admin'});});
 await api.setAdminPassword('new-password-long','previous-password');
 const write=calls.find(c=>c.init.method==='PUT');assert.ok(write.url.endsWith('/auth/v1/user'));assert.deepEqual(JSON.parse(write.init.body),{password:'new-password-long',current_password:'previous-password'});
 assert.ok(calls.filter(c=>c.url.includes('/functions/')).every(c=>!c.init.body.includes('password')));assert.ok(!values.get(key).includes('new-password-long'));
});
test('password setup blocks short passwords and non-admins before sending a password update',async()=>{
 let puts=0;const {api}=await setup(async(url,init)=>{if(init.method==='PUT')puts++;return String(url).includes('/token')?json(renewed()):json({me:{is_admin:false}});});
 await assert.rejects(api.setAdminPassword('short'),/12 Zeichen/);await assert.rejects(api.setAdminPassword('long-password-here'),/Nur Plattform-Admins/);assert.equal(puts,0);
});
