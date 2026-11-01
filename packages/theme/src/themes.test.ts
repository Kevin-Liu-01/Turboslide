// The theme library (docs/DESIGN.md 7.2): nine records in the schema's order, each over the
// schema's facts, every stated colour at the renderer's floors on its own ground in both
// appearances (through the one contrast function, contrast.ts), General Translation and Simple on
// the sheet's own tokens byte for byte, and the derived tokens as ink alphas.
import { describe, expect, it } from 'vitest';
import { GT_THEME_ID, LEGACY_THEME_ID, THEME_FACTS, THEME_IDS } from '@turboslide/schema/brand';
import { contrastRatio } from './contrast.ts';
import {
  BASE_HEADING_TRACKING,
  MAX_THEME_PARTS,
  THEME_FLOORS,
  THEME_RECORDS,
  deriveTokens,
  themeName,
  themeRecord,
} from './themes.ts';
import { DISPLAY, TOKENS, TOKEN_NAMES } from './tokens.ts';

const APPEARANCES = ['light', 'dark'] as const;

describe('the theme library', () => {
  it('lists the nine themes in the schema order with their names', () => {
    expect(THEME_RECORDS.map((theme) => theme.id)).toEqual([...THEME_IDS]);
    expect(THEME_RECORDS.map((theme) => theme.name)).toEqual([
      'Simple',
      'General Translation',
      'Swiss',
      'Mint',
      'Coral',
      'Night',
      'Slate',
      'Sand',
      'Signal',
    ]);
  });

  it('builds every record over the schema facts', () => {
    for (const theme of THEME_RECORDS) {
      const facts = THEME_FACTS[theme.id];
      expect(theme.defaultAppearance, theme.id).toBe(facts.appearance);
      expect(theme.frame, theme.id).toEqual(facts.frame);
      expect(theme.band.wordmark, theme.id).toBe(facts.logo ? 'gt' : 'none');
      expect(theme.title.mark, theme.id).toBe(facts.logo ? 'gt' : 'none');
      expect(theme.band.counter, theme.id).toBe(facts.counter.show ? facts.counter.format : 'none');
      expect(theme.pictures, theme.id).toBe(facts.pictures ? 'gt-materials' : 'none');
      expect(theme.fonts, theme.id).toBe(facts.fonts);
    }
  });

  // Kevin, 2026-11-01: "our themes suck make them look a lot better", then "make these more
  // visually distinct, look at google slides themes". Nine palettes over one Inter layout read as
  // one theme. Each theme past Simple and General Translation now has a heading face of its own,
  // parts of its own on the title slide and on every other slide, and no two themes draw the same
  // parts on either.
  it('gives every theme past the sheet its own heading face and its own parts', () => {
    const stated = THEME_RECORDS.filter(
      (theme) => theme.id !== GT_THEME_ID && theme.id !== 'simple',
    );
    expect(new Set(stated.map((theme) => theme.fonts.display)).size).toBe(stated.length);
    const key = (parts: unknown, colors: unknown = null) => JSON.stringify([parts, colors]);
    expect(new Set(stated.map((theme) => key(theme.parts))).size).toBe(stated.length);
    expect(new Set(stated.map((theme) => key(theme.title.parts, theme.title.colors))).size).toBe(
      stated.length,
    );
    for (const theme of stated) {
      expect(theme.fonts.display, theme.id).not.toBe('inter');
      expect(theme.parts.length, theme.id).toBeGreaterThan(0);
      expect(theme.title.parts.length, theme.id).toBeGreaterThan(0);
      for (const parts of [theme.parts, theme.title.parts])
        expect(parts.length, theme.id).toBeLessThanOrEqual(MAX_THEME_PARTS);
      // a title set on a ground of its own draws that ground as its first part
      if (theme.title.colors !== null)
        expect(theme.title.parts[0], theme.id).toEqual({ box: [0, 0, 1600, 900], fill: 'paper' });
    }
    for (const id of [GT_THEME_ID, 'simple'] as const) {
      const theme = themeRecord(id);
      expect(theme.fonts, id).toEqual({ display: 'inter', text: 'inter' });
      expect(theme.heading, id).toEqual({ tracking: BASE_HEADING_TRACKING, uppercase: false });
      expect([theme.parts, theme.title.parts, theme.title.colors, theme.title.size], id).toEqual([
        [],
        [],
        null,
        null,
      ]);
    }
  });

  it("holds a flooded title's colours at the floors on its own ground", () => {
    for (const theme of THEME_RECORDS) {
      if (theme.title.colors === null) continue;
      for (const appearance of APPEARANCES) {
        const colors = theme.title.colors[appearance];
        for (const [role, floor] of Object.entries(THEME_FLOORS))
          expect(
            contrastRatio(colors[role as keyof typeof colors], colors.paper),
            `${theme.id} title ${appearance} ${role}`,
          ).toBeGreaterThanOrEqual(floor);
      }
    }
  });

  it('keeps the GT parts in General Translation alone', () => {
    for (const theme of THEME_RECORDS) {
      const gt = theme.id === GT_THEME_ID;
      expect(theme.title.mark === 'gt', theme.id).toBe(gt);
      expect(theme.band.wordmark === 'gt', theme.id).toBe(gt);
      expect(theme.pictures === 'gt-materials', theme.id).toBe(gt);
      expect(theme.frame.rails && theme.frame.crosses, theme.id).toBe(gt);
      expect(theme.displayFeatures, theme.id).toBe(gt ? DISPLAY.features : 'normal');
    }
  });

  it('draws General Translation and Simple in the sheet tokens byte for byte', () => {
    expect(themeRecord(GT_THEME_ID).tokens).toBe(TOKENS);
    expect(themeRecord('simple').tokens).toBe(TOKENS);
    expect(themeRecord(LEGACY_THEME_ID).id).toBe(GT_THEME_ID);
    expect(themeName(LEGACY_THEME_ID)).toBe('General Translation');
    expect(themeName('simple')).toBe('Simple');
  });

  it('holds every role at its floor on its own ground in both appearances', () => {
    const readings: string[] = [];
    for (const theme of THEME_RECORDS)
      for (const appearance of APPEARANCES) {
        const colors = theme.colors[appearance];
        const ratios = {
          ink: contrastRatio(colors.ink, colors.paper),
          'ink-2': contrastRatio(colors['ink-2'], colors.paper),
          hint: contrastRatio(colors.hint, colors.paper),
          accent: contrastRatio(colors.accent, colors.paper),
        };
        for (const [role, floor] of Object.entries(THEME_FLOORS)) {
          const ratio = ratios[role as keyof typeof ratios];
          expect(ratio, `${theme.id} ${appearance} ${role}`).toBeGreaterThanOrEqual(floor);
        }
        const lowest = Object.entries(ratios).sort((a, b) => a[1] - b[1])[0];
        readings.push(
          `${theme.id} ${appearance}: lowest ${lowest?.[0]} ${lowest?.[1].toFixed(2)}:1`,
        );
      }
    // the readings of DESIGN.md 7.2's last column, to the test's output
    console.log(readings.join('\n'));
  });

  it('derives the twelve tokens of a stated theme from its ink at the sheet alphas', () => {
    const swiss = themeRecord('swiss');
    for (const appearance of APPEARANCES) {
      const tokens = swiss.tokens[appearance];
      expect(Object.keys(tokens).sort()).toEqual([...TOKEN_NAMES].sort());
      expect(tokens.paper).toBe(swiss.colors[appearance].paper);
      expect(tokens.titanium).toBe(swiss.colors[appearance].hint);
      expect(tokens.blue).toBe(swiss.colors[appearance].accent);
      expect(tokens.accent).toBe(swiss.colors[appearance].accent);
    }
    expect(swiss.tokens.light.hair).toBe('rgba(17, 17, 17, 0.18)');
    expect(swiss.tokens.dark.edge).toBe('rgba(244, 244, 242, 0.55)');
    // the sheet's own alphas: deriving Simple's light colours gives the sheet's light tokens
    const derived = deriveTokens(themeRecord('simple').colors.light, 'light');
    for (const name of ['hair', 'hair-soft', 'plate', 'cross', 'edge', 'thumb'] as const)
      expect(derived[name], name).toBe(TOKENS.light[name]);
  });

  it('gives each theme one sentence of plain words and a composition', () => {
    for (const theme of THEME_RECORDS) {
      expect(theme.sentence.endsWith('.'), theme.id).toBe(true);
      expect(theme.sentence, theme.id).not.toMatch(/—|Google/);
    }
    expect(themeRecord('swiss').title).toMatchObject({
      composition: 'bottom-left',
      columnRight: 0,
      size: 104,
      accentBar: true,
      mark: 'none',
      colors: null,
    });
    expect(themeRecord('signal').title.accentBar).toBe(true);
    expect(themeRecord('signal').heading.uppercase).toBe(true);
    expect(themeRecord('signal').title.colors?.dark.paper).toBe('#ffd400');
    expect(themeRecord('slate').title.colors?.light).toEqual(themeRecord('slate').colors.dark);
    expect(themeRecord('mint').title.columnRight).toBe(520);
    expect(themeRecord('sand').title.composition).toBe('centre');
    expect(themeRecord('coral').title.composition).toBe('bottom-left');
  });
});
