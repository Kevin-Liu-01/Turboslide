import { describe, expect, test } from 'vitest';

import { createContext } from '../context.ts';
import { document } from '../fixtures/deck.ts';
import { lintStatic } from '../run.ts';
import { checkExportNonNative, classifyBlock, hasGtWord, hasIcons } from './export-non-native.ts';

describe('export/non-native (SPEC 7.7; MILESTONES M2 item 7)', () => {
  test('classifies raster blocks as a whole and native blocks by their raster parts', () => {
    expect(classifyBlock({ id: 'fig', type: 'shot', asset: 'site-home' })).toEqual({
      blockId: 'fig',
      type: 'shot',
      native: false,
      parts: ['block'],
    });
    const plain = {
      id: 'list',
      type: 'plain' as const,
      items: [
        {
          icon: { name: 'check-circle' as const, color: 'ok' as const },
          text: 'How GT ships a locale',
        },
      ],
    };
    expect(hasIcons(plain)).toBe(true);
    expect(hasGtWord(plain)).toBe(true);
    expect(classifyBlock(plain)).toEqual({
      blockId: 'list',
      type: 'plain',
      native: true,
      parts: ['icons', 'mark'],
    });
    expect(classifyBlock({ id: 'p', type: 'paragraph', text: 'No mark here.' })).toEqual({
      blockId: 'p',
      type: 'paragraph',
      native: true,
      parts: [],
    });
    expect(hasGtWord({ id: 'code', type: 'panel', code: 'GT' })).toBe(false);
  });

  test('lists the raster blocks once per slide, and content-rule for its icons and mark', () => {
    const findings = checkExportNonNative(createContext(document));
    const bySlide = new Map(findings.map((f) => [f.slideId, f]));
    expect(findings.every((f) => f.rule === 'export/non-native' && f.severity === 1)).toBe(true);
    expect(findings.filter((f) => f.slideId === 'content-rule')).toHaveLength(1);
    const contentRule = bySlide.get('content-rule');
    expect(contentRule?.evidence.text).toBe('list');
    expect(contentRule?.evidence.measured).toEqual({ rasterBlocks: 0, partialBlocks: 1 });
    expect(contentRule?.proposal).toContain('list (icons and mark)');
    const site = bySlide.get('the-production-site');
    expect(site?.evidence.text).toContain('shot');
    expect(site?.evidence.measured?.rasterBlocks).toBe(1);
    expect(site?.proposal).toContain('native mode');
  });

  test('flatten mode words the listing as the invisible layer; false switches it off', () => {
    const flatten = checkExportNonNative(createContext(document, { exportMode: 'flatten' }));
    expect(flatten.some((f) => f.proposal.includes('flatten mode'))).toBe(true);
    expect(checkExportNonNative(createContext(document, { exportMode: false }))).toEqual([]);
    expect(
      lintStatic(document, { rules: ['export/non-native'] }).every(
        (f) => f.rule === 'export/non-native',
      ),
    ).toBe(true);
  });
});
