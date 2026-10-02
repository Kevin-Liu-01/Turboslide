import { useState } from 'react';

import { Dialog, DialogField } from '@turboslide/chrome/Dialog';
import type { DialogAction } from '@turboslide/chrome/Dialog';
import { ACCOUNT } from '@turboslide/chrome/menus/strings';
import { tipProps } from '@turboslide/chrome/Tooltip';

import type { SignInFacts } from './sign-in';
import { SIGN_IN_WORDS } from './sign-in-words';
import { authPost, returnAddress, socialSignIn } from './sign-in-auth';

import './sign-in.css';

/**
 * The page's Sign in dialog (sign-in.tsx): loaded on the first click of Sign In, so /home's and
 * /decks' first paint carry neither the chrome's Dialog nor the strings module. The providers as
 * buttons, then the email field and its six digit code when the deployment has a mail sender, in
 * the editor dialog's words (`ACCOUNT.signInDialog`).
 */
type Step = 'methods' | 'code';

/** The dialog: the providers as buttons, then the email field and its code step when offered. */
export function PageSignInDialog({
  facts,
  initialError = null,
  onClose,
}: {
  facts: SignInFacts;
  initialError?: string | null;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>('methods');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const fail = (err: unknown) => setError(err instanceof Error ? err.message : String(err));

  const provider = (name: 'google' | 'github') => {
    if (busy) return;
    setBusy(true);
    socialSignIn(name).catch((err: unknown) => {
      fail(err);
      setBusy(false);
    });
  };

  const request = () => {
    const address = email.trim();
    if (address === '' || busy) return;
    setBusy(true);
    authPost('sign-in/magic-link', { email: address, callbackURL: returnAddress() })
      .then(() => {
        setError(null);
        setStep('code');
      })
      .catch(fail)
      .finally(() => setBusy(false));
  };

  const verify = () => {
    if (code.trim().length !== 6 || busy) return;
    setBusy(true);
    authPost('sign-in/email-otp', { email: email.trim(), otp: code.trim() })
      .then(() => window.location.reload())
      .catch(() => {
        setError(ACCOUNT.signInDialog.failed);
        setBusy(false);
      });
  };

  const primary: DialogAction | null =
    step === 'code'
      ? {
          label: ACCOUNT.signInDialog.verify,
          primary: true,
          disabled: busy || code.trim().length !== 6,
          onClick: verify,
          control: 'page.signIn.verify',
          doc: 'Signs you in with the code from the mail',
        }
      : facts.email
        ? {
            label: ACCOUNT.signInDialog.continue,
            primary: true,
            disabled: busy || email.trim() === '',
            onClick: request,
            control: 'page.signIn.continue',
            doc: 'Sends a mail with a link and a six digit code',
          }
        : null;

  return (
    <Dialog
      title={ACCOUNT.signInDialog.title}
      lead={SIGN_IN_WORDS.lead}
      onClose={onClose}
      width={400}
      control="page.signIn"
      className="ts-page-sign-in-dialog"
      cancel
      actions={primary === null ? [] : [primary]}
    >
      {step === 'methods' ? (
        <div className="ts-page-sign-in-body">
          {facts.google || facts.github ? (
            <ul className="ts-page-sign-in-methods">
              {facts.google ? (
                <li>
                  <button
                    type="button"
                    className="pt-ib ts-page-sign-in-method"
                    data-control="page.signIn.google"
                    disabled={busy}
                    autoFocus={!facts.email}
                    onClick={() => provider('google')}
                    {...tipProps({
                      name: ACCOUNT.signInDialog.google,
                      doc: "Uses your Google account's name and address",
                    })}
                  >
                    <span className="pt-lb">{ACCOUNT.signInDialog.google}</span>
                  </button>
                </li>
              ) : null}
              {facts.github ? (
                <li>
                  <button
                    type="button"
                    className="pt-ib ts-page-sign-in-method"
                    data-control="page.signIn.github"
                    disabled={busy}
                    onClick={() => provider('github')}
                    {...tipProps({
                      name: ACCOUNT.signInDialog.github,
                      doc: 'For engineers and agent operators',
                    })}
                  >
                    <span className="pt-lb">{ACCOUNT.signInDialog.github}</span>
                  </button>
                </li>
              ) : null}
            </ul>
          ) : null}
          {facts.email ? (
            <DialogField label={ACCOUNT.signInDialog.email} doc="Where the link and the code go">
              <input
                type="email"
                value={email}
                autoFocus
                disabled={busy}
                aria-label={ACCOUNT.signInDialog.email}
                data-control="page.signIn.email"
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
        </div>
      ) : (
        <div className="ts-page-sign-in-body">
          <p className="ts-page-sign-in-sent">{`${ACCOUNT.signInDialog.sent}.`}</p>
          <DialogField label={ACCOUNT.signInDialog.code} doc="The six digits from the mail">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              autoFocus
              aria-label={ACCOUNT.signInDialog.code}
              data-control="page.signIn.code"
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
            data-control="page.signIn.back"
            onClick={() => setStep('methods')}
            {...tipProps({ name: ACCOUNT.signInDialog.back, doc: 'Another address' })}
          >
            <span className="pt-lb">{ACCOUNT.signInDialog.back}</span>
          </button>
        </div>
      )}
      <p className="ts-dialog-error-row" role="alert" data-control="page.signIn.error">
        {error ?? ''}
      </p>
    </Dialog>
  );
}
