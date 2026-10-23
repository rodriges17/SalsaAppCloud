// The same behavior contract runs against the PWA and the bundled Android UI.
export const PARITY_CASES = ['zip-save-feedback', 'menus-and-short-windows', 'cloud-repair-missing', 'cloud-repair-modified', 'player-orientation-and-exit', 'csp-and-storage-styles', 'cloud-cache-fast-reopen', 'cloud-cache-refresh', 'cloud-cache-account-isolation', 'cloud-cache-permission-change', 'cloud-cache-frame-reuse'];
export async function runParityCase(page, { root, fixture, native = false, scenario, consoleErrors = [], browserName = 'chromium' }) {
 const assert = (value, message) => { if (!value) throw new Error(message); };
 const frame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
 if(native||scenario==='menus-and-short-windows'||scenario==='player-orientation-and-exit')await page.setViewportSize({width:390,height:844});
 await frame();
 await page.route('**/functions/v1/cloud',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({me:null,libraries:[],own_figures:[]})}));
 const seed = async (count=1,fingerprint=null) => {
  await page.evaluate(async ({root,fixture,count,fingerprint})=>{
   const s=await import(root+'storage.js'),blob=await(await fetch(fixture)).blob();
   for(let i=0;i<count;i++)await s.saveFigure({id:'parity-'+i,title:i?'Figur '+i:'Cloud Drehung',description:'Beschreibung zum Üben',tags:[],status:'Sitzt',importFingerprint:fingerprint},[{id:'parity-video-'+i,name:'Führung',blob,confirmed:true,duration:6,width:320,height:180}]);
   window.dispatchEvent(new Event('focus'));
  },{root,fixture,count,fingerprint});
  await page.waitForFunction(count=>document.querySelectorAll('.figure-card').length===count,count);
 };
 if(scenario==='zip-save-feedback'){
  await seed();await page.locator('.card-options').click();await page.getByRole('button',{name:'Figur teilen',exact:true}).click();
  await page.evaluate(()=>{const original=Blob.prototype.arrayBuffer;window.releaseZip=null;Blob.prototype.arrayBuffer=function(){Blob.prototype.arrayBuffer=original;return new Promise(resolve=>window.releaseZip=()=>resolve(original.call(this)));};});
  await page.locator('#preparePackage').click();await page.waitForFunction(()=>!!window.releaseZip);
  assert(await page.locator('#shareProgress').isVisible(),'ZIP preparation has no status');
  assert(await page.locator('#shareProgress').evaluate(e=>e.classList.contains('is-busy')),'ZIP preparation has no spinner');
  await page.evaluate(()=>window.releaseZip());await page.locator('#downloadPackage').waitFor();
  assert(await page.locator('#downloadPackage').evaluate(e=>e.tagName==='BUTTON'),'Save must be a real button');
  await page.evaluate(()=>{window.saveCalls=0;window.stepFileDelivery={save(file){window.savedZip=file;window.saveCalls++;return new Promise((resolve,reject)=>{window.finishZipSave=resolve;window.failZipSave=reject;});}};});
  await page.locator('#downloadPackage').click();await page.waitForFunction(()=>!!window.finishZipSave);
  assert(await page.locator('#shareProgress').evaluate(e=>e.classList.contains('is-busy')),'Save has no spinner');
  assert(await page.locator('#downloadPackage').isDisabled()&&await page.locator('#sendPackage').isDisabled(),'Repeated save/share is not blocked');
  assert((await page.locator('#shareProgress').textContent()).includes('Speichern'),'Save lacks an immediate message');
  await page.evaluate(()=>window.failZipSave(new Error('Test: Speicher voll')));await page.locator('#downloadPackage').waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.querySelector('#downloadPackage').disabled);
  assert((await page.locator('#shareError').textContent()).includes('Speicher voll'),'Save failure is not visible');
  await page.locator('#downloadPackage').click();await page.evaluate(()=>window.failZipSave(new DOMException('Abgebrochen','AbortError')));
  await page.waitForFunction(()=>!document.querySelector('#downloadPackage').disabled);
  assert((await page.locator('#shareProgress').textContent()).includes('abgebrochen'),'Canceled picker lacks a status');
  assert(!await page.locator('#shareError').isVisible(),'Cancellation was presented as an error');
  await page.locator('#downloadPackage').click();await page.evaluate(()=>window.finishZipSave('saved'));
  await page.waitForFunction(()=>!document.querySelector('#downloadPackage').disabled);
  assert((await page.locator('#shareProgress').textContent()).includes('gespeichert'),'Saved result not shown');
  assert(await page.evaluate(()=>saveCalls===3&&savedZip.name==='Cloud Drehung.zip'&&savedZip.size>0),'Retry lost the ZIP or created duplicate saves');
  await page.locator('#closeShare').click();return;
 }
 if(scenario.startsWith('cloud-cache-')){
  const scope=new URL(root,page.url()).pathname,key=`salsa-cloud-session:${scope}:v1`;
  await page.evaluate(key=>localStorage.setItem(key,JSON.stringify({access_token:'account-a',refresh_token:'refresh-a',expires_at:Date.now()+3600000})),key);
  const poster=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=4;c.getContext('2d').fillRect(0,0,4,4);return c.toDataURL('image/jpeg').split(',')[1]});
  let version=1,calls=0,posterCalls=0,mediaCalls=0,missingPoster=false,stall=false,fail=false,revoked=false,release;
  await page.route('**/auth/v1/logout',r=>r.fulfill({contentType:'application/json',body:'{}'}));
  await page.route('**/functions/v1/cloud',async r=>{
   const {action}=r.request().postDataJSON(),token=r.request().headers().authorization;
   const who=token?.includes('account-b')?'B':token?'A':null;
   let value={ok:true};
   if(action==='state'){
    calls++;if(stall&&who==='A')await new Promise(resolve=>release=resolve);
    if(fail)return r.fulfill({status:503,contentType:'application/json',body:'{"error":"Test: offline"}'});
    value={me:who?{id:who,email:who+'@example.test',used:0,quota:500000000,upload_enabled:true}:null,libraries:[{id:'cache-library',title:'Cache Bibliothek',visibility:'public'}],own_figures:who?[{id:'cache-figure',public_allowed:false,revisions:[{id:'cache-revision',title:`Cache ${who} ${version}`,description:'',tags:[],created_at:'2026-10-23T00:00:00Z',videos:[{id:'cache-video',name:'Video',type:'video/mp4',size:123}]}]}]:[]};
   }
   if(action==='poster_get'){posterCalls++;value={poster:missingPoster?null:poster,kind:'local',can_write:false};}
   if(action==='media_url'){mediaCalls++;value={url:new URL(fixture,page.url()).href};}
   if(action==='state'&&revoked){value={...value,me:{...value.me,upload_enabled:false},libraries:[],own_figures:[]};}
   if(action==='library'){
    if(revoked)return r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'Zugriff entzogen'})});
    value={library:{id:'cache-library',title:'Private Details',description:'',visibility:'private'},entries:[],members:[],manage:false,contribute:false};
   }
   return r.fulfill({contentType:'application/json',body:JSON.stringify(value)});
  });
  const open=async()=>{await page.locator('#cloudButton').click();await page.getByRole('heading',{name:`Cache A ${version}`,exact:true}).waitFor();};
  await open();await page.locator('.cloud-thumbnail').waitFor();const firstCalls=calls;
  const owner=await page.evaluate(async root=>(await import(root+'cloud-api.js')).cloudIdentity(),root);
  if(scenario==='cloud-cache-frame-reuse'){
   await page.evaluate(async({root,owner})=>{const c=await import(root+'cloud-cache.js');const r=await c.readCloudCache(owner,'poster:cache-revision');r.value.kind='frame';},{root,owner});
   await page.locator('#cloudBack').click();missingPoster=true;await page.clock.setFixedTime(new Date(await page.evaluate(()=>Date.now())+61000));await open();await page.locator('.cloud-thumbnail').waitFor();
   while(posterCalls<2)await new Promise(r=>setTimeout(r,10));await page.waitForTimeout(100);assert(mediaCalls===0,'Cached fallback frame downloaded its source video again');
  }else if(scenario==='cloud-cache-fast-reopen'){
   await page.getByRole('button',{name:'Bibliotheken',exact:true}).click();await page.getByRole('heading',{name:'Bibliotheken',exact:true}).waitFor();
   await page.getByRole('button',{name:'Meine Cloud-Figuren',exact:true}).click();await page.getByRole('heading',{name:'Cache A 1',exact:true}).waitFor();
   await page.locator('#cloudBack').click();await open();await page.locator('.cloud-thumbnail').waitFor();
   assert(calls===firstCalls,'A fresh tab switch/reopen fetched cloud state again');assert(posterCalls===1,'A cached poster was fetched again');
   await page.reload();await page.locator('#cloudButton').waitFor();await open();await page.locator('.cloud-thumbnail').waitFor();
   assert(calls===firstCalls&&posterCalls===1,'Persistent snapshots/posters were not restored after reload');
   await page.locator('#cloudBack').click();await page.context().setOffline(true);await open();
   assert((await page.locator('#cloudStatus').textContent()).includes('Offline'),'Offline snapshot lacks a freshness notice');await page.context().setOffline(false);
   await page.locator('#cloudBack').click();await page.route('**/auth/v1/token?grant_type=refresh_token',r=>r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'refresh_token_not_found',msg:'Session revoked'})}));
   await page.evaluate(key=>{const s=JSON.parse(localStorage.getItem(key));localStorage.setItem(key,JSON.stringify({...s,expires_at:0}))},key);await page.clock.setFixedTime(new Date(await page.evaluate(()=>Date.now())+61000));
   await page.locator('#cloudButton').click();await page.getByText('Du bist derzeit nicht angemeldet.',{exact:false}).waitFor();
   assert(await page.getByRole('heading',{name:'Cache A 1',exact:true}).count()===0,'Revoked session left private contents visible');
   assert(await page.evaluate(async({root,owner})=>!(await(await import(root+'cloud-cache.js')).readCloudCache(owner,'state')),{root,owner}),'Revoked session retained private snapshots');
  }else if(scenario==='cloud-cache-permission-change'){
   await page.getByRole('button',{name:'Bibliotheken',exact:true}).click();await page.getByRole('button',{name:'Öffnen',exact:true}).click();await page.getByRole('heading',{name:'Private Details',exact:true}).waitFor();await page.locator('#cloudBack').click();
   await page.clock.setFixedTime(new Date(await page.evaluate(()=>Date.now())+61000));revoked=true;
   await page.evaluate(root=>{void import(root+'cloud.js').then(m=>m.openCloud(null,'cache-library'));},root);
   await page.waitForFunction(()=>document.querySelector('#cloudError').textContent.includes('Zugriff entzogen'));
   assert(await page.getByRole('heading',{name:'Private Details',exact:true}).count()===0,'Revoked private library details remained visible');
   assert(await page.evaluate(async({root,owner})=>!(await(await import(root+'cloud-cache.js')).readCloudCache(owner,'library:cache-library'))&&!await(await import(root+'cloud-cache.js')).readCloudCache(owner,'poster:cache-revision'),{root,owner}),'Permission revocation retained private details/posters');
  }else{
   await page.locator('#cloudBack').click();await page.clock.setFixedTime(new Date(await page.evaluate(()=>Date.now())+61000));stall=true;
   await page.locator('#cloudButton').click();await page.getByRole('heading',{name:'Cache A 1',exact:true}).waitFor();
   await page.waitForFunction(()=>document.querySelector('#cloudStatus').textContent.includes('Änderungen werden geladen'));
   assert(await page.locator('#cloudBack').isEnabled(),'Cached refresh disabled back navigation');
   while(!release)await new Promise(r=>setTimeout(r,10));
   if(scenario==='cloud-cache-refresh'){
    await page.getByRole('button',{name:'Bibliotheken',exact:true}).click();await page.getByRole('heading',{name:'Bibliotheken',exact:true}).waitFor();
    assert(calls===firstCalls+1,'Simultaneous navigation did not deduplicate refresh');
    version=2;stall=false;release();await page.waitForFunction(()=>document.querySelector('#cloudStatus').textContent==='Alles aktuell');
    await page.getByRole('button',{name:'Meine Cloud-Figuren',exact:true}).click();await page.getByRole('heading',{name:'Cache A 2',exact:true}).waitFor();
    await page.locator('#cloudBack').click();await page.clock.setFixedTime(new Date(await page.evaluate(()=>Date.now())+61000));fail=true;
    await page.locator('#cloudButton').click();await page.getByRole('heading',{name:'Cache A 2',exact:true}).waitFor();
    await page.waitForFunction(()=>document.querySelector('#cloudStatus').textContent.includes('Aktualisierung nicht möglich'));
    fail=false;version=3;await page.getByRole('button',{name:'Aktualisieren',exact:true}).click();await page.getByRole('heading',{name:'Cache A 3',exact:true}).waitFor();
   }else{
    await page.getByRole('button',{name:'Abmelden',exact:true}).click();await page.getByText('Du bist derzeit nicht angemeldet.',{exact:false}).waitFor();
    assert(await page.evaluate(async({root,owner})=>!(await(await import(root+'cloud-cache.js')).readCloudCache(owner,'state'))&&!await(await import(root+'cloud-cache.js')).readCloudCache(owner,'poster:cache-revision'),{root,owner}),'Logout retained private snapshots or posters');
    const other=await page.context().newPage();await other.goto(page.url());await other.evaluate(key=>localStorage.setItem(key,JSON.stringify({access_token:'account-b',refresh_token:'refresh-b',cache_id:'account-b-session',expires_at:Date.now()+3600000})),key);
    await page.getByRole('heading',{name:'Cache B 1',exact:true}).waitFor();stall=false;release();
    await page.waitForTimeout(100);assert(await page.getByRole('heading',{name:'Cache A 1',exact:true}).count()===0,'A late old-account response repopulated the UI');
    await page.getByRole('button',{name:'Bibliotheken',exact:true}).click();await page.getByRole('button',{name:'Bibliothek erstellen',exact:true}).click();await page.getByLabel('Name',{exact:true}).fill('Entwurf behalten');
    await other.evaluate(key=>{const s=JSON.parse(localStorage.getItem(key));localStorage.setItem(key,JSON.stringify({...s,access_token:'account-b-renewed'}))},key);await page.waitForTimeout(100);assert(await page.getByLabel('Name',{exact:true}).inputValue()==='Entwurf behalten','Token rotation in another tab discarded a form');await other.close();
   }
  }
 }

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
  // WebKit 27.2 emits a known false style-src alarm for each native select.
  // Keep real authored inline CSS forbidden and do not relax the app CSP.
  // https://github.com/microsoft/playwright/issues/43497
  const source=await(await page.request.get(page.url())).text();
  assert(!/\sstyle\s*=/i.test(source)&&!/<style(?:\s|>)/i.test(source),'Authored inline CSS violates CSP');
  const selects=await page.locator('select').count();
  const knownWebKit=browserName==='webkit'&&consoleErrors.length<=selects&&consoleErrors.every(e=>/^Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline'/.test(e));
  assert(!consoleErrors.length||knownWebKit,'CSP console errors: '+consoleErrors.join('\n'));
  assert(await page.locator('#saveIndicator').getAttribute('style')===null&&await page.locator('#backupStatus').getAttribute('style')===null,'Static inline styles conflict with CSP');
  assert(await page.locator('#backupStatus').evaluate(n=>getComputedStyle(n).whiteSpace==='pre-wrap'),'Backup status loses line breaks');
 }
}
