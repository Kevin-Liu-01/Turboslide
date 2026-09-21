import type { FormEvent, ReactNode } from 'react';
import { useState } from 'react';

import type { LinkComponent } from './editor-shell';
import { ACCESS_PAGE, DIALOGS, REFUSALS } from './menus/strings';
import { tipProps } from './Tooltip';

import './YouNeedAccess.css';

/**
 * The You need access page (gslides-parity SPEC-3 6.5, 6.8, 9.3; research 09 4.4, 8.5;
 * docs/PRODUCT.md 3.3): one page for a restricted and a missing deck (HTTP 404), server rendered.
 * "This presentation is not available to you, or does not exist.", then the links a stranger can
 * use (Your presentations, New presentation) above the request form, and the form only where the
 * deployment has someone to ask (`requestForm`; under `TURBOSLIDE_AUTHORIZE=shadow` with anonymous
 * principals the request reaches no one, audit-interface 33): a role picker defaulting to Viewer,
 * an optional message, an email field for an anonymous requester (decided on the server from the
 * cookie), "Request access", and "Invited by email? Sign in with the address the invitation went
 * to." with the sign in form in a fixed height region. The answer is always "If this presentation
 * exists, its owner has been asked." with HTTP 200. The route mounts it; with `onRequest` the form
 * posts through the window, else it submits to `action`.
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
  /**
   * Draw the request form: false while the deployment has no one to ask (3.3); undefined draws it,
   * the server rendered page's default before the route knows the mode.
   */
  requestForm?: boolean;
  /** the router's link, so the two links above the form are same document transitions */
  linkComponent?: LinkComponent;
};

/** The two links a stranger can use (3.3), in order. */
export const ACCESS_LINKS = [
  { to: '/decks', label: 'Your presentations', doc: 'Every presentation on this Turboslide' },
  { to: '/new', label: 'New presentation', doc: 'Starts a blank presentation' },
] as const;

export function YouNeedAccess({
  anonymous,
  action,
  onRequest,
  signIn,
  cookiesBlocked = false,
  requestForm = true,
  linkComponent,
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

  const Link = linkComponent;
  const link = (entry: (typeof ACCESS_LINKS)[number], solid: boolean) => {
    const shared = {
      className: solid ? 'pt-ib is-solid' : 'pt-ib',
      'data-control': `access.link.${entry.to === '/decks' ? 'decks' : 'new'}`,
      ...tipProps({ name: entry.label, doc: entry.doc }),
    };
    if (Link === undefined)
      return (
        <a key={entry.to} href={entry.to} {...shared}>
          <span className="pt-lb">{entry.label}</span>
        </a>
      );
    return (
      <Link key={entry.to} to={entry.to} preload="intent" {...shared}>
        <span className="pt-lb">{entry.label}</span>
      </Link>
    );
  };

  return (
    <main className="ts-access ts-chrome" data-control="access.page">
      <h1 className="ts-access-title">{ACCESS_PAGE.title}</h1>
      <p className="ts-access-sentence" data-control="access.sentence">
        {REFUSALS.notAvailable}
      </p>
      <nav className="ts-access-links" aria-label="Where to go" data-control="access.links">
        {ACCESS_LINKS.map((entry, index) => link(entry, index === 0))}
      </nav>
      {cookiesBlocked ? (
        <p className="ts-access-cookies">
          A share link needs cookies to open; allow them for this site, or sign in below.
        </p>
      ) : null}
      {requestForm ? (
        <form
          className="ts-access-form"
          method="post"
          action={action}
          onSubmit={submit}
          data-control="access.form"
        >
          <p className="ts-access-form-head">Ask for access</p>
          <label className="ts-access-field">
            <span>{ACCESS_PAGE.role}</span>
            <select
              name="role"
              className="pt-select"
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
              className="pt-ib"
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
      ) : null}
      <section className="ts-access-signin" aria-label="Sign in" data-control="access.signIn">
        <p className="ts-access-invited">{ACCESS_PAGE.invited}</p>
        <div className="ts-access-signin-form">{signIn}</div>
      </section>
    </main>
  );
}
