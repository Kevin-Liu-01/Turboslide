// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { workedDocument } from '@turboslide/schema/fixtures';

import { holdSignInError, takeHeldSignInError } from '../auth/auth-model';
import { SignInDialog } from '../dialogs/SignIn';
import { buildMenuContext, DEFAULT_SETTINGS } from '../editor-shell';
import type { EditorAccount, EditorShellInput } from '../editor-shell';
import { EditorShellContext } from '../editor-shell-context';
import type { EditorShellState } from '../editor-shell-context';
import { hideTooltip } from '../Tooltip';

// One sign in window (docs/POLISH-2.md 4.2, 4.3, C12): the editor's Sign In, the account menu's
// row, the name prompt and More open the shell's `signIn` dialog, which is the auth plate in its
// window host over the shell's account: the plate's ids under `dialog.signIn`, the route's
// exchanges, an error the deck's address carried opened once, and the close glyph and Escape
// closing it through the shell.

afterEach(() => {
  hideTooltip();
  cleanup();
  takeHeldSignInError();
});

const doc = workedDocument();

function setup(extra: Partial<EditorAccount> = {}) {
  const closeDialog = vi.fn();
  const value: EditorShellInput = {
    deckId: doc.deck.id,
    document: doc,
    slideId: 'content-rule',
    revision: 1,
    dispatch: vi.fn(() => Promise.resolve(null)),
    account: {
      principal: 'anon_11111111-1111-4111-8111-111111111111',
      signedIn: false,
      signInAvailable: true,
      googleAvailable: true,
      google: vi.fn(() => Promise.resolve()),
      requestCode: vi.fn(() => Promise.resolve(null)),
      verifyCode: vi.fn(() => Promise.resolve(null)),
      ...extra,
    } as unknown as EditorAccount,
  };
  const state = {
    input: value,
    platform: 'mac',
    menuContext: buildMenuContext(value, DEFAULT_SETTINGS, 'mac'),
    settings: DEFAULT_SETTINGS,
    closeDialog,
    openDialog: vi.fn(),
    say: vi.fn(),
  } as unknown as EditorShellState;
  const view = render(
    <EditorShellContext.Provider value={state}>
      <SignInDialog />
    </EditorShellContext.Provider>,
  );
  return { view, closeDialog, account: value.account! };
}

const q = (control: string) => document.querySelector<HTMLElement>(`[data-control="${control}"]`);

describe('the one sign in window', () => {
  it('is the auth plate in the chrome window, titled Sign in', () => {
    setup();
    const card = q('dialog.signIn');
    expect(card?.classList.contains('ts-auth-window')).toBe(true);
    expect(card?.querySelector('.ts-dialog-title')?.textContent).toBe('Sign in');
    expect(card?.querySelector('[data-auth-plate]')?.getAttribute('data-auth-plate')).toBe(
      'methods.google-email',
    );
  });

  it('runs the route’s exchanges: the provider, then the code', async () => {
    const { account } = setup();
    fireEvent.click(q('dialog.signIn.google')!);
    await vi.waitFor(() => expect(account.google).toHaveBeenCalledTimes(1), { timeout: 15_000 });
    cleanup();
    const second = setup();
    fireEvent.change(q('dialog.signIn.email')!, { target: { value: 'ada@example.com' } });
    fireEvent.click(q('dialog.signIn.continue')!);
    await vi.waitFor(() => expect(q('dialog.signIn.code')).not.toBeNull(), { timeout: 15_000 });
    expect(second.account.requestCode).toHaveBeenCalledWith('ada@example.com');
    expect(document.querySelector('.ts-dialog-title')?.textContent).toBe('Check your email');
    fireEvent.change(q('dialog.signIn.code')!, { target: { value: '123456' } });
    fireEvent.click(q('dialog.signIn.verify')!);
    await vi.waitFor(
      () => expect(second.account.verifyCode).toHaveBeenCalledWith('ada@example.com', '123456'),
      { timeout: 15_000 },
    );
  }, 60_000);

  it('opens once in the error state the deck’s address carried', () => {
    expect(holdSignInError('account_not_linked')).not.toBeNull();
    setup();
    expect(
      q('dialog.signIn')?.querySelector('[data-auth-plate]')?.getAttribute('data-auth-plate'),
    ).toBe('error.account');
    expect(q('dialog.signIn.reason')?.textContent).toBe(
      'That Google account cannot be joined to the account signed in here.',
    );
    cleanup();
    setup();
    expect(
      q('dialog.signIn')?.querySelector('[data-auth-plate]')?.getAttribute('data-auth-plate'),
    ).toBe('methods.google-email');
  });

  it('closes through the shell on Escape and the close glyph, with no Cancel', () => {
    const { closeDialog } = setup();
    expect(document.body.textContent).not.toContain('Cancel');
    fireEvent.keyDown(q('dialog.signIn')!, { key: 'Escape' });
    fireEvent.click(q('dialog.signIn.close')!);
    expect(closeDialog).toHaveBeenCalledTimes(2);
  });
});
