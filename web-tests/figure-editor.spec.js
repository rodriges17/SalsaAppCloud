import { test, expect } from '@playwright/test';

async function start(page) {
  await page.goto('/pwa/');
  await expect(page.getByRole('heading', { name: 'Step by Step', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-offline-status', 'ready');
  await page.evaluate(async () => {
    const s = await import('/pwa/storage.js');
    const blob = await (await fetch('/web-tests/fixtures/clip.mp4')).blob();
    await s.saveFigure({ id: 'editor-test', title: 'Drehung', description: 'Original', tags: [], status: 'Neu' }, [{ id: 'editor-video', name: 'Video', blob, duration: 6, confirmed: true }]);
    dispatchEvent(new Event('focus'));
  });
  await expect(page.getByRole('button', { name: 'Optionen für Drehung', exact: true })).toBeVisible();
}
async function edit(page) {
  await page.getByRole('button', { name: 'Optionen für Drehung', exact: true }).click();
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  await expect(page.locator('#editorLoading')).toBeHidden();
  await expect(page.locator('#saveFigure')).toBeEnabled();
}
async function changeElsewhere(page) {
  await page.evaluate(async () => {
    const s = await import('/pwa/storage.js');
    const f = (await s.listFigures()).find(f => f.id === 'editor-test');
    const videos = await s.figureVideos(f);
    await s.saveFigure({ ...f, title: 'Anderer Stand', description: 'Extern' }, videos.map(v => ({ ...v, existing: true, confirmed: true })), f.revision);
  });
}

test('a storage conflict keeps the draft until a confirmed reload succeeds', async ({ page }) => {
  await start(page); await edit(page);
  await page.locator('#figureTitle').fill('Mein Entwurf');
  await changeElsewhere(page);
  await page.locator('#saveFigure').click();
  await expect(page.locator('#reloadEditor')).toBeVisible();
  await expect(page.locator('#saveFigure')).toBeDisabled();
  await expect(page.locator('#figureTitle')).toHaveValue('Mein Entwurf');
  await page.locator('#reloadEditor').click(); await page.locator('#confirmCancel').click();
  await expect(page.locator('#figureTitle')).toHaveValue('Mein Entwurf');
  await page.evaluate(() => {
    const getAll = IDBObjectStore.prototype.getAll;
    window.failEditorReload = true;
    IDBObjectStore.prototype.getAll = function (...args) {
      if (this.name === 'figures' && window.failEditorReload) throw Error('Test: Neuladen offline');
      return getAll.apply(this, args);
    };
  });
  await page.locator('#reloadEditor').click(); await page.locator('#confirmOK').click();
  await expect(page.locator('#editorError')).toContainText('Neuladen offline');
  await expect(page.locator('#figureTitle')).toHaveValue('Mein Entwurf');
  await expect(page.locator('#saveFigure')).toBeDisabled();
  await page.evaluate(() => window.failEditorReload = false);
  await page.locator('#reloadEditor').click(); await page.locator('#confirmOK').click();
  await expect(page.locator('#figureTitle')).toHaveValue('Anderer Stand');
  await page.locator('#figureDescription').fill('Nachgeladen und bearbeitet');
  await page.locator('#saveFigure').click(); await expect(page.locator('#editor')).not.toBeVisible();
  await page.reload(); await page.getByRole('button', { name: 'Optionen für Anderer Stand', exact: true }).click();
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  await expect(page.locator('#editorLoading')).toBeHidden();
  await expect(page.locator('#figureDescription')).toHaveValue('Nachgeladen und bearbeitet');
});

test('a saved figure retries only the failed overview without another write', async ({ page }) => {
  await start(page); await edit(page);
  await page.locator('#figureDescription').fill('Bleibt gespeichert');
  await page.evaluate(() => {
    window.failEditorOverview = true; window.editorFigureWrites = 0;
    const getAll = IDBObjectStore.prototype.getAll, put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.getAll = function (...args) {
      if (this.name === 'figures' && window.failEditorOverview) throw Error('Test: Übersicht offline');
      return getAll.apply(this, args);
    };
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'figures') window.editorFigureWrites++;
      return put.apply(this, args);
    };
  });
  await page.locator('#saveFigure').click();
  await expect(page.locator('#retryEditorRefresh')).toBeVisible();
  await expect(page.locator('#editorError')).toContainText('Figur ist gespeichert');
  await expect(page.locator('#figureTitle')).toBeDisabled();
  await page.locator('#retryEditorRefresh').click();
  await expect(page.locator('#retryEditorRefresh')).toBeEnabled();
  expect(await page.evaluate(() => window.editorFigureWrites)).toBe(1);
  await page.evaluate(() => window.failEditorOverview = false);
  await page.locator('#retryEditorRefresh').click();
  await expect(page.locator('#editor')).not.toBeVisible();
  expect(await page.evaluate(() => window.editorFigureWrites)).toBe(1);
  await page.reload(); await edit(page);
  await expect(page.locator('#figureDescription')).toHaveValue('Bleibt gespeichert');
});

test('opening an old overview reads fresh metadata while preserving input during media checks', async ({ page }) => {
  await start(page); await changeElsewhere(page);
  await page.evaluate(() => {
    const match = Cache.prototype.match;
    window.editorMediaWaiting = false;
    const gate = new Promise(resolve => window.releaseEditorMedia = resolve);
    Cache.prototype.match = async function (...args) {
      if (String(args[0]?.url ?? args[0]).includes('__private_media__')) {
        window.editorMediaWaiting = true;
        await gate;
      }
      return match.apply(this, args);
    };
  });
  await page.getByRole('button', { name: 'Optionen für Drehung', exact: true }).click();
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  await page.waitForFunction(() => window.editorMediaWaiting);
  await expect(page.locator('#figureDescription')).toBeEnabled();
  await page.locator('#figureDescription').fill('Während der Prüfung geschrieben');
  await expect(page.locator('#saveFigure')).toBeDisabled();
  await expect(page.locator('#pickVideos')).toBeDisabled();
  await page.evaluate(() => window.releaseEditorMedia());
  await expect(page.locator('#editorLoading')).toBeHidden();
  await expect(page.locator('#figureTitle')).toHaveValue('Anderer Stand');
  await expect(page.locator('#figureDescription')).toHaveValue('Während der Prüfung geschrieben');
  await page.locator('#saveFigure').click();
  await expect(page.locator('#editor')).not.toBeVisible();
});

test('a closed editor ignores late media errors after a new draft has opened', async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    const match = Cache.prototype.match;
    window.editorMediaWaiting = false;
    Cache.prototype.match = async function (...args) {
      if (String(args[0]?.url ?? args[0]).includes('__private_media__')) {
        window.editorMediaWaiting = true;
        await new Promise(resolve => window.failOldEditorMedia = resolve);
        window.oldEditorMediaReturned = true;
        throw Error('Verspäteter Medienfehler');
      }
      return match.apply(this, args);
    };
  });
  await page.getByRole('button', { name: 'Optionen für Drehung', exact: true }).click();
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  await page.waitForFunction(() => window.editorMediaWaiting);
  await page.locator('#editorBack').click(); await expect(page.locator('#editor')).not.toBeVisible();
  await page.locator('#openAddFigure').click(); await page.locator('#addFigure').click();
  await page.locator('#figureTitle').fill('Neuer Entwurf');
  await page.evaluate(() => window.failOldEditorMedia());
  await page.waitForFunction(() => window.oldEditorMediaReturned);
  await expect(page.locator('#figureTitle')).toHaveValue('Neuer Entwurf');
  await expect(page.locator('#editorError')).not.toBeVisible();
});
