import { describe, expect, test } from 'vitest';

import { RULES } from './contracts.ts';
import type { RenderRecord, RuleId } from './contracts.ts';
import { GOOD_SLIDE_IDS, document } from './fixtures/deck.ts';
import {
  countsBySlide,
  formatFinding,
  gate,
  lintDeck,
  lintRendered,
  lintStatic,
  toBaseline,
} from './run.ts';
import { parseText, plainText } from './text.ts';

const STATIC_EXPECTED: RuleId[] = [
  'copy/no-eyebrow',
  'copy/heading-period',
  'copy/sentence-case',
  'copy/token-first',
  'copy/heading-is-name',
  'copy/no-em-dash',
  'copy/no-exclamation',
  'copy/metaphor-candidate',
  'copy/contrast-pair',
  'copy/full-sentence-caption',
  'rows/key-snap',
  'icon/known',
  'asset/twin-or-border',
  'dia/fit-slot',
  'dia/half-pixel',
  'dia/label-clearance',
  'escape/html-block',
  'color/tokens-only',
  'color/semantic-icons-only',
  'type/weight-cap',
  'type/sizes-ladder',
  'type/svg-label-min',
  'icon/placement',
  'dia/stroke-grammar',
  'scales/marker-equals-value',
  'count/hard-coded',
  'numbers/contradiction',
  'picture/mood-placement',
  'asset/credit-on-plate',
  'picture/plate-clear',
  'picture/blank-twin',
  'asset/license-missing',
  'opener/sentence-lists-section',
  'export/non-native',
];

describe('text', () => {
  test('reads the four rules', () => {
    expect(plainText('One *source* text, [every](https://x.dev) language \\*kept\\* \\GT')).toBe(
      'One source text, every language *kept* GT',
    );
    expect(parseText('a [b](https://c) d')).toEqual([
      { t: 'a ' },
      { t: 'b', link: 'https://c' },
      { t: ' d' },
    ]);
  });
});

describe('lintStatic', () => {
  const findings = lintStatic(document);
  const rules = new Set(findings.map((f) => f.rule));

  test('trips every planted static rule', () => {
    const missing = STATIC_EXPECTED.filter((r) => !rules.has(r));
    expect(missing).toEqual([]);
  });

  test('every finding carries the slide, a rule-table severity and kind, and a stable id', () => {
    for (const f of findings) {
      expect(f.slideId.length).toBeGreaterThan(0);
      // the table severity, or a documented downward override (context.ts FindingDetails: picture/plate-clear
      // reports at 1 on a mood slide, whose plate is opaque, and when no metrics are recorded)
      expect(f.severity).toBeLessThanOrEqual(RULES[f.rule].severity);
      if (f.rule !== 'picture/plate-clear') expect(f.severity).toBe(RULES[f.rule].severity);
      expect(f.kind).toBe(RULES[f.rule].kind);
      expect(f.id).toBe(
        [f.rule, f.slideId, f.blockId ?? '', f.path ?? '', f.theme ?? ''].join('|'),
      );
      expect(f.source).toBe('lint');
    }
    expect(new Set(findings.map((f) => f.id)).size).toBe(findings.length);
  });

  test('the worked slides of SPEC 4.3 are clean at severity 2 and above', () => {
    const onGood = findings.filter((f) => GOOD_SLIDE_IDS.includes(f.slideId) && f.severity >= 2);
    expect(onGood.map(formatFinding)).toEqual([]);
  });

  test('mechanical fixes are block.set mutations on the right block', () => {
    const period = findings.find((f) => f.rule === 'copy/heading-period' && f.blockId === 'h');
    expect(period?.fix).toEqual([
      {
        op: 'block.set',
        slideId: 'bad-copy',
        blockId: 'h',
        path: '/text',
        value: 'gt-next Ships Big Ideas',
      },
    ]);
    const snap = findings.find((f) => f.rule === 'rows/key-snap');
    expect(snap?.fix?.[0]).toMatchObject({
      op: 'block.set',
      blockId: 'rows',
      path: '/key',
      value: 180,
    });
    const sentence = findings.find((f) => f.rule === 'copy/sentence-case');
    expect(sentence?.evidence.text).toBe('gt-next Ships Big Ideas.');
    expect(sentence?.fix?.[0]).toMatchObject({ path: '/text', value: 'gt-next ships big ideas.' });
    const half = findings.find((f) => f.rule === 'dia/half-pixel');
    expect(half?.fix).toHaveLength(2);
    expect(half?.fix?.[0]).toMatchObject({ path: '/data/lines/0/x1', value: 100.5 });
    const weight = findings.find((f) => f.rule === 'type/weight-cap');
    expect(
      String(weight?.fix?.[0] && 'value' in weight.fix[0] ? weight.fix[0].value : ''),
    ).toContain('font-weight: 500');
  });

  test('the gate separates known severity 3 findings from blocking ones', () => {
    const g = gate(findings, []);
    expect(g.blocking.length).toBe(g.counts.s3);
    const baseline = toBaseline(findings);
    expect(gate(findings, baseline).blocking).toEqual([]);
    expect(gate(findings, baseline).known.length).toBe(g.counts.s3);
    expect(baseline.every((row) => row.reason.length > 0)).toBe(true);
    const bySlide = countsBySlide(findings);
    expect(bySlide['bad-copy']?.s3).toBeGreaterThan(0);
  });

  test('options restrict rules and slides and switch off the export listing', () => {
    const only = lintStatic(document, { rules: ['copy/no-em-dash'] });
    expect(only.every((f) => f.rule === 'copy/no-em-dash')).toBe(true);
    expect(only.length).toBe(1);
    const noExport = lintStatic(document, { exportMode: false });
    expect(noExport.some((f) => f.rule === 'export/non-native')).toBe(false);
    const oneSlide = lintStatic(document, { slideIds: ['content-rule'] });
    expect(oneSlide.every((f) => f.slideId === 'content-rule')).toBe(true);
  });
});

describe('lintRendered', () => {
  const record: RenderRecord = {
    deckId: 'lint-fixture',
    slideId: 'bad-copy',
    revision: 1,
    theme: 'dark',
    scale: 1,
    image: '04-bad-copy-dark.png',
    renderer: 'Chrome for Testing 147.0.7727.15, ANGLE Metal, Apple M5 Max',
    pageErrors: [],
    consoleErrors: [],
    overflow: [{ blockId: 'list', selector: 'div.plain', box: [1000, 700, 700, 250] }],
    blocks: {
      h: { type: 'heading', box: [137, 129, 600, 48], lines: 1, fontSize: 44, fontWeight: 500 },
      p1: { type: 'paragraph', box: [137, 200, 600, 66], lines: 2, fontSize: 12, fontWeight: 400 },
      list: { type: 'plain', box: [1000, 700, 700, 250], fontSize: 24, fontWeight: 700 },
      rows: { type: 'rows', box: [137, 300, 600, 200], fontSize: 20, fontWeight: 500 },
      'rows/0': { type: 'row', box: [409, 316, 328, 87], lines: 3, fontSize: 20 },
      'rows/1': { type: 'row', box: [409, 420, 328, 29], lines: 1, fontSize: 20 },
      cap: { type: 'paragraph', box: [137, 790, 600, 22], lines: 1, fontSize: 15, fontWeight: 400 },
    },
    fonts: { status: 'partial', faces: ['fallback:500 44px Inter'] },
    anchors: [],
    rasters: [],
    timing: { readyMs: 30, screenshotMs: 40 },
  };

  test('reports overflow, the floor, the weight cap, the face, the row lines and the rail touch with boxes', () => {
    const findings = lintRendered(document, [record]);
    const byRule = (r: RuleId) => findings.filter((f) => f.rule === r);
    expect(byRule('sheet/overflow')).toHaveLength(1);
    expect(byRule('sheet/overflow')[0]?.evidence.box).toEqual([1000, 700, 700, 250]);
    expect(byRule('sheet/overflow')[0]?.blockId).toBe('list');
    expect(byRule('type/floor-15')).toHaveLength(1);
    expect(byRule('type/floor-15')[0]?.blockId).toBe('p1');
    expect(byRule('type/weight-cap')).toHaveLength(1);
    expect(byRule('type/face')).toHaveLength(1);
    expect(byRule('rows/two-lines')).toHaveLength(1);
    expect(byRule('rows/two-lines')[0]?.path).toBe('/slots/right/0/items/0/value');
    // cap sits at 790..812, the bottom rule is at 844: 32 px clear, no touch; the heading at 137 is clear of the left rail at 56.
    expect(byRule('sheet/rail-touch')).toHaveLength(0);
    expect(findings.every((f) => f.theme === 'dark')).toBe(true);
    const touching: RenderRecord = {
      ...record,
      blocks: { h: { type: 'heading', box: [60, 129, 600, 48], fontSize: 44 } },
      overflow: [],
      fonts: { status: 'loaded', faces: [] },
    };
    expect(lintRendered(document, [touching]).map((f) => f.rule)).toEqual(['sheet/rail-touch']);
  });

  test('lintDeck merges both layers in slide order', () => {
    const all = lintDeck(document, [record]);
    expect(all.some((f) => f.rule === 'sheet/overflow')).toBe(true);
    expect(all.some((f) => f.rule === 'copy/no-em-dash')).toBe(true);
    const onlyStatic = lintDeck(document, [record], { layers: 'static' });
    expect(onlyStatic.some((f) => f.rule === 'sheet/overflow')).toBe(false);
  });
});
