import { useState } from 'react';

import { Dialog } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import { ACCOUNT, REFUSALS } from '../menus/strings';
import { IdentityChip, nameOf } from '../presence/IdentityChip';
import { tipProps } from '../Tooltip';

import './accounts.css';

/**
 * The profile dialog (gslides-parity SPEC-3 7.4, 7.7; research 11 8 P9): 560 by 640, fixed for
 * every tab. The name with Change name, the avatar with Change avatar, the email and trust state
 * in one sentence, the sessions list (browser, platform, coarse location, times, "This browser",
 * Sign out per row, Sign out everywhere else; 40 px rows with a three row minimum), the agent
 * keys of an account (name, scopes, created, last used, Revoke; a key is shown once by the action
 * that minted it), and Delete account, refused while other people hold grants on decks the caller
 * owns. Every action runs through the route's account handlers.
 */
export function ProfileDialog() {
  const shell = useEditorShell();
  const account = shell.input.account;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = (promise: Promise<unknown> | undefined, done?: string) => {
    if (!promise || busy) return;
    setBusy(true);
    setError(null);
    promise
      .then(() => (done === undefined ? undefined : shell.say(done)))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
  };
  const identity = account?.principal;
  const sessions = account?.sessions ?? [];
  const tokens = account?.tokens ?? [];
  const trustSentence =
    identity === undefined
      ? ''
      : identity.trust === 'verified' && identity.email !== undefined
        ? ACCOUNT.profile.trust.verified(identity.email)
        : identity.trust === 'guest'
          ? ACCOUNT.profile.trust.guest
          : ACCOUNT.profile.trust.label;
  const when = (iso: string) => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleString([], {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
  };

  return (
    <Dialog
      title={ACCOUNT.profile.title}
      onClose={shell.closeDialog}
      width={560}
      control="dialog.profile"
      className="ts-profile"
      actions={[
        {
          label: 'Done',
          primary: true,
          onClick: shell.closeDialog,
          control: 'dialog.profile.done',
          doc: 'Closes the dialog',
        },
      ]}
    >
      {identity === undefined ? (
        <p className="ts-dialog-hint">{REFUSALS.notSignedInOwner}</p>
      ) : (
        <>
          <div className="ts-profile-head" data-control="dialog.profile.head">
            <IdentityChip identity={identity} size={24} self pictureUrl={account?.pictureUrl} />
            <span className="ts-profile-row-text">
              <span className="ts-profile-row-main">{nameOf(identity)}</span>
              <span className="ts-profile-sentence" data-control="dialog.profile.trust">
                {trustSentence}
              </span>
            </span>
            <span className="ts-share-row-acts">
              <button
                type="button"
                className="pt-ib is-text"
                data-control="dialog.profile.changeName"
                onClick={() => shell.openDialog('namePrompt')}
                {...tipProps({ name: ACCOUNT.changeName, doc: 'How others see you' })}
              >
                <span className="pt-lb">{ACCOUNT.changeName}</span>
              </button>
              <button
                type="button"
                className="pt-ib is-text"
                data-control="dialog.profile.changeAvatar"
                onClick={() => shell.openDialog('avatarBuilder')}
                {...tipProps({
                  name: ACCOUNT.changeAvatar,
                  doc: 'Initials, a pattern from your name, or a picture',
                })}
              >
                <span className="pt-lb">{ACCOUNT.changeAvatar}</span>
              </button>
            </span>
          </div>

          <section className="ts-profile-section" aria-label={ACCOUNT.profile.sessions}>
            <div className="ts-profile-section-head">
              <span>{ACCOUNT.profile.sessions}</span>
              {account?.signedIn === true && sessions.length > 1 ? (
                <button
                  type="button"
                  className="pt-ib is-text"
                  disabled={busy}
                  data-control="dialog.profile.signOutOthers"
                  onClick={() => run(account.signOut?.('all'), 'Signed out everywhere else')}
                  {...tipProps({
                    name: ACCOUNT.profile.signOutEverywhereElse,
                    doc: 'Every other browser signs out; this one stays',
                  })}
                >
                  <span className="pt-lb">{ACCOUNT.profile.signOutEverywhereElse}</span>
                </button>
              ) : null}
            </div>
            <ul
              className="ts-profile-rows"
              data-control="dialog.profile.sessions"
              data-count={sessions.length}
            >
              {sessions.length === 0 ? (
                <li className="ts-profile-empty">
                  {account?.signedIn === true ? '' : ACCOUNT.notSignedIn}
                </li>
              ) : (
                sessions.map((session) => (
                  <li
                    key={session.id}
                    className="ts-profile-row"
                    data-control={`dialog.profile.session.${session.id}`}
                    data-current={session.current ? '' : undefined}
                  >
                    <span className="ts-profile-row-text">
                      <span className="ts-profile-row-main">
                        {session.browser}
                        {session.platform ? ` · ${session.platform}` : ''}
                        {session.location ? ` · ${session.location}` : ''}
                      </span>
                      <span className="ts-profile-row-meta">
                        {when(session.lastActiveAt)}
                        {session.current ? ` · ${ACCOUNT.profile.thisBrowser}` : ''}
                      </span>
                    </span>
                    <span />
                    <button
                      type="button"
                      className="pt-ib is-text"
                      disabled={busy}
                      data-control={`dialog.profile.session.${session.id}.signOut`}
                      onClick={() =>
                        run(
                          account?.signOut?.(session.id),
                          session.current ? undefined : 'Signed out that browser',
                        )
                      }
                      {...tipProps({
                        name: ACCOUNT.profile.signOut,
                        doc: session.current
                          ? 'Ends the sign in here; your anonymous identity stays'
                          : 'Ends the sign in on that browser',
                      })}
                    >
                      <span className="pt-lb">{ACCOUNT.profile.signOut}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </section>

          {account?.signedIn === true ? (
            <section className="ts-profile-section" aria-label={ACCOUNT.profile.keys}>
              <div className="ts-profile-section-head">
                <span>{ACCOUNT.profile.keys}</span>
                <span className="ts-profile-sentence">{ACCOUNT.profile.keyShownOnce}</span>
              </div>
              <ul
                className="ts-profile-rows"
                data-control="dialog.profile.tokens"
                data-count={tokens.length}
              >
                {tokens.length === 0 ? (
                  <li className="ts-profile-empty">No keys yet</li>
                ) : (
                  tokens.map((token) => (
                    <li
                      key={token.id}
                      className="ts-profile-row"
                      data-control={`dialog.profile.token.${token.id}`}
                    >
                      <span className="ts-profile-row-text">
                        <span className="ts-profile-row-main">{token.name}</span>
                        <span className="ts-profile-row-meta">
                          {token.scopes.join(', ')} · {when(token.createdAt)}
                          {token.lastUsedAt ? ` · used ${when(token.lastUsedAt)}` : ''}
                        </span>
                      </span>
                      <span />
                      <button
                        type="button"
                        className="pt-ib is-text"
                        disabled={busy || !account.revokeToken}
                        data-control={`dialog.profile.token.${token.id}.revoke`}
                        onClick={() => run(account.revokeToken?.(token.id), 'Key revoked')}
                        {...tipProps({
                          name: ACCOUNT.profile.revoke,
                          doc: 'The key stops working at once',
                        })}
                      >
                        <span className="pt-lb">{ACCOUNT.profile.revoke}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </section>
          ) : null}

          {account?.signedIn === true ? (
            <div className="ts-profile-danger">
              <button
                type="button"
                className="pt-ib is-text"
                disabled={busy || !account.deleteAccount}
                data-control="dialog.profile.deleteAccount"
                onClick={() => {
                  if (window.confirm(`${ACCOUNT.profile.deleteAccount}?`))
                    run(account.deleteAccount?.());
                }}
                {...tipProps({
                  name: ACCOUNT.profile.deleteAccount,
                  doc: 'Removes your sessions, avatar and notifications; edits keep their words',
                })}
              >
                <span className="pt-lb">{ACCOUNT.profile.deleteAccount}</span>
              </button>
            </div>
          ) : null}
        </>
      )}
      <p className="ts-dialog-error-row" role="alert" data-control="dialog.profile.error">
        {error ?? ''}
      </p>
    </Dialog>
  );
}
