import {test} from '@playwright/test';
import {PARITY_CASES,runParityCase} from './parity-cases.js';
test.use({serviceWorkers:'block'});
for(const scenario of PARITY_CASES)test('shared feature contract: '+scenario,async({page})=>{
 const errors=[];page.on('console',m=>{if(m.type()==='error'&&m.text().includes('Content Security Policy'))errors.push(m.text());});
 await page.goto('/pwa/');await page.waitForFunction(()=>document.documentElement.dataset.appVersion);await page.evaluate(()=>document.fonts.ready);
 await runParityCase(page,{root:'/pwa/',fixture:'/web-tests/fixtures/clip.mp4',scenario,consoleErrors:errors});
});
