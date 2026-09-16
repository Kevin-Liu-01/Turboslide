// The schedule (gslides-parity SPEC-5 1.3, 2.6): `compileMotion` over the eleven slides of
// decks/fixture/motion as a JSON snapshot, with the paragraph counts read from the rendered
// nodes the way the show reads them and the media lengths from the deck; the click count per
// slide pinned beside the snapshot (build-5/b1.md records them); the contract's rules on small
// in memory slides: a click opens a step, With previous shares the start of the row it follows,
// After previous chains, a first With or After previous joins the entry step, By paragraph
// expands under the three triggers, the entrance and exit visibility, Spin, Play's remaining
// length and the looping medium, the skipped rows, the None transition, and the paragraph count
// agreeing between the rendered nodes and the document (MILESTONES-5 B1 day 1).
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';
import type { ContentSlide, Deck, Slide } from '@turboslide/schema/deck';
import { slideOrder } from '@turboslide/schema/deck';
import type { Animation } from '@turboslide/schema/motion';
import { blockParagraphCount, PARAGRAPH_CARRIER_TYPES } from '@turboslide/schema/motion';
import {
  compileMotion,
  countParagraphs,
  deckMediaLength,
  motionBlocks,
  paragraphNodes,
  stepCount,
} from '../motion.ts';
import type { MediaLength, ParagraphCounter } from '../motion.ts';
import { renderSlide } from '../slide.ts';
import type { RenderOptions } from '../slide.ts';

const REPO = resolve(import.meta.dirname, '../../../..');
const FIXTURE_DIR = join(REPO, 'decks/fixture/motion');
const GT_DIR = join(REPO, 'decks/gt-brand');

function loadDeck(dir: string): { deck: Deck; slides: Record<string, Slide> } {
  const deck = JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8')) as Deck;
  const slides: Record<string, Slide> = {};
  for (const file of readdirSync(join(dir, 'slides')))
    slides[file.replace(/\.json$/, '')] = JSON.parse(
      readFileSync(join(dir, 'slides', file), 'utf8'),
    ) as Slide;
  return { deck, slides };
}

const options: RenderOptions = {
  theme: 'light',
  chrome: false,
  assetBase: 'decks/fixture/motion/',
  blockAttrs: true,
  gtWord: true,
};

/** The show's counter: the rendered block roots parsed by jsdom, `countParagraphs` over each. */
function renderedCounter(deck: Deck, slide: Slide): ParagraphCounter {
  const { html } = renderSlide(deck, slide, options);
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`);
  return (blockId) => {
    const root = dom.window.document.querySelector(`[data-block="${blockId}"]`);
    return root === null ? 0 : countParagraphs(root);
  };
}

const fixture = loadDeck(FIXTURE_DIR);
const order = slideOrder(fixture.deck);

/** The click count of each fixture slide, the number the show's "Step k of n" reads. */
const CLICKS: Record<string, number> = {
  't-none': 1,
  't-dissolve': 1,
  't-fade': 0,
  't-slide-right': 0,
  't-slide-left': 1,
  't-flip': 1,
  't-cube': 1,
  't-gallery': 0,
  effects: 6,
  paragraphs: 4,
  media: 0,
};

describe('compileMotion over decks/fixture/motion (SPEC-5 2.6)', () => {
  it('lists the eleven slides in the fixture’s order', () => {
    expect(order).toEqual(Object.keys(CLICKS));
  });

  for (const id of order) {
    it(`compiles ${id} to the pinned schedule`, () => {
      const slide = fixture.slides[id];
      if (slide === undefined) throw new Error(id);
      const schedule = compileMotion(
        slide,
        motionBlocks(slide),
        renderedCounter(fixture.deck, slide),
        deckMediaLength(fixture.deck, slide),
      );
      expect(schedule.slideId).toBe(id);
      expect(schedule.skipped).toEqual([]);
      expect(stepCount(schedule)).toBe(CLICKS[id]);
      expect(schedule).toMatchSnapshot();
    });
  }

  it('reads the fixture’s paragraph counts the same from the rendered nodes and the document', () => {
    for (const id of order) {
      const slide = fixture.slides[id];
      if (slide === undefined) throw new Error(id);
      const rendered = renderedCounter(fixture.deck, slide);
      for (const block of motionBlocks(slide))
        if (PARAGRAPH_CARRIER_TYPES.has(block.type))
          expect([id, block.id, rendered(block.id)]).toEqual([
            id,
            block.id,
            blockParagraphCount(block),
          ]);
    }
  });

  it('stamps the paragraph nodes of the By paragraph slide in order', () => {
    const slide = fixture.slides['paragraphs'];
    if (slide === undefined) throw new Error('paragraphs');
    const { html } = renderSlide(fixture.deck, slide, options);
    const dom = new JSDOM(`<!doctype html><body>${html}</body>`);
    const para = dom.window.document.querySelector('[data-block="para"]');
    const list = dom.window.document.querySelector('[data-block="list"]');
    const heading = dom.window.document.querySelector('[data-block="h"]');
    if (para === null || list === null || heading === null) throw new Error('roots');
    expect(paragraphNodes(para).map((node) => node.className)).toEqual(['para', 'para', 'para']);
    expect(paragraphNodes(list)).toHaveLength(4);
    expect(paragraphNodes(list).every((node) => node.tagName === 'SPAN')).toBe(true);
    expect(paragraphNodes(heading)).toEqual([heading]);
  });

  it('compiles every GT deck slide to no steps, nothing hidden and no transition', () => {
    const gt = loadDeck(GT_DIR);
    for (const id of slideOrder(gt.deck)) {
      const slide = gt.slides[id];
      if (slide === undefined) throw new Error(id);
      const schedule = compileMotion(slide, motionBlocks(slide), () => 1);
      expect(schedule).toEqual({
        slideId: id,
        steps: [],
        hiddenAtStart: [],
        transition: null,
        skipped: [],
      });
    }
  });
});

// ---------------------------------------------------------------------------------------------
// The contract on small slides

const box = (x: number, y: number, w: number, h: number, z: number) => ({ x, y, w, h, z });

const blocks: Block[] = [
  { id: 'a', type: 'shape', shape: 'rect', stroke: 'ink', pos: box(100, 100, 200, 100, 1) },
  { id: 'b', type: 'text', text: 'One\nTwo\nThree', pos: box(400, 100, 300, 100, 2) },
  {
    id: 'l',
    type: 'plain',
    items: [{ text: 'i' }, { text: 'ii' }, { text: 'iii' }, { text: 'iv' }],
    pos: box(100, 300, 400, 200, 3),
  },
  {
    id: 'v',
    type: 'media',
    kind: 'video',
    source: { asset: 'clip' },
    playback: { start: 'auto', startMs: 200, endMs: 900 },
    pos: box(800, 100, 320, 180, 4),
  },
  {
    id: 'w',
    type: 'media',
    kind: 'audio',
    source: { asset: 'song' },
    playback: { start: 'auto', loop: true },
    pos: box(800, 400, 200, 200, 5),
  },
];

function slideWith(animations: Animation[], extra: Partial<ContentSlide> = {}): ContentSlide {
  return {
    schemaVersion: 1,
    id: 's',
    kind: 'content',
    layout: { type: 'freeform' },
    slots: { main: blocks },
    animations,
    ...extra,
  };
}

const counts: ParagraphCounter = (blockId) => ({ a: 0, b: 3, l: 4 })[blockId] ?? 0;
const lengths: MediaLength = (blockId) => ({ v: 3000, w: 60000 })[blockId] ?? null;
const row = (id: string, blockId: string, extra: Partial<Animation>): Animation => ({
  id,
  blockId,
  effect: 'appear',
  trigger: 'click',
  durationMs: 500,
  ...extra,
});

/** The steps as `[delay, duration, animationId, paragraph]` rows, the shape the assertions read. */
function shape(slide: ContentSlide): (string | number)[][][] {
  return compileMotion(slide, blocks, counts, lengths).steps.map((step) =>
    step.effects.map((effect) => [
      effect.delayMs,
      effect.durationMs,
      effect.animation.id,
      effect.paragraph ?? -1,
    ]),
  );
}

describe('compileMotion, the contract of SPEC-5 1.3', () => {
  it('opens a new step per click and leaves the entry step empty behind a first click', () => {
    const slide = slideWith([
      row('a1', 'a', { effect: 'fadeIn', durationMs: 1000 }),
      row('a2', 'b', { effect: 'fadeIn', durationMs: 700 }),
    ]);
    const schedule = compileMotion(slide, blocks, counts);
    expect(schedule.steps.map((step) => step.durationMs)).toEqual([0, 1000, 700]);
    expect(stepCount(schedule)).toBe(2);
    expect(schedule.hiddenAtStart).toEqual(['a', 'b']);
  });

  it('joins With previous at the start of the row it follows and After previous at the end of its group', () => {
    const slide = slideWith([
      row('a1', 'a', { effect: 'fadeIn', durationMs: 1000 }),
      row('a2', 'b', { effect: 'fadeIn', trigger: 'afterPrevious', durationMs: 700 }),
      row('a3', 'l', { effect: 'zoomIn', trigger: 'withPrevious', durationMs: 300 }),
      row('a4', 'a', { effect: 'spin', trigger: 'afterPrevious', durationMs: 400 }),
    ]);
    expect(shape(slide)).toEqual([
      [],
      [
        [0, 1000, 'a1', -1],
        [1000, 700, 'a2', -1],
        [1000, 300, 'a3', -1],
        [1700, 400, 'a4', -1],
      ],
    ]);
    expect(compileMotion(slide, blocks, counts).steps[1]?.durationMs).toBe(2100);
  });

  it('joins a first With previous or After previous to the entry step', () => {
    const withFirst = slideWith([row('a1', 'a', { trigger: 'withPrevious' })]);
    expect(shape(withFirst)).toEqual([[[0, 1, 'a1', -1]]]);
    expect(stepCount(compileMotion(withFirst, blocks, counts))).toBe(0);
    const afterFirst = slideWith([
      row('a1', 'a', { trigger: 'afterPrevious', effect: 'fadeIn' }),
      row('a2', 'b', { effect: 'fadeIn' }),
    ]);
    expect(shape(afterFirst)).toEqual([[[0, 500, 'a1', -1]], [[0, 500, 'a2', -1]]]);
  });

  it('expands By paragraph to one step each under click, a chain under After previous, together under With previous', () => {
    const click = slideWith([row('a1', 'b', { effect: 'fadeIn', byParagraph: true })]);
    expect(shape(click)).toEqual([
      [],
      [[0, 500, 'a1', 0]],
      [[0, 500, 'a1', 1]],
      [[0, 500, 'a1', 2]],
    ]);
    const after = slideWith([
      row('a1', 'a', { effect: 'fadeIn', durationMs: 200 }),
      row('a2', 'l', { trigger: 'afterPrevious', byParagraph: true }),
    ]);
    expect(shape(after)).toEqual([
      [],
      [
        [0, 200, 'a1', -1],
        [200, 1, 'a2', 0],
        [201, 1, 'a2', 1],
        [202, 1, 'a2', 2],
        [203, 1, 'a2', 3],
      ],
    ]);
    const together = slideWith([
      row('a1', 'a', { effect: 'fadeIn', durationMs: 200 }),
      row('a2', 'b', { effect: 'fadeIn', trigger: 'withPrevious', byParagraph: true }),
    ]);
    expect(shape(together)).toEqual([
      [],
      [
        [0, 200, 'a1', -1],
        [0, 500, 'a2', 0],
        [0, 500, 'a2', 1],
        [0, 500, 'a2', 2],
      ],
    ]);
  });

  it('plays By paragraph on a block with fewer than two paragraphs, or a non carrier, as one object', () => {
    const shapeRow = slideWith([row('a1', 'a', { byParagraph: true })]);
    expect(shape(shapeRow)).toEqual([[], [[0, 1, 'a1', -1]]]);
    const one = slideWith([row('a1', 'b', { byParagraph: true })]);
    expect(
      compileMotion(one, blocks, () => 1).steps.map((step) =>
        step.effects.map((effect) => effect.paragraph ?? -1),
      ),
    ).toEqual([[], [-1]]);
  });

  it('hides an entrance’s block at the start whatever its position, never an exit’s or Spin’s', () => {
    const slide = slideWith([
      row('a1', 'a', { effect: 'fadeOut' }),
      row('a2', 'b', { effect: 'spin' }),
      row('a3', 'l', { effect: 'disappear' }),
      row('a4', 'l', { effect: 'fadeIn' }),
      row('a5', 'a', { effect: 'zoomIn' }),
    ]);
    expect(compileMotion(slide, blocks, counts).hiddenAtStart).toEqual(['l', 'a']);
  });

  it('switches Appear and Disappear in one millisecond whatever the row’s duration', () => {
    const slide = slideWith([
      row('a1', 'a', { durationMs: 2000 }),
      row('a2', 'b', { effect: 'disappear', trigger: 'afterPrevious', durationMs: 2000 }),
    ]);
    expect(shape(slide)).toEqual([
      [],
      [
        [0, 1, 'a1', -1],
        [1, 1, 'a2', -1],
      ],
    ]);
  });

  it('gives Play the media’s remaining length after the trim and a looping medium the step’s length', () => {
    const slide = slideWith([
      row('a1', 'v', { effect: 'playMedia', trigger: 'withPrevious' }),
      row('a2', 'w', { effect: 'playMedia', trigger: 'withPrevious' }),
      row('a3', 'a', { effect: 'fadeIn', trigger: 'withPrevious', durationMs: 1200 }),
    ]);
    expect(shape(slide)).toEqual([
      [
        [0, 700, 'a1', -1],
        [0, 1200, 'a2', -1],
        [0, 1200, 'a3', -1],
      ],
    ]);
    expect(compileMotion(slide, blocks, counts, lengths).steps[0]?.durationMs).toBe(1200);
    // without a known length the row keeps its own duration; a trimmed end alone is enough
    const unknown = compileMotion(slide, blocks, counts).steps[0]?.effects[0];
    expect(unknown?.durationMs).toBe(700);
    const open = slideWith([row('a1', 'v', { effect: 'playMedia', trigger: 'withPrevious' })]);
    const openBlocks = blocks.map((block) =>
      block.id === 'v' && block.type === 'media'
        ? { ...block, playback: { start: 'auto' as const, startMs: 500 } }
        : block,
    );
    expect(compileMotion(open, openBlocks, counts).steps[0]?.effects[0]?.durationMs).toBe(500);
    expect(compileMotion(open, openBlocks, counts, lengths).steps[0]?.effects[0]?.durationMs).toBe(
      2500,
    );
  });

  it('skips a row whose block is missing or a Play on a non media block, and names it', () => {
    const slide = slideWith([
      row('a1', 'gone', {}),
      row('a2', 'a', { effect: 'playMedia' }),
      row('a3', 'a', {}),
    ]);
    const schedule = compileMotion(slide, blocks, counts);
    expect(schedule.skipped).toEqual([
      { animationId: 'a1', reason: 'no block "gone" on the slide' },
      {
        animationId: 'a2',
        reason: 'Play on block "a" of type shape, which is not a media block',
      },
    ]);
    expect(shape(slide)).toEqual([[], [[0, 1, 'a3', -1]]]);
  });

  it('carries the block’s box on every effect of a positioned block and none on a flow block', () => {
    const slide = slideWith([row('a1', 'a', { effect: 'flyIn', direction: 'left' })]);
    expect(compileMotion(slide, blocks, counts).steps[1]?.effects[0]?.box).toEqual([
      100, 100, 200, 100,
    ]);
    const flow: ContentSlide = {
      schemaVersion: 1,
      id: 'flow',
      kind: 'content',
      layout: { type: 'stack' },
      slots: { main: [{ id: 'h', type: 'heading', level: 'h2', text: 'Flow' }] },
      animations: [row('a1', 'h', { effect: 'flyIn', direction: 'top' })],
    };
    const effect = compileMotion(flow, motionBlocks(flow), counts).steps[1]?.effects[0];
    expect(effect?.box).toBeUndefined();
  });

  it('keeps a None transition as null and every other kind as written', () => {
    const none = slideWith([], { transition: { kind: 'none', durationMs: 500 } });
    expect(compileMotion(none, blocks, counts).transition).toBeNull();
    const cube = slideWith([], { transition: { kind: 'cube', durationMs: 999 } });
    expect(compileMotion(cube, blocks, counts).transition).toEqual({
      kind: 'cube',
      durationMs: 999,
    });
    expect(compileMotion(cube, blocks, counts).steps).toEqual([]);
  });
});
