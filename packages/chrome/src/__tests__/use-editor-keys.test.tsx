// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_MENU_CONTEXT } from '../menus/model';
import type { MenuContext, MenuItem } from '../menus/model';
import { CARET_KEYS, isCaretKeyInCanvasText, isIndentChord, useEditorKeys } from '../useEditorKeys';
import type { EditorKeyHandlers } from '../useEditorKeys';
import type { KeyBinding } from '../menus/keys';

// Cmd+] and Cmd+[ (gslides-parity SPEC-2 0.55, section 9): Chrome's Forward and Back on macOS. The
// editor takes both chords in every focus state and always prevents the default, runs the indent
// only when a list item or a text block is selected, and leaves the other chords to the field the
// focus is in. Asserted with focus in the notes pane, the filmstrip and a Format options field.

/* useMountEffect defers its cleanup by one task: settle it, or the last host's listener prevents the default first and the new one returns early */
async function settle(): Promise<void> {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(settle);

function Host({ context, handlers }: { context: MenuContext; handlers: EditorKeyHandlers }) {
  useEditorKeys({ platform: 'mac', menuContext: context, enabled: true }, handlers);
  return (
    <div>
      <aside className="pt-sb ts-filmstrip">
        <button type="button" data-testid="card">
          Slide 1
        </button>
      </aside>
      <div className="ts-notes-slot">
        <textarea data-testid="notes" aria-label="Speaker notes" />
      </div>
      <aside className="ts-panel">
        <input data-testid="field" aria-label="Width" />
        <input type="checkbox" data-testid="check" aria-label="Tabular figures" />
        <button type="button" role="combobox" data-testid="dropdown" aria-label="Line end">
          None
        </button>
      </aside>
      <div className="ts-stagewrap ts-sheet ts-editor ts-stage">
        <p data-block="p">
          <span data-testid="run" data-run="p/text" contentEditable suppressContentEditableWarning>
            Text
          </span>
        </p>
      </div>
    </div>
  );
}

function handlers(runItem = vi.fn()): EditorKeyHandlers {
  return {
    runItem,
    runBinding: vi.fn(() => false),
    openMenu: vi.fn(),
    escape: vi.fn(() => false),
    say: vi.fn(),
    overlayOpen: () => false,
  };
}

const withText: MenuContext = {
  ...DEFAULT_MENU_CONTEXT,
  focus: 'canvas',
  selection: { ...DEFAULT_MENU_CONTEXT.selection, blocks: 1, textBlock: true, block: 'text' },
};

describe('isIndentChord', () => {
  it('matches Cmd+] and Cmd+[ on a Mac and Ctrl on Windows, with no other modifier', () => {
    expect(
      isIndentChord(
        { key: ']', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false },
        'mac',
      ),
    ).toBe(true);
    expect(
      isIndentChord(
        { key: '[', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false },
        'mac',
      ),
    ).toBe(true);
    expect(
      isIndentChord(
        { key: ']', metaKey: false, ctrlKey: true, altKey: false, shiftKey: false },
        'mac',
      ),
    ).toBe(false);
    expect(
      isIndentChord(
        { key: ']', metaKey: false, ctrlKey: true, altKey: false, shiftKey: false },
        'win',
      ),
    ).toBe(true);
    expect(
      isIndentChord(
        { key: ']', metaKey: true, ctrlKey: false, altKey: false, shiftKey: true },
        'mac',
      ),
    ).toBe(false);
    expect(
      isIndentChord(
        { key: 'x', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false },
        'mac',
      ),
    ).toBe(false);
  });
});

describe('useEditorKeys and the indent chords', () => {
  for (const [where, testId] of [
    ['the notes pane', 'notes'],
    ['the filmstrip', 'card'],
    ['a Format options field', 'field'],
  ] as const) {
    it(`prevents the browser's default for Cmd+] and Cmd+[ with focus in ${where}, and indents only with a text block selected`, async () => {
      const runItem = vi.fn();
      const view = render(<Host context={withText} handlers={handlers(runItem)} />);
      const target = view.getByTestId(testId);
      target.focus();
      const forward = new KeyboardEvent('keydown', {
        key: ']',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      });
      target.dispatchEvent(forward);
      expect(forward.defaultPrevented).toBe(true);
      expect(runItem).toHaveBeenCalledTimes(1);
      expect((runItem.mock.calls[0]?.[0] as MenuItem).id).toBe('format.alignIndent.increaseIndent');
      const back = new KeyboardEvent('keydown', {
        key: '[',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      });
      target.dispatchEvent(back);
      expect(back.defaultPrevented).toBe(true);
      expect((runItem.mock.calls[1]?.[0] as MenuItem).id).toBe('format.alignIndent.decreaseIndent');
      await settle();
      /* nothing selected: the default is still prevented and nothing runs */
      const idle = vi.fn();
      const bare = render(<Host context={DEFAULT_MENU_CONTEXT} handlers={handlers(idle)} />);
      const el = bare.getByTestId(testId);
      el.focus();
      const event = new KeyboardEvent('keydown', {
        key: ']',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      });
      el.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(idle).not.toHaveBeenCalled();
    });
  }

  it('leaves Escape to a modal dialog while its scrim is in the document (b1 R30)', () => {
    /* the Dialog's own document listener closes the dialog; the shell's ladder would close an
       open panel with it, where Google closes the dialog alone */
    const escape = vi.fn(() => true);
    const h = { ...handlers(), escape };
    render(<Host context={withText} handlers={h} />);
    const scrim = document.createElement('div');
    scrim.className = 'ts-dialog-scrim';
    document.body.appendChild(scrim);
    try {
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(escape).not.toHaveBeenCalled();
    } finally {
      scrim.remove();
    }
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(escape).toHaveBeenCalledTimes(1);
  });

  it('leaves the other chords to a chrome field and runs a menu chord from the canvas', () => {
    const runItem = vi.fn();
    const view = render(<Host context={withText} handlers={handlers(runItem)} />);
    const field = view.getByTestId('field');
    field.focus();
    fireEvent.keyDown(field, { key: 'b', metaKey: true });
    expect(runItem).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: 'b', metaKey: true });
    expect(runItem).toHaveBeenCalledTimes(1);
    expect((runItem.mock.calls[0]?.[0] as MenuItem).id).toBe('format.text.bold');
  });

  it('runs Cmd+Z from a Format options checkbox and still leaves Cmd+B to a text field (the features round, F7)', () => {
    /* a checkbox takes no text, so it is not a field: the undo chord reaches the key table from
       it as it does from the stage (build/b1.md R6); a text input keeps the browser's own keys */
    const runItem = vi.fn();
    const undoable: MenuContext = { ...withText, history: { undo: true, redo: false } };
    const view = render(<Host context={undoable} handlers={handlers(runItem)} />);
    const check = view.getByTestId('check');
    check.focus();
    const undo = new KeyboardEvent('keydown', {
      key: 'z',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    check.dispatchEvent(undo);
    expect(undo.defaultPrevented).toBe(true);
    expect(runItem).toHaveBeenCalledTimes(1);
    expect((runItem.mock.calls[0]?.[0] as MenuItem).id).toBe('edit.undo');
    const field = view.getByTestId('field');
    field.focus();
    fireEvent.keyDown(field, { key: 'b', metaKey: true });
    expect(runItem).toHaveBeenCalledTimes(1);
  });
});

// A modal dialog over the editor (the keyboard verifier's pass 1 on the dropdown round, finding
// 1): a key from the body, where the focus fell after the dialog's focused control was disabled
// or left, runs no chord on the deck behind the dialog; Cmd+] and Cmd+[ keep the browser's Back
// and Forward prevented.
describe('useEditorKeys behind a modal dialog', () => {
  it('runs no chord from the body while a modal dialog is open, and prevents Cmd+[ without indenting', () => {
    const runItem = vi.fn();
    const undoable: MenuContext = { ...withText, history: { undo: true, redo: false } };
    render(<Host context={undoable} handlers={handlers(runItem)} />);
    const card = document.createElement('div');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    document.body.appendChild(card);
    try {
      /* run nothing, and prevented as a disabled item's chord is (DD-fix, final pass 1, finding 1) */
      expect(fireEvent.keyDown(document.body, { key: 'z', metaKey: true })).toBe(false);
      expect(fireEvent.keyDown(document.body, { key: 'b', metaKey: true })).toBe(false);
      expect(fireEvent.keyDown(document.body, { key: '[', metaKey: true })).toBe(false);
      expect(runItem).not.toHaveBeenCalled();
    } finally {
      card.remove();
    }
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true });
    expect((runItem.mock.calls[0]?.[0] as MenuItem).id).toBe('edit.undo');
  });

  /* the final pass 1, finding 1: a plain button inside the card is not a field, so the key table
     ran from it. From the Share dialog's Done, Cmd+Z undid the deck's last edit, Cmd+D duplicated
     the selected table, Cmd+A selected, Cmd+/ replaced the dialog with Keyboard shortcuts and
     Shift+Tab opened the Collaborators list (`key.roster`), so the trap put the focus on Close;
     from a field the menu access keys and Cmd+Shift+H passed the field rule */
  it('runs no chord from a button or a field inside an open modal dialog, prevents the deck chords on a button, and leaves Shift+Tab and the clipboard to the browser', () => {
    const runItem = vi.fn();
    /* the shell's runBinding answers the Collaborators list alone among Shift+Tab's matches */
    const runBinding = vi.fn((binding: KeyBinding) => binding.id === 'key.roster');
    const openMenu = vi.fn();
    const h: EditorKeyHandlers = { ...handlers(runItem), runBinding, openMenu };
    const undoable: MenuContext = { ...withText, history: { undo: true, redo: false } };
    const view = render(<Host context={undoable} handlers={h} />);
    const card = document.createElement('div');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.innerHTML =
      '<input aria-label="Add people" data-testid="address" /><button type="button">Done</button>';
    document.body.appendChild(card);
    const done = card.querySelector('button')!;
    const address = card.querySelector('input')!;
    const fromButton: KeyboardEventInit[] = [
      { key: 'z', metaKey: true },
      { key: 'd', metaKey: true },
      { key: 'a', metaKey: true },
      { key: '/', metaKey: true },
      { key: 'Tab', shiftKey: true },
      { key: 'Enter' },
      { key: 'f', ctrlKey: true, altKey: true },
    ];
    const fromField: KeyboardEventInit[] = [
      { key: 'h', metaKey: true, shiftKey: true },
      { key: 'f', ctrlKey: true, altKey: true },
    ];
    try {
      done.focus();
      /* on a button the deck's Cmd and Ctrl chords are prevented, so the browser's own meaning
         (Cmd+A selecting the page's text, Cmd+D's bookmark) does not fire behind the card; Shift+Tab,
         Enter and the clipboard chords keep their default */
      for (const init of fromButton) {
        const chord = init.metaKey === true || init.ctrlKey === true;
        expect(fireEvent.keyDown(done, init), `${JSON.stringify(init)} on Done`).toBe(!chord);
      }
      expect(fireEvent.keyDown(done, { key: 'c', metaKey: true }), 'Cmd+C on Done').toBe(true);
      /* Cmd+] keeps Chrome's Forward prevented and indents nothing */
      expect(fireEvent.keyDown(done, { key: ']', metaKey: true })).toBe(false);
      address.focus();
      for (const init of fromField)
        expect(fireEvent.keyDown(address, init), `${JSON.stringify(init)} in the field`).toBe(true);
      expect(runItem).not.toHaveBeenCalled();
      expect(runBinding).not.toHaveBeenCalled();
      expect(openMenu).not.toHaveBeenCalled();
    } finally {
      card.remove();
    }
    /* the dialog closed: the same chords match and run again, from the body and from a field */
    for (const init of fromButton.filter((each) => each.key !== 'Enter'))
      fireEvent.keyDown(document.body, init);
    const field = view.getByTestId('field');
    field.focus();
    fireEvent.keyDown(field, fromField[0]!);
    expect(runItem.mock.calls.map(([item]) => (item as MenuItem).id)).toEqual([
      'edit.undo',
      'edit.duplicate',
      'edit.selectAll',
      'help.keyboardShortcuts',
      'edit.findReplace',
    ]);
    expect(runBinding.mock.calls.map(([binding]) => binding.id)).toContain('key.roster');
    expect(openMenu).toHaveBeenCalledWith('file');
  });
});

// The shared dropdown's trigger (docs/DROPDOWNS.md 3.12): a field for the editor's keys, as the
// select it replaces was, so Backspace on it in Format options never deletes the selected object
// and the chords stay the field's.
describe('useEditorKeys and the dropdown trigger', () => {
  it('runs no row from a focused dropdown and leaves its keys unprevented', () => {
    const runItem = vi.fn();
    const view = render(<Host context={withText} handlers={handlers(runItem)} />);
    const dropdown = view.getByTestId('dropdown');
    dropdown.focus();
    for (const key of ['Backspace', 'Delete', 'b']) {
      expect(fireEvent.keyDown(dropdown, { key })).toBe(true);
    }
    expect(fireEvent.keyDown(dropdown, { key: 'b', metaKey: true })).toBe(true);
    expect(runItem).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: 'b', metaKey: true });
    expect(runItem).toHaveBeenCalledTimes(1);
  });
});

// The caret keys inside the canvas run (build-4/hotfix-4.md, key ownership): Home, End, PageUp,
// PageDown and the arrows with every modifier belong to the caret while the InlineText session
// is open. Cmd Up and Cmd Down are also Move slide up and down and Bring forward and Send
// backward in the key table; from the run they must move the caret to the text's ends, never run
// a row or prevent the browser's default. jsdom leaves isContentEditable undefined, so the test
// derives it from the attribute the way a browser does.
describe('the caret keys inside the canvas run', () => {
  const MODIFIERS: ReadonlyArray<Partial<KeyboardEventInit>> = [
    {},
    { shiftKey: true },
    { metaKey: true },
    { metaKey: true, shiftKey: true },
    { altKey: true },
    { altKey: true, shiftKey: true },
  ];
  let shimmed = false;
  const shim = () => {
    if (shimmed) return;
    shimmed = true;
    Object.defineProperty(HTMLElement.prototype, 'isContentEditable', {
      configurable: true,
      get(this: HTMLElement) {
        const own = this.getAttribute('contenteditable');
        if (own === 'true' || own === '') return true;
        if (own === 'false') return false;
        return this.parentElement?.isContentEditable ?? false;
      },
    });
  };

  it('names the caret keys and reads the run through the target', () => {
    shim();
    expect([...CARET_KEYS].sort()).toEqual(
      [
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'End',
        'Home',
        'PageDown',
        'PageUp',
      ].sort(),
    );
    const view = render(<Host context={withText} handlers={handlers()} />);
    const run = view.getByTestId('run');
    const field = view.getByTestId('field');
    expect(isCaretKeyInCanvasText({ key: 'Home', target: run })).toBe(true);
    expect(isCaretKeyInCanvasText({ key: 'ArrowUp', target: run })).toBe(true);
    expect(isCaretKeyInCanvasText({ key: 'b', target: run })).toBe(false);
    expect(isCaretKeyInCanvasText({ key: 'Home', target: field })).toBe(false);
    expect(isCaretKeyInCanvasText({ key: 'Home', target: document.body })).toBe(false);
  });

  it('runs nothing and prevents nothing for every caret key with every modifier from the run, and still matches the chord from the body', () => {
    shim();
    const runItem = vi.fn();
    const runBinding = vi.fn(() => false);
    const h = { ...handlers(runItem), runBinding };
    const view = render(<Host context={withText} handlers={h} />);
    const run = view.getByTestId('run');
    run.focus();
    for (const key of CARET_KEYS) {
      for (const mods of MODIFIERS) {
        const event = new KeyboardEvent('keydown', {
          key,
          bubbles: true,
          cancelable: true,
          ...mods,
        });
        run.dispatchEvent(event);
        expect(event.defaultPrevented, `${JSON.stringify(mods)} ${key}`).toBe(false);
      }
    }
    expect(runItem).not.toHaveBeenCalled();
    expect(runBinding).not.toHaveBeenCalled();
    /* the same chord from the body reaches the key table: Cmd Up is Move slide up or Bring forward,
       and the table either runs the row or swallows the chord of a disabled row */
    const outside = new KeyboardEvent('keydown', {
      key: 'ArrowUp',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(outside);
    expect(runItem.mock.calls.length > 0 || outside.defaultPrevented).toBe(true);
  });
});

describe('Delete and Backspace with nothing selected (docs/FOCUS.md section 5 rank 4)', () => {
  const noFocus: MenuContext = { ...DEFAULT_MENU_CONTEXT, focus: 'none', selectedSlides: 1 };
  const filmstrip: MenuContext = { ...DEFAULT_MENU_CONTEXT, focus: 'filmstrip', selectedSlides: 1 };

  it('runs nothing and prevents nothing from the body or a toolbar button while the filmstrip has no focus', async () => {
    for (const key of ['Delete', 'Backspace']) {
      const runItem = vi.fn();
      const view = render(<Host context={noFocus} handlers={handlers(runItem)} />);
      const field = view.getByTestId('field');
      const fromBody = fireEvent.keyDown(document.body, { key });
      const fromButton = fireEvent.keyDown(view.getByTestId('card'), { key });
      expect(runItem).not.toHaveBeenCalled();
      expect(fromBody).toBe(true);
      expect(fromButton).toBe(true);
      void field;
      await settle();
    }
  });

  it('still removes the slide while the filmstrip has the focus, and Edit > Delete stays a menu row', async () => {
    const runItem = vi.fn();
    render(<Host context={filmstrip} handlers={handlers(runItem)} />);
    fireEvent.keyDown(document.body, { key: 'Delete' });
    expect(runItem).toHaveBeenCalledTimes(1);
    expect((runItem.mock.calls[0]?.[0] as MenuItem).id).toBe('edit.delete');
    await settle();
  });
});
