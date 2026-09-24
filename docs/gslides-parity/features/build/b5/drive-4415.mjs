// B5's hand drive on the lane's dev server (4415): a /new deck, a material block inserted through
// the window API (Insert > Shader is B1's row by request, so the block lands through block.insert
// as the matrix rows' setup names), then the readings this lane's files decide: the sheet's box
// carries no label text, the recipe attribute rides the speed, the live mount is a canvas, the
// filmstrip card has no text, the Pictures and materials panel has no Material section, the
// generated Format options section still routes (the Shader section mount is the integrator's
// request). The deck is trashed and removed forever at the end.
import { createRequire } from 'node:module';
const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');

const BASE = process.env.BASE ?? 'http://localhost:4415';
const EXE =
  '/Users/kevinliu/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const rows = [];
const row = (step, expected, observed, ok) => {
  rows.push({ step, expected, observed, ok });
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${step}\n     expected: ${expected}\n     observed: ${observed}`,
  );
};

const browser = await chromium.launch({
  executablePath: EXE,
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' && !/\[Server\]|__tsd\/|worker work volume/.test(m.text()))
    errors.push(m.text().slice(0, 200));
});
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
const invoke = (action, input = {}) =>
  page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);
const describe = () => page.evaluate(() => window.turboslide.studio.describe());
let deckId = null;
try {
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => window.turboslide?.studio && document.querySelector('.pt-slide'),
    null,
    { timeout: 30000 },
  );
  await page.waitForTimeout(1500);
  let d = await describe();
  deckId = d.deck?.id ?? d.state?.deckId ?? null;
  const slideId = d.state?.slideId ?? d.slide?.id;
  console.log('deck', deckId, 'slide', slideId);
  // the block: liquid metal, the featured preset, a speed control, at a 4:1 band
  const inserted = await invoke('block.insert', {
    slideId,
    slot: 'main',
    block: {
      id: 'shader',
      type: 'material',
      materialId: 'paper:liquid-metal',
      preset: 'diamond',
      controls: { speed: 1.5 },
      motion: { play: 'show' },
      pos: { x: 200, y: 400, w: 600, h: 150 },
      alt: 'The liquid metal shader',
    },
    baseRevision: (await describe()).state?.revision ?? d.deck?.revision ?? 0,
  }).catch((e) => ({ error: String(e) }));
  row(
    'block.insert of a material block with motion, controls and pos',
    'accepted',
    JSON.stringify(inserted).slice(0, 160),
    inserted && !inserted.error,
  );
  /* the shader library arrives with the first material root (SPEC-4 0.44), a Vite dev transform
     on the first load: the mount is awaited, up to 20 s, then the facts are read */
  const mountMs = Date.now();
  const mounted = await page
    .waitForFunction(
      () =>
        document.querySelector('.pt-slide [data-block="shader"][data-live] .material canvas') !==
        null,
      null,
      { timeout: 20000 },
    )
    .then(() => Date.now() - mountMs)
    .catch(() => null);
  console.log('mount after', mounted, 'ms');
  await page.waitForTimeout(600);
  const facts = await page.evaluate(() => {
    const root = document.querySelector('.pt-slide [data-block="shader"][data-live]');
    const box = root?.querySelector('.material');
    return {
      root: root !== null,
      label: box?.querySelector('.material-label') !== null,
      text: (box?.textContent ?? '').trim(),
      canvas: box?.querySelectorAll('canvas').length ?? 0,
      recipe: root?.getAttribute('data-recipe'),
      stageCanvases: document.querySelectorAll(
        '.pt-slide [data-live] canvas, .pt-slide canvas.dither',
      ).length,
      liveRoots: document.querySelectorAll('[data-block="shader"][data-live]').length,
      pageCanvases: document.querySelectorAll('canvas').length,
      cardText: (
        document.querySelector('[data-control^="filmstrip.slide."] .material')?.textContent ?? ''
      ).trim(),
      cardLabel:
        document.querySelector('[data-control^="filmstrip.slide."] .material-label') !== null,
    };
  });
  row(
    'the sheet draws the box with no label text',
    'no .material-label, empty text',
    JSON.stringify({ label: facts.label, text: facts.text }),
    facts.root && !facts.label && facts.text === '',
  );
  row(
    'the live mount is one canvas over the box',
    'canvas 1 in the box',
    `box canvas ${facts.canvas}; stage ${facts.stageCanvases}; page ${facts.pageCanvases}; mounted after ${mounted} ms`,
    facts.canvas === 1,
  );
  row(
    'the recipe attribute rides the Speed control',
    'speed 1.5 in data-recipe',
    String(facts.recipe),
    (facts.recipe ?? '').includes('"speed":1.5'),
  );
  row(
    'the filmstrip card draws no label',
    'no text on the card',
    JSON.stringify({ cardLabel: facts.cardLabel, cardText: facts.cardText }),
    !facts.cardLabel && facts.cardText === '',
  );
  // the live mount plays: two screenshots of the box 900 ms apart differ (speed 1.5)
  const boxRect = await page.evaluate(() => {
    const r = document
      .querySelector('.pt-slide [data-block="shader"][data-live] .material')
      ?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
  });
  const shot = async () =>
    boxRect ? (await page.screenshot({ clip: boxRect })).toString('base64') : null;
  const a = await shot();
  await page.waitForTimeout(900);
  const b = await shot();
  row(
    'the selected mount plays (two shots 900 ms apart differ)',
    'differ',
    a === null ? 'no box' : a === b ? 'identical' : 'differ',
    a !== null && a !== b,
  );
  // under speed 0 (the recipe's Speed at 0) the mount holds its frame
  const rev0 = (await describe()).state?.revision ?? 0;
  await invoke('block.set', {
    slideId,
    blockId: 'shader',
    path: '/controls',
    value: { speed: 0 },
    baseRevision: rev0,
  }).catch((e) => ({ error: String(e) }));
  await page
    .waitForFunction(
      () =>
        document.querySelector('.pt-slide [data-block="shader"][data-live] .material canvas') !==
        null,
      null,
      { timeout: 20000 },
    )
    .catch(() => null);
  await page.waitForTimeout(600);
  const c = await shot();
  await page.waitForTimeout(900);
  const d2 = await shot();
  row(
    'at Speed 0 the mount holds its frame (two shots 900 ms apart identical)',
    'identical',
    c === null ? 'no box' : c === d2 ? 'identical' : 'differ',
    c !== null && c === d2,
  );
  // the document: the block as stored
  const slide = await invoke('slide.get', { slideId });
  const stored = (slide.slide?.slots?.main ?? []).find((b) => b.id === 'shader');
  row(
    'the document keeps motion, controls and preset',
    'preset diamond, motion.play show, controls.speed 0 after the set',
    JSON.stringify({ preset: stored?.preset, motion: stored?.motion, controls: stored?.controls }),
    stored?.preset === 'diamond' &&
      stored?.motion?.play === 'show' &&
      stored?.controls?.speed === 0,
  );
  // shader.list on the window API (registered only once the action table names it)
  const list = await invoke('shader.list', {}).catch((e) => ({ error: String(e).slice(0, 120) }));
  row(
    'shader.list on the window transport (not driven: the schema entry is request R1)',
    'answers once the schema entry lands',
    JSON.stringify(list).slice(0, 120),
    false,
  );
  row(
    'no console errors during the drive',
    'none',
    errors.length === 0 ? 'none' : errors.join(' | ').slice(0, 300),
    errors.length === 0,
  );
} finally {
  if (deckId) {
    try {
      const rev = (await describe()).state?.revision ?? 0;
      await invoke('deck.trash', { id: deckId, baseRevision: rev }).catch(() => undefined);
      const info = await invoke('deck.info').catch(() => null);
      await invoke('deck.remove', { id: deckId, baseRevision: info?.revision ?? 0 }).catch(
        () => undefined,
      );
      const gone = await page
        .goto(`${BASE}/deck/${deckId}`, { waitUntil: 'domcontentloaded' })
        .then((r) => r?.status());
      console.log('cleanup: deck trashed and removed; /deck answers', gone);
    } catch (e) {
      console.log('cleanup failed', String(e));
    }
  }
  await browser.close();
  const okCount = rows.filter((r) => r.ok).length;
  console.log(`\n${rows.length} steps, ${okCount} ok, ${rows.length - okCount} not ok`);
  const fs = await import('node:fs');
  fs.writeFileSync(
    '/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/b5-drive.json',
    JSON.stringify({ base: BASE, at: new Date().toISOString(), rows, errors }, null, 2),
  );
}
