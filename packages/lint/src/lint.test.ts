import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import type { Deck, Slide } from './contracts.ts';
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
  // the freeform round (docs/freeform.md), planted on fixed-points
  'layout/freeform',
  'freeform/overlap',
  'freeform/off-sheet',
  'type/ladder',
  'color/off-palette',
  // the Google Slides parity round (docs/gslides-parity/SPEC.md 5.4, 7.3)
  'copy/empty-placeholder',
  'table/size',
  // the parity round two (docs/gslides-parity/SPEC-2.md 0.60), planted on canvas-objects
  'chart/size',
  // the parity round three (docs/gslides-parity/SPEC-3.md 8.4): the escape block of bad-escape
  // carries no htmlSanitized stamp
  'html/sanitize',
];

/** The rules whose findings may carry a documented downward severity override (context.ts FindingDetails). */
const OVERRIDDEN: ReadonlySet<RuleId> = new Set<RuleId>([
  // reports at 1 on a mood slide, whose plate is opaque, and when no metrics are recorded
  'picture/plate-clear',
  // 2 for an object crossing the sheet's edge, 3 for one wholly outside (gslides-parity SPEC-2 0.96)
  'freeform/off-sheet',
  // 1 on a text run, 3 on escape markup (gslides-parity SPEC-2 0.6)
  'color/semantic-icons-only',
]);

/** The committed GT deck, read the way the store reads it, for the count that must not rise. */
function readGtDeck(): { deck: Deck; slides: Record<string, Slide> } | null {
  const dir = join(import.meta.dirname, '..', '..', '..', 'decks', 'gt-brand');
  if (!existsSync(join(dir, 'deck.json'))) return null;
  const deck = JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8')) as Deck;
  const slides: Record<string, Slide> = {};
  for (const file of readdirSync(join(dir, 'slides'))) {
    if (!file.endsWith('.json')) continue;
    const slide = JSON.parse(readFileSync(join(dir, 'slides', file), 'utf8')) as Slide;
    slides[slide.id] = slide;
  }
  return { deck, slides };
}

/** The static count of the GT deck at 8c7056c, measured 2026-09-12 (`turboslide lint all --layers static`). */
const GT_STATIC_FINDINGS_AT_8C7056C = 124;

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
      if (!OVERRIDDEN.has(f.rule)) expect(f.severity).toBe(RULES[f.rule].severity);
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

  test('the freeform rules name the block, the box and the color, and typography fixes snap to the ladder and the cap', () => {
    const onSlide = findings.filter((f) => f.slideId === 'fixed-points');
    expect(onSlide.find((f) => f.rule === 'layout/freeform')).toMatchObject({
      severity: 1,
      path: '/layout',
    });
    // the arrow crosses the right edge: severity 2 with the crossing sentence; the rule wholly
    // outside the sheet keeps the table's 3 (gslides-parity SPEC-2 0.96)
    const off = onSlide.filter((f) => f.rule === 'freeform/off-sheet');
    expect(off.map((f) => [f.blockId, f.severity])).toEqual([
      ['s2', 3],
      ['s1', 2],
    ]);
    const crossing = off.find((f) => f.blockId === 's1');
    expect(crossing).toMatchObject({ path: '/slots/main/3/pos' });
    expect(crossing?.evidence.box).toEqual([1500, 800, 200, 8]);
    expect(crossing?.proposal).toBe(
      "Part of this object is past the slide's edge and will not show",
    );
    expect(off.find((f) => f.blockId === 's2')?.proposal).toBe(
      'This object is outside the slide and will not show. Move it onto the slide or delete it',
    );
    expect(onSlide.find((f) => f.rule === 'layout/freeform')?.proposal).toBe(
      'This slide is arranged by hand; Apply layout re-flows it',
    );
    const overlap = onSlide.find((f) => f.rule === 'freeform/overlap');
    expect(overlap).toMatchObject({ severity: 1, blockId: 't1' });
    expect(overlap?.evidence.text).toBe('h and t1');
    expect(overlap?.evidence.box).toEqual([137, 150, 400, 35]);
    const palette = onSlide.find((f) => f.rule === 'color/off-palette');
    expect(palette).toMatchObject({ severity: 2, blockId: 'b1', path: '/slots/main/2/fill' });
    expect(palette?.evidence.text).toBe('#ff0000');
    expect(palette?.proposal).toContain('"b1"');
    const ladder = onSlide.find((f) => f.rule === 'type/ladder');
    expect(ladder?.fix).toEqual([
      {
        op: 'block.set',
        slideId: 'fixed-points',
        blockId: 't1',
        path: '/typography/size',
        value: 24,
      },
    ]);
    const cap = onSlide.find((f) => f.rule === 'type/weight-cap');
    expect(cap?.fix).toEqual([
      {
        op: 'block.set',
        slideId: 'fixed-points',
        blockId: 't1',
        path: '/typography/weight',
        value: 500,
      },
    ]);
    // the grammar slides raise none of the freeform rules
    expect(
      findings.filter(
        (f) =>
          f.slideId !== 'fixed-points' &&
          f.slideId !== 'canvas-objects' &&
          f.rule.startsWith('freeform/'),
      ),
    ).toEqual([]);
  });

  test('a slide arranged by hand carries layout/freeform and no rule about the conversion (gslides-parity SPEC-2 0.76)', () => {
    const onCanvas = findings.filter((f) => f.slideId === 'canvas-title');
    // the mark object is a raster in native mode, which export/non-native (1) lists for every deck
    // that holds a mark block; no freeform, copy or colour rule fires because the slide converted
    expect(onCanvas.map((f) => f.rule)).toEqual(['export/non-native', 'layout/freeform']);
    expect(onCanvas.find((f) => f.rule === 'layout/freeform')?.proposal).toBe(
      'This slide is arranged by hand; Apply layout re-flows it',
    );
  });

  test('the canvas objects: overlap skips the picture object and a textless box, reads the rotated bounding box, and the shape text takes the copy rules', () => {
    const onSlide = findings.filter((f) => f.slideId === 'canvas-objects');
    const overlaps = onSlide.filter((f) => f.rule === 'freeform/overlap');
    // the heading over the plate box and the picture is the design; the tilted text's 40 by 200
    // bounding box (rotated 90 degrees about its centre) reaches the callout's box
    expect(overlaps.map((f) => f.evidence.text)).toEqual(['callout and tilted']);
    expect(overlaps[0]?.proposal).toMatch(
      /^Slide \d+ has 2 objects placed over its text\. Move one of them or apply a layout$/,
    );
    expect(onSlide.filter((f) => f.rule === 'freeform/off-sheet')).toEqual([]);
    expect(onSlide.find((f) => f.rule === 'copy/no-exclamation')).toMatchObject({
      blockId: 'callout',
      path: '/slots/main/3/text',
    });
    const semantic = onSlide.find((f) => f.rule === 'color/semantic-icons-only');
    expect(semantic).toMatchObject({ severity: 1, blockId: 'tilted' });
    expect(semantic?.evidence.text).toContain('green');
    const palette = onSlide.find((f) => f.rule === 'color/off-palette' && f.blockId === 'tilted');
    expect(palette).toMatchObject({ severity: 2 });
    expect(palette?.evidence.text).toContain('#ff0000');
    const chart = onSlide.find((f) => f.rule === 'chart/size');
    expect(chart).toMatchObject({
      severity: 2,
      blockId: 'chart',
      path: '/slots/main/5/categories',
    });
    expect(chart?.evidence.measured).toEqual({ categories: 12, width: 720 });
    // a wide chart or a pie under nine slices is clean
    const wide = lintStatic({
      deck: { ...document.deck, sections: [{ id: 'one', name: 'One', slideIds: ['c'] }] },
      slides: {
        c: {
          schemaVersion: 1,
          id: 'c',
          kind: 'content',
          layout: { type: 'freeform' },
          slots: {
            main: [
              {
                id: 'wide',
                type: 'chart',
                kind: 'bar',
                categories: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
                series: [{ name: 'S', values: [1, 2, 3, 4, 5, 6, 7, 8, 9] }],
                pos: { x: 137, y: 129, w: 1000, h: 300, z: 0 },
              },
              {
                id: 'pie',
                type: 'chart',
                kind: 'pie',
                categories: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
                series: [{ name: 'S', values: [1, 2, 3, 4, 5, 6, 7, 8] }],
                pos: { x: 137, y: 500, w: 400, h: 300, z: 1 },
              },
            ],
          },
        },
      },
    });
    expect(wide.filter((f) => f.rule === 'chart/size')).toEqual([]);
  });

  test('copy/empty-placeholder names the empty title and the empty cell at severity 1, and the empty Texts trip no other rule', () => {
    const empty = findings.filter((f) => f.rule === 'copy/empty-placeholder');
    expect(empty).toHaveLength(2);
    const title = empty.find((f) => f.blockId === 'empty');
    const cell = empty.find((f) => f.blockId === 'grid');
    expect(title).toMatchObject({
      severity: 1,
      slideId: 'bad-escape',
      blockId: 'empty',
      path: '/slots/main/0/text',
    });
    expect(title?.proposal).toMatch(/^Slide 5 has an empty title/);
    expect(cell).toMatchObject({ blockId: 'grid', path: '/slots/main/1/rows/1/cells/0' });
    expect(cell?.proposal).toMatch(/has an empty table cell/);
    // the two planted blocks trip no other copy rule
    expect(
      findings.filter(
        (f) =>
          (f.blockId === 'empty' || f.blockId === 'grid') && f.rule !== 'copy/empty-placeholder',
      ),
    ).toEqual([]);
    // the title slide's fields and a statement's big are placeholders too
    const blank = lintStatic({
      deck: { ...document.deck, sections: [{ id: 'one', name: 'One', slideIds: ['t', 's'] }] },
      slides: {
        t: {
          schemaVersion: 1,
          id: 't',
          kind: 'title',
          mark: { w: 132, h: 84 },
          heading: '',
          lead: '',
        },
        s: { schemaVersion: 1, id: 's', kind: 'statement', big: '' },
      },
    }).filter((f) => f.rule === 'copy/empty-placeholder');
    expect(blank.map((f) => `${f.slideId}${f.path ?? ''}`)).toEqual([
      't/heading',
      't/lead',
      's/big',
    ]);
    expect(blank[0]?.proposal).toMatch(/Slide 1 has an empty title/);
    expect(blank[1]?.proposal).toMatch(/Slide 1 has an empty subtitle/);
  });

  test('the copy rules skip table cells and table/size names the ragged row at severity 3', () => {
    const onTable = findings.filter((f) => f.blockId === 'pricing');
    expect(onTable.map((f) => f.rule)).toEqual(['table/size']);
    expect(onTable[0]).toMatchObject({
      severity: 3,
      path: '/slots/right/1/rows/1/cells',
      evidence: { text: '3 by 2', measured: { columns: 3, rows: 2 } },
    });
    expect(onTable[0]?.proposal).toMatch(/Row 2 has 2 cell\(s\) for 3 column\(s\)/);
    // over the cap
    const columns = Array.from({ length: 21 }, () => ({}));
    const wide = lintStatic({
      deck: { ...document.deck, sections: [{ id: 'one', name: 'One', slideIds: ['w'] }] },
      slides: {
        w: {
          schemaVersion: 1,
          id: 'w',
          kind: 'content',
          layout: { type: 'center' },
          slots: {
            main: [{ id: 't', type: 'table', columns, rows: [{ cells: columns.map(() => 'x') }] }],
          },
        },
      },
    });
    expect(wide.filter((f) => f.rule === 'table/size')).toHaveLength(1);
    expect(wide.find((f) => f.rule === 'table/size')?.path).toBe('/slots/main/0/columns');
    // a well formed table raises nothing
    const fine = lintStatic({
      deck: { ...document.deck, sections: [{ id: 'one', name: 'One', slideIds: ['f'] }] },
      slides: {
        f: {
          schemaVersion: 1,
          id: 'f',
          kind: 'content',
          layout: { type: 'center' },
          slots: {
            main: [
              {
                id: 't',
                type: 'table',
                columns: [{}, {}],
                rows: [{ cells: ['Plan.', 'Fast, not slow!'], header: true }],
              },
            ],
          },
        },
      },
    });
    expect(fine.filter((f) => f.blockId === 't')).toEqual([]);
  });

  test('the copy rules run per paragraph of a multiline Text: the caption period is read on the last paragraph', () => {
    const slides: Record<string, Slide> = {
      m: {
        schemaVersion: 1,
        id: 'm',
        kind: 'content',
        layout: { type: 'center' },
        slots: {
          main: [
            { id: 'p', type: 'paragraph', text: 'First paragraph\nSecond paragraph.' },
            {
              id: 'fig',
              type: 'shot',
              asset: 'site-home',
              caption: 'A caption with two paragraphs.\nThe last one has no period',
            },
          ],
        },
      },
    };
    const result = lintStatic({
      deck: { ...document.deck, sections: [{ id: 'one', name: 'One', slideIds: ['m'] }] },
      slides,
    });
    expect(result.filter((f) => f.blockId === 'p' && f.rule.startsWith('copy/'))).toEqual([]);
    expect(result.find((f) => f.rule === 'copy/full-sentence-caption')?.blockId).toBe('fig');
  });

  test('the GT deck’s static count does not rise above 8c7056c', () => {
    const gt = readGtDeck();
    if (gt === null) return;
    const count = lintStatic(gt).length;
    expect(count).toBeLessThanOrEqual(GT_STATIC_FINDINGS_AT_8C7056C);
    expect(lintStatic(gt).filter((f) => f.rule === 'copy/empty-placeholder')).toEqual([]);
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
