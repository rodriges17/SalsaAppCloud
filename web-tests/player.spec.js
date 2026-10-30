import {test,expect} from '@playwright/test';
test.use({serviceWorkers:'block'});
async function openPlayer(page,count=1){
 await page.goto('/pwa/');await page.waitForFunction(()=>document.documentElement.dataset.appVersion);
 await page.evaluate(async count=>{
  const storage=await import('/pwa/storage.js'),blob=await(await fetch('/web-tests/fixtures/clip.mp4')).blob();
  await storage.saveFigure({id:'player-contract',title:'Player',description:'Beschreibung',tags:[],status:'Neu'},Array.from({length:count},(_,i)=>({id:'player-video-'+i,name:'Video '+(i+1),blob,confirmed:true,duration:6,width:320,height:180})));
  dispatchEvent(new Event('focus'));
 },count);
 await page.locator('[data-figure-id="player-contract"] .card-main').click();
 await page.waitForFunction(()=>{const v=document.querySelector('#learningVideo');return v.readyState>=2&&v.videoWidth>0&&document.querySelector('#videoLoading').hidden;});
}
async function swipe(page,up=true){await page.mouse.move(180,up?480:280);await page.mouse.down();await page.mouse.move(180,up?280:480,{steps:5});await page.mouse.up();}
test('first frame remains paused and loading errors can be retried',async({page})=>{
 await openPlayer(page);await expect(page.locator('#learningVideo')).toHaveJSProperty('paused',true);
 await page.screenshot({path:test.info().outputPath('compact-player.png')});
 await expect(page.getByRole('button',{name:'Loop',exact:true})).toHaveCount(0);
 await page.locator('#learningVideo').evaluate(v=>v.dispatchEvent(new Event('error')));
 await page.getByRole('button',{name:'Erneut versuchen',exact:true}).click();
 await expect(page.locator('#videoLoading')).toBeHidden();await expect(page.locator('#playerError')).toBeHidden();
 await expect(page.locator('#learningVideo')).toHaveJSProperty('paused',true);
});
test('denied browser fullscreen keeps custom controls, tap playback and Back navigation',async({page})=>{
 await openPlayer(page,2);
 await page.evaluate(()=>{document.querySelector('#playerScreen').requestFullscreen=()=>Promise.reject(Error('denied'));document.querySelector('#learningVideo').webkitEnterFullscreen=()=>{throw Error('native video fallback must not be used');};});
 await page.locator('#speed').selectOption('0.5');await page.locator('#learningVideo').evaluate(v=>v.currentTime=.3);
 await page.locator('#fullscreen').click();await expect(page.locator('#playerScreen')).toHaveClass(/is-immersive/);
 await expect(page.locator('#playerScreen .screen-header')).toHaveJSProperty('inert',true);
 await expect(page.getByRole('status').filter({hasText:'Browserleisten'})).toBeVisible();
 const stage=await page.locator('#videoStage').boundingBox();await swipe(page);
 await expect(page.locator('#playerScreen .screen-header')).toHaveJSProperty('inert',false);
 expect(await page.locator('#videoStage').boundingBox()).toEqual(stage);
 await page.screenshot({path:test.info().outputPath('fullscreen-controls.png')});
 await expect(page.locator('#playerVideoChoice')).toBeVisible();await expect(page.locator('#playerDescription')).toBeHidden();
 await page.locator('#playerVideoChoice').selectOption('1');await expect(page.locator('#playerTitle')).toHaveText('Video 2');
 await page.keyboard.press('Escape');await expect(page.locator('#playerScreen')).not.toHaveClass(/is-immersive/);
 await expect(page.locator('#playerScreen')).toBeVisible();await expect(page.locator('#speed')).toHaveValue('0.5');
 await page.locator('#playerBack').click();await expect(page.locator('#playerScreen')).toBeHidden();
});
test('container fullscreen preserves state and hides controls on inactivity but not while scrubbing',async({page})=>{
 await openPlayer(page);
 await page.clock.install();await page.locator('#fullscreen').click();await swipe(page);
 await page.locator('#playPause').click();await expect(page.locator('#learningVideo')).toHaveJSProperty('paused',false);
 const seek=await page.locator('#seek').boundingBox();await page.mouse.move(seek.x+seek.width*.3,seek.y+seek.height/2);await page.mouse.down();
 await page.clock.fastForward(5000);await expect(page.locator('#playerScreen .screen-header')).toHaveJSProperty('inert',false);
 await page.mouse.up();await page.clock.fastForward(4100);await expect(page.locator('#playerScreen .screen-header')).toHaveJSProperty('inert',true);
 await page.mouse.click(180,300);await expect(page.locator('#learningVideo')).toHaveJSProperty('paused',true);
 await page.keyboard.press('ArrowUp');await page.clock.fastForward(6000);await expect(page.locator('#playerScreen .screen-header')).toHaveJSProperty('inert',false);
 await page.locator('#seek').focus();await page.keyboard.press('ArrowDown');await expect(page.locator('#playerScreen .screen-header')).toHaveJSProperty('inert',false);
 await page.locator('#videoStage').focus();await page.keyboard.press('ArrowDown');await expect(page.locator('#playerScreen .screen-header')).toHaveJSProperty('inert',true);
 await page.keyboard.press('Escape');await expect(page.locator('#playerScreen')).toBeVisible();await expect(page.locator('#playerScreen')).not.toHaveClass(/is-immersive/);
});

test('browser Back leaves fullscreen before leaving the player and keeps position and A–B',async({page})=>{
 await openPlayer(page);await page.locator('#learningVideo').evaluate(v=>v.currentTime=1);await page.locator('#markA').click();
 await page.locator('#learningVideo').evaluate(v=>v.currentTime=3);await page.locator('#markB').click();
 await page.locator('#speed').selectOption('0.5');await page.locator('#fitCrop').click();
 await page.locator('#fullscreen').click();await page.goBack();
 await expect(page.locator('#playerScreen')).toBeVisible();await expect(page.locator('#playerScreen')).not.toHaveClass(/is-immersive/);
 await expect(page.locator('#speed')).toHaveValue('0.5');await expect(page.locator('#fitCrop')).toHaveText('Crop');
 expect(await page.locator('#learningVideo').evaluate(v=>v.currentTime)).toBeGreaterThanOrEqual(2.9);
 await expect(page.locator('#abStatus')).toHaveText('A 0:01 · B 0:03');
 await page.goBack();await expect(page.locator('#playerScreen')).toBeHidden();
});
