// The same behavior contract runs against the PWA and the bundled Android UI.
export const PARITY_CASES = ['menus-and-short-windows', 'cloud-repair-missing', 'cloud-repair-modified', 'player-orientation-and-exit', 'csp-and-storage-styles'];
export async function runParityCase(page, { root, fixture, native = false, scenario, consoleErrors = [] }) {
 const assert = (value, message) => { if (!value) throw new Error(message); };
 const frame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
 await page.setViewportSize({width:390,height:844}); await frame();
 await page.route('**/functions/v1/cloud',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({me:null,libraries:[],own_figures:[]})}));
 const seed = async (count=1,fingerprint=null) => {
  await page.evaluate(async ({root,fixture,count,fingerprint})=>{
   const s=await import(root+'storage.js'),blob=await(await fetch(fixture)).blob();
   for(let i=0;i<count;i++)await s.saveFigure({id:'parity-'+i,title:i?'Figur '+i:'Cloud Drehung',description:'Beschreibung zum Üben',tags:[],status:'Sitzt',importFingerprint:fingerprint},[{id:'parity-video-'+i,name:'Führung',blob,confirmed:true,duration:6,width:320,height:180}]);
   window.dispatchEvent(new Event('focus'));
  },{root,fixture,count,fingerprint});
  await page.waitForFunction(count=>document.querySelectorAll('.figure-card').length===count,count);
 };
 if(scenario==='menus-and-short-windows'){
  await seed(12);await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await page.locator('.card-options').last().click();
  const menu=await page.locator('.card-menu').boundingBox(),footer=await page.locator('body>.bottom-nav').boundingBox();
  assert(menu.y+menu.height<footer.y,'Last figure menu overlaps navigation');
  assert(await page.locator('.card-menu button').evaluateAll(nodes=>nodes.every(b=>{const r=b.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b;})),'A figure menu action is obscured');
  await page.getByRole('button',{name:'Bearbeiten',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#editor').open);await page.locator('#editorBack').click();await page.waitForFunction(()=>!document.querySelector('#editor').open);
  for(const size of [{width:844,height:390},{width:390,height:500}]){
   await page.setViewportSize(size);await page.evaluate(()=>window.scrollTo(0,600));await frame();
   const filter=await page.locator('.overview-filters').boundingBox(),nav=await page.locator('body>.bottom-nav').boundingBox();
   assert(nav.y-filter.y-filter.height>=100,'Fixed rows leave less than 100 pixels for figures');
   assert(await page.locator('#search').isVisible(),'Search disappeared in a short window');
  }
  await page.locator('#search').fill('Cloud Drehung');await page.waitForFunction(()=>document.querySelectorAll('.figure-card').length===1);
 }
 if(scenario.startsWith('cloud-repair')){
  const bytes=await(await page.request.get(new URL(fixture,page.url()).href)).body();
  const origin=new URL(page.url()).origin,scope=new URL(root,page.url()).pathname;
  await page.evaluate(scope=>localStorage.setItem(`salsa-cloud-session:${scope}:v1`,JSON.stringify({access_token:'contract',refresh_token:'contract',expires_at:Date.now()+3600000})),scope);
  await page.route('**/functions/v1/cloud',route=>{
   const {action}=route.request().postDataJSON();let data={ok:true};
   if(action==='state')data={me:{id:'contract',email:'contract@example.test',used:0,quota:500000000,upload_enabled:true},libraries:[],own_figures:[{id:'cloud-figure',public_allowed:false,revisions:[{id:'rev-1',title:'Cloud Drehung',description:'Cloud-Original',tags:[],created_at:'2026-10-22T00:00:00Z',videos:[{id:'video-1',name:'Führung',type:'video/mp4',size:bytes.length}]}]}]};
   if(action==='poster_get')data={poster:null,can_write:false};if(action==='media_url')data={url:new URL(fixture,origin).href};
   return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await seed(1,'cloud:rev-1:video-1');
  if(scenario==='cloud-repair-missing'){
   await page.evaluate(async root=>{const s=await import(root+'storage.js'),cache=await caches.open(s.MEDIA_CACHE);for(const key of await cache.keys())await cache.delete(key)},root);
  }else{
   await page.locator('.card-options').click();await page.getByRole('button',{name:'Bearbeiten',exact:true}).click();
   const [picker]=await Promise.all([page.waitForEvent('filechooser'),page.getByRole('button',{name:'Ersetzen',exact:true}).click()]);
   await picker.setFiles({name:'Geändert.mp4',mimeType:'video/mp4',buffer:Buffer.concat([bytes,Buffer.from([0,0,0,0])])});
   await page.waitForFunction(()=>!document.querySelector('#acceptVideo').disabled);await page.locator('#acceptVideo').click();await page.locator('#saveFigure').click();await page.waitForFunction(()=>!document.querySelector('#editor').open);
  }
  await page.locator('#cloudButton').click();const again=page.getByRole('button',{name:'Erneut lokal übernehmen',exact:true});await again.waitFor();assert(await again.isEnabled(),'Cloud recovery is disabled');
  await again.click();await page.locator('#cloudImportConflict').getByRole('button',{name:'Abbrechen',exact:true}).click();assert(await page.locator('#cloudDialog').isVisible(),'Cancelling repair closed cloud');
  await again.click();await page.locator('#cloudImportConflict').getByRole('button',{name:'Vorhandene Figur ersetzen',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#editor').open);
  assert(await page.locator('#figureStatus').inputValue()==='Sitzt','Repair lost learning status');
  await page.locator('#reviewAll').click();await page.waitForFunction(()=>!document.querySelector('#acceptVideo').disabled);await page.locator('#acceptVideo').click();await page.locator('#saveFigure').click();await page.waitForFunction(()=>!document.querySelector('#editor').open);
  const saved=await page.evaluate(async root=>{const s=await import(root+'storage.js'),f=(await s.listFigures())[0],v=(await s.figureVideos(f))[0];return{id:f.id,status:f.status,size:v.blob.size,count:(await s.listFigures()).length}},root);
  assert(saved.id==='parity-0'&&saved.status==='Sitzt'&&saved.count===1&&saved.size===bytes.length,'Repair changed identity/status or failed to restore original bytes');
 }
 if(scenario==='player-orientation-and-exit'){
  await seed();if(native)await page.evaluate(()=>{AndroidPlatform.rotate=value=>window.parityRotation=value;AndroidPlatform.fullscreen=value=>window.parityFullscreen=value;});
  await page.getByRole('button',{name:'Cloud Drehung lernen',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#learningVideo').videoWidth>0);
  await page.locator('#rotatePlayer').click();if(native)await page.setViewportSize({width:844,height:390});await frame();
  assert(await page.locator('#playerScreen').evaluate(n=>n.classList.contains('is-landscape')),'Player landscape state is missing');
  assert(await page.locator('#playerScreen .bottom-nav').evaluate(n=>getComputedStyle(n).display==='none'),'Landscape navigation remains visible');
  assert(await page.locator('#playerDescription').evaluate(n=>getComputedStyle(n).display==='none'),'Landscape description remains visible');
  await page.locator('#playerBack').click();await page.waitForFunction(()=>document.querySelector('#playerScreen').hidden);await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Cloud Drehung lernen',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#playerScreen').hidden);
  assert(await page.locator('#rotatePlayer').getAttribute('aria-pressed')==='false','Reopening did not reset orientation');
  if(native){
   await page.locator('#fullscreen').click();assert(await page.evaluate(()=>window.parityFullscreen===true),'Android fullscreen was not requested');
   assert(await page.locator('#playerScreen .bottom-nav').evaluate(n=>getComputedStyle(n).display==='none'),'Native fullscreen navigation remains visible');
   // Navigation to another screen must reset native fullscreen/orientation, too.
   await page.locator('#playerScreen [data-nav=cloud]').evaluate(n=>n.click());
   await page.waitForFunction(()=>document.querySelector('#cloudDialog').open);
   assert(await page.evaluate(()=>window.parityFullscreen===false&&window.parityRotation===false),'Navigation leaked native fullscreen or orientation');
  }
 }
 if(scenario==='csp-and-storage-styles'){
  assert(!consoleErrors.length,'CSP console errors: '+consoleErrors.join('\n'));
  assert(await page.locator('#saveIndicator').getAttribute('style')===null&&await page.locator('#backupStatus').getAttribute('style')===null,'Static inline styles conflict with CSP');
  assert(await page.locator('#backupStatus').evaluate(n=>getComputedStyle(n).whiteSpace==='pre-wrap'),'Backup status loses line breaks');
 }
}
