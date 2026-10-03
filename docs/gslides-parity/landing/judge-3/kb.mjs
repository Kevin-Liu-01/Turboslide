import { createRequire } from 'module';
const require = createRequire('/Users/kevinliu/repos/Turboslide-landing/package.json');
const { chromium } = require('playwright-core');
const S = '/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/judge3';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { const raf = window.requestAnimationFrame.bind(window); window.__raf = 0; window.requestAnimationFrame = (cb) => { window.__raf++; return raf(cb); }; });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('file:///Users/kevinliu/repos/Turboslide-landing/docs/gslides-parity/landing/direction-b/index.html');
await page.waitForTimeout(4000);
const r = {};
const txt = sel => page.evaluate(s => document.querySelector(s)?.innerText.replace(/\s+/g, ' ').trim().slice(0, 240), sel);
r.agentCaption = await txt('#agent-desc');
r.rafHeroPerSec = await page.evaluate(async () => { const a = window.__raf; await new Promise(r => setTimeout(r, 2000)); return (window.__raf - a) / 2; });
await page.focus('#cmd');
await page.keyboard.type('tailor --replace Acme=Initech'); await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
r.snackAfterTailor = await txt('.snack');
r.stageTitle = await page.evaluate(() => [...document.querySelectorAll('.hero .s-h1, .hero h3, .hero .s-title, .stage [class*=title]')].map(e => e.textContent.trim()).filter(Boolean).slice(0, 4));
await page.keyboard.type('slide new --layout rows'); await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
await page.keyboard.type('frobnicate'); await page.keyboard.press('Enter');
await page.waitForTimeout(600);
await page.keyboard.type('help'); await page.keyboard.press('Enter');
await page.waitForTimeout(800);
r.termTail = await page.evaluate(() => { const t = document.querySelector('.term, [class*=term]'); return t ? t.innerText.split('\n').slice(-16) : null; });
await page.evaluate(() => document.querySelector('.hero').scrollIntoView({ block: 'end' }));
await page.screenshot({ path: `${S}/b-typed.png` });
r.rafAfterTyping = await page.evaluate(async () => { const a = window.__raf; await new Promise(r => setTimeout(r, 2000)); return (window.__raf - a) / 2; });
// Gestures by keyboard
await page.evaluate(() => document.querySelector('#canvas').scrollIntoView({ block: 'center' }));
await page.waitForTimeout(2500);
const obj = await page.$('#canvas [tabindex="0"]');
await obj.focus();
r.gestureFocus = await page.evaluate(() => document.activeElement.getAttribute('aria-label') || document.activeElement.textContent.trim().slice(0, 40));
await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Shift+ArrowDown');
await page.waitForTimeout(900);
r.actionsPanel = await page.evaluate(() => { const p = [...document.querySelectorAll('#canvas .term, #canvas [class*=term], #canvas [class*=log]')][0]; return p ? p.innerText.split('\n').filter(Boolean).slice(-6) : null; });
await page.screenshot({ path: `${S}/b-gesture-keys.png`, clip: { x: 200, y: 150, width: 1040, height: 620 } });
// Presenter by keyboard
await page.evaluate(() => document.querySelector('#present').scrollIntoView({ block: 'center' }));
await page.waitForTimeout(800);
await page.evaluate(() => document.querySelector('#present [tabindex="0"]').focus());
const pres = [];
for (let i = 0; i < 4; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(350); pres.push(await page.evaluate(() => (document.querySelector('#present').innerText.match(/Slide \d of \d/) || [''])[0])); }
r.presenter = pres;
// Export slider
await page.evaluate(() => document.querySelector('#export').scrollIntoView({ block: 'center' }));
await page.waitForTimeout(1500);
await page.focus('#export [role=slider]');
await page.keyboard.press('Home'); r.sliderHome = await page.evaluate(() => document.querySelector('#export [role=slider]').getAttribute('aria-valuenow') + ' ' + (document.querySelector('#export [role=slider]').getAttribute('aria-valuetext') || ''));
await page.keyboard.press('End'); r.sliderEnd = await page.evaluate(() => document.querySelector('#export [role=slider]').getAttribute('aria-valuenow'));
// People band keyboard typing
await page.evaluate(() => document.querySelector('#people').scrollIntoView({ block: 'center' }));
await page.waitForTimeout(800);
const ps = await page.$$('#people p[tabindex="0"]');
r.peopleFocusable = ps.length;
if (ps.length) { await ps[1].focus(); await page.keyboard.press('Enter'); await page.keyboard.type('Hello'); await page.waitForTimeout(600); r.peopleText = await page.evaluate(() => [...document.querySelectorAll('#people p[tabindex="0"]')].map(p => p.textContent.trim().slice(0, 40))); await page.keyboard.press('Escape'); }
await page.screenshot({ path: `${S}/b-people-keys.png` });
// Pause Motion
await page.evaluate(() => window.scrollTo(0, 0));
await page.click('#pause-motion');
await page.waitForTimeout(500);
r.pauseLabel = await page.evaluate(() => document.querySelector('#pause-motion').textContent.trim() + ' ' + document.querySelector('#pause-motion').getAttribute('aria-pressed'));
r.rafPaused = await page.evaluate(async () => { const a = window.__raf; await new Promise(r => setTimeout(r, 2000)); return { perSec: (window.__raf - a) / 2, running: document.getAnimations().filter(x => x.playState === 'running').length }; });
r.errs = errs;
console.log(JSON.stringify(r, null, 1));
await browser.close();
