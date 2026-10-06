// The design round's theme migration (docs/DESIGN.md 7.9) over the two pre-round fixtures under
// __fixtures__/theme-legacy: Blank's manifest (a kit that turns every GT part off) becomes Simple
// with the kit fields equal to Simple dropped, the General Translation deck's manifest (no kit, no
// appearance) becomes General Translation with dark written, each reported as a `migrated` issue
// at severity 1; a second pass changes nothing; and a deck in one of the nine ids is left alone.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Deck } from './deck.ts';
import { deckAppearance, deckCounter, migrateLegacyTheme } from './deck.ts';
import { frameOf, themeFactsOf } from './brand.ts';
import { validateDeck } from './validate.ts';

const FIXTURES = new URL('./__fixtures__/theme-legacy/', import.meta.url);

function fixture(name: 'blank' | 'general-translation'): { deck: unknown; slides: unknown[] } {
  const dir = new URL(`${name}/`, FIXTURES);
  const deck = JSON.parse(readFileSync(new URL('deck.json', dir), 'utf8')) as unknown;
  const slides = readdirSync(new URL('slides/', dir)).map(
    (file) => JSON.parse(readFileSync(new URL(`slides/${file}`, dir), 'utf8')) as unknown,
  );
  return { deck, slides };
}

/** What a deck draws of the parts a theme decides: the logo slots, the counter, the frame, the appearance. */
function drawn(deck: Deck) {
  const kit = deck.brand;
  const logo = themeFactsOf(deck.theme).logo;
  const markKind = kit?.mark?.kind ?? 'default';
  const footerKind = kit?.footer?.logo ?? 'default';
  return {
    mark:
      kit?.positions?.mark !== 'hidden' &&
      (markKind === 'picture' || (markKind === 'default' && logo)),
    wordmark:
      kit?.positions?.footerLogo !== 'hidden' &&
      (footerKind === 'picture' || (footerKind === 'default' && logo)),
    counter: deckCounter(deck),
    frame: frameOf(deck.theme, kit),
    appearance: deckAppearance(deck),
  };
}

/** The same parts read the way the tree read them before the round: GT's sheet under the kit. */
function drawnBefore(deck: Deck) {
  return drawn({ ...deck, theme: 'gt-ink-paper' });
}

describe('the theme migration (docs/DESIGN.md 7.9)', () => {
  it('maps the pre-round Blank manifest to Simple with its kit fields equal to Simple dropped', () => {
    const input = fixture('blank');
    const before = structuredClone(input.deck) as Deck;
    const result = validateDeck(input);
    expect(result.ok).toBe(true);
    const deck = result.deck!;
    expect(deck.theme).toBe('simple');
    // every field Blank's kit set equals Simple's part, so the kit leaves; nothing else changes
    expect(deck.brand).toBeUndefined();
    expect(deck.defaults?.appearance).toBe('dark');
    const row = result.issues.find(
      (issue) => issue.code === 'migrated' && issue.pointer === '/theme',
    );
    expect(row?.severity).toBe(1);
    expect(row?.message).toContain('simple');
    // rule 2 changes the display glyphs alone: the logo slots, the counter, the frame and the
    // appearance are what the deck drew before
    expect(drawn(deck)).toEqual(drawnBefore(before));
  });

  it('maps the pre-round General Translation manifest to General Translation with dark written', () => {
    const input = fixture('general-translation');
    const before = structuredClone(input.deck) as Deck;
    const result = validateDeck(input);
    expect(result.ok).toBe(true);
    const deck = result.deck!;
    expect(deck.theme).toBe('general-translation');
    expect(deck.brand).toBeUndefined();
    expect(deck.defaults?.appearance).toBe('dark');
    expect(drawn(deck)).toEqual(drawnBefore(before));
    expect(result.issues.filter((issue) => issue.code === 'migrated')).toHaveLength(1);
  });

  it('changes nothing on a second pass and leaves the nine ids alone', () => {
    for (const name of ['blank', 'general-translation'] as const) {
      const once = validateDeck(fixture(name));
      const twice = validateDeck({ deck: once.deck, slides: Object.values(once.slides) });
      expect(twice.deck, name).toEqual(once.deck);
      expect(
        twice.issues.some((issue) => issue.code === 'migrated'),
        name,
      ).toBe(false);
    }
    const simple = {
      ...(fixture('blank').deck as Deck),
      theme: 'simple' as const,
      brand: undefined,
    };
    expect(migrateLegacyTheme(simple)).toBeNull();
  });

  it('keeps every kit field Simple does not draw and writes the parts the deck drew', () => {
    const base = fixture('blank').deck as Deck;
    const deck: Deck = {
      ...structuredClone(base),
      brand: {
        name: 'Acme',
        mark: { kind: 'none' },
        footer: { logo: 'none', text: 'Confidential' },
        frame: { rails: false, crosses: true },
        colors: { light: { primary: '#0b3d91' } },
      },
    };
    const before = structuredClone(deck);
    const migration = migrateLegacyTheme(deck);
    expect(migration?.theme).toBe('simple');
    expect(deck.brand).toEqual({
      name: 'Acme',
      footer: { text: 'Confidential' },
      counter: { show: true },
      frame: { crosses: true, rules: true },
      colors: { light: { primary: '#0b3d91' } },
    });
    expect(drawn(deck)).toEqual(drawnBefore(before));
    // a kit that keeps one GT slot drawn stays General Translation, its kit untouched
    const one: Deck = { ...structuredClone(base), brand: { mark: { kind: 'none' } } };
    expect(migrateLegacyTheme(one)?.theme).toBe('general-translation');
    expect(one.brand).toEqual({ mark: { kind: 'none' } });
  });
});
