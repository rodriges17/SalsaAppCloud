import { chromium, webkit, devices } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const url = 'https://rodriges17.github.io/SalsaAppCloud/';
await mkdir('test-results/live', { recursive: true });
for (const [name, engine, options] of [
  ['chrome', chromium, { ...devices['Pixel 7'] }],
  ['webkit', webkit, { ...devices['iPhone 13'] }]
]) {
  const browser = await engine.launch(name === 'chrome' ? { channel: 'chrome' } : {});
  try {
    const context = await browser.newContext(options), page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => document.documentElement.dataset.appVersion === '2026-10-23-zip-save-v1');
    await page.getByRole('button', { name: 'Figur hinzufügen', exact: true }).tap();
    await page.getByRole('button', { name: 'Figur importieren', exact: true }).tap();
    assert.equal(await page.locator('#importChoiceDialog').isVisible(), true);
    const chooser = page.waitForEvent('filechooser');
    await page.locator('#packageFile').tap();
    await (await chooser).setFiles({ name: 'invalid.zip', mimeType: 'application/zip', buffer: Buffer.from('not a package') });
    await page.getByRole('heading', { name: 'Import nicht möglich', exact: true }).waitFor();
    await page.locator('#confirmOK').tap();
    await page.getByRole('button', { name: 'Figur hinzufügen', exact: true }).tap();
    await page.getByRole('button', { name: 'Figur importieren', exact: true }).tap();
    await page.screenshot({ path: `test-results/live/${name}-import.png` });
    await page.locator('#closeImportChoice').tap();
    assert.equal(await page.locator('#importChoiceDialog').isVisible(), false);
    await page.evaluate(async()=>{
      Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true});
      const {saveFigure}=await import('./storage.js');
      await saveFigure({id:'live-zip',title:'ZIP Liveprüfung',description:'',tags:[],status:'Neu'},[{id:'live-zip-video',name:'Video',blob:new Blob(['Live ZIP bytes'],{type:'video/mp4'}),confirmed:true,duration:1}]);
      window.dispatchEvent(new Event('focus'));
    });
    await page.locator('.card-options').tap();await page.getByRole('button',{name:'Figur teilen',exact:true}).tap();
    await page.locator('#preparePackage').tap();await page.locator('#downloadPackage').waitFor();
    const zipDownload=page.waitForEvent('download');await page.locator('#downloadPackage').tap();
    const zip=await zipDownload;assert.equal(await zip.failure(),null);assert.equal(zip.suggestedFilename(),'ZIP Liveprüfung.zip');
    await page.waitForFunction(()=>!document.querySelector('#downloadPackage').disabled);
    assert.match(await page.locator('#shareProgress').textContent(),/Download angefordert/);
    await page.screenshot({path:`test-results/live/${name}-zip-save.png`});
    await page.locator('#closeShare').tap();
    console.log(`${name}: production ZIP button -> download completed -> visible hand-off status OK`);
    assert.deepEqual(errors, []);
    console.log(`${name}: production touch -> visible file picker -> invalid ZIP feedback -> reopen/cancel OK`);
  } finally { await browser.close(); }
}
