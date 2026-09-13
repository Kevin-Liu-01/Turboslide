// The freeform round (docs/freeform.md): the position schema and its validation, the snapping,
// the align, distribute and order arithmetic, the layout conversion behind slide.setLayout, the z
// target of block.move with its inverse, and the four actions (block.align, block.distribute,
// block.order, slide.setLayout) whose examples the coverage test runs.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ACTIONS } from './actions.ts';
import { readInspector } from './annotate.ts';
import { boxBlockSchema, textBlockSchema } from './blocks.ts';
import { colorCss, colorSchema, isHexColor } from './color.ts';
import type { ContentSlide, DeckDocument } from './deck.ts';
import { CONTENT_RULE, FREEFORM_SLIDE, freeformDocument } from './fixtures.ts';
import {
  alignPositions,
  convertLayout,
  distributePositions,
  insideContent,
  layoutSlotBoxes,
  offSheet,
  overlapArea,
  readingOrder,
  reorderZ,
  snapCoordinate,
  snapPosition,
  sortByZ,
  GUIDES,
} from './freeform.ts';
import type { Write } from './mutations.ts';
import type { Position } from './position.ts';
import { applyWrite } from './reduce.ts';
import { nearestLadderSize, typographyDeclarations } from './typography.ts';
import { validateDocument, validateSlide } from './validate.ts';

const author = { kind: 'human', name: 'kevin' } as const;
const NOW = '2026-09-11T12:00:00.000Z';

function write(mutations: Write['mutations'], baseRevision = 412): Write {
  return { baseRevision, author, mutations };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function base(): DeckDocument {
  const result = validateDocument(freeformDocument());
  if (!result.ok || result.deck === null)
    throw new Error(result.issues.map((i) => i.message).join());
  return { deck: result.deck, slides: result.slides };
}

describe('color and typography', () => {
  it('accepts a token or a six digit hex and writes the css value', () => {
    expect(colorSchema.safeParse('plate').success).toBe(true);
    expect(colorSchema.safeParse('#2f5ce0').success).toBe(true);
    expect(colorSchema.safeParse('#2F5CE0').success).toBe(true);
    expect(colorSchema.safeParse('#fff').success).toBe(false);
    expect(colorSchema.safeParse('red-ish').success).toBe(false);
    expect(colorCss('ink-2')).toBe('var(--ink-2)');
    expect(colorCss('green')).toBe('#12a37a');
    expect(colorCss('#abcdef')).toBe('#abcdef');
    expect(isHexColor('#abcdef')).toBe(true);
    expect(isHexColor('ink')).toBe(false);
    const json = z.toJSONSchema(colorSchema, { target: 'draft-2020-12' });
    expect(JSON.stringify(json)).toContain('[0-9a-fA-F]{6}');
  });

  it('annotates the color, typography and position groups with their control kinds', () => {
    expect(readInspector(textBlockSchema.shape.color)).toMatchObject({ control: 'color' });
    expect(readInspector(textBlockSchema.shape.typography)).toMatchObject({
      control: 'typography',
    });
    expect(readInspector(boxBlockSchema.shape.pos)).toMatchObject({ control: 'position' });
    expect(typographyDeclarations({ size: 26, weight: 500, align: 'center' })).toEqual([
      'font-size:26px',
      'font-weight:500',
      'text-align:center',
    ]);
    expect(typographyDeclarations(undefined)).toEqual([]);
    // ties go to the larger size: 23 sits one away from 22 and 24
    expect(nearestLadderSize(23)).toBe(24);
    expect(nearestLadderSize(29)).toBe(26);
    expect(nearestLadderSize(100)).toBe(88);
  });
});

describe('position validation', () => {
  it('accepts the freeform fixture with no issues', () => {
    const result = validateDocument(freeformDocument());
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('requires pos on every top-level block of a freeform slide', () => {
    const slide = clone(FREEFORM_SLIDE);
    if (slide.kind !== 'content') throw new Error('fixture');
    const first = slide.slots.main?.[0];
    if (first === undefined) throw new Error('fixture');
    delete first.pos;
    const result = validateSlide(slide);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'position', pointer: '/slots/main/0/pos', severity: 3 }),
    );
  });

  it('refuses pos on a grammar layout and inside a composite', () => {
    const slide = clone(CONTENT_RULE);
    if (slide.kind !== 'content') throw new Error('fixture');
    const heading = slide.slots.left?.[0];
    if (heading === undefined) throw new Error('fixture');
    heading.pos = { x: 0, y: 0, w: 10, h: 10 };
    expect(validateSlide(slide).issues.map((i) => `${i.code}${i.pointer}`)).toContain(
      'position/slots/left/0/pos',
    );
    const nested = clone(FREEFORM_SLIDE);
    if (nested.kind !== 'content') throw new Error('fixture');
    nested.slots.main?.push({
      id: 'group',
      type: 'composite',
      tracks: '1fr',
      pos: { x: 137, y: 500, w: 400, h: 100 },
      cells: [
        {
          blocks: [
            { id: 'inner', type: 'paragraph', text: 'Inner.', pos: { x: 0, y: 0, w: 1, h: 1 } },
          ],
        },
      ],
    });
    expect(validateSlide(nested).issues.map((i) => i.pointer)).toContain(
      '/slots/main/6/cells/0/blocks/0/pos',
    );
  });
});

describe('snapping and guides', () => {
  it('snaps to a guide within 6 px and to the 8 px grid otherwise', () => {
    expect(snapCoordinate(140, GUIDES.x)).toEqual({ value: 137, guide: 'content left' });
    expect(snapCoordinate(661, GUIDES.x)).toEqual({ value: 659.5, guide: '5/7 left column edge' });
    expect(snapCoordinate(300, GUIDES.x)).toEqual({ value: 304 });
    expect(snapCoordinate(58, GUIDES.y)).toEqual({ value: 56, guide: 'top rule' });
    expect(GUIDES.x.map((g) => g.name)).toContain('mood plate edge');
  });

  it('snaps a box by its edges and keeps a grid step of size', () => {
    expect(snapPosition({ x: 139, y: 131, w: 300, h: 3 })).toEqual({
      x: 137,
      y: 129,
      w: 303,
      h: 8,
    });
    expect(insideContent({ x: 137, y: 129, w: 1326, h: 642 })).toBe(true);
    expect(insideContent({ x: 100, y: 129, w: 100, h: 100 })).toBe(false);
    expect(offSheet({ x: 1500, y: 800, w: 200, h: 8 })).toBe(true);
    expect(offSheet({ x: 0, y: 0, w: 1600, h: 900 })).toBe(false);
    expect(overlapArea({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(25);
    expect(overlapArea({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(0);
  });

  it('agrees with the renderer on the slot boxes', () => {
    expect(layoutSlotBoxes({ type: 'cols', ratio: '4/8' })).toEqual({
      left: [137, 129, 418, 642],
      right: [627, 129, 836, 642],
    });
    expect(layoutSlotBoxes({ type: 'freeform' })).toEqual({ main: [137, 129, 1326, 642] });
  });
});

describe('align, distribute and order', () => {
  const a = { x: 100, y: 100, w: 100, h: 50 };
  const b = { x: 300, y: 200, w: 50, h: 100 };
  const c = { x: 600, y: 400, w: 80, h: 20 };

  it('aligns to the selection bounds, the content box or the sheet', () => {
    expect(alignPositions([a, b], 'left').map((p) => p.x)).toEqual([100, 100]);
    expect(alignPositions([a, b], 'right').map((p) => p.x)).toEqual([250, 300]);
    expect(alignPositions([a, b], 'bottom').map((p) => p.y)).toEqual([250, 200]);
    expect(alignPositions([a], 'center').map((p) => p.x)).toEqual([137 + 663 - 50]);
    expect(alignPositions([a], 'middle', 'sheet').map((p) => p.y)).toEqual([425]);
    // with snap the shared edge snaps once: the selection's left at 100 goes to the grid at 104
    expect(alignPositions([a, b], 'left', 'selection', true).map((p) => p.x)).toEqual([104, 104]);
    // and a right edge within 6 px of a guide takes the guide: 1460 becomes the content right edge
    expect(
      alignPositions([{ x: 1300, y: 0, w: 160, h: 10 }], 'right', 'selection', true)[0]?.x,
    ).toBe(1463 - 160);
  });

  it('keeps the sheet and the content box exact under snap, and never snaps off the sheet', () => {
    // one block aligns to the sheet by default; the sheet's bottom is 900, not the grid's 904
    // (VERIFICATION-2 finding 7), and every other sheet edge and centre is exact as well
    const shape = { x: 1160, y: 620, w: 300, h: 120 };
    expect(alignPositions([shape], 'bottom', undefined, true)[0]?.y).toBe(900 - 120);
    expect(alignPositions([shape], 'right', undefined, true)[0]?.x).toBe(1600 - 300);
    expect(alignPositions([shape], 'middle', undefined, true)[0]?.y).toBe(450 - 60);
    expect(alignPositions([shape], 'center', undefined, true)[0]?.x).toBe(800 - 150);
    expect(alignPositions([shape], 'left', undefined, true)[0]?.x).toBe(0);
    expect(alignPositions([shape], 'top', undefined, true)[0]?.y).toBe(0);
    // the same with `to` set to the sheet for several blocks, and to the content box
    expect(alignPositions([a, b], 'bottom', 'sheet', true).map((p) => p.y)).toEqual([850, 800]);
    expect(alignPositions([shape], 'bottom', 'content', true)[0]?.y).toBe(771 - 120);
    // a selection whose shared edge would snap past the sheet keeps the exact edge: a block sitting
    // on the sheet's bottom puts the union's bottom at 900, which the grid would round to 904
    const tall = { x: 100, y: 100, w: 100, h: 800 };
    expect(alignPositions([tall, b], 'bottom', 'selection', true).map((p) => p.y)).toEqual([
      100, 800,
    ]);
    // while a selection's edge inside the sheet still snaps: the union's bottom at 300 rounds to 304
    expect(alignPositions([a, b], 'bottom', 'selection', true).map((p) => p.y)).toEqual([254, 204]);
  });

  it('distributes with equal gaps or a fixed gap and keeps the input order', () => {
    // the span is 100 to 680, the blocks take 230 of it, so the two gaps are 175 each
    const even = distributePositions([c, a, b], 'horizontal');
    expect(even.map((p) => p.x)).toEqual([600, 100, 375]);
    const fixed = distributePositions([a, b, c], 'vertical', 10);
    expect(fixed.map((p) => p.y)).toEqual([100, 160, 270]);
    expect(distributePositions([a], 'horizontal')).toEqual([a]);
  });

  it('reorders the stack densely', () => {
    const blocks = [
      { id: 'a', pos: { ...a, z: 0 } },
      { id: 'b', pos: { ...b, z: 1 } },
      { id: 'c', pos: { ...c, z: 2 } },
    ];
    expect(reorderZ(blocks, 'a', 'front')).toEqual({ b: 0, c: 1, a: 2 });
    expect(reorderZ(blocks, 'c', 'back')).toEqual({ c: 0, a: 1, b: 2 });
    expect(reorderZ(blocks, 'a', 'forward')).toEqual({ b: 0, a: 1, c: 2 });
    expect(reorderZ(blocks, 'a', 'backward')).toEqual({ a: 0, b: 1, c: 2 });
    expect(reorderZ(blocks, 'c', { z: 1 })).toEqual({ a: 0, c: 1, b: 2 });
    expect(() => reorderZ(blocks, 'x', 'front')).toThrow(RangeError);
    const stacked: { pos: Position }[] = [{ pos: { ...a, z: 3 } }, { pos: a }];
    expect(sortByZ(stacked).map((p) => p.pos.z)).toEqual([undefined, 3]);
  });
});

describe('layout conversion', () => {
  it('gives every block a box from its slot when a grammar slide goes freeform', () => {
    if (CONTENT_RULE.kind !== 'content') throw new Error('fixture');
    const free = convertLayout(CONTENT_RULE, { type: 'freeform' });
    expect(free.layout).toEqual({ type: 'freeform' });
    const main = free.slots.main ?? [];
    expect(main.map((b) => b.id)).toEqual(['h', 'p1', 'list']);
    // the left column splits in two; the seam at 450 is the content middle guide, so both rows
    // snap their shared edge to it and read 321 tall
    expect(main[0]?.pos).toEqual({ x: 137, y: 129, w: 627, h: 321, z: 0 });
    expect(main[1]?.pos).toEqual({ x: 137, y: 450, w: 627, h: 321, z: 1 });
    expect(main[2]?.pos).toEqual({ x: 836, y: 129, w: 627, h: 642, z: 2 });
    expect(validateSlide(free).ok).toBe(true);
  });

  it('drops the boxes and refiles by geometry when a freeform slide takes a grammar layout', () => {
    if (FREEFORM_SLIDE.kind !== 'content') throw new Error('fixture');
    const cols = convertLayout(FREEFORM_SLIDE, { type: 'cols', ratio: '1/1' });
    // the full-width rule is centered on the seam, so it falls right; the arrow's center is left
    expect(cols.slots.left?.map((b) => b.id)).toEqual(['h', 'p1', 'arrow', 'ic']);
    expect(cols.slots.right?.map((b) => b.id)).toEqual(['box', 'rule']);
    expect(cols.slots.left?.every((b) => b.pos === undefined)).toBe(true);
    const split = convertLayout(FREEFORM_SLIDE, { type: 'split' });
    expect(split.slots.head?.map((b) => b.id)).toEqual(['h']);
    expect(split.slots.body?.length).toBe(5);
    // rows within one grid step read left to right: the arrow at y 201 and the text at 209 tie
    expect(readingOrder(FREEFORM_SLIDE).map((r) => r.block.id)).toEqual([
      'h',
      'box',
      'p1',
      'arrow',
      'ic',
      'rule',
    ]);
  });

  it('maps slots by index between grammar layouts', () => {
    if (CONTENT_RULE.kind !== 'content') throw new Error('fixture');
    const split = convertLayout(CONTENT_RULE, { type: 'split', gap: 44 });
    expect(split.slots.head?.map((b) => b.id)).toEqual(['h', 'p1']);
    expect(split.slots.body?.map((b) => b.id)).toEqual(['list']);
    const center = convertLayout(CONTENT_RULE, { type: 'center' });
    expect(center.slots.main?.map((b) => b.id)).toEqual(['h', 'p1', 'list']);
    const back: ContentSlide = convertLayout(split, { type: 'cols', ratio: '5/7' });
    expect(back.slots.left?.map((b) => b.id)).toEqual(['h', 'p1']);
    expect(back.slots.right?.map((b) => b.id)).toEqual(['list']);
  });
});

describe('block.move with a z target', () => {
  it('sets z and its inverse restores the old value', () => {
    const before = base();
    const forward = applyWrite(
      before,
      write([{ op: 'block.move', slideId: 'free', blockId: 'h', slot: 'main', after: 'ic', z: 9 }]),
      { now: NOW },
    );
    if (!forward.ok) throw new Error(forward.message);
    const slide = forward.document.slides.free;
    if (slide?.kind !== 'content') throw new Error('result');
    expect(slide.slots.main?.map((b) => b.id)).toEqual(['p1', 'box', 'arrow', 'rule', 'ic', 'h']);
    expect(slide.slots.main?.[5]?.pos?.z).toBe(9);
    expect(forward.inverse).toEqual([
      { op: 'block.move', slideId: 'free', blockId: 'h', slot: 'main' },
      { op: 'block.set', slideId: 'free', blockId: 'h', path: '/pos/z', value: 0 },
    ]);
    const back = applyWrite(forward.document, write(forward.inverse, 413), { now: NOW });
    if (!back.ok) throw new Error(back.message);
    expect(back.document.slides.free).toEqual(before.slides.free);
  });

  it('refuses a z target on a block without a box', () => {
    const result = applyWrite(
      base(),
      write([{ op: 'block.move', slideId: 'content-rule', blockId: 'h', slot: 'left', z: 1 }]),
      { now: NOW },
    );
    expect(result.ok).toBe(false);
    if (result.ok || result.code !== 'invalid') throw new Error('expected invalid');
    expect(result.message).toMatch(/no position box/);
  });

  it('rejects a slide.set of the layout that leaves positioned blocks behind', () => {
    const result = applyWrite(
      base(),
      write([{ op: 'slide.set', slideId: 'free', path: '/layout', value: { type: 'center' } }]),
      { now: NOW },
    );
    expect(result.ok).toBe(false);
    if (result.ok || result.code !== 'invalid') throw new Error('expected invalid');
    expect(result.issues.some((issue) => issue.code === 'position')).toBe(true);
  });
});

describe('the freeform actions', () => {
  it('parse their examples and name a CLI command and an MCP tool', () => {
    for (const id of [
      'block.align',
      'block.distribute',
      'block.order',
      'slide.setLayout',
    ] as const) {
      const spec = ACTIONS[id];
      expect(spec.input.safeParse(spec.example).success, id).toBe(true);
      expect(spec.transports).toEqual(['cli', 'mcp', 'http', 'window']);
      expect(spec.mcp).toMatch(/^deck_/);
      expect(spec.cli?.usage.startsWith('turboslide ')).toBe(true);
    }
    expect(
      ACTIONS['block.order'].input.safeParse({
        slideId: 'free',
        blockId: 'h',
        move: 'front',
        z: 1,
        baseRevision: 1,
      }).success,
    ).toBe(false);
    expect(
      ACTIONS['slide.setLayout'].input.safeParse({
        slideId: 'free',
        layout: { type: 'cols', ratio: '4/8' },
        baseRevision: 1,
      }).success,
    ).toBe(true);
  });
});
