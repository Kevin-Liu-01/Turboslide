import { loadavg } from 'node:os';

import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import {
  Scratch,
  addSlide,
  clickCard,
  ctl,
  download,
  invoke,
  menuPath,
  openEditor,
  ownerContext,
  pptxSlides,
  settled,
  slideJson,
  slideOrder,
  state,
  teardownAll,
  title,
  waitEditor,
  zipEntries,
} from './lib';
import { isCoreId } from './matrix';

// Lane B's rows of the Round 1 follow-up (the canvas and the export the production verification
// of Round 1 found, findings 4 and 12), driven against one deck from Blank made by its own
// identity: the first write is a text box drawn on the title slide through Insert > Text box, so
// the title slide is a canvas holding the template's mark block, which draws nothing; a second
// slide holds a table, a chart and a rectangle rotated 45 degrees (setup writes). The mark row
// drives the stage (a click on the title slide's empty top band, Tab from nothing, Select all);
// both rows read the one Editable text PowerPoint the first of them downloads. core/export.spec.ts
// calls `canvasR1f(browser)` once and spreads its ids into its coverage list. A row's test is
// declared only once its row is in the matrix. The deck is torn down through the product.

const MARK_ROW = 'brand.template.blank-mark-not-an-object';
const FRAMES_ROW = 'export.pptx.rotated-frames';

type BlankDeck = {
  context: BrowserContext;
  page: Page;
  scratch: Scratch;
  deck: string;
  titleSlide: string;
  turnedSlide: string;
  pptx?: { bytes: Buffer; ms: number; load: number };
};

let made: BlankDeck | null = null;

const chip = (page: Page): Promise<string | null> =>
  page.evaluate(
    () => document.querySelector('.ts-overlay .ts-select-chip')?.textContent.trim() ?? null,
  );

async function sheetBox(page: Page): Promise<{ x: number; y: number; k: number }> {
  return page.evaluate(() => {
    const el = document.querySelector('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)');
    if (!el) throw new Error('no sheet on the stage');
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, k: r.width / 1600 };
  });
}

/** Clears the selection with a click on the workspace beside the sheet. */
async function clearSelection(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const s = await sheetBox(page);
  await page.mouse.click(Math.max(2, s.x - 10), s.y + 40);
  await page.waitForTimeout(300);
}

/** The deck from Blank with its first write drawn through the product, made once (a setup). */
async function blankDeck(browser: Browser): Promise<BlankDeck> {
  if (made !== null) return made;
  const { context, page } = await ownerContext(browser);
  const scratch = new Scratch();
  await page.goto('/new');
  await waitEditor(page);
  const info = await invoke<{ id: string }>(page, 'deck.info');
  /* the first write: Insert > Text box, a box drawn over the lower half of the title slide and
     typed, the path Round 1's verification took on production */
  await menuPath(page, 'insert', 'insert.textBox');
  const s = await sheetBox(page);
  const from = { x: s.x + 300 * s.k, y: s.y + 640 * s.k };
  const to = { x: s.x + 1000 * s.k, y: s.y + 760 * s.k };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  await page.keyboard.type('The first write', { delay: 40 });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForURL(/\/edit\//, { timeout: 60_000 });
  await settled(page);
  if (
    await ctl(page, 'dialog.namePrompt')
      .isVisible()
      .catch(() => false)
  )
    await ctl(page, 'dialog.namePrompt.close')
      .click()
      .catch(() => undefined);
  const deck = scratch.add(info.id);
  const titleSlide = (await slideOrder(page))[0] ?? '';
  const turnedSlide = await addSlide(page);
  await clickCard(page, turnedSlide);
  let revision = (await state(page)).revision;
  for (const block of [
    {
      id: 'turned-table',
      type: 'table',
      columns: [{ align: 'left' }, { align: 'right' }],
      rows: [{ cells: ['Region', 'Q1'], header: true }, { cells: ['North', '1,200'] }],
      pos: { x: 160, y: 300, w: 560, h: 160, rotate: 45 },
    },
    {
      id: 'turned-chart',
      type: 'chart',
      kind: 'bar',
      categories: ['Q1', 'Q2', 'Q3'],
      series: [{ name: 'Revenue', values: [12, 18, 9] }],
      pos: { x: 860, y: 240, w: 560, h: 360, rotate: 45 },
    },
    {
      id: 'turned-shape',
      type: 'shape',
      shape: 'rectangle',
      fill: 'plate',
      stroke: 'ink',
      pos: { x: 640, y: 660, w: 320, h: 120, rotate: 45 },
    },
  ]) {
    await invoke(page, 'block.insert', {
      baseRevision: revision,
      slideId: turnedSlide,
      slot: 'main',
      block,
    });
    revision = (await settled(page)).revision;
  }
  made = { context, page, scratch, deck, titleSlide, turnedSlide };
  return made;
}

/**
 * The deck's Editable text PowerPoint, downloaded once through Download options, with the time
 * it took and the machine's one minute load when it arrived (a timing read on a loaded machine
 * is read again before it is called red).
 */
async function editablePptx(
  blank: BlankDeck,
): Promise<{ bytes: Buffer; ms: number; load: number }> {
  if (blank.pptx !== undefined) return blank.pptx;
  const { page } = blank;
  await openEditor(page, blank.deck);
  await menuPath(page, 'file', 'file.download', 'file.download.more', 'file.download.options');
  await ctl(page, 'dialog.download.pptx').waitFor({ timeout: 8000 });
  await ctl(page, 'dialog.download.mode.native').click({ force: true });
  const file = await download(page, () => ctl(page, 'dialog.download.ok').click(), 120_000);
  for (let i = 0; i < 3; i += 1) {
    if ((await page.locator('.ts-dialog-scrim [role="dialog"]').count()) === 0) break;
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
  blank.pptx = { bytes: file.bytes, ms: file.ms, load: loadavg()[0] ?? 0 };
  test.info().annotations.push({
    type: 'download',
    description: `the Editable text file in ${file.ms} ms at a one minute load of ${blank.pptx.load.toFixed(1)}`,
  });
  return blank.pptx;
}

/** Slide part `n` (one based) of a PowerPoint's bytes. */
function slidePart(bytes: Buffer, n: number): string {
  const name = pptxSlides(bytes).find((part) => part === `ppt/slides/slide${n}.xml`);
  return name === undefined ? '' : (zipEntries(bytes).get(name)?.() ?? '');
}

/** The `p:xfrm` or `a:xfrm` start tag of the object named `name` in a slide part. */
function xfrmOf(xml: string, name: string): string | null {
  const at = xml.indexOf(`name="${name}"`);
  if (at < 0) return null;
  return /<[ap]:xfrm\b[^>]*>/.exec(xml.slice(at))?.[0] ?? null;
}

export function canvasR1f(browser: () => Browser): string[] {
  const ids: string[] = [];

  if (isCoreId(MARK_ROW)) {
    ids.push(MARK_ROW);
    test(title(MARK_ROW), async () => {
      test.setTimeout(240_000);
      const blank = await blankDeck(browser());
      const { page } = blank;
      await openEditor(page, blank.deck);
      await clickCard(page, blank.titleSlide);
      /* the document keeps the template's mark block on the converted title slide */
      const stored = await slideJson(page, blank.titleSlide);
      const main = ((stored['slots'] as { main?: { id: string; type: string }[] } | undefined)
        ?.main ?? []) as { id: string; type: string }[];
      expect(stored['kind'], 'the first write made the title slide a canvas').toBe('content');
      expect(main.find((block) => block.id === 'mark')?.type).toBe('mark');
      /* nothing on the stage stands for it */
      const stage = '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)';
      await expect(
        page.locator(`${stage} [data-free="mark"], ${stage} [data-block="mark"]`),
      ).toHaveCount(0);
      /* a click on the empty top band selects nothing */
      await clearSelection(page);
      const s = await sheetBox(page);
      await page.mouse.click(s.x + 800 * s.k, s.y + 160 * s.k);
      await page.waitForTimeout(600);
      expect(await chip(page), 'the top band click selects nothing').toBeNull();
      /* Tab from nothing takes the title first */
      await clearSelection(page);
      await page.keyboard.press('Tab');
      await expect.poll(() => chip(page), { timeout: 5000 }).toBe('Title');
      /* Select all takes the three drawn objects: the title, the subtitle and the text box */
      await clearSelection(page);
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
      await expect.poll(() => chip(page), { timeout: 5000 }).toBe('3 objects');
      await clearSelection(page);
      /* the Editable text file carries no object for the mark */
      const xml = slidePart((await editablePptx(blank)).bytes, 1);
      expect(xml, 'slide 1 holds the first write').toContain('The first write');
      expect(xml).not.toContain(`name="ts:${blank.titleSlide}#mark`);
    });
  }

  if (isCoreId(FRAMES_ROW)) {
    ids.push(FRAMES_ROW);
    test(title(FRAMES_ROW), async () => {
      test.setTimeout(240_000);
      const blank = await blankDeck(browser());
      const file = await editablePptx(blank);
      expect(file.ms, 'the file arrives within 30 s').toBeLessThan(30_000);
      const xml = slidePart(file.bytes, 2);
      const shape = xfrmOf(xml, `ts:${blank.turnedSlide}#turned-shape`);
      expect(shape, 'the rotated rectangle').toMatch(/^<a:xfrm\b[^>]*\srot="2700000"/);
      for (const id of ['turned-table', 'turned-chart']) {
        const frame = xfrmOf(xml, `ts:${blank.turnedSlide}#${id}`);
        expect(frame, `${id}'s graphic frame`).toBe('<p:xfrm rot="2700000">');
      }
      expect(xml).toContain('<a:tbl>');
      expect(xml).toContain('<c:chart ');
    });
  }

  if (ids.length > 0)
    test.afterAll(async () => {
      test.setTimeout(180_000);
      if (made === null) return;
      try {
        await teardownAll(made.page, made.scratch);
      } finally {
        await made.context.close().catch(() => undefined);
        made = null;
      }
    });

  return ids;
}
