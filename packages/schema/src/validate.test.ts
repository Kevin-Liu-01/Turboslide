import { describe, expect, it } from 'vitest';
import { CONTENT_RULE, WORKED_DECK, WORKED_SLIDES, workedDocument } from './fixtures.ts';
import { validateDeck, validateSlide, validateManifest } from './validate.ts';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('validateDeck on the worked deck', () => {
  it('accepts the three worked slides and their companions with no issues', () => {
    const result = validateDeck({ deck: WORKED_DECK, slides: WORKED_SLIDES });
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.deck?.revision).toBe(412);
    expect(Object.keys(result.slides)).toHaveLength(WORKED_SLIDES.length);
  });

  it('fills layout defaults and keeps the document otherwise byte-identical', () => {
    const result = validateDeck({ deck: WORKED_DECK, slides: WORKED_SLIDES });
    const slide = result.slides['content-rule'];
    expect(slide?.kind === 'content' && slide.layout).toEqual({
      type: 'cols',
      ratio: '1/1',
      gap: 72,
      align: 'center',
    });
    expect(result.deck).toEqual(WORKED_DECK);
  });

  it('accepts slides keyed by id and rejects a key that does not match the id', () => {
    const keyed = Object.fromEntries(WORKED_SLIDES.map((slide) => [slide.id, slide]));
    expect(validateDeck({ deck: WORKED_DECK, slides: keyed }).ok).toBe(true);
    const wrong: Record<string, unknown> = { ...keyed, other: keyed.thesis };
    delete wrong.thesis;
    const result = validateDeck({ deck: WORKED_DECK, slides: wrong });
    expect(
      result.issues.some((row) => row.file === 'slides/other.json' && row.pointer === '/id'),
    ).toBe(true);
  });
});

describe('unknown fields and ext', () => {
  it('rejects an unknown field with a pointer', () => {
    const slide = clone(CONTENT_RULE);
    (slide as Record<string, unknown>).color = 'red';
    const result = validateSlide(slide);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'unknown_field',
        pointer: '/color',
        file: 'slides/content-rule.json',
        severity: 3,
      }),
    );
  });

  it('rejects an unknown field inside a block with the full pointer', () => {
    const slide = clone(CONTENT_RULE);
    if (slide.kind !== 'content') throw new Error('fixture');
    const block = slide.slots.left?.[0] as Record<string, unknown>;
    block.x = 10;
    const result = validateSlide(slide);
    expect(result.issues.map((row) => row.pointer)).toContain('/slots/left/0/x');
  });

  it('keeps ext on the slide, the block and the asset and reports it once at severity 1', () => {
    const slide = clone(CONTENT_RULE);
    if (slide.kind !== 'content') throw new Error('fixture');
    slide.ext = { studio: { collapsed: true } };
    const block = slide.slots.left?.[0];
    if (block === undefined) throw new Error('fixture');
    block.ext = { note: 'kept' };
    const deck = clone(WORKED_DECK);
    const asset = deck.assets['site-home'];
    if (asset === undefined) throw new Error('fixture');
    asset.ext = { source: 'kept' };
    const slides = WORKED_SLIDES.map((row) => (row.id === slide.id ? slide : row));
    const result = validateDeck({ deck, slides });
    expect(result.ok).toBe(true);
    const ext = result.issues.filter((row) => row.code === 'ext');
    expect(ext).toHaveLength(2);
    expect(ext.every((row) => row.severity === 1)).toBe(true);
    expect(result.slides['content-rule']?.ext).toEqual({ studio: { collapsed: true } });
    expect(result.deck?.assets['site-home']?.ext).toEqual({ source: 'kept' });
  });
});

describe('normalization', () => {
  it('canonicalizes text so escapes are stable', () => {
    const slide = clone(CONTENT_RULE);
    if (slide.kind !== 'content') throw new Error('fixture');
    const heading = slide.slots.left?.[0];
    if (heading?.type !== 'heading') throw new Error('fixture');
    heading.text = 'A * in the heading';
    const result = validateSlide(slide);
    const out = result.slide;
    if (out?.kind !== 'content') throw new Error('result');
    const outHeading = out.slots.left?.[0];
    expect(outHeading?.type === 'heading' && outHeading.text).toBe('A \\* in the heading');
  });

  it('rejects a line break inside a Text', () => {
    const slide = clone(CONTENT_RULE);
    if (slide.kind !== 'content') throw new Error('fixture');
    const heading = slide.slots.left?.[0];
    if (heading?.type !== 'heading') throw new Error('fixture');
    heading.text = 'two\nlines';
    expect(validateSlide(slide).issues.map((row) => row.pointer)).toContain('/slots/left/0/text');
  });

  it('flags a slot the layout does not have', () => {
    const slide = clone(CONTENT_RULE);
    if (slide.kind !== 'content') throw new Error('fixture');
    slide.slots.main = [{ id: 'x', type: 'heading', level: 'h2', text: 'Stray' }];
    const result = validateSlide(slide);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'slot', pointer: '/slots/main', severity: 3 }),
    );
  });

  it('flags a duplicate block id', () => {
    const slide = clone(CONTENT_RULE);
    if (slide.kind !== 'content') throw new Error('fixture');
    slide.slots.right?.push({ id: 'h', type: 'paragraph', text: 'Again.' });
    const result = validateSlide(slide);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'duplicate_id', pointer: '/slots/right/1/id' }),
    );
  });

  it('migrates a file without schemaVersion and says so at severity 1', () => {
    const slide = clone(CONTENT_RULE) as Record<string, unknown>;
    delete slide.schemaVersion;
    const result = validateSlide(slide);
    expect(result.ok).toBe(true);
    expect(result.slide?.schemaVersion).toBe(1);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'migrated', severity: 1 }),
    );
  });

  it('rejects a schemaVersion from the future', () => {
    const slide = { ...clone(CONTENT_RULE), schemaVersion: 9 };
    const result = validateSlide(slide);
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.code).toBe('ahead');
  });
});

describe('cross references', () => {
  it('flags a missing asset, a missing slide file, an unlisted slide and a misplaced opener', () => {
    const document = workedDocument();
    const site = document.slides['the-production-site'];
    if (site?.kind !== 'content') throw new Error('fixture');
    const shot = site.slots.right?.[0];
    if (shot?.type !== 'shot') throw new Error('fixture');
    shot.asset = 'nowhere';
    const brand = document.deck.sections[0];
    if (brand === undefined) throw new Error('fixture');
    brand.slideIds = ['title', 'opener-brand', 'thesis', 'ghost', 'content-rule'];
    const result = validateDeck({ deck: document.deck, slides: Object.values(document.slides) });
    const codes = result.issues.map((row) => `${row.code} ${row.file}${row.pointer}`);
    expect(codes).toContain('reference slides/the-production-site.json/slots/right/0/asset');
    expect(codes).toContain('reference deck.json/sections/0/slideIds/3');
    expect(codes).toContain('unlisted slides/mood-earth.json');
    expect(codes).toContain('opener deck.json/sections/0/slideIds/1');
    expect(result.ok).toBe(false);
  });

  it('flags an opener whose sectionId names another section', () => {
    const document = workedDocument();
    const opener = document.slides['opener-brand'];
    if (opener?.kind !== 'opener') throw new Error('fixture');
    opener.sectionId = 'website';
    const result = validateDeck({ deck: document.deck, slides: Object.values(document.slides) });
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'opener',
        file: 'slides/opener-brand.json',
        pointer: '/sectionId',
      }),
    );
  });

  it('flags a slide id listed twice in the manifest', () => {
    const deck = clone(WORKED_DECK);
    deck.sections[1]?.slideIds.push('thesis');
    const result = validateManifest(deck);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'duplicate_id', pointer: '/sections/1/slideIds/1' }),
    );
  });

  it('rejects an input that is not { deck, slides }', () => {
    expect(validateDeck(null).ok).toBe(false);
    expect(validateDeck({ slides: [] }).issues[0]?.code).toBe('not_object');
  });
});
