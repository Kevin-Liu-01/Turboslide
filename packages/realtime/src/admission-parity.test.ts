import { describe, expect, it } from 'vitest';

import type { DeckDocument } from '@turboslide/schema/deck';
import { canonicalJson } from '@turboslide/schema/json';

import { copiedDocument, deepFreeze, entryOf, gtDocument, random } from './admission-decks.ts';
import { landCandidate } from './room-core.ts';
import type { AdmissionDisagreement } from './room-core.ts';

// admission.incremental-parity (hardening HR-RT#5a, RUST-1, CRIT-M17; HARDENING.md 6.2): seeded
// sequences of entries on GT and on its 850 slide copy, each entry placed by today's full
// admission and by the incremental one on the same deep frozen base, so a write through a shared
// reference throws. The two answer the same `ok`, `reason`, `message`, placed mutations and
// document; the full answer is the next entry's base. ADMISSION_PARITY_SEQUENCES sets the count
// of sequences on GT and ADMISSION_PARITY_SEQUENCES_X10 on the copy (the push's readings are in
// docs/hardening/build/RT.md); the defaults keep the suite short.

const SEQUENCES = Number(process.env['ADMISSION_PARITY_SEQUENCES'] ?? 0);
const SEQUENCES_X10 = Number(process.env['ADMISSION_PARITY_SEQUENCES_X10'] ?? 0);
const ENTRIES_PER_SEQUENCE = 4;

type Outcome = ReturnType<typeof landCandidate>;

function described(outcome: Outcome): string {
  if (!outcome.ok) return `refused ${outcome.rejected.reason}: ${outcome.rejected.message ?? ''}`;
  return `placed ${canonicalJson(outcome.mutations)} on ${canonicalJson(outcome.document)}`;
}

/** Runs the sequences of one deck and answers the first differences, as sentences. */
function sequences(
  base: DeckDocument,
  count: number,
  firstSeed: number,
): { differences: string[]; entries: number; refused: number } {
  const differences: string[] = [];
  let entries = 0;
  let refused = 0;
  for (let seed = firstSeed; seed < firstSeed + count && differences.length < 3; seed += 1) {
    const next = random(seed);
    let document = deepFreeze(base);
    for (let step = 0; step < ENTRIES_PER_SEQUENCE; step += 1) {
      const mutations = entryOf(document, next);
      const candidate = { opId: `c:${seed}:${step}`, kind: 'edit' as const, mutations };
      const full = landCandidate(document, candidate, () => true, { mode: 'full' });
      let incremental: Outcome;
      try {
        incremental = landCandidate(document, candidate, () => true, { mode: 'incremental' });
      } catch (error) {
        differences.push(
          `seed ${seed} step ${step}: the incremental placement threw ${String(error)} on ${canonicalJson(mutations)}`,
        );
        break;
      }
      entries += 1;
      if (described(full) !== described(incremental)) {
        differences.push(
          `seed ${seed} step ${step} ${canonicalJson(mutations).slice(0, 400)}: full ${described(full).slice(0, 300)}, incremental ${described(incremental).slice(0, 300)}`,
        );
        break;
      }
      if (!full.ok) {
        refused += 1;
        continue;
      }
      document = deepFreeze(full.document);
    }
  }
  return { differences, entries, refused };
}

describe('admission.incremental-parity', () => {
  const gt = gtDocument();

  it('places and judges every entry of the seeded sequences on GT as the full admission does', () => {
    const count = SEQUENCES || 150;
    const run = sequences(gt, count, 1);
    console.log(
      `admission parity GT: ${count} sequences, ${run.entries} entries, ${run.refused} refused, ${run.differences.length} differences`,
    );
    expect(run.differences).toEqual([]);
    // the generator refuses some on purpose, and admits most
    expect(run.refused).toBeGreaterThan(0);
    expect(run.refused).toBeLessThan(run.entries);
  }, 3_600_000);

  it('places and judges every entry of the seeded sequences on the 850 slide copy as the full admission does', () => {
    const count = SEQUENCES_X10 || 15;
    const run = sequences(copiedDocument(gt, 10), count, 100_001);
    console.log(
      `admission parity x10: ${count} sequences, ${run.entries} entries, ${run.refused} refused, ${run.differences.length} differences`,
    );
    expect(run.differences).toEqual([]);
  }, 3_600_000);

  it('shadow decides with the full placement and reports a disagreement once, with the op kinds', () => {
    const disagreements: AdmissionDisagreement[] = [];
    const document = deepFreeze(gt);
    const candidate = {
      opId: 'c:1',
      kind: 'edit' as const,
      mutations: [
        {
          op: 'text.splice' as const,
          slideId: 'title',
          blockId: 'heading',
          path: '/heading',
          at: 0,
          remove: 0,
          insert: 'A ',
        },
      ],
    };
    const shadow = landCandidate(document, candidate, () => true, {
      mode: 'shadow',
      onDisagree: (row) => disagreements.push(row),
    });
    const full = landCandidate(document, candidate, () => true, { mode: 'full' });
    expect(described(shadow)).toBe(described(full));
    expect(disagreements).toEqual([]);
  });
});
