import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { setAdvancedTools } from './advanced-tools';

// The integrator's spec for the fourteen actions of the Google Slides parity round (gslides-parity
// SPEC 7.5; MILESTONES Integrator item 2) and the thirty six of round two (SPEC-2 section 3;
// MILESTONES-2 Integrator item 4): every one resolves through window.turboslide.studio.invoke in
// the editor, the document actions through the editor's own commit (the local reducer first, then
// the server), the collection actions and slide.import through the server. The round two test
// converts the Title slide with slide.toCanvas and asserts one slide.replace and a pos on every
// object, writes the deck's guides and reads them back on deck.info, and drives every other
// canvas, text, table, chart, shape, line and diagram action once on the same deck. The spec
// works on a scratch copy of decks/fixture under decks/e2e-gslides and a copy it makes of that
// deck, both removed afterwards with their worker caches. The dev server always runs on 4321
// (AGENTS.md) and serves any folder under decks/.

const ROOT = join(import.meta.dirname, '..', '..', '..');
const DECK = 'e2e-gslides';
const COPY = 'e2e-gslides-copy';
const DECK_DIR = join(ROOT, 'decks', DECK);

function seedDeck(): void {
  rmSync(DECK_DIR, { recursive: true, force: true });
  mkdirSync(DECK_DIR, { recursive: true });
  cpSync(join(ROOT, 'decks', 'fixture', 'slides'), join(DECK_DIR, 'slides'), { recursive: true });
  const manifest = JSON.parse(
    readFileSync(join(ROOT, 'decks', 'fixture', 'deck.json'), 'utf8'),
  ) as { id: string };
  manifest.id = DECK;
  writeFileSync(join(DECK_DIR, 'deck.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

function removeDecks(): void {
  for (const id of [DECK, COPY]) {
    rmSync(join(ROOT, 'decks', id), { recursive: true, force: true });
    rmSync(join(ROOT, '.turboslide', 'worker', 'cache', id), { recursive: true, force: true });
  }
}

async function openEditor(page: Page): Promise<void> {
  await page.goto(`/edit/${DECK}?author=agent:e2e-gslides`);
  await page.waitForFunction(() => {
    try {
      return Boolean(window.turboslide?.studio);
    } catch {
      return false;
    }
  });
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-settled', '');
}

type Info = {
  revision: number;
  counts: { slides: number; skipped: number; canvas?: number; charts?: number; guides?: number };
  defaults?: unknown;
  guides?: unknown;
  trashedAt?: string;
};

type Row = { id: string; n: number; skip?: boolean; template?: string };

async function invoke<T>(page: Page, action: string, input?: unknown): Promise<T> {
  return page.evaluate(([id, value]) => window.turboslide!.studio.invoke(id, value), [
    action,
    input,
  ] as const) as Promise<T>;
}

async function info(page: Page): Promise<Info> {
  return invoke<Info>(page, 'deck.info');
}

async function rows(page: Page): Promise<Row[]> {
  return invoke<Row[]>(page, 'slide.list');
}

/** The editor's confirmed revision: pending writes have reached the server. */
async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const state = window.turboslide!.studio.describe().state as {
      revision?: number;
      serverRevision?: number;
      pending?: number;
    };
    return state.pending === 0 && state.revision === state.serverRevision;
  });
}

test.describe('the fourteen actions of the parity round through the window API', () => {
  test.beforeAll(() => {
    seedDeck();
  });
  test.afterAll(() => {
    removeDecks();
  });

  test('document actions run through the editor and reads carry the new facts', async ({
    page,
  }) => {
    // Four slides are created here and the filmstrip renders each one through the render worker
    // (one Chromium at a time); on the dev server that load holds every write for up to 10 s
    // (measured 2026-09-12: the same writes take 100 ms on an idle server), so the budget is the
    // load's, not the actions'.
    test.setTimeout(240_000);
    await openEditor(page);
    const start = await info(page);
    expect(start.counts.skipped).toBe(0);
    expect(start.trashedAt).toBeUndefined();

    // slide.new: a Big number after the copy test slide, selected on the stage
    const created = await invoke<{ slide: { id: string; template?: string }; revision: number }>(
      page,
      'slide.new',
      { layout: 'big-number', after: 'content-rule', baseRevision: start.revision },
    );
    expect(created.slide.template).toBe('big-number');
    expect(created.revision).toBe(start.revision + 1);
    await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', created.slide.id);
    let list = await rows(page);
    expect(list.map((row) => row.id)).toEqual(['title', 'content-rule', created.slide.id]);
    expect(list[2]?.template).toBe('big-number');

    // slide.duplicate: a fresh id right after the original
    const duplicated = await invoke<{ slides: { id: string }[]; revision: number }>(
      page,
      'slide.duplicate',
      { slideIds: [created.slide.id], baseRevision: created.revision },
    );
    expect(duplicated.slides).toHaveLength(1);
    const copyId = duplicated.slides[0]!.id;
    expect(copyId).not.toBe(created.slide.id);
    await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', copyId);

    // slide.skip: the row says so, deck.info counts it
    const skipped = await invoke<{ slideIds: string[]; skip: boolean; revision: number }>(
      page,
      'slide.skip',
      { slideIds: [copyId], skip: true, baseRevision: duplicated.revision },
    );
    expect(skipped.skip).toBe(true);
    list = await rows(page);
    expect(list.find((row) => row.id === copyId)?.skip).toBe(true);
    expect(list.find((row) => row.id === created.slide.id)?.skip).toBeUndefined();
    expect((await info(page)).counts.skipped).toBe(1);

    // slide.applyLayout: Title slide keeps the number as the heading, template follows
    const applied = await invoke<{
      slides: { id: string; template?: string }[];
      dropped: unknown[];
      revision: number;
    }>(page, 'slide.applyLayout', {
      slideIds: [created.slide.id],
      layout: 'title',
      baseRevision: skipped.revision,
    });
    expect(applied.slides[0]?.template).toBe('title');
    list = await rows(page);
    expect(list.find((row) => row.id === created.slide.id)?.template).toBe('title');

    // block.duplicate: the heading of the copy test slide, a fresh id after it
    const blocks = await invoke<{ blockIds: string[]; revision: number; slide: unknown }>(
      page,
      'block.duplicate',
      { slideId: 'content-rule', blockIds: ['h'], baseRevision: applied.revision },
    );
    expect(blocks.blockIds).toHaveLength(1);
    expect(blocks.blockIds[0]).not.toBe('h');

    // text.replaceAll and export.text: the replacement shows in the plain text
    const replaced = await invoke<{ replacements: number; slideIds: string[]; revision: number }>(
      page,
      'text.replaceAll',
      { find: 'copy test', replace: 'Globex test', baseRevision: blocks.revision },
    );
    expect(replaced.replacements).toBeGreaterThanOrEqual(2);
    expect(replaced.slideIds).toContain('content-rule');
    const text = await invoke<{ text: string; slides: number; bytes: number }>(
      page,
      'export.text',
      {},
    );
    expect(text.text).toContain('Globex test');
    expect(text.text).not.toContain('copy test');
    // the skipped copy is left out unless asked
    const withSkipped = await invoke<{ slides: number }>(page, 'export.text', {
      includeSkipped: true,
    });
    expect(withSkipped.slides).toBe(text.slides + 1);

    // view.zoom: a view action with no document field
    const zoomed = await invoke<{ zoom?: number | 'fit'; slideId: string }>(page, 'view.zoom', {
      zoom: 2,
    });
    expect(zoomed.zoom).toBe(2);
    const fit = await invoke<{ zoom?: number | 'fit' }>(page, 'view.zoom', { zoom: 'fit' });
    expect(fit.zoom).toBe('fit');
    await expect(invoke(page, 'view.zoom', { zoom: 0.1 })).rejects.toThrow();
    expect((await info(page)).revision).toBe(replaced.revision);

    await settled(page);
  });

  test('collection actions and slide.import run on the server', async ({ page }) => {
    await openEditor(page);
    const before = await info(page);

    // deck.list names this deck, never a trashed one
    const heads = await invoke<{ id: string; trashedAt?: string }[]>(page, 'deck.list');
    expect(heads.map((head) => head.id)).toContain(DECK);

    // deck.copy at the current revision, then trash, list both ways, restore, remove
    const copied = await invoke<{ deckId: string; revision: number; title: string }>(
      page,
      'deck.copy',
      { id: DECK, name: 'E2E gslides copy', newId: COPY, baseRevision: before.revision },
    );
    expect(copied.deckId).toBe(COPY);
    expect(copied.revision).toBe(0);
    expect(existsSync(join(ROOT, 'decks', COPY, 'deck.json'))).toBe(true);
    const trashed = await invoke<{ id: string; trashedAt: string | null }>(page, 'deck.trash', {
      id: COPY,
      baseRevision: 0,
    });
    expect(typeof trashed.trashedAt).toBe('string');
    expect((await invoke<{ id: string }[]>(page, 'deck.list')).map((h) => h.id)).not.toContain(
      COPY,
    );
    const withTrash = await invoke<{ id: string; trashedAt?: string }[]>(page, 'deck.list', {
      includeTrashed: true,
    });
    expect(withTrash.find((head) => head.id === COPY)?.trashedAt).toBe(trashed.trashedAt);
    const restored = await invoke<{ trashedAt: string | null }>(page, 'deck.restore', {
      id: COPY,
      baseRevision: 0,
    });
    expect(restored.trashedAt).toBeNull();
    // a stale baseRevision is refused
    await expect(invoke(page, 'deck.trash', { id: COPY, baseRevision: 7 })).rejects.toThrow();
    const removed = await invoke<{ id: string; removed: true }>(page, 'deck.remove', {
      id: COPY,
      confirm: true,
      baseRevision: 0,
    });
    expect(removed.removed).toBe(true);
    expect(existsSync(join(ROOT, 'decks', COPY))).toBe(false);

    // slide.import from the fixture: the id collides and is renamed, the slide lands after title
    const imported = await invoke<{
      slides: { id: string }[];
      renamed: { from: string; to: string }[];
      revision: number;
    }>(page, 'slide.import', {
      sourceDeckId: 'fixture',
      slideIds: ['content-rule'],
      after: 'title',
      baseRevision: before.revision,
    });
    expect(imported.slides).toHaveLength(1);
    expect(imported.renamed).toEqual([{ from: 'content-rule', to: imported.slides[0]!.id }]);
    expect(imported.revision).toBe(before.revision + 1);
    const list = await rows(page);
    expect(list[1]?.id).toBe(imported.slides[0]!.id);
    await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', imported.slides[0]!.id);
    await settled(page);
  });
});

/** A 2 by 2 opaque PNG, for asset.add (the picture actions need an asset the deck holds). */
const PNG_2X2 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGNgYGD4z8DAwAAADxUD+/8p7CwAAAAASUVORK5CYII=',
  'base64',
);

type Pos = {
  x: number;
  y: number;
  w: number;
  h: number;
  z?: number;
  rotate?: number;
  flip?: string;
  group?: string;
};
type Block = { id: string; type: string; pos?: Pos; text?: string; [key: string]: unknown };
type SlideDoc = {
  id: string;
  kind: string;
  layout?: { type: string };
  slots?: Record<string, Block[]>;
  template?: string;
  grammar?: { kind: string };
  background?: { color: string };
};
type Version = { n: number; revision: number; mutations: { op: string; slideId?: string }[] };

function mainBlocks(slide: SlideDoc): Block[] {
  return slide.slots?.['main'] ?? [];
}

function block(slide: SlideDoc, id: string): Block {
  const found = mainBlocks(slide).find((b) => b.id === id);
  if (found === undefined) throw new Error(`no block ${id} on ${slide.id}`);
  return found;
}

/** A block's field past the id, type, pos and text the Block type names. */
function field<T>(b: Block, key: string): T {
  return b[key] as T;
}

test.describe('the thirty six actions of round two through the window API', () => {
  test.beforeAll(() => {
    seedDeck();
  });
  test.afterAll(() => {
    removeDecks();
  });

  test('every canvas, text, table, chart, shape, line and diagram action resolves in the editor', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openEditor(page);
    let revision = (await info(page)).revision;
    /* one write at a time: the store action's own baseRevision check, the revision from the answer */
    const write = async <T extends { revision: number }>(
      action: string,
      input: object,
    ): Promise<T> => {
      const out = await invoke<T>(page, action, { ...input, baseRevision: revision });
      expect(out.revision, action).toBe(revision + 1);
      revision = out.revision;
      return out;
    };
    const slide = async (id: string): Promise<SlideDoc> =>
      (await invoke<{ slide: SlideDoc }>(page, 'slide.get', { slideId: id })).slide;
    const deckGuides = async (): Promise<unknown> =>
      (await invoke<{ guides?: unknown; counts: { guides?: number } }>(page, 'deck.info')).guides;

    // deck.guides: the deck field on deck.info (SPEC-2 2.10)
    await write('deck.guides', {
      add: [
        { axis: 'x', at: 800 },
        { axis: 'y', at: 450 },
      ],
    });
    expect(await deckGuides()).toEqual({ x: [800], y: [450] });
    expect((await info(page)).counts.guides).toBe(2);
    await write('deck.guides', { remove: [{ axis: 'y', at: 450 }] });
    expect(await deckGuides()).toEqual({ x: [800], y: [] });

    // slide.toCanvas on the Title slide: one write whose one mutation is the slide.replace, a pos
    // on every object, the template and the grammar record (SPEC-2 1.2, 1.6)
    const before = (await invoke<Version[]>(page, 'version.list')).length;
    const converted = await write<{
      slides: { slideId: string; converted: boolean; objects: { id: string; pos: Pos }[] }[];
      revision: number;
    }>('slide.toCanvas', { slideIds: ['title'] });
    expect(converted.slides[0]?.converted).toBe(true);
    expect(converted.slides[0]?.objects.map((o) => o.id)).toEqual(['mark', 'heading', 'lead']);
    await settled(page);
    const log = await invoke<Version[]>(page, 'version.list');
    expect(log.length).toBe(before + 1);
    const last = log[log.length - 1]!;
    expect(last.mutations.map((m) => m.op)).toEqual(['slide.replace']);
    let title = await slide('title');
    expect(title.kind).toBe('content');
    expect(title.layout).toEqual({ type: 'freeform' });
    expect(title.template).toBe('title');
    expect(title.grammar?.kind).toBe('title');
    for (const b of mainBlocks(title)) {
      expect(b.pos, b.id).toBeDefined();
      expect(b.pos!.w, b.id).toBeGreaterThan(0);
      expect(b.pos!.h, b.id).toBeGreaterThan(0);
    }

    // block.set /pos on a grammar slide converts it in the same write (SPEC-2 1.6)
    await write('block.set', {
      slideId: 'content-rule',
      blockId: 'h',
      path: '/pos',
      value: { x: 137, y: 129, w: 600, h: 80, z: 0 },
    });
    let content = await slide('content-rule');
    expect(content.layout).toEqual({ type: 'freeform' });
    expect(block(content, 'h').pos).toMatchObject({ x: 137, y: 129, w: 600, h: 80 });
    expect(block(content, 'p').pos).toBeDefined();
    expect(block(content, 'list').pos).toBeDefined();

    // rotate, flip, group, ungroup, regroup, order, align, distribute, duplicate
    await write('block.rotate', { slideId: 'title', blockIds: ['heading'], by: 15 });
    expect(block(await slide('title'), 'heading').pos?.rotate).toBe(15);
    await write('block.flip', { slideId: 'title', blockIds: ['heading'], axis: 'h' });
    expect(block(await slide('title'), 'heading').pos?.flip).toBe('h');
    const grouped = await write<{ group: string; revision: number }>('block.group', {
      slideId: 'title',
      blockIds: ['heading', 'lead'],
    });
    title = await slide('title');
    expect(block(title, 'heading').pos?.group).toBe(grouped.group);
    expect(block(title, 'lead').pos?.group).toBe(grouped.group);
    await write('block.ungroup', { slideId: 'title', blockIds: ['heading'] });
    expect(block(await slide('title'), 'heading').pos?.group).toBeUndefined();
    await write('block.regroup', {
      slideId: 'title',
      blockIds: ['heading', 'lead'],
      group: grouped.group,
    });
    expect(block(await slide('title'), 'lead').pos?.group).toBe(grouped.group);
    await write('block.order', { slideId: 'title', blockId: 'mark', move: 'front' });
    title = await slide('title');
    const zs = mainBlocks(title).map((b) => b.pos?.z ?? 0);
    expect(block(title, 'mark').pos?.z).toBe(Math.max(...zs));
    await write('block.align', { slideId: 'title', blockIds: ['mark'], edge: 'center' });
    const mark = block(await slide('title'), 'mark').pos!;
    expect(Math.round(mark.x + mark.w / 2)).toBe(800);
    await write('block.distribute', {
      slideId: 'title',
      blockIds: ['mark', 'heading', 'lead'],
      axis: 'vertical',
    });
    const duplicated = await write<{ blockIds: string[]; revision: number }>('block.duplicate', {
      slideId: 'title',
      blockIds: ['lead'],
    });
    expect(duplicated.blockIds).toHaveLength(1);
    title = await slide('title');
    expect(block(title, duplicated.blockIds[0]!).pos!.x).toBe(block(title, 'lead').pos!.x + 16);

    // slide.setBackground and deck.setBackground (SPEC-2 2.6)
    await write('slide.setBackground', { slideIds: ['title'], background: { color: 'plate' } });
    expect((await slide('title')).background).toEqual({ color: 'plate' });
    await write('deck.setBackground', { background: { color: 'plate' } });
    expect(
      ((await info(page)).defaults as { background?: unknown } | undefined)?.background,
    ).toEqual({ color: 'plate' });
    await write('deck.setBackground', { background: null });

    // the text actions on the converted heading (SPEC-2 2.2, 2.3)
    await write('block.set', {
      slideId: 'title',
      blockId: 'heading',
      path: '/text',
      value: 'Globex review deck',
    });
    await write('text.style', {
      slideId: 'title',
      blockId: 'heading',
      path: '/text',
      range: [0, 6],
      marks: { i: true },
    });
    expect(block(await slide('title'), 'heading').text).toBe('[Globex]{i} review deck');
    await write('text.case', {
      slideId: 'title',
      blockId: 'heading',
      path: '/text',
      range: [0, 6],
      mode: 'upper',
    });
    expect(block(await slide('title'), 'heading').text).toBe('[GLOBEX]{i} review deck');
    await write('text.insert', {
      slideId: 'title',
      blockId: 'heading',
      path: '/text',
      at: 0,
      text: 'The ',
    });
    expect(block(await slide('title'), 'heading').text).toContain('The ');
    await write('text.spacing', {
      slideId: 'title',
      blockIds: ['heading'],
      line: 1.5,
      before: 8,
      after: 8,
    });
    expect(
      field<{ spaceBefore?: number }>(block(await slide('title'), 'heading'), 'typography')
        .spaceBefore,
    ).toBe(8);
    await write('text.columns', { slideId: 'content-rule', blockIds: ['p'], columns: 2 });
    expect(
      field<{ columns?: number }>(block(await slide('content-rule'), 'p'), 'typography').columns,
    ).toBe(2);
    await write('text.indent', { slideId: 'content-rule', blockIds: ['p'], by: 1 });
    expect(
      field<{ indent?: number }>(block(await slide('content-rule'), 'p'), 'typography').indent,
    ).toBeGreaterThan(0);
    await write('text.list', {
      slideId: 'content-rule',
      blockId: 'list',
      marker: 'number',
      preset: 'digit-alpha-roman',
    });
    expect(field<string>(block(await slide('content-rule'), 'list'), 'marker')).toBe('number');

    // autofit and alt on the heading object (SPEC-2 2.2.17, 2.9)
    /* the conversion wrote `shrink` on the heading (SPEC-2 1.2); Do not autofit is the change */
    await write('block.autofit', { slideId: 'title', blockId: 'heading', autofit: 'none' });
    expect(field<string>(block(await slide('title'), 'heading'), 'autofit')).toBe('none');
    await write('block.setAlt', { slideId: 'title', blockId: 'heading', alt: 'The deck title' });
    expect(field<string>(block(await slide('title'), 'heading'), 'alt')).toBe('The deck title');

    // a shape, then shape.set; a line attached to it, then line.set (SPEC-2 2.4)
    await write('block.insert', {
      slideId: 'title',
      slot: 'main',
      block: {
        id: 'hex',
        type: 'shape',
        shape: 'rectangle',
        pos: { x: 1000, y: 100, w: 240, h: 160 },
      },
    });
    await write('shape.set', { slideId: 'title', blockIds: ['hex'], kind: 'hexagon', dash: 'dot' });
    expect(block(await slide('title'), 'hex')).toMatchObject({ shape: 'hexagon', dash: 'dot' });
    /* a drop shadow lives on a box, shape, text box, icon, picture or table (SPEC-2 2.5) */
    await write('block.shadow', { slideId: 'title', blockIds: ['hex'], shadow: { distance: 10 } });
    expect(field<unknown>(block(await slide('title'), 'hex'), 'shadow')).toEqual({ distance: 10 });
    await write('block.insert', {
      slideId: 'title',
      slot: 'main',
      block: {
        id: 'arrow',
        type: 'shape',
        shape: 'line',
        orientation: 'horizontal',
        pos: { x: 600, y: 180, w: 400, h: 8 },
      },
    });
    await write('line.set', {
      slideId: 'title',
      blockIds: ['arrow'],
      end: 'fillArrow',
      connect: { end: { block: 'hex', site: 1 } },
    });
    const line = block(await slide('title'), 'arrow');
    expect(field<string>(line, 'lineEnd')).toBe('fillArrow');
    expect(field<{ end?: { block: string } }>(line, 'connect').end?.block).toBe('hex');

    // a picture from asset.add (the server side write comes back before the answer), then crop,
    // mask, adjust and reset (SPEC-2 2.6.4, 2.6.5)
    const png = `data:image/png;base64,${PNG_2X2.toString('base64')}`;
    await invoke(page, 'asset.add', {
      id: 'photo',
      file: png,
      role: 'capture',
      alt: 'A photo',
      baseRevision: revision,
    });
    await expect
      .poll(async () => (await info(page)).revision, { timeout: 20_000 })
      .toBeGreaterThan(revision);
    revision = (await info(page)).revision;
    await write('block.insert', {
      slideId: 'title',
      slot: 'main',
      block: {
        id: 'photo',
        type: 'picture',
        asset: 'photo',
        pos: { x: 1000, y: 400, w: 400, h: 300 },
      },
    });
    await write('block.crop', {
      slideId: 'title',
      blockId: 'photo',
      trim: { left: 0.1, right: 0.1, top: 0, bottom: 0 },
    });
    await write('block.mask', { slideId: 'title', blockId: 'photo', mask: 'ellipse' });
    await write('block.adjust', { slideId: 'title', blockId: 'photo', brightness: 0.2 });
    let photo = block(await slide('title'), 'photo');
    expect(field<string>(photo, 'mask')).toBe('ellipse');
    expect(field<unknown>(photo, 'trim')).toBeDefined();
    expect(field<unknown>(photo, 'adjust')).toEqual({ brightness: 0.2 });
    await write('block.resetImage', { slideId: 'title', blockId: 'photo' });
    photo = block(await slide('title'), 'photo');
    expect(field<unknown>(photo, 'mask')).toBeUndefined();
    expect(field<unknown>(photo, 'trim')).toBeUndefined();

    // a table, then the eight table actions (SPEC-2 2.7)
    type Grid = { rows: unknown[]; columns: unknown[]; spans?: unknown[]; cells?: unknown[] };
    const grid = async (): Promise<Grid> =>
      block(await slide('content-rule'), 'grid') as unknown as Grid;
    await write('block.insert', {
      slideId: 'content-rule',
      slot: 'main',
      block: {
        id: 'grid',
        type: 'table',
        columns: [{}, {}, {}],
        rows: [{ cells: ['A', 'B', 'C'] }, { cells: ['1', '2', '3'] }, { cells: ['4', '5', '6'] }],
        pos: { x: 100, y: 500, w: 720, h: 240 },
      },
    });
    await write('table.insertRows', {
      slideId: 'content-rule',
      blockId: 'grid',
      at: 2,
      count: 2,
      where: 'below',
    });
    expect((await grid()).rows).toHaveLength(5);
    await write('table.insertColumns', {
      slideId: 'content-rule',
      blockId: 'grid',
      at: 2,
      count: 1,
      where: 'right',
    });
    expect((await grid()).columns).toHaveLength(4);
    await write('table.merge', {
      slideId: 'content-rule',
      blockId: 'grid',
      from: [1, 1],
      to: [2, 2],
    });
    expect((await grid()).spans).toHaveLength(1);
    await write('table.unmerge', { slideId: 'content-rule', blockId: 'grid', at: [1, 1] });
    expect((await grid()).spans ?? []).toHaveLength(0);
    await write('table.cellStyle', {
      slideId: 'content-rule',
      blockId: 'grid',
      cells: [[0, 0]],
      fill: 'plate',
    });
    expect((await grid()).cells).toHaveLength(1);
    /* a total, so the rows take equal heights (without one and with no heights set, the even
       distribution is what the table draws already and the action answers the current revision) */
    await write('table.distribute', {
      slideId: 'content-rule',
      blockId: 'grid',
      axis: 'rows',
      total: 300,
    });
    expect((await grid()).rows.map((row) => (row as { height?: number }).height)).toEqual([
      60, 60, 60, 60, 60,
    ]);
    await write('table.deleteRows', { slideId: 'content-rule', blockId: 'grid', from: 3, to: 4 });
    expect((await grid()).rows).toHaveLength(3);
    await write('table.deleteColumns', { slideId: 'content-rule', blockId: 'grid', from: 3 });
    expect((await grid()).columns).toHaveLength(3);

    // a chart, then chart.setData and chart.setKind (SPEC-2 2.8)
    await write('block.insert', {
      slideId: 'content-rule',
      slot: 'main',
      block: {
        id: 'chart',
        type: 'chart',
        kind: 'bar',
        categories: ['Q1', 'Q2'],
        series: [{ name: 'Docs', values: [10, 20] }],
        pos: { x: 900, y: 500, w: 600, h: 300 },
      },
    });
    await write('chart.setData', {
      slideId: 'content-rule',
      blockId: 'chart',
      categories: ['Q1', 'Q2', 'Q3'],
      series: [
        { name: 'Docs', values: [10, 20, 30] },
        { name: 'App', values: [1, 2, 3] },
      ],
    });
    await write('chart.setKind', { slideId: 'content-rule', blockId: 'chart', kind: 'pie' });
    const chart = block(await slide('content-rule'), 'chart');
    expect(field<string>(chart, 'kind')).toBe('pie');
    expect(field<unknown[]>(chart, 'series')).toHaveLength(1);
    expect((await info(page)).counts.charts).toBe(1);

    // diagram.insert: one group of shapes, texts and attached lines (SPEC-2 2.8.3)
    const diagram = await write<{ group: string; blockIds: string[]; revision: number }>(
      'diagram.insert',
      { slideId: 'content-rule', kind: 'process', count: 3, style: 'plate' },
    );
    content = await slide('content-rule');
    const members = mainBlocks(content).filter((b) => b.pos?.group === diagram.group);
    expect(members.filter((b) => b.type === 'text')).toHaveLength(3);
    expect(members.filter((b) => b.type === 'shape' && b['connect'] !== undefined)).toHaveLength(2);

    // the reads carry the canvas facts (SPEC-2 0.93)
    const rowsNow = await invoke<{ id: string; canvas?: boolean; objects?: number }[]>(
      page,
      'slide.list',
    );
    expect(rowsNow.find((r) => r.id === 'title')?.canvas).toBe(true);
    expect(rowsNow.find((r) => r.id === 'content-rule')?.objects).toBeGreaterThan(3);
    expect((await info(page)).counts.canvas).toBe(2);
    await settled(page);
  });
});

test.describe('the menus over the stage selection (VERIFICATION-2 findings 5 and 6)', () => {
  test.beforeAll(() => {
    seedDeck();
  });
  test.afterAll(() => {
    removeDecks();
  });

  test('Arrange reads two selected objects and Change shape draws its plate in the right-click menu', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page);
    /* Group, Ungroup, Distribute and Change shape are parked (docs/FOCUS.md 3.2, 3.4): the rows are
       asserted behind Tools > Advanced tools, never in the default view */
    await setAdvancedTools(page, true);
    let revision = (await info(page)).revision;
    const write = async <T extends { revision: number }>(
      action: string,
      input: object,
    ): Promise<T> => {
      const out = await invoke<T>(page, action, { ...input, baseRevision: revision });
      expect(out.revision, action).toBe(revision + 1);
      revision = out.revision;
      return out;
    };
    const slide = async (id: string): Promise<SlideDoc> =>
      (await invoke<{ slide: SlideDoc }>(page, 'slide.get', { slideId: id })).slide;
    const objectEl = (id: string) =>
      page.locator(`.ts-stagewrap.ts-editor .pt-slide .free[data-free="${id}"]`);
    /* the top left corner of the object's element, outside its text; Shift held through the
       keyboard, since page.mouse.click carries no modifiers */
    const clickObject = async (id: string, modifiers: ('Shift' | 'Meta')[] = []) => {
      const box = await objectEl(id).boundingBox();
      if (!box) throw new Error(`no box for ${id}`);
      for (const key of modifiers) await page.keyboard.down(key);
      await page.mouse.click(box.x + 2, box.y + 2);
      for (const key of modifiers) await page.keyboard.up(key);
    };

    // three shapes on the Title slide; the first positioned insert converts it (SPEC-2 1.6)
    for (const [id, x] of [
      ['sq', 200],
      ['sq2', 600],
      ['sq3', 1000],
    ] as const) {
      await write('block.insert', {
        slideId: 'title',
        slot: 'main',
        block: { id, type: 'shape', shape: 'rectangle', pos: { x, y: 560, w: 240, h: 160 } },
      });
    }
    await settled(page);
    await invoke(page, 'view.goto', { slideId: 'title' });
    await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', 'title');
    await expect(objectEl('sq3')).toBeVisible();
    const arrangeRow = (id: string) => page.locator(`[data-menu-item="${id}"]`);

    // a click and a Shift click select two; the Arrange rows read the two objects (SPEC-2 4.1:
    // Group by canGroup, Align by the selection, Distribute by threeOrMore as Google's does)
    await clickObject('sq');
    await expect(page.locator('.ts-overlay [data-control="handle.sq.move"]')).toBeVisible();
    await clickObject('sq2', ['Shift']);
    await expect(page.locator('.ts-overlay .ts-select-chip')).toHaveText('2 objects');
    await page.locator('[data-control="menubar.arrange"]').click();
    for (const id of ['arrange.group', 'arrange.align']) {
      await expect(arrangeRow(id), id).not.toHaveAttribute('aria-disabled', 'true');
    }
    for (const id of ['arrange.ungroup', 'arrange.distribute']) {
      await expect(arrangeRow(id), id).toHaveAttribute('aria-disabled', 'true');
    }
    await page.keyboard.press('Escape');
    /* a third object: Distribute reads the three */
    await clickObject('sq3', ['Shift']);
    await expect(page.locator('.ts-overlay .ts-select-chip')).toHaveText('3 objects');
    await page.locator('[data-control="menubar.arrange"]').click();
    await expect(arrangeRow('arrange.distribute')).not.toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');
    /* one object again: a click on the workspace beside the sheet deselects first, since a click
       on a member of the selection lands on the selection's move surface; Group needs two (4.1) */
    const sbox = await page.locator('.ts-stagewrap.ts-editor').boundingBox();
    const sheet = await page
      .locator('.ts-stagewrap.ts-editor .pt-sheet-stage > .sheet')
      .boundingBox();
    if (!sbox || !sheet) throw new Error('no stage');
    await page.mouse.click(sbox.x + Math.max(4, (sheet.x - sbox.x) / 2), sbox.y + 20);
    await expect(page.locator('.ts-overlay .ts-select-chip')).toHaveCount(0);
    await clickObject('sq');
    await expect(page.locator('.ts-overlay .ts-select-chip')).toHaveText('Shape');
    await page.locator('[data-control="menubar.arrange"]').click();
    await expect(arrangeRow('arrange.group')).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');

    // Change shape ▸ in the shape's right-click menu draws the shape grid (SPEC-2 4.3); a pick
    // writes shape.set and closes the menu
    const before = (await invoke<Version[]>(page, 'version.list')).length;
    /* the centre of the shape: its corners carry the selection's resize handles */
    const sq = await objectEl('sq').boundingBox();
    if (!sq) throw new Error('no box for sq');
    await page.mouse.click(sq.x + sq.width / 2, sq.y + sq.height / 2, { button: 'right' });
    const menu = page.locator('#ts-menu-canvas');
    await expect(menu).toBeVisible();
    const row = menu.locator('[data-menu-item="format.changeShape"]');
    await expect(row).not.toHaveAttribute('aria-disabled', 'true');
    await row.click();
    await expect(page.locator('[data-control="format.changeShape.grid"]')).toBeVisible();
    await page.locator('[data-control="format.changeShape.pick.ellipse"]').click();
    await expect(menu).toHaveCount(0);
    await settled(page);
    revision = (await info(page)).revision;
    expect((await invoke<Version[]>(page, 'version.list')).length).toBe(before + 1);
    expect(field<string>(block(await slide('title'), 'sq'), 'shape')).toBe('ellipse');
  });
});
