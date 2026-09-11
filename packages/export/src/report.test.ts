// The report without a browser: the font mapping, the classification the lint rule shares, the
// report shape and the merge.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { NATIVE_BLOCK_TYPES, isNativeBlockType } from '@turboslide/schema/export';

import { familiesOfLadder } from './pptx/build.ts';
import {
  FAMILY_PREFIX,
  MONO_FAMILY,
  loadFontsCatalog,
  nearestOpsz,
  pickFamily,
} from './pptx/fonts-map.ts';
import { familyFor } from './pptx/text.ts';
import { buildReport, mergeReports } from './report.ts';

describe('the export font set (SPEC 8.4)', () => {
  test('display text goes to the display instance, text to per-size instances', () => {
    expect(pickFamily(88, 500, 'exact').family).toBe(`${FAMILY_PREFIX} Display`);
    expect(pickFamily(44, 500, 'exact').family).toBe(`${FAMILY_PREFIX} Display`);
    expect(pickFamily(72, 500, 'standard').family).toBe(`${FAMILY_PREFIX} Display`);
    expect(pickFamily(22, 400, 'exact').family).toBe(`${FAMILY_PREFIX} Text 22`);
    expect(pickFamily(20, 500, 'exact').family).toBe(`${FAMILY_PREFIX} Text 20 Medium`);
    expect(pickFamily(24, 500, 'exact').family).toBe(`${FAMILY_PREFIX} Text 24 Medium`);
    expect(pickFamily(15, 400, 'exact').family).toBe(`${FAMILY_PREFIX} Text 15`);
    expect(pickFamily(13, 400, 'exact').family).toBe(`${FAMILY_PREFIX} Text 14`);
    expect(pickFamily(16, 400, 'exact').family).toBe(`${FAMILY_PREFIX} Text 15`);
    expect(pickFamily(22, 400, 'standard').family).toBe('Inter');
    expect(pickFamily(20, 500, 'standard').family).toBe('Inter Medium');
    expect(nearestOpsz(27)).toBe(26);
    expect(nearestOpsz(34)).toBe(26);
  });

  test('the code panel travels in the mono family', () => {
    const style = {
      family: 'ui-monospace',
      mono: true,
      weight: 400,
      size: 17,
      letterSpacing: 0,
      lineHeight: 28.9,
      color: 'rgba(255, 255, 255, 0.87)',
      strike: false,
      features: 'normal',
      align: 'left' as const,
    };
    expect(familyFor(style, 'exact')).toBe(MONO_FAMILY);
  });

  test('the ladder names the twelve families of the exact set and three of the standard set', () => {
    const exact = familiesOfLadder('exact');
    expect(exact).toContain(`${FAMILY_PREFIX} Display`);
    expect(exact).toContain(`${FAMILY_PREFIX} Text 22`);
    expect(exact.length).toBeGreaterThanOrEqual(8);
    expect(familiesOfLadder('standard')).toEqual([
      `${FAMILY_PREFIX} Display`,
      'Inter',
      'Inter Medium',
    ]);
  });

  test('the catalog reads fonts.json or reports an unbuilt set', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ts-fonts-'));
    expect(loadFontsCatalog(dir).built).toBe(false);
    writeFileSync(
      join(dir, 'fonts.json'),
      JSON.stringify({
        version: 'inter-4.001-test',
        faces: [
          { family: `${FAMILY_PREFIX} Text 22`, file: 'GTInterText22.ttf', weight: 400, opsz: 22 },
        ],
      }),
    );
    const catalog = loadFontsCatalog(dir);
    expect(catalog.built).toBe(true);
    expect(catalog.version).toBe('inter-4.001-test');
    expect(catalog.entries[0]?.family).toBe(`${FAMILY_PREFIX} Text 22`);
  });
});

describe('the classification the lint rule shares (SPEC 4.2 export)', () => {
  test('six native types', () => {
    expect([...NATIVE_BLOCK_TYPES]).toEqual([
      'heading',
      'paragraph',
      'credit',
      'rows',
      'plain',
      'panel',
    ]);
    expect(isNativeBlockType('rows')).toBe(true);
    expect(isNativeBlockType('shot')).toBe(false);
  });
});

describe('ExportReport (SPEC 4.2 export)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ts-report-'));
  const file = join(dir, 'gt-brand-light.pptx');
  writeFileSync(file, 'PK');

  const base = {
    deckId: 'gt-brand',
    revision: 12,
    mode: 'flatten' as const,
    fontSet: 'exact' as const,
    fontSetVersion: 'unbuilt',
    files: [file],
    families: ['GT Inter Display', 'GT Inter Text 22'],
    embedded: [] as string[],
    slides: [{ slideId: 'site', native: ['h', 'p1'], raster: ['fig'] }],
    geometryInBounds: true,
    residual: [] as string[],
    warnings: [] as string[],
  };

  test('lists the file with its hash, the fonts required on the viewer and passes on geometry', () => {
    const report = buildReport({ ...base, theme: 'light' });
    expect(report.files[0]?.bytes).toBe(2);
    expect(report.files[0]?.sha256).toHaveLength(64);
    expect(report.fonts.requiredOnViewer).toEqual(['GT Inter Display', 'GT Inter Text 22']);
    expect(report.fonts.substitutedIn).toEqual(['every viewer']);
    expect(report.passed).toBe(true);
    expect(report.residual.some((r) => r.startsWith('fonts not embedded'))).toBe(true);
  });

  test('a warning or out-of-bounds geometry fails the report', () => {
    expect(buildReport({ ...base, theme: 'light', warnings: ['x'] }).passed).toBe(false);
    expect(buildReport({ ...base, theme: 'light', geometryInBounds: false }).passed).toBe(false);
  });

  test('embedded fonts name the substituting viewers', () => {
    const report = buildReport({
      ...base,
      theme: 'dark',
      embedded: ['GT Inter Display', 'GT Inter Text 22'],
    });
    expect(report.fonts.requiredOnViewer).toEqual([]);
    expect(report.fonts.substitutedIn).toEqual([
      'Keynote',
      'PowerPoint for the web',
      'Google Slides',
    ]);
  });

  test('merge keeps the first theme, every file and every slide', () => {
    const light = buildReport({ ...base, theme: 'light' });
    const dark = buildReport({ ...base, theme: 'dark', geometryInBounds: false });
    const merged = mergeReports([light, dark]);
    expect(merged.theme).toBe('light');
    expect(merged.files).toHaveLength(2);
    expect(merged.slides).toHaveLength(2);
    expect(merged.geometryInBounds).toBe(false);
    expect(merged.passed).toBe(false);
    expect(merged.residual[0]).toContain('merged report over light and dark');
    expect(mergeReports([light])).toBe(light);
  });
});
