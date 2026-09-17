// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Dialog, DialogCheck, DialogField, focusableIn } from '../Dialog';
import { hideTooltip } from '../Tooltip';

// The dialog primitive (gslides-parity SPEC 13.3; R08 B9): role dialog named by its title, the
// first field focused on open, a focus trap on Tab and Shift+Tab, Esc cancels, Enter runs the
// default button (not from a textarea), the dismissive button before the confirming one, focus
// back on the opener on close, and a tooltip on every control with no native title.

function Harness({
  onClose,
  onOk,
  textarea = false,
}: {
  onClose: () => void;
  onOk: () => void;
  textarea?: boolean;
}) {
  return (
    <>
      <button type="button" id="opener">
        Open
      </button>
      <Dialog
        title="Make a copy"
        onClose={onClose}
        control="dialog.test"
        cancel
        actions={[
          { label: 'Make a copy', primary: true, onClick: onOk, control: 'dialog.test.ok' },
        ]}
      >
        <DialogField label="Name">
          <input
            type="text"
            defaultValue="Copy of GT"
            aria-label="Name"
            data-control="dialog.test.name"
          />
        </DialogField>
        {textarea ? <textarea aria-label="Notes" defaultValue="" /> : null}
        <DialogCheck
          label="Remove speaker notes"
          checked={false}
          onChange={() => undefined}
          control="dialog.test.check"
        />
      </Dialog>
    </>
  );
}

afterEach(() => {
  hideTooltip();
  cleanup();
});

describe('Dialog', () => {
  it('is named by its title, focuses the first field and orders Cancel before the confirming button', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const onClose = vi.fn();
    const { unmount } = render(<Harness onClose={onClose} onOk={() => undefined} />);
    const dialog = screen.getByRole('dialog', { name: 'Make a copy' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement?.getAttribute('data-control')).toBe('dialog.test.name');
    const buttons = [
      ...dialog.querySelectorAll<HTMLButtonElement>('.ts-dialog-actions button'),
    ].map((b) => b.textContent);
    expect(buttons).toEqual(['Cancel', 'Make a copy']);
    for (const control of dialog.querySelectorAll('button, input')) {
      expect(control.closest('[data-tip]'), control.outerHTML).not.toBeNull();
      expect(control.hasAttribute('title')).toBe(false);
    }
    unmount();
    /* the mount effect's cleanup runs a task later (useMountEffect), so the focus return does too */
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('traps Tab and Shift+Tab inside the card', () => {
    render(<Harness onClose={() => undefined} onOk={() => undefined} />);
    const dialog = screen.getByRole('dialog', { name: 'Make a copy' });
    const list = focusableIn(dialog);
    const last = list[list.length - 1] as HTMLElement;
    last.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(list[0]);
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('closes on Esc and runs the default button on Enter, except from a textarea', () => {
    const onClose = vi.fn();
    const onOk = vi.fn();
    render(<Harness onClose={onClose} onOk={onOk} textarea />);
    const dialog = screen.getByRole('dialog', { name: 'Make a copy' });
    const name = dialog.querySelector<HTMLInputElement>(
      '[data-control="dialog.test.name"]',
    ) as HTMLInputElement;
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(onOk).toHaveBeenCalledTimes(1);
    const notes = screen.getByLabelText('Notes');
    fireEvent.keyDown(notes, { key: 'Enter' });
    expect(onOk).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(name, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(dialog.querySelector('.ts-dialog-x') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('Dialog modal={false} (the floating form of SPEC-3 7.2)', () => {
  it('draws the card with no scrim, no aria-modal and no focus trap, and leaves focus where it was', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const onClose = vi.fn();
    const { container, unmount } = render(
      <Dialog
        title="How should others see you?"
        onClose={onClose}
        control="dialog.float"
        modal={false}
        actions={[{ label: 'Continue', primary: true, onClick: () => undefined }]}
      >
        <input type="text" aria-label="Name" data-control="dialog.float.name" />
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'How should others see you?' });
    expect(dialog.hasAttribute('aria-modal')).toBe(false);
    expect(container.querySelector('.ts-dialog-scrim')).toBeNull();
    expect(container.querySelector('.ts-dialog-float')).not.toBeNull();
    expect(dialog.classList.contains('is-float')).toBe(true);
    /* the person typing keeps the caret: the card took no focus */
    expect(document.activeElement).toBe(opener);
    /* focus moving elsewhere on the page is not pulled back into the card */
    const other = document.createElement('button');
    document.body.appendChild(other);
    other.focus();
    fireEvent.focusIn(other);
    expect(document.activeElement).toBe(other);
    /* Esc from inside the card still closes it */
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    opener.remove();
    other.remove();
  });
});

// Cycle 2 of the focus round (docs/gslides-parity/focus/VERIFICATION.md F-share-copy and
// F-shapes-export; build/b3.md R19, build/b4.md FR1, F-hex-field): a modal card closes on Escape
// wherever the focus sits, the confirming button takes the focus when the actions row changes and
// the focused button left the document, and Enter runs the default button only when the field did
// not handle the key itself.
describe('Dialog, the focus round cycle 2', () => {
  it('closes on Escape with the focus on the body, and once on Escape inside the card', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} onOk={() => undefined} />);
    const dialog = screen.getByRole('dialog', { name: 'Make a copy' });
    /* the focused button left the document: the browser drops the focus to the body */
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    /* inside the card the card's own handler takes the key and stops it; no double close */
    const name = dialog.querySelector<HTMLInputElement>(
      '[data-control="dialog.test.name"]',
    ) as HTMLInputElement;
    name.focus();
    fireEvent.keyDown(name, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('leaves a floating card to its own Escape: a key on the body closes nothing', () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Name" onClose={onClose} control="dialog.float" modal={false}>
        <input type="text" aria-label="Name" />
      </Dialog>,
    );
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not run the default button on an Enter the field already handled', () => {
    const onOk = vi.fn();
    const onField = vi.fn();
    render(
      <Dialog
        title="Change background"
        onClose={() => undefined}
        control="dialog.bg"
        actions={[{ label: 'Done', primary: true, onClick: onOk, control: 'dialog.bg.done' }]}
      >
        <input
          type="text"
          aria-label="Custom colour"
          data-control="dialog.bg.hex"
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            onField();
          }}
        />
        <input type="text" aria-label="Other" data-control="dialog.bg.other" />
      </Dialog>,
    );
    const hex = document.querySelector('[data-control="dialog.bg.hex"]') as HTMLInputElement;
    fireEvent.keyDown(hex, { key: 'Enter' });
    expect(onField).toHaveBeenCalledTimes(1);
    expect(onOk).not.toHaveBeenCalled();
    /* a plain field still hands Enter to the default button */
    const other = document.querySelector('[data-control="dialog.bg.other"]') as HTMLInputElement;
    fireEvent.keyDown(other, { key: 'Enter' });
    expect(onOk).toHaveBeenCalledTimes(1);
  });

  it('gives the confirming button the focus when the actions row changes and the focused button left', () => {
    function Flow() {
      const [done, setDone] = useState(false);
      return (
        <Dialog
          title="Download"
          onClose={() => undefined}
          control="dialog.dl"
          cancel
          actions={
            done
              ? [
                  {
                    label: 'Done',
                    primary: true,
                    onClick: () => undefined,
                    control: 'dialog.dl.done',
                  },
                ]
              : [
                  {
                    label: 'Download',
                    primary: true,
                    onClick: () => setDone(true),
                    control: 'dialog.dl.ok',
                  },
                ]
          }
        >
          <p>One slide per page</p>
        </Dialog>
      );
    }
    render(<Flow />);
    const ok = document.querySelector('[data-control="dialog.dl.ok"]') as HTMLButtonElement;
    ok.focus();
    expect(document.activeElement).toBe(ok);
    fireEvent.click(ok);
    /* the OK button unmounted with the focus on it; the Done button takes the focus */
    const doneButton = document.querySelector('[data-control="dialog.dl.done"]');
    expect(doneButton).not.toBeNull();
    expect(document.activeElement).toBe(doneButton);
  });
});
