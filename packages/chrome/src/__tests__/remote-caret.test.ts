// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import type { MeasuredBoxes } from '@turboslide/viewer/Gestures';

import { remoteCaretBox, runElementOf, runKeyOf, textPosition } from '../presence/remote-caret';

// The remote caret's measurement (gslides-parity SPEC-3 4.4; research 11 6.5): the run element
// by its data-run key, the text node a plain offset lands on (code points, not UTF-16 units),
// and the caret box in sheet pixels from the run's measured box; a run the sheet lacks answers
// null, an empty run the run's start.

function sheet(html: string): HTMLElement {
  const body = document.createElement('div');
  body.innerHTML = html;
  document.body.appendChild(body);
  return body;
}

const boxes: MeasuredBoxes = {
  blocks: { h: [100, 200, 600, 80] },
  slots: {},
  runs: { 'h/text': [100, 200, 600, 80] },
  parts: {},
};

describe('runElementOf and textPosition', () => {
  it('finds the run by its key and lands the offset in code points', () => {
    const body = sheet('<p data-block="h" data-run="h/text">ab<b>cd</b>😀ef</p>');
    const run = runElementOf(body, { blockId: 'h', path: 'text', offset: 0 });
    expect(run?.tagName).toBe('P');
    const at3 = textPosition(run!, 3);
    expect(at3?.node.textContent).toBe('cd');
    expect(at3?.offset).toBe(1);
    /* the emoji is one code point and two UTF-16 units */
    const at5 = textPosition(run!, 5);
    expect(at5?.node.textContent).toBe('😀ef');
    expect(at5?.offset).toBe(2);
    const past = textPosition(run!, 99);
    expect(past?.node.textContent).toBe('😀ef');
    body.remove();
  });

  it('answers the run box start for an empty run and null for a missing run', () => {
    const body = sheet('<p data-block="h" data-run="h/text"></p>');
    const box = remoteCaretBox(body, boxes, { blockId: 'h', path: 'text', offset: 4 }, 0.5);
    expect(box?.[0]).toBe(100);
    expect(box?.[1]).toBe(200);
    expect(box?.[3]).toBe(80);
    expect(
      remoteCaretBox(body, boxes, { blockId: 'nope', path: 'text', offset: 0 }, 0.5),
    ).toBeNull();
    body.remove();
  });

  it('finds the run from a caret whose path is a JSON pointer, as the presence state carries it (audit-people.md defect 4; R2)', () => {
    const body = sheet('<h1 data-block="heading" data-run="heading/text">alphabravo</h1>');
    expect(runKeyOf({ blockId: 'heading', path: '/text' })).toBe('heading/text');
    expect(runKeyOf({ blockId: 'heading', path: 'text' })).toBe('heading/text');
    const run = runElementOf(body, { blockId: 'heading', path: '/text', offset: 3 });
    expect(run?.tagName).toBe('H1');
    /* the block element that is the run itself answers the fallback too */
    const fallback = runElementOf(body, { blockId: 'heading', path: '/other', offset: 0 });
    expect(fallback?.tagName).toBe('H1');
    const runBoxes: MeasuredBoxes = {
      blocks: { heading: [100, 200, 600, 80] },
      slots: {},
      runs: { 'heading/text': [110, 210, 580, 60] },
      parts: {},
    };
    /* an empty run keyed by the pointer path reads the run box, not the block box */
    const empty = sheet('<h1 data-block="heading" data-run="heading/text"></h1>');
    expect(
      remoteCaretBox(empty, runBoxes, { blockId: 'heading', path: '/text', offset: 0 }, 0.5),
    ).toEqual([110, 210, 4, 60]);
    empty.remove();
    body.remove();
  });

  it('measures a caret at the end of the text from the right edge of the character before it when the collapsed range has no rectangle (Chromium; R2)', () => {
    const body = sheet('<p data-block="h" data-run="h/text">alphabravo</p>');
    const run = body.querySelector('p')!;
    const original = document.createRange.bind(document);
    /* the engine's behaviour: a collapsed range answers no rectangle, a range over characters
       answers one 12 px wide per character from the run's left edge */
    document.createRange = () => {
      const range = original();
      const rects = (): DOMRect[] => {
        if (range.collapsed) return [];
        const from = range.startOffset;
        const to = range.endOffset;
        return [new DOMRect(10 + from * 12, 20, (to - from) * 12, 30)];
      };
      range.getClientRects = () => rects() as unknown as DOMRectList;
      range.getBoundingClientRect = () => rects()[0] ?? new DOMRect(0, 0, 0, 0);
      return range;
    };
    run.getBoundingClientRect = () => new DOMRect(10, 20, 200, 30);
    try {
      const atEnd = remoteCaretBox(body, boxes, { blockId: 'h', path: 'text', offset: 10 }, 0.5);
      /* the right edge of "o", the tenth character: 10 + 10 * 12 = 130, 120 px into the run */
      expect(atEnd).toEqual([100 + 120 / 0.5, 200, 2 / 0.5, 30 / 0.5]);
      const mid = remoteCaretBox(body, boxes, { blockId: 'h', path: 'text', offset: 3 }, 0.5);
      expect(mid?.[0]).toBe(100 + (3 * 12) / 0.5);
      const atStart = remoteCaretBox(body, boxes, { blockId: 'h', path: 'text', offset: 0 }, 0.5);
      expect(atStart?.[0]).toBe(100);
    } finally {
      document.createRange = original;
    }
    body.remove();
  });

  it('answers null, not the run start, when a run with text cannot measure its range (docs/REALTIME.md 3.5; R2)', () => {
    /* jsdom lays nothing out: every client rect is empty, which is the mid render case the
       chrome keeps the last box for (keptCaretBox) instead of drawing offset 0 */
    const body = sheet('<p data-block="h" data-run="h/text">alphabravo</p>');
    expect(remoteCaretBox(body, boxes, { blockId: 'h', path: 'text', offset: 10 }, 0.5)).toBeNull();
    body.remove();
  });
});
