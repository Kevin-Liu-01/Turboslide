// The themes as data (gslides-parity SPEC-5 0.45, 9.1, 9.3; MILESTONES-5 B6 day 1): the ids agree
// with the schema, both themes carry the ten token values, the frame variables state today's
// geometry, the frame markup is the one the stage emits, and the root attributes stamp the id.
import { THEMES } from '@turboslide/schema/deck';
import { describe, expect, it } from 'vitest';
import { parseCss } from './css.ts';
import { COUNTER, CROSS, RAIL, TOKENS, TOKEN_NAMES, WORDMARK } from './tokens.ts';
import {
  DEFAULT_THEME_ID,
  FRAME_VARIABLES,
  GT_FRAME_HTML,
  PLATE_FRAME_HTML,
  SHEET_ATTRIBUTE,
  THEME_BASE_ATTRIBUTE,
  THEME_IDS,
  THEME_LABELS,
  THEME_SPECS,
  TYPE_LEVEL_SELECTORS,
  crossOffsetOf,
  frameVariables,
  isThemeId,
  plateBoxes,
  sheetRootAttributes,
  stageFrame,
  themeFolderOf,
  themeSpec,
  tokensFor,
} from './themes.ts';
import { sheetCss, stageCss } from './theme.ts';

describe('the theme ids', () => {
  it('are the schema list with the GT theme first and a label each', () => {
    expect([...THEME_IDS]).toEqual([...THEMES]);
    expect(THEME_IDS[0]).toBe(DEFAULT_THEME_ID);
    expect(THEME_IDS).toHaveLength(2);
    for (const id of THEME_IDS) {
      expect(isThemeId(id)).toBe(true);
      expect(THEME_LABELS[id].length).toBeGreaterThan(0);
      expect(themeSpec(id).id).toBe(id);
      expect(themeSpec(id).label).toBe(THEME_LABELS[id]);
    }
    expect(isThemeId('gt-ink')).toBe(false);
    expect(THEME_LABELS['ts-plate']).toBe('Plate');
  });

  it('carry the same ten token values in both appearances (SPEC-5 0.45)', () => {
    for (const id of THEME_IDS) {
      const tokens = tokensFor(id);
      for (const appearance of ['light', 'dark'] as const) {
        expect(Object.keys(tokens[appearance]).sort()).toEqual([...TOKEN_NAMES].sort());
        expect(tokens[appearance]).toEqual(TOKENS[appearance]);
      }
    }
  });
});

describe('the GT spec', () => {
  const gt = THEME_SPECS['gt-ink-paper'];

  it('states today’s frame, corner slot, counter and chips', () => {
    expect(gt.frame).toEqual({
      rail: RAIL,
      sides: ['left', 'right', 'top', 'bottom'],
      crosses: true,
      crossOffset: CROSS.offset,
      crossSize: CROSS.size,
    });
    expect(gt.mark).toEqual({
      kind: 'gt',
      left: WORDMARK.left,
      bottom: WORDMARK.bottom,
      width: 28,
      height: WORDMARK.height,
    });
    expect(gt.counter).toEqual({
      show: true,
      side: 'right',
      inset: COUNTER.right,
      bottom: COUNTER.bottom,
      fontSize: COUNTER.fontSize,
    });
    expect(gt.chips).toBe(true);
    expect(gt.display.weight).toBe(500);
    expect(crossOffsetOf(gt.frame.rail, gt.frame.crossSize)).toBe(gt.frame.crossOffset);
  });

  it('turns into the seven frame variables with pixel values', () => {
    const variables = frameVariables(gt);
    expect(Object.keys(variables).sort()).toEqual([...FRAME_VARIABLES].sort());
    expect(variables).toEqual({
      '--rail': '56px',
      '--cross-offset': '51px',
      '--mark-left': '72px',
      '--mark-bottom': '18px',
      '--mark-height': '18px',
      '--counter-inset': '72px',
      '--counter-bottom': '22px',
    });
  });
});

describe('the Plate spec (SPEC-5 9.3; the stylesheets follow on day 6)', () => {
  const plate = THEME_SPECS['ts-plate'];

  it('keeps the GT geometry and drops the right rail, the top rule, the crosses, the mark and the chips', () => {
    expect(plate.frame.rail).toBe(RAIL);
    expect(plate.frame.sides).toEqual(['left', 'bottom']);
    expect(plate.frame.crosses).toBe(false);
    expect(plate.mark.kind).toBe('none');
    expect(plate.counter).toEqual(THEME_SPECS['gt-ink-paper'].counter);
    expect(plate.chips).toBe(false);
    expect(plate.display).toEqual(THEME_SPECS['gt-ink-paper'].display);
  });
});

describe('the stage frame and the root attributes', () => {
  it('answers the GT frame for the GT theme and the one rule frame for Plate (SPEC-5 9.3)', () => {
    expect(stageFrame('gt-ink-paper')).toBe(GT_FRAME_HTML);
    expect(GT_FRAME_HTML.startsWith('<div class="frame">')).toBe(true);
    expect(GT_FRAME_HTML.match(/class="cross /g)).toHaveLength(4);
    expect(GT_FRAME_HTML.match(/class="rule /g)).toHaveLength(2);
    expect(stageFrame('ts-plate')).toBe(PLATE_FRAME_HTML);
    expect(PLATE_FRAME_HTML.match(/class="rule /g)).toHaveLength(1);
    expect(PLATE_FRAME_HTML.includes('cross')).toBe(false);
    expect(PLATE_FRAME_HTML.includes('rule top')).toBe(false);
  });

  it('names a stylesheet folder per theme and the plates as fractions of the page', () => {
    expect(themeFolderOf('gt-ink-paper')).toBe('gt-ink-paper');
    expect(themeFolderOf('ts-plate')).toBe('ts-plate');
    expect(plateBoxes('gt-ink-paper')).toEqual({
      opener: [137, 500, 740, 271],
      mood: [851, 539, 612, 232],
      closing: [137, 129, 720, 271],
    });
    expect(plateBoxes('ts-plate')).toEqual({
      opener: [200, 450, 800, 338],
      mood: [600, 450, 800, 338],
      closing: [200, 113, 800, 338],
    });
    expect(plateBoxes('ts-plate', { width: 1200, height: 900 }).opener).toEqual([
      150, 450, 600, 338,
    ]);
  });

  it('stamps data-sheet beside data-theme, and data-theme-base only when asked', () => {
    expect(sheetRootAttributes('gt-ink-paper', 'light')).toBe(
      `class="ts-sheet" data-theme="light" ${SHEET_ATTRIBUTE}="gt-ink-paper"`,
    );
    const base = sheetRootAttributes('ts-plate', 'dark', { classes: ['sheet'], base: true });
    expect(base).toContain(`${SHEET_ATTRIBUTE}="ts-plate"`);
    expect(base).toContain(`${THEME_BASE_ATTRIBUTE}=""`);
    expect(sheetRootAttributes('ts-plate', 'dark', { base: false })).not.toContain(
      THEME_BASE_ATTRIBUTE,
    );
  });

  it('names a sheet selector for every type level', () => {
    const selectors = new Set(parseCss(sheetCss('gt-ink-paper')).map((rule) => rule.selector));
    for (const list of Object.values(TYPE_LEVEL_SELECTORS)) {
      expect(list.length).toBeGreaterThan(0);
      for (const selector of list)
        expect(selectors.has(`.ts-sheet ${selector}`), selector).toBe(true);
    }
  });

  it('reads the frame variables in the sheet, never a literal rail offset', () => {
    const rules = parseCss(sheetCss('gt-ink-paper'));
    const frameRules = rules.filter(
      (rule) =>
        rule.selector.startsWith('.ts-sheet .frame') && rule.selector !== '.ts-sheet .frame',
    );
    const offsets = frameRules.flatMap((rule) =>
      ['left', 'right', 'top', 'bottom'].flatMap((side) => {
        const value = rule.declarations[side];
        return value === undefined || value === '0' ? [] : [value];
      }),
    );
    expect(offsets.length).toBeGreaterThan(0);
    expect(offsets.every((value) => value.startsWith('var(--'))).toBe(true);
    expect(parseCss(stageCss('gt-ink-paper')).length).toBeGreaterThan(0);
  });
});
