// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { isChromeControlTarget } from '../Editor';
import { editorKeyAction, isBareCharacterKey, NUDGE_PX, NUDGE_SHIFT_PX } from '../keys';
import type { EditorKeyContext } from '../keys';

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
    <div role="listbox" id="filmstrip"><div role="option" tabindex="0" data-id="s1">1</div></div>
  `;
  return {
    stage: document.getElementById('stage') as HTMLElement,
    inspector: document.getElementById('inspector') as HTMLElement,
    overlay: document.getElementById('overlay') as HTMLElement,
  };
}

describe('isChromeControlTarget', () => {
  it('is true for a button, a field, a menu row, a filmstrip card and anything inside the inspector', () => {
    const { stage } = tree();
    const swatch = document.querySelector('[data-control="block.p.fill.plate"]');
    const contrast = document.querySelector('[data-control="block.p.fill.contrast"]');
    const select = document.querySelector('select');
    const row = document.querySelector('[role="menuitem"]');
    const card = document.querySelector('[role="option"]');
    expect(isChromeControlTarget(swatch, stage)).toBe(true);
    expect(isChromeControlTarget(contrast, stage)).toBe(true);
    expect(isChromeControlTarget(select, stage)).toBe(true);
    expect(isChromeControlTarget(row, stage)).toBe(true);
    expect(isChromeControlTarget(card, stage)).toBe(true);
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

// The stage's key table (gslides-parity SPEC 10.1, 10.2, 0.28): Google's chords and nothing else.
// No bare letter, digit, Space or Shift letter does anything in any state, so a seller who clicks
// the title and types never hides the filmstrip or flips the theme (R09 finding 4).

const selected: EditorKeyContext = {
  selected: true,
  freeform: false,
  editing: false,
  editable: false,
  apple: true,
};
const free: EditorKeyContext = { ...selected, freeform: true };
const nothing: EditorKeyContext = { ...selected, selected: false };

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
const BARE = [
  ...LETTERS,
  ...LETTERS.map((l) => l.toUpperCase()),
  ..."0123456789?[]/\\;',.".split(''),
  ' ',
];

describe('editorKeyAction', () => {
  it('binds no bare letter, digit, Space or Shift letter in any state (SPEC 0.28)', () => {
    for (const ctx of [selected, free, nothing]) {
      for (const key of BARE) {
        expect(editorKeyAction({ key }, ctx)).toBeNull();
        expect(editorKeyAction({ key, shiftKey: true }, ctx)).toBeNull();
        expect(isBareCharacterKey({ key })).toBe(true);
      }
    }
    expect(isBareCharacterKey({ key: 'a', metaKey: true })).toBe(false);
    expect(isBareCharacterKey({ key: 'Escape' })).toBe(false);
  });

  it('yields inside a field, a chrome control and an editing session', () => {
    expect(editorKeyAction({ key: 'Escape' }, { ...selected, editable: true })).toBeNull();
    expect(editorKeyAction({ key: 'Delete' }, { ...selected, editing: true })).toBeNull();
    expect(editorKeyAction({ key: 'd', metaKey: true }, { ...selected, editing: true })).toBeNull();
  });

  it('Esc leaves the mode, Enter edits, Delete and Backspace remove, with a block selected only', () => {
    expect(editorKeyAction({ key: 'Escape' }, selected)).toEqual({ type: 'escape' });
    expect(editorKeyAction({ key: 'Enter' }, selected)).toEqual({ type: 'enter' });
    expect(editorKeyAction({ key: 'Delete' }, selected)).toEqual({ type: 'delete' });
    expect(editorKeyAction({ key: 'Backspace' }, selected)).toEqual({ type: 'delete' });
    expect(editorKeyAction({ key: 'Escape' }, nothing)).toBeNull();
    expect(editorKeyAction({ key: 'Enter' }, nothing)).toBeNull();
    expect(editorKeyAction({ key: 'Backspace' }, nothing)).toBeNull();
  });

  it('Tab and Shift Tab walk the blocks in every state', () => {
    expect(editorKeyAction({ key: 'Tab' }, nothing)).toEqual({ type: 'tab', delta: 1 });
    expect(editorKeyAction({ key: 'Tab', shiftKey: true }, selected)).toEqual({
      type: 'tab',
      delta: -1,
    });
  });

  it('the arrows nudge on every slide kind, 1 px and 10 px with Shift (gslides-parity SPEC-2 0.87)', () => {
    /* round one nudged 8 px with Shift (the grid) and was inert on a grammar slide; SPEC-2 0.87
       reads Google's "larger increment" as 10 px and the first nudge on a grammar slide converts */
    expect(NUDGE_SHIFT_PX).toBe(10);
    expect(editorKeyAction({ key: 'ArrowRight' }, free)).toEqual({
      type: 'nudge',
      dx: NUDGE_PX,
      dy: 0,
    });
    expect(editorKeyAction({ key: 'ArrowUp', shiftKey: true }, free)).toEqual({
      type: 'nudge',
      dx: 0,
      dy: -NUDGE_SHIFT_PX,
    });
    expect(editorKeyAction({ key: 'ArrowDown' }, selected)).toEqual({
      type: 'nudge',
      dx: 0,
      dy: NUDGE_PX,
    });
    expect(editorKeyAction({ key: 'ArrowLeft' }, nothing)).toBeNull();
  });

  it('rotates with Option Left and Right, 15 degrees and 1 with Shift, and honours the Cmd Option aliases (SPEC-2 0.78)', () => {
    expect(editorKeyAction({ key: 'ArrowLeft', altKey: true }, selected)).toEqual({
      type: 'rotate',
      by: -15,
    });
    expect(editorKeyAction({ key: 'ArrowRight', altKey: true, shiftKey: true }, selected)).toEqual({
      type: 'rotate',
      by: 1,
    });
    expect(editorKeyAction({ key: 'ArrowRight', altKey: true, metaKey: true }, selected)).toEqual({
      type: 'rotate',
      by: 15,
    });
    expect(editorKeyAction({ key: 'ArrowLeft', altKey: true }, nothing)).toBeNull();
    /* Option Up stays nothing: the arrow pair rotates, the vertical pair is free */
    expect(editorKeyAction({ key: 'ArrowUp', altKey: true }, selected)).toBeNull();
  });

  it('groups with Cmd Option G and ungroups with Shift; the marks and the indents apply to a selected object', () => {
    expect(editorKeyAction({ key: 'g', metaKey: true, altKey: true }, selected)).toEqual({
      type: 'group',
    });
    expect(
      editorKeyAction({ key: 'G', metaKey: true, altKey: true, shiftKey: true }, selected),
    ).toEqual({ type: 'ungroup' });
    expect(editorKeyAction({ key: 'i', metaKey: true }, selected)).toEqual({
      type: 'mark',
      mark: 'i',
    });
    expect(editorKeyAction({ key: 'u', metaKey: true }, selected)).toEqual({
      type: 'mark',
      mark: 'u',
    });
    expect(editorKeyAction({ key: 'X', metaKey: true, shiftKey: true }, selected)).toEqual({
      type: 'mark',
      mark: 's',
    });
    expect(editorKeyAction({ key: '.', metaKey: true }, selected)).toEqual({
      type: 'mark',
      mark: 'sup',
    });
    expect(editorKeyAction({ key: ',', metaKey: true }, selected)).toEqual({
      type: 'mark',
      mark: 'sub',
    });
    expect(editorKeyAction({ key: ']', metaKey: true }, selected)).toEqual({
      type: 'indent',
      by: 1,
    });
    expect(editorKeyAction({ key: '[', metaKey: true }, selected)).toEqual({
      type: 'indent',
      by: -1,
    });
    expect(editorKeyAction({ key: 'i', metaKey: true }, nothing)).toBeNull();
    expect(editorKeyAction({ key: ']', metaKey: true }, nothing)).toBeNull();
  });

  it('Cmd D duplicates, Cmd A selects all, Cmd X, C, V are the clipboard and Shift V pastes plain', () => {
    expect(editorKeyAction({ key: 'd', metaKey: true }, selected)).toEqual({ type: 'duplicate' });
    expect(editorKeyAction({ key: 'd', metaKey: true }, nothing)).toBeNull();
    expect(editorKeyAction({ key: 'a', metaKey: true }, nothing)).toEqual({ type: 'selectAll' });
    expect(editorKeyAction({ key: 'x', metaKey: true }, selected)).toEqual({ type: 'cut' });
    expect(editorKeyAction({ key: 'c', metaKey: true }, selected)).toEqual({ type: 'copy' });
    expect(editorKeyAction({ key: 'v', metaKey: true }, nothing)).toEqual({
      type: 'paste',
      plain: false,
    });
    expect(editorKeyAction({ key: 'v', metaKey: true, shiftKey: true }, nothing)).toEqual({
      type: 'paste',
      plain: true,
    });
  });

  it('Cmd Up and Down order, Shift for the ends; Cmd K links; Cmd B weights; Cmd Option C and V paint', () => {
    expect(editorKeyAction({ key: 'ArrowUp', metaKey: true }, free)).toEqual({
      type: 'order',
      move: 'forward',
    });
    expect(editorKeyAction({ key: 'ArrowDown', metaKey: true }, free)).toEqual({
      type: 'order',
      move: 'backward',
    });
    expect(editorKeyAction({ key: 'ArrowUp', metaKey: true, shiftKey: true }, free)).toEqual({
      type: 'order',
      move: 'front',
    });
    expect(editorKeyAction({ key: 'ArrowDown', metaKey: true, shiftKey: true }, selected)).toEqual({
      type: 'order',
      move: 'back',
    });
    expect(editorKeyAction({ key: 'k', metaKey: true }, selected)).toEqual({ type: 'link' });
    expect(editorKeyAction({ key: 'b', metaKey: true }, selected)).toEqual({ type: 'bold' });
    expect(editorKeyAction({ key: 'c', metaKey: true, altKey: true }, selected)).toEqual({
      type: 'paintCopy',
    });
    expect(editorKeyAction({ key: 'v', metaKey: true, altKey: true }, selected)).toEqual({
      type: 'paintPaste',
    });
  });

  it('reads Ctrl as the command key on Windows and Cmd there as nothing', () => {
    const win: EditorKeyContext = { ...selected, apple: false };
    expect(editorKeyAction({ key: 'd', ctrlKey: true }, win)).toEqual({ type: 'duplicate' });
    expect(editorKeyAction({ key: 'd', metaKey: true }, win)).toBeNull();
    /* the retired Turboslide chords of SPEC 10.2 are nothing on the stage; Cmd ] is the indent
       since SPEC-2 0.55 and Option Up stays nothing */
    expect(editorKeyAction({ key: ']', metaKey: true }, free)).toEqual({ type: 'indent', by: 1 });
    expect(editorKeyAction({ key: ']', ctrlKey: true }, { ...free, apple: false })).toEqual({
      type: 'indent',
      by: 1,
    });
    expect(editorKeyAction({ key: 'ArrowUp', altKey: true }, free)).toBeNull();
  });
});
