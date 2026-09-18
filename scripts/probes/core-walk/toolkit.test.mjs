import { describe, expect, it } from 'vitest';

import { createToolkit } from './toolkit.mjs';

// The toolkit's stable revision read (b3 C2-R4 and C3-R4; VERIFICATION.md C2-F21): on the memory
// tier the tab's revision moves 2 s after the last op, when the checkpointer commits, so a read
// that settled on two agreeing reads a second apart returned before the previous row's write had
// landed as a revision and the row after it read that checkpoint as its own write. The read now
// waits for three more agreeing reads after the settled one, and starts over when a read moves.
// The page is a script of revisions; `sleep` is instant.

function toolkitOver(revisions) {
  const script = [...revisions];
  const reads = [];
  const next = () => {
    const revision = script.length > 1 ? script.shift() : script[0];
    reads.push(revision);
    return { revision, sync: { pending: 0 } };
  };
  const lib = {
    sleep: async () => undefined,
    rand: () => 0,
    settled: async () => next(),
    state: async () => next(),
  };
  const report = { rows: [], results: new Map(), consoleErrors: [], isProbeId: () => true };
  const t = createToolkit({
    page: {},
    context: {},
    browser: {},
    BASE: 'http://localhost:0',
    headers: {},
    lib,
    report,
    options: {},
  });
  return { t, reads };
}

describe('t.stableRevision', () => {
  it('returns once three reads after the settled one agree', async () => {
    const { t, reads } = toolkitOver([41]);
    expect(await t.stableRevision()).toBe(41);
    expect(reads).toEqual([41, 41, 41, 41]);
  });

  it('starts the quiet window again when the checkpoint lands during it', async () => {
    /* settled at 141; the previous row's redo lands as 142 two reads later */
    const { t, reads } = toolkitOver([141, 141, 142, 142, 142, 142]);
    expect(await t.stableRevision()).toBe(142);
    expect(reads).toEqual([141, 141, 142, 142, 142, 142]);
  });

  it('gives up at the bound with the last revision read', async () => {
    let n = 0;
    const lib = {
      sleep: async () => undefined,
      rand: () => 0,
      settled: async () => ({ revision: (n += 1) }),
      state: async () => ({ revision: (n += 1) }),
    };
    const t = createToolkit({
      page: {},
      context: {},
      browser: {},
      BASE: 'http://localhost:0',
      headers: {},
      lib,
      report: { rows: [], results: new Map(), consoleErrors: [], isProbeId: () => true },
      options: {},
    });
    const revision = await t.stableRevision(30);
    expect(revision).toBe(n);
    expect(n).toBeGreaterThan(1);
  });
});
