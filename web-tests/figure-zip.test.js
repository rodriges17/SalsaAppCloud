import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFigureZipWorkflow } from '../pwa/figure-zip.js';
import { createFileDelivery } from '../pwa/file-delivery.js';
import { importFigure } from '../pwa/package.js';
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
const figure = { title: 'Drehung', description: 'Original', tags: ['Salsa'], status: 'Sitzt' };
const records = [1,2].map(id => ({ id: String(id), name: `Video ${id}`, blob: new Blob([new Uint8Array([id,0,255])], {type:'video/mp4'}) }));
function setup(options={}) {
  let workflow; const calls=[], changes=[];
  const adapter={ canShare:()=>true, save:(file)=>{calls.push(file);return Promise.resolve('saved');}, share:()=>Promise.resolve('shared'), ...options.adapter };
  const delivery=createFileDelivery({adapter,minimumBusyMs:0,onChange:()=>workflow?.refresh(),label:'ZIP'});
  workflow=createFigureZipWorkflow({readVideos:async()=>records,delivery,onChange:s=>changes.push(s),...options.workflow});
  return {workflow,delivery,calls,changes};
}
test('Figur-ZIP: selection prepares original bytes without learning status; changes invalidate prepared file',async()=>{
 const {workflow:w,calls}=setup();await w.open(figure);w.select('1',false);assert.equal(w.getState().count,1);
 await w.prepare();assert.equal(w.getState().ready,true);await w.deliver('save');
 const archive=await importFigure(calls[0]);assert.equal(archive.status,undefined);assert.equal(archive.drafts.length,1);
 assert.deepEqual(await archive.drafts[0].blob.arrayBuffer(),await records[1].blob.arrayBuffer());
 w.select('1',true);assert.equal(w.getState().ready,false);await w.deliver('save');assert.equal(calls.length,1);
 w.select('1',false);w.select('2',false);assert.equal(w.getState().canPrepare,false);
});
test('Figur-ZIP: hand-off starts synchronously, blocks duplicate actions and retains exact file across error/cancel/retry',async()=>{
 let pending=deferred(),started=0;const files=[];
 const {workflow:w}=setup({adapter:{save:file=>{started++;files.push(file);return pending.promise;}}});
 await w.open(figure);await w.prepare();
 let work=w.deliver('save');assert.equal(started,1);assert.equal(w.getState().busy,true);assert.equal(w.close(),false);
 assert.equal(w.select('1',false),false);await w.deliver('save');assert.equal(started,1);
 pending.reject(new Error('Speicher voll'));await work;assert.match(w.getState().error,/Speicher voll/);assert.equal(w.getState().ready,true);
 pending=deferred();work=w.deliver('save');pending.reject(new DOMException('Abbruch','AbortError'));await work;
 assert.equal(w.getState().error,'');assert.match(w.getState().message,/abgebrochen/);
 pending=deferred();work=w.deliver('save');pending.resolve('saved');await work;
 assert.equal(new Set(files).size,1);assert.equal(w.getState().message,'Datei gespeichert.');assert.equal(w.close(),true);
});
test('Figur-ZIP: closing preparation or pending storage read suppresses late results and allows reopening',async()=>{
 const read=deferred(),paint=deferred();const {workflow:w}=setup({workflow:{readVideos:()=>read.promise,yieldToUI:()=>paint.promise}});
 const opening=w.open(figure);w.close();read.resolve(records);assert.equal(await opening,false);assert.equal(w.getState().open,false);
 await w.open(figure);const preparing=w.prepare();assert.equal(w.getState().busy,true);w.close();
 await w.open({...figure,title:'Neu'});paint.resolve();await preparing;
 assert.equal(w.getState().title,'Neu');assert.equal(w.getState().ready,false);assert.equal(w.getState().busy,false);
 await w.prepare();assert.equal(w.getState().ready,true);
});
test('Figur-ZIP: invalid original media reports failure without exposing a ready archive',async()=>{
 const {workflow:w}=setup({workflow:{readVideos:async()=>[{id:'bad',blob:new Blob(['bad'],{type:'text/plain'})}]}});
 await w.open(figure);await w.prepare();assert.equal(w.getState().ready,false);assert.equal(w.getState().busy,false);assert.ok(w.getState().error);
});
test('file delivery: synchronous throws become retryable errors and download is never reported as saved',async()=>{
 let fail=true,calls=0;const d=createFileDelivery({minimumBusyMs:0,adapter:{canShare:()=>false,save(){calls++;if(fail)throw new Error('Disk');return 'download';}}});
 const work=d.deliver(new File(['x'],'backup.salsabackup'));assert.equal(calls,1);assert.equal(d.reset(),false);await work;
 assert.equal(d.getState().busy,false);assert.match(d.getState().error,/Disk/);fail=false;
 await d.deliver(new File(['x'],'backup.salsabackup'));assert.match(d.getState().message,/Download angefordert/);assert.doesNotMatch(d.getState().message,/Datei gespeichert/);
});

test('file delivery ignores late progress from an earlier completed attempt',async()=>{
 let late,second;let calls=0;
 const adapter={canShare:()=>false,save(file,options){calls++;if(calls===1){late=options.progress;return 'saved';}second=deferred();return second.promise;}};
 const d=createFileDelivery({adapter,minimumBusyMs:0});await d.deliver(new File(['a'],'a.zip'));
 const pending=d.deliver(new File(['b'],'b.zip'));late('Stale progress');assert.match(d.getState().message,/Speichern/);
 second.resolve('saved');await pending;
});
