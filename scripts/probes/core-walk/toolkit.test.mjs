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

// The frame comparison of the objects round (docs/OBJECTS.md 2.6, 6.4): the object's box against
// the ring's within 1 px, a text ring's 10 px outset removed; the corners of a turned box; the
// readouts of a capture's steps.
import { boxCorners, compareFrame, cornersDistance, readoutsOf } from './toolkit.mjs';

describe('compareFrame', () => {
  it('passes a ring on the object within 1 px and names the differences past it', () => {
    const object = { x: 300, y: 200, w: 320, h: 200 };
    expect(compareFrame(object, { x: 300.4, y: 199.6, w: 320.8, h: 200 })).toEqual({
      ok: true,
      dx: -0.4,
      dy: 0.4,
      dw: -0.8,
      dh: 0,
    });
    const off = compareFrame(object, { x: 300, y: 200, w: 340, h: 200 });
    expect(off.ok).toBe(false);
    expect(off.dw).toBe(-20);
  });

  it('removes the text ring outset before comparing', () => {
    const object = { x: 400, y: 300, w: 480, h: 64 };
    const ring = { x: 390, y: 290, w: 500, h: 84 };
    expect(compareFrame(object, ring).ok).toBe(false);
    expect(compareFrame(object, ring, { outset: 10 })).toEqual({
      ok: true,
      dx: 0,
      dy: 0,
      dw: 0,
      dh: 0,
    });
  });

  it('answers a reason when a box is missing', () => {
    expect(compareFrame(null, { x: 0, y: 0, w: 1, h: 1 }).reason).toBe('no object');
    expect(compareFrame({ x: 0, y: 0, w: 1, h: 1 }, null).reason).toBe('no ring');
  });
});

describe('boxCorners and cornersDistance', () => {
  it('turns a 680 by 320 box by 45 degrees about its centre', () => {
    const corners = boxCorners({ x: 0, y: 0, w: 680, h: 320 }, 45);
    /* the bounding box of the turned corners is 707 by 707 (docs/OBJECTS.md 2.2) */
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    expect(Math.round(Math.max(...xs) - Math.min(...xs))).toBe(707);
    expect(Math.round(Math.max(...ys) - Math.min(...ys))).toBe(707);
    expect(cornersDistance(corners, [...corners].reverse())).toBe(0);
    const upright = boxCorners({ x: -13.6, y: -193.6, w: 707.1, h: 707.1 }, 0);
    expect(cornersDistance(corners, upright)).toBeGreaterThan(100);
    expect(cornersDistance(corners, [])).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('readoutsOf', () => {
  it('reads every step and the release', () => {
    const capture = {
      frames: [
        { tag: 'before', facts: { readout: null } },
        { tag: 'down', facts: { readout: null } },
        { tag: 'step1', facts: { readout: '27 × 17' } },
        { tag: 'step2', facts: { readout: '53 × 33' } },
        { tag: 'up+0', facts: { readout: '53 × 33' } },
        { tag: 'up+400', facts: { readout: null } },
      ],
    };
    expect(readoutsOf(capture, /^\d+ × \d+$/)).toEqual({
      steps: ['27 × 17', '53 × 33'],
      every: true,
      afterRelease: null,
    });
    expect(readoutsOf(capture, /°$/).every).toBe(false);
    expect(readoutsOf(null, /x/).every).toBe(false);
  });
});
