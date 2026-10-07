import type { ClipboardEvent, FormEvent, KeyboardEvent, ReactNode } from 'react';
import { useEffect, useReducer, useRef, useState } from 'react';

import { cn } from '../lib/cn';
import {
  addressProblemOf,
  canSend,
  cleanDeviceCode,
  clock,
  codeProblemOf,
  nextState,
  offersMethod,
  refusalOf,
  resendWait,
  sendsInWindow,
  stateId,
} from './auth-model';
import type { AuthEvent, AuthMethods, AuthPurpose, AuthState, DeviceProblem } from './auth-model';
import { AUTH_WORDS } from './auth-words';

import './auth.css';

/**
 * The auth plate (docs/POLISH-2.md 4.2): the content of one state of signing in, drawn by both
 * hosts, the page (AuthPage.tsx: /signin, /device) and the window (AuthWindow.tsx: the editor).
 * A heading (the page host's; the window's title carries it there), the lede, the controls, one
 * error line under the control that caused it, and the foot sentence. Provider rows first (Google,
 * then GitHub where configured) as outline rows with the provider's mark and words aligned left,
 * one hairline "or" row, then the Email field with the solid Continue directly under it. The first
 * control takes the focus when a state opens. The error line is reserved only in the states that
 * can answer (a typed code, a device code); elsewhere it is drawn once there is a sentence.
 *
 * The plate calls nothing itself: the host hands it `actions` (the page's exchanges in
 * apps/studio/src/components/home/sign-in-auth.ts, the editor's in EditorRoot.tsx, the gallery's
 * stubs), so the same component draws a deployment, the gallery and a unit test. Auth calls,
 * limits and CSRF are the hosts' and the server's, unchanged by the plate.
 */

/** The exchanges a host hands the plate; each is absent where the deployment does not offer it. */
export type AuthActions = {
  /** leaves the page for the provider; it resolves or rejects before the browser leaves */
  social?: (provider: 'google' | 'github') => Promise<unknown>;
  /** asks for the mail with the link and the six digit code */
  requestCode?: (email: string) => Promise<unknown>;
  /** the six digit code's exchange; it resolves once the session is set */
  verifyCode?: (email: string, code: string) => Promise<unknown>;
  /** the device page's decision on a code (claim, then approve or deny) */
  decideDevice?: (code: string, approve: boolean) => Promise<unknown>;
};

export type AuthHost = 'page' | 'window';

/** The plate's state and its one reducer, held by the host so the window's title can follow it. */
export function useAuthState(initial: AuthState): [AuthState, (event: AuthEvent) => void] {
  return useReducer(nextState, initial);
}

/** The heading a state draws on the page, and the title the window draws for it. */
export function headingOf(state: AuthState, purpose: AuthPurpose, host: AuthHost): string {
  switch (state.step) {
    case 'methods':
      if (purpose === 'device') return AUTH_WORDS.device.heading;
      return host === 'window' ? AUTH_WORDS.windowTitle : AUTH_WORDS.heading;
    case 'sent':
      return AUTH_WORDS.sent.heading;
    case 'error':
      return AUTH_WORDS.error.heading;
    case 'device':
      return AUTH_WORDS.device.heading;
    case 'approved':
      return AUTH_WORDS.device.approvedHeading;
    case 'denied':
      return AUTH_WORDS.device.deniedHeading;
  }
}

/** A provider's own mark in its own colours (brand marks stay); GitHub's in the label's ink. */
export function ProviderMark({ provider }: { provider: 'google' | 'github' }) {
  if (provider === 'google')
    return (
      <svg className="ts-auth-mark" viewBox="0 0 48 48" aria-hidden="true">
        <path
          fill="#EA4335"
          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
        />
        <path
          fill="#4285F4"
          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
        />
        <path
          fill="#FBBC05"
          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
        />
        <path
          fill="#34A853"
          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
        />
      </svg>
    );
  return (
    <svg className="ts-auth-mark" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  );
}

/* the mails this browser asked for each address (a short hash, never the address), so the plate
   says the per address limit (better-auth.ts MAILS_PER_ADDRESS) before it sends a mail the server
   would withhold without a word; a storage that throws keeps the count for the visit alone */
const SENDS_KEY = 'ts-auth-sends';
const visitSends = new Map<string, number[]>();

function addressKey(email: string): string {
  let hash = 0x811c9dc5;
  for (const ch of email.trim().toLowerCase()) {
    hash ^= ch.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

function readSends(email: string): number[] {
  const key = addressKey(email);
  try {
    const all = JSON.parse(localStorage.getItem(SENDS_KEY) ?? '{}') as Record<string, unknown>;
    const list = all[key];
    return Array.isArray(list) ? list.filter((n): n is number => typeof n === 'number') : [];
  } catch {
    // a private window or blocked storage: the visit's own count
    return visitSends.get(key) ?? [];
  }
}

function noteSend(email: string, at: number): number[] {
  const key = addressKey(email);
  const list = [...sendsInWindow(readSends(email), at), at];
  visitSends.set(key, list);
  try {
    const all = JSON.parse(localStorage.getItem(SENDS_KEY) ?? '{}') as Record<string, number[]>;
    all[key] = list;
    localStorage.setItem(SENDS_KEY, JSON.stringify(all));
  } catch {
    // the visit's count stands
  }
  return list;
}

export type AuthPlateProps = {
  host: AuthHost;
  purpose?: AuthPurpose;
  methods: AuthMethods;
  actions: AuthActions;
  state: AuthState;
  dispatch: (event: AuthEvent) => void;
  /** the root of the controls' ids: `page.signIn`, `dialog.signIn`, `device` */
  control: string;
  /** after a code signed in: the page goes to its return address, the window reloads the deck */
  onSignedIn?: () => void;
  /** Try Again on an error state: the page drops `error` from its address */
  onTryAgain?: () => void;
  /** the device page's code from `user_code`, and the signed in address it acts as */
  deviceCode?: string;
  deviceEmail?: string;
  /** when the last mail left, so a sent state opened from elsewhere (the gallery) counts down */
  sentAt?: number;
  /** the clock, for the gallery and the tests */
  now?: () => number;
};

const DEVICE_ATTEMPTS = 5;

export function AuthPlate({
  host,
  purpose = 'sign-in',
  methods,
  actions,
  state,
  dispatch,
  control,
  onSignedIn,
  onTryAgain,
  deviceCode = '',
  deviceEmail = '',
  sentAt,
  now = Date.now,
}: AuthPlateProps) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [device, setDevice] = useState(cleanDeviceCode(deviceCode));
  const [busy, setBusy] = useState(false);
  const [lastSent, setLastSent] = useState<number | null>(sentAt ?? null);
  const [tick, setTick] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const id = (part: string) => `${control}.${part}`;
  const sid = stateId(state, methods, purpose);
  const page = host === 'page';
  const offered = offersMethod(methods);
  const wait = resendWait(lastSent, now());

  /* the first control of a state takes the focus when the state opens, so Enter runs it; the
     window's first open is the Dialog's (it focuses the first control itself) */
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (opened.current === sid) return;
    const first = opened.current !== null || page;
    opened.current = sid;
    if (!first) return;
    const el = root.current?.querySelector<HTMLElement>(
      'input:not([disabled]), button:not([disabled])',
    );
    el?.focus();
  }, [sid, page]);

  /* the countdown of Send Another, one tick a second while the wait runs */
  useEffect(() => {
    if (state.step !== 'sent' || wait <= 0) return undefined;
    const timer = window.setTimeout(() => setTick((n) => n + 1), Math.min(1000, wait));
    return () => window.clearTimeout(timer);
  }, [state.step, wait, tick]);

  const leave = (provider: 'google' | 'github') => {
    const go = actions.social;
    if (go === undefined || busy) return;
    setBusy(true);
    dispatch({ type: 'leave', provider });
    go(provider).catch(() => {
      dispatch({ type: 'left-failed' });
      setBusy(false);
    });
  };

  const send = (address: string, again: boolean) => {
    const ask = actions.requestCode;
    if (ask === undefined || busy) return;
    const at = now();
    if (!canSend(readSends(address), at)) {
      dispatch(again ? { type: 'quota' } : { type: 'address-refused', problem: 'address-quota' });
      return;
    }
    setBusy(true);
    ask(address)
      .then(() => {
        noteSend(address, at);
        setLastSent(at);
        setCode('');
        dispatch({ type: 'sent', email: address });
      })
      .catch((error: unknown) => {
        const problem = addressProblemOf(error);
        if (again)
          dispatch(
            problem === 'address-quota' ? { type: 'quota' } : { type: 'sent', email: address },
          );
        else dispatch({ type: 'address-refused', problem });
      })
      .finally(() => setBusy(false));
  };

  const onEmail = (event: FormEvent) => {
    event.preventDefault();
    const address = email.trim();
    const field = root.current?.querySelector<HTMLInputElement>('input[type="email"]');
    if (address === '' || (field !== null && field !== undefined && !field.checkValidity())) {
      dispatch({ type: 'address-refused', problem: 'address-invalid' });
      return;
    }
    send(address, false);
  };

  const onCode = (event: FormEvent) => {
    event.preventDefault();
    const verify = actions.verifyCode;
    if (state.step !== 'sent' || verify === undefined || busy) return;
    if (code.length !== 6) {
      dispatch({ type: 'code-refused', problem: 'code-wrong' });
      return;
    }
    setBusy(true);
    verify(state.email, code)
      .then(() => onSignedIn?.())
      .catch((error: unknown) => {
        const { code: libraryCode, message } = refusalOf(error);
        dispatch({ type: 'code-refused', problem: codeProblemOf(libraryCode, message) });
      })
      .finally(() => setBusy(false));
  };

  const decide = (approve: boolean) => {
    const run = actions.decideDevice;
    if (run === undefined || busy) return;
    if (device.length !== 8) {
      dispatch({ type: 'device-refused', problem: 'code-wrong' });
      return;
    }
    setBusy(true);
    run(device, approve)
      .then(() => dispatch(approve ? { type: 'approved', email: deviceEmail } : { type: 'denied' }))
      .catch((error: unknown) => {
        const { code: libraryCode } = refusalOf(error);
        const used = attempts + 1;
        setAttempts(used);
        const problem: DeviceProblem = /expired/i.test(libraryCode)
          ? 'expired'
          : used >= DEVICE_ATTEMPTS
            ? 'spent'
            : 'code-wrong';
        dispatch({ type: 'device-refused', problem });
      })
      .finally(() => setBusy(false));
  };

  const heading = page ? (
    <h1 className="ts-auth-heading">{headingOf(state, purpose, host)}</h1>
  ) : null;

  const errorLine = (text: string | null, reserved: boolean, part = 'error') =>
    reserved || text !== null ? (
      <p
        className="ts-auth-error"
        role={text === null ? undefined : 'alert'}
        data-control={id(part)}
        data-reserved={reserved ? '' : undefined}
      >
        {text ?? ''}
      </p>
    ) : null;

  let body: ReactNode = null;

  if (state.step === 'methods') {
    const providers = methods.available && (methods.google || methods.github);
    const emailOn = methods.available && methods.email;
    const addressLine = state.problem !== undefined ? AUTH_WORDS.address[state.problem] : null;
    body = !offered ? (
      <p className="ts-auth-lede" data-control={id('none')}>
        {AUTH_WORDS.none}
      </p>
    ) : (
      <>
        <p className="ts-auth-lede">
          {purpose === 'device' ? AUTH_WORDS.device.first : AUTH_WORDS.lede}
        </p>
        {providers ? (
          <div className="ts-auth-providers">
            {methods.google ? (
              <button
                type="button"
                className="ts-auth-provider is-google"
                data-control={id('google')}
                aria-busy={state.leaving === 'google' ? 'true' : undefined}
                disabled={busy || state.leaving !== undefined}
                onClick={() => leave('google')}
              >
                <ProviderMark provider="google" />
                <span className="ts-auth-label">{AUTH_WORDS.google}</span>
              </button>
            ) : null}
            {methods.github ? (
              <button
                type="button"
                className="ts-auth-provider"
                data-control={id('github')}
                aria-busy={state.leaving === 'github' ? 'true' : undefined}
                disabled={busy || state.leaving !== undefined}
                onClick={() => leave('github')}
              >
                <ProviderMark provider="github" />
                <span className="ts-auth-label">{AUTH_WORDS.github}</span>
              </button>
            ) : null}
            {!emailOn && state.problem === 'request-failed' ? errorLine(addressLine, false) : null}
          </div>
        ) : null}
        {providers && emailOn ? (
          <div className="ts-auth-or" role="separator" aria-label={AUTH_WORDS.or}>
            <span aria-hidden="true">{AUTH_WORDS.or}</span>
          </div>
        ) : null}
        {emailOn ? (
          <form className="ts-auth-form" noValidate onSubmit={onEmail}>
            <label className="ts-auth-field">
              <span className="ts-auth-field-label">{AUTH_WORDS.email}</span>
              <input
                type="email"
                name="email"
                className="ts-auth-input"
                value={email}
                autoComplete="email"
                spellCheck={false}
                placeholder={AUTH_WORDS.emailPlaceholder}
                data-control={id('email')}
                aria-invalid={state.problem === 'address-invalid' ? 'true' : undefined}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <button
              type="submit"
              className="ts-auth-button is-solid"
              data-control={id('continue')}
              disabled={busy}
            >
              <span className="ts-auth-label">{AUTH_WORDS.continue}</span>
            </button>
            {errorLine(addressLine, false)}
          </form>
        ) : null}
        {methods.google ? <p className="ts-auth-foot-line">{AUTH_WORDS.foot}</p> : null}
      </>
    );
  } else if (state.step === 'sent') {
    const codeLine =
      state.problem !== undefined && state.problem !== 'address-quota'
        ? AUTH_WORDS.code[state.problem]
        : null;
    const quotaLine =
      state.problem === 'address-quota' ? AUTH_WORDS.address['address-quota'] : null;
    body = (
      <>
        <p className="ts-auth-lede" data-control={id('sent')}>
          {AUTH_WORDS.sent.lede(state.email)}
        </p>
        <form className="ts-auth-form" noValidate onSubmit={onCode}>
          <label className="ts-auth-field">
            <span className="ts-auth-field-label">{AUTH_WORDS.sent.code}</span>
            <input
              type="text"
              name="code"
              className="ts-auth-input pt-num"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoComplete="one-time-code"
              value={code}
              data-control={id('code')}
              aria-invalid={codeLine === null ? undefined : 'true'}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </label>
          <button
            type="submit"
            className="ts-auth-button is-solid"
            data-control={id('verify')}
            disabled={busy}
          >
            <span className="ts-auth-label">{AUTH_WORDS.sent.verify}</span>
          </button>
          {errorLine(codeLine, true)}
        </form>
        <div className="ts-auth-links">
          <button
            type="button"
            className="ts-auth-text"
            data-control={id('back')}
            disabled={busy}
            onClick={() => {
              setCode('');
              dispatch({ type: 'another-address' });
            }}
          >
            <span className="ts-auth-label">{AUTH_WORDS.sent.another}</span>
          </button>
          <button
            type="button"
            className="ts-auth-text pt-num"
            data-control={id('resend')}
            disabled={busy || wait > 0}
            onClick={() => send(state.email, true)}
          >
            <span className="ts-auth-label">
              {wait > 0 ? AUTH_WORDS.sent.resendIn(clock(wait)) : AUTH_WORDS.sent.resend}
            </span>
          </button>
        </div>
        {errorLine(quotaLine, false, 'quota')}
      </>
    );
  } else if (state.step === 'error') {
    body = (
      <>
        <p className="ts-auth-lede" data-control={id('reason')}>
          {AUTH_WORDS.error.reasons[state.reason]}
        </p>
        {state.reason === 'other' ? (
          <p className="ts-auth-code" data-control={id('code-named')}>
            {AUTH_WORDS.error.code(state.code)}
          </p>
        ) : null}
        <div className="ts-auth-form">
          <button
            type="button"
            className="ts-auth-button is-solid"
            data-control={id('retry')}
            onClick={() => {
              dispatch({ type: 'try-again' });
              onTryAgain?.();
            }}
          >
            <span className="ts-auth-label">{AUTH_WORDS.error.tryAgain}</span>
          </button>
        </div>
      </>
    );
  } else if (state.step === 'device') {
    const line = state.problem === undefined ? null : AUTH_WORDS.device.problems[state.problem];
    const first = device.slice(0, 4);
    const last = device.slice(4, 8);
    const setGroup = (group: 0 | 1, value: string) => {
      const clean = cleanDeviceCode(value);
      const next = group === 0 ? `${clean}${last}`.slice(0, 8) : `${first}${clean}`.slice(0, 8);
      setDevice(group === 0 && clean.length > 4 ? clean : next);
      if (group === 0 && clean.length >= 4)
        root.current
          ?.querySelector<HTMLInputElement>(`[data-control="${id('code.last')}"]`)
          ?.focus();
    };
    const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
      const text = cleanDeviceCode(event.clipboardData.getData('text'));
      if (text.length < 5) return;
      event.preventDefault();
      setDevice(text);
      root.current?.querySelector<HTMLInputElement>(`[data-control="${id('code.last')}"]`)?.focus();
    };
    const onBack = (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Backspace' && last === '')
        root.current
          ?.querySelector<HTMLInputElement>(`[data-control="${id('code.first')}"]`)
          ?.focus();
    };
    body = (
      <>
        <p className="ts-auth-lede">{AUTH_WORDS.device.lede}</p>
        <form
          className="ts-auth-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            decide(true);
          }}
        >
          <fieldset className="ts-auth-code-field">
            <legend className="ts-auth-field-label">{AUTH_WORDS.device.code}</legend>
            <div className="ts-auth-code-groups">
              <input
                type="text"
                className="ts-auth-input pt-num"
                data-num="code"
                aria-label={AUTH_WORDS.device.first4}
                autoComplete="one-time-code"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={8}
                value={first}
                data-control={id('code.first')}
                aria-invalid={line === null ? undefined : 'true'}
                onPaste={onPaste}
                onChange={(event) => setGroup(0, event.target.value)}
              />
              <span className="ts-auth-code-dash" aria-hidden="true">
                -
              </span>
              <input
                type="text"
                className="ts-auth-input pt-num"
                data-num="code"
                aria-label={AUTH_WORDS.device.last4}
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={4}
                value={last}
                data-control={id('code.last')}
                aria-invalid={line === null ? undefined : 'true'}
                onPaste={onPaste}
                onKeyDown={onBack}
                onChange={(event) => setGroup(1, event.target.value)}
              />
            </div>
          </fieldset>
          {errorLine(line, true)}
          <div className="ts-auth-pair">
            <button
              type="submit"
              className="ts-auth-button is-solid"
              data-control={id('approve')}
              disabled={busy || state.problem === 'spent' || state.problem === 'expired'}
            >
              <span className="ts-auth-label">{AUTH_WORDS.device.approve}</span>
            </button>
            <button
              type="button"
              className="ts-auth-button"
              data-control={id('deny')}
              disabled={busy || state.problem === 'spent' || state.problem === 'expired'}
              onClick={() => decide(false)}
            >
              <span className="ts-auth-label">{AUTH_WORDS.device.deny}</span>
            </button>
          </div>
        </form>
        <p className="ts-auth-foot-line">{AUTH_WORDS.device.foot}</p>
      </>
    );
  } else if (state.step === 'approved') {
    body = (
      <p className="ts-auth-lede" data-control={id('outcome')}>
        {AUTH_WORDS.device.approved(state.email)}
      </p>
    );
  } else {
    body = (
      <p className="ts-auth-lede" data-control={id('outcome')}>
        {AUTH_WORDS.device.denied}
      </p>
    );
  }

  return (
    <div
      ref={root}
      className={cn('ts-auth-plate', page ? 'is-page' : 'is-window')}
      data-auth-plate={sid}
      data-control={id('plate')}
      aria-busy={busy ? 'true' : undefined}
    >
      {heading}
      {body}
    </div>
  );
}
