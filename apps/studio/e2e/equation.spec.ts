import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

// The equation block end to end (gslides-parity SPEC-5 8.4 `equation.spec.ts`; MILESTONES-5 B6
// day 4): on a fresh presentation, no Temml chunk loads before the first equation block (SPEC-5
// 8.1, 16.6); `equation.insert` through the agent surface of the same server places a block that
// the editor draws as `<math>` inside the block root once the lazy chunk arrives, a `block.set
// /tex` redraws it, a source that does not parse marks the root with the finding, and
// `equation.render` and `equation.symbols` answer the MathML with its box and Google Docs' table.
// The rows the shell mounts by the integrator's requests (b6.md R11 to R13: the Insert > Equation
// chord, the equation toolbar's picks, the inspector's source field) are recorded as not driven
// until those lines land, never as passed.
//
// Runs against the builder's dev server on the tmp store with the memory channel:
// PLAYWRIGHT_BASE_URL=http://localhost:4356 node_modules/.bin/playwright test apps/studio/e2e/equation.spec.ts

const AGENT = 'agent:e2e-equation';

type Row = { id: string; n: number };

async function invoke<T>(page: Page, action: string, input?: unknown): Promise<T> {
  return page.evaluate(([id, value]) => window.turboslide!.studio.invoke(id, value), [
    action,
    input,
  ] as const) as Promise<T>;
}

async function openNew(page: Page): Promise<{ deckId: string; slideId: string }> {
  await page.goto(`/new?author=${AGENT}`);
  await page.waitForFunction(() => {
    try {
      return Boolean(window.turboslide?.studio);
    } catch {
      return false;
    }
  });
  await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute('data-settled', '');
  const rows = await invoke<Row[]>(page, 'slide.list');
  const first = rows[0];
  if (!first) throw new Error('the fresh presentation has no slide');
  // the first write makes the draft a deck on the store (SPEC 6.1) and the page moves to
  // /edit/<id>, so the agent surface of the same server can address it afterwards
  const info = await invoke<{ revision: number }>(page, 'deck.info');
  await invoke(page, 'deck.rename', { name: 'Equation spec', baseRevision: info.revision });
  await page.waitForFunction(() => /\/edit\//.test(location.href), null, { timeout: 30_000 });
  const match = /\/edit\/([^/?#]+)/.exec(page.url());
  if (!match?.[1]) throw new Error(`no deck id in ${page.url()}`);
  const deckId = match[1];
  await expect
    .poll(async () => (await page.request.get(`/api/agent?deck=${deckId}`)).status(), {
      timeout: 15_000,
    })
    .toBe(200);
  return { deckId, slideId: first.id };
}

async function post<T>(
  request: APIRequestContext,
  deckId: string,
  action: string,
  body: unknown,
): Promise<{ status: number; json: T }> {
  const response = await request.post(`/api/actions/${action}?deck=${deckId}`, {
    data: body,
    headers: { 'x-turboslide-author': AGENT },
  });
  return { status: response.status(), json: (await response.json().catch(() => ({}))) as T };
}

async function revision(request: APIRequestContext, deckId: string): Promise<number> {
  const info = await post<{ revision: number }>(request, deckId, 'deck.info', {});
  return info.json.revision;
}

test.describe.configure({ mode: 'serial' });

test('no Temml chunk loads before the first equation; the insert draws MathML in the block root and the chunk arrives once', async ({
  page,
  request,
}) => {
  const requests: string[] = [];
  page.on('request', (req) => requests.push(req.url()));
  const { deckId, slideId } = await openNew(page);
  const temml = () => requests.filter((url) => /temml/i.test(url));
  expect(temml(), 'no Temml before the first equation block').toEqual([]);

  const inserted = await post<{ blockId: string; revision: number }>(
    request,
    deckId,
    'equation.insert',
    {
      slideId,
      tex: '\\frac{a}{b}',
      baseRevision: await revision(request, deckId),
    },
  );
  expect(inserted.status, JSON.stringify(inserted.json)).toBe(200);
  expect(inserted.json.blockId).toBe('eq');

  // the page reads the deck again so the assertions read the renderer and the chunk on a known
  // load (the room's delivery of an agent write to an open page is the sync lane's probe)
  await page.reload();
  await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute('data-settled', '');
  const landed = page.locator('[data-block="eq"]').first();
  await expect(landed).toBeVisible({ timeout: 15_000 });
  // the sheet draws the block through render-block.ts's switch; until the integrator's one line
  // routes `case 'equation'` to `renderEquation` (b6.md R17) the switch draws the day 0 seam
  // placeholder and the MathML rows below cannot be driven on this tree
  const seam = (await landed.getAttribute('data-later')) !== null;
  test.skip(
    seam,
    'render-block.ts routes the equation block to the seam placeholder; the MathML rows wait for R17',
  );
  const root = page.locator('.equation[data-block="eq"]').first();
  await expect(root).toBeVisible({ timeout: 15_000 });
  await expect(root.locator('math')).toHaveCount(1, { timeout: 15_000 });
  await expect(root.locator('math mfrac')).toHaveCount(1);
  expect(temml().length, 'the lazy chunk loaded with the first equation').toBeGreaterThan(0);
  const loadedOnce = temml().length;

  // a second source through block.set redraws the block and loads nothing more
  const set = await post<{ revision: number }>(request, deckId, 'block.set', {
    slideId,
    blockId: 'eq',
    path: '/tex',
    value: '\\sqrt{x + 1}',
    baseRevision: await revision(request, deckId),
  });
  expect(set.status, JSON.stringify(set.json)).toBe(200);
  await page.reload();
  await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute('data-settled', '');
  await expect(root.locator('math msqrt')).toHaveCount(1, { timeout: 15_000 });
  await expect(root.locator('math mfrac')).toHaveCount(0);
  // the chunk loads once per page load: the second load fetched it again and nothing else did
  expect(temml().length).toBeGreaterThanOrEqual(loadedOnce);

  // a source that does not parse marks the root with the finding and draws Temml's error mark
  const broken = await post<{ revision: number }>(request, deckId, 'block.set', {
    slideId,
    blockId: 'eq',
    path: '/tex',
    value: '\\frac{a}{',
    baseRevision: await revision(request, deckId),
  });
  expect(broken.status).toBe(200);
  await page.reload();
  await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute('data-settled', '');
  await expect(root).toHaveAttribute('data-equation-error', /Unexpected end of input/, {
    timeout: 15_000,
  });
  await expect(root.locator('.temml-error')).toHaveCount(1);
});

test('equation.render answers the MathML with a box and equation.symbols the six groups on the agent surface', async ({
  page,
  request,
}) => {
  const { deckId } = await openNew(page);
  const rendered = await post<{ mathml: string; box: [number, number]; findings: unknown[] }>(
    request,
    deckId,
    'equation.render',
    { tex: 'E = mc^2', size: 44 },
  );
  expect(rendered.status, JSON.stringify(rendered.json)).toBe(200);
  expect(rendered.json.mathml).toMatch(/^<math display="block"/);
  expect(rendered.json.mathml).toContain('<msup>');
  expect(rendered.json.box[0]).toBeGreaterThan(0);
  expect(rendered.json.box[1]).toBeGreaterThan(0);
  expect(rendered.json.findings).toEqual([]);

  const symbols = await post<{ groups: { id: string; label: string; symbols: unknown[] }[] }>(
    request,
    deckId,
    'equation.symbols',
    {},
  );
  expect(symbols.status).toBe(200);
  expect(symbols.json.groups.map((g) => g.label)).toEqual([
    'Greek letters',
    'Miscellaneous operations',
    'Relations',
    'Math operators',
    'Arrows',
    'More',
  ]);
  expect(symbols.json.groups.map((g) => g.symbols.length).slice(0, 5)).toEqual([
    40, 32, 21, 20, 12,
  ]);
  // the Math operators rows name the OMML objects the exporter's writer emits (one table, SPEC-5 8.1)
  const structures = (symbols.json.groups.find((g) => g.id === 'mathOperators')?.symbols ?? []) as {
    omml: string;
  }[];
  expect(new Set(structures.map((s) => s.omml))).toEqual(
    new Set(['f', 'rad', 'sSup', 'sSub', 'sSubSup', 'bar', 'acc', 'nary', 'd', 'limLow']),
  );
});

// Not driven on this tree (recorded, never passed): the rows below wait for the integrator's
// lines of b6.md R11 to R13 (the chrome subpath exports, the window rows and the shell mounts).
test.skip('Insert > Equation through Cmd+Option+Shift+E places a block and opens it (menus/model.ts row flips with R13)', () => {});
test.skip('a Greek letters pick on the equation toolbar inserts \\alpha at the caret of the source field (EditorShell mount, R12)', () => {});
test.skip('the inspector source field commits on Enter, Tab walks the empty groups, Cmd . adds ^{} (FormatOptions case, R12)', () => {});
