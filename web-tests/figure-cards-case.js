// Shared visible contract for PWA and the Android assets.
export async function runFigureCardsCase(page,{root,fixture}){
 const assert=(condition,message)=>{if(!condition)throw Error(message);};
 const scope=new URL(root,page.url()).pathname;
 const rev={id:'card-rev',title:'Drehung mit langem Titel <Figur>',description:'Erste Zeile\nZweite Zeile',tags:['Pasito','pasito','Ein langer Tag'],videos:[{id:'card-video',name:'Führung',size:12000}],created_at:'2026-10-30T00:00:00Z'};
 await page.evaluate(scope=>localStorage.setItem(`salsa-cloud-session:${scope}:v1`,JSON.stringify({access_token:'cards',refresh_token:'unused',expires_at:Date.now()+3600000})),scope);
 await page.route('**/functions/v1/cloud',route=>{
  const {action}=route.request().postDataJSON();
  const result=action==='state'?{me:{id:'card-owner',upload_enabled:true},own_figures:[{id:'card-figure',owner_id:'card-owner',revisions:[rev]}],libraries:[{id:'card-library',title:'Kurs',visibility:'private'}]}:action==='library'?{library:{id:'card-library',title:'Kurs',visibility:'private'},entries:[{figure_id:'card-figure',published:rev}],manage:false}:action==='media_url'?{url:new URL(fixture,page.url()).href}:{tags:[],complete:true};
  return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.locator('#cloudButton').click();await page.locator('.cloud-own-summary').waitFor();
 for(const theme of ['dark','light']){
  await page.evaluate(theme=>window.stepAppearance.set(theme),theme);
  for(const width of [320,768]){
   await page.setViewportSize({width,height:900});
   const measure=async selector=>{
    await page.keyboard.press('Tab');await page.locator(selector).focus();
    return page.locator(selector).evaluate(n=>{
     const css=getComputedStyle(n),title=getComputedStyle(n.querySelector('h3')),picture=n.querySelector('.cloud-library-picture').getBoundingClientRect();
     return {height:n.getBoundingClientRect().height,padding:css.padding,font:title.fontSize,weight:title.fontWeight,outline:css.outlineWidth,picture:[picture.width,picture.height],fits:n.scrollWidth<=n.clientWidth+1};
    });
   };
   const own=await measure('.cloud-own-summary');
   await page.getByRole('button',{name:'Bibliotheken',exact:true}).click();await page.getByRole('link',{name:'Bibliothek „Kurs“ öffnen',exact:true}).click();
   const library=await measure('.cloud-library-summary');
   assert(own.fits&&library.fits,'Cloud summary overflows');
   assert(own.height===library.height&&own.padding===library.padding&&own.font===library.font&&own.weight===library.weight&&JSON.stringify(own.picture)===JSON.stringify(library.picture),'Cloud geometry differs');
   assert(own.outline===library.outline,'Cloud focus indication differs');
   assert(await page.locator('.cloud-order-number').innerText()==='1','Library numbering missing');
   await page.locator('.cloud-library-summary').click();await page.locator('.cloud-figure-description').waitFor();
   assert(await page.locator('.cloud-figure-description').innerText()===rev.description,'Description line breaks lost');
   assert(await page.locator('.cloud-figure-description').evaluate(n=>getComputedStyle(n).whiteSpace)==='pre-wrap','Description whitespace lost');
   await page.getByRole('button',{name:'< Zurück zu allen Bibliotheken',exact:true}).click();
   await page.getByRole('button',{name:'Meine Cloud-Figuren',exact:true}).click();await page.locator('.cloud-own-summary').waitFor();
  }
 }
}

export async function runCloudCardLifetimeCase(page,{root,fixture}){
 const assert=(value,message)=>{if(!value)throw Error(message);};
 const scope=new URL(root,page.url()).pathname,waiting=[];let mediaReads=0;
 const rev={id:'life-rev',title:'Vorschau',description:'Beschreibung',tags:[],videos:[{id:'a',name:'A',size:1000},{id:'b',name:'B',size:1000}],created_at:'2026-10-30T00:00:00Z'};
 await page.evaluate(scope=>localStorage.setItem(`salsa-cloud-session:${scope}:v1`,JSON.stringify({access_token:'cards',refresh_token:'unused',expires_at:Date.now()+3600000})),scope);
 await page.route('**/functions/v1/cloud',route=>{
  const {action,payload}=route.request().postDataJSON();
  const json=value=>route.fulfill({contentType:'application/json',body:JSON.stringify(value)});
  if(action==='media_url'){mediaReads++;waiting.push({release:()=>json({url:new URL(fixture,page.url()).href+'?preview='+payload.media}),fail:()=>route.fulfill({status:500,contentType:'application/json',body:'{"error":"Verspäteter Fehler"}'})});return;}
  return json(action==='state'?{me:{id:'owner',upload_enabled:true},own_figures:[{id:'life-figure',owner_id:'owner',revisions:[rev]}],libraries:[{id:'life-library',title:'Kurs',visibility:'private'}]}:action==='library'?{library:{id:'life-library',title:'Kurs',visibility:'private'},entries:[{figure_id:'life-figure',published:rev}],manage:false}:action==='poster_get'?{poster:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY9sAAAAASUVORK5CYII=',kind:'local',can_write:false}:{tags:[],complete:true});
 });
 const next=async()=>{const until=Date.now()+5000;while(!waiting.length&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,10));assert(waiting.length,'Preview request missing');return waiting.shift();};
 await page.locator('#cloudButton').click();await page.locator('.cloud-own-summary').waitFor();
 for(const kind of ['own','library']){
  if(kind==='library'){await page.getByRole('button',{name:'Bibliotheken',exact:true}).click();await page.getByRole('link',{name:'Bibliothek „Kurs“ öffnen',exact:true}).click();}
  const card=page.locator(kind==='own'?'.cloud-own-figure':'.cloud-library-figure'),summary=card.locator('summary');
  assert(await card.locator('video').count()===0,'Collapsed card contains a player');
  await summary.click();const play=card.getByRole('button',{name:'Video „A“ abspielen',exact:true});await play.waitFor();
  await play.click();const old=await next();await summary.click();await summary.click();await old.release();
  // A new selection supplies a completion barrier after the old response.
  await play.click();const first=await next();await card.getByRole('button',{name:'Video „B“ abspielen',exact:true}).click();const latest=await next();
  await latest.release();await card.locator('video').waitFor();await first.release();
  await page.waitForFunction(()=>[...document.querySelectorAll('.cloud-video-row')].length>0);
  assert(await card.locator('video').count()===1,'Multiple preview players survived');
  assert((await card.locator('video').getAttribute('src')).endsWith('?preview=b'),'An earlier response replaced the latest selection');
  await play.click();const failing=await next();
  if(kind==='own')await card.getByRole('tab',{name:'Verwalten',exact:true}).click();else await summary.click();
  await failing.fail();
  if(kind==='own')await card.getByRole('tab',{name:'Figur',exact:true}).click();else await summary.click();
  await play.click();const current=await next();await current.release();await card.locator('video').waitFor();
  assert(!await page.locator('#cloudError').isVisible(),'A closed preview reported a late error');
  if(kind==='own'){
   await page.locator('#cloudSettings').click();await page.locator('#infoDialog').waitFor();
   assert(await card.locator('video').count()===0,'Settings left a Cloud preview playing');
   await page.locator('#closeInfoTop').click();
   await play.click();const resumed=await next();await resumed.release();await card.locator('video').waitFor();
  }
  await summary.click();assert(await card.locator('video').count()===0,'Closing left a player');
 }
 assert(mediaReads===11,'Unexpected eager or duplicate preview requests');
}
