// A fixed kind's field takes a typography of its own (the field fonts hotfix,
// docs/gslides-parity/features/build/field-fonts.md 2): the slide shape validates and round
// trips the map, `fieldTypographyMutation` writes at the shallowest missing ancestor and removes
// the field or the map, the reducer's inverse takes the write back byte for byte, the diff emits
// one `slide.set /typography`, the transform returns no text op for a face write, the comment
// anchors stay, and the canvas conversion carries the record onto the block and back.
import { describe, expect, it } from 'vitest';

import { fromCanvas, toCanvas } from './canvas.ts';
import type { CanvasBoxes } from './canvas.ts';
import { shiftAnchors } from './comments.ts';
import type { Thread } from './comments.ts';
import type { DeckDocument, Slide, StatementSlide, TitleSlide } from './deck.ts';
import { slideSchema, statementSlideSchema, titleSlideSchema } from './deck.ts';
import { diffDecks } from './diff.ts';
import {
  fieldTypographyMutation,
  slideFieldFamily,
  slideFieldTypographies,
  slideFieldTypography,
} from './field-typography.ts';
import { THESIS, TITLE, workedDocument } from './fixtures.ts';
import type { Mutation, SpliceMutation } from './mutations.ts';
import { isFieldTypographyPath } from './mutations.ts';
import { applyMutation, applyMutations } from './reduce.ts';
import { rewritesText, transformMutation } from './transform.ts';
import { validateDocument } from './validate.ts';

/** The worked deck in its normalized form. */
function base(): DeckDocument {
  const result = validateDocument(workedDocument());
  if (!result.ok || result.deck === null) throw new Error('fixture');
  return { deck: result.deck, slides: result.slides };
}

function titleWith(typography: TitleSlide['typography']): TitleSlide {
  const slide = JSON.parse(JSON.stringify(TITLE)) as TitleSlide;
  return typography === undefined ? slide : { ...slide, typography };
}

const FRAUNCES = { family: 'fraunces' } as const;
const MANROPE = { family: 'manrope' } as const;
const STATEMENT = THESIS as StatementSlide;

describe('the slide shape', () => {
  it('validates a title slide with a record per field and a statement with its big line, and refuses a field the kind lacks', () => {
    const title = titleSlideSchema.safeParse(titleWith({ heading: FRAUNCES, lead: MANROPE }));
    expect(title.success).toBe(true);
    expect(title.data?.typography).toEqual({ heading: FRAUNCES, lead: MANROPE });
    const statement = statementSlideSchema.safeParse({ ...THESIS, typography: { big: FRAUNCES } });
    expect(statement.success).toBe(true);
    expect(slideSchema.safeParse({ ...TITLE, typography: { big: FRAUNCES } }).success).toBe(false);
    expect(slideSchema.safeParse({ ...THESIS, typography: { heading: FRAUNCES } }).success).toBe(
      false,
    );
    expect(
      slideSchema.safeParse({ ...TITLE, typography: { heading: { family: 'nope' } } }).success,
    ).toBe(false);
  });

  it('round trips through the validator, an absent map meaning the kit face as before', () => {
    const document = workedDocument();
    (document.slides['title'] as TitleSlide).typography = { heading: FRAUNCES };
    const result = validateDocument(document);
    expect(result.ok).toBe(true);
    expect((result.slides['title'] as TitleSlide).typography).toEqual({ heading: FRAUNCES });
    const plain = validateDocument(workedDocument());
    expect('typography' in (plain.slides['title'] as TitleSlide)).toBe(false);
  });

  it('reads a field record, its family and every record of a slide', () => {
    const slide = titleWith({ heading: FRAUNCES, lead: { size: 26 } });
    expect(slideFieldTypography(slide, 'heading')).toEqual(FRAUNCES);
    expect(slideFieldTypography(slide, 'lead')).toEqual({ size: 26 });
    expect(slideFieldTypography(slide, 'big')).toBeUndefined();
    expect(slideFieldFamily(slide, 'heading')).toBe('fraunces');
    expect(slideFieldFamily(slide, 'lead')).toBeNull();
    expect(slideFieldFamily(titleWith({ heading: { family: 'inter' } }), 'heading')).toBeNull();
    expect(slideFieldTypographies(slide)).toEqual([FRAUNCES, { size: 26 }]);
    expect(slideFieldTypographies(TITLE)).toEqual([]);
    expect(slideFieldTypographies({ ...STATEMENT, typography: { big: MANROPE } })).toEqual([
      MANROPE,
    ]);
  });

  it('names the typography pointers', () => {
    expect(isFieldTypographyPath('/typography')).toBe(true);
    expect(isFieldTypographyPath('/typography/heading')).toBe(true);
    expect(isFieldTypographyPath('/typography/heading/family')).toBe(true);
    expect(isFieldTypographyPath('/heading')).toBe(false);
    expect(isFieldTypographyPath('/typographyx')).toBe(false);
  });
});

describe('fieldTypographyMutation', () => {
  it('writes the map whole on a slide without one and the field alone on a slide with one', () => {
    expect(fieldTypographyMutation(TITLE, 'heading', FRAUNCES)).toEqual({
      op: 'slide.set',
      slideId: 'title',
      path: '/typography',
      value: { heading: FRAUNCES },
    });
    expect(fieldTypographyMutation(titleWith({ heading: FRAUNCES }), 'lead', MANROPE)).toEqual({
      op: 'slide.set',
      slideId: 'title',
      path: '/typography/lead',
      value: MANROPE,
    });
    expect(fieldTypographyMutation(THESIS, 'big', FRAUNCES)).toEqual({
      op: 'slide.set',
      slideId: 'thesis',
      path: '/typography',
      value: { big: FRAUNCES },
    });
  });

  it('removes the field for an empty record, the map when the field was its last key, and nothing when it is absent', () => {
    expect(
      fieldTypographyMutation(titleWith({ heading: FRAUNCES, lead: MANROPE }), 'heading', {}),
    ).toEqual({ op: 'slide.set', slideId: 'title', path: '/typography/heading' });
    expect(fieldTypographyMutation(titleWith({ heading: FRAUNCES }), 'heading', {})).toEqual({
      op: 'slide.set',
      slideId: 'title',
      path: '/typography',
    });
    expect(fieldTypographyMutation(titleWith({ lead: MANROPE }), 'heading', {})).toBeNull();
    expect(fieldTypographyMutation(TITLE, 'heading', {})).toBeNull();
  });

  it('refuses a field the kind does not carry', () => {
    expect(() => fieldTypographyMutation(TITLE, 'big', FRAUNCES)).toThrow(TypeError);
    const content = workedDocument().slides['content-rule'] as Slide;
    expect(() => fieldTypographyMutation(content, 'heading', FRAUNCES)).toThrow(TypeError);
  });
});

describe('the reducer', () => {
  it('applies the write and its inverse takes the map back byte for byte, one field at a time', () => {
    const document = base();
    const first = fieldTypographyMutation(document.slides['title'] as Slide, 'heading', FRAUNCES);
    if (first === null) throw new Error('fixture');
    const undoFirst = applyMutation(document, first);
    expect((document.slides['title'] as TitleSlide).typography).toEqual({ heading: FRAUNCES });
    expect(undoFirst).toEqual([{ op: 'slide.set', slideId: 'title', path: '/typography' }]);
    const second = fieldTypographyMutation(document.slides['title'] as Slide, 'lead', MANROPE);
    if (second === null) throw new Error('fixture');
    const undoSecond = applyMutation(document, second);
    expect((document.slides['title'] as TitleSlide).typography).toEqual({
      heading: FRAUNCES,
      lead: MANROPE,
    });
    expect(undoSecond).toEqual([{ op: 'slide.set', slideId: 'title', path: '/typography/lead' }]);
    for (const step of undoSecond) applyMutation(document, step);
    expect((document.slides['title'] as TitleSlide).typography).toEqual({ heading: FRAUNCES });
    for (const step of undoFirst) applyMutation(document, step);
    expect(document).toEqual(base());
  });

  it('validates after the write, so the stored deck keeps the face', () => {
    const document = base();
    const mutation = fieldTypographyMutation(
      document.slides['title'] as Slide,
      'heading',
      FRAUNCES,
    );
    if (mutation === null) throw new Error('fixture');
    const { document: after } = applyMutations(document, [mutation]);
    const result = validateDocument(after);
    expect(result.ok).toBe(true);
    expect((result.slides['title'] as TitleSlide).typography).toEqual({ heading: FRAUNCES });
  });
});

describe('the diff and the transform', () => {
  it('diffs the map as one slide.set of the key, each way', () => {
    const a = base();
    const b = base();
    (b.slides['title'] as TitleSlide).typography = { heading: FRAUNCES };
    expect(diffDecks(a, b)).toEqual([
      { op: 'slide.set', slideId: 'title', path: '/typography', value: { heading: FRAUNCES } },
    ]);
    expect(diffDecks(b, a)).toEqual([{ op: 'slide.set', slideId: 'title', path: '/typography' }]);
    expect(applyMutations(a, diffDecks(a, b)).document).toEqual(b);
  });

  it('returns no text op to its author for a face write, unlike a whole field rewrite', () => {
    const onLead: SpliceMutation = {
      op: 'text.splice',
      slideId: 'title',
      blockId: 'lead',
      path: '/lead',
      at: 0,
      remove: 0,
      insert: 'A',
    };
    const onHeading: SpliceMutation = { ...onLead, blockId: 'heading', path: '/heading' };
    const face: Mutation = {
      op: 'slide.set',
      slideId: 'title',
      path: '/typography/heading',
      value: FRAUNCES,
    };
    const map: Mutation = { op: 'slide.set', slideId: 'title', path: '/typography' };
    expect(rewritesText(face, onLead)).toBe(false);
    expect(rewritesText(face, onHeading)).toBe(false);
    expect(rewritesText(map, onHeading)).toBe(false);
    expect(transformMutation(onLead, face, 'right')).toEqual([onLead]);
    expect(transformMutation(onHeading, map, 'left')).toEqual([onHeading]);
    const rewrite: Mutation = { op: 'slide.set', slideId: 'title', path: '/heading', value: 'N' };
    expect(transformMutation(onHeading, rewrite, 'right')).toEqual([]);
  });

  it('leaves a comment anchor on the slide where it is', () => {
    const before = base();
    const face: Mutation = {
      op: 'slide.set',
      slideId: 'content-rule',
      path: '/typography/heading',
      value: FRAUNCES,
    };
    const thread: Thread = {
      id: '01J8Z2K0000000000000000000',
      deckId: before.deck.id,
      anchor: {
        kind: 'text',
        slideId: 'content-rule',
        blockId: 'p1',
        path: '/text',
        range: [0, 1],
        quoted: '',
      },
      comment: {
        id: 'c1',
        author: { kind: 'account', principalId: 'acct_1', name: 'Maya' },
        body: 'x',
        createdAt: '2026-09-28T00:00:00.000Z',
      } as unknown as Thread['comment'],
      replies: [],
      createdAt: '2026-09-28T00:00:00.000Z',
      updatedAt: '2026-09-28T00:00:00.000Z',
      revision: 1,
    };
    const { threads, shifts } = shiftAnchors([thread], [face], { before, after: before });
    expect(threads).toEqual([thread]);
    expect(shifts).toEqual([]);
  });
});

describe('the canvas conversion', () => {
  const boxes: CanvasBoxes = {
    blocks: {
      heading: [137, 257, 1000, 90],
      lead: [137, 373, 1000, 76],
      big: [300, 350, 1000, 200],
    },
    mark: [137, 129, 132, 84],
    prompted: [],
  };

  it('carries a title field record onto its block and back, and a bare title round trips with no map', () => {
    const converted = toCanvas(titleWith({ heading: FRAUNCES, lead: { size: 26 } }), boxes);
    if (converted === null) throw new Error('conversion');
    const blocks = converted.slide.slots.main ?? [];
    const heading = blocks.find((block) => block.id === 'heading');
    const lead = blocks.find((block) => block.id === 'lead');
    expect(heading !== undefined && 'typography' in heading && heading.typography).toEqual(
      FRAUNCES,
    );
    expect(lead !== undefined && 'typography' in lead && lead.typography).toEqual({ size: 26 });
    expect('typography' in converted.slide).toBe(false);
    const restored = fromCanvas(converted.slide);
    expect(restored?.lossless).toBe(true);
    expect((restored?.slide as TitleSlide).typography).toEqual({
      heading: FRAUNCES,
      lead: { size: 26 },
    });
    const bare = toCanvas(TITLE, boxes);
    if (bare === null) throw new Error('conversion');
    const back = fromCanvas(bare.slide);
    expect(back?.lossless).toBe(true);
    expect(back?.slide).toEqual(TITLE);
  });

  it('merges a statement record over the conversion’s centre and subtracts it on the way back', () => {
    const converted = toCanvas({ ...STATEMENT, typography: { big: FRAUNCES } }, boxes);
    if (converted === null) throw new Error('conversion');
    const big = converted.slide.slots.main?.find((block) => block.id === 'big');
    expect(big !== undefined && 'typography' in big && big.typography).toEqual({
      align: 'center',
      family: 'fraunces',
    });
    const restored = fromCanvas(converted.slide);
    expect(restored?.lossless).toBe(true);
    expect(restored?.slide).toEqual({ ...STATEMENT, typography: { big: FRAUNCES } });
    const bare = toCanvas(THESIS, boxes);
    if (bare === null) throw new Error('conversion');
    expect(fromCanvas(bare.slide)?.slide).toEqual(THESIS);
  });
});
