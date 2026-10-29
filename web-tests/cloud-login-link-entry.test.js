import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Window} from 'happy-dom';
const window=new Window({url:'http://localhost/pwa/?cloud=1&type=magiclink&token_hash=once',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
for(const name of ['document','location','history','localStorage','CustomEvent','Image','IntersectionObserver'])globalThis[name]=window[name];
Object.defineProperty(globalThis,'navigator',{configurable:true,value:window.navigator});
for(const name of ['addEventListener','dispatchEvent','requestAnimationFrame'])globalThis[name]=window[name].bind(window);
document.body.innerHTML=await readFile(new URL('../pwa/index.html',import.meta.url),'utf8');
const calls=[];
globalThis.fetch=async(url,options={})=>{
 calls.push({url:String(url),options});
 const result=String(url).includes('/verify')?{access_token:'new',refresh_token:'new-refresh',expires_in:3600,user:{id:'new',email:'verified@example.test'}}:{me:null,libraries:[],own_figures:[]};
 return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
};
const {initCloud}=await import('../pwa/cloud.js');
const api=await import('../pwa/cloud-api.js');
initCloud({localFigures:async()=>[]});
test('opening a personal URL strips its secret and waits for confirmation before loading cloud content',async()=>{
 for(let i=0;i<40&&!document.querySelector('#cloudLoginConfirmation[open]');i++)await new Promise(r=>setTimeout(r,5));
 const prompt=document.querySelector('#cloudLoginConfirmation');assert.ok(prompt?.open);
 assert.match(prompt.textContent,/verified@example.test/);assert.equal(location.href.includes('token_hash'),false);
 assert.equal(api.signedIn(),false);assert.equal(calls.some(c=>c.url.includes('/functions/')),false);
 prompt.querySelector('.primary').click();
 for(let i=0;i<40&&!calls.some(c=>c.url.includes('/functions/'));i++)await new Promise(r=>setTimeout(r,5));
 assert.equal(api.signedIn(),true);assert.ok(calls.some(c=>c.url.includes('/functions/')&&c.options.headers.Authorization==='Bearer new'));
});
