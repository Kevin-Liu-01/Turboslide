import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

import {
  Scratch,
  addSlide,
  coverage,
  ctl,
  headingRun,
  invoke,
  menuPath,
  newDeck,
  objectsOf,
  openEditor,
  ownerContext,
  placePicture,
  pngBytes,
  settled,
  state,
  teardownAll,
  title,
  typeInto,
  waitEditor,
} from './lib';

// Pictures, the spec rows (docs/FOCUS.md 2.4, section 5 ranks 5 and 6, 6.4 `images.*` with the
// driver core/images.spec.ts): the routes that bring a file into the editor, which the probe
// cannot drive in one tab: Upload from computer through the file chooser (first on a fresh /new
// draft, then on a saved deck, then a second upload while the first write is pending), a PNG
// dropped on the slide (a DataTransfer built in the page, Playwright's file drop pattern), a PNG
// pasted (a paste event carrying the file), Replace image by upload, the background picture by
// upload and its Remove picture, and a PNG dropped on a picture replacing its asset while the box
// keeps its position and size. Every picture must land within 5 s of its upload (PICTURE_LANDS_MS);
// the row with two uploads in flight at once is held to two pictures' worth from its first upload
// (VERIFICATION.md C3T-F2), since the second picture's chain shares the deck's queue with the
// first's and its commit lands under the first's insert.
//
// PLAYWRIGHT_BASE_URL=<origin> node_modules/.bin/playwright test apps/studio/e2e/core/images.spec.ts

const scratch = new Scratch();
let context: BrowserContext;
let page: Page;
let deck = '';
/** The audits' bound for one picture landing after its upload (docs/FOCUS.md 2.4; audit-images). */
const PICTURE_LANDS_MS = 5000;

test.beforeAll(async ({ browser }) => {
  ({ context, page } = await ownerContext(browser));
});
test.afterAll(async () => {
  /* the teardown runs past a failed row and past the file's own test timeout, so no scratch deck
     is left behind (VERIFICATION.md C2-F29) */
  test.setTimeout(180_000);
  try {
    await teardownAll(page, scratch);
  } finally {
    await context.close();
  }
});

type Obj = Awaited<ReturnType<typeof objectsOf>>[number];
const isPicture = (o: Obj) => o.type === 'shot' || o.type === 'picture';
async function pictures(slideId: string, p: Page = page): Promise<Obj[]> {
  return (await objectsOf(p, slideId)).filter(isPicture);
}
async function pictureCount(slideId: string, p: Page = page): Promise<number> {
  return (await pictures(slideId, p)).length;
}
/** Uploads a PNG through the file chooser that `open` opens; answers the time the file was set. */
async function uploadThrough(
  open: () => Promise<void>,
  name = 'logo.png',
  w = 120,
  h = 80,
): Promise<number> {
  const chooser = page.waitForEvent('filechooser', { timeout: 10_000 });
  await open();
  const fc = await chooser;
  await fc.setFiles({ name, mimeType: 'image/png', buffer: await pngBytes(page, w, h) });
  return Date.now();
}
/** Drops a PNG at a sheet point (1600 by 900 sheet px), Playwright's documented file drop pattern. */
async function dropAt(sx: number, sy: number, name = 'dropped.png'): Promise<void> {
  const sheet = page.locator('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)').first();
  const box = (await sheet.boundingBox())!;
  const k = box.width / 1600;
  const x = box.x + sx * k;
  const y = box.y + sy * k;
  const bytes = await pngBytes(page, 120, 80);
  const dt = await page.evaluateHandle(
    ([b64, fileName]) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
      const file = new File([arr], fileName, { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      return dt;
    },
    [bytes.toString('base64'), name] as const,
  );
  const target = await page.evaluateHandle(
    ([px, py]) => document.elementFromPoint(px, py) ?? document.body,
    [x, y] as const,
  );
  for (const type of ['dragenter', 'dragover', 'drop'])
    await page
      .dispatchEvent(`.ts-stagewrap.ts-editor`, type, { dataTransfer: dt, clientX: x, clientY: y })
      .catch(async () => {
        await target.evaluate(
          (el, [t, d, cx, cy]) => {
            const event = new DragEvent(t as string, {
              bubbles: true,
              cancelable: true,
              dataTransfer: d as DataTransfer,
              clientX: cx as number,
              clientY: cy as number,
            });
            el.dispatchEvent(event);
          },
          [type, dt, x, y] as const,
        );
      });
}
/**
 * Pastes a PNG as a clipboard file on the stage. Playwright's dispatchEvent has no ClipboardEvent
 * constructor (it builds a plain Event for the type, which reaches the handler with no
 * clipboardData; b3 R20, VERIFICATION.md pass 2 F-images-paste), so the event is built in the
 * page, the way dropAt builds its DragEvent.
 */
async function pastePng(): Promise<void> {
  const bytes = await pngBytes(page, 120, 80);
  await page.evaluate((b64) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
    const dt = new DataTransfer();
    dt.items.add(new File([arr], 'pasted.png', { type: 'image/png' }));
    const target = document.querySelector('.ts-stagewrap.ts-editor');
    if (!target) throw new Error('no editor stage to paste on');
    target.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  }, bytes.toString('base64'));
}
async function expectPictureWithin(
  slideId: string,
  before: number,
  ms = PICTURE_LANDS_MS,
): Promise<Obj> {
  const t = Date.now();
  await expect.poll(() => pictureCount(slideId), { timeout: ms }).toBeGreaterThan(before);
  expect(Date.now() - t).toBeLessThan(ms);
  const list = await pictures(slideId);
  return list[list.length - 1]!;
}
async function noRefusal(): Promise<void> {
  const words = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '[data-control="snackbar"], .ts-snackbar.is-on, .pt-toast.is-on, [role="alert"]',
      ),
    ]
      .map((el) => el.textContent ?? '')
      .join(' | '),
  );
  expect(words, 'no stale or refused write shown').not.toMatch(
    /stale|not applied|refused|No deck/i,
  );
}

test(title('images.insert.first-on-new-deck'), async () => {
  test.setTimeout(90_000);
  await page.goto('/new');
  await waitEditor(page);
  const info = await invoke<{ id: string }>(page, 'deck.info');
  const slideId = (await state(page)).slideId;
  await uploadThrough(() => menuPath(page, 'insert', 'insert.image', 'insert.image.upload'));
  await expectPictureWithin(slideId, 0);
  await noRefusal();
  await page.waitForURL(/\/edit\//, { timeout: 30_000 });
  scratch.add(info.id);
  await settled(page);
  deck = info.id;
});

test(title('images.insert.upload'), async () => {
  test.setTimeout(90_000);
  if (!deck) deck = await newDeck(page, scratch, 'Pictures deck');
  await openEditor(page, deck);
  const slideId = await addSlide(page);
  const before = await pictureCount(slideId);
  await uploadThrough(() => menuPath(page, 'insert', 'insert.image', 'insert.image.upload'));
  await expectPictureWithin(slideId, before);
  await noRefusal();
  await settled(page);
});

test(title('images.insert.upload-while-pending'), async () => {
  test.setTimeout(90_000);
  if (!deck) deck = await newDeck(page, scratch, 'Pictures deck');
  await openEditor(page, deck);
  const slideId = await addSlide(page);
  const before = await pictureCount(slideId);
  const first = await uploadThrough(
    () => menuPath(page, 'insert', 'insert.image', 'insert.image.upload'),
    'first.png',
  );
  /* the second upload right after the first, while its write is pending */
  const second = await uploadThrough(
    () => menuPath(page, 'insert', 'insert.image', 'insert.image.upload'),
    'second.png',
  );
  /* two pictures at the audits' bound each, from the first upload: the two chains share the
     deck's queue on the instance and the second's commit lands under the first's insert, so
     neither picture can be held to a lone picture's 5 s from its own upload (VERIFICATION.md
     C3T-F2: on the deployment of record the hosted asset.add took about 4 s each and the second
     picture landed 5.2 s after its upload, the first 5.8 s after its own) */
  const bound = 2 * PICTURE_LANDS_MS;
  await expect
    .poll(() => pictureCount(slideId), { timeout: Math.max(1000, bound - (Date.now() - first)) })
    .toBe(before + 2);
  const landed = Date.now();
  expect(landed - first).toBeLessThan(bound);
  test.info().annotations.push({
    type: 'timing',
    description: `both pictures landed ${landed - first} ms after the first upload and ${landed - second} ms after the second`,
  });
  await noRefusal();
  await settled(page);
});

test(title('images.insert.drop'), async () => {
  test.setTimeout(90_000);
  if (!deck) deck = await newDeck(page, scratch, 'Pictures deck');
  await openEditor(page, deck);
  const slideId = await addSlide(page);
  const before = await pictureCount(slideId);
  await dropAt(1000, 600);
  const dropped = await expectPictureWithin(slideId, before);
  /* at the drop point: the box holds the point */
  expect(
    dropped.pos.x <= 1000 &&
      dropped.pos.x + dropped.pos.w >= 1000 &&
      dropped.pos.y <= 600 &&
      dropped.pos.y + dropped.pos.h >= 600,
    `lands at the drop point (${JSON.stringify(dropped.pos)})`,
  ).toBe(true);
  await noRefusal();
  await settled(page);
});

test(title('images.insert.paste'), async () => {
  test.setTimeout(90_000);
  if (!deck) deck = await newDeck(page, scratch, 'Pictures deck');
  await openEditor(page, deck);
  const slideId = await addSlide(page);
  const sheet = page.locator('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)').first();
  const box = (await sheet.boundingBox())!;
  await page.mouse.click(box.x + box.width - 40, box.y + box.height - 30);
  const before = await pictureCount(slideId);
  await pastePng();
  await expectPictureWithin(slideId, before);
  await noRefusal();
  await settled(page);
});

test(title('images.replace.upload'), async () => {
  test.setTimeout(90_000);
  if (!deck) deck = await newDeck(page, scratch, 'Pictures deck');
  await openEditor(page, deck);
  const slideId = await addSlide(page);
  const id = await placePicture(page, slideId, { x: 400, y: 250, w: 240, h: 160 });
  const before = (await pictures(slideId)).find((o) => o.id === id)!;
  await page.locator(`.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`).first().click();
  await expect(page.locator(`.ts-overlay [data-control="handle.${id}.move"]`)).toBeAttached();
  await uploadThrough(async () => {
    await ctl(page, 'toolbar.replaceImage').click();
    const row = page.locator('[data-control="menu.format.image.replaceImage.upload"]').first();
    if (await row.isVisible().catch(() => false)) await row.click();
  });
  const t = Date.now();
  await expect
    .poll(async () => (await pictures(slideId)).find((o) => o.id === id)?.block['asset'], {
      timeout: 5000,
    })
    .not.toBe(before.block['asset']);
  expect(Date.now() - t).toBeLessThan(5000);
  const after = (await pictures(slideId)).find((o) => o.id === id)!;
  expect(after.pos).toEqual(before.pos);
  await noRefusal();
  await settled(page);
});

test(title('images.replace.drop-on-picture'), async () => {
  test.setTimeout(90_000);
  if (!deck) deck = await newDeck(page, scratch, 'Pictures deck');
  await openEditor(page, deck);
  const slideId = await addSlide(page);
  const id = await placePicture(page, slideId, { x: 400, y: 250, w: 240, h: 160 });
  const before = (await pictures(slideId)).find((o) => o.id === id)!;
  const count = await pictureCount(slideId);
  await dropAt(520, 330, 'replacement.png');
  const t = Date.now();
  await expect
    .poll(async () => (await pictures(slideId)).find((o) => o.id === id)?.block['asset'], {
      timeout: 5000,
    })
    .not.toBe(before.block['asset']);
  expect(Date.now() - t).toBeLessThan(5000);
  const after = (await pictures(slideId)).find((o) => o.id === id)!;
  expect(after.pos, 'the box keeps its position and size').toEqual(before.pos);
  expect(await pictureCount(slideId), 'no second picture').toBe(count);
  await noRefusal();
  await settled(page);
});

/** The slide the background rows share: the upload row's, read again by Remove picture. */
let groundSlide = '';

test(title('images.background.upload-picture'), async () => {
  test.setTimeout(90_000);
  if (!deck) deck = await newDeck(page, scratch, 'Pictures deck');
  await openEditor(page, deck);
  const slideId = await addSlide(page);
  groundSlide = slideId;
  const run = await headingRun(page);
  if (run) await typeInto(page, run, 'Ground');
  const before = await pictureCount(slideId);
  await menuPath(page, 'slide', 'slide.changeBackground');
  await ctl(page, 'dialog.background').waitFor({ timeout: 8000 });
  await uploadThrough(() => ctl(page, 'dialog.background.choose.upload').click(), 'ground.png');
  const t = Date.now();
  await expect.poll(() => pictureCount(slideId), { timeout: 5000 }).toBeGreaterThan(before);
  expect(Date.now() - t).toBeLessThan(5000);
  if (
    await ctl(page, 'dialog.background.done')
      .isVisible()
      .catch(() => false)
  )
    await ctl(page, 'dialog.background.done').click();
  await settled(page);
  const list = await objectsOf(page, slideId);
  const ground = list
    .filter(isPicture)
    .sort((a, b) => ((a.pos as { z?: number }).z ?? 0) - ((b.pos as { z?: number }).z ?? 0))[0]!;
  expect(
    ground.pos.x === 0 && ground.pos.y === 0 && ground.pos.w === 1600 && ground.pos.h === 900,
    `covers the sheet (${JSON.stringify(ground.pos)})`,
  ).toBe(true);
  const lowest = Math.min(...list.map((o) => (o.pos as { z?: number }).z ?? 0));
  expect((ground.pos as { z?: number }).z ?? 0, 'at the bottom of the stack').toBe(lowest);
  await noRefusal();
});

test(title('images.background.remove-picture'), async () => {
  test.setTimeout(90_000);
  if (!deck) deck = await newDeck(page, scratch, 'Pictures deck');
  /* the slide of the upload row (the editor opens on the first slide without the hash); a
     fresh slide with a covering `picture` block placed as setup when that row did not run */
  if (groundSlide === '') {
    await openEditor(page, deck);
    groundSlide = await addSlide(page);
    await placePicture(
      page,
      groundSlide,
      { x: 0, y: 0, w: 1600, h: 900 },
      'ground-setup',
      'picture',
    );
  }
  await openEditor(page, deck, `#s/${groundSlide}`);
  const slideId = groundSlide;
  await expect.poll(async () => (await state(page)).slideId, { timeout: 8000 }).toBe(slideId);
  /* the covering picture the dialog reads: a `picture` block over the whole sheet */
  let covering = (await pictures(slideId)).find(
    (o) => o.type === 'picture' && o.pos.w === 1600 && o.pos.h === 900,
  );
  if (!covering) {
    await placePicture(page, slideId, { x: 0, y: 0, w: 1600, h: 900 }, 'ground-setup', 'picture');
    covering = (await pictures(slideId)).find(
      (o) => o.type === 'picture' && o.pos.w === 1600 && o.pos.h === 900,
    );
  }
  expect(covering).toBeTruthy();
  await menuPath(page, 'slide', 'slide.changeBackground');
  await ctl(page, 'dialog.background').waitFor({ timeout: 8000 });
  await expect(
    ctl(page, 'dialog.background.removePicture'),
    'the dialog lists the covering picture with its Remove row',
  ).toBeVisible({ timeout: 8000 });
  await ctl(page, 'dialog.background.removePicture').click();
  await expect
    .poll(async () => (await pictures(slideId)).some((o) => o.id === covering!.id), {
      timeout: 8000,
    })
    .toBe(false);
  if (
    await ctl(page, 'dialog.background.done')
      .isVisible()
      .catch(() => false)
  )
    await ctl(page, 'dialog.background.done').click();
  await settled(page);
});

// ---------------------------------------------------------------------------------------------
// the product round's rows (docs/PRODUCT.md section 2 ranks 10, 14 and 17, section 5, 8.1): the
// upload centred in the body slot and selected, the instant preview with its progress bar and no
// snackbar, the toolbar Image button opening the chooser on click, the failure sentence for a
// file that is not a picture, and Image by URL with its paused fetch and Replace image > By URL.
// B2 owns the picture routes; a control not on the build is skipped with its id.

/** The body slot of the current slide in sheet px: the body placeholder's box before a picture lands. */
/**
 * The body slot a picture is centred in (docs/PRODUCT.md section 2 rank 10; b2.md R-F4;
 * viewer/picture-place.ts `pictureInsertArea`): the empty body paragraph's column (its box's x
 * and width; the box itself when it stands 240 px or taller), from the head band's bottom plus
 * 40 (the lowest heading whose top sits in the top third; the content top 129 without one) to
 * the content box's bottom at 771, or the paragraph's own bottom when lower. The first run whose
 * id lacked "heading" was the heading block itself on the Title and body layout.
 */
async function bodySlot(): Promise<{ x: number; y: number; w: number; h: number } | null> {
  return page.evaluate(() => {
    const sheet = document.querySelector('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)');
    if (!sheet) return null;
    const s = sheet.getBoundingClientRect();
    const k = s.width / 1600;
    const box = (el: Element) => {
      const r = (el.closest('.free') ?? el).getBoundingClientRect();
      return { x: (r.x - s.x) / k, y: (r.y - s.y) / k, w: r.width / k, h: r.height / k };
    };
    const blocks = [...sheet.querySelectorAll('[data-block]')];
    /* an empty paragraph shows its prompt ("Click to add text") in a `.prompt` span, which is
       furniture (SPEC 5.4), so the text read leaves the prompt out */
    const typed = (el: Element) =>
      [...el.querySelectorAll('[data-run]')]
        .map((run) =>
          [...run.childNodes]
            .filter(
              (node) =>
                !(
                  node instanceof Element &&
                  (node.matches('.prompt') || node.hasAttribute('data-prompt'))
                ),
            )
            .map((node) => node.textContent ?? '')
            .join(''),
        )
        .join('')
        .trim();
    const paragraphs = blocks
      .filter(
        (el) =>
          el.getAttribute('data-type') === 'paragraph' &&
          (el.querySelector('.prompt, [data-prompt]') !== null || typed(el) === ''),
      )
      .map(box)
      .sort((a, b) => b.w * b.h - a.w * a.h);
    const column = paragraphs[0] ?? null;
    if (column === null) return null;
    if (column.h >= 240) return column;
    const headBottom = blocks
      .filter((el) => el.getAttribute('data-type') === 'heading')
      .map(box)
      .filter((b) => b.y < 300)
      .reduce((m, b) => Math.max(m, b.y + b.h), 0);
    const top = Math.min(column.y, headBottom > 0 ? headBottom + 40 : 129);
    const bottom = Math.max(column.y + column.h, 771);
    return { x: column.x, y: top, w: column.w, h: bottom - top };
  });
}

test(title('images.insert.centred-in-body'), async () => {
  test.setTimeout(120_000);
  if (!deck) deck = await newDeck(page, scratch, 'Pictures deck');
  await openEditor(page, deck);
  const slideId = await addSlide(page);
  /* the row measures the body slot of a Title and body slide (docs/PRODUCT.md section 2 rank 10;
     audit-seller 10 is the picture over the head prompt of that layout). New slide hands the fresh
     slide the current slide's layout (rank 2), and on this file's shared deck the current slide
     after the picture rows above is a title grammar slide (the mark over the title over the
     subtitle, one column, centred in the sheet): the product round's ship step read the title
     prompt at 381,460 inside the body column on three previews, under a picture centred there as
     the rank says. Title and body is applied first, so the slot read is the layout's the row names */
  await page.keyboard.press('Escape');
  const layoutButton = ctl(page, 'toolbar.layout');
  if (await layoutButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await layoutButton.click();
    await ctl(page, 'layout.apply.plate').waitFor({ timeout: 8000 });
    await ctl(page, 'layout.apply.split').click();
    await expect(ctl(page, 'layout.apply.plate')).toHaveCount(0, { timeout: 8000 });
    await settled(page);
  }
  test.info().annotations.push({
    type: 'layout',
    description: `the slide's layout before the upload: ${JSON.stringify(
      (await objectsOf(page, slideId)).map((o) => `${o.type}:${o.id}`),
    )}`,
  });
  const slot = await bodySlot();
  const before = await pictureCount(slideId);
  /* a 720 by 480 PNG: the features round's logo size rule (docs/FEATURES.md 4.4) takes a picture
     whose long side is under 600 px to the logo size, so this row keeps a picture the rule leaves
     at the largest fit */
  await uploadThrough(
    () => menuPath(page, 'insert', 'insert.image', 'insert.image.upload'),
    'centred.png',
    720,
    480,
  );
  const pic = await expectPictureWithin(slideId, before, 10_000);
  const selected = await page.locator(`.ts-overlay [data-control="handle.${pic.id}.move"]`).count();
  /* the placeholder leaves in the same write as the picture lands (picture-place.ts `replaces`),
     and the sheet redraws a moment after the model carries the picture: the prompt count is
     read until it settles at zero, or for 4 s */
  const promptsUnder = () =>
    page.evaluate((id) => {
      const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`);
      const box = (el?.closest('.free') ?? el)?.getBoundingClientRect();
      if (!box) return null;
      return [
        ...document.querySelectorAll(
          '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-prompt]',
        ),
      ].filter((p) => {
        const r = p.getBoundingClientRect();
        return (
          r.width > 0 &&
          r.height > 0 &&
          r.left < box.right &&
          r.right > box.left &&
          r.top < box.bottom &&
          r.bottom > box.top &&
          getComputedStyle(p).visibility !== 'hidden'
        );
      }).length;
    }, pic.id);
  let overPrompt = await promptsUnder();
  for (let i = 0; i < 20 && overPrompt !== 0; i += 1) {
    await page.waitForTimeout(200);
    overPrompt = await promptsUnder();
  }
  test.info().annotations.push({
    type: 'placement',
    description: `body slot ${JSON.stringify(slot)}; picture ${JSON.stringify(pic.pos)}; selected ${selected}; prompts under it ${overPrompt}`,
  });
  if (overPrompt !== 0) {
    /* the mechanism, named: which block's prompt stands under the picture and what the model holds
       (the first enforce preview of the ship step read one prompt under a centred picture) */
    const under = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-prompt]',
        ),
      ].map((p) => {
        const block = p.closest('[data-block]');
        const r = p.getBoundingClientRect();
        return `${block?.getAttribute('data-type') ?? '?'}:${block?.getAttribute('data-block') ?? '?'} "${(p.textContent ?? '').trim().slice(0, 24)}" at ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} visibility ${getComputedStyle(p).visibility}`;
      }),
    );
    const model = (await objectsOf(page, slideId)).map(
      (o) =>
        `${o.type}:${o.id}${'text' in o && typeof (o as { text?: unknown }).text === 'string' ? `(${JSON.stringify(((o as { text?: string }).text ?? '').slice(0, 16))})` : ''}${o.pos ? `@${o.pos.x},${o.pos.y},${o.pos.w}x${o.pos.h}` : ''}`,
    );
    test.info().annotations.push({
      type: 'prompts',
      description: `prompts on the slide: ${under.join(' | ')}; the model's objects: ${model.join(' ')}`,
    });
  }
  expect(slot, 'the slide has a body slot').not.toBeNull();
  const cx = pic.pos.x + pic.pos.w / 2;
  const cy = pic.pos.y + pic.pos.h / 2;
  expect(
    Math.abs(cx - (slot!.x + slot!.w / 2)),
    'centred horizontally in the body slot',
  ).toBeLessThan(6);
  expect(Math.abs(cy - (slot!.y + slot!.h / 2)), 'centred vertically').toBeLessThan(6);
  const fitsWidth = Math.abs(pic.pos.w - (slot!.w - 80)) < 6;
  const fitsHeight = Math.abs(pic.pos.h - (slot!.h - 80)) < 6;
  expect(fitsWidth || fitsHeight, 'the largest size with a 40 px margin').toBe(true);
  expect(selected, 'the picture is selected').toBeGreaterThan(0);
  expect(overPrompt, 'over no prompt').toBe(0);
  await noRefusal();
});

test(title('images.insert.instant-preview'), async () => {
  test.setTimeout(120_000);
  if (!deck) deck = await newDeck(page, scratch, 'Pictures deck');
  await openEditor(page, deck);
  const slideId = await addSlide(page);
  const before = await page.evaluate(
    () =>
      document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) img').length,
  );
  const t0 = await uploadThrough(
    () => menuPath(page, 'insert', 'insert.image', 'insert.image.upload'),
    'preview.png',
  );
  let drawnAt: number | null = null;
  let progressSeen = false;
  const until = Date.now() + 8000;
  while (Date.now() < until) {
    const facts = await page.evaluate(
      (n) => ({
        imgs:
          [
            ...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) img'),
          ].filter((i) => (i as HTMLImageElement).getClientRects().length > 0).length > n,
        progress: Boolean(document.querySelector('[data-control="picture.upload.progress"]')),
      }),
      before,
    );
    if (facts.progress) progressSeen = true;
    if (facts.imgs && drawnAt === null) drawnAt = Date.now() - t0;
    if (drawnAt !== null && facts.progress === false) break;
    await page.waitForTimeout(50);
  }
  const landed = await expect
    .poll(() => pictureCount(slideId), { timeout: 10_000 })
    .toBeGreaterThan(0)
    .then(() => true);
  await page.waitForTimeout(1500);
  const snackbar = await ctl(page, 'snackbar')
    .textContent({ timeout: 500 })
    .catch(() => null);
  test.info().annotations.push({
    type: 'preview',
    description: `the picture drew ${drawnAt ?? 'not'} ms after the chooser; progress bar seen ${progressSeen}; snackbar after ${snackbar ? `"${snackbar}"` : 'none'}`,
  });
  expect(drawnAt, 'the picture draws within 500 ms of the chooser closing').not.toBeNull();
  expect(drawnAt!, 'within 500 ms').toBeLessThan(500);
  expect(progressSeen, 'a progress bar shows until the asset lands').toBe(true);
  expect(landed).toBe(true);
  expect(snackbar ?? '', 'no snackbar on success').not.toMatch(/asset\.add|picture|uploaded/i);
});

test(title('images.insert.menu-direct'), async () => {
  test.setTimeout(90_000);
  if (!deck) deck = await newDeck(page, scratch, 'Pictures deck');
  await openEditor(page, deck);
  const slideId = await addSlide(page);
  const before = await pictureCount(slideId);
  const chooser = page
    .waitForEvent('filechooser', { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  await ctl(page, 'toolbar.insertImage').click();
  const opened = await chooser;
  const menuShown = await page
    .locator('[data-control="menu.insert.image.upload"]')
    .isVisible()
    .catch(() => false);
  await page.keyboard.press('Escape');
  const arrow = ctl(page, 'toolbar.insertImage.arrow');
  const hasArrow = (await arrow.count()) > 0;
  let submenu = false;
  if (hasArrow) {
    await arrow.click();
    submenu = await page
      .locator('[data-control="menu.insert.image.upload"]')
      .waitFor({ timeout: 4000 })
      .then(() => true)
      .catch(() => false);
    await page.keyboard.press('Escape');
  }
  test.info().annotations.push({
    type: 'button',
    description: `click opened the chooser ${opened} (a menu ${menuShown}); arrow drawn ${hasArrow}, its submenu ${submenu}`,
  });
  expect(opened, 'the Image button opens the file chooser on click').toBe(true);
  expect(menuShown, 'and no submenu').toBe(false);
  expect(hasArrow && submenu, 'the arrow keeps the submenu').toBe(true);
  expect(await pictureCount(slideId), 'nothing landed').toBe(before);
});

test(title('images.upload.failure-snackbar'), async () => {
  test.setTimeout(90_000);
  if (!deck) deck = await newDeck(page, scratch, 'Pictures deck');
  await openEditor(page, deck);
  const slideId = await addSlide(page);
  const before = await pictureCount(slideId);
  const chooser = page.waitForEvent('filechooser', { timeout: 10_000 });
  await menuPath(page, 'insert', 'insert.image', 'insert.image.upload');
  const fc = await chooser;
  await fc.setFiles({
    name: 'notes.png',
    mimeType: 'image/png',
    buffer: Buffer.from('This is a text file renamed to .png, not a picture.', 'utf8'),
  });
  const t0 = Date.now();
  let said: string | null = null;
  while (Date.now() - t0 < 20_000) {
    said = await page.evaluate(
      () =>
        [
          ...document.querySelectorAll(
            '[data-control="snackbar"], [data-control="snackbar.upload.failed"], [role="alert"]',
          ),
        ]
          .map((el) => el.textContent?.trim() ?? '')
          .filter(Boolean)
          .join(' | ') || null,
    );
    if (said && /could not be uploaded/.test(said)) break;
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(1000);
  const placeholders = await page.evaluate(
    () =>
      document.querySelectorAll(
        '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-control="picture.upload.progress"], .ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) .is-uploading',
      ).length,
  );
  test.info().annotations.push({
    type: 'failure',
    description: `snackbar "${said ?? 'none'}" after ${Date.now() - t0} ms; placeholders left ${placeholders}; pictures ${before} -> ${await pictureCount(slideId)}`,
  });
  expect(said ?? '', 'the failure sentence names the reason').toMatch(
    /The picture could not be uploaded: the file is not a picture/,
  );
  expect(placeholders, 'no placeholder is left').toBe(0);
  expect(await pictureCount(slideId), 'no picture landed').toBe(before);
});

test(title('images.insert.by-url'), async () => {
  test.setTimeout(150_000);
  if (!deck) deck = await newDeck(page, scratch, 'Pictures deck');
  await openEditor(page, deck);
  const slideId = await addSlide(page);
  const slot = await bodySlot();
  const origin = new URL(page.url()).origin;
  const address = `${origin}/apple-touch-icon.png`;
  /* the row may still be parked on this build (FOCUS.md 3.2): with the switch on it draws */
  const present = async () => {
    await ctl(page, 'menubar.insert').click();
    await page.locator('#ts-menu-insert').waitFor({ timeout: 8000 });
    await ctl(page, 'menu.insert.image').hover();
    await page.waitForTimeout(350);
    const there = await ctl(page, 'menu.insert.image.byUrl')
      .isVisible()
      .catch(() => false);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    return there;
  };
  let switched = false;
  if (!(await present())) {
    await menuPath(page, 'tools', 'tools.advancedTools');
    switched = true;
    if (!(await present()))
      test.skip(true, 'Insert > Image > By URL is not reachable on this build');
  }
  /* the fetches the typed address starts, counted while typing at human speed */
  const fetched: number[] = [];
  const started = Date.now();
  page.on('request', (req) => {
    const u = req.url();
    if (
      u.includes('apple-touch-icon') ||
      /\/api\/x\.upload|\/api\/actions\/asset\.add|imageByUrl|preview/.test(u)
    )
      fetched.push(Date.now() - started);
  });
  await menuPath(page, 'insert', 'insert.image', 'insert.image.byUrl');
  await ctl(page, 'dialog.imageByUrl.url').waitFor({ timeout: 8000 });
  await ctl(page, 'dialog.imageByUrl.url').click();
  const typingStart = Date.now() - started;
  await page.keyboard.type(address, { delay: 60 });
  const typingEnd = Date.now() - started;
  const duringTyping = fetched.filter((t) => t >= typingStart && t <= typingEnd + 100).length;
  await page.waitForTimeout(900);
  const before = await pictureCount(slideId);
  await ctl(page, 'dialog.imageByUrl.ok').click();
  const pic = await expectPictureWithin(slideId, before, 20_000);
  const selected = await page.locator(`.ts-overlay [data-control="handle.${pic.id}.move"]`).count();
  const cx = pic.pos.x + pic.pos.w / 2;
  const centred = slot ? Math.abs(cx - (slot.x + slot.w / 2)) < 6 : null;
  /* Replace image > By URL keeps the box */
  await page.locator(`.ts-stagewrap.ts-editor .pt-slide [data-block="${pic.id}"]`).first().click();
  await expect(page.locator(`.ts-overlay [data-control="handle.${pic.id}.move"]`)).toBeAttached();
  await ctl(page, 'toolbar.replaceImage').click();
  const byUrl = page.locator('[data-control="menu.format.image.replaceImage.byUrl"]').first();
  const replaceRow = await byUrl
    .waitFor({ timeout: 4000 })
    .then(() => true)
    .catch(() => false);
  let replaced: { asset: unknown; pos: unknown } | null = null;
  if (replaceRow) {
    await byUrl.click();
    await ctl(page, 'dialog.imageByUrl.url').waitFor({ timeout: 8000 });
    await ctl(page, 'dialog.imageByUrl.url').click();
    await page.keyboard.type(`${origin}/icons/icon-192.png`, { delay: 40 });
    await page.waitForTimeout(900);
    await ctl(page, 'dialog.imageByUrl.ok').click();
    await expect
      .poll(async () => (await pictures(slideId)).find((o) => o.id === pic.id)?.block['asset'], {
        timeout: 20_000,
      })
      .not.toBe(pic.block['asset']);
    const after = (await pictures(slideId)).find((o) => o.id === pic.id)!;
    replaced = { asset: after.block['asset'], pos: after.pos };
  } else await page.keyboard.press('Escape');
  if (switched) await menuPath(page, 'tools', 'tools.advancedTools');
  test.info().annotations.push({
    type: 'by url',
    description: `${switched ? 'with the switch on; ' : ''}fetches while typing ${duringTyping} (${fetched.length} in all); picture ${JSON.stringify(pic.pos)} centred ${centred}, selected ${selected}; Replace image > By URL ${replaceRow ? `swapped to ${String(replaced?.asset)} at ${JSON.stringify(replaced?.pos)}` : 'has no row'}`,
  });
  expect(duringTyping, 'no fetch until a 600 ms pause or blur').toBe(0);
  expect(centred, 'Insert places the picture centred in the body slot').toBe(true);
  expect(selected, 'selected').toBeGreaterThan(0);
  expect(replaceRow, 'Replace image > By URL is a row').toBe(true);
  expect(replaced?.pos, 'the replaced picture keeps its box').toEqual(pic.pos);
});

/**
 * The features round, ship one (docs/FEATURES.md 4.7, the images row `logos.intake.svg-sentence`,
 * P1 of B7): Upload from computer with an .svg lands as PNG twins behind TURBOSLIDE_SVG_RASTER, or,
 * while the raster path is off, the snackbar reads the seller's sentence and the chooser lists
 * the four raster types; the developer's sentence of audit-logos 4 fails the row.
 */
test(title('logos.intake.svg-sentence'), async () => {
  test.setTimeout(120_000);
  if (!deck) deck = await newDeck(page, scratch, 'Pictures deck');
  await openEditor(page, deck);
  const slideId = await addSlide(page);
  const before = await pictureCount(slideId);
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#1b1b1b"/><circle cx="32" cy="32" r="18" fill="#e8e8e8"/></svg>',
  );
  const chooser = page.waitForEvent('filechooser', { timeout: 10_000 });
  await menuPath(page, 'insert', 'insert.image', 'insert.image.upload');
  const fc = await chooser;
  const accept = await fc
    .element()
    .getAttribute('accept')
    .catch(() => null);
  await fc.setFiles({ name: 'mark.svg', mimeType: 'image/svg+xml', buffer: svg });
  const t0 = Date.now();
  let landed: Awaited<ReturnType<typeof pictures>>[number] | null = null;
  let said: string | null = null;
  while (Date.now() - t0 < 10_000 && landed === null && said === null) {
    const list = await pictures(slideId);
    if (list.length > before) landed = list[list.length - 1]!;
    said = await page.evaluate(
      () =>
        [
          ...document.querySelectorAll(
            '[data-control="snackbar"], [data-control="snackbar.upload.failed"], .ts-snackbar, .pt-toast, [role="alert"]',
          ),
        ]
          .map((el) => (el.textContent ?? '').trim())
          .find((text) => text.length > 0 && /svg|SVG|accepted|picture/.test(text)) ?? null,
    );
    if (landed === null && said === null) await page.waitForTimeout(200);
  }
  test.info().annotations.push({
    type: 'svg',
    description: `chooser accept "${accept ?? 'none'}"; ${landed ? `picture ${landed.id} landed ${JSON.stringify(landed.block['asset'])}` : 'no picture'}; snackbar "${said ?? 'none'}" after ${Date.now() - t0} ms`,
  });
  if (landed !== null) {
    /* the raster path: PNG twins, the source kept */
    const doc = JSON.parse((await invoke(page, 'source.read', {})) as string) as {
      assets?:
        | Record<string, { twins?: unknown; sourceFile?: string }>
        | { id: string; twins?: unknown; sourceFile?: string }[];
    };
    const assets = doc.assets ?? {};
    const record = Array.isArray(assets)
      ? assets.find((a) => a.id === landed!.block['asset'])
      : assets[landed.block['asset'] as string];
    const twins = JSON.stringify(record?.twins ?? '');
    expect(twins, 'PNG twins').toMatch(/\.png/);
    expect(twins, 'no svg twin').not.toMatch(/\.svg/);
    return;
  }
  expect(said ?? '', "the seller's sentence, not the developer's").toMatch(
    /SVG files are not accepted yet\. Export the logo as a PNG and upload that/,
  );
  expect(said ?? '', 'no developer sentence').not.toMatch(/svg is not accepted here/);
  const types = (accept ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  expect(types.sort(), 'the chooser lists the four raster types').toEqual([
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/webp',
  ]);
});

coverage(import.meta.filename, [
  'images.insert.first-on-new-deck',
  'images.insert.upload',
  'images.insert.upload-while-pending',
  'images.insert.drop',
  'images.insert.paste',
  'images.replace.upload',
  'images.background.upload-picture',
  'images.background.remove-picture',
  'images.replace.drop-on-picture',
  /* the product round (docs/PRODUCT.md 8.1) */
  'images.insert.centred-in-body',
  'images.insert.instant-preview',
  'images.insert.menu-direct',
  'images.upload.failure-snackbar',
  'images.insert.by-url',
  /* the features round, ship one (docs/FEATURES.md 7.1): the svg intake, an images row */
  'logos.intake.svg-sentence',
]);
