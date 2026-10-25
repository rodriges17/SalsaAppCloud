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
