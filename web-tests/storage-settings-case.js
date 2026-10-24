export async function runStorageSettingsCase(page, { root, native = false, browserName = 'chromium' }) {
 const assert = (value, message) => { if (!value) throw new Error(message); };
 const controls=page.locator('#deviceStorageControls'), app=controls.locator('[data-storage-target=app]');
 const current=()=>page.evaluate(async root=>(await(await import(root+'storage.js')).storageSettings()).activeFolder,root);
 const chosen=async target=>{await page.waitForFunction(target=>document.querySelector(`[data-storage-target="${target}"]`)?.getAttribute('aria-pressed')==='true',target);};
 await page.locator('#infoButton').click();await app.waitFor();
 assert(await app.getAttribute('aria-pressed')==='true'&&await app.isDisabled(),'The active app destination is not clearly selected');
 assert(await app.evaluate(e=>getComputedStyle(e).opacity)==='1','Selected storage is dimmed');
 await page.locator('#closeInfoTop').click();
 if(!native&&browserName!=='chromium')return;
 const configure=()=>{
  window.testStorageDenied=false;window.testStorageCancel=false;window.storageGrantRequests=0;
  window.showDirectoryPicker=async()=>await(await navigator.storage.getDirectory()).getDirectoryHandle('settings-contract',{create:true});
  FileSystemDirectoryHandle.prototype.queryPermission=async()=>window.testStorageDenied?'prompt':'granted';
  FileSystemDirectoryHandle.prototype.requestPermission=async()=>{window.storageGrantRequests++;window.storageGrantActive=navigator.userActivation.isActive;if(window.testStorageCancel)return 'denied';window.testStorageDenied=false;return 'granted';};
 };
 if(!native){await page.addInitScript(configure);await page.evaluate(configure);}
 const folder=await page.evaluate(async root=>{const s=await import(root+'storage.js');await s.connectFolder(await s.chooseFolder());return(await s.storageSettings()).activeFolder;},root);
 const target=controls.locator(`[data-storage-target="${folder}"]`), status=controls.locator(`[data-folder-id="${folder}"] .storage-access-state`);
 await page.locator('#infoButton').click();await chosen(folder);
 assert((await status.innerText()).includes('Zugriff erlaubt'),'Granted permission must be visible');
 if(!native)assert(await page.evaluate(()=>window.storageGrantRequests)===0,'Opening settings prompted for permission');
 // A choice is not applied while the confirmation is open or after cancellation.
 await app.click();await page.locator('#confirmDialog').waitFor();
 assert(await current()===folder,'Destination changed before confirmation');
 assert(await target.getAttribute('aria-pressed')==='true'&&await app.getAttribute('aria-pressed')==='false','The UI switched optimistically before confirmation');
 assert((await page.locator('#confirmMessage').innerText()).includes('Vorhandene Figuren und Videos bleiben'),'Confirmation does not explain the scope');
 await page.locator('#confirmCancel').click();assert(await current()===folder,'Cancel changed the destination');
 await app.click();await page.locator('#confirmOK').click();await chosen('app');assert(await current()===null,'Confirmed app destination was not saved');
 await target.click();await page.locator('#confirmDialog').waitFor();
 if(native)await page.evaluate(()=>AndroidAppUI.back());else await page.keyboard.press('Escape');
 assert(await current()===null,'Back/Escape changed the destination');await chosen('app');
 // A refused permission must leave the old default in place, even after confirming.
 await page.evaluate(native=>{if(native)localStorage.setItem('deny-folder-access','yes');else{window.testStorageDenied=true;window.testStorageCancel=true;}},native);
 await target.click();await page.locator('#confirmDialog').waitFor();assert(await current()===null,'Folder changed before confirmation');
 await page.locator('#confirmOK').click();
 await page.waitForFunction(()=>document.querySelector('#deviceStorageStatus').textContent.includes('Zugriff erneut erlauben'));
 assert(await current()===null,'Denied permission changed the default');await chosen('app');
 await page.evaluate(native=>{if(native)localStorage.removeItem('deny-folder-access');else window.testStorageCancel=false;},native);
 await target.click();await page.locator('#confirmOK').click();await chosen(folder);assert(await current()===folder,'Confirmed folder destination was not saved');
 if(!native)assert(await page.evaluate(()=>window.storageGrantActive)===true,'Permission request lost the confirmation click activation');
 await page.locator('#closeInfoTop').click();
 await page.evaluate(native=>{if(native)localStorage.setItem('deny-folder-access','yes');else window.testStorageDenied=true;},native);
 await page.locator('#infoButton').click();const grant=controls.getByRole('button',{name:'Ordnerzugriff erlauben',exact:true});await grant.waitFor();
 assert(await target.getAttribute('aria-pressed')==='true','A revoked grant silently changed the selected destination');
 assert((await target.innerText()).includes('Zugriff erforderlich'),'Selected but inaccessible folder was presented as ready');
 if(native)await page.evaluate(()=>localStorage.removeItem('deny-folder-access'));
 await grant.click();await page.waitForFunction(()=>document.querySelector('.storage-access-state')?.textContent.includes('Zugriff erlaubt'));
 assert(await current()===folder,'Granting permission changed the selected destination');
 assert(!await page.locator('#confirmDialog').isVisible(),'Restoring access unexpectedly asks to change the destination');
 await page.locator('#closeInfoTop').click();await page.reload();await page.waitForFunction(()=>document.querySelector('#infoButton')?.onclick);
 await page.locator('#infoButton').click();await chosen(folder);assert(await current()===folder,'Confirmed selection did not survive restart');
}
