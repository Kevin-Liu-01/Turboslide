// The templates and import lane handlers through the dispatcher over a scratch copy of
// decks/fixture (gslides-parity SPEC-5 4.3 to 4.6, 5.3, 5.5; MILESTONES-5 B3 day 7): the index
// rows, one template's slides, the building blocks by category, one block inserted as a group on
// a canvas slide in one write (ids freed, one tag, z above every object), the theme record
// appended to In this presentation with the five cap, a `.pptx` dry run through the bridge, and
// the sentence every handler prints when the bridge is absent.
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createDispatcher } from '@turboslide/agent/dispatch';
import type { ActionContext } from '@turboslide/agent/dispatch';
import { importLaneDeps } from '@turboslide/import/lane-node';
import type { ContentSlide, Slide, ThemeRecord } from '@turboslide/schema/deck';
import { openFileStore } from '@turboslide/store/file-store';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import type { LaneDeps } from './deps.ts';
import { registerImportActions } from './import.ts';
import type { ThemeImportResult } from './import.ts';
import { registerTemplatesActions } from './templates.ts';
import type { BuildingBlockInsertResult } from './templates.ts';

const REPO = resolve(import.meta.dirname, '../../../..');
const FIXTURE = join(REPO, 'decks/fixture');
const DECKS = join(REPO, 'decks');
const PPTX = join(REPO, 'packages/import/src/__fixtures__/pptx');
const context: ActionContext = { author: { kind: 'human', name: 'Maya' } };

let dir: string;
let deps: LaneDeps & { imports?: ReturnType<typeof importLaneDeps> };

function dispatcherWith(lane: LaneDeps) {
  const dispatcher = createDispatcher();
  registerTemplatesActions(dispatcher, lane);
  registerImportActions(dispatcher, lane);
  return dispatcher;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'turboslide-templates-actions-'));
  cpSync(join(FIXTURE, 'deck.json'), join(dir, 'deck.json'));
  cpSync(join(FIXTURE, 'slides'), join(dir, 'slides'), { recursive: true });
  deps = {
    store: openFileStore({ dir }),
    lint: { copyList: [], icons: [] },
    imports: importLaneDeps({
      decksDir: DECKS,
      cwd: PPTX,
      allowPaths: true,
      now: () => '2026-09-15T00:00:00.000Z',
    }),
  } as unknown as typeof deps;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A canvas slide appended to the first section, so the insert needs no measurer. */
async function canvasSlide(): Promise<{ slideId: string; revision: number }> {
  const document = (await deps.store.read()).document;
  const sectionId = document.deck.sections[0]!.id;
  const slide: ContentSlide = {
    schemaVersion: 1,
    id: 'canvas-x',
    kind: 'content',
    layout: { type: 'freeform' },
    template: 'blank',
    slots: {
      main: [
        {
          id: 'note',
          type: 'text',
          text: 'A note',
          pos: { x: 137, y: 129, w: 400, h: 60, z: 3, group: 'five-items' },
        },
      ],
    },
  };
  const outcome = await deps.store.write({
    baseRevision: document.deck.revision,
    author: context.author,
    mutations: [{ op: 'slide.insert', sectionId, slide }],
  });
  if (!outcome.ok) throw new Error('the canvas slide did not land');
  return { slideId: slide.id, revision: outcome.revision };
}

describe('template.list and template.slides (SPEC-5 4.3, 4.6)', () => {
  test('answer the index rows and one template’s slides through the dispatcher', async () => {
    const dispatcher = dispatcherWith(deps);
    const list = (await dispatcher.dispatch('template.list', {}, context)) as {
      templates: { id: string }[];
    };
    expect(list.templates.map((row) => row.id).slice(0, 4)).toEqual([
      'blank',
      'blank-plate',
      'gt-brand',
      'sales-pitch',
    ]);
    const slides = (await dispatcher.dispatch(
      'template.slides',
      { id: 'sales-pitch' },
      context,
    )) as { id: string; slides: { slideId: string }[] };
    expect(slides.id).toBe('sales-pitch');
    expect(slides.slides).toHaveLength(15);
    await expect(dispatcher.dispatch('template.slides', { id: 'nope' }, context)).rejects.toThrow(
      RangeError,
    );
  });
});

describe('buildingBlock.list and buildingBlock.insert (SPEC-5 4.5)', () => {
  test('lists a category and inserts one block as a group in one write', async () => {
    const dispatcher = dispatcherWith(deps);
    const list = (await dispatcher.dispatch(
      'buildingBlock.list',
      { category: 'agendas' },
      context,
    )) as { blocks: { id: string; category: string }[] };
    expect(list.blocks.length).toBeGreaterThanOrEqual(3);
    expect(list.blocks.every((row) => row.category === 'agendas')).toBe(true);
    const { slideId, revision } = await canvasSlide();
    const result = (await dispatcher.dispatch(
      'buildingBlock.insert',
      { slideId, id: 'agendas/five-items', baseRevision: revision },
      context,
    )) as BuildingBlockInsertResult;
    expect(result.revision).toBe(revision + 1);
    // the slide held a block tagged five-items, so the group is freed to five-items-2
    expect(result.group).toBe('five-items-2');
    expect(result.blockIds).toEqual(['h', 'list']);
    const slide = result.slide as ContentSlide;
    const inserted = (slide.slots.main ?? []).filter((block) => result.blockIds.includes(block.id));
    expect(inserted).toHaveLength(2);
    for (const block of inserted) expect(block.pos?.group).toBe('five-items-2');
    // the z values sit above the note's 3, and the box starts at the content box
    expect(inserted[0]?.pos).toMatchObject({ x: 137, y: 129, z: 4 });
    expect(inserted[1]?.pos?.z).toBe(5);
    // a second insert frees the ids
    const again = (await dispatcher.dispatch(
      'buildingBlock.insert',
      { slideId, id: 'agendas/five-items', at: [200, 300], baseRevision: result.revision },
      context,
    )) as BuildingBlockInsertResult;
    expect(again.blockIds).toEqual(['h-2', 'list-2']);
    expect(again.group).toBe('five-items-3');
    expect(
      (again.slide as ContentSlide).slots.main?.find((b) => b.id === 'h-2')?.pos,
    ).toMatchObject({ x: 200, y: 300 });
  });

  test('refuses an id the folder lacks and a stale revision', async () => {
    const dispatcher = dispatcherWith(deps);
    const { slideId, revision } = await canvasSlide();
    await expect(
      dispatcher.dispatch(
        'buildingBlock.insert',
        { slideId, id: 'agendas/none', baseRevision: revision },
        context,
      ),
    ).rejects.toThrow(RangeError);
    await expect(
      dispatcher.dispatch(
        'buildingBlock.insert',
        { slideId, id: 'agendas/five-items', baseRevision: revision - 1 },
        context,
      ),
    ).rejects.toThrow();
  });
});

describe('theme.import (SPEC-5 0.28, 5.3)', () => {
  test('appends a file’s record, then refuses the sixth with the sentence', async () => {
    const dispatcher = dispatcherWith(deps);
    let revision = await deps.store.revision();
    let last: ThemeImportResult | undefined;
    for (let i = 0; i < 5; i += 1) {
      last = (await dispatcher.dispatch(
        'theme.import',
        { file: '01-text.pptx', themeIndex: 0, baseRevision: revision },
        context,
      )) as ThemeImportResult;
      expect(last.index).toBe(i);
      revision = last.revision;
    }
    expect(last?.importedThemes).toHaveLength(5);
    expect(last?.record.source).toEqual({ file: '01-text.pptx', themeIndex: 0 });
    const deck = (await deps.store.read()).document.deck;
    expect(deck.importedThemes).toHaveLength(5);
    await expect(
      dispatcher.dispatch(
        'theme.import',
        { file: '01-text.pptx', baseRevision: revision },
        context,
      ),
    ).rejects.toThrow('This presentation already holds five themes');
  });

  test('refuses both or neither source and an index past the end', async () => {
    const dispatcher = dispatcherWith(deps);
    const revision = await deps.store.revision();
    await expect(
      dispatcher.dispatch('theme.import', { baseRevision: revision }, context),
    ).rejects.toThrow();
    await expect(
      dispatcher.dispatch(
        'theme.import',
        { file: '01-text.pptx', themeIndex: 40, baseRevision: revision },
        context,
      ),
    ).rejects.toThrow(RangeError);
  });
});

describe('import.pptx (SPEC-5 5.5)', () => {
  test('answers the report of a dry run through the bridge', async () => {
    const dispatcher = dispatcherWith(deps);
    const report = (await dispatcher.dispatch(
      'import.pptx',
      { file: '02-shapes.pptx', dryRun: true },
      context,
    )) as { summary: { slides: number; imported: number }; deckId?: string };
    expect(report.summary.slides).toBe(3);
    expect(report.summary.imported).toBeGreaterThan(20);
    expect(report.deckId).toBeUndefined();
  });

  test('every handler names the missing bridge when the dispatcher was composed without it', async () => {
    const bare = dispatcherWith({ store: deps.store, lint: deps.lint } as LaneDeps);
    for (const [id, input] of [
      ['template.list', {}],
      ['template.slides', { id: 'sales-pitch' }],
      ['buildingBlock.list', {}],
      ['import.pptx', { file: 'x.pptx', dryRun: true }],
    ] as const) {
      await expect(bare.dispatch(id, input, context)).rejects.toThrow(/import bridge/);
    }
  });
});

// keeps the Slide type in use for the canvas fixture above
export type { Slide, ThemeRecord };
