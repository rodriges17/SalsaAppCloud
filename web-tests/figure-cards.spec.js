import {test} from '@playwright/test';
import {runFigureCardsCase} from './figure-cards-case.js';
test('cloud cards share geometry and keep their context in both themes',async({page})=>{
 await page.goto('/pwa/');await runFigureCardsCase(page,{root:'/pwa/',fixture:'/web-tests/fixtures/clip.mp4'});
});
import {runCloudCardLifetimeCase} from './figure-cards-case.js';
test('cloud preview requests respect collapse tabs and latest video selection',async({page})=>{
 await page.goto('/pwa/');await runCloudCardLifetimeCase(page,{root:'/pwa/',fixture:'/web-tests/fixtures/clip.mp4'});
});
