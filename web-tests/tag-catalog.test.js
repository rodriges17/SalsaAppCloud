import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTagCatalog} from '../pwa/tag-catalog.js';

test('tag catalog refreshes accessible suggestions and retains exact cached variants offline',async()=>{
 const cache=new Map();let fail=false,remote=['Pasito','pasito','Cloud'],local=['Lokal'];
 const options={identity:()=> 'account-a',local:async()=>local,remote:async()=>{if(fail)throw Error('offline');return {tags:remote,complete:true};},read:async owner=>cache.get(owner),write:async(owner,value)=>cache.set(owner,value)};
 const online=createTagCatalog(options);const fresh=await online.load();
 assert.equal(fresh.complete,true);assert.deepEqual(new Set(fresh.tags),new Set(['Lokal','Pasito','pasito','Cloud']));online.close();
 fail=true;const offline=createTagCatalog(options);const saved=await offline.load();assert.equal(saved.complete,false);assert.deepEqual(new Set(saved.tags),new Set(fresh.tags));
 fail=false;remote=['pasito'];local=['Neu'];const updated=await offline.load();assert.equal(updated.complete,true);assert.deepEqual(new Set(updated.tags),new Set(['Neu','pasito']));
 assert.deepEqual(cache.get('account-a'),['pasito']);offline.close();
});

test('permission denial clears cached Cloud suggestions while optional cache failures do not hide fresh data',async()=>{
 let stored=['Privat'];const values=[];
 const options={identity:()=> 'a',local:async()=>['Lokal'],read:async()=>stored,write:async(_,value)=>{stored=value;},remote:async()=>{throw Object.assign(Error('denied'),{status:403});}};
 const denied=await createTagCatalog(options).load(v=>values.push(v));assert.deepEqual(denied.tags,['Lokal']);assert.deepEqual(stored,[]);assert.equal(denied.complete,false);
 const fresh=await createTagCatalog({...options,remote:async()=>({tags:['Frisch'],complete:true}),write:async()=>{throw Error('quota');}}).load();
 assert.equal(fresh.complete,true);assert.deepEqual(fresh.tags,['Lokal','Frisch']);
});

const gate=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
test('late requests cannot restore another account, a closed view or invalidated permissions',async()=>{
 for(const scenario of ['account','closed','permissions']){
  let owner='a',version=0,writes=0;const pending=gate(),updates=[];
  const catalog=createTagCatalog({identity:()=>owner,revision:()=>version,local:async()=>[],read:async()=>[],write:async()=>{writes++;},remote:()=>pending.promise});
  const work=catalog.load(v=>updates.push(v));await new Promise(r=>setTimeout(r,0));
  if(scenario==='account')owner='b';if(scenario==='closed')catalog.close();if(scenario==='permissions')version++;
  pending.resolve({tags:['Privat'],complete:true});assert.equal(await work,null,scenario);assert.equal(writes,0,scenario);assert.ok(!updates.some(v=>v.tags.includes('Privat')),scenario);
 }
});
