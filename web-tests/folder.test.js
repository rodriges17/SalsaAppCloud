import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLibrary, readLibrary, writeFolderFigure, readFolderVideo, deleteFolderFigure, cleanupFolder, permission } from '../pwa/folder-storage.js';
class Directory {
  files = new Map(); dirs = new Map(); failMedia = 0; failManifest = ''; deny = false; failDelete = false;
  async queryPermission() { return this.deny ? 'denied' : 'granted'; }
  async getDirectoryHandle(name, { create = false } = {}) { if (!this.dirs.has(name)) { if (!create) throw new DOMException('missing','NotFoundError'); this.dirs.set(name,new Directory()); } return this.dirs.get(name); }
  async getFileHandle(name, { create = false } = {}) {
    if (!this.files.has(name)) { if (!create) throw new DOMException('missing','NotFoundError'); this.files.set(name,new Blob()); }
    const dir=this;
    return { async getFile(){return dir.files.get(name);}, async createWritable(){let next;return {async write(blob){if(name !== 'library.json' && --dir.failMedia === 0) throw Error('full');next=blob instanceof Blob?blob:new Blob([blob]);},async close(){if(dir.failManifest==='before')throw Error('close failed');dir.files.set(name,next);if(dir.failManifest==='after')throw Error('ambiguous close');},async abort(){}};} };
  }
  async removeEntry(name) { if(this.failDelete)throw Error('busy');if(!this.files.delete(name))throw new DOMException('missing','NotFoundError'); }
}
function setup() {
 const handle=new Directory(),library={format:'salsa-device-library',version:1,id:'library-id',figures:[],garbage:[]};handle.files.set('library.json',new Blob([JSON.stringify(library)]));
 const folder={id:library.id,handle,library};const mirror=async data=>{folder.library=structuredClone(data);};return {folder,mirror};
}
const figure=()=>({id:crypto.randomUUID(),title:'Salsa',description:'Beschreibung',status:'Am Üben',tags:['Drehung']});
const draft=()=>({id:crypto.randomUUID(),name:'Führung',blob:new Blob(['video bytes'],{type:'video/mp4'}),duration:6,confirmed:true,existing:false});
test('folder: write, restore and verify bytes plus complete learning metadata',async()=>{
 const {folder,mirror}=setup(),f=figure(),d=draft();const saved=await writeFolderFigure(folder,f,[d],null,mirror);
 const disk=await readLibrary(folder.handle);assert.equal(disk.figures[0].status,'Am Üben');assert.deepEqual(disk.figures[0].tags,['Drehung']);assert.equal(saved.storageFolder,folder.id);
 const video=await readFolderVideo(folder,disk.figures[0],disk.figures[0].videos[0]);assert.equal(await video.blob.text(),'video bytes');
});
test('folder: failed second video write leaves previous catalog intact and removes staging',async()=>{
 const {folder,mirror}=setup();const media=await folder.handle.getDirectoryHandle('media',{create:true});media.failMedia=2;
 await assert.rejects(writeFolderFigure(folder,figure(),[draft(),draft()],null,mirror),/full/);assert.equal((await readLibrary(folder.handle)).figures.length,0);assert.equal(media.files.size,0);
});
test('folder: stale revision cannot overwrite metadata or existing video',async()=>{
 const {folder,mirror}=setup(),f=figure();await writeFolderFigure(folder,f,[draft()],null,mirror);
 await assert.rejects(writeFolderFigure(folder,{...f,title:'overwrite'},[draft()],null,mirror),{code:'FIGURE_CONFLICT'});assert.equal((await readLibrary(folder.handle)).figures[0].title,'Salsa');
});
test('folder: ambiguous manifest close never removes media referenced on disk',async()=>{
 const {folder,mirror}=setup();folder.handle.failManifest='after';await assert.rejects(writeFolderFigure(folder,figure(),[draft()],null,mirror),/ambiguous/);
 const disk=await readLibrary(folder.handle);assert.equal(disk.figures.length,1);assert.equal(await (await readFolderVideo(folder,disk.figures[0],disk.figures[0].videos[0])).blob.text(),'video bytes');
});
test('folder: revoked permission and changed or missing files preserve metadata for repair',async()=>{
 const {folder,mirror}=setup(),f=figure();await writeFolderFigure(folder,f,[draft()],null,mirror);const disk=await readLibrary(folder.handle),v=disk.figures[0].videos[0];
 folder.handle.deny=true;await assert.rejects(permission(folder.handle),{code:'folder-permission-required'});folder.handle.deny=false;
 const media=await folder.handle.getDirectoryHandle('media');media.files.set(v.file,new Blob(['other bytes']));await assert.rejects(readFolderVideo(folder,f,v),/verändert/);
 media.files.delete(v.file);await assert.rejects(readFolderVideo(folder,f,v),/nicht verfügbar/);assert.equal((await readLibrary(folder.handle)).figures[0].status,'Am Üben');
});
test('folder: deletion retains a retry journal until blocked file deletion succeeds',async()=>{
 const {folder,mirror}=setup();const saved=await writeFolderFigure(folder,figure(),[draft()],null,mirror),media=await folder.handle.getDirectoryHandle('media');media.failDelete=true;
 await deleteFolderFigure(folder,saved,mirror);assert.equal(folder.library.figures.length,0);assert.equal(folder.library.garbage.length,1);assert.equal(media.files.size,1);
 media.failDelete=false;await cleanupFolder(folder,folder.library,mirror);assert.equal(folder.library.garbage.length,0);assert.equal(media.files.size,0);
});
test('folder: reject traversal, duplicate media and invalid learning metadata',async()=>{
 const {folder,mirror}=setup();await writeFolderFigure(folder,figure(),[draft()],null,mirror);const base=await readLibrary(folder.handle);
 for(const mutate of [d=>d.figures[0].videos[0].file='../original.mp4',d=>d.figures[0].status='arbitrary',d=>d.figures.push(structuredClone(d.figures[0])),d=>d.garbage.push(d.figures[0].videos[0].file)]) {const data=structuredClone(base);mutate(data);assert.throws(()=>validateLibrary(data));}
});

test('folder restore: a failed batch or cancellation keeps the complete previous catalog',async()=>{
 const {restoreFolderBatch}=await import('../pwa/folder-storage.js');const {folder,mirror}=setup();const old=await writeFolderFigure(folder,figure(),[draft()],null,mirror),before=JSON.stringify(await readLibrary(folder.handle));const media=await folder.handle.getDirectoryHandle('media');
 const item=()=>({id:crypto.randomUUID(),figure:{...figure(),source:'backup-source',createdAt:1700000000000,poster:null},records:[draft()]});
 media.failMedia=2;await assert.rejects(restoreFolderBatch(folder,[item(),item()],[old],mirror),/full/);assert.equal(JSON.stringify(await readLibrary(folder.handle)),before);assert.equal(media.files.size,1);
 media.failMedia=0;const c=new AbortController();await assert.rejects(restoreFolderBatch(folder,[item(),item()],[old],mirror,{signal:c.signal,progress:()=>c.abort()}),{name:'AbortError'});assert.equal(JSON.stringify(await readLibrary(folder.handle)),before);assert.equal(media.files.size,1);
});
test('folder restore: one batch preserves original dates and learning states and rejects stale plans',async()=>{
 const {restoreFolderBatch}=await import('../pwa/folder-storage.js');const {folder,mirror}=setup();const a={id:crypto.randomUUID(),figure:{...figure(),source:'backup-source',createdAt:1700000000000,poster:null},records:[draft()]};await restoreFolderBatch(folder,[a],[],mirror);const f=(await readLibrary(folder.handle)).figures[0];assert.equal(f.createdAt,1700000000000);assert.equal(f.status,'Am Üben');assert.equal(f.backupOrigin,'backup-source');await assert.rejects(restoreFolderBatch(folder,[{...a,id:crypto.randomUUID()}],[],mirror),/inzwischen/);assert.equal((await readLibrary(folder.handle)).figures.length,1);
});

test('folder staging: save and restore both reject a corrupt copy and retain old catalog and media',async()=>{
 const {restoreFolderBatch}=await import('../pwa/folder-storage.js');
 for(const operation of ['save','restore']){
  const {folder,mirror}=setup(),saved=await writeFolderFigure(folder,figure(),[draft()],null,mirror),before=JSON.stringify(await readLibrary(folder.handle)),media=await folder.handle.getDirectoryHandle('media'),oldFile=folder.library.figures[0].videos[0].file;
  const open=media.getFileHandle.bind(media);
  media.getFileHandle=async(name,options)=>{const handle=await open(name,options);if(name===oldFile)return handle;return {...handle,async getFile(){const stored=await handle.getFile();const bytes=new Uint8Array(await stored.arrayBuffer());if(bytes.length)bytes[0]^=1;return new Blob([bytes]);}};};
  if(operation==='save')await assert.rejects(writeFolderFigure(folder,{...saved,title:'Changed'},[draft()],saved.revision,mirror),/unvollständig/);
  else await assert.rejects(restoreFolderBatch(folder,[{id:saved.id,figure:{...figure(),source:'restored',createdAt:1},records:[draft()]}],[saved],mirror),/unvollständig/);
  assert.equal(JSON.stringify(await readLibrary(folder.handle)),before);assert.equal(media.files.size,1);assert.equal(await media.files.get(oldFile).text(),'video bytes');
 }
});
test('folder staging: ambiguous restore commit keeps both newly referenced media and old pending cleanup bytes',async()=>{
 const {restoreFolderBatch}=await import('../pwa/folder-storage.js'),{folder,mirror}=setup();
 const saved=await writeFolderFigure(folder,figure(),[draft()],null,mirror),oldFile=folder.library.figures[0].videos[0].file;
 folder.handle.failManifest='after';
 await assert.rejects(restoreFolderBatch(folder,[{id:saved.id,figure:{...figure(),source:'restored',createdAt:1},records:[{...draft(),blob:new Blob(['replacement bytes'],{type:'video/mp4'})}]}],[saved],mirror),/ambiguous/);
 const disk=await readLibrary(folder.handle),media=await folder.handle.getDirectoryHandle('media');
 assert.equal(await(await readFolderVideo(folder,disk.figures[0],disk.figures[0].videos[0])).blob.text(),'replacement bytes');
 assert.ok(disk.garbage.includes(oldFile));assert.equal(await media.files.get(oldFile).text(),'video bytes');assert.equal(media.files.size,2);
});

test('folder: verified unchanged editor media is not read again for metadata-only saves',async()=>{
 const {folder,mirror}=setup(),saved=await writeFolderFigure(folder,figure(),[draft()],null,mirror),f=folder.library.figures[0],v=f.videos[0],media=await folder.handle.getDirectoryHandle('media'),file=media.files.get(v.file);
 Object.defineProperty(file,'lastModified',{value:123456,writable:true});
 const loaded=await readFolderVideo(folder,f,v),slice=file.slice;
 file.slice=()=>{throw Error('Unnecessary second full-video read');};
 try{
  const result=await writeFolderFigure(folder,{...saved,status:'Sitzt'},[{...loaded,existing:true,confirmed:true}],saved.revision,mirror);
  assert.equal(result.status,'Sitzt');assert.equal(folder.library.figures[0].videos[0].modifiedAt,123456);
 }finally{file.slice=slice;}
});
test('folder: editor verification cannot hide an external media change before saving',async()=>{
 const {folder,mirror}=setup(),saved=await writeFolderFigure(folder,figure(),[draft()],null,mirror),f=folder.library.figures[0],v=f.videos[0],media=await folder.handle.getDirectoryHandle('media'),file=media.files.get(v.file);
 Object.defineProperty(file,'lastModified',{value:123456,writable:true});
 const loaded=await readFolderVideo(folder,f,v);file.lastModified++;
 await assert.rejects(writeFolderFigure(folder,{...saved,status:'Sitzt'},[{...loaded,existing:true,confirmed:true}],saved.revision,mirror),/während der Bearbeitung verändert/);
 assert.equal(folder.library.figures[0].status,'Am Üben');assert.equal(media.files.get(v.file),file);
});
