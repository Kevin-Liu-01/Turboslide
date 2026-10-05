// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { workedDocument } from '@turboslide/schema/fixtures';

import { SignInDialog } from '../dialogs/SignIn';
import { buildMenuContext, DEFAULT_SETTINGS } from '../editor-shell';
import type { EditorAccount, EditorShellInput } from '../editor-shell';
import { EditorShellContext } from '../editor-shell-context';
import type { EditorShellState } from '../editor-shell-context';
import { hideTooltip } from '../Tooltip';

// The sign in dialog draws no method that cannot complete (docs/NEXT.md 3.2 H4; audit-auth
// finding 12, audit-brand-surfaces rank 23): the passkey row is absent until the deployment offers
// passkeys, and the roadmap sentence "Passkeys arrive once the address is final" is gone.

afterEach(() => {
  hideTooltip();
  cleanup();
});

const doc = workedDocument();

function account(extra: Partial<EditorAccount> = {}): EditorAccount {
  return {
    principal: 'anon_11111111-1111-4111-8111-111111111111',
    signedIn: false,
    signInAvailable: true,
    passkeysAvailable: false,
    githubAvailable: false,
    googleAvailable: true,
    google: vi.fn(),
    requestCode: vi.fn(() => Promise.resolve(null)),
    ...extra,
  } as unknown as EditorAccount;
}

function Host({ value, children }: { value: EditorShellInput; children: React.ReactNode }) {
  const state = {
    input: value,
    platform: 'mac',
    menuContext: buildMenuContext(value, DEFAULT_SETTINGS, 'mac'),
    settings: DEFAULT_SETTINGS,
    closeDialog: vi.fn(),
    openDialog: vi.fn(),
    say: vi.fn(),
  } as unknown as EditorShellState;
  return <EditorShellContext.Provider value={state}>{children}</EditorShellContext.Provider>;
}

function draw(extra: Partial<EditorAccount> = {}) {
  const value: EditorShellInput = {
    deckId: doc.deck.id,
    document: doc,
    slideId: 'content-rule',
    revision: 1,
    dispatch: vi.fn(() => Promise.resolve(null)),
    account: account(extra),
  };
  return render(
    <Host value={value}>
      <SignInDialog />
    </Host>,
  );
}

function methods(root: HTMLElement): string[] {
  return [...root.querySelectorAll('.ts-sign-in-methods [data-control]')].map(
    (el) => el.getAttribute('data-control') ?? '',
  );
}

describe('the sign in methods (docs/NEXT.md 3.2 H4)', () => {
  it('draws no passkey row and no roadmap sentence while the deployment offers no passkeys', () => {
    const { container } = draw();
    expect(methods(container)).toEqual(['dialog.signIn.google']);
    expect(container.querySelector('[data-control="dialog.signIn.passkey"]')).toBeNull();
    expect(container.textContent).not.toContain('Passkeys arrive');
    expect(container.querySelector('.is-later, [aria-disabled="true"]')).toBeNull();
  });

  it('draws the passkey row, enabled, where the deployment offers passkeys', () => {
    const { container } = draw({
      passkeysAvailable: true,
      passkey: vi.fn(() => Promise.resolve(null)),
    });
    expect(methods(container)).toEqual(['dialog.signIn.google', 'dialog.signIn.passkey']);
    const row = container.querySelector<HTMLButtonElement>(
      '[data-control="dialog.signIn.passkey"]',
    );
    expect(row?.disabled).toBe(false);
    expect(row?.getAttribute('aria-disabled')).toBeNull();
  });
});

// The dialog is as tall as its content (the Round 1 follow-up, lane C item 1): production offers
// Google alone (TURBOSLIDE_MAIL=off), and the fixed 400 by 320 box drew Continue with Google over
// an empty band of about 150 px. The sheet holds no fixed height for the dialog, and the reserved
// error row is drawn only where an answer can arrive inside the dialog.
describe('the sign in dialog sizes to its content (Round 1 follow-up, lane C item 1)', () => {
  const sheet = readFileSync(resolve(import.meta.dirname, '../dialogs/accounts.css'), 'utf8');

  it('gives the dialog no fixed height and the body no minimum without the email method', () => {
    expect(sheet).not.toMatch(/\.ts-sign-in\s*\{[^}]*\bheight\s*:/);
    expect(sheet).not.toMatch(/\.ts-sign-in-body\s*\{[^}]*min-height/);
  });

  it('draws Google and no reserved error row where Google is the only method', () => {
    const { container } = draw({ requestCode: undefined });
    expect(methods(container)).toEqual(['dialog.signIn.google']);
    expect(container.querySelector('[data-control="dialog.signIn.email"]')).toBeNull();
    expect(container.querySelector('[data-control="dialog.signIn.error"]')).toBeNull();
    expect(container.querySelector('.ts-sign-in-body')?.getAttribute('data-email')).toBe('off');
  });

  it('keeps the reserved error row where the email method can answer inside the dialog', () => {
    const { container } = draw();
    expect(container.querySelector('[data-control="dialog.signIn.email"]')).not.toBeNull();
    expect(container.querySelector('[data-control="dialog.signIn.error"]')).not.toBeNull();
  });

  it('keeps the reserved error row where a passkey can answer inside the dialog', () => {
    const { container } = draw({
      requestCode: undefined,
      passkeysAvailable: true,
      passkey: vi.fn(() => Promise.resolve(null)),
    });
    expect(container.querySelector('[data-control="dialog.signIn.error"]')).not.toBeNull();
  });

  it('says the standing sentence when no method is configured', () => {
    const { container } = draw({ requestCode: undefined, googleAvailable: false });
    expect(container.querySelector('[data-control="dialog.signIn.error"]')?.textContent).toBe(
      'No sign in method is configured on this deployment',
    );
  });
});
