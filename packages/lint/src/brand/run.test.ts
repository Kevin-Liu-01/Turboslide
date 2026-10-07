import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import {
  ACCEPTED,
  BRAND_LINT_MODE,
  CODE_SURFACES,
  CSS_RULES,
  OVERRIDES,
  RADIUS_EXCEPTIONS,
  REPORT_RULES,
} from './config.ts';
import type { Acceptance, BrandFinding, BrandRuleId } from './config.ts';
import {
  applyAcceptances,
  formatBrandLint,
  isExcluded,
  isOverridden,
  runBrandLint,
} from './run.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

const finding = (over: Partial<BrandFinding>): BrandFinding => ({
  rule: 'css/radius',
  file: 'packages/chrome/src/TitleRow.css',
  line: 1,
  column: 1,
  message: '',
  text: '.ts-title-share { border-radius: 8px }',
  ...over,
});

describe('the brand lint run', () => {
  test('tests, specs, generated files and build output are never read', () => {
    expect(isExcluded('packages/chrome/src/menus/__tests__/strings.test.ts')).toBe(true);
    expect(isExcluded('apps/studio/e2e/core/chrome.spec.ts')).toBe(true);
    expect(isExcluded('apps/studio/src/routeTree.gen.ts')).toBe(true);
    expect(isExcluded('packages/chrome/src/TitleRow.tsx')).toBe(false);
  });

  test('every override, radius exception and code surface names its reason', () => {
    for (const entry of [...OVERRIDES, ...RADIUS_EXCEPTIONS, ...CODE_SURFACES])
      expect(entry.reason.length, JSON.stringify(entry)).toBeGreaterThan(20);
    expect(
      isOverridden('packages/chrome/src/dialogs/special-characters-data.ts', 'gt-ui/no-em-dash'),
    ).toBe(true);
    expect(
      isOverridden('packages/chrome/src/dialogs/special-characters-data.ts', 'css/radius'),
    ).toBe(false);
  });

  test('an acceptance takes the findings it matches, and one that matches nothing is stale', () => {
    const share: Acceptance = {
      rule: 'css/radius',
      file: 'packages/chrome/src/TitleRow.css',
      match: '.ts-title-share',
      reason: 'test',
      owner: 'B3b',
    };
    const gone: Acceptance = { ...share, match: '.ts-title-gone' };
    const split = applyAcceptances(
      [finding({}), finding({ text: '.ts-title-name-plate { border-radius: 8px }' })],
      [share, gone],
    );
    expect(split.accepted.map((f) => f.text)).toEqual(['.ts-title-share { border-radius: 8px }']);
    expect(split.open.map((f) => f.text)).toEqual(['.ts-title-name-plate { border-radius: 8px }']);
    expect(split.stale).toEqual([gone]);
    const twice = applyAcceptances([finding({}), finding({ line: 9 })], [share]);
    expect(twice.accepted).toHaveLength(1);
    expect(twice.open.map((f) => f.line)).toEqual([9]);
  });

  test('report mode passes with findings; enforce mode fails on an open finding', () => {
    const files = ['packages/viewer/src/BookView.css'];
    const report = runBrandLint({ root: ROOT, mode: 'report', files });
    const enforce = runBrandLint({ root: ROOT, mode: 'enforce', files, accepted: [] });
    expect(report.failed).toBe(false);
    expect(enforce.failed).toBe(enforce.open.length > 0);
    expect(formatBrandLint(report)[0]).toMatch(
      /^brand lint \(report mode\): 0 scripts, 1 stylesheets/,
    );
  });

  test('the design round rules fail an enforce run since DR-D1#5, and report only when listed', () => {
    const round = [
      'css/chrome-alternates',
      'css/no-shadow',
      'css/numerals',
      'css/scrollbar',
      'css/z-index',
    ] as const;
    for (const rule of round) expect(CSS_RULES).toContain(rule);
    expect(REPORT_RULES).toEqual([]);
    expect(RADIUS_EXCEPTIONS).toEqual([]);
    // 0d75ab90 is the tree the design round was cut from: Menu.css and Dialog.css draw the old
    // z-index values, the dialog's drop shadow, tabular figures by hand and the alternates
    const files = ['packages/chrome/src/Menu.css', 'packages/chrome/src/Dialog.css'];
    const enforced = runBrandLint({ root: ROOT, mode: 'enforce', ref: '0d75ab90', files });
    expect(enforced.reported).toEqual([]);
    expect(new Set(enforced.open.map((f) => f.rule))).toEqual(
      new Set(['css/z-index', 'css/no-shadow', 'css/numerals', 'css/chrome-alternates']),
    );
    expect(enforced.failed).toBe(true);
    expect(
      formatBrandLint(enforced).some((line) => line.startsWith('reported, never failing')),
    ).toBe(false);
    /* the rules as they ran from DR-D1#1 to DR-D1#5: the same findings reported apart, none open */
    const reported = runBrandLint({
      root: ROOT,
      mode: 'enforce',
      ref: '0d75ab90',
      files,
      reportOnly: [...round],
    });
    expect(reported.reported.length).toBe(
      enforced.open.filter((f) => (round as readonly string[]).includes(f.rule)).length,
    );
    expect(reported.open.filter((f) => (round as readonly string[]).includes(f.rule))).toEqual([]);
    expect(
      formatBrandLint(reported).some((line) => line.startsWith('reported, never failing')),
    ).toBe(true);
  });

  test('since DR-D1#5 the three accepted inline z-index lines are weighed, so none is open or stale', () => {
    // the verifier's pass 4 read these three lines as the round's only reported findings; read from
    // the committed tree, each is weighed against its acceptance in config.ts
    const files = [
      'apps/studio/src/components/home/live/paint.ts',
      'apps/studio/src/components/home/live/theme.ts',
      'packages/viewer/src/MaterialMount.tsx',
    ];
    const result = runBrandLint({
      root: ROOT,
      mode: 'enforce',
      ref: 'HEAD',
      files,
      rules: new Set<BrandRuleId>(['css/z-index']),
    });
    expect(result.accepted.map((f) => f.file).sort()).toEqual([...files].sort());
    expect(result.open).toEqual([]);
    expect(result.stale).toEqual([]);
    expect(result.failed).toBe(false);
    const unaccepted = runBrandLint({
      root: ROOT,
      mode: 'enforce',
      ref: 'HEAD',
      files,
      rules: new Set<BrandRuleId>(['css/z-index']),
      accepted: [],
    });
    expect(unaccepted.open.map((f) => f.rule)).toEqual([
      'css/z-index',
      'css/z-index',
      'css/z-index',
    ]);
    expect(unaccepted.failed).toBe(true);
  });

  test("a run on a commit reads git's objects, not the working tree", () => {
    const files = ['packages/viewer/src/BookView.css', 'packages/chrome/src/ToolButton.tsx'];
    const result = runBrandLint({ root: ROOT, mode: 'report', ref: 'HEAD', files });
    expect(result.read).toEqual({ scripts: 1, stylesheets: 1, pictures: 0 });
    expect(result.broken).toEqual([]);
  });

  test('the configured mode is enforce, and every acceptance names its owner and its reason', () => {
    expect(BRAND_LINT_MODE).toBe('enforce');
    for (const a of ACCEPTED) {
      expect(a.owner, JSON.stringify(a)).toMatch(/^(?:B\d[ab]?|the integrator)$/);
      expect(a.reason.length, JSON.stringify(a)).toBeGreaterThan(40);
      expect(a.match.length, JSON.stringify(a)).toBeGreaterThan(3);
    }
  });

  test('a run narrowed to named files weighs only the acceptances of those files', () => {
    // 2108dad4 is the tree B5b#20 read: Toolbar.tsx holds two sentence case labels, TitleRow.tsx
    // none. "Exit fullscreen" is still accepted; "Copy link" left the list when the toolbar's label
    // became "Copy Link" in the design round, so on that tree it is an open finding, not a stale one.
    // (TitleRow.css of that tree fails since DR-D1#5: the round's rules and Slideshow's 8 px.)
    const toolbar = runBrandLint({
      root: ROOT,
      mode: 'enforce',
      ref: '2108dad4',
      files: ['packages/chrome/src/Toolbar.tsx'],
    });
    expect(toolbar.accepted.map((f) => f.rule)).toEqual(['gt-ui/cta-title-case']);
    expect(toolbar.open.map((f) => f.text)).toEqual([expect.stringContaining('Copy link')]);
    expect(toolbar.stale).toEqual([]);
    const clean = runBrandLint({
      root: ROOT,
      mode: 'enforce',
      ref: '2108dad4',
      files: ['packages/chrome/src/TitleRow.tsx'],
    });
    expect(clean.stale).toEqual([]);
    expect(clean.failed).toBe(false);
  });

  test('enforce mode fails on a finding a lane fixed in Round 1 if it came back', () => {
    // ea5fec35 is the tree before B3b#10 squared the thirteen radii and dropped the book view's
    // smooth scroll; read in enforce mode with today's acceptances, those findings are open, and
    // since DR-D1#5 so is Slideshow's 8 px, the named exception of those days. The design round's
    // five rules also read that tree's old z-index, figures and alternates; they are left out here
    const before = runBrandLint({
      root: ROOT,
      mode: 'enforce',
      ref: 'ea5fec35',
      files: ['packages/chrome/src/TitleRow.css', 'packages/viewer/src/BookView.css'],
      rules: new Set<BrandRuleId>(['css/no-smooth-scroll', 'css/radius']),
    });
    expect(before.failed).toBe(true);
    expect(before.open.map((f) => f.rule).sort()).toEqual([
      'css/no-smooth-scroll',
      'css/radius',
      'css/radius',
      'css/radius',
      'css/radius',
      'css/radius',
    ]);
    expect(before.open.map((f) => f.text)).toContain('.ts-title-slideshow { border-radius: 8px }');
  });
});
