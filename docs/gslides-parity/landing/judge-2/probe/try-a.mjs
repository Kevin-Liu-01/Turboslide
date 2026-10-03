// Judge 2 tries direction A as a seller would: the hero title, Tailor, the agent run, Present.
import { openPage, load, wait, OUT } from './lib.mjs';
import { writeFileSync } from 'node:fs';
const t0 = Date.now();
const l0 = load();
const log = [];
const note = (k, v) => { log.push([((Date.now() - t0) / 1000).toFixed(1), k, v]); };
const { browser, page, errors } = await openPage({ d: 'a' });
await wait(5200); // the hero sequence ends at 4.9 s
// 1. The hero title: click, drag 160 px right, click again and type.
const h1 = page.locator('#hero-title'); const box = page.locator('.obj-hero-title');
const b = await box.boundingBox();
await page.mouse.click(b.x + 40, b.y + 20);
note('hero selected', await page.evaluate(() => !!document.querySelector('.is-selected')));
await page.mouse.move(b.x + 40, b.y + 20);
await page.mouse.down();
for (let i = 1; i <= 8; i++) await page.mouse.move(b.x + 40 + i * 20, b.y + 20 + i * 4);
await page.mouse.up();
const b2 = await box.boundingBox();
note('hero moved px', Math.round(b2.x - b.x));
await page.mouse.click(b2.x + b2.width - 6, b2.y + b2.height - 10);
await page.keyboard.press('End');
await page.keyboard.type(' for sellers', { delay: 30 });
await page.keyboard.press('Escape');
note('hero h1 text', (await h1.textContent()).replace(/\s+/g, ' ').trim());
await page.screenshot({ path: `${OUT}/a-hero-try.png`, clip: { x: 160, y: 60, width: 1120, height: 720 } });
console.log(JSON.stringify(log));
note('hero undo enabled', await page.evaluate(() => !document.querySelector('[data-undo="hero"]').disabled));
for (let i = 0; i < 2; i++) { if (await page.evaluate(() => !document.querySelector('[data-undo="hero"]').disabled)) await page.click('[data-undo="hero"]'); }
await wait(800);
note('hero after two Undo', (await h1.textContent()).replace(/\s+/g, ' ').trim());
// 2. Tailor.
await page.locator('#tailor-h').scrollIntoViewIfNeeded();
await page.fill('#tailor-to', 'Initech');
await page.keyboard.press('Enter');
await wait(1500);
note('tailor count', await page.textContent('[data-count]'));
note('tailor snack', await page.textContent('[data-snack-text]'));
note('Initech on page', await page.evaluate(() => (document.body.innerText.match(/Initech/g) || []).length));
const tailorBand = await page.locator('#tailor-h').evaluate((h) => { const s = h.closest('section') || h.parentElement; const r = s.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
await page.screenshot({ path: `${OUT}/a-tailor-try.png`, clip: { x: 160, y: Math.max(0, tailorBand.y), width: 1120, height: Math.min(700, tailorBand.h) } });
// 3. The agent run, three steps.
await page.locator('#agents-h').scrollIntoViewIfNeeded();
for (let i = 0; i < 3; i++) { await page.click('[data-run]'); await wait(2600); }
note('agents step', await page.textContent('[data-step]'));
note('history rows', await page.$$eval('[data-history] li', (li) => li.map((x) => x.innerText.replace(/\s+/g, ' ').trim())));
const agBand = await page.locator('#agents-h').evaluate((h) => { const s = h.closest('section') || h.parentElement; const r = s.getBoundingClientRect(); return { y: r.y, h: r.height }; });
await page.screenshot({ path: `${OUT}/a-agents-try.png`, clip: { x: 160, y: Math.max(0, agBand.y), width: 1120, height: Math.min(800, agBand.h) } });
// 4. Present.
await page.locator('#present-h').scrollIntoViewIfNeeded();
await page.click('[data-present-go]');
await wait(900);
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
await wait(300);
note('show count', await page.textContent('[data-show-count]'));
note('show notes', await page.textContent('[data-show-notes]'));
await page.screenshot({ path: `${OUT}/a-show-try.png` });
await page.keyboard.press('Escape');
await wait(600);
note('show hidden after Escape', await page.evaluate(() => document.querySelector('[data-show]').hidden));
await browser.close();
const out = { load: [l0, load()], seconds: (Date.now() - t0) / 1000, errors, log };
writeFileSync(`${OUT}/try-a.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1));
