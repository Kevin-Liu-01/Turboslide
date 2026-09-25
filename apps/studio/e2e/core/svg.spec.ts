import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

import {
  Scratch,
  addSlide,
  assetOf,
  copyFromStage,
  coverage,
  ctl,
  dropFileAt,
  fetchBytes,
  fixtureBytes,
  invoke,
  menuPath,
  newDeck,
  objectsOf,
  openEditor,
  ownerContext,
  pasteFile,
  pasteText,
  pictureImg,
  placePicture,
  placeSvgPicture,
  pngBytes,
  selectBlock,
  settled,
  snackbarText,
  state,
  svgFixture,
  teardownAll,
  title,
} from './lib';

// The SVG pictures, the spec rows (docs/VECTOR.md section 4, 6.1 `svg.*` with the driver
// core/svg.spec.ts): the ways in the walk probe cannot drive in one tab (the file chooser, a
// paste built in the page as a file and as markup, a DataTransfer drop, the By URL dialog), the
// sheet at two zooms and in the show and the viewer, the picture gestures on the vector picture,
// the copy of its markup and the sanitizer's four rows. Every picture must land within 5 s of its
// way in (LANDS_MS; 8 s for the URL, which fetches). A paste and a drop are events built in the
// page, the pattern of core/images.spec.ts. The export rows of the feature are core/export.spec.ts
// and core/logos.spec.ts. One context for the file; the deck it makes is torn down through the
// product at the end.
//
// PLAYWRIGHT_BASE_URL=<origin> node_modules/.bin/playwright test apps/studio/e2e/core/svg.spec.ts

const scratch = new Scratch();
let context: BrowserContext;
let page: Page;
let deck = '';
/** The audits' bound for one picture landing after its way in (docs/FOCUS.md 2.4; VECTOR.md 6.1). */
const LANDS_MS = 5000;
/** The svg picture the upload row landed, read by the render, gesture and copy rows. */
let uploaded: { slideId: string; blockId: string; assetId: string } | null = null;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  ({ context, page } = await ownerContext(browser));
  deck = await newDeck(page, scratch, 'SVG spec deck');
});
test.afterAll(async () => {
  test.setTimeout(180_000);
  try {
    await teardownAll(page, scratch);
  } finally {
    await context.close();
  }
});

type Obj = Awaited<ReturnType<typeof objectsOf>>[number];
const isPicture = (o: Obj) => o.type === 'shot' || o.type === 'picture';
async function pictures(slideId: string): Promise<Obj[]> {
  return (await objectsOf(page, slideId)).filter(isPicture);
}
async function expectPictureWithin(slideId: string, before: number, ms = LANDS_MS): Promise<Obj> {
  const t0 = Date.now();
  await expect
    .poll(async () => (await pictures(slideId)).length, { timeout: ms })
    .toBeGreaterThan(before);
  expect(Date.now() - t0, `the picture landed within ${ms} ms`).toBeLessThan(ms);
  const list = await pictures(slideId);
  return list[list.length - 1]!;
}
/** Uploads bytes through the chooser Insert > Image > Upload from computer opens. */
async function uploadThrough(bytes: Buffer, name: string, mime = 'image/svg+xml'): Promise<number> {
  const chooser = page.waitForEvent('filechooser', { timeout: 10_000 });
  await menuPath(page, 'insert', 'insert.image', 'insert.image.upload');
  const fc = await chooser;
  await fc.setFiles({ name, mimeType: mime, buffer: bytes });
  return Date.now();
}
/** True when the block draws an `img` whose source is the svg file (docs/VECTOR.md 4.4). */
async function drawsVector(blockId: string): Promise<boolean> {
  const img = await pictureImg(page, blockId);
  return img !== null && /\.svg(\?|$)/.test(img.src);
}
/** The asset record's vector facts (4.1). */
async function vectorFacts(slideId: string, assetId: string) {
  const asset = await assetOf(page, slideId, assetId);
  const twins = JSON.stringify(asset?.['twins'] ?? '');
  const vector = asset?.['vector'] as Record<string, string> | undefined;
  return {
    kind: asset?.['kind'] ?? null,
    neutral: vector?.['neutral'] ?? null,
    twins,
    scale: asset?.['scale'] ?? null,
    removed: (
      (asset?.['source'] as Record<string, unknown> | undefined)?.['sanitized'] as
        { removed?: string[] } | undefined
    )?.removed,
  };
}
/** The switch, when a row is still parked on this build (docs/FOCUS.md 3.1). */
async function switchOn(): Promise<boolean> {
  if ((await state(page)).settings?.['advancedTools'] === true) return false;
  await menuPath(page, 'tools', 'tools.advancedTools');
  await expect
    .poll(async () => (await state(page)).settings?.['advancedTools'] === true, { timeout: 5000 })
    .toBe(true);
  return true;
}
async function switchOff(): Promise<void> {
  if ((await state(page)).settings?.['advancedTools'] !== true) return;
  await menuPath(page, 'tools', 'tools.advancedTools').catch(() => undefined);
}
/** Whether a menubar row is drawn (its parents hovered); the menu closed after. */
async function rowPresent(menuId: string, ...rowIds: string[]): Promise<boolean> {
  await ctl(page, `menubar.${menuId}`).click();
  await page.locator(`#ts-menu-${menuId}`).waitFor({ timeout: 8000 });
  for (let i = 0; i < rowIds.length - 1; i += 1) {
    if ((await ctl(page, `menu.${rowIds[i]}`).count()) === 0) break;
    await ctl(page, `menu.${rowIds[i]}`).hover();
    await page.waitForTimeout(350);
  }
  const there = await ctl(page, `menu.${rowIds[rowIds.length - 1]}`)
    .isVisible()
    .catch(() => false);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  return there;
}
/** The stored block of a picture. */
async function blockOf(slideId: string, blockId: string): Promise<Obj | null> {
  return (await objectsOf(page, slideId)).find((o) => o.id === blockId) ?? null;
}
/** Cmd+Z, then the block polled back to its stored form. */
async function undoTo(slideId: string, blockId: string, json: string): Promise<boolean> {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Meta+z');
  return expect
    .poll(async () => JSON.stringify((await blockOf(slideId, blockId))?.block ?? null), {
      timeout: 8000,
    })
    .toBe(json)
    .then(() => true)
    .catch(() => false);
}
const SVG_TEXT = svgFixture().toString('utf8');
/** The markup without its prolog and comment, as Figma writes a Copy as SVG without them. */
const SVG_BODY = SVG_TEXT.replace(/^[\s\S]*?(?=<svg)/, '');

test(title('svg.import.upload'), async () => {
  test.setTimeout(120_000);
  await openEditor(page, deck);
  const slideId = await addSlide(page);
  const before = (await pictures(slideId)).length;
  const at = await uploadThrough(svgFixture(), 'mark.svg');
  const pic = await expectPictureWithin(slideId, before);
  const landedMs = Date.now() - at;
  const img = await pictureImg(page, pic.id);
  const facts = await vectorFacts(slideId, String(pic.block['asset']));
  test.info().annotations.push({
    type: 'upload',
    description: `${pic.id} ${JSON.stringify(pic.pos)} in ${landedMs} ms; img ${img?.src ?? 'none'} (fit ${img?.objectFit ?? 'none'}); asset ${JSON.stringify(facts)}`,
  });
  uploaded = { slideId, blockId: pic.id, assetId: String(pic.block['asset']) };
  expect(Math.abs(pic.pos.w / pic.pos.h - 96 / 64), "the box takes the SVG's aspect").toBeLessThan(
    0.05,
  );
  expect(img?.src ?? '', 'the img source is the svg file').toMatch(/\.svg(\?|$)/);
  expect(facts.kind, "the asset reads kind 'svg'").toBe('svg');
  expect(facts.neutral ?? '', 'vector.neutral ends in .svg').toMatch(/\.svg$/);
  expect(facts.twins, 'a PNG twin').toMatch(/\.png/);
  expect(facts.scale, 'scale 3').toBe(3);
});

test(title('svg.import.paste-file'), async () => {
  test.setTimeout(120_000);
  await openEditor(page, deck);
  const slideId = await addSlide(page);
  const before = (await pictures(slideId)).length;
  await page.locator('.ts-stagewrap.ts-editor').click({ position: { x: 20, y: 20 } });
  await pasteFile(page, svgFixture(), 'pasted.svg', 'image/svg+xml');
  const pic = await expectPictureWithin(slideId, before);
  const img = await pictureImg(page, pic.id);
  test.info().annotations.push({
    type: 'paste file',
    description: `${pic.id} ${JSON.stringify(pic.pos)}; img ${img?.src ?? 'none'}`,
  });
  expect(await drawsVector(pic.id), 'a vector picture (img src .svg)').toBe(true);
});

test(title('svg.import.paste-markup'), async () => {
  test.setTimeout(150_000);
  await openEditor(page, deck);
  const slideId = await addSlide(page);
  await page.locator('.ts-stagewrap.ts-editor').click({ position: { x: 20, y: 20 } });
  /* Figma's form: text/plain with the XML prolog */
  const n0 = (await pictures(slideId)).length;
  await pasteText(page, {
    'text/plain': `<?xml version="1.0" encoding="UTF-8"?>\n${SVG_BODY}`,
  });
  const first = await expectPictureWithin(slideId, n0);
  const firstVector = await drawsVector(first.id);
  await settled(page);
  /* a browser's form: text/html with Chrome's meta and no text/plain */
  await page.keyboard.press('Escape');
  const n1 = (await pictures(slideId)).length;
  await pasteText(page, { 'text/html': `<meta charset="utf-8">${SVG_BODY}` });
  const second = await expectPictureWithin(slideId, n1);
  const secondVector = await drawsVector(second.id);
  await settled(page);
  /* text that mentions an svg is text */
  await page.keyboard.press('Escape');
  const n2 = (await pictures(slideId)).length;
  const objectsBefore = (await objectsOf(page, slideId)).length;
  await pasteText(page, { 'text/plain': 'hello <svg>' });
  await page.waitForTimeout(2500);
  await settled(page);
  const n3 = (await pictures(slideId)).length;
  const landed = (await objectsOf(page, slideId)).slice(objectsBefore);
  test.info().annotations.push({
    type: 'paste markup',
    description: `prolog form ${first.id} vector ${firstVector}; html form ${second.id} vector ${secondVector}; the text paste landed ${landed.map((o) => o.type).join(', ') || 'nothing'} and ${n3 - n2} picture(s)`,
  });
  expect(firstVector, 'the text/plain markup lands a vector picture').toBe(true);
  expect(secondVector, 'the text/html markup lands a vector picture').toBe(true);
  expect(n3, '"hello <svg>" lands no picture').toBe(n2);
  expect(
    landed.every((o) => !isPicture(o)),
    'what the text paste landed is text',
  ).toBe(true);
});

test(title('svg.import.drop'), async () => {
  test.setTimeout(150_000);
  await openEditor(page, deck);
  const slideId = await addSlide(page);
  const before = (await pictures(slideId)).length;
  await dropFileAt(page, 1000, 600, svgFixture(), 'dropped.svg', 'image/svg+xml');
  const pic = await expectPictureWithin(slideId, before);
  const holds =
    pic.pos.x <= 1000 &&
    pic.pos.x + pic.pos.w >= 1000 &&
    pic.pos.y <= 600 &&
    pic.pos.y + pic.pos.h >= 600;
  const vector = await drawsVector(pic.id);
  await settled(page);
  /* dropped on a PNG picture: the asset is replaced and the box kept (a setup write places the PNG) */
  const pngId = await placePicture(page, slideId, { x: 200, y: 200, w: 240, h: 160 });
  const pngBefore = (await blockOf(slideId, pngId))!;
  await dropFileAt(page, 320, 280, svgFixture(), 'replace.svg', 'image/svg+xml');
  const t0 = Date.now();
  await expect
    .poll(async () => (await blockOf(slideId, pngId))?.block['asset'], { timeout: LANDS_MS })
    .not.toBe(pngBefore.block['asset']);
  const replacedMs = Date.now() - t0;
  const after = (await blockOf(slideId, pngId))!;
  const replacedVector = await drawsVector(pngId);
  test.info().annotations.push({
    type: 'drop',
    description: `${pic.id} ${JSON.stringify(pic.pos)} holds (1000, 600) ${holds}, vector ${vector}; the PNG ${pngId} replaced in ${replacedMs} ms: asset ${String(pngBefore.block['asset'])} -> ${String(after.block['asset'])}, box ${JSON.stringify(after.pos)}, vector ${replacedVector}`,
  });
  expect(holds, 'the box holds the drop point').toBe(true);
  expect(vector, 'a vector picture').toBe(true);
  expect(after.pos, 'the replaced picture keeps its box').toEqual(pngBefore.pos);
  expect(replacedVector, 'the replacement is the vector').toBe(true);
});

test(title('svg.import.url'), async () => {
  test.setTimeout(150_000);
  await openEditor(page, deck);
  const slideId = await addSlide(page);
  const origin = new URL(page.url()).origin;
  const address = `${origin}/api/logo/mark/figma/default.svg`;
  const probe = await fetchBytes(page, address);
  if (probe.status !== 200)
    test.skip(
      true,
      `not driven: ${address.replace(origin, '')} answered ${probe.status} on this base (the fixture upstream on the preview, the live index on production; docs/VECTOR.md 4.3)`,
    );
  let switched = false;
  if (!(await rowPresent('insert', 'insert.image', 'insert.image.byUrl'))) {
    switched = await switchOn();
    if (!(await rowPresent('insert', 'insert.image', 'insert.image.byUrl')))
      test.skip(true, 'Insert > Image > By URL is not reachable on this build');
  }
  await menuPath(page, 'insert', 'insert.image', 'insert.image.byUrl');
  await ctl(page, 'dialog.imageByUrl.url').waitFor({ timeout: 8000 });
  await ctl(page, 'dialog.imageByUrl.url').click();
  await page.keyboard.type(address, { delay: 40 });
  await page.waitForTimeout(900);
  const before = (await pictures(slideId)).length;
  await ctl(page, 'dialog.imageByUrl.ok').click();
  const t0 = Date.now();
  const pic = await expectPictureWithin(slideId, before, 8000);
  const img = await pictureImg(page, pic.id);
  const asset = await assetOf(page, slideId, String(pic.block['asset']));
  const alt = String(asset?.['alt'] ?? img?.alt ?? '');
  test.info().annotations.push({
    type: 'by url',
    description: `${switched ? 'with the switch on; ' : ''}${pic.id} in ${Date.now() - t0} ms; img ${img?.src ?? 'none'}; alt "${alt}"`,
  });
  if (switched) await switchOff();
  expect(await drawsVector(pic.id), 'a vector picture').toBe(true);
  expect(alt, "the alt is the file's name").toMatch(/default/);
});

/** The svg picture the render, gesture and copy rows read: the upload's, else one placed as setup. */
async function vectorPicture(): Promise<{
  slideId: string;
  blockId: string;
  assetId: string;
  how: string;
}> {
  if (uploaded) return { ...uploaded, how: "the upload row's picture" };
  const slideId = await addSlide(page);
  const placed = await placeSvgPicture(page, slideId, { x: 400, y: 200, w: 360, h: 240 });
  return {
    slideId,
    ...placed,
    how: 'a picture placed as a setup write (the upload row landed none)',
  };
}

test(title('svg.render.vector-at-zoom'), async () => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  const pic = await vectorPicture();
  await ctl(page, `filmstrip.slide.${pic.slideId}`).click();
  await expect.poll(async () => (await state(page)).slideId, { timeout: 8000 }).toBe(pic.slideId);
  const facts = await vectorFacts(pic.slideId, pic.assetId);
  const twinName = facts.twins.match(/([^/"\\]+\.png)/)?.[1] ?? null;
  const read = async () => {
    const img = await pictureImg(page, pic.blockId);
    const pngRequests = await page.evaluate(
      (name) =>
        performance
          .getEntriesByType('resource')
          .map((e) => e.name)
          .filter((n) => n.endsWith('.png') && (name === null || n.includes(name))).length,
      twinName,
    );
    return { src: img?.src ?? '', currentSrc: img?.currentSrc ?? '', pngRequests };
  };
  const s = await state(page);
  await invoke(page, 'view.zoom', { zoom: 1 });
  await page.waitForTimeout(600);
  const at100 = await read();
  await invoke(page, 'view.zoom', { zoom: 2 });
  await page.waitForTimeout(800);
  const at200 = await read();
  await invoke(page, 'view.zoom', { zoom: 'fit' });
  await page.waitForTimeout(400);
  /* the show draws the same img */
  await invoke(page, 'view.present', { on: true });
  await page.locator('.ts-stagewrap.is-present').waitFor({ timeout: 10_000 });
  await page.waitForTimeout(600);
  const inShow = await pictureImg(page, pic.blockId, '.ts-stagewrap.is-present .pt-slide');
  await invoke(page, 'view.present', { on: false }).catch(() => undefined);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  /* the viewer at /deck */
  await page.goto(`/deck/${deck}#s/${pic.slideId}`);
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
  const vectorName = (facts.neutral ?? '').split('/').pop() ?? '';
  const inViewer =
    (await pictureImg(page, pic.blockId, '.pt-viewer')) ??
    (await page.evaluate((name) => {
      /* the viewer's render carries block attributes on some roots only: the img is found by the
         asset's own vector file name */
      const img = [...document.querySelectorAll('.pt-viewer img')].find((el) =>
        (el.getAttribute('src') ?? '').endsWith(name),
      ) as HTMLImageElement | undefined;
      return img
        ? {
            src: img.getAttribute('src') ?? '',
            currentSrc: img.currentSrc,
            alt: img.alt,
            objectFit: getComputedStyle(img).objectFit,
            natural: { width: img.naturalWidth, height: img.naturalHeight },
          }
        : null;
    }, vectorName));
  await openEditor(page, deck);
  test.info().annotations.push({
    type: 'zoom',
    description: `at 100: ${at100.src} (currentSrc ${at100.currentSrc}), ${at100.pngRequests} png request(s) of the asset; at 200: ${at200.src}, ${at200.pngRequests}; the show ${inShow?.src ?? 'no img'}; the viewer ${inViewer?.src ?? 'no img'}; revision ${s.revision}`,
  });
  expect(at100.src, 'at 100 percent the img is the svg').toMatch(/\.svg(\?|$)/);
  expect(at100.currentSrc, 'currentSrc is the svg').toMatch(/\.svg(\?|$)/);
  expect(at200.src, 'at 200 percent the img stays the svg').toMatch(/\.svg(\?|$)/);
  expect(at200.currentSrc).toMatch(/\.svg(\?|$)/);
  expect(at200.pngRequests, 'the page requested no PNG twin of the asset').toBe(0);
  expect(inShow?.src ?? '', 'the show draws the same img').toMatch(/\.svg(\?|$)/);
  expect(inViewer?.src ?? '', 'the viewer draws the same img').toMatch(/\.svg(\?|$)/);
});

test(title('svg.render.picture-gestures'), async () => {
  test.setTimeout(300_000);
  await openEditor(page, deck);
  const pic = await vectorPicture();
  const { slideId, blockId } = pic;
  await ctl(page, `filmstrip.slide.${slideId}`).click();
  await expect.poll(async () => (await state(page)).slideId, { timeout: 8000 }).toBe(slideId);
  const sheet = (await page
    .locator('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)')
    .first()
    .boundingBox())!;
  const k = sheet.width / 1600;
  const el = page.locator(`.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"]`).first();
  const centre = async () => {
    const b = (await el.boundingBox())!;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, box: b };
  };
  const dragFrom = async (
    from: { x: number; y: number },
    to: { x: number; y: number },
    mods: string[] = [],
  ) => {
    await page.mouse.move(from.x - 30, from.y - 20);
    await page.mouse.move(from.x, from.y, { steps: 6 });
    for (const m of mods) await page.keyboard.down(m);
    await page.mouse.down();
    await page.waitForTimeout(80);
    await page.mouse.move(to.x, to.y, { steps: 16 });
    await page.waitForTimeout(120);
    await page.mouse.up();
    for (const m of mods) await page.keyboard.up(m);
    await page.waitForTimeout(200);
    await settled(page);
  };
  const stored = async () => JSON.stringify((await blockOf(slideId, blockId))?.block ?? null);
  const facts: string[] = [];
  const results: Record<string, boolean> = {};
  /* a drag from inside moves it 80 by 40 (AMENDMENTS.md A1 rule 2) */
  await selectBlock(page, blockId);
  const p0 = (await blockOf(slideId, blockId))!.pos;
  const json0 = await stored();
  const c = await centre();
  await dragFrom(c, { x: c.x + 80 * k, y: c.y + 40 * k });
  const p1 = (await blockOf(slideId, blockId))!.pos;
  results['move'] = Math.abs(p1.x - p0.x - 80) <= 12 && Math.abs(p1.y - p0.y - 40) <= 12;
  facts.push(`move ${p0.x},${p0.y} -> ${p1.x},${p1.y} (${results['move']})`);
  results['move undo'] = await undoTo(slideId, blockId, json0);
  /* the se handle with Shift keeps the aspect */
  await selectBlock(page, blockId);
  const se = page.locator(`.ts-overlay [data-control="handle.${blockId}.resize.se"]`).first();
  const seBox = await se.boundingBox();
  if (seBox) {
    const from = { x: seBox.x + seBox.width / 2, y: seBox.y + seBox.height / 2 };
    await dragFrom(from, { x: from.x + 90 * k, y: from.y + 30 * k }, ['Shift']);
    const p2 = (await blockOf(slideId, blockId))!.pos;
    const r0 = p0.w / p0.h;
    const r2 = p2.w / p2.h;
    results['shift resize'] = p2.w !== p0.w && Math.abs(r2 - r0) / r0 < 0.06;
    facts.push(
      `se with Shift ${p0.w}x${p0.h} -> ${p2.w}x${p2.h} (aspect ${r0.toFixed(3)} -> ${r2.toFixed(3)}, ${results['shift resize']})`,
    );
  } else {
    results['shift resize'] = false;
    facts.push('no se handle');
  }
  results['resize undo'] = await undoTo(slideId, blockId, json0);
  /* the rotation handle writes 15 degrees */
  await selectBlock(page, blockId);
  const ring = page.locator(`.ts-overlay [data-control="handle.${blockId}.rotate"]`).first();
  const ringBox = await ring.boundingBox();
  if (ringBox) {
    const cc = await centre();
    const from = { x: ringBox.x + ringBox.width / 2, y: ringBox.y + ringBox.height / 2 };
    const r = Math.hypot(from.x - cc.x, from.y - cc.y);
    const a = (15 * Math.PI) / 180;
    await dragFrom(from, { x: cc.x + r * Math.sin(a), y: cc.y - r * Math.cos(a) });
    const rot = Number(((await blockOf(slideId, blockId))!.pos as { rotate?: number }).rotate ?? 0);
    results['rotate'] = Math.abs(rot - 15) <= 4;
    facts.push(`rotate ${rot} (${results['rotate']})`);
  } else {
    results['rotate'] = false;
    facts.push('no rotation handle');
  }
  results['rotate undo'] = await undoTo(slideId, blockId, json0);
  /* Mask image (ellipse) writes and draws */
  await selectBlock(page, blockId);
  let switched = false;
  if (!(await rowPresent('format', 'format.image', 'format.image.maskImage')))
    switched = await switchOn();
  await selectBlock(page, blockId);
  if (await rowPresent('format', 'format.image', 'format.image.maskImage')) {
    await selectBlock(page, blockId);
    await ctl(page, 'menubar.format').click();
    await page.locator('#ts-menu-format').waitFor({ timeout: 8000 });
    await ctl(page, 'menu.format.image').hover();
    await ctl(page, 'menu.format.image.maskImage').waitFor({ timeout: 6000 });
    await ctl(page, 'menu.format.image.maskImage').hover();
    const tile = page.locator('[data-control="format.image.maskImage.pick.ellipse"]').first();
    const tileThere = await tile
      .waitFor({ timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (tileThere) await tile.click();
    else await page.keyboard.press('Escape');
    await settled(page);
    const mask = (await blockOf(slideId, blockId))?.block['mask'];
    const drawn = await page.evaluate((id) => {
      const root = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`);
      /* a shot carries the mask, the frame and the shadow on its .shot-crop child (figures.ts) */
      const box = root?.querySelector('[data-mask]') ?? root?.closest('[data-mask]') ?? root;
      return {
        mask: box?.getAttribute('data-mask') ?? null,
        clip: box ? getComputedStyle(box).clipPath : null,
      };
    }, blockId);
    results['mask'] =
      mask === 'ellipse' && drawn.mask === 'ellipse' && /A/.test(String(drawn.clip));
    facts.push(
      `mask ${String(mask)} drawn ${drawn.mask} clip ${String(drawn.clip).slice(0, 40)} (${results['mask']})`,
    );
  } else {
    results['mask'] = false;
    facts.push('Format > Image > Mask image is not reachable');
  }
  results['mask undo'] = await undoTo(slideId, blockId, json0);
  /* Border weight 2 writes and draws */
  await selectBlock(page, blockId);
  const weightButton = (await ctl(page, 'toolbar.borderWeight')
    .isVisible()
    .catch(() => false))
    ? 'toolbar.borderWeight'
    : null;
  if (weightButton) {
    await ctl(page, weightButton).click();
    /* the tail's list rows are menu rows (menu.toolbar.borderWeight.weight-<n>, ToolbarTail.tsx) */
    const two = page
      .locator(
        '[data-control="menu.toolbar.borderWeight.weight-2"], [data-control="toolbar.borderWeight.weight-2"]',
      )
      .first();
    const there = await two
      .waitFor({ timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (there) await two.click();
    else await page.keyboard.press('Escape');
    await settled(page);
    const frame = (await blockOf(slideId, blockId))?.block['frame'] as
      { weight?: number } | undefined;
    /* a shot draws its frame on the img itself unless it is framed by a crop, a mask or a dither,
       then on its .shot-crop child (figures.ts renderShot); a picture on its root */
    const border = await page.evaluate((id) => {
      const root = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`);
      const candidates = [
        root?.querySelector('img'),
        root?.querySelector('.shot-crop'),
        root?.closest('.picture'),
        root,
      ].filter((el): el is Element => el instanceof Element);
      for (const el of candidates) {
        const width = getComputedStyle(el).borderTopWidth;
        if (width && width !== '0px') return width;
      }
      return candidates.length > 0 ? getComputedStyle(candidates[0]!).borderTopWidth : null;
    }, blockId);
    results['border'] = frame?.weight === 2 && /^2(\.\d+)?px$/.test(String(border));
    facts.push(
      `border weight ${JSON.stringify(frame)} drawn ${String(border)} (${results['border']})`,
    );
  } else {
    results['border'] = false;
    facts.push('no toolbar.borderWeight on the tail');
  }
  results['border undo'] = await undoTo(slideId, blockId, json0);
  /* Drop shadow writes and draws: a picture's right click menu carries no Drop shadow row
     (model.ts, the image context list), so the shadow is the Format options panel's section
     (format-sections.ts 'shadow', behind the switch on the tree before the round), reached from
     Format > Format options with the picture selected */
  const openShadowSection = async (): Promise<boolean> => {
    await selectBlock(page, blockId);
    if (
      !(await ctl(page, 'panel.formatOptions')
        .isVisible()
        .catch(() => false))
    )
      await menuPath(page, 'format', 'format.formatOptions');
    const panel = await ctl(page, 'panel.formatOptions')
      .waitFor({ timeout: 6000 })
      .then(() => true)
      .catch(() => false);
    if (!panel) return false;
    const section = page
      .locator('[data-control="panel.formatOptions"] [data-section="shadow"]')
      .first();
    if ((await section.count()) === 0) return false;
    if (await section.evaluate((el) => el.classList.contains('is-closed')).catch(() => false))
      await section.locator('.ts-panel-section-head').first().click();
    return true;
  };
  let shadowSection = await openShadowSection();
  if (!shadowSection) {
    switched = (await switchOn()) || switched;
    shadowSection = await openShadowSection();
  }
  if (shadowSection) {
    const enable = ctl(page, 'formatOptions.shadow.enable');
    const there = await enable
      .waitFor({ timeout: 6000 })
      .then(() => true)
      .catch(() => false);
    if (there) {
      const input = enable.locator('input').first();
      await ((await input.count()) > 0 ? input : enable).click({ force: true });
    }
    await settled(page);
    const shadow = (await blockOf(slideId, blockId))?.block['shadow'];
    const drawn = await page.evaluate((id) => {
      const root = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`);
      const candidates = [
        root?.querySelector('img'),
        root?.querySelector('.shot-crop'),
        root?.closest('.picture'),
        root,
      ].filter((el): el is Element => el instanceof Element);
      for (const el of candidates) {
        const value = getComputedStyle(el).boxShadow;
        if (value && value !== 'none') return value;
      }
      return candidates.length > 0 ? getComputedStyle(candidates[0]!).boxShadow : null;
    }, blockId);
    results['shadow'] =
      shadow !== undefined && shadow !== null && drawn !== null && drawn !== 'none';
    facts.push(
      `shadow ${JSON.stringify(shadow)} drawn ${String(drawn).slice(0, 40)} (${results['shadow']})`,
    );
    if (
      await ctl(page, 'panel.formatOptions.close')
        .isVisible()
        .catch(() => false)
    )
      await ctl(page, 'panel.formatOptions.close').click();
  } else {
    results['shadow'] = false;
    facts.push('no Drop shadow section in Format options');
  }
  results['shadow undo'] = await undoTo(slideId, blockId, json0);
  /* a PNG dropped on it replaces the asset in the same box */
  await selectBlock(page, blockId);
  const beforeDrop = (await blockOf(slideId, blockId))!;
  const cc2 = await centre();
  await dropFileAt(
    page,
    (cc2.x - sheet.x) / k,
    (cc2.y - sheet.y) / k,
    await pngBytes(page, 120, 80),
    'over.png',
    'image/png',
  );
  const swapped = await expect
    .poll(async () => (await blockOf(slideId, blockId))?.block['asset'], { timeout: LANDS_MS })
    .not.toBe(beforeDrop.block['asset'])
    .then(() => true)
    .catch(() => false);
  const afterDrop = (await blockOf(slideId, blockId))!;
  results['png drop'] = swapped && JSON.stringify(afterDrop.pos) === JSON.stringify(beforeDrop.pos);
  facts.push(
    `PNG dropped: asset ${String(beforeDrop.block['asset'])} -> ${String(afterDrop.block['asset'])}, box kept ${JSON.stringify(afterDrop.pos) === JSON.stringify(beforeDrop.pos)} (${results['png drop']})`,
  );
  results['png drop undo'] = await undoTo(slideId, blockId, json0);
  /* Crop image is disabled with the sentence */
  await selectBlock(page, blockId);
  await ctl(page, 'menubar.format').click();
  await page.locator('#ts-menu-format').waitFor({ timeout: 8000 });
  await ctl(page, 'menu.format.image').hover();
  const crop = ctl(page, 'menu.format.image.cropImage');
  await crop.waitFor({ timeout: 6000 }).catch(() => undefined);
  const disabled = (await crop.getAttribute('aria-disabled').catch(() => null)) === 'true';
  await crop.hover().catch(() => undefined);
  await page.waitForTimeout(700);
  const tip = await page.evaluate(
    () => document.querySelector('.pt-tip')?.textContent?.trim() ?? null,
  );
  const words = `${tip ?? ''} ${(await crop.getAttribute('title').catch(() => null)) ?? ''} ${(await crop.getAttribute('aria-description').catch(() => null)) ?? ''}`;
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const toolbarCrop = await ctl(page, 'toolbar.cropImage')
    .getAttribute('aria-disabled')
    .catch(() => null);
  const toolbarDisabled =
    toolbarCrop === 'true' ||
    (await ctl(page, 'toolbar.cropImage')
      .isDisabled()
      .catch(() => false));
  /* the toolbar Crop button stays a button whose click speaks the sentence through the snackbar
     (vector/build/b1.md R4); the row reads the menu row's state and the words either surface says */
  let toolbarWords: string | null = null;
  if (
    !toolbarDisabled &&
    (await ctl(page, 'toolbar.cropImage')
      .isVisible()
      .catch(() => false))
  ) {
    await selectBlock(page, blockId);
    await ctl(page, 'toolbar.cropImage').click();
    await page.waitForTimeout(600);
    toolbarWords = await snackbarText(page);
    await page.keyboard.press('Escape');
  }
  const sentence = /An SVG picture cannot be cropped\. Resize it instead/;
  results['crop disabled'] =
    disabled && (sentence.test(words) || sentence.test(toolbarWords ?? ''));
  facts.push(
    `Crop image aria-disabled ${disabled}, words "${words.trim()}", the toolbar Crop disabled ${toolbarDisabled}${toolbarWords !== null ? `, its click said "${toolbarWords}"` : ''} (${results['crop disabled']})`,
  );
  if (switched) await switchOff();
  test
    .info()
    .annotations.push({ type: 'gestures', description: `${pic.how}; ${facts.join('; ')}` });
  const failed = Object.entries(results)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);
  expect(failed, `every gesture writes, draws and undoes (${facts.join('; ')})`).toEqual([]);
});

test(title('svg.copy.markup'), async () => {
  test.setTimeout(150_000);
  await openEditor(page, deck);
  const pic = await vectorPicture();
  const { slideId, blockId } = pic;
  await ctl(page, `filmstrip.slide.${slideId}`).click();
  await expect.poll(async () => (await state(page)).slideId, { timeout: 8000 }).toBe(slideId);
  await selectBlock(page, blockId);
  /* the read ahead: the markup is fetched once the picture is selected (4.5), so the copy is
     polled until its text/plain is the markup, 6 s at most */
  let copied = await copyFromStage(page);
  const until = Date.now() + 6000;
  while (Date.now() < until && !/^(<\?xml|<svg)/.test(copied.plain.trim())) {
    await page.waitForTimeout(300);
    copied = await copyFromStage(page);
  }
  const plain = copied.plain.trim();
  const before = (await pictures(slideId)).length;
  const original = (await blockOf(slideId, blockId))!;
  await page.keyboard.press('Meta+v');
  const landed = await expect
    .poll(async () => (await pictures(slideId)).length, { timeout: 8000 })
    .toBe(before + 1)
    .then(() => true)
    .catch(() => false);
  await settled(page);
  const second = (await pictures(slideId)).find(
    (o) => o.id !== blockId && o.pos.x === original.pos.x + 16,
  );
  test.info().annotations.push({
    type: 'copy',
    description: `${pic.how}; text/plain ${plain.slice(0, 40)}… (${plain.length} chars), text/html ${copied.html.slice(0, 40)}…; the paste landed ${landed} ${second ? `${second.id} at ${JSON.stringify(second.pos)}` : ''}`,
  });
  expect(plain, 'text/plain begins with the prolog or <svg').toMatch(/^(<\?xml|<svg)/);
  expect(plain, 'and ends with </svg>').toMatch(/<\/svg>$/);
  expect(copied.html, 'text/html begins with the envelope comment').toMatch(/^<!--turboslide:v1:/);
  expect(landed, 'Cmd+V lands a second picture').toBe(true);
  expect(second, 'the copy sits 16 px right and down').toBeDefined();
  expect(second?.pos.y).toBe(original.pos.y + 16);
  expect(second?.block['asset'], 'the same asset').toBe(original.block['asset']);
});

test(title('svg.sanitize.script-and-handlers'), async () => {
  test.setTimeout(120_000);
  await openEditor(page, deck);
  const slideId = await addSlide(page);
  const before = (await pictures(slideId)).length;
  await uploadThrough(fixtureBytes('unsafe.svg'), 'unsafe.svg');
  const pic = await expectPictureWithin(slideId, before);
  const img = await pictureImg(page, pic.id);
  const file = await fetchBytes(page, img?.src ?? '');
  const text = file.bytes.toString('utf8');
  const facts = await vectorFacts(slideId, String(pic.block['asset']));
  test.info().annotations.push({
    type: 'sanitized',
    description: `${pic.id}; the stored file ${file.status} ${file.contentType} ${text.length} chars; removed ${JSON.stringify(facts.removed ?? null)}`,
  });
  expect(file.status, 'the stored file is served').toBe(200);
  expect(text, 'no script').not.toMatch(/<script/i);
  expect(text, 'no onload').not.toMatch(/\sonload\s*=/i);
  expect(text, 'no foreignObject').not.toMatch(/<foreignObject/i);
  expect(text, 'no outside image').not.toMatch(/href\s*=\s*["']https?:/i);
  const removed = (facts.removed ?? []).join(' ');
  expect(removed, 'source.sanitized.removed names the script').toMatch(/script/);
  expect(removed, 'names the foreignObject').toMatch(/foreignObject/);
  expect(removed, 'names the image').toMatch(/image/);
});

test(title('svg.sanitize.data-image-kept'), async () => {
  test.setTimeout(120_000);
  await openEditor(page, deck);
  const slideId = await addSlide(page);
  const before = (await pictures(slideId)).length;
  await uploadThrough(fixtureBytes('data-image.svg'), 'data-image.svg');
  const pic = await expectPictureWithin(slideId, before);
  const img = await pictureImg(page, pic.id);
  const file = await fetchBytes(page, img?.src ?? '');
  const text = file.bytes.toString('utf8');
  test.info().annotations.push({
    type: 'kept',
    description: `${pic.id}; the stored file ${file.status} ${text.length} chars; image element ${/<image/i.test(text)}`,
  });
  expect(file.status).toBe(200);
  expect(text, 'the image element with its data URI is kept').toMatch(
    /<image[^>]+href\s*=\s*["']data:image\/png;base64,/i,
  );
});

/** A 2.1 MB svg: the fixture's body padded with rects until the cap is passed. */
function bigSvg(): Buffer {
  const rect = '<rect x="1" y="1" width="2" height="2" fill="#333333"/>\n';
  const target = 2.1 * 1024 * 1024;
  const head =
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="64" viewBox="0 0 96 64">\n';
  const count = Math.ceil((target - head.length - 6) / rect.length);
  return Buffer.from(`${head}${rect.repeat(count)}</svg>`);
}

async function refusedUpload(bytes: Buffer, name: string, slideId: string, before: number) {
  const t0 = await uploadThrough(bytes, name);
  let said: string | null = null;
  let landed = false;
  while (Date.now() - t0 < 10_000 && !landed && !(said && /could not be uploaded/.test(said))) {
    landed = (await pictures(slideId)).length > before;
    said = await snackbarText(page);
    if (!landed) await page.waitForTimeout(200);
  }
  return { ms: Date.now() - t0, said, landed };
}

test(title('svg.sanitize.cap'), async () => {
  test.setTimeout(120_000);
  await openEditor(page, deck);
  const slideId = await addSlide(page);
  const before = (await pictures(slideId)).length;
  const big = bigSvg();
  const r = await refusedUpload(big, 'big.svg', slideId, before);
  test.info().annotations.push({
    type: 'cap',
    description: `${big.length} bytes; snackbar "${r.said ?? 'none'}" after ${r.ms} ms; landed ${r.landed}`,
  });
  expect(r.landed, 'nothing lands').toBe(false);
  expect(r.ms, 'within 5 s').toBeLessThan(5000);
  expect(r.said ?? '', 'the cap sentence').toMatch(
    /The picture could not be uploaded: The SVG file is over 2 MB/,
  );
});

test(title('svg.sanitize.broken'), async () => {
  test.setTimeout(120_000);
  await openEditor(page, deck);
  const slideId = await addSlide(page);
  const before = (await pictures(slideId)).length;
  const r = await refusedUpload(fixtureBytes('broken.svg'), 'broken.svg', slideId, before);
  test.info().annotations.push({
    type: 'broken',
    description: `snackbar "${r.said ?? 'none'}" after ${r.ms} ms; landed ${r.landed}`,
  });
  expect(r.landed, 'nothing lands').toBe(false);
  expect(r.said ?? '', 'the sentence').toMatch(
    /The picture could not be uploaded: This SVG file could not be read/,
  );
});

coverage(import.meta.filename, [
  'svg.import.upload',
  'svg.import.paste-file',
  'svg.import.paste-markup',
  'svg.import.drop',
  'svg.import.url',
  'svg.render.vector-at-zoom',
  'svg.render.picture-gestures',
  'svg.copy.markup',
  'svg.sanitize.script-and-handlers',
  'svg.sanitize.data-image-kept',
  'svg.sanitize.cap',
  'svg.sanitize.broken',
]);
