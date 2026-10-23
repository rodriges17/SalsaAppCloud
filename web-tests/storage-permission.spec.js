import {test,expect} from '@playwright/test';
test('granted persistent storage is a status and not another permission request',async({page})=>{
 await page.addInitScript(()=>{
  window.mockPersistent=true;window.persistenceCalls=0;
  Object.defineProperty(navigator.storage,'persisted',{value:async()=>window.mockPersistent,configurable:true});
  Object.defineProperty(navigator.storage,'persist',{value:()=>{window.persistenceCalls++;return new Promise(resolve=>window.finishPersistence=resolve);},configurable:true});
 });
 await page.goto('/pwa/');await page.locator('#infoButton').click();
 await expect(page.locator('#storageDetails')).toContainText('Dauerhafter Speicher ist aktiv.');await expect(page.locator('#persistStorage')).toBeHidden();
 expect(await page.evaluate(()=>window.persistenceCalls)).toBe(0);
 await page.locator('#closeInfoTop').click();await page.evaluate(()=>window.mockPersistent=false);await page.locator('#infoButton').click();
 await expect(page.locator('#persistStorage')).toBeVisible();await page.locator('#persistStorage').click();
 await expect(page.locator('#persistStorage')).toBeDisabled();await expect(page.locator('#persistStorage')).toHaveAttribute('aria-busy','true');
 await page.evaluate(()=>{window.mockPersistent=true;window.finishPersistence(true);});
 await expect(page.locator('#persistStorage')).toBeHidden();await expect(page.locator('#storageDetails')).toContainText('Dauerhafter Speicher ist aktiv.');
 await page.locator('#closeInfoTop').click();await page.locator('#infoButton').click();await expect(page.locator('#persistStorage')).toBeHidden();
 expect(await page.evaluate(()=>window.persistenceCalls)).toBe(1);
});
test('a declined request can be retried and unsupported requests are hidden',async({page})=>{
 await page.addInitScript(()=>{
  Object.defineProperty(navigator.storage,'persisted',{value:async()=>false,configurable:true});
  Object.defineProperty(navigator.storage,'persist',{value:async()=>false,configurable:true});
 });
 await page.goto('/pwa/');await page.locator('#infoButton').click();await page.locator('#persistStorage').click();
 await expect(page.locator('#persistenceResult')).toContainText('nicht bestätigt');await expect(page.locator('#persistStorage')).toBeEnabled();
 await page.locator('#closeInfoTop').click();await page.evaluate(()=>Object.defineProperty(navigator.storage,'persist',{value:undefined,configurable:true}));
 await page.locator('#infoButton').click();await expect(page.locator('#persistStorage')).toBeHidden();
});
