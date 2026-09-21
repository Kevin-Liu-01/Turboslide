// The identity's parity test (gslides-parity SPEC-4 0.8, 0.10, 6.4; MILESTONES-4 B1 day 1):
// brand.css and brand.ts agree on the eleven tokens the way tokens.test.ts pins the sheet; the
// mark's geometry is pinned (the solid form, the fixed path, the recorded cell counts, the tile);
// the selection colour of the orchestrator's ruling 1 holds its contrast and is what the
// selection surfaces read; EmptyFigure.css names the twins site.ts exports; the counts of
// facts.json (SPEC-4 0.25, written by `build-brand.ts --facts`) equal the tree, and the twins the
// build captured hold the theme palette with their ink fractions summing to one (0.12).
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
  BRAND_NARROW_MAX_PX,
  BRAND_TOKENS,
  BRAND_TOKENS_NARROW,
  CELL_THRESHOLD_PX,
  D_MAX,
  FIELD_END,
  MARK_LABEL,
  SELECTION_COLORS,
  TILE_COLORS,
  TILE_SIZES,
  WINDOW,
  cellRects,
  cellRuns,
  contrastRatio,
  field,
  isBody,
  litCount,
  markBits,
  markBlocks,
  markGrid,
  markPath,
  markSvg,
  relativeLuminance,
  solidBits,
  solidUnits,
  solidWindow,
  tileMarkPath,
  windowDistance,
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
  it('declares the eleven --ts- tokens on :root with the values of SPEC-4 1.8 and no other', () => {
    const declared = rootTokens(brandCss, ':root');
    const names = Object.keys(declared).map((name) => `--${name}`);
    expect(names.sort()).toEqual(Object.keys(BRAND_TOKENS).sort());
    expect(names).toHaveLength(11);
    for (const [token, value] of Object.entries(BRAND_TOKENS))
      expect(declared[token.slice(2)], token).toBe(value);
  });

  it('redeclares the narrow values in one media block at 760 px and nothing else', () => {
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

  it('draws the mark in currentColor with crisp edges and the tile in the host tokens', () => {
    const mark = declarationsOf(brandCss, '.ts-mark');
    expect(mark.fill).toBe('currentColor');
    expect(mark['shape-rendering']).toBe('crispEdges');
    expect(declarationsOf(brandCss, '.ts-tile .ts-tile-plate').fill).toBe('var(--pt-paper)');
    expect(declarationsOf(brandCss, '.ts-tile .ts-tile-frame').stroke).toBe('var(--pt-edge)');
    expect(declarationsOf(brandCss, '.ts-tile .ts-tile-mark').fill).toBe('var(--pt-ink)');
  });

  it('sets the app bar lockup at 22 px type with a 10 px gap and the -0.01em tracking of R01 6.2', () => {
    expect(declarationsOf(brandCss, '.ts-brand-lockup').gap).toBe('10px');
    const word = declarationsOf(brandCss, '.ts-brand-lockup-word');
    expect(word['font-size']).toBe('22px');
    expect(word['font-weight']).toBe('500');
    expect(word['letter-spacing']).toBe('-0.01em');
    expect(word['font-feature-settings']).toBe("'cv11', 'ss01'");
    expect(declarationsOf(brandCss, '.ts-brand-lockup-mark .ts-mark').width).toBe('16px');
  });
});

describe('the mark geometry (SPEC-4 1.1)', () => {
  it('cuts the window at columns 1 to 4 and rows 4 to 6 of the 8 by 8 grid', () => {
    expect(WINDOW).toEqual([1, 5, 4, 7]);
    expect(isBody(0, 5)).toBe(true);
    expect(isBody(1, 4)).toBe(false);
    expect(isBody(4, 6)).toBe(false);
    expect(isBody(5, 6)).toBe(true);
    expect(isBody(1, 7)).toBe(true);
  });

  it('runs the field from 1 at the window to 0.25 at the far corner', () => {
    expect(FIELD_END).toBe(0.25);
    expect(D_MAX).toBeCloseTo(0.625, 10);
    expect(windowDistance(0.3, 0.6)).toBe(0);
    expect(field(0.125, 0.5)).toBe(1);
    expect(field(1, 0)).toBeCloseTo(0.25, 10);
    expect(field(0, 0)).toBeGreaterThan(0.25);
  });

  it('is the solid form at N = 8: 52 of 64 cells, the 16 unit path covering 208 of 256 units', () => {
    const solid = markBits(8);
    expect(solid.width).toBe(8);
    expect(litCount(solid)).toBe(52);
    expect(solidUnits()).toBe(208);
    expect(litCount(solidBits(16))).toBe(208);
    for (let y = 0; y < 8; y += 1)
      for (let x = 0; x < 8; x += 1) expect(solid.bits[y * 8 + x]).toBe(isBody(x, y) ? 1 : 0);
  });

  it('pins the cell counts the icon set draws, so a change to the field or the screen is a test failure', () => {
    expect(litCount(markBits(16))).toBe(151);
    expect(litCount(markBits(24))).toBe(331);
    expect(litCount(markBits(32))).toBe(610);
    expect(litCount(markBits(40))).toBe(946);
    expect(litCount(markBits(56))).toBe(1841);
    expect(litCount(markBits(64))).toBe(2400);
    /* the window is never lit at any N */
    for (const n of [16, 32, 64]) {
      const image = markBits(n);
      const k = n / 8;
      for (let y = 0; y < n; y += 1)
        for (let x = 0; x < n; x += 1)
          if (!isBody(Math.floor(x / k), Math.floor(y / k))) expect(image.bits[y * n + x]).toBe(0);
    }
  });

  it('refuses a size that is not a multiple of 8', () => {
    expect(() => markBits(12)).toThrow(RangeError);
    expect(() => markBits(0)).toThrow(RangeError);
  });

  it('draws the fixed even odd path', () => {
    expect(markPath(2)).toBe('M0 0h16v16H0z M2 8h8v6H2z');
    expect(markPath()).toBe(markPath(2));
    expect(markPath(1)).toBe('M0 0h8v8H0z M1 4h4v3H1z');
  });

  it('writes row runs so the 64 cell mark is a few hundred rectangles, never one per cell', () => {
    const runs = cellRuns(markBits(64));
    expect(runs.length).toBeGreaterThan(200);
    expect(runs.length).toBeLessThan(1400);
    expect(runs.reduce((n, run) => n + run.width, 0)).toBe(2400);
    expect(cellRects(markBits(8))).toContain('<rect x="0" y="0" width="8" height="1"/>');
    expect(cellRects(markBits(8))).toContain('<rect x="0" y="4" width="1" height="1"/>');
  });

  it('is solid below 64 px and cellular from it, on the size table of 1.1', () => {
    expect(CELL_THRESHOLD_PX).toBe(64);
    expect(markGrid(16)).toEqual({ n: 8, cell: 2 });
    expect(markGrid(24)).toEqual({ n: 8, cell: 3 });
    expect(markGrid(48)).toEqual({ n: 8, cell: 6 });
    expect(markGrid(64)).toEqual({ n: 32, cell: 2 });
    expect(markGrid(128)).toEqual({ n: 32, cell: 4 });
    expect(markGrid(160)).toEqual({ n: 40, cell: 4 });
    expect(markGrid(256)).toEqual({ n: 64, cell: 4 });
    expect(markGrid(448)).toEqual({ n: 56, cell: 8 });
    expect(markGrid(512)).toEqual({ n: 64, cell: 8 });
    expect(() => markGrid(100)).toThrow(RangeError);
  });

  it('names itself alone and stays quiet beside a word', () => {
    const alone = markSvg(8, 16);
    expect(alone).toContain('role="img" aria-label="Turboslide"');
    expect(alone).toContain('<title>Turboslide</title>');
    expect(alone).toContain(`d="${markPath(2)}"`);
    expect(alone).toContain('viewBox="0 0 16 16" width="16" height="16"');
    const beside = markSvg(32, 64, { decorative: true });
    expect(beside).toContain('aria-hidden="true"');
    expect(beside).not.toContain('<title>');
    expect(beside).toContain('viewBox="0 0 32 32" width="64" height="64"');
    expect(MARK_LABEL).toBe('Turboslide');
  });

  it('prints the solid form as four lines of block characters', () => {
    const lines = markBlocks(8);
    expect(lines).toEqual(['████████', '████████', '█    ███', '█▄▄▄▄███']);
    expect(markBlocks(16)).toHaveLength(8);
  });
});

describe('the tile (SPEC-4 0.4)', () => {
  it('sets the mark inset on the plate with a 1 px frame at 16, 32 and 48', () => {
    expect(TILE_SIZES[16].mark).toEqual({ x: 2, y: 2, size: 12 });
    expect(TILE_SIZES[32].mark).toEqual({ x: 4, y: 4, size: 24 });
    expect(TILE_SIZES[48].mark).toEqual({ x: 4, y: 4, size: 40 });
    expect(tileMarkPath(TILE_SIZES[16])).toBe('M2 2h12v12H2z M4 8h6v4H4z');
    expect(tileMarkPath(TILE_SIZES[32])).toBe('M4 4h24v24H4z M7 16h12v9H7z');
    expect(tileMarkPath(TILE_SIZES[48])).toBe('M4 4h40v40H4z M9 24h20v15H9z');
  });

  it('keeps integer edges at every size but hints the 12 px mark once', () => {
    expect(solidWindow(24)).toEqual([3, 15, 12, 21]);
    expect(solidWindow(40)).toEqual([5, 25, 20, 35]);
    expect(solidWindow(16)).toEqual([2, 10, 8, 14]);
    expect(solidWindow(12)).toEqual([2, 8, 6, 10]);
    expect(() => solidWindow(20)).toThrow(RangeError);
    const hinted = solidBits(12);
    expect(hinted.bits[6 * 12 + 2]).toBe(0);
    expect(hinted.bits[6 * 12 + 1]).toBe(1);
    expect(hinted.bits[10 * 12 + 4]).toBe(1);
    expect(litCount(hinted)).toBe(144 - 24);
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

  it('is declared in tokens.css for both appearances with the values brand.ts records', () => {
    expect(light['pt-select']).toBe(SELECTION_COLORS.light.select);
    expect(light['pt-guide']).toBe(SELECTION_COLORS.light.guide);
    expect(dark['pt-select']).toBe(SELECTION_COLORS.dark.select);
    expect(dark['pt-guide']).toBe(SELECTION_COLORS.dark.guide);
  });

  it('holds 3:1 against both the paper and the ink of its appearance, and 4.5:1 under the chip text', () => {
    for (const theme of ['light', 'dark'] as const) {
      const { select, guide } = SELECTION_COLORS[theme];
      const { paper, ink } = TOKENS[theme];
      expect(contrastRatio(select, paper), `${theme} select on paper`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(select, ink), `${theme} select on ink`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(guide, paper), `${theme} guide on paper`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(guide, ink), `${theme} guide on ink`).toBeGreaterThanOrEqual(3);
      /* the chip: --pt-paper text on the selection colour (SC 1.4.3 for 13 px text) */
      expect(contrastRatio(paper, select), `${theme} chip text`).toBeGreaterThanOrEqual(4.5);
    }
    /* the numbers tokens.css states beside the values */
    expect(contrastRatio('#1a73e8', '#ffffff')).toBeCloseTo(4.51, 2);
    expect(contrastRatio('#1a73e8', '#070707')).toBeCloseTo(4.47, 2);
    expect(contrastRatio('#3d86f0', '#070707')).toBeCloseTo(5.63, 2);
    expect(contrastRatio('#3d86f0', '#ffffff')).toBeCloseTo(3.58, 2);
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
    expect(declarationsOf(overlayCss, '.ts-select-chip').color).toBe('var(--pt-paper)');
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
      /* the chrome's light titanium reads #6f747d since the product round (docs/PRODUCT.md 3.1:
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
       return round (docs/RETURN.md 4.1, 4.2 item 3): the line and the two grounds drawn over the
       solid ink of the Slideshow split button, each a paper tint over ink with no colour */
    expect(
      Object.keys(dark).filter((name) => !TOKENS.dark[name.slice(3) as keyof typeof TOKENS.dark]),
    ).toEqual([
      /* the product round's two state tokens (docs/PRODUCT.md 3.1): the disabled ink and the field boundary */
      'pt-disabled',
      'pt-field',
      'pt-hair-on-ink',
      'pt-plate-on-ink',
      'pt-plate-on-ink-open',
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
    expect(SITE.description).toBe(
      "An agent native slides editor with Google Slides' behaviours, a canvas on every slide and a pixel identical PowerPoint export.",
    );
    expect(SITE.description).not.toMatch(/—|!/);
    expect(SITE.imageAlt).toBe(
      'The Turboslide mark and name on a plate cut from a two tone dithered liquid metal frame',
    );
    expect(SITE.manifest.start_url).toBe('/home');
    expect(SITE.manifest.description).toBe(SITE.description);
    expect(SITE.manifest.theme_color).toBe(SITE.themeColor.dark);
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
      expect(SITE.origin()).toBe('https://turboslide.vercel.app');
      expect(SITE.origin('https://preview.example.com/')).toBe('https://preview.example.com');
      process.env.TURBOSLIDE_PUBLIC_ORIGIN = 'https://slides.example.org/';
      expect(SITE.origin('https://preview.example.com')).toBe('https://slides.example.org');
    } finally {
      if (before === undefined) delete process.env.TURBOSLIDE_PUBLIC_ORIGIN;
      else process.env.TURBOSLIDE_PUBLIC_ORIGIN = before;
    }
  });

  it('lists the robots rules of SPEC-4 1.5 step 5', () => {
    expect(SITE.robots.allow).toEqual(['/og/']);
    expect(SITE.robots.disallow).toEqual(['/new', '/decks/trash', '/print/', '/edit/']);
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
    expect(facts.export.source).toContain('docs/HOSTED-STATUS.md');
    expect(facts.parityRows.total).toBe(
      facts.parityRows.pass + facts.parityRows.fail + facts.parityRows.skip,
    );
    expect(facts.parityRows.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(existsSync(`${REPO}/${facts.parityRows.source}`)).toBe(true);
    expect(facts.measured.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(facts.measured.profile).toBe('deployment');
    expect(facts.measured.base).toBe(SITE.productionOrigin);
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
