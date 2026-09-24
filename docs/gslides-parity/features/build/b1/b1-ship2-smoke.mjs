// B1's smoke for ship two on its own dev server (docs/FEATURES.md 5.4, 5.5, 5.2 item 5): the
// Shader gallery from the Insert menu (the words, the cards, the stills, the search, the chips, no
// canvas), the P1 hover live mount, a card's insert and the selection, and the Background dialog's
// Shader row (Choose, a card, the words, Place, "Placing" with the seconds, the ground or the one
// sentence). Playwright-core from the repository root, at 1440 by 900, at human speed, one scratch
// deck from /new trashed and removed at the end. Writes a JSON table beside this script. Usage:
//   node b1-ship2-smoke.mjs --base http://localhost:4411 [--out <path>]
// Run under .turboslide/e2e.lock when the base is the checkout's own server (AGENTS.md).
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(new URL('../../../../../package.json', import.meta.url));
const { chromium } = require('playwright-core');

const argv = process.argv.slice(2);
const arg = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const base = arg('--base', 'http://localhost:4411');
const out = arg(
  '--out',
  path.join(path.dirname(new URL(import.meta.url).pathname), 'b1-ship2-smoke-run.json'),
);
const rows = [];
const record = (step, expected, observed, ok) => {
  rows.push({ n: rows.length + 1, step, expected, observed: String(observed), ok });
  console.log(`${ok ? 'ok ' : 'NOT'} ${step}: ${observed}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
/* Insert > Material is behind Tools > Advanced tools until the integrator's R1 renames it Shader
   in the default view; the switch is remembered per browser under ts-editor-settings */
await context.addInitScript(() => {
  try {
    localStorage.setItem('ts-editor-settings', JSON.stringify({ advancedTools: true }));
  } catch {
    // private mode
  }
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`);
});
const invoke = (action, input) =>
  page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);
const state = () => page.evaluate(() => window.turboslide.studio.describe().state);
const control = (id) => page.locator(`[data-control="${id}"]`);
const visible = async (id) => (await control(id).count()) > 0 && control(id).first().isVisible();
const pollUntil = async (read, done, ms, every = 100) => {
  const until = Date.now() + ms;
  let last = await read();
  while (!done(last) && Date.now() < until) {
    await sleep(every);
    last = await read();
  }
  return last;
};
/** B4's card reader (core-walk/areas/shaders.mjs): the top level dialog.shader.tile.* elements. */
const cards = () =>
  page.evaluate(() => {
    const sel = '[data-control^="dialog.shader.tile."]';
    const all = [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length > 0);
    const top = all.filter((e) => e.parentElement?.closest(sel) === null);
    return top.map((e) => {
      const img = e.querySelector('img');
      const r = e.getBoundingClientRect();
      return {
        id: e.getAttribute('data-control'),
        material: e.getAttribute('data-material'),
        preset: e.getAttribute('data-preset'),
        title: (e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 60),
        thumb: img ? img.complete && img.naturalWidth > 0 : false,
        plate: e.querySelector('[data-thumb="none"]') !== null,
        top: Math.round(r.top),
        x: Math.round(r.left + r.width / 2),
        y: Math.round(r.top + r.height / 2),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    });
  });
const dialogCanvases = () =>
  page.evaluate(() => {
    const root =
      document.querySelector('[data-control="dialog.shader"]')?.closest('[role="dialog"]') ??
      document.querySelector('[data-control="dialog.shader"]');
    return root ? root.querySelectorAll('canvas').length : 0;
  });
const moveHuman = async (from, to, steps) => {
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(
      from.x + ((to.x - from.x) * i) / steps,
      from.y + ((to.y - from.y) * i) / steps,
    );
    await sleep(30);
  }
};
const closeMenus = async () => {
  await page.keyboard.press('Escape');
  await sleep(150);
  await page.keyboard.press('Escape');
  await sleep(150);
};
/** Opens the gallery from the Insert menu: insert.shader (R1) or insert.material through the shim. */
const openGallery = async () => {
  await control('menubar.insert').first().click();
  await sleep(400);
  const row =
    (await control('menu.insert.shader').count()) > 0
      ? 'menu.insert.shader'
      : (await control('menu.insert.material').count()) > 0
        ? 'menu.insert.material'
        : null;
  if (row === null) {
    await closeMenus();
    return { open: false, row: null };
  }
  await control(row).first().click();
  const open = await pollUntil(
    () => visible('dialog.shader'),
    (x) => x,
    8000,
  );
  return { open, row };
};
let deckId = null;
try {
  await page.goto(`${base}/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
  await sleep(800);
  let s = await state();
  deckId = s.deckId ?? (await invoke('deck.info')).id;
  const slideId = s.slideId ?? s.slide?.id ?? (await invoke('slide.list')).slides?.[0]?.id;
  record(
    'the editor boots on /new',
    'window.turboslide.studio and a slide',
    `deck ${deckId}, slide ${slideId}`,
    Boolean(slideId),
  );

  /* shaders.insert.gallery-thumbnails */
  const opened = await openGallery();
  record(
    'Insert opens the Shader gallery',
    'dialog.shader within 8 s from insert.shader, or from insert.material through the shim until R1',
    opened.open ? `open from ${opened.row}` : `not open (row ${opened.row ?? 'absent'})`,
    opened.open,
  );
  if (!opened.open) throw new Error('the gallery did not open');
  const openedAt = Date.now();
  const words = await page.evaluate(() => {
    const root = document
      .querySelector('[data-control="dialog.shader"]')
      ?.closest('[role="dialog"]');
    return {
      title: root?.querySelector('h1, h2, h3')?.textContent?.trim() ?? null,
      sentence: root?.querySelector('[data-control="dialog.shader.sentence"]')?.textContent ?? null,
      focus: document.activeElement?.getAttribute('data-control') ?? null,
    };
  });
  record('the title reads Shader', 'Shader', words.title, words.title === 'Shader');
  record(
    'the black and white sentence under the title',
    'Previews are in black and white. The shader takes your brand kit’s colours on the slide',
    words.sentence,
    /black and white/i.test(words.sentence ?? '') && /brand kit/i.test(words.sentence ?? ''),
  );
  record(
    'the search field has the focus',
    'dialog.shader.search',
    words.focus,
    words.focus === 'dialog.shader.search',
  );
  const all = await pollUntil(
    cards,
    (list) => list.length > 0 && list.every((c) => c.thumb),
    2000,
    100,
  );
  const decodedMs = Date.now() - openedAt;
  const decoded = all.filter((c) => c.thumb).length;
  const plates = all.filter((c) => c.plate).length;
  record(
    '17 cards in the featured order',
    'liquid metal, gem smoke, god rays, mesh gradient, smoke ring, grain gradient first; 17 in all',
    `${all.length} cards: ${all
      .slice(0, 6)
      .map((c) => c.title)
      .join(', ')}; the first inserts ${all[0]?.preset}`,
    all.length === 17 &&
      all[0]?.material === 'paper:liquid-metal' &&
      all[0]?.preset === 'diamond' &&
      all[1]?.material === 'paper:gem-smoke' &&
      all[2]?.material === 'paper:god-rays',
  );
  const tops = new Map();
  for (const c of all) tops.set(c.top, (tops.get(c.top) ?? 0) + 1);
  const perRow = Math.max(1, ...tops.values());
  record(
    'every card has a decoded thumbnail within 2 s',
    '17 decoded (B5’s packages/materials/previews/*.webp on the build)',
    `${decoded} decoded, ${plates} plates with no text, ${decodedMs} ms after the open; ${perRow} a row`,
    decoded === all.length && decodedMs <= 2000,
  );
  const canvases0 = await dialogCanvases();
  record('no canvas is mounted in the dialog', '0', canvases0, canvases0 === 0);
  await control('dialog.shader.search').first().click();
  await page.keyboard.type('metal', { delay: 60 });
  const narrowed = await pollUntil(cards, (list) => list.length < all.length, 4000, 100);
  record(
    'the search narrows to "metal" in one row',
    'one card, Liquid metal',
    `${narrowed.length} (${narrowed.map((c) => c.title).join(', ')})`,
    narrowed.length > 0 &&
      narrowed.length <= perRow &&
      narrowed.some((c) => /liquid metal/i.test(c.title)),
  );
  await page.keyboard.press('Meta+a');
  await page.keyboard.press('Backspace');
  await sleep(300);
  const chips = await page.evaluate(() =>
    [...document.querySelectorAll('[data-control^="dialog.shader.category."]')]
      .filter((e) => e.getClientRects().length > 0)
      .map((e) => ({ id: e.getAttribute('data-control'), on: e.getAttribute('aria-checked') })),
  );
  await control('dialog.shader.category.metal').first().click();
  const chipped = await pollUntil(cards, (list) => list.length < all.length, 4000, 100);
  record(
    'a category chip narrows the grid',
    'six chips, All checked first; Metal narrows to the metal shaders',
    `${chips.length} chips (${chips.find((c) => c.on === 'true')?.id} checked); Metal narrows to ${chipped.length} (${chipped.map((c) => c.title).join(', ')})`,
    chips.length === 6 &&
      chips[0]?.id === 'dialog.shader.category.all' &&
      chips[0]?.on === 'true' &&
      chipped.length > 0 &&
      chipped.length < all.length,
  );
  await control('dialog.shader.category.all').first().click();
  await sleep(300);

  /* shaders.insert.gallery-hover-live (P1) */
  const surface = await page.evaluate(() =>
    Boolean(
      document
        .querySelector('[data-control="dialog.shader"]')
        ?.closest('[role="dialog"]')
        ?.querySelector('[data-hover-live]'),
    ),
  );
  const list = await cards();
  const a = list[0];
  const b = list[1];
  await moveHuman({ x: a.x - 40, y: a.y }, { x: a.x, y: a.y }, 6);
  const mounted = await pollUntil(dialogCanvases, (n) => n >= 1, 1500, 50);
  await sleep(400);
  const held = await dialogCanvases();
  const liveId = await page.evaluate(
    () =>
      document
        .querySelector('[data-control^="dialog.shader.hover."]')
        ?.getAttribute('data-control') ?? null,
  );
  let peak = held;
  await moveHuman({ x: a.x, y: a.y }, { x: b.x, y: b.y }, 10);
  for (let i = 0; i < 12; i += 1) {
    peak = Math.max(peak, await dialogCanvases());
    await sleep(80);
  }
  const onSecond = await dialogCanvases();
  await page.mouse.move(40, 40);
  const left = await pollUntil(dialogCanvases, (n) => n === 0, 2000, 50);
  record(
    'hovering a card 400 ms mounts one canvas; leaving disposes it; never two at once (P1)',
    'surface data-hover-live; 1 after the hover, 1 at 400 ms, at most 1 while moving, 1 on the second card, 0 after leaving',
    `surface ${surface}; ${mounted} after the hover (${liveId ?? 'no hover control'}), ${held} at 400 ms, peak ${peak}, ${onSecond} on the second card, ${left} after leaving`,
    surface && mounted === 1 && held === 1 && peak <= 1 && onSecond === 1 && left === 0,
  );

  /* a card's insert: block.insert with the featured preset, the block selected, the dialog closed */
  const before = await state();
  /* the card through its locator: Playwright scrolls it into view first, as B4's clickControl does */
  await control(a.id).first().click();
  const gone = await pollUntil(
    async () => (await control('dialog.shader').count()) === 0,
    (x) => x,
    8000,
  );
  await sleep(600);
  const after = await state();
  const slide =
    (await invoke('slide.get', { slideId })).slide ?? (await invoke('slide.get', { slideId }));
  const blocks = JSON.stringify(slide);
  const inserted = /"type":"material"/.test(blocks);
  const material = (() => {
    try {
      const found = [];
      const walk = (node) => {
        if (Array.isArray(node)) node.forEach(walk);
        else if (node && typeof node === 'object') {
          if (node.type === 'material') found.push(node);
          Object.values(node).forEach(walk);
        }
      };
      walk(slide);
      return found[0] ?? null;
    } catch {
      return null;
    }
  })();
  /* describe().state reports the selected block as `blockId` (controller.tsx stateOf) */
  const selected = after.blockId ?? null;
  record(
    'a click on Liquid metal inserts the shader block and selects it (the placement is B5’s)',
    'dialog closed; one material block with materialId paper:liquid-metal, preset diamond, alt "The liquid metal shader", motion.play show; the selection names it',
    `closed ${gone}; block ${material ? `${material.id} ${material.materialId} ${material.preset} "${material.alt}" motion ${JSON.stringify(material.motion)} pos ${JSON.stringify(material.pos)}` : 'none'}; selection ${selected}; revision ${before.revision} -> ${after.revision}`,
    gone &&
      inserted &&
      material?.materialId === 'paper:liquid-metal' &&
      material?.preset === 'diamond' &&
      selected === material?.id,
  );

  /* shaders.background.place-answers: Slide > Change background > Shader > a card > Place */
  await closeMenus();
  await control('menubar.slide').first().click();
  await sleep(400);
  await control('menu.slide.changeBackground').first().click();
  const bg = await pollUntil(
    () => visible('dialog.background'),
    (x) => x,
    8000,
  );
  record('Slide > Change background opens', 'dialog.background', bg, bg);
  const shaderRow = await visible('dialog.background.shader');
  const placeBefore = await control('dialog.background.shader.place').first().isDisabled();
  record(
    'the Shader row with Choose and a disabled Place',
    'dialog.background.shader; Place disabled',
    `row ${shaderRow}; Place disabled ${placeBefore}`,
    shaderRow && placeBefore,
  );
  await control('dialog.background.shader').first().click();
  const grid = await pollUntil(
    () => visible('dialog.shader'),
    (x) => x,
    8000,
  );
  const compact = await page.evaluate(
    () =>
      document.querySelector('[data-control="dialog.shader"]')?.classList.contains('is-compact') ??
      false,
  );
  const bgCards = await cards();
  record(
    'Choose opens the gallery grid inside the dialog',
    'dialog.shader root, compact, 17 cards, no canvas',
    `root ${grid}, compact ${compact}, ${bgCards.length} cards, ${await dialogCanvases()} canvas`,
    grid && compact && bgCards.length === 17,
  );
  const liquid = bgCards.find((c) => /liquid metal/i.test(c.title)) ?? bgCards[0];
  await control(liquid.id).first().click();
  await pollUntil(
    async () => (await control('dialog.shader').count()) === 0,
    (x) => x,
    4000,
  );
  const chooseText = await control('dialog.background.shader').first().textContent();
  const chooseData = await control('dialog.background.shader')
    .first()
    .evaluate((e) => [e.getAttribute('data-material'), e.getAttribute('data-preset')]);
  record(
    'the Choose button reads the pick’s words',
    'Liquid metal, Diamond',
    `"${chooseText}" ${JSON.stringify(chooseData)}`,
    chooseText === 'Liquid metal, Diamond' &&
      chooseData[0] === 'paper:liquid-metal' &&
      chooseData[1] === 'diamond',
  );
  const t0 = Date.now();
  await control('dialog.background.shader.place').first().click();
  let placingSeen = null;
  let secondsSeen = null;
  const alertText = () =>
    page.evaluate(() => {
      const root = document.querySelector('[data-control="dialog.background"]');
      const alert = root?.querySelector('[data-control="dialog.background.error"], [role="alert"]');
      return alert ? (alert.textContent ?? '').replace(/\s+/g, ' ').trim() : null;
    });
  const read = async () => {
    const open = (await control('dialog.background').count()) > 0;
    const button =
      open && (await control('dialog.background.shader.place').count()) > 0
        ? await control('dialog.background.shader.place').first().textContent()
        : null;
    if (button && /placing/i.test(button)) {
      placingSeen = placingSeen ?? button;
      if (/\d/.test(button)) secondsSeen = button;
    }
    return { open, button, alert: open ? await alertText() : null };
  };
  const outcome = await pollUntil(read, (x) => !x.open || x.alert !== null, 65_000, 150);
  const ms = Date.now() - t0;
  const slideAfter = await invoke('slide.get', { slideId });
  const covering =
    /"kind":"material"|"source":\{"kind":"material"/.test(
      JSON.stringify(await invoke('deck.info').catch(() => ({}))),
    ) || /"picture"/.test(JSON.stringify(slideAfter));
  record(
    'Place reads "Placing" with the seconds while it waits',
    'Placing, then Placing, N s',
    `${placingSeen ?? 'never read Placing'}; ${secondsSeen ?? 'no seconds read'} (the write took ${ms} ms)`,
    placingSeen !== null && (secondsSeen !== null || ms < 1500),
  );
  record(
    'the ground changes, or one sentence names the failure and no log text',
    'dialog closed with a covering picture within 5 s, or dialog.background.error with one sentence',
    outcome.open
      ? `dialog open; sentence "${outcome.alert}" after ${ms} ms`
      : `dialog closed after ${ms} ms; covering picture ${covering}`,
    (!outcome.open && ms <= 65_000) ||
      (outcome.alert !== null &&
        !/browser logs|<launching>|\n/i.test(outcome.alert) &&
        outcome.alert.length <= 160),
  );
  if (outcome.open) {
    await page.keyboard.press('Escape');
    await sleep(300);
  }

  /* the parked set: nothing of the gallery is in the committed set */
  const parkedRead = await page.evaluate(() => {
    const d = window.turboslide.studio.describe();
    return {
      advancedTools: d.state?.settings?.advancedTools ?? null,
      playShaders: d.state?.settings?.playShaders ?? null,
    };
  });
  record(
    'describe().state.settings reads the switch and the P1 play setting',
    'advancedTools true; playShaders present once the integrator lands the MenuSetting',
    JSON.stringify(parkedRead),
    parkedRead.advancedTools === true,
  );
} catch (error) {
  record(
    'the run',
    'no exception',
    error instanceof Error ? `${error.message}` : String(error),
    false,
  );
} finally {
  const mine = errors.filter((e) => /ShaderGallery|Background|Download|parked|shader/i.test(e));
  record(
    'no console or page error from this lane’s modules',
    'none',
    mine.length === 0 ? 'none' : mine.join(' | '),
    mine.length === 0,
  );
  if (errors.length > 0) console.log('other console errors:', errors.length, errors.slice(0, 5));
  try {
    if (deckId) {
      const info = await invoke('deck.info').catch(() => null);
      if (info) {
        await invoke('deck.trash', { id: deckId, baseRevision: info.revision }).catch(
          () => undefined,
        );
        const t = await invoke('deck.info').catch(() => null);
        await invoke('deck.remove', {
          id: deckId,
          baseRevision: t?.revision ?? info.revision,
          confirm: true,
        }).catch(() => undefined);
      }
      let after = 0;
      for (let i = 0; i < 10 && after !== 404; i += 1) {
        after = await page.evaluate(async (id) => (await fetch(`/edit/${id}`)).status, deckId);
        if (after !== 404) await sleep(1000);
      }
      record(
        'the scratch deck is trashed and removed',
        '/edit/<id> answers 404',
        after,
        after === 404,
      );
    }
  } catch (error) {
    record(
      'the teardown',
      'trashed and removed',
      error instanceof Error ? error.message : String(error),
      false,
    );
  }
  writeFileSync(out, JSON.stringify({ base, at: new Date().toISOString(), rows }, null, 2));
  console.log(`${rows.filter((r) => r.ok).length} of ${rows.length} ok; table ${out}`);
  await browser.close();
}
