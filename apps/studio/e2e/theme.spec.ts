import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

// Edit theme and the second theme end to end (gslides-parity SPEC-5 9.4 `theme.spec.ts`;
// MILESTONES-5 B6 day 6): the Themes panel shows the three groups (GT, Plate, In this
// presentation); a click on the Plate tile writes `/theme` and `/defaults/appearance` in one
// commit and moves no object (SPEC-5 9.3, 0.45); `theme.set`, `theme.rename`, `theme.get`,
// `theme.reset` and the six `layout.*` actions run through the agent surface of the same server
// and the panel follows the record (the edited theme under its name). The rows the shell mounts
// by the integrator's requests (b6.md R11, R12, R14: Slide > Edit theme opening the mode, the
// toolbar's Colors write, the slot drag, the override stylesheet in the editor's document) are
// recorded as not driven until those lines land, never as passed.
//
// PLAYWRIGHT_BASE_URL=http://localhost:4356 node_modules/.bin/playwright test apps/studio/e2e/theme.spec.ts

const AGENT = 'agent:e2e-theme';

type Row = { id: string; n: number };
type Pos = { x: number; y: number; w: number; h: number };
type SlideGet = {
  slide: { id: string; kind: string; slots?: Record<string, { id: string; pos?: Pos }[]> };
};

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
  await invoke(page, 'deck.rename', { name: 'Theme spec', baseRevision: info.revision });
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

function boxes(slide: SlideGet['slide']): Record<string, Pos | undefined> {
  const out: Record<string, Pos | undefined> = {};
  for (const list of Object.values(slide.slots ?? {}))
    for (const block of list) out[block.id] = block.pos;
  return out;
}

test.describe.configure({ mode: 'serial' });

test('the Themes panel shows GT, Plate and In this presentation; the Plate tile switches the theme and moves no object', async ({
  page,
  request,
}) => {
  const { deckId, slideId } = await openNew(page);
  // a canvas object to watch: a rectangle at a known box
  const base = await revision(request, deckId);
  const inserted = await post<{ revision: number }>(request, deckId, 'block.insert', {
    slideId,
    slot: 'main',
    block: { id: 'sq', type: 'shape', shape: 'rect', pos: { x: 300, y: 300, w: 200, h: 120 } },
    baseRevision: base,
  });
  expect(inserted.status, JSON.stringify(inserted.json)).toBe(200);
  const before = boxes(
    (await post<SlideGet>(request, deckId, 'slide.get', { slideId })).json.slide,
  );
  expect(before.sq).toEqual({ x: 300, y: 300, w: 200, h: 120, z: expect.any(Number) });

  await page.locator('[data-control="toolbar.theme"]').click();
  const panel = page.locator('[data-control="panel.themes"]');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.ts-themes-head')).toHaveText([
    'GT',
    'Plate',
    'In this presentation',
  ]);
  await expect(panel.locator('[data-control="themes.gt.light"]')).toBeVisible();
  await expect(panel.locator('[data-control="themes.plate.dark"]')).toBeVisible();
  // a fresh deck is on GT in its default appearance (dark when none is written): one GT tile is
  // checked and no Plate tile is
  await expect(panel.locator('[data-control^="themes.gt."][aria-checked="true"]')).toHaveCount(1);
  await expect(panel.locator('[data-control^="themes.plate."][aria-checked="true"]')).toHaveCount(
    0,
  );

  await panel.locator('[data-control="themes.plate.light"]').click();
  await expect(panel.locator('[data-control="themes.plate.light"]')).toHaveAttribute(
    'aria-checked',
    'true',
    {
      timeout: 15_000,
    },
  );
  await expect
    .poll(
      async () => (await post<{ theme: string }>(request, deckId, 'theme.get', {})).json.theme,
      {
        timeout: 15_000,
      },
    )
    .toBe('ts-plate');
  const after = boxes((await post<SlideGet>(request, deckId, 'slide.get', { slideId })).json.slide);
  expect(after).toEqual(before);
  // one commit: the revision moved by one for the theme and the appearance together
  const info = await post<{ revision: number; theme?: string }>(request, deckId, 'deck.info', {});
  expect(info.json.revision).toBe(inserted.json.revision + 1);
});

test('theme.set, theme.rename and theme.reset run on the agent surface and the panel lists the edited theme under its name', async ({
  page,
  request,
}) => {
  const { deckId } = await openNew(page);
  const set = await post<{
    themeEdits: { colors?: { light?: Record<string, string> } };
    revision: number;
  }>(request, deckId, 'theme.set', {
    path: '/colors/light/ink',
    value: '#101010',
    baseRevision: await revision(request, deckId),
  });
  expect(set.status, JSON.stringify(set.json)).toBe(200);
  expect(set.json.themeEdits.colors?.light?.ink).toBe('#101010');
  const refused = await post<{ error?: unknown }>(request, deckId, 'theme.set', {
    path: '/colors/light/magenta',
    value: '#ff00ff',
    baseRevision: await revision(request, deckId),
  });
  expect(refused.status).toBeGreaterThanOrEqual(400);
  const renamed = await post<{ name: string }>(request, deckId, 'theme.rename', {
    name: 'Acme sales 2026',
    baseRevision: await revision(request, deckId),
  });
  expect(renamed.status).toBe(200);

  await page.locator('[data-control="toolbar.theme"]').click();
  const panel = page.locator('[data-control="panel.themes"]');
  await expect(
    panel.locator('[data-control="themes.inThis.edited"] .ts-themes-edited-name'),
  ).toHaveText('Acme sales 2026', { timeout: 15_000 });

  const got = await post<{ theme: string; themeEdits?: { name?: string } }>(
    request,
    deckId,
    'theme.get',
    {},
  );
  expect(got.json.themeEdits?.name).toBe('Acme sales 2026');
  const reset = await post<{ themeEdits?: unknown }>(request, deckId, 'theme.reset', {
    baseRevision: await revision(request, deckId),
  });
  expect(reset.status).toBe(200);
  expect(reset.json.themeEdits).toBeUndefined();
  await expect(panel.locator('[data-control="themes.inThis.edited"]')).toHaveCount(0, {
    timeout: 15_000,
  });
});

test('the six layout actions: create from Title slide, list, rename, set a placeholder, duplicate, delete and hide', async ({
  page,
  request,
}) => {
  const { deckId } = await openNew(page);
  const created = await post<{
    id: string;
    layout: { blocks?: { id: string; placeholder?: string }[] };
  }>(request, deckId, 'layout.create', {
    from: 'title',
    name: 'Quote',
    baseRevision: await revision(request, deckId),
  });
  expect(created.status, JSON.stringify(created.json)).toBe(200);
  expect(created.json.id).toBe('custom-quote');
  expect((created.json.layout.blocks ?? []).map((b) => b.placeholder)).toEqual([
    'title',
    'subtitle',
  ]);
  const listed = await post<{
    layouts: { id: string; builtIn: boolean; placeholders: string[] }[];
  }>(request, deckId, 'layout.list', {});
  expect(listed.json.layouts.filter((row) => row.builtIn)).toHaveLength(21);
  expect(listed.json.layouts.find((row) => row.id === 'custom-quote')?.placeholders).toEqual([
    'title',
    'subtitle',
  ]);
  const blockId = created.json.layout.blocks?.[1]?.id ?? '';
  const marked = await post<{ layout: { blocks?: { placeholder?: string }[] } }>(
    request,
    deckId,
    'layout.setPlaceholder',
    {
      layoutId: 'custom-quote',
      blockId,
      placeholder: 'body',
      baseRevision: await revision(request, deckId),
    },
  );
  expect(marked.json.layout.blocks?.[1]?.placeholder).toBe('body');
  const renamed = await post<{ name: string }>(request, deckId, 'layout.rename', {
    id: 'custom-quote',
    name: 'Customer quote',
    baseRevision: await revision(request, deckId),
  });
  expect(renamed.json.name).toBe('Customer quote');
  const copied = await post<{ id: string }>(request, deckId, 'layout.duplicate', {
    id: 'custom-quote',
    baseRevision: await revision(request, deckId),
  });
  expect(copied.json.id).toBe('custom-customer-quote-copy');
  const removed = await post<{ hidden: boolean }>(request, deckId, 'layout.delete', {
    id: copied.json.id,
    confirm: true,
    baseRevision: await revision(request, deckId),
  });
  expect(removed.json.hidden).toBe(false);
  const hidden = await post<{ hidden: boolean }>(request, deckId, 'layout.delete', {
    id: 'statement',
    confirm: true,
    baseRevision: await revision(request, deckId),
  });
  expect(hidden.json.hidden).toBe(true);
  const again = await post<{ layouts: { id: string; hidden: boolean }[] }>(
    request,
    deckId,
    'layout.list',
    {},
  );
  expect(again.json.layouts.find((row) => row.id === 'statement')?.hidden).toBe(true);
  expect(again.json.layouts.some((row) => row.id === copied.json.id)).toBe(false);
});

// Not driven on this tree (recorded, never passed): the rows below wait for the integrator's
// lines of b6.md R11, R12 and R14.
test.skip('Slide > Edit theme opens the mode with the Theme tile, the Layouts tiles and the toolbar (client(themeMode) and the EditorRoot mount, R12)', () => {});
test.skip('Colors > Text and background 1 on the theme toolbar writes /colors/<appearance>/ink and the sheet follows through the override stylesheet (R12, R14)', () => {});
test.skip('dragging the corner slot writes /mark/box and a picture in the slot draws on every slide and in the PDF (R12, R2)', () => {});
test.skip('Apply layout on the custom layout moves the title into its placeholder box (slide.applyLayout on a custom id, R9)', () => {});
