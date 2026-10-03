// Judge 2 tries direction B as a seller would: the hero terminal, the gesture slide, Present, Export, Pause Motion.
import { openPage, load, wait, OUT } from './lib.mjs';
import { writeFileSync } from 'node:fs';
const t0 = Date.now();
const l0 = load();
const log = [];
const note = (k, v) => { log.push([((Date.now() - t0) / 1000).toFixed(1), k, v]); };
const { browser, page, errors } = await openPage({ d: 'b' });
await wait(3500);
note('first screen anims', await page.evaluate(() => document.getAnimations().length));
await page.screenshot({ path: `${OUT}/b-first-try.png` });
// 1. The hero terminal, typed by the visitor.
const lastLines = () => page.$$eval('#agent-term .term-log > *', (els) => els.map((e) => e.textContent.trim()).filter(Boolean).slice(-4));
await page.click('#cmd');
await page.keyboard.type('turboslide tailor --replace Acme=Northwind', { delay: 15 });
await page.keyboard.press('Enter');
await wait(1800);
note('tailor snack', (await page.textContent('.snack-text')).trim());
note('tailor term', await lastLines());
await page.fill('#cmd', 'help');
await page.keyboard.press('Enter');
await wait(600);
note('help term', await lastLines());
await page.fill('#cmd', 'turboslide slide delete 3');
await page.keyboard.press('Enter');
await wait(600);
note('unknown term', await lastLines());
await page.screenshot({ path: `${OUT}/b-hero-typed-try.png`, clip: { x: 160, y: 500, width: 1120, height: 400 } });
// 2. The gesture slide: drag the picture.
await page.locator('#work-sheet').scrollIntoViewIfNeeded();
await wait(400);
const pic = page.locator('#work-sheet .obj.pic');
const pb = await pic.boundingBox();
await page.mouse.click(pb.x + pb.width / 2, pb.y + pb.height / 2);
await page.mouse.down();
for (let i = 1; i <= 8; i++) await page.mouse.move(pb.x + pb.width / 2 - i * 25, pb.y + pb.height / 2 + i * 5);
await page.mouse.up();
await wait(700);
note('gesture log', await page.$$eval('#work-term .term-log > *', (els) => els.map((e) => e.textContent.trim()).filter(Boolean).slice(-4)));
await page.screenshot({ path: `${OUT}/b-gesture-try.png`, clip: { x: 160, y: Math.max(0, (await page.locator('#work-sheet').boundingBox()).y - 40), width: 1120, height: 560 } });
// 3. Present with the keys.
await page.locator('#h-present').scrollIntoViewIfNeeded();
await page.focus('.presenter');
for (let i = 0; i < 4; i++) { await page.keyboard.press('ArrowRight'); await wait(150); }
note('present count after 4 Right', (await page.textContent('.presenter .count')).trim());
// 4. Export: the seam and the loupe.
await page.locator('#compare').scrollIntoViewIfNeeded();
await wait(800);
const cb = await page.locator('#compare').boundingBox();
await page.mouse.move(cb.x + cb.width * 0.3, cb.y + cb.height * 0.2);
await wait(900);
note('loupe', (await page.textContent('.loupe-read')).trim());
await page.screenshot({ path: `${OUT}/b-export-try.png`, clip: { x: 160, y: Math.max(0, cb.y - 40), width: 1120, height: Math.min(860, cb.height + 80) } });
// 5. Pause Motion stops everything.
await page.evaluate(() => window.scrollTo(0, 0));
await wait(500);
await page.click('#pause-motion');
await wait(300);
const raf = await page.evaluate(() => new Promise((res) => { let n = 0; const o = window.requestAnimationFrame; let stop = false; const t = performance.now(); (function f() { if (performance.now() - t > 1000) return res({ pressed: document.querySelector('#pause-motion').getAttribute('aria-pressed'), label: document.querySelector('#pause-motion').textContent.trim(), anims: document.getAnimations().filter((a) => a.playState === 'running').length }); n++; o(f); })(); }));
note('after Pause Motion', raf);
await browser.close();
const out = { load: [l0, load()], seconds: (Date.now() - t0) / 1000, errors, log };
writeFileSync(`${OUT}/try-b.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1));
