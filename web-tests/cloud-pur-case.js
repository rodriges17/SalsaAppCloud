// User-facing Cloud UI contracts shared by the PWA and Android bundle.
export async function runCloudPurCase(page,{root,fixture,scenario}){
 const assert=(value,message)=>{if(!value)throw Error(message);};
 const scope=new URL(root,page.url()).pathname;
 await page.evaluate(scope=>localStorage.setItem(`salsa-cloud-session:${scope}:v1`,JSON.stringify({access_token:'pur-test',refresh_token:'unused',expires_at:Date.now()+3600000})),scope);
 const calls=[];let allowed=true,failPermission=true,deleted=false,deletedPayload;
 const restricted=scenario.endsWith('readonly'),admin=scenario.endsWith('admin');
 const videos=[{id:'pur-video-a',name:'Führung',size:12300000,type:'video/mp4'},{id:'pur-video-b',name:'Folgen',size:2500000,type:'video/mp4'},{id:'pur-video-c',name:'',type:'video/mp4'}];
 const revision={id:'pur-rev',title:'Pur Drehung',description:'Die Hände verbunden halten.',tags:['Pasito','pasito','Ein sehr langer Tag zur Prüfung auf schmalen Bildschirmen'],created_at:'2026-10-28T00:00:00Z',videos};
 await page.route('**/functions/v1/cloud',route=>{
  const {action,payload}=route.request().postDataJSON();calls.push(action);
  if(action==='delete_figure'){deleted=true;deletedPayload=payload;}
  if(action==='public_permission'){if(failPermission){failPermission=false;return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Freigabe-Test fehlgeschlagen'})});}allowed=payload.allowed;}
  const value=action==='state'?{me:{id:admin?'pur-admin':'pur-owner',is_admin:admin,email:'pur@example.test',upload_enabled:!restricted,used:0,quota:500000000},libraries:[],own_figures:scenario==='cloud-pur-header'||deleted?[]:[{id:'pur-figure',content_token:'pur-v1',owner_id:'pur-owner',public_allowed:allowed,revisions:[revision]}]}:action==='tags'?{tags:[],complete:true}:action==='media_url'?{url:new URL(fixture,page.url()).href}:action==='delete_preview'?{libraries:['Testkurs']}:{ok:true};
  return route.fulfill({contentType:'application/json',body:JSON.stringify(value)});
 });
 await page.locator('#cloudButton').click();await page.locator('#cloudAccountOpen').waitFor();
 if(scenario==='cloud-pur-figure'){
  const card=page.locator('.cloud-own-figure');await card.locator('summary').click();
  await card.getByRole('tab',{name:'Figur',exact:true}).click({timeout:3000});
  assert(await card.getByRole('heading',{name:'Videos und lokale Kopie',exact:true}).count()===0,'Redundant video heading remained');
  const tags=card.getByRole('list',{name:'Tags',exact:true});
  assert(JSON.stringify(await tags.getByRole('listitem').allTextContents())===JSON.stringify(revision.tags),'Tag pills changed exact case identities');
  const play=card.getByRole('button',{name:'Video „Führung“ abspielen',exact:true});
  assert((await play.innerText()).includes('12.3 MB'),'Video row lost file size');
  assert(await card.getByRole('checkbox').count()===3,'Multi-video local selection disappeared');
  assert((await card.getByRole('button',{name:'Video „Ohne Namen“ abspielen',exact:true}).innerText()).includes('Größe unbekannt'),'Missing video metadata is not explained');
  await card.getByRole('checkbox').first().uncheck();await play.click();
  await card.locator('video').waitFor();assert(calls.includes('media_url'),'Video row did not request playback');
  assert(!await card.getByRole('checkbox').first().isChecked(),'Playback changed download selection');
  await card.getByRole('button',{name:'Video „Folgen“ abspielen',exact:true}).click();
  assert(await card.locator('video').count()===1,'Selecting another video left two players');
  await page.setViewportSize({width:320,height:844});assert(await card.evaluate(n=>n.scrollWidth<=n.clientWidth+1),'Tag or video text overflows the card');
 }
 if(scenario.startsWith('cloud-pur-manage')){
  const card=page.locator('.cloud-own-figure');await card.locator('summary').click();await card.getByRole('tab',{name:'Verwalten',exact:true}).click();
  const panel=card.getByRole('tabpanel',{name:'Verwalten',exact:true});
  await panel.getByRole('status',{name:'Öffentliche Freigabe: Erlaubt',exact:true}).waitFor({timeout:3000});
  assert(await panel.locator('details').count()===0,'Management actions remain hidden in a disclosure');
  const assign=panel.getByRole('button',{name:'Bibliothek zuordnen',exact:true}),variant=panel.getByRole('button',{name:'Variante erstellen',exact:true});
  assert(await assign.count()===(restricted?0:1)&&await variant.count()===(restricted?0:1),'Upload permissions changed');
  if(!restricted){await variant.click();await page.locator('#confirmDialog').waitFor();await page.locator('#confirmCancel').click();assert(!calls.includes('variant'),'Cancel created a variant');}
  const revoke=panel.getByRole('button',{name:'Freigabe widerrufen',exact:true});
  if(admin)assert(await revoke.count()===0,'Admin can change another owner public consent');
  else{
   await revoke.click();await page.locator('#confirmDialog').waitFor();
   assert((await page.locator('#confirmDialog').innerText()).includes('Private Zuordnungen bleiben bestehen'),'Revocation lost its effects explanation');
   await page.locator('#confirmCancel').click();assert(!calls.includes('public_permission'),'Cancel revoked public permission');
   await revoke.click();await page.locator('#confirmOK').click();await page.getByRole('alert').filter({hasText:'Freigabe-Test fehlgeschlagen'}).waitFor();
   assert(await panel.getByRole('status',{name:'Öffentliche Freigabe: Erlaubt',exact:true}).count()===1,'Failure changed the consent status');
   await revoke.click();await page.locator('#confirmOK').click();
   await page.getByRole('status',{name:'Öffentliche Freigabe: Nicht erlaubt',exact:true}).waitFor();
   await page.getByRole('button',{name:'Freigabe erlauben',exact:true}).click();
   await page.getByRole('status',{name:'Öffentliche Freigabe: Erlaubt',exact:true}).waitFor();
  }
  await page.getByRole('button',{name:'Cloud-Figur löschen',exact:true}).click();await page.locator('#confirmDialog').waitFor();
  const confirmation=await page.locator('#confirmDialog').innerText();assert(confirmation.includes('Testkurs')&&confirmation.includes('Videos')&&confirmation.includes('Lokale Kopien bleiben erhalten'),'Delete confirmation lost affected content');
  await page.locator('#confirmCancel').click();assert(!calls.includes('delete_figure'),'Cancel deleted the Cloud figure');
  await page.getByRole('button',{name:'Cloud-Figur löschen',exact:true}).click();await page.locator('#confirmOK').click();
  await page.waitForFunction(()=>!document.querySelector('.cloud-own-figure'));
  assert(deletedPayload?.figure==='pur-figure'&&deletedPayload?.expected_token==='pur-v1','Deletion lost figure identity or conflict protection');
 }
 if(scenario==='cloud-pur-header'){
  const settings=page.locator('#cloudDialog > .cloud-brand-header').getByRole('button',{name:'Einstellungen',exact:true});
  await settings.click({timeout:3000});await page.locator('#infoDialog').waitFor();
  assert(await page.locator('#cloudDialog').evaluate(n=>n.open),'Settings discarded the Cloud screen');
  await page.locator('#closeInfoTop').click();
  assert(await settings.evaluate(n=>n===document.activeElement),'Closing settings must restore the Cloud settings trigger');
  await page.locator('#cloudAccountOpen').click();await page.locator('#cloudAccountMenu').waitFor();
  assert(await page.locator('#cloudAccountMenu').innerText().then(t=>t.includes('pur@example.test')),'Account details disappeared');
  await page.locator('#cloudAccountMenu').getByRole('button',{name:'Kontomenü schließen',exact:true}).click();
  await page.getByRole('button',{name:'Aktualisieren',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('#cloudBody').inert);
  assert(calls.filter(a=>a==='state').length>=2,'Refresh stopped loading current Cloud state');
  await page.setViewportSize({width:320,height:844});
  const bounds=await page.locator('#cloudDialog > .screen-header').evaluate(n=>[n.querySelector('h2'),...n.querySelectorAll('button:not([hidden])')].map(e=>{const r=e.getBoundingClientRect();return {y:r.y+r.height/2,width:r.width,height:r.height};}));
  assert(bounds.every(r=>Math.abs(r.y-bounds[0].y)<2),'Cloud title and actions are not vertically centered');
  assert(bounds.slice(1).every(r=>r.width>=44&&r.height>=44),'Cloud touch targets are too small');
  assert(await page.locator('#cloudDialog').evaluate(n=>n.scrollWidth<=n.clientWidth+1),'Cloud header overflows at 320px');
  await settings.click();await page.locator('#infoDialog [data-nav=figures]').click();
  assert(!await page.locator('#cloudDialog').evaluate(n=>n.open),'Figures navigation in settings left Cloud covering the overview');
 }
}
