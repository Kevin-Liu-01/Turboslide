import type { FormEvent, ReactNode } from 'react';
import { useState } from 'react';

import { ACCESS_PAGE, DIALOGS, REFUSALS } from './menus/strings';
import { tipProps } from './Tooltip';

import './YouNeedAccess.css';

/**
 * The You need access page (gslides-parity SPEC-3 6.5, 6.8, 9.3; research 09 4.4, 8.5): one
 * page for a restricted and a missing deck (HTTP 404), server rendered with the form present:
 * "This presentation is not available to you, or does not exist.", a role picker defaulting to
 * Viewer, an optional message, an email field for an anonymous requester (decided on the server
 * from the cookie), "Request access", and "Invited by email? Sign in with the address the
 * invitation went to." with the sign in form in a fixed height region. The answer is always "If
 * this presentation exists, its owner has been asked." with HTTP 200. The route (B4's) mounts it;
 * with `onRequest` the form posts through the window, else it submits to `action`.
 */
export type YouNeedAccessProps = {
  /** the requester has no signed in session: the email field is drawn */
  anonymous: boolean;
  /** the route the form posts to when no `onRequest` is given */
  action?: string;
  onRequest?: (input: { role: string; message: string; email?: string }) => Promise<unknown>;
  /** the sign in form the route renders in the fixed region */
  signIn?: ReactNode;
  /** the browser blocks cookies: the sentence and the sign in path */
  cookiesBlocked?: boolean;
};

export function YouNeedAccess({
  anonymous,
  action,
  onRequest,
  signIn,
  cookiesBlocked = false,
}: YouNeedAccessProps) {
  const [role, setRole] = useState('viewer');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    if (!onRequest) return;
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    onRequest({ role, message, ...(anonymous ? { email } : {}) })
      .catch(() => undefined)
      .finally(() => {
        setBusy(false);
        setAsked(true);
      });
  };

  return (
    <main className="ts-access ts-chrome" data-control="access.page">
      <h1 className="ts-access-title">{ACCESS_PAGE.title}</h1>
      <p className="ts-access-sentence" data-control="access.sentence">
        {REFUSALS.notAvailable}
      </p>
      {cookiesBlocked ? (
        <p className="ts-access-cookies">
          A share link needs cookies to open; allow them for this site, or sign in below.
        </p>
      ) : null}
      <form
        className="ts-access-form"
        method="post"
        action={action}
        onSubmit={submit}
        data-control="access.form"
      >
        <label className="ts-access-field">
          <span>{ACCESS_PAGE.role}</span>
          <select
            name="role"
            value={role}
            data-control="access.role"
            onChange={(event) => setRole(event.target.value)}
            {...tipProps({ name: ACCESS_PAGE.role, doc: 'What you would like to do' })}
          >
            <option value="viewer">{DIALOGS.share.roles.viewer}</option>
            <option value="commenter">{DIALOGS.share.roles.commenter}</option>
            <option value="editor">{DIALOGS.share.roles.editor}</option>
          </select>
        </label>
        <label className="ts-access-field">
          <span>{ACCESS_PAGE.message}</span>
          <textarea
            name="message"
            rows={3}
            value={message}
            data-control="access.message"
            onChange={(event) => setMessage(event.target.value)}
            {...tipProps({ name: ACCESS_PAGE.message, doc: 'A line for the owner' })}
          />
        </label>
        {anonymous ? (
          <label className="ts-access-field">
            <span>{ACCESS_PAGE.email}</span>
            <input
              type="email"
              name="email"
              required
              value={email}
              autoComplete="email"
              data-control="access.email"
              onChange={(event) => setEmail(event.target.value)}
              {...tipProps({ name: ACCESS_PAGE.email, doc: 'Where the answer reaches you' })}
            />
          </label>
        ) : null}
        <div className="ts-access-actions">
          <button
            type="submit"
            className="pt-ib is-solid"
            disabled={busy || asked}
            data-control="access.request"
            {...tipProps({ name: ACCESS_PAGE.requestAccess, doc: 'Asks the owner' })}
          >
            <span className="pt-lb">{ACCESS_PAGE.requestAccess}</span>
          </button>
          <p className="ts-access-answer" role="status" data-control="access.answer">
            {asked ? REFUSALS.requested : ''}
          </p>
        </div>
      </form>
      <section className="ts-access-signin" aria-label="Sign in" data-control="access.signIn">
        <p className="ts-access-invited">{ACCESS_PAGE.invited}</p>
        <div className="ts-access-signin-form">{signIn}</div>
      </section>
    </main>
  );
}
