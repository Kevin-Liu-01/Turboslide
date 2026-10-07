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

// The editor's sign in window draws the methods the deployment offers and no other (docs/NEXT.md
// 3.2 H4; docs/POLISH-2.md 4.2 to 4.4): Google alone where mail is off (production), the field and
// Continue where it is on, no passkey row, one sentence and no control without a method. The
// window is as tall as its content (the Round 1 follow-up, lane C item 1; P2-A#1 and A#4): no
// fixed height, no action row and no Cancel, the error line reserved only where a code answers.

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

function controls(root: ParentNode): string[] {
  return [...root.querySelectorAll('.ts-auth-plate [data-control]')].map(
    (el) => el.getAttribute('data-control') ?? '',
  );
}

describe('the methods of the sign in window (docs/NEXT.md 3.2 H4)', () => {
  it('draws Google, the or row, the field and Continue where mail is on, and no passkey row', () => {
    const { container } = draw({ passkeysAvailable: true, passkey: vi.fn() });
    expect(controls(container.ownerDocument)).toEqual([
      'dialog.signIn.google',
      'dialog.signIn.email',
      'dialog.signIn.continue',
    ]);
    expect(container.ownerDocument.body.textContent).not.toContain('Passkey');
    expect(container.ownerDocument.body.textContent).not.toContain('Passkeys arrive');
  });

  it('draws Google alone where mail is off, first and focused', () => {
    const { container } = draw({ requestCode: undefined });
    expect(controls(container.ownerDocument)).toEqual(['dialog.signIn.google']);
    expect(container.ownerDocument.activeElement?.getAttribute('data-control')).toBe(
      'dialog.signIn.google',
    );
  });

  it('says sign in is not available, with no control, where no method is configured', () => {
    const { container } = draw({ requestCode: undefined, googleAvailable: false });
    expect(controls(container.ownerDocument)).toEqual(['dialog.signIn.none']);
    expect(
      container.ownerDocument.querySelector('[data-control="dialog.signIn.none"]')?.textContent,
    ).toBe('Sign in is not available on this deployment.');
  });
});

describe('the window is as tall as its content (lane C item 1; P2-A#1, A#4)', () => {
  const sheet = readFileSync(resolve(import.meta.dirname, '../auth/auth.css'), 'utf8');

  it('gives the window and the plate no fixed height and no minimum', () => {
    expect(sheet).not.toMatch(/\.ts-auth-window\s*\{[^}]*\b(min-)?height\s*:/);
    expect(sheet).not.toMatch(/\.ts-auth-plate\s*\{[^}]*\b(min-)?height\s*:/);
  });

  it('draws no action row, no Cancel and no reserved error line on the methods', () => {
    const { container } = draw();
    const doc = container.ownerDocument;
    expect(doc.querySelector('[data-control="dialog.signIn"] .ts-dialog-actions')).toBeNull();
    expect(doc.body.textContent).not.toContain('Cancel');
    expect(doc.querySelector('[data-control="dialog.signIn.error"]')).toBeNull();
  });
});
