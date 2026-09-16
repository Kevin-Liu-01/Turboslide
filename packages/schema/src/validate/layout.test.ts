// The layout validator family (gslides-parity SPEC-5 1.2, 9.2; MILESTONES-5 B6 day 1).
import { describe, expect, it } from 'vitest';
import type { Block } from '../blocks.ts';
import type { CustomLayout } from '../deck.ts';
import { workedDocument } from '../fixtures.ts';
import { validateDeck } from '../validate.ts';
import { validateLayouts } from './layout.ts';

const title: Block = {
  id: 'title',
  type: 'heading',
  level: 'h1',
  text: 'Title',
  pos: { x: 137, y: 129, w: 1326, h: 120 },
  placeholder: 'title',
};

function withLayouts(layouts: Record<string, CustomLayout>) {
  const document = workedDocument();
  document.deck.customLayouts = layouts;
  return document;
}

describe('validateLayouts', () => {
  it('answers nothing for a deck without custom layouts and for a well formed one', () => {
    expect(validateLayouts(workedDocument())).toEqual([]);
    const document = withLayouts({
      'custom-quote': {
        name: 'Quote',
        from: 'title',
        blocks: [title, { ...title, id: 'body', placeholder: 'body', level: 'h2' }],
      },
      'custom-hidden-section': { from: 'section-description', hidden: true },
    });
    const thesis = document.slides.thesis;
    if (thesis !== undefined) thesis.template = 'custom-quote';
    expect(validateLayouts(document)).toEqual([]);
    const result = validateDeck({ deck: document.deck, slides: Object.values(document.slides) });
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('wants a hidden entry to name the built in layout it hides and to carry no blocks', () => {
    const issues = validateLayouts(
      withLayouts({ 'custom-gone': { hidden: true, blocks: [title] } }),
    );
    expect(issues.map((row) => [row.code, row.severity, row.pointer])).toEqual([
      ['layout', 3, '/customLayouts/custom-gone/hidden'],
      ['layout', 2, '/customLayouts/custom-gone/blocks'],
    ]);
  });

  it('warns about a block without pos and a second placeholder of one kind', () => {
    const { pos: _pos, ...unplaced } = title;
    const issues = validateLayouts(
      withLayouts({
        'custom-two': { blocks: [title, { ...unplaced, id: 'second' }] },
      }),
    );
    expect(issues.map((row) => [row.code, row.severity, row.pointer])).toEqual([
      ['layout', 2, '/customLayouts/custom-two/blocks/1/pos'],
      ['layout', 2, '/customLayouts/custom-two/blocks/1/placeholder'],
    ]);
    expect(issues[1]?.message).toContain('block 0');
  });

  it('reports a slide whose template names no custom layout, or a hidden one', () => {
    const document = withLayouts({ 'custom-hidden': { from: 'title', hidden: true } });
    const thesis = document.slides.thesis;
    const titleSlide = document.slides.title;
    if (thesis !== undefined) thesis.template = 'custom-missing';
    if (titleSlide !== undefined) titleSlide.template = 'custom-hidden';
    const issues = validateLayouts(document);
    // the slides walk in document order: title before thesis
    expect(issues).toEqual([
      expect.objectContaining({
        code: 'layout',
        severity: 2,
        file: 'slides/title.json',
        pointer: '/template',
      }),
      expect.objectContaining({
        code: 'reference',
        severity: 3,
        file: 'slides/thesis.json',
        pointer: '/template',
      }),
    ]);
    const result = validateDeck({ deck: document.deck, slides: Object.values(document.slides) });
    expect(result.ok).toBe(false);
    expect(result.issues.some((row) => row.code === 'reference')).toBe(true);
  });
});
