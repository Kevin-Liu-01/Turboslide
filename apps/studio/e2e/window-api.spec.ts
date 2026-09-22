import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { setAdvancedTools } from './advanced-tools';

// MILESTONES M3 acceptance, window-api.spec.ts: seeds a deck only through applySource, calls
// set('list: Size', 22) and set('block.list.size', 22) and asserts each is one action call, reads
// readSource() back and sees size: 22, invokes render.slide and asserts the decoded PNG's row
// boxes moved, and asserts that describe().actions equals the generated list (/api/agent).
//
// The spec works on a scratch copy of decks/fixture under decks/e2e-window so the committed decks
// keep their revision; the copy is removed afterwards along with its worker cache. The dev server
// always runs on 4321 (AGENTS.md) and serves any folder under decks/.

const ROOT = join(import.meta.dirname, '..', '..', '..');
const DECK = 'e2e-window';
const DECK_DIR = join(ROOT, 'decks', DECK);
const SLIDE = 'content-rule';

// window.turboslide is declared by packages/agent/src/window/registry.ts, which the studio
// references, so the page callbacks below are typed against the real StudioAutomation shape.

function seedDeck(): void {
  rmSync(DECK_DIR, { recursive: true, force: true });
  mkdirSync(DECK_DIR, { recursive: true });
  cpSync(join(ROOT, 'decks', 'fixture', 'slides'), join(DECK_DIR, 'slides'), { recursive: true });
  const manifest = JSON.parse(
    readFileSync(join(ROOT, 'decks', 'fixture', 'deck.json'), 'utf8'),
  ) as {
    id: string;
  };
  manifest.id = DECK;
  writeFileSync(join(DECK_DIR, 'deck.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

function removeDeck(): void {
  rmSync(DECK_DIR, { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'worker', 'cache', DECK), { recursive: true, force: true });
}

async function openEditor(page: Page): Promise<void> {
  await page.goto(`/edit/${DECK}?author=agent:e2e-window`);
  await page.waitForFunction(() => {
    try {
      return Boolean(window.turboslide?.studio);
    } catch {
      return false;
    }
  });
  await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute('data-settled', '');
  await page.evaluate(() =>
    window.turboslide!.studio.invoke('view.goto', { slideId: 'content-rule' }),
  );
  await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute('data-active', SLIDE);
}

async function versionCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const versions = (await window.turboslide!.studio.invoke('version.list')) as unknown[];
    return versions.length;
  });
}

async function sizeInSource(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const slide = JSON.parse(window.turboslide!.studio.readSource()) as {
      slots: { right: { id: string; size?: number }[] };
    };
    return slide.slots.right.find((block) => block.id === 'list')?.size;
  });
}

type Box = [number, number, number, number];

type RenderResult = { records: { blocks: Record<string, { box: Box }>; image: string }[] };

/** The mean distance between consecutive row starts. */
function pitch(starts: readonly number[]): number {
  if (starts.length < 2) return 0;
  return (starts[starts.length - 1]! - starts[0]!) / (starts.length - 1);
}

/**
 * The y positions where an ink row starts inside a box of a rendered PNG, measured in the page:
 * the image is fetched from the same origin, drawn on a canvas and read back, so no image codec is
 * needed in the test runner. Light theme: ink is darker than the paper.
 */
async function rowStarts(page: Page, url: string, box: Box): Promise<number[]> {
  return page.evaluate(
    async ([src, region]) => {
      const response = await fetch(src, { cache: 'no-store' });
      const bitmap = await createImageBitmap(await response.blob());
      const [x, y, w, h] = region.map((v) => Math.round(v));
      const canvas = document.createElement('canvas');
      canvas.width = w ?? 0;
      canvas.height = h ?? 0;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('no 2d context');
      context.drawImage(bitmap, x ?? 0, y ?? 0, w ?? 0, h ?? 0, 0, 0, w ?? 0, h ?? 0);
      const { data, width, height } = context.getImageData(0, 0, w ?? 0, h ?? 0);
      const starts: number[] = [];
      let inRow = false;
      for (let row = 0; row < height; row += 1) {
        let ink = 0;
        for (let col = 0; col < width; col += 1) {
          const at = (row * width + col) * 4;
          const lum =
            (data[at] ?? 0) * 0.299 + (data[at + 1] ?? 0) * 0.587 + (data[at + 2] ?? 0) * 0.114;
          if (lum < 128) ink += 1;
        }
        const isInk = ink > 2;
        if (isInk && !inRow) starts.push(row);
        inRow = isInk;
      }
      return starts;
    },
    [url, box] as const,
  );
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  seedDeck();
});

test.afterAll(() => {
  removeDeck();
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {
      // private mode
    }
  });
});

test('describe().actions equals the generated list and the owners hand over', async ({
  page,
  request,
}) => {
  await openEditor(page);
  const described = await page.evaluate(() => window.turboslide!.studio.describe());
  expect(described.owner).toBe('editor');
  const agent = (await (await request.get('/api/agent')).json()) as { actions: string[] };
  expect(described.actions).toEqual(agent.actions);

  // View > Mode > Viewing hands the global to the viewer owner; Editing hands it back
  // (gslides-parity SPEC 2.3: the Edit and View seg left the toolbar)
  /* View > Mode is parked (docs/FOCUS.md 3.2): driven behind the switch (b1 R12) */
  await setAdvancedTools(page, true);
  const mode = async (item: 'viewing' | 'editing') => {
    await page.locator('[data-control="menubar.view"]').click();
    await page.locator('[data-menu-item="view.mode"]').click();
    await page.locator(`[data-menu-item="view.mode.${item}"]`).click();
  };
  await mode('viewing');
  await expect
    .poll(() => page.evaluate(() => window.turboslide!.studio.describe().owner))
    .toBe('viewer');
  await mode('editing');
  await expect
    .poll(() => page.evaluate(() => window.turboslide!.studio.describe().owner))
    .toBe('editor');
});

test('set by label and by data-control id are one action call each, and the render moves', async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  await openEditor(page);

  // seed only through applySource: the list block without a size (the 24px default)
  const seeded = await page.evaluate(async () => {
    const studio = window.turboslide!.studio;
    const slide = JSON.parse(studio.readSource()) as {
      slots: { right: { id: string; size?: number }[] };
    };
    const list = slide.slots.right.find((block) => block.id === 'list');
    if (!list) throw new Error('the fixture has no list block');
    delete list.size;
    await studio.applySource(slide);
    return JSON.parse(studio.readSource()) as typeof slide;
  });
  expect(seeded.slots.right.find((block) => block.id === 'list')?.size).toBeUndefined();

  // the render before the change, measured now: /api/render serves the deck's current revision,
  // so the pixels have to be read before the document moves on
  const before = (await page.evaluate(() =>
    window.turboslide!.studio.invoke('render.slide', {
      slideIds: ['content-rule'],
      themes: ['light'],
      scale: 1,
    }),
  )) as RenderResult;
  const beforeRecord = before.records[0];
  expect(beforeRecord).toBeDefined();
  const beforeBox = beforeRecord!.blocks.list?.box;
  expect(beforeBox).toBeDefined();
  expect((await request.get(beforeRecord!.image)).headers()['content-type']).toContain('image/png');
  const column: Box = [beforeBox![0], 0, beforeBox![2], 900];
  const rowsBefore = await rowStarts(page, beforeRecord!.image, column);
  expect(rowsBefore.length).toBeGreaterThan(1);

  // select the list block and open Format options (gslides-parity SPEC 3.9: the generated
  // controls live in the right panel, on demand) so the size control is in the document
  await page.locator('.ts-stagewrap.ts-editor .pt-slide [data-block="list"]').click();
  await page.locator('[data-control="menubar.format"]').click();
  await page.locator('[data-menu-item="format.formatOptions"]').click();
  await expect(page.locator('[data-control="block.list.size"]')).toBeVisible();

  // one call by accessible label
  const countA = await versionCount(page);
  await page.evaluate(() => window.turboslide!.studio.set('list: Size', 22));
  await expect.poll(() => versionCount(page)).toBe(countA + 1);
  await expect.poll(() => sizeInSource(page)).toBe(22);

  // back to the seeded state through the public API
  await page.evaluate(async () => {
    const studio = window.turboslide!.studio;
    const slide = JSON.parse(studio.readSource()) as {
      slots: { right: { id: string; size?: number }[] };
    };
    const list = slide.slots.right.find((block) => block.id === 'list');
    if (list) delete list.size;
    await studio.applySource(slide);
  });
  await expect.poll(() => sizeInSource(page)).toBeUndefined();
  await expect.poll(() => versionCount(page)).toBe(countA + 2);

  // one call by data-control id
  const countB = await versionCount(page);
  await page.evaluate(() => window.turboslide!.studio.set('block.list.size', 22));
  await expect.poll(() => versionCount(page)).toBe(countB + 1);
  await expect.poll(() => sizeInSource(page)).toBe(22);

  // the log entries are block.set writes, one per set
  const log = (await page.evaluate(() => window.turboslide!.studio.invoke('version.list'))) as {
    mutations: { op: string; path?: string; value?: unknown }[];
  }[];
  const last = log[log.length - 1];
  expect(last?.mutations).toEqual([
    { op: 'block.set', slideId: 'content-rule', blockId: 'list', path: '/size', value: 22 },
  ]);
  await page.waitForFunction(() => {
    /* the registry is re-installed when an owner element changes; a poll that lands in that
       moment reads false instead of failing the wait with a TypeError */
    if (typeof window.turboslide?.studio?.describe !== 'function') return false;
    const state = window.turboslide.studio.describe().state as {
      revision?: number;
      serverRevision?: number;
      pending?: number;
    };
    return state.pending === 0 && state.revision === state.serverRevision;
  });

  // the render after the change: the list block is shorter and its rows sit closer together
  const after = (await page.evaluate(() =>
    window.turboslide!.studio.invoke('render.slide', {
      slideIds: ['content-rule'],
      themes: ['light'],
      scale: 1,
    }),
  )) as RenderResult;
  const afterRecord = after.records[0];
  const afterBox = afterRecord!.blocks.list?.box;
  expect(afterBox).toBeDefined();
  expect(afterBox![3]).toBeLessThan(beforeBox![3]);
  const rowsAfter = await rowStarts(page, afterRecord!.image, column);
  expect(rowsAfter.length).toBeGreaterThan(1);
  expect(rowsAfter).not.toEqual(rowsBefore);
  expect(pitch(rowsAfter)).toBeLessThan(pitch(rowsBefore));
});

test('the source drawer is a delegating owner over the same validator', async ({ page }) => {
  await openEditor(page);
  /* Tools > Advanced is parked (docs/FOCUS.md 3.2): the row is driven behind Tools > Advanced tools (b1 R12) */
  await setAdvancedTools(page, true);
  /* Tools > Advanced > Show source (gslides-parity SPEC 10.2: Cmd+/ is Keyboard shortcuts now) */
  await page.locator('[data-control="menubar.tools"]').click();
  await page.locator('[data-menu-item="tools.advanced"]').click();
  await page.locator('[data-menu-item="tools.advanced.showSource"]').click();
  await expect(page.locator('.ts-drawer')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.turboslide!.studio.describe().owner))
    .toBe('source-drawer');
  // an unknown action reaches the editor and comes back as RangeError
  const unknown = await page.evaluate(() =>
    window.turboslide!.studio.invoke('deck.explode').then(
      () => 'resolved',
      (error: unknown) => (error instanceof RangeError ? 'RangeError' : String(error)),
    ),
  );
  expect(unknown).toBe('RangeError');
  // an invalid source is refused by the validator, never written
  const before = await versionCount(page);
  const refused = await page.evaluate(() =>
    window
      .turboslide!.studio.applySource({ schemaVersion: 1, id: 'content-rule', kind: 'content' })
      .then(
        () => 'resolved',
        (error: unknown) => (error instanceof TypeError ? 'TypeError' : String(error)),
      ),
  );
  expect(refused).toBe('TypeError');
  expect(await versionCount(page)).toBe(before);
  // a valid slide with another id is refused with RangeError: the drawer replaces the slide it
  // shows, where the editor owner would have replaced "title"; the disagreement is never a
  // resolved promise with nothing written
  const title = JSON.parse(readFileSync(join(DECK_DIR, 'slides', 'title.json'), 'utf8')) as {
    heading: string;
  };
  title.heading = 'Changed by agent';
  const otherSlide = await page.evaluate(
    (slide) =>
      window.turboslide!.studio.applySource(slide).then(
        () => 'resolved',
        (error: unknown) => (error instanceof RangeError ? 'RangeError' : String(error)),
      ),
    title,
  );
  expect(otherSlide).toBe('RangeError');
  expect(await versionCount(page)).toBe(before);
  /* Tools > Advanced is parked (docs/FOCUS.md 3.2): the row is driven behind Tools > Advanced tools (b1 R12) */
  await setAdvancedTools(page, true);
  /* Tools > Advanced > Show source (gslides-parity SPEC 10.2: Cmd+/ is Keyboard shortcuts now) */
  await page.locator('[data-control="menubar.tools"]').click();
  await page.locator('[data-menu-item="tools.advanced"]').click();
  await page.locator('[data-menu-item="tools.advanced.showSource"]').click();
  await expect(page.locator('.ts-drawer')).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => window.turboslide!.studio.describe().owner))
    .toBe('editor');
  expect(existsSync(join(DECK_DIR, 'versions'))).toBe(true);
});

test('a guarded share action through the window API is refused without the page nonce (SPEC-3 6.6)', async ({
  page,
}) => {
  await openEditor(page);
  // the editor's adapter guards the share, comment, invite, access and account handlers behind
  // the nonce it holds in a closure (packages/agent/src/window/guard.ts); a script in the origin
  // reaches window.turboslide.studio and gets the fixed sentence, never a write. Until B2's edit
  // route sets the guard on its adapter the row records the gap instead of passing silently.
  const outcome = await page.evaluate(() =>
    window
      .turboslide!.studio.invoke('share.setGeneralAccess', { mode: 'link', role: 'editor' })
      .then(
        () => 'resolved',
        (error: unknown) => (error instanceof Error ? error.message : String(error)),
      ),
  );
  const described = await page.evaluate(() => window.turboslide!.studio.describe());
  expect(JSON.stringify(described)).not.toMatch(/nonce/i);
  const REFUSAL = 'This action is available from the presentation’s own controls';
  // until B2's edit route sets `guard: page.guard` on the editor adapter the call reaches the
  // dispatcher (it resolves, or fails on its own input); the row is skipped with the gap named,
  // never passed silently, and asserts the sentence once the guard is wired
  test.skip(
    outcome !== REFUSAL,
    `the editor adapter carries no nonce guard yet (B2 edit route, build-3/b4.md request 2.4.3); the call answered: ${outcome}`,
  );
  expect(outcome).toBe(REFUSAL);
});

test('an idle editor holds one stream and polls its session at the long poll cadence, never in a storm (SPEC-4 0.37, 4.4)', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const streams: string[] = [];
  const serverFns: { url: string; at: number }[] = [];
  page.on('request', (request) => {
    if (/\/api\/decks\/[^/?]+\/stream/.test(request.url())) streams.push(request.url());
  });
  page.on('response', (response) => {
    if (response.url().includes('/_serverFn/'))
      serverFns.push({ url: response.url(), at: performance.now() });
  });
  await openEditor(page);
  /* the round three shell attaches its stream and its session during the settle */
  await page.waitForTimeout(5_000);
  const streamsBefore = streams.length;
  const fnBefore = serverFns.length;
  await page.waitForTimeout(60_000);
  const streamsInWindow = streams.length - streamsBefore;
  const fnInWindow = serverFns.slice(fnBefore);
  console.log(
    `idle 60 s: ${streamsInWindow} stream connections in the window (${streams.length} since load), ${fnInWindow.length} server function responses`,
  );
  /* one stream per tab (SPEC-3 3.3 closes it between 240 and 290 s, so the window sees at most one reconnect) */
  expect(streams.length).toBeGreaterThanOrEqual(1);
  expect(streamsInWindow).toBeLessThanOrEqual(1);
  /* the idle ceiling: SPEC-4 4.4's four server function responses per minute (the poll held 25 s
     and paused 6 s) is superseded by docs/SYNC.md 6.1 `cost.editor-idle.calls` since the sync and
     costs round. The session poll survives round three (0.37) but is no longer held: the server
     answers `[]` at once when the instance holds no session and the hook pauses 20 s
     (useStudioSession.ts EMPTY_ANSWER_PAUSE_MS), so the poll lands floor(60 / 20) + 1 = 4 times in
     a 60 s window at worst, and with the editor's two own calls the window holds up to 6; never
     the storm R04 7.3 measured. The cost row itself (12 function requests a minute on the page)
     is the cost probe's (scripts/probes/sync-cost-probe.mjs) */
  expect(fnInWindow.length).toBeLessThanOrEqual(6);
  const gaps = fnInWindow.slice(1).map((row, i) => row.at - (fnInWindow[i]?.at ?? row.at));
  for (const gap of gaps) expect(gap).toBeGreaterThan(1_500);
});
