import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Window} from 'happy-dom';

const window=new Window({url:'http://localhost/pwa/',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
for(const key of ['document','location','history','localStorage','CustomEvent','Image','IntersectionObserver'])globalThis[key]=window[key];
Object.defineProperty(globalThis,'navigator',{configurable:true,value:window.navigator});
for(const key of ['addEventListener','dispatchEvent','requestAnimationFrame'])globalThis[key]=window[key].bind(window);
window.HTMLElement.prototype.scrollIntoView=function(){};
document.body.innerHTML=await readFile(new URL('../pwa/index.html',import.meta.url),'utf8');
const sessionKey=`salsa-cloud-session:${new URL('../pwa/',import.meta.url).pathname}:v1`;
localStorage.setItem(sessionKey,JSON.stringify({access_token:'test',refresh_token:'test',expires_at:Date.now()+3600000,cache_id:'navigation-test'}));
const revision={id:'revision',figure_id:'figure',title:'Drehung',description:'Figurenbeschreibung',tags:['Salsa','Figur'],videos:[{id:'video',name:'Video',type:'video/mp4',size:20}]};
const library={id:'library',title:'Kurs',description:'Bibliotheksbeschreibung',visibility:'public',owner_id:'other'};
const snapshot={me:{id:'me',email:'me@test.ch',upload_enabled:true,is_admin:false,used:0,quota:100},own_figures:[{id:'figure',owner_id:'me',public_allowed:true,revisions:[revision]}],libraries:[library]};
globalThis.fetch=async(_url,options)=>{
 const {action}=JSON.parse(options.body);
 const result=action==='state'?snapshot:action==='library'?{library,entries:[{figure_id:'figure',published:revision}]}:{};
 return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
};
const {initCloud,openCloud,closeCloud}=await import('../pwa/cloud.js');
const prompts=[];
initCloud({localFigures:async()=>[],confirm:async options=>{prompts.push(options);return false;}});
const button=name=>[...document.querySelectorAll('button')].find(b=>b.textContent===name);
const click=async el=>{assert.ok(el,'control exists');await el.onclick();};

test('entering My Figures collapses a previously opened cloud figure, including reopening Cloud',async()=>{
 await openCloud();
 let card=document.querySelector('.cloud-own-figure');assert.ok(card,document.getElementById("cloudError").textContent);
 card.open=true;card.ontoggle();assert.ok(card.open);
 await click(button('Meine Figuren'));
 assert.equal(document.querySelectorAll('.cloud-own-figure[open]').length,0);
 card=document.querySelector('.cloud-own-figure');card.open=true;card.ontoggle();
 await closeCloud();await openCloud();
 assert.equal(document.querySelectorAll('.cloud-own-figure[open]').length,0);
});

test('library shows description and compact figure tags; bulk download explains itself only in confirmation',async()=>{
 const ownSummary=document.querySelector('.cloud-own-summary');
 assert.equal(ownSummary.querySelector('.cloud-tag-pills'),null);
 await click(button('Bibliotheken'));
 const link=document.querySelector('a.cloud-library-card');await link.onclick({button:0,preventDefault(){}});
 // Library link handlers intentionally do not block the navigation animation.
 for(let i=0;i<30&&!document.querySelector('.cloud-library-summary');i++)await new Promise(r=>setTimeout(r,5));
 assert.equal(document.querySelector('.cloud-library-description')?.textContent,'Bibliotheksbeschreibung');
 const summary=document.querySelector('.cloud-library-summary');
 assert.deepEqual([...summary.querySelectorAll('.cloud-tag-pill')].map(t=>t.textContent),['Salsa','Figur']);
 assert.equal(document.querySelector('.cloud-library-download').textContent.includes('Vorhandene Videos'),false);
 await click(button('Alle Figuren lokal verfügbar machen'));
 assert.equal(prompts.length,1);
 assert.match(prompts[0].message,/Vorhandene Videos werden wiederverwendet/);
 assert.match(prompts[0].message,/Lernstände und Notizen bleiben erhalten/);
 assert.equal(document.getElementById('cloudDownloadProgress').hidden,true,'cancel leaves download idle');
 assert.notEqual(document.getElementById('cloudStatus').closest('footer').getAttribute('aria-busy'),'true');
});
