import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listFigures } from '../pwa/app-storage.js';

// Adapter fake: only metadata transactions and response existence are available.
// Any attempt to consume a media response fails, including Blob/arrayBuffer/text.
const catalog = { figures: [], videos: [] }, responses = new Map();
const consume = () => { throw Error('Availability must not consume video bytes'); };
const db = { transaction(name) {
 const tx = { objectStore: () => ({ getAll() {
  const request = {};
  queueMicrotask(() => { request.result = structuredClone(catalog[name]); request.onsuccess(); tx.oncomplete(); });
  return request;
 } }) };
 return tx;
} };
globalThis.indexedDB = { open() {
 const request = { result: db };queueMicrotask(() => request.onsuccess());return request;
} };
globalThis.caches = { async open() { return { async match(key) { return responses.get(key); } }; } };
const figure = { id:'figure',title:'Turn',videoIds:['video-a','video-b'] };
function reset() {
 catalog.figures = [{...figure}];
 catalog.videos = ['a','b'].map(id => ({ id:'video-'+id,figureId:'figure',cacheKey:'cache-'+id }));
 responses.clear();for(const id of ['a','b']) responses.set('cache-'+id,{blob:consume,arrayBuffer:consume,text:consume});
}
test('app availability checks every response without consuming media bytes',async()=>{
 reset();const result=await listFigures();assert.equal(result[0].storageProblem,'');assert.equal(catalog.figures[0].storageProblem,undefined);
});
test('app availability observes removed and restored media entries on every inventory read',async()=>{
 reset();const saved=responses.get('cache-b');responses.delete('cache-b');
 assert.match((await listFigures())[0].storageProblem,/Videodatei fehlt/);
 responses.set('cache-b',saved);assert.equal((await listFigures())[0].storageProblem,'');
});
test('app availability rejects absent metadata and records belonging to another figure',async()=>{
 reset();catalog.videos.pop();assert.match((await listFigures())[0].storageProblem,/Videodatei fehlt/);
 reset();catalog.videos[0].figureId='other';assert.match((await listFigures())[0].storageProblem,/Videodatei fehlt/);
 reset();catalog.videos[0].cacheKey=null;assert.match((await listFigures())[0].storageProblem,/Videodatei fehlt/);
});
test('empty app inventory and zero-video figures cannot fabricate readable copies',async()=>{
 reset();catalog.figures=[];assert.deepEqual(await listFigures(),[]);
 catalog.figures=[{...figure,videoIds:[]}];assert.match((await listFigures())[0].storageProblem,/Videodatei fehlt/);
});
