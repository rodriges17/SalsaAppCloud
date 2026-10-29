export async function runTagPickerCase(page, {root, fixture, scenario, seed}) {
 const assert=(value,message)=>{if(!value)throw Error(message);};
 await seed(2);
 await page.evaluate(async root=>{
  const s=await import(root+'storage.js');
  for(const f of await s.listFigures())await s.saveFigure({...f,tags:f.id==='parity-0'?['Pasito','Zulu']:['Behalten','Mit, Komma']},(await s.figureVideos(f)).map(v=>({...v,confirmed:true})),f.revision);
  window.dispatchEvent(new Event('focus'));
 },root);
 await page.getByRole('button',{name:'Optionen für Figur 1',exact:true}).click();
 await page.getByRole('button',{name:'Bearbeiten',exact:true}).click();
 const input=page.locator('#figureTags');
 assert(await input.getAttribute('role')==='combobox','Editor needs a searchable tag combobox');
 await input.click();assert(await input.getAttribute('aria-expanded')==='false','An empty field must not show suggestions on focus');
 await input.press('ArrowDown');assert(await input.getAttribute('aria-expanded')==='false','An empty field must not show suggestions on ArrowDown');
 await input.fill('   ');assert(await input.getAttribute('aria-expanded')==='false','Whitespace must not show suggestions');
 await input.fill('PAS');await input.fill('');assert(await input.getAttribute('aria-expanded')==='false','Clearing the search must hide suggestions');
 await input.fill('PASITO');await page.getByRole('option',{name:'Pasito',exact:true}).click();
 assert(await input.inputValue()==='','Selecting a tag must clear the search');
 assert(await input.getAttribute('aria-expanded')==='false','Empty search must hide suggestions');
 await input.fill('pasito');await page.getByRole('button',{name:'Neues Tag „pasito“ anlegen',exact:true}).click();
 await input.fill('sito');assert(await page.locator('.tag-picker-options').getByRole('option').count()===2,'Substring search must find both case variants');
 assert(await page.getByRole('option',{name:'Pasito',exact:true}).getAttribute('aria-selected')==='true','Uppercase variant lost selection');
 assert(await page.getByRole('option',{name:'pasito',exact:true}).getAttribute('aria-selected')==='true','Lowercase variant lost selection');
 await input.press('ArrowUp');assert(await page.getByRole('button',{name:'Neues Tag „sito“ anlegen',exact:true}).evaluate(n=>n===document.activeElement),'ArrowUp must reach the last available action');await input.press('Escape');await input.fill('Zulu');await input.press('ArrowDown');await page.keyboard.press('Enter');assert(await page.getByRole('button',{name:'Tag „Zulu“ entfernen',exact:true}).count()===1,'Keyboard selection failed');await page.getByRole('button',{name:'Tag „Zulu“ entfernen',exact:true}).click();
 await input.fill('Pasito');assert(await page.getByRole('button',{name:'Neues Tag „Pasito“ anlegen',exact:true}).count()===0,'Exact duplicate offered');
 await input.press('Escape');assert(await input.getAttribute('aria-expanded')==='false','Escape must close dropdown first');
 assert(await page.locator('#editor').evaluate(n=>n.open),'Escape discarded editor');
 await page.getByRole('button',{name:'Tag „Pasito“ entfernen',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('#saveFigure').disabled);
 await page.locator('#saveFigure').click();await page.waitForFunction(()=>!document.querySelector('#editor').open);
 const saved=await page.evaluate(async root=>(await(await import(root+'storage.js')).listFigures()).find(f=>f.id==='parity-1').tags,root);
 assert(JSON.stringify(saved)===JSON.stringify(['Behalten','Mit, Komma','pasito']),'Saving must preserve exact tag identities and unknown assigned tags');
}

export async function runTagUploadCase(page,{root,seed}){
 const assert=(v,m)=>{if(!v)throw Error(m);};
 const scope=new URL(root,page.url()).pathname;
 await page.evaluate(scope=>localStorage.setItem(`salsa-cloud-session:${scope}:v1`,JSON.stringify({access_token:'tag-test',refresh_token:'unused',expires_at:Date.now()+3600000})),scope);
 await seed();
 await page.evaluate(async root=>{const s=await import(root+'storage.js');const f=(await s.listFigures())[0];await s.saveFigure({...f,tags:['Pasito','Behalten']},(await s.figureVideos(f)).map(v=>({...v,confirmed:true})),f.revision);window.dispatchEvent(new Event('focus'));},root);
 let fail=true,saved;
 await page.route('**/storage/v1/**',r=>r.fulfill({contentType:'application/json',body:'{}'}));
 await page.route('**/functions/v1/cloud',r=>{
  const {action,payload}=r.request().postDataJSON();let value={ok:true};
  if(action==='state')value={me:{id:'tag-user',upload_enabled:true,used:0,quota:500000000},own_figures:[],libraries:[]};
  if(action==='tags')value={tags:['Upload-Fern'],complete:true};
  if(action==='duplicates')value={matches:[]};
  if(action==='reserve'){if(fail)return r.fulfill({status:503,contentType:'application/json',body:'{"error":"Tag-Test offline"}'});value={job:'job',media:payload.videos.map((_,i)=>({id:'m'+i,path:'tag-test/'+i+'.mp4'}))};}
  if(action==='commit'){saved=payload;value={figure:'saved-figure',revision:'saved-revision'};}
  return r.fulfill({contentType:'application/json',body:JSON.stringify(value)});
 });
 await page.getByRole('button',{name:'Optionen für Cloud Drehung',exact:true}).click();await page.getByRole('button',{name:'In Cloud veröffentlichen',exact:true}).click();
 await page.getByRole('button',{name:'Ausgewählte Figur hochladen',exact:true}).waitFor();
 assert(await page.locator('#cloudUploadTags').count()===1,'Upload needs the shared tag picker');
 await page.getByRole('button',{name:'Tag „Behalten“ entfernen',exact:true}).click();
 const input=page.locator('#cloudUploadTags');await input.fill('Upload-Fern');await page.getByRole('option',{name:'Upload-Fern',exact:true}).click();await input.fill('pasito');await page.getByRole('button',{name:'Neues Tag „pasito“ anlegen',exact:true}).click();
 await page.getByRole('button',{name:'Ausgewählte Figur hochladen',exact:true}).click();await page.getByRole('alert').filter({hasText:'Tag-Test offline'}).waitFor();
 assert(await page.getByRole('button',{name:'Tag „Pasito“ entfernen',exact:true}).count()===1,'Failed upload lost original selection');
 assert(await page.getByRole('button',{name:'Tag „pasito“ entfernen',exact:true}).count()===1,'Failed upload lost new tag');
 fail=false;await page.getByRole('button',{name:'Ausgewählte Figur hochladen',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#cloudBody').inert);
 assert(JSON.stringify(saved?.tags)===JSON.stringify(['Pasito','Upload-Fern','pasito']),'Upload commit did not preserve independent case variants');
 const local=await page.evaluate(async root=>(await(await import(root+'storage.js')).listFigures())[0].tags,root);
 assert(JSON.stringify(local)===JSON.stringify(['Pasito','Behalten']),'Upload altered original local tags');
}

export async function runTagCatalogCase(page,{root,seed}){
 const assert=(v,m)=>{if(!v)throw Error(m);};
 const scope=new URL(root,page.url()).pathname;
 await page.evaluate(scope=>localStorage.setItem(`salsa-cloud-session:${scope}:v1`,JSON.stringify({access_token:'tag-a',refresh_token:'unused',expires_at:Date.now()+3600000,cache_id:'tag-account-a'})),scope);
 await seed();let remote=['Fern','Entzogen','Pasito','pasito'],fail=false,requests=0;
 await page.route('**/functions/v1/cloud',r=>{
  const {action}=r.request().postDataJSON();
  if(action==='tags'){requests++;return r.fulfill({status:fail?503:200,contentType:'application/json',body:JSON.stringify(fail?{error:'offline'}:{tags:remote,complete:true})});}
  return r.fulfill({contentType:'application/json',body:JSON.stringify({me:{id:'a',upload_enabled:true},own_figures:[],libraries:[]})});
 });
 const edit=async()=>{await page.getByRole('button',{name:'Optionen für Cloud Drehung',exact:true}).click();await page.getByRole('button',{name:'Bearbeiten',exact:true}).click();};
 await edit();const input=page.locator('#figureTags');await input.fill('FER');
 await page.getByRole('option',{name:'Fern',exact:true}).waitFor({timeout:5000});assert(requests>0,'Editor did not fetch the accessible Cloud catalog');
 await page.getByRole('option',{name:'Fern',exact:true}).click();
 await input.fill('FER');remote=['Cloud-Neu'];await page.getByRole('button',{name:'Tag-Vorschläge aktualisieren',exact:true}).click();await page.getByText('Cloud-Tags aktuell.',{exact:true}).waitFor();
 assert(await input.inputValue()==='FER','Refreshing suggestions lost the search');assert(await page.getByRole('button',{name:'Tag „Fern“ entfernen',exact:true}).count()===1,'Refresh removed selection');
 await input.fill('Entzogen');assert(await page.getByRole('option',{name:'Entzogen',exact:true}).count()===0,'Revoked suggestion remained after refresh');
 fail=true;await page.context().setOffline(true);await page.getByRole('button',{name:'Tag-Vorschläge aktualisieren',exact:true}).click();await page.getByText('Cloud-Liste möglicherweise unvollständig. Lokal bekannte und zuletzt geladene Tags bleiben verfügbar.',{exact:true}).waitFor();
 await input.fill('Cloud-Neu');await page.getByRole('option',{name:'Cloud-Neu',exact:true}).waitFor();
 await input.fill('Offline');await page.getByRole('button',{name:'Neues Tag „Offline“ anlegen',exact:true}).click();
 assert(await page.getByRole('button',{name:'Tag „Offline“ entfernen',exact:true}).count()===1,'Offline creation failed');
 await page.context().setOffline(false);
 await page.evaluate(scope=>{
  const key=`salsa-cloud-session:${scope}:v1`,oldValue=localStorage.getItem(key);localStorage.removeItem(key);
  window.dispatchEvent(new StorageEvent('storage',{key,oldValue,newValue:null}));
 },scope);
 await input.fill('Cloud-Neu');await page.waitForFunction(()=>document.querySelector('.tag-picker-status').textContent.includes('unvollständig'));
 assert(await page.getByRole('option',{name:'Cloud-Neu',exact:true}).count()===0,'Logout leaked previous account suggestions');
 assert(await page.getByRole('button',{name:'Tag „Fern“ entfernen',exact:true}).count()===1,'Logout removed assigned tags from local draft');
}

export async function runTagLimitsCase(page,{root,seed}){
 const assert=(v,m)=>{if(!v)throw Error(m);};await seed(2);
 await page.evaluate(async root=>{const s=await import(root+'storage.js');for(const f of await s.listFigures())await s.saveFigure({...f,tags:f.id==='parity-1'?Array.from({length:100},(_,i)=>'Tag '+i):['Zusätzlich']},(await s.figureVideos(f)).map(v=>({...v,confirmed:true})),f.revision);window.dispatchEvent(new Event('focus'));},root);
 await page.getByRole('button',{name:'Optionen für Figur 1',exact:true}).click();await page.getByRole('button',{name:'Bearbeiten',exact:true}).click();
 const input=page.locator('#figureTags');await input.fill('Zusätzlich');await page.getByRole('option',{name:'Zusätzlich',exact:true}).click();
 assert(await page.locator('.tag-picker-chip').count()===100,'Picker exceeded 100 tags');await page.getByText('Maximal 100 Tags pro Figur.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Tag „Tag 0“ entfernen',exact:true}).click();await input.fill('x'.repeat(161));
 assert(await page.getByRole('button',{name:'Neues Tag „'+'x'.repeat(161)+'“ anlegen',exact:true}).isDisabled(),'Overlong tag can be created');
 await page.getByText('Ein Tag darf höchstens 160 Zeichen haben.',{exact:true}).waitFor();
 assert(await page.locator('#editor .tag-picker').evaluate(n=>n.scrollWidth<=n.clientWidth+1),'Long tag creation action overflows the mobile field');
 await input.fill('💃'.repeat(81));assert(await page.getByRole('button',{name:'Neues Tag „'+'💃'.repeat(81)+'“ anlegen',exact:true}).isDisabled(),'New tags must remain compatible with existing ZIP string limits');
 await input.fill('x'.repeat(160));await page.getByRole('button',{name:'Neues Tag „'+'x'.repeat(160)+'“ anlegen',exact:true}).click();
 assert(await page.locator('.tag-picker-chip').count()===100,'Allowed boundary tag not added');
}
