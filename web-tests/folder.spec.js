import { test, expect } from '@playwright/test';
import path from 'node:path';
async function start(page) { await page.goto('/pwa/'); await expect(page.getByRole('heading',{name:'Step by Step',exact:true})).toBeVisible(); }
async function enablePicker(page, name) {
 await page.addInitScript(name=>{
  window.registeredFolder=async()=>{const name=`salsa-folders:${new URL('./',location.href).pathname}:v1`;const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{return await new Promise((resolve,reject)=>{const r=db.transaction('entries').objectStore('entries').getAll();r.onsuccess=()=>resolve(r.result.find(f=>f.id!=='config'));r.onerror=()=>reject(r.error);});}finally{db.close();}};
  window.__denyFolder=sessionStorage.getItem('test-folder-prompt')==='1';
  window.showDirectoryPicker=async()=>{const root=await navigator.storage.getDirectory();return root.getDirectoryHandle(name,{create:true});};
  FileSystemDirectoryHandle.prototype.queryPermission=async()=>window.__denyFolder?'prompt':'granted';
  FileSystemDirectoryHandle.prototype.requestPermission=async()=>{window.__folderActivation=navigator.userActivation.isActive;if(window.__cancelFolder)return 'denied';window.__denyFolder=false;return 'granted';};
 },name);
}
async function choose(page) {
 await page.locator('#infoButton').tap();await page.getByRole('button',{name:'Geräteordner auswählen',exact:true}).tap();
 await expect(page.locator('#confirmDialog')).toBeVisible();await page.locator('#confirmOK').tap();await expect(page.locator('#deviceStorageStatus')).toHaveText('Gespeichert.');await page.locator('#closeInfo').tap();
}
async function seed(page, title='Ordner Ocho') {
 return page.evaluate(async title=>{
  const {saveFigure}=await import('/pwa/storage.js'),blob=await(await fetch('/web-tests/fixtures/clip.mp4')).blob();
  return saveFigure({id:crypto.randomUUID(),title,description:'Sicher wiederherstellen',tags:['Salsa'],status:'Am Üben'},[{id:crypto.randomUUID(),name:'Führung',blob:blob.slice(0,blob.size,'video/mp4'),duration:6,width:320,height:180,confirmed:true,existing:false}]);
 },title);
}
async function disk(page) {return page.evaluate(async()=>{const f=await registeredFolder();return {folderId:f.id,figure:f.library.figures[0],count:f.library.figures.length};});}
test('unsupported browser offers no device-folder action',async({page})=>{
 await page.addInitScript(()=>{window.showDirectoryPicker=undefined;});await start(page);await page.locator('#infoButton').tap();
 await expect(page.getByRole('button',{name:'Geräteordner auswählen',exact:true})).toHaveCount(0);
 await expect(page.getByText('Geräteordner werden in diesem Browser nicht unterstützt.',{exact:false})).toBeVisible();
 await expect(page.locator('#deviceStorageControls [data-storage-target=app]')).toBeDisabled();
 await page.locator('#closeInfo').tap();await seed(page,'Nur App');await page.reload();await page.getByRole('button',{name:'Optionen für Nur App',exact:true}).tap();await expect(page.getByRole('button',{name:'In Geräteordner übertragen',exact:true})).toHaveCount(0);
});
test('device folder persists real files, plays offline and can be restored after losing its registry',async({page,context,browserName},info)=>{
 test.skip(browserName!=='chromium','Native folder handle contract is exercised with Chromium OPFS; WebKit exposes the unsupported option.');
 await enablePicker(page,'restore-'+info.testId.replace(/\W/g,''));await start(page);await choose(page);await seed(page);
 await page.reload();await expect(page.getByRole('button',{name:'Ordner Ocho lernen',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Optionen für Ordner Ocho',exact:true}).tap();await page.getByRole('button',{name:'Löschen',exact:true}).tap();
 await expect(page.locator('#confirmMessage')).toContainText('aus dem verknüpften Geräteordner gelöscht');
 await expect(page.locator('#confirmMessage')).toContainText('ursprünglichen Importdateien bleiben erhalten');
 await page.locator('#confirmCancel').tap();
 const data=await disk(page);expect(data.figure.status).toBe('Am Üben');expect(data.figure.tags).toEqual(['Salsa']);
 expect(await page.evaluate(async()=>{const {MEDIA_CACHE}=await import('/pwa/storage.js');return (await(await caches.open(MEDIA_CACHE)).keys()).length;})).toBe(0);
 await context.setOffline(true);await page.getByRole('button',{name:'Ordner Ocho lernen',exact:true}).tap();await expect(page.locator('#learningVideo')).toHaveJSProperty('videoWidth',320);await page.locator('#playerBack').tap();await context.setOffline(false);
 await page.evaluate(async()=>{const name=`salsa-folders:${new URL('/pwa/',location.href).pathname}:v1`;const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});await new Promise((resolve,reject)=>{const t=db.transaction('entries','readwrite');t.objectStore('entries').clear();t.oncomplete=resolve;t.onabort=()=>reject(t.error);});db.close();});
 await page.reload();await expect(page.getByRole('button',{name:'Ordner Ocho lernen',exact:true})).toHaveCount(0);await choose(page);
 await expect(page.getByRole('button',{name:'Ordner Ocho lernen',exact:true})).toBeVisible();expect((await disk(page)).figure.status).toBe('Am Üben');
});
test('revoked access keeps figure metadata and explicit reconnect restores access',async({page,browserName},info)=>{
 test.skip(browserName!=='chromium');await enablePicker(page,'permission-'+info.testId.replace(/\W/g,''));await start(page);await choose(page);await seed(page);
 await page.evaluate(()=>sessionStorage.setItem('test-folder-prompt','1'));await page.reload();
 await expect(page.getByText('Ordner gespeichert – Zugriff erneut erlauben',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Ordner Ocho lernen',exact:true}).tap();await expect(page.locator('#playerScreen')).not.toBeVisible();
 const before=await disk(page);
 await page.evaluate(()=>{window.__cancelFolder=true;});
 await page.getByRole('button',{name:'Ordnerzugriff erlauben für Ordner Ocho',exact:true}).tap();
 await expect(page.getByRole('button',{name:'Ordnerzugriff erlauben für Ordner Ocho',exact:true})).toBeEnabled();
 await expect(page.getByText('Ordner gespeichert – Zugriff erneut erlauben',{exact:true})).toBeVisible();
 await page.evaluate(()=>{window.__cancelFolder=false;});
 await page.getByRole('button',{name:'Ordnerzugriff erlauben für Ordner Ocho',exact:true}).tap();
 await expect(page.getByText('Ordner gespeichert – Zugriff erneut erlauben',{exact:true})).toHaveCount(0);
 expect((await disk(page)).folderId).toBe(before.folderId);
 expect(await page.evaluate(async()=>{const {storageSettings}=await import('/pwa/storage.js');return (await storageSettings()).activeFolder;})).toBe(before.folderId);
 await page.getByRole('button',{name:'Ordner Ocho lernen',exact:true}).tap();await expect(page.locator('#learningVideo')).toHaveJSProperty('videoWidth',320);
});
test('missing folder video can be repaired through confirmed replacement without losing learning data',async({page,browserName},info)=>{
 test.skip(browserName!=='chromium');await enablePicker(page,'repair-'+info.testId.replace(/\W/g,''));await start(page);await choose(page);await seed(page);
 await page.evaluate(async()=>{const f=await registeredFolder();await(await f.handle.getDirectoryHandle('media')).removeEntry(f.library.figures[0].videos[0].file);});
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByRole('button',{name:'Optionen für Ordner Ocho',exact:true}).tap();await page.getByRole('button',{name:'Bearbeiten',exact:true}).tap();
 await expect(page.locator('#figureTitle')).toHaveValue('Ordner Ocho');await expect(page.locator('#figureStatus')).toHaveValue('Am Üben');await expect(page.locator('#saveFigure')).toBeDisabled();
 const picker=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Ersetzen',exact:true}).tap();await(await picker).setFiles(path.resolve('web-tests/fixtures/clip.mp4'));
 await expect(page.locator('#acceptVideo')).toBeEnabled();await page.locator('#acceptVideo').tap();await page.locator('#saveFigure').tap();await expect(page.locator('#editor')).not.toBeVisible();
 expect((await disk(page)).figure.status).toBe('Am Üben');await page.getByRole('button',{name:'Ordner Ocho lernen',exact:true}).tap();await expect(page.locator('#learningVideo')).toHaveJSProperty('videoWidth',320);
});
test('explicit transfer in both directions verifies copy before removing the old copy',async({page,browserName},info)=>{
 test.skip(browserName!=='chromium');await enablePicker(page,'transfer-'+info.testId.replace(/\W/g,''));await start(page);await seed(page,'Umzug');await page.reload();await choose(page);
 async function move(label){await page.getByRole('button',{name:'Optionen für Umzug',exact:true}).tap();await page.getByRole('button',{name:label,exact:true}).tap();await page.locator('#confirmOK').tap();await expect(page.locator('#confirmTitle')).toHaveText('Kopie erfolgreich geprüft');await page.locator('#confirmOK').tap();await expect(page.locator('#toast')).toHaveText('Übertragung abgeschlossen.');}
 await move('In Geräteordner übertragen');expect((await disk(page)).count).toBe(1);
 expect(await page.evaluate(async()=>{const {database}=await import('/pwa/storage.js');const db=await database();return new Promise(r=>{const q=db.transaction('figures').objectStore('figures').count();q.onsuccess=()=>r(q.result);});})).toBe(0);
 await move('In App-Speicher übertragen');expect((await disk(page)).count).toBe(0);await page.reload();await page.getByRole('button',{name:'Umzug lernen',exact:true}).tap();await expect(page.locator('#learningVideo')).toHaveJSProperty('videoWidth',320);
});


test('all folder grant views preserve files, pending cleanup and the selected import target',async({page,browserName},info)=>{
 test.skip(browserName!=='chromium');await enablePicker(page,'grant-contract-'+info.testId.replace(/\W/g,''));await start(page);await choose(page);await seed(page);
 const before=await page.evaluate(async()=>{
  const s=await import('/pwa/storage.js');await s.setStorageFolder(null);
  const f=await registeredFolder(),library=JSON.parse(await(await(await f.handle.getFileHandle('library.json')).getFile()).text());
  const orphan=crypto.randomUUID()+'.mp4',media=await f.handle.getDirectoryHandle('media');let w=await(await media.getFileHandle(orphan,{create:true})).createWritable();await w.write('pending cleanup bytes');await w.close();
  library.garbage.push(orphan);w=await(await f.handle.getFileHandle('library.json')).createWritable();await w.write(JSON.stringify(library));await w.close();
  await s.listFigures();window.__denyFolder=true;
  window.__grantWrites=0;window.__grantDeletes=0;
  const write=FileSystemFileHandle.prototype.createWritable,remove=FileSystemDirectoryHandle.prototype.removeEntry;
  FileSystemFileHandle.prototype.createWritable=function(...args){window.__grantWrites++;return write.apply(this,args);};
  FileSystemDirectoryHandle.prototype.removeEntry=function(...args){window.__grantDeletes++;return remove.apply(this,args);};
  return {catalog:JSON.stringify(library),orphan};
 });
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await page.getByRole('button',{name:'Ordnerzugriff erlauben für Ordner Ocho',exact:true}).tap();
 await expect(page.getByText('Ordner gespeichert – Zugriff erneut erlauben',{exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>window.__folderActivation)).toBe(true);
 await page.evaluate(()=>{window.__denyFolder=true;});await page.locator('#infoButton').tap();
 await page.locator('#deviceStorageControls').getByRole('button',{name:'Ordnerzugriff erlauben',exact:true}).tap();
 await expect(page.locator('#deviceStorageStatus')).toHaveText('Gespeichert.');expect(await page.evaluate(()=>window.__folderActivation)).toBe(true);
 await page.evaluate(()=>{window.__denyFolder=true;});await page.getByRole('button',{name:'Vollständiges Backup erstellen',exact:true}).tap();
 await page.locator('#backupBody').getByRole('button',{name:'Ordnerzugriff erlauben',exact:true}).tap();
 await expect(page.getByRole('button',{name:'Backup jetzt erstellen',exact:true})).toBeVisible();expect(await page.evaluate(()=>window.__folderActivation)).toBe(true);
 const after=await page.evaluate(async()=>{
  const s=await import('/pwa/storage.js'),settings=await s.storageSettings(),f=await registeredFolder();
  return {catalog:await(await(await f.handle.getFileHandle('library.json')).getFile()).text(),writes:window.__grantWrites,deletes:window.__grantDeletes,settings,files:await Array.fromAsync((await f.handle.getDirectoryHandle('media')).keys())};
 });
 expect(after.catalog).toBe(before.catalog);expect(after.writes).toBe(0);expect(after.deletes).toBe(0);expect(after.files).toContain(before.orphan);expect(after.settings.activeFolder).toBeNull();
 expect(after.settings.folders[0]).toMatchObject({figureCount:1,pendingCleanup:true});expect(after.settings.folders[0]).not.toHaveProperty('handle');expect(after.settings.folders[0]).not.toHaveProperty('library');
});

test('folder access rejects a replaced library without accepting its catalog',async({page,browserName},info)=>{
 test.skip(browserName!=='chromium');await enablePicker(page,'identity-'+info.testId.replace(/\W/g,''));await start(page);await choose(page);await seed(page);
 const result=await page.evaluate(async()=>{
  const s=await import('/pwa/storage.js'),f=await registeredFolder(),file=await f.handle.getFileHandle('library.json');
  const library=JSON.parse(await(await file.getFile()).text()),other={...library,id:'different-library'};
  const writer=await file.createWritable();await writer.write(JSON.stringify(other));await writer.close();
  let message='';try{await s.allowFolderAccess(f.id);}catch(e){message=e.message;}
  const stored=await registeredFolder();return {message,original:library.id,mirrored:stored.library.id,settings:await s.storageSettings()};
 });
 expect(result.message).toContain('andere Bibliothek');expect(result.mirrored).toBe(result.original);expect(result.settings.activeFolder).toBe(result.original);
});

test('folder player loads selected media only, ignores late reads and rechecks changed files',async({page,browserName},info)=>{
 test.skip(browserName!=='chromium','Folder handles are available in Chromium.');
 await enablePicker(page,'lazy-'+info.testId.replace(/\W/g,''));await start(page);await choose(page);
 await page.evaluate(async()=>{
  const {saveFigure}=await import('/pwa/storage.js');const blob=await(await fetch('/web-tests/fixtures/clip.mp4')).blob();
  return saveFigure({id:crypto.randomUUID(),title:'Lazy Ocho',description:'',status:'Neu',tags:[]},[1,2].map(i=>({id:crypto.randomUUID(),name:'Video '+i,blob:blob.slice(0,blob.size,'video/mp4'),duration:6,confirmed:true})));
 });
 await page.reload();await expect(page.getByRole('button',{name:'Lazy Ocho lernen',exact:true})).toBeVisible();
 await page.evaluate(()=>{
  const original=FileSystemFileHandle.prototype.getFile;window.mediaReads=[];window.releaseMedia=[];window.holdMedia=true;
  FileSystemFileHandle.prototype.getFile=async function(){
   if(/\.(mp4|mov|m4v|webm|ogv|media)$/i.test(this.name)){window.mediaReads.push(this.name);if(window.holdMedia)await new Promise(r=>window.releaseMedia.push(r));}
   return original.call(this);
  };
 });
 await page.getByRole('button',{name:'Lazy Ocho lernen',exact:true}).tap();
 await expect(page.locator('#playerScreen')).toBeVisible();
 await page.waitForFunction(()=>window.mediaReads.length===1);
 await page.locator('#playerVideoChoice').selectOption('1');await page.waitForFunction(()=>window.mediaReads.length===2);
 await page.evaluate(()=>window.releaseMedia[1]());await page.waitForFunction(()=>document.querySelector('#learningVideo').readyState>=2);
 const second=await page.locator('#learningVideo').getAttribute('src');
 await page.evaluate(()=>window.releaseMedia[0]());await page.waitForTimeout(100);
 await expect(page.locator('#learningVideo')).toHaveAttribute('src',second);
 await page.locator('#playerVideoChoice').selectOption('0');await page.waitForFunction(()=>document.querySelector('#learningVideo').readyState>=2);
 expect(await page.evaluate(()=>window.mediaReads.length)).toBe(2);
 await page.locator('#playerBack').tap();await expect(page.locator('#playerScreen')).toBeHidden();
 await page.evaluate(async()=>{
  window.holdMedia=false;const folder=await registeredFolder();const media=await folder.handle.getDirectoryHandle('media');
  const handle=await media.getFileHandle(window.mediaReads[0]);const bytes=new Uint8Array(await(await handle.getFile()).arrayBuffer());bytes[bytes.length-1]^=1;
  const writer=await handle.createWritable();await writer.write(bytes);await writer.close();
 });
 await page.getByRole('button',{name:'Lazy Ocho lernen',exact:true}).tap();
 await expect(page.locator('#playerError')).toContainText('verändert');
 await expect(page.locator('#learningVideo')).not.toHaveAttribute('src',/.+/);
});

test('folder editor appears before verification and ignores completion after back or reopen',async({page,browserName},info)=>{
 test.skip(browserName!=='chromium');
 await enablePicker(page,'editor-loading-'+info.testId.replace(/\W/g,''));await start(page);await choose(page);await seed(page);await page.reload();
 await expect(page.getByRole('button',{name:'Ordner Ocho lernen',exact:true})).toBeVisible();
 await page.evaluate(()=>{const original=FileSystemFileHandle.prototype.getFile;window.releaseEditorMedia=[];
  FileSystemFileHandle.prototype.getFile=async function(){if(/\.(mp4|mov|m4v|webm|ogv|media)$/i.test(this.name))await new Promise(r=>window.releaseEditorMedia.push(r));return original.call(this);};
 });
 async function edit(){await page.getByRole('button',{name:'Optionen für Ordner Ocho',exact:true}).tap();await page.getByRole('button',{name:'Bearbeiten',exact:true}).tap();}
 await edit();await expect(page.locator('#editor')).toBeVisible();await expect(page.locator('#editorLoading')).toBeVisible();
 await expect(page.locator('#editorLoading')).toHaveClass(/is-busy/);await expect(page.locator('#editorLoading')).toContainText('geladen und geprüft');
 await expect(page.locator('#figureTitle')).toHaveValue('Ordner Ocho');await expect(page.locator('#figureTitle')).toBeDisabled();await expect(page.locator('#saveFigure')).toBeDisabled();await expect(page.locator('#editorBack')).toBeEnabled();
 await page.waitForFunction(()=>window.releaseEditorMedia.length===1);
 await page.screenshot({path:info.outputPath('editor-loading.png')});
 await page.locator('#editorBack').tap();await expect(page.locator('#editor')).toBeHidden();
 await edit();await page.waitForFunction(()=>window.releaseEditorMedia.length===2);
 await page.evaluate(()=>window.releaseEditorMedia[0]());await expect(page.locator('#editorLoading')).toBeVisible();await expect(page.locator('#saveFigure')).toBeDisabled();
 await page.evaluate(()=>window.releaseEditorMedia[1]());await expect(page.locator('#editorLoading')).toBeHidden();await expect(page.locator('#figureTitle')).toBeEnabled();await expect(page.locator('#saveFigure')).toBeEnabled();
 await expect(page.locator('#draftVideos .draft-card')).toHaveCount(1);
 await page.locator('#editorBack').tap();await expect(page.locator('#confirmDialog')).toBeHidden();await expect(page.locator('#editor')).toBeHidden();
});
