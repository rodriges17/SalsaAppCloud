import { test, expect } from '@playwright/test';
import path from 'node:path';

const clip = path.resolve('web-tests/fixtures/clip.mp4');
const portrait = path.resolve('web-tests/fixtures/portrait.mp4');
async function start(page) {
  await page.goto('/pwa/'); await expect(page.getByRole('heading', { name: 'Step by Step' })).toBeVisible();
  await expect(page.locator('#offlineStatus')).toContainText('Offline bereit', { timeout: 30000 });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })); });
}
async function addFigure(page) {
  await page.locator('#openAddFigure').tap(); await page.locator('#addFigure').click();
  await page.locator('#figureTitle').fill('Ocho'); await page.locator('#figureDescription').fill('Links drehen');
  await page.locator('#figureTags').fill('Drehung, Anfänger');
  await page.locator('#videoFiles').setInputFiles([clip, portrait]);
  await expect(page.locator('#saveFigure')).toBeDisabled();
  await page.getByRole('button', { name: 'Alle neuen Videos prüfen' }).click();
  for (let i = 0; i < 2; i++) {
    await expect(page.locator('#acceptVideo')).toBeEnabled();
    await page.locator('#previewVideo').evaluate(v => { v.currentTime = 0.25; });
    await page.getByRole('button', { name: 'Video übernehmen', exact: true }).click();
    if (i === 0) await expect(page.locator('#previewTitle')).toHaveText('portrait');
  }
  await expect(page.locator('#preview')).not.toBeVisible();
  await page.locator('#saveFigure').click(); await expect(page.locator('#editor')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Ocho lernen' })).toBeVisible();
}
async function openEdit(page) { await page.getByRole('button', { name: 'Optionen für Ocho' }).click(); await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click(); await expect(page.locator('#editor')).toBeVisible(); }

test('multi-video import, player settings, loops, rotation, reload and offline playback', async ({ page, context }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await start(page); await addFigure(page);
  await page.screenshot({ path: info.outputPath('overview.png'), fullPage: true });
  await page.getByRole('button', { name: 'Ocho lernen' }).click();
  await expect(page.locator('#learningVideo')).toHaveJSProperty('videoWidth', 320);
  await page.locator('#playPause').click();
  await expect.poll(() => page.locator('#learningVideo').evaluate(v => v.paused)).toBe(false);
  await page.locator('#speed').selectOption('0.5'); await page.locator('#fitCrop').click(); await page.locator('#rotatePlayer').click();
  await expect(page.locator('#playerScreen')).toHaveClass(/is-landscape/); await expect(page.locator('#videoStage')).toHaveClass(/crop/);
  await page.locator('#playPause').click(); await page.locator('#learningVideo').evaluate(v => { v.currentTime = 1; }); await page.locator('#markA').click();
  await page.locator('#learningVideo').evaluate(v => { v.currentTime = 2.5; }); await expect(page.locator('#markB')).toBeEnabled(); await page.locator('#markB').click();
  await expect(page.locator('#abStatus')).toContainText('B 0:02');
  await page.locator('#fullLoop').click(); await expect(page.locator('#abStatus')).toHaveText('');
  await expect(page.locator('#fullLoop')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#playerVideoChoice').selectOption('1');
  await expect(page.locator('#learningVideo')).toHaveJSProperty('videoWidth', 180);
  await expect(page.locator('#learningVideo')).toHaveJSProperty('playbackRate', 0.5);
  await expect(page.locator('#fitCrop')).toHaveText('Crop'); await expect(page.locator('#fullLoop')).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: info.outputPath('player-landscape.png') });
  await page.locator('#rewind').click(); await expect(page.locator('#learningVideo')).toHaveJSProperty('currentTime', 0);
  await page.locator('#playerBack').click(); await expect(page.locator('#playerScreen')).not.toBeVisible();
  await expect(page.locator('#learningVideo')).toHaveJSProperty('readyState', 0); await page.reload();
  await expect(page.getByRole('button', { name: 'Ocho lernen' })).toBeVisible();
  await context.setOffline(true); await page.reload();
  await expect(page.getByRole('button', { name: 'Ocho lernen' })).toBeVisible();
  await page.getByRole('button', { name: 'Ocho lernen' }).click(); await page.locator('#playPause').click();
  await expect.poll(() => page.locator('#learningVideo').evaluate(v => v.currentTime)).toBeGreaterThan(0.1);
  expect(errors).toEqual([]);
});

test('rename, reorder, preview replacement cancellation, discard and deletion', async ({ page }) => {
  await start(page); await addFigure(page); await openEdit(page);
  await page.getByRole('textbox', { name: 'Name von Video 2', exact: true }).fill('Andere Perspektive');
  await page.getByRole('button', { name: 'Video 2 nach oben', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Name von Video 1', exact: true })).toHaveValue('Andere Perspektive');
  await page.locator('#saveFigure').click(); await expect(page.locator('#editor')).not.toBeVisible();
  await page.getByRole('button', { name: 'Ocho lernen' }).click(); await expect(page.locator('#learningVideo')).toHaveJSProperty('videoWidth', 180); await page.locator('#playerBack').click();
  await openEdit(page);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.draft-card').first().getByRole('button', { name: 'Ersetzen', exact: true }).click()]);
  await chooser.setFiles(clip); await expect(page.locator('#preview')).toBeVisible();
  await page.locator('#previewBack').click(); await expect(page.locator('#preview')).not.toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Name von Video 1', exact: true })).toHaveValue('Andere Perspektive');
  await page.locator('.draft-card').first().getByRole('button', { name: 'Entfernen', exact: true }).click();
  await expect(page.locator('.draft-card').getByRole('button', { name: 'Entfernen', exact: true })).toBeDisabled();
  await page.locator('#editorBack').click(); await page.getByRole('button', { name: 'Weiter bearbeiten', exact: true }).click(); await expect(page.locator('.draft-card')).toHaveCount(1);
  await page.locator('#editorBack').click(); await page.getByRole('button', { name: 'Änderungen verwerfen', exact: true }).click();
  await expect(page.locator('#editor')).not.toBeVisible(); await openEdit(page); await expect(page.locator('.draft-card')).toHaveCount(2);
  await page.locator('#editorBack').click(); await expect(page.locator('#editor')).not.toBeVisible();
  await page.getByRole('button', { name: 'Optionen für Ocho' }).click(); await page.getByRole('button', { name: 'Löschen', exact: true }).click(); await page.locator('#confirmOK').click();
  await expect(page.locator('#figureCount')).toHaveText('0 Figuren');
  expect(await page.evaluate(async () => {
    const { database } = await import('./storage.js'); const db = await database();
    const count = await new Promise(resolve => { const request = db.transaction('videos').objectStore('videos').count(); request.onsuccess = () => resolve(request.result); });
    const { MEDIA_CACHE } = await import('./storage.js');
    return { count, media: (await (await caches.open(MEDIA_CACHE)).keys()).length };
  })).toEqual({ count: 0, media: 0 });
});

test('invalid preview cannot be saved and metadata conflicts roll back new blobs', async ({ page }) => {
  await start(page); await page.locator('#openAddFigure').tap(); await page.locator('#addFigure').click(); await page.locator('#figureTitle').fill('Invalid');
  await page.locator('#videoFiles').setInputFiles({ name: 'broken.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not a movie') });
  await page.locator('.draft-card').getByRole('button', { name: 'Vorschau', exact: true }).click();
  await expect(page.locator('#previewError')).toBeVisible(); await expect(page.locator('#acceptVideo')).toBeDisabled();
  await page.locator('#previewBack').click(); await expect(page.locator('#saveFigure')).toBeDisabled();
  await page.locator('#editorBack').click(); await page.locator('#confirmOK').click(); await expect(page.locator('#editor')).not.toBeVisible();
  const result = await page.evaluate(async () => {
    const { saveFigure, listFigures, database, figureVideos } = await import('./storage.js');
    const first = { id: crypto.randomUUID(), title: 'Conflict', description: '', status: 'Neu', tags: [] };
    const draft = { id: crypto.randomUUID(), blob: new Blob(['bytes']), name: 'One', confirmed: true, duration: 1, width: 10, height: 10 };
    const saved = await saveFigure(first, [draft]); const records = await figureVideos(saved);
    await saveFigure({ ...first, title: 'New name' }, records.map(v => ({ ...v, existing: true, confirmed: true })), saved.revision);
    let rejected = false;
    try { await saveFigure(first, [{ ...draft, id: crypto.randomUUID() }], saved.revision); } catch { rejected = true; }
    const db = await database(); const count = await new Promise(resolve => { const r = db.transaction('videos').objectStore('videos').count(); r.onsuccess = () => resolve(r.result); });
    return { rejected, count, title: (await listFigures())[0].title };
  });
  expect(result).toEqual({ rejected: true, count: 1, title: 'New name' });
});

test('failure during second media copy rolls back all newly staged files', async ({ page }) => {
  await start(page);
  const result = await page.evaluate(async () => {
    const { saveFigure, listFigures, database, MEDIA_CACHE } = await import('./storage.js');
    const original = Cache.prototype.put; let count = 0;
    Cache.prototype.put = async function(request, response) {
      if (String(request).includes('__private_media__') && ++count === 2) throw new DOMException('Disk full', 'QuotaExceededError');
      return original.call(this, request, response);
    };
    let rejected = false;
    try {
      await saveFigure({ id: crypto.randomUUID(), title: 'Rollback', description: '', status: 'Neu', tags: [] }, [1, 2].map(i => ({ id: crypto.randomUUID(), name: String(i), blob: new Blob(['fake']), confirmed: true, duration: 1, width: 10, height: 10 })));
    } catch (error) { rejected = error.name === 'QuotaExceededError'; }
    finally { Cache.prototype.put = original; }
    const db = await database();
    const videos = await new Promise(resolve => { const r = db.transaction('videos').objectStore('videos').count(); r.onsuccess = () => resolve(r.result); });
    return { rejected, figures: (await listFigures()).length, videos, media: (await (await caches.open(MEDIA_CACHE)).keys()).length };
  });
  expect(result).toEqual({ rejected: true, figures: 0, videos: 0, media: 0 });
});


test('offline shell and saved media survive a restart before playback', async ({ page, context }) => {
  await start(page); await addFigure(page);
  await page.reload(); await expect(page.getByRole('button', { name: 'Ocho lernen' })).toBeVisible();
  await context.setOffline(true); await page.reload();
  await expect(page.getByRole('button', { name: 'Ocho lernen' })).toBeVisible();
  await page.getByRole('button', { name: 'Ocho lernen' }).click();
  await expect(page.locator('#learningVideo')).toHaveJSProperty('videoWidth', 320);
  await page.locator('#playPause').click();
  await expect.poll(() => page.locator('#learningVideo').evaluate(v => v.currentTime)).toBeGreaterThan(0.1);
});

async function exportPackage(page, info, subset = false) {
  await page.getByRole('button', { name: 'Optionen für Ocho', exact: true }).click();
  await page.getByRole('button', { name: 'Figur teilen', exact: true }).click();
  await expect(page.locator('#shareVideos input:checked')).toHaveCount(2);
  if (subset) await page.locator('#shareVideos input').first().uncheck();
  await page.locator('#preparePackage').click();
  await expect(page.locator('#downloadPackage')).toBeVisible();
  await page.screenshot({ path: info.outputPath('share.png') });
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#downloadPackage').click(); const download = await downloadPromise;
  const file = info.outputPath(subset ? 'subset.zip' : 'figure.zip'); await download.saveAs(file);
  await page.locator('#closeShare').click(); return file;
}
async function choosePackage(page, file) {
  await page.locator('#openAddFigure').tap();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Figur importieren', exact: true }).tap().then(async () => {
      await expect(page.locator('#importChoiceDialog')).toBeVisible();
      await page.locator('#packageFile').tap();
    })
  ]);
  await chooser.setFiles(file);
}
async function confirmImported(page, count) {
  await expect(page.locator('#editor')).toBeVisible(); await expect(page.locator('#saveFigure')).toBeDisabled();
  await expect(page.locator('#figureStatus')).toHaveValue('Neu');
  await page.locator('#reviewAll').click();
  for (let i = 0; i < count; i++) {
    await expect(page.locator('#acceptVideo')).toBeEnabled(); await page.locator('#acceptVideo').click();
    if (i + 1 < count) await expect(page.locator('#previewTitle')).toHaveText('portrait');
  }
  await expect(page.locator('#preview')).not.toBeVisible(); await page.locator('#saveFigure').click();
  await expect(page.locator('#editor')).not.toBeVisible();
}
test('ZIP download and offline import preserve original videos and detect repeated imports', async ({ page, context }, info) => {
  await start(page); await addFigure(page); await openEdit(page);
  await page.locator('#figureStatus').selectOption('Sitzt'); await page.locator('#saveFigure').click();
  await expect(page.locator('#editor')).not.toBeVisible();
  const file = await exportPackage(page, info);
  await context.setOffline(true); await page.reload();
  await choosePackage(page, file); await confirmImported(page, 2);
  await expect(page.locator('.figure-card')).toHaveCount(2);
  const copies = await page.evaluate(async () => {
    const { listFigures, figureVideos } = await import('./storage.js'); const { checksum } = await import('./package.js');
    return Promise.all((await listFigures()).map(async f => ({ title: f.title, description: f.description, tags: f.tags, status: f.status, fingerprint: f.importFingerprint, videos: await Promise.all((await figureVideos(f)).map(async v => ({ name: v.name, crc: await checksum(v.blob) }))) })));
  });
  const original = copies.find(f => f.status === 'Sitzt'), imported = copies.find(f => f.status === 'Neu');
  expect(imported.videos).toEqual(original.videos); expect(imported.tags).toEqual(original.tags); expect(imported.description).toBe(original.description); expect(imported.fingerprint).toBeTruthy();
  await choosePackage(page, file); await expect(page.locator('#confirmTitle')).toHaveText('Figur bereits importiert');
  await page.locator('#confirmCancel').click(); await expect(page.locator('#confirmDialog')).not.toBeVisible(); await expect(page.locator('#editor')).not.toBeVisible();
  await choosePackage(page, file); await page.locator('#confirmOK').click();
  await confirmImported(page, 2); await expect(page.locator('.figure-card')).toHaveCount(3);
});
test('ZIP selection, import discard and malformed package leave existing library untouched', async ({ page }, info) => {
  await start(page); await addFigure(page); const file = await exportPackage(page, info, true);
  await choosePackage(page, file); await expect(page.locator('#editor')).toBeVisible();
  await expect(page.locator('.draft-card')).toHaveCount(1); await expect(page.getByRole('textbox', { name: 'Name von Video 1', exact: true })).toHaveValue('portrait');
  await page.locator('#editorBack').click(); await page.locator('#confirmOK').click(); await expect(page.locator('#editor')).not.toBeVisible();
  await expect(page.locator('.figure-card')).toHaveCount(1);
  await choosePackage(page, { name: 'broken.zip', mimeType: 'application/zip', buffer: Buffer.from('broken') });
  await expect(page.locator('#confirmTitle')).toHaveText('Import nicht möglich'); await page.locator('#confirmOK').click();
  await expect(page.locator('.figure-card')).toHaveCount(1);
});
test('ZIP share uses a prepared file and keeps download available when native sharing fails', async ({ page }, info) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => true });
    Object.defineProperty(navigator, 'share', { value: async data => { window.sharedFile = { name: data.files[0].name, type: data.files[0].type }; throw new Error('Sharing unavailable'); } });
  });
  await start(page); await addFigure(page);
  await page.getByRole('button', { name: 'Optionen für Ocho' }).click(); await page.getByRole('button', { name: 'Figur teilen', exact: true }).click();
  await page.locator('#shareVideos input').first().uncheck(); await page.locator('#shareVideos input').last().uncheck(); await expect(page.locator('#preparePackage')).toBeDisabled();
  await page.locator('#shareVideos input').first().check(); await page.locator('#preparePackage').click();
  await expect(page.locator('#sendPackage')).toBeVisible(); await page.locator('#sendPackage').click();
  await expect(page.locator('#shareError')).toContainText('als Dokument'); await expect(page.locator('#downloadPackage')).toBeVisible();
  expect(await page.evaluate(() => window.sharedFile)).toEqual({ name: 'Ocho.zip', type: 'application/zip' });
});

test('touch import works after cancel, keyboard editing and returning from the player', async ({ page }, info) => {
  await start(page);
  await page.locator('#openAddFigure').tap(); await page.getByRole('button', { name: 'Figur importieren', exact: true }).tap();
  await expect(page.locator('#importChoiceDialog')).toBeVisible();
  await expect(page.locator('#packageFile')).toBeVisible();
  await page.locator('#closeImportChoice').tap();
  await expect(page.locator('#importChoiceDialog')).not.toBeVisible();
  await addFigure(page); const file = await exportPackage(page, info);
  await openEdit(page); await page.locator('#figureDescription').fill('Keyboard edit');
  await page.locator('#editorBack').tap(); await page.locator('#confirmOK').tap();
  await expect(page.locator('#editor')).not.toBeVisible();
  await page.getByRole('button', { name: 'Ocho lernen' }).tap();
  await expect(page.locator('#learningVideo')).toHaveJSProperty('videoWidth', 320);
  await page.locator('#playerBack').tap();
  await choosePackage(page, file); await confirmImported(page, 2);
  await expect(page.locator('.figure-card')).toHaveCount(2);
});

test('installed shell update bypasses stale HTTP CSS and preserves offline videos', async ({ page, context }, info) => {
  const id = `${info.project.name}-${Date.now()}`, scope = `/upgrade/${id}/`;
  await page.goto(scope);
  await expect(page.locator('#offlineStatus')).toContainText('Offline bereit', { timeout: 30000 });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })); });
  await expect(page.locator('html')).toHaveAttribute('data-app-version', 'qa-legacy-shell');
  await expect(page.locator('#importFigure')).toHaveCSS('pointer-events', 'none');
  await addFigure(page);
  await page.request.post(`/__qa/upgrade/${id}`);
  await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
  await expect(page.locator('#updateNotice')).toBeVisible();
  // An update must not throw away a draft. It is applied from the overview.
  await page.locator('#openAddFigure').tap(); await page.locator('#addFigure').tap(); await page.locator('#figureTitle').fill('Keep my draft');
  await page.evaluate(() => document.getElementById('applyUpdate').click());
  await expect(page.locator('#figureTitle')).toHaveValue('Keep my draft');
  await page.locator('#editorBack').tap(); await page.locator('#confirmOK').tap();
  await expect(page.locator('#editor')).not.toBeVisible();
  await page.locator('#applyUpdate').tap();
  await expect(page.locator('html')).toHaveAttribute('data-app-version', '2026-10-22-nav-logo-v1');
  await expect(page.locator('#importFigure')).toHaveCSS('pointer-events', 'auto');
  await expect(page.locator('.figure-card')).toHaveCount(1);
  const file = await exportPackage(page, info);
  await context.setOffline(true); await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-app-version', '2026-10-22-nav-logo-v1');
  await page.getByRole('button', { name: 'Ocho lernen' }).tap();
  await expect(page.locator('#learningVideo')).toHaveJSProperty('videoWidth', 320);
  await page.locator('#playPause').tap();
  await expect.poll(() => page.locator('#learningVideo').evaluate(v => v.currentTime)).toBeGreaterThan(0.1);
  await page.locator('#playerBack').tap();
  await choosePackage(page, file); await confirmImported(page, 2);
  await expect(page.locator('.figure-card')).toHaveCount(2);
});


test('installation and storage opens at the beginning on first open and reopen', async ({ page }) => {
  await start(page);
  const dialog = page.locator('#infoDialog');
  for (let i = 0; i < 2; i++) {
    await page.locator('#infoButton').tap();
    await expect(page.locator('#infoTitle')).toBeFocused();
    await expect.poll(() => dialog.evaluate(node => node.scrollTop)).toBe(0);
    await expect(page.locator('#infoTitle')).toBeInViewport();
    await page.locator('#closeInfo').tap();
    await expect(dialog).not.toBeVisible();
  }
});
