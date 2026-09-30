// The ship step's third attempt, B5's R27 (shaders.export.pdf-frame red twice: the PDF's image
// 3200 by 544 for a 1326 by 237 box): a shader inserted through the window API on a fresh deck of
// TURBOSLIDE_BASE, its frame awaited, then the material figure, its box and its img measured on the
// editor's stage and on the print document against the block's pos, with the grid's computed rows
// and gap. The mechanism is read from the boxes, never guessed; the deck is trashed at the end.
import { writeFileSync } from 'node:fs';
import { open, driver, newDeck, trashDeck, BASE, sleep } from '../../b5fix3/lib.mjs';

const OUT =
  process.env.OUT ??
  '/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/polish/ship3/r27';
const { browser, page } = await open({ width: 1440, height: 900 });
const t = driver(page, { prefix: process.env.PREFIX ?? 'r27-' });
const facts = { base: BASE, startedAt: new Date().toISOString(), steps: [] };
let deckId = null;
const measure = (blockId, sheetSel) =>
  page.evaluate(
    ([id, sel]) => {
      const sheet = document.querySelector(sel);
      if (!sheet) return { error: `no sheet ${sel}` };
      const sr = sheet.getBoundingClientRect();
      const k = 1600 / sr.width;
      const fig = sheet.querySelector(`[data-block="${id}"]`);
      if (!fig) return { error: `no figure for ${id}` };
      const box = fig.querySelector('.material');
      const img = fig.querySelector('img');
      const rect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          x: +((r.left - sr.left) * k).toFixed(1),
          y: +((r.top - sr.top) * k).toFixed(1),
          w: +(r.width * k).toFixed(1),
          h: +(r.height * k).toFixed(1),
        };
      };
      const cs = getComputedStyle(fig);
      return {
        sheet: { w: sr.width, h: sr.height },
        figClass: fig.className,
        figure: rect(fig),
        box: rect(box),
        img: rect(img),
        grid: {
          display: cs.display,
          rows: cs.gridTemplateRows,
          gap: cs.rowGap,
          columns: cs.gridTemplateColumns,
        },
        boxStyle: box
          ? { aspectRatio: getComputedStyle(box).aspectRatio, height: getComputedStyle(box).height }
          : null,
        imgNatural: img
          ? { w: img.naturalWidth, h: img.naturalHeight, fit: getComputedStyle(img).objectFit }
          : null,
        caption: fig.querySelector('figcaption') !== null,
      };
    },
    [blockId, sheetSel],
  );
try {
  deckId = await newDeck(t);
  facts.deck = deckId;
  let s = await t.state();
  const slideId = s.slideId;
  const made = await t.invoke('shader.insert', {
    slideId,
    materialId: 'paper:liquid-metal',
    baseRevision: s.revision,
  });
  const blockId = made.blockId ?? made.block?.id;
  facts.blockId = blockId;
  facts.posAtInsert = made.block?.pos ?? null;
  t.note('inserted', `${blockId} at ${JSON.stringify(made.block?.pos ?? null)}`);
  let asset = null;
  const t0 = Date.now();
  for (let i = 0; i < 200 && asset === null; i += 1) {
    const objs = await t.objectsOf(slideId);
    const b = objs.find((o) => o.id === blockId);
    asset = b?.block?.asset ?? null;
    if (asset === null) await sleep(300);
  }
  facts.asset = asset;
  facts.frameMs = Date.now() - t0;
  t.note('frame', `${asset ?? 'none'} after ${facts.frameMs} ms`);
  await t.settled();
  const objs = await t.objectsOf(slideId);
  const block = objs.find((o) => o.id === blockId);
  facts.pos = block?.pos ?? null;
  facts.assetRecord = (await t.state()).document?.deck?.assets?.[asset] ?? null;
  await sleep(1500);
  await page
    .waitForFunction(
      (id) => {
        const img = document.querySelector(
          `.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"] img`,
        );
        return img && img.complete && img.naturalWidth > 0;
      },
      blockId,
      { timeout: 30_000 },
    )
    .catch(() => undefined);
  facts.editor = await measure(
    blockId,
    '.ts-stagewrap.ts-editor .pt-slide .ts-sheet, .ts-stagewrap.ts-editor .pt-slide',
  );
  t.note('editor', JSON.stringify(facts.editor));
  await t.shot('editor-shader');
  /* the print document, the PDF's source */
  await page.goto(`${BASE}/print/${deckId}`, { waitUntil: 'load' });
  await page.waitForSelector('[data-block]', { timeout: 60_000 });
  await sleep(2500);
  await page
    .waitForFunction(
      (id) => {
        const img = document.querySelector(`[data-block="${id}"] img`);
        return img && img.complete && img.naturalWidth > 0;
      },
      blockId,
      { timeout: 30_000 },
    )
    .catch(() => undefined);
  facts.print = await measure(
    blockId,
    `.slide:has([data-block="${blockId}"]) .ts-sheet, .slide:has([data-block="${blockId}"]), .ts-sheet:has([data-block="${blockId}"])`,
  );
  t.note('print', JSON.stringify(facts.print));
  await t.shot('print-shader');
  const boxAspect = facts.pos ? +(facts.pos.w / facts.pos.h).toFixed(3) : null;
  const imgAspect = facts.print?.img ? +(facts.print.img.w / facts.print.img.h).toFixed(3) : null;
  const frameAspect = facts.print?.imgNatural
    ? +(facts.print.imgNatural.w / facts.print.imgNatural.h).toFixed(3)
    : null;
  facts.reading = {
    boxAspect,
    imgAspect,
    frameAspect,
    imgShortBy:
      facts.print?.box && facts.pos ? +(facts.pos.h - facts.print.box.h).toFixed(1) : null,
  };
  t.note('reading', JSON.stringify(facts.reading));
} catch (e) {
  facts.error = String(e).slice(0, 400);
  t.note('error', facts.error);
} finally {
  if (deckId)
    facts.sweep = await trashDeck(t, deckId).catch((e) => ({ error: String(e).slice(0, 200) }));
  facts.endedAt = new Date().toISOString();
  writeFileSync(`${OUT}/frame-box-facts.json`, `${JSON.stringify(facts, null, 2)}\n`);
  await browser.close().catch(() => undefined);
}
