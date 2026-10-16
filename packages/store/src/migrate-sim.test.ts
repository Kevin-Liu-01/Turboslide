// The race simulation of the storage migration's window (migrate-sim.ts) over a share of its
// seeds: SIM_SEEDS (200 by default) from SIM_FROM (0). The reading of record, 20,000 seeds, runs
// as `node packages/store/src/migrate-sim.ts <from> <to>` in parallel processes (docs/hosting.md 10).
import { describe, expect, it } from 'vitest';

import { simulateSeeds } from './migrate-sim.ts';

const from = Number(process.env.SIM_FROM ?? 0);
const count = Number(process.env.SIM_SEEDS ?? 200);

describe('the window under racing writes, clock skew and stopped operators', () => {
  it(`keeps every accepted write, reads no private document early and ends every freeze (${count} seeds)`, async () => {
    const result = await simulateSeeds(from, from + count);
    expect(result.failed.map((report) => [report.seed, report.violations])).toEqual([]);
    // the seeds reach every outcome: a switch, a rollback, a stop, an unfreeze, a verify that failed
    expect(Object.keys(result.stories).join('\n')).toMatch(/prod: switched/);
    expect(Object.keys(result.stories).join('\n')).toMatch(/prod: rolled back/);
    expect(Object.keys(result.stories).join('\n')).toMatch(/preview: switched/);
    expect(Object.keys(result.stories).join('\n')).toMatch(/stopped before/);
    expect(Object.keys(result.stories).join('\n')).toMatch(/unfroze before the switch/);
    expect(result.refused).toBeGreaterThan(0);
  }, 600_000);
});
