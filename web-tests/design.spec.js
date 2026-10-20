import { test, expect } from '@playwright/test';
const host = 'http://127.0.0.1:4173';
async function start(page) {
  await page.goto('/pwa/'); await expect(page.getByRole('heading', { name: 'Step by Step', exact: true })).toBeVisible();
}
async function seed(page) {
  await page.evaluate(async () => {
    const s = await import('/pwa/storage.js'), bytes = await (await fetch('/web-tests/fixtures/clip.mp4')).blob();
    for (const [id, title, status] of [['design-1', 'Drehung', 'Am Üben'], ['design-2', 'Grundschritt', 'Sitzt']]) {
      await s.saveFigure({ id, title, status, description: 'Achte auf eine klare Führung und einen stabilen Rahmen.', tags: ['Standard'] }, [{ id: crypto.randomUUID(), name: 'Führung', blob: bytes.slice(0, bytes.size, 'video/mp4'), confirmed: true, duration: 6, width: 320, height: 180 }]);
    }
    window.dispatchEvent(new Event('focus'));
  });
  await expect(page.locator('.figure-card')).toHaveCount(2);
}
test('Step by Step defaults to Klar, persists Terrakotta and fonts work after offline reload', async ({ page, context }, info) => {
  await page.emulateMedia({ colorScheme: 'light' }); await start(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark'); await expect(page).toHaveTitle('Step by Step');
  await expect(page.locator('#offlineStatus')).toContainText('Offline bereit', { timeout: 30000 });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })); await document.fonts.ready; });
  await seed(page);
  expect(await page.locator('#addFigure').evaluate(button => button.getBoundingClientRect().width)).toBeGreaterThan(300);
  await page.screenshot({ path: info.outputPath('klar-figuren.png'), fullPage: true });
  await page.locator('#infoButton').tap(); await page.locator('#themeChoice').selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light'); await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f8f2ea');
  await page.screenshot({ path: info.outputPath('terrakotta-einstellungen.png') }); await page.locator('#closeInfoTop').tap();
  await page.screenshot({ path: info.outputPath('terrakotta-figuren.png'), fullPage: true });
  await context.setOffline(true); await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('.figure-card')).toHaveCount(2);
  expect(await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('16px Inter', 'ÄÖÜäöüß'); })).toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain('Inter');
  await page.locator('#infoButton').tap(); await expect(page.locator('#themeChoice')).toHaveValue('light'); await page.locator('#themeChoice').selectOption('dark'); await page.locator('#closeInfoTop').tap();
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test.describe('primary navigation and cloud layouts', () => {
  test.use({ serviceWorkers: 'block' });
  test('two destinations, ordered cloud tabs, version timeline, upload steps and safe player exit', async ({ page }, info) => {
    await page.addInitScript(() => localStorage.setItem('salsa-cloud-session:/pwa/:v1', JSON.stringify({ access_token: 'design-test-jwt', refresh_token: 'design-refresh', expires_at: Date.now() + 3600000 })));
    await page.route('**/pwa/cloud-config.js', route => route.fulfill({ contentType: 'application/javascript', body: `export const CLOUD_URL='${host}';export const CLOUD_KEY='test';export const CLOUD_FILE_LIMIT=50000000;` }));
    const revisions = [{ id: 'r2', title: 'Drehung', created_at: '2026-10-20T08:30:00Z', tags: [], videos: [] }, { id: 'r1', title: 'Drehung', created_at: '2026-10-19T02:15:00Z', tags: [], videos: [] }];
    await page.route(`${host}/functions/v1/cloud`, route => {
      const { action } = route.request().postDataJSON();
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(action === 'state' ? { me: { id: 'owner', email: 'test@example.test', upload_enabled: true, quota: 500000000 }, libraries: [{ id: 'l1', title: 'Tanzkurs', visibility: 'private', contribute: true }], own_figures: [{ id: 'f1', public_allowed: false, revisions }] } : { ok: true }) });
    });
    await start(page); await seed(page);
    const nav = page.locator('body > .bottom-nav'); await expect(nav.getByRole('button')).toHaveCount(2); await expect(nav.getByRole('button')).toHaveText(['Figuren', 'Cloud-Speicher']);
    await page.locator('#cloudButton').tap(); await expect(page.locator('#cloudDialog')).toBeVisible(); await expect(page.locator('.cloud-tabs button')).toHaveText(['Meine Figuren', 'Bibliotheken']);
    await expect(page.locator('#cloudDialog [data-nav=cloud]')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: 'Meine Cloud-Figuren', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Bibliotheken', exact: true }).tap();
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => window.stepAppearance.set(theme), theme);
      await page.screenshot({ path: info.outputPath(`${theme}-bibliotheken.png`) });
      await page.getByRole('button', { name: 'Meine Cloud-Figuren', exact: true }).tap(); await page.locator('.cloud-history summary').tap();
      await page.screenshot({ path: info.outputPath(`${theme}-cloud-figuren.png`) });
      await page.getByRole('button', { name: 'Bibliotheken', exact: true }).tap();
    }
    await page.locator('#cloudDialog [data-nav=figures]').tap(); await expect(page.locator('#cloudDialog')).not.toBeVisible();
    await page.getByRole('button', { name: 'Optionen für Drehung', exact: true }).tap(); await page.getByRole('button', { name: 'In Cloud veröffentlichen', exact: true }).tap();
    await expect(page.locator('.upload-step h4')).toHaveText(['1 · Video', '2 · Ziel', '3 · Hochladen']);
    for (const theme of ['dark', 'light']) { await page.evaluate(theme => window.stepAppearance.set(theme), theme); await page.screenshot({ path: info.outputPath(`${theme}-hochladen.png`), fullPage: true }); }
    await page.locator('#cloudDialog [data-nav=figures]').tap(); await page.getByRole('button', { name: 'Drehung lernen', exact: true }).tap();
    await expect(page.locator('#learningVideo')).toHaveJSProperty('videoWidth', 320);
    for (const theme of ['dark', 'light']) { await page.evaluate(theme => window.stepAppearance.set(theme), theme); await page.screenshot({ path: info.outputPath(`${theme}-lernen.png`) });
      if (theme === 'light') await expect(page.locator('#playerTitle')).toHaveCSS('color', 'rgb(255, 245, 237)');
      expect(await page.locator('.player-controls').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true); }
    await page.locator('#playerScreen [data-nav=cloud]').tap(); await expect(page.locator('#cloudDialog')).toBeVisible(); await expect(page.locator('#playerScreen')).not.toBeVisible();
    await expect(page.locator('#learningVideo')).not.toHaveAttribute('src');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
