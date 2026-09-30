// The text actions on the cover's field objects (docs/RETURN.md 2.14 item 1; docs/POLISH.md 2.3
// item 18; VERIFICATION.md "Polish round, pass 2" finding 8): `text.list`, `text.indent` and
// `text.case` name the title slide's `heading`, which is a slide field and no block, so the store
// converts the slide to a canvas in the same write (the measured slide.replace of withCanvas in
// front) and writes the list, the indent or the case on the heading's canvas block: one revision,
// one Undo. The measurer is a stub, so no browser opens; the temp deck comes from the repository's
// blank template, whose one slide is the title.
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { ActionContext } from '@turboslide/agent/dispatch';
import type { CanvasBoxes } from '@turboslide/schema/canvas';
import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';
import type { DeckStore } from '@turboslide/store/store';
import { openFileStore } from '@turboslide/store/file-store';
import { createDeck } from '@turboslide/store/templates';

import { lintLists } from './deps/theme.ts';
import { textCase, textIndent, textList } from './store-actions.ts';
import type { StoreActionDeps } from './store-actions.ts';

const REPO_DECKS = join(import.meta.dirname, '..', '..', '..', 'decks');
const ctx: ActionContext = { author: { kind: 'human', name: 'tester' } };

/** The measurer's answer for the cover: the mark, the heading and the lead at the prompts' boxes. */
const BOXES: CanvasBoxes = {
  blocks: { heading: [160, 300, 1280, 110], lead: [160, 430, 900, 40] },
  mark: [160, 160, 132, 84],
  prompted: [],
};

let root: string;
let store: DeckStore;
let deps: StoreActionDeps;

async function document(): Promise<DeckDocument> {
  return (await store.read()).document;
}
function heading(slide: Slide) {
  return slideBlocks(slide).find(({ block }) => block.id === 'heading')?.block;
}

describe('the text actions on the cover title (the field object converts first)', () => {
  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'turboslide-text-cover-'));
    const decksDir = join(root, 'decks');
    mkdirSync(join(decksDir, 'templates'), { recursive: true });
    symlinkSync(join(REPO_DECKS, 'templates', 'blank'), join(decksDir, 'templates', 'blank'));
    const created = createDeck(decksDir, { name: 'Quarterly review', from: 'blank' });
    store = openFileStore({ dir: created.dir });
    deps = {
      store,
      lint: lintLists(),
      measureCanvas: async (_deck, slides) =>
        Object.fromEntries(slides.map((slide) => [slide.id, BOXES])),
    };
    /* the heading holds two words, so the list has one item with them */
    const before = await document();
    await store.write({
      baseRevision: before.deck.revision,
      author: ctx.author,
      mutations: [
        { op: 'slide.set', slideId: 'title', path: '/heading', value: 'Quarterly review' },
      ],
    });
  });
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('text.list on the heading converts the cover and writes the list in one revision', async () => {
    const before = await document();
    expect(before.slides['title']?.kind).toBe('title');
    const result = await textList(deps, ctx, {
      slideId: 'title',
      blockId: 'heading',
      marker: 'bullet',
      baseRevision: before.deck.revision,
    });
    expect(result.revision).toBe(before.deck.revision + 1);
    expect(result.slide.kind).toBe('content');
    const block = heading(result.slide);
    expect(block?.type).toBe('plain');
    expect(block?.type === 'plain' ? block.items.map((item) => item.text) : []).toEqual([
      'Quarterly review',
    ]);
    expect(block?.type === 'plain' ? block.marker : undefined).toBe('bullet');
    /* one write: its inverse takes the list and the conversion back together */
    const log = await store.records();
    const last = log[log.length - 1];
    expect(last?.mutations.map((mutation) => mutation.op)).toEqual([
      'slide.replace',
      'block.remove',
      'block.insert',
    ]);
    const undone = await store.write({
      baseRevision: result.revision,
      author: ctx.author,
      mutations: last!.inverse,
    });
    expect(undone.ok).toBe(true);
    expect((await document()).slides['title']?.kind).toBe('title');
  });

  test('text.indent on the heading converts the cover and writes the indent', async () => {
    const before = await document();
    const result = await textIndent(deps, ctx, {
      slideId: 'title',
      blockIds: ['heading'],
      by: 1,
      baseRevision: before.deck.revision,
    });
    expect(result.revision).toBe(before.deck.revision + 1);
    expect(result.slide.kind).toBe('content');
    const block = heading(result.slide);
    expect(block?.type).toBe('heading');
    expect((block as { typography?: { indent?: number } }).typography?.indent).toBeGreaterThan(0);
    const log = await store.records();
    const last = log[log.length - 1];
    await store.write({
      baseRevision: result.revision,
      author: ctx.author,
      mutations: last!.inverse,
    });
    expect((await document()).slides['title']?.kind).toBe('title');
  });

  test('text.case on the heading with the field pointer converts the cover and writes the block text', async () => {
    const before = await document();
    const result = await textCase(deps, ctx, {
      slideId: 'title',
      blockId: 'heading',
      path: '/heading',
      range: [0, 16],
      mode: 'upper',
      baseRevision: before.deck.revision,
    });
    expect(result.revision).toBe(before.deck.revision + 1);
    expect(result.text).toBe('QUARTERLY REVIEW');
    expect(result.slide.kind).toBe('content');
    const log = await store.records();
    const last = log[log.length - 1];
    await store.write({
      baseRevision: result.revision,
      author: ctx.author,
      mutations: last!.inverse,
    });
    const cover = (await document()).slides['title'];
    expect(cover?.kind === 'title' ? cover.heading : null).toBe('Quarterly review');
  });

  test('a block that exists converts nothing and an unknown id is refused as before', async () => {
    const before = await document();
    await expect(
      textList(deps, ctx, {
        slideId: 'title',
        blockId: 'nowhere',
        marker: 'bullet',
        baseRevision: before.deck.revision,
      }),
    ).rejects.toThrow(/No block "nowhere" on slide "title"/);
    expect((await document()).deck.revision).toBe(before.deck.revision);
  });
});
