import { test,expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createBackup,readBackup } from '../pwa/backup-format.js';
test.beforeEach(async({page})=>{await page.addInitScript(()=>{window.showSaveFilePicker=undefined;});});
async function start(page){await page.goto('/pwa/');await expect(page.getByRole('heading',{name:'Step by Step',exact:true})).toBeVisible();await expect(page.locator('html')).toHaveAttribute('data-offline-status','ready', { timeout: 30000 });}
async function seed(page){return page.evaluate(async()=>{const s=await import('/pwa/storage.js'),blob=await(await fetch('/web-tests/fixtures/clip.mp4')).blob();for(let i=0;i<2;i++)await s.saveFigure({id:'backup-source-'+i,title:'Backup '+i,description:'Beschreibung',status:'Am Üben',tags:['Salsa']},[{id:crypto.randomUUID(),name:'Führung',blob:blob.slice(0,blob.size,'video/mp4'),confirmed:true,duration:6,width:320,height:180}]);});}
async function backupFiles(split=false){const bytes=await readFile('web-tests/fixtures/clip.mp4');const source={figure:{id:'fixture-figure',title:'Backup Ocho',description:'Wiederhergestellt',tags:['Drehung'],status:'Sitzt',createdAt:1700000000000,videoIds:['v'],poster:null},records:[{name:'Führung',blob:new Blob([bytes],{type:'video/mp4'}),duration:6,width:320,height:180,poster:null}]};const result=await createBackup([source],split?{partBytes:32768,chunkBytes:4096}:{});return Promise.all(result.parts.map(async p=>({name:p.name,mimeType:'application/octet-stream',buffer:Buffer.from(await p.blob.arrayBuffer())})));}
async function restoreDialog(page){await page.locator('#infoButton').tap();await page.getByRole('button',{name:'Backup wiederherstellen',exact:true}).tap();await expect(page.locator('#backupDialog')).toBeVisible();}
test('backup UI produces a downloadable full archive and reports creation rather than saved files',async({page})=>{
 await start(page);await seed(page);await page.reload();await page.locator('#infoButton').tap();await page.getByRole('button',{name:'Vollständiges Backup erstellen',exact:true}).tap();await expect(page.locator('#backupBody')).toContainText('2 Figuren');await page.getByRole('button',{name:'Backup jetzt erstellen',exact:true}).tap();await expect(page.locator('#backupStatus')).toHaveText('Backup erstellt. Die Dateien sind zum Herunterladen bereit.');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Teil 1 von 1 herunterladen',exact:true}).tap();const file=await download;const archive=await readBackup([new Blob([await readFile(await file.path())])]);expect(archive.sources).toHaveLength(2);expect(archive.sources[0].figure.status).toBe('Am Üben');await expect(page.locator('#backupBody')).toContainText('Download angefordert.');await page.locator('#backupClose').tap();await expect(page.locator('#backupLastCreated')).toContainText('nicht das Speichern');
});
test('backup UI checks all parts before restoring and preserves learning state and creation date',async({page})=>{
 await page.addInitScript(()=>{window.showDirectoryPicker=undefined;});await start(page);await restoreDialog(page);const files=await backupFiles(true);expect(files.length).toBeGreaterThan(1);await page.locator('#backupBody input[type=file]').setInputFiles([files[0]]);await expect(page.locator('#backupStatus')).toContainText('Unvollständige Sicherung');expect(await page.evaluate(async()=>(await(await import('/pwa/storage.js')).listFigures()).length)).toBe(0);
 await page.locator('#backupBody input[type=file]').setInputFiles(files);await expect(page.locator('#backupStatus')).toHaveText('Alle Sicherungsdateien sind gültig.');await expect(page.getByRole('combobox',{name:'Ziel für die Wiederherstellung',exact:true}).locator('option')).toHaveCount(1);await page.getByRole('button',{name:'Wiederherstellung prüfen',exact:true}).tap();await expect(page.locator('#backupBody')).toContainText('1 neue Figuren');await page.getByRole('button',{name:'Auswahl wiederherstellen',exact:true}).tap();await page.locator('#confirmOK').tap();await expect(page.locator('#backupStatus')).toHaveText('Wiederherstellung abgeschlossen.');
 const figures=await page.evaluate(async()=>(await(await import('/pwa/storage.js')).listFigures()).map(f=>({title:f.title,status:f.status,createdAt:f.createdAt})));expect(figures).toEqual([{title:'Backup Ocho',status:'Sitzt',createdAt:1700000000000}]);await page.locator('#backupClose').tap();await page.locator('#closeInfoTop').tap();await page.getByRole('button',{name:'Backup Ocho lernen',exact:true}).tap();await expect(page.locator('#learningVideo')).toHaveJSProperty('videoWidth',320);
});
test('restore conflicts default to keep, identical figures skip and repeated restores do not duplicate data',async({page})=>{
 await start(page);await seed(page);const result=await page.evaluate(async()=>{
  const s=await import('/pwa/storage.js'),f=await import('/pwa/backup-format.js');const inventory=await s.inspectLocalBackup(),out=await s.exportLocalBackup(inventory.snapshot),archive=await f.readBackup(out.parts.map(p=>p.blob));const same=await s.planBackupRestore(archive);const skipped=await s.restoreBackupPlan(same,same.rows.map(r=>r.choice));const figure=(await s.listFigures())[0];await s.saveFigure({...figure,status:'Sitzt'},(await s.figureVideos(figure)).map(v=>({...v,existing:true,confirmed:true})),figure.revision);const plan=await s.planBackupRestore(archive);const conflict=plan.rows.find(r=>r.kind==='conflict');const defaults=plan.rows.map(r=>r.choice);await s.restoreBackupPlan(plan,defaults);const kept=(await s.listFigures()).find(f=>f.id===figure.id).status;const fresh=await s.planBackupRestore(archive);const choices=fresh.rows.map(r=>r.kind==='conflict'?'replace:'+r.candidates[0].id:'keep');await s.restoreBackupPlan(fresh,choices);const restored=await s.listFigures();const repeated=await s.planBackupRestore(archive);return {same:same.rows.map(r=>r.kind),skipped,conflict:!!conflict,defaults,kept,status:restored.find(f=>f.id===figure.id).status,count:restored.length,dates:restored.map(f=>f.createdAt).sort(),originalDates:archive.sources.map(s=>s.figure.createdAt).sort(),repeated:repeated.rows.map(r=>r.kind)};
 });expect(result.same).toEqual(['identical','identical']);expect(result.skipped).toBe(0);expect(result.conflict).toBe(true);expect(result.defaults).toEqual(['keep','keep']);expect(result.kept).toBe('Sitzt');expect(result.status).toBe('Am Üben');expect(result.count).toBe(2);expect(result.dates).toEqual(result.originalDates);expect(result.repeated).toEqual(['identical','identical']);
});
test('failed restore staging and cancellation preserve all old figures and cache bytes',async({page})=>{
 await start(page);await seed(page);const result=await page.evaluate(async()=>{
  const s=await import('/pwa/storage.js'),f=await import('/pwa/backup-format.js'),inventory=await s.inspectLocalBackup(),out=await s.exportLocalBackup(inventory.snapshot),archive=await f.readBackup(out.parts.map(p=>p.blob));let plan=await s.planBackupRestore(archive);const original=(await s.listFigures()).map(f=>[f.id,f.revision]);const cache=await caches.open(s.MEDIA_CACHE),before=(await cache.keys()).length,put=Cache.prototype.put;let calls=0,failed=false;
  Cache.prototype.put=function(...args){if(String(args[0]).includes('__private_media__')&&++calls===2)throw new DOMException('Test full','QuotaExceededError');return put.apply(this,args);};try{await s.restoreBackupPlan(plan,plan.rows.map(()=>'copy'));}catch{failed=true;}finally{Cache.prototype.put=put;}const afterFailure=(await cache.keys()).length;
  const controller=new AbortController();let aborted=false;try{await s.restoreBackupPlan(plan,plan.rows.map(()=>'copy'),{signal:controller.signal,progress:()=>controller.abort()});}catch(e){aborted=e.name==='AbortError';}return {failed,aborted,before,afterFailure,afterCancel:(await cache.keys()).length,original,after:(await s.listFigures()).map(f=>[f.id,f.revision])};
 });expect(result.failed).toBe(true);expect(result.aborted).toBe(true);expect(result.afterFailure).toBe(result.before);expect(result.afterCancel).toBe(result.before);expect(result.after).toEqual(result.original);
});
test('backup restore into a device folder preserves app figures and refuses incomplete folder sources',async({page,browserName})=>{
 test.skip(browserName!=='chromium','Native handle persistence is covered by Chromium OPFS.');
 await page.addInitScript(()=>{window.showDirectoryPicker=async()=>{const root=await navigator.storage.getDirectory();return root.getDirectoryHandle('backup-target',{create:true});};FileSystemDirectoryHandle.prototype.queryPermission=async()=> 'granted';FileSystemDirectoryHandle.prototype.requestPermission=async()=> 'granted';});
 await start(page);await seed(page);const result=await page.evaluate(async()=>{
  const s=await import('/pwa/storage.js'),f=await import('/pwa/backup-format.js'),inv=await s.inspectLocalBackup(),out=await s.exportLocalBackup(inv.snapshot),archive=await f.readBackup(out.parts.map(p=>p.blob));const folder=await s.chooseFolder();await s.connectFolder(folder);const plan=await s.planBackupRestore(archive,folder.id);await s.restoreBackupPlan(plan,plan.rows.map(r=>r.choice));const all=await s.listFigures(),again=await s.planBackupRestore(archive,folder.id);const db=await new Promise(resolve=>{const r=indexedDB.open(`salsa-folders:${new URL('./',location.href).pathname}:v1`);r.onsuccess=()=>resolve(r.result);});const target=await new Promise(resolve=>{const r=db.transaction('entries').objectStore('entries').get(folder.id);r.onsuccess=()=>resolve(r.result);});db.close();await(await target.handle.getDirectoryHandle('media')).removeEntry(target.library.figures[0].videos[0].file);let blocked='';try{await s.inspectLocalBackup();}catch(e){blocked=e.message;}return {count:all.length,app:all.filter(f=>!f.storageFolder).length,folder:all.filter(f=>f.storageFolder).length,kinds:again.rows.map(r=>r.kind),dates:all.filter(f=>f.storageFolder).map(f=>f.createdAt).sort(),originalDates:archive.sources.map(s=>s.figure.createdAt).sort(),blocked};
 });expect(result.count).toBe(4);expect(result.app).toBe(2);expect(result.folder).toBe(2);expect(result.kinds).toEqual(['identical','identical']);expect(result.dates).toEqual(result.originalDates);expect(result.blocked).toContain('Keine vollständige Sicherung möglich');
});


test('backup requests missing folder grants, retries denial and rechecks access before export',async({page,browserName})=>{
 test.skip(browserName!=='chromium','Native handles exercised through Chromium OPFS.');
 await page.addInitScript(()=>{
  window.__backupFolders=[];window.__backupDenied=[];window.__backupPromptCalls=0;window.__backupPickerCalls=0;
  window.showDirectoryPicker=async()=>{const root=await navigator.storage.getDirectory();return root.getDirectoryHandle('grant-'+(++window.__backupPickerCalls),{create:true});};
  const index=async handle=>{for(let i=0;i<window.__backupFolders.length;i++)if(await handle.isSameEntry(window.__backupFolders[i]))return i;return -1;};
  FileSystemDirectoryHandle.prototype.queryPermission=async function(){return window.__backupDenied[await index(this)]?'prompt':'granted';};
  FileSystemDirectoryHandle.prototype.requestPermission=async function(){window.__backupPromptCalls++;if(window.__backupCancel)return 'denied';window.__backupDenied[await index(this)]=false;return 'granted';};
 });
 await start(page);
 await page.evaluate(async()=>{
  const s=await import('/pwa/storage.js'),blob=await(await fetch('/web-tests/fixtures/clip.mp4')).blob();
  for(let i=0;i<3;i++){
   const folder=await s.chooseFolder();await s.connectFolder(folder);const db=await new Promise(resolve=>{const r=indexedDB.open(`salsa-folders:${new URL('./',location.href).pathname}:v1`);r.onsuccess=()=>resolve(r.result);});const stored=await new Promise(resolve=>{const r=db.transaction('entries').objectStore('entries').get(folder.id);r.onsuccess=()=>resolve(r.result);});db.close();window.__backupFolders.push(stored.handle);
   if(i<2)await s.saveFigure({id:'grant-source-'+i,title:'Grant '+i,description:'',status:'Sitzt',tags:[]},[{id:crypto.randomUUID(),name:'Video',blob:blob.slice(0,blob.size,'video/mp4'),confirmed:true,duration:6,width:320,height:180}]);
  }
  await s.setStorageFolder(null);window.__backupDenied=[true,true,true];window.__backupCancel=true;
 });
 await page.locator('#infoButton').tap();await page.getByRole('button',{name:'Vollständiges Backup erstellen',exact:true}).tap();
 const allow=page.locator('#backupBody').getByRole('button',{name:'Ordnerzugriff erlauben',exact:true});
 await expect(allow).toHaveCount(2);await expect(page.getByRole('button',{name:'Backup jetzt erstellen',exact:true})).toHaveCount(0);
 await allow.first().tap();await expect(page.locator('#backupBody')).not.toHaveAttribute('inert','');await expect(allow).toHaveCount(2);
 await page.evaluate(()=>{window.__backupCancel=false;});await allow.first().tap();await expect(allow).toHaveCount(1);await allow.first().tap();
 await expect(page.locator('#backupBody')).toContainText('2 Figuren');await expect(page.getByRole('button',{name:'Backup jetzt erstellen',exact:true})).toBeVisible();
 await page.evaluate(()=>{window.__backupDenied[0]=true;});await page.getByRole('button',{name:'Backup jetzt erstellen',exact:true}).tap();
 await expect(allow).toHaveCount(1);await expect(page.locator('#backupBody .backup-download')).toHaveCount(0);await allow.first().tap();
 await expect(page.locator('#backupStatus')).toHaveText('Backup erstellt. Die Dateien sind zum Herunterladen bereit.');
 expect(await page.evaluate(()=>window.__backupPromptCalls)).toBe(4);expect(await page.evaluate(()=>window.__backupPickerCalls)).toBe(3);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Teil 1 von 1 herunterladen',exact:true}).tap();
 const file=await download,archive=await readBackup([new Blob([await readFile(await file.path())])]);expect(archive.sources).toHaveLength(2);expect(archive.sources.every(s=>s.figure.status==='Sitzt')).toBe(true);
});

test('restore dialog keeps conflict choices after cancelling confirmation and applies the current selection',async({page})=>{
 await start(page);await restoreDialog(page);await page.locator('#backupBody input[type=file]').setInputFiles(await backupFiles());
 await expect(page.locator('#backupStatus')).toHaveText('Alle Sicherungsdateien sind gültig.');await page.getByRole('button',{name:'Wiederherstellung prüfen',exact:true}).tap();
 const choice=page.getByRole('combobox',{name:'Wiederherstellung für Backup Ocho',exact:true});await choice.selectOption('keep');
 await page.getByRole('button',{name:'Auswahl wiederherstellen',exact:true}).tap();await expect(page.locator('#confirmMessage')).toContainText('0 Figuren übernehmen');await page.locator('#confirmCancel').tap();
 await expect(choice).toHaveValue('keep');await choice.selectOption('add');await page.getByRole('button',{name:'Auswahl wiederherstellen',exact:true}).tap();
 await expect(page.locator('#confirmMessage')).toContainText('1 Figuren übernehmen');await page.locator('#confirmOK').tap();await expect(page.locator('#backupStatus')).toHaveText('Wiederherstellung abgeschlossen.');
 expect(await page.evaluate(async()=>(await(await import('/pwa/storage.js')).listFigures()).length)).toBe(1);
});

test('app staging rejects corrupt copies during save and restore without changing old media or metadata',async({page})=>{
 await start(page);await seed(page);
 const result=await page.evaluate(async()=>{
  const s=await import('/pwa/storage.js'),f=await import('/pwa/backup-format.js');
  const inventory=await s.inspectLocalBackup(),out=await s.exportLocalBackup(inventory.snapshot),archive=await f.readBackup(out.parts.map(p=>p.blob));
  const originals=await s.listFigures(),old=originals[0],records=await s.figureVideos(old),cache=await caches.open(s.MEDIA_CACHE),keys=(await cache.keys()).map(r=>r.url).sort();
  const snapshot=JSON.stringify(originals.map(f=>[f.id,f.revision,f.title]));
  const match=Cache.prototype.match;Cache.prototype.match=async function(request,...args){
   const response=await match.call(this,request,...args),url=typeof request==='string'?request:request.url;
   if(response&&url.includes('__private_media__')&&!keys.includes(url)){
    const bytes=new Uint8Array(await response.arrayBuffer());bytes[0]^=1;return new Response(bytes,{headers:{'Content-Type':'video/mp4'}});
   }
   return response;
  };
  let saveError='',restoreError='';
  try{
   try{await s.saveFigure({...old,title:'Must not commit'},records.map(v=>({...v,id:crypto.randomUUID(),existing:false,confirmed:true})),old.revision);}catch(e){saveError=e.message;}
   const plan=await s.planBackupRestore(archive);try{await s.restoreBackupPlan(plan,plan.rows.map(()=>'copy'));}catch(e){restoreError=e.message;}
  }finally{Cache.prototype.match=match;}
  const after=await s.listFigures(),verified=await s.figureVideos(after.find(f=>f.id===old.id));
  const db=await s.database(),jobs=await new Promise(resolve=>{const r=db.transaction('imports').objectStore('imports').getAll();r.onsuccess=()=>resolve(r.result.length);});
  return {saveError,restoreError,snapshot,after:JSON.stringify(after.map(f=>[f.id,f.revision,f.title])),keys,afterKeys:(await cache.keys()).map(r=>r.url).sort(),sameBytes:await(await import('/pwa/package.js')).checksum(records[0].blob)===await(await import('/pwa/package.js')).checksum(verified[0].blob),jobs};
 });
 expect(result.saveError).toContain('Videokopie');expect(result.restoreError).toContain('Videokopie');expect(result.after).toBe(result.snapshot);expect(result.afterKeys).toEqual(result.keys);expect(result.sameBytes).toBe(true);expect(result.jobs).toBe(0);
});


test('backup hand-off keeps prepared parts on failure, blocks duplicate clicks and starts the picker in its click',async({page})=>{
 await start(page);await seed(page);await page.locator('#infoButton').click();
 await page.getByRole('button',{name:'Vollständiges Backup erstellen',exact:true}).click();
 await page.getByRole('button',{name:'Backup jetzt erstellen',exact:true}).click();
 const button=page.getByRole('button',{name:'Teil 1 von 1 herunterladen',exact:true});await expect(button).toBeVisible();
 await page.evaluate(()=>{
  window.__pickerCalls=0;window.__writeNames=[];
  window.showSaveFilePicker=options=>{
   window.__pickerCalls++;window.__pickerActive=navigator.userActivation.isActive;window.__writeNames.push(options.suggestedName);
   return new Promise((resolve,reject)=>{window.__pickerReject=reject;window.__pickerResolve=()=>resolve({createWritable:async()=>({write:async()=>{},close:async()=>{}})});});
  };
 });
 await button.click();await expect(button).toBeDisabled();await expect(page.locator('#backupClose')).toBeDisabled();
 await expect(page.locator('#backupBody .transfer-status')).toHaveClass(/is-busy/);
 expect(await page.evaluate(()=>window.__pickerActive)).toBe(true);
 await page.evaluate(()=>window.__pickerReject(new Error('Speicher voll')));await expect(button).toBeEnabled();
 await expect(page.locator('#backupBody .transfer-status')).toContainText('Speicher voll');
 await button.click();await page.evaluate(()=>window.__pickerReject(new DOMException('Abbruch','AbortError')));await expect(button).toBeEnabled();
 await expect(page.locator('#backupBody .transfer-status')).toContainText('abgebrochen');
 await button.click();await page.evaluate(()=>window.__pickerResolve());await expect(button).toBeEnabled();
 await expect(page.locator('#backupBody .transfer-status')).toHaveText('Datei gespeichert.');
 expect(await page.evaluate(()=>window.__pickerCalls)).toBe(3);expect(await page.evaluate(()=>new Set(window.__writeNames).size)).toBe(1);
});
