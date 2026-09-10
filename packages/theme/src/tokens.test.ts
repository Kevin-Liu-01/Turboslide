// The parity test (SPEC 5.1, AGENTS.md "Parity chains"): sheet.css and stage.css are parsed and
// every value that tokens.ts states as data is asserted against the CSS.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { customProperties, declarationsOf, parseCss } from './css.ts';
import {
  CHIPS,
  COLUMNS,
  COLUMN_GAP,
  COMPOSITE,
  CONTENT,
  CONTENT_ORIGIN,
  COUNTER,
  CROSS,
  DISPLAY,
  DITHER_HEIGHT,
  FLOOR,
  FONTS,
  ICON_SIZES,
  INSET,
  KEY_WIDTHS,
  LADDER,
  MOTION,
  PAD,
  PANEL,
  RAIL,
  SEMANTIC,
  SHEET,
  SVG_LABEL_MIN,
  SWATCH_PLATES,
  TOKENS,
  TOKEN_NAMES,
  WEIGHT_CAP,
  WORDMARK,
  columnWidths,
  compositeOnPaper,
} from './tokens.ts';

const sheet = parseCss(readFileSync(new URL('./gt-ink-paper/sheet.css', import.meta.url), 'utf8'));
const stage = parseCss(readFileSync(new URL('./gt-ink-paper/stage.css', import.meta.url), 'utf8'));
const all = [...sheet, ...stage];

const px = (value: number): string => `${value}px`;

describe('tokens agree with sheet.css', () => {
  it('declares the light tokens on .ts-sheet and the dark remap on .ts-sheet[data-theme="dark"]', () => {
    const light = customProperties(sheet, '.ts-sheet');
    const dark = customProperties(sheet, '.ts-sheet[data-theme="dark"]');
    for (const name of TOKEN_NAMES) {
      expect(light[name], `light --${name}`).toBe(TOKENS.light[name]);
      expect(dark[name], `dark --${name}`).toBe(TOKENS.dark[name]);
    }
    expect(declarationsOf(sheet, '.ts-sheet')['color-scheme']).toBe('light');
    expect(declarationsOf(sheet, '.ts-sheet[data-theme="dark"]')['color-scheme']).toBe('dark');
    expect(
      Object.keys(light)
        .filter(
          (k) =>
            !k.startsWith('display') && !['text', 'mono', 'cjk', 'arabic', 'indic'].includes(k),
        )
        .sort(),
    ).toEqual([...TOKEN_NAMES].sort());
  });

  it('declares the font stacks', () => {
    const light = customProperties(sheet, '.ts-sheet');
    expect(light.display).toBe(FONTS.display);
    expect(light.text).toBe(FONTS.text);
    expect(light.mono).toBe(FONTS.mono);
    expect(light.cjk).toBe(FONTS.cjk);
    expect(light.arabic).toBe(FONTS.arabic);
    expect(light.indic).toBe(FONTS.indic);
  });

  it('puts the semantic hues on icons only', () => {
    expect(declarationsOf(sheet, '.ts-sheet .ic.ok').color).toBe(SEMANTIC.ok);
    expect(declarationsOf(sheet, '.ts-sheet .ic.warn').color).toBe(SEMANTIC.warn);
    expect(declarationsOf(sheet, '.ts-sheet .ic.no').color).toBe(SEMANTIC.no);
    expect(declarationsOf(sheet, '.ts-sheet .ic.info').color).toBe(SEMANTIC.info);
    const hueRules = all.filter((rule) =>
      Object.values(rule.declarations).some((v) =>
        Object.values(SEMANTIC).some((hue) => v.includes(hue)),
      ),
    );
    expect(hueRules.every((rule) => rule.selector.startsWith('.ts-sheet .ic.'))).toBe(true);
  });

  it('keeps the fixed panel and swatch colors', () => {
    const panel = declarationsOf(sheet, '.ts-sheet .panel');
    expect(panel.background).toBe(PANEL.background);
    expect(panel.color).toBe(PANEL.text);
    expect(declarationsOf(sheet, '.ts-sheet .swatch.ink').background).toBe(SWATCH_PLATES.ink);
    expect(declarationsOf(sheet, '.ts-sheet .swatch.raised').background).toBe(SWATCH_PLATES.raised);
    expect(declarationsOf(sheet, '.ts-sheet .swatch.ti').background).toBe(SWATCH_PLATES.ti);
    expect(declarationsOf(sheet, '.ts-sheet .swatch.paper').background).toBe(SWATCH_PLATES.paper);
  });

  it('computes the composite hairline colors the spec states', () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const token of ['hair', 'hair-soft', 'plate', 'cross'] as const) {
        expect(compositeOnPaper(theme, token), `${theme} ${token}`).toBe(COMPOSITE[theme][token]);
      }
    }
  });
});

describe('the grid agrees with the CSS', () => {
  it('draws the rails, rules and crosses at the stated offsets', () => {
    expect(declarationsOf(sheet, '.ts-sheet .frame::before').left).toBe(px(RAIL));
    expect(declarationsOf(sheet, '.ts-sheet .frame::after').right).toBe(px(RAIL));
    expect(declarationsOf(sheet, '.ts-sheet .frame .rule.top').top).toBe(px(RAIL));
    expect(declarationsOf(sheet, '.ts-sheet .frame .rule.bottom').bottom).toBe(px(RAIL));
    const cross = declarationsOf(sheet, '.ts-sheet .frame .cross');
    expect(cross.width).toBe(px(CROSS.size));
    expect(cross.height).toBe(px(CROSS.size));
    expect(declarationsOf(sheet, '.ts-sheet .frame .cross.tl').left).toBe(px(CROSS.offset));
    expect(declarationsOf(sheet, '.ts-sheet .frame .cross.br').bottom).toBe(px(CROSS.offset));
  });

  it('sizes the sheet, the stage and the slide box', () => {
    for (const selector of ['.ts-sheet .sheet', '.ts-sheet .stage']) {
      expect(declarationsOf(stage, selector).width).toBe(px(SHEET.width));
      expect(declarationsOf(stage, selector).height).toBe(px(SHEET.height));
    }
    const slide = declarationsOf(stage, '.ts-sheet .slide');
    expect(slide.inset).toBe(px(INSET));
    expect(slide.padding).toBe(`${px(PAD[0])} ${px(PAD[1])}`);
    expect(CONTENT).toEqual([
      SHEET.width - 2 * INSET - 2 * PAD[1],
      SHEET.height - 2 * INSET - 2 * PAD[0],
    ]);
    expect(CONTENT_ORIGIN).toEqual([INSET + PAD[1], INSET + PAD[0]]);
  });

  it('places the wordmark and the counter', () => {
    const wordmark = declarationsOf(sheet, '.ts-sheet .wordmark');
    expect(wordmark.left).toBe(px(WORDMARK.left));
    expect(wordmark.bottom).toBe(px(WORDMARK.bottom));
    expect(wordmark.height).toBe(px(WORDMARK.height));
    const counter = declarationsOf(sheet, '.ts-sheet .counter');
    expect(counter.right).toBe(px(COUNTER.right));
    expect(counter.bottom).toBe(px(COUNTER.bottom));
    expect(counter['font-size']).toBe(px(COUNTER.fontSize));
    expect(CHIPS[0].x + CHIPS[0].w).toBeGreaterThan(WORDMARK.left);
  });

  it('derives the column widths from .cols', () => {
    const cols = declarationsOf(sheet, '.ts-sheet .cols');
    expect(cols.gap).toBe(px(COLUMN_GAP));
    expect(cols['grid-template-columns']).toBe('5fr 7fr');
    expect(declarationsOf(sheet, '.ts-sheet .cols.even')['grid-template-columns']).toBe('1fr 1fr');
    expect(declarationsOf(sheet, '.ts-sheet .cols.wide-right')['grid-template-columns']).toBe(
      '4fr 8fr',
    );
    expect(columnWidths('5/7')).toEqual([...COLUMNS['5/7']]);
    expect(columnWidths('4/8')).toEqual([...COLUMNS['4/8']]);
    expect(columnWidths('1/1')).toEqual([...COLUMNS['1/1']]);
    expect(columnWidths({ left: 390 })).toEqual([390, 864]);
    expect(columnWidths({ right: 568 })).toEqual([686, 568]);
  });
});

describe('the type ladder agrees with the CSS', () => {
  const cases: [string, keyof typeof LADDER][] = [
    ['.ts-sheet h1', 'h1'],
    ['.ts-sheet h2', 'h2'],
    ['.ts-sheet .big', 'big'],
    ['.ts-sheet p', 'p'],
    ['.ts-sheet .lead', 'lead'],
    ['.ts-sheet .cap', 'cap'],
    ['.ts-sheet .rows > div', 'rows'],
    ['.ts-sheet .plain', 'plain'],
    ['.ts-sheet .refs', 'refs'],
    ['.ts-sheet .scale', 'scale'],
    ['.ts-sheet .spec .w', 'spec'],
    ['.ts-sheet .lang div', 'lang'],
    ['.ts-sheet .say .q', 'say'],
    ['.ts-sheet .pair figcaption', 'pairCaption'],
    ['.ts-sheet svg.dia text', 'dia'],
    ['.ts-sheet svg.dia .lab', 'diaLab'],
    ['.ts-sheet svg.dia .sm', 'diaSm'],
    ['.ts-sheet .panel', 'panel'],
    ['.ts-sheet .counter', 'counter'],
    ['.ts-sheet .swatch b', 'swatchName'],
    ['.ts-sheet .swatch span', 'swatchValue'],
  ];

  it.each(cases)('%s matches LADDER.%s', (selector, step) => {
    const declarations = declarationsOf(sheet, selector);
    const expected = LADDER[step] as {
      size: number;
      lineHeight?: number;
      tracking?: string;
      weight?: number;
    };
    expect(declarations['font-size']).toBe(px(expected.size));
    if (expected.lineHeight !== undefined)
      expect(declarations['line-height']).toBe(String(expected.lineHeight));
    if (expected.tracking !== undefined && declarations['letter-spacing'] !== undefined) {
      expect(declarations['letter-spacing']).toBe(expected.tracking);
    }
    if (expected.weight !== undefined && declarations['font-weight'] !== undefined) {
      expect(declarations['font-weight']).toBe(String(expected.weight));
    }
  });

  it('caps display weight at 500 with the stated tracking and features', () => {
    for (const selector of ['.ts-sheet h1', '.ts-sheet h2', '.ts-sheet .big']) {
      const declarations = declarationsOf(sheet, selector);
      expect(declarations['font-weight']).toBe(String(DISPLAY.weight));
      expect(declarations['letter-spacing']).toBe(DISPLAY.tracking);
      expect(declarations['font-feature-settings']).toBe(DISPLAY.features);
      expect(declarations['text-wrap']).toBe('balance');
    }
    expect(DISPLAY.weight).toBe(WEIGHT_CAP);
    const weights = all.flatMap((rule) =>
      rule.declarations['font-weight'] === undefined
        ? []
        : [Number(rule.declarations['font-weight'])],
    );
    expect(Math.max(...weights)).toBeLessThanOrEqual(WEIGHT_CAP);
  });

  it('never sets a font size under the floor, and never an SVG label under 18', () => {
    const sizes = all.flatMap((rule) => {
      const value = rule.declarations['font-size'];
      const match = value === undefined ? null : /^(\d+(?:\.\d+)?)px$/.exec(value);
      return match === null ? [] : [{ selector: rule.selector, size: Number(match[1]) }];
    });
    const under = sizes.filter((row) => row.size < FLOOR);
    // head:137 and head:144 set 14 px labels that the slides raise to 15; the counter is chrome at 13 px.
    expect(under.map((row) => row.selector).sort()).toEqual([
      '.ts-sheet .counter',
      '.ts-sheet .ladder > div > small',
      '.ts-sheet .lang div small',
    ]);
    expect(
      sizes
        .filter((row) => row.selector.startsWith('.ts-sheet svg.dia'))
        .every((row) => row.size >= SVG_LABEL_MIN),
    ).toBe(true);
  });

  it('states the key widths, icon sizes, dither height and the cut', () => {
    expect(declarationsOf(sheet, '.ts-sheet .rows')['--key']).toBe(px(KEY_WIDTHS.default));
    expect(declarationsOf(sheet, '.ts-sheet .rows.narrow')['--key']).toBe(px(KEY_WIDTHS.narrow));
    expect(declarationsOf(sheet, '.ts-sheet .ic').width).toBe(px(ICON_SIZES.rows));
    expect(declarationsOf(sheet, '.ts-sheet .plain > span > .ic').width).toBe(px(ICON_SIZES.plain));
    expect(declarationsOf(sheet, '.ts-sheet .ic.ext').width).toBe(px(ICON_SIZES.ext));
    expect(declarationsOf(sheet, '.ts-sheet canvas.dither').height).toBe(px(DITHER_HEIGHT));
    const cut = sheet.find(
      (rule) => rule.selector === '.ts-sheet .slide.is-on' && rule.media !== undefined,
    );
    expect(cut?.media).toBe('@media (prefers-reduced-motion: no-preference)');
    expect(cut?.declarations.animation).toBe(`cut ${MOTION.cut}ms ease-out`);
  });
});
