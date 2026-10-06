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
import type { Acceptance, BrandFinding } from './config.ts';
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

  test('the design round rules report apart and never fail an enforce run until DR-D1#5', () => {
    expect([...REPORT_RULES].sort()).toEqual(
      [
        'css/chrome-alternates',
        'css/no-shadow',
        'css/numerals',
        'css/scrollbar',
        'css/z-index',
      ].sort(),
    );
    for (const rule of REPORT_RULES) expect(CSS_RULES).toContain(rule);
    // 0d75ab90 is the tree the design round was cut from: Menu.css and Dialog.css draw the old
    // z-index values, the dialog's drop shadow, tabular figures by hand and the alternates
    const files = ['packages/chrome/src/Menu.css', 'packages/chrome/src/Dialog.css'];
    const before = runBrandLint({ root: ROOT, mode: 'enforce', ref: '0d75ab90', files });
    expect(before.reported.length).toBeGreaterThan(0);
    expect(new Set(before.reported.map((f) => f.rule))).toEqual(
      new Set(['css/z-index', 'css/no-shadow', 'css/numerals', 'css/chrome-alternates']),
    );
    expect(before.open.filter((f) => REPORT_RULES.includes(f.rule))).toEqual([]);
    expect(before.failed).toBe(before.open.length > 0 || before.stale.length > 0);
    expect(formatBrandLint(before).some((line) => line.startsWith('reported, never failing'))).toBe(
      true,
    );
    /* DR-D1#5 turns them to enforce: the same findings are then open */
    const enforced = runBrandLint({
      root: ROOT,
      mode: 'enforce',
      ref: '0d75ab90',
      files,
      reportOnly: [],
    });
    expect(enforced.reported).toEqual([]);
    expect(enforced.open.filter((f) => REPORT_RULES.includes(f.rule)).length).toBe(
      before.reported.length,
    );
    expect(enforced.failed).toBe(true);
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
    // 2108dad4 is the tree B5b#20 read: Toolbar.tsx holds two accepted labels, TitleRow.css none
    const toolbar = runBrandLint({
      root: ROOT,
      mode: 'enforce',
      ref: '2108dad4',
      files: ['packages/chrome/src/Toolbar.tsx'],
    });
    expect(toolbar.accepted.map((f) => f.rule)).toEqual([
      'gt-ui/cta-title-case',
      'gt-ui/cta-title-case',
    ]);
    expect(toolbar.stale).toEqual([]);
    expect(toolbar.failed).toBe(false);
    const clean = runBrandLint({
      root: ROOT,
      mode: 'enforce',
      ref: '2108dad4',
      files: ['packages/chrome/src/TitleRow.css'],
    });
    expect(clean.stale).toEqual([]);
    expect(clean.failed).toBe(false);
  });

  test('enforce mode fails on a finding a lane fixed in Round 1 if it came back', () => {
    // ea5fec35 is the tree before B3b#10 squared the thirteen radii and dropped the book view's
    // smooth scroll; read in enforce mode with today's acceptances, those findings are open
    const before = runBrandLint({
      root: ROOT,
      mode: 'enforce',
      ref: 'ea5fec35',
      files: ['packages/chrome/src/TitleRow.css', 'packages/viewer/src/BookView.css'],
    });
    expect(before.failed).toBe(true);
    expect(before.open.map((f) => f.rule).sort()).toEqual([
      'css/no-smooth-scroll',
      'css/radius',
      'css/radius',
      'css/radius',
      'css/radius',
    ]);
  });
});
