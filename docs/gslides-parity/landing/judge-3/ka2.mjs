import { createRequire } from 'module';
const require = createRequire('/Users/kevinliu/repos/Turboslide-landing/package.json');
const { chromium } = require('playwright-core');
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto('file:///Users/kevinliu/repos/Turboslide-landing/docs/gslides-parity/landing/direction-a/index.html');
await page.waitForTimeout(1500);
await page.evaluate(() => document.querySelector('.band-agents').scrollIntoView({ block: 'center' }));
await page.focus('[data-run]');
const r = [];
for (let i = 0; i < 3; i++) {
  await page.keyboard.press('Enter');
  r.push(await page.evaluate(() => ({ active: (document.activeElement.className || document.activeElement.tagName).toString(), disabled: document.querySelector('[data-run]').disabled, label: document.querySelector('[data-run]').textContent.trim() })));
  await page.waitForTimeout(3500);
  r.push(await page.evaluate(() => ({ after: (document.activeElement.className || document.activeElement.tagName).toString(), disabled: document.querySelector('[data-run]').disabled, label: document.querySelector('[data-run]').textContent.trim(), steps: document.querySelectorAll('[data-history] li').length })));
}
// show then Escape without tabbing
await page.evaluate(() => document.querySelector('.band-present').scrollIntoView({ block: 'center' }));
await page.keyboard.press('s'); await page.waitForTimeout(700);
await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(200);
r.push(await page.evaluate(() => document.querySelector('[data-show]').innerText.replace(/\s+/g, ' ').slice(0, 160)));
await page.keyboard.press('Escape'); await page.waitForTimeout(700);
r.push(await page.evaluate(() => (document.activeElement.getAttribute('data-present-go') !== null ? 'Present button' : document.activeElement.tagName + ' ' + document.activeElement.className)));
console.log(JSON.stringify(r, null, 1));
await browser.close();
