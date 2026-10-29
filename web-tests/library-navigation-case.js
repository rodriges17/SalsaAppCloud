// Public UI contract shared by the PWA and Android's bundled Cloud screen.
export async function runLibraryNavigationCase(page,{root,native,scenario}) {
 const assert=(value,message)=>{if(!value)throw Error(message);};
 const editing=scenario==='cloud-library-back';
 const library={id:'navigation-library',owner_id:'navigation-owner',title:'Bibliothek zum Üben',description:'Bibliotheksbeschreibung',visibility:'public',edit_version:'v1'};
 const entries=Array.from({length:10},(_,i)=>({figure_id:'navigation-'+i,published:{id:'revision-'+i,title:'Figur '+(i+1),description:i===9?'Eine ausführliche Beschreibung. '.repeat(40):'Kurze Beschreibung.',tags:['Salsa'],videos:Array.from({length:i===9?5:1},(_,j)=>({id:`video-${i}-${j}`,name:'Video '+(j+1),size:1000,type:'video/mp4'}))}}));
 const reads=[];
 if(editing){
  const scope=new URL(root,page.url()).pathname;
  await page.evaluate(scope=>localStorage.setItem(`salsa-cloud-session:${scope}:v1`,JSON.stringify({access_token:'navigation-token',refresh_token:'unused',expires_at:Date.now()+3600000})),scope);
 }
 await page.route('**/functions/v1/cloud',async route=>{
  const {action}=route.request().postDataJSON();let result={};
  if(action==='state'){reads.push(action);result={me:editing?{id:'navigation-owner',email:'owner@test.ch',upload_enabled:false,is_admin:false,used:0,quota:0}:null,libraries:[{...library,manage:editing}],own_figures:[]};}
  if(action==='library'){reads.push(action);result={library,manage:editing,members:[],entries};}
  await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.locator('#cloudButton').click();await page.locator('a.cloud-library-card').click();
 await page.locator('.cloud-library-summary').last().waitFor();
 if(editing){
  for(const exit of ['cancel','header','system']){
   await page.getByRole('button',{name:'Bibliothek bearbeiten',exact:true}).click();
   const count=reads.length;
   if(exit==='cancel')await page.getByRole('button',{name:'Abbrechen',exact:true}).click();
   else if(exit==='header')await page.locator('#cloudBack').click();
   else await page.evaluate(native=>native?window.AndroidAppUI.back():document.getElementById('cloudDialog').dispatchEvent(new Event('cancel',{cancelable:true})),native);
   await page.getByRole('button',{name:'Bibliothek bearbeiten',exact:true}).waitFor();
   assert(reads.length===count,`${exit} must return without Cloud reads`);
  }
  return;
 }
 const scroller=page.locator('#cloudDialog .cloud-scroll');
 const visibleEnd=()=>page.evaluate(()=>{
  const scroller=document.querySelector('#cloudDialog .cloud-scroll'),card=scroller.querySelector('.cloud-library-figure[open]');
  if(!card)return false;const v=scroller.getBoundingClientRect(),r=card.getBoundingClientRect();
  return r.bottom<=Math.min(v.bottom,innerHeight)+1&&r.bottom>=v.top;
 });
 for(const viewport of [{width:320,height:620},{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(viewport);
  const last=page.locator('.cloud-library-figure').last();
  if(await last.evaluate(el=>el.open))await last.locator('summary').click();
  await last.locator('summary').evaluate(el=>el.scrollIntoView({block:'end'}));
  const beforeHeight=await last.locator('summary').evaluate(el=>el.getBoundingClientRect().height);
  await last.locator('summary').click();
  await page.waitForFunction(()=>{const s=document.querySelector('#cloudDialog .cloud-scroll'),c=s.querySelector('.cloud-library-figure[open]');return c&&c.getBoundingClientRect().bottom<=Math.min(s.getBoundingClientRect().bottom,innerHeight)+1;});
  assert(await visibleEnd(),'The expanded last figure ends above fixed navigation');
  assert(await last.locator('.cloud-video-play').count()===5,'Long details retain all five videos');
  await last.locator('summary').evaluate(el=>el.click());
  assert(Math.abs((await last.locator('summary').evaluate(el=>el.getBoundingClientRect().height))-beforeHeight)<1,'Collapsed height stays unchanged');
  // Switching to an earlier figure must account for the previous details closing.
  await last.locator('summary').click();
  const previous=page.locator('.cloud-library-figure').nth(8);
  await previous.locator('summary').click();
  await page.waitForFunction(()=>document.querySelectorAll('.cloud-library-figure[open]').length===1);
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  assert(await visibleEnd(),'Switching figures reveals the new end');
  await previous.locator('summary').evaluate(el=>el.click());
 }
 // A short, fully visible detail panel should not move the scroller.
 await page.setViewportSize({width:390,height:1100});
 const first=page.locator('.cloud-library-figure').first();
 await first.locator('summary').evaluate(el=>el.scrollIntoView({block:'start'}));
 const before=await scroller.evaluate(el=>el.scrollTop);
 await first.locator('summary').click();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 assert(Math.abs((await scroller.evaluate(el=>el.scrollTop))-before)<1,'Already visible details do not jump');
}
