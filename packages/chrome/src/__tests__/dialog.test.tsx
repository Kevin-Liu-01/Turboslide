// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
