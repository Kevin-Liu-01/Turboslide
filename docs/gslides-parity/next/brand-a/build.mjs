// Brand direction A (Turboslide as a General Translation product): the marks, the CLI banner, the
// icon mask sheet for the mockups and every picture under shots/ and marks/. Run from anywhere:
//   node docs/gslides-parity/next/brand-a/build.mjs [marks|pages|all]
// It reads the GT speed mark from the Prototemplate checkout (read only), the outlined word and the
// app icon geometry from this tree, and renders with the playwright package of this tree's
// node_modules. It writes only under this folder. Nothing here is a source file of the product.
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TREE = path.resolve(HERE, '../../../..');
const PROTO = '/Users/kevinliu/repos/Prototemplate';
const MARKS = path.join(HERE, 'marks');
const MOCKS = path.join(HERE, 'mockups');
const SHOTS = path.join(HERE, 'shots');
const requireTree = createRequire(path.join(TREE, 'package.json'));
const { chromium } = requireTree(
  path.join(TREE, 'node_modules/.pnpm/playwright@1.62.1/node_modules/playwright'),
);
const brand = await import(pathToFileURL(path.join(TREE, 'packages/theme/src/brand.ts')).href);

const phase = process.argv[2] ?? 'all';
const log = [];
const note = (entry) => {
  const row = { at: new Date().toISOString(), load: os.loadavg().map((v) => v.toFixed(2)), ...entry };
  log.push(row);
  console.log(JSON.stringify(row));
};
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

// ---------------------------------------------------------------------------------------------
// The GT bar monogram, unchanged (DECK-GRAMMAR 52 to 53: a mark is never redrawn by hand)

const MONO_SRC = path.join(PROTO, 'public/marks/bar-monogram.svg');
const monoBytes = readFileSync(MONO_SRC);
const monoText = monoBytes.toString('utf8');
const MONO_VIEWBOX = /viewBox="([^"]+)"/.exec(monoText)[1];
const MONO_D = /<path d="([^"]+)"/.exec(monoText)[1];
const quads = [...MONO_D.matchAll(/M([-\d.]+) ([-\d.]+)L([-\d.]+) ([-\d.]+)L([-\d.]+) ([-\d.]+)L([-\d.]+) ([-\d.]+)Z/g)].map(
  (m) => [0, 2, 4, 6].map((i) => [Number(m[i + 1]), Number(m[i + 2])]),
);
const monoBox = quads.flat().reduce(
  (b, [x, y]) => ({ x0: Math.min(b.x0, x), x1: Math.max(b.x1, x), y0: Math.min(b.y0, y), y1: Math.max(b.y1, y) }),
  { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity },
);

// ---------------------------------------------------------------------------------------------
// The word, Inter outlines this tree already generated (packages/theme/brand/wordmark-outlines.svg,
// written by packages/theme/scripts/outline-wordmark.py from packages/fonts/assets/InterVariable.woff2
// at wght 500, -0.025em, Inter's pair kerning), in font units with the baseline at 0

const WORD_SRC = path.join(TREE, 'packages/theme/brand/wordmark-outlines.svg');
const wordText = readFileSync(WORD_SRC, 'utf8');
const WORD_D = [...wordText.matchAll(/<path transform="translate\(64 51\) scale\([\d.]+\)" d="([^"]+)"/g)][0][1];
const UPEM = 2048;
const INTER_CAP = 1490; // docs/brand.md 109: Inter's cap height is 1490 of 2048 units

function pathBox(d) {
  // absolute M L H V Q C Z only (the outline script writes these)
  const tokens = d.match(/[MLHVQCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi);
  let cmd = '';
  let x = 0;
  let y = 0;
  const pts = [];
  for (let i = 0; i < tokens.length; ) {
    const t = tokens[i];
    if (/[A-Za-z]/.test(t)) {
      cmd = t;
      i += 1;
      if (cmd === 'Z' || cmd === 'z') continue;
      continue;
    }
    const n = (k) => Number(tokens[i + k]);
    if (cmd === 'M' || cmd === 'L') {
      x = n(0);
      y = n(1);
      pts.push([x, y]);
      i += 2;
    } else if (cmd === 'H') {
      x = n(0);
      pts.push([x, y]);
      i += 1;
    } else if (cmd === 'V') {
      y = n(0);
      pts.push([x, y]);
      i += 1;
    } else if (cmd === 'Q') {
      pts.push([n(0), n(1)]);
      x = n(2);
      y = n(3);
      pts.push([x, y]);
      i += 4;
    } else if (cmd === 'C') {
      pts.push([n(0), n(1)], [n(2), n(3)]);
      x = n(4);
      y = n(5);
      pts.push([x, y]);
      i += 6;
    } else throw new Error(`unexpected path command ${cmd}`);
  }
  return pts.reduce(
    (b, [px, py]) => ({ x0: Math.min(b.x0, px), x1: Math.max(b.x1, px), y0: Math.min(b.y0, py), y1: Math.max(b.y1, py) }),
    { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity },
  );
}
const wordBox = pathBox(WORD_D);

// The lockup rule: the word's cap height equals the monogram's 120 unit cap, the baselines meet
// at the monogram's bottom (y 160), the gap from the T's crossbar to the word is half the cap.
const CAP = 120;
const GAP = 0.5 * CAP;
const s = CAP / INTER_CAP;
const wordX = monoBox.x1 + GAP - wordBox.x0 * s;
const lockupRight = wordX + wordBox.x1 * s;
const PAD = 4; // the file's own clear space around the monogram (viewBox -109.1 36 499.6 128)
const [vbx, vby, , vbh] = MONO_VIEWBOX.split(/\s+/).map(Number);
const lockupVB = [vbx, vby, +(lockupRight + PAD - vbx).toFixed(1), vbh];

function lockupSvg({ title = 'Turboslide' } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${lockupVB.join(' ')}" fill="currentColor" role="img" aria-label="${title}"><title>${title}</title><path d="${MONO_D}"/><path transform="translate(${wordX.toFixed(2)} 160) scale(${s.toFixed(6)})" d="${WORD_D}"/></svg>\n`;
}

// ---------------------------------------------------------------------------------------------
// The app icon: round four's solid slide and plate form, kept for the square slots only

const appIconSvg = brand.markSvg(8, 16);
const TILE_STYLE =
  '.plate{fill:#ffffff}.frame{fill:none;stroke:#656565;stroke-width:1}.ink{fill:#070707}@media (prefers-color-scheme: dark){.plate{fill:#070707}.frame{stroke:#888887}.ink{fill:#f2f2f0}}';
function tileSvg(size) {
  const tile = brand.TILE_SIZES[size];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="Turboslide"><title>Turboslide</title><style>${TILE_STYLE}</style><rect class="plate" x="0" y="0" width="${size}" height="${size}"/><rect class="frame" x="0.5" y="0.5" width="${size - 1}" height="${size - 1}"/><path class="ink" fill-rule="evenodd" d="${brand.tileMarkPath(tile)}"/></svg>\n`;
}
function touchSvg() {
  // 180 px ink tile, the 128 px mark at 4 px cells (markBits(32)), as apps/studio/public/apple-touch-icon.png
  const bits = brand.markBits(32);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" width="180" height="180" shape-rendering="crispEdges" role="img" aria-label="Turboslide"><rect width="180" height="180" fill="#070707"/><g transform="translate(26 26) scale(4)" fill="#f2f2f0">${brand.cellRects(bits)}</g></svg>\n`;
}

// ---------------------------------------------------------------------------------------------
// The CLI banner: the monogram's own polygons sampled into half block cells (no hand drawing)

function inside([px, py], poly) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
function coverage(x0, y0, w, h) {
  const n = 6;
  let hit = 0;
  for (let a = 0; a < n; a += 1)
    for (let b = 0; b < n; b += 1) {
      const p = [x0 + ((a + 0.5) / n) * w, y0 + ((b + 0.5) / n) * h];
      if (quads.some((q) => inside(p, q))) hit += 1;
    }
  return hit / (n * n);
}
/** rows = half rows over the 120 unit cap; a terminal cell is about 0.6 em wide and 1.2 em tall, so a half block cell is square */
function bannerGlyph(rows) {
  const ch = CAP / rows;
  const cw = ch;
  const cols = Math.ceil((monoBox.x1 - monoBox.x0) / cw);
  const grid = [];
  for (let r = 0; r < rows; r += 1) {
    const row = [];
    for (let c = 0; c < cols; c += 1) row.push(coverage(monoBox.x0 + c * cw, monoBox.y0 + r * ch, cw, ch) > 0.5);
    grid.push(row);
  }
  const lines = [];
  for (let r = 0; r < rows; r += 2) {
    let line = '';
    for (let c = 0; c < cols; c += 1) {
      const top = grid[r][c];
      const bottom = r + 1 < rows && grid[r + 1][c];
      line += top && bottom ? '█' : top ? '▀' : bottom ? '▄' : ' ';
    }
    lines.push(line.replace(/\s+$/, ''));
  }
  return { rows, cols, lines };
}

// ---------------------------------------------------------------------------------------------
// The chrome's own icons (packages/chrome/src/icons.tsx, Heroicons 20 solid) as CSS masks

const ICON_NAMES = [
  'search', 'plus', 'chevron-down', 'chevron-up', 'arrow-uturn-left', 'arrow-uturn-right', 'printer',
  'paint-brush', 'cursor-arrow', 'photo', 'square-2-stack', 'minus', 'chat', 'close', 'lock-closed', 'play',
  'view-columns', 'ellipsis-vertical', 'ellipsis-horizontal', 'sun', 'moon', 'squares-2x2', 'queue-list',
  'document-plus', 'external', 'bars-3', 'chat-bubble-left', 'cloud', 'user-circle',
];
function iconCss() {
  const src = readFileSync(path.join(TREE, 'packages/chrome/src/icons.tsx'), 'utf8');
  const consts = {};
  for (const m of src.matchAll(/const ([A-Z0-9_]+): readonly IconPath\[\] = \[([\s\S]*?)\n\];/g)) consts[m[1]] = m[2];
  const block = src.slice(src.indexOf('const PATHS: Record<IconName'));
  const out = [];
  const missing = [];
  for (const name of ICON_NAMES) {
    const key = name.includes('-') ? `'${name}'` : name;
    const re = new RegExp(`\\n  ${key.replace(/[-']/g, (c) => `\\${c}`)}: (\\[\\{[^\\n]*\\}\\],|\\[[\\s\\S]*?\\n  \\],|[A-Z0-9_]+,)`);
    const m = re.exec(block);
    if (!m) {
      missing.push(name);
      continue;
    }
    const body = /^[A-Z0-9_]+,$/.test(m[1]) ? consts[m[1].slice(0, -1)] : m[1];
    const objs = [...body.matchAll(/\{([\s\S]*?)\}/g)].map((o) => o[1]);
    const paths = objs
      .map((o) => {
        const d = /d: '([^']+)'/.exec(o)?.[1];
        if (!d) return '';
        const stroke = /stroke: true/.test(o);
        const evenodd = /evenodd: true/.test(o);
        return stroke
          ? `<path d='${d}' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/>`
          : `<path d='${d}'${evenodd ? " fill-rule='evenodd' clip-rule='evenodd'" : ''}/>`;
      })
      .join('');
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'>${paths}</svg>`;
    out.push(`.i-${name} { --m: url("data:image/svg+xml;utf8,${svg.replace(/#/g, '%23').replace(/"/g, "'")}"); }`);
  }
  return { css: `/* Generated by build.mjs from packages/chrome/src/icons.tsx (Heroicons 20 solid as the chrome ships them) */\n${out.join('\n')}\n`, missing };
}

// ---------------------------------------------------------------------------------------------
// Templates: <!--SPRITE--> becomes the monogram symbol, <!--INCLUDE name--> another source's body

const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><symbol id="gt-bar" viewBox="${MONO_VIEWBOX}"><path d="${MONO_D}"/></symbol></svg>`;
function buildPages() {
  const srcDir = path.join(MOCKS, 'src');
  const bodies = {};
  for (const f of readdirSync(srcDir)) {
    if (!f.endsWith('.html')) continue;
    const text = readFileSync(path.join(srcDir, f), 'utf8');
    const m = /<!--BODY-->([\s\S]*?)<!--\/BODY-->/.exec(text);
    if (m) bodies[f.replace('.html', '')] = m[1];
  }
  for (const f of readdirSync(srcDir)) {
    if (!f.endsWith('.html')) continue;
    let text = readFileSync(path.join(srcDir, f), 'utf8');
    text = text.replace(/<!--INCLUDE ([a-z-]+)-->/g, (_, name) => bodies[name] ?? '');
    text = text.replace('<!--SPRITE-->', SPRITE);
    writeFileSync(path.join(MOCKS, f), text);
  }
}

// ---------------------------------------------------------------------------------------------
// Rendering

async function withBrowser(fn) {
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--font-render-hinting=none'] });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

async function svgToPng(browser, svg, size, out, scheme = 'light') {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1, colorScheme: scheme });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg.replace('<svg ', '<svg style="display:block" ')}</body></html>`);
  await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
}

async function shootHtml(browser, html, out, width, height, { scale = 1, scheme = 'light' } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale, colorScheme: scheme });
  const file = path.join(MARKS, `.sheet-${path.basename(out, '.png')}.html`);
  writeFileSync(file, html);
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out, fullPage: true });
  await page.close();
}

const PAGES = ['home', 'decks', 'editor', 'signin'];
const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 390, h: 844 },
];
const THEMES = ['light', 'dark'];

async function renderPages(browser) {
  const results = [];
  for (const name of PAGES) {
    for (const vp of VIEWPORTS) {
      for (const theme of THEMES) {
        const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1, colorScheme: theme });
        const url = `${pathToFileURL(path.join(MOCKS, `${name}.html`)).href}?theme=${theme}`;
        await page.goto(url);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForLoadState('load');
        const facts = await page.evaluate(() => {
          const doc = document.documentElement;
          const overflow = [];
          for (const el of document.querySelectorAll('body *')) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            if (el.closest('[data-clip]')) continue;
            if (r.right > window.innerWidth + 0.5 || r.left < -0.5) overflow.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} ${Math.round(r.left)}..${Math.round(r.right)}`);
          }
          const imgs = [...document.images].filter((i) => i.offsetParent !== null);
          return {
            theme: doc.dataset.theme,
            inter500: document.fonts.check('500 16px Inter'),
            inter400: document.fonts.check('400 16px Inter'),
            fontsLoaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family),
            scrollWidth: doc.scrollWidth,
            innerWidth: window.innerWidth,
            overflow: overflow.slice(0, 12),
            imagesBroken: imgs.filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute('src')),
          };
        });
        const out = path.join(SHOTS, `${name}-${vp.w}-${theme}.png`);
        await page.screenshot({ path: out });
        await page.close();
        results.push({ out: path.relative(HERE, out), ...facts });
        note({ shot: path.relative(HERE, out), ...facts });
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------------------------

async function main() {
  mkdirSync(MARKS, { recursive: true });
  mkdirSync(SHOTS, { recursive: true });
  const record = {
    writtenAt: new Date().toISOString(),
    uptimeAtStart: os.loadavg(),
    monogram: { source: MONO_SRC, sha256: sha(monoBytes), viewBox: MONO_VIEWBOX, quads: quads.length, box: monoBox },
    word: { source: WORD_SRC, box: wordBox, cap: INTER_CAP, upem: UPEM },
    lockup: { cap: CAP, gap: GAP, scale: s, wordX, viewBox: lockupVB },
  };

  if (phase === 'marks' || phase === 'all') {
    copyFileSync(MONO_SRC, path.join(MARKS, 'gt-bar-monogram.svg'));
    writeFileSync(path.join(MARKS, 'turboslide-lockup.svg'), lockupSvg());
    writeFileSync(path.join(MARKS, 'app-icon.svg'), `${appIconSvg}\n`);
    for (const size of [16, 32]) writeFileSync(path.join(MARKS, `app-icon-tile-${size}.svg`), tileSvg(size));
    writeFileSync(path.join(MARKS, 'app-icon-touch-180.svg'), touchSvg());
    const icons = iconCss();
    writeFileSync(path.join(MOCKS, 'icons.css'), icons.css);
    record.iconsMissing = icons.missing;
    const banners = [8, 10, 12, 16].map(bannerGlyph);
    record.banners = banners.map((b) => ({ rows: b.rows, cols: b.cols, lines: b.lines.length }));
    const facts = ['Turboslide 0.0.0', 'https://www.turboslide.com', '193 actions, effects backend: wasm', 'checkout /Users/kevinliu/repos/Turboslide-next'];
    const bannerText = banners
      .map((b) => {
        const head = `# ${b.lines.length} lines, ${b.rows} half rows over the cap, ${b.cols} columns`;
        const body = b.lines.map((l, i) => (facts[i] ? `${l.padEnd(b.cols)}  ${facts[i]}` : l)).join('\n');
        return `${head}\n${body}\n`;
      })
      .join('\n');
    writeFileSync(path.join(MARKS, 'cli-banner.txt'), bannerText);

    await withBrowser(async (browser) => {
      await svgToPng(browser, tileSvg(16), 16, path.join(MARKS, 'favicon-16.png'));
      await svgToPng(browser, tileSvg(32), 32, path.join(MARKS, 'favicon-32.png'));
      await svgToPng(browser, touchSvg(), 180, path.join(MARKS, 'apple-touch-icon-180.png'));
      await svgToPng(browser, tileSvg(16), 16, path.join(MARKS, 'favicon-16-dark.png'), 'dark');
      await svgToPng(browser, tileSvg(32), 32, path.join(MARKS, 'favicon-32-dark.png'), 'dark');
      // the rejected square: the bar monogram fitted to the 16 and 32 px tiles
      const fitted = (size) => {
        const inner = size - 4;
        const h = (inner * vbh) / Number(MONO_VIEWBOX.split(/\s+/)[2]);
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="#ffffff"/><rect x="0.5" y="0.5" width="${size - 1}" height="${size - 1}" fill="none" stroke="#656565"/><svg x="2" y="${((size - h) / 2).toFixed(2)}" width="${inner}" height="${h.toFixed(2)}" viewBox="${MONO_VIEWBOX}" fill="#070707"><path d="${MONO_D}"/></svg></svg>`;
      };
      await svgToPng(browser, fitted(16), 16, path.join(MARKS, 'rejected-bar-16.png'));
      await svgToPng(browser, fitted(32), 32, path.join(MARKS, 'rejected-bar-32.png'));
      await svgToPng(browser, fitted(180).replace(/width="180" height="180" viewBox/, 'width="180" height="180" viewBox'), 180, path.join(MARKS, 'rejected-bar-180.png'));
      const pngs = ['favicon-16', 'favicon-32', 'apple-touch-icon-180', 'rejected-bar-16', 'rejected-bar-32', 'rejected-bar-180', 'favicon-16-dark', 'favicon-32-dark'];
      record.pngs = Object.fromEntries(pngs.map((p) => [p, sha(readFileSync(path.join(MARKS, `${p}.png`)))]));

      // the favicon sheet: 1x and 8x, kept and rejected, in two tab strips
      const img = (p, scale) => `<img src="${p}.png" style="image-rendering:pixelated;width:${scale}px;height:auto;display:block">`;
      const sheet = `<!doctype html><html><head><meta charset="utf-8"><style>
        @font-face{font-family:Inter;src:url('${pathToFileURL(path.join(TREE, 'packages/fonts/assets/InterVariable.woff2')).href}') format('woff2');font-weight:100 900}
        body{margin:0;background:#fff;color:#070707;font:14px/1.45 Inter,sans-serif;padding:32px;width:1136px}
        h2{font-weight:500;font-size:20px;letter-spacing:-0.01em;margin:0 0 4px}
        p{margin:0 0 16px;color:#3a3d44;max-width:880px}
        .row{display:grid;grid-template-columns:180px repeat(3,1fr);gap:0;border-top:1px solid rgba(7,7,7,.18);padding:16px 0;align-items:center}
        .row b{font-weight:500}
        .cell{display:flex;gap:16px;align-items:center}
        .strip{display:flex;align-items:center;gap:8px;height:36px;padding:0 12px;width:300px;font:12px Inter;transform:scale(2);transform-origin:0 0;margin-bottom:40px}
        .strip.l{background:#dee1e6;color:#1f1f1f}.strip.d{background:#202124;color:#e8eaed}
        .strip .tab{display:flex;align-items:center;gap:8px;height:28px;padding:0 10px;background:#fff;width:220px}
        .strip.d .tab{background:#35363a}
        .cap{color:#6f747d;font-size:12px}
      </style></head><body>
        <h2>The app icon kept, and the bar monogram in a square</h2>
        <p>Every image below is rendered from its SVG by this folder's build.mjs. The left column of each row is 1x, the others are the same pixels at 8x.</p>
        <div class="row"><b>Kept: round four's form in the paper tile</b><div class="cell">${img('favicon-16', 16)}${img('favicon-16', 128)}</div><div class="cell">${img('favicon-32', 32)}${img('favicon-32', 256)}</div><div class="cell">${img('apple-touch-icon-180', 180)}</div></div>
        <div class="row"><b>Kept, under prefers-color-scheme dark</b><div class="cell">${img('favicon-16-dark', 16)}${img('favicon-16-dark', 128)}</div><div class="cell">${img('favicon-32-dark', 32)}${img('favicon-32-dark', 256)}</div><div class="cell cap">The 180 px touch icon is the ink tile in both.</div></div>
        <div class="row"><b>Rejected: the bar monogram fitted to the tile</b><div class="cell">${img('rejected-bar-16', 16)}${img('rejected-bar-16', 128)}</div><div class="cell">${img('rejected-bar-32', 32)}${img('rejected-bar-32', 256)}</div><div class="cell">${img('rejected-bar-180', 180)}</div></div>
        <h2 style="margin-top:24px">The tab at 2x</h2>
        <div class="strip l"><div class="tab"><img src="favicon-16.png" width="16" height="16">Untitled presentation - Turboslide</div></div>
        <div class="strip d"><div class="tab"><img src="favicon-16-dark.png" width="16" height="16">Untitled presentation - Turboslide</div></div>
        <div class="strip l"><div class="tab"><img src="rejected-bar-16.png" width="16" height="16">Untitled presentation - Turboslide</div></div>
      </body></html>`;
      await shootHtml(browser, sheet, path.join(MARKS, 'favicon-sheet.png'), 1200, 800);

      // the lockup sheet: the monogram cap at 15, 16, 24, 32 and 48 px with the word in live Inter
      // beside the outlined file, on paper and on ink
      const lockFile = readFileSync(path.join(MARKS, 'turboslide-lockup.svg'), 'utf8');
      const live = (px) => `<span class="lk" style="font-size:${px}px"><svg class="mono" viewBox="${MONO_VIEWBOX}" aria-hidden="true"><path d="${MONO_D}"/></svg><span>Turboslide</span></span>`;
      const ground = (cls) => `<div class="g ${cls}">
          <div class="r"><span class="k">Outlined file, 48 px cap</span><div class="file">${lockFile.replace('<svg ', '<svg style="height:51.2px;width:auto;display:block" ')}</div></div>
          <div class="r"><span class="k">Live, 66 px word</span>${live(66)}</div>
          <div class="r"><span class="k">Live, 22 px word (navigation)</span>${live(22)}</div>
          <div class="r"><span class="k">Live, 18 px word (dialog head)</span>${live(18)}</div>
          <div class="r"><span class="k">Monogram alone, 16 px tall (editor home link)</span><svg class="solo" viewBox="${MONO_VIEWBOX}" style="height:16px"><path d="${MONO_D}"/></svg></div>
          <div class="r"><span class="k">Monogram alone, 24 px tall</span><svg class="solo" viewBox="${MONO_VIEWBOX}" style="height:24px"><path d="${MONO_D}"/></svg></div>
        </div>`;
      const lockSheet = `<!doctype html><html><head><meta charset="utf-8"><style>
        @font-face{font-family:Inter;src:url('${pathToFileURL(path.join(TREE, 'packages/fonts/assets/InterVariable.woff2')).href}') format('woff2');font-weight:100 900}
        body{margin:0;font:13px/1.45 Inter,sans-serif;width:1400px;display:grid;grid-template-columns:1fr 1fr}
        .g{padding:32px 40px}.paper{background:#fff;color:#070707}.ink{background:#070707;color:#f2f2f0}
        .r{display:grid;grid-template-columns:200px 1fr;align-items:center;min-height:56px;border-top:1px solid currentColor;border-color:rgba(127,127,127,.3);padding:12px 0}
        .k{opacity:.7;font-size:12px}
        .lk{display:inline-flex;align-items:baseline;gap:.364em;font-weight:500;letter-spacing:-0.025em;font-feature-settings:'cv11','ss01'}
        .lk .mono{height:.7765em;width:auto;fill:currentColor;transform:translateY(.0243em);flex:none}
        .solo{width:auto;fill:currentColor;display:block}
        .file{color:inherit}
      </style></head><body>${ground('paper')}${ground('ink')}</body></html>`;
      await shootHtml(browser, lockSheet, path.join(MARKS, 'lockup-sheet.png'), 1400, 600);

      // the banner on the code panel (#101010, white monospace, DECK-GRAMMAR 31)
      const bannerSheet = `<!doctype html><html><head><meta charset="utf-8"><style>
        body{margin:0;background:#101010;color:rgba(255,255,255,.87);padding:28px 32px;width:900px}
        pre{font:13px/1.2 ui-monospace,'SF Mono',Menlo,monospace;margin:0 0 20px;white-space:pre}
      </style></head><body><pre>${bannerText.replace(/</g, '&lt;')}</pre></body></html>`;
      await shootHtml(browser, bannerSheet, path.join(MARKS, 'cli-banner.png'), 960, 400);
    });
    note({ phase: 'marks', record });
  }

  if (phase === 'pages' || phase === 'all') {
    buildPages();
    const results = await withBrowser(renderPages);
    record.pages = results;
  }
  record.uptimeAtEnd = os.loadavg();
  writeFileSync(path.join(HERE, `render-log-${phase}.json`), `${JSON.stringify({ record, log }, null, 2)}\n`);
}

await main();
