import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { BRAND_LINT_MODE, OVERRIDES, RADIUS_EXCEPTIONS, CODE_SURFACES } from './config.ts';
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

  test("a run on a commit reads git's objects, not the working tree", () => {
    const files = ['packages/viewer/src/BookView.css', 'packages/chrome/src/ToolButton.tsx'];
    const result = runBrandLint({ root: ROOT, mode: 'report', ref: 'HEAD', files });
    expect(result.read).toEqual({ scripts: 1, stylesheets: 1, pictures: 0 });
    expect(result.broken).toEqual([]);
  });

  test('the configured mode is report or enforce', () => {
    expect(['report', 'enforce']).toContain(BRAND_LINT_MODE);
  });
});
