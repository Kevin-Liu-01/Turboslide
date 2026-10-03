// Judge 3: direction A by keyboard only (focus jumps by element.focus() between widgets).
import { createRequire } from 'module';
const require = createRequire('/Users/kevinliu/repos/Turboslide-landing/package.json');
const { chromium } = require('playwright-core');
const S = '/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/judge3';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('file:///Users/kevinliu/repos/Turboslide-landing/docs/gslides-parity/landing/direction-a/index.html');
await page.waitForTimeout(5500);
const r = {};
const act = () => page.evaluate(() => { const a = document.activeElement; return (a.className || a.tagName).toString().slice(0, 50) + ' | ' + (a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 50); });
// Tab from the top to the hero title
let found = false;
for (let i = 0; i < 12 && !found; i++) { await page.keyboard.press('Tab'); found = await page.evaluate(() => document.activeElement.classList.contains('obj-hero-title')); }
r.tabReachedTitle = found;
r.titleFocusSelected = await page.evaluate(() => document.querySelector('.obj-hero-title').classList.contains('is-selected'));
await page.screenshot({ path: `${S}/a-key-focus.png`, clip: { x: 200, y: 100, width: 1040, height: 660 } });
await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Shift+ArrowDown');
r.afterNudge = await page.evaluate(() => { const o = document.querySelector('.obj-hero-title'); return [o.style.getPropertyValue('--x'), o.style.getPropertyValue('--y')]; });
await page.keyboard.press('Enter');
r.editing = await page.evaluate(() => document.querySelector('.obj-hero-title').classList.contains('is-editing'));
await page.keyboard.press('End');
await page.keyboard.type(' today');
await page.keyboard.press('Escape');
r.titleAfterType = await page.evaluate(() => document.getElementById('hero-title').textContent.trim().replace(/\s+/g, ' '));
r.focusAfterEscape = await act();
await page.keyboard.press('Meta+z');
r.afterUndo1 = await page.evaluate(() => document.getElementById('hero-title').textContent.trim().replace(/\s+/g, ' '));
await page.keyboard.press('Meta+z');
await page.waitForTimeout(800);
r.posAfterUndo2 = await page.evaluate(() => { const o = document.querySelector('.obj-hero-title'); return [o.style.getPropertyValue('--x'), o.style.getPropertyValue('--y')]; });
// rotate by keyboard
await page.keyboard.press(']');
r.rotateKey = await page.evaluate(() => document.querySelector('.obj-hero-title').style.getPropertyValue('--r') || getComputedStyle(document.querySelector('.obj-hero-title')).transform);
await page.keyboard.press('Meta+z');
// Tailor
await page.focus('#tailor-to');
await page.keyboard.type('Initech'); await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
r.snack = await page.evaluate(() => document.querySelector('.tailor-snack')?.textContent.trim().replace(/\s+/g, ' '));
r.names = await page.evaluate(() => [...new Set([...document.querySelectorAll('.cust')].map(s => s.textContent))].join(','));
await page.focus('#tailor-to'); await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); await page.keyboard.press('Enter');
await page.waitForTimeout(200);
r.emptyAnswer = await page.evaluate(() => document.querySelector('.tailor-count')?.textContent.trim());
// Filmstrip move by keyboard
await page.evaluate(() => document.querySelector('.card').focus());
r.cardFocus = await act();
await page.keyboard.press('Meta+ArrowRight');
await page.waitForTimeout(400);
r.orderAfterKey = await page.evaluate(() => [...document.querySelectorAll('.card')].map(c => c.dataset.card).join(' '));
// Agents
await page.focus('[data-run]');
for (let i = 0; i < 3; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(1600); }
r.runLabel = await page.evaluate(() => document.querySelector('[data-run]').textContent.trim());
r.history = await page.evaluate(() => [...document.querySelectorAll('[data-history] li')].map(l => l.textContent.trim().replace(/\s+/g, ' ')).slice(0, 8));
await page.evaluate(() => document.querySelector('.band-agents').scrollIntoView({ block: 'center' }));
await page.screenshot({ path: `${S}/a-agents-end.png` });
// Present by keyboard
await page.focus('[data-present-go]');
await page.keyboard.press('Enter');
await page.waitForTimeout(800);
r.showOpen = await page.evaluate(() => !document.querySelector('[data-show]').hidden);
r.focusInShow = await page.evaluate(() => !!document.activeElement.closest('[data-show]'));
r.showRole = await page.evaluate(() => { const s = document.querySelector('[data-show]'); return [s.getAttribute('role'), s.getAttribute('aria-modal'), s.getAttribute('aria-label')]; });
const trap = [];
for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); trap.push(await page.evaluate(() => !!document.activeElement.closest('[data-show]'))); }
r.trap = trap;
await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
await page.waitForTimeout(200);
r.showCounter = await page.evaluate(() => document.querySelector('[data-show]').innerText.replace(/\s+/g, ' ').slice(0, 200));
await page.screenshot({ path: `${S}/a-show.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
r.focusAfterExit = await act();
r.errs = errs;
console.log(JSON.stringify(r, null, 1));
await browser.close();
