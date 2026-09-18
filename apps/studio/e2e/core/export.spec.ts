import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import {
  Scratch,
  addSlide,
  clickCard,
  coverage,
  ctl,
  download,
  invoke,
  menuPath,
  newDeck,
  openEditor,
  ownerContext,
  pdfImages,
  pdfPages,
  pdfStreams,
  placePicture,
  pptxSlides,
  settled,
  skipCurrent,
  slideOrder,
  state,
  teardownAll,
  title,
  typeNote,
  zipEntries,
} from './lib';

// Download and print, the file rows (docs/FOCUS.md 2.8, 6.4 `export.*`, `images.export.*` and
// `shapes.export.*` with the driver core/export.spec.ts): the PDF and the PowerPoint files
// checked on disk (the page count, the slide parts, the notes part, the image objects, the
// shape's fill), each arriving within 30 s, and the print page's Download as PDF carrying what
// the preview shows. The deck: a title, two more slides, the third skipped, a note on slide 1, a
// picture placed as setup and a filled rectangle inserted from Insert > Shape.
//
// The export quota (SPEC-3 8.3 R3, `ratelimit.ts` `exportsPerDay`): an anonymous identity gets
// five downloads a day and the sixth is refused 429 with the dialog's sentence. This file's rows
// make eleven downloads, so the sixth (`images.export.pdf-with-picture`) was refused on every
// tier and the rows after it passed only because Playwright restarted the worker after the
// failure and `beforeAll` ran again as a new identity (VERIFICATION.md C2-F8, b7's C2-R20). Each
// browser context is a new anonymous identity and a deck belongs to the identity that made it,
// so the rows run as three owners, each with the same deck built for it, and `withBudget(n)`
// hands a row the owner whose quota holds `n` more downloads (five per identity, never spent
// past it). The quota is the product's decision and stays; the file just keeps within it.
//
// PLAYWRIGHT_BASE_URL=<origin> node_modules/.bin/playwright test apps/studio/e2e/core/export.spec.ts

/** Downloads an anonymous identity may make a day (SPEC-3 8.3 R3). */
const QUOTA = 5;
const NOTE = 'Open with the renewal date and the two new logos.';
const TITLE = 'Acme pricing review, Q3 2026';
const FILL = '#aa3366';

type Owner = {
  context: BrowserContext;
  page: Page;
  scratch: Scratch;
  deck: string;
  /** slides the downloads count: every slide but the skipped one */
  unskipped: number;
  /** downloads this identity has made or reserved */
  downloads: number;
  n: number;
};
const owners: Owner[] = [];
let browserRef: Browser;

/** A new anonymous identity with the file's deck built for it (a setup, never a driven step). */
async function makeOwner(browser: Browser): Promise<Owner> {
  const { context, page } = await ownerContext(browser);
  const scratch = new Scratch();
  const deck = await newDeck(page, scratch, TITLE);
  const first = (await slideOrder(page))[0]!;
  await clickCard(page, first);
  await typeNote(page, NOTE);
  await addSlide(page);
  await placePicture(page, (await state(page)).slideId, { x: 200, y: 200, w: 240, h: 160 });
  /* a filled rectangle placed as a setup write (the matrix's setup convention): on production the
     named Insert > Shape rows are section 4's unshipped work, so the shape goes in through the
     window API with a fill, and the shapes.export.* rows check it survives the download */
  const second = (await state(page)).slideId;
  const sBefore = await state(page);
  await invoke(page, 'block.insert', {
    baseRevision: sBefore.revision,
    slideId: second,
    slot: 'main',
    block: {
      id: 'export-shape',
      type: 'shape',
      shape: 'rectangle',
      fill: FILL,
      pos: { x: 900, y: 300, w: 300, h: 180 },
    },
  });
  await settled(page);
  const third = await addSlide(page);
  await clickCard(page, third);
  await skipCurrent(page);
  const owner: Owner = {
    context,
    page,
    scratch,
    deck,
    unskipped: (await slideOrder(page)).length - 1,
    downloads: 0,
    n: owners.length + 1,
  };
  owners.push(owner);
  return owner;
}

/**
 * The owner for a row that makes `n` downloads: the current one while its quota holds them, else
 * a new identity with its own deck. The reservation is made before the row runs, so a row that
 * fails mid way never leaves the count wrong for the next.
 */
async function withBudget(n: number): Promise<Owner> {
  let owner = owners[owners.length - 1];
  if (!owner || owner.downloads + n > QUOTA) owner = await makeOwner(browserRef);
  owner.downloads += n;
  return owner;
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  browserRef = browser;
  await makeOwner(browser);
});
test.afterAll(async () => {
  /* every owner's deck is torn down by its own identity (the one that can open it), past a
     failed row and past the file's own test timeout (VERIFICATION.md C2-F29) */
  test.setTimeout(300_000);
  const failures: string[] = [];
  for (const owner of owners) {
    try {
      await teardownAll(owner.page, owner.scratch);
    } catch (error) {
      failures.push(
        `owner ${owner.n}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
      );
    } finally {
      await owner.context.close().catch(() => undefined);
    }
  }
  expect(failures, 'every owner tore its deck down').toEqual([]);
});

async function openPdf(page: Page): Promise<void> {
  await menuPath(page, 'file', 'file.download', 'file.download.pdf');
  await ctl(page, 'dialog.download.pdf').waitFor({ timeout: 8000 });
}
async function openPptx(page: Page): Promise<void> {
  await menuPath(page, 'file', 'file.download', 'file.download.pptx');
  await ctl(page, 'dialog.download.pptx').waitFor({ timeout: 8000 });
}
async function check(page: Page, control: string): Promise<void> {
  const box = ctl(page, control);
  const input = box.locator('input').first();
  const target = (await input.count()) > 0 ? input : box;
  if (!(await target.isChecked().catch(() => false))) await target.click({ force: true });
}
/**
 * Closes the Download dialog after a run. Once the run completes the OK button unmounts and the
 * focus falls to the body, where the Dialog's Escape handler (on its card) never sees the key, so
 * the dialog and its scrim stay and the next File click waits under the scrim to the test's
 * timeout (b3 R19, VERIFICATION.md pass 2 F-shapes-export). Done, else the close control, is
 * clicked first; Escape is the fallback for a dialog with neither.
 */
async function closeDialogs(page: Page): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    const dialog = page.locator('.ts-dialog-scrim [role="dialog"]');
    if ((await dialog.count()) === 0) break;
    const done = page.locator(
      '[data-control="dialog.download.done"], [data-control="dialog.download.close"], [data-control="dialog.download.cancel"]',
    );
    if ((await done.count()) > 0)
      await done
        .first()
        .click({ timeout: 3000 })
        .catch(() => undefined);
    else await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  await expect(page.locator('.ts-dialog-scrim [role="dialog"]')).toHaveCount(0, {
    timeout: 5000,
  });
}

test(title('export.pdf.file'), async () => {
  test.setTimeout(120_000);
  const { page, deck, unskipped } = await withBudget(1);
  await openEditor(page, deck);
  await openPdf(page);
  const pdf = await download(page, () => ctl(page, 'dialog.download.ok').click());
  await closeDialogs(page);
  expect(pdf.ms, 'arrives within 30 s').toBeLessThan(30_000);
  expect(pdf.name).toMatch(/\.pdf$/);
  expect(pdf.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(pdfPages(pdf.bytes), 'one page per unskipped slide').toBe(unskipped);
});

test(title('export.pdf.include-skipped'), async () => {
  test.setTimeout(120_000);
  const { page, deck, unskipped } = await withBudget(1);
  await openEditor(page, deck);
  await openPdf(page);
  await check(page, 'dialog.download.includeSkipped');
  const pdf = await download(page, () => ctl(page, 'dialog.download.ok').click());
  await closeDialogs(page);
  expect(pdf.ms).toBeLessThan(30_000);
  expect(pdfPages(pdf.bytes), 'a page for the skipped slide too').toBe(unskipped + 1);
});

test(title('export.pdf.notes-honest'), async () => {
  test.setTimeout(150_000);
  /* two downloads when the dialog offers the notes, none when it does not; two are reserved */
  const owner = await withBudget(2);
  const { page, deck } = owner;
  await openEditor(page, deck);
  await openPdf(page);
  const offered = (await ctl(page, 'dialog.download.includeNotes').count()) > 0;
  if (!offered) {
    await closeDialogs(page);
    owner.downloads -= 2;
    expect(
      offered,
      'the dialog offers Include speaker notes only when the PDF carries them; it is not offered',
    ).toBe(false);
    return;
  }
  const plain = await download(page, () => ctl(page, 'dialog.download.ok').click());
  await closeDialogs(page);
  await openPdf(page);
  await check(page, 'dialog.download.includeNotes');
  const withNotes = await download(page, () => ctl(page, 'dialog.download.ok').click());
  await closeDialogs(page);
  expect(withNotes.ms).toBeLessThan(30_000);
  const differs =
    withNotes.bytes.length !== plain.bytes.length ||
    pdfPages(withNotes.bytes) !== pdfPages(plain.bytes) ||
    !withNotes.bytes.equals(plain.bytes);
  expect(differs, 'a checked Include speaker notes changes the file').toBe(true);
  expect(
    pdfStreams(withNotes.bytes).length,
    'the file with notes carries more content',
  ).toBeGreaterThan(pdfStreams(plain.bytes).length - 1);
});

test(title('export.pptx.perfect'), async () => {
  test.setTimeout(150_000);
  const { page, deck, unskipped } = await withBudget(1);
  await openEditor(page, deck);
  await openPptx(page);
  await expect(
    ctl(page, 'dialog.download.mode.flatten')
      .locator('input, [role=radio]')
      .first()
      .or(ctl(page, 'dialog.download.mode.flatten')),
  ).toBeAttached();
  const pptx = await download(page, () => ctl(page, 'dialog.download.ok').click(), 60_000);
  await closeDialogs(page);
  expect(pptx.ms, 'arrives within 30 s').toBeLessThan(30_000);
  expect(pptx.bytes.subarray(0, 2).toString('latin1')).toBe('PK');
  expect(pptxSlides(pptx.bytes).length, 'one slide part per unskipped slide').toBe(unskipped);
});

test(title('export.pptx.editable'), async () => {
  test.setTimeout(150_000);
  const { page, deck } = await withBudget(1);
  await openEditor(page, deck);
  await openPptx(page);
  await ctl(page, 'dialog.download.mode.native').click({ force: true });
  const pptx = await download(page, () => ctl(page, 'dialog.download.ok').click(), 60_000);
  await closeDialogs(page);
  expect(pptx.ms).toBeLessThan(30_000);
  const entries = zipEntries(pptx.bytes);
  const slide1 = entries.get('ppt/slides/slide1.xml')?.();
  expect(slide1, 'slide1.xml is in the file').toBeTruthy();
  expect(
    slide1!.includes('<a:t>') && slide1!.includes(TITLE.split(',')[0]!),
    'the title is a text run',
  ).toBe(true);
});

test(title('export.pptx.notes-and-skipped'), async () => {
  test.setTimeout(150_000);
  const { page, deck, unskipped } = await withBudget(1);
  await openEditor(page, deck);
  await openPptx(page);
  await check(page, 'dialog.download.includeNotes');
  await check(page, 'dialog.download.includeSkipped');
  const pptx = await download(page, () => ctl(page, 'dialog.download.ok').click(), 60_000);
  await closeDialogs(page);
  expect(pptx.ms).toBeLessThan(30_000);
  expect(pptxSlides(pptx.bytes).length, 'every slide, the skipped one too').toBe(unskipped + 1);
  const entries = zipEntries(pptx.bytes);
  const notes = [...entries.keys()].filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n));
  expect(notes.length, 'a notes part').toBeGreaterThan(0);
  const text = notes.map((n) => entries.get(n)!()).join('\n');
  expect(text.includes('renewal date'), 'the talk track is in the notes part').toBe(true);
});

test(title('images.export.pdf-with-picture'), async () => {
  test.setTimeout(120_000);
  const { page, deck, unskipped } = await withBudget(1);
  await openEditor(page, deck);
  await openPdf(page);
  const pdf = await download(page, () => ctl(page, 'dialog.download.ok').click());
  await closeDialogs(page);
  expect(pdf.ms).toBeLessThan(30_000);
  expect(pdfPages(pdf.bytes)).toBe(unskipped);
  expect(pdfImages(pdf.bytes), 'one image object per picture at least').toBeGreaterThanOrEqual(1);
});

test(title('shapes.export.pdf'), async () => {
  test.setTimeout(120_000);
  const { page, deck, unskipped } = await withBudget(1);
  await openEditor(page, deck);
  await openPdf(page);
  const pdf = await download(page, () => ctl(page, 'dialog.download.ok').click());
  await closeDialogs(page);
  expect(pdf.ms).toBeLessThan(30_000);
  expect(pdfPages(pdf.bytes)).toBe(unskipped);
  const streams = pdfStreams(pdf.bytes);
  /* #aa3366 is 0.667 0.2 0.4 in the content stream's rg operator; a filled path fills. Skia
     writes a component without its leading zero: `.6667 .2 .4 rg` (b3 R18) */
  const filled =
    /0?\.66\d* 0?\.2\d* 0?\.4\d* rg/.test(streams) ||
    /0?\.66\d* 0?\.2\d* 0?\.4\d* sc/.test(streams);
  expect(filled, 'the filled shape survives into the PDF paint').toBe(true);
});

test(title('shapes.export.pptx'), async () => {
  test.setTimeout(240_000);
  const { page, deck, unskipped } = await withBudget(2);
  await openEditor(page, deck);
  await openPptx(page);
  const perfect = await download(page, () => ctl(page, 'dialog.download.ok').click(), 60_000);
  await closeDialogs(page);
  expect(perfect.ms).toBeLessThan(30_000);
  expect(pptxSlides(perfect.bytes).length).toBe(unskipped);
  await openPptx(page);
  await ctl(page, 'dialog.download.mode.native').click({ force: true });
  const editable = await download(page, () => ctl(page, 'dialog.download.ok').click(), 60_000);
  await closeDialogs(page);
  expect(editable.ms).toBeLessThan(30_000);
  const entries = zipEntries(editable.bytes);
  const xml = pptxSlides(editable.bytes)
    .map((n) => entries.get(n)!())
    .join('\n');
  expect(/AA3366/i.test(xml), 'the shape and its fill are in the editable file').toBe(true);
  expect(/<p:sp>|<p:sp /.test(xml)).toBe(true);
});

test(title('export.print.download-pdf-follows-preview'), async () => {
  test.setTimeout(240_000);
  const { page, deck, unskipped } = await withBudget(2);
  await openEditor(page, deck);
  await menuPath(page, 'file', 'file.printPreview');
  await page.waitForURL(/\/print\//, { timeout: 20_000 });
  await ctl(page, 'print.page').waitFor({ timeout: 20_000 });
  const skipped = ctl(page, 'print.skipped');
  const input = skipped.locator('input').first();
  await ((await input.count()) > 0 ? input : skipped).click({ force: true });
  await expect(ctl(page, 'print.pages')).toHaveAttribute('data-count', String(unskipped + 1));
  const withSkipped = await download(page, () => ctl(page, 'print.pdf').click(), 45_000);
  expect(withSkipped.ms).toBeLessThan(30_000);
  expect(
    pdfPages(withSkipped.bytes),
    'the file has the page the preview shows for the skipped slide',
  ).toBe(unskipped + 1);
  await page.locator('[data-control="print.layout"]').selectOption('notes');
  await expect(ctl(page, 'print.page')).toHaveAttribute('data-layout', 'notes');
  await expect.poll(() => ctl(page, 'print.pdf').isEnabled(), { timeout: 10_000 }).toBe(true);
  const withNotes = await download(page, () => ctl(page, 'print.pdf').click(), 45_000);
  expect(withNotes.ms).toBeLessThan(30_000);
  expect(withNotes.bytes.equals(withSkipped.bytes), 'the notes layout changes the file').toBe(
    false,
  );
  await ctl(page, 'print.close').click();
  await page.waitForURL(/\/edit\//, { timeout: 20_000 });
});

coverage(import.meta.filename, [
  'export.pdf.file',
  'export.pdf.include-skipped',
  'export.pdf.notes-honest',
  'export.pptx.perfect',
  'export.pptx.editable',
  'export.pptx.notes-and-skipped',
  'images.export.pdf-with-picture',
  'shapes.export.pdf',
  'shapes.export.pptx',
  'export.print.download-pdf-follows-preview',
]);
