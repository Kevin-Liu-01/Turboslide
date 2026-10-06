import { useState } from 'react';

import { Dialog, DialogField } from '../Dialog';
import type { DialogAction } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import { cn } from '../lib/cn';
import { ACCOUNT } from '../menus/strings';
import { tipProps } from '../Tooltip';

import './accounts.css';

/**
 * The sign in dialog (gslides-parity SPEC-3 7.3; research 11 8 P7; docs/REALTIME.md 4.1): 400 px
 * wide and as tall as its content. Before the Round 1 follow-up it was one 400 by 320 box for every
 * state, which left an empty band of about 150 px under Continue with Google on a deployment with
 * Google alone (lane C item 1); the email method's two steps still keep one height between them
 * (accounts.css). The email method when the deployment has a mail sender (one
 * field, Continue; one mail with a magic link and a six digit code, the same answer whether or
 * not the address exists), then the code entry so the tab that asked can finish when the mail
 * opens on a phone. Under the field the methods list: Google first, then GitHub, each when its
 * client is configured, then passkeys when the deployment offers them (TURBOSLIDE_PASSKEY_RPID
 * and the plugin; docs/NEXT.md 3.2 H4, question 14). The dialog draws no method that cannot
 * complete, so before then there is no passkey row. With no mail sender
 * (`TURBOSLIDE_MAIL=off`, the production default of REALTIME.md 7.7) the field and Continue are
 * absent and Google is the primary action: first in the list, focused on open so Enter runs it,
 * and it may be the only method. No passwords. A reserved 20 px error row speaks without moving
 * the box where an answer can arrive inside the dialog (the email method, a passkey); a dialog of
 * methods that leave the page draws no row. The exchanges run through the route's handlers over
 * better-auth's own routes; without them the dialog says sign in is not available on this
 * deployment.
 *
 * The design round (docs/DESIGN.md 9; DR-D5#2): one dialog component on every surface.
 * `SignInView` is the dialog itself and reads no shell; the editor's `SignInDialog` hands it the
 * shell's account, and the pages' Sign in (/home, /decks and the access page,
 * apps/studio/src/components/home/sign-in-dialog.tsx) hands it the page's exchanges. The window is
 * the chrome's Dialog at the 8 px window corner; each method is a 40 px button at the 6 px control
 * corner with its provider's mark before Title Case words ("Continue with Google" stays).
 */
type State = 'methods' | 'code' | 'passkey';

/** What a surface hands the one Sign in dialog: the deployment's methods and their exchanges. */
export type SignInMethods = {
  /** the deployment has an identity runtime; without it the dialog says sign in is not available */
  available: boolean;
  /** the email method: a mail with a link and a six digit code, when the deployment can send it */
  requestCode?: (email: string) => Promise<unknown>;
  /** the code step's exchange; it resolves once the session is set */
  verifyCode?: (email: string, code: string) => Promise<unknown>;
  /** each provider when its client is configured: the call leaves the page for the provider */
  google?: () => unknown;
  github?: () => unknown;
  /** a passkey, when the deployment offers passkeys */
  passkey?: () => Promise<unknown>;
};

export type SignInViewProps = {
  methods: SignInMethods;
  onClose: () => void;
  /** after the code or a passkey signed in: the editor closes the dialog, a page reloads */
  onSignedIn: () => void;
  /** the root of the controls' ids: `dialog.signIn` in the editor, `page.signIn` on a page */
  control?: string;
  /** one sentence under the title */
  lead?: string;
};

/** A provider's own mark, drawn in its own colours before its words (brand marks stay). */
function ProviderMark({ provider }: { provider: 'google' | 'github' }) {
  if (provider === 'google')
    return (
      <svg className="ts-sign-in-mark" viewBox="0 0 48 48" aria-hidden="true">
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
    <svg className="ts-sign-in-mark" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  );
}

/** The one Sign in dialog: every surface draws this component (DR-D5#2). */
export function SignInView({
  methods,
  onClose,
  onSignedIn,
  control = 'dialog.signIn',
  lead,
}: SignInViewProps) {
  const [state, setState] = useState<State>('methods');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const available = methods.available;
  /* the email method exists when the surface wired its exchange (EditorAuthFacts.email, false
     under TURBOSLIDE_MAIL=off); without a database the field is drawn disabled under the sentence */
  const emailOffered = available && methods.requestCode !== undefined;
  const showEmail = !available || emailOffered;
  const googleOffered = methods.google !== undefined;
  const githubOffered = methods.github !== undefined;
  const passkeyOffered = methods.passkey !== undefined;
  /* no mail sender: Google is the primary action (REALTIME.md 4.1) */
  const googlePrimary = googleOffered && !emailOffered;
  const noMethod = available && !emailOffered && !googleOffered && !githubOffered;
  /* the sentence the error row says before any answer: sign in absent, or no method configured */
  const standing = !available
    ? 'Sign in is not available on this deployment'
    : noMethod
      ? 'No sign in method is configured on this deployment'
      : '';
  /* the row is reserved only where an answer can arrive inside the dialog (the email method's
     request and code, a passkey's ceremony); Google and GitHub leave the page, so a dialog of
     those alone draws no empty row under its buttons (the Round 1 follow-up, lane C item 1) */
  const answers = showEmail || passkeyOffered;
  const id = (part: string) => `${control}.${part}`;

  const fail = (err: unknown) => setError(err instanceof Error ? err.message : String(err));

  const request = () => {
    const address = email.trim();
    if (address === '' || busy) return;
    if (!methods.requestCode) {
      setError('Sign in is not available on this deployment');
      return;
    }
    setBusy(true);
    methods
      .requestCode(address)
      .then(() => {
        setError(null);
        setState('code');
      })
      .catch(fail)
      .finally(() => setBusy(false));
  };

  const verify = () => {
    if (code.trim().length !== 6 || busy) return;
    if (!methods.verifyCode) return;
    setBusy(true);
    methods
      .verifyCode(email.trim(), code.trim())
      .then(() => onSignedIn())
      .catch(() => setError(ACCOUNT.signInDialog.failed))
      .finally(() => setBusy(false));
  };

  const leave = (provider: 'google' | 'github') => {
    const go = methods[provider];
    if (go === undefined || busy) return;
    setBusy(true);
    Promise.resolve()
      .then(() => go())
      .catch((err: unknown) => {
        fail(err);
        setBusy(false);
      });
  };

  const passkey = () => {
    if (!methods.passkey || busy) return;
    setBusy(true);
    setState('passkey');
    methods
      .passkey()
      .then(() => onSignedIn())
      .catch((err: unknown) => {
        fail(err);
        setState('methods');
      })
      .finally(() => setBusy(false));
  };

  /* the confirming button: Verify on the code step, Continue while the email field is drawn,
     none otherwise (the Google button then holds the focus and Enter runs it) */
  const primary: DialogAction | null =
    state === 'code'
      ? {
          label: ACCOUNT.signInDialog.verify,
          primary: true,
          disabled: busy || code.trim().length !== 6,
          onClick: verify,
          control: id('verify'),
          doc: 'Signs you in with the code from the mail',
        }
      : showEmail
        ? {
            label: ACCOUNT.signInDialog.continue,
            primary: true,
            disabled: busy || email.trim() === '' || !available,
            onClick: request,
            control: id('continue'),
            doc: 'Sends a mail with a link and a six digit code',
          }
        : null;

  return (
    <Dialog
      title={ACCOUNT.signInDialog.title}
      {...(lead === undefined ? {} : { lead })}
      onClose={onClose}
      width={400}
      control={control}
      className="ts-sign-in"
      cancel
      actions={primary === null ? [] : [primary]}
    >
      <div className="ts-sign-in-body" data-state={state} data-email={showEmail ? 'on' : 'off'}>
        {state === 'methods' || state === 'passkey' ? (
          <>
            {showEmail ? (
              <DialogField label={ACCOUNT.signInDialog.email} doc="Where the link and the code go">
                <input
                  type="email"
                  value={email}
                  autoFocus
                  disabled={!available || busy}
                  aria-label={ACCOUNT.signInDialog.email}
                  data-control={id('email')}
                  autoComplete="email"
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      request();
                    }
                  }}
                />
              </DialogField>
            ) : null}
            {googleOffered || githubOffered || passkeyOffered ? (
              <ul className="ts-sign-in-methods">
                {googleOffered ? (
                  <li>
                    <button
                      type="button"
                      className={cn('ts-sign-in-method', googlePrimary && 'is-primary')}
                      data-control={id('google')}
                      data-primary={googlePrimary ? 'true' : undefined}
                      autoFocus={googlePrimary}
                      disabled={busy}
                      onClick={() => leave('google')}
                      {...tipProps({
                        name: ACCOUNT.signInDialog.google,
                        doc: "Uses your Google account's name and address",
                      })}
                    >
                      <ProviderMark provider="google" />
                      <span>{ACCOUNT.signInDialog.google}</span>
                    </button>
                  </li>
                ) : null}
                {githubOffered ? (
                  <li>
                    <button
                      type="button"
                      className="ts-sign-in-method"
                      data-control={id('github')}
                      disabled={busy}
                      onClick={() => leave('github')}
                      {...tipProps({
                        name: ACCOUNT.signInDialog.github,
                        doc: 'For engineers and agent operators',
                      })}
                    >
                      <ProviderMark provider="github" />
                      <span>{ACCOUNT.signInDialog.github}</span>
                    </button>
                  </li>
                ) : null}
                {/* the passkey row exists only where a passkey can complete (docs/NEXT.md 3.2 H4;
                    audit-auth finding 12): no greyed row and no roadmap sentence before then */}
                {passkeyOffered ? (
                  <li>
                    <button
                      type="button"
                      className="ts-sign-in-method"
                      data-control={id('passkey')}
                      disabled={busy}
                      onClick={passkey}
                      {...tipProps({
                        name: ACCOUNT.signInDialog.passkey,
                        doc: 'Your device confirms it is you',
                      })}
                    >
                      <span>{ACCOUNT.signInDialog.passkey}</span>
                    </button>
                  </li>
                ) : null}
              </ul>
            ) : null}
          </>
        ) : (
          <>
            <p className="ts-sign-in-sent">{ACCOUNT.signInDialog.sent}</p>
            <DialogField label={ACCOUNT.signInDialog.code} doc="The six digits from the mail">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                autoFocus
                className="pt-num"
                aria-label={ACCOUNT.signInDialog.code}
                data-control={id('code')}
                autoComplete="one-time-code"
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, ''));
                  setError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    verify();
                  }
                }}
              />
            </DialogField>
            <button
              type="button"
              className="pt-ib is-text"
              data-control={id('back')}
              onClick={() => setState('methods')}
              {...tipProps({ name: ACCOUNT.signInDialog.back, doc: 'Another address' })}
            >
              <span className="pt-lb">{ACCOUNT.signInDialog.back}</span>
            </button>
          </>
        )}
      </div>
      {answers || error !== null || standing !== '' ? (
        <p className="ts-dialog-error-row" role="alert" data-control={id('error')}>
          {error ?? standing}
        </p>
      ) : null}
    </Dialog>
  );
}

/** The editor's Sign in: the one dialog over the shell's account. */
export function SignInDialog() {
  const shell = useEditorShell();
  const account = shell.input.account;
  const available = account?.signInAvailable === true;
  const methods: SignInMethods = {
    available,
    ...(available && account?.requestCode !== undefined
      ? { requestCode: account.requestCode }
      : {}),
    ...(account?.verifyCode !== undefined ? { verifyCode: account.verifyCode } : {}),
    ...(account?.googleAvailable === true ? { google: () => account.google?.() } : {}),
    ...(account?.githubAvailable === true ? { github: () => account.github?.() } : {}),
    ...(account?.passkeysAvailable === true && account.passkey !== undefined
      ? { passkey: account.passkey }
      : {}),
  };
  return <SignInView methods={methods} onClose={shell.closeDialog} onSignedIn={shell.closeDialog} />;
}
