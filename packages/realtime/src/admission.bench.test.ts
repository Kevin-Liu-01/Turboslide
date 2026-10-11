import { describe, expect, it } from 'vitest';

import type { DeckDocument } from '@turboslide/schema/deck';
import type { Mutation } from '@turboslide/schema/mutations';
import { plainLength } from '@turboslide/schema/text';
import type { Text } from '@turboslide/schema/text';

import { copiedDocument, gtDocument } from './admission-decks.ts';
import { landCandidate } from './room-core.ts';
import type { AdmissionMode } from './room-core.ts';

// cost.admission.cpu-per-entry (hardening HR-RT#5a, HARDENING.md 8.4): the CPU one typed entry
// costs the admission, read with process.cpuUsage, so it reads at any load (the load is printed
// beside it). The budget is 1 ms per entry with `incremental` on GT (85 slides) and on its 850
// slide copy; `full` is read beside it as the record of what the flag saves. Each reading is the
// smallest of three rounds of 200 entries, so another process's burst on a shared machine does
// not read as the admission's cost.

const ENTRIES = 200;

/** A person typing one letter at a time at the end of the content-rule paragraph. */
function typing(document: DeckDocument, slideId: string, count: number): Mutation[][] {
  const slide = document.slides[slideId] as {
    slots?: Record<string, { id: string; text?: unknown }[]>;
  };
  const block = Object.values(slide.slots ?? {})
    .flat()
    .find((row) => row.id === 'p1');
  if (block === undefined || typeof block.text !== 'string') throw new Error('no paragraph');
  const start = plainLength(block.text as Text);
  return Array.from({ length: count }, (_, i) => [
    {
      op: 'text.splice',
      slideId,
      blockId: 'p1',
      path: '/text',
      at: start + i,
      remove: 0,
      insert: 'x',
    },
  ]);
}

/** CPU milliseconds per admitted entry over `entries`, the running document carried as the admission carries it. */
function cpuPerEntry(base: DeckDocument, entries: Mutation[][], mode: AdmissionMode): number {
  let document = base;
  // warm the JIT on a copy of the first entries
  for (const mutations of entries.slice(0, 10))
    landCandidate(document, { opId: 'w', kind: 'edit', mutations }, () => true, { mode });
  const before = process.cpuUsage();
  for (const [n, mutations] of entries.entries()) {
    const placed = landCandidate(
      document,
      { opId: `c:${n}`, kind: 'edit', mutations },
      () => true,
      { mode },
    );
    if (!placed.ok)
      throw new Error(
        `entry ${n} was refused: ${placed.rejected.message ?? placed.rejected.reason}`,
      );
    document = placed.document;
  }
  const used = process.cpuUsage(before);
  return (used.user + used.system) / 1000 / entries.length;
}

describe('cost.admission.cpu-per-entry', () => {
  const gt = gtDocument();
  const x10 = copiedDocument(gt, 10);
  it('admits a typed entry in at most 1 ms of CPU with incremental, on GT and on 850 slides', async () => {
    const { loadavg } = await import('node:os');
    const readings: string[] = [];
    for (const [name, document] of [
      ['GT', gt],
      ['x10', x10],
    ] as const) {
      const entries = typing(document, 'content-rule', ENTRIES);
      const incremental = Math.min(
        ...[0, 1, 2].map(() => cpuPerEntry(document, entries, 'incremental')),
      );
      const full = cpuPerEntry(document, typing(document, 'content-rule', 20), 'full');
      readings.push(
        `${name}: incremental ${incremental.toFixed(3)} ms, full ${full.toFixed(2)} ms of CPU per entry`,
      );
      expect(incremental, `${name} incremental`).toBeLessThanOrEqual(1);
    }
    console.log(`${readings.join('; ')} (load ${loadavg()[0]?.toFixed(0) ?? 'unknown'})`);
  }, 600_000);
});
