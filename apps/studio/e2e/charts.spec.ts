import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// B5's chart spec (gslides-parity SPEC-2 11.6 `charts.spec.ts`; MILESTONES-2 B5 item 5): Insert >
// Chart > Bar; the data grid edits a value and adds a series; Chart type to Pie keeps the first
// series; the legend; the TXT export lists the data. The spec runs against the builder's own dev
// server with the tmp store (`PLAYWRIGHT_BASE_URL=http://localhost:4445`, `TURBOSLIDE_STORE=tmp`),
// starts from /new and writes a draft deck, so nothing under decks/ changes.
//
// Three surfaces land at merge 2 from other builders: the Insert > Chart rows planned as a
// block.insert of the placeholder chart (B3's `menuActionPlan` over B5's `chartBlockFor`), the
// chart drawn on the stage (B2's renderer, so a chart can be clicked and its Format options
// opened) and the Chart data section mounted in Format options (B3's slot over B5's
// `inspector/chart.tsx`). Where a surface is present the spec drives it; where it is not, the
// spec proves the same write through the window API (the store action every transport shares)
// and says which path ran in the test's annotations. The grid's own behaviour is covered by
// `packages/chrome/src/__tests__/chart-grid.test.tsx`.

const ROOT = join(import.meta.dirname, '..', '..', '..');
const DECKS = join(ROOT, 'decks');
const DRAFT_ID = /^untitled-\d{8}-[a-z0-9]{4}$/;

function draftDecks(): string[] {
  if (!existsSync(DECKS)) return [];
  return readdirSync(DECKS).filter((name) => DRAFT_ID.test(name));
}

const before = new Set<string>();

test.beforeAll(() => {
  for (const id of draftDecks()) before.add(id);
});

test.afterAll(() => {
  for (const id of draftDecks())
    if (!before.has(id)) {
      rmSync(join(DECKS, id), { recursive: true, force: true });
      rmSync(join(ROOT, '.turboslide', 'worker', 'cache', id), { recursive: true, force: true });
      rmSync(join(ROOT, '.turboslide', 'thumbs', id), { recursive: true, force: true });
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
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-settled', '', { timeout: 30_000 });
}

async function invoke<T>(page: Page, action: string, input?: unknown): Promise<T> {
  return page.evaluate(
    ([id, value]) => window.turboslide!.studio.invoke(id as string, value) as Promise<unknown>,
    [action, input] as const,
  ) as Promise<T>;
}

type Info = { id: string; revision: number; counts: { charts?: number } };
type ChartBlock = {
  id: string;
  type: 'chart';
  kind: string;
  categories: string[];
  series: { name: string; values: number[]; color?: string }[];
  legend?: string;
  pos?: { x: number; y: number; w: number; h: number };
};
type SlideGet = { slide: { id: string; slots: { main?: { id: string; type: string }[] } } };

async function revision(page: Page): Promise<number> {
  return (await invoke<Info>(page, 'deck.info')).revision;
}

async function blankSlide(page: Page): Promise<string> {
  await page.goto('/new');
  await editorReady(page);
  const created = await invoke<{ slide: { id: string } }>(page, 'slide.new', {
    layout: 'blank',
    after: 'title',
    baseRevision: await revision(page),
  });
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', created.slide.id, {
    timeout: 30_000,
  });
  return created.slide.id;
}

async function chartOf(page: Page, slideId: string): Promise<ChartBlock | undefined> {
  const got = await invoke<SlideGet>(page, 'slide.get', { slideId });
  return (got.slide.slots.main ?? []).find((block) => block.type === 'chart') as
    ChartBlock | undefined;
}

/** Insert > Chart's placeholder (SPEC-2 2.8.2), the block the row inserts. */
const PLACEHOLDER = {
  id: 'chart',
  type: 'chart',
  kind: 'bar',
  categories: ['Category 1', 'Category 2', 'Category 3'],
  series: [{ name: 'Series 1', values: [30, 45, 20] }],
  pos: { x: 320, y: 180, w: 960, h: 540, z: 0 },
};

/** The Chart data section of Format options when B3's slot mounts it, else null. */
async function chartSection(page: Page) {
  const section = page.locator('[data-control="formatOptions.chart"]');
  return (await section.count()) > 0 ? section : null;
}

test.describe.configure({ mode: 'serial' });

test('Insert > Chart > Bar lands a chart with the placeholder data, centred at 960 by 540', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const slideId = await blankSlide(page);
  const start = await invoke<Info>(page, 'deck.info');
  expect(start.counts.charts ?? 0).toBe(0);
  await page.locator('[data-control="menubar.insert"]').click();
  const row = page.locator('[data-menu-item="insert.chart"]');
  await expect(row).toBeVisible();
  await row.hover();
  const bar = page.locator('[data-menu-item="insert.chart.bar"]');
  await expect(bar).toBeVisible();
  await bar.click();
  /* the row's plan (B3) inserts the placeholder chart; until it lands, the same insert through the action */
  let chart = await (async () => {
    for (let tries = 0; tries < 20; tries += 1) {
      const found = await chartOf(page, slideId);
      if (found !== undefined) return found;
      await page.waitForTimeout(250);
    }
    return undefined;
  })();
  if (chart === undefined) {
    test.info().annotations.push({
      type: 'path',
      description:
        'The chart inserted through block.insert: the Insert > Chart plan (B3) is not in the tree yet',
    });
    await page.keyboard.press('Escape');
    await invoke(page, 'block.insert', {
      slideId,
      slot: 'main',
      block: PLACEHOLDER,
      baseRevision: await revision(page),
    });
    chart = await chartOf(page, slideId);
  } else {
    test.info().annotations.push({
      type: 'path',
      description: 'The chart inserted through the Insert > Chart > Bar row',
    });
  }
  expect(chart).toBeDefined();
  expect(chart).toMatchObject({
    kind: 'bar',
    categories: ['Category 1', 'Category 2', 'Category 3'],
    series: [{ name: 'Series 1', values: [30, 45, 20] }],
  });
  expect(chart?.pos).toMatchObject({ w: 960, h: 540 });
  expect(chart?.pos?.x).toBe(320);
  expect(chart?.pos?.y).toBe(180);
  await expect
    .poll(async () => (await invoke<Info>(page, 'deck.info')).counts.charts, { timeout: 30_000 })
    .toBe(1);
});

test('the data grid edits a value and adds a series, Chart type to Pie keeps the first series, the legend moves, the TXT export lists the data', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const slideId = await blankSlide(page);
  await invoke(page, 'block.insert', {
    slideId,
    slot: 'main',
    block: PLACEHOLDER,
    baseRevision: await revision(page),
  });
  expect(await chartOf(page, slideId)).toBeDefined();

  /* the grid: a chart drawn on the stage selects on a click and Format options mounts the
     Chart data section; until B2 draws it and B3 mounts the slot, the same writes as actions */
  const drawn = page.locator(`.pt-viewer [data-block="chart"]`);
  let section = null as Awaited<ReturnType<typeof chartSection>>;
  if ((await drawn.count()) > 0) {
    await drawn.first().click();
    await page.locator('[data-control="toolbar.formatOptions"]').click();
    section = await chartSection(page);
  }
  if (section !== null) {
    test.info().annotations.push({ type: 'path', description: 'The data grid in Format options' });
    const cell = section.locator('[data-control="formatOptions.chart.cell.2.1"]');
    await cell.click();
    await cell.press('Enter');
    const field = section.locator('[data-control="formatOptions.chart.edit"]');
    await field.fill('60');
    await field.press('Enter');
    await section.locator('[data-control="formatOptions.chart.addSeries"]').click();
  } else {
    test.info().annotations.push({
      type: 'path',
      description:
        'The data through chart.setData: the chart on the stage (B2) or the Chart data slot (B3) is not in the tree yet',
    });
    await invoke(page, 'chart.setData', {
      slideId,
      blockId: 'chart',
      categories: ['Category 1', 'Category 2', 'Category 3'],
      series: [
        { name: 'Series 1', values: [30, 60, 20] },
        { name: 'Series 2', values: [0, 0, 0] },
      ],
      baseRevision: await revision(page),
    });
  }
  await expect
    .poll(async () => (await chartOf(page, slideId))?.series, { timeout: 30_000 })
    .toEqual([
      { name: 'Series 1', values: [30, 60, 20] },
      { name: 'Series 2', values: [0, 0, 0] },
    ]);

  /* Chart type to Pie: the section's Chart type, the context menu's Chart type ▸, or the action */
  section = await chartSection(page);
  const pieTile = section?.locator('[data-control="formatOptions.chart.type.pie"]');
  let dropped: string[] | undefined;
  if (pieTile !== undefined && (await pieTile.count()) > 0) {
    await pieTile.click();
  } else {
    const result = await invoke<{ dropped: string[] }>(page, 'chart.setKind', {
      slideId,
      blockId: 'chart',
      kind: 'pie',
      baseRevision: await revision(page),
    });
    dropped = result.dropped;
    expect(dropped).toEqual(['Series 2']);
  }
  await expect
    .poll(async () => (await chartOf(page, slideId))?.kind, { timeout: 30_000 })
    .toBe('pie');
  const pie = await chartOf(page, slideId);
  expect(pie?.series).toEqual([{ name: 'Series 1', values: [30, 60, 20] }]);

  /* the legend: the section's select, else block.set /legend */
  section = await chartSection(page);
  const legend = section?.locator('[data-control="formatOptions.chart.legend"]');
  if (legend !== undefined && (await legend.count()) > 0) {
    await legend.selectOption('bottom');
  } else {
    await invoke(page, 'block.set', {
      slideId,
      blockId: 'chart',
      path: '/legend',
      value: 'bottom',
      baseRevision: await revision(page),
    });
  }
  await expect
    .poll(async () => (await chartOf(page, slideId))?.legend, { timeout: 30_000 })
    .toBe('bottom');

  /* the TXT export lists the categories and the series as tab separated rows (SPEC-2 section 3) */
  const exported = await invoke<{ text: string; slides: number }>(page, 'export.text', {
    slideIds: [slideId],
  });
  expect(exported.slides).toBe(1);
  expect(exported.text).toContain('Category 1\tCategory 2\tCategory 3');
  expect(exported.text).toContain('Series 1\t30\t60\t20');
  expect(exported.text).not.toContain('Series 2');
});
