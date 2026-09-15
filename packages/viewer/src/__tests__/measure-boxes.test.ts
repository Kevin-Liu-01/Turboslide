// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { measureBoxes } from '../Freeform';

// The stage's measurer (Freeform.tsx measureBoxes) reads every box against the slide body, not the
// stage: the sheet's slide change animates the body from translateY(6px) and the layout effect
// measures on its first frame, so a box read against the stage sat 6 px low until the next edit
// and the overlay's ring and chip stood 6 px under the handles (build-4/hotfix-3.md cause R7).

type Rect = { left: number; top: number; width: number; height: number };

function rectOf(el: Element, rect: Rect): void {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height }),
  });
}

function sheet(scale: number, bodyShift: { x: number; y: number }) {
  const stage = document.createElement('div');
  stage.className = 'ts-stage';
  const body = document.createElement('div');
  body.className = 'pt-slide';
  stage.append(body);
  body.innerHTML =
    '<section class="slide is-on" data-kind="content"><div class="in"><div class="freeform" data-slot="main">' +
    '<div class="free" data-free="rect" style="left:120px;top:120px;width:240px;height:150px">' +
    '<div class="shape-block" data-block="rect" data-type="shape"></div></div></div></div></section>';
  const origin = { left: 284, top: 140 };
  rectOf(stage, { ...origin, width: 1600 * scale, height: 900 * scale });
  rectOf(body, {
    left: origin.left + bodyShift.x * scale,
    top: origin.top + bodyShift.y * scale,
    width: 1600 * scale,
    height: 900 * scale,
  });
  const wrapper = body.querySelector('.free[data-free="rect"]');
  const block = body.querySelector('[data-block="rect"]');
  if (!wrapper || !block) throw new Error('fixture');
  const pos = { x: 120, y: 120, w: 240, h: 150 };
  const at = {
    left: origin.left + (pos.x + bodyShift.x) * scale,
    top: origin.top + (pos.y + bodyShift.y) * scale,
    width: pos.w * scale,
    height: pos.h * scale,
  };
  rectOf(wrapper, at);
  rectOf(block, at);
  return body;
}

describe('measureBoxes', () => {
  it('reads a positioned block’s wrapper at its pos in sheet pixels at any stage scale', () => {
    for (const scale of [0.5, 1, 2]) {
      const boxes = measureBoxes(sheet(scale, { x: 0, y: 0 }));
      expect(boxes?.blocks['rect'], `scale ${scale}`).toEqual([120, 120, 240, 150]);
    }
  });

  it('is unmoved by the body’s slide change translate, so the ring and the handles agree', () => {
    for (const scale of [0.5, 1, 2]) {
      const boxes = measureBoxes(sheet(scale, { x: 0, y: 6 }));
      expect(boxes?.blocks['rect'], `scale ${scale}`).toEqual([120, 120, 240, 150]);
    }
  });

  it('answers null before the stage has a size', () => {
    const body = sheet(1, { x: 0, y: 0 });
    rectOf(body.parentElement as HTMLElement, { left: 0, top: 0, width: 0, height: 0 });
    expect(measureBoxes(body)).toBeNull();
  });
});
