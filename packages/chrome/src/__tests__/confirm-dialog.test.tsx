// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { workedDocument } from '@turboslide/schema/fixtures';

import { ConfirmDialog } from '../ConfirmDialog';
import { Dialog } from '../Dialog';
import { DeleteForeverDialog } from '../dialogs/DeleteForever';
import { ProfileDialog } from '../dialogs/Profile';
import { DEFAULT_SETTINGS, buildMenuContext } from '../editor-shell';
import type { EditorShellInput } from '../editor-shell';
import { EditorShellContext } from '../editor-shell-context';
import type { EditorShellState } from '../editor-shell-context';
import { HoldButton } from '../FocusHold';
import { hideTooltip } from '../Tooltip';

// The confirm of a destructive act (the Glyphfield port, PLAN.md wave 1 item 6; Glyphfield's
// StudioConfirmDialog.test.tsx): an alertdialog named by its title and described by its lead and
// sentence, Cancel focused on open, Enter on open keeps everything, Escape, the scrim, Close and
// Cancel cancel, the confirming button closes the card, returns the focus to the opener and then
// runs the act once. Delete forever is one of these.

afterEach(() => {
  hideTooltip();
  cleanup();
});

const ctl = (control: string) => document.querySelector<HTMLElement>(`[data-control="${control}"]`);

/** The opener, then the confirm while `open`; the act disables the opener, as Share's write does. */
function Harness({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <HoldButton type="button" data-control="opener" disabled={busy} onClick={() => setOpen(true)}>
        Remove access
      </HoldButton>
      {open ? (
        <ConfirmDialog
          title="Remove access for lee@example.test?"
          sentence="Anyone who could open the presentation may already hold a copy."
          confirmLabel="Remove Access"
          confirmDoc="Takes the person's access away"
          control="confirm.test"
          onClose={() => {
            onClose();
            setOpen(false);
          }}
          onConfirm={() => {
            onConfirm();
            setBusy(true);
          }}
        />
      ) : null}
    </>
  );
}

function openHarness() {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(<Harness onConfirm={onConfirm} onClose={onClose} />);
  const opener = ctl('opener')!;
  act(() => opener.focus());
  fireEvent.click(opener);
  return { onConfirm, onClose, opener };
}

describe('ConfirmDialog', () => {
  it('is an alertdialog named by its title and described by its sentence, with the focus on Cancel', async () => {
    openHarness();
    const card = ctl('confirm.test')!;
    expect(card.getAttribute('role')).toBe('alertdialog');
    expect(card.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(card.getAttribute('aria-labelledby')!)?.textContent).toBe(
      'Remove access for lee@example.test?',
    );
    const described = (card.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ');
    expect(described).toContain('may already hold a copy');
    expect(document.activeElement).toBe(ctl('confirm.test.cancel'));
    /* the frame wait keeps Cancel */
    await act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))));
    expect(document.activeElement).toBe(ctl('confirm.test.cancel'));
    /* Cancel first, the confirming button last; its tooltip names no key */
    const actions = [...card.querySelectorAll('.ts-dialog-actions button')].map((button) =>
      button.getAttribute('data-control'),
    );
    expect(actions).toEqual(['confirm.test.cancel', 'confirm.test.ok']);
    expect(ctl('confirm.test.ok')?.getAttribute('aria-keyshortcuts')).toBeNull();
  });

  it('keeps everything on Enter at open, and cancels on Escape, Cancel, Close and the scrim', () => {
    const { onConfirm, onClose, opener } = openHarness();
    /* Enter on the focused Cancel: the browser clicks the focused button, and the card runs no default */
    const cancel = ctl('confirm.test.cancel')!;
    expect(fireEvent.keyDown(cancel, { key: 'Enter' })).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();
    /* Enter on the card itself (a click on its text) runs no button either */
    const card = ctl('confirm.test')!;
    act(() => card.focus());
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(ctl('confirm.test')).not.toBeNull();

    fireEvent.keyDown(card, { key: 'Escape' });
    expect(ctl('confirm.test')).toBeNull();
    expect(document.activeElement).toBe(opener);

    fireEvent.click(opener);
    fireEvent.click(ctl('confirm.test.cancel')!);
    expect(ctl('confirm.test')).toBeNull();
    expect(document.activeElement).toBe(opener);

    fireEvent.click(opener);
    fireEvent.click(ctl('confirm.test.close')!);
    expect(ctl('confirm.test')).toBeNull();

    fireEvent.click(opener);
    const scrim = ctl('confirm.test')!.parentElement!;
    fireEvent.mouseDown(scrim, { target: scrim });
    expect(ctl('confirm.test')).toBeNull();

    expect(onClose).toHaveBeenCalledTimes(4);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('closes, returns the focus to the opener before the act disables it, then runs the act once', () => {
    const { onConfirm, onClose, opener } = openHarness();
    let focusAtAct: Element | null = null;
    onConfirm.mockImplementation(() => {
      focusAtAct = document.activeElement;
    });
    fireEvent.click(ctl('confirm.test.ok')!);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(focusAtAct).toBe(opener);
    expect(ctl('confirm.test')).toBeNull();
    /* the act disabled the opener while it held the focus: it keeps the focus (FocusHold) */
    expect(document.activeElement).toBe(opener);
    expect(opener.getAttribute('aria-disabled')).toBe('true');
  });

  it('inside another dialog, keeps the focus inside the outer card and back on its opener after the confirm', () => {
    const onConfirm = vi.fn();
    function Outer() {
      const [asking, setAsking] = useState(false);
      return (
        <Dialog title="Share" onClose={() => undefined} control="outer" actions={[]}>
          <button type="button" data-control="outer.remove" onClick={() => setAsking(true)}>
            Remove
          </button>
          {asking ? (
            <ConfirmDialog
              title="Remove access for lee@example.test?"
              sentence="Anyone who could open the presentation may already hold a copy."
              confirmLabel="Remove Access"
              confirmDoc="Takes the person's access away"
              control="outer.confirm"
              onClose={() => setAsking(false)}
              onConfirm={onConfirm}
            />
          ) : null}
        </Dialog>
      );
    }
    render(<Outer />);
    const remove = ctl('outer.remove')!;
    act(() => remove.focus());
    fireEvent.click(remove);
    expect(document.activeElement).toBe(ctl('outer.confirm.cancel'));
    /* Tab from Cancel reaches the confirming button, inside both traps */
    act(() => ctl('outer.confirm.ok')!.focus());
    expect(document.activeElement).toBe(ctl('outer.confirm.ok'));
    fireEvent.click(ctl('outer.confirm.ok')!);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(ctl('outer.confirm')).toBeNull();
    expect(ctl('outer')).not.toBeNull();
    expect(document.activeElement).toBe(remove);
  });
});

describe('DeleteForeverDialog on ConfirmDialog', () => {
  it('opens on Cancel, keeps the deck on Enter at open and deletes from its button', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <DeleteForeverDialog title="Q3 review" slides={4} onConfirm={onConfirm} onClose={onClose} />,
    );
    const card = ctl('trash.confirm')!;
    expect(card.getAttribute('role')).toBe('alertdialog');
    expect(card.querySelector('h2')?.textContent).toBe('Delete Q3 review forever?');
    expect(card.textContent).toContain('This cannot be undone.');
    expect(card.textContent).toContain('4 slides and every version of Q3 review are deleted.');
    expect(document.activeElement).toBe(ctl('trash.confirm.cancel'));
    fireEvent.keyDown(ctl('trash.confirm.cancel')!, { key: 'Enter' });
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(ctl('trash.confirm.ok')!);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("Profile's Delete account on ConfirmDialog", () => {
  it('asks first, naming the account; Cancel keeps it and Delete Account runs the delete once', async () => {
    const deleteAccount = vi.fn(() => Promise.resolve({}));
    const doc = workedDocument();
    const input: EditorShellInput = {
      deckId: doc.deck.id,
      document: doc,
      slideId: 'content-rule',
      revision: 3,
      dispatch: vi.fn(() => Promise.resolve({ revision: 4 })),
      account: {
        principal: {
          principalId: 'usr_7e2f00000000400080000000',
          label: 'Cotton 223',
          name: 'Maya Chen',
          trust: 'verified',
          kind: 'account',
          email: 'maya@example.test',
        },
        signedIn: true,
        signInAvailable: true,
        deleteAccount,
      },
    };
    const state = {
      input,
      platform: 'mac',
      menuContext: buildMenuContext(input, DEFAULT_SETTINGS, 'mac'),
      settings: DEFAULT_SETTINGS,
      closeDialog: vi.fn(),
      openDialog: vi.fn(),
      say: vi.fn(),
      dialog: 'profile',
    } as unknown as EditorShellState;
    render(
      <EditorShellContext value={state}>
        <ProfileDialog />
      </EditorShellContext>,
    );
    const button = ctl('dialog.profile.deleteAccount')!;
    act(() => button.focus());
    fireEvent.click(button);
    const card = ctl('dialog.profile.deleteAccount.confirm')!;
    expect(card.getAttribute('role')).toBe('alertdialog');
    expect(card.querySelector('h2')?.textContent).toBe('Delete your account?');
    expect(card.textContent).toContain('as maya@example.test are deleted');
    /* inside the profile card, so its trap counts the confirm's buttons */
    expect(ctl('dialog.profile')?.contains(card)).toBe(true);
    expect(document.activeElement).toBe(ctl('dialog.profile.deleteAccount.confirm.cancel'));
    fireEvent.click(ctl('dialog.profile.deleteAccount.confirm.cancel')!);
    expect(ctl('dialog.profile.deleteAccount.confirm')).toBeNull();
    expect(document.activeElement).toBe(button);
    expect(deleteAccount).not.toHaveBeenCalled();
    fireEvent.click(button);
    await act(async () => {
      fireEvent.click(ctl('dialog.profile.deleteAccount.confirm.ok')!);
    });
    expect(deleteAccount).toHaveBeenCalledTimes(1);
    expect(ctl('dialog.profile.deleteAccount.confirm')).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});
