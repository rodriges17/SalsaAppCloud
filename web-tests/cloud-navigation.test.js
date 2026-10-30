import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Window} from 'happy-dom';

const window=new Window({url:'http://localhost/pwa/',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
globalThis.window=window;
for(const key of ['document','location','history','localStorage','Event','CustomEvent','Image','IntersectionObserver'])globalThis[key]=window[key];
Object.defineProperty(globalThis,'navigator',{configurable:true,value:window.navigator});
for(const key of ['addEventListener','dispatchEvent','requestAnimationFrame'])globalThis[key]=window[key].bind(window);
window.HTMLElement.prototype.scrollIntoView=function(){};
document.body.innerHTML=await readFile(new URL('../pwa/index.html',import.meta.url),'utf8');
const sessionKey=`salsa-cloud-session:${new URL('../pwa/',import.meta.url).pathname}:v1`;
localStorage.setItem(sessionKey,JSON.stringify({access_token:'test',refresh_token:'test',expires_at:Date.now()+3600000,cache_id:'navigation-test'}));
const revision={id:'revision',figure_id:'figure',title:'Drehung',description:'Figurenbeschreibung',tags:['Salsa','Figur'],videos:[{id:'video',name:'Video',type:'video/mp4',size:20}]};
const library={id:'library',title:'Kurs',description:'Bibliotheksbeschreibung',visibility:'public',owner_id:'me',edit_version:'v1'};
const snapshot={me:{id:'me',email:'me@test.ch',upload_enabled:true,is_admin:false,used:0,quota:100},own_figures:[{id:'figure',owner_id:'me',public_allowed:true,revisions:[revision]}],libraries:[library]};
const calls=[];let holdState=null;
globalThis.fetch=async(_url,options)=>{
 const {action,payload}=JSON.parse(options.body);
 if(action==='library_commit')library.title=payload.title;
 calls.push(action);
 const result=action==='state'?structuredClone(snapshot):action==='library'?{library,manage:true,members:[],entries:[{figure_id:'figure',published:revision}]}:{};
 if(action==='state'&&holdState){const hold=holdState;holdState=null;await hold();}
 return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
};
const {initCloud,openCloud,closeCloud}=await import('../pwa/cloud.js');
const prompts=[];
initCloud({localFigures:async()=>[],chooseImport:async()=>({}),confirm:async options=>{prompts.push(options);return false;}});
const button=name=>{const buttons=[...document.querySelectorAll('button')];return buttons.find(b=>b.textContent===name)||buttons.find(b=>b.getAttribute('aria-label')===name);};
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

test('Back and Cancel leave unchanged library editing without cloud reads',async()=>{
 for(const exit of ['Abbrechen','Zurück','System-Zurück']){
  await click(button('Bibliothek bearbeiten'));
  calls.length=0;
  if(exit==='System-Zurück'){
   document.getElementById('cloudDialog').dispatchEvent(new window.Event('cancel',{cancelable:true}));
   for(let i=0;i<30&&!button('Bibliothek bearbeiten');i++)await new Promise(r=>setTimeout(r,5));
  }else await click(exit==='Zurück'?document.getElementById('cloudBack'):button(exit));
  assert.ok(button('Bibliothek bearbeiten'),exit+' returns to the library');
  assert.deepEqual(calls.filter(a=>a==='state'||a==='library'),[],exit+' must reuse the current library');
 }
});


test('library Back preserves edits when staying, discards without reads, and refreshes after saving',async()=>{
 for(const exit of ['Abbrechen','Zurück']){
  await click(button('Bibliothek bearbeiten'));await click(button('Einstellungen'));
  const name=document.querySelector('.cloud-library-settings input');name.value='Geänderter Kurs';name.dispatchEvent(new window.Event('input',{bubbles:true}));
  const leave=()=>click(exit==='Zurück'?document.getElementById('cloudBack'):button(exit));
  calls.length=0;const staying=leave();
  for(let i=0;i<30&&!button('Weiter bearbeiten');i++)await new Promise(r=>setTimeout(r,5));
  await click(button('Weiter bearbeiten'));await staying;
  assert.equal(document.querySelector('.cloud-library-settings input').value,'Geänderter Kurs');
  assert.deepEqual(calls,[],'staying does not read or save');
  const discarding=leave();
  for(let i=0;i<30&&!button('Verwerfen');i++)await new Promise(r=>setTimeout(r,5));
  await click(button('Verwerfen'));await discarding;
  assert.equal(document.querySelector('.cloud-library-title').textContent,'Kurs');
  assert.deepEqual(calls,[],'discard returns the original library without reads');
 }
 await click(button('Bibliothek bearbeiten'));await click(button('Einstellungen'));
 const name=document.querySelector('.cloud-library-settings input');name.value='Gespeicherter Kurs';name.dispatchEvent(new window.Event('input',{bubbles:true}));
 calls.length=0;const saving=click(document.getElementById('cloudBack'));
 for(let i=0;i<30&&!button('Speichern');i++)await new Promise(r=>setTimeout(r,5));
 await click(button('Speichern'));await saving;
 assert.ok(calls.includes('library_commit'),'save commits changes');
 assert.ok(calls.includes('state')&&calls.includes('library'),'save refreshes the visible library');
 assert.equal(document.querySelector('.cloud-library-title').textContent,'Gespeicherter Kurs');
});

test('expanding library details reveals their end only when outside the usable scroll area',async()=>{
 const scroller=document.querySelector('.cloud-scroll'),card=document.querySelector('.cloud-library-figure'),summary=card.querySelector('summary');
 // DOM layout is supplied by the browser boundary; Happy DOM has no layout engine.
 scroller.getBoundingClientRect=()=>({top:100,bottom:400});
 let end=500;card.getBoundingClientRect=()=>({top:150-scroller.scrollTop,bottom:end-scroller.scrollTop});
 scroller.scrollTop=0;summary.click();await new Promise(requestAnimationFrame);
 assert.equal(scroller.scrollTop,108,'500px end is revealed above the 400px footer edge with 8px space');
 summary.click();await new Promise(requestAnimationFrame);assert.equal(scroller.scrollTop,108,'collapse does not scroll');
 scroller.scrollTop=0;end=300;summary.click();await new Promise(requestAnimationFrame);
 assert.equal(scroller.scrollTop,0,'already visible details do not move');
 summary.click();end=800;summary.click();await new Promise(requestAnimationFrame);
 assert.equal(scroller.scrollTop,408,'long details reveal their end');
 summary.click();scroller.scrollTop=0;summary.click();summary.click();await new Promise(requestAnimationFrame);
 assert.equal(scroller.scrollTop,0,'a closed card cannot trigger a delayed scroll');
 delete scroller.getBoundingClientRect;delete card.getBoundingClientRect;
});

test('screen Back, system Back and tabs cannot duplicate a pending library leave prompt',async()=>{
 await click(button('Bibliothek bearbeiten')); await click(button('Einstellungen'));
 const name=document.querySelector('.cloud-library-settings input');name.value='Nicht verwerfen';name.dispatchEvent(new window.Event('input',{bubbles:true}));
 const leaving=click(document.getElementById('cloudBack'));
 for(let i=0;i<30&&!button('Weiter bearbeiten');i++)await new Promise(r=>setTimeout(r,5));
 document.getElementById('cloudDialog').dispatchEvent(new window.Event('cancel',{cancelable:true}));
 await click(button('Meine Figuren')); await click(document.getElementById('cloudBack'));
 assert.equal(document.querySelectorAll('.cloud-unsaved-dialog').length,1);
 await click(button('Weiter bearbeiten')); await leaving;
 assert.equal(document.querySelector('.cloud-library-settings input').value,'Nicht verwerfen');
 const discard=click(document.getElementById('cloudBack'));
 for(let i=0;i<30&&!button('Verwerfen');i++)await new Promise(r=>setTimeout(r,5));
 await click(button('Verwerfen'));await discard;
});

test('a local storage failure during a single figure download leaves navigation usable',async()=>{
 const card=document.querySelector('.cloud-library-figure');card.open=true;card.ontoggle();
 globalThis.indexedDB={open(){const request={error:new Error('Speicher gesperrt')};queueMicrotask(()=>request.onerror());return request;}};
 await click(button('Lokal verfügbar machen'));
 assert.equal(document.getElementById('cloudError').textContent,'Speicher gesperrt');
 assert.equal(document.getElementById('cloudBack').disabled,false);
 assert.equal(document.getElementById('cloudBody').inert,false);
 delete globalThis.indexedDB;
});

test('account change dismisses a private draft prompt and late navigation never restores it',async()=>{
 await click(button('Bibliothek bearbeiten'));await click(button('Einstellungen'));
 const name=document.querySelector('.cloud-library-settings input');name.value='Alter privater Entwurf';name.dispatchEvent(new window.Event('input',{bubbles:true}));
 const leaving=click(document.getElementById('cloudBack'));
 for(let i=0;i<30&&!button('Weiter bearbeiten');i++)await new Promise(r=>setTimeout(r,5));
 localStorage.removeItem(sessionKey);
 const old=snapshot.me;snapshot.me=null;snapshot.own_figures=[];snapshot.libraries=[];
 dispatchEvent(new CustomEvent('cloud-session-changed',{detail:{external:true}}));
 await leaving;
 for(let i=0;i<30&&!document.querySelector('.cloud-public-libraries');i++)await new Promise(r=>setTimeout(r,5));
 assert.equal(document.querySelector('.cloud-unsaved-dialog'),null);
 assert.equal(document.querySelector('.cloud-library-settings'),null);
 assert.equal(document.getElementById('cloudBody').textContent.includes('Alter privater Entwurf'),false);
 assert.equal(document.getElementById('cloudDialog').open,true);
 assert.equal(document.getElementById('cloudBack').disabled,false);
 snapshot.me=old;
 localStorage.setItem(sessionKey,JSON.stringify({access_token:'new',refresh_token:'new',expires_at:Date.now()+3600000,cache_id:'next-account'}));
 dispatchEvent(new CustomEvent('cloud-session-changed',{detail:{external:true}}));
 await closeCloud();
});

test('My Cloud Figures sorts by the latest displayed title with German alphabetical and numeric order',async()=>{
 await closeCloud();
 snapshot.own_figures=[
  {id:'ocho',owner_id:'me',revisions:[{id:'ocho-r',title:'Ocho',videos:[]}]},
  {id:'ten',owner_id:'me',revisions:[{id:'ten-r',title:'Figur 10',videos:[]}]},
  {id:'renamed',owner_id:'me',revisions:[{id:'old-r',title:'Zulu',created_at:'2025-01-01T00:00:00Z',videos:[]},{id:'new-r',title:'drehung',created_at:'2026-01-01T00:00:00Z',videos:[]}]},
  {id:'umlaut',owner_id:'me',revisions:[{id:'umlaut-r',title:'Ähre',videos:[]}]},
  {id:'two',owner_id:'me',revisions:[{id:'two-r',title:'Figur 2',videos:[]}]}
 ];
 await openCloud();await click(document.querySelector('.cloud-refresh-trigger'));
 assert.deepEqual([...document.querySelectorAll('.cloud-own-name h3')].map(n=>n.textContent),['Ähre','drehung','Figur 2','Figur 10','Ocho']);
});

test('session expiry replaces an in-flight private refresh and its late response cannot restore figures',async()=>{
 let release,started;
 const waiting=new Promise(resolve=>started=resolve);
 holdState=()=>{started();return new Promise(resolve=>release=resolve);};
 const refresh=click(document.querySelector('.cloud-refresh-trigger'));await waiting;
 localStorage.removeItem(sessionKey);snapshot.me=null;snapshot.own_figures=[];snapshot.libraries=[];
 dispatchEvent(new CustomEvent('cloud-session-changed',{detail:{expired:true}}));
 for(let i=0;i<30&&!document.querySelector('.cloud-public-libraries');i++)await new Promise(r=>setTimeout(r,5));
 assert.equal(document.querySelector('.cloud-own-figure'),null);
 release();await refresh;
 assert.equal(document.querySelector('.cloud-own-figure'),null);
 assert.equal(document.getElementById('cloudAccountOpen').hidden,true);
 assert.equal(document.getElementById('cloudError').hidden,true);
 assert.equal(document.getElementById('cloudBack').disabled,false);
 await closeCloud();assert.equal(document.getElementById('cloudDialog').open,false);
});
