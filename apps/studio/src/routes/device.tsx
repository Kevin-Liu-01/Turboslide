import { createFileRoute } from '@tanstack/react-router';
import type { CSSProperties } from 'react';
import { useState } from 'react';

import { ACCOUNT } from '@turboslide/chrome/menus/strings';

import { useMountEffect } from '../components/useMountEffect';

// /device (gslides-parity SPEC-3 7.7; research 09 6.2): the verification page of the device
// authorization flow `turboslide login` runs. The CLI asks /api/auth/device/code for a device
// code and an 8 character user code, prints the code and this address, and polls
// /api/auth/device/token; the person opens this page, signs in when they are not (the email
// and code form of 7.3, the same one mail with a link and a code), types the code and approves
// or denies. Five attempts per code, then a new code (RFC 8628 5.1); the library's rate limit
// holds the same number per minute on the approve route. Every state is one fixed box with a
// reserved error row (layout shift rule 9.1), and the words are the sign in dialog's where they
// exist (ACCOUNT.signInDialog) and this page's own for the rest.

export const DEVICE_ATTEMPTS = 5;

export const DEVICE_WORDS = {
  title: 'Sign in a device',
  code: 'Code from the terminal',
  approve: 'Sign in the device',
  deny: 'Deny',
  approved: 'The device is signed in. You can close this tab.',
  denied: 'The device was denied. You can close this tab.',
  noCode: 'That code did not match. Check the terminal and try again',
  spent: 'Too many attempts. Ask the terminal for a new code',
  signInFirst: 'Sign in first, then confirm the code',
} as const;

type DeviceSearch = { user_code?: string };

export const Route = createFileRoute('/device')({
  validateSearch: (search: Record<string, unknown>): DeviceSearch =>
    typeof search.user_code === 'string' ? { user_code: search.user_code.toUpperCase() } : {},
  component: DevicePage,
});

type Step = 'loading' | 'email' | 'otp' | 'code' | 'approved' | 'denied' | 'spent';

async function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
}

const box: CSSProperties = {
  width: 400,
  minHeight: 320,
  margin: '48px auto',
  padding: 24,
  boxSizing: 'border-box',
  border: '1px solid var(--pt-edge, #8a8a88)',
  background: 'var(--pt-paper, #ffffff)',
  color: 'var(--pt-ink, #070707)',
  fontFamily: 'Inter, system-ui, sans-serif',
  display: 'grid',
  gridTemplateRows: 'auto 1fr 20px',
  gap: 12,
};

const field: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  height: 36,
  padding: '0 10px',
  border: '1px solid var(--pt-edge, #8a8a88)',
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
};

const button: CSSProperties = {
  height: 36,
  padding: '0 14px',
  border: '1px solid var(--pt-ink, #070707)',
  background: 'var(--pt-ink, #070707)',
  color: 'var(--pt-paper, #ffffff)',
  font: 'inherit',
  cursor: 'pointer',
};

const quiet: CSSProperties = { ...button, background: 'transparent', color: 'inherit' };

function DevicePage() {
  const search = Route.useSearch();
  const [step, setStep] = useState<Step>('loading');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [code, setCode] = useState(search.user_code ?? '');
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useMountEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/auth/get-session', { credentials: 'same-origin' });
        const body = response.ok ? ((await response.json()) as unknown) : null;
        setStep(body !== null && typeof body === 'object' ? 'code' : 'email');
      } catch {
        setStep('email');
      }
    })();
  });

  const askForCode = async (): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      const response = await postJson('/api/auth/sign-in/magic-link', {
        email: email.trim(),
        callbackURL: `/device${code ? `?user_code=${encodeURIComponent(code)}` : ''}`,
      });
      // the same answer whether or not the address exists (7.3)
      if (response.ok || response.status === 429) setStep('otp');
      else setError(ACCOUNT.signInDialog.failed);
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async (): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      const response = await postJson('/api/auth/sign-in/email-otp', {
        email: email.trim(),
        otp: otp.trim(),
      });
      if (response.ok) setStep('code');
      else setError(ACCOUNT.signInDialog.failed);
    } finally {
      setBusy(false);
    }
  };

  const decide = async (approve: boolean): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      const userCode = code.trim().toUpperCase();
      // the library binds the code to the verifying session first (GET /device?user_code=), then
      // takes the decision; a code nobody asked for fails here and counts as an attempt
      const claimed = await fetch(`/api/auth/device?user_code=${encodeURIComponent(userCode)}`, {
        credentials: 'same-origin',
      });
      const response = claimed.ok
        ? await postJson(`/api/auth/device/${approve ? 'approve' : 'deny'}`, { userCode })
        : claimed;
      if (response.ok) {
        setStep(approve ? 'approved' : 'denied');
        return;
      }
      if (response.status === 401) {
        setStep('email');
        setError(DEVICE_WORDS.signInFirst);
        return;
      }
      const next = attempts + 1;
      setAttempts(next);
      if (next >= DEVICE_ATTEMPTS) setStep('spent');
      else setError(DEVICE_WORDS.noCode);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={box} data-step={step}>
      <h1 style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>{DEVICE_WORDS.title}</h1>
      <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
        {step === 'loading' ? <p style={{ margin: 0 }}>Checking your session.</p> : null}
        {step === 'email' ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void askForCode();
            }}
            style={{ display: 'grid', gap: 12 }}
          >
            <label style={{ display: 'grid', gap: 4 }}>
              <span>{ACCOUNT.signInDialog.email}</span>
              <input
                style={field}
                type="email"
                name="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                data-control="device.email"
              />
            </label>
            <button style={button} type="submit" disabled={busy} data-control="device.continue">
              {ACCOUNT.signInDialog.continue}
            </button>
          </form>
        ) : null}
        {step === 'otp' ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void verifyOtp();
            }}
            style={{ display: 'grid', gap: 12 }}
          >
            <p style={{ margin: 0 }}>{ACCOUNT.signInDialog.sent}</p>
            <label style={{ display: 'grid', gap: 4 }}>
              <span>{ACCOUNT.signInDialog.code}</span>
              <input
                style={field}
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={otp}
                onChange={(event) => setOtp(event.target.value)}
                data-control="device.otp"
              />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={button} type="submit" disabled={busy} data-control="device.verify">
                {ACCOUNT.signInDialog.verify}
              </button>
              <button style={quiet} type="button" onClick={() => setStep('email')}>
                {ACCOUNT.signInDialog.back}
              </button>
            </div>
          </form>
        ) : null}
        {step === 'code' ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void decide(true);
            }}
            style={{ display: 'grid', gap: 12 }}
          >
            <label style={{ display: 'grid', gap: 4 }}>
              <span>{DEVICE_WORDS.code}</span>
              <input
                style={{ ...field, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.08em' }}
                autoComplete="one-time-code"
                maxLength={12}
                required
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                data-control="device.code"
              />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={button} type="submit" disabled={busy} data-control="device.approve">
                {DEVICE_WORDS.approve}
              </button>
              <button
                style={quiet}
                type="button"
                disabled={busy}
                onClick={() => void decide(false)}
                data-control="device.deny"
              >
                {DEVICE_WORDS.deny}
              </button>
            </div>
          </form>
        ) : null}
        {step === 'approved' ? <p style={{ margin: 0 }}>{DEVICE_WORDS.approved}</p> : null}
        {step === 'denied' ? <p style={{ margin: 0 }}>{DEVICE_WORDS.denied}</p> : null}
        {step === 'spent' ? <p style={{ margin: 0 }}>{DEVICE_WORDS.spent}</p> : null}
      </div>
      <p
        role="alert"
        style={{ margin: 0, height: 20, lineHeight: '20px', fontSize: 13 }}
        data-control="device.error"
      >
        {error}
      </p>
    </main>
  );
}
