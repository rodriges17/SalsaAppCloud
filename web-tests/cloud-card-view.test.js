import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createCloudFigureCard} from '../pwa/figure-card.js';
import {createCloudCards} from '../pwa/cloud-card-view.js';

test('closing and reopening a card discards its old preview and mounts content only once',async()=>{
 const window=new Window();globalThis.document=window.document;
 try{
  const cards=createCloudCards(),group=document.createElement('div');document.body.append(group);
  const view=createCloudFigureCard({kind:'own',id:'one',title:'Drehung'});group.append(view.card);
  let mounted=0;const lifetime=cards.register({...view,group,build:()=>{mounted++;view.content.textContent='Inhalt';}});
  assert.equal(mounted,0);lifetime.open();assert.equal(mounted,1);
  let resolve;const signed=new Promise(r=>resolve=r);
  const pending=cards.preview(view.content,()=>signed);
  lifetime.close();lifetime.open();resolve({url:'https://example.test/old.mp4'});await pending;
  assert.equal(view.content.querySelector('video'),null);assert.equal(mounted,1);
  await cards.preview(view.content,async()=>({url:'https://example.test/new.mp4'}));
  assert.equal(view.content.querySelector('video').src,'https://example.test/new.mp4');
  lifetime.close();assert.equal(view.content.querySelector('video'),null);
  cards.dispose(group);
 }finally{delete globalThis.document;await window.happyDOM.close();}
});

test('coalesced native toggles cannot revive an earlier request after reopening',async()=>{
 const window=new Window();globalThis.document=window.document;
 try{
  const cards=createCloudCards(),group=document.createElement('div');document.body.append(group);
  const view=createCloudFigureCard({kind:'library',id:'one',title:'Drehung'});group.append(view.card);
  const lifetime=cards.register({...view,group,build:()=>{}});lifetime.open();
  let resolve;const signed=new Promise(r=>resolve=r);const pending=cards.preview(view.content,()=>signed);
  view.card.open=false;view.card.open=true;
  await window.happyDOM.waitUntilComplete();resolve({url:'https://example.test/stale.mp4'});await pending;
  assert.equal(view.content.querySelector('video'),null);
  cards.dispose(group);
 }finally{delete globalThis.document;await window.happyDOM.close();}
});

test('switching cards and leaving the view releases playback and suppresses obsolete errors',async()=>{
 const window=new Window();globalThis.document=window.document;
 try{
  const cards=createCloudCards(),group=document.createElement('div');document.body.append(group);
  const one=createCloudFigureCard({kind:'own',id:'one',title:'Erste'}),two=createCloudFigureCard({kind:'own',id:'two',title:'Zweite'});
  group.append(one.card,two.card);
  const first=cards.register({...one,group,build:()=>{}}),second=cards.register({...two,group,build:()=>{}});
  first.open();await cards.preview(one.content,async()=>({url:'https://example.test/one.mp4'}));
  second.open();assert.equal(one.card.open,false);assert.equal(one.content.querySelector('video'),null);
  let reject;const pending=cards.preview(two.content,()=>new Promise((resolve,fail)=>reject=fail));
  cards.dispose(group);group.replaceChildren();reject(Error('Verspätet'));
  await assert.doesNotReject(pending);
  assert.equal(group.querySelector('video'),null);
 }finally{delete globalThis.document;await window.happyDOM.close();}
});
