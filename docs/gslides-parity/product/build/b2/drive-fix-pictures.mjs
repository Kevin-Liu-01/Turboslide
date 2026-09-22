// The fix round's picture drive (VERIFICATION.md "Product round, pass 1" findings 6 and 7): on a
// new Title and body slide, Insert > Image > Upload from computer, the picture read against the
// body paragraph's column under the head band (the body slot; the spec's own slot read takes the
// first run whose id lacks "heading", which on this layout is the heading block `h`), the first
// img's time after the chooser, the progress bar, the selection and the snackbar; then Insert >
// Image > By URL with a same origin address and Replace image > By URL on the picture it placed.
// Human speed.
import { launch, bind, sleep, BASE } from './lib.mjs';

const { browser, page, consoleErrors } = await launch();
const t = bind(page, 'drive-fix-pictures');
const errorsSince = (n) =>
  consoleErrors
    .slice(n)
    .filter(
      (e) => !/CSP|Content Security|Fast Refresh|hmr|\[vite\]|\[Server\]|AbortError/i.test(e),
    );

/** The boxes of the slide's blocks in sheet px, by block id, with the type. */
const blockBoxes = () =>
  page.evaluate(() => {
    const sheet = document.querySelector('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)');
    if (!sheet) return null;
    const s = sheet.getBoundingClientRect();
    const k = s.width / 1600;
    const out = {};
    for (const el of sheet.querySelectorAll('[data-block]')) {
      const box = (el.closest('.free') ?? el).getBoundingClientRect();
      out[el.getAttribute('data-block')] = {
        type: el.getAttribute('data-type'),
        x: Math.round((box.x - s.x) / k),
        y: Math.round((box.y - s.y) / k),
        w: Math.round(box.width / k),
        h: Math.round(box.height / k),
      };
    }
    return out;
  });
const imgCount = () =>
  page.evaluate(
    () =>
      [
        ...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) img'),
      ].filter((i) => i.getClientRects().length > 0).length,
  );
const progressShown = () =>
  page.evaluate(() => Boolean(document.querySelector('[data-control="picture.upload.progress"]')));
const shots = async (S) =>
  (await t.objectsOf(S)).filter((o) => o.block?.type === 'shot' || o.block?.type === 'picture');

/** The body slot of the slide: the empty body paragraph's column from the body's top (under a heading in the top third, plus 40) to the content bottom. */
function bodySlotOf(boxes) {
  const paragraphs = Object.entries(boxes).filter(([, b]) => b.type === 'paragraph');
  const headings = Object.entries(boxes).filter(([, b]) => b.type === 'heading' && b.y < 300);
  const column = paragraphs[0]?.[1] ?? { x: 137, w: 1326 };
  const headBottom = headings.reduce((m, [, b]) => Math.max(m, b.y + b.h), 0);
  const top = headBottom > 0 ? headBottom + 40 : 129;
  return { x: column.x, w: column.w, top, bottom: 771 };
}

try {
  const deck = await t.newDeck();
  console.log('deck', deck.id);
  const errorsAt = consoleErrors.length;
  /* the toolbar's New slide: the layout the rule gives a new slide (Title and body) */
  const before = await t.slideOrder();
  await t.clickControl('toolbar.newSlide');
  const order = await t.pollUntil(t.slideOrder, (o) => o.length === before.length + 1, 20_000);
  const S = order.find((x) => !before.includes(x));
  await t.settled();
  await sleep(600);
  const boxes = await blockBoxes();
  const slot = bodySlotOf(boxes);

  await t.step(
    'images.insert.centred-in-body, images.insert.instant-preview: Insert > Image > Upload from computer on a Title and body slide',
    'the picture is centred in the body paragraph column under the head band at the largest size with the 40 px margin, drawn within 500 ms, a progress bar, selected, no snackbar',
    async () => {
      const imgsBefore = await imgCount();
      const shotsBefore = (await shots(S)).map((o) => o.id);
      const t0 = await t.uploadThrough(async () => {
        await t.openMenu('insert');
        await t.hoverRow('insert.image', '[data-control="menu.insert.image.upload"]');
        await t.clickRow('insert.image.upload');
      }, 'centred.png');
      let drawnAt = null;
      let progress = false;
      const until = Date.now() + 8000;
      while (Date.now() < until) {
        if (await progressShown()) progress = true;
        if (drawnAt === null && (await imgCount()) > imgsBefore) drawnAt = Date.now() - t0;
        if (drawnAt !== null && !(await progressShown())) break;
        await sleep(20);
      }
      const landed = await t.pollUntil(
        () => shots(S),
        (o) => o.some((x) => !shotsBefore.includes(x.id)),
        15_000,
      );
      const pic = landed.find((x) => !shotsBefore.includes(x.id)) ?? null;
      await sleep(1500);
      const snackbar = await t.snackbar();
      const selected = pic ? (await t.handleControls()).includes(`handle.${pic.id}.move`) : false;
      const after = await blockBoxes();
      const prompts = await page.evaluate(
        () =>
          [
            ...document.querySelectorAll(
              '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-prompt]',
            ),
          ].filter((p) => p.getClientRects().length > 0).length,
      );
      const pos = pic?.pos ?? null;
      const cx = pos ? pos.x + pos.w / 2 : null;
      const cy = pos ? pos.y + pos.h / 2 : null;
      const slotCx = slot.x + slot.w / 2;
      const slotCy = (slot.top + slot.bottom) / 2;
      const fits = pos
        ? Math.abs(pos.w - (slot.w - 80)) < 6 || Math.abs(pos.h - (slot.bottom - slot.top - 80)) < 6
        : false;
      await t.shot('uploaded');
      return {
        ok:
          pos !== null &&
          Math.abs(cx - slotCx) < 6 &&
          Math.abs(cy - slotCy) < 6 &&
          fits &&
          drawnAt !== null &&
          drawnAt < 500 &&
          progress &&
          selected &&
          !/asset\.add|picture|uploaded/i.test(snackbar ?? ''),
        observed: `layout blocks ${JSON.stringify(boxes)}; body slot column x ${slot.x} w ${slot.w}, y ${slot.top} to ${slot.bottom}; picture ${JSON.stringify(pos)} (centre ${cx}, ${cy} against ${slotCx}, ${slotCy}); fits the margin ${fits}; first img ${drawnAt} ms after the chooser; progress bar ${progress}; selected ${selected}; snackbar ${JSON.stringify(snackbar)}; prompts left ${prompts}; blocks after ${JSON.stringify(after)}`,
      };
    },
  );

  await t.clearAll();
  await t.step(
    'images.insert.by-url: Insert > Image > By URL with a same origin address, then Replace image > By URL',
    'a picture lands within 20 s, selected, at a real size; Replace image > By URL swaps the asset and keeps the box',
    async () => {
      const shotsBefore = (await shots(S)).map((o) => o.id);
      const address = `${BASE}/apple-touch-icon.png`;
      const fetched = [];
      const started = Date.now();
      page.on('request', (req) => {
        if (req.url().includes('apple-touch-icon')) fetched.push(Date.now() - started);
      });
      await t.openMenu('insert');
      await t.hoverRow('insert.image', '[data-control="menu.insert.image.byUrl"]');
      await t.clickRow('insert.image.byUrl');
      await t.ctl('dialog.imageByUrl.url').first().waitFor({ timeout: 8000 });
      await t.clickControl('dialog.imageByUrl.url');
      const typingStart = Date.now() - started;
      await t.typeHuman(address);
      const typingEnd = Date.now() - started;
      const duringTyping = fetched.filter((x) => x >= typingStart && x <= typingEnd + 100).length;
      await sleep(900);
      const t0 = Date.now();
      await t.clickControl('dialog.imageByUrl.ok');
      const landed = await t.pollUntil(
        () => shots(S),
        (o) => o.some((x) => !shotsBefore.includes(x.id)),
        20_000,
      );
      const pic = landed.find((x) => !shotsBefore.includes(x.id)) ?? null;
      const landedMs = Date.now() - t0;
      /* the dialog closes when the insert's promise settles, a few frames after the block draws */
      const dialogGone = await t.pollUntil(
        async () => !(await t.visible('dialog.imageByUrl')),
        (v) => v === true,
        3000,
        50,
      );
      const dialogClosedMs = Date.now() - t0;
      const selected = pic ? (await t.handleControls()).includes(`handle.${pic.id}.move`) : false;
      let replaced = null;
      let replaceRow = false;
      if (pic) {
        const b = await t.boxOf(pic.id);
        await t.clickAt(b.free.x + b.free.w / 2, b.free.y + b.free.h / 2);
        await sleep(300);
        await t.clickControl('toolbar.replaceImage');
        replaceRow = await t
          .ctl('menu.format.image.replaceImage.byUrl')
          .first()
          .waitFor({ timeout: 4000 })
          .then(() => true)
          .catch(() => false);
        if (replaceRow) {
          await t.clickRow('format.image.replaceImage.byUrl');
          await t.ctl('dialog.imageByUrl.url').first().waitFor({ timeout: 8000 });
          await t.clickControl('dialog.imageByUrl.url');
          await t.typeHuman(`${BASE}/icons/icon-192.png`);
          await sleep(900);
          await t.clickControl('dialog.imageByUrl.ok');
          const after = await t.pollUntil(
            async () => (await shots(S)).find((o) => o.id === pic.id) ?? null,
            (o) => o !== null && o.block.asset !== pic.block.asset,
            20_000,
          );
          replaced = after
            ? {
                asset: after.block.asset,
                pos: after.pos,
                sameBox: JSON.stringify(after.pos) === JSON.stringify(pic.pos),
              }
            : null;
        } else await t.press('Escape');
      }
      await t.shot('by-url');
      return {
        ok:
          pic !== null &&
          duringTyping === 0 &&
          dialogGone &&
          selected &&
          pic.pos.w >= 160 &&
          pic.pos.h >= 160 &&
          replaceRow &&
          replaced !== null &&
          replaced.sameBox &&
          replaced.asset !== pic.block.asset,
        observed: `fetches while typing ${duringTyping} (${fetched.length} in all); picture ${pic ? JSON.stringify(pic.pos) : 'none'} after ${landedMs} ms, dialog closed ${dialogGone} (${dialogClosedMs} ms after Insert), selected ${selected}, asset ${pic?.block.asset}; Replace image > By URL row ${replaceRow}; replaced ${JSON.stringify(replaced)}`,
      };
    },
  );
  const errs = errorsSince(errorsAt);
  t.record(
    'console errors during the drive',
    'none',
    errs.length ? errs.join(' | ') : 'none',
    errs.length === 0,
  );
} finally {
  t.finish();
  await browser.close();
}
