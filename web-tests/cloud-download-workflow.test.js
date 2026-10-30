import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFigureDownload} from '../pwa/cloud-library-download.js';
import {videoHash} from '../pwa/cloud-dedup.js';

async function fixture() {
 const blob=new Blob(['known video'],{type:'video/mp4'}),hash=await videoHash(blob);
 const figures=[],records=new Map(),requests=[],events=[];
 let owner='one',settings={activeFolder:null,folders:[]};
 const revision={id:crypto.randomUUID(),title:'Drehung',description:'Beschreibung',tags:['Salsa'],videos:[{id:'video',name:'Führung',type:'video/mp4',size:blob.size}]};
 const adapters={identity:()=>owner,storageSettings:async()=>settings,
  listFigures:async()=>figures.slice(),readMedia:async figure=>(records.get(figure.id)??[]).map(record=>({...record,load:async()=>record})),
  readCloudMedia:async()=>({content_hash:hash}),readCache:async()=>null,
  call:async(action,payload)=>{requests.push({action,payload});return action==='media_url'?{url:'https://media.test/video'}:{poster:null};},
  fetch:async(_url,{signal})=>{signal.throwIfAborted();return new Response(blob);},
  inspectVideo:async()=>({duration:2,width:100,height:100}),
  saveFigure:async(figure,drafts,_expected,options)=>{const saved={...figure,videoIds:drafts.map(d=>d.id),revision:crypto.randomUUID(),storageFolder:options.targetFolder};const index=figures.findIndex(item=>item.id===saved.id);if(index<0)figures.push(saved);else figures[index]=saved;records.set(saved.id,drafts);return saved;}
 };
 return {blob,revision,adapters,figures,records,requests,events,setOwner:value=>owner=value,setSettings:value=>settings=value};
}

test('single cloud download binds media and poster retrieval and saves to the chosen folder',async()=>{
 const f=await fixture();f.setSettings({activeFolder:'dance',folders:[{id:'dance',access:'granted'}]});
 const workflow=createFigureDownload(f.adapters);
 const saved=await workflow.figure(f.revision);
 assert.equal(saved.title,'Drehung');assert.equal(saved.description,'Beschreibung');assert.equal(saved.status,'Neu');assert.equal(saved.storageFolder,'dance');
 assert.deepEqual(f.requests.map(r=>r.action),['media_url','poster_get']);
 assert.equal(f.records.get(saved.id)[0].blob.type,'video/mp4');
});

test('library download uses the same media binding and keeps ascending order and saved results',async()=>{
 const f=await fixture(),workflow=createFigureDownload(f.adapters);
 const second={...f.revision,id:crypto.randomUUID(),title:'Zweite',videos:[{...f.revision.videos[0],id:'second'}]};
 // Distinct cloud entries sharing identical bytes are reused after the first save.
 const result=await workflow.library([f.revision,second]);
 assert.equal(result.saved,1);assert.equal(result.skipped,1);assert.equal(result.remaining,0);
 assert.deepEqual(f.figures.map(figure=>figure.title),['Drehung']);
 assert.deepEqual(f.requests.filter(r=>r.action==='media_url').map(r=>r.payload.revision),[f.revision.id]);
});

function deferred(){let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};}
test('cancelling a delayed signed URL ends once and cannot start a late video fetch',async()=>{
 const f=await fixture(),started=deferred(),late=deferred();let downloads=0;
 f.adapters.call=async action=>{if(action==='media_url'){started.resolve();return late.promise;}return {poster:null};};
 f.adapters.fetch=async()=>{downloads++;return new Response(f.blob);};
 const workflow=createFigureDownload(f.adapters),events=[];
 const pending=workflow.figure(f.revision,{lifecycle:event=>events.push(event)});
 await started.promise;workflow.cancel();
 await assert.rejects(pending,{name:'AbortError'});
 late.resolve({url:'https://media.test/late'});await new Promise(setImmediate);
 assert.equal(downloads,0);assert.equal(f.figures.length,0);
 assert.deepEqual(events.map(event=>event.phase),['started','cancelled']);
});

for(const kind of ['figure','library'])test(`${kind} cancellation during the final atomic save keeps the committed figure and ends as cancelled`,async()=>{
 const f=await fixture(),started=deferred(),commit=deferred(),save=f.adapters.saveFigure;
 f.adapters.saveFigure=async(...args)=>{started.resolve();await commit.promise;return save(...args);};
 const workflow=createFigureDownload(f.adapters),events=[];
 const pending=workflow[kind](kind==='figure'?f.revision:[f.revision],{lifecycle:event=>events.push(event.phase)});
 const outcome=pending.then(value=>({value}),error=>({error}));
 await started.promise;workflow.cancel();
 assert.equal(f.figures.length,0);commit.resolve();
 const result=await outcome;
 assert.equal(f.figures.length,1,'the current atomic save completes');
 if(kind==='figure')assert.equal(result.error?.name,'AbortError');
 else {assert.equal(result.value?.saved,1);assert.equal(result.value?.cancelled,true);assert.equal(result.value?.remaining,0);}
 assert.deepEqual(events,['started','cancelled']);
});

for(const kind of ['figure','library'])test(`${kind} account reset prevents stale poster results and cleanup from touching a new download`,async()=>{
 const f=await fixture(),oldPoster=deferred(),newMedia=deferred(),posterStarted=deferred(),newStarted=deferred();
 f.adapters.readCache=async owner=>{if(owner==='one'){posterStarted.resolve();return oldPoster.promise;}return null;};
 const call=f.adapters.call;
 f.adapters.call=async(action,payload)=>{if(action==='media_url'&&f.adapters.identity()==='two'){newStarted.resolve();return newMedia.promise;}return call(action,payload);};
 const workflow=createFigureDownload(f.adapters),events=[];
 const first=workflow[kind](kind==='figure'?f.revision:[f.revision],{lifecycle:event=>events.push('old:'+event.phase)}).catch(error=>error);
 await posterStarted.promise;f.setOwner('two');workflow.reset();
 const second=workflow.figure({...f.revision,id:crypto.randomUUID()},{lifecycle:event=>events.push('new:'+event.phase)}).catch(error=>error);
 await newStarted.promise;oldPoster.resolve(null);await first;await new Promise(setImmediate);
 assert.deepEqual(events,['old:started','new:started']);
 assert.equal(f.requests.some(request=>request.action==='poster_get'),false,'late cache miss must not request a poster with the new identity');
 workflow.cancel();newMedia.resolve({url:'https://media.test/new'});
 assert.equal((await second).name,'AbortError');assert.deepEqual(events,['old:started','new:started','new:cancelled']);
 assert.equal(f.figures.length,0);
});

test('already-local metadata enrichment is cancelled with its download session before any save',async()=>{
 const f=await fixture(),started=deferred(),media=deferred();
 const target={id:'local',title:'Meine Figur',description:'',tags:[],videoIds:['local-video']};
 f.adapters.readMedia=async()=>{started.resolve();return media.promise;};
 const workflow=createFigureDownload(f.adapters);
 const pending=workflow.enrich(target,f.revision).catch(error=>error);
 await started.promise;workflow.reset();media.resolve([]);
 assert.equal((await pending).name,'AbortError');assert.equal(f.figures.length,0);
});

for(const kind of ['figure','library'])test(`${kind} failed media retrieval can be retried and an optional poster failure does not lose videos`,async()=>{
 const f=await fixture();let broken=true;
 f.adapters.fetch=async()=>new Response(broken?'Unavailable':f.blob,{status:broken?503:200});
 const call=f.adapters.call;f.adapters.call=async(action,payload)=>{if(action==='poster_get')throw new Error('Poster unavailable');return call(action,payload);};
 const workflow=createFigureDownload(f.adapters),input=kind==='figure'?f.revision:[f.revision],events=[];
 const first=await workflow[kind](input,{lifecycle:event=>events.push(event.phase)}).catch(error=>error);
 if(kind==='figure')assert.match(first.message,/Video konnte nicht geladen/);else assert.equal(first.failed.length,1);
 assert.equal(f.figures.length,0);broken=false;
 const retry=await workflow[kind](input,{lifecycle:event=>events.push(event.phase)});
 assert.equal(f.figures.length,1);if(kind==='library')assert.equal(retry.saved,1);
 assert.deepEqual(events,['started',kind==='figure'?'failed':'done','started','done']);
});

test('a cached poster is used without requesting another poster and local video bytes are reused',async()=>{
 const f=await fixture(),poster=new Uint8Array([255,216,255,217]);
 f.adapters.readCache=async()=>({value:{bytes:poster}});
 const workflow=createFigureDownload(f.adapters);
 const first=await workflow.figure(f.revision);
 const replacement=await workflow.figure({...f.revision,description:'Neue Beschreibung'},{target:first});
 assert.equal(replacement.id,first.id);assert.equal(replacement.description,'Neue Beschreibung');
 assert.deepEqual(f.requests.map(request=>request.action),['media_url']);
 assert.deepEqual(new Uint8Array(await f.records.get(replacement.id)[0].poster.arrayBuffer()),poster);
});

test('a denied device folder prevents all media transfers and leaves the workflow ready for retry',async()=>{
 const f=await fixture();f.setSettings({activeFolder:'locked',folders:[{id:'locked',access:'prompt'}]});
 const workflow=createFigureDownload(f.adapters);
 await assert.rejects(workflow.figure(f.revision),/Geräteordner.*freigeben/);
 assert.equal(f.requests.length,0);assert.equal(f.figures.length,0);
 f.setSettings({activeFolder:null,folders:[]});await workflow.figure(f.revision);assert.equal(f.figures.length,1);
});

test('a changed account during destination lookup cannot request media even without a reset notification',async()=>{
 const f=await fixture(),started=deferred(),settings=deferred();
 f.adapters.storageSettings=async()=>{started.resolve();return settings.promise;};
 const workflow=createFigureDownload(f.adapters),pending=workflow.figure(f.revision).catch(error=>error);
 await started.promise;f.setOwner('other');settings.resolve({activeFolder:null,folders:[]});
 assert.equal((await pending).name,'AbortError');assert.equal(f.requests.length,0);assert.equal(f.figures.length,0);
});

test('cancelling video inspection releases browser media even while thumbnail encoding is pending',async()=>{
 const {inspectCloudVideo}=await import('../pwa/cloud-library-download.js');
 const encoding=deferred(),controller=new AbortController();
 const video=Object.assign(new EventTarget(),{duration:2,videoWidth:100,videoHeight:100,pause(){},removeAttribute(){this.src='';},load(){if(this.src)queueMicrotask(()=>this.dispatchEvent(new Event('loadeddata')));}});
 const previous=globalThis.document;
 globalThis.document={createElement:tag=>tag==='video'?video:{getContext:()=>({drawImage(){}}),toBlob(){encoding.resolve();}}};
 try {
  const pending=inspectCloudVideo(new Blob(['video']),controller.signal).then(()=> 'resolved',error=>error.name);
  await encoding.promise;controller.abort();
  const result=await Promise.race([pending,new Promise(resolve=>setImmediate(()=>resolve('still-pending')))]);
  assert.equal(result,'AbortError');assert.equal(video.src,'','the browser no longer retains the temporary video URL');
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
