// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthPage } from '../auth/AuthPage';
import { AuthWindow } from '../auth/AuthWindow';
import { AuthRefusal } from '../auth/auth-model';
import type { AuthMethods } from '../auth/auth-model';
import { AUTH_WORDS } from '../auth/auth-words';
import { hideTooltip } from '../Tooltip';

// The auth plate (docs/POLISH-2.md 4.2 to 4.5): one component in two hosts. The page draws the
// heading; the window's title follows the state. Provider rows first, one "or" row, the field with
// Continue under it; the error line reserved only where a typed code answers; Cancel nowhere.

afterEach(() => {
  hideTooltip();
  cleanup();
  try {
    localStorage.clear();
  } catch {
    // no storage
  }
});

const GOOGLE: AuthMethods = { available: true, google: true, github: false, email: false };
const ALL: AuthMethods = { available: true, google: true, github: true, email: true };

/* the load of a shared machine stretches a render: every wait allows 15 s */
const WAIT = { timeout: 15_000 };

const q = (control: string) => document.querySelector<HTMLElement>(`[data-control="${control}"]`);
const ids = (root: ParentNode) =>
  [...root.querySelectorAll('.ts-auth-plate [data-control]')].map(
    (el) => el.getAttribute('data-control') ?? '',
  );

describe('the page host', () => {
  it('draws the heading, the lede, the providers, the or row, the field and Continue in that order', () => {
    render(<AuthPage methods={ALL} actions={{}} />);
    expect(document.querySelector('h1')?.textContent).toBe('Sign in to Turboslide');
    expect(ids(document)).toEqual([
      'page.signIn.google',
      'page.signIn.github',
      'page.signIn.email',
      'page.signIn.continue',
    ]);
    expect(document.querySelector('.ts-auth-or')?.textContent).toBe('or');
    expect(q('page.signIn.google')?.textContent).toBe('Continue with Google');
    expect(q('page.signIn.google')?.querySelector('svg.ts-auth-mark')).not.toBeNull();
    expect(document.querySelector('[data-auth-plate]')?.getAttribute('data-auth-plate')).toBe(
      'methods.all',
    );
    /* the Google sentence where Google is a method; no reserved error line on the methods */
    expect(document.querySelector('.ts-auth-foot-line')?.textContent).toBe(AUTH_WORDS.foot);
    expect(q('page.signIn.error')).toBeNull();
    expect(document.body.textContent).not.toContain('Cancel');
  });

  it('draws Google alone where it is the only method, and one sentence where none is', () => {
    render(<AuthPage methods={GOOGLE} actions={{}} />);
    expect(ids(document)).toEqual(['page.signIn.google']);
    expect(document.querySelector('.ts-auth-or')).toBeNull();
    cleanup();
    render(
      <AuthPage
        methods={{ available: false, google: false, github: false, email: false }}
        actions={{}}
      />,
    );
    expect(q('page.signIn.none')?.textContent).toBe(AUTH_WORDS.none);
    expect(document.querySelectorAll('.ts-auth-plate button, .ts-auth-plate input')).toHaveLength(
      0,
    );
  });

  it('draws an error state with its sentence and Try Again, which returns to the methods', () => {
    const onTryAgain = vi.fn();
    render(
      <AuthPage
        methods={GOOGLE}
        actions={{}}
        initial={{ step: 'error', reason: 'other', code: 'invalid_code' }}
        onTryAgain={onTryAgain}
      />,
    );
    expect(document.querySelector('h1')?.textContent).toBe('Sign in did not complete');
    expect(q('page.signIn.reason')?.textContent).toBe('The sign in did not complete.');
    expect(q('page.signIn.code-named')?.textContent).toBe('Code: invalid_code');
    fireEvent.click(q('page.signIn.retry')!);
    expect(onTryAgain).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-auth-plate]')?.getAttribute('data-auth-plate')).toBe(
      'methods.google',
    );
  });

  it('runs the email method: the mail, the code, the sentence of a wrong code, then the sign in', async () => {
    const requestCode = vi.fn(() => Promise.resolve(null));
    const verifyCode = vi
      .fn<(email: string, code: string) => Promise<unknown>>()
      .mockRejectedValueOnce(new AuthRefusal(400, 'INVALID_OTP', 'Invalid OTP'))
      .mockResolvedValueOnce(null);
    const onSignedIn = vi.fn();
    render(
      <AuthPage methods={ALL} actions={{ requestCode, verifyCode }} onSignedIn={onSignedIn} />,
    );
    fireEvent.change(q('page.signIn.email')!, { target: { value: 'ada@example.com' } });
    fireEvent.click(q('page.signIn.continue')!);
    await vi.waitFor(() => expect(q('page.signIn.code')).not.toBeNull(), WAIT);
    expect(requestCode).toHaveBeenCalledWith('ada@example.com');
    expect(document.querySelector('h1')?.textContent).toBe('Check your email');
    expect(q('page.signIn.sent')?.textContent).toContain('ada@example.com');
    /* the answer state reserves its line before any answer */
    expect(q('page.signIn.error')?.hasAttribute('data-reserved')).toBe(true);
    expect(q('page.signIn.resend')?.textContent).toMatch(/^Send another in 0:4[45]$/);
    fireEvent.change(q('page.signIn.code')!, { target: { value: '123456' } });
    fireEvent.click(q('page.signIn.verify')!);
    await vi.waitFor(
      () => expect(q('page.signIn.error')?.textContent).toBe(AUTH_WORDS.code['code-wrong']),
      WAIT,
    );
    fireEvent.click(q('page.signIn.verify')!);
    await vi.waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1), WAIT);
    expect(verifyCode).toHaveBeenLastCalledWith('ada@example.com', '123456');
  });

  it('says the per address limit before a fourth mail in ten minutes', async () => {
    const requestCode = vi.fn(() => Promise.resolve(null));
    let t = 1_000_000;
    const now = () => t;
    render(<AuthPage methods={ALL} actions={{ requestCode }} now={now} />);
    for (let i = 0; i < 3; i += 1) {
      fireEvent.change(q('page.signIn.email')!, { target: { value: 'ada@example.com' } });
      fireEvent.click(q('page.signIn.continue')!);
      await vi.waitFor(() => expect(q('page.signIn.back'), `mail ${i + 1}`).not.toBeNull(), WAIT);
      t += 60_000;
      fireEvent.click(q('page.signIn.back')!);
    }
    fireEvent.change(q('page.signIn.email')!, { target: { value: 'ada@example.com' } });
    fireEvent.click(q('page.signIn.continue')!);
    await vi.waitFor(
      () => expect(q('page.signIn.error')?.textContent).toBe(AUTH_WORDS.address['address-quota']),
      WAIT,
    );
    expect(requestCode).toHaveBeenCalledTimes(3);
  }, 30_000);

  it('draws the device code in two groups of four and fills both from one paste', () => {
    const decideDevice = vi.fn(() => Promise.resolve(null));
    render(
      <AuthPage
        purpose="device"
        control="device"
        methods={GOOGLE}
        actions={{ decideDevice }}
        initial={{ step: 'device' }}
        deviceCode="wdjb-mjht"
        deviceEmail="ada@example.com"
      />,
    );
    const first = q('device.code.first') as HTMLInputElement;
    const last = q('device.code.last') as HTMLInputElement;
    expect([first.value, last.value]).toEqual(['WDJB', 'MJHT']);
    expect(first.getAttribute('data-num')).toBe('code');
    fireEvent.paste(first, { clipboardData: { getData: () => 'abcd-efgh' } });
    expect([first.value, last.value]).toEqual(['ABCD', 'EFGH']);
    expect(q('device.approve')?.textContent).toBe('Approve');
    expect(q('device.deny')?.textContent).toBe('Deny');
    expect(q('device.error')?.hasAttribute('data-reserved')).toBe(true);
  });
});

describe('the window host', () => {
  it('draws the plate in the chrome window with no action row and no Cancel', () => {
    render(<AuthWindow methods={GOOGLE} actions={{}} onClose={vi.fn()} />);
    const card = q('dialog.signIn');
    expect(card?.classList.contains('pt-window')).toBe(true);
    expect(card?.querySelector('.ts-dialog-title')?.textContent).toBe('Sign in');
    expect(card?.querySelector('.ts-dialog-actions')).toBeNull();
    expect(card?.textContent).not.toContain('Cancel');
    expect(card?.querySelector('h1')).toBeNull();
    expect(ids(document)).toEqual(['dialog.signIn.google']);
  });

  it('opens an error the address carried, and the title follows the state', async () => {
    render(
      <AuthWindow
        methods={GOOGLE}
        actions={{}}
        initial={{ step: 'error', reason: 'account', code: 'account_not_linked' }}
        onClose={vi.fn()}
      />,
    );
    expect(document.querySelector('.ts-dialog-title')?.textContent).toBe(
      'Sign in did not complete',
    );
    expect(q('dialog.signIn.reason')?.textContent).toBe(AUTH_WORDS.error.reasons.account);
    await act(async () => {
      fireEvent.click(q('dialog.signIn.retry')!);
    });
    expect(document.querySelector('.ts-dialog-title')?.textContent).toBe('Sign in');
  });

  it('leaves for Google once and says so when the request fails', async () => {
    const social = vi.fn(() => Promise.reject(new Error('offline')));
    render(<AuthWindow methods={GOOGLE} actions={{ social }} onClose={vi.fn()} />);
    fireEvent.click(q('dialog.signIn.google')!);
    await vi.waitFor(
      () =>
        expect(q('dialog.signIn.error')?.textContent).toBe(AUTH_WORDS.address['request-failed']),
      WAIT,
    );
    expect(social).toHaveBeenCalledWith('google');
  });
});
