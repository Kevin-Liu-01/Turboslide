// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { isChromeControlTarget } from '../Editor';

// The stage's edit keys and the chrome's controls (this round): a key pressed on an inspector
// button, a palette swatch, a field or a menu row is that control's, so Enter activates the
// button instead of opening the selected block's text (measured on the editor depth preview:
// Enter on block.box.fill.plate started inline editing). A key on the stage, on the page body
// or on an overlay handle keeps the stage's handling.

function tree(): { stage: HTMLElement; inspector: HTMLElement; overlay: HTMLElement } {
  document.body.innerHTML = `
    <div class="ts-stagewrap ts-sheet ts-editor" id="stage">
      <div class="pt-slide"><p data-block="p"><span data-run="p/text">Text</span></p></div>
    </div>
    <div class="ts-overlay ts-chrome" id="overlay">
      <button type="button" class="ts-select-chip" data-control="handle.p.move">chip</button>
    </div>
    <aside class="ts-inspector ts-chrome" id="inspector">
      <button type="button" data-control="block.p.fill.plate">plate</button>
      <span class="ts-ctl-color"><span data-control="block.p.fill.contrast">4.5:1</span></span>
      <select data-control="block.p.size"><option>22</option></select>
    </aside>
    <div role="menu" id="menu"><button type="button" role="menuitem">Box</button></div>
  `;
  return {
    stage: document.getElementById('stage') as HTMLElement,
    inspector: document.getElementById('inspector') as HTMLElement,
    overlay: document.getElementById('overlay') as HTMLElement,
  };
}

describe('isChromeControlTarget', () => {
  it('is true for a button, a field, a menu row and anything inside the inspector', () => {
    const { stage } = tree();
    const swatch = document.querySelector('[data-control="block.p.fill.plate"]');
    const contrast = document.querySelector('[data-control="block.p.fill.contrast"]');
    const select = document.querySelector('select');
    const row = document.querySelector('[role="menuitem"]');
    expect(isChromeControlTarget(swatch, stage)).toBe(true);
    expect(isChromeControlTarget(contrast, stage)).toBe(true);
    expect(isChromeControlTarget(select, stage)).toBe(true);
    expect(isChromeControlTarget(row, stage)).toBe(true);
  });

  it('is false for the body and the stage; an overlay handle counts as a control', () => {
    const { stage, overlay } = tree();
    const run = document.querySelector('[data-run="p/text"]');
    const chip = overlay.querySelector('button');
    expect(isChromeControlTarget(document.body, stage)).toBe(false);
    expect(isChromeControlTarget(stage, stage)).toBe(false);
    expect(isChromeControlTarget(run, stage)).toBe(false);
    /* the overlay is outside the stage root; its handles carry their own keys (Overlay.tsx),
       which the Editor's listener already yields to before this check */
    expect(isChromeControlTarget(chip, stage)).toBe(true);
    expect(isChromeControlTarget(null, stage)).toBe(false);
  });
});
