import { useState } from 'react';

import { Dialog, DialogField } from '../Dialog';
import type { DialogAction } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import { cn } from '../lib/cn';
import { ACCOUNT } from '../menus/strings';
import { tipProps } from '../Tooltip';

import './accounts.css';

/**
 * The sign in dialog (gslides-parity SPEC-3 7.3; research 11 8 P7; docs/REALTIME.md 4.1): one
 * 400 by 320 box for every state. The email method when the deployment has a mail sender (one
 * field, Continue; one mail with a magic link and a six digit code, the same answer whether or
 * not the address exists), then the code entry so the tab that asked can finish when the mail
 * opens on a phone. Under the field the methods list: Google first, then GitHub, each when its
 * client is configured, then passkeys greyed with "Passkeys arrive once the address is final"
 * until the production domain is fixed. With no mail sender (`TURBOSLIDE_MAIL=off`, the
 * production default of REALTIME.md 7.7) the field and Continue are absent and Google is the
 * primary action: first in the list, focused on open so Enter runs it, and it may be the only
 * method. No passwords. A reserved 20 px error row speaks without moving the box. The exchanges
 * run through the route's handlers over better-auth's own routes; without them the dialog says
 * sign in is not available on this deployment.
 */
type State = 'methods' | 'code' | 'passkey';

export function SignInDialog() {
  const shell = useEditorShell();
  const account = shell.input.account;
  const [state, setState] = useState<State>('methods');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const available = account?.signInAvailable === true;
  /* the email method exists when the route wired its exchange (EditorAuthFacts.email, false
     under TURBOSLIDE_MAIL=off); without a database the field is drawn disabled under the sentence */
  const emailOffered = available && account?.requestCode !== undefined;
  const showEmail = !available || emailOffered;
  const googleOffered = account?.googleAvailable === true;
  const githubOffered = account?.githubAvailable === true;
  /* no mail sender: Google is the primary action (REALTIME.md 4.1) */
  const googlePrimary = googleOffered && !emailOffered;
  const noMethod = available && !emailOffered && !googleOffered && !githubOffered;

  const fail = (err: unknown) => setError(err instanceof Error ? err.message : String(err));

  const request = () => {
    const address = email.trim();
    if (address === '' || busy) return;
    if (!account?.requestCode) {
      setError('Sign in is not available on this deployment');
      return;
    }
    setBusy(true);
    account
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
    if (!account?.verifyCode) return;
    setBusy(true);
    account
      .verifyCode(email.trim(), code.trim())
      .then(() => shell.closeDialog())
      .catch(() => setError(ACCOUNT.signInDialog.failed))
      .finally(() => setBusy(false));
  };

  const passkey = () => {
    if (!account?.passkey || busy) return;
    setBusy(true);
    setState('passkey');
    account
      .passkey()
      .then(() => shell.closeDialog())
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
          control: 'dialog.signIn.verify',
          doc: 'Signs you in with the code from the mail',
        }
      : showEmail
        ? {
            label: ACCOUNT.signInDialog.continue,
            primary: true,
            disabled: busy || email.trim() === '' || !available,
            onClick: request,
            control: 'dialog.signIn.continue',
            doc: 'Sends a mail with a link and a six digit code',
          }
        : null;

  return (
    <Dialog
      title={ACCOUNT.signInDialog.title}
      onClose={shell.closeDialog}
      width={400}
      control="dialog.signIn"
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
                  data-control="dialog.signIn.email"
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
            <ul className="ts-sign-in-methods">
              {googleOffered ? (
                <li>
                  <button
                    type="button"
                    className={cn('ts-sign-in-method', googlePrimary && 'is-primary')}
                    data-control="dialog.signIn.google"
                    data-primary={googlePrimary ? 'true' : undefined}
                    autoFocus={googlePrimary}
                    disabled={busy}
                    onClick={() => account?.google?.()}
                    {...tipProps({
                      name: ACCOUNT.signInDialog.google,
                      doc: "Uses your Google account's name and address",
                    })}
                  >
                    <span>{ACCOUNT.signInDialog.google}</span>
                  </button>
                </li>
              ) : null}
              {githubOffered ? (
                <li>
                  <button
                    type="button"
                    className="ts-sign-in-method"
                    data-control="dialog.signIn.github"
                    disabled={busy}
                    onClick={() => account?.github?.()}
                    {...tipProps({
                      name: ACCOUNT.signInDialog.github,
                      doc: 'For engineers and agent operators',
                    })}
                  >
                    <span>{ACCOUNT.signInDialog.github}</span>
                  </button>
                </li>
              ) : null}
              <li>
                <button
                  type="button"
                  className={cn(
                    'ts-sign-in-method',
                    account?.passkeysAvailable !== true && 'is-later',
                  )}
                  aria-disabled={account?.passkeysAvailable !== true}
                  data-control="dialog.signIn.passkey"
                  data-status={account?.passkeysAvailable === true ? 'now' : 'later'}
                  onClick={account?.passkeysAvailable === true ? passkey : undefined}
                  {...tipProps({
                    name: ACCOUNT.signInDialog.passkey,
                    doc:
                      account?.passkeysAvailable === true
                        ? 'Your device confirms it is you'
                        : ACCOUNT.signInDialog.passkeysLater,
                  })}
                >
                  <span>{ACCOUNT.signInDialog.passkey}</span>
                  {account?.passkeysAvailable !== true ? (
                    <span className="ts-sign-in-note">{ACCOUNT.signInDialog.passkeysLater}</span>
                  ) : null}
                </button>
              </li>
            </ul>
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
                aria-label={ACCOUNT.signInDialog.code}
                data-control="dialog.signIn.code"
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
              data-control="dialog.signIn.back"
              onClick={() => setState('methods')}
              {...tipProps({ name: ACCOUNT.signInDialog.back, doc: 'Another address' })}
            >
              <span className="pt-lb">{ACCOUNT.signInDialog.back}</span>
            </button>
          </>
        )}
      </div>
      <p className="ts-dialog-error-row" role="alert" data-control="dialog.signIn.error">
        {error ??
          (!available
            ? 'Sign in is not available on this deployment'
            : noMethod
              ? 'No sign in method is configured on this deployment'
              : '')}
      </p>
    </Dialog>
  );
}
