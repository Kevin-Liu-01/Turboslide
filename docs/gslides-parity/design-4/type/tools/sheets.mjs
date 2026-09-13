// The preview sheets and page screenshots for proposal 3 (type): the marks sheet, the tab strip
// mock, the chrome mocks, the Open Graph card and the /home mockup at 1440, all shot with Chrome
// for Testing through playwright-core from the repository's node_modules. The sheets are HTML
// written to the scratchpad; the screenshots land in design-4/type/previews.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');
const { bayerThreshold } = await import('/Users/kevinliu/repos/Turboslide/packages/effects/src/bayer.ts');

const REPO = '/Users/kevinliu/repos/Turboslide';
const TYPE = `${REPO}/docs/gslides-parity/design-4/type`;
const PREV = `${TYPE}/previews`;
const SCRATCH = '/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/type3/sheets';
mkdirSync(SCRATCH, { recursive: true });
const EXE = '/Users/kevinliu/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const FONT = `file://${REPO}/packages/fonts/assets/InterVariable.woff2`;
const TOKENS = `file://${REPO}/packages/chrome/src/tokens.css`;

const BASE_CSS = `
@font-face{font-family:'Inter';font-style:normal;font-weight:100 900;font-display:block;src:url('${FONT}') format('woff2')}
*{box-sizing:border-box}
body{margin:0;background:var(--pt-paper);color:var(--pt-ink);font:13px/1.5 'Inter','Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased}
h1,h2,h3{font-weight:500;letter-spacing:-0.02em;font-feature-settings:'cv11','ss01';margin:0}
h1{font-size:20px;line-height:1.2}
h2{font-size:15px;line-height:1.3;color:var(--pt-ink)}
.sheet{padding:32px 40px 48px;max-width:1440px}
.row{display:flex;gap:32px;align-items:flex-start;flex-wrap:wrap;padding:20px 0;border-top:1px solid var(--pt-hair-soft)}
.row:first-of-type{border-top:0}
.cell{display:grid;gap:8px;justify-items:start}
.cap{font-size:12px;color:var(--pt-ink-2);max-width:36ch}
.px{image-rendering:pixelated}
.ground{display:inline-grid;place-items:center;border:1px solid var(--pt-edge)}
.ground.p{background:#ffffff}.ground.i{background:#070707}
.mono{font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:12px}
.head{display:flex;justify-content:space-between;align-items:baseline;padding-bottom:16px;border-bottom:1px solid var(--pt-hair)}
.head .mono{color:var(--pt-titanium)}
`;

const doc = (title, body, { theme = 'light', extraCss = '' } = {}) => `<!doctype html><html lang="en" data-theme="${theme}"><head><meta charset="utf-8"><title>${title}</title>
<link rel="stylesheet" href="${TOKENS}"><style>${BASE_CSS}${extraCss}</style></head><body>${body}</body></html>`;

const img = (name, w, cls = '') => `<img class="${cls}" src="file://${PREV}/${name}" width="${w}" alt="">`;

// ---- 1. the marks sheet ----
const silhouettes = [
  ['triangle', '<path d="M16 5 L28 27 H4 Z"/>'],
  ['cube', '<path d="M16 3 L28 9.5 V22.5 L16 29 L4 22.5 V9.5 Z"/>'],
  ['Z', '<path d="M6 6 H26 V10 L12 22 H26 V26 H6 V22 L20 10 H6 Z"/>'],
  ['rectangle in a rectangle', '<rect x="4" y="8" width="24" height="16"/><rect x="10" y="12" width="12" height="8" fill="#ffffff"/>'],
  ['roundel', '<circle cx="16" cy="16" r="12"/><circle cx="16" cy="16" r="5" fill="#ffffff"/>'],
  ['chevron pair', '<path d="M6 6 L16 16 L6 26 L10 26 L20 16 L10 6 Z"/><path d="M14 6 L24 16 L14 26 L18 26 L28 16 L18 6 Z"/>'],
];
const silRow = silhouettes.map(([name, p]) => `<div class="cell"><span class="ground p" style="width:48px;height:48px"><svg width="32" height="32" viewBox="0 0 32 32" fill="#8a8f98">${p}</svg></span><span class="cap">${name}</span></div>`).join('');
const marksBody = `<div class="sheet">
<div class="head"><h1>Turboslide mark, proposal 3 (type)</h1><span class="mono">docs/gslides-parity/design-4/type, 2026-09-13</span></div>
<div class="row">
  <div class="cell">${img('mark-512-paper.png', 256)}<span class="cap">The tile at 512 on paper: Inter Display Medium's T, the lowest 40 percent of the stem cut by the 8 by 8 screen, four cells across (14.4 px).</span></div>
  <div class="cell">${img('mark-512-ink.png', 256)}<span class="cap">The same at 512 on ink. Every identity asset has an ink twin; the tile follows the operating system's scheme in the tab strip.</span></div>
  <div class="cell">${img('mark-bare-512-paper.png', 256)}<span class="cap">The mark alone (mark.svg, currentColor), for the README hero and the stacked lockup.</span></div>
  <div class="cell">${img('variants/hint-512-paper.png', 256)}<span class="cap">For comparison: the hint scaled to 512. The outline is used from 128 px; the hint below.</span></div>
</div>
<h2>The sizes at 1x</h2>
<div class="row">
  ${[180, 64, 32, 16].map((s) => `<div class="cell"><div style="display:flex;gap:12px;align-items:flex-end"><span class="ground p" style="padding:8px">${img(`mark-${s}-paper.png`, s)}</span><span class="ground i" style="padding:8px">${img(`mark-${s}-ink.png`, s)}</span></div><span class="cap">${s} px${s === 180 ? ', the touch icon: no frame, iOS masks the tile' : s === 64 ? ': the hint with 2 px cells' : ': the hint, solid'}</span></div>`).join('')}
</div>
<h2>16 and 32 px at 8x, nearest neighbour</h2>
<div class="row">
  <div class="cell">${img('mark-16-paper.png', 128, 'px')}<span class="cap">16 px: a 1 px frame in the edge composite, the T at 10 by 12 units, 2 px strokes; three colours, no anti aliasing.</span></div>
  <div class="cell">${img('mark-16-ink.png', 128, 'px')}<span class="cap">16 px, dark: the SVG's prefers-color-scheme block; the ICO stays paper for both strips.</span></div>
  <div class="cell">${img('mark-32-paper.png', 256, 'px')}<span class="cap">32 px: the frame stays 1 px, the T doubles.</span></div>
  <div class="cell">${img('mark-64-paper.png', 256, 'px')}<span class="cap">64 px at 4x: the first size with cells (2 px, four across the stem).</span></div>
</div>
<h2>The lockups</h2>
<div class="row">
  <div class="cell">${img('wordmark.png', 377)}<span class="cap">Horizontal: the tile at 64, a gap of 0.4 tile, the word in Inter Display Medium, tracking -0.025em; the word's cap equals the T's 12 units.</span></div>
  <div class="cell">${img('wordmark-ink.png', 377)}<span class="cap">The ink twin.</span></div>
  <div class="cell">${img('wordmark-stacked.png', 290)}<span class="cap">Stacked: for the README hero and the 512 icon's neighbourhood.</span></div>
</div>
<div class="row">
  <div class="cell">${img('wordmark-display.png', 620)}<span class="cap">The display wordmark: the word itself, its T carrying the cut. For the OG card and the /home hero, at 96 px and above (cells 2.6 px at 96).</span></div>
  <div class="cell">${img('wordmark-display-ink.png', 620)}<span class="cap">The ink twin.</span></div>
</div>
<h2>Tested and rejected</h2>
<div class="row">
  <div class="cell">${img('variants/o-slide-counter.png', 620)}<span class="cap">The slide counter: a 16:9 counter cut into the o. Rejected: it breaks Inter's rhythm, reads as a screen glyph, and disappears under 40 px, which is where the wordmark lives in the product.</span></div>
  <div class="cell"><div style="display:flex;gap:12px;align-items:flex-end">${img('variants/doubled-T-16-paper.png', 128, 'px')}${img('variants/doubled-T-32-paper.png', 128, 'px')}${img('variants/doubled-T-64-paper.png', 128, 'px')}</div><span class="cap">The doubled line T (the GT mark's thread grammar) at 16, 32 and 64, enlarged. Rejected: at 16 px on a 1x screen the two 1 px lines and their 1 px gap read as one grey stroke, and the form is the GT mark's, which stays on the sheet.</span></div>
</div>
<h2>Confusion test at 32 px, research-4/01 item 12</h2>
<div class="row">
  <div class="cell"><span class="ground p" style="width:48px;height:48px">${img('mark-32-paper.png', 32)}</span><span class="cap">Turboslide</span></div>
  ${silRow}
</div>
<p class="cap" style="max-width:80ch">The silhouettes are grey stand ins for the forms the mark must not read as (a triangle, a cube, a Z, a rectangle inside a rectangle, a roundel, a chevron pair); none is a logo. A letter on a framed card shares no silhouette with any of them.</p>
</div>`;

// ---- 2. the tab strip mock ----
const tab = (icon, title, active, dark) => `<div class="tab ${active ? 'on' : ''}">${icon}<span>${title}</span></div>`;
const placeholder = (p) => `<svg width="16" height="16" viewBox="0 0 32 32" fill="#9aa0a6">${p}</svg>`;
const strip = (dark, iconName) => {
  const icons = [
    placeholder(silhouettes[0][1]), placeholder(silhouettes[4][1]),
    `<img src="file://${PREV}/${iconName}" width="16" height="16" alt="">`,
    placeholder(silhouettes[1][1]), placeholder(silhouettes[3][1]),
  ];
  const titles = ['Documentation', 'Inbox (3)', 'GT brand deck, Turboslide', 'Board', 'Untitled presentation'];
  return `<div class="strip ${dark ? 'dark' : ''}">${icons.map((ic, i) => tab(ic, titles[i], i === 2, dark)).join('')}</div>`;
};
const tabCss = `
.strip{display:flex;gap:2px;padding:8px 8px 0;background:#dee1e6;width:1000px}
.strip.dark{background:#202124}
.tab{display:flex;align-items:center;gap:8px;width:196px;height:34px;padding:0 12px;border-radius:8px 8px 0 0;font:12px/1 -apple-system,system-ui,sans-serif;color:#3c4043;background:#c9ccd1;white-space:nowrap;overflow:hidden}
.tab.on{background:#ffffff;color:#202124}
.dark .tab{background:#2c2d30;color:#bdc1c6}.dark .tab.on{background:#35363a;color:#e8eaed}
.tab span{overflow:hidden;text-overflow:ellipsis}
.label{font-size:12px;color:var(--pt-ink-2);margin:20px 0 6px}
`;
const tabBody = `<div class="sheet" style="padding:24px 32px">
<div class="head"><h1>The tab icon on a light and a dark strip</h1><span class="mono">16 px, beside grey placeholder icons</span></div>
<p class="label">Light strip, the operating system in light: icon.svg's base colours (the paper tile).</p>${strip(false, 'mark-16-paper.png')}
<p class="label">Dark strip, the operating system in dark: icon.svg's prefers-color-scheme block (the ink tile).</p>${strip(true, 'mark-16-ink.png')}
<p class="label">Dark strip in Safari, which draws the base colours (research-4/02 section 2.1): the paper tile reads on the dark strip too.</p>${strip(true, 'mark-16-paper.png')}
</div>`;

// ---- 3. the chrome mocks ----
const chromeCss = `
.mock{margin:24px 0 0;border:1px solid var(--pt-edge)}
.mock-label{font-size:12px;color:var(--pt-ink-2);margin:24px 0 6px}
.title-row{display:flex;align-items:center;height:44px;padding:0 12px;border-bottom:1px solid var(--pt-hair);gap:12px}
.title-row .tile{width:20px;height:20px;display:block}
.title-row .name{font-size:15px;font-weight:500;letter-spacing:-0.01em}
.title-row .save{display:inline-flex;gap:6px;align-items:center;color:var(--pt-ink-2);font-size:13px}
.title-row .r{margin-left:auto;display:flex;gap:8px;align-items:center}
.appbar{display:grid;grid-template-columns:auto minmax(0,1fr);gap:24px;align-items:center;padding:8px 24px 16px;border-bottom:1px solid var(--pt-hair)}
.brand{display:inline-flex;align-items:center;gap:10px;font-size:20px;font-weight:500;letter-spacing:-0.01em;font-feature-settings:'cv11','ss01'}
.brand img{width:24px;height:24px;display:block}
.search{position:relative;max-width:720px;justify-self:center;width:100%}
.search input{width:100%;height:40px;padding:0 12px 0 38px;border:1px solid var(--pt-hair);border-radius:var(--pt-radius);background:var(--pt-plate);color:var(--pt-ink);font:14px 'Inter',sans-serif}
.empty{display:grid;grid-template-columns:320px 1fr;gap:32px;align-items:center;padding:32px 24px}
.empty .fig{width:320px;height:180px;border:1px solid var(--pt-edge);background:url(file://${PREV}/hero-dark.png) -1120px -600px / 1600px 900px no-repeat;image-rendering:pixelated}
:root[data-theme='light'] .empty .fig{background-image:url(file://${PREV}/hero-light.png)}
.empty h3{font-size:20px;font-weight:500;letter-spacing:-0.02em;margin:0 0 8px}
.empty p{margin:0 0 16px;color:var(--pt-ink-2);font-size:14px}
.curtain{background:var(--pt-panel-ink);height:320px;display:grid;place-items:center;position:relative}
.curtain .sheetbox{width:480px;height:270px;border:1px solid rgba(255,255,255,0.22);display:grid;place-items:center;color:rgba(255,255,255,0.87);font-size:15px}
.curtain .bar{position:absolute;left:16px;bottom:16px;display:flex;gap:8px;align-items:center;height:32px;padding:0 8px;background:var(--pt-panel-ink);border:1px solid rgba(255,255,255,0.22);color:var(--pt-panel-text);font-size:13px;font-variant-numeric:tabular-nums}
.banner{padding:16px 20px;border:1px solid var(--pt-hair);background:var(--pt-plate);font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:13px;line-height:1.35;white-space:pre;display:inline-block;margin:0}
.twin{display:grid;grid-template-columns:1fr 1fr;gap:24px}
`;
const titleRow = (theme) => `<div class="title-row"><img class="tile" src="file://${PREV}/tile-20-${theme}@2x.png" alt="Turboslide"><span class="name">Untitled presentation</span><span class="save"><svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M5.5 16a3.5 3.5 0 0 1-.369-6.98 4 4 0 1 1 7.753-1.977A4.5 4.5 0 1 1 13.5 16h-8Z"/></svg>Not saved yet</span><svg width="16" height="16" viewBox="0 0 20 20" fill="var(--pt-ink-2)"><path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z"/></svg><span class="r"><button class="pt-ib pt-icon" type="button">…</button><button class="pt-ib is-solid" type="button">Slideshow</button><button class="pt-ib" type="button">Share</button></span></div>`;
const chromeBody = `<div class="sheet">
<div class="head"><h1>App chrome with the Turboslide mark</h1><span class="mono">the title row, the app bar, the empty state, the present surround, the CLI banner</span></div>
<p class="mock-label">The title row at 44 px (packages/chrome/src/TitleRow.tsx): the tile at 20 px replaces the GT mark at 31 by 20 and links to /home; dark and light.</p>
<div class="mock" data-theme="dark" style="background:var(--pt-paper)">${titleRow('ink')}</div>
<div class="mock" style="background:#ffffff;color:#070707">${titleRow('paper').replace('tile-20-paper', 'tile-20-paper')}</div>
<p class="mock-label">The app bar of /decks (decks.css .ts-appbar-brand): the tile at 24 px beside the live word at 20 px, tracking -0.01em; the GT mark leaves the bar.</p>
<div class="mock"><div class="appbar"><span class="brand"><img src="file://${PREV}/tile-24-ink@2x.png" alt="">Turboslide</span><label class="search"><input placeholder="Search presentations"></label></div></div>
<p class="mock-label">The empty state (Geist's structure: a title, one sentence, one action): a 320 by 180 two tone figure cut from the hero twin in a --pt-edge frame.</p>
<div class="mock"><div class="empty"><div class="fig"></div><div><h3>No presentations yet</h3><p>Start one above, or open the GT brand deck and make a copy.</p><button class="pt-ib is-solid" type="button">New Presentation</button></div></div></div>
<p class="mock-label">The present surround stays flat --pt-panel-ink (gslides-parity build deviation B6): no dither, no shader, the slide alone.</p>
<div class="mock"><div class="curtain"><div class="sheetbox">the slide</div><div class="bar">‹ &nbsp;6 of 85&nbsp; ›</div></div></div>
<p class="mock-label">The CLI banner (turboslide --version, turboslide info): the hint's bitmap as half blocks, the word in plain text, no colour required.</p>
<pre class="banner">   ██████████        Turboslide 0.1.0
       ██            the studio at https://turboslide.vercel.app
       ██            105 actions on the CLI, MCP, HTTP and the window API
       ██            deck gt-brand at revision 31
       ██
       ██</pre>
</div>`;

// ---- 4. the Open Graph card, 1200 by 630 ----
function bandSvg(w, h, cell) {
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  const rects = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      // a diagonal ramp: paper at the lower right, ink at the upper left
      const tone = Math.min(1, Math.max(0, (c / cols) * 0.8 + (r / rows) * 0.35 - 0.15));
      if (tone * 255 > bayerThreshold(r, c)) rects.push(`<rect x="${c * cell}" y="${r * cell}" width="${cell}" height="${cell}"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges"><g fill="#f2f2f0">${rects.join('')}</g></svg>`;
}
const ogCss = `
html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#070707}
.og{position:relative;width:1200px;height:630px;background:#070707;color:#f2f2f0}
.band{position:absolute;right:0;top:0;width:420px;height:630px}
.plate{position:absolute;left:72px;top:96px;width:720px}
.plate img{display:block;width:640px;height:auto}
.og p{font:400 30px/1.35 'Inter','Helvetica Neue',Arial,sans-serif;letter-spacing:-0.01em;margin:36px 0 0;max-width:640px;color:#f2f2f0}
.og .url{position:absolute;left:72px;bottom:72px;font:20px ui-monospace,'SF Mono',Menlo,Consolas,monospace;color:#8a8f98;letter-spacing:0}
`;
const ogBody = `<div class="og"><div class="band">${bandSvg(420, 630, 12)}</div><div class="plate"><img src="file://${PREV}/wordmark-display-ink.png" alt="Turboslide"><p>A slides editor with Google Slides' menus, toolbar and shortcuts, a canvas on every slide, and a PowerPoint export that matches the screen.</p></div><div class="url">turboslide.vercel.app</div></div>`;

// ---- write and shoot ----
writeFileSync(join(SCRATCH, 'marks.html'), doc('Marks', marksBody));
writeFileSync(join(SCRATCH, 'tabstrip.html'), doc('Tab strip', tabBody, { extraCss: tabCss }));
writeFileSync(join(SCRATCH, 'chrome.html'), doc('Chrome', chromeBody, { theme: 'dark', extraCss: chromeCss }));
writeFileSync(join(SCRATCH, 'og.html'), doc('OG', ogBody, { theme: 'dark', extraCss: ogCss }));

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--allow-file-access-from-files', '--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] });
async function shoot(file, out, { width = 1440, height = 900, dpr = 1, full = true, theme, clip } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, colorScheme: theme === 'light' ? 'light' : 'dark' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', file, e.message));
  if (theme) await page.addInitScript((t) => { try { localStorage.setItem('gt-theme', t); } catch {} }, theme);
  await page.goto(`file://${file}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: out, fullPage: full, ...(clip ? { clip, fullPage: false } : {}) });
  const size = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
  await ctx.close();
  console.log('shot', out.split('/').pop(), size.join('x'));
}
await shoot(join(SCRATCH, 'marks.html'), join(PREV, 'marks-sheet.png'), { width: 1440 });
await shoot(join(SCRATCH, 'tabstrip.html'), join(PREV, 'tab-strip.png'), { width: 1080, dpr: 2 });
await shoot(join(SCRATCH, 'tabstrip.html'), join(PREV, 'tab-strip-1x.png'), { width: 1080, dpr: 1 });
await shoot(join(SCRATCH, 'chrome.html'), join(PREV, 'chrome-mocks.png'), { width: 1440 });
await shoot(join(SCRATCH, 'og.html'), join(PREV, 'og.png'), { width: 1200, height: 630, full: false });
await shoot(`${TYPE}/home.html`, join(PREV, 'home.png'), { width: 1440, theme: 'dark' });
await shoot(`${TYPE}/home.html`, join(PREV, 'home-light.png'), { width: 1440, theme: 'light' });
await shoot(`${TYPE}/home.html`, join(PREV, 'home-390.png'), { width: 390, height: 844, theme: 'dark' });
await browser.close();
console.log('done');
