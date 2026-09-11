import { describe, expect, test } from 'vitest';

import { RULES } from '../contracts.ts';
import type { Finding, RenderRecord, RuleId } from '../contracts.ts';
import { createContext } from '../context.ts';
import { lintRendered } from '../run.ts';
import { fillBox, solidBitmap } from './bitmap.ts';
import type { Bitmap } from './bitmap.ts';
import { document, record } from './fixtures.ts';
import { INK, PAPER, TITANIUM, composite, onPaper } from './palette.ts';
import type { Rgb } from './palette.ts';
import { lintRecord } from './rules.ts';

const ctx = createContext(document);
const byRule = (findings: Finding[], rule: RuleId): Finding[] =>
  findings.filter((f) => f.rule === rule);

/** A paper sheet in the theme. */
function sheet(theme: 'light' | 'dark'): Bitmap {
  return solidBitmap(1600, 900, PAPER[theme]);
}

describe('asset/stretched', () => {
  test('a shot drawn at another aspect than its file is reported with its box', () => {
    const r = record('stretched', 'light', {
      blocks: { shot: { type: 'shot', box: [700, 129, 760, 300] } },
      rasters: [
        { blockId: 'shot', kind: 'shot', file: '', box: [700, 129, 760, 300], alpha: false },
      ],
    });
    const found = byRule(lintRecord(ctx, r, { bitmap: null }), 'asset/stretched');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      blockId: 'shot',
      path: '/slots/right/0/asset',
      theme: 'light',
      evidence: { box: [700, 129, 760, 300], text: 'wide-shot' },
    });
    expect(found[0]?.evidence.measured?.fileAspect).toBe(1.6);
    expect(found[0]?.evidence.measured?.drawnAspect).toBeCloseTo(2.54, 1);
  });

  test('a shot at its file aspect, a declared crop and a pair figure at its aspect pass', () => {
    const fine = record('stretched', 'light', {
      rasters: [
        { blockId: 'shot', kind: 'shot', file: '', box: [700, 129, 762, 477], alpha: false },
      ],
    });
    expect(byRule(lintRecord(ctx, fine, { bitmap: null }), 'asset/stretched')).toEqual([]);
    const cropped = record('cropped', 'light', {
      rasters: [
        { blockId: 'shot', kind: 'shot', file: '', box: [700, 129, 760, 300], alpha: false },
      ],
    });
    expect(byRule(lintRecord(ctx, cropped, { bitmap: null }), 'asset/stretched')).toEqual([]);
    const pair = record('pairs', 'light', {
      rasters: [
        { blockId: 'pair', kind: 'shot', file: '', box: [138, 300, 300, 171], alpha: false },
        { blockId: 'pair', kind: 'shot', file: '', box: [478, 300, 300, 250], alpha: false },
      ],
    });
    const found = byRule(lintRecord(ctx, pair, { bitmap: null }), 'asset/stretched');
    expect(found.map((f) => f.path)).toEqual(['/slots/main/0/figures/1/assets/0']);
  });
});

describe('layout/empty-half', () => {
  const r = record('half', 'light', {
    blocks: {
      fig: { type: 'shot', box: [137, 129, 627, 400] },
      p: { type: 'paragraph', box: [836, 129, 627, 30], fontSize: 20, color: 'rgb(7, 7, 7)' },
    },
  });

  test('an inked left column beside an empty right column is reported on the right slot', () => {
    const bitmap = sheet('light');
    fillBox(bitmap, [137, 129, 627, 200], INK.light);
    const found = byRule(lintRecord(ctx, r, { bitmap }), 'layout/empty-half');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      blockId: 'p',
      path: '/slots/right/0',
      evidence: { box: [836, 129, 627, 642], text: 'right column' },
    });
    expect(found[0]?.evidence.measured?.leftCoverage).toBeCloseTo(31.15, 1);
    expect(found[0]?.evidence.measured?.rightCoverage).toBe(0);
  });

  test('a right column with some ink, or no screenshot, is not reported', () => {
    const bitmap = sheet('light');
    fillBox(bitmap, [137, 129, 627, 200], INK.light);
    fillBox(bitmap, [836, 129, 627, 40], INK.light);
    expect(byRule(lintRecord(ctx, r, { bitmap }), 'layout/empty-half')).toEqual([]);
    expect(byRule(lintRecord(ctx, r, { bitmap: null }), 'layout/empty-half')).toEqual([]);
    expect(byRule(lintRendered(document, [r]), 'layout/empty-half')).toEqual([]);
  });
});

describe('layout/columns-aligned', () => {
  test('rows blocks whose tops differ by more than 1 px are reported on the lower one', () => {
    const r = record('misaligned', 'dark', {
      blocks: {
        h: { type: 'heading', box: [137, 129, 600, 48], fontSize: 44 },
        a: { type: 'rows', box: [137, 300, 600, 120], fontSize: 20 },
        b: { type: 'rows', box: [836, 303, 600, 120], fontSize: 20 },
      },
    });
    const found = byRule(lintRecord(ctx, r, { bitmap: null }), 'layout/columns-aligned');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      blockId: 'b',
      path: '/slots/right/0',
      theme: 'dark',
      evidence: { box: [836, 303, 600, 120], measured: { dy: 3, leftTop: 300, rightTop: 303 } },
    });
  });

  test('tops within 1 px pass', () => {
    const r = record('misaligned', 'light', {
      blocks: {
        a: { type: 'rows', box: [137, 300, 600, 120] },
        b: { type: 'rows', box: [836, 301, 600, 120] },
      },
    });
    expect(byRule(lintRecord(ctx, r, { bitmap: null }), 'layout/columns-aligned')).toEqual([]);
  });
});

describe('layout/pair-gaps', () => {
  const equal = [
    {
      blockId: 'grid',
      kind: 'shot' as const,
      file: '',
      box: [138, 500, 425, 140] as [number, number, number, number],
      alpha: false,
    },
    {
      blockId: 'grid',
      kind: 'shot' as const,
      file: '',
      box: [589, 500, 425, 140] as [number, number, number, number],
      alpha: false,
    },
    {
      blockId: 'grid',
      kind: 'shot' as const,
      file: '',
      box: [1039, 500, 425, 140] as [number, number, number, number],
      alpha: false,
    },
  ];

  test('gaps equal within 2 px pass, one figure moved by 12 px is reported', () => {
    const fine = record('pairs', 'light', {
      blocks: { grid: { type: 'details', box: [138, 500, 1326, 140] } },
      rasters: equal,
    });
    expect(byRule(lintRecord(ctx, fine, { bitmap: null }), 'layout/pair-gaps')).toEqual([]);
    const moved = record('pairs', 'light', {
      blocks: { grid: { type: 'details', box: [138, 500, 1326, 140] } },
      rasters: [equal[0]!, { ...equal[1]!, box: [600, 500, 425, 140] }, equal[2]!],
    });
    const found = byRule(lintRecord(ctx, moved, { bitmap: null }), 'layout/pair-gaps');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      blockId: 'grid',
      path: '/slots/main/1',
      evidence: {
        box: [138, 500, 1326, 140],
        text: 'horizontal gaps 37, 14 px',
        measured: { min: 14, max: 37, spread: 23 },
      },
    });
  });

  test('unequal row gaps are reported as vertical', () => {
    const rows = record('pairs', 'light', {
      blocks: { grid: { type: 'details', box: [138, 259, 1326, 507] } },
      rasters: [
        ...equal.map((r) => ({
          ...r,
          box: [r.box[0], 259, 425, 140] as [number, number, number, number],
        })),
        ...equal.map((r) => ({
          ...r,
          box: [r.box[0], 425, 425, 140] as [number, number, number, number],
        })),
        ...equal.map((r) => ({
          ...r,
          box: [r.box[0], 600, 425, 140] as [number, number, number, number],
        })),
      ],
    });
    const found = byRule(lintRecord(ctx, rows, { bitmap: null }), 'layout/pair-gaps');
    expect(found.map((f) => f.evidence.text)).toEqual(['vertical gaps 26, 35 px']);
  });
});

describe('sheet/thumb-legible', () => {
  test('an 18 px label in a diagram drawn at half its viewBox is 1.26 px in a thumbnail', () => {
    const r = record('thumb', 'light', {
      blocks: {
        h: { type: 'heading', box: [137, 129, 500, 48], fontSize: 44, fontWeight: 500 },
        big: { type: 'dia', box: [700, 129, 600, 300], fontSize: 18 },
      },
    });
    const found = byRule(lintRecord(ctx, r, { bitmap: null }), 'sheet/thumb-legible');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      blockId: 'big',
      path: '/slots/right/0',
      evidence: {
        box: [700, 129, 600, 300],
        measured: { fontSize: 18, scale: 0.5, rendered: 9, atThumb: 1.26 },
      },
    });
  });

  test('the same diagram at its viewBox size passes, and text under the floor is left to type/floor-15', () => {
    const r = record('thumb', 'light', {
      blocks: {
        big: { type: 'dia', box: [137, 129, 1200, 600], fontSize: 18 },
        h: { type: 'heading', box: [137, 129, 500, 48], fontSize: 12 },
      },
    });
    const findings = lintRecord(ctx, r, { bitmap: null });
    expect(byRule(findings, 'sheet/thumb-legible')).toEqual([]);
    expect(byRule(findings, 'type/floor-15')).toHaveLength(1);
  });
});

describe('contrast/both-themes', () => {
  const blocks = (theme: 'light' | 'dark'): RenderRecord['blocks'] => ({
    h: {
      type: 'heading',
      box: [137, 129, 600, 48],
      fontSize: 44,
      color: `rgb(${INK[theme].join(', ')})`,
    },
    cap: { type: 'paragraph', box: [137, 200, 600, 22], fontSize: 15, color: 'rgb(138, 143, 152)' },
    code: {
      type: 'panel',
      box: [137, 300, 600, 120],
      fontSize: 17,
      color: 'rgba(255, 255, 255, 0.87)',
    },
  });

  test('titanium at 15 px on light paper is under 4.5:1, ink and the code panel pass', () => {
    const bitmap = sheet('light');
    fillBox(bitmap, [137, 300, 600, 120], [16, 16, 16]);
    const found = byRule(
      lintRecord(ctx, record('contrast', 'light', { blocks: blocks('light') }), { bitmap }),
      'contrast/both-themes',
    );
    expect(found.map((f) => f.blockId)).toEqual(['cap']);
    expect(found[0]?.evidence.measured?.ratio).toBeCloseTo(3.25, 1);
    expect(found[0]?.evidence.text).toBe('rgb(138, 143, 152) on rgb(255, 255, 255)');
    expect(found[0]?.theme).toBe('light');
  });

  test('the same caption passes on the dark paper, and at 26 px on light paper against the 3:1 floor', () => {
    const dark = byRule(
      lintRecord(ctx, record('contrast', 'dark', { blocks: blocks('dark') }), {
        bitmap: sheet('dark'),
      }),
      'contrast/both-themes',
    );
    expect(dark).toEqual([]);
    const large = record('contrast', 'light', {
      blocks: {
        cap: {
          type: 'paragraph',
          box: [137, 200, 600, 40],
          fontSize: 26,
          color: 'rgb(138, 143, 152)',
        },
      },
    });
    expect(byRule(lintRecord(ctx, large, { bitmap: null }), 'contrast/both-themes')).toEqual([]);
  });

  test('without a screenshot the theme paper is the ground', () => {
    const found = byRule(
      lintRecord(ctx, record('contrast', 'light', { blocks: blocks('light') }), { bitmap: null }),
      'contrast/both-themes',
    );
    expect(found.map((f) => f.blockId)).toEqual(['cap']);
  });
});

describe('lines/law', () => {
  const hair = onPaper('light', 'hair');
  const r = record('lines', 'light', {
    blocks: {
      rows: { type: 'rows', box: [137, 129, 1326, 300], fontSize: 20, color: 'rgb(7, 7, 7)' },
      shot: { type: 'shot', box: [137, 600, 400, 200] },
    },
    rasters: [{ blockId: 'shot', kind: 'shot', file: '', box: [137, 600, 400, 200], alpha: false }],
  });

  test('two hairlines 3 px apart, hair over hair, and an off-role color are reported; a lone hairline is not', () => {
    const bitmap = sheet('light');
    fillBox(bitmap, [137, 200, 1326, 1], hair);
    fillBox(bitmap, [137, 203, 1326, 1], hair);
    fillBox(bitmap, [137, 300, 1326, 1], hair);
    fillBox(bitmap, [137, 400, 600, 1], [200, 0, 0]);
    fillBox(bitmap, [137, 450, 600, 1], composite({ rgb: [7, 7, 7], alpha: 0.18 }, hair));
    fillBox(bitmap, [150, 650, 300, 1], [200, 0, 0]);
    const found = byRule(lintRecord(ctx, r, { bitmap }), 'lines/law');
    expect(found.map((f) => f.evidence.text)).toEqual([
      'two hair and hair lines 3 px apart',
      'a 600 px line in rgb(200, 0, 0)',
      'a 600 px line in rgb(173, 173, 173): hair drawn over hair',
    ]);
    expect(found[0]).toMatchObject({
      blockId: 'rows',
      evidence: { box: [137, 200, 1326, 4], measured: { distance: 3 } },
    });
    expect(found[1]?.evidence.box).toEqual([137, 400, 600, 1]);
    expect(new Set(found.map((f) => f.id)).size).toBe(found.length);
  });

  test('vertical lines are read too, and paper, thick rules and short runs are not lines', () => {
    const bitmap = sheet('light');
    fillBox(bitmap, [500, 129, 1, 300], hair);
    fillBox(bitmap, [503, 129, 1, 300], hair);
    fillBox(bitmap, [137, 500, 1326, 3], [200, 0, 0]);
    fillBox(bitmap, [137, 520, 40, 1], [200, 0, 0]);
    const found = byRule(lintRecord(ctx, r, { bitmap }), 'lines/law');
    expect(found.map((f) => f.evidence.text)).toEqual(['two hair and hair lines 3 px apart']);
    expect(found[0]?.evidence.box).toEqual([500, 129, 4, 300]);
  });

  test('a dark sheet reads its own hair composite', () => {
    const dark = record('lines', 'dark', {
      blocks: { rows: { type: 'rows', box: [137, 129, 1326, 300] } },
    });
    const bitmap = sheet('dark');
    const darkHair: Rgb = onPaper('dark', 'hair');
    fillBox(bitmap, [137, 200, 1326, 1], darkHair);
    fillBox(bitmap, [137, 202, 1326, 1], onPaper('dark', 'hair-soft'));
    const found = byRule(lintRecord(ctx, dark, { bitmap }), 'lines/law');
    expect(found.map((f) => f.evidence.text)).toEqual(['two hair and hair-soft lines 2 px apart']);
  });
});

describe('dia/label-clearance on a raw svg', () => {
  test('labels on or within 12 px of a stroke are reported with sheet boxes; a far label is not', () => {
    const r = record('raw', 'light', {
      blocks: { raw: { type: 'dia', box: [700, 129, 600, 300], fontSize: 18 } },
    });
    const found = byRule(lintRecord(ctx, r, { bitmap: null }), 'dia/label-clearance');
    expect(found.map((f) => f.evidence.text)).toEqual(['Near', 'Inside']);
    expect(found[0]).toMatchObject({
      blockId: 'raw',
      path: '/slots/right/0/svg#text-0',
      evidence: { box: [802, 264, 42, 20], measured: { clearance: 1.5, scale: 1 } },
    });
    expect(found[1]?.evidence.measured?.clearance).toBeCloseTo(9.5, 1);
  });

  test('the measured box sets the scale: at half size the same label is closer, a declared diagram is left to the static rule', () => {
    const half = record('raw', 'light', {
      blocks: { raw: { type: 'dia', box: [700, 129, 300, 150] } },
    });
    const found = byRule(lintRecord(ctx, half, { bitmap: null }), 'dia/label-clearance');
    expect(found.map((f) => f.evidence.measured?.scale)).toEqual([0.5, 0.5]);
    expect(found[1]?.evidence.measured?.clearance).toBeCloseTo(4.8, 1);
    expect(found[1]?.evidence.box).toEqual([905, 157, 26, 9]);
    const declared = record('thumb', 'light', {
      blocks: { big: { type: 'dia', box: [700, 129, 600, 300] } },
    });
    expect(byRule(lintRecord(ctx, declared, { bitmap: null }), 'dia/label-clearance')).toEqual([]);
  });
});

describe('every rendered finding', () => {
  test('carries the table severity and kind, a theme, a block where one exists, and a stable id', () => {
    const bitmap = sheet('light');
    const records = [
      record('stretched', 'light', {
        rasters: [
          { blockId: 'shot', kind: 'shot', file: '', box: [700, 129, 760, 300], alpha: false },
        ],
      }),
      record('misaligned', 'light', {
        blocks: {
          a: { type: 'rows', box: [137, 300, 600, 120] },
          b: { type: 'rows', box: [836, 305, 600, 120] },
        },
      }),
      record('raw', 'light', { blocks: { raw: { type: 'dia', box: [700, 129, 600, 300] } } }),
      record('contrast', 'light', {
        blocks: {
          cap: {
            type: 'paragraph',
            box: [137, 200, 600, 22],
            fontSize: 15,
            color: `rgb(${TITANIUM.join(', ')})`,
          },
        },
      }),
    ];
    const findings = records.flatMap((r) => lintRecord(ctx, r, { bitmap }));
    expect(findings.length).toBeGreaterThanOrEqual(5);
    for (const f of findings) {
      expect(f.severity).toBe(RULES[f.rule].severity);
      expect(f.kind).toBe(RULES[f.rule].kind);
      expect(f.theme).toBe('light');
      expect(f.evidence.box).toBeDefined();
      expect(f.id).toBe(
        [f.rule, f.slideId, f.blockId ?? '', f.path ?? '', f.theme ?? ''].join('|'),
      );
    }
    expect(new Set(findings.map((f) => f.id)).size).toBe(findings.length);
    expect(findings.every((f) => f.blockId)).toBe(true);
  });
});
