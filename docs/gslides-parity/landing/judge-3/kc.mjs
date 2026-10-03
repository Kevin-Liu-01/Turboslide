import { createRequire } from 'module';
const require = createRequire('/Users/kevinliu/repos/Turboslide-landing/package.json');
const { chromium } = require('playwright-core');
const S = '/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/judge3';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('file:///Users/kevinliu/repos/Turboslide-landing/docs/gslides-parity/landing/direction-c/index.html');
await page.waitForTimeout(3000);
const r = {};
const act = () => page.evaluate(() => { const a = document.activeElement; return (a.className || a.tagName).toString().slice(0, 40) + ' | ' + (a.getAttribute('aria-label') || a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50); });
// Tab to the h1
let found = false;
for (let i = 0; i < 14 && !found; i++) { await page.keyboard.press('Tab'); found = await page.evaluate(() => document.activeElement.matches('h1')); }
r.tabReachedH1 = found;
r.h1Attrs = await page.evaluate(() => { const h = document.querySelector('h1'); return { role: h.getAttribute('role'), label: h.getAttribute('aria-label'), roledesc: h.getAttribute('aria-roledescription'), tabindex: h.tabIndex }; });
r.status1 = await page.evaluate(() => document.querySelector('#play')?.innerText.match(/Title · x \d+ · y \d+ · -?\d+°/)?.[0]);
await page.screenshot({ path: `${S}/c-key-focus.png`, clip: { x: 200, y: 80, width: 1040, height: 680 } });
await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Shift+ArrowUp');
await page.waitForTimeout(500);
r.status2 = await page.evaluate(() => document.querySelector('#play')?.innerText.match(/Title · x \d+ · y \d+ · -?\d+°/)?.[0]);
r.msgAfterNudge = await page.evaluate(() => document.querySelector('#play .msg, #play [aria-live]')?.textContent.trim());
await page.keyboard.press('Enter');
await page.keyboard.press('End');
await page.keyboard.type(' today');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
r.h1After = await page.evaluate(() => document.querySelector('h1').textContent.trim());
r.menusMirror = await page.evaluate(() => [...document.querySelectorAll('#menus [data-id="h"], #menus .sl-b.t-h1')].map(e => e.textContent.trim()).slice(0, 2));
r.focusAfterEsc = await act();
await page.keyboard.press('Alt+ArrowRight');
await page.waitForTimeout(300);
r.status3 = await page.evaluate(() => document.querySelector('#play')?.innerText.match(/Title · x \d+ · y \d+ · -?\d+°/)?.[0]);
await page.keyboard.press('Meta+z'); await page.keyboard.press('Meta+z'); await page.keyboard.press('Meta+z');
await page.waitForTimeout(400);
r.h1AfterUndo = await page.evaluate(() => document.querySelector('h1').textContent.trim());
// Kit by keyboard
await page.focus('[data-kit="globex"]'); await page.keyboard.press('Enter'); await page.waitForTimeout(700);
r.kitMsg = await page.evaluate(() => [...document.querySelectorAll('#play [aria-live]')].map(e => e.textContent.trim()).filter(Boolean).join(' / '));
await page.focus('[data-kit="gt"]'); await page.keyboard.press('Enter'); await page.waitForTimeout(700);
// Menus by keyboard
await page.evaluate(() => document.querySelector('#menus').scrollIntoView({ block: 'center' }));
await page.waitForTimeout(1500);
await page.focus('#menubar [tabindex="0"]');
r.menuStart = await act();
for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight'); // to Tools
r.menuAt = await act();
await page.keyboard.press('Enter'); await page.waitForTimeout(300);
r.menuOpenFocus = await act();
r.toolsRows = await page.evaluate(() => [...document.querySelectorAll('[role=menu]:not([hidden]) [role^=menuitem]')].map(e => e.textContent.trim().replace(/\s+/g, ' ')).slice(0, 12));
// find Tailor row by ArrowDown
let tailor = false;
for (let i = 0; i < 12 && !tailor; i++) { tailor = await page.evaluate(() => /Tailor/.test(document.activeElement.textContent)); if (!tailor) await page.keyboard.press('ArrowDown'); }
r.reachedTailor = tailor;
await page.keyboard.press('Enter'); await page.waitForTimeout(500);
r.dialogFocus = await act();
await page.keyboard.type('Initech'); await page.waitForTimeout(300);
r.tailorCount = await page.evaluate(() => [...document.querySelectorAll('[role=dialog]:not([hidden])')].map(d => d.innerText.replace(/\s+/g, ' ').slice(0, 220)));
await page.keyboard.press('Enter'); await page.waitForTimeout(800);
r.afterTailor = await page.evaluate(() => document.querySelector('#menus')?.innerText.match(/Tailored for [^.]*/)?.[0]);
await page.screenshot({ path: `${S}/c-menus-tailor.png` });
// Agent typed command
await page.evaluate(() => document.querySelector('#agents').scrollIntoView({ block: 'center' }));
await page.waitForTimeout(1500);
await page.focus('#term-input');
await page.keyboard.type('block rotate title#h --to 12'); await page.keyboard.press('Enter'); await page.waitForTimeout(900);
await page.keyboard.type('slide delete mood'); await page.keyboard.press('Enter'); await page.waitForTimeout(600);
r.termTail = await page.evaluate(() => document.querySelector('#term-out').innerText.split('\n').filter(Boolean).slice(-10));
await page.click('[data-tr="mcp"]'); await page.focus('#term-input');
await page.keyboard.type('slide get title'); await page.keyboard.press('Enter'); await page.waitForTimeout(700);
r.mcpTail = await page.evaluate(() => document.querySelector('#term-out').innerText.split('\n').filter(Boolean).slice(-8));
await page.screenshot({ path: `${S}/c-agents-typed.png` });
// Versions
await page.evaluate(() => document.querySelector('#versions').scrollIntoView({ block: 'center' }));
await page.waitForTimeout(1500);
await page.focus('#ver-range');
await page.keyboard.press('Home'); await page.waitForTimeout(300);
r.verCaption = await page.evaluate(() => document.querySelector('#versions').innerText.match(/Slide \d[^\n]*/)?.[0]);
r.verMax = await page.evaluate(() => document.querySelector('#ver-range').max);
// Present by keyboard
await page.evaluate(() => document.querySelector('#present').scrollIntoView({ block: 'center' }));
await page.waitForTimeout(1500);
await page.focus('#present-go'); await page.keyboard.press('Enter'); await page.waitForTimeout(500);
r.presentFocus = await act();
const pres = [];
for (let i = 0; i < 6; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(250); pres.push(await page.evaluate(() => (document.querySelector('#present').innerText.match(/Slide \d of \d[^\n]*|The end of the show[^\n]*/) || [''])[0])); }
r.present = pres;
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
r.focusAfterPresent = await act();
r.errs = errs;
console.log(JSON.stringify(r, null, 1));
await browser.close();
