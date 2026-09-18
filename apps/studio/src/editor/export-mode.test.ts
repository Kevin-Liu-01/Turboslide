import { describe, expect, it } from 'vitest';

import { EXPORT_MODE_WAIT_MS, createExportModeGate } from './export-mode';

// The wait behind export.run's choice of path (VERIFICATION C3S-F7): a download started before
// the capabilities answered used to take the polled path on a hosted studio, whose poll can land
// on an instance that never held the job.

describe('createExportModeGate', () => {
  it('answers the capabilities once they land, before the wait runs out', async () => {
    const gate = createExportModeGate();
    let slept = 0;
    // a sleep that never resolves: the answer has to come from the capabilities
    const read = gate.read({
      waitMs: 5000,
      sleep: (ms) => {
        slept = ms;
        return new Promise<void>(() => undefined);
      },
    });
    expect(gate.known()).toBe(false);
    gate.set(true, 3);
    expect(await read).toEqual({ sync: true, batchSize: 3 });
    expect(slept).toBe(5000);
    expect(gate.known()).toBe(true);
  });

  it('answers at once when the capabilities are known', async () => {
    const gate = createExportModeGate();
    gate.set(true);
    let slept = false;
    expect(
      await gate.read({
        sleep: async () => {
          slept = true;
        },
      }),
    ).toEqual({ sync: true, batchSize: 0 });
    expect(slept).toBe(false);
  });

  it('takes the polled path after the wait when no answer came (a failed capabilities call)', async () => {
    const gate = createExportModeGate();
    const slept: number[] = [];
    expect(
      await gate.read({
        waitMs: 5000,
        sleep: async (ms) => {
          slept.push(ms);
        },
      }),
    ).toEqual({ sync: false, batchSize: 0 });
    expect(slept).toEqual([5000]);
    expect(gate.known()).toBe(false);
  });

  it("the wait sits well under the export rows' 30 s download bound", () => {
    expect(EXPORT_MODE_WAIT_MS).toBeLessThan(30_000);
  });
});
