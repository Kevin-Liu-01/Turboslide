// The brand kit record (docs/PRODUCT.md 4.1, 8.3): a record with every field absent validates, the
// six roles, the positions and the lexicon validate, an unknown role is refused, the pointer writes
// land at the shallowest missing ancestor and the resets remove the record or one field, the
// counter helpers read the kit before the older defaults, and the manifest schema carries it.
import { describe, expect, it } from 'vitest';
import {
  BRAND_ROOTS,
  KIT_COLORS,
  KIT_COLOR_TOKENS,
  KIT_COLOR_WORDS,
  SLOT_POSITIONS,
  brandAfter,
  brandKitSchema,
  brandResetMutations,
  brandWriteLabel,
  brandWriteMutation,
  checkBrandKit,
  defaultKitOf,
  isBrandPointer,
  kitFontIds,
} from './brand.ts';
import type { BrandHost, BrandKit } from './brand.ts';
import { deckAppearance, deckCounter, deckCounterFormat, deckSchema } from './deck.ts';
import type { Deck } from './deck.ts';
import { validateDeck } from './validate.ts';
import { workedDocument } from './fixtures.ts';
import { applyMutation } from './reduce.ts';

const FULL: BrandKit = {
  name: 'Acme',
  appearance: 'dark',
  colors: {
    light: {
      text: '#101010',
      background: '#f4f1ea',
      caption: '#333333',
      hint: '#777777',
      primary: '#0b3d91',
      accent: '#12a37a',
    },
    dark: { text: '#f0f0f0' },
  },
  fonts: { display: 'playfair-display', text: 'source-sans-3' },
  mark: { kind: 'picture', assetId: 'acme-mark', box: { w: 160, h: 60 } },
  footer: { logo: 'picture', assetId: 'acme-mark', text: 'Confidential' },
  counter: { show: true, format: 'Slide n', skipTitle: true },
  frame: { rails: false, rules: true, crosses: false },
  positions: { mark: 'top-right', footerLogo: 'bottom-right' },
  lexicon: ['Acme', 'Locadex'],
};

describe('the brand kit schema', () => {
  it('validates an empty record, a full record, every role and every position', () => {
    expect(brandKitSchema.safeParse({}).success).toBe(true);
    expect(brandKitSchema.safeParse(FULL).success).toBe(true);
    for (const role of KIT_COLORS) {
      expect(
        brandKitSchema.safeParse({ colors: { light: { [role]: '#0b3d91' } } }).success,
        role,
      ).toBe(true);
      expect(KIT_COLOR_WORDS[role].name.length).toBeGreaterThan(0);
      expect(KIT_COLOR_TOKENS[role].length).toBeGreaterThan(0);
    }
    for (const position of SLOT_POSITIONS)
      expect(brandKitSchema.safeParse({ positions: { mark: position } }).success, position).toBe(
        true,
      );
    expect(KIT_COLORS).toEqual(['text', 'background', 'caption', 'hint', 'primary', 'accent']);
    expect(KIT_COLOR_TOKENS.primary).toBe('blue');
  });

  it('refuses an unknown role, a colour that is not a hex, a face outside the catalog and an unknown field', () => {
    expect(brandKitSchema.safeParse({ colors: { light: { muted: '#0b3d91' } } }).success).toBe(
      false,
    );
    expect(brandKitSchema.safeParse({ colors: { light: { primary: 'blue' } } }).success).toBe(
      false,
    );
    expect(brandKitSchema.safeParse({ fonts: { display: 'comic-sans' } }).success).toBe(false);
    expect(brandKitSchema.safeParse({ theme: 'x' }).success).toBe(false);
    expect(brandKitSchema.safeParse({ counter: { format: 'N of n' } }).success).toBe(false);
    const refused = checkBrandKit({ colors: { light: { hue: '#000000' } } });
    expect('refused' in refused && refused.refused).toMatch(/hue|Unrecognized/i);
  });

  it('is a field of the manifest the validator accepts and an unknown field elsewhere refuses', () => {
    const document = workedDocument();
    const deck: Deck = { ...document.deck, brand: FULL };
    expect(deckSchema.safeParse(deck).success).toBe(true);
    const result = validateDeck({ deck, slides: document.slides });
    expect(result.issues.filter((issue) => issue.severity === 3)).toEqual([]);
    const bad = validateDeck({
      deck: { ...deck, brand: { colors: { light: { muted: '#000000' } } } } as Deck,
      slides: document.slides,
    });
    expect(bad.issues.some((issue) => issue.severity === 3)).toBe(true);
  });
});

describe('the pointer writes', () => {
  it('accepts a pointer under every root and refuses one outside', () => {
    for (const root of BRAND_ROOTS) expect(isBrandPointer(`/${root}`), root).toBe(true);
    expect(isBrandPointer('/colors/light/primary')).toBe(true);
    expect(isBrandPointer('/title')).toBe(false);
    expect(isBrandPointer('colors')).toBe(false);
    expect(isBrandPointer('/colors/light/primary/x')).toBe(false);
    expect(() => brandWriteMutation({}, '/title', 'x')).toThrow(TypeError);
  });

  it('writes at the shallowest missing ancestor so one Undo takes one field back', () => {
    expect(brandWriteMutation({}, '/colors/light/primary', '#0b3d91')).toEqual({
      op: 'deck.set',
      path: '/brand',
      value: { colors: { light: { primary: '#0b3d91' } } },
    });
    const deck: BrandHost = { brand: { colors: { light: { text: '#101010' } } } };
    expect(brandWriteMutation(deck, '/colors/light/primary', '#0b3d91')).toEqual({
      op: 'deck.set',
      path: '/brand/colors/light/primary',
      value: '#0b3d91',
    });
    expect(brandWriteMutation(deck, '/colors/dark/primary', '#0b3d91')).toEqual({
      op: 'deck.set',
      path: '/brand/colors/dark',
      value: { primary: '#0b3d91' },
    });
    expect(brandWriteMutation(deck, '/colors/light/text', undefined)).toEqual({
      op: 'deck.set',
      path: '/brand/colors/light/text',
    });
    // the record after the write, for the validator
    expect(brandAfter({}, brandWriteMutation({}, '/fonts/display', 'lora'))).toEqual({
      fonts: { display: 'lora' },
    });
    expect(brandAfter(deck, brandWriteMutation(deck, '/colors/light/text', undefined))).toEqual({
      colors: { light: {} },
    });
    expect(brandAfter(deck, { op: 'deck.set', path: '/brand' })).toBeUndefined();
  });

  it('applies through the reducer and inverts exactly', () => {
    const document = workedDocument();
    const write = brandWriteMutation(document.deck, '/colors/light/primary', '#0b3d91');
    const inverse = applyMutation(document, write, {});
    expect(document.deck.brand).toEqual({ colors: { light: { primary: '#0b3d91' } } });
    expect(inverse).toEqual([{ op: 'deck.set', path: '/brand' }]);
    for (const step of inverse) applyMutation(document, step, {});
    expect(document.deck.brand).toBeUndefined();
  });

  it('resets the record or one field, and nothing on a deck without a record', () => {
    expect(brandResetMutations({})).toEqual([]);
    expect(brandResetMutations({ brand: FULL })).toEqual([{ op: 'deck.set', path: '/brand' }]);
    expect(brandResetMutations({ brand: FULL }, '/colors/light/primary')).toEqual([
      { op: 'deck.set', path: '/brand/colors/light/primary' },
    ]);
    expect(brandResetMutations({ brand: FULL }, '/colors/light/hue')).toEqual([]);
  });

  it('labels every write in the words Version history lists', () => {
    expect(brandWriteLabel('/colors/light/primary')).toBe('Brand kit: Primary');
    expect(brandWriteLabel('/fonts/display')).toBe('Brand kit: Display font');
    expect(brandWriteLabel('/mark')).toBe('Brand kit: Logo');
    expect(brandWriteLabel('/footer/text')).toBe('Brand kit: Footer text');
    expect(brandWriteLabel('/counter/format')).toBe('Brand kit: Slide numbers');
    expect(brandWriteLabel('/frame/rails')).toBe('Brand kit: Frame');
    expect(brandWriteLabel('/lexicon')).toBe('Brand kit: Words that never translate');
  });
});

describe('the deck helpers', () => {
  const base = workedDocument().deck;
  it('reads the appearance from the tiles, then the kit, then dark', () => {
    expect(deckAppearance(base)).toBe('dark');
    expect(deckAppearance({ ...base, brand: { appearance: 'light' } })).toBe('light');
    expect(
      deckAppearance({ ...base, defaults: { appearance: 'dark' }, brand: { appearance: 'light' } }),
    ).toBe('dark');
    expect(defaultKitOf({ name: 'General Translation', appearance: 'light' }).name).toBe(
      'General Translation',
    );
  });

  it('reads the counter from the kit before the older default', () => {
    expect(deckCounter(base)).toBe('on');
    expect(deckCounter({ ...base, defaults: { counter: 'off' } })).toBe('off');
    expect(
      deckCounter({ ...base, defaults: { counter: 'off' }, brand: { counter: { show: true } } }),
    ).toBe('on');
    expect(deckCounter({ ...base, brand: { counter: { show: false } } })).toBe('off');
    expect(deckCounter({ ...base, brand: { counter: { skipTitle: true } } })).toBe('skip-title');
    expect(deckCounter({ ...base, brand: { counter: { format: 'n' } } })).toBe('on');
    expect(deckCounterFormat(base)).toBe('n / N');
    expect(deckCounterFormat({ ...base, brand: { counter: { format: 'Slide n' } } })).toBe(
      'Slide n',
    );
    expect(kitFontIds(FULL)).toEqual(['playfair-display', 'source-sans-3']);
    expect(kitFontIds({ fonts: { display: 'lora', text: 'lora' } })).toEqual(['lora']);
  });
});
