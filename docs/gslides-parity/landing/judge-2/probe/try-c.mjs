// Judge 2 tries direction C as a seller would: the hero slide, a kit, the menus (Share, Tailor),
// Present, the agent command line, Version history.
import { openPage, load, wait, OUT } from './lib.mjs';
import { writeFileSync } from 'node:fs';
const t0 = Date.now();
const l0 = load();
const log = [];
const note = (k, v) => { log.push([((Date.now() - t0) / 1000).toFixed(1), k, v]); };
const { browser, page, errors } = await openPage({ d: 'c' });
await wait(2200);
const status = () => page.textContent('#hero-status').then((t) => t.replace(/\s+/g, ' ').trim());
// 1. Hero: select, drag, kit.
const h = page.locator('#hero-sl [data-id="h"]');
const hb = await h.boundingBox();
await page.mouse.click(hb.x + 30, hb.y + 20);
note('hero select', await status());
await page.mouse.down();
for (let i = 1; i <= 8; i++) await page.mouse.move(hb.x + 30 - i * 30, hb.y + 20 + i * 6);
await page.mouse.up();
note('hero drag', await status());
await page.click('[data-kit="globex"]');
await wait(700);
note('kit', await status());
await page.screenshot({ path: `${OUT}/c-hero-try.png` });
// 2. Menus: Share (a describing row), then Tools > Tailor for a customer.
await page.locator('#menus-h').scrollIntoViewIfNeeded();
await wait(900);
const miniStatus = () => page.textContent('#mini-status').then((t) => t.replace(/\s+/g, ' ').trim());
await page.click('#menubar .mt[data-i="0"]');
await wait(300);
await page.click('.plate [role="menuitem"]:has-text("Share")');
await wait(500);
note('File > Share', await miniStatus());
await page.click('#menubar .mt:has-text("Tools")');
await wait(300);
await page.click('.plate [role="menuitem"]:has-text("Tailor")');
await wait(500);
const dlg = await page.$('.dialog');
note('tailor dialog text', dlg ? (await dlg.innerText()).replace(/\s+/g, ' ').slice(0, 300) : null);
await page.screenshot({ path: `${OUT}/c-menus-tailor-try.png`, clip: { x: 160, y: 0, width: 1120, height: 900 } });
await page.keyboard.press('Escape');
// 3. Present.
await page.locator('#present-h').scrollIntoViewIfNeeded();
await page.click('#present-go');
await wait(500);
for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowRight'); await wait(200); }
note('present of', (await page.textContent('#present-of')).trim());
await page.keyboard.press('Escape');
// 4. The agent command line: a typed tailor, help, and something it does not run.
await page.locator('#agents-h').scrollIntoViewIfNeeded();
await wait(900);
const out = () => page.$$eval('#term-out > *', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(-3));
await page.fill('#term-input', 'tailor --replace "Kestrel=Initech"');
await page.keyboard.press('Enter');
await wait(1200);
note('agent tailor', await out());
note('agent last write', (await page.textContent('#agent-last')).replace(/\s+/g, ' ').trim());
await page.fill('#term-input', 'slide delete mood');
await page.keyboard.press('Enter');
await wait(500);
note('agent unknown', await out());
await page.screenshot({ path: `${OUT}/c-agents-try.png`, clip: { x: 160, y: 0, width: 1120, height: 900 } });
// 5. Version history after all that.
await page.locator('#versions-h').scrollIntoViewIfNeeded();
await wait(900);
note('versions top rows', await page.$$eval('#versions li', (li) => li.slice(0, 5).map((x) => x.innerText.replace(/\s+/g, ' ').trim())));
await browser.close();
const res = { load: [l0, load()], seconds: (Date.now() - t0) / 1000, errors, log };
writeFileSync(`${OUT}/try-c.json`, JSON.stringify(res, null, 2));
console.log(JSON.stringify(res, null, 1));
