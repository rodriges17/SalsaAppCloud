import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createCloudFigureCard} from '../pwa/figure-card.js';

test('cloud cards retain their own information while sharing title tags and availability', async()=>{
 const window=new Window();globalThis.document=window.document;
 try{
  const common={id:'turn',title:'<Drehung>',tags:['Pasito','pasito']};
  const own=createCloudFigureCard({...common,kind:'own',subtitle:'2 Videos · Privat verwendbar'});
  const library=createCloudFigureCard({...common,kind:'library',position:3});
  for(const view of [own,library]){
   assert.equal(view.card.querySelector('h3').textContent,'<Drehung>');
   assert.equal(view.card.querySelector('h3').children.length,0);
   assert.deepEqual([...view.card.querySelectorAll('li')].map(n=>n.textContent),['Pasito','pasito']);
   view.setAvailability({label:'Lokal vorhanden',detail:'App-Speicher',available:true,modified:false});
   assert.equal(view.card.querySelector('[data-local=true]').title,'App-Speicher');
   assert.equal(view.content.children.length,0);
  }
  assert.equal(own.card.querySelector('small').textContent,'2 Videos · Privat verwendbar');
  assert.equal(library.card.querySelector('.cloud-order-number').textContent,'3');
  assert.equal(own.card.querySelector('.cloud-order-number'),null);
 }finally{delete globalThis.document;await window.happyDOM.close();}
});

test('local cards keep learning storage tags and separate playback targets without reading videos',async()=>{
 const window=new Window();globalThis.document=window.document;
 try{
  const {createLocalCardsView}=await import('../pwa/figure-card.js');
  let played=0,notified='';
  const view=createLocalCardsView({open:()=>played++,status:()=> 'modified',notify:message=>notified=message});
  const figure={id:'local',title:'Lokale Figur',tags:['Pasito','pasito','Drei','Vier'],status:'Sitzt',duration:65,videoIds:['a','b'],storageFolder:'folder',folderName:'Tanzkurs'};
  const {card,main,thumbnailButton}=view.card(figure);
  assert.equal(card.querySelector('.card-title').textContent,'Lokale Figur');
  assert.equal(card.querySelector('.card-meta').textContent,'1:05 · 2 Videos');
  assert.equal(card.querySelector('.card-storage-folder').textContent,'Tanzkurs');
  assert.equal(card.querySelector('.card-status').textContent,'Sitzt');
  assert.equal(card.querySelector('.card-tags').getAttribute('aria-label'),'Tags: Pasito, pasito, Drei, Vier');
  main.click();thumbnailButton.click();assert.equal(played,2);
  card.querySelector('.card-provenance').click();assert.match(notified,/lokal angepasst/);
  assert.equal(card.querySelector('video'),null);
  view.reset();
 }finally{delete globalThis.document;await window.happyDOM.close();}
});

test('cloud cards tolerate missing legacy tags without losing title or status',async()=>{
 const window=new Window();globalThis.document=window.document;
 try{
  const view=createCloudFigureCard({kind:'library',id:'legacy',title:'Ohne Tags',tags:null});
  view.setAvailability({label:'Cloud-Figur',available:false});
  assert.equal(view.card.querySelector('h3').textContent,'Ohne Tags');
  assert.equal(view.card.querySelector('[data-local=false]').textContent,'Cloud-Figur');
  assert.equal(view.card.querySelector('ul'),null);
 }finally{delete globalThis.document;await window.happyDOM.close();}
});
