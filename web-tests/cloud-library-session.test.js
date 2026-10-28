import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLibrarySession} from '../pwa/cloud-library-draft.js';
const detail=()=>({library:{id:'lib',title:'Kurs',description:'Text',visibility:'private',collaborative:false,moderated:true,edit_version:'v1'},entries:[{figure_id:'a'},{figure_id:'b'}],manage:true,members:[]});
const setup=(adapters={})=>createLibrarySession({detail:detail(),owner:'account-a',identity:()=> 'account-a',commit:async()=>({ok:true}),...adapters});
test('library session stages settings and membership and only leaves after successful save or explicit discard',async()=>{
 let saved;const s=setup({commit:async payload=>{saved=payload;}});
 s.model.data.title='Neuer Kurs';s.model.move('b',0);s.tab='settings';
 assert.equal((await s.leave('stay')).kind,'stay');assert.equal(s.active,true);assert.equal(s.tab,'settings');
 assert.deepEqual(s.model.ids,['b','a']);assert.equal(s.detail.library.title,'Kurs');
 const result=await s.leave('save');assert.equal(result.kind,'left');assert.equal(s.active,false);
 assert.deepEqual(saved.order,['b','a']);assert.equal(saved.title,'Neuer Kurs');assert.equal(saved.expected_version,'v1');
 const discarded=setup();discarded.model.remove('a');assert.equal((await discarded.leave('discard')).kind,'left');assert.equal(discarded.active,false);assert.deepEqual(discarded.detail.entries.map(e=>e.figure_id),['a','b']);
 const invalid=setup();invalid.model.data.title=' ';assert.equal((await invalid.leave('save')).kind,'stay');assert.equal(invalid.active,true);assert.equal(invalid.dirty,true);
});
test('upload return preserves the draft and retries a failed read using the confirmed figure exactly once',async()=>{
 let unavailable=true;const uploaded={id:'new',owner_id:'writer',revisions:[{id:'rev-new',title:'Neue Figur'}]};
 const s=setup({readState:async()=>{if(unavailable)throw Error('offline');return {me:{id:'writer'},libraries:[{id:'lib',manage:true}],own_figures:[uploaded]};}});
 s.model.data.description='Noch ungespeichert';s.model.move('b',0);s.tab='settings';s.suspend();
 assert.equal(s.suspended,true);assert.equal((await s.resume({figure:'new',revision:'rev-new'})).kind,'failed');
 assert.equal(s.suspended,true);assert.deepEqual(s.model.ids,['b','a']);
 unavailable=false;assert.equal((await s.resume()).kind,'resumed');assert.equal(s.suspended,false);assert.equal(s.tab,'settings');
 assert.equal(s.model.data.description,'Noch ungespeichert');assert.deepEqual(s.model.ids,['b','a','new']);assert.deepEqual(s.model.payload().additions,[{figure:'new',revision:'rev-new'}]);
 assert.equal((await s.resume()).kind,'unchanged');assert.deepEqual(s.model.ids,['b','a','new']);s.discard();assert.equal(uploaded.revisions[0].title,'Neue Figur');
 const cancelled=setup({readState:async()=>({me:{id:'writer'},libraries:[{id:'lib',manage:true}],own_figures:[]})});cancelled.model.remove('a');cancelled.suspend();assert.equal((await cancelled.resume()).kind,'resumed');assert.deepEqual(cancelled.model.ids,['b']);
});
test('save conflicts and failed reload keep all changes and the original version until a confirmed reload succeeds',async()=>{
 let mode='conflict',fresh=detail();fresh.library.title='Anderer Cloud-Stand';fresh.library.edit_version='v2';
 const payloads=[];const s=setup({commit:async p=>{payloads.push(p);throw Object.assign(Error(mode==='conflict'?'Konflikt':'offline'),{status:mode==='conflict'?409:503});},read:async()=>{if(mode==='offline')throw Error('offline');return fresh;}});
 s.model.data.title='Mein Entwurf';s.model.remove('a');s.tab='settings';
 assert.equal((await s.leave('save')).kind,'stay');assert.equal(s.conflict,true);assert.equal(s.active,true);
 assert.equal((await s.reload(false)).kind,'kept');assert.equal(s.model.data.title,'Mein Entwurf');
 mode='offline';assert.equal((await s.reload(true)).kind,'failed');assert.equal(s.model.data.title,'Mein Entwurf');assert.deepEqual(s.model.ids,['b']);
 await s.save();assert.deepEqual(payloads.map(p=>p.expected_version),['v1','v1']);
 mode='conflict';assert.equal((await s.reload(true)).kind,'reloaded');assert.equal(s.model.data.title,'Anderer Cloud-Stand');assert.equal(s.model.payload().expected_version,'v2');assert.equal(s.tab,'settings');assert.equal(s.dirty,false);assert.equal(s.conflict,false);
});
const gate=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
test('duplicate saves share one commit and discarded or foreign sessions ignore late results',async()=>{
 const commit=gate();let calls=0;const s=setup({commit:async()=>{calls++;await commit.promise;}});s.model.data.title='Neu';
 const first=s.save(),second=s.save();await Promise.resolve();assert.equal(first,second);assert.equal(calls,1);s.discard();commit.resolve();assert.equal((await first).kind,'stale');assert.equal(s.active,false);
 let owner='account-a';const read=gate();const foreign=setup({identity:()=>owner,readState:()=>read.promise});foreign.suspend();const returning=foreign.resume({figure:'late'});owner='account-b';read.resolve({me:{id:'writer'},libraries:[{id:'lib',manage:true}],own_figures:[{id:'late',revisions:[{id:'late-r'}]}]});assert.equal((await returning).kind,'stale');assert.deepEqual(foreign.model.ids,['a','b']);assert.equal(foreign.phase,'expired');
 const refreshing=gate();const abandoned=setup({read:()=>refreshing.promise});abandoned.model.data.title='Privater Entwurf';const reload=abandoned.reload(true);abandoned.discard();refreshing.resolve(detail());assert.equal((await reload).kind,'stale');assert.equal(abandoned.model.data.title,'Privater Entwurf');
});
test('lost edit permission retires the suspended session instead of restoring its private draft',async()=>{
 const s=setup({readState:async()=>({me:{id:'writer'},libraries:[{id:'lib',manage:false,owner_id:'other'}],own_figures:[]})});s.model.data.title='Privat';s.suspend();const result=await s.resume();assert.equal(result.kind,'denied');assert.equal(s.active,false);assert.equal((await s.save()).kind,'stale');
});
test('leaving a suspended upload saves its confirmed figure even after the first return failed',async()=>{
 let fail=true,saved;const s=setup({readState:async()=>{if(fail)throw Error('offline');return {me:{id:'writer'},libraries:[{id:'lib',manage:true}],own_figures:[{id:'new',revisions:[{id:'rev-new'}]}]};},commit:async payload=>{saved=payload;}});
 s.suspend();await s.resume({figure:'new',revision:'rev-new'});assert.equal(s.dirty,true);fail=false;
 assert.equal((await s.leave('save')).kind,'left');assert.deepEqual(saved.additions,[{figure:'new',revision:'rev-new'}]);
});
test('denied save or reload expires the session at its interface',async()=>{
 const denied=()=>Promise.reject(Object.assign(Error('Keine Berechtigung'),{status:403}));
 for(const method of ['save','reload']){
  const s=setup({commit:denied,read:denied});s.model.data.title='Privat';const result=await(method==='save'?s.save():s.reload(true));
  assert.equal(result.kind,'denied');assert.equal(result.error.accessChanged,true);assert.equal(s.active,false);assert.equal((await s.save()).kind,'stale');
 }
});
test('an accessible duplicate outside own figures is referenced without creating another figure',async()=>{
 let saved;const s=setup({readState:async()=>({me:{id:'writer'},libraries:[{id:'lib',manage:true}],own_figures:[]}),commit:async payload=>{saved=payload;}});
 s.suspend();const result=await s.resume({figure:'shared',revision:'shared-r',reference:{id:'shared',revisions:[{id:'shared-r',title:'Geteilte Figur',videos:[]}]}});
 assert.equal(result.kind,'resumed');assert.equal((await s.save()).kind,'saved');
 assert.deepEqual(saved.additions,[{figure:'shared',revision:'shared-r'}]);assert.deepEqual(saved.order,['a','b','shared']);
});
