// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import type { MeasuredBoxes } from '@turboslide/viewer/Gestures';

import { remoteCaretBox, runElementOf, textPosition } from '../presence/remote-caret';

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

  it('answers the run box start for an unmeasurable range and null for a missing run', () => {
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
});
