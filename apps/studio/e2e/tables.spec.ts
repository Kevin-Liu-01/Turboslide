import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// B5's table spec (gslides-parity SPEC-2 11.6 `tables.spec.ts`; MILESTONES-2 B5 item 5): the
// Insert > Table hover grid inserts 4 by 3 on a blank slide; a cell range; Merge cells and
// Unmerge cells; a cell fill; Distribute rows; insert two rows below. The spec runs against the
// builder's own dev server with the tmp store (`PLAYWRIGHT_BASE_URL=http://localhost:4445`,
// `TURBOSLIDE_STORE=tmp`), starts from /new and writes a draft deck, so nothing under decks/
// changes; the draft folders the tmp store may leave are removed afterwards.
//
// Two surfaces of the table tools are other builders' and land at merge 2: the cell range drag
// on the stage (B4) and the Table section mounted in Format options (B3's slot over B5's
// `inspector/table.tsx`). Where the surface is present the spec drives it; where it is not, the
// spec proves the same write through the window API (the store action every transport shares)
// and asserts the rendered DOM, and says which path ran in the test's annotations. The section's
// own behaviour is covered by `packages/chrome/src/__tests__/table-section.test.tsx`.

const ROOT = join(import.meta.dirname, '..', '..', '..');
const DECKS = join(ROOT, 'decks');
const DRAFT_ID = /^untitled-\d{8}-[a-z0-9]{4}$/;

function draftDecks(): string[] {
  if (!existsSync(DECKS)) return [];
  return readdirSync(DECKS).filter((name) => DRAFT_ID.test(name));
}

const before = new Set<string>();
/** The drafts this run created, by id, so the cleanup can wait for their folders. */
const created = new Set<string>();

test.beforeAll(() => {
  for (const id of draftDecks()) before.add(id);
});

test.afterAll(async () => {
  /* on the file store the deck folder appears with the room's checkpoint (SPEC-3 0.8, 2 s after
     the last write), which can be after the last test ended: wait for every draft this run made */
  const deadline = Date.now() + 6_000;
  while (Date.now() < deadline && [...created].some((id) => !existsSync(join(DECKS, id))))
    await new Promise((resolve) => setTimeout(resolve, 200));
  for (const id of new Set([...created, ...draftDecks()]))
    if (!before.has(id)) {
      rmSync(join(DECKS, id), { recursive: true, force: true });
      rmSync(join(ROOT, '.turboslide', 'worker', 'cache', id), { recursive: true, force: true });
      rmSync(join(ROOT, '.turboslide', 'thumbs', id), {
        recursive: true,
        force: true,
        /* the thumbnail worker may still be writing a frame into the folder */
        maxRetries: 5,
        retryDelay: 100,
      });
    }
});

async function editorReady(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    try {
      return Boolean(window.turboslide?.studio);
    } catch {
      return false;
    }
  });
  await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute('data-settled', '', {
    timeout: 30_000,
  });
}

async function invoke<T>(page: Page, action: string, input?: unknown): Promise<T> {
  /* the registry is re-installed when an owner element changes (registerStudioAutomation deletes
     and re-sets window.turboslide): a call that lands in that moment waits for it instead of
     failing on `undefined.studio` */
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 10_000 });
  return page.evaluate(
    ([id, value]) => window.turboslide!.studio.invoke(id as string, value) as Promise<unknown>,
    [action, input] as const,
  ) as Promise<T>;
}

type Info = { id: string; revision: number };
type TableBlock = {
  id: string;
  type: 'table';
  columns: unknown[];
  rows: { cells: string[]; height?: number }[];
  spans?: { row: number; column: number; rows: number; columns: number }[];
  cells?: { row: number; column: number; fill?: string }[];
  pos?: { x: number; y: number; w: number; h: number };
};
type SlideGet = {
  slide: { id: string; layout: { type: string }; slots: { main?: { id: string; type: string }[] } };
};

async function revision(page: Page): Promise<number> {
  return (await invoke<Info>(page, 'deck.info')).revision;
}

/** A fresh draft with one blank (canvas) slide selected. */
async function blankSlide(page: Page): Promise<string> {
  await page.goto('/new');
  await editorReady(page);
  const made = await invoke<{ slide: { id: string } }>(page, 'slide.new', {
    layout: 'blank',
    after: 'title',
    baseRevision: await revision(page),
  });
  await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute(
    'data-active',
    made.slide.id,
    {
      timeout: 30_000,
    },
  );
  /* the registry is re-installed while the first write moves the address to /edit: wait for it */
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 10_000 });
  const deckId = await page.evaluate(
    () => window.turboslide!.studio.describe().state.deckId as string,
  );
  if (DRAFT_ID.test(deckId)) created.add(deckId);
  return made.slide.id;
}

async function tableOf(page: Page, slideId: string): Promise<TableBlock> {
  const got = await invoke<SlideGet>(page, 'slide.get', { slideId });
  const table = (got.slide.slots.main ?? []).find((block) => block.type === 'table') as
    TableBlock | undefined;
  expect(table, 'the slide holds a table').toBeDefined();
  return table as TableBlock;
}

/**
 * The rendered cells of the table on the stage, by their run pointers. Scoped to the editor's
 * own sheet: the filmstrip's live clone thumbnails carry the same `data-run` attributes (26
 * `.ts-sheet` roots in the editor's document), so a `.pt-viewer` wide locator counted every cell
 * twice and hit a strict mode violation (VERIFICATION-2 finding 28).
 */
function cells(page: Page, tableId: string) {
  return page.locator(`.ts-stagewrap.ts-editor .pt-slide [data-run^="${tableId}/rows/"]`);
}

function cell(page: Page, tableId: string, row: number, column: number) {
  return page.locator(
    `.ts-stagewrap.ts-editor .pt-slide [data-run="${tableId}/rows/${row}/cells/${column}"]`,
  );
}

/** The Table section of Format options when B3's slot mounts it, else null. */
async function tableSection(page: Page) {
  const section = page.locator('[data-control="formatOptions.table"]');
  return (await section.count()) > 0 ? section : null;
}

test.describe.configure({ mode: 'serial' });

test('Insert > Table opens the hover grid, the caption follows the pointer and a click inserts 4 by 3', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const slideId = await blankSlide(page);
  await page.locator('[data-control="menubar.insert"]').click();
  const row = page.locator('[data-menu-item="insert.table"]');
  await expect(row).toBeVisible();
  await row.hover();
  const grid = page.locator('[data-control="insert.table.grid"]');
  await expect(grid).toBeVisible();
  await expect(grid).toHaveAttribute('role', 'grid');
  await page.locator('[data-control="insert.table.pick.4x3"]').hover();
  await expect(page.locator('[data-control="insert.table.size"]')).toHaveText('4 x 3');
  await page.locator('[data-control="insert.table.pick.4x3"]').click();
  /* the write: one block.insert of an empty table with a header row, positioned on the canvas */
  await expect
    .poll(
      async () => {
        const got = await invoke<SlideGet>(page, 'slide.get', { slideId });
        return (got.slide.slots.main ?? []).filter((block) => block.type === 'table').length;
      },
      { timeout: 30_000 },
    )
    .toBe(1);
  const table = await tableOf(page, slideId);
  expect(table.columns).toHaveLength(4);
  expect(table.rows).toHaveLength(3);
  expect(table.rows[0]).toMatchObject({ header: true });
  expect(table.pos).toBeDefined();
  /* the stage draws twelve cells */
  await expect(cells(page, table.id)).toHaveCount(12, { timeout: 30_000 });
});

test('a cell range, Merge cells and Unmerge cells', async ({ page }) => {
  test.setTimeout(120_000);
  const slideId = await blankSlide(page);
  await invoke(page, 'block.insert', {
    slideId,
    slot: 'main',
    block: {
      id: 'table',
      type: 'table',
      columns: [{}, {}, {}, {}],
      rows: [
        { cells: ['Region', 'Q1', 'Q2', 'Q3'], header: true },
        { cells: ['North', '100', '200', '300'] },
        { cells: ['South', '400', '500', '600'] },
      ],
      pos: { x: 320, y: 290, w: 960, h: 320, z: 0 },
    },
    baseRevision: await revision(page),
  });
  await expect(cells(page, 'table')).toHaveCount(12, { timeout: 30_000 });

  /* the range: a drag from (1, 1) to (2, 2) on the stage when B4's range selection is in, else
     the same range through the action (the store action every transport shares) */
  const from = cell(page, 'table', 1, 1);
  const to = cell(page, 'table', 2, 2);
  await from.click();
  const fromBox = await from.boundingBox();
  const toBox = await to.boundingBox();
  if (fromBox && toBox) {
    await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, { steps: 6 });
    await page.mouse.up();
  }
  const section = await (async () => {
    await page.locator('[data-control="toolbar.formatOptions"]').click();
    return tableSection(page);
  })();
  const merge = section?.locator('[data-control="formatOptions.table.merge"]');
  if (section !== null && merge !== undefined && (await merge.isEnabled())) {
    test.info().annotations.push({
      type: 'path',
      description: 'Merge cells through the Table section after a range drag',
    });
    await merge.click();
  } else {
    test.info().annotations.push({
      type: 'path',
      description:
        'Merge cells through table.merge: the range drag (B4) or the Table section slot (B3) is not in the tree yet',
    });
    await invoke(page, 'table.merge', {
      slideId,
      blockId: 'table',
      from: [1, 1],
      to: [2, 2],
      baseRevision: await revision(page),
    });
  }
  await expect
    .poll(async () => (await tableOf(page, slideId)).spans, { timeout: 30_000 })
    .toEqual([{ row: 1, column: 1, rows: 2, columns: 2 }]);
  /* Google joins the texts; the anchor draws the span, the covered cells are not drawn */
  const merged = await tableOf(page, slideId);
  expect(merged.rows[1]?.cells[1]).toBe('100\n200\n400\n500');
  await expect(cell(page, 'table', 1, 1)).toHaveAttribute('data-span', '2x2', { timeout: 30_000 });
  await expect(cells(page, 'table')).toHaveCount(9);

  /* Unmerge: the section's button on the anchor, else the action */
  await cell(page, 'table', 1, 1).click();
  const unmerge = (await tableSection(page))?.locator(
    '[data-control="formatOptions.table.unmerge"]',
  );
  if (unmerge !== undefined && (await unmerge.count()) > 0 && (await unmerge.isEnabled())) {
    await unmerge.click();
  } else {
    await invoke(page, 'table.unmerge', {
      slideId,
      blockId: 'table',
      at: [1, 1],
      baseRevision: await revision(page),
    });
  }
  await expect
    .poll(async () => (await tableOf(page, slideId)).spans ?? [], { timeout: 30_000 })
    .toEqual([]);
  await expect(cells(page, 'table')).toHaveCount(12);
});

test('a cell fill, Distribute rows and two rows inserted below', async ({ page }) => {
  test.setTimeout(120_000);
  const slideId = await blankSlide(page);
  await invoke(page, 'block.insert', {
    slideId,
    slot: 'main',
    block: {
      id: 'table',
      type: 'table',
      columns: [{}, {}, {}],
      rows: [
        { cells: ['Plan', 'Seats', 'Price'], header: true },
        { cells: ['Team', '10', '$1,200'] },
        { cells: ['Business', '50', '$4,800'] },
      ],
      pos: { x: 320, y: 290, w: 960, h: 320, z: 0 },
    },
    baseRevision: await revision(page),
  });
  await expect(cells(page, 'table')).toHaveCount(9, { timeout: 30_000 });

  /* the cell fill: the section's swatch on the selected cell, else table.cellStyle */
  await cell(page, 'table', 2, 2).click();
  await page.locator('[data-control="toolbar.formatOptions"]').click();
  let section = await tableSection(page);
  const swatch = section?.locator('[data-control="formatOptions.table.cell.fill.plate"]');
  if (swatch !== undefined && (await swatch.count()) > 0 && (await swatch.isEnabled())) {
    test
      .info()
      .annotations.push({ type: 'path', description: 'Cell fill through the Table section' });
    await swatch.click();
  } else {
    test.info().annotations.push({
      type: 'path',
      description:
        'Cell fill through table.cellStyle: the Table section slot (B3) is not in the tree yet',
    });
    await invoke(page, 'table.cellStyle', {
      slideId,
      blockId: 'table',
      cells: [[2, 2]],
      fill: 'plate',
      baseRevision: await revision(page),
    });
  }
  await expect
    .poll(async () => (await tableOf(page, slideId)).cells, { timeout: 30_000 })
    .toEqual([{ row: 2, column: 2, fill: 'plate' }]);
  await expect(cell(page, 'table', 2, 2)).toHaveAttribute('style', /background:/, {
    timeout: 30_000,
  });

  /* Distribute rows: equal heights from the declared total */
  section = await tableSection(page);
  const distribute = section?.locator('[data-control="formatOptions.table.distributeRows"]');
  if (distribute !== undefined && (await distribute.count()) > 0) {
    await distribute.click();
  } else {
    await invoke(page, 'table.distribute', {
      slideId,
      blockId: 'table',
      axis: 'rows',
      total: 320,
      baseRevision: await revision(page),
    });
  }
  await expect
    .poll(
      async () => {
        const heights = (await tableOf(page, slideId)).rows.map((row) => row.height);
        return new Set(heights).size === 1 ? heights.length : 0;
      },
      { timeout: 30_000 },
    )
    .toBe(3);

  /* insert two rows below the selected row */
  section = await tableSection(page);
  const count = section?.locator('[data-control="formatOptions.table.count"]');
  const insertBelow = section?.locator('[data-control="formatOptions.table.insertRowsBelow"]');
  if (
    count !== undefined &&
    insertBelow !== undefined &&
    (await insertBelow.count()) > 0 &&
    (await insertBelow.isEnabled())
  ) {
    await count.fill('2');
    await insertBelow.click();
  } else {
    await invoke(page, 'table.insertRows', {
      slideId,
      blockId: 'table',
      at: 2,
      count: 2,
      where: 'below',
      baseRevision: await revision(page),
    });
  }
  await expect
    .poll(async () => (await tableOf(page, slideId)).rows.length, { timeout: 30_000 })
    .toBe(5);
  const grown = await tableOf(page, slideId);
  expect(grown.rows[3]?.cells).toEqual(['', '', '']);
  expect(grown.rows[4]?.cells).toEqual(['', '', '']);
  /* the styled cell kept its place */
  expect(grown.cells).toEqual([{ row: 2, column: 2, fill: 'plate' }]);
  await expect(cells(page, 'table')).toHaveCount(15, { timeout: 30_000 });
});
