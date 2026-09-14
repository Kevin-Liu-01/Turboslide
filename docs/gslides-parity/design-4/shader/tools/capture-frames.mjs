import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');
const P =
  await import('/Users/kevinliu/repos/Turboslide/node_modules/.pnpm/@paper-design+shaders@0.0.78/node_modules/@paper-design/shaders/dist/index.js');
const c = (s) => P.getShaderColorFromString(s);
const EXE =
  '/Users/kevinliu/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
mkdirSync('frames', { recursive: true });
const sizing = {
  u_fit: 1,
  u_scale: 0.5,
  u_rotation: 0,
  u_offsetX: 0,
  u_offsetY: 0,
  u_originX: 0.5,
  u_originY: 0.5,
  u_worldWidth: 0,
  u_worldHeight: 0,
};
const lm = (over) => ({
  u_colorBack: c('#000000'),
  u_colorTint: c('#ffffff'),
  u_repetition: 3,
  u_softness: 0.05,
  u_shiftRed: 0,
  u_shiftBlue: 0,
  u_distortion: 0.07,
  u_contour: 0.6,
  u_angle: 70,
  u_shape: 3,
  ...sizing,
  ...over,
});
const gs = (over) => ({
  u_colorBack: c('#2f5ce0'),
  u_colors: [c('#ffffff'), c('#86a8ff')],
  u_colorsCount: 2,
  u_colorInner: c('#00000000'),
  u_innerDistortion: 0.8,
  u_outerDistortion: 0.6,
  u_outerGlow: 0.55,
  u_innerGlow: 1,
  u_offset: 0,
  u_angle: 0,
  u_size: 0.8,
  u_shape: 4,
  ...sizing,
  u_scale: 0.6,
  ...over,
});
const recipes = [
  ['lm-field', 'liquidMetal', lm({ u_shape: 0, u_fit: 2, u_scale: 1 }), [2500, 5500, 9000]],
  ['lm-metaballs', 'liquidMetal', lm({ u_shape: 4, u_scale: 0.8 }), [2500, 5500, 9000]],
  ['lm-diamond', 'liquidMetal', lm({}), [5500]],
  ['gs-blue-metaballs', 'gemSmoke', gs({}), [0, 3000, 6000]],
  ['gs-blue-none', 'gemSmoke', gs({ u_shape: 0, u_fit: 2, u_scale: 1 }), [0, 3000, 6000]],
  [
    'gs-ink-metaballs',
    'gemSmoke',
    gs({ u_colorBack: c('#070707'), u_colors: [c('#f2f2f0'), c('#8a8f98')] }),
    [3000, 6000],
  ],
];
const browser = await chromium.launch({
  executablePath: EXE,
  headless: true,
  args: [
    '--use-gl=angle',
    '--use-angle=metal',
    '--ignore-gpu-blocklist',
    '--allow-file-access-from-files',
  ],
});
const page = await browser.newPage({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
});
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('file://' + process.cwd() + '/capture.html');
await page.waitForFunction(() => window.__ready === true);
for (const [name, shader, uniforms, frames] of recipes) {
  const t0 = Date.now();
  await page.evaluate(([s, u, f]) => window.__mountRecipe(s, u, f), [shader, uniforms, frames[0]]);
  for (const f of frames) {
    await page.evaluate((ms) => window.__setFrame(ms), f);
    const canvas = page.locator('#host canvas');
    const buf = await canvas.screenshot({ type: 'png', animations: 'disabled' });
    writeFileSync(`frames/${name}-${f}.png`, buf);
    console.log(name, f, buf.length, 'bytes', Date.now() - t0, 'ms');
  }
}
await browser.close();
