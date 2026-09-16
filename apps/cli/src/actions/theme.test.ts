import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createDispatcher } from '@turboslide/agent/dispatch';
import type { ActionContext } from '@turboslide/agent/dispatch';
import type { Block } from '@turboslide/schema/blocks';
import type { CustomLayout, Deck, Slide, ThemeEdits } from '@turboslide/schema/deck';
import { LAYOUTS } from '@turboslide/schema/layouts';
import { openFileStore } from '@turboslide/store/file-store';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import type { LaneDeps } from './deps.ts';
import {
  applyCustomLayout,
  editsFromRecord,
  fontIdOfName,
  freeCustomLayoutId,
  inferPlaceholders,
  recordWrite,
  registerThemeActions,
} from './theme.ts';

// The theme and layout actions through the dispatcher over a scratch copy of decks/fixture
// (gslides-parity SPEC-5 9.4, 13; R03 4.8; MILESTONES-5 B6 day 5): every input validated by the
// action's schema and every output by its output schema, one `deck.set` per write at the
// shallowest missing ancestor, the refusals of the theme and layout validators, the imported
// record applied to both appearances, the 21 built in layouts beside the custom ones, hiding a
// built in layout, and Apply layout over a custom layout moving the placeholders and keeping the
// free boxes.

const REPO = resolve(import.meta.dirname, '../../../..');
const FIXTURE = join(REPO, 'decks/fixture');
const context: ActionContext = { author: { kind: 'human', name: 'Maya' } };

let dir: string;
let deps: LaneDeps;

function dispatcherWith(lane: LaneDeps) {
  const dispatcher = createDispatcher();
  registerThemeActions(dispatcher, lane);
  return dispatcher;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'turboslide-theme-actions-'));
  cpSync(join(FIXTURE, 'deck.json'), join(dir, 'deck.json'));
  cpSync(join(FIXTURE, 'slides'), join(dir, 'slides'), { recursive: true });
  deps = { store: openFileStore({ dir }) } as unknown as LaneDeps;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function revision(): Promise<number> {
  return deps.store.revision();
}

async function deck(): Promise<Deck> {
  return (await deps.store.read()).document.deck;
}

describe('recordWrite', () => {
  const base: Deck = {
    id: 'd',
    title: 't',
    theme: 'gt-ink-paper',
    sections: [],
    assets: {},
  } as unknown as Deck;

  test('creates the record at the shallowest missing ancestor and writes the leaf once the path exists', () => {
    expect(recordWrite(base, '/themeEdits/colors/light/ink', '#101010')).toEqual({
      op: 'deck.set',
      path: '/themeEdits',
      value: { colors: { light: { ink: '#101010' } } },
    });
    const withColors = { ...base, themeEdits: { colors: { light: { paper: '#ffffff' } } } } as Deck;
    expect(recordWrite(withColors, '/themeEdits/colors/light/ink', '#101010')).toEqual({
      op: 'deck.set',
      path: '/themeEdits/colors/light/ink',
      value: '#101010',
    });
    expect(recordWrite(withColors, '/themeEdits/colors/dark/ink', '#f2f2f0')).toEqual({
      op: 'deck.set',
      path: '/themeEdits/colors/dark',
      value: { ink: '#f2f2f0' },
    });
    expect(recordWrite(withColors, '/themeEdits/name', undefined)).toEqual({
      op: 'deck.set',
      path: '/themeEdits/name',
    });
  });
});

describe('theme.get, theme.set, theme.rename, theme.reset', () => {
  test('an unedited deck answers its id alone; a colour write creates the record and a second one writes the leaf', async () => {
    const dispatcher = dispatcherWith(deps);
    expect(await dispatcher.dispatch('theme.get', {}, context)).toEqual({ theme: 'gt-ink-paper' });
    const first = (await dispatcher.dispatch(
      'theme.set',
      { path: '/colors/light/ink', value: '#101010', baseRevision: await revision() },
      context,
    )) as { path: string; value: unknown; themeEdits: ThemeEdits; revision: number };
    expect(first.path).toBe('/colors/light/ink');
    expect(first.themeEdits).toEqual({ colors: { light: { ink: '#101010' } } });
    const second = (await dispatcher.dispatch(
      'theme.set',
      { path: '/colors/light/paper', value: '#fafafa', baseRevision: first.revision },
      context,
    )) as { themeEdits: ThemeEdits; revision: number };
    expect(second.themeEdits.colors?.light).toEqual({ ink: '#101010', paper: '#fafafa' });
    expect(second.revision).toBe(first.revision + 1);
    expect((await deck()).themeEdits).toEqual(second.themeEdits);
    const got = (await dispatcher.dispatch('theme.get', {}, context)) as {
      themeEdits?: ThemeEdits;
    };
    expect(got.themeEdits).toEqual(second.themeEdits);
  });

  test('the frame, the mark, the counter, the chips, the fonts and a type level write through their pointers', async () => {
    const dispatcher = dispatcherWith(deps);
    let base = await revision();
    const set = async (path: string, value: unknown) => {
      const answer = (await dispatcher.dispatch(
        'theme.set',
        { path, value, baseRevision: base },
        context,
      )) as {
        themeEdits: ThemeEdits;
        revision: number;
      };
      base = answer.revision;
      return answer.themeEdits;
    };
    await set('/frame/crosses', false);
    await set('/frame/inset', 64);
    await set('/mark', { kind: 'none' });
    await set('/counter/side', 'left');
    await set('/chips/show', false);
    await set('/fonts/text', 'roboto');
    const edits = await set('/type/levels/h1', { size: 72, weight: 500 });
    expect(edits).toEqual({
      frame: { crosses: false, inset: 64 },
      mark: { kind: 'none' },
      counter: { side: 'left' },
      chips: { show: false },
      fonts: { text: 'roboto' },
      type: { levels: { h1: { size: 72, weight: 500 } } },
    });
  });

  test('refuses an unknown colour slot, a face the catalog lacks, a picture mark without an asset, and a pointer outside the record', async () => {
    const dispatcher = dispatcherWith(deps);
    const base = await revision();
    await expect(
      dispatcher.dispatch(
        'theme.set',
        { path: '/colors/light/magenta', value: '#ff00ff', baseRevision: base },
        context,
      ),
    ).rejects.toThrow(/magenta/);
    await expect(
      dispatcher.dispatch(
        'theme.set',
        { path: '/fonts/text', value: 'comic-sans', baseRevision: base },
        context,
      ),
    ).rejects.toThrow(TypeError);
    await expect(
      dispatcher.dispatch(
        'theme.set',
        { path: '/mark', value: { kind: 'picture' }, baseRevision: base },
        context,
      ),
    ).rejects.toThrow(/asset/);
    await expect(
      dispatcher.dispatch('theme.set', { path: '/title', value: 'x', baseRevision: base }, context),
    ).rejects.toThrow(TypeError);
    expect((await deck()).themeEdits).toBeUndefined();
  });

  test('rename writes the name; reset removes one pointer, then the whole record', async () => {
    const dispatcher = dispatcherWith(deps);
    const renamed = (await dispatcher.dispatch(
      'theme.rename',
      { name: 'Acme sales 2026', baseRevision: await revision() },
      context,
    )) as { name: string; revision: number };
    expect(renamed.name).toBe('Acme sales 2026');
    const set = (await dispatcher.dispatch(
      'theme.set',
      { path: '/colors/dark/ink', value: '#eeeeee', baseRevision: renamed.revision },
      context,
    )) as { revision: number };
    const one = (await dispatcher.dispatch(
      'theme.reset',
      { path: '/colors', baseRevision: set.revision },
      context,
    )) as { themeEdits?: ThemeEdits; revision: number };
    expect(one.themeEdits).toEqual({ name: 'Acme sales 2026' });
    const all = (await dispatcher.dispatch(
      'theme.reset',
      { baseRevision: one.revision },
      context,
    )) as {
      themeEdits?: ThemeEdits;
      revision: number;
    };
    expect(all.themeEdits).toBeUndefined();
    expect((await deck()).themeEdits).toBeUndefined();
    // a reset of nothing writes nothing and keeps the revision
    const again = (await dispatcher.dispatch(
      'theme.reset',
      { baseRevision: all.revision },
      context,
    )) as {
      revision: number;
    };
    expect(again.revision).toBe(all.revision);
  });
});

describe('theme.applyImported', () => {
  test('writes the record’s colours into both appearances and its faces by catalog name; refuses an index the deck lacks', async () => {
    const dispatcher = dispatcherWith(deps);
    await expect(
      dispatcher.dispatch(
        'theme.applyImported',
        { index: 0, baseRevision: await revision() },
        context,
      ),
    ).rejects.toThrow(/Import theme/);
    const record = {
      name: 'Acme',
      colors: { ink: '#111111', paper: '#fefefe', link: '#0000ee' },
      fonts: { display: 'Open Sans', text: 'Comic Sans MS' },
      source: { file: 'acme.pptx', themeIndex: 0 },
    };
    const seeded = await deps.store.write(
      {
        baseRevision: await revision(),
        author: context.author,
        mutations: [{ op: 'deck.set', path: '/importedThemes', value: [record] }],
      },
      {},
    );
    expect(seeded.ok).toBe(true);
    const applied = (await dispatcher.dispatch(
      'theme.applyImported',
      { index: 0, baseRevision: await revision() },
      context,
    )) as { themeEdits: ThemeEdits };
    expect(applied.themeEdits).toEqual({
      name: 'Acme',
      colors: { light: record.colors, dark: record.colors },
      fonts: { display: 'open-sans' },
    });
    await expect(
      dispatcher.dispatch(
        'theme.applyImported',
        { index: 3, baseRevision: await revision() },
        context,
      ),
    ).rejects.toThrow(/holds 1/);
  });

  test('fontIdOfName and editsFromRecord', () => {
    expect(fontIdOfName('Open Sans')).toBe('open-sans');
    expect(fontIdOfName('Source Sans 3')).toBe('source-sans-3');
    expect(fontIdOfName('Comic Sans MS')).toBeUndefined();
    expect(fontIdOfName(undefined)).toBeUndefined();
    const edits = editsFromRecord(
      { name: 'A', colors: { ink: '#000000' }, fonts: {}, source: { deckId: 'x' } },
      { frame: { crosses: false } },
    );
    expect(edits).toEqual({
      frame: { crosses: false },
      name: 'A',
      colors: { light: { ink: '#000000' }, dark: { ink: '#000000' } },
    });
  });
});

describe('layout.*', () => {
  test('lists the 21 built in layouts, none hidden, and no custom one on a fresh deck', async () => {
    const dispatcher = dispatcherWith(deps);
    const answer = (await dispatcher.dispatch('layout.list', {}, context)) as {
      layouts: { id: string; builtIn: boolean; hidden: boolean }[];
    };
    expect(answer.layouts).toHaveLength(21);
    expect(answer.layouts.map((row) => row.id)).toEqual(LAYOUTS.map((entry) => entry.id));
    expect(answer.layouts.every((row) => row.builtIn && !row.hidden)).toBe(true);
  });

  test('create from Title slide infers a title and a subtitle placeholder; a blank one has no blocks; ids stay free', async () => {
    const dispatcher = dispatcherWith(deps);
    const quote = (await dispatcher.dispatch(
      'layout.create',
      { from: 'title', name: 'Quote', baseRevision: await revision() },
      context,
    )) as { id: string; layout: CustomLayout; revision: number };
    expect(quote.id).toBe('custom-quote');
    expect(quote.layout.from).toBe('title');
    expect(quote.layout.displayName).toBe('Quote');
    const kinds = (quote.layout.blocks ?? []).map(
      (block) => (block as { placeholder?: string }).placeholder,
    );
    expect(kinds).toEqual(['title', 'subtitle']);
    expect((quote.layout.blocks ?? []).every((block) => block.pos !== undefined)).toBe(true);
    const blank = (await dispatcher.dispatch(
      'layout.create',
      { name: 'Quote', baseRevision: quote.revision },
      context,
    )) as { id: string; layout: CustomLayout; revision: number };
    expect(blank.id).toBe('custom-quote-2');
    expect(blank.layout.blocks).toEqual([]);
    const listed = (await dispatcher.dispatch('layout.list', {}, context)) as {
      layouts: { id: string; name: string; builtIn: boolean; placeholders: string[] }[];
    };
    expect(listed.layouts.slice(21)).toEqual([
      {
        id: 'custom-quote',
        name: 'Quote',
        builtIn: false,
        hidden: false,
        placeholders: ['title', 'subtitle'],
      },
      { id: 'custom-quote-2', name: 'Quote', builtIn: false, hidden: false, placeholders: [] },
    ]);
  });

  test('duplicate, rename, set a placeholder, delete a custom layout, hide and re-hide a built in one', async () => {
    const dispatcher = dispatcherWith(deps);
    const made = (await dispatcher.dispatch(
      'layout.create',
      { from: 'title', name: 'Quote', baseRevision: await revision() },
      context,
    )) as { id: 'custom-quote'; layout: CustomLayout; revision: number };
    const copy = (await dispatcher.dispatch(
      'layout.duplicate',
      { id: made.id, baseRevision: made.revision },
      context,
    )) as { id: string; layout: CustomLayout; revision: number };
    expect(copy.id).toBe('custom-quote-copy');
    expect(copy.layout.blocks).toEqual(made.layout.blocks);
    const renamed = (await dispatcher.dispatch(
      'layout.rename',
      { id: copy.id, name: 'Customer quote', baseRevision: copy.revision },
      context,
    )) as { id: string; name: string; revision: number };
    expect(renamed.name).toBe('Customer quote');
    const blockId = made.layout.blocks?.[1]?.id ?? '';
    const marked = (await dispatcher.dispatch(
      'layout.setPlaceholder',
      { layoutId: made.id, blockId, placeholder: 'body', baseRevision: renamed.revision },
      context,
    )) as { layout: CustomLayout; revision: number };
    expect((marked.layout.blocks?.[1] as { placeholder?: string }).placeholder).toBe('body');
    const cleared = (await dispatcher.dispatch(
      'layout.setPlaceholder',
      { layoutId: made.id, blockId, placeholder: null, baseRevision: marked.revision },
      context,
    )) as { layout: CustomLayout; revision: number };
    expect((cleared.layout.blocks?.[1] as { placeholder?: string }).placeholder).toBeUndefined();
    await expect(
      dispatcher.dispatch(
        'layout.delete',
        { id: copy.id, baseRevision: cleared.revision },
        context,
      ),
    ).rejects.toThrow();
    const removed = (await dispatcher.dispatch(
      'layout.delete',
      { id: copy.id, confirm: true, baseRevision: cleared.revision },
      context,
    )) as { id: string; hidden: boolean; revision: number };
    expect(removed.hidden).toBe(false);
    expect((await deck()).customLayouts?.['custom-quote-copy']).toBeUndefined();
    const hidden = (await dispatcher.dispatch(
      'layout.delete',
      { id: 'statement', confirm: true, baseRevision: removed.revision },
      context,
    )) as { id: string; hidden: boolean; revision: number };
    expect(hidden.hidden).toBe(true);
    const listed = (await dispatcher.dispatch('layout.list', {}, context)) as {
      layouts: { id: string; hidden: boolean }[];
    };
    expect(listed.layouts.find((row) => row.id === 'statement')?.hidden).toBe(true);
    expect(
      listed.layouts
        .filter((row) => !row.hidden && row.id.startsWith('custom-'))
        .map((row) => row.id),
    ).toEqual(['custom-quote']);
    const again = (await dispatcher.dispatch(
      'layout.delete',
      { id: 'statement', confirm: true, baseRevision: hidden.revision },
      context,
    )) as { revision: number };
    expect(again.revision).toBe(hidden.revision);
    expect(freeCustomLayoutId('Quote', new Set(['custom-quote']))).toBe('custom-quote-2');
    expect(freeCustomLayoutId('   ', new Set())).toBe('custom-layout');
  });

  test('inferPlaceholders marks the first heading, the Title layout’s first text as subtitle, lists as body and pictures as image', () => {
    const blocks = inferPlaceholders(
      [
        { id: 'h', type: 'heading', level: 'h1', text: '' },
        { id: 'p1', type: 'paragraph', text: '' },
        { id: 'p2', type: 'paragraph', text: '' },
        { id: 'l', type: 'plain', items: [] },
        { id: 'f', type: 'shot', asset: 'a' },
        { id: 's', type: 'shape', shape: 'rect' },
      ] as Block[],
      'title',
    );
    expect(blocks.map((block) => (block as { placeholder?: string }).placeholder)).toEqual([
      'title',
      'subtitle',
      'body',
      'body',
      'picture',
      undefined,
    ]);
  });
});

describe('applyCustomLayout', () => {
  const page = { width: 1600, height: 900, preset: 'widescreen-16-9' } as const;
  const layout: CustomLayout = {
    displayName: 'Two up',
    blocks: [
      {
        id: 't',
        type: 'heading',
        level: 'h2',
        text: '',
        placeholder: 'title',
        pos: { x: 137, y: 129, w: 1326, h: 80 },
      },
      {
        id: 'b',
        type: 'text',
        text: '',
        placeholder: 'body',
        pos: { x: 137, y: 240, w: 640, h: 520 },
      },
      {
        id: 'i',
        type: 'shape',
        shape: 'rect',
        placeholder: 'picture',
        pos: { x: 823, y: 240, w: 640, h: 520 },
      },
      { id: 'rule', type: 'rule', pos: { x: 137, y: 220, w: 1326, h: 2 } },
    ] as Block[],
  };

  test('moves a grammar slide’s title and texts into the placeholder boxes and copies the layout’s decoration', () => {
    const slide: Slide = {
      schemaVersion: 1,
      id: 'content-rule',
      kind: 'content',
      layout: { type: 'cols', ratio: '1/1' },
      slots: {
        left: [
          { id: 'h', type: 'heading', level: 'h2', text: 'The copy test' },
          { id: 'p', type: 'paragraph', text: 'Every line states a number.' },
        ],
        right: [{ id: 'list', type: 'plain', items: [{ text: 'One' }, { text: 'Two' }] }],
      },
      notes: 'keep me',
    } as Slide;
    const { slide: next, dropped } = applyCustomLayout(
      slide,
      'custom-two-up',
      layout,
      page as never,
    );
    expect(dropped).toEqual([]);
    expect(next.kind).toBe('content');
    expect(next.template).toBe('custom-two-up');
    expect(next.notes).toBe('keep me');
    const main = next.kind === 'content' ? (next.slots.main ?? []) : [];
    const title = main.find((block) => block.type === 'heading') as {
      text: string;
      pos: { x: number; y: number; w: number };
    };
    expect(title.text).toBe('The copy test');
    expect(title.pos).toMatchObject({ x: 137, y: 129, w: 1326 });
    const bodies = main.filter((block) => block.type === 'text' || block.type === 'plain');
    expect(bodies).toHaveLength(2);
    expect(bodies.every((block) => block.pos?.x === 137 && block.pos.w === 640)).toBe(true);
    expect((bodies[0] as { text: string }).text).toBe('Every line states a number.');
    // no picture in the source: the image placeholder stays as the layout drew it; the rule is copied
    expect(main.some((block) => block.type === 'shape' && block.pos?.x === 823)).toBe(true);
    expect(main.some((block) => block.type === 'rule')).toBe(true);
  });

  test('a canvas slide keeps its free boxes where they are', () => {
    const slide: Slide = {
      schemaVersion: 1,
      id: 'c',
      kind: 'content',
      layout: { type: 'freeform' },
      slots: {
        main: [
          {
            id: 'h',
            type: 'heading',
            level: 'h2',
            text: 'Title',
            pos: { x: 10, y: 10, w: 300, h: 60, z: 0 },
          },
          { id: 'sq', type: 'shape', shape: 'rect', pos: { x: 900, y: 700, w: 80, h: 80, z: 1 } },
        ],
      },
    } as Slide;
    const { slide: next } = applyCustomLayout(slide, 'custom-two-up', layout, page as never);
    const main = next.kind === 'content' ? (next.slots.main ?? []) : [];
    const square = main.find((block) => block.id === 'sq');
    expect(square?.pos).toMatchObject({ x: 900, y: 700, w: 80, h: 80 });
    const title = main.find((block) => block.type === 'heading') as {
      text: string;
      pos: { x: number };
    };
    expect(title.text).toBe('Title');
    expect(title.pos.x).toBe(137);
  });
});
