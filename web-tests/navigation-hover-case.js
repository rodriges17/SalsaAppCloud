export async function runNavigationHoverCase(page, { root, native = false, cloud = true }) {
 const assert = (value, message) => { if (!value) throw new Error(message); };
 assert(await page.evaluate(()=>matchMedia('(hover: none) and (pointer: coarse)').matches),'Regression must run with a touch primary pointer');
 // Simulate the platform picker committing a selection after pointer activation.
 const sort=page.locator('#sort');
 await sort.dispatchEvent('pointerdown',{pointerType:'touch'});
 await sort.focus();
 await sort.evaluate(e=>{e.selectedIndex=(e.selectedIndex+1)%e.options.length;e.dispatchEvent(new Event('change',{bubbles:true}));});
 assert(await sort.evaluate(e=>getComputedStyle(e).outlineStyle==='none'&&getComputedStyle(e).boxShadow==='none'),'Sorting retained a selection frame');
 // Choosing the existing option produces no change event.
 await sort.focus();
 assert(await sort.evaluate(e=>getComputedStyle(e).outlineStyle==='none'&&getComputedStyle(e).boxShadow==='none'),'Unchanged sorting retained a selection frame');
 await sort.focus();await sort.press('ArrowDown');
 await sort.dispatchEvent('change');
 assert(await sort.evaluate(e=>document.activeElement===e),'Sorting removed keyboard focus');
 await sort.evaluate(e=>e.blur());
 const figures=page.locator('.overview + .bottom-nav [data-nav=figures]');
 // The overview navigation can be inside or immediately after the main element.
 const homeFigures=await figures.count()?figures:page.locator('nav.bottom-nav [data-nav=figures]').first();
 const trigger=cloud?page.locator('#cloudButton'):homeFigures;
 const background=await trigger.evaluate(e=>getComputedStyle(e).backgroundColor);
 const search=page.locator('#search');
 await page.evaluate(()=>{window.searchReturnFocuses=0;document.querySelector('#search').addEventListener('focus',()=>window.searchReturnFocuses++);});
 for(const way of cloud?['header','footer','system']:['settings']){
  await search.tap();await search.fill('Drehung');
  await page.evaluate(()=>{window.searchReturnFocuses=0;});
  if(cloud){
   await trigger.tap();await page.waitForFunction(()=>document.querySelector('#cloudDialog').open&&!document.querySelector('#cloudBack').disabled);
   if(way==='header')await page.locator('#cloudBack').tap();
   else if(way==='footer')await page.locator('#cloudDialog [data-nav=figures]').tap();
   else if(native)await page.evaluate(()=>AndroidAppUI.back());
   else await page.keyboard.press('Escape');
   await page.waitForFunction(()=>!document.querySelector('#cloudDialog').open);
  }else{
   await page.locator('#infoButton').tap();await page.locator('#closeInfoTop').tap();
  }
  assert(await page.evaluate(()=>document.activeElement!==document.querySelector('#search')&&window.searchReturnFocuses===0),'Returning restored focus to search and reopened the keyboard');
  assert(await search.inputValue()==='Drehung','Navigation changed the existing search filter');
  await homeFigures.tap();
  assert(await page.evaluate(()=>document.activeElement!==document.querySelector('#search')&&window.searchReturnFocuses===0),'The Figures navigation button focused search');
  // Force the hover state retained by touch browsers after a dialog restores
  // its trigger, rather than relying on a particular engine's timing.
  await trigger.hover();
  assert(await trigger.evaluate(e=>getComputedStyle(e).backgroundColor)===background,'An inactive navigation button retained the hover shading after returning');
  assert(await homeFigures.getAttribute('aria-current')==='page','Figures is not marked as the current page');
  if(cloud)assert(await trigger.getAttribute('aria-current')===null,'Cloud remained selected after returning');
 }
 await page.keyboard.press('Tab');await trigger.focus();
 assert(await trigger.evaluate(e=>e.matches(':focus-visible')&&getComputedStyle(e).outlineStyle!=='none'),'Keyboard focus indication was lost');
 // Keep the ordinary mouse affordance on desktop without loading a second app.
 const desktop=await page.context().browser().newContext({hasTouch:false,viewport:{width:1000,height:800}});
 try{
  const mouse=await desktop.newPage(),css=new URL(root+'styles.css',page.url()).href;
  await mouse.setContent(`<link rel="stylesheet" href="${css}"><nav class="bottom-nav"><button id="hoverProbe">Cloud-Speicher</button></nav>`);
  assert(await mouse.evaluate(()=>matchMedia('(hover: hover) and (pointer: fine)').matches),'Desktop fixture does not support mouse hover');
  assert(await mouse.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--selection').trim()!==''),'Desktop stylesheet did not load');
  await mouse.bringToFront();await mouse.mouse.move(0,0);
  await mouse.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const probe=mouse.locator('#hoverProbe'),before=await probe.evaluate(e=>getComputedStyle(e).backgroundColor);
  await probe.hover();
  await mouse.waitForFunction(before=>{const button=document.querySelector('#hoverProbe');return getComputedStyle(button).backgroundColor!==before;},before,{timeout:5000});
 }finally{await desktop.close();}
}
