// The theme validator family (gslides-parity SPEC-5 1.2, 9.1; MILESTONES-5 B6 day 1).
import { describe, expect, it } from 'vitest';
import type { ThemeEdits } from '../deck.ts';
import { workedDocument } from '../fixtures.ts';
import { validateDeck } from '../validate.ts';
import {
  THEME_COLOR_KEYS,
  THEME_COLOR_SLOTS,
  THEME_DERIVED_TOKENS,
  isThemeColorKey,
  validateTheme,
} from './theme.ts';

function withEdits(edits: ThemeEdits) {
  const document = workedDocument();
  document.deck.themeEdits = edits;
  return document;
}

describe('the colour slot table', () => {
  it('lists Google’s twelve dropdown names in Google’s order with the derived tokens after', () => {
    expect(THEME_COLOR_SLOTS.map((slot) => slot.google)).toEqual([
      'Text and background 1',
      'Text and background 2',
      'Text and background 3',
      'Text and background 4',
      'Accent 1',
      'Accent 2',
      'Accent 3',
      'Accent 4',
      'Accent 5',
      'Accent 6',
      'Link',
    ]);
    expect(THEME_COLOR_SLOTS.filter((slot) => slot.alpha).map((slot) => slot.key)).toEqual([
      'ink',
      'paper',
      'ink-2',
      'plate',
    ]);
    expect(THEME_COLOR_KEYS).toHaveLength(THEME_COLOR_SLOTS.length + THEME_DERIVED_TOKENS.length);
    expect(new Set(THEME_COLOR_KEYS).size).toBe(THEME_COLOR_KEYS.length);
    expect(isThemeColorKey('ink')).toBe(true);
    expect(isThemeColorKey('hair-soft')).toBe(true);
    expect(isThemeColorKey('accent1')).toBe(false);
  });
});

describe('validateTheme', () => {
  it('answers nothing for a deck without edits and for edits on the known slots', () => {
    expect(validateTheme(workedDocument())).toEqual([]);
    const document = withEdits({
      name: 'Acme sales 2026',
      colors: { light: { ink: '#101010', ok: '#0a8a60' }, dark: { paper: '#000000' } },
      fonts: { display: 'roboto' },
      frame: { crosses: false, inset: 64 },
      mark: { kind: 'picture', assetId: 'site-home', box: [72, 864, 28, 18] },
      counter: { show: true, side: 'left', box: [1468, 856, 60, 22] },
      chips: { show: false },
      type: { levels: { h1: { size: 80 } } },
    });
    expect(validateTheme(document)).toEqual([]);
    const result = validateDeck({ deck: document.deck, slides: Object.values(document.slides) });
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('refuses an unknown colour slot in either appearance and in an imported record', () => {
    const document = withEdits({
      colors: { light: { accent1: '#101010' }, dark: { ink: '#ffffff' } },
    });
    document.deck.importedThemes = [
      {
        name: 'From a file',
        colors: { ink: '#000000', dk1: '#000000' },
        fonts: {},
        source: { file: 'deck.pptx', themeIndex: 0 },
      },
    ];
    const issues = validateTheme(document);
    expect(issues.map((row) => [row.code, row.severity, row.pointer])).toEqual([
      ['theme', 3, '/themeEdits/colors/light/accent1'],
      ['theme', 3, '/importedThemes/0/colors/dk1'],
    ]);
    expect(issues[0]?.message).toContain('the slots are');
    const result = validateDeck({ deck: document.deck, slides: Object.values(document.slides) });
    expect(result.ok).toBe(false);
  });

  it('wants an asset for a picture in the corner slot and knows the deck’s assets', () => {
    expect(validateTheme(withEdits({ mark: { kind: 'picture' } }))).toEqual([
      expect.objectContaining({ code: 'theme', severity: 3, pointer: '/themeEdits/mark/assetId' }),
    ]);
    expect(validateTheme(withEdits({ mark: { kind: 'picture', assetId: 'missing' } }))).toEqual([
      expect.objectContaining({
        code: 'reference',
        severity: 3,
        pointer: '/themeEdits/mark/assetId',
      }),
    ]);
    expect(validateTheme(withEdits({ mark: { kind: 'gt', assetId: 'site-home' } }))).toEqual([
      expect.objectContaining({ code: 'theme', severity: 2, pointer: '/themeEdits/mark/assetId' }),
    ]);
    expect(validateTheme(withEdits({ mark: { kind: 'none' } }))).toEqual([]);
  });

  it('warns about a slot box outside the page and refuses an inset that leaves no sheet', () => {
    const outside = validateTheme(
      withEdits({
        mark: { kind: 'gt', box: [1590, 890, 28, 18] },
        counter: { box: [0, 0, 10, 10] },
      }),
    );
    expect(outside).toEqual([
      expect.objectContaining({ code: 'theme', severity: 2, pointer: '/themeEdits/mark/box' }),
    ]);
    const document = withEdits({ frame: { inset: 400 } });
    document.deck.page = { width: 800, height: 600 };
    expect(validateTheme(document)).toEqual([
      expect.objectContaining({ code: 'theme', severity: 3, pointer: '/themeEdits/frame/inset' }),
    ]);
    expect(validateTheme(withEdits({ frame: { inset: 400 } }))).toEqual([]);
  });
});
