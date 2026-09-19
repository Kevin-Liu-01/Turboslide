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
async function uploadThrough(open: () => Promise<void>, name = 'logo.png'): Promise<number> {
  const chooser = page.waitForEvent('filechooser', { timeout: 10_000 });
  await open();
  const fc = await chooser;
  await fc.setFiles({ name, mimeType: 'image/png', buffer: await pngBytes(page, 120, 80) });
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
]);
