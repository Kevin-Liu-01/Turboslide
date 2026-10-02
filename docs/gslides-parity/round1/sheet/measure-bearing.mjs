// Measures the left side bearing of Inter 500's T in rendered pixels at each optical size, because
// the lockup's gap is measured from ink to ink and Inter's opsz axis moves the T's bearing: the
// browser sets opsz to the font size in px between 14 and 32 (font-optical-sizing: auto), and
// fontkit 2.0.4 reads only the default instance (wght 400, opsz 14). The T is drawn at 1000 px
// with opsz pinned, the leftmost ink column at the half threshold is found in the screenshot, and
// the bearing is written in font units to marks/bearing.json, which build-sheet.mjs reads.
//
//   node docs/gslides-parity/round1/sheet/measure-bearing.mjs
//
// The run refuses to start at a one minute load average of 24 or more (the round's load rule).
import { writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../../..');
const load = loadavg()[0];
if (load >= 24) {
  console.error(`load average ${load.toFixed(2)} is 24 or more; the round's load rule holds the run`);
  process.exit(3);
}
const { chromium } = await import(join(ROOT, 'node_modules/playwright-core/index.mjs'));

const SIZE = 1000;
const font = pathToFileURL(join(ROOT, 'packages/fonts/assets/InterVariable.woff2')).href;
const page = join(HERE, 'pages/bearing.html');
writeFileSync(
  page,
  `<!doctype html><meta charset="utf-8"><style>@font-face{font-family:I;src:url(${font}) format('woff2');font-weight:100 900}
html,body{margin:0;background:#fff}span{font:500 ${SIZE}px/1 I;position:absolute;left:100px;top:0;color:#000;font-optical-sizing:none}</style><span id="t">T</span>\n`,
);
const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 1000, height: 1100 }, deviceScaleFactor: 1 });
await p.goto(pathToFileURL(page).href);
await p.evaluate(async (s) => {
  await document.fonts.load(`500 ${s}px I`);
  await document.fonts.ready;
}, SIZE);
const table = {};
for (const opsz of [14, 16, 18, 20, 22, 24, 26, 28, 30, 32]) {
  await p.evaluate((o) => (document.getElementById('t').style.fontVariationSettings = `'opsz' ${o}`), opsz);
  await p.waitForTimeout(60);
  const left = await p.evaluate(async () => {
    const span = document.getElementById('t').getBoundingClientRect().left;
    return span;
  });
  const png = await p.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 600, height: 1100 } });
  const ink = await p.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    for (let col = 0; col < c.width; col++) for (let row = 0; row < c.height; row++) if (d[(row * c.width + col) * 4] < 128) return col;
    return -1;
  }, png.toString('base64'));
  table[opsz] = Math.round(((ink - left) / SIZE) * 2048);
}
await browser.close();
const out = { measured: new Date().toISOString(), load: Number(load.toFixed(2)), weight: 500, sizePx: SIZE, unitsPerEm: 2048, tLeftBearingByOpsz: table };
writeFileSync(join(HERE, 'marks/bearing.json'), JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(out));
