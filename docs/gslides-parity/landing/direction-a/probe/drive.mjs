import { createRequire } from 'module';
const require = createRequire('/Users/kevinliu/repos/Turboslide-landing/package.json');
const { chromium } = require('playwright-core');
const URL = 'file:///Users/kevinliu/repos/Turboslide-landing/docs/gslides-parity/landing/direction-a/index.html';
const OUT = '/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/dira';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const logs = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', e => logs.push('pageerror: ' + e.message));
await page.goto(URL);
await page.waitForTimeout(600);
const r = {};
// hero: click title (select), drag 200px right 60 down
const t = await page.locator('.obj-hero-title').boundingBox();
await page.mouse.click(t.x + 40, t.y + 30);
r.selected = await page.evaluate(() => document.querySelector('.obj-hero-title').classList.contains('is-selected'));
r.introDone = await page.evaluate(() => !document.documentElement.classList.contains('hero-intro'));
await page.mouse.move(t.x + 40, t.y + 30); await page.mouse.down();
for (let i = 1; i <= 10; i++) { await page.mouse.move(t.x + 40 + i * 20, t.y + 30 + i * 6); }
r.guideOn = await page.evaluate(() => [...document.querySelectorAll('.band-hero .guide')].map(g => g.classList.contains('is-on')));
await page.mouse.up();
r.afterDrag = await page.evaluate(() => { const o = document.querySelector('.obj-hero-title'); return [o.style.getPropertyValue('--x'), o.style.getPropertyValue('--y')]; });
// click again to edit, type
const t2 = await page.locator('.obj-hero-title').boundingBox();
await page.mouse.click(t2.x + t2.width - 30, t2.y + t2.height - 20);
r.editing = await page.evaluate(() => document.querySelector('.obj-hero-title').classList.contains('is-editing'));
await page.keyboard.type(' today');
await page.keyboard.press('Escape');
r.title = await page.evaluate(() => document.getElementById('hero-title').textContent);
r.undoEnabled = await page.evaluate(() => !document.querySelector('[data-undo=hero]').disabled);
await page.click('[data-undo=hero]');
r.titleAfterUndo = await page.evaluate(() => document.getElementById('hero-title').textContent);
await page.click('[data-undo=hero]');
await page.waitForTimeout(800);
r.posAfterUndo = await page.evaluate(() => { const o = document.querySelector('.obj-hero-title'); return [o.style.getPropertyValue('--x'), o.style.getPropertyValue('--y')]; });
// mood: scroll, select heading, resize east, rotate with shift
await page.evaluate(() => document.querySelector('.band-canvas').scrollIntoView());
await page.waitForTimeout(400);
const h = page.locator('.sheet-mood .obj[data-role=Title]');
const hb = await h.boundingBox();
await page.mouse.click(hb.x + 20, hb.y + 10);
const e = await page.locator('.band-canvas .sel-h[data-h=e]').boundingBox();
await page.mouse.move(e.x + 5, e.y + 5); await page.mouse.down(); await page.mouse.move(e.x + 85, e.y + 5, { steps: 5 }); await page.mouse.up();
r.wAfter = await h.evaluate(o => o.style.getPropertyValue('--w'));
const k = await page.locator('.band-canvas .sel-knob').boundingBox();
await page.keyboard.down('Shift');
await page.mouse.move(k.x + 5, k.y + 5); await page.mouse.down(); await page.mouse.move(k.x + 120, k.y + 40, { steps: 6 }); await page.mouse.up();
await page.keyboard.up('Shift');
r.rot = await h.evaluate(o => o.style.getPropertyValue('--r'));
r.layout = await page.textContent('[data-layout-state]');
// drag the heading off the plate
const hb2 = await h.boundingBox();
await page.mouse.move(hb2.x + hb2.width / 2, hb2.y + hb2.height / 2); await page.mouse.down(); await page.mouse.move(hb2.x - 300, hb2.y - 200, { steps: 8 }); await page.mouse.up();
// tailor
await page.evaluate(() => document.querySelector('.band-tailor').scrollIntoView());
await page.fill('#tailor-to', 'Globex');
await page.click('.tailor button[type=submit]');
await page.waitForTimeout(1300);
r.snack = await page.textContent('[data-snack-text]');
r.names = await page.evaluate(() => [...document.querySelectorAll('.cust')].map(s => s.textContent).join(','));
r.count = await page.textContent('[data-count]');
// reorder: drag first card to last
const c0 = await page.locator('.card').nth(0).boundingBox();
const c2 = await page.locator('.card').nth(2).boundingBox();
await page.mouse.move(c0.x + 100, c0.y + 80); await page.mouse.down(); await page.mouse.move(c2.x + 120, c2.y + 80, { steps: 12 }); await page.mouse.up();
await page.waitForTimeout(400);
r.order = await page.evaluate(() => [...document.querySelectorAll('.card')].map(c => c.dataset.card + ':' + c.querySelector('.sheet-count').textContent).join(' '));
// agents
await page.evaluate(() => document.querySelector('.band-agents').scrollIntoView());
for (let i = 0; i < 3; i++) { await page.click('[data-run]'); await page.waitForTimeout(1400); }
r.agentTitle = await page.evaluate(() => document.querySelector('[data-slot=title]').textContent);
r.rows = await page.evaluate(() => [...document.querySelectorAll('[data-slot=rows] b')].map(b => b.textContent).join(','));
r.counts = await page.evaluate(() => window.__dirA.deckSheets().map(s => s.querySelector('.sheet-count').textContent).join(' | '));
r.history = await page.evaluate(() => [...document.querySelectorAll('[data-history] li')].map(l => l.textContent).join(' || '));
// present
await page.evaluate(() => document.querySelector('.band-present').scrollIntoView({ block: 'center' }));
await page.waitForTimeout(500);
await page.keyboard.press('s');
await page.waitForTimeout(800);
r.showOpen = await page.evaluate(() => !document.querySelector('[data-show]').hidden);
await page.screenshot({ path: `${OUT}/drive-show.png` });
await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
r.showCount = await page.textContent('[data-show-count]');
r.showNotes = await page.textContent('[data-show-notes]');
await page.screenshot({ path: `${OUT}/drive-show2.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
r.showClosed = await page.evaluate(() => document.querySelector('[data-show]').hidden);
console.log(JSON.stringify(r, null, 1));
console.log(JSON.stringify(logs));
await browser.close();
