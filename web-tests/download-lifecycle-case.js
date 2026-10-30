// Shared browser contract for PWA storage and Android's storage bridge.
export async function runDownloadLifecycleCase(page,{root,fixture,scenario}) {
 const assert=(value,message)=>{if(!value)throw new Error(message);};
 const batch=scenario.endsWith('library'),scope=new URL(root,page.url()).pathname;
 await page.evaluate(scope=>localStorage.setItem(`salsa-cloud-session:${scope}:v1`,JSON.stringify({access_token:'download-owner',refresh_token:'unused',expires_at:Date.now()+3600000})),scope);
 const bytes=await page.evaluate(async fixture=>(await(await fetch(fixture)).blob()).size,fixture);
 const poster=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;return canvas.toDataURL('image/jpeg').split(',')[1];});
 const library={id:'downloads',title:'Download-Test',visibility:'public',owner_id:'owner'};
 const revision={id:'download-version',title:'Drehung',description:'Beschreibung',tags:['Salsa'],videos:[{id:'video',name:'Führung',type:'video/mp4',size:bytes}]};
 let signed=true,mediaRequests=0,release,started,finished;
 const oldMedia=new Promise(resolve=>release=resolve),oldStarted=new Promise(resolve=>started=resolve),oldFinished=new Promise(resolve=>finished=resolve);
 await page.route('**/functions/v1/cloud',async route=>{
  const {action}=route.request().postDataJSON();let value={};
  if(action==='state')value={me:signed?{id:'owner',email:'owner@example.test',upload_enabled:false,used:0,quota:0}:null,libraries:[library],own_figures:[]};
  if(action==='library')value={library,manage:false,members:[],entries:[{figure_id:'figure',published:revision}]};
  if(action==='poster_get')value={poster,kind:'local',can_write:false};
  if(action==='media')value={content_hash:null};
  if(action==='media_url'){
   mediaRequests++;value={url:fixture};
   if(mediaRequests===1){started();await oldMedia;await route.fulfill({contentType:'application/json',body:JSON.stringify(value)}).catch(()=>{});finished();return;}
  }
  await route.fulfill({contentType:'application/json',body:JSON.stringify(value)});
 });
 const openLibrary=async()=>{await page.locator('a.cloud-library-card').click();await page.locator('.cloud-library-title').waitFor();};
 const start=async()=>{
  if(batch){await page.getByRole('button',{name:'Alle Figuren lokal verfügbar machen',exact:true}).click();await page.locator('#confirmOK').click();}
  else {await page.locator('.cloud-library-summary').click();await page.getByRole('button',{name:'Lokal verfügbar machen',exact:true}).click();}
 };
 try {
  await page.locator('#cloudButton').click();await openLibrary();await start();await oldStarted;
  await page.locator('#cloudCancelUpload').waitFor();
  signed=false;
  await page.evaluate(scope=>{localStorage.removeItem(`salsa-cloud-session:${scope}:v1`);dispatchEvent(new CustomEvent('cloud-session-changed',{detail:{external:true}}));},scope);
  await page.locator('.cloud-public-libraries').waitFor();
  assert(await page.locator('#cloudCancelUpload').isHidden(),'Old download controls survived account change');
  await openLibrary();await start();
  if(batch)await page.waitForFunction(()=>document.querySelector('#cloudStatus').textContent.includes('Fertig: 1 gespeichert'));
  else await page.waitForFunction(()=>!document.querySelector('#cloudDialog').open);
  release();await oldFinished;
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const figures=await page.evaluate(async root=>(await import(root+'storage.js')).listFigures(),root);
  assert(figures.length===1&&figures[0].title==='Drehung','Late old response saved another figure or lost the new download');
  assert(mediaRequests===2,'Account change started unexpected extra media requests');
  assert(await page.locator('#cloudCancelUpload').isHidden(),'Old cleanup changed the newer download controls');
  assert(await page.locator('#cloudError').isHidden(),'Stale download reported an error into the new view');
  if(batch)assert((await page.locator('#cloudStatus').textContent()).includes('Fertig: 1 gespeichert'),'Old result overwrote the new result');
 } finally {release();}
}
