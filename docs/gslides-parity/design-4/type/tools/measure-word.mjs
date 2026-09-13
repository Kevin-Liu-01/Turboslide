import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');
const EXE = '/Users/kevinliu/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const b64 = readFileSync('/Users/kevinliu/repos/Turboslide/packages/fonts/assets/InterVariable.woff2').toString('base64');
const FONT = `data:font/woff2;base64,${b64}`;
const html = `<!doctype html><html><head><style>
@font-face{font-family:'Inter';font-style:normal;font-weight:100 900;src:url('${FONT}') format('woff2');}
body{margin:0;background:#fff}
.w{font-family:'Inter';font-weight:500;font-size:1000px;line-height:1;letter-spacing:-0.025em;font-feature-settings:'cv11','ss01';font-optical-sizing:auto;white-space:nowrap;position:absolute;left:100px;top:100px}
.w0{letter-spacing:0}
</style></head><body><div class="w" id="a">Turboslide</div><div class="w w0" id="b" style="top:1400px">Turboslide</div></body></html>`;
const browser = await chromium.launch({ executablePath: EXE, headless: true });
const page = await browser.newPage({ viewport: { width: 8000, height: 2800 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
const result = await page.evaluate(() => {
  const out = {};
  for (const id of ['a', 'b']) {
    const el = document.getElementById(id);
    const node = el.firstChild;
    const base = el.getBoundingClientRect();
    const chars = [];
    for (let i = 0; i < node.textContent.length; i++) {
      const r = document.createRange();
      r.setStart(node, i); r.setEnd(node, i + 1);
      const b = r.getBoundingClientRect();
      chars.push({ ch: node.textContent[i], x: b.left - base.left, w: b.width });
    }
    out[id] = { width: base.width, height: base.height, chars, fontsLoaded: document.fonts.check("500 1000px Inter") };
  }
  return out;
});
writeFileSync('word-positions.json', JSON.stringify(result, null, 1));
console.log(JSON.stringify(result.a.chars.map(c => [c.ch, +c.x.toFixed(1), +c.w.toFixed(1)])), 'total', result.a.width.toFixed(1), 'loaded', result.a.fontsLoaded);
console.log('no tracking', JSON.stringify(result.b.chars.map(c => [c.ch, +c.x.toFixed(1)])), 'total', result.b.width.toFixed(1));
await browser.close();
