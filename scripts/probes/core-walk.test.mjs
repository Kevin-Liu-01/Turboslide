import { describe, expect, it } from 'vitest';

import { probeRows } from './core-matrix.mjs';
import { AREAS, CLEANUP_IDS, WALK_IDS, declaredIds, renderMatrix } from './core-walk/index.mjs';

// The core walk's coverage of the matrix (docs/FOCUS.md 6.1): every row whose driver is
// `probe --core` is declared by exactly one area module (or the finally block), and no area
// declares a row the matrix does not hold or a row another driver carries. A probe row the walk
// never declares would read "no step" in a run, which fails the run; this test catches it before
// a run is started. The matrix table renderer is pinned on a small summary.

describe('the core walk declares every probe row once', () => {
  const declared = declaredIds();
  const probe = probeRows().map((row) => row.id);

  it('covers every probe --core row of the matrix', () => {
    const missing = probe.filter((id) => !declared.has(id));
    expect(missing, `probe rows with no declaring area: ${missing.join(', ')}`).toEqual([]);
  });

  it('declares no row outside the probe rows and none twice', () => {
    const probeSet = new Set(probe);
    const extra = [...declared.keys()].filter((id) => !probeSet.has(id));
    expect(extra, `declared ids that are not probe rows: ${extra.join(', ')}`).toEqual([]);
    const all = [...AREAS.flatMap((area) => area.IDS), ...CLEANUP_IDS, ...WALK_IDS];
    const seen = new Set();
    const twice = all.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
    expect(twice, `ids declared twice: ${twice.join(', ')}`).toEqual([]);
    expect(all.length).toBe(probe.length);
  });

  it('names each area once, with a run function', () => {
    const names = AREAS.map((area) => area.NAME);
    expect(new Set(names).size).toBe(names.length);
    for (const area of AREAS) expect(typeof area.run).toBe('function');
  });
});

describe('renderMatrix', () => {
  it('lists every row with its result and the verdict line', () => {
    const summary = {
      base: 'http://localhost:4364',
      startedAt: '2026-09-15T00:00:00.000Z',
      ms: 61_000,
      deckId: 'untitled-x',
      parked: { commit: null, parkedFeatures: ['shapes'] },
      consoleErrors: ['console: one'],
      core: {
        rows: 2,
        passed: 1,
        failed: 0,
        notDriven: 1,
        noStep: 0,
        exitCode: 0,
        verdict: { ok: true, failures: [] },
        untaggedFailures: [],
        table: [
          {
            id: 'decks.new.draft',
            feature: 'decks',
            today: 'works',
            result: 'passed',
            reason: '',
            steps: [1],
          },
          {
            id: 'shapes.move',
            feature: 'shapes',
            today: 'not driven',
            result: 'not driven',
            reason: 'setup failed: a | b',
            steps: [2],
          },
        ],
      },
    };
    const text = renderMatrix(summary);
    expect(text).toContain('| `decks.new.draft` | decks | works | passed |  | 1 |');
    expect(text).toContain(
      '| `shapes.move` | shapes | not driven | not driven | setup failed: a \\| b | 2 |',
    );
    expect(text).toContain('Verdict ok with the parked list shapes; exit 0');
    expect(text).toContain('## Console errors (1)');
  });
});
