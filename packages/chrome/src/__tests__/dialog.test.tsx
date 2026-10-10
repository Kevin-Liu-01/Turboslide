// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  Dialog,
  DialogCheck,
  DialogField,
  focusReturnTarget,
  focusableIn,
  noteMenuRowActivated,
  recentMenuRow,
} from '../Dialog';
import { ImageByUrlDialog } from '../dialogs/ImageByUrl';
import { EditorShellContext } from '../editor-shell-context';
import type { EditorShellState } from '../editor-shell-context';
import { HoldButton } from '../FocusHold';
import { Select } from '../Select';
import { hideTooltip } from '../Tooltip';
import { browserMove, focusFixup, nextTask } from './browser-move';

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

describe('the focus never rests on the body (the keyboard verifier on the dropdown round, finding 1)', () => {
  function People() {
    const [rows, setRows] = useState(['ana', 'ben', 'cy']);
    return (
      <Dialog title="People" onClose={() => undefined} control="dialog.people">
        {rows.map((row) => (
          <button
            key={row}
            type="button"
            data-control={`row.${row}`}
            onClick={() => setRows((now) => now.filter((each) => each !== row))}
          >
            Remove {row}
          </button>
        ))}
        <button type="button" data-control="people.add">
          Add people
        </button>
      </Dialog>
    );
  }

  const row = (name: string) =>
    document.querySelector<HTMLButtonElement>(`[data-control="${name}"]`);

  it('gives the focus to the control that took the place of the one that left the card', async () => {
    render(<People />);
    const ben = row('row.ben')!;
    act(() => ben.focus());
    /* the browser blurs a focused control as it leaves the document (Chrome: focusout with no
       related target, the active element the body); jsdom sends no event, so the test sends it */
    await act(async () => {
      ben.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
      fireEvent.click(ben);
      await Promise.resolve();
    });
    /* the card checks in a task of its own, after the focus move has ended (final pass 2, F1) */
    await nextTask();
    expect(row('row.ben')).toBeNull();
    expect(document.activeElement).toBe(row('row.cy'));
    /* the last control leaves: the one before it in the order */
    const add = row('people.add')!;
    act(() => add.focus());
    await act(async () => {
      add.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
      add.remove();
      await Promise.resolve();
    });
    await nextTask();
    expect(document.activeElement).toBe(row('row.cy'));
  });

  /* the final pass 1, finding 2: Firefox sends no focusout and no blur when the focused element
     leaves the document, so the rule above never ran there and Remove access left the focus on
     the body; jsdom sends none either, so this case reads the browser that sends nothing */
  it('gives the focus to the control at the place of one that left with no focusout (Firefox)', async () => {
    render(<People />);
    const ben = row('row.ben')!;
    act(() => ben.focus());
    await act(async () => {
      fireEvent.click(ben);
      await Promise.resolve();
    });
    await nextTask();
    expect(row('row.ben')).toBeNull();
    expect(document.activeElement).toBe(row('row.cy'));
    /* the last control leaves outside React: the one before it in the order */
    const add = row('people.add')!;
    act(() => add.focus());
    await act(async () => {
      add.remove();
      await Promise.resolve();
    });
    await nextTask();
    expect(document.activeElement).toBe(row('row.cy'));
  });

  it('leaves the focus where it is when the window loses it (the active element stays)', async () => {
    render(<People />);
    const ana = row('row.ana')!;
    act(() => ana.focus());
    await act(async () => {
      ana.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
      await Promise.resolve();
    });
    await nextTask();
    expect(document.activeElement).toBe(ana);
  });
});

/* The keyboard verifier's final pass 2 on the dropdown round, F1: the check above ran from the
   card's MutationObserver in the gap of a focus move, where the page body is the active element,
   whenever the control losing the focus changed the card (the Share expiry field hides, a trigger
   takes its disabled attribute back after its write, Image by URL shows its preview). It moved
   the focus to the control at the old place, and the browser dropped the person's Tab, Shift+Tab
   or click. browserMove makes the gap jsdom does not have. */
describe('a control that changes the card as it loses the focus (final pass 2, F1)', () => {
  const ROLES = [
    { value: 'viewer', label: 'Viewer' },
    { value: 'commenter', label: 'Commenter' },
  ] as const;

  function Share({ busy = false }: { busy?: boolean }) {
    const [expiring, setExpiring] = useState(true);
    return (
      <Dialog title="Share" onClose={() => undefined} control="dialog.moves">
        <Select
          value="viewer"
          options={ROLES}
          label="Role"
          control="moves.role"
          disabled={busy}
          onChange={() => undefined}
        />
        {expiring ? (
          <input
            aria-label="Add expiration"
            data-control="moves.expiry"
            onBlur={() => setExpiring(false)}
          />
        ) : null}
        <button type="button" data-control="moves.settings" disabled={busy}>
          Settings
        </button>
        <input aria-label="Add people by email" data-control="moves.emails" />
      </Dialog>
    );
  }

  const at = (name: string) => document.querySelector<HTMLElement>(`[data-control="${name}"]`);

  it('lets Shift+Tab from a field that hides on blur reach the control above it', async () => {
    render(<Share />);
    const expiry = at('moves.expiry')!;
    act(() => expiry.focus());
    const role = at('moves.role')!;
    const taken = await browserMove(expiry, role);
    expect(at('moves.expiry')).toBeNull();
    expect(taken).toEqual([]);
    expect(document.activeElement).toBe(role);
  });

  it('lets a click from a field that hides on blur reach the email field, which keeps the words typed', async () => {
    render(<Share />);
    const expiry = at('moves.expiry')!;
    act(() => expiry.focus());
    const emails = at('moves.emails') as HTMLInputElement;
    const taken = await browserMove(expiry, emails);
    expect(taken).toEqual([]);
    expect(document.activeElement).toBe(emails);
    fireEvent.change(emails, { target: { value: 'pat@example.test' } });
    expect(emails.value).toBe('pat@example.test');
    expect(document.activeElement).toBe(emails);
  });

  it('lets a click leave a trigger that kept the focus through its write and takes the disabled attribute as it leaves', async () => {
    const view = render(<Share />);
    act(() => at('moves.expiry')!.focus());
    const role = at('moves.role') as HTMLButtonElement;
    act(() => role.focus());
    /* the write runs: every control but the focused trigger is disabled */
    view.rerender(<Share busy />);
    expect(document.activeElement).toBe(role);
    expect(role.disabled).toBe(false);
    expect(role.getAttribute('aria-disabled')).toBe('true');
    const emails = at('moves.emails')!;
    const taken = await browserMove(role, emails);
    expect(role.disabled).toBe(true);
    expect(taken).toEqual([]);
    expect(document.activeElement).toBe(emails);
  });

  function ByUrl() {
    const [preview, setPreview] = useState(false);
    return (
      <Dialog
        title="Insert image"
        onClose={() => undefined}
        control="dialog.byUrl"
        cancel
        actions={[
          { label: 'Insert', primary: true, onClick: () => undefined, control: 'dialog.byUrl.ok' },
        ]}
      >
        <input
          type="url"
          autoFocus
          aria-label="Image address"
          data-control="dialog.byUrl.url"
          onBlur={() => setPreview(true)}
        />
        {preview ? <img alt="" data-control="dialog.byUrl.preview" /> : null}
      </Dialog>
    );
  }

  it('lets Tab from a field the card focused as it opened, whose blur shows a preview, reach Cancel', async () => {
    render(<ByUrl />);
    const url = at('dialog.byUrl.url')!;
    expect(document.activeElement).toBe(url);
    const cancel = at('dialog.byUrl.cancel')!;
    const taken = await browserMove(url, cancel);
    expect(at('dialog.byUrl.preview')).not.toBeNull();
    expect(taken).toEqual([]);
    expect(document.activeElement).toBe(cancel);
  });

  it('gives a drop from the field the card focused as it opened to the control after it, not to Close', async () => {
    render(
      <Dialog
        title="Insert image"
        onClose={() => undefined}
        control="dialog.byUrl"
        cancel
        actions={[
          { label: 'Insert', primary: true, onClick: () => undefined, control: 'dialog.byUrl.ok' },
        ]}
      >
        <input type="url" autoFocus aria-label="Image address" data-control="dialog.byUrl.url" />
        <DialogCheck
          label="Keep the address"
          checked={false}
          onChange={() => undefined}
          control="dialog.byUrl.keep"
        />
      </Dialog>,
    );
    const url = at('dialog.byUrl.url')!;
    expect(document.activeElement).toBe(url);
    /* the field leaves with the focus and no focusout (Firefox; jsdom sends none either) */
    await act(async () => {
      url.remove();
      await Promise.resolve();
    });
    await nextTask();
    expect(document.activeElement).toBe(at('dialog.byUrl.keep'));
  });

  it('gives a drop from the one field of the body to the card, never to Close, Cancel or the confirming button (final pass 3, F1)', async () => {
    render(<ByUrl />);
    const url = at('dialog.byUrl.url')!;
    expect(document.activeElement).toBe(url);
    await act(async () => {
      url.remove();
      await Promise.resolve();
    });
    await nextTask();
    expect(document.activeElement).toBe(at('dialog.byUrl'));
  });

  it('lets Tab from the Image by URL address, typed and not yet previewed, reach Cancel', async () => {
    const shell = {
      input: { slideId: 's1', revision: 1, dispatch: vi.fn() },
      closeDialog: vi.fn(),
    } as unknown as EditorShellState;
    render(
      <EditorShellContext value={shell}>
        <ImageByUrlDialog />
      </EditorShellContext>,
    );
    const address = at('dialog.imageByUrl.url') as HTMLInputElement;
    expect(document.activeElement).toBe(address);
    fireEvent.change(address, { target: { value: 'https://example.test/picture.png' } });
    expect(at('dialog.imageByUrl.preview')).toBeNull();
    const cancel = at('dialog.imageByUrl.cancel')!;
    const taken = await browserMove(address, cancel);
    expect(at('dialog.imageByUrl.preview')).not.toBeNull();
    expect(taken).toEqual([]);
    expect(document.activeElement).toBe(cancel);
  });
});

/* The keyboard verifier's final pass 3 on the dropdown round, F1: a control that took the disabled
   attribute for its own write dropped the focus, and the card gave it to the control at the old
   index of the list the write had shrunk, which was Done; the next Space closed the dialog. A
   control that holds the focus now keeps it through its write (FocusHold.tsx), and a focus that
   is dropped goes back to the same control, else its nearest neighbour after it, never to Done
   or Close. focusFixup makes jsdom drop the focus from a control that takes the attribute, as a
   browser does. */
describe('the focus a write or a leaving control drops (final pass 3, F1)', () => {
  let stop: () => void = () => undefined;
  afterEach(() => {
    stop();
    inFlight.length = 0;
  });
  const at = (name: string) => document.querySelector<HTMLElement>(`[data-control="${name}"]`);

  /* the writes in flight; settle() answers the oldest */
  const inFlight: Array<() => void> = [];
  const settle = async () => {
    await act(async () => {
      inFlight.shift()?.();
      await Promise.resolve();
    });
    await nextTask();
  };

  /** A card whose Save button and Notify box start a write that disables every control. */
  function Writes({ onWrite }: { onWrite: (what: string) => void }) {
    const [busy, setBusy] = useState(false);
    const [notify, setNotify] = useState(false);
    const write = (what: string, after?: () => void) => {
      if (busy) return;
      onWrite(what);
      setBusy(true);
      inFlight.push(() => {
        after?.();
        setBusy(false);
      });
    };
    return (
      <Dialog
        title="Writes"
        onClose={() => undefined}
        control="dialog.writes"
        actions={[
          { label: 'Done', primary: true, onClick: () => undefined, control: 'writes.done' },
        ]}
      >
        <input aria-label="Name" data-control="writes.name" disabled={busy} />
        <DialogCheck
          label="Notify"
          checked={notify}
          disabled={busy}
          onChange={(on) => write('notify', () => setNotify(on))}
          control="writes.notify"
        />
        <HoldButton data-control="writes.save" disabled={busy} onClick={() => write('save')}>
          Save
        </HoldButton>
        <HoldButton data-control="writes.copy" disabled={busy}>
          Copy
        </HoldButton>
      </Dialog>
    );
  }

  it('keeps the focus on a button through the write its press started, ignores a second press, and gives it the attribute once the focus leaves', async () => {
    stop = focusFixup();
    const onWrite = vi.fn();
    render(<Writes onWrite={onWrite} />);
    const save = at('writes.save') as HTMLButtonElement;
    act(() => save.focus());
    fireEvent.click(save);
    expect(onWrite.mock.calls).toEqual([['save']]);
    await nextTask();
    expect(document.activeElement).toBe(save);
    expect(save.disabled).toBe(false);
    expect(save.getAttribute('aria-disabled')).toBe('true');
    /* the neighbours that do not hold the focus take the attribute */
    expect((at('writes.copy') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(save);
    expect(onWrite).toHaveBeenCalledTimes(1);
    await settle();
    expect(document.activeElement).toBe(save);
    expect(save.hasAttribute('aria-disabled')).toBe(false);
    /* disabled again, then the focus leaves it: the attribute once it no longer holds it */
    fireEvent.click(save);
    expect(save.disabled).toBe(false);
    act(() => save.blur());
    expect(save.disabled).toBe(true);
    expect(save.getAttribute('aria-disabled')).toBe('true');
  });

  it('keeps the focus on a check box through the write its Space started: a second Space toggles nothing, one write, and the dialog stays on the box', async () => {
    stop = focusFixup();
    const onWrite = vi.fn();
    render(<Writes onWrite={onWrite} />);
    const box = at('writes.notify') as HTMLInputElement;
    act(() => box.focus());
    /* Space on a check box is its click */
    fireEvent.click(box);
    fireEvent.click(box);
    expect(onWrite.mock.calls).toEqual([['notify']]);
    await nextTask();
    expect(document.activeElement).toBe(box);
    expect(box.disabled).toBe(false);
    expect(box.getAttribute('aria-disabled')).toBe('true');
    expect(box.checked).toBe(false);
    await settle();
    expect(document.activeElement).toBe(box);
    expect(box.checked).toBe(true);
    expect(box.hasAttribute('aria-disabled')).toBe(false);
    /* the next Space toggles it back with a write of its own */
    fireEvent.click(box);
    expect(onWrite.mock.calls).toEqual([['notify'], ['notify']]);
    expect(document.activeElement).toBe(box);
  });

  function Rows({ busy = false, rows }: { busy?: boolean; rows: string[] }) {
    return (
      <Dialog
        title="Rows"
        onClose={() => undefined}
        control="dialog.rows"
        cancel
        actions={[{ label: 'Done', primary: true, onClick: () => undefined, control: 'rows.done' }]}
      >
        {rows.map((row) => (
          <button key={row} type="button" data-control={`rows.${row}`} disabled={busy}>
            {row}
          </button>
        ))}
        <button type="button" data-control="rows.keep">
          Keep
        </button>
        <input aria-label="Add" data-control="rows.add" />
      </Dialog>
    );
  }

  it('gives a dropped focus back to the same control while it stands in the card, not to the control at its old index', async () => {
    const view = render(<Rows rows={['a', 'b', 'c']} />);
    const keep = at('rows.keep')!;
    act(() => keep.focus());
    /* the rows before it take the attribute and the focus falls to the body: the old index
       pointed past the shortened list, at Done */
    view.rerender(<Rows busy rows={['a', 'b', 'c']} />);
    await act(async () => {
      keep.blur();
      await Promise.resolve();
    });
    await nextTask();
    expect(document.activeElement).toBe(keep);
  });

  it('gives the focus of a row that left to the nearest control after it that takes the focus, skipping a disabled one', async () => {
    const view = render(<Rows rows={['a', 'b', 'c']} />);
    act(() => at('rows.b')!.focus());
    view.rerender(<Rows busy rows={['a', 'c']} />);
    await nextTask();
    expect(at('rows.b')).toBeNull();
    /* c stands after b but is disabled; Keep is the nearest after it that takes the focus */
    expect(document.activeElement).toBe(at('rows.keep'));
  });

  it('restores the focus of a row that left outside a focus move in the same task, so no task finds it on the body', async () => {
    const view = render(<Rows rows={['a', 'b']} />);
    act(() => at('rows.b')!.focus());
    act(() => view.rerender(<Rows rows={['a']} />));
    /* the card's observer runs in the microtasks after the render, before any other task */
    await Promise.resolve();
    await Promise.resolve();
    expect(at('rows.b')).toBeNull();
    expect(document.activeElement).toBe(at('rows.keep'));
  });

  it('never gives the focus to Done or Close: the nearest control before the last one, else the card', async () => {
    function Last({ shown }: { shown: ReadonlyArray<'first' | 'last'> }) {
      return (
        <Dialog
          title="Last"
          onClose={() => undefined}
          control="dialog.last"
          actions={[
            { label: 'Done', primary: true, onClick: () => undefined, control: 'last.done' },
          ]}
        >
          {shown.map((each) => (
            <button key={each} type="button" data-control={`last.${each}`}>
              {each}
            </button>
          ))}
        </Dialog>
      );
    }
    const view = render(<Last shown={['first', 'last']} />);
    act(() => at('last.last')!.focus());
    view.rerender(<Last shown={['first']} />);
    await nextTask();
    expect(document.activeElement).toBe(at('last.first'));
    view.rerender(<Last shown={[]} />);
    await nextTask();
    const card = at('dialog.last')!;
    expect(document.activeElement).toBe(card);
    expect(document.activeElement).not.toBe(at('last.done'));
    expect(document.activeElement).not.toBe(at('dialog.last.close'));
  });

  it('scrolls the control the focus lands on into view, the least scroll that shows it', async () => {
    const scrolled: Array<{ el: Element; options: unknown }> = [];
    const scrollIntoView = vi.fn(function (this: Element, options: unknown) {
      scrolled.push({ el: this, options });
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: scrollIntoView,
    });
    try {
      const view = render(<Rows rows={['a', 'b']} />);
      act(() => at('rows.b')!.focus());
      view.rerender(<Rows rows={['a']} />);
      await nextTask();
      expect(document.activeElement).toBe(at('rows.keep'));
      expect(scrolled).toEqual([
        { el: at('rows.keep'), options: { block: 'nearest', inline: 'nearest' } },
      ]);
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    }
  });
});

describe('the focus after a close and the trap (docs/archive/rounds/POLISH.md 2.6 item 65)', () => {
  it('returns the focus to the menubar button of the row that opened the dialog when the row is gone, and never to the body', async () => {
    /* the opener is a menu row that unmounts with its menu (audit-chrome item 15: the focus
       landed on the body for sixteen dialogs); the menubar button of its menu takes the focus */
    function Host() {
      const [open, setOpen] = useState(false);
      const [rowShown, setRowShown] = useState(true);
      return (
        <>
          <button type="button" data-control="menubar.file">
            File
          </button>
          {rowShown ? (
            <div
              role="menuitem"
              tabIndex={0}
              data-menu-item="file.details"
              onClick={() => {
                setOpen(true);
                setRowShown(false);
              }}
            >
              Details
            </div>
          ) : null}
          {open ? (
            <Dialog title="Details" onClose={() => setOpen(false)} control="dialog.details">
              <input type="text" aria-label="Name" />
            </Dialog>
          ) : null}
        </>
      );
    }
    render(<Host />);
    const row = screen.getByRole('menuitem', { name: 'Details' });
    row.focus();
    noteMenuRowActivated('file.details');
    fireEvent.click(row);
    const dialog = screen.getByRole('dialog', { name: 'Details' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    /* the mount effect's cleanup is deferred a tick (lib/useMountEffect), so the focus follows */
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('data-control')).toBe('menubar.file'),
    );
    expect(recentMenuRow()).toBe('file.details');
    expect(focusReturnTarget(null)).toBeNull();
  });

  it('wraps Tab over a summary, so the Logo dialog keeps its focus inside', () => {
    render(
      <Dialog title="Logo" onClose={() => undefined} control="dialog.logo">
        <input type="text" aria-label="Search" />
        <details>
          <summary>More</summary>
          <a href="https://example.com">A link</a>
        </details>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Logo' });
    /* closed: the X button, the field, the summary; the link inside the closed details is one
       the browser's Tab skips, so the trap wraps from the summary (the walk's Logo dialog lost
       five of eight Tabs past its More summary) */
    const closed = focusableIn(dialog);
    expect(closed.map((el) => el.tagName)).toContain('SUMMARY');
    expect(closed.map((el) => el.tagName)).not.toContain('A');
    const summary = closed[closed.length - 1] as HTMLElement;
    expect(summary.tagName).toBe('SUMMARY');
    summary.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(closed[0]);
    /* the focus on the card itself (nothing the list counts): Tab lands on the first element */
    dialog.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(closed[0]);
    /* open: the link is the last element and Tab wraps from it */
    (dialog.querySelector('details') as HTMLDetailsElement).open = true;
    const list = focusableIn(dialog);
    const last = list[list.length - 1] as HTMLElement;
    expect(last.tagName).toBe('A');
    last.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(list[0]);
    (list[0] as HTMLElement).focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});
