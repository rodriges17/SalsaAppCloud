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
 assert.equal(index.resolve({id:'revision',videos:[{id:'cloud-a'},{id:'cloud-b'}]},[{...local,title:'Neu'}]).current.id,local.id);
 assert.equal(index.resolve({id:'revision',videos:[]},[]).current,null);
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
 assert.equal(index.resolve({id:'revision',videos:[{id:'cloud-a'},{id:'cloud-b'}]},[target]).current.id,'moved');
});

const cloudRevision = { id:'rev',figure_id:'cloud-figure',videos:[{id:'cloud-a'},{id:'cloud-b'}] };
test('resolved availability requires all cloud videos in one readable copy',()=>{
 const index=createCloudLocalIndex(fake(),'links');
 const a={...figure,videoIds:['a']},b={...figure,id:'second',videoIds:['b']};
 index.remember('o','rev',a,[pairs[0]],'cloud-figure');index.remember('o','rev',b,[pairs[1]],'cloud-figure');
 assert.equal(index.resolve(cloudRevision,[a,b]).kind,'partial');
 assert.equal(index.resolve(cloudRevision,[a,b]).available,false);
 const full={...figure,id:'complete'};index.remember('o','rev',full,pairs,'cloud-figure');
 assert.equal(index.resolve(cloudRevision,[a,full,b]).current,full);
});
test('resolver distinguishes access, missing files and no known local copy',()=>{
 const index=createCloudLocalIndex(fake(),'links');index.remember('o','rev',figure,pairs);
 assert.equal(index.resolve(cloudRevision,[]).kind,'cloud');
 assert.equal(index.resolve(cloudRevision,[{...figure,storageProblem:'missing'}]).kind,'missing');
 assert.equal(index.resolve(cloudRevision,[{...figure,storageProblem:'permission',folderAccessRequired:true}]).kind,'access-required');
 assert.equal(index.resolve(cloudRevision,[figure]).kind,'available');
 assert.equal(index.resolve(cloudRevision,[{...figure,videoIds:[]}]).available,false);
});
test('an accessible complete copy wins over blocked or incomplete duplicates',()=>{
 const index=createCloudLocalIndex(fake(),'links'),complete={...figure,id:'readable'},blocked={...figure,folderAccessRequired:true};
 index.remember('o','rev',figure,pairs);index.remember('o','rev',complete,pairs);
 const resolved=index.resolve(cloudRevision,[blocked,complete]);assert.equal(resolved.current,complete);assert.equal(resolved.kind,'available');
});
test('old versions remain openable without counting as the current cloud version',()=>{
 const index=createCloudLocalIndex(fake(),'links');index.remember('o','old',figure,pairs,'cloud-figure');
 const result=index.resolve(cloudRevision,[figure]);assert.equal(result.kind,'outdated');assert.equal(result.figure,figure);assert.equal(result.current,null);assert.equal(result.available,false);
 assert.equal(index.link(figure).revision,'old','status inspection must not rewrite an old version');
 assert.equal(index.resolve({...cloudRevision,figure_id:'unrelated'},[figure]).kind,'cloud');
 assert.equal(index.resolve({...cloudRevision,figure_id:undefined},[figure],{revisionIds:['old']}).kind,'outdated');
});
test('legacy aliases are reconciled but local modifications and readable copies survive',()=>{
 const index=createCloudLocalIndex(fake(),'links');index.remember('o','legacy',figure,pairs,'cloud-figure');
 const edited={...figure,title:'Locally edited'};
 const result=index.resolve({...cloudRevision,legacy_ids:['legacy']},[edited]);
 assert.equal(result.kind,'available');assert.equal(result.modified,true);assert.match(result.detail,/lokal angepasst/);
 assert.equal(index.link(edited).revision,'rev');
});
test('origin and availability stay independent for metadata, learning and intentional video edits',()=>{
 const index=createCloudLocalIndex(fake(),'links');index.remember('o','rev',figure,pairs);
 assert.equal(index.resolve(cloudRevision,[{...figure,status:'Sitzt'}]).modified,false);
 const edited={...figure,title:'New name',videoIds:['replacement']};
 const state=index.resolve(cloudRevision,[edited]);assert.equal(state.kind,'available');assert.equal(state.modified,true);
 assert.equal(index.resolve(cloudRevision,[{...edited,storageProblem:'missing'}]).kind,'missing');
});
test('fingerprint-only imports and current inventory changes use the same decision',()=>{
 const index=createCloudLocalIndex(fake(),'links'),copy={...figure,importFingerprint:'cloud:rev:cloud-a,cloud-b'};
 assert.equal(index.resolve(cloudRevision,[copy]).kind,'available');
 assert.equal(index.resolve(cloudRevision,[]).kind,'cloud');
 assert.equal(index.resolve(cloudRevision,[{...copy,folderAccessRequired:true}]).kind,'access-required');
 assert.equal(index.resolve(cloudRevision,[copy]).kind,'available');
});
test('renamed uploaded originals participate in explicit replacement choices',()=>{
 const index=createCloudLocalIndex(fake(),'links');index.remember('o','old',figure,pairs,'cloud-figure');
 assert.deepEqual(index.importCandidates({title:'different',revisionIds:['rev'],figureId:'cloud-figure'},[figure]),[figure]);
 assert.deepEqual(index.importCandidates({title:'different',revisionIds:['old']},[figure]),[figure]);
 assert.deepEqual(index.importCandidates({title:'different',revisionIds:['rev'],figureId:'other'},[figure]),[]);
});
test('same revision id detects remote metadata updates and simultaneous local changes',()=>{
 const storage=fake(),index=createCloudLocalIndex(storage,'sync');
 const rev={id:'rev',figure_id:'cloud',created_at:'one',title:'A',videos:[{id:'cloud-a'}]};
 const local={...figure,title:'A',videoIds:['a']};
 index.observe(rev);index.remember('owner','rev',local,[pairs[0]],'cloud');
 assert.equal(index.status(local),'cloud');
 index.observe({...rev,created_at:'two',title:'B'});
 assert.equal(index.status(local),'remote');
 assert.equal(index.resolve({...rev,created_at:'two',title:'B'},[local]).kind,'outdated');
 assert.equal(index.status({...local,title:'Local edit'}),'conflict');
 const after=createCloudLocalIndex(storage,'sync');assert.equal(after.status(local),'remote');
 after.remember('owner','rev',local,[pairs[0]],'cloud');assert.equal(after.status(local),'cloud');
});
