// The identity's parity test (gslides-parity SPEC-4 0.8, 0.10, 6.4; docs/NEXT.md 4.1.2 and 4.1.3
// items 1 to 3 and 7): brand.css and brand.ts agree on the sixteen tokens the way tokens.test.ts
// pins the sheet; the mark's geometry is pinned (the five rectangles, the committed path and its
// sha256, the 16 px rows, the hinted rows, the placements, the tile); the selection colour holds
// its contrast and is what the selection surfaces read; EmptyFigure.css names the twins site.ts
// exports; the README head carries the lockup, the www link and no row id; the counts of
// facts.json (written by `build-brand.ts --facts`) equal the tree, and the twins the build captured
// hold the theme palette with their ink fractions summing to one (0.12).
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { inflateSync } from 'node:zlib';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { ACTION_IDS } from '@turboslide/schema/actions';
import { LAYOUTS } from '@turboslide/schema/layouts';
import { SHAPE_PRESETS } from '@turboslide/schema/shapes';

import { SITE, TWIN_PATHS } from '../brand/site.ts';
import {
  BASELINE,
  BRAND_LAYOUT_MAX_PX,
  BRAND_NARROW_MAX_PX,
  BRAND_TOKENS,
  BRAND_TOKENS_NARROW,
  CAP_TOP,
  CAP_UNITS,
  CUT,
  MARK_ASPECT,
  MARK_BOX,
  MARK_LABEL,
  MARK_PATH,
  MARK_PATH_SHA256,
  MARK_RECTS,
  MARK_STEPS,
  ROWS16,
  ROWS16_PATH,
  ROWS16_PATH_SHA256,
  SELECTION_COLORS,
  SKEW,
  TILE_COLORS,
  TILE_SIZES,
  boxOf,
  capAt,
  contrastRatio,
  hintedRows,
  markBlocks,
  markPlacement,
  markQuads,
  markQuadsAt,
  markStep,
  markSvg,
  quadPath,
  relativeLuminance,
  rowsInk,
  rowsPath,
  tileMarkPath,
} from './brand.ts';
import { customProperties, declarationsOf, parseCss } from './css.ts';
import { TOKENS } from './tokens.ts';

const read = (relative: string): string => readFileSync(new URL(relative, import.meta.url), 'utf8');

const brandCss = parseCss(read('../../chrome/src/brand.css'));
const tokensCss = parseCss(read('../../chrome/src/tokens.css'));
const overlayCss = parseCss(read('../../chrome/src/Overlay.css'));
const emptyCss = parseCss(read('../../chrome/src/EmptyFigure.css'));
const marqueeCss = parseCss(read('../../viewer/src/Marquee.css'));
const guidesCss = parseCss(read('../../viewer/src/Guides.css'));

/** The custom properties of a selector outside any media block. */
function rootTokens(rules: ReturnType<typeof parseCss>, selector: string): Record<string, string> {
  return customProperties(
    rules.filter((rule) => rule.media === undefined),
    selector,
  );
}

describe('brand.css agrees with BRAND_TOKENS', () => {
  it("declares the sixteen --ts- tokens on :root with the values of B2's day 0 request and no other", () => {
    const declared = rootTokens(brandCss, ':root');
    const names = Object.keys(declared).map((name) => `--${name}`);
    expect(names.sort()).toEqual(Object.keys(BRAND_TOKENS).sort());
    expect(names).toHaveLength(16);
    expect(BRAND_LAYOUT_MAX_PX).toBe(1023);
    for (const [token, value] of Object.entries(BRAND_TOKENS))
      expect(declared[token.slice(2)], token).toBe(value);
  });

  it('redeclares the narrow values in one media block at 720 px and nothing else', () => {
    const narrow = brandCss.filter((rule) => rule.media !== undefined);
    expect(new Set(narrow.map((rule) => rule.media))).toEqual(
      new Set([`@media (max-width: ${BRAND_NARROW_MAX_PX}px)`]),
    );
    const declared = customProperties(narrow, ':root');
    expect(
      Object.keys(declared)
        .map((n) => `--${n}`)
        .sort(),
    ).toEqual(Object.keys(BRAND_TOKENS_NARROW).sort());
    for (const [token, value] of Object.entries(BRAND_TOKENS_NARROW))
      expect(declared[token.slice(2)], token).toBe(value);
  });

  it('carries no colour, radius or duration of its own (SPEC-4 0.9)', () => {
    for (const rule of brandCss) {
      for (const [property, value] of Object.entries(rule.declarations)) {
        /* no literal colour anywhere: every colour resolves inside the --pt- set or is currentColor */
        expect(value, `${rule.selector} ${property}`).not.toMatch(
          /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i,
        );
        if (property.startsWith('--'))
          expect(property, rule.selector).not.toMatch(/dur|radius|accent/);
        else expect(property, rule.selector).not.toMatch(/border-radius|transition|animation-name/);
      }
    }
  });

  it('sets the two view transition rules of SPEC-4 0.40 to the leaving and entering durations', () => {
    expect(declarationsOf(brandCss, '::view-transition-old(root)')['animation-duration']).toBe(
      'var(--pt-dur-leave)',
    );
    expect(declarationsOf(brandCss, '::view-transition-new(root)')['animation-duration']).toBe(
      'var(--pt-dur-enter)',
    );
  });

  it('draws the mark in currentColor, crisp edges on the 16 px rows alone, and the tile in the host tokens', () => {
    const mark = declarationsOf(brandCss, '.ts-mark');
    expect(mark.fill).toBe('currentColor');
    expect(mark['shape-rendering']).toBeUndefined();
    expect(declarationsOf(brandCss, ".ts-mark[data-form='rows']")['shape-rendering']).toBe(
      'crispEdges',
    );
    expect(declarationsOf(brandCss, '.ts-tile .ts-tile-plate').fill).toBe('var(--pt-paper)');
    expect(declarationsOf(brandCss, '.ts-tile .ts-tile-frame').stroke).toBe('var(--pt-edge)');
    expect(declarationsOf(brandCss, '.ts-tile .ts-tile-mark').fill).toBe('var(--pt-ink)');
  });

  it('sets the lockup at the 22 px word beside the 24 px mark box, a 7 px gap and -0.01em tracking', () => {
    expect(declarationsOf(brandCss, '.ts-brand-lockup').gap).toBe('7px');
    const word = declarationsOf(brandCss, '.ts-brand-lockup-word');
    expect(word['font-size']).toBe('22px');
    expect(word['font-weight']).toBe('500');
    expect(word['letter-spacing']).toBe('-0.01em');
    expect(word['font-feature-settings']).toBe("'cv11', 'ss01'");
    expect(declarationsOf(brandCss, '.ts-brand-lockup-mark').width).toBe('24px');
    expect(declarationsOf(brandCss, '.ts-brand-lockup-mark').height).toBe('24px');
    expect(declarationsOf(brandCss, '.ts-brand-lockup-word').height).toBe('24px');
    /* the gap's arithmetic: half the cap less the T's bearing at the 22 px optical size (72 of
       2048 units) less the square's 0.23 px right of the mark's ink */
    const cap = (1490 / 2048) * 22;
    const placement = markPlacement(24);
    const inkRight = Math.max(...quadXs(markQuadsAt(24, placement.cap, placement.top)));
    const gap = cap / 2 - (72 / 2048) * 22 - (24 - inkRight);
    expect(gap).toBeCloseTo(7, 1);
    expect(Math.round(cap)).toBe(placement.cap);
  });
});

/** Every x of a set of quads. */
function quadXs(quads: ReturnType<typeof markQuads>): number[] {
  return quads.flatMap((quad) => quad.map(([x]) => x));
}

/** Every y of a set of quads. */
function quadYs(quads: ReturnType<typeof markQuads>): number[] {
  return quads.flatMap((quad) => quad.map(([, y]) => y));
}

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

describe('the mark (docs/NEXT.md 4.1.2; the Round 1 sheet)', () => {
  it("is five rectangles at the GT T's weights on a 120 unit cap", () => {
    expect([CAP_TOP, BASELINE, CAP_UNITS]).toEqual([40, 160, 120]);
    expect(CUT).toEqual([96, 104]);
    expect((CUT[0] + CUT[1]) / 2).toBe((CAP_TOP + BASELINE) / 2);
    expect(SKEW).toBeCloseTo(Math.tan((12 * Math.PI) / 180), 12);
    const byName = Object.fromEntries(MARK_RECTS.map((r) => [r.name, r]));
    expect(byName.crossbar).toMatchObject({ x: 22, y: 40, width: 134, height: 30 });
    expect(byName.stem).toMatchObject({ x: 72, y: 40, width: 34, height: 120 });
    expect(byName['top bar']).toMatchObject({ x: 0, y: 40, width: 24, height: 30 });
    expect(byName['middle bar']).toMatchObject({ x: -4, y: 82, width: 64, height: 36 });
    expect(byName['bottom bar']).toMatchObject({ x: 16, y: 130, width: 44, height: 30 });
    /* the middle and bottom bars end 12 units before the stem; the cut leaves two 14 unit lines */
    for (const name of ['middle bar', 'bottom bar'] as const)
      expect(byName.stem!.x - (byName[name]!.x + byName[name]!.width)).toBe(12);
    expect(CUT[0] - byName['middle bar']!.y).toBe(14);
    expect(byName['middle bar']!.y + byName['middle bar']!.height - CUT[1]).toBe(14);
  });

  it('is seven parallelograms, the box 176.58 by 120, the aspect 1.47', () => {
    const quads = markQuads();
    expect(quads).toHaveLength(7);
    for (const quad of quads) {
      /* horizontal top and bottom, both sides slanted by the skew */
      expect(quad[0][1]).toBe(quad[1][1]);
      expect(quad[2][1]).toBe(quad[3][1]);
      const run = quad[0][0] - quad[3][0];
      expect(run / (quad[3][1] - quad[0][1])).toBeCloseTo(SKEW, 12);
    }
    expect(MARK_BOX.width).toBeCloseTo(176.58, 2);
    expect(MARK_BOX.height).toBe(120);
    expect(MARK_ASPECT).toBeCloseTo(1.4715, 4);
    expect(boxOf(quads)).toEqual(MARK_BOX);
  });

  it('commits the path its rectangles build, 242 bytes with the recorded sha256', () => {
    expect(quadPath(markQuads(), 1)).toBe(MARK_PATH);
    expect(MARK_PATH).toHaveLength(242);
    expect(sha256(MARK_PATH)).toBe(MARK_PATH_SHA256);
    expect(MARK_PATH_SHA256).toBe(
      '3e95914b621faf3bee9b73421ac62b264ee384c165346025c09dec99c154190a',
    );
  });

  it('draws 16 px as the one hand drawing: a 12 px cap on rows 2 to 13, columns 0, 1, 14 and 15 clear', () => {
    expect(ROWS16).toHaveLength(16);
    for (const row of ROWS16) {
      expect(row).toHaveLength(16);
      expect(row).toMatch(/^[#.]+$/);
      expect(row[0]).toBe('.');
      expect(row[1]).toBe('.');
      expect(row[14]).toBe('.');
      expect(row[15]).toBe('.');
    }
    for (const y of [0, 1, 8, 14, 15]) expect(ROWS16[y]).toBe('.'.repeat(16));
    expect(ROWS16[2]).toBe('...###########..');
    expect(rowsInk()).toBe(72);
    expect(rowsPath()).toBe(ROWS16_PATH);
    expect(sha256(ROWS16_PATH)).toBe(ROWS16_PATH_SHA256);
  });

  it("hints a 16 px cap the way the sheet's judge drew it: 4, 1, 2, 1, 2, 2 and 4 rows", () => {
    expect(hintedRows(16)).toEqual({
      40: 0,
      70: 4,
      82: 5,
      96: 7,
      104: 8,
      118: 10,
      130: 12,
      160: 16,
    });
    /* the 24 px cap of the 48 px tile keeps the cut on mid cap, two rows */
    expect(hintedRows(24)).toEqual({
      40: 0,
      70: 6,
      82: 8,
      96: 11,
      104: 13,
      118: 16,
      130: 18,
      160: 24,
    });
    expect(() => hintedRows(10)).toThrow(RangeError);
    expect(() => hintedRows(15.5)).toThrow(RangeError);
  });

  it('places every vector size with its horizontal edges on whole rows', () => {
    for (const size of [24, 32, 48, 64, 128, 180, 512]) {
      const placement = markPlacement(size);
      expect(placement.form).toBe('vector');
      expect(placement.hinted).toBe(true);
      expect(placement.cap).toBe(capAt(size));
      const ys = quadYs(markQuadsAt(size, placement.cap, placement.top));
      for (const y of ys) expect(Math.abs(y - Math.round(y))).toBeLessThan(1e-9);
      expect(Math.min(...ys)).toBe(placement.top);
      expect(Math.max(...ys)).toBe(placement.top + placement.cap);
      const xs = quadXs(markQuadsAt(size, placement.cap, placement.top));
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...xs)).toBeLessThanOrEqual(size);
    }
    expect(markPlacement(24)).toMatchObject({ size: 24, cap: 16, top: 4 });
    expect(markPlacement(64)).toMatchObject({ size: 64, cap: 43, top: 11 });
    /* the plain scaled vector stays available for a comparison picture */
    expect(markPlacement(32, { hinted: false }).hinted).toBe(false);
  });

  it('snaps a size to its step: the rows under 24, the 24 px placement under 32, the size itself from 32', () => {
    expect(MARK_STEPS).toEqual({ rows: 16, hinted: 24, vector: 32 });
    expect([8, 16, 20, 23].map(markStep)).toEqual([16, 16, 16, 16]);
    expect([24, 28, 31].map(markStep)).toEqual([24, 24, 24]);
    expect([32, 40, 64, 512].map(markStep)).toEqual([32, 40, 64, 512]);
    expect(() => markStep(0)).toThrow(RangeError);
    expect(markPlacement(20)).toMatchObject({ size: 16, form: 'rows', d: ROWS16_PATH });
  });

  it('names itself alone and stays quiet beside a word; crisp edges on the rows alone', () => {
    const alone = markSvg(16);
    expect(alone).toContain('role="img" aria-label="Turboslide"');
    expect(alone).toContain('<title>Turboslide</title>');
    expect(alone).toContain(`d="${ROWS16_PATH}"`);
    expect(alone).toContain('viewBox="0 0 16 16" width="16" height="16"');
    expect(alone).toContain('shape-rendering="crispEdges"');
    const beside = markSvg(64, { decorative: true });
    expect(beside).toContain('aria-hidden="true"');
    expect(beside).not.toContain('<title>');
    expect(beside).not.toContain('crispEdges');
    expect(beside).toContain('viewBox="0 0 64 64" width="64" height="64"');
    expect(MARK_LABEL).toBe('Turboslide');
  });

  it('prints the rows as six lines of half blocks for the terminal', () => {
    expect(markBlocks()).toEqual([
      ' ███████████',
      ' ▀▀▀▀▀███▀▀▀',
      '▄▄▄▄▄ ███   ',
      '▄▄▄▄ ▄▄▄    ',
      '     ███    ',
      '███ ███     ',
    ]);
  });
});

describe('the tile (SPEC-4 0.4)', () => {
  it('carries the rows at 16 px and the hinted vector at a 16 and a 24 px cap at 32 and 48 px', () => {
    expect(TILE_SIZES[16]).toEqual({ size: 16, frame: 1, form: 'rows', cap: 12, top: 2 });
    expect(TILE_SIZES[32]).toEqual({ size: 32, frame: 1, form: 'vector', cap: 16, top: 8 });
    expect(TILE_SIZES[48]).toEqual({ size: 48, frame: 1, form: 'vector', cap: 24, top: 12 });
    expect(tileMarkPath(TILE_SIZES[16])).toBe(ROWS16_PATH);
    for (const tile of [TILE_SIZES[32], TILE_SIZES[48]]) {
      const quads = markQuadsAt(tile.size, tile.cap, tile.top);
      /* clear of the 1 px frame and its 1 px margin */
      expect(Math.min(...quadXs(quads))).toBeGreaterThan(2);
      expect(Math.max(...quadXs(quads))).toBeLessThan(tile.size - 2);
      expect(tileMarkPath(tile)).toBe(quadPath(quads, 2));
    }
  });

  it('uses the theme colours and the edge composite for the frame, which holds 3:1 on both plates', () => {
    expect(TILE_COLORS.light.plate).toBe(TOKENS.light.paper);
    expect(TILE_COLORS.light.ink).toBe(TOKENS.light.ink);
    expect(TILE_COLORS.dark.plate).toBe(TOKENS.dark.paper);
    expect(TILE_COLORS.dark.ink).toBe(TOKENS.dark.ink);
    expect(contrastRatio(TILE_COLORS.light.frame, TILE_COLORS.light.plate)).toBeGreaterThan(5.8);
    expect(contrastRatio(TILE_COLORS.dark.frame, TILE_COLORS.dark.plate)).toBeGreaterThan(5.6);
    /* Chrome's tab strips (SPEC-4 1.12): the frame reads on both */
    expect(contrastRatio(TILE_COLORS.light.frame, '#dee1e6')).toBeGreaterThan(4.4);
    expect(contrastRatio(TILE_COLORS.dark.frame, '#202124')).toBeGreaterThan(4.5);
  });
});

describe('contrast (SPEC-4 1.12)', () => {
  it('computes the WCAG ratios the accessibility record states', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 10);
    expect(relativeLuminance('#000000')).toBe(0);
    expect(contrastRatio(TOKENS.light.ink, TOKENS.light.paper)).toBeCloseTo(20.14, 1);
    expect(contrastRatio(TOKENS.dark.ink, TOKENS.dark.paper)).toBeCloseTo(17.97, 1);
    expect(contrastRatio(TOKENS.light['ink-2'], TOKENS.light.paper)).toBeCloseTo(10.88, 1);
    expect(contrastRatio(TOKENS.dark['ink-2'], TOKENS.dark.paper)).toBeCloseTo(10.59, 1);
    expect(contrastRatio(TOKENS.light.titanium, TOKENS.light.paper)).toBeCloseTo(3.25, 1);
    expect(contrastRatio(TOKENS.dark.titanium, TOKENS.dark.paper)).toBeCloseTo(6.2, 1);
  });
});

describe('the selection colour (the orchestrator’s ruling 1; Kevin’s directive d)', () => {
  const light = rootTokens(tokensCss, ':root');
  const dark = rootTokens(tokensCss, ":root[data-theme='dark']");

  /* the effective value in an appearance: the dark block's own declaration, else the :root one it inherits */
  const inDark = (name: string): string | undefined => dark[name] ?? light[name];

  it('is declared in tokens.css for both appearances with the values brand.ts records', () => {
    /* GT blue in both appearances with white chip text (docs/NEXT.md question 3; B3b's push 10) */
    expect(SELECTION_COLORS.light.select).toBe('#2f5ce0');
    expect(SELECTION_COLORS.dark.select).toBe('#2f5ce0');
    expect(SELECTION_COLORS.light.text).toBe('#ffffff');
    expect(SELECTION_COLORS.dark.text).toBe('#ffffff');
    expect(light['pt-select']).toBe(SELECTION_COLORS.light.select);
    expect(light['pt-select-text']).toBe(SELECTION_COLORS.light.text);
    expect(light['pt-guide']).toBe(SELECTION_COLORS.light.guide);
    expect(inDark('pt-select')).toBe(SELECTION_COLORS.dark.select);
    expect(inDark('pt-select-text')).toBe(SELECTION_COLORS.dark.text);
    expect(inDark('pt-guide')).toBe(SELECTION_COLORS.dark.guide);
  });

  it('holds 3:1 against both the paper and the ink of its appearance, and 4.5:1 under the chip text', () => {
    for (const theme of ['light', 'dark'] as const) {
      const { select, text, guide } = SELECTION_COLORS[theme];
      const { paper, ink } = TOKENS[theme];
      expect(contrastRatio(select, paper), `${theme} select on paper`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(select, ink), `${theme} select on ink`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(guide, paper), `${theme} guide on paper`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(guide, ink), `${theme} guide on ink`).toBeGreaterThanOrEqual(3);
      /* the chip: --pt-select-text on the selection colour (SC 1.4.3 for 13 px text) */
      expect(contrastRatio(text, select), `${theme} chip text`).toBeGreaterThanOrEqual(4.5);
    }
    /* the numbers tokens.css states beside the values */
    expect(contrastRatio('#2f5ce0', '#ffffff')).toBeCloseTo(5.63, 2);
    expect(contrastRatio('#2f5ce0', '#070707')).toBeCloseTo(3.58, 2);
    expect(contrastRatio('#2f5ce0', '#f2f2f0')).toBeCloseTo(5.03, 2);
    expect(contrastRatio('#d6336c', '#ffffff')).toBeCloseTo(4.62, 2);
    expect(contrastRatio('#d6336c', '#070707')).toBeCloseTo(4.36, 2);
    expect(contrastRatio('#f0397a', '#070707')).toBeCloseTo(5.34, 2);
    expect(contrastRatio('#f0397a', '#ffffff')).toBeCloseTo(3.77, 2);
  });

  it('is what the selection ring, the handles, the marquee, the hover outline, the crop frame, the group box and the chip resolve to', () => {
    const select = 'var(--pt-select)';
    expect(declarationsOf(overlayCss, '.ts-select').border).toBe(`1px solid ${select}`);
    expect(declarationsOf(overlayCss, '.ts-select.is-extra')['border-color']).toBe(select);
    expect(declarationsOf(overlayCss, '.ts-hover').border).toBe(`1px solid ${select}`);
    expect(declarationsOf(overlayCss, '.ts-group').border).toBe(`1px solid ${select}`);
    expect(declarationsOf(overlayCss, '.ts-select-chip').background).toBe(select);
    expect(declarationsOf(overlayCss, '.ts-select-chip').color).toBe('var(--pt-select-text)');
    expect(declarationsOf(overlayCss, ".ts-handle[data-kind='free-resize']::before").border).toBe(
      `1px solid ${select}`,
    );
    expect(
      declarationsOf(overlayCss, ".ts-handle[data-kind='free-resize'].is-active::before")
        .background,
    ).toBe(select);
    expect(declarationsOf(overlayCss, ".ts-handle[data-kind='free-rotate']::before").border).toBe(
      `1px solid ${select}`,
    );
    expect(
      declarationsOf(overlayCss, ".ts-handle[data-kind='free-rotate']::after").background,
    ).toBe(select);
    expect(declarationsOf(overlayCss, ".ts-handle[data-kind='line-end']::before").border).toBe(
      `1px solid ${select}`,
    );
    expect(declarationsOf(overlayCss, '.ts-crop-frame').border).toBe(`1px solid ${select}`);
    expect(declarationsOf(overlayCss, ".ts-handle[data-kind='crop-edge']::before").background).toBe(
      select,
    );
    expect(
      declarationsOf(overlayCss, ".ts-handle.is-active[data-shape='square']::before")[
        'border-color'
      ],
    ).toBe(select);
    expect(declarationsOf(marqueeCss, '.ts-marquee').border).toBe(`1px solid ${select}`);
    expect(declarationsOf(guidesCss, '.ts-guide').background).toBe('var(--pt-guide)');
    /* the drop line, the readout and the lint boxes stay ink and titanium */
    expect(declarationsOf(overlayCss, '.ts-drop')['border-top']).toBe('1px solid var(--pt-ink)');
    expect(declarationsOf(overlayCss, '.ts-readout').background).toBe('var(--pt-ink)');
    expect(declarationsOf(overlayCss, '.ts-lint-box').border).toBe('1px solid var(--pt-titanium)');
  });

  it('leaves every other --pt- token of tokens.css with its name and value (SPEC-4 0.9)', () => {
    for (const name of [
      'paper',
      'ink',
      'ink-2',
      'titanium',
      'hair',
      'hair-soft',
      'plate',
      'edge',
    ] as const) {
      /* the chrome's light titanium reads #6f747d since the product round (docs/archive/rounds/PRODUCT.md 3.1:
         4.7 to 1 on paper for the save words, the menu keys and the filmstrip numbers); the
         sheet's titanium of tokens.ts is the deck grammar's and stays */
      if (name === 'titanium') expect(light[`pt-${name}`]).toBe('#6f747d');
      else if (name === 'plate') expect(light[`pt-${name}`]).toBe('rgba(7, 7, 7, 0.06)');
      else expect(light[`pt-${name}`]).toBe(TOKENS.light[name]);
      /* the hover ground reads a step darker in both appearances since the product round (3.1) */
      if (name === 'plate') expect(dark[`pt-${name}`]).toBe('rgba(242, 242, 240, 0.08)');
      else expect(dark[`pt-${name}`]).toBe(TOKENS.dark[name]);
    }
    /* the dark remap gains exactly the names below and nothing else that is not a colour of
       tokens.ts: the two of round four (the selection colour and the guide), and the three of the
       return round (docs/archive/rounds/RETURN.md 4.1, 4.2 item 3): the line and the two grounds drawn over the
       solid ink of the Slideshow split button, each a paper tint over ink with no colour */
    expect(
      Object.keys(dark).filter((name) => !TOKENS.dark[name.slice(3) as keyof typeof TOKENS.dark]),
    ).toEqual([
      /* the product round's two state tokens (docs/archive/rounds/PRODUCT.md 3.1): the disabled ink and the field boundary */
      'pt-disabled',
      'pt-field',
      'pt-hair-on-ink',
      'pt-plate-on-ink',
      'pt-plate-on-ink-open',
      /* the status hues per theme (docs/NEXT.md 4.1.3 item 14; Round 1 push B3b#10) */
      'pt-status-done',
      'pt-status-open',
      'pt-status-refused',
      'pt-select',
      'pt-guide',
    ]);
    for (const name of [
      'pt-hair-on-ink',
      'pt-plate-on-ink',
      'pt-plate-on-ink-open',
      'pt-select',
      'pt-guide',
    ])
      expect(Object.keys(light), name).toContain(name);
    /* the paper tints over ink (RETURN.md 1 rule 6): white over the light ink, the dark paper over
       the dark ink, at the alphas the token file's comment measures */
    expect(light['pt-hair-on-ink']).toBe('rgba(255, 255, 255, 0.26)');
    expect(dark['pt-hair-on-ink']).toBe('rgba(7, 7, 7, 0.26)');
    expect(light['pt-plate-on-ink']).toBe('rgba(255, 255, 255, 0.16)');
    expect(dark['pt-plate-on-ink']).toBe('rgba(7, 7, 7, 0.16)');
    expect(light['pt-plate-on-ink-open']).toBe('rgba(255, 255, 255, 0.24)');
    expect(dark['pt-plate-on-ink-open']).toBe('rgba(7, 7, 7, 0.24)');
  });
});

describe('site.ts (SPEC-4 1.4, 1.6)', () => {
  it('states the description, the alt text and the manifest with start_url /home and one purpose per icon', () => {
    /* the polish round (docs/archive/rounds/POLISH.md 3.6): the hero's lead, shared by the head, the manifest and the card */
    expect(SITE.description).toBe(
      'Turboslide is a slides editor in the browser. It has menus and keyboard shortcuts for editing, arranging and presenting. No account is needed.',
    );
    expect(SITE.description).not.toMatch(/—|!/);
    /* the card of docs/archive/rounds/POLISH.md 3.6: the lead's first sentence and the address on the plate */
    expect(SITE.imageAlt).toBe(
      "The Turboslide mark and name with the sentence Turboslide is a slides editor in the browser, the address www.turboslide.com and the picture's credit, on a plate beside NASA's Blue Marble as a two tone dither",
    );
    expect(SITE.manifest.start_url).toBe('/home');
    expect(SITE.manifest.description).toBe(SITE.description);
    /* the paper colours (docs/NEXT.md 4.1.3 item 3; the row decks.manifest.paper) */
    expect(SITE.manifest.theme_color).toBe('#ffffff');
    expect(SITE.manifest.background_color).toBe('#ffffff');
    expect(SITE.manifest.icons).toHaveLength(5);
    const purposes = SITE.manifest.icons.map((icon) => icon.purpose);
    expect(purposes.filter((p) => p === 'maskable')).toHaveLength(2);
    expect(purposes.filter((p) => p === 'monochrome')).toHaveLength(1);
    expect(purposes.filter((p) => p === undefined)).toHaveLength(2);
    for (const icon of SITE.manifest.icons) expect(icon.src.startsWith('/icons/')).toBe(true);
  });

  it('resolves the origin from the environment, the request, then production', () => {
    const before = process.env.TURBOSLIDE_PUBLIC_ORIGIN;
    delete process.env.TURBOSLIDE_PUBLIC_ORIGIN;
    try {
      /* docs/archive/rounds/POLISH.md section 0 item 3: the production origin is the domain */
      expect(SITE.productionOrigin).toBe('https://www.turboslide.com');
      expect(SITE.origin()).toBe('https://www.turboslide.com');
      expect(SITE.origin('https://preview.example.com/')).toBe('https://preview.example.com');
      process.env.TURBOSLIDE_PUBLIC_ORIGIN = 'https://slides.example.org/';
      expect(SITE.origin('https://preview.example.com')).toBe('https://slides.example.org');
    } finally {
      if (before === undefined) delete process.env.TURBOSLIDE_PUBLIC_ORIGIN;
      else process.env.TURBOSLIDE_PUBLIC_ORIGIN = before;
    }
  });

  it('lists each mood picture with its credit, its licence and its source, and its twins under /brand at 1600 by 900 under 200 KB', () => {
    const repo = fileURLToPath(new URL('../../..', import.meta.url));
    /* the SOF0 to SOF2 frame header of a JPEG: the height and the width after the marker's length and precision */
    const jpegSize = (bytes: Uint8Array): { width: number; height: number } => {
      let i = 2;
      while (i < bytes.length) {
        const marker = bytes[i + 1] ?? 0;
        const length = ((bytes[i + 2] ?? 0) << 8) | (bytes[i + 3] ?? 0);
        if (marker >= 0xc0 && marker <= 0xc2)
          return {
            height: ((bytes[i + 5] ?? 0) << 8) | (bytes[i + 6] ?? 0),
            width: ((bytes[i + 7] ?? 0) << 8) | (bytes[i + 8] ?? 0),
          };
        i += 2 + length;
      }
      throw new Error('no frame header');
    };
    expect(Object.keys(SITE.mood)).toEqual(['earth']);
    for (const mood of Object.values(SITE.mood)) {
      expect(mood.credit).toMatch(/public domain|CC0|CC BY/);
      expect(mood.license.length).toBeGreaterThan(0);
      expect(mood.source.startsWith('https://')).toBe(true);
      for (const appearance of ['dark', 'light'] as const) {
        const file = `${repo}/apps/studio/public${mood[appearance]}`;
        expect(existsSync(file), file).toBe(true);
        const bytes = new Uint8Array(readFileSync(file));
        expect(bytes.length, file).toBeLessThan(200_000);
        expect(jpegSize(bytes), file).toEqual({ width: 1600, height: 900 });
        expect(existsSync(`${repo}/${mood.from}-${appearance}.jpg`)).toBe(true);
      }
    }
  });

  it('lists the robots rules of SPEC-4 1.5 step 5', () => {
    expect(SITE.robots.allow).toEqual(['/og/']);
    expect(SITE.robots.disallow).toEqual(['/new', '/decks/trash', '/print/', '/edit/']);
  });
});

describe('the README head and the brand record (docs/NEXT.md 4.1.3 items 7 and 8, ranks 26 and 28)', () => {
  const repo = fileURLToPath(new URL('../../..', import.meta.url));
  const readme = readFileSync(`${repo}/README.md`, 'utf8');
  const head = readme.split('\n').slice(0, 20).join('\n');

  it('opens on the lockup pair, the www link and no row id in its first 20 lines', () => {
    expect(head).toContain('docs/readme/brand/lockup-dark.png');
    expect(head).toContain('docs/readme/brand/lockup-light.png');
    for (const file of ['lockup-dark.png', 'lockup-light.png'])
      expect(existsSync(`${repo}/docs/readme/brand/${file}`), file).toBe(true);
    expect(head).toContain('https://www.turboslide.com');
    expect(head).not.toContain('turboslide.vercel.app');
    /* a matrix row id is three or more dotted lower case words, outside a link or a path */
    const prose = head
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\]\([^)]*\)/g, ']')
      .replace(/"[^"]*"/g, '""');
    expect(prose).not.toMatch(/\b[a-z][a-z0-9-]*(\.[a-z0-9-]+){2,}\b/);
    expect(head).not.toContain('<!-- what-works:begin -->');
  });

  it('states the action count facts.json carries', () => {
    const facts = JSON.parse(readFileSync(`${repo}/packages/theme/brand/facts.json`, 'utf8')) as {
      actions: { count: number };
    };
    const stated = /run the same (\d+) actions/.exec(head)?.[1];
    expect(Number(stated)).toBe(facts.actions.count);
  });

  it('keeps docs/brand.md on the www address', () => {
    const record = readFileSync(`${repo}/docs/brand.md`, 'utf8');
    expect(record.match(/turboslide\.vercel\.app/g) ?? []).toHaveLength(0);
  });
});

describe('EmptyFigure.css reads the twins site.ts names', () => {
  it('crops the figure and the notfound twins at 1:1 in a --pt-edge frame, light by default and dark under the theme attribute', () => {
    const frame = declarationsOf(emptyCss, '.ts-empty-fig');
    expect(frame.width).toBe('320px');
    expect(frame.height).toBe('180px');
    expect(frame.border).toBe('1px solid var(--pt-edge)');
    expect(frame['background-size']).toBe('1600px 900px');
    expect(frame['image-rendering']).toBe('pixelated');
    const url = (selector: string): string =>
      /url\('([^']+)'\)/.exec(declarationsOf(emptyCss, selector)['background-image'] ?? '')?.[1] ??
      '';
    expect(url(".ts-empty-fig[data-figure='figure']")).toBe(TWIN_PATHS.figure.light);
    expect(url(".ts-empty-fig[data-figure='notfound']")).toBe(TWIN_PATHS.notfound.light);
    expect(url(":root[data-theme='dark'] .ts-empty-fig[data-figure='figure']")).toBe(
      TWIN_PATHS.figure.dark,
    );
    expect(url(":root[data-theme='dark'] .ts-empty-fig[data-figure='notfound']")).toBe(
      TWIN_PATHS.notfound.dark,
    );
  });
});

// ---------------------------------------------------------------------------------------------
// facts.json (SPEC-4 0.25, 6.4): the counts the /home page and the README state, against the tree.

const REPO = fileURLToPath(new URL('../../..', import.meta.url));

type Facts = {
  actions: { count: number; source: string };
  mcpTools: { count: number; source: string };
  httpPaths: { count: number; source: string };
  layouts: { count: number; source: string };
  shapePresets: { count: number; source: string };
  materials: { count: number; source: string };
  checkSteps: { count: number; source: string };
  parityRows: {
    pass: number;
    fail: number;
    skip: number;
    total: number;
    source: string;
    date: string;
  };
  licence: { name: string; source: string };
  export: { worstPageMismatchPercent: number; source: string };
  measured: {
    source: string;
    date: string;
    profile: string;
    base: string;
    rows: { name: string; value: number | null; unit: string }[];
  };
};

const facts = JSON.parse(read('../brand/facts.json')) as Facts;

describe('facts.json (SPEC-4 0.25)', () => {
  it('counts the actions, the layouts and the shape presets the schema exports', () => {
    expect(facts.actions.count).toBe(ACTION_IDS.length);
    expect(facts.layouts.count).toBe(LAYOUTS.length);
    expect(facts.shapePresets.count).toBe(SHAPE_PRESETS.length);
  });

  it('counts the MCP tools and the HTTP paths of the generated contracts', () => {
    const tools = JSON.parse(
      readFileSync(`${REPO}/packages/agent/generated/mcp-tools.json`, 'utf8'),
    ) as { tools: unknown[] };
    const openapi = JSON.parse(
      readFileSync(`${REPO}/packages/agent/generated/openapi.json`, 'utf8'),
    ) as { paths: Record<string, unknown> };
    const manifest = JSON.parse(
      readFileSync(`${REPO}/packages/agent/generated/manifest.json`, 'utf8'),
    ) as { actionCount: number };
    expect(facts.mcpTools.count).toBe(tools.tools.length);
    expect(facts.httpPaths.count).toBe(Object.keys(openapi.paths).length);
    expect(manifest.actionCount).toBe(facts.actions.count);
  });

  it('counts the check steps `node scripts/check.mjs --list` prints', () => {
    const run = spawnSync(process.execPath, [`${REPO}/scripts/check.mjs`, '--list'], {
      encoding: 'utf8',
    });
    expect(run.status).toBe(0);
    const steps = run.stdout.split('\n').filter((line) => /^\s*\d+\s/.test(line)).length;
    expect(facts.checkSteps.count).toBe(steps);
  });

  it('names a source and a date for every measured number and the parity rows, and the sources exist', () => {
    expect(facts.materials.source).toContain('packages/materials/src/catalog.ts');
    expect(facts.materials.count).toBeGreaterThan(0);
    expect(facts.licence).toEqual({ name: 'MIT', source: 'LICENSE' });
    expect(readFileSync(`${REPO}/LICENSE`, 'utf8').startsWith('MIT License')).toBe(true);
    expect(facts.export.worstPageMismatchPercent).toBe(0.003);
    expect(facts.export.source).toContain('docs/archive/status/HOSTED-STATUS.md');
    expect(facts.parityRows.total).toBe(
      facts.parityRows.pass + facts.parityRows.fail + facts.parityRows.skip,
    );
    expect(facts.parityRows.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(existsSync(`${REPO}/${facts.parityRows.source}`)).toBe(true);
    expect(facts.measured.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(facts.measured.profile).toBe('deployment');
    /* the numbers were measured on the deployment that served main when the domain was two
       ship rounds behind it (docs/archive/rounds/POLISH.md section 0); either origin is the production build's */
    expect([SITE.productionOrigin, 'https://turboslide.vercel.app']).toContain(facts.measured.base);
    expect(existsSync(`${REPO}/${facts.measured.source}`)).toBe(true);
    expect(facts.measured.rows.length).toBeGreaterThan(50);
    for (const row of facts.measured.rows) {
      expect(typeof row.name).toBe('string');
      expect(row.value === null || typeof row.value === 'number').toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// The twins (SPEC-4 0.7, 0.12): committed captures with their recipe; the palette and the ink
// sums are read from the PNG bytes here (the PLTE chunk and the scanlines), so a reversed light
// twin (P1 shipped one once) fails before the build check runs.

const PUBLIC = `${REPO}/apps/studio/public`;

/** A one bit indexed PNG's palette and its lit share, from the bytes alone (zlib through node). */
function readTwin(path: string): {
  width: number;
  height: number;
  palette: string[];
  litShare: number;
} {
  const bytes = readFileSync(path);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  expect(bytes[24], `${path} bit depth`).toBe(1);
  expect(bytes[25], `${path} colour type`).toBe(3);
  const palette: string[] = [];
  const idat: Buffer[] = [];
  let at = 8;
  while (at < bytes.length) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString('latin1', at + 4, at + 8);
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'PLTE')
      for (let i = 0; i < body.length; i += 3)
        palette.push(`#${body.subarray(i, i + 3).toString('hex')}`);
    if (type === 'IDAT') idat.push(Buffer.from(body));
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = Math.ceil(width / 8) + 1;
  let lit = 0;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1)
      if (((raw[y * stride + 1 + (x >> 3)] ?? 0) >> (7 - (x & 7))) & 1) lit += 1;
  return { width, height, palette, litShare: lit / (width * height) };
}

describe('the twins (SPEC-4 0.12)', () => {
  const recipe = JSON.parse(read('../brand/hero.recipe.json')) as {
    renderer: string;
    frames: { anchor: number }[];
    chosen: Record<'hero' | 'figure' | 'notfound', { anchor: number }>;
    scan: { fromMs: number; toMs: number; stepMs: number };
  };

  it('exist for the hero, the figure, the Not found page and the card screen, in both appearances', () => {
    for (const pair of Object.values(TWIN_PATHS))
      for (const path of [pair.dark, pair.light])
        expect(existsSync(`${PUBLIC}${path}`), path).toBe(true);
  });

  it('hold the theme palette: #070707 with #f2f2f0 on the dark twin, #070707 with #ffffff on the light one', () => {
    for (const [name, pair] of Object.entries(TWIN_PATHS)) {
      const dark = readTwin(`${PUBLIC}${pair.dark}`);
      const light = readTwin(`${PUBLIC}${pair.light}`);
      expect([...dark.palette].sort(), `${name} dark`).toEqual(['#070707', '#f2f2f0']);
      expect([...light.palette].sort(), `${name} light`).toEqual(['#070707', '#ffffff']);
      const size = name === 'ogScreen' ? [1200, 630] : [1600, 900];
      expect([dark.width, dark.height], name).toEqual(size);
      expect([light.width, light.height], name).toEqual(size);
      /* the light twin is invertBits of the dark one: the lit shares sum to one (0.12) */
      expect(dark.litShare + light.litShare, name).toBeCloseTo(1, 9);
      /* a picture, not a blank sheet (the pipeline's own warning thresholds) */
      expect(dark.litShare).toBeGreaterThan(0.02);
      expect(dark.litShare).toBeLessThan(0.98);
    }
  });

  it('records the scan of 0.7 in hero.recipe.json: 0 to 10 s in 500 ms steps, the chosen anchors among the frames, the renderer string', () => {
    expect(recipe.scan).toMatchObject({ fromMs: 0, toMs: 10_000, stepMs: 500 });
    expect(recipe.frames).toHaveLength(21);
    for (const role of ['hero', 'figure', 'notfound'] as const)
      expect(
        recipe.frames.some((f) => f.anchor === recipe.chosen[role].anchor),
        role,
      ).toBe(true);
    expect(
      new Set([
        recipe.chosen.hero.anchor,
        recipe.chosen.figure.anchor,
        recipe.chosen.notfound.anchor,
      ]).size,
    ).toBe(3);
    expect(recipe.renderer).toMatch(/ANGLE|SwiftShader/);
  });
});
