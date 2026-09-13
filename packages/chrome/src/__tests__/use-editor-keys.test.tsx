// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_MENU_CONTEXT } from '../menus/model';
import type { MenuContext, MenuItem } from '../menus/model';
import { isIndentChord, useEditorKeys } from '../useEditorKeys';
import type { EditorKeyHandlers } from '../useEditorKeys';

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
      </aside>
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
});
