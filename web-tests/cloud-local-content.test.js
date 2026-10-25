import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localVideoContent, matchingLocalVideos } from '../pwa/cloud-local-content.js';
import { videoHash } from '../pwa/cloud-dedup.js';

test('content detection finds renamed, independently imported videos across revisions', async () => {
  const blob = new Blob(['original video']), hash = await videoHash(blob);
  const figures = [{id:'renamed'}, {id:'locked',folderAccessRequired:true}, {id:'missing'}];
  const reads = [];
  const content = await localVideoContent(figures, async f => {
    reads.push(f.id);
    return [{load:async()=>{if(f.id==='missing')throw Error('Missing');return {blob};}}];
  });
  assert.deepEqual(reads,['renamed','missing']);
  const revision = {id:'older-version', videos:[{id:'same',size:blob.size}, {id:'different',size:blob.size}, {id:'other-size',size:999}]};
  const requests=[];
  const result=await matchingLocalVideos(revision,content,async p=>{
    requests.push(p);return {content_hash:p.media==='same'?hash:'0'.repeat(64)};
  });
  assert.deepEqual([...result],['same']);
  assert.equal(requests.length,2);assert.equal(requests[0].revision,'older-version');
});

test('unverified hashes, denied access and cancelled views never imply local availability',async()=>{
  const content=new Map([[3,new Set(['a'.repeat(64)])]]);
  const rev={id:'r',videos:[{id:'v',size:3}]};
  for(const read of [async()=>({content_hash:null}),async()=>{throw Error('Denied');}])assert.equal((await matchingLocalVideos(rev,content,read)).size,0);
  let called=false;assert.equal((await matchingLocalVideos(rev,content,async()=>{called=true;},()=>false)).size,0);assert.equal(called,false);
});

test('unchanged media hashes survive reopening and a fresh memo without loading bytes again',async()=>{
 const {createVideoHashMemo}=await import('../pwa/cloud-local-content.js');
 const saved=new Map(),cache=()=>createVideoHashMemo(async k=>saved.get(k),async(k,v)=>saved.set(k,v));
 let reads=0,key='immutable-video-1',missing=false;
 const read=async()=>[{contentKey:async()=>{if(missing)throw Error('Missing');return key;},load:async()=>{reads++;return {blob:new Blob(['video'])};}}];
 const scan=memo=>localVideoContent([{id:'f'}],read,()=>true,memo);
 const first=await scan(cache());await scan(cache());assert.equal(reads,1);assert.equal(first.size,1);
 key='replacement-video';await scan(cache());assert.equal(reads,2);
 missing=true;assert.equal((await scan(cache())).size,0);assert.equal(reads,2);
});

test('concurrent scans share hash work; unavailable persistence and failed reads can retry',async()=>{
 const {createVideoHashMemo}=await import('../pwa/cloud-local-content.js');
 const values=new Map(),cache=createVideoHashMemo(async k=>values.get(k),async(k,v)=>values.set(k,v));
 let reads=0;const compute=async()=>{reads++;return {size:3,hash:'a'.repeat(64)};};
 await Promise.all([cache.get('same',compute),cache.get('same',compute)]);assert.equal(reads,1);
 const broken=createVideoHashMemo(async()=>{throw Error('Unavailable');},async()=>{throw Error('Quota');});
 assert.equal((await broken.get('key',compute)).size,3);
 await assert.rejects(cache.get('retry',async()=>{throw Error('Missing');}));await cache.get('retry',compute);assert.equal(reads,3);
});
