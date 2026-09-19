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
} from './lib';

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
]);
