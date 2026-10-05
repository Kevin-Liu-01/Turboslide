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

// The frame comparison of the objects round (docs/archive/rounds/OBJECTS.md 2.6, 6.4): the object's box against
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
    /* the bounding box of the turned corners is 707 by 707 (docs/archive/rounds/OBJECTS.md 2.2) */
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

// The polish round (docs/archive/rounds/POLISH.md 5.1): the pixel read and the boxes read of the frame capture,
// pure over a scripted shot.
import { boxGap, boxInside, boxIntersects, pixelAt, sampleBox } from './toolkit.mjs';

/** A 10 by 10 shot: black, with a white 4 by 4 square at 3,3 and one amber pixel at 9,9. */
const shot = {
  width: 10,
  height: 10,
  pixel: (x, y) =>
    x === 9 && y === 9
      ? [255, 191, 0]
      : x >= 3 && x < 7 && y >= 3 && y < 7
        ? [255, 255, 255]
        : [0, 0, 0],
};

describe('pixelAt', () => {
  it('reads a pixel of the shot and answers null outside it', () => {
    expect(pixelAt(shot, 0, 0)).toEqual({ rgb: [0, 0, 0], hex: '#000000' });
    expect(pixelAt(shot, 4.4, 3.6)).toEqual({ rgb: [255, 255, 255], hex: '#ffffff' });
    expect(pixelAt(shot, 9, 9).hex).toBe('#ffbf00');
    expect(pixelAt(shot, 10, 0)).toBeNull();
    expect(pixelAt(shot, -1, 0)).toBeNull();
    expect(pixelAt(null, 0, 0)).toBeNull();
  });
});

describe('sampleBox', () => {
  it('names the dominant colour of a box and the distinct colours it holds', () => {
    const inside = sampleBox(shot, { x: 3, y: 3, w: 4, h: 4 }, { step: 1 });
    expect(inside.count).toBe(16);
    expect(inside.distinct).toBe(1);
    expect(inside.dominant).toEqual({ hex: '#ffffff', share: 1 });
    const whole = sampleBox(shot, { x: 0, y: 0, w: 10, h: 10 }, { step: 1 });
    expect(whole.count).toBe(100);
    expect(whole.distinct).toBe(3);
    expect(whole.dominant.hex).toBe('#000000');
    expect(whole.dominant.share).toBe(0.83);
    expect(whole.colors.map((c) => c.hex)).toEqual(['#000000', '#ffffff', '#ffbf00']);
  });

  it('keeps an inset and answers an empty reading for a box outside the shot', () => {
    const inset = sampleBox(shot, { x: 2, y: 2, w: 6, h: 6 }, { step: 1, inset: 1 });
    expect(inset.count).toBe(16);
    expect(inset.dominant.hex).toBe('#ffffff');
    expect(sampleBox(shot, { x: 20, y: 20, w: 4, h: 4 }).count).toBe(0);
    expect(sampleBox(null, { x: 0, y: 0, w: 1, h: 1 }).count).toBe(0);
  });
});

describe('the box reads', () => {
  const a = { x: 0, y: 0, w: 10, h: 10 };
  it('tell an overlap from a touch and a gap', () => {
    expect(boxIntersects(a, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(boxIntersects(a, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
    expect(boxIntersects(a, { x: 9.5, y: 0, w: 10, h: 10 }, 1)).toBe(false);
    expect(boxIntersects(a, null)).toBe(false);
  });
  it('read a box inside another within a tolerance', () => {
    expect(boxInside({ x: 1, y: 1, w: 8, h: 8 }, a)).toBe(true);
    expect(boxInside({ x: 1, y: 1, w: 10, h: 8 }, a)).toBe(false);
    expect(boxInside({ x: 1, y: 1, w: 10, h: 8 }, a, 1)).toBe(true);
    expect(boxInside(null, a)).toBe(false);
  });
  it('measure the gap on each axis, negative over an overlap', () => {
    expect(boxGap(a, { x: 14, y: 0, w: 4, h: 4 })).toEqual({ dx: 4, dy: -4 });
    expect(boxGap(a, { x: 0, y: 12.5, w: 4, h: 4 })).toEqual({ dx: -4, dy: 2.5 });
    expect(boxGap(a, null)).toBeNull();
  });
});

// The paste row and the chrome row of the Round 1 follow-up, lane D (verify-r1.md finding 13): a
// paste onto a layout slide converts it in the same write and its placeholders gain a pos, so a
// list of positioned objects read before the paste answered the slide's heading `h` as the copy,
// and the step's Delete removed the heading. `before` is every block id now, and an object the
// walk made is deleted with Delete only while its own handles are drawn, else through
// block.remove.
function slidesToolkit(slides, { handles = [], filmstripFocused = false } = {}) {
  const calls = { press: [], invoke: [] };
  const read = (slideId) => slides.current[slideId];
  const positioned = (slideId) => {
    const out = [];
    const walk = (node) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === 'object') {
        if (typeof node.id === 'string' && typeof node.type === 'string' && node.pos)
          out.push({ id: node.id, type: node.type, pos: node.pos, block: node });
        Object.values(node).forEach(walk);
      }
    };
    walk(read(slideId));
    return out;
  };
  const lib = {
    sleep: async () => undefined,
    rand: () => 0,
    pollUntil: async (readFn, test) => {
      for (let i = 0; i < 5; i += 1) {
        const v = await readFn();
        if (test(v)) return v;
      }
      return readFn();
    },
    settled: async () => ({ revision: 7, sync: { pending: 0 } }),
    state: async () => ({ revision: 7, sync: { pending: 0 } }),
    slideJson: async (_page, slideId) => read(slideId),
    objectsOf: async (_page, slideId) => positioned(slideId),
    blockOf: async (_page, slideId, id) => positioned(slideId).find((o) => o.id === id) ?? null,
    slideOrder: async () => Object.keys(slides.current),
    handleControls: async () => handles,
    press: async (_page, key) => {
      calls.press.push(key);
      if (key === 'Delete' && slides.onDelete) slides.onDelete();
    },
    invoke: async (_page, action, input) => {
      calls.invoke.push({ action, input });
      return {};
    },
  };
  const t = createToolkit({
    page: { evaluate: async () => filmstripFocused },
    context: {},
    browser: {},
    BASE: 'http://localhost:0',
    headers: {},
    lib,
    report: { rows: [], results: new Map(), consoleErrors: [], isProbeId: () => true },
    options: {},
  });
  t.selectObject = async () => null;
  return { t, calls };
}

describe('the copy of a paste onto a layout slide', () => {
  const layout = {
    id: 'blank-1-6fdb',
    slots: {
      main: [
        { id: 'h', type: 'heading', text: '' },
        { id: 'b', type: 'text', text: 'x' },
      ],
    },
  };
  const converted = {
    id: 'blank-1-6fdb',
    slots: {
      main: [
        { id: 'h', type: 'heading', text: '', pos: { x: 761.5, y: 161.7, w: 77, h: 76.3 } },
        { id: 'b', type: 'text', text: 'x', pos: { x: 80, y: 300, w: 600, h: 80 } },
        { id: 'a1-3', type: 'text', text: 'a1', pos: { x: 152, y: 150, w: 240, h: 150 } },
      ],
    },
  };

  it('reads the placeholder as the copy when `before` lists positioned objects alone', async () => {
    const slides = { current: { 'blank-1-6fdb': layout } };
    const { t } = slidesToolkit(slides);
    const before = await t.objectIds('blank-1-6fdb');
    slides.current = { 'blank-1-6fdb': converted };
    expect((await t.newObjectAfter('blank-1-6fdb', before, 10))?.id).toBe('h');
  });

  it('answers the pasted copy when `before` is every block id', async () => {
    const slides = { current: { 'blank-1-6fdb': layout } };
    const { t } = slidesToolkit(slides);
    const before = await t.allBlockIds('blank-1-6fdb');
    expect(before).toEqual(['h', 'b']);
    slides.current = { 'blank-1-6fdb': converted };
    const copy = await t.newObjectAfter('blank-1-6fdb', before, 10);
    expect(copy?.id).toBe('a1-3');
    expect(copy?.pos).toEqual({ x: 152, y: 150, w: 240, h: 150 });
  });
});

describe('t.removeOwnObject', () => {
  const slide = {
    id: 's',
    slots: { main: [{ id: 'copy', type: 'text', pos: { x: 0, y: 0, w: 10, h: 10 } }] },
  };

  it('never presses Delete when the object has no handles of its own on the overlay', async () => {
    const slides = { current: { s: slide, t2: { id: 't2' } } };
    const { t, calls } = slidesToolkit(slides, { handles: ['handle.other.move'] });
    const said = await t.removeOwnObject('s', 'copy');
    expect(calls.press).toEqual([]);
    expect(calls.invoke).toEqual([
      { action: 'block.remove', input: { baseRevision: 7, slideId: 's', blockId: 'copy' } },
    ]);
    expect(said).toMatch(/block\.remove/);
  });

  it('never presses Delete while the filmstrip holds the focus, though the copy is drawn selected', async () => {
    /* lane D's filmstrip-paste.mjs: after Cmd+V with a card focused the copy's handles are drawn,
       the card keeps the focus, and Delete removes the slide */
    const slides = { current: { s: slide } };
    slides.onDelete = () => {
      slides.current = {};
    };
    const { t, calls } = slidesToolkit(slides, {
      handles: ['handle.copy.move'],
      filmstripFocused: true,
    });
    const said = await t.removeOwnObject('s', 'copy');
    expect(calls.press).toEqual([]);
    expect(calls.invoke.map((c) => c.action)).toEqual(['block.remove']);
    expect(said).toMatch(/block\.remove/);
  });

  it('deletes with Delete while its own move handle is drawn', async () => {
    const slides = { current: { s: slide } };
    slides.onDelete = () => {
      slides.current = { s: { id: 's', slots: { main: [] } } };
    };
    const { t, calls } = slidesToolkit(slides, { handles: ['handle.copy.move'] });
    expect(await t.removeOwnObject('s', 'copy')).toBe('deleted with Delete');
    expect(calls.press).toEqual(['Delete']);
    expect(calls.invoke).toEqual([]);
  });
});
