import {test,expect} from '@playwright/test';
import {mediaContract,expectedMediaContract} from './media-contract.js';
test('media descriptors keep metadata lazy, coalesce reads, retry and renew sessions',async({page})=>{
 await page.goto('/pwa/');await expect(page.locator('#infoButton')).toBeVisible();
 expect(await mediaContract(page,'/pwa/')).toEqual(expectedMediaContract);
});
