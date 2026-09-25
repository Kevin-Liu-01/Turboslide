// The diagram templates (gslides-parity SPEC-2 2.8.3, 11.5 diagrams.test.ts): every template at
// every count and style validates on a blank deck as a canvas slide, sits inside its box, shares
// one group tag, and has as many text blocks as labelled nodes; a count outside the range clamps;
// the connectors name shapes of the same diagram with sites in range; the default box is Insert >
// Chart's; an unknown type or style is refused with a sentence; the fixture deck's hand written
// process slide matches what the template makes.
import { describe, expect, it } from 'vitest';

import type { Block, ShapeBlock, TextBlock } from './blocks.ts';
import type { ContentSlide, DeckDocument } from './deck.ts';
import { isCanvasSlide } from './deck.ts';
import {
  DIAGRAM_DEFAULT_BOX,
  DIAGRAM_KINDS,
  DIAGRAM_KIND_LABELS,
  DIAGRAM_STYLES,
  DIAGRAM_TEMPLATES,
  clampDiagramCount,
  makeDiagram,
} from './diagrams.ts';
import type { DiagramKind, DiagramStyle } from './diagrams.ts';
import { workedDocument } from './fixtures.ts';
import type { Position } from './position.ts';
import { siteCount } from './connect.ts';
import { validateDocument } from './validate.ts';

const BOX: Position = { x: 200, y: 150, w: 1200, h: 600 };

function counts(kind: DiagramKind): number[] {
  const { min, max } = DIAGRAM_TEMPLATES[kind].counts;
  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}

function withDiagram(blocks: Block[]): DeckDocument {
  const document = workedDocument();
  const slide: ContentSlide = {
    schemaVersion: 1,
    id: 'diagram',
    kind: 'content',
    layout: { type: 'freeform' },
    slots: { main: blocks },
    template: 'blank',
  };
  document.slides[slide.id] = slide;
  document.deck.sections[0]?.slideIds.push(slide.id);
  return document;
}

function inside(pos: Position, box: Position): boolean {
  const slack = 0.5;
  return (
    pos.x >= box.x - slack &&
    pos.y >= box.y - slack &&
    pos.x + pos.w <= box.x + box.w + slack &&
    pos.y + pos.h <= box.y + box.h + slack
  );
}

describe('DIAGRAM_TEMPLATES', () => {
  it('names the six types with Google labels, three styles and the count ranges of SPEC-2 2.8.3', () => {
    expect(DIAGRAM_KINDS).toEqual([
      'grid',
      'hierarchy',
      'timeline',
      'process',
      'relationship',
      'cycle',
    ]);
    expect(DIAGRAM_STYLES).toEqual(['outline', 'plate', 'ink']);
    expect(Object.keys(DIAGRAM_TEMPLATES)).toEqual([...DIAGRAM_KINDS]);
    for (const kind of DIAGRAM_KINDS) {
      expect(DIAGRAM_TEMPLATES[kind].label).toBe(DIAGRAM_KIND_LABELS[kind]);
      expect(DIAGRAM_TEMPLATES[kind].styles).toEqual(DIAGRAM_STYLES);
    }
    const ranges = Object.fromEntries(
      DIAGRAM_KINDS.map((kind) => {
        const { min, max, noun } = DIAGRAM_TEMPLATES[kind].counts;
        return [kind, `${noun} ${min} to ${max}`];
      }),
    );
    expect(ranges).toEqual({
      grid: 'Items 2 to 6',
      hierarchy: 'Levels 2 to 5',
      timeline: 'Dates 3 to 6',
      process: 'Steps 3 to 6',
      relationship: 'Items 2 to 5',
      cycle: 'Steps 3 to 6',
    });
    expect(DIAGRAM_DEFAULT_BOX).toEqual({ x: 320, y: 180, w: 960, h: 540 });
  });

  for (const kind of DIAGRAM_KINDS) {
    for (const count of counts(kind)) {
      for (const style of DIAGRAM_STYLES) {
        it(`${kind} with ${count} at ${style}: validates, sits inside its box, shares one group, one text per node`, () => {
          const template = DIAGRAM_TEMPLATES[kind];
          const blocks = template.make(count, style, BOX, 'dia');
          expect(blocks.length).toBeGreaterThan(0);
          /* every block positioned inside the box with the one tag */
          for (const block of blocks) {
            expect(block.pos).toBeDefined();
            expect(block.pos?.group).toBe('dia');
            expect(typeof block.pos?.z).toBe('number');
            expect(inside(block.pos as Position, BOX)).toBe(true);
          }
          /* ids are unique so diagram.insert frees them one by one */
          expect(new Set(blocks.map((block) => block.id)).size).toBe(blocks.length);
          /* the labelled nodes: one label per node, centred, middle aligned; a step's label is
             the shape's own text (docs/FEATURES.md 2.2 rank 9), a timeline's a text block under
             its dot; no node is a shape and a text block over the same box */
          const texts = blocks.filter(
            (block): block is TextBlock | ShapeBlock =>
              block.type === 'text' ||
              (block.type === 'shape' && block.shape !== 'line' && block.text !== undefined),
          );
          expect(texts).toHaveLength(template.nodes(count));
          if (kind !== 'timeline')
            expect(blocks.some((block) => block.type === 'text')).toBe(false);
          for (const text of texts) {
            expect(text.typography).toEqual({ align: 'center', weight: 500 });
            expect(text.valign).toBe('middle');
            /* ink text on an ink fill reads as paper; a timeline's labels sit on the paper under the rule */
            if (style === 'ink' && kind !== 'timeline') expect(text.color).toBe('paper');
            else expect(text.color).toBeUndefined();
          }
          /* the shapes carry the style's look */
          const shapes = blocks.filter((block): block is ShapeBlock => block.type === 'shape');
          const closed = shapes.filter((shape) => shape.shape !== 'line');
          expect(closed.length).toBeGreaterThanOrEqual(1);
          for (const shape of closed) {
            expect(shape.width).toBe(1.5);
            if (style === 'plate') expect(shape.fill).toBe('plate');
            if (style === 'ink') expect(shape.fill).toBe('ink');
          }
          /* every connector names two shapes of the diagram with sites in the rectangle's eight */
          const ids = new Map(blocks.map((block) => [block.id, block]));
          for (const line of shapes.filter((shape) => shape.shape === 'line' && shape.connect)) {
            for (const end of [line.connect?.start, line.connect?.end]) {
              expect(end).toBeDefined();
              const target = ids.get(end?.block ?? '');
              expect(target?.type).toBe('shape');
              expect(end?.site).toBeGreaterThanOrEqual(0);
              /* the vector round (docs/VECTOR.md 2.2): the preset's own sites, a rounded
                 rectangle's ECMA four, so the count is the target's */
              expect(end?.site).toBeLessThan(target === undefined ? 0 : siteCount(target));
            }
          }
          /* the whole thing validates as a canvas slide of a deck */
          const document = withDiagram(blocks);
          const result = validateDocument(document);
          expect(result.issues.filter((issue) => issue.severity === 3)).toEqual([]);
          expect(isCanvasSlide(document.slides['diagram'] as ContentSlide)).toBe(true);
        });
      }
    }
  }

  it('clamps a count outside the range and makes the clamped diagram', () => {
    expect(clampDiagramCount('process', 1)).toBe(3);
    expect(clampDiagramCount('process', 40)).toBe(6);
    expect(clampDiagramCount('grid', 4.4)).toBe(4);
    const few = DIAGRAM_TEMPLATES.process.make(1, 'outline', BOX, 'g');
    const min = DIAGRAM_TEMPLATES.process.make(3, 'outline', BOX, 'g');
    expect(few).toEqual(min);
  });

  it('a hierarchy of n levels has one node on top and two on every level below', () => {
    expect(DIAGRAM_TEMPLATES.hierarchy.nodes(2)).toBe(3);
    expect(DIAGRAM_TEMPLATES.hierarchy.nodes(5)).toBe(9);
    const blocks = DIAGRAM_TEMPLATES.hierarchy.make(3, 'outline', BOX, 'h');
    const lines = blocks.filter(
      (block): block is ShapeBlock => block.type === 'shape' && block.shape === 'line',
    );
    /* one line per node below the top */
    expect(lines).toHaveLength(4);
    const top = blocks.find((block) => block.id === 'level-1') as ShapeBlock;
    const second = blocks.filter((block) => /^level-[23]$/.test(block.id)) as ShapeBlock[];
    for (const child of second) expect((child.pos?.y ?? 0) > (top.pos?.y ?? 0)).toBe(true);
  });

  it('a process joins its steps with filled arrows attached to the facing sites, as the fixture slide does', () => {
    const blocks = DIAGRAM_TEMPLATES.process.make(
      4,
      'plate',
      { x: 137, y: 350, w: 1326, h: 160 },
      'process-1',
    );
    const links = blocks.filter(
      (block): block is ShapeBlock => block.type === 'shape' && block.shape === 'line',
    );
    expect(links).toHaveLength(3);
    for (const [index, line] of links.entries()) {
      expect(line.lineEnd).toBe('fillArrow');
      expect(line.orientation).toBe('horizontal');
      expect(line.connect).toEqual({
        start: { block: `step-${index + 1}`, site: 3 },
        end: { block: `step-${index + 2}`, site: 1 },
      });
      expect(line.pos?.h).toBe(8);
    }
    const steps = blocks.filter(
      (block): block is ShapeBlock => block.type === 'shape' && block.shape === 'roundRect',
    );
    expect(steps).toHaveLength(4);
    expect(steps.map((step) => step.fill)).toEqual(['plate', 'plate', 'plate', 'plate']);
    /* the step is one object: its label is the shape's own text (docs/FEATURES.md 2.2 rank 9) */
    expect(steps.map((step) => step.text)).toEqual(['Step 1', 'Step 2', 'Step 3', 'Step 4']);
    expect(blocks.filter((block) => block.type === 'text')).toHaveLength(0);
  });

  it('a cycle closes: the last step points back at the first', () => {
    const blocks = DIAGRAM_TEMPLATES.cycle.make(3, 'outline', BOX, 'c');
    const links = blocks.filter(
      (block): block is ShapeBlock => block.type === 'shape' && block.shape === 'line',
    );
    expect(links).toHaveLength(3);
    const pairs = links.map((line) => {
      const head = line.lineEnd === 'fillArrow' ? line.connect?.end : line.connect?.start;
      const tail = line.lineEnd === 'fillArrow' ? line.connect?.start : line.connect?.end;
      return `${tail?.block}>${head?.block}`;
    });
    expect(pairs.sort()).toEqual(['step-1>step-2', 'step-2>step-3', 'step-3>step-1']);
  });

  it('a timeline draws one rule, a dot per date and a label under each', () => {
    const blocks = DIAGRAM_TEMPLATES.timeline.make(4, 'outline', BOX, 't');
    expect(blocks.filter((block) => block.id === 'rule')).toHaveLength(1);
    const dots = blocks.filter(
      (block): block is ShapeBlock => block.type === 'shape' && block.shape === 'ellipse',
    );
    expect(dots).toHaveLength(4);
    /* the outline style paints the dots on paper so the rule does not show through */
    expect(dots[0]?.fill).toBe('paper');
    const labels = blocks.filter((block): block is TextBlock => block.type === 'text');
    expect(labels.map((text) => text.text)).toEqual(['Date 1', 'Date 2', 'Date 3', 'Date 4']);
    for (const [index, label] of labels.entries())
      expect((label.pos?.y ?? 0) > (dots[index]?.pos?.y ?? 0)).toBe(true);
  });

  it('makeDiagram binds as the store action’s maker and refuses an unknown type or style with a sentence', () => {
    const made = makeDiagram('grid', 4, 'outline', BOX, 'g');
    expect(made).toEqual(DIAGRAM_TEMPLATES.grid.make(4, 'outline', BOX, 'g'));
    expect(() => makeDiagram('venn', 3, 'outline', BOX, 'g')).toThrow(
      /Unknown diagram type "venn"/,
    );
    expect(() => makeDiagram('grid', 3, 'neon', BOX, 'g')).toThrow(/Unknown diagram style "neon"/);
  });

  it('every style is one of the three and reads as a word a sales user knows', () => {
    const styles: DiagramStyle[] = [...DIAGRAM_STYLES];
    expect(styles).toEqual(['outline', 'plate', 'ink']);
  });
});
