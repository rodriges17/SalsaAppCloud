import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCloudLocalIndex } from '../pwa/cloud-local.js';
const fake = () => { const map=new Map();return {getItem:key=>map.get(key),setItem:(key,value)=>map.set(key,value)}; };
const figure={id:'local',videoIds:['a','b'],storageFolder:null};
const pairs=[{cloud:'cloud-a',local:'a'},{cloud:'cloud-b',local:'b'}];
test('upload provenance persists per owner and matches renamed originals without changing figures',()=>{
 const storage=fake(),index=createCloudLocalIndex(storage,'links');
 assert.equal(index.remember('owner','rev',figure,pairs),true);
 const after=createCloudLocalIndex(storage,'links');
 assert.deepEqual([...after.selections('owner','rev',[{...figure,title:'New name',revision:'new'}])[0]],['cloud-a','cloud-b']);
 assert.equal(after.selections('other','rev',[figure]).length,0);assert.equal(after.selections('owner','other-rev',[figure]).length,0);
 assert.deepEqual(figure,{id:'local',videoIds:['a','b'],storageFolder:null});
});
test('deletion, moved folders and replaced videos invalidate original provenance',()=>{
 const index=createCloudLocalIndex(fake(),'links');index.remember('o','r',{...figure,storageFolder:'folder'},pairs);
 assert.equal(index.selections('o','r',[]).length,0);assert.equal(index.selections('o','r',[figure]).length,0);
 assert.equal(index.selections('o','r',[{...figure,storageFolder:'folder',storageProblem:'missing'}]).length,0);
 assert.deepEqual([...index.selections('o','r',[{...figure,storageFolder:'folder',videoIds:['b','new']}])[0]],['cloud-b']);
});
test('linking another copy retains earlier mappings; unavailable persistence is explicit',()=>{
 const storage=fake(),index=createCloudLocalIndex(storage,'links');index.remember('o','r',figure,pairs);
 index.remember('o','r',{...figure,id:'other'},pairs);assert.equal(index.selections('o','r',[figure,{...figure,id:'other'}]).length,2);
 storage.setItem=()=>{throw Error('Quota');};assert.equal(index.remember('o','r',figure,pairs.slice(0,1)),false);
 assert.equal(createCloudLocalIndex({getItem:()=>'{bad'},'k').selections('o','r',[figure]).length,0);
});

test('a known original without folder access is distinct from available or missing media',()=>{
 const storage=fake(),index=createCloudLocalIndex(storage,'links'),local={...figure,storageFolder:'folder',storageProblem:'Permission',folderAccessRequired:true};
 index.remember('o','r',local,pairs);
 const state=index.availability('o','r',[local]);assert.equal(state.available.length,0);assert.deepEqual([...state.accessRequired[0]],['cloud-a','cloud-b']);
 assert.equal(index.availability('o','r',[{...local,folderAccessRequired:false}]).accessRequired.length,0);
 assert.equal(index.availability('o','r',[{...local,folderAccessRequired:false,storageProblem:''}]).available.length,1);
});
test('a second view observes newly persisted upload links without reopening',()=>{
 const storage=fake(),a=createCloudLocalIndex(storage,'links'),b=createCloudLocalIndex(storage,'links');assert.equal(a.selections('o','r',[figure]).length,0);
 b.remember('o','r',figure,pairs);assert.equal(a.selections('o','r',[figure]).length,1);
});

test('origin icons distinguish local, cloud and content changes while ignoring learning progress',()=>{
 const index=createCloudLocalIndex(fake(),'links');
 const local={...figure,title:'Drehung',description:'Start',tags:['Salsa'],videoContent:[['a','Video',3,null],['b','Zweitvideo',4,null]]};
 assert.equal(index.status(local),'local');
 index.remember('owner','revision',local,pairs,'stable-cloud-figure');
 assert.equal(index.status(local),'cloud');
 assert.equal(index.link(local).cloudFigure,'stable-cloud-figure');
 assert.equal(index.status({...local,status:'Sitzt',revision:'changed'}),'cloud');
 for(const changed of [{title:'Neu'},{description:'Notiz'},{tags:['Bachata']},{videoContent:[['a','Umbenannt',3,null]]}]) assert.equal(index.status({...local,...changed}),'modified');
 assert.equal(index.find('revision',[{...local,title:'Neu'}]).id,local.id);
 assert.equal(index.find('revision',[]),undefined);
 const changed={...local,title:'Neu'};index.remember('owner','revision',changed,pairs,'stable-cloud-figure');
 assert.equal(index.status(changed),'cloud');
});

test('moving a local figure preserves cloud origin and the local-modification flag',()=>{
 const index=createCloudLocalIndex(fake(),'links');
 index.remember('owner','revision',figure,pairs,'cloud-figure');
 const target={...figure,id:'moved',storageFolder:'folder',videoIds:['x','y']};
 index.copy(figure,target);assert.equal(index.status(target),'cloud');assert.equal(index.link(target).cloudFigure,'cloud-figure');
 const modified={...figure,title:'Local edit'},other={...target,id:'moved-edited',title:'Local edit'};
 index.copy(modified,other);assert.equal(index.status(other),'modified');
 assert.equal(index.find('revision',[target]).id,'moved');
});
