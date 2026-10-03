import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('/Users/kevinliu/repos/Turboslide-landing/package.json');
const { chromium } = require('playwright-core');
const BASE = 'file:///Users/kevinliu/repos/Turboslide-landing/docs/gslides-parity/landing/direction-a/index.html';
const OUT = '/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/dira/frames';
fs.mkdirSync(OUT, { recursive: true });
const K = 10;
const which = (process.argv[2] || '').split(',');
const browser = await chromium.launch();

async function open({ w = 1440, h = 900, scheme = 'light', query = `?slow=${K}`, touch = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + query);
  await page.waitForTimeout(500);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Animation.enable');
  return { ctx, page, cdp, errs };
}
const slow = (cdp) => cdp.send('Animation.setPlaybackRate', { playbackRate: 1 / K });
async function box(page, sel, pad = 12) {
  const b = await page.locator(sel).first().boundingBox();
  return { x: Math.max(0, Math.floor(b.x - pad)), y: Math.max(0, Math.floor(b.y - pad)), width: Math.ceil(b.width + pad * 2), height: Math.ceil(b.height + pad * 2) };
}
function save(name, title, frames) {
  const list = frames.map((f, i) => { const file = `${OUT}/${name}-${String(i).padStart(2, '0')}.png`; fs.writeFileSync(file, f.buf); return { file, label: f.label }; });
  fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify({ name, title, frames: list }, null, 1));
  console.log('saved', name, list.length);
}
/* timed frames in animation time: real time is K times longer */
async function timed(page, clip, times, trigger, k = K) {
  const frames = [];
  await trigger();
  const t0 = Date.now();
  for (const t of times) {
    const wait = t0 + t * k - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
    const at = (Date.now() - t0) / k;
    frames.push({ buf: await page.screenshot(clip ? { clip } : {}), label: `${Math.round(at)} ms` });
  }
  return frames;
}

if (which.includes('intro')) {
  const { ctx, page, cdp, errs } = await open({ query: `?slow=${K}&hold=1` });
  await slow(cdp);
  const clip = await box(page, '[data-deck="hero"]', 8);
  const frames = await timed(page, clip, [0, 150, 330, 800, 1300, 2000, 2800, 3600, 4520, 4900], () => page.evaluate(() => window.__dirA.heroIntro()));
  save('hero-intro', 'M1 to M4. The hero slide builds once: rails out of their crosses (600 ms, expo.out, 60 ms apart), the caret blinks once, the subtitle is typed (34 to 60 ms a key, 280 ms after a stop), the caret holds 400 ms and leaves at 4,910 ms. Animation time, captured at a tenth of speed.', frames);
  console.log(errs); await ctx.close();
}

if (which.includes('heroedit')) {
  const { ctx, page, errs } = await open({ query: '' });
  await page.evaluate(() => window.__dirA.finishIntro());
  const clip = await box(page, '.band-hero .stage', 40);
  clip.y = Math.max(0, clip.y - 10);
  const frames = [];
  const t0 = Date.now();
  const shot = async (label) => { console.log(label, await page.evaluate(() => [scrollY, document.activeElement.tagName])); frames.push({ buf: await page.screenshot({ clip }), label: `${label}` }); };
  await shot('rest');
  const t = await page.locator('.obj-hero-title').boundingBox();
  await page.mouse.click(t.x + 60, t.y + 40);
  await shot('click: selected, the Title chip');
  await page.mouse.move(t.x + 60, t.y + 40); await page.mouse.down();
  // move so the box centre lands on the slide centre (800 units): the guide shows
  const sheet = await page.locator('[data-deck="hero"]').boundingBox();
  const s = (sheet.width - 2) / 1600;
  const cxNow = t.x + t.width / 2;
  const target = sheet.x + 1 + 800 * s;
  for (let i = 1; i <= 8; i++) await page.mouse.move(t.x + 60 + ((target - cxNow) * i) / 8, t.y + 40 + (-60 * i) / 8);
  await shot('drag: the centre guide');
  await page.mouse.up();
  await shot('release');
  const t2 = await page.locator('.obj-hero-title').boundingBox();
  await page.mouse.click(t2.x + t2.width * 0.62, t2.y + t2.height * 0.8);
  await page.keyboard.press('End');
  await shot('second click: the caret');
  await page.keyboard.type(' today', { delay: 60 });
  await shot('typed');
  await page.keyboard.press('Escape');
  await page.click('[data-undo=hero]');
  await shot('Undo: the words');
  await page.click('[data-undo=hero]');
  await page.waitForTimeout(160);
  await shot('Undo: the place, 160 ms in');
  await page.waitForTimeout(600);
  await shot('Undo: settled');
  save('hero-edit', 'M6 to M9. The hero slide edited as in the editor: select, drag to the centre guide, type in place, Undo twice (the move returns on the move curve). Real time.', frames);
  console.log(errs); await ctx.close();
}

if (which.includes('develop')) {
  for (const scheme of ['light', 'dark']) {
    const { ctx, page, cdp, errs } = await open({ scheme });
    await page.evaluate(() => window.__dirA.finishIntro());
    await slow(cdp);
    const top = await page.evaluate(() => document.querySelector('[data-deck="mood"]').getBoundingClientRect().top + scrollY);
    const frames = await timed(page, null, [0, 300, 600, 900, 1200, 1500, 1800, 2100, 2400], async () => {
      await page.evaluate((y) => window.scrollTo(0, y - 120), top);
    });
    // clip after the scroll
    const clip = await box(page, '[data-deck="mood"]', 4);
    // re-crop the frames: take them again from the stored full viewport shots
    save(`mood-develop-${scheme}`, `M5. The mood picture develops through the 8 by 8 Bayer screen: the tone rises from 0 over 2400 ms on smoothstep and the cells switch in Bayer order (${scheme}). Animation time, captured at a tenth of speed.`, frames.map(f => ({ ...f, clip })));
    fs.writeFileSync(`${OUT}/mood-develop-${scheme}.clip.json`, JSON.stringify(clip));
    console.log(errs); await ctx.close();
  }
}

if (which.includes('canvas')) {
  const { ctx, page, cdp, errs } = await open();
  await page.evaluate(() => window.__dirA.finishIntro());
  await page.evaluate(() => document.querySelector('[data-deck="mood"]').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(24800);
  const clip = await box(page, '.band-canvas .stage', 40);
  clip.height += 50;
  const frames = [];
  const shot = async (label) => frames.push({ buf: await page.screenshot({ clip }), label });
  const h = page.locator('.sheet-mood .obj[data-role=Title]');
  const hb = await h.boundingBox();
  await page.mouse.click(hb.x + 30, hb.y + 12);
  await shot('select the heading');
  const e = await page.locator('.band-canvas .sel-h[data-h=e]').boundingBox();
  await page.mouse.move(e.x + 5, e.y + 5); await page.mouse.down(); await page.mouse.move(e.x - 60, e.y + 5, { steps: 6 }); await page.mouse.up();
  await shot('east handle: narrower, the words wrap');
  const hb2 = await h.boundingBox();
  await page.mouse.move(hb2.x + hb2.width / 2, hb2.y + hb2.height / 2); await page.mouse.down();
  await page.mouse.move(hb2.x + hb2.width / 2 - 360, hb2.y + hb2.height / 2 - 250, { steps: 10 });
  await page.mouse.up();
  await shot('drag off the plate: Layout reads Canvas');
  const k = await page.locator('.band-canvas .sel-knob').boundingBox();
  await page.keyboard.down('Shift');
  await page.mouse.move(k.x + 5, k.y + 5); await page.mouse.down();
  await page.mouse.move(k.x + 40, k.y + 6, { steps: 4 });
  await shot('rotate with Shift: the chip reads the angle');
  await page.mouse.up(); await page.keyboard.up('Shift');
  await shot('released');
  await slow(cdp);
  await page.click('[data-undo=canvas]');
  await page.waitForTimeout(150 * K);
  await shot('Undo: the turn, 150 ms in');
  await page.waitForTimeout(500 * K);
  await page.click('[data-undo=canvas]');
  await page.waitForTimeout(250 * K);
  await shot('Undo: the move, 250 ms in');
  await page.waitForTimeout(600 * K);
  await page.click('[data-undo=canvas]');
  await page.waitForTimeout(700 * K);
  await shot('Undo: the layout is back (Mood)');
  save('canvas-edit', 'M6 to M8. The example deck\'s mood slide: resize, drag the heading off the plate (the slide becomes a canvas), rotate in 15 degree steps, then Undo three times on the move curve. Undo frames in animation time.', frames);
  console.log(errs); await ctx.close();
}

if (which.includes('tailor')) {
  const { ctx, page, cdp, errs } = await open();
  await page.evaluate(() => window.__dirA.finishIntro());
  await page.evaluate(() => document.querySelector('.band-tailor').scrollIntoView({ block: 'start' }));
  await page.evaluate(() => window.scrollBy(0, -40));
  await page.waitForTimeout(300);
  await page.fill('#tailor-to', 'Globex');
  await slow(cdp);
  const clip = await box(page, '.band-tailor .col', 0);
  const frames = await timed(page, clip, [0, 60, 120, 230, 340, 450, 700, 1000, 1200], () => page.click('.tailor button[type=submit]'));
  save('tailor-apply', 'M10. Tailor for a customer: Apply sets each name in reading order, 55 ms apart, lit as selected text for 900 ms, then unlit over 160 ms; the count and the snackbar use the product\'s words. Animation time, captured at a tenth of speed.', frames);
  console.log(errs); await ctx.close();
}

if (which.includes('reorder')) {
  const { ctx, page, cdp, errs } = await open();
  await page.evaluate(() => window.__dirA.finishIntro());
  await page.evaluate(() => document.querySelector('[data-strip]').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  const clip = await box(page, '[data-strip]', 30);
  await slow(cdp);
  const frames = [];
  const shot = async (label) => frames.push({ buf: await page.screenshot({ clip }), label });
  await shot('rest');
  const c0 = await page.locator('.card').nth(0).boundingBox();
  const c2 = await page.locator('.card').nth(2).boundingBox();
  await page.mouse.move(c0.x + 100, c0.y + 80); await page.mouse.down();
  await page.mouse.move(c0.x + 110, c0.y + 74, { steps: 2 });
  await shot('picked up');
  await page.mouse.move(c0.x + 100 + (c2.x - c0.x) * 0.55, c0.y + 64, { steps: 6 });
  await page.waitForTimeout(100 * K);
  await shot('past slide 4: it makes room, 100 ms in');
  await page.waitForTimeout(150 * K);
  await page.mouse.move(c2.x + 90, c0.y + 66, { steps: 6 });
  await page.waitForTimeout(220 * K);
  await shot('over the last place');
  await page.mouse.up();
  const t0 = Date.now();
  await shot(`release, ${Math.round((Date.now() - t0) / K)} ms`);
  await page.waitForTimeout(110 * K - (Date.now() - t0));
  await shot(`settling, ${Math.round((Date.now() - t0) / K)} ms`);
  await page.waitForTimeout(260 * K - (Date.now() - t0));
  await shot('settled: the counters read 3, 4, 5 again');
  save('filmstrip-move', 'M11 and M12. A slide picked up and moved: the others make room (200 ms, expo.out), the dropped slide settles (240 ms), the counters renumber. Animation time for the timed frames.', frames);
  console.log(errs); await ctx.close();
}

if (which.includes('agents')) {
  const { ctx, page, cdp, errs } = await open();
  await page.evaluate(() => window.__dirA.finishIntro());
  await page.evaluate(() => document.querySelector('.band-agents').scrollIntoView({ block: 'start' }));
  await page.evaluate(() => window.scrollBy(0, 40));
  await page.waitForTimeout(300);
  await slow(cdp);
  const clip = await box(page, '.agents-grid', 0);
  clip.height = Math.min(clip.height, 900 - clip.y);
  let frames = await timed(page, clip, [0, 260, 420, 600, 900, 1100, 1300, 1600], () => page.click('[data-run]'));
  frames = frames.map(f => ({ ...f, label: `step 1, ${f.label}` }));
  await page.waitForTimeout(400 * K);
  await page.click('[data-run]');
  await page.waitForTimeout(1300 * K);
  frames.push({ buf: await page.screenshot({ clip }), label: 'step 2 landed (the agent\'s flag)' });
  await page.waitForTimeout(2000 * K);
  await page.click('[data-run]');
  await page.waitForTimeout(2600 * K);
  frames.push({ buf: await page.screenshot({ clip }), label: 'step 3 landed' });
  save('agents-run', 'M13 to M16. Run sends one command: the answer prints 55 ms a line, one beat later the slide changes (step 1 draws the new slide\'s rails out of their crosses) and Version history adds the agent\'s row. Animation time, captured at a tenth of speed.', frames);
  console.log(errs); await ctx.close();
}

if (which.includes('present')) {
  const { ctx, page, cdp, errs } = await open();
  await page.evaluate(() => window.__dirA.finishIntro());
  // a change first, so the show carries it
  await page.evaluate(() => document.querySelector('.band-tailor').scrollIntoView());
  await page.fill('#tailor-to', 'Globex');
  await page.click('.tailor button[type=submit]');
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('.band-present').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(500);
  await slow(cdp);
  const clip = await box(page, '.band-present', 0);
  clip.y = Math.max(0, clip.y); clip.height = Math.min(clip.height, 900 - clip.y);
  let frames = await timed(page, clip, [0, 100, 200, 300, 400, 520], () => page.keyboard.press('s'));
  frames = frames.map(f => ({ ...f, label: `S, ${f.label}` }));
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  frames.push({ buf: await page.screenshot({ clip }), label: 'two Right arrows: slide 3, a cut' });
  const ex = await timed(page, clip, [150, 420], () => page.keyboard.press('Escape'));
  ex.forEach(f => frames.push({ ...f, label: `Escape, ${f.label}` }));
  save('present-show', 'M17 to M20. S presents the page\'s own deck with the visitor\'s changes: the ground turns to ink (300 ms), the slide moves to the stage (500 ms, power2.inOut), arrow keys cut between slides, Escape returns it (400 ms). Animation time, captured at a tenth of speed.', frames);
  console.log(errs); await ctx.close();
}

if (which.includes('mark')) {
  const { ctx, page, cdp, errs } = await open();
  await page.evaluate(() => window.__dirA.finishIntro());
  await slow(cdp);
  const top = await page.evaluate(() => document.querySelector('[data-deck="close"]').getBoundingClientRect().top + scrollY);
  const frames = await timed(page, { x: 0, y: 0, width: 10, height: 10 }, [0], async () => {});
  frames.length = 0;
  await page.evaluate((y) => window.scrollTo(0, y - 200), top);
  const clip = await box(page, '[data-deck="close"]', 4);
  const t0 = Date.now();
  for (const t of [0, 80, 160, 260, 380, 520, 700, 1020]) {
    const wait = t0 + t * K - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
    frames.push({ buf: await page.screenshot({ clip }), label: `${Math.round((Date.now() - t0) / K)} ms` });
  }
  save('close-mark', 'M22. The closing slide signs the deck: the mark\'s seven bars arrive from the left once, leftmost first, 70 ms apart, 600 ms each on expo.out over 48 units. Animation time, captured at a tenth of speed.', frames);
  console.log(errs); await ctx.close();
}

if (which.includes('phone')) {
  const { ctx, page, errs } = await open({ w: 390, h: 844, query: '', touch: true });
  await page.evaluate(() => window.__dirA.finishIntro());
  const clip = await box(page, '.band-hero .col', 0);
  clip.height = Math.min(clip.height, 844 - clip.y);
  const frames = [];
  const shot = async (label) => frames.push({ buf: await page.screenshot({ clip }), label });
  await shot('rest');
  const t = await page.locator('.obj-hero-title').boundingBox();
  await page.touchscreen.tap(t.x + 40, t.y + 20);
  await page.waitForTimeout(150);
  await shot('tap: selected');
  const cdp = await ctx.newCDPSession(page);
  const pt = (x, y) => [{ x, y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(t.x + 40, t.y + 20) });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(t.x + 40 + i * 2, t.y + 20 + i * 5) });
  await shot('touch drag');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(150);
  await shot('release');
  await page.click('[data-undo=hero]').catch(() => {});
  await page.waitForTimeout(800);
  await shot('Undo');
  save('phone-hero-touch', 'Phone, 390 by 844, touch: a first tap selects (the page still scrolls under an unselected box), a drag on the selected box moves it, Undo brings it back. Real time.', frames);
  console.log(errs); await ctx.close();
}
await browser.close();
