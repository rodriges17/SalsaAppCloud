import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFigureUpload} from '../pwa/cloud-upload.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(overrides={}){
 const calls=[],phases=[];let account='one';
 const input={owner:'user',local:{id:'local',title:'Enchufla',description:'Text',tags:['Salsa']},videos:[{id:'v',name:'Video',blob:new Blob(['abc'],{type:'video/mp4'})}],target:{id:'figure',content_token:'token',revisions:[{id:'revision',videos:[{id:'old'}]}]},library:'library',allowed:false};
 const services={identity:()=>account,hash:async()=> 'digest',mediaHash:async()=>{},poster:async()=>null,remember:()=>true,
 call:async(action,payload)=>{calls.push({action,payload});if(action==='state')return {own_figures:input.target?[input.target]:[]};if(action==='duplicates')return {matches:[{hash:'digest',media:'old'}]};if(action==='reserve')return {job:'job',media:[{id:'new',reused:true}]};if(action==='commit')return {figure:'figure',revision:'revision'};if(action==='upload_status')return {status:'saved',saved:{figure:'figure',revision:'revision'}};return {};},
 upload:async()=>calls.push({action:'upload'}),...overrides};
 const flow=createFigureUpload(services);return {flow,input,calls,phases,services,switchAccount:()=>account='two',start:()=>flow.start(input,{confirm:async()=>true,progress:s=>phases.push(s)})};
}
test('shared upload reuses bytes, commits metadata and performs independent follow-up work',async()=>{
 const f=fixture();const r=await f.start();assert.equal(r.kind,'saved');assert.equal(r.localPending,false);assert.equal(r.attachPending,false);
 assert.equal(f.calls.filter(c=>c.action==='upload').length,0);assert.equal(f.calls.filter(c=>c.action==='commit').length,1);
 assert.equal(f.calls.find(c=>c.action==='commit').payload.description,'Text');assert.ok(f.phases.some(s=>s.phase==='committing'&&!s.canCancel));
});
test('new duplicate prompts without reserving; explicit variant can proceed',async()=>{
 const f=fixture();f.input.target=null;assert.equal((await f.start()).kind,'duplicates');assert.ok(!f.calls.some(c=>c.action==='reserve'));
 f.input.variant=true;assert.equal((await f.start()).kind,'saved');
});
test('abort while reserve is pending cleans late reservation and never commits',async()=>{
 const gate=deferred(),f=fixture();const call=f.services.call;f.services.call=async(a,p)=>a==='reserve'?(await gate.promise,{job:'late',media:[{id:'new'}]}):call(a,p);
 const pending=f.start();while(f.flow.phase!=='reserving')await new Promise(r=>setTimeout(r,0));assert.equal(f.flow.cancel(),true);gate.resolve();
 assert.equal((await pending).kind,'cancelled');assert.ok(f.calls.some(c=>c.action==='abort'&&c.payload.job==='late'));assert.ok(!f.calls.some(c=>c.action==='commit'));
});
test('abort during poster preparation is honored; commit itself cannot be cancelled',async()=>{
 const gate=deferred(),f=fixture({poster:()=>gate.promise});const pending=f.start();while(f.flow.phase!=='poster')await new Promise(r=>setTimeout(r,0));f.flow.cancel();gate.resolve(null);assert.equal((await pending).kind,'cancelled');
 const g=fixture(),commit=deferred(),call=g.services.call;g.services.call=async(a,p)=>a==='commit'?commit.promise:call(a,p);const next=g.start();while(g.flow.phase!=='committing')await new Promise(r=>setTimeout(r,0));assert.equal(g.flow.cancel(),false);commit.resolve({figure:'figure',revision:'revision'});assert.equal((await next).kind,'saved');
});
test('account changes during reserve or commit never attach or link to a different account',async()=>{
 for(const phase of ['reserve','commit']){const gate=deferred(),f=fixture({remember:()=>{throw Error('must not link');}}),call=f.services.call;f.services.call=async(a,p)=>a===phase?(await gate.promise,phase==='reserve'?{job:'job',media:[{id:'new'}]}:{figure:'figure',revision:'revision'}):call(a,p);
 const pending=f.start();while(f.flow.phase!==(phase==='reserve'?'reserving':'committing'))await new Promise(r=>setTimeout(r,0));f.switchAccount();f.flow.cancel();gate.resolve();assert.equal((await pending).kind,'account-changed');assert.ok(!f.calls.some(c=>c.action==='attach'));}
});
test('lost commit response reconciles saved outcome without abort or a second upload',async()=>{
 const f=fixture(),call=f.services.call;f.services.call=async(a,p)=>{if(a==='commit')throw Error('network');return call(a,p);};assert.equal((await f.start()).kind,'saved');assert.ok(!f.calls.some(c=>c.action==='abort'));assert.equal(f.calls.filter(c=>c.action==='upload_status').length,1);
});
test('unknown outcome blocks new uploads until an exact server result is available',async()=>{
 let offline=true;const f=fixture(),call=f.services.call;f.services.call=async(a,p)=>{if(a==='commit'||(a==='upload_status'&&offline))throw Error('offline');return call(a,p);};
 assert.equal((await f.start()).kind,'unknown');await assert.rejects(f.start(),/Speicherstand/);offline=false;assert.equal((await f.flow.reconcile()).kind,'saved');assert.ok(!f.calls.some(c=>c.action==='abort'));
});
test('confirmed not-saved outcome permits retry only after the server fenced the old job',async()=>{
 const f=fixture(),call=f.services.call;f.services.call=async(a,p)=>{if(a==='commit')throw Error('lost');if(a==='upload_status')return {status:'not_saved'};return call(a,p);};
 assert.equal((await f.start()).kind,'not-saved');assert.ok(f.calls.some(c=>c.action==='abort'));
});
test('local and library failures remain independent and retries never transfer or commit again',async()=>{
 let local=false,attach=false;const f=fixture({remember:()=>local}),call=f.services.call;
 f.services.call=async(a,p)=>{if(a==='attach'&&!attach)throw Error('attach failed');return call(a,p);};
 let r=await f.start();assert.equal(r.kind,'saved');assert.equal(r.localPending,true);assert.equal(r.attachPending,true);
 local=true;r=await f.flow.retryLocal();assert.equal(r.localPending,false);assert.equal(r.attachPending,true);attach=true;r=await f.flow.retryAttach();assert.equal(r.attachPending,false);
 assert.equal(f.calls.filter(c=>c.action==='commit').length,1);assert.ok(!f.calls.some(c=>c.action==='upload'));
});
test('thrown local storage error does not prevent library assignment; stale retries are rejected',async()=>{
 const f=fixture({remember:()=>{throw Error('quota');}});const r=await f.start();assert.equal(r.localPending,true);assert.equal(r.attachPending,false);f.switchAccount();await assert.rejects(f.flow.retryLocal(),/Konto/);
});
test('incomplete commit responses are uncertain until an exact server receipt confirms success',async()=>{
 const f=fixture(),call=f.services.call;f.services.call=async(a,p)=>a==='commit'?{}:call(a,p);
 assert.equal((await f.start()).kind,'saved');assert.ok(f.calls.some(c=>c.action==='upload_status'));
});
