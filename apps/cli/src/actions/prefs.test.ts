import { createDispatcher } from '@turboslide/agent/dispatch';
import type { ActionContext } from '@turboslide/agent/dispatch';
import { errorStatus } from '@turboslide/schema/errors';
import { defaultPreferences, memoryPreferencesStore } from '@turboslide/schema/preferences';
import type { Preferences } from '@turboslide/schema/preferences';
import { describe, expect, test } from 'vitest';

import type { PrefsLaneDeps } from './prefs.ts';
import { noPreferencesStore, registerPrefsActions } from './prefs.ts';

// prefs.get and prefs.set through the dispatcher (gslides-parity SPEC-5 7.1, 13; R10 3.4): the
// input validated by the action's schema, the pointer read and write on the caller's record, the
// output validated by the action's output schema, and the refusal of a dispatcher composed
// without the record. The module reads one field of its deps, so the store deps are not built.

const context: ActionContext = { author: { kind: 'human', name: 'Maya' } };

function dispatcherWith(store: PrefsLaneDeps['preferences']) {
  const dispatcher = createDispatcher();
  registerPrefsActions(dispatcher, { preferences: store } as PrefsLaneDeps);
  return dispatcher;
}

describe('prefs.get', () => {
  test('the whole record without a path, the value at a pointer, no value for a missing member', async () => {
    const store = memoryPreferencesStore();
    const dispatcher = dispatcherWith(store);
    expect(await dispatcher.dispatch('prefs.get', {}, context)).toEqual({
      path: '',
      value: defaultPreferences(),
    });
    expect(await dispatcher.dispatch('prefs.get', { path: '/units' }, context)).toEqual({
      path: '/units',
      value: 'in',
    });
    expect(
      await dispatcher.dispatch('prefs.get', { path: '/substitutions/rows/0/to' }, context),
    ).toEqual({
      path: '/substitutions/rows/0/to',
      value: '©',
    });
    expect(await dispatcher.dispatch('prefs.get', { path: '/dictation/lang' }, context)).toEqual({
      path: '/dictation/lang',
    });
    await expect(dispatcher.dispatch('prefs.get', { path: 'units' }, context)).rejects.toThrow(
      TypeError,
    );
    await expect(dispatcher.dispatch('prefs.get', { paths: '/units' }, context)).rejects.toThrow(
      /unknown_field|paths/,
    );
  });
});

describe('prefs.set', () => {
  test('writes the member, appends with /-, deletes without a value, and answers the stored record', async () => {
    const store = memoryPreferencesStore();
    const dispatcher = dispatcherWith(store);
    const set = (path: string, value?: unknown) =>
      dispatcher.dispatch(
        'prefs.set',
        value === undefined ? { path } : { path, value },
        context,
      ) as Promise<{
        preferences: Preferences;
      }>;
    expect((await set('/units', 'cm')).preferences.units).toBe('cm');
    expect(store.current().units).toBe('cm');
    expect((await set('/starred/-', 'q4-review')).preferences.starred).toEqual(['q4-review']);
    expect((await set('/starred/-', 'gt-brand')).preferences.starred).toEqual([
      'q4-review',
      'gt-brand',
    ]);
    expect((await set('/starred/0')).preferences.starred).toEqual(['gt-brand']);
    expect(
      (await set('/accessibility/screenReader', true)).preferences.accessibility.screenReader,
    ).toBe(true);
    expect((await set('/substitutions/rows/11')).preferences.substitutions.removedDefaults).toEqual(
      ['...'],
    );
    expect(
      (await set('/spelling/dictionary/-', 'Turboslide')).preferences.spelling.dictionary,
    ).toEqual(['Turboslide']);
    expect(await dispatcher.dispatch('prefs.get', { path: '/units' }, context)).toEqual({
      path: '/units',
      value: 'cm',
    });
  });

  test('a bad value or an unknown member is refused with 400 and the record is unchanged', async () => {
    const store = memoryPreferencesStore();
    const dispatcher = dispatcherWith(store);
    const refused = await dispatcher
      .dispatch('prefs.set', { path: '/units', value: 'pt' }, context)
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(refused).toBeInstanceOf(TypeError);
    expect(errorStatus(refused)).toBe(400);
    expect((refused as Error).message).toContain('/units');
    await expect(
      dispatcher.dispatch('prefs.set', { path: '/theme', value: 'dark' }, context),
    ).rejects.toThrow(/no member at \/theme/);
    await expect(dispatcher.dispatch('prefs.set', { path: '' }, context)).rejects.toThrow(
      TypeError,
    );
    expect(store.current()).toEqual(defaultPreferences());
  });
});

describe('a dispatcher composed without the record', () => {
  test('both actions answer the sentence naming the store, never a default record', async () => {
    const dispatcher = dispatcherWith(undefined);
    await expect(dispatcher.dispatch('prefs.get', {}, context)).rejects.toThrow(
      noPreferencesStore('prefs.get'),
    );
    await expect(
      dispatcher.dispatch('prefs.set', { path: '/units', value: 'cm' }, context),
    ).rejects.toThrow(noPreferencesStore('prefs.set'));
    expect(noPreferencesStore('prefs.get')).toContain('.turboslide/principals/');
  });
});

// ---------------------------------------------------------------------------------------------
// Days 3 to 7 (gslides-parity SPEC-5 7.1, 7.7): text.autocorrect over the gslides fixture, the
// version.delete plan and port, and the widened rows over the existing handlers.

import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import type { TableBlock } from '@turboslide/schema/blocks/table';
import { openFileStore } from '@turboslide/store/file-store';
import { afterEach, beforeEach } from 'vitest';

import {
  REAUTHENTICATE_SENTENCE,
  autocorrectPlain,
  cellStylesWithEdges,
  edgesOfCell,
  guidesWithColors,
  noVersionsPort,
  versionDeletePlan,
} from './prefs.ts';
import type { PrefsLaneDeps as LaneDepsFull, VersionsPort } from './prefs.ts';

const REPO = resolve(import.meta.dirname, '../../../..');
const FIXTURE = join(REPO, 'decks/fixture/gslides');

describe('the lane over a scratch copy of the gslides fixture', () => {
  let dir: string;
  let deps: LaneDepsFull;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'turboslide-prefs-lane-'));
    cpSync(join(FIXTURE, 'deck.json'), join(dir, 'deck.json'));
    cpSync(join(FIXTURE, 'slides'), join(dir, 'slides'), { recursive: true });
    deps = {
      store: openFileStore({ dir }),
      lint: { properNouns: ['Turboslide'], tokens: ['gt-next', 'npx'], iconNames: [] },
      preferences: memoryPreferencesStore(),
    } as unknown as LaneDepsFull;
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const dispatcherOf = () => {
    const dispatcher = createDispatcher();
    registerPrefsActions(dispatcher, deps);
    return dispatcher;
  };

  test('text.autocorrect lists the changes on a dry run and writes them as one commit otherwise', async () => {
    const dispatcher = dispatcherOf();
    const revision = await deps.store.revision();
    // seed a misspelt paragraph with a substitution token and a straight quote
    await deps.store.write({
      baseRevision: revision,
      author: context.author,
      mutations: [
        {
          op: 'block.set',
          slideId: 'autofit',
          blockId: 'p1',
          path: '/text',
          value: 'teh plan (c) is "ready" at www.example.com',
        },
        {
          op: 'slide.set',
          slideId: 'autofit',
          path: '/notes',
          value: 'a note wiht teh gt-next token',
        },
      ],
    });
    const base = await deps.store.revision();
    const dry = (await dispatcher.dispatch(
      'text.autocorrect',
      { slideId: 'autofit', dryRun: true, baseRevision: base },
      context,
    )) as {
      changes: { blockId: string; path: string; from: string; to: string; rule: string }[];
      revision: number;
    };
    expect(dry.revision).toBe(base);
    expect(
      dry.changes.filter((change) => change.blockId === 'p1').map((change) => change.rule),
    ).toEqual(['spelling', 'capitalize', 'substitution', 'quotes', 'quotes', 'link']);
    // the notes: plain, no link, the product token untouched
    expect(
      dry.changes
        .filter((change) => change.path === '/notes')
        .map((change) => `${change.from}>${change.to}`),
    ).toEqual(['a>A', 'wiht>with', 'teh>the']);
    expect(await deps.store.revision()).toBe(base);
    const written = (await dispatcher.dispatch(
      'text.autocorrect',
      { slideId: 'autofit', blockId: 'p1', baseRevision: base },
      context,
    )) as { changes: unknown[]; revision: number };
    expect(written.revision).toBe(base + 1);
    const { document } = await deps.store.read();
    const p1 = (
      document.slides['autofit'] as { slots: { main: { id: string; text?: string }[] } }
    ).slots.main.find((b) => b.id === 'p1');
    expect(p1?.text).toBe('The plan © is “ready” at [www.example.com](https://www.example.com)');
    expect((document.slides['autofit'] as { notes?: string }).notes).toBe(
      'a note wiht teh gt-next token',
    );
    // nothing left to correct answers no change and keeps the revision
    const again = (await dispatcher.dispatch(
      'text.autocorrect',
      { slideId: 'autofit', blockId: 'p1', baseRevision: base + 1 },
      context,
    )) as {
      changes: unknown[];
      revision: number;
    };
    expect(again).toEqual({ changes: [], revision: base + 1 });
  });

  test('deck.guides writes colours beside the geometry in one write and drops the colour of a removed guide', async () => {
    const dispatcher = dispatcherOf();
    const revision = await deps.store.revision();
    const first = (await dispatcher.dispatch(
      'deck.guides',
      {
        add: [{ axis: 'x', at: 400 }],
        colors: { 'x:400': 'plate', 'x:800': 'ink' },
        baseRevision: revision,
      },
      context,
    )) as {
      guides: { x: number[]; y: number[]; colors?: Record<string, string> };
      revision: number;
    };
    expect(first.guides).toEqual({
      x: [400, 800],
      y: [450],
      colors: { 'x:400': 'plate', 'x:800': 'ink' },
    });
    expect(first.revision).toBe(revision + 1);
    const second = (await dispatcher.dispatch(
      'deck.guides',
      { remove: [{ axis: 'x', at: 800 }], colors: { 'x:400': null }, baseRevision: first.revision },
      context,
    )) as { guides: { x: number[]; colors?: Record<string, string> } };
    expect(second.guides).toEqual({ x: [400], y: [450] });
    // the plain form still runs the existing handler
    const third = (await dispatcher.dispatch(
      'deck.guides',
      { clear: true, baseRevision: first.revision + 1 },
      context,
    )) as {
      guides: unknown;
    };
    expect(third.guides).toBeNull();
  });

  test('text.list writes start, prefix and suffix alone and refuses a mix', async () => {
    const dispatcher = dispatcherOf();
    const revision = await deps.store.revision();
    const result = (await dispatcher.dispatch(
      'text.list',
      {
        slideId: 'bullets',
        blockId: 'numbers',
        start: 4,
        prefix: '(',
        suffix: ')',
        baseRevision: revision,
      },
      context,
    )) as {
      slide: {
        slots: { right: { id: string; start?: number; prefix?: string; suffix?: string }[] };
      };
      revision: number;
    };
    const block = result.slide.slots.right.find((b) => b.id === 'numbers');
    expect(block).toMatchObject({ start: 4, prefix: '(', suffix: ')' });
    expect(result.revision).toBe(revision + 1);
    const cleared = (await dispatcher.dispatch(
      'text.list',
      {
        slideId: 'bullets',
        blockId: 'numbers',
        start: null,
        prefix: null,
        baseRevision: result.revision,
      },
      context,
    )) as {
      slide: {
        slots: { right: { id: string; start?: number; prefix?: string; suffix?: string }[] };
      };
    };
    expect(cleared.slide.slots.right.find((b) => b.id === 'numbers')).not.toHaveProperty('start');
    expect(cleared.slide.slots.right.find((b) => b.id === 'numbers')).toMatchObject({
      suffix: ')',
    });
    await expect(
      dispatcher.dispatch(
        'text.list',
        {
          slideId: 'bullets',
          blockId: 'numbers',
          start: 2,
          marker: 'bullet',
          baseRevision: result.revision + 1,
        },
        context,
      ),
    ).rejects.toThrow(/alone/);
    // the plain form runs the existing handler
    const marker = (await dispatcher.dispatch(
      'text.list',
      { slideId: 'bullets', blockId: 'ruled', marker: 'bullet', baseRevision: result.revision + 1 },
      context,
    )) as {
      slide: { slots: { right: { id: string; marker?: string }[] } };
    };
    expect(marker.slide.slots.right.find((b) => b.id === 'ruled')?.marker).toBe('bullet');
  });

  test('text.indent writes the first line and hanging indents, alone or beside the left indent', async () => {
    const dispatcher = dispatcherOf();
    const revision = await deps.store.revision();
    const result = (await dispatcher.dispatch(
      'text.indent',
      {
        slideId: 'autofit',
        blockIds: ['p1'],
        firstLine: 32,
        hanging: 16,
        to: 64,
        baseRevision: revision,
      },
      context,
    )) as {
      slide: { slots: { main: { id: string; typography?: Record<string, number> }[] } };
      revision: number;
    };
    expect(result.slide.slots.main.find((b) => b.id === 'p1')?.typography).toEqual({
      indent: 64,
      firstLine: 32,
      hanging: 16,
    });
    const cleared = (await dispatcher.dispatch(
      'text.indent',
      {
        slideId: 'autofit',
        blockIds: ['p1'],
        firstLine: null,
        hanging: 0,
        baseRevision: result.revision,
      },
      context,
    )) as { slide: { slots: { main: { id: string; typography?: Record<string, number> }[] } } };
    expect(cleared.slide.slots.main.find((b) => b.id === 'p1')?.typography).toEqual({ indent: 64 });
    // the plain step runs the existing handler
    const stepped = (await dispatcher.dispatch(
      'text.indent',
      { slideId: 'autofit', blockIds: ['p1'], by: -1, baseRevision: result.revision + 1 },
      context,
    )) as {
      slide: { slots: { main: { id: string; typography?: Record<string, number> }[] } };
    };
    expect(stepped.slide.slots.main.find((b) => b.id === 'p1')?.typography).toBeUndefined();
  });

  test('table.cellStyle paints the picked edges of the range in one write', async () => {
    const dispatcher = dispatcherOf();
    const revision = await deps.store.revision();
    const result = (await dispatcher.dispatch(
      'table.cellStyle',
      {
        slideId: 'table',
        blockId: 'table',
        cells: [
          [1, 1],
          [1, 2],
          [2, 1],
          [2, 2],
        ],
        border: { weight: 2, color: 'ink' },
        edges: ['outer'],
        baseRevision: revision,
      },
      context,
    )) as {
      slide: { slots: Record<string, { id: string; type: string; cells?: unknown[] }[]> };
      revision: number;
    };
    const table = Object.values(result.slide.slots)
      .flat()
      .find((b) => b.type === 'table') as unknown as TableBlock;
    expect(table.cells).toEqual([
      {
        row: 1,
        column: 1,
        border: { top: { color: 'ink', weight: 2 }, left: { color: 'ink', weight: 2 } },
      },
      {
        row: 1,
        column: 2,
        border: { top: { color: 'ink', weight: 2 }, right: { color: 'ink', weight: 2 } },
      },
      {
        row: 2,
        column: 1,
        border: { bottom: { color: 'ink', weight: 2 }, left: { color: 'ink', weight: 2 } },
      },
      {
        row: 2,
        column: 2,
        border: { bottom: { color: 'ink', weight: 2 }, right: { color: 'ink', weight: 2 } },
      },
    ]);
    expect(result.revision).toBe(revision + 1);
  });

  test('version.delete plans and removes through the port, with the confirm and the hosted rule', async () => {
    const removed: number[][] = [];
    const port: VersionsPort = { remove: async (ns) => void removed.push([...ns]) };
    const dispatcher = createDispatcher();
    registerPrefsActions(dispatcher, { ...deps, versions: port });
    // the fixture copy carries no version log: two writes make two records, the second named
    const seed = await deps.store.revision();
    await deps.store.write({
      baseRevision: seed,
      author: context.author,
      mutations: [{ op: 'deck.set', path: '/title', value: 'One' }],
    });
    await deps.store.saveVersion(context.author, 'Draft to legal');
    const records = await deps.store.records();
    expect(records.length).toBe(2);
    const last = records[records.length - 1]!.n;
    expect(
      await dispatcher.dispatch('version.delete', { upTo: last, confirm: true }, context),
    ).toEqual({
      deleted: records.filter((r) => r.note === '').length,
      kept: records.filter((r) => r.note !== '').length,
    });
    expect(removed[0]).toEqual(records.filter((r) => r.note === '').map((r) => r.n));
    await expect(
      dispatcher.dispatch('version.delete', { upTo: 999, confirm: true }, context),
    ).rejects.toThrow(RangeError);
    await expect(
      dispatcher.dispatch('version.delete', { upTo: last, all: true, confirm: true }, context),
    ).rejects.toThrow();
    await expect(dispatcher.dispatch('version.delete', { upTo: last }, context)).rejects.toThrow();
    const locked = createDispatcher();
    registerPrefsActions(locked, {
      ...deps,
      versions: { ...port, reauthenticated: async () => false },
    });
    await expect(
      locked.dispatch('version.delete', { all: true, confirm: true }, context),
    ).rejects.toThrow(REAUTHENTICATE_SENTENCE);
    const none = createDispatcher();
    registerPrefsActions(none, deps);
    await expect(
      none.dispatch('version.delete', { all: true, confirm: true }, context),
    ).rejects.toThrow(noVersionsPort());
  });
});

describe('the pure pieces of the remaining rows', () => {
  test('versionDeletePlan keeps named versions before the point unless the whole history goes', () => {
    const records = [
      { n: 1, note: '' },
      { n: 2, note: 'Draft to legal' },
      { n: 3, note: '' },
      { n: 4, note: '' },
    ];
    expect(versionDeletePlan(records, { upTo: 3, confirm: true })).toEqual({
      remove: [1, 3],
      keep: [2, 4],
    });
    expect(versionDeletePlan(records, { all: true, confirm: true })).toEqual({
      remove: [1, 2, 3, 4],
      keep: [],
    });
  });
  test('edgesOfCell reads the nine selections over a range', () => {
    const range = { r0: 1, c0: 1, r1: 2, c1: 2 };
    expect(edgesOfCell([1, 1], range, ['all']).sort()).toEqual(['bottom', 'left', 'right', 'top']);
    expect(edgesOfCell([1, 1], range, ['outer']).sort()).toEqual(['left', 'top']);
    expect(edgesOfCell([1, 1], range, ['inner']).sort()).toEqual(['bottom', 'right']);
    expect(edgesOfCell([2, 2], range, ['inner'])).toEqual([]);
    expect(edgesOfCell([1, 2], range, ['horizontal'])).toEqual(['bottom']);
    expect(edgesOfCell([2, 1], range, ['vertical'])).toEqual(['right']);
    expect(edgesOfCell([2, 1], range, ['top'])).toEqual([]);
    expect(edgesOfCell([2, 1], range, ['bottom', 'left']).sort()).toEqual(['bottom', 'left']);
  });
  test('cellStylesWithEdges keeps fills, clears with null and drops empty styles', () => {
    const block = {
      rows: [{ cells: ['a', 'b'] }, { cells: ['c', 'd'] }],
      columns: [{}, {}],
      cells: [{ row: 0, column: 0, fill: 'plate', border: { weight: 1, top: { weight: 3 } } }],
    } as unknown as TableBlock;
    const painted = cellStylesWithEdges(
      block,
      [
        [0, 0],
        [0, 1],
      ],
      { weight: 2 },
      ['bottom'],
    );
    expect(painted).toEqual([
      {
        row: 0,
        column: 0,
        fill: 'plate',
        border: { weight: 1, top: { weight: 3 }, bottom: { weight: 2 } },
      },
      { row: 0, column: 1, border: { bottom: { weight: 2 } } },
    ]);
    const cleared = cellStylesWithEdges(block, [[0, 0]], null, ['top']);
    expect(cleared).toEqual([{ row: 0, column: 0, fill: 'plate', border: { weight: 1 } }]);
  });
  test('guidesWithColors keeps only the colours of guides that exist', () => {
    const page = { width: 1600, height: 900 };
    expect(
      guidesWithColors(
        { x: [800], y: [], colors: { 'x:800': 'ink' } },
        { baseRevision: 1, remove: [{ axis: 'x', at: 800 }], colors: {} },
        page,
      ),
    ).toBeUndefined();
    expect(
      guidesWithColors(
        undefined,
        {
          baseRevision: 1,
          add: [{ axis: 'y', at: 100 }],
          colors: { 'y:100': 'plate', 'y:200': 'ink' },
        },
        page,
      ),
    ).toEqual({
      x: [],
      y: [100],
      colors: { 'y:100': 'plate' },
    });
  });
  test('autocorrectPlain curls quotes and skips links and lists', () => {
    const prefs = defaultPreferences();
    expect(autocorrectPlain('teh "note" -> done\n- item', prefs, 'en-US', []).text).toBe(
      'The “note” → done\n- item',
    );
  });
});
