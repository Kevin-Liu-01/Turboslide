// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SignInView } from '../dialogs/SignIn';
import { hideTooltip } from '../Tooltip';

// The one Sign in dialog of the design round (docs/DESIGN.md 9; DR-D5#2b): the editor and the
// pages draw the same component, each with its own exchanges and its own control ids.

afterEach(() => {
  hideTooltip();
  cleanup();
});

function controls(root: HTMLElement): string[] {
  return [...root.querySelectorAll('.ts-sign-in-methods [data-control]')].map(
    (el) => el.getAttribute('data-control') ?? '',
  );
}

describe('the one Sign in dialog', () => {
  it('draws the methods a surface hands it under that surface’s ids, each with its words', () => {
    const { container } = render(
      <SignInView
        methods={{ available: true, google: vi.fn(), github: vi.fn() }}
        onClose={vi.fn()}
        onSignedIn={vi.fn()}
        control="page.signIn"
      />,
    );
    expect(controls(container.ownerDocument.body)).toEqual([
      'page.signIn.google',
      'page.signIn.github',
    ]);
    const google = container.ownerDocument.querySelector('[data-control="page.signIn.google"]');
    expect(google?.textContent).toBe('Continue with Google');
    expect(google?.querySelector('svg.ts-sign-in-mark')).not.toBeNull();
    expect(container.ownerDocument.querySelector('.ts-sign-in')).not.toBeNull();
  });

  it('makes Google the primary action when no email method is handed in', () => {
    render(
      <SignInView
        methods={{ available: true, google: vi.fn() }}
        onClose={vi.fn()}
        onSignedIn={vi.fn()}
      />,
    );
    const google = document.querySelector('[data-control="dialog.signIn.google"]');
    expect(google?.getAttribute('data-primary')).toBe('true');
    expect(document.querySelector('[data-control="dialog.signIn.email"]')).toBeNull();
  });

  it('runs the surface’s exchanges: the provider, then the code and the signed in answer', async () => {
    const google = vi.fn();
    const requestCode = vi.fn(() => Promise.resolve(null));
    const verifyCode = vi.fn(() => Promise.resolve(null));
    const onSignedIn = vi.fn();
    render(
      <SignInView
        methods={{ available: true, google, requestCode, verifyCode }}
        onClose={vi.fn()}
        onSignedIn={onSignedIn}
        control="page.signIn"
      />,
    );
    fireEvent.click(document.querySelector('[data-control="page.signIn.google"]')!);
    await vi.waitFor(() => expect(google).toHaveBeenCalledTimes(1));
    cleanup();
    render(
      <SignInView
        methods={{ available: true, google: vi.fn(), requestCode, verifyCode }}
        onClose={vi.fn()}
        onSignedIn={onSignedIn}
        control="page.signIn"
      />,
    );
    fireEvent.change(document.querySelector('[data-control="page.signIn.email"]')!, {
      target: { value: 'ada@example.com' },
    });
    fireEvent.click(document.querySelector('[data-control="page.signIn.continue"]')!);
    await vi.waitFor(() => expect(requestCode).toHaveBeenCalledWith('ada@example.com'));
    const field = await vi.waitFor(() => {
      const el = document.querySelector('[data-control="page.signIn.code"]');
      expect(el).not.toBeNull();
      return el!;
    });
    fireEvent.change(field, { target: { value: '123456' } });
    fireEvent.click(document.querySelector('[data-control="page.signIn.verify"]')!);
    await vi.waitFor(() => expect(verifyCode).toHaveBeenCalledWith('ada@example.com', '123456'));
    await vi.waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1));
  });

  it('says sign in is not available where the deployment has no identity runtime', () => {
    render(<SignInView methods={{ available: false }} onClose={vi.fn()} onSignedIn={vi.fn()} />);
    expect(document.querySelector('[data-control="dialog.signIn.error"]')?.textContent).toBe(
      'Sign in is not available on this deployment',
    );
  });
});
