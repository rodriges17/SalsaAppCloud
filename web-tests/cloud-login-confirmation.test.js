import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Window} from 'happy-dom';
const window=new Window({url:'http://localhost/pwa/',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
for(const name of ['document','location','history','localStorage','CustomEvent','Image','IntersectionObserver'])globalThis[name]=window[name];
Object.defineProperty(globalThis,'navigator',{configurable:true,value:window.navigator});
for(const name of ['addEventListener','dispatchEvent','requestAnimationFrame'])globalThis[name]=window[name].bind(window);
document.body.innerHTML=await readFile(new URL('../pwa/index.html',import.meta.url),'utf8');
const {initCloud}=await import('../pwa/cloud.js');
const api=await import('../pwa/cloud-api.js');
initCloud({localFigures:async()=>[]});
const key=`salsa-cloud-session:${new URL('../pwa/',import.meta.url).pathname}:v1`;
const old=()=>JSON.stringify({access_token:'old',refresh_token:'old-refresh',expires_at:Date.now()+3600000,cache_id:'old'});
const json=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
const tick=()=>new Promise(r=>setImmediate(r));
let candidateId='new',requests=[];
globalThis.fetch=async(url,options={})=>{
 requests.push({url:String(url),options});
 if(String(url).includes('/verify'))return json({access_token:'candidate',refresh_token:'candidate-refresh',expires_in:3600,user:{id:candidateId,email:candidateId+'@example.test'}});
 if(String(url).endsWith('/auth/v1/user'))return json({id:'old',email:'old@example.test'});
 return json({});
};
async function prompt(){for(let i=0;i<30;i++){const el=document.querySelector('#cloudLoginConfirmation');if(el?.open)return el;await tick();}assert.fail('confirmation dialog missing');}
const button=(el,text)=>[...el.querySelectorAll('button')].find(b=>b.textContent===text);
test('verified link displays both accounts and only an explicit click adopts the candidate',async()=>{
 localStorage.setItem(key,old());const before=localStorage.getItem(key);
 const pending=api.loginWithLink('https://example.test/?token_hash=one&type=magiclink');
 const el=await prompt();assert.match(el.textContent,/old@example.test/);assert.match(el.textContent,/new@example.test/);
 assert.equal(localStorage.getItem(key),before);
 await api.cloudCall('state');assert.equal(requests.at(-1).options.headers.Authorization,'Bearer old');
 button(el,'Konto wechseln').click();await pending;
 assert.equal(JSON.parse(localStorage.getItem(key)).access_token,'candidate');assert.equal(document.querySelector('#cloudLoginConfirmation'),null);
});
test('native Back / Escape cancels the candidate and preserves the existing account',async()=>{
 localStorage.setItem(key,old());const before=localStorage.getItem(key);requests=[];
 const pending=api.loginWithLink('https://example.test/?token_hash=two&type=magiclink');
 const rejected=assert.rejects(pending,/Einmallink ist verbraucht/);
 const el=await prompt();el.dispatchEvent(new window.Event('cancel',{cancelable:true}));await rejected;
 assert.equal(localStorage.getItem(key),before);
 const revoke=requests.find(r=>r.url.endsWith('/logout?scope=local'));assert.equal(revoke.options.headers.Authorization,'Bearer candidate');
});
test('same-account renewal still requires confirmation and closing the dialog rejects it',async()=>{
 candidateId='old';localStorage.setItem(key,old());const before=localStorage.getItem(key);
 const pending=api.loginWithLink('https://example.test/?token_hash=three&type=magiclink');const rejected=assert.rejects(pending,/abgebrochen/);
 const el=await prompt();assert.match(el.textContent,/Anmeldung als old@example.test erneuern/);
 el.close();await rejected;assert.equal(localStorage.getItem(key),before);candidateId='new';
});
test('logout dismisses an open confirmation and a stale confirm cannot restore login',async()=>{
 localStorage.setItem(key,old());
 const pending=api.loginWithLink('https://example.test/?token_hash=four&type=magiclink');const rejected=assert.rejects(pending,/abgebrochen/);
 const el=await prompt(),accept=button(el,'Konto wechseln');await api.logout();accept.click();await rejected;
 assert.equal(api.signedIn(),false);assert.equal(document.querySelector('#cloudLoginConfirmation'),null);
});
test('a superseding link closes the older prompt; only the latest candidate can be confirmed',async()=>{
 localStorage.setItem(key,old());
 const first=api.loginWithLink('https://example.test/?token_hash=first&type=magiclink');const rejected=assert.rejects(first,/abgebrochen/);
 const stale=await prompt(),staleAccept=button(stale,'Konto wechseln');
 const second=api.loginWithLink('https://example.test/?token_hash=second&type=magiclink');
 const latest=await prompt();assert.notEqual(stale,latest);staleAccept.click();assert.equal(JSON.parse(localStorage.getItem(key)).access_token,'old');
 button(latest,'Konto wechseln').click();await second;await rejected;
 assert.equal(JSON.parse(localStorage.getItem(key)).access_token,'candidate');
});
