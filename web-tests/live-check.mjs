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
    await page.waitForFunction(() => document.documentElement.dataset.appVersion === '2026-10-20-dance-icon-v1');
    await page.getByRole('button', { name: 'Figur importieren', exact: true }).tap();
    assert.equal(await page.locator('#importChoiceDialog').isVisible(), true);
    const chooser = page.waitForEvent('filechooser');
    await page.locator('#packageFile').tap();
    await (await chooser).setFiles({ name: 'invalid.zip', mimeType: 'application/zip', buffer: Buffer.from('not a package') });
    await page.getByRole('heading', { name: 'Import nicht möglich', exact: true }).waitFor();
    await page.locator('#confirmOK').tap();
    await page.getByRole('button', { name: 'Figur importieren', exact: true }).tap();
    await page.screenshot({ path: `test-results/live/${name}-import.png` });
    await page.locator('#closeImportChoice').tap();
    assert.equal(await page.locator('#importChoiceDialog').isVisible(), false);
    assert.deepEqual(errors, []);
    console.log(`${name}: production touch -> visible file picker -> invalid ZIP feedback -> reopen/cancel OK`);
  } finally { await browser.close(); }
}
