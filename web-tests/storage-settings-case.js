export async function runStorageSettingsCase(page, { root, native = false, browserName = 'chromium' }) {
 const assert = (value, message) => { if (!value) throw new Error(message); };
  const controls=page.locator('#deviceStorageControls');
  await page.locator('#infoButton').click();
  const appActive=controls.getByRole('button',{name:'✓ App-Speicher für neue Figuren aktiv',exact:true});
  await appActive.waitFor();assert(await appActive.isDisabled(),'Active app storage must be confirmed, not offered as a new action');
  assert(await appActive.evaluate(e=>getComputedStyle(e).opacity)==='1','Confirmed storage status is dimmed');
  await page.locator('#closeInfoTop').click();
  if(!native&&browserName!=='chromium')return;
  await page.evaluate(async({root,native})=>{
   if(!native){
    window.testStorageDenied=false;window.storageGrantRequests=0;
    window.showDirectoryPicker=async()=>await(await navigator.storage.getDirectory()).getDirectoryHandle('settings-contract',{create:true});
    FileSystemDirectoryHandle.prototype.queryPermission=async()=>window.testStorageDenied?'prompt':'granted';
    FileSystemDirectoryHandle.prototype.requestPermission=async()=>{window.storageGrantRequests++;window.testStorageDenied=false;return 'granted';};
   }
   const s=await import(root+'storage.js');await s.connectFolder(await s.chooseFolder());
   if(!native)window.storageGrantRequests=0;
  },{root,native});
  await page.locator('#infoButton').click();
  const allowed=controls.getByRole('button',{name:'✓ Ordnerzugriff erlaubt',exact:true});
  const active=controls.getByRole('button',{name:'✓ Für neue Figuren aktiv',exact:true});
  await allowed.waitFor();await active.waitFor();
  assert(await allowed.isDisabled()&&await active.isDisabled(),'Already granted/active folder actions must be confirmed');
  assert((await controls.innerText()).includes('verbunden'),'Remembered folder has no connection indicator');
  assert(await controls.getByRole('button',{name:'Weiteren Geräteordner auswählen',exact:true}).isEnabled(),'Changing or adding a folder must remain possible');
  if(!native)assert(await page.evaluate(()=>window.storageGrantRequests)===0,'Opening settings prompted for permission');
  await controls.getByRole('button',{name:'App-Speicher verwenden',exact:true}).click();await appActive.waitFor();
  assert(await controls.getByRole('button',{name:'Für neue Figuren verwenden',exact:true}).isEnabled(),'Inactive folder must offer activation');
  await controls.getByRole('button',{name:'Für neue Figuren verwenden',exact:true}).click();await active.waitFor();
  await page.locator('#closeInfoTop').click();
  await page.evaluate(native=>{if(native)localStorage.setItem('deny-folder-access','yes');else window.testStorageDenied=true;},native);
  await page.locator('#infoButton').click();
  const grant=controls.getByRole('button',{name:'Ordnerzugriff erlauben',exact:true});await grant.waitFor();
  assert(await grant.isEnabled(),'Revoked grant must offer an explicit action');
  assert(await active.count()===0&&await allowed.count()===0,'Revoked grant was presented as available');
  assert(await controls.getByRole('button',{name:'Für neue Figuren ausgewählt',exact:true}).isDisabled(),'Selected destination must remain visible without falsely promising access');
  assert((await controls.innerText()).includes('Bitte den Ordnerzugriff erlauben'),'Missing grant needs an explanation');
  if(native)await page.evaluate(()=>localStorage.removeItem('deny-folder-access'));
  await grant.click();await allowed.waitFor();await active.waitFor();
  const unchanged=await page.evaluate(async root=>{const s=await import(root+'storage.js'),settings=await s.storageSettings();return settings.activeFolder===settings.folders[0].id;},root);
  assert(unchanged,'Granting permission unexpectedly changed the selected folder');
}
