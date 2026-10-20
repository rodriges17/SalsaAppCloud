import { test, expect } from '@playwright/test';
import path from 'node:path';
async function start(page) { await page.goto('/pwa/'); await expect(page.getByRole('heading',{name:'Salsa Cloud',exact:true})).toBeVisible(); }
async function enablePicker(page, name) {
 await page.addInitScript(name=>{
  window.__denyFolder=sessionStorage.getItem('test-folder-prompt')==='1';
  window.showDirectoryPicker=async()=>{const root=await navigator.storage.getDirectory();return root.getDirectoryHandle(name,{create:true});};
  FileSystemDirectoryHandle.prototype.queryPermission=async()=>window.__denyFolder?'prompt':'granted';
  FileSystemDirectoryHandle.prototype.requestPermission=async()=>{if(window.__cancelFolder)return 'denied';window.__denyFolder=false;return 'granted';};
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
async function disk(page) {return page.evaluate(async()=>{const {storageSettings}=await import('/pwa/storage.js');const s=await storageSettings();const f=s.folders[0];return {folderId:f.id,figure:f.library.figures[0],count:f.library.figures.length};});}
test('unsupported browser offers no device-folder action',async({page})=>{
 await page.addInitScript(()=>{window.showDirectoryPicker=undefined;});await start(page);await page.locator('#infoButton').tap();
 await expect(page.getByRole('button',{name:'Geräteordner auswählen',exact:true})).toHaveCount(0);
 await expect(page.getByText('Geräteordner werden in diesem Browser nicht unterstützt.',{exact:false})).toBeVisible();
 await expect(page.getByRole('button',{name:'App-Speicher verwenden',exact:true})).toBeVisible();
 await page.locator('#closeInfo').tap();await seed(page,'Nur App');await page.reload();await page.getByRole('button',{name:'Optionen für Nur App',exact:true}).tap();await expect(page.getByRole('button',{name:'In Geräteordner übertragen',exact:true})).toHaveCount(0);
});
test('device folder persists real files, plays offline and can be restored after losing its registry',async({page,context,browserName},info)=>{
 test.skip(browserName!=='chromium','Native folder handle contract is exercised with Chromium OPFS; WebKit exposes the unsupported option.');
 await enablePicker(page,'restore-'+info.testId.replace(/\W/g,''));await start(page);await choose(page);await seed(page);
 await page.reload();await expect(page.getByRole('button',{name:'Ordner Ocho lernen',exact:true})).toBeVisible();
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
 await page.evaluate(async()=>{const {storageSettings}=await import('/pwa/storage.js');const f=(await storageSettings()).folders[0];await(await f.handle.getDirectoryHandle('media')).removeEntry(f.library.figures[0].videos[0].file);});
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
