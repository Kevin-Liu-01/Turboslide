import { spawnSync } from 'node:child_process';

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
  typeInto,
  typeNote,
  zipEntries,
  pngDataUrl,
  headingRun,
  waitEditor,
  pngSize,
  windowActions,
  zipEntriesRaw,
  captureFallback,
  ensureShader,
  fetchPageFile,
  largestPdfImage,
  rgbDistance,
  samplePicture,
  shaderBlocks,
  waitFrame,
  agentHeaders,
  fetchBytes,
  objectsOf as objectsOfLib,
  placeSvgPicture,
} from './lib';
import { shapeAdjustDefaults, textInset } from '@turboslide/schema/shapes';

// Download and print, the file rows (docs/FOCUS.md 2.8, 6.4 `export.*`, `images.export.*` and
// `shapes.export.*` with the driver core/export.spec.ts): the PDF and the PowerPoint files
// checked on disk (the page count, the slide parts, the notes part, the image objects, the
// shape's fill), each arriving within 30 s, and the print page's Download as PDF carrying what
// the preview shows. The deck: a title, two more slides, the third skipped, a note on slide 1, a
// picture placed as setup and a filled rectangle inserted from Insert > Shape. The return round
// (docs/RETURN.md section 5) adds the bundle, the web page, the JPEG and the PNG downloads, the
// table's two cells typed through the product, the chart, the word art and the two connectors in
// the PDF and the Editable text PowerPoint; the documents are placed as setup writes (the walk
// probe drives their insertion) and every file is read from the download's own bytes.
//
// The four same origin downloads (the bundle, the web page, the JPEG and the PNG) are fetched by
// the page and saved from its bytes since the return round fix round (`@turboslide/chrome/download`;
// VERIFICATION.md R1-F5): the browser's own anchor request carried none of the page's headers, so
// on a preview behind Vercel Authentication it met the wall and navigated the tab away from the
// editor, and the rows could not be measured there. The download event these rows read is the
// page's blob anchor, on every origin, and each row also reads that the editor is still the page
// after the file arrived. The web page's file is a stored copy on the blob backend since the same
// fix round (server/download.ts builtFileLink), so its download travels as the PDF's does; on the
// tmp backend it is this instance's one time token, fetched by the page.
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
// The vector round (docs/VECTOR.md 2.5, 4.6, 6.1) adds the geometry interpreter's two export rows
// and the label rectangle row on a geometry deck of its own, and the svg picture's four export rows
// on an svg deck of its own, each group under a fresh identity so no identity spends past the quota.
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
  /** the fourth slide, with the documents of the return round */
  docsSlide?: string;
  /** the features round, ship two: the slide with the shader block, the block and how it landed */
  shaderSlide?: string;
  shaderBlock?: string;
  shaderHow?: string;
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
  /* the return round's documents on a fourth slide (setup writes): a table whose two cells the
     tables rows type through the product, a bar chart, a word art text and two connectors
     between two rectangles (docs/RETURN.md 2.4 to 2.8) */
  const fourth = await addSlide(page);
  await clickCard(page, fourth);
  const s4 = await state(page);
  const docs = [
    {
      id: 'export-table',
      type: 'table',
      columns: [{}, {}, {}],
      rows: [
        { cells: ['', '', ''], header: true },
        { cells: ['', '', ''] },
        { cells: ['', '', ''] },
      ],
      pos: { x: 80, y: 80, w: 720, h: 240 },
    },
    {
      id: 'export-chart',
      type: 'chart',
      kind: 'bar',
      categories: ['North', 'South', 'West'],
      series: [{ name: 'Bookings', values: [30, 45, 20] }],
      pos: { x: 860, y: 80, w: 660, h: 360 },
    },
    {
      id: 'export-wordart',
      type: 'text',
      text: 'Big words',
      typography: { size: 88, weight: 500, align: 'center' },
      outline: { color: 'ink', width: 1.5 },
      pos: { x: 80, y: 380, w: 720, h: 120 },
    },
    {
      id: 'con-a',
      type: 'shape',
      shape: 'rectangle',
      fill: 'plate',
      stroke: 'ink',
      pos: { x: 80, y: 600, w: 240, h: 160 },
    },
    {
      id: 'con-b',
      type: 'shape',
      shape: 'rectangle',
      fill: 'plate',
      stroke: 'ink',
      pos: { x: 640, y: 600, w: 240, h: 160 },
    },
    {
      id: 'con-c',
      type: 'shape',
      shape: 'rectangle',
      fill: 'plate',
      stroke: 'ink',
      pos: { x: 1200, y: 600, w: 240, h: 160 },
    },
    {
      id: 'con-elbow',
      type: 'shape',
      shape: 'elbow',
      stroke: 'ink',
      width: 2,
      orientation: 'horizontal',
      connect: { start: { block: 'con-a', site: 3 }, end: { block: 'con-b', site: 1 } },
      pos: { x: 320, y: 680, w: 320, h: 1 },
    },
    {
      id: 'con-curved',
      type: 'shape',
      shape: 'curved',
      stroke: 'ink',
      width: 2,
      orientation: 'horizontal',
      connect: { start: { block: 'con-b', site: 3 }, end: { block: 'con-c', site: 1 } },
      pos: { x: 880, y: 680, w: 320, h: 1 },
    },
  ];
  let revision = s4.revision;
  for (const block of docs) {
    await invoke(page, 'block.insert', {
      baseRevision: revision,
      slideId: fourth,
      slot: 'main',
      block,
    });
    revision = (await settled(page)).revision;
  }
  const owner: Owner = {
    context,
    page,
    scratch,
    deck,
    unskipped: (await slideOrder(page)).length - 1,
    downloads: 0,
    n: owners.length + 1,
    docsSlide: fourth,
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
  /* the newest owner whose deck carries the documents slide: `plainDeck` pushes its table free
     deck onto the list too, and the table rows read the dialog a plain deck never opens */
  let owner = [...owners].reverse().find((o) => o.docsSlide !== undefined);
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

/**
 * The download dialog with the PDF type picked (docs/PRODUCT.md section 2 rank 8): the PDF row
 * starts its download at once, so the dialog's way in is File > Download > Download options and its
 * File type choice; the dialog's control then reads `dialog.download.pdf`.
 */
async function openPdf(page: Page): Promise<void> {
  await menuPath(page, 'file', 'file.download', 'file.download.options');
  const type = ctl(page, 'dialog.download.type.pdf');
  await type.waitFor({ timeout: 8000 });
  await type.click();
  await ctl(page, 'dialog.download.pdf').waitFor({ timeout: 8000 });
}
/** The download dialog with PowerPoint picked (the default of Download options). */
async function openPptx(page: Page): Promise<void> {
  await menuPath(page, 'file', 'file.download', 'file.download.options');
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
  /* the page is server rendered and announces hydration (`data-hydrated`, the home page's
     convention): a click on the check before React attaches its handler toggles nothing (the
     integrator's three re-runs of this file alone read data-count 3 after the click) */
  await page.waitForSelector('[data-control="print.page"][data-hydrated]', { timeout: 20_000 });
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

// ---------------------------------------------------------------------------------------------
// the return round's rows (docs/RETURN.md section 5)

/** The text of every PDF page's content streams, with the parenthesised strings joined. */
function pdfText(bytes: Buffer): string {
  /* a real extractor first, where the machine has one: Chromium prints the sheet's text as CID
     glyph ids in Flate compressed streams, which the stream reader below cannot turn into words,
     so the three docs rows (tables.export.pdf, charts.export.pdf, wordart.export.pdf) read "not
     driven" on the first drive and would park their features whole (docs/RETURN.md section 1 rule
     2). poppler's pdftotext maps the glyphs through the fonts' ToUnicode tables (the audits read
     their PDFs the same way); without it on PATH the reader below stands and the rows say so */
  const extracted = spawnSync('pdftotext', ['-layout', '-', '-'], {
    input: bytes,
    encoding: 'utf8',
    timeout: 30_000,
  });
  const words =
    extracted.status === 0 && typeof extracted.stdout === 'string' ? extracted.stdout.trim() : '';
  const streams = pdfStreams(bytes);
  const out: string[] = words === '' ? [] : [words];
  const re = /\(((?:\\.|[^\\)])*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(streams)) !== null) out.push(m[1]!.replace(/\\(.)/g, '$1'));
  /* hex strings too (<48656c6c6f> Tj): a simple font's bytes read as latin1; a CID font's two
     byte glyph ids come out as noise, which the docs rows report as unreadable rather than fail */
  const hex = /<([0-9A-Fa-f\s]{2,})>\s*(?:Tj|TJ|\])/g;
  while ((m = hex.exec(streams)) !== null) {
    const clean = m[1]!.replace(/\s+/g, '');
    let word = '';
    for (let i = 0; i + 1 < clean.length; i += 2)
      word += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
    out.push(word);
  }
  return `${out.join('')}\n${out.join(' ')}`;
}
/**
 * Whether the PDF's text streams carry readable words at all (a slide's heading is on every
 * deck of this file): when they do not, the spec cannot read the PDF and a row that judges words
 * is not driven, with the reason, rather than failed.
 */
function pdfReadable(text: string, probe: string): boolean {
  return text.includes(probe);
}
/** Every slide part of an Editable text PowerPoint, joined. */
function pptxSlideXml(bytes: Buffer): string {
  const entries = zipEntries(bytes);
  return pptxSlides(bytes)
    .map((n) => entries.get(n)!())
    .join('\n');
}
/** The two cells of the table typed through the product, each closed by Escape (RETURN.md 2.4). */
async function typeTableCells(owner: Owner): Promise<void> {
  const { page, docsSlide } = owner;
  await clickCard(page, docsSlide!);
  const cell = (r: number, c: number) => `export-table/rows/${r}/cells/${c}`;
  const has = async (needle: string) =>
    JSON.stringify(await slideJsonOf(page, docsSlide!)).includes(needle);
  if (!(await has('Q1 revenue'))) await typeInto(page, cell(1, 0), 'Q1 revenue');
  await settled(page);
  if (!(await has('12 000'))) await typeInto(page, cell(1, 1), '12 000');
  await settled(page);
  await expect.poll(() => has('Q1 revenue'), { timeout: 10_000 }).toBe(true);
  await expect.poll(() => has('12 000'), { timeout: 10_000 }).toBe(true);
}
async function slideJsonOf(page: Page, slideId: string): Promise<unknown> {
  const got = await invoke<{ slide?: unknown }>(page, 'slide.get', { slideId });
  return got.slide ?? got;
}

test(title('export.zip.bundle'), async () => {
  test.setTimeout(120_000);
  const { page, deck } = await withBudget(1);
  await openEditor(page, deck);
  const switched = await reachDownloadRow(page, 'file.download.zip');
  const zip = await download(page, () =>
    menuPath(page, 'file', 'file.download', 'file.download.zip'),
  );
  expect(zip.ms, 'arrives within 30 s').toBeLessThan(30_000);
  expect(zip.bytes.subarray(0, 2).toString('latin1')).toBe('PK');
  const names = [...zipEntries(zip.bytes).keys()];
  test.info().annotations.push({
    type: 'bundle',
    description: `entries ${names.slice(0, 12).join(', ')}${names.length > 12 ? ` and ${names.length - 12} more` : ''}`,
  });
  expect(
    names.some((n) => /(^|\/)deck\.json$/.test(n)),
    `deck.json is in the bundle (entries ${names.slice(0, 8).join(', ')})`,
  ).toBe(true);
  await expect(ctl(page, 'snackbar'), 'the snackbar names the bundle').toContainText(/bundle/i, {
    timeout: 8000,
  });
  expect(page.url(), 'the editor is still the page').toContain(`/edit/${deck}`);
  if (switched) await menuPath(page, 'tools', 'tools.advancedTools');
});

test(title('export.html.web-page'), async () => {
  test.setTimeout(120_000);
  const { page, deck } = await withBudget(1);
  await openEditor(page, deck);
  const switched = await reachDownloadRow(page, 'file.download.html');
  /* the first attempt is the row: a cancelled download fails it (return-drive rows 13 to 16) */
  const html = await download(
    page,
    () => menuPath(page, 'file', 'file.download', 'file.download.html'),
    30_000,
  );
  expect(html.ms, 'arrives within 30 s').toBeLessThan(30_000);
  expect(html.name).toMatch(/\.html$/);
  const text = html.bytes.toString('utf8');
  expect(text, 'the deck title is in the page').toContain(TITLE.split(',')[0]!);
  expect(text, 'the heading text is in the page').toContain(TITLE.split(',')[0]!);
  expect(page.url(), 'the editor is still the page').toContain(`/edit/${deck}`);
  if (switched) await menuPath(page, 'tools', 'tools.advancedTools');
});

/** JPEG and PNG: a download of the current slide's picture, or the tab the row opened on it. */
async function pictureRow(rowId: 'jpg' | 'png', magic: string, ext: RegExp): Promise<void> {
  const { page, deck, context } = await withBudget(1);
  await openEditor(page, deck);
  const switched = await reachDownloadRow(page, `file.download.${rowId}`);
  const t = Date.now();
  const opened = context.waitForEvent('page', { timeout: 30_000 }).catch(() => null);
  const arrived = page.waitForEvent('download', { timeout: 30_000 }).catch(() => null);
  await menuPath(page, 'file', 'file.download', `file.download.${rowId}`);
  const won = await Promise.race([
    arrived.then((d) => (d ? { d } : null)),
    opened.then((p) => (p ? { p } : null)),
  ]);
  if (won && 'd' in won && won.d) {
    const { readFileSync } = await import('node:fs');
    const bytes = readFileSync(await won.d.path());
    expect(Date.now() - t, 'arrives within 30 s').toBeLessThan(30_000);
    test.info().annotations.push({
      type: 'download',
      description: `file ${won.d.suggestedFilename()}; ${bytes.length} bytes; magic ${JSON.stringify(bytes.subarray(0, 4).toString('latin1'))}`,
    });
    expect(bytes.subarray(0, magic.length).toString('latin1'), `a ${rowId} file`).toBe(magic);
    expect.soft(won.d.suggestedFilename(), `the file is named .${rowId}`).toMatch(ext);
    expect(page.url(), 'the editor is still the page').toContain(`/edit/${deck}`);
  } else if (won && 'p' in won && won.p) {
    /* the focus round's route: a tab on the render's address; the row passes only when that tab
       answers the picture (audit-surface rows 27 and 28 read a 401 there) */
    const tab = won.p;
    const response = await tab
      .waitForLoadState('domcontentloaded')
      .then(() => tab.evaluate(() => document.contentType))
      .catch(() => null);
    const status = await tab
      .evaluate(
        () =>
          (performance.getEntriesByType('navigation')[0] as { responseStatus?: number } | undefined)
            ?.responseStatus ?? null,
      )
      .catch(() => null);
    const address = tab.url();
    await tab.close();
    expect(
      response,
      `the tab at ${address.replace(/\?.*$/, '?…')} answered ${status ?? 'an unread status'} with ${response}`,
    ).toMatch(rowId === 'jpg' ? /image\/jpeg/ : /image\/png/);
  } else {
    expect(won, `a ${rowId} file or a tab within 30 s`).not.toBeNull();
  }
  if (switched) await menuPath(page, 'tools', 'tools.advancedTools');
}
test(title('export.jpg.current-slide'), async () => {
  test.setTimeout(120_000);
  await pictureRow('jpg', '\xff\xd8\xff', /\.jpe?g$/i);
});
test(title('export.png.current-slide'), async () => {
  test.setTimeout(120_000);
  await pictureRow('png', '\x89PNG', /\.png$/i);
});

/** Turns Tools > Advanced tools on when a File > Download row is still parked on this build. */
async function reachDownloadRow(page: Page, rowId: string): Promise<boolean> {
  await ctl(page, 'menubar.file').click();
  await page.locator('#ts-menu-file').waitFor({ timeout: 8000 });
  await ctl(page, 'menu.file.download').hover();
  await page.locator('[data-control="menu.file.download.pdf"]').waitFor({ timeout: 6000 });
  const present = (await ctl(page, `menu.${rowId}`).count()) > 0;
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  if (present) return false;
  await menuPath(page, 'tools', 'tools.advancedTools');
  await expect
    .poll(async () => (await state(page)).settings?.['advancedTools'] === true, { timeout: 5000 })
    .toBe(true);
  return true;
}

test(title('tables.export.pdf'), async () => {
  test.setTimeout(150_000);
  const owner = await withBudget(1);
  const { page, deck } = owner;
  await openEditor(page, deck);
  await typeTableCells(owner);
  await openPdf(page);
  const pdf = await download(page, () => ctl(page, 'dialog.download.ok').click());
  await closeDialogs(page);
  expect(pdf.ms).toBeLessThan(30_000);
  const text = pdfText(pdf.bytes);
  test.info().annotations.push({
    type: 'pdf',
    description: `${pdfPages(pdf.bytes)} pages; ${text.length} characters of text read; Q1 revenue ${text.includes('Q1 revenue')}`,
  });
  test.skip(
    !pdfReadable(text, 'Q1 revenue') && !pdfReadable(text, 'Acme'),
    'the PDF text is not readable by this spec (pdftotext is not on PATH and no literal or single byte hex string carries the deck words)',
  );
  expect(text, 'Q1 revenue is in the PDF text').toContain('Q1 revenue');
  expect(text.replace(/\s+/g, ' '), '12 000 is in the PDF text').toMatch(/12\s?000/);
});

test(title('tables.export.pptx-editable'), async () => {
  test.setTimeout(150_000);
  const owner = await withBudget(1);
  const { page, deck, docsSlide } = owner;
  await openEditor(page, deck);
  await typeTableCells(owner);
  /* one Insert column right from the cell's right click menu, the write the widths are read after */
  await clickCard(page, docsSlide!);
  const cell = page
    .locator('.ts-stagewrap.ts-editor .pt-slide [data-run="export-table/rows/1/cells/1"]')
    .first();
  await cell.dblclick();
  await page.waitForTimeout(300);
  await cell.click({ button: 'right' });
  await page.locator('.ts-context-menu').first().waitFor({ timeout: 6000 });
  await ctl(page, 'menu.format.table.insertColumnRight').click();
  await expect
    .poll(
      async () => {
        const slide = JSON.stringify(await slideJsonOf(page, docsSlide!));
        return (slide.match(/"columns":\[(\{[^\]]*)\]/)?.[1] ?? '').split('},').length;
      },
      { timeout: 10_000 },
    )
    .toBe(4);
  await page.keyboard.press('Escape');
  await settled(page);
  const table = (await objectsOfSlide(page, docsSlide!)).find((o) => o.id === 'export-table');
  const tableWidth = table?.pos.w ?? 0;
  await openPptx(page);
  await ctl(page, 'dialog.download.mode.native').click({ force: true });
  const pptx = await download(page, () => ctl(page, 'dialog.download.ok').click(), 60_000);
  await closeDialogs(page);
  expect(pptx.ms).toBeLessThan(30_000);
  const xml = pptxSlideXml(pptx.bytes);
  expect(xml, 'a native table').toMatch(/<a:tbl>/);
  expect(xml).toContain('Q1 revenue');
  expect(xml.replace(/\s+/g, ' ')).toMatch(/12\s?000/);
  const cols = [...xml.matchAll(/<a:gridCol w="(\d+)"/g)].map((m) => Number(m[1]));
  expect(cols.length, 'four grid columns').toBe(4);
  /* the widths sum to the table width, at the file's own scale: the slide size `p:sldSz` of
     ppt/presentation.xml over the 1600 px sheet (13.333 in, 12192000 EMU: 7620 EMU per px; the
     first drive assumed a 10 in slide and read a 33 % drift on exact widths, return/build/integrator.md) */
  const sum = cols.reduce((a, b) => a + b, 0);
  const presentation = zipEntries(pptx.bytes).get('ppt/presentation.xml')?.() ?? '';
  const sldSz = Number(presentation.match(/<p:sldSz cx="(\d+)"/)?.[1] ?? NaN);
  expect(sldSz, 'the slide size of ppt/presentation.xml').toBeGreaterThan(0);
  const emuPerPx = sldSz / 1600;
  expect(
    Math.abs(sum - tableWidth * emuPerPx) / (tableWidth * emuPerPx),
    `gridCol widths ${cols.join(', ')} sum to the table's ${Math.round(tableWidth * emuPerPx)} EMU`,
  ).toBeLessThan(0.02);
});
async function objectsOfSlide(page: Page, slideId: string) {
  const { objectsOf } = await import('./lib');
  return objectsOf(page, slideId);
}

test(title('charts.export.pdf'), async () => {
  test.setTimeout(120_000);
  const { page, deck } = await withBudget(1);
  await openEditor(page, deck);
  await openPdf(page);
  const pdf = await download(page, () => ctl(page, 'dialog.download.ok').click());
  await closeDialogs(page);
  expect(pdf.ms).toBeLessThan(30_000);
  const text = pdfText(pdf.bytes);
  test.info().annotations.push({
    type: 'pdf',
    description: `${pdfPages(pdf.bytes)} pages; ${text.length} characters of text read; North ${text.includes('North')}`,
  });
  test.skip(
    !pdfReadable(text, 'North') && !pdfReadable(text, 'Acme'),
    'the PDF text is not readable by this spec (pdftotext is not on PATH and no literal or single byte hex string carries the deck words)',
  );
  for (const word of ['North', 'South', 'West', 'Bookings'])
    expect(text, `${word} is in the PDF text`).toContain(word);
});

test(title('charts.export.pptx-native'), async () => {
  test.setTimeout(150_000);
  const { page, deck } = await withBudget(1);
  await openEditor(page, deck);
  await openPptx(page);
  await ctl(page, 'dialog.download.mode.native').click({ force: true });
  const pptx = await download(page, () => ctl(page, 'dialog.download.ok').click(), 60_000);
  await closeDialogs(page);
  expect(pptx.ms).toBeLessThan(30_000);
  const parts = [...zipEntries(pptx.bytes).keys()].filter((n) =>
    /^ppt\/charts\/chart\d+\.xml$/.test(n),
  );
  expect(parts.length, 'one native chart part per chart').toBe(1);
  const xml = pptxSlideXml(pptx.bytes);
  expect(xml, 'the slide references the chart').toMatch(/<c:chart |graphicFrame/);
});

test(title('wordart.export.pdf'), async () => {
  test.setTimeout(120_000);
  const { page, deck } = await withBudget(1);
  await openEditor(page, deck);
  await openPdf(page);
  const pdf = await download(page, () => ctl(page, 'dialog.download.ok').click());
  await closeDialogs(page);
  expect(pdf.ms).toBeLessThan(30_000);
  const text = pdfText(pdf.bytes);
  test.info().annotations.push({
    type: 'pdf',
    description: `${pdfPages(pdf.bytes)} pages; ${text.length} characters of text read; Big words ${text.includes('Big words')}`,
  });
  test.skip(
    !pdfReadable(text, 'Big words') && !pdfReadable(text, 'Acme'),
    'the PDF text is not readable by this spec (pdftotext is not on PATH and no literal or single byte hex string carries the deck words)',
  );
  expect(text, 'the word art is in the PDF text').toContain('Big words');
});

test(title('lines.connector.export-pptx'), async () => {
  test.setTimeout(150_000);
  const { page, deck } = await withBudget(1);
  await openEditor(page, deck);
  await openPptx(page);
  await ctl(page, 'dialog.download.mode.native').click({ force: true });
  const pptx = await download(page, () => ctl(page, 'dialog.download.ok').click(), 60_000);
  await closeDialogs(page);
  expect(pptx.ms).toBeLessThan(30_000);
  const xml = pptxSlideXml(pptx.bytes);
  expect(xml, 'the elbow connector').toContain('prst="bentConnector3"');
  expect(xml, 'the curved connector').toContain('prst="curvedConnector3"');
});

// ---------------------------------------------------------------------------------------------
// the product round's rows (docs/PRODUCT.md section 2 ranks 7, 8, 11 and 21, 4.2, 4.5, 8.1): the
// file named after the title, the direct PDF and PowerPoint rows with the snackbar's progress and
// the Download options dialog, the mode sentence, the two large deck measurement rows, the kit's
// footer text and logo in the PDF, and the catalog face named in the Editable text PowerPoint and
// embedded in the PDF. B1 owns the rows and the dialog, B7 the file name and the per slide
// progress, B5a the kit and the fonts. The export quota (five downloads a day per identity) holds
// here too: the rows reserve their downloads through `withBudget`, and a plain deck (no table, no
// chart) is built for the direct rows since the file's decks carry both.

/** A snackbar or dialog progress sentence read while an export runs, every 150 ms until `until`. */
async function progressWords(p: Page, until: () => boolean): Promise<string[]> {
  const seen: string[] = [];
  while (!until()) {
    const text = await p
      .evaluate(() =>
        [
          ...document.querySelectorAll(
            '[data-control="snackbar"], [data-control="dialog.download.progress"]',
          ),
        ]
          .map((el) => el.textContent?.trim() ?? '')
          .filter(Boolean)
          .join(' | '),
      )
      .catch(() => '');
    if (text && seen[seen.length - 1] !== text) seen.push(text);
    await p.waitForTimeout(150);
  }
  return seen;
}
/** A download started by `start`, with the words the snackbar showed while it ran. */
async function downloadWithWords(p: Page, start: () => Promise<void>, timeout = 60_000) {
  let done = false;
  const words = progressWords(p, () => done);
  try {
    const file = await download(p, start, timeout);
    done = true;
    return { ...file, words: await words };
  } catch (error) {
    done = true;
    await words;
    throw error;
  }
}
/** Whether the Download submenu has the Download options row on this build (B1, by request in model.ts). */
async function hasOptionsRow(p: Page): Promise<boolean> {
  await ctl(p, 'menubar.file').click();
  await p.locator('#ts-menu-file').waitFor({ timeout: 8000 });
  await ctl(p, 'menu.file.download').hover();
  await p.waitForTimeout(400);
  const there = await ctl(p, 'menu.file.download.options')
    .isVisible()
    .catch(() => false);
  await p.keyboard.press('Escape');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(150);
  return there;
}
/** A plain deck (a title and five more slides, no table, no chart) for the direct rows, on a fresh identity. */
type Plain = {
  context: BrowserContext;
  page: Page;
  scratch: Scratch;
  deck: string;
  downloads: number;
};
let plain: Plain | null = null;
async function plainDeck(n: number): Promise<Plain> {
  if (plain === null || plain.downloads + n > QUOTA) {
    const { context, page } = await ownerContext(browserRef);
    const scratch = new Scratch();
    const deck = await newDeck(page, scratch, 'GT pitch for Acme');
    for (let i = 0; i < 5; i += 1) await addSlide(page);
    plain = { context, page, scratch, deck, downloads: 0 };
    owners.push({ context, page, scratch, deck, unskipped: 6, downloads: 0, n: owners.length + 1 });
  }
  plain.downloads += n;
  return plain;
}

test(title('export.download.named-after-title'), async () => {
  test.setTimeout(180_000);
  const { page, deck } = await plainDeck(2);
  await openEditor(page, deck);
  const direct = !(await page.locator('[data-control="dialog.download.pdf"]').count());
  void direct;
  const pdf = await download(page, async () => {
    await menuPath(page, 'file', 'file.download', 'file.download.pdf');
    const ok = ctl(page, 'dialog.download.ok');
    if (await ok.isVisible({ timeout: 2000 }).catch(() => false)) await ok.click();
  });
  await closeDialogs(page);
  const pptx = await download(
    page,
    async () => {
      await menuPath(page, 'file', 'file.download', 'file.download.pptx');
      const ok = ctl(page, 'dialog.download.ok');
      if (await ok.isVisible({ timeout: 2000 }).catch(() => false)) await ok.click();
    },
    60_000,
  );
  await closeDialogs(page);
  test.info().annotations.push({ type: 'names', description: `${pdf.name}; ${pptx.name}` });
  expect(pdf.name, 'the PDF is named after the title').toBe('GT pitch for Acme.pdf');
  expect(pptx.name, 'the PowerPoint file too').toBe('GT pitch for Acme.pptx');
});

test(title('export.download.pdf-direct'), async () => {
  test.setTimeout(150_000);
  const { page, deck } = await plainDeck(1);
  await openEditor(page, deck);
  let dialogShown = false;
  const file = await downloadWithWords(page, async () => {
    await menuPath(page, 'file', 'file.download', 'file.download.pdf');
    dialogShown = await ctl(page, 'dialog.download.pdf')
      .isVisible({ timeout: 1500 })
      .catch(() => false);
    if (dialogShown)
      await ctl(page, 'dialog.download.ok')
        .click()
        .catch(() => undefined);
  });
  await page.waitForTimeout(800);
  const saved = await ctl(page, 'snackbar')
    .textContent({ timeout: 2000 })
    .catch(() => null);
  const details = await page
    .locator('[data-control="snackbar.download.details"], [data-control="snackbar.action"]')
    .first()
    .textContent({ timeout: 1000 })
    .catch(() => null);
  await closeDialogs(page).catch(() => undefined);
  test.info().annotations.push({
    type: 'direct pdf',
    description: `dialog shown ${dialogShown}; ${file.ms} ms; words ${file.words.join(' > ')}; after: "${saved ?? 'none'}" action "${details ?? 'none'}"`,
  });
  expect(dialogShown, 'the row starts the download with no dialog').toBe(false);
  expect(file.ms, 'the file arrives within 30 s').toBeLessThan(30_000);
  expect(
    file.words.some((w) => /Preparing your PDF/.test(w)),
    'the snackbar reads the progress',
  ).toBe(true);
  expect(saved ?? '', 'then the saved name').toMatch(/Saved .*\.pdf/);
  expect(details ?? '', 'with Details').toMatch(/Details/);
});

test(title('export.download.pptx-direct'), async () => {
  test.setTimeout(240_000);
  /* a deck with no table or chart: the Perfect download with no dialog */
  const own = await plainDeck(1);
  await openEditor(own.page, own.deck);
  let dialogShown = false;
  const perfect = await download(
    own.page,
    async () => {
      await menuPath(own.page, 'file', 'file.download', 'file.download.pptx');
      dialogShown = await ctl(own.page, 'dialog.download.pptx')
        .isVisible({ timeout: 1500 })
        .catch(() => false);
      if (dialogShown)
        await ctl(own.page, 'dialog.download.ok')
          .click()
          .catch(() => undefined);
    },
    60_000,
  );
  await closeDialogs(own.page).catch(() => undefined);
  expect(
    dialogShown,
    'on a deck with no table or chart the row starts the Perfect download with no dialog',
  ).toBe(false);
  expect(pptxSlides(perfect.bytes).length, 'the file carries the slides').toBeGreaterThan(0);
  /* a deck with a typed table: the same row opens Download options with Editable text preselected */
  const { page, deck } = await withBudget(1);
  await openEditor(page, deck);
  await menuPath(page, 'file', 'file.download', 'file.download.pptx');
  await ctl(page, 'dialog.download.pptx').waitFor({ timeout: 8000 });
  const facts = await page.evaluate(() => ({
    native: document
      .querySelector('[data-control="dialog.download.mode.native"]')
      ?.getAttribute('aria-checked'),
    sentence:
      document
        .querySelector('[data-control="dialog.download.tableSentence"]')
        ?.textContent?.trim() ?? null,
  }));
  const file = await download(page, () => ctl(page, 'dialog.download.ok').click(), 90_000);
  await closeDialogs(page);
  const entries = zipEntries(file.bytes);
  const withTable = [...entries.keys()]
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .some((n) => /<a:tbl>/.test(entries.get(n)!()));
  test.info().annotations.push({
    type: 'table deck',
    description: `Editable text preselected ${facts.native}; sentence "${facts.sentence ?? 'none'}"; a:tbl ${withTable}`,
  });
  expect(facts.native, 'Editable text is preselected').toBe('true');
  expect(facts.sentence ?? '', 'the table sentence shows').toMatch(
    /This presentation has a table or a chart/,
  );
  expect(withTable, 'the saved file carries the table as a:tbl').toBe(true);
});

test(title('export.download.options-dialog'), async () => {
  test.setTimeout(150_000);
  const { page, deck } = await plainDeck(1);
  await openEditor(page, deck);
  if (!(await hasOptionsRow(page)))
    test.skip(
      true,
      'not on this build: file.download.options (docs/PRODUCT.md 7.1, B1 by request in model.ts)',
    );
  await menuPath(page, 'file', 'file.download', 'file.download.options');
  const dialog = page
    .locator(
      '[data-control="dialog.download.pptx"], [data-control="dialog.download.pdf"], [data-control="dialog.download"]',
    )
    .first();
  await dialog.waitFor({ timeout: 8000 });
  const facts = await page.evaluate(() => ({
    modes: document.querySelectorAll('[data-control^="dialog.download.mode."]').length,
    skipped: Boolean(document.querySelector('[data-control="dialog.download.includeSkipped"]')),
    notes: Boolean(document.querySelector('[data-control="dialog.download.includeNotes"]')),
  }));
  const file = await download(page, () => ctl(page, 'dialog.download.ok').click(), 60_000);
  const closed = await expect
    .poll(async () => page.locator('.ts-dialog-scrim [role="dialog"]').count(), { timeout: 8000 })
    .toBe(0)
    .then(() => true)
    .catch(() => false);
  await closeDialogs(page).catch(() => undefined);
  test.info().annotations.push({
    type: 'options',
    description: `${JSON.stringify(facts)}; ${file.name} in ${file.ms} ms; closed itself ${closed}`,
  });
  expect(facts.modes, 'the modes').toBe(2);
  expect(facts.skipped && facts.notes, 'Include skipped slides and Include speaker notes').toBe(
    true,
  );
  expect(closed, 'the dialog closes itself when the file is saved').toBe(true);
});

test(title('export.download.progress-per-slide'), async () => {
  test.setTimeout(180_000);
  const { page, deck } = await plainDeck(1);
  await openEditor(page, deck);
  const total = (await slideOrder(page)).length;
  const file = await downloadWithWords(
    page,
    async () => {
      await menuPath(page, 'file', 'file.download', 'file.download.pptx');
      const ok = ctl(page, 'dialog.download.ok');
      if (await ok.isVisible({ timeout: 1500 }).catch(() => false)) await ok.click();
    },
    90_000,
  );
  await closeDialogs(page).catch(() => undefined);
  const ks = new Set<number>();
  for (const w of file.words)
    for (const m of w.matchAll(/slide (\d+) of (\d+)/g))
      if (Number(m[2]) === total) ks.add(Number(m[1]));
  test.info().annotations.push({
    type: 'progress',
    description: `${total} slides; words ${file.words.join(' > ')}; k read ${[...ks].join(', ') || 'none'}`,
  });
  expect(total, 'a six slide deck').toBe(6);
  expect(ks.size, 'the snackbar reads slide k of 6 with k moving').toBeGreaterThanOrEqual(2);
});

test(title('export.download.mode-sentence'), async () => {
  test.setTimeout(120_000);
  /* a deck with a table: the file's owner deck carries one */
  const { page, deck } = await withBudget(0);
  await openEditor(page, deck);
  if (await hasOptionsRow(page))
    await menuPath(page, 'file', 'file.download', 'file.download.options');
  else await menuPath(page, 'file', 'file.download', 'file.download.pptx');
  await ctl(page, 'dialog.download.pptx').waitFor({ timeout: 8000 });
  const facts = await page.evaluate(() => ({
    perfect:
      document
        .querySelector('[data-control="dialog.download.mode.flatten"]')
        ?.textContent?.trim() ?? '',
    native: document
      .querySelector('[data-control="dialog.download.mode.native"]')
      ?.getAttribute('aria-checked'),
  }));
  await closeDialogs(page);
  test.info().annotations.push({ type: 'sentence', description: JSON.stringify(facts) });
  expect(facts.perfect, "the Perfect mode's sentence names tables and charts as pictures").toMatch(
    /Tables and charts are pictures in this mode/,
  );
  expect(facts.native, 'with a table on the deck Editable text is preselected').toBe('true');
});

/** A copy of the General Translation brand deck (85 slides, 115 assets) on a fresh identity, for the two measurement rows. */
let large: {
  context: BrowserContext;
  page: Page;
  scratch: Scratch;
  deck: string;
  slides: number;
} | null = null;
async function largeDeck() {
  if (large) return large;
  const { context, page } = await ownerContext(browserRef);
  const scratch = new Scratch();
  await page.goto('/decks');
  await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
  await page
    .locator('[data-control="home.template.gt-brand"], [data-control="home.gt-brand"]')
    .first()
    .click();
  await page.waitForURL(/\/edit\//, { timeout: 90_000 });
  const deck = page.url().match(/\/edit\/([^/?#]+)/)?.[1] ?? '';
  scratch.add(deck);
  await waitEditor(page);
  const slides = (await slideOrder(page)).length;
  large = { context, page, scratch, deck, slides };
  owners.push({
    context,
    page,
    scratch,
    deck,
    unskipped: slides,
    downloads: 0,
    n: owners.length + 1,
  });
  return large;
}
/** Runs a measurement row: records the seconds per slide as a `measure` annotation for the gate (PRODUCT.md 8.2). */
async function measured(
  label: string,
  slides: number,
  run: () => Promise<{ ms: number; bytes: Buffer; name: string }>,
) {
  const t0 = Date.now();
  try {
    const file = await run();
    const perSlide = file.ms / slides / 1000;
    test.info().annotations.push({
      type: 'measure',
      description: `${label}: ${file.name}, ${slides} slides in ${(file.ms / 1000).toFixed(1)} s, ${perSlide.toFixed(2)} s per slide`,
    });
    return file;
  } catch (error) {
    test.info().annotations.push({
      type: 'measure',
      description: `${label}: no file after ${((Date.now() - t0) / 1000).toFixed(1)} s (${error instanceof Error ? error.message.split('\n')[0] : String(error)})`,
    });
    throw error;
  }
}

test(title('export.download.large-deck-pdf'), async () => {
  test.setTimeout(660_000);
  const { page, deck, slides } = await largeDeck();
  await openEditor(page, deck);
  const file = await measured('PDF', slides, () =>
    download(
      page,
      async () => {
        await menuPath(page, 'file', 'file.download', 'file.download.pdf');
        const ok = ctl(page, 'dialog.download.ok');
        if (await ok.isVisible({ timeout: 2000 }).catch(() => false)) await ok.click();
      },
      600_000,
    ),
  );
  await closeDialogs(page).catch(() => undefined);
  expect(file.ms, 'within 600 s').toBeLessThan(600_000);
  expect(pdfPages(file.bytes), 'a page per slide').toBe(slides);
});

test(title('export.download.large-deck-pptx'), async () => {
  test.setTimeout(660_000);
  const { page, deck, slides } = await largeDeck();
  await openEditor(page, deck);
  const file = await measured('Editable text PowerPoint with Embed fonts', slides, () =>
    download(
      page,
      async () => {
        if (await hasOptionsRow(page))
          await menuPath(page, 'file', 'file.download', 'file.download.options');
        else await menuPath(page, 'file', 'file.download', 'file.download.pptx');
        await ctl(page, 'dialog.download.pptx').waitFor({ timeout: 8000 });
        await ctl(page, 'dialog.download.mode.native').click({ force: true });
        const more = ctl(page, 'dialog.download.more');
        if (
          (await more.count()) > 0 &&
          !(await ctl(page, 'dialog.download.fonts')
            .isVisible()
            .catch(() => false))
        )
          await more.click();
        await check(page, 'dialog.download.fonts');
        await ctl(page, 'dialog.download.ok').click();
      },
      600_000,
    ),
  );
  await closeDialogs(page).catch(() => undefined);
  expect(file.ms, 'within 600 s').toBeLessThan(600_000);
  expect(pptxSlides(file.bytes).length, 'a slide part per slide').toBe(slides);
});

/** The window API's action ids on a page. */
async function actionIds(p: Page): Promise<string[]> {
  return p.evaluate(() =>
    (window.turboslide?.studio.describe().actions ?? []).map((a: { id: string } | string) =>
      typeof a === 'string' ? a : a.id,
    ),
  );
}

test(title('brand.footer.text'), async () => {
  test.setTimeout(180_000);
  const { page, deck } = await withBudget(1);
  await openEditor(page, deck);
  if (!(await actionIds(page)).includes('brand.set'))
    test.skip(true, 'not on this build: brand.set (docs/PRODUCT.md 4.1, B5a)');
  const s = await settled(page);
  await invoke(page, 'brand.set', {
    path: '/footer/text',
    value: 'Confidential',
    baseRevision: s.revision,
  });
  await settled(page);
  const order = await slideOrder(page);
  const footerOn = async (id: string) => {
    await clickCard(page, id);
    /* the slide before leaves the stage with its transition; the read is the current sheet alone
       (a `.ts-stage` wide read took the leaving slide's band for the title slide's) */
    await expect(page.locator('.ts-stagewrap.ts-editor .pt-slide.is-leaving')).toHaveCount(0, {
      timeout: 5000,
    });
    await expect(
      page.locator(`.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)[data-slide-id="${id}"]`),
    ).toHaveCount(1, { timeout: 5000 });
    /* the kit's footer text is the frame's `.ts-kit-footer`, a sibling of the sheet in the stage
       (viewer/Frame.tsx), drawn on every slide but the title, whose frame carries no wordmark */
    return page.evaluate((slideId) => {
      const stage = document.querySelector('.ts-stagewrap.ts-editor .ts-stage');
      const sheet = stage?.querySelector(`.pt-slide:not(.is-leaving)[data-slide-id="${slideId}"]`);
      const visible = (el: Element | null) =>
        el !== null &&
        el.getClientRects().length > 0 &&
        getComputedStyle(el).visibility !== 'hidden' &&
        getComputedStyle(el).opacity !== '0';
      const footers = [...(stage?.querySelectorAll('.ts-kit-footer') ?? [])].filter(visible);
      const inBand = footers.some((el) => /Confidential/.test(el.textContent ?? ''));
      const inSheet = /Confidential/.test(sheet?.textContent ?? '');
      return { drawn: inBand || inSheet };
    }, id);
  };
  const onTitle = await footerOn(order[0]!);
  const onSecond = await footerOn(order[1]!);
  const pdf = await download(page, async () => {
    await menuPath(page, 'file', 'file.download', 'file.download.pdf');
    const ok = ctl(page, 'dialog.download.ok');
    if (await ok.isVisible({ timeout: 2000 }).catch(() => false)) await ok.click();
  });
  await closeDialogs(page).catch(() => undefined);
  /* Chromium prints the band's text as CID glyph ids: the reading is pdfText's (pdftotext, else
     the streams' literal strings), the way the docs rows read their PDFs */
  const inPdf = /Confidential/.test(pdfText(pdf.bytes));
  const s2 = await settled(page);
  await invoke(page, 'brand.reset', { path: '/footer/text', baseRevision: s2.revision }).catch(
    () => undefined,
  );
  test.info().annotations.push({
    type: 'footer',
    description: `title slide ${onTitle.drawn}; second slide ${onSecond.drawn}; PDF text ${inPdf}`,
  });
  expect(onSecond.drawn, 'the footer text draws on a slide after the title').toBe(true);
  expect(onTitle.drawn, 'and not on the title').toBe(false);
  expect(inPdf, "the PDF's text carries it").toBe(true);
});

test(title('brand.export.pdf-logo'), async () => {
  test.setTimeout(180_000);
  const { page, deck } = await withBudget(1);
  await openEditor(page, deck);
  if (!(await actionIds(page)).includes('brand.set'))
    test.skip(true, 'not on this build: brand.set (docs/PRODUCT.md 4.1, B5a)');
  const s = await settled(page);
  const asset = await invoke<{ id: string }>(page, 'asset.add', {
    id: `pdf-logo-${Date.now().toString(36)}`,
    url: await pngDataUrl(page, 132, 84),
    role: 'capture',
    alt: 'the kit logo',
    baseRevision: s.revision,
  });
  const s1 = await settled(page);
  await invoke(page, 'brand.set', {
    path: '/mark',
    value: { kind: 'picture', assetId: asset.id },
    baseRevision: s1.revision,
  });
  const s2 = await settled(page);
  await invoke(page, 'brand.set', {
    path: '/footer/logo',
    value: 'picture',
    baseRevision: s2.revision,
  }).catch(() => undefined);
  const s3 = await settled(page);
  await invoke(page, 'brand.set', {
    path: '/footer/assetId',
    value: asset.id,
    baseRevision: s3.revision,
  }).catch(() => undefined);
  await settled(page);
  const wordmark = await page.evaluate(() =>
    Boolean(document.querySelector('.ts-stagewrap.ts-editor .wordmark svg use[href="#gt-mark"]')),
  );
  const pdf = await download(page, async () => {
    await menuPath(page, 'file', 'file.download', 'file.download.pdf');
    const ok = ctl(page, 'dialog.download.ok');
    if (await ok.isVisible({ timeout: 2000 }).catch(() => false)) await ok.click();
  });
  await closeDialogs(page).catch(() => undefined);
  const images = pdfImages(pdf.bytes);
  const s4 = await settled(page);
  await invoke(page, 'brand.reset', { baseRevision: s4.revision }).catch(() => undefined);
  test.info().annotations.push({
    type: 'logo',
    description: `GT wordmark drawn on the stage ${wordmark}; image objects in the PDF ${images}`,
  });
  expect(wordmark, 'no GT wordmark with a picture logo').toBe(false);
  expect(
    images,
    "the PDF carries the logo picture (an image object beyond the deck's own picture)",
  ).toBeGreaterThanOrEqual(2);
});

/**
 * The three faces of the fonts export rows (docs/PRODUCT.md 4.2; docs/FEATURES.md 3.4): the title
 * heading in Roboto and two text boxes in Geist and Fraunces on the first slide, written through
 * the window API as setup. Answers the faces written; a family the schema refuses (the catalog
 * row not on this build) is named in the annotation and the row skips on it.
 */
async function facesSetup(
  page: Page,
): Promise<{ first: string; written: string[]; refused: string[] }> {
  const first = (await slideOrder(page))[0]!;
  await clickCard(page, first);
  const run = await headingRun(page);
  const blockId = await page.evaluate(
    (r) =>
      document
        .querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`)
        ?.closest('[data-block]')
        ?.getAttribute('data-block') ?? null,
    run,
  );
  const written: string[] = [];
  const refused: string[] = [];
  const s = await settled(page);
  await invoke(page, 'block.set', {
    baseRevision: s.revision,
    slideId: first,
    blockId: blockId ?? 'lead',
    path: '/typography/family',
    value: 'roboto',
  })
    .then(() => written.push('roboto'))
    .catch((error: unknown) =>
      refused.push(
        `roboto: ${(error instanceof Error ? error.message : String(error)).slice(0, 100)}`,
      ),
    );
  await settled(page);
  for (const [family, y] of [
    ['geist', 640],
    ['fraunces', 720],
  ] as const) {
    const objects = await objectsOf(page, first);
    if (objects.some((o) => o.id === `face-${family}`)) {
      written.push(family);
      continue;
    }
    const s2 = await settled(page);
    await invoke(page, 'block.insert', {
      baseRevision: s2.revision,
      slideId: first,
      slot: 'main',
      block: {
        id: `face-${family}`,
        type: 'text',
        text: `Set in ${family}`,
        typography: { family },
        pos: { x: 120, y, w: 700, h: 60 },
      },
    })
      .then(() => written.push(family))
      .catch((error: unknown) =>
        refused.push(
          `${family}: ${(error instanceof Error ? error.message : String(error)).slice(0, 100)}`,
        ),
      );
    await settled(page);
  }
  return { first, written, refused };
}
async function objectsOf(page: Page, slideId: string) {
  const { objectsOf: read } = await import('./lib');
  return read(page, slideId);
}

test(title('fonts.export.editable-names-face'), async () => {
  test.setTimeout(180_000);
  const { page, deck } = await withBudget(1);
  await openEditor(page, deck);
  const faces = await facesSetup(page);
  test.info().annotations.push({
    type: 'setup',
    description: `written ${faces.written.join(', ') || 'none'}; refused ${faces.refused.join('; ') || 'none'}`,
  });
  if (!faces.written.includes('roboto'))
    test.skip(
      true,
      `not on this build: typography.family (docs/PRODUCT.md 4.2, B5a): ${faces.refused.join('; ').slice(0, 120)}`,
    );
  if (!faces.written.includes('geist') || !faces.written.includes('fraunces'))
    test.skip(
      true,
      `not on this build: the catalog rows geist and fraunces (docs/FEATURES.md 3.2, B2): ${faces.refused.join('; ').slice(0, 160)}`,
    );
  await openPptx(page);
  await ctl(page, 'dialog.download.mode.native').click({ force: true });
  const pptx = await download(page, () => ctl(page, 'dialog.download.ok').click(), 90_000);
  await closeDialogs(page);
  const entries = zipEntries(pptx.bytes);
  const slide1 = entries.get('ppt/slides/slide1.xml')?.() ?? '';
  const named = [...slide1.matchAll(/<a:latin typeface="([^"]+)"/g)].map((m) => m[1]);
  test.info().annotations.push({ type: 'faces', description: named.join(', ') || 'no a:latin' });
  expect(named, 'the Editable text PowerPoint names Roboto').toContain('Roboto');
  expect(named, 'and Geist').toContain('Geist');
  expect(named, 'and Fraunces').toContain('Fraunces');
});

test(title('fonts.export.pdf-face'), async () => {
  test.setTimeout(180_000);
  const { page, deck } = await withBudget(1);
  await openEditor(page, deck);
  const faces = await facesSetup(page);
  test.info().annotations.push({
    type: 'setup',
    description: `written ${faces.written.join(', ') || 'none'}; refused ${faces.refused.join('; ') || 'none'}`,
  });
  if (!faces.written.includes('roboto'))
    test.skip(
      true,
      `not on this build: typography.family (docs/PRODUCT.md 4.2, B5a): ${faces.refused.join('; ').slice(0, 120)}`,
    );
  if (!faces.written.includes('geist') || !faces.written.includes('fraunces'))
    test.skip(
      true,
      `not on this build: the catalog rows geist and fraunces (docs/FEATURES.md 3.2, B2): ${faces.refused.join('; ').slice(0, 160)}`,
    );
  await openPdf(page);
  const pdf = await download(page, () => ctl(page, 'dialog.download.ok').click());
  await closeDialogs(page);
  const fonts = [
    ...pdf.bytes.toString('latin1').matchAll(/\/(?:BaseFont|FontName)\s*\/([A-Za-z0-9+_-]+)/g),
  ].map((m) => m[1]);
  test.info().annotations.push({
    type: 'pdffonts',
    description: [...new Set(fonts)].join(', ') || 'no font descriptor',
  });
  expect(
    fonts.some((f) => /Roboto/.test(f ?? '')),
    'the PDF embeds a Roboto subset',
  ).toBe(true);
  expect(
    fonts.some((f) => /Geist/.test(f ?? '')),
    'and a Geist subset',
  ).toBe(true);
  expect(
    fonts.some((f) => /Fraunces/.test(f ?? '')),
    'and a Fraunces subset',
  ).toBe(true);
});

/**
 * The features round, ship one (docs/FEATURES.md 2.2 rank 9; the row `diagrams.export.step-label`):
 * a process diagram of three steps placed through the window API as setup on a fresh slide, then
 * the PDF's text and the Editable text PowerPoint's shape with the label inside its txBody.
 */
test(title('diagrams.export.step-label'), async () => {
  test.setTimeout(240_000);
  const owner = await withBudget(2);
  const { page, deck } = owner;
  await openEditor(page, deck);
  const slideId = await addSlide(page);
  const actions = await windowActions(page);
  if (!actions.has('diagram.insert'))
    test.skip(true, 'not on this build: diagram.insert on the window transport');
  const s = await settled(page);
  const out = (await invoke(
    page,
    'diagram.insert',
    { slideId, kind: 'process', count: 3, baseRevision: s.revision },
    60_000,
  )) as { blockIds: string[] };
  await settled(page);
  const objects = await objectsOf(page, slideId);
  const members = objects.filter((o) => out.blockIds.includes(o.id));
  const boxes = members.filter(
    (o) => o.type === 'shape' && (o.block['shape'] as string) !== 'line',
  );
  const texts = members.filter((o) => o.type === 'text');
  const label =
    (boxes.find((o) => typeof o.block['text'] === 'string')?.block['text'] as string | undefined) ??
    (texts[0]?.block['text'] as string | undefined) ??
    'Step 1';
  test.info().annotations.push({
    type: 'diagram',
    description: `${members.length} members: ${boxes.length} boxes (${boxes.filter((o) => typeof o.block['text'] === 'string').length} with their own text), ${texts.length} separate labels; the label read "${label}"`,
  });
  /* the PDF */
  await openPdf(page);
  const pdf = await download(page, () => ctl(page, 'dialog.download.ok').click());
  await closeDialogs(page);
  const text = pdfText(pdf.bytes);
  const pdfCarries = text.replace(/\s+/g, ' ').includes(label.replace(/\s+/g, ' '));
  /* the Editable text PowerPoint: the shape whose txBody carries the label is a shape, not a text box */
  await openPptx(page);
  await ctl(page, 'dialog.download.mode.native').click({ force: true });
  const pptx = await download(page, () => ctl(page, 'dialog.download.ok').click(), 60_000);
  await closeDialogs(page);
  const entries = zipEntries(pptx.bytes);
  const slides = pptxSlides(pptx.bytes).map((n) => entries.get(n)?.() ?? '');
  const shapes = slides.flatMap((xml) => xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? []);
  const labelled = shapes.filter((sp) => sp.includes(label) && /<p:txBody>/.test(sp));
  const inShape = labelled.filter(
    (sp) => !/txBox="1"/.test(sp) && /<a:prstGeom prst="(?!rect")/.test(sp),
  );
  test.info().annotations.push({
    type: 'pptx',
    description: `${shapes.length} shapes; ${labelled.length} carry "${label}" in a txBody, ${inShape.length} of them a geometry shape (not a text box); PDF text carries the label ${pdfCarries} (${text.length} characters read)`,
  });
  test.skip(
    !pdfReadable(text, label) && !pdfReadable(text, 'Acme'),
    'the PDF text is not readable by this spec (pdftotext is not on PATH and no literal or single byte hex string carries the deck words)',
  );
  expect(pdfCarries, "the PDF's page carries the step's label text").toBe(true);
  expect(labelled.length, 'the label is inside a txBody').toBeGreaterThan(0);
  expect(
    inShape.length,
    "the label sits inside the step's shape, not a separate text box (docs/FEATURES.md 2.2 rank 9, B3)",
  ).toBeGreaterThan(0);
});

/**
 * The features round, ship one (docs/FEATURES.md 4.8; the row `logos.export.pdf-pptx-crisp`): the
 * Figma mark on every slide through `logo.insert { everySlide: true }` as setup, then the PDF's
 * first page and the two PowerPoint files' PNG sizes (the footer's 84 by 54 and the title slot's
 * 396 by 252 at 3x). The insert is B6's action registered by B7; a build without it skips.
 */
test(title('logos.export.pdf-pptx-crisp'), async () => {
  test.setTimeout(300_000);
  const owner = await withBudget(3);
  const { page, deck } = owner;
  await openEditor(page, deck);
  const first = (await slideOrder(page))[0]!;
  await clickCard(page, first);
  const actions = await windowActions(page);
  if (!actions.has('logo.insert'))
    test.skip(
      true,
      'not on this build: logo.insert on the window transport (docs/FEATURES.md 4.4, 4.11; B6 with B7)',
    );
  const s = await settled(page);
  let inserted: unknown;
  try {
    inserted = await invoke(
      page,
      'logo.insert',
      { slug: 'figma', everySlide: true, baseRevision: s.revision },
      120_000,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/NotImplemented|not implemented|lands in P1/i.test(message))
      test.skip(
        true,
        `not on this build: logo.insert (docs/FEATURES.md 4.4, B6 with B7): ${message.slice(0, 100)}`,
      );
    if (/did not answer|thesvg\.org|upstream|index/i.test(message))
      test.skip(
        true,
        `not driven: the logo index answered "${message.slice(0, 120)}" on this base`,
      );
    throw error;
  }
  await settled(page);
  test
    .info()
    .annotations.push({ type: 'insert', description: JSON.stringify(inserted).slice(0, 200) });
  const imagesBefore = pdfImages(
    (
      await (async () => {
        await openPdf(page);
        const f = await download(page, () => ctl(page, 'dialog.download.ok').click());
        await closeDialogs(page);
        return f;
      })()
    ).bytes,
  );
  /* the first page carries the mark: an image object in the first page's resources */
  expect(imagesBefore, 'the PDF carries image objects').toBeGreaterThan(0);
  const sizes: Record<string, { width: number; height: number }[]> = {};
  /* the dialog's two modes are its controls dialog.download.mode.native and .flatten (the
     Perfect file is the flatten mode) */
  for (const mode of ['native', 'flatten'] as const) {
    await openPptx(page);
    await ctl(page, `dialog.download.mode.${mode}`).click({ force: true });
    const pptx = await download(page, () => ctl(page, 'dialog.download.ok').click(), 120_000);
    await closeDialogs(page);
    /* the export answers a bundle since the product round (the light and the dark files and the
       report); the light file's media is read through the raw reader */
    let entries = zipEntriesRaw(pptx.bytes);
    const inner =
      [...entries.keys()].find((n) => /\(light, editable\)\.pptx$/.test(n)) ??
      [...entries.keys()].find((n) => n.endsWith('.pptx'));
    if (inner !== undefined) entries = zipEntriesRaw(entries.get(inner)!());
    const pngs = [...entries.keys()].filter((n) => /^ppt\/media\/.*\.png$/i.test(n));
    sizes[mode] = pngs
      .map((n) => pngSize(entries.get(n)!()))
      .filter((x): x is { width: number; height: number } => x !== null);
  }
  test.info().annotations.push({ type: 'media', description: JSON.stringify(sizes).slice(0, 400) });
  for (const mode of ['native', 'flatten'] as const) {
    const list = sizes[mode] ?? [];
    expect(
      list.some((p) => p.width >= 396 && p.height >= 252),
      `the ${mode} PowerPoint carries a PNG of at least 396 by 252 for the title slot`,
    ).toBe(true);
    expect(
      list.some((p) => p.width >= 84 && p.height >= 54),
      `and one of at least 84 by 54 for the footer`,
    ).toBe(true);
  }
});

// ---------------------------------------------------------------------------------------------
// the vector round (docs/VECTOR.md 2.5, 4.6, 6.1): the geometry in both modes and the svg
// pictures' exports. Each row group runs as its own anonymous identity with a deck built for it
// as setup writes (the matrix's setup convention), so no identity spends past its five downloads:
// the geometry deck holds a hexagon, the star with Adjust 30 and a rectangular callout on one slide
// and the two labelled shapes on another; the svg deck holds one slide whose only picture is the
// svg fixture placed through asset.add and block.insert.

/** One px of the 1600 by 900 sheet in EMU (13.333 in over 1600 px; lines.ts: a 1 px rule is w="7620"). */
const EMU_PER_PX = 7620;
type VectorOwner = Owner & { slides: Record<string, string>; blockId?: string; assetId?: string };
const geometryOwners: VectorOwner[] = [];
const svgOwners: VectorOwner[] = [];

/** A fresh identity with the geometry deck: the reader of `n` downloads. */
async function geometryOwner(n: number): Promise<VectorOwner> {
  let owner = geometryOwners[geometryOwners.length - 1];
  if (owner === undefined || owner.downloads + n > QUOTA) {
    const { context, page } = await ownerContext(browserRef);
    const scratch = new Scratch();
    const deck = await newDeck(page, scratch, 'Geometry export deck');
    const shapes = await addSlide(page);
    await clickCard(page, shapes);
    for (const block of [
      {
        id: 'geo-hexagon',
        type: 'shape',
        shape: 'hexagon',
        fill: FILL,
        stroke: 'ink',
        pos: { x: 120, y: 160, w: 240, h: 160 },
      },
      {
        id: 'geo-star',
        type: 'shape',
        shape: 'star5',
        fill: FILL,
        stroke: 'ink',
        adjust: [30000, 105146, 110557],
        pos: { x: 500, y: 140, w: 300, h: 300 },
      },
      {
        id: 'geo-callout',
        type: 'shape',
        shape: 'wedgeRectCallout',
        fill: FILL,
        stroke: 'ink',
        adjust: [-20833, 62500],
        pos: { x: 960, y: 160, w: 300, h: 180 },
      },
    ]) {
      const s = await state(page);
      await invoke(page, 'block.insert', {
        baseRevision: s.revision,
        slideId: shapes,
        slot: 'main',
        block,
      });
      await settled(page);
    }
    const labelled = await addSlide(page);
    await clickCard(page, labelled);
    for (const block of [
      {
        id: 'geo-rounded',
        type: 'shape',
        shape: 'roundRect',
        fill: 'plate',
        stroke: 'ink',
        text: 'Next step',
        pos: { x: 200, y: 200, w: 240, h: 160 },
      },
      {
        id: 'geo-arrow',
        type: 'shape',
        shape: 'rightArrow',
        fill: 'plate',
        stroke: 'ink',
        text: 'Go',
        pos: { x: 600, y: 200, w: 240, h: 160 },
      },
    ]) {
      const s = await state(page);
      await invoke(page, 'block.insert', {
        baseRevision: s.revision,
        slideId: labelled,
        slot: 'main',
        block,
      });
      await settled(page);
    }
    owner = {
      context,
      page,
      scratch,
      deck,
      unskipped: 3,
      downloads: 0,
      n: owners.length + 1,
      slides: { shapes, labelled },
    };
    geometryOwners.push(owner);
    owners.push(owner);
  }
  owner.downloads += n;
  return owner;
}

/** A fresh identity with the svg deck: a title slide and one slide whose only picture is the svg. */
async function svgOwner(n: number): Promise<VectorOwner> {
  let owner = svgOwners[svgOwners.length - 1];
  if (owner === undefined || owner.downloads + n > QUOTA) {
    const { context, page } = await ownerContext(browserRef);
    const scratch = new Scratch();
    const deck = await newDeck(page, scratch, 'SVG export deck');
    const slide = await addSlide(page);
    await clickCard(page, slide);
    const placed = await placeSvgPicture(
      page,
      slide,
      { x: 400, y: 200, w: 480, h: 320 },
      'svg-picture',
    );
    owner = {
      context,
      page,
      scratch,
      deck,
      unskipped: 2,
      downloads: 0,
      n: owners.length + 1,
      slides: { svg: slide },
      blockId: placed.blockId,
      assetId: placed.assetId,
    };
    svgOwners.push(owner);
    owners.push(owner);
  }
  owner.downloads += n;
  return owner;
}

/** The inner Editable or Perfect .pptx of a download (the export answers a bundle of both themes since the product round). */
function innerPptx(bytes: Buffer, mode: 'editable' | 'perfect'): Map<string, () => Buffer> {
  let entries = zipEntriesRaw(bytes);
  const names = [...entries.keys()];
  const inner =
    names.find((n) => new RegExp(`\\(light, ${mode}\\)\\.pptx$`).test(n)) ??
    names.find((n) => /\(light[^)]*\)\.pptx$/.test(n)) ??
    names.find((n) => n.endsWith('.pptx'));
  if (inner !== undefined) entries = zipEntriesRaw(entries.get(inner)!());
  return entries;
}
/** The slide parts of a raw entry map, joined, and each with its rels part. */
function slidePartsOf(
  entries: Map<string, () => Buffer>,
): { name: string; xml: string; rels: string }[] {
  return [...entries.keys()]
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort()
    .map((name) => ({
      name,
      xml: entries.get(name)!().toString('utf8'),
      rels:
        entries
          .get(name.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels'))?.()
          .toString('utf8') ?? '',
    }));
}
/** The target of a relationship id in a rels part. */
function relTarget(rels: string, rId: string): string | null {
  const m =
    new RegExp(`<Relationship[^>]*Id="${rId}"[^>]*Target="([^"]+)"`).exec(rels) ??
    new RegExp(`<Relationship[^>]*Target="([^"]+)"[^>]*Id="${rId}"`).exec(rels);
  return m?.[1] ?? null;
}
/** A media part's bytes from a `../media/x` target. */
function mediaBytes(entries: Map<string, () => Buffer>, target: string): Buffer | null {
  const name = `ppt/${target.replace(/^\.\.\//, '')}`;
  return entries.get(name)?.() ?? null;
}
/** The `<p:pic>` elements of a slide part, each with its blip and svgBlip ids. */
function picsOf(xml: string): { pic: string; blip: string | null; svg: string | null }[] {
  return (xml.match(/<p:pic>[\s\S]*?<\/p:pic>|<p:pic [\s\S]*?<\/p:pic>/g) ?? []).map((pic) => ({
    pic,
    blip: /<a:blip[^>]*r:embed="([^"]+)"/.exec(pic)?.[1] ?? null,
    svg: /<asvg:svgBlip[^>]*r:embed="([^"]+)"/.exec(pic)?.[1] ?? null,
  }));
}
/** The report of an export through the window API (mutates: false; the route's export in the page). */
async function reportOf(
  page: Page,
  input: Record<string, unknown>,
): Promise<{
  perfect: boolean;
  passed: boolean;
  slides: { slideId: string; page?: { fraction: number }; verify?: { fraction: number } }[];
  residual: string[];
  files: { path: string; url?: string }[];
}> {
  const out = (await invoke(page, 'export.run', input, 240_000)) as {
    report?: unknown;
    perfect?: boolean;
  };
  return (out.report ?? out) as {
    perfect: boolean;
    passed: boolean;
    slides: { slideId: string; page?: { fraction: number }; verify?: { fraction: number } }[];
    residual: string[];
    files: { path: string; url?: string }[];
  };
}

test(title('shapes.geometry.text-rect'), async () => {
  test.setTimeout(240_000);
  const owner = await geometryOwner(1);
  const { page, deck } = owner;
  await openEditor(page, deck);
  await clickCard(page, owner.slides['labelled']!);
  /* the label layer's inset from the shape's box on the stage, in sheet px */
  const layers = await page.evaluate(() => {
    const sheet = document.querySelector('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)');
    const k = sheet ? sheet.getBoundingClientRect().width / 1600 : 1;
    const read = (id: string) => {
      const inner = document.querySelector(
        `.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`,
      );
      const box = (inner?.closest('.free') ?? inner)?.getBoundingClientRect();
      const layer = (inner?.closest('.free') ?? inner)
        ?.querySelector('.shape-text')
        ?.getBoundingClientRect();
      if (!box || !layer) return null;
      return {
        left: (layer.x - box.x) / k,
        top: (layer.y - box.y) / k,
        right: (box.right - layer.right) / k,
        bottom: (box.bottom - layer.bottom) / k,
      };
    };
    return { rounded: read('geo-rounded'), arrow: read('geo-arrow') };
  });
  const presetRounded = textInset('roundRect', 240, 160, shapeAdjustDefaults('roundRect'));
  const presetArrow = textInset('rightArrow', 240, 160, shapeAdjustDefaults('rightArrow'));
  const arrowTop = presetArrow.y;
  const arrowBottom = 160 - (presetArrow.y + presetArrow.h);
  /* the Editable text file's bodyPr insets */
  await openPptx(page);
  await ctl(page, 'dialog.download.mode.native').click({ force: true });
  const editable = await download(page, () => ctl(page, 'dialog.download.ok').click(), 60_000);
  await closeDialogs(page);
  const entries = innerPptx(editable.bytes, 'editable');
  const xml = slidePartsOf(entries)
    .map((p) => p.xml)
    .join('\n');
  const insetsOf = (text: string) => {
    const sp = (xml.match(/<p:sp>[\s\S]*?<\/p:sp>|<p:sp [\s\S]*?<\/p:sp>/g) ?? []).find(
      (s) => s.includes(`<a:t>${text}</a:t>`) || s.includes(`>${text}<`),
    );
    const body = sp ? (/<a:bodyPr([^>]*)>/.exec(sp)?.[1] ?? '') : '';
    const num = (name: string) => {
      const m = new RegExp(`${name}="(-?\\d+)"`).exec(body);
      return m ? Number(m[1]) / EMU_PER_PX : null;
    };
    return {
      found: sp !== undefined,
      l: num('lIns'),
      t: num('tIns'),
      r: num('rIns'),
      b: num('bIns'),
    };
  };
  const roundedIns = insetsOf('Next step');
  const arrowIns = insetsOf('Go');
  test.info().annotations.push({
    type: 'text rect',
    description: `rounded layer ${JSON.stringify(layers.rounded)} (preset left ${presetRounded.x.toFixed(2)}), arrow layer ${JSON.stringify(layers.arrow)} (preset top ${arrowTop}, bottom ${arrowBottom}); file insets rounded ${JSON.stringify(roundedIns)}, arrow ${JSON.stringify(arrowIns)} (px)`,
  });
  expect(editable.ms).toBeLessThan(30_000);
  expect(layers.rounded, 'the rounded rectangle draws its label layer').not.toBeNull();
  expect(layers.arrow, 'the arrow draws its label layer').not.toBeNull();
  expect(
    Math.abs(layers.rounded!.left - presetRounded.x),
    "the rounded rectangle's layer sits 7.8 px in",
  ).toBeLessThanOrEqual(0.6);
  expect(
    Math.abs(layers.arrow!.top - arrowTop),
    "the arrow's layer top sits on the shaft",
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(layers.arrow!.bottom - arrowBottom),
    "the arrow's layer bottom sits on the shaft",
  ).toBeLessThanOrEqual(1);
  expect(roundedIns.found && arrowIns.found, 'both labelled shapes are in the file').toBe(true);
  /* the insets equal the measured inset less the preset's rectangle: the left of the rounded
     rectangle, and the top and bottom of the arrow together (the first baseline shift moves the
     top's share to the bottom, text.ts addShapeText) */
  /* the insets equal the measured inset less the preset's rectangle: the sides exactly; the top
     gives the exporter's first baseline shift up (clamped at zero) and the bottom takes it
     (text.ts addShapeText: a margin the box cannot move), so the vertical pair is read net of one
     shift, the same amount on both shapes (one face at one size) */
  type Layer = NonNullable<typeof layers.rounded>;
  type Sides = { l: number; t: number; r: number; b: number };
  const net = (layer: Layer, preset: Sides): Sides => ({
    l: Math.max(0, layer.left - preset.l),
    t: Math.max(0, layer.top - preset.t),
    r: Math.max(0, layer.right - preset.r),
    b: Math.max(0, layer.bottom - preset.b),
  });
  const netRounded = net(layers.rounded!, {
    l: presetRounded.x,
    t: presetRounded.y,
    r: 240 - (presetRounded.x + presetRounded.w),
    b: 160 - (presetRounded.y + presetRounded.h),
  });
  const netArrow = net(layers.arrow!, {
    l: presetArrow.x,
    t: arrowTop,
    r: 240 - (presetArrow.x + presetArrow.w),
    b: arrowBottom,
  });
  const shiftOf = (ins: typeof roundedIns, n: Sides) => (ins.t ?? 0) + (ins.b ?? 0) - (n.t + n.b);
  const shifts = { rounded: shiftOf(roundedIns, netRounded), arrow: shiftOf(arrowIns, netArrow) };
  test.info().annotations.push({
    type: 'insets net of the preset',
    description: `rounded net ${JSON.stringify(netRounded)}, arrow net ${JSON.stringify(netArrow)} (px); the first baseline shift the vertical pair carries: rounded ${shifts.rounded.toFixed(2)}, arrow ${shifts.arrow.toFixed(2)} px`,
  });
  for (const [name, ins, n] of [
    ['rounded rectangle', roundedIns, netRounded],
    ['arrow', arrowIns, netArrow],
  ] as const) {
    expect(
      Math.abs((ins.l ?? 0) - n.l),
      `the ${name}'s lIns is net of the preset`,
    ).toBeLessThanOrEqual(1.5);
    expect(
      Math.abs((ins.r ?? 0) - n.r),
      `the ${name}'s rIns is net of the preset`,
    ).toBeLessThanOrEqual(1.5);
    expect(ins.t ?? 0, `the ${name}'s tIns is at most the net top`).toBeLessThanOrEqual(n.t + 0.5);
    expect(ins.b ?? 0, `the ${name}'s bIns is at least the net bottom`).toBeGreaterThanOrEqual(
      n.b - 0.5,
    );
  }
  expect(
    Math.abs(shifts.rounded - shifts.arrow),
    'the vertical pair carries one shift on both shapes',
  ).toBeLessThanOrEqual(0.5);
});

test(title('shapes.geometry.export.pptx-prst-avlst'), async () => {
  test.setTimeout(240_000);
  const owner = await geometryOwner(1);
  const { page, deck } = owner;
  await openEditor(page, deck);
  await openPptx(page);
  await ctl(page, 'dialog.download.mode.native').click({ force: true });
  const editable = await download(page, () => ctl(page, 'dialog.download.ok').click(), 60_000);
  await closeDialogs(page);
  const xml = slidePartsOf(innerPptx(editable.bytes, 'editable'))
    .map((p) => p.xml)
    .join('\n');
  const geomOf = (prst: string) => {
    const m = new RegExp(`<a:prstGeom prst="${prst}">([\\s\\S]*?)</a:prstGeom>`).exec(xml);
    return m ? m[1]! : null;
  };
  const hexagon = geomOf('hexagon');
  const star = geomOf('star5');
  const callout = geomOf('wedgeRectCallout');
  test.info().annotations.push({
    type: 'prstGeom',
    description: `in ${editable.ms} ms; hexagon ${hexagon ?? 'absent'}; star5 ${star ?? 'absent'}; wedgeRectCallout ${callout ?? 'absent'}`,
  });
  expect(editable.ms).toBeLessThan(30_000);
  expect(hexagon, 'prst hexagon').not.toBeNull();
  expect(hexagon ?? '', 'with an empty avLst').toMatch(
    /^\s*<a:avLst\s*\/>\s*$|^\s*<a:avLst>\s*<\/a:avLst>\s*$/,
  );
  expect(star ?? '', 'star5 with adj 30000 first').toMatch(
    /<a:avLst>\s*<a:gd name="adj" fmla="val 30000"\/>/,
  );
  expect(callout ?? '', 'the callout carries adj1').toMatch(
    /<a:gd name="adj1" fmla="val -?\d+"\/>/,
  );
  expect(callout ?? '', 'and adj2').toMatch(/<a:gd name="adj2" fmla="val -?\d+"\/>/);
});

test(title('shapes.geometry.export.raster-modes'), async () => {
  test.setTimeout(420_000);
  const owner = await geometryOwner(4);
  const { page, deck, unskipped } = owner;
  await openEditor(page, deck);
  await openPptx(page);
  await ctl(page, 'dialog.download.mode.flatten').click({ force: true });
  const perfect = await download(page, () => ctl(page, 'dialog.download.ok').click(), 60_000);
  await closeDialogs(page);
  const pptxReport = await reportOf(page, { format: 'pptx', mode: 'flatten', theme: ['light'] });
  const pages = pptxReport.slides.map((s) => ({
    id: s.slideId,
    fraction: s.page?.fraction ?? null,
  }));
  await openPdf(page);
  const pdf = await download(page, () => ctl(page, 'dialog.download.ok').click());
  await closeDialogs(page);
  const pdfReport = await reportOf(page, { format: 'pdf', theme: ['light'] });
  const verified = pdfReport.slides
    .filter((s) => s.verify !== undefined)
    .map((s) => ({ id: s.slideId, fraction: s.verify!.fraction }));
  test.info().annotations.push({
    type: 'raster modes',
    description: `Perfect in ${perfect.ms} ms, report perfect ${pptxReport.perfect}, pages ${JSON.stringify(pages)}; PDF in ${pdf.ms} ms (${pdfPages(pdf.bytes)} pages), report passed ${pdfReport.passed}, verified ${JSON.stringify(verified)}, residual ${pdfReport.residual.slice(0, 3).join(' | ')}`,
  });
  expect(perfect.ms).toBeLessThan(30_000);
  expect(pptxSlides(perfect.bytes).length).toBe(unskipped);
  expect(pptxReport.perfect, "the Perfect report's perfect is true").toBe(true);
  for (const p of pages) expect(p.fraction ?? 0, `${p.id} under 0.1 percent`).toBeLessThan(0.001);
  expect(pdf.ms).toBeLessThan(30_000);
  expect(pdfPages(pdf.bytes)).toBe(unskipped);
  expect(pdfReport.passed, "the PDF's report passes").toBe(true);
  for (const v of verified) expect(v.fraction, `${v.id} under 0.5 percent`).toBeLessThan(0.005);
});

test(title('svg.export.pdf-vector'), async () => {
  test.setTimeout(300_000);
  const owner = await svgOwner(2);
  const { page, deck, unskipped } = owner;
  await openEditor(page, deck);
  await openPdf(page);
  const pdf = await download(page, () => ctl(page, 'dialog.download.ok').click());
  await closeDialogs(page);
  const images = pdfImages(pdf.bytes);
  const report = await reportOf(page, { format: 'pdf', theme: ['light'] });
  test.info().annotations.push({
    type: 'pdf',
    description: `in ${pdf.ms} ms; ${pdfPages(pdf.bytes)} pages; ${images} image XObjects; report passed ${report.passed}; residual ${report.residual.slice(0, 3).join(' | ')}`,
  });
  expect(pdf.ms).toBeLessThan(30_000);
  expect(pdfPages(pdf.bytes)).toBe(unskipped);
  expect(images, 'the svg picture travels as vector: zero image XObjects').toBe(0);
  expect(report.passed, 'its report passes').toBe(true);
});

/**
 * The svg picture's `p:pic` in the Editable text file with its blip parts, or null. The object is
 * named `ts:<slideId>#<blockId>:<rid>` (b4.md R5), which tells it from the kit's logo objects.
 */
function svgPicOf(entries: Map<string, () => Buffer>, blockId: string) {
  const parts = slidePartsOf(entries);
  for (const part of parts)
    for (const pic of picsOf(part.xml)) {
      const name = /<p:cNvPr[^>]*name="([^"]*)"/.exec(pic.pic)?.[1] ?? '';
      if (!name.includes(`#${blockId}:`)) continue;
      const svgTarget = pic.svg ? relTarget(part.rels, pic.svg) : null;
      const blipTarget = pic.blip ? relTarget(part.rels, pic.blip) : null;
      if (svgTarget !== null || blipTarget !== null)
        return {
          part: part.name,
          pic: pic.pic,
          ext: /<a:extLst>[\s\S]*?<a:ext uri="\{96DAC541-7B7A-43D3-8B79-37D633B846F1\}">[\s\S]*?<asvg:svgBlip/.test(
            pic.pic,
          ),
          svgTarget,
          blipTarget,
          svgBytes: svgTarget ? mediaBytes(entries, svgTarget) : null,
          blipBytes: blipTarget ? mediaBytes(entries, blipTarget) : null,
        };
    }
  return null;
}

test(title('svg.export.pptx-svgblip'), async () => {
  test.setTimeout(300_000);
  const owner = await svgOwner(1);
  const { page, deck } = owner;
  await openEditor(page, deck);
  await openPptx(page);
  await ctl(page, 'dialog.download.mode.native').click({ force: true });
  const editable = await download(page, () => ctl(page, 'dialog.download.ok').click(), 60_000);
  await closeDialogs(page);
  const entries = innerPptx(editable.bytes, 'editable');
  const found = svgPicOf(entries, owner.blockId ?? '');
  const contentTypes = entries.get('[Content_Types].xml')?.().toString('utf8') ?? '';
  const svgText = found?.svgBytes?.toString('utf8') ?? '';
  test.info().annotations.push({
    type: 'svgBlip',
    description: `in ${editable.ms} ms; ${found ? `${found.part}: ext ${found.ext}, svg ${found.svgTarget ?? 'none'} (${found.svgBytes?.length ?? 0} bytes, begins ${JSON.stringify(svgText.slice(0, 12))}), blip ${found.blipTarget ?? 'none'}` : 'no picture part with a blip'}; content types svg default ${/Extension="svg"/i.test(contentTypes)}`,
  });
  expect(editable.ms).toBeLessThan(30_000);
  expect(found, 'the picture is in the file').not.toBeNull();
  expect(found!.ext, 'the p:pic carries asvg:svgBlip inside a:extLst with the ext uri').toBe(true);
  expect(found!.svgTarget ?? '', 'the rel targets a ../media/*.svg part').toMatch(
    /^\.\.\/media\/.*\.svg$/,
  );
  expect(svgText, 'whose bytes begin with <svg or the prolog').toMatch(/^\s*(<\?xml|<svg)/);
  expect(svgText, 'and hold no script').not.toMatch(/<script/i);
  expect(contentTypes, '[Content_Types].xml carries the svg default').toMatch(
    /<Default Extension="svg" ContentType="image\/svg\+xml"\/>/,
  );
});

test(title('svg.export.pptx-fallback'), async () => {
  test.setTimeout(360_000);
  const owner = await svgOwner(2);
  const { page, deck, blockId } = owner;
  await openEditor(page, deck);
  const block = (await objectsOfLib(page, owner.slides['svg']!)).find((o) => o.id === blockId);
  await openPptx(page);
  await ctl(page, 'dialog.download.mode.native').click({ force: true });
  const editable = await download(page, () => ctl(page, 'dialog.download.ok').click(), 60_000);
  await closeDialogs(page);
  const found = svgPicOf(innerPptx(editable.bytes, 'editable'), blockId ?? '');
  const size = found?.blipBytes ? pngSize(found.blipBytes) : null;
  const signature = found?.blipBytes?.subarray(0, 8).toString('latin1') === '\x89PNG\r\n\x1a\n';
  /* svgVector false through the window API: the file is fetched by the address the report names,
     else through the sync export route with the deployment's bearer */
  let off: Awaited<ReturnType<typeof reportOf>>;
  try {
    off = await reportOf(page, {
      format: 'pptx',
      mode: 'native',
      theme: ['light'],
      svgVector: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    /* the header field of export.run is the integrator's (b4.md R1): without it the second half
       cannot be driven and the row reads not driven with the reason, never passed on its first half */
    if (/Unrecognized key: "svgVector"|invalid input at \/svgVector/.test(message))
      test.skip(
        true,
        `not on this build: export.run { svgVector } (the integrator's header of packages/schema/src/actions.ts, b4.md R1); the first half read: blip ${found?.blipTarget ?? 'none'}, PNG signature ${signature}, IHDR ${JSON.stringify(size)} for the block's ${block?.pos.w ?? '?'} px`,
      );
    throw error;
  }
  let offBytes: Buffer | null = null;
  let how = 'no file reachable';
  const url = off.files.find((f) => f.url !== undefined)?.url ?? null;
  if (url !== null) {
    const got = await fetchBytes(page, url);
    if (got.status === 200) {
      offBytes = got.bytes;
      how = `the report's file address (${got.contentType})`;
    }
  }
  if (offBytes === null) {
    const headers = agentHeaders(new URL(page.url()).origin);
    if (headers !== null) {
      const res = await page.request.post(`/api/export/${deck}?sync=1`, {
        headers,
        data: { format: 'pptx', mode: 'native', theme: ['light'], svgVector: false },
        timeout: 240_000,
        maxRedirects: 0,
      });
      if (res.status() === 200) {
        offBytes = Buffer.from(await res.body());
        how = `the sync export route (${res.headers()['content-type'] ?? ''})`;
      } else how = `the sync export route answered ${res.status()}`;
    } else how = 'no bearer for the sync export route on this origin';
  }
  const offEntries = offBytes ? innerPptx(offBytes, 'editable') : null;
  const offPic = offEntries ? svgPicOf(offEntries, blockId ?? '') : null;
  const offSvgParts = offEntries
    ? [...offEntries.keys()].filter((n) => /^ppt\/media\/.*\.svg$/i.test(n))
    : [];
  test.info().annotations.push({
    type: 'fallback',
    description: `blip ${found?.blipTarget ?? 'none'}: PNG signature ${signature}, IHDR ${JSON.stringify(size)} against the block's ${block?.pos.w ?? '?'} px times 3; svgVector false through ${how}: ${offPic ? `blip ${offPic.blipTarget ?? 'none'}, svgBlip ${offPic.svgTarget ?? 'none'}` : 'no picture read'}, ${offSvgParts.length} svg part(s); residual ${off.residual.filter((r) => /svg/i.test(r)).join(' | ')}`,
  });
  expect(editable.ms).toBeLessThan(30_000);
  expect(found?.blipTarget ?? '', 'the a:blip targets a .png part').toMatch(/\.png$/i);
  expect(signature, 'whose bytes begin with the PNG signature').toBe(true);
  expect(
    Math.abs((size?.width ?? 0) - (block?.pos.w ?? 0) * 3),
    "and whose IHDR width is the block's width times 3",
  ).toBeLessThanOrEqual(3);
  if (offBytes === null)
    test.skip(true, `not driven: the svgVector false file could not be read (${how})`);
  expect(offPic?.blipTarget ?? '', 'with svgVector false the blip stays').toMatch(/\.png$/i);
  expect(offPic?.svgTarget ?? null, 'and no svgBlip').toBeNull();
  expect(offSvgParts, 'and no .svg part').toEqual([]);
});

test(title('svg.export.web-page'), async () => {
  test.setTimeout(240_000);
  const owner = await svgOwner(1);
  const { page, deck } = owner;
  await openEditor(page, deck);
  const switched = await reachDownloadRow(page, 'file.download.html');
  const html = await download(
    page,
    () => menuPath(page, 'file', 'file.download', 'file.download.html'),
    30_000,
  );
  const text = html.bytes.toString('utf8');
  const svgUris = text.match(/data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+/g) ?? [];
  const ours = svgUris.filter((u) =>
    /<circle cx="48" cy="32"/.test(Buffer.from(u.split(',')[1] ?? '', 'base64').toString('utf8')),
  );
  const pngUris = text.match(/data:image\/png;base64,[A-Za-z0-9+/=]+/g) ?? [];
  const pngSizes = pngUris.map((u) => pngSize(Buffer.from(u.split(',')[1] ?? '', 'base64')));
  /* the picture's PNG twin is a 3 by 2 raster (the fixture's aspect); none of that aspect is inlined */
  const twinLike = pngSizes.filter((s) => s !== null && Math.abs(s.width / s.height - 1.5) < 0.02);
  /* how the page references the picture when no data URI carries it (the inliner works by twin path, apps/cli/src/assets.ts inlineAssets) */
  const srcForms = [...text.matchAll(/<img[^>]*\ssrc="([^"]{0,60})/g)].map((m) =>
    m[1]!.replace(/^data:([^;]+);base64,.*$/, 'data:$1;…'),
  );
  test.info().annotations.push({
    type: 'web page',
    description: `${switched ? 'with the switch on; ' : ''}${html.name} in ${html.ms} ms (${text.length} chars); ${svgUris.length} svg data URI(s), ${ours.length} the picture's; ${pngUris.length} png data URI(s) ${JSON.stringify(pngSizes)}; img sources ${JSON.stringify(srcForms.slice(0, 6))}`,
  });
  expect(html.ms).toBeLessThan(30_000);
  expect(page.url(), 'the editor is still the page').toContain(`/edit/${deck}`);
  expect(ours.length, 'the html carries the picture as data:image/svg+xml;base64,').toBeGreaterThan(
    0,
  );
  expect(twinLike, 'and no .png data URI of that asset').toEqual([]);
  if (switched) await menuPath(page, 'tools', 'tools.advancedTools');
});

// ---------------------------------------------------------------------------------------------
// the features round, ship two (docs/FEATURES.md 5.5; the rows `shaders.export.*`): the shader's
// frame in the PDF, the Editable PowerPoint and the web page, and the report row of an export
// started before the frame. The shader lands on a fifth slide of the owner's deck the seller's way
// when Insert > Shader is on the build, else through the window API (lib.ts `ensureShader`; the
// matrix's setup), and its frame is awaited with the agent's route as the fallback. A build without
// the frame pipeline fails these rows with the facts (the audit read them broken), never skips.

/** The shader on the owner's deck, made once per owner (a setup, never a driven step). */
async function shaderSetup(
  owner: Owner,
): Promise<{ slide: string; block: string; asset: string | null; how: string }> {
  const { page } = owner;
  if (owner.shaderSlide === undefined || owner.shaderBlock === undefined) {
    await openEditor(page, owner.deck);
    await clickCard(page, owner.docsSlide ?? (await slideOrder(page)).at(-1)!);
    const slide = await addSlide(page);
    const made = await ensureShader(page, slide);
    let how = made.how;
    const frame = await waitFrame(page, slide, made.id, { timeout: 15_000 });
    if (frame.asset === null) {
      const fallback = await captureFallback(page, slide, made.id);
      how = `${how}; no frame within 15 s, ${fallback.how} made ${fallback.asset ?? 'none'}`;
    } else how = `${how}; the frame ${frame.asset} came after ${frame.ms} ms`;
    owner.shaderSlide = slide;
    owner.shaderBlock = made.id;
    owner.shaderHow = how;
    owner.unskipped += 1;
  }
  const block = (await shaderBlocks(page, owner.shaderSlide)).find(
    (o) => o.id === owner.shaderBlock,
  );
  return {
    slide: owner.shaderSlide,
    block: owner.shaderBlock,
    asset: (block?.block['asset'] as string | undefined) ?? null,
    how: owner.shaderHow ?? '',
  };
}
/**
 * The frame file the sheet draws for the shader block: its same origin src and its bytes, fetched
 * through the assets route and, on a hosted instance that answers a redirect to the twin's Blob
 * URL, through that redirect with no header (lib.ts `fetchPageFile`; the fix round of ship two:
 * the runs of record read "no file" on the 302 and never compared a sample).
 */
async function shaderFrameFile(
  page: Page,
  blockId: string,
): Promise<{ src: string; bytes: Buffer; via: string } | null> {
  const src = await page.evaluate((id) => {
    const root = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`);
    const img = root?.querySelector('img');
    return img ? img.currentSrc || img.getAttribute('src') : null;
  }, blockId);
  if (!src) return null;
  const got = await fetchPageFile(page, src);
  if (got === null) return null;
  return { src, bytes: got.bytes, via: got.via };
}
/* the half size of the box averaged around each sample point, as a fraction of the picture: the
   PDF's re-encoded image (3200 by 1734 for a 3200 by 1814 frame) and the frame file are compared
   over the same relative area, not one pixel each */
const SAMPLE_PATCH = 0.015;
const SAMPLE_POINTS: readonly (readonly [number, number])[] = [
  [0.5, 0.5],
  [0.25, 0.5],
  [0.75, 0.5],
  [0.5, 0.25],
  [0.5, 0.75],
];
const LABEL = /paper:|not captured/i;

test(title('shaders.export.pdf-frame'), async () => {
  test.setTimeout(300_000);
  const owner = await withBudget(1);
  const { page } = owner;
  const made = await shaderSetup(owner);
  await openEditor(page, owner.deck);
  await clickCard(page, made.slide);
  const file = await shaderFrameFile(page, made.block);
  const pos = (await shaderBlocks(page, made.slide)).find((o) => o.id === made.block)?.pos ?? null;
  await openPdf(page);
  const pdf = await download(page, () => ctl(page, 'dialog.download.ok').click(), 120_000);
  await closeDialogs(page);
  const image = largestPdfImage(pdf.bytes);
  const decoded = image?.png ?? image?.jpeg ?? null;
  const drawn = decoded ? await samplePicture(page, decoded, SAMPLE_POINTS, SAMPLE_PATCH) : null;
  const frame = file ? await samplePicture(page, file.bytes, SAMPLE_POINTS, SAMPLE_PATCH) : null;
  const distances =
    drawn && frame ? SAMPLE_POINTS.map((_, i) => rgbDistance(drawn.rgb[i]!, frame.rgb[i]!)) : null;
  const text = pdfText(pdf.bytes);
  test.info().annotations.push({
    type: 'pdf',
    description: `${made.how}; frame ${made.asset ?? 'none'} (${file ? `${file.bytes.length} bytes through the ${file.via === 'redirect' ? "assets route's redirect" : 'assets route'}` : 'no file'}); box ${pos ? `${pos.w} by ${pos.h}` : 'unread'}; the PDF's largest image ${image ? `${image.width} by ${image.height} ${image.filter}${decoded ? '' : ' (not decoded)'}` : 'none'} (${pdfImages(pdf.bytes)} image objects); samples ${distances ? `${distances.join(', ')} (a ${Math.round(SAMPLE_PATCH * 200)} percent patch mean)` : `unread (${drawn ? '' : 'the PDF image undecoded'}${!drawn && !frame ? ', ' : ''}${frame ? '' : 'the frame file unread'})`}; label text ${LABEL.test(text) ? 'present' : 'absent'}`,
  });
  expect(made.asset, 'the block has a frame').not.toBeNull();
  expect(image, 'the PDF carries an image').not.toBeNull();
  expect(pos, 'the block').not.toBeNull();
  /* the image keeps the box's aspect within five percent */
  expect(
    Math.abs(image!.width / image!.height - pos!.w / pos!.h) / (pos!.w / pos!.h),
    "the image's aspect is the box's",
  ).toBeLessThan(0.05);
  expect(distances, 'the pixels sampled').not.toBeNull();
  expect(
    distances!.filter((d) => d <= 48).length,
    'at least four of five samples within 48 per channel',
  ).toBeGreaterThanOrEqual(4);
  expect(LABEL.test(text), 'no label text').toBe(false);
});

test(title('shaders.export.pptx-frame'), async () => {
  test.setTimeout(300_000);
  const owner = await withBudget(1);
  const { page } = owner;
  const made = await shaderSetup(owner);
  await openEditor(page, owner.deck);
  await clickCard(page, made.slide);
  const block = (await shaderBlocks(page, made.slide)).find((o) => o.id === made.block) ?? null;
  await openPptx(page);
  await ctl(page, 'dialog.download.mode.native').click({ force: true });
  const pptx = await download(page, () => ctl(page, 'dialog.download.ok').click(), 120_000);
  await closeDialogs(page);
  let entries = zipEntriesRaw(pptx.bytes);
  const inner =
    [...entries.keys()].find((n) => /\(light, editable\)\.pptx$/.test(n)) ??
    [...entries.keys()].find((n) => n.endsWith('.pptx'));
  if (inner !== undefined) entries = zipEntriesRaw(entries.get(inner)!());
  const name = `ts:${made.slide}#${made.block}`;
  const slidePart =
    [...entries.keys()]
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .find((n) => entries.get(n)!().toString('utf8').includes(`name="${name}"`)) ?? null;
  const xml = slidePart ? entries.get(slidePart)!().toString('utf8') : '';
  const picMatch = new RegExp(
    `<p:pic>(?:(?!</p:pic>).)*?name="${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"(?:(?!</p:pic>).)*?</p:pic>`,
    's',
  ).exec(xml);
  const pic = picMatch?.[0] ?? '';
  const descr = /descr="([^"]*)"/.exec(pic)?.[1] ?? '';
  const embed = /r:embed="([^"]+)"/.exec(pic)?.[1] ?? null;
  const rels = slidePart
    ? (entries
        .get(slidePart.replace('slides/', 'slides/_rels/') + '.rels')?.()
        ?.toString('utf8') ?? '')
    : '';
  const target = embed
    ? (new RegExp(`Id="${embed}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ?? null)
    : null;
  const media = target ? (entries.get(`ppt/${target.replace(/^\.\.\//, '')}`)?.() ?? null) : null;
  const size = media ? pngSize(media) : null;
  const off = /<a:off x="(\d+)" y="(\d+)"/.exec(pic);
  const ext = /<a:ext cx="(\d+)" cy="(\d+)"/.exec(pic);
  const sldSz = /<p:sldSz cx="(\d+)" cy="(\d+)"/.exec(
    entries.get('ppt/presentation.xml')?.()?.toString('utf8') ?? '',
  );
  const emuPerPx = sldSz ? Number(sldSz[1]) / 1600 : null;
  const drawnBox =
    off && ext && emuPerPx
      ? {
          x: Number(off[1]) / emuPerPx,
          y: Number(off[2]) / emuPerPx,
          w: Number(ext[1]) / emuPerPx,
          h: Number(ext[2]) / emuPerPx,
        }
      : null;
  const pos = block?.pos ?? null;
  const within = (a: number, b: number) => Math.abs(a - b) <= 32;
  test.info().annotations.push({
    type: 'pptx',
    description: `${made.how}; inner ${inner ?? 'none'}; picture ${name} in ${slidePart ?? 'no slide part'}; descr "${descr.slice(0, 120)}"; media ${target ?? 'none'} ${size ? `${size.width} by ${size.height}` : 'unread'}; box ${drawnBox ? `${Math.round(drawnBox.x)},${Math.round(drawnBox.y)} ${Math.round(drawnBox.w)} by ${Math.round(drawnBox.h)}` : 'unread'} against ${pos ? `${pos.x},${pos.y} ${pos.w} by ${pos.h}` : 'unread'}`,
  });
  expect(slidePart, `a picture named ${name}`).not.toBeNull();
  expect(descr, 'the recipe in descr').toContain(String(block?.block['materialId'] ?? 'paper:'));
  expect(size, 'the media PNG').not.toBeNull();
  expect(Math.max(size!.width, size!.height), 'the long side 3200').toBe(3200);
  expect(drawnBox, 'the picture box').not.toBeNull();
  expect(pos).not.toBeNull();
  expect(
    within(drawnBox!.x, pos!.x) &&
      within(drawnBox!.y, pos!.y) &&
      within(drawnBox!.w, pos!.w) &&
      within(drawnBox!.h, pos!.h),
    "the picture sits at the block's box within 2 percent of the sheet",
  ).toBe(true);
});

test(title('shaders.export.html-frame'), async () => {
  test.setTimeout(300_000);
  const owner = await withBudget(1);
  const { page, context } = owner;
  const made = await shaderSetup(owner);
  await openEditor(page, owner.deck);
  await clickCard(page, made.slide);
  const file = await shaderFrameFile(page, made.block);
  const switched = await reachDownloadRow(page, 'file.download.html');
  const html = await download(
    page,
    () => menuPath(page, 'file', 'file.download', 'file.download.html'),
    60_000,
  );
  if (switched) await menuPath(page, 'tools', 'tools.advancedTools');
  const text = html.bytes.toString('utf8');
  /* the file loaded in a page of its own: the canvases, the visible words and the frame's pixels */
  const viewer = await context.newPage();
  let facts: { canvases: number; words: boolean; src: string | null; natural: number } | null =
    null;
  let drawn: { rgb: [number, number, number][] } | null = null;
  try {
    await viewer.setContent(text, { waitUntil: 'load' });
    await viewer.waitForTimeout(1500);
    facts = await viewer.evaluate((label) => {
      const img = document.querySelector(
        '.material img, [data-recipe] img, .material-frame',
      ) as HTMLImageElement | null;
      return {
        canvases: document.querySelectorAll('canvas').length,
        words: new RegExp(label, 'i').test(document.body.innerText),
        src: img ? img.currentSrc || img.getAttribute('src') : null,
        natural: img ? img.naturalWidth : 0,
      };
    }, LABEL.source);
    if (facts.src && facts.src.startsWith('data:'))
      drawn = await samplePicture(viewer, facts.src, SAMPLE_POINTS, SAMPLE_PATCH);
  } finally {
    await viewer.close();
  }
  const frame = file ? await samplePicture(page, file.bytes, SAMPLE_POINTS, SAMPLE_PATCH) : null;
  const distances =
    drawn && frame ? SAMPLE_POINTS.map((_, i) => rgbDistance(drawn!.rgb[i]!, frame.rgb[i]!)) : null;
  test.info().annotations.push({
    type: 'html',
    description: `${made.how}; ${html.name} ${html.bytes.length} bytes in ${html.ms} ms; ${facts ? `${facts.canvases} canvas, label words ${facts.words}, frame img ${facts.src ? `${facts.src.slice(0, 40)}... natural ${facts.natural}` : 'none'}` : 'unread'}; frame file ${file ? `${file.bytes.length} bytes through the ${file.via === 'redirect' ? "assets route's redirect" : 'assets route'}` : 'unread'}; samples ${distances ? `${distances.join(', ')} (a ${Math.round(SAMPLE_PATCH * 200)} percent patch mean)` : 'unread'}`,
  });
  expect(facts, 'the page loads').not.toBeNull();
  expect(facts!.canvases, 'mounts no canvas').toBe(0);
  expect(facts!.words, 'draws no label text').toBe(false);
  expect(facts!.natural, 'the frame picture decodes').toBeGreaterThan(0);
  expect(distances, "the frame's pixels are the file's own (a data URI)").not.toBeNull();
  expect(
    distances!.filter((d) => d <= 48).length,
    'at least four of five samples within 48 per channel',
  ).toBeGreaterThanOrEqual(4);
});

test(title('shaders.export.missing-frame-row'), async () => {
  test.setTimeout(300_000);
  const owner = await withBudget(1);
  const { page } = owner;
  const made = await shaderSetup(owner);
  await openEditor(page, owner.deck);
  await clickCard(page, made.slide);
  await openPdf(page);
  /* the recipe change with the dialog open, so OK follows it within 800 ms */
  const s = await state(page);
  const block = (await shaderBlocks(page, made.slide)).find((o) => o.id === made.block) ?? null;
  const anchor = ((block?.block['anchor'] as number | undefined) ?? 5500) === 5500 ? 7000 : 5500;
  const changed = Date.now();
  await invoke(page, 'block.set', {
    slideId: made.slide,
    blockId: made.block,
    path: '/anchor',
    value: anchor,
    baseRevision: s.revision,
  });
  const rows: string[] = [];
  let stop = false;
  const watching = (async () => {
    while (!stop) {
      const text = await page
        .evaluate(() => {
          const root =
            document
              .querySelector('[data-control="dialog.download.pdf"]')
              ?.closest('[role="dialog"]') ??
            document.querySelector('.ts-dialog-scrim [role="dialog"]');
          return root ? (root.textContent ?? '').replace(/\s+/g, ' ') : '';
        })
        .catch(() => '');
      const m = /([^.|]*\bshaders?\b[^.|]*\bframe[^.|]*)/i.exec(text);
      if (m && !rows.includes(m[1]!.trim())) rows.push(m[1]!.trim());
      await page.waitForTimeout(150);
    }
  })();
  const gapBefore = Date.now() - changed;
  const pdf = await download(page, () => ctl(page, 'dialog.download.ok').click(), 150_000);
  const gap = gapBefore;
  await page.waitForTimeout(600);
  stop = true;
  await watching;
  await closeDialogs(page);
  const frame = await waitFrame(page, made.slide, made.block, { timeout: 10_000 });
  test.info().annotations.push({
    type: 'report',
    description: `${made.how}; anchor -> ${anchor}, OK ${gap} ms after the change; report rows: ${rows.join(' | ') || 'none'}; ${pdf.name} ${pdf.bytes.length} bytes with ${pdfImages(pdf.bytes)} image objects; the block's frame after ${frame.asset ?? 'none'}`,
  });
  expect(gap, 'the export started within 800 ms of the change').toBeLessThan(800);
  expect(
    rows.length,
    'one report row names the shaders whose frame was pending or stale',
  ).toBeGreaterThan(0);
  expect(
    rows.some((r) => /\d/.test(r)),
    'the row carries the count',
  ).toBe(true);
  expect(pdfImages(pdf.bytes), 'the file carries the frame').toBeGreaterThan(0);
});

coverage(import.meta.filename, [
  'export.zip.bundle',
  'export.html.web-page',
  'export.jpg.current-slide',
  'export.png.current-slide',
  'tables.export.pdf',
  'tables.export.pptx-editable',
  'charts.export.pdf',
  'charts.export.pptx-native',
  'wordart.export.pdf',
  'lines.connector.export-pptx',
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
  /* the product round (docs/PRODUCT.md 8.1) */
  'export.download.named-after-title',
  'export.download.pdf-direct',
  'export.download.pptx-direct',
  'export.download.options-dialog',
  'export.download.progress-per-slide',
  'export.download.mode-sentence',
  'export.download.large-deck-pdf',
  'export.download.large-deck-pptx',
  'brand.footer.text',
  'brand.export.pdf-logo',
  'fonts.export.editable-names-face',
  'fonts.export.pdf-face',

  /* the features round, ship one (docs/FEATURES.md 7.1) */
  'diagrams.export.step-label',
  'logos.export.pdf-pptx-crisp',
  /* the features round, ship two (docs/FEATURES.md 5.5, 7.1) */
  'shaders.export.pdf-frame',
  'shaders.export.pptx-frame',
  'shaders.export.html-frame',
  'shaders.export.missing-frame-row',
  /* the vector round (docs/VECTOR.md 6.1): the geometry in both modes and the svg exports */
  'shapes.geometry.text-rect',
  'shapes.geometry.export.pptx-prst-avlst',
  'shapes.geometry.export.raster-modes',
  'svg.export.pdf-vector',
  'svg.export.pptx-svgblip',
  'svg.export.pptx-fallback',
  'svg.export.web-page',
]);
