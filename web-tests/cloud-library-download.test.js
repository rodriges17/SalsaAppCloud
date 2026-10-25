import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downloadLibrary } from '../pwa/cloud-library-download.js';
import { videoHash } from '../pwa/cloud-dedup.js';
async function fixture() {
 const figures=[],records=new Map(),network=[],saves=[];
 const files={a:new Blob(['video A'],{type:'video/mp4'}),b:new Blob(['video B'],{type:'video/mp4'}),c:new Blob(['video C'],{type:'video/mp4'})};
 const hashes=Object.fromEntries(await Promise.all(Object.entries(files).map(async([key,blob])=>[key,await videoHash(blob)])));
 const rev=(id,ids)=>({id,title:'Cloud '+id,description:'Cloud description',tags:['Salsa'],videos:ids.map(key=>({id:key,name:key,type:'video/mp4',size:files[key].size}))});
 function add(figure,keys){const f={id:crypto.randomUUID(),revision:crypto.randomUUID(),title:'Local',status:'Sitzt',description:'My notes',createdAt:1,tags:[],...figure};records.set(f.id,keys.map(key=>({id:crypto.randomUUID(),name:key,blob:files[key],duration:2,confirmed:true,cacheKey:crypto.randomUUID()})));f.videoIds=records.get(f.id).map(v=>v.id);figures.push(f);return f;}
 const services={
  listFigures:async()=>figures.slice(),
  readMedia:async figure=>(records.get(figure.id)??[]).map(record=>({...record,contentKey:async()=>record.cacheKey,load:async()=>record})),
  readCloudMedia:async({media})=>({content_hash:hashes[media]}),
  fetchVideo:async(revision,video)=>{network.push(video.id);return files[video.id];},
  inspectVideo:async()=>({duration:2,width:100,height:100}),
  saveFigure:async(figure,drafts,expected,options)=>{saves.push({figure,drafts,expected,options});const saved={...figure,revision:crypto.randomUUID(),videoIds:drafts.map(d=>d.id)};const index=figures.findIndex(f=>f.id===saved.id);if(index<0)figures.push(saved);else figures[index]=saved;records.set(saved.id,drafts.map(d=>({...d,cacheKey:crypto.randomUUID()})));return saved;}
 };
 return {figures,records,network,saves,files,hashes,rev,add,services};
}
test('bulk download skips renamed existing content and a second run downloads nothing',async()=>{
 const f=await fixture(),local=f.add({title:'My renamed figure'},['a']);
 const result=await downloadLibrary([f.rev('one',['a']),f.rev('two',['b'])],f.services,{targetFolder:'chosen-folder'});
 assert.deepEqual(f.network,['b']);assert.equal(result.saved,1);assert.equal(result.skipped,1);assert.equal(result.failed.length,0);
 assert.equal(f.figures.find(x=>x.id===local.id).description,'My notes');assert.equal(f.saves[0].options.targetFolder,'chosen-folder');
 const repeat=await downloadLibrary([f.rev('one',['a']),f.rev('two',['b'])],f.services);assert.equal(repeat.saved,0);assert.equal(repeat.skipped,2);assert.deepEqual(f.network,['b']);
});
test('partial cloud copies are completed without overwriting learning metadata; shared content is reused',async()=>{
 const f=await fixture(),local=f.add({title:'My title',importFingerprint:'cloud:one:a'},['a']);
 const result=await downloadLibrary([f.rev('one',['a','b']),f.rev('shared',['b']),f.rev('one',['a','b'])],f.services);
 assert.deepEqual(f.network,['b']);assert.equal(result.total,2);assert.equal(result.saved,1);assert.equal(result.skipped,1);
 assert.equal(f.saves[0].figure.id,local.id);assert.equal(f.saves[0].expected,local.revision);assert.equal(f.saves[0].figure.status,'Sitzt');assert.equal(f.saves[0].figure.description,'My notes');assert.equal(f.saves[0].figure.title,'My title');assert.equal(f.saves[0].drafts.length,2);
});
test('reused local video bytes complete a new figure without being downloaded again',async()=>{
 const f=await fixture();f.add({},['a']);
 const result=await downloadLibrary([f.rev('new',['a','c'])],f.services);
 assert.equal(result.saved,1);assert.deepEqual(f.network,['c']);assert.equal(f.saves[0].drafts.length,2);
});
test('corrupt downloads fail independently and leave other figures saved for retry',async()=>{
 const f=await fixture(),fetch=f.services.fetchVideo;
 f.services.fetchVideo=async(rev,video)=>video.id==='a'?new Blob(['wrong!!']):fetch(rev,video);
 const result=await downloadLibrary([f.rev('bad',['a']),f.rev('good',['b'])],f.services);
 assert.equal(result.failed.length,1);assert.match(result.failed[0].message,/Prüfsumme/);assert.equal(result.saved,1);assert.equal(f.saves.length,1);
});
test('cancellation preserves committed figures and retry only fetches the remaining figure',async()=>{
 const f=await fixture(),controller=new AbortController(),revisions=[f.rev('one',['a']),f.rev('two',['b'])];
 const first=await downloadLibrary(revisions,f.services,{signal:controller.signal,progress:state=>{if(state.phase==='saved')controller.abort();}});
 assert.equal(first.cancelled,true);assert.equal(first.saved,1);assert.deepEqual(f.network,['a']);
 const retry=await downloadLibrary(revisions,f.services);assert.equal(retry.saved,1);assert.equal(retry.skipped,1);assert.deepEqual(f.network,['a','b']);
});
test('cancelled metadata checks cannot start late downloads or saves',async()=>{
 const f=await fixture(),controller=new AbortController();let started,release;
 const ready=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>release=resolve);
 f.services.readCloudMedia=async()=>{started();await gate;return {content_hash:f.hashes.a};};
 const pending=downloadLibrary([f.rev('one',['a'])],f.services,{signal:controller.signal});await ready;controller.abort();
 const result=await pending;assert.equal(result.cancelled,true);release();await Promise.resolve();assert.equal(f.network.length,0);assert.equal(f.saves.length,0);
});

test('full local storage stops further transfers and leaves pending figures for retry',async()=>{
 const f=await fixture();f.services.saveFigure=async()=>{throw new DOMException('Quota','QuotaExceededError');};
 const result=await downloadLibrary([f.rev('one',['a']),f.rev('two',['b'])],f.services);
 assert.equal(result.saved,0);assert.equal(result.failed.length,1);assert.equal(result.remaining,1);assert.deepEqual(f.network,['a']);assert.match(result.failed[0].message,/Speicher ist voll/);
});

test('completed folder copies refresh their source revision before later byte reuse',async()=>{
 const f=await fixture();f.add({storageFolder:'folder',importFingerprint:'cloud:one:a'},['a']);
 const read=f.services.readMedia;f.services.readMedia=async figure=>{assert.equal(figure.revision,f.figures.find(current=>current.id===figure.id).revision);return read(figure);};
 const result=await downloadLibrary([f.rev('one',['a','b']),f.rev('two',['a','c'])],f.services);
 assert.equal(result.saved,2);assert.equal(result.failed.length,0);assert.deepEqual(f.network,['b','c']);
});
