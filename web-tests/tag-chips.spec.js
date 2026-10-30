import { test, expect } from '@playwright/test';
test('tag chips fit one line, show overflow and recover after resizing', async ({ page }) => {
  await page.goto('/pwa/');
  await page.evaluate(async () => {
    const {createLocalCardsView}=await import('/pwa/figure-card.js');
    const view=createLocalCardsView({open:()=>{},status:()=> 'local',notify:()=>{}});
    const target=document.createElement('div');document.body.append(target);
    window.addTags=tags=>{
      view.reset();
      const {card}=view.card({id:'tags',title:'Figur',tags,status:'Neu',duration:1,videoIds:['one']});
      card.querySelector('.card-details').style.width='400px';
      target.replaceChildren(card);
    };
    window.addTags(['Pasito','Footwork','Salsa','Weiterer Tag']);
  });
  const chips = page.locator('.card-tag-chip:visible');
  const more = page.locator('.card-tags-more');
  await expect(chips).toHaveCount(3); await expect(more).toBeVisible();
  await expect(page.locator('.card-tag-chip svg path').first()).toHaveAttribute('d', 'm3 3 8 0 10 10-8 8L3 11V3Z');
  await page.locator('.card-details').evaluate(el => el.style.width = '120px');
  await expect(chips).toHaveCount(1); await expect(more).toBeVisible();
  const boxes = await page.locator('.card-tags').evaluate(row => [...row.children].filter(c => !c.hidden).map(c => ({center:c.getBoundingClientRect().top + c.getBoundingClientRect().height / 2, right:c.getBoundingClientRect().right, limit:row.getBoundingClientRect().right})));
  expect(Math.max(...boxes.map(b => b.center)) - Math.min(...boxes.map(b => b.center))).toBeLessThan(1);
  expect(boxes.every(b => b.right <= b.limit + 1)).toBe(true);
  await page.locator('.card-details').evaluate(el => el.style.width = '400px');
  await expect(chips).toHaveCount(3);
  await page.evaluate(() => window.addTags(['Pasito', 'Salsa']));
  await expect(chips).toHaveCount(2); await expect(more).toBeHidden();
  await page.evaluate(() => window.addTags(['Ein sehr langer Tag-Name mit <b>Text</b>', 'Salsa']));
  await page.locator('.card-details').evaluate(el => el.style.width = '120px');
  await expect(chips).toHaveCount(1); await expect(more).toBeVisible();
  await expect(page.locator('.card-tag-text').first()).toHaveText('Ein sehr langer Tag-Name mit <b>Text</b>');
  await expect(page.locator('.card-tag-chip b')).toHaveCount(0);
});
