import { runTagPickerCase, runTagUploadCase, runTagCatalogCase, runTagLimitsCase } from './tag-picker-case.js';
import { runNavigationHoverCase } from './navigation-hover-case.js';
import { runStorageSettingsCase } from './storage-settings-case.js';
// The same behavior contract runs against the PWA and the bundled Android UI.
export const PARITY_CASES = ['tag-picker-limits', 'tag-picker-cloud-catalog', 'tag-picker-editor', 'tag-picker-upload', 'navigation-return-hover', 'storage-settings-status', 'library-share-links', 'zip-save-feedback', 'menus-and-short-windows', 'cloud-repair-missing', 'cloud-repair-modified', 'player-orientation-and-exit', 'csp-and-storage-styles', 'cloud-cache-fast-reopen', 'cloud-cache-refresh', 'cloud-cache-account-isolation', 'cloud-cache-permission-change', 'cloud-cache-frame-reuse', 'cloud-guest-public-first', 'cloud-library-download', 'cloud-guest-no-publish', 'cloud-single-direct-download', 'cloud-library-order', 'cloud-local-state', 'cloud-library-edit-session', 'cloud-library-edit-upload', 'cloud-library-edit-duplicate'];
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
 if(scenario==='tag-picker-limits')return runTagLimitsCase(page,{root,seed});
 if(scenario==='tag-picker-cloud-catalog')return runTagCatalogCase(page,{root,seed});
 if(scenario==='tag-picker-upload')return runTagUploadCase(page,{root,fixture,seed});
 if(scenario==='tag-picker-editor')return runTagPickerCase(page,{root,fixture,scenario,seed});
 if(['cloud-library-edit-session','cloud-library-edit-upload','cloud-library-edit-duplicate'].includes(scenario)) return runLibrarySessionCase(page,{root,fixture,scenario,seed});
 if(scenario==='cloud-library-order'){
  const scope=new URL(root,page.url()).pathname;
  await page.evaluate(scope=>localStorage.setItem(`salsa-cloud-session:${scope}:v1`,JSON.stringify({access_token:'test-order-token',refresh_token:'unused',expires_at:Date.now()+3600000})),scope);
  const library={id:'order-library',owner_id:'order-owner',title:'Reihenfolge üben',description:'',visibility:'public',collaborative:false,moderated:false,edit_version:'00000000-0000-4000-8000-000000000001'};
  let entries=['Erste','Zweite','Dritte'].map((title,index)=>({figure_id:'order-'+index,owner_id:'order-owner',published:{id:'revision-'+index,title,description:'',tags:[],videos:[]}})),saved;
  await page.route('**/functions/v1/cloud',async route=>{
   const {action,payload}=route.request().postDataJSON();let result={ok:true};
   if(action==='state')result={me:{id:'order-owner',email:'owner@example.test',upload_enabled:false,used:0,quota:0},libraries:[{...library,manage:true}],own_figures:[]};
   if(action==='library')result={library,manage:true,contribute:false,members:[],entries};
   if(action==='library_commit'){saved=payload;entries=payload.order.map(id=>entries.find(e=>e.figure_id===id));result={id:library.id};}
   await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
  });
  await page.locator('#cloudButton').click();await page.locator('a.cloud-library-card').click();
  await page.getByRole('button',{name:'Bibliothek bearbeiten',exact:true}).click();
  await page.locator('.cloud-order-number').nth(2).waitFor();
  assert((await page.locator('.cloud-order-number').allTextContents()).join(',')==='1,2,3','Numbering is not ascending');
  const last=page.locator('[data-library-figure="order-2"]');
  await last.getByRole('button',{name:'Nach oben',exact:true}).click();
  assert(!saved,'Reorder must remain a draft');
  assert((await page.locator('[data-library-figure]').evaluateAll(nodes=>nodes.map(n=>n.dataset.libraryFigure))).join(',')==='order-0,order-2,order-1','Arrow reorder failed');
  // The handle also supports keyboard movement.
  const handle=page.getByRole('button',{name:'Dritte verschieben',exact:true});await handle.scrollIntoViewIfNeeded();
  await handle.focus();await page.keyboard.press('ArrowUp');
  assert((await page.locator('[data-library-figure]').evaluateAll(nodes=>nodes.map(n=>n.dataset.libraryFigure))).join(',')==='order-2,order-0,order-1','Keyboard reorder failed');
  await handle.scrollIntoViewIfNeeded();const sourceRect=await handle.boundingBox();
  await page.mouse.move(sourceRect.x+sourceRect.width/2,sourceRect.y+sourceRect.height/2);await page.mouse.down();
  const destination=page.locator('[data-library-figure="order-0"] .cloud-order-controls');await destination.scrollIntoViewIfNeeded();const targetRect=await destination.boundingBox();
  await page.mouse.move(targetRect.x+targetRect.width/2,targetRect.y+targetRect.height/2);await page.mouse.up();
  assert((await page.locator('[data-library-figure]').evaluateAll(nodes=>nodes.map(n=>n.dataset.libraryFigure))).join(',')==='order-0,order-2,order-1','Pointer drag failed');
  await page.getByRole('button',{name:'Bibliothek speichern',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('cloudBody').inert);
  assert(saved?.order.join(',')==='order-0,order-2,order-1'&&saved.expected_version===library.edit_version,'Saved order or conflict version missing');
  await page.locator('#cloudBack').click();
 }
 if(scenario==='navigation-return-hover') await runNavigationHoverCase(page,{root,native});
 if(scenario==='storage-settings-status') await runStorageSettingsCase(page, { root, native, browserName });
 if(scenario==='library-share-links'){
  const libraries=[{id:'4a1bc1f6-1623-42d5-bade-f9e625f408b2',title:'Öffentlich',visibility:'public'},{id:'privat & Tanz/Üben',title:'Privat',visibility:'private'}];
  const calls=[];
  await page.evaluate(root=>{
   const scope=new URL(root,location.href).pathname;
   localStorage.setItem(`salsa-cloud-session:${scope}:v1`,JSON.stringify({access_token:'link-test',refresh_token:'link-refresh',expires_at:Date.now()+3600000}));
   Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.copiedLibraryLink=value;}}});
   history.replaceState(history.state,'',location.pathname+'?token_hash=must-not-share#access_token=private-token');
  },root);
  await page.route('**/functions/v1/cloud',route=>{
   const {action,payload}=route.request().postDataJSON();calls.push(action);let data={ok:true};
   if(action==='state')data={me:{id:'link-user',email:'links@example.test',used:0,quota:500000000,upload_enabled:false},libraries,own_figures:[]};
   if(action==='library')data={library:{...libraries.find(lib=>lib.id===payload.id),description:'Link-Test'},entries:[],members:[],manage:false,contribute:false};
   return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.locator('#cloudButton').click();await page.getByRole('button',{name:'Bibliotheken',exact:true}).click();
  for(let index=0;index<libraries.length;index++){
   const card=page.locator('a.cloud-library-card').nth(index);
   await card.waitFor();assert(await card.locator('button').count()===0,'Library card retains an extra open button');
   const destination=new URL(await card.getAttribute('href'));
   assert(destination.searchParams.get('library')===libraries[index].id&&!destination.hash&&!destination.searchParams.has('token_hash'),'Card link leaks login data or corrupts the library ID');
   if(index===0){await card.focus();await page.keyboard.press('Enter');}else await card.locator('p').first().click();
   const field=page.getByRole('textbox',{name:'Bibliothekslink',exact:true});await field.waitFor();
   const value=await field.inputValue(),link=new URL(value);
   assert(link.origin==='https://rodriges17.github.io'&&link.pathname==='/SalsaAppCloud/','Library link uses an internal, test or preview address');
   assert(link.searchParams.get('library')===libraries[index].id&&[...link.searchParams.keys()].length===1&&!link.hash,'Library link leaks unrelated login data or corrupts the ID');
   assert(!value.includes('must-not-share')&&!value.includes('appassets.androidplatform.net'),'Internal/login data leaked');
   if(!index)assert(value==='https://rodriges17.github.io/SalsaAppCloud/?library=4a1bc1f6-1623-42d5-bade-f9e625f408b2','Public UUID link differs from canonical address');
   const hint=page.getByText('Zum Öffnen sind Anmeldung und Bibliotheksberechtigung erforderlich.',{exact:true});
   assert(await hint.count()===(index?1:0),'Private library permission hint is missing or shown for public library');
   await page.getByRole('button',{name:'Link kopieren',exact:true}).click();await page.waitForFunction(expected=>window.copiedLibraryLink===expected,value);
   if(!index){
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined}));
    await page.getByRole('button',{name:'Link kopieren',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('#cloudError').hidden);
    assert((await page.locator('#cloudError').textContent()).includes('Bitte den markierten Link kopieren.'),'Missing clipboard API has no manual-copy fallback');
    assert(await field.evaluate(input=>input.selectionStart===0&&input.selectionEnd===input.value.length),'Fallback did not select the canonical link');
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.copiedLibraryLink=value;}}}));
   }
   await page.getByRole('button',{name:'Bibliotheken',exact:true}).click();await page.locator('a.cloud-library-card').first().waitFor();
  }
  assert(calls.every(action=>['state','cleanup','library'].includes(action)),'Sharing unexpectedly changes library permissions');
 }
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
   await page.evaluate(async({root,owner})=>{const c=await import(root+'cloud-cache.js');const r=await c.readCloudCache(owner,'poster:cache-revision:2026-10-23T00:00:00Z');r.value.kind='frame';},{root,owner});
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
   await page.locator('#cloudButton').click();await page.locator('#cloudLoginOpen').waitFor();
   assert(await page.getByRole('heading',{name:'Cache A 1',exact:true}).count()===0,'Revoked session left private contents visible');
   assert(await page.evaluate(async({root,owner})=>!(await(await import(root+'cloud-cache.js')).readCloudCache(owner,'state')),{root,owner}),'Revoked session retained private snapshots');
  }else if(scenario==='cloud-cache-permission-change'){
   await page.getByRole('button',{name:'Bibliotheken',exact:true}).click();await page.locator('a.cloud-library-card').click();await page.getByRole('heading',{name:'Private Details',exact:true}).waitFor();await page.locator('#cloudDialog [data-nav=figures]').click();
   await page.clock.setFixedTime(new Date(await page.evaluate(()=>Date.now())+61000));revoked=true;
   await page.evaluate(root=>{void import(root+'cloud.js').then(m=>m.openCloud(null,'cache-library'));},root);
   await page.waitForFunction(()=>document.querySelector('#cloudError').textContent.includes('Zugriff entzogen'));
   assert(await page.getByRole('heading',{name:'Private Details',exact:true}).count()===0,'Revoked private library details remained visible');
   assert(await page.evaluate(async({root,owner})=>!(await(await import(root+'cloud-cache.js')).readCloudCache(owner,'library:cache-library'))&&!await(await import(root+'cloud-cache.js')).readCloudCache(owner,'poster:cache-revision:2026-10-23T00:00:00Z'),{root,owner}),'Permission revocation retained private details/posters');
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
    await page.locator('#cloudAccountOpen').click();await page.getByRole('button',{name:'Abmelden',exact:true}).click();await page.locator('#cloudLoginOpen').waitFor();
    assert(await page.evaluate(async({root,owner})=>!(await(await import(root+'cloud-cache.js')).readCloudCache(owner,'state'))&&!await(await import(root+'cloud-cache.js')).readCloudCache(owner,'poster:cache-revision:2026-10-23T00:00:00Z'),{root,owner}),'Logout retained private snapshots or posters');
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
 if(scenario==='cloud-local-state'){
  const bytes=await(await page.request.get(new URL(fixture,page.url()).href)).body();
  const library={id:'state-library',title:'Status-Bibliothek',visibility:'public',owner_id:'other'};
  let latest='state-rev';
  const revision=()=>({id:latest,title:'Cloud Drehung',description:'Cloud',tags:[],created_at:'2026-10-26T00:00:00Z',videos:['a','b'].map(id=>({id:'cloud-'+id,name:id,size:bytes.length,type:'video/mp4'}))});
  const scope=new URL(root,page.url()).pathname;
  await page.evaluate(scope=>localStorage.setItem(`salsa-cloud-session:${scope}:v1`,JSON.stringify({access_token:'contract',refresh_token:'contract',expires_at:Date.now()+3600000})),scope);
  await page.route('**/functions/v1/cloud',route=>{
   const {action}=route.request().postDataJSON();let data={ok:true};
   if(action==='state')data={me:{id:'contract',email:'contract@example.test',upload_enabled:true,used:0,quota:500000000},libraries:[library],own_figures:[{id:'state-figure',owner_id:'contract',revisions:[revision()]}]};
   if(action==='library')data={library,entries:[{figure_id:'state-figure',published:revision()}],members:[],manage:false};
   if(action==='poster_get')data={poster:null,can_write:false};
   return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await seed(1,'cloud:state-rev:cloud-a');
  await page.locator('#cloudButton').click();
  const availability=page.locator('.cloud-own-availability');
  await page.waitForFunction(()=>document.querySelector('.cloud-own-availability')?.textContent==='Teilweise lokal verfügbar');
  await page.locator('.cloud-own-figure summary').click();
  await page.getByRole('checkbox').first().waitFor();
  assert(await page.getByRole('checkbox').count()===2,'Partial copies hide missing-video selection');
  await page.evaluate(async({root,fixture})=>{
   const storage=await import(root+'storage.js'),{cloudLocalIndex:index}=await import(root+'cloud-local.js');
   const current=(await storage.listFigures())[0],drafts=await storage.figureVideos(current),blob=await(await fetch(fixture)).blob();
   const saved=await storage.saveFigure({...current,importFingerprint:'cloud:state-rev:cloud-a,cloud-b'},[...drafts.map(v=>({...v,existing:true,confirmed:true})),{id:'local-b',blob,name:'b',confirmed:true,duration:6}],current.revision);
   index.remember('@device','state-rev',saved,[{cloud:'cloud-a',local:saved.videoIds[0]},{cloud:'cloud-b',local:saved.videoIds[1]}],'state-figure');
   dispatchEvent(new Event('local-figures-changed'));
  },{root,fixture});
  await page.waitForFunction(()=>document.querySelector('.cloud-own-availability')?.textContent==='Lokal verfügbar');
  assert(await page.getByRole('checkbox').count()===0,'Complete copy retains download checkboxes');
  await page.evaluate(async root=>{
   const storage=await import(root+'storage.js'),current=(await storage.listFigures())[0];
   await storage.saveFigure({...current,title:'Meine lokale Anpassung'},(await storage.figureVideos(current)).map(v=>({...v,existing:true,confirmed:true})),current.revision);
   dispatchEvent(new Event('local-figures-changed'));
  },root);
  await page.waitForFunction(()=>document.querySelector('.cloud-own-availability')?.title.includes('lokal angepasst'));
  await page.evaluate(async root=>{
   const storage=await import(root+'storage.js'),current=(await storage.listFigures())[0],records=await(await import(root+'app-storage.js')).figureVideoRecords(current);
   const cache=await caches.open(storage.MEDIA_CACHE);window.savedMedia={key:records[0].cacheKey,response:await cache.match(records[0].cacheKey)};await cache.delete(records[0].cacheKey);dispatchEvent(new Event('local-figures-changed'));
  },root);
  await page.waitForFunction(()=>document.querySelector('.cloud-own-availability')?.textContent==='Lokale Dateien fehlen');
  await page.evaluate(async root=>{const storage=await import(root+'storage.js');await(await caches.open(storage.MEDIA_CACHE)).put(savedMedia.key,savedMedia.response);dispatchEvent(new Event('local-figures-changed'));},root);
  await page.waitForFunction(()=>document.querySelector('.cloud-own-availability')?.textContent==='Lokal verfügbar');
  latest='new-state-rev';await page.getByRole('button',{name:'Aktualisieren',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.cloud-own-availability')?.textContent==='Neuere Cloud-Version verfügbar');
  await page.getByRole('button',{name:'Bibliotheken',exact:true}).click();await page.locator('a.cloud-library-card').click();
  await page.waitForFunction(()=>document.querySelector('.cloud-library-availability')?.textContent==='Neuere Cloud-Version verfügbar');
  await page.locator('.cloud-library-summary').click();await page.getByRole('button',{name:'Ältere lokale Figur öffnen',exact:true}).click();
  await page.locator('#editor').waitFor();assert(await page.locator('#figureTitle').inputValue()==='Meine lokale Anpassung','Opening an old copy overwrote local changes');
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
  await page.locator('#cloudButton').click();
  await page.locator('.cloud-own-figure summary').first().click();
  if(scenario==='cloud-repair-missing'){
   await page.locator('.cloud-local-status').filter({hasText:'Lokale Dateien fehlen'}).waitFor();
   assert(await page.getByRole('button',{name:'Lokale Figur öffnen',exact:true}).count()===0,'Unreadable files count as locally available');
   await page.getByRole('button',{name:'Lokal übernehmen',exact:true}).click();
   await page.locator('#cloudImportConflict').getByRole('button',{name:'Vorhandene Figur ersetzen',exact:true}).click();
   await page.waitForFunction(()=>!document.querySelector('#cloudDialog').open);
  }else{
   const open=page.getByRole('button',{name:'Lokale Figur öffnen',exact:true});await open.waitFor();await open.click();
   await page.locator('#editor').waitFor();
  }
  const saved=await page.evaluate(async root=>(await(await import(root+'storage.js')).listFigures()),root);
  assert(saved.length===1&&saved[0].id==='parity-0'&&saved[0].status==='Sitzt','Opening a cloud-linked figure changed local identity or learning status');
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
 if(scenario==='cloud-guest-no-publish'){
  await seed();
  await page.locator('.card-options').click();
  assert(await page.getByRole('button',{name:'In Cloud veröffentlichen',exact:true}).count()===0,'Guest sees publishing action');
  await page.evaluate(async root=>{const storage=await import(root+'storage.js');await(await import(root+'cloud.js')).openCloud((await storage.listFigures())[0]);},root);
  assert(!await page.locator('#cloudDialog').isVisible(),'Guest can open direct publishing flow');
  const scope=new URL(root,page.url()).pathname;
  await page.evaluate(scope=>localStorage.setItem(`salsa-cloud-session:${scope}:v1`,JSON.stringify({access_token:'contract',refresh_token:'contract',expires_at:Date.now()+3600000})),scope);
  await page.locator('.card-options').click();await page.locator('.card-options').click();
  assert(await page.getByRole('button',{name:'In Cloud veröffentlichen',exact:true}).isVisible(),'Signed-in user lost publishing action');
  await page.evaluate(scope=>{localStorage.removeItem(`salsa-cloud-session:${scope}:v1`);dispatchEvent(new CustomEvent('cloud-session-changed'));},scope);
  assert(await page.locator('.card-menu').count()===0,'Logout leaves publishing menu open');
  await page.locator('.card-options').click();
  assert(await page.getByRole('button',{name:'In Cloud veröffentlichen',exact:true}).count()===0,'Logout leaves publishing available');
 }
 if(scenario==='cloud-library-download'||scenario==='cloud-single-direct-download'){
  const bytes=await page.evaluate(async fixture=>Array.from(new Uint8Array(await(await fetch(fixture)).arrayBuffer())),fixture);
  const hash=await page.evaluate(async({root,bytes})=>(await import(root+'cloud-dedup.js')).videoHash(new Blob([new Uint8Array(bytes)])),{root,bytes});
  const library={id:'batch-library',owner_id:'other',title:'Gemeinsam üben',visibility:'public',description:'Sammeldownload',manage:false};
  const revision=id=>({id,title:id==='batch-one'?'Cloud eins':'Cloud zwei',description:'Lernfigur',tags:['Salsa'],created_at:'2026-10-25T10:00:00Z',videos:[{id:'video-'+id,name:'Führung',size:bytes.length,type:'video/mp4'}]});
  const revisions=[revision('batch-one'),revision('batch-two')];let downloads=0;
  await page.route('**/functions/v1/cloud',async route=>{
   const {action}=route.request().postDataJSON();let result={ok:true};
   if(action==='state')result={me:null,libraries:[library],own_figures:[]};
   if(action==='library')result={library,manage:false,contribute:false,members:[],entries:revisions.map(published=>({figure_id:published.id,owner_id:'other',published,pending:null}))};
   if(action==='media')result={content_hash:hash};
   if(action==='media_url'){downloads++;result={url:fixture};}
   if(action==='poster_get')result={poster:'/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAMAAwDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwBtFFFYnin/2Q==',kind:'local',can_write:false};
   await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
  });
  async function openLibrary(){await page.locator('#cloudButton').click();await page.locator('a.cloud-library-card').click();}
  if(scenario==='cloud-single-direct-download'){
   await openLibrary();await page.locator('.cloud-library-summary').first().click();await page.getByRole('button',{name:'In meine Figuren übernehmen',exact:true}).first().click();
   await page.waitForFunction(()=>!document.querySelector('#cloudDialog').open);
   assert(!await page.locator('#editor').isVisible(),'Single cloud download opened the editor');
   const saved=await page.evaluate(async root=>{const s=await import(root+'storage.js'),f=(await s.listFigures())[0];return {title:f.title,status:f.status,description:f.description,tags:f.tags,duration:(await s.figureVideos(f))[0].duration};},root);
   assert(saved.title==='Cloud eins'&&saved.status==='Neu'&&saved.description==='Lernfigur'&&saved.tags[0]==='Salsa'&&saved.duration>0,'Single cloud download lost metadata');
   assert(downloads===1,'Single download fetched more than its selected video');
   await page.getByRole('button',{name:'Cloud eins lernen',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#learningVideo').videoWidth>0);
   return;
  }
  await openLibrary();await page.getByRole('button',{name:'Alle Figuren lokal verfügbar machen',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#cloudStatus')?.textContent.startsWith('Fertig: 1 gespeichert · 1 bereits vorhanden'));
  await page.waitForFunction(()=>!document.getElementById('cloudBody').inert);
  assert(downloads===1,'Shared video content was downloaded more than once');
  assert(!await page.locator('#editor').isVisible(),'Bulk downloads must not open one editor per figure');
  const saved=await page.evaluate(async root=>{const s=await import(root+'storage.js');const figures=await s.listFigures();return {count:figures.length,status:figures[0].status,duration:(await s.figureVideos(figures[0]))[0].duration};},root);
  assert(saved.count===1&&saved.status==='Neu'&&saved.duration>0,'Bulk download did not save usable local video metadata');
  await page.locator('#cloudDialog [data-nav=figures]').click();await openLibrary();await page.getByRole('button',{name:'Alle Figuren lokal verfügbar machen',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#cloudStatus')?.textContent.startsWith('Fertig: 0 gespeichert · 2 bereits vorhanden'));
  assert(downloads===1,'Repeated bulk download fetched already available video content');
  return;
 }
 if(scenario==='cloud-guest-public-first'){
  const library={id:'guest-public',title:'Öffentlich tanzen',description:'Öffentliche Figuren zum Üben',visibility:'public',manage:false};
  await page.route('**/functions/v1/cloud',async route=>{
   const {action}=route.request().postDataJSON();
   const result=action==='library'?{library,entries:[],members:[],manage:false,contribute:false}:{me:null,own_figures:[],libraries:[library,{...library,id:'guest-private',title:'Nicht öffentlich',visibility:'private'}]};
   await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
  });
  await page.locator('#cloudButton').click();await page.getByRole('heading',{name:'Öffentliche Bibliotheken',exact:true}).waitFor();
  assert(await page.locator('.cloud-tabs').count()===0,'Guests must not see a cloud area switch');
  const login=page.locator('#cloudLoginDialog'),trigger=page.locator('#cloudLoginOpen');
  assert(await trigger.isVisible(),'Guest header sign-in icon must be visible');
  assert(!await login.isVisible(),'Guest sign-in dialog should start closed');
  assert(await page.getByLabel('Anmeldelink einfügen',{exact:true}).count()===0,'Guest list must contain no sign-in fields');
  assert(await page.getByRole('heading',{name:'Nicht öffentlich',exact:true}).count()===0,'Guest list must contain only public libraries');
  await trigger.click();await page.getByLabel('Anmeldelink einfügen',{exact:true}).waitFor();
  await page.getByRole('tab',{name:'Admin-Anmeldung',exact:true}).click();await page.getByLabel('Admin-E-Mail-Adresse',{exact:true}).waitFor();
  assert(!await page.getByLabel('Anmeldelink einfügen',{exact:true}).isVisible(),'Only selected login method should be visible');
  if(native)await page.evaluate(()=>AndroidAppUI.back());else await page.keyboard.press('Escape');
  assert(!await login.isVisible()&&await page.locator('#cloudDialog').isVisible(),'Back from login must only close login');
  await page.locator('a.cloud-library-card').click();await page.getByRole('heading',{name:library.title,exact:true}).waitFor();
  assert(await trigger.isVisible()&&!await login.isVisible(),'Library details must offer the header login icon');
  assert(await page.locator('.cloud-tabs').count()===0,'Guest library details must not show an account switch');
  if(native)await page.evaluate(()=>AndroidAppUI.back());else await page.keyboard.press('Escape');
  await page.getByRole('heading',{name:'Öffentliche Bibliotheken',exact:true}).waitFor();
  assert(await page.locator('#cloudDialog').isVisible(),'Native Back must return to libraries rather than local figures');
  await page.locator('a.cloud-library-card').click();await page.getByRole('button',{name:'< Zurück zu allen Bibliotheken',exact:true}).click();
  await page.getByRole('heading',{name:'Öffentliche Bibliotheken',exact:true}).waitFor();
  return;
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

async function runLibrarySessionCase(page,{root,fixture,scenario,seed}){
 const assert=(value,message)=>{if(!value)throw new Error(message);};
 const scope=new URL(root,page.url()).pathname;
 await page.evaluate(scope=>localStorage.setItem(`salsa-cloud-session:${scope}:v1`,JSON.stringify({access_token:'edit-token',refresh_token:'unused',expires_at:Date.now()+3600000})),scope);
 const library={id:'edit-library',owner_id:'editor',title:'Bibliothek',description:'Gespeichert',visibility:'private',collaborative:false,moderated:true,edit_version:'v1'};
 let entries=['Erste','Zweite'].map((title,i)=>({figure_id:'entry-'+i,published:{id:'rev-'+i,title,videos:[]}})),own=[],conflict=false,failRead=false,failReturn=false;
 const commits=[],writes=[];
 await page.route('**/storage/v1/**',route=>{writes.push(route.request().method());return route.fulfill({contentType:'application/json',body:'{}'});});
 await page.route('**/functions/v1/cloud',async route=>{
  const {action,payload}=route.request().postDataJSON();let value={ok:true};
  if(action==='state'){
   if(failReturn)return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Rückkehr vorübergehend nicht möglich"}'});
   value={me:{id:'editor',email:'editor@example.test',is_admin:false,upload_enabled:true,used:0,quota:500000000},libraries:[{...library,manage:true}],own_figures:own};
  }
  if(action==='library'){
   if(failRead)return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Bibliothek vorübergehend nicht ladbar"}'});
   value={library,entries,manage:true,contribute:false,members:[]};
  }
  if(action==='library_commit'){
   commits.push(payload);
   if(conflict)return route.fulfill({status:409,contentType:'application/json',body:'{"error":"Bibliothek wurde inzwischen geändert. Bitte neu laden."}'});
   Object.assign(library,{...payload,edit_version:'v3'});entries=payload.order.map(id=>entries.find(e=>e.figure_id===id)??{figure_id:id,published:own.find(f=>f.id===id).revisions[0]});value={id:library.id};
  }
  if(action==='duplicates')value={matches:scenario==='cloud-library-edit-duplicate'?[{figure:'shared-figure',revision:'shared-revision',title:'Zugängliche Figur',media:'shared-media',hash:payload.hashes[0]}]:[]};
  if(action==='reserve')value={job:'job',media:payload.videos.map((v,i)=>({id:'new-video-'+i,path:'test/'+i+'.mp4'}))};
  if(action==='commit'){
   own=[{id:'new-figure',owner_id:'editor',public_allowed:true,revisions:[{id:'new-revision',figure_id:'new-figure',title:payload.title,description:payload.description,tags:payload.tags,videos:payload.videos}]}];
   failReturn=true;value={figure:'new-figure',revision:'new-revision'};
  }
  if(action==='poster_get')value={poster:null,can_write:false};
  await route.fulfill({contentType:'application/json',body:JSON.stringify(value)});
 });
 if(scenario!=='cloud-library-edit-session')await seed();
 await page.locator('#cloudButton').click();await page.getByRole('button',{name:'Bibliotheken',exact:true}).click();await page.locator('a.cloud-library-card').click();await page.getByRole('button',{name:'Bibliothek bearbeiten',exact:true}).click();
 await page.locator('[data-library-figure="entry-1"]').getByRole('button',{name:'Nach oben',exact:true}).click();
 await page.getByRole('tab',{name:'Einstellungen',exact:true}).click();await page.getByLabel('Name',{exact:true}).fill('Mein Entwurf');await page.locator('#cloudBody').getByLabel('Beschreibung',{exact:true}).fill('Ungespeicherter Text');
 if(scenario==='cloud-library-edit-session'){
  conflict=true;await page.locator('#cloudBack').click();await page.locator('.cloud-unsaved-dialog').getByRole('button',{name:'Speichern',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.cloud-library-conflict')?.hidden===false);
  assert(await page.getByLabel('Name',{exact:true}).inputValue()==='Mein Entwurf','Failed leave lost title');
  await page.getByRole('button',{name:'Aktuellen Stand neu laden',exact:true}).click();await page.locator('#confirmCancel').click();assert(await page.locator('#cloudBody').getByLabel('Beschreibung',{exact:true}).inputValue()==='Ungespeicherter Text','Declining reload lost description');
  failRead=true;await page.getByRole('button',{name:'Aktuellen Stand neu laden',exact:true}).click();await page.locator('#confirmOK').click();await page.waitForFunction(()=>document.querySelector('#cloudError').textContent.includes('nicht ladbar'));
  assert(await page.getByLabel('Name',{exact:true}).inputValue()==='Mein Entwurf','Failed reload lost title');await page.getByRole('tab',{name:'Figuren (2)',exact:true}).click();assert((await page.locator('[data-library-figure]').evaluateAll(ns=>ns.map(n=>n.dataset.libraryFigure))).join(',')==='entry-1,entry-0','Failed reload lost order');
  await page.getByRole('button',{name:'Bibliothek speichern',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#cloudBody').inert);assert(commits.length===2&&commits.every(p=>p.expected_version==='v1'),'Conflict retry bypassed version check');
  failRead=false;conflict=false;library.title='Neuer Cloud-Stand';library.edit_version='v2';await page.getByRole('button',{name:'Aktuellen Stand neu laden',exact:true}).click();await page.locator('#confirmOK').click();await page.waitForFunction(()=>document.querySelector('.cloud-library-conflict')?.hidden===true);await page.getByRole('tab',{name:'Einstellungen',exact:true}).click();assert(await page.getByLabel('Name',{exact:true}).inputValue()==='Neuer Cloud-Stand','Confirmed reload failed');
  await page.getByLabel('Name',{exact:true}).fill('Nach Neuladen gespeichert');await page.getByRole('button',{name:'Abbrechen',exact:true}).click();await page.locator('.cloud-unsaved-dialog').getByRole('button',{name:'Speichern',exact:true}).click();await page.getByRole('heading',{name:'Nach Neuladen gespeichert',exact:true}).waitFor();assert(commits.at(-1).expected_version==='v2','Reload failed to update baseline');
 }else{
  await page.getByRole('tab',{name:'Figuren (2)',exact:true}).click();await page.getByRole('button',{name:'Figuren hinzufügen',exact:true}).click();await page.getByRole('button',{name:'Neue Figur hochladen',exact:true}).click();await page.getByRole('button',{name:'Cloud Drehung',exact:true}).click();await page.getByLabel('Öffentliche Veröffentlichung dieser Figur erlauben',{exact:true}).check();await page.getByRole('button',{name:'Ausgewählte Figur hochladen',exact:true}).click();
  if(scenario==='cloud-library-edit-duplicate'){
   await page.getByRole('button',{name:'Bestehende Figur verwenden',exact:true}).click();await page.locator('[data-library-figure="shared-figure"]').waitFor();
   assert(own.length===0&&writes.length===0&&commits.length===0,'Duplicate choice created or transferred content');
   await page.getByRole('tab',{name:'Einstellungen',exact:true}).click();assert(await page.getByLabel('Name',{exact:true}).inputValue()==='Mein Entwurf','Duplicate return lost draft');
   await page.getByRole('button',{name:'Abbrechen',exact:true}).click();await page.getByRole('button',{name:'Verwerfen',exact:true}).click();await page.getByRole('button',{name:'Bibliothek bearbeiten',exact:true}).waitFor();
   assert(entries.length===2,'Discard saved duplicate membership');return;
  }
  await page.getByRole('button',{name:'Ansicht erneut laden',exact:true}).waitFor();assert(own.length===1,'Upload not saved before return failure');const transfers=writes.length;
  failReturn=false;await page.getByRole('button',{name:'Zurück zur Bibliotheksbearbeitung',exact:true}).click();await page.locator('[data-library-figure="new-figure"]').waitFor();
  assert((await page.locator('[data-library-figure]').evaluateAll(ns=>ns.map(n=>n.dataset.libraryFigure))).join(',')==='entry-1,entry-0,new-figure','Upload return lost order or confirmed figure');
  await page.getByRole('tab',{name:'Einstellungen',exact:true}).click();assert(await page.getByLabel('Name',{exact:true}).inputValue()==='Mein Entwurf','Return lost title');assert(await page.locator('#cloudBody').getByLabel('Beschreibung',{exact:true}).inputValue()==='Ungespeicherter Text','Return lost description');assert(commits.length===0&&writes.length===transfers,'Return saved library or transferred videos again');
  await page.getByRole('button',{name:'Abbrechen',exact:true}).click();await page.getByRole('button',{name:'Verwerfen',exact:true}).click();await page.getByRole('button',{name:'Bibliothek bearbeiten',exact:true}).waitFor();assert(own.length===1&&entries.length===2,'Discard removed uploaded figure or saved its membership');
 }
}
