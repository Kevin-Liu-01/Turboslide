// The /home hero twin: a Paper Shaders frame (paper:mesh-gradient, ink-paper preset), captured
// in Chrome for Testing the way packages/materials/src/capture.ts does (the package's dist served
// through Playwright request routing at a fixed origin), then cut into 1-bit twins by the deck's
// own pipeline: packages/effects/src/pipeline.ts twoToneScreenTypeScript, polarity, the 2x nearest
// upscale and the 1-bit PNG encoder. Nothing here runs from pnpm; sharp and playwright-core come
// from the repository's node_modules.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const sharp = require('sharp');
const { chromium } = require('playwright-core');
const EFFECTS = '/Users/kevinliu/repos/Turboslide/packages/effects/src';
const { twoToneScreenTypeScript } = await import(`${EFFECTS}/pipeline.ts`);
const { encodePng1 } = await import(`${EFFECTS}/png1.ts`);
const { scaleNearest } = await import(`${EFFECTS}/resample.ts`);
const { invertBits } = await import(`${EFFECTS}/image.ts`);
const { twoToneMetrics } = await import(`${EFFECTS}/metrics.ts`);

const PAPER = '/Users/kevinliu/repos/Turboslide/node_modules/.pnpm/@paper-design+shaders@0.0.78/node_modules/@paper-design/shaders/dist';
const OUT = '/Users/kevinliu/repos/Turboslide/docs/gslides-parity/design-4/type/previews';
const SCRATCH = '/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/type3';
const EXE = '/Users/kevinliu/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const ORIGIN = 'https://turboslide.capture';
const W = 1600;
const H = 900;

// The recipe: paper:mesh-gradient with the GT `ink-paper` preset colors (packages/materials/src/
// presets.ts: back ink, front paper-ink, colors paperInk and titanium) and the catalog defaults for
// distortion and swirl (catalog.ts: 0.8 and 0.1), frame 4200 ms.
const RECIPES = [
  { material: 'paper:mesh-gradient', colors: ['#070707', '#f2f2f0', '#8a8f98', '#070707'], distortion: 0.8, swirl: 0.1, frame: 4200, offsetX: 0, tone: { black: 10, white: 235, gamma: 1.15 } },
  { material: 'paper:mesh-gradient', colors: ['#070707', '#070707', '#f2f2f0', '#3a3d44'], distortion: 0.8, swirl: 0.1, frame: 4200, offsetX: 0.35, tone: { black: 60, white: 245, gamma: 1.35 } },
  { material: 'paper:mesh-gradient', colors: ['#070707', '#070707', '#8a8f98', '#f2f2f0'], distortion: 0.6, swirl: 0.15, frame: 6800, offsetX: 0.4, tone: { black: 80, white: 250, gamma: 1.5 } },
];
const PICK = Number(process.env.VARIANT ?? '0');
const RECIPE = RECIPES[PICK];
const SUFFIX = process.env.FINAL ? '' : `-v${PICK}`;
const DEST = process.env.FINAL ? OUT : SCRATCH;

const page$ = `<!doctype html><html><head><style>html,body{margin:0;background:#070707}#host{width:${W}px;height:${H}px}</style></head>
<body><div id="host"></div>
<script type="module">
import { ShaderMount, meshGradientFragmentShader, getShaderColorFromString } from '${ORIGIN}/paper/index.js';
const host = document.getElementById('host');
const colors = ${JSON.stringify(RECIPE.colors)}.map((c) => getShaderColorFromString(c));
const uniforms = {
  u_colors: colors, u_colorsCount: colors.length,
  u_distortion: ${RECIPE.distortion}, u_swirl: ${RECIPE.swirl}, u_grainMixer: 0, u_grainOverlay: 0,
  u_fit: 0, u_scale: 1, u_rotation: 0, u_offsetX: ${RECIPE.offsetX}, u_offsetY: 0, u_originX: 0.5, u_originY: 0.5, u_worldWidth: 0, u_worldHeight: 0,
};
const mount = new ShaderMount(host, meshGradientFragmentShader, uniforms, { preserveDrawingBuffer: true }, 0, ${RECIPE.frame}, 1, ${W * H + 1});
window.__mount = mount;
window.__ready = true;
</script></body></html>`;

const browser = await chromium.launch({
  executablePath: EXE,
  headless: true,
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await context.route(`${ORIGIN}/**`, async (route) => {
  const url = new URL(route.request().url());
  if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: page$ });
  if (url.pathname.startsWith('/paper/')) {
    const file = join(PAPER, url.pathname.slice('/paper/'.length));
    if (!existsSync(file)) return route.fulfill({ status: 404, body: 'missing ' + file });
    const type = extname(file) === '.js' ? 'text/javascript' : 'application/octet-stream';
    return route.fulfill({ status: 200, contentType: type, body: readFileSync(file) });
  }
  return route.fulfill({ status: 404, body: 'no' });
});
const page = await context.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
await page.goto(`${ORIGIN}/`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 });
await page.waitForTimeout(600);
const renderer = await page.evaluate(() => {
  const gl = document.querySelector('canvas').getContext('webgl2') ?? document.querySelector('canvas').getContext('webgl');
  const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
  return gl && ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
const canvas = await page.$('canvas');
const framePng = await canvas.screenshot({ type: 'png' });
writeFileSync(join(SCRATCH, 'hero-frame.png'), framePng);
await browser.close();

// Decode the frame to RGBA and cut the twins with the product's TypeScript stages.
const { data, info } = await sharp(framePng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const rgba = { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength) };
const params = { kind: 'two-tone', channel: 'gray', blur: 1.2, autocontrast: 0.5, ...RECIPE.tone, polarity: 'dark-ground', cell: 2, bayer: 8, resampler: 'lanczos3' };
const t0 = performance.now();
const { positive, toneImage } = twoToneScreenTypeScript(rgba, params);
const t1 = performance.now();
const darkBits = positive; // dark-ground: lit cells are paper on ink
const lightBits = invertBits(darkBits);
const dark = scaleNearest(darkBits, 2);
const light = scaleNearest(lightBits, 2);
const darkPng = encodePng1(dark, { palette: [[7, 7, 7], [242, 242, 240]] });
const lightPng = encodePng1(light, { palette: [[7, 7, 7], [255, 255, 255]] });
writeFileSync(join(DEST, `hero${SUFFIX}-dark.png`), darkPng);
writeFileSync(join(DEST, `hero${SUFFIX}-light.png`), lightPng);
// The frame itself, as the mockup's "frozen frame under the twin" reference (JPEG, 1600 by 900).
await sharp(framePng).jpeg({ quality: 82 }).toFile(join(DEST, `hero${SUFFIX}-frame.jpg`));
// The plate the hero heading sits on: measured with the pipeline's own metric.
const metrics = twoToneMetrics(darkBits, [96, 96, 760, 300], 2);
const report = {
  date: '2026-09-13',
  recipe: RECIPE,
  renderer,
  frame: `${info.width} by ${info.height}`,
  backend: 'typescript',
  params,
  screenMs: +(t1 - t0).toFixed(1),
  metrics,
  darkBytes: darkPng.length,
  lightBytes: lightPng.length,
};
writeFileSync(join(DEST, `hero${SUFFIX}-report.json`), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 1));
