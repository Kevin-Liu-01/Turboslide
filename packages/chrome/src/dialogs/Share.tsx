import { useState } from 'react';

import { Dialog, DialogCheck } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import type { AccessGrantView, AccessRequestView, EditorRole, IdentityView } from '../editor-shell';
import { Icon } from '../icons';
import { cn } from '../lib/cn';
import { DIALOGS, SNACKBARS } from '../menus/strings';
import { IdentityChip, nameOf } from '../presence/IdentityChip';
import { tipProps } from '../Tooltip';

import './share.css';

/**
 * The Share dialog (gslides-parity SPEC-3 0.16, 6.5, 9.3; research 09 3.6, 8.5): Google's two
 * halves in Turboslide's words at a fixed width of 520 with rows of fixed height inside scroll
 * regions. "Share <title>"; the Review banner slot at the top, present at every moment ("No
 * pending requests" in the quiet colour, or the banner with Review that expands the requests);
 * "Add people by email" with the role dropdown (Viewer selected), Notify people on by default, the
 * message field and Send; the people list (the owner first, then each grant with its mark, name or
 * email, Pending or Expired in fixed width chips, and a per row dropdown with the roles, Transfer
 * ownership, Add expiration and Remove access); General access, Restricted by default, Anyone with
 * the link with its role (Viewer by default), the legacy sentence with Switch to a link, the links
 * list with Rotate and Revoke; the gear's five switches for the owner; the footer with Copy link
 * (the `/s/` form, minted once), Done, Publish to the web and the sentence about notes and skipped
 * slides. Every write is one `share.*` action with the record's revision. A deck with no record
 * shows the Claim banner. Without an access record the round one links stand in.
 */
const ROLES: ReadonlyArray<{ value: EditorRole; label: string }> = [
  { value: 'viewer', label: DIALOGS.share.roles.viewer },
  { value: 'commenter', label: DIALOGS.share.roles.commenter },
  { value: 'editor', label: DIALOGS.share.roles.editor },
];

const EXPIRY_DAYS: ReadonlyArray<{ id: string; label: string; days: number | null }> = [
  { id: 'none', label: DIALOGS.share.expiry.none, days: null },
  { id: '7', label: DIALOGS.share.expiry.days7, days: 7 },
  { id: '30', label: DIALOGS.share.expiry.days30, days: 30 },
  { id: '90', label: DIALOGS.share.expiry.days90, days: 90 },
];

/** The round one links, kept for a deck with no access record (a checkout, a legacy open deck). */
export function shareLinks(
  origin: string,
  deckId: string,
): ReadonlyArray<{ id: string; label: string; url: string; note?: string }> {
  const id = encodeURIComponent(deckId);
  return [
    {
      id: 'view',
      label: DIALOGS.share.viewLink,
      url: `${origin}/deck/${id}`,
      note: 'Read only, opens on slide 1',
    },
    { id: 'present', label: DIALOGS.share.presentLink, url: `${origin}/deck/${id}?present=1` },
    {
      id: 'edit',
      label: DIALOGS.share.editLink,
      url: `${origin}/edit/${id}`,
      note: DIALOGS.share.anyoneCanEdit,
    },
  ];
}

/** The word of a grant's chip: Pending, Expired or nothing. */
export function grantStatus(
  grant: AccessGrantView,
  now: number = Date.now(),
): 'pending' | 'expired' | null {
  if (grant.status === 'expired') return 'expired';
  if (grant.status === 'pending') return 'pending';
  if (
    grant.expiresAt !== undefined &&
    grant.expiresAt !== null &&
    new Date(grant.expiresAt).getTime() < now
  )
    return 'expired';
  if (grant.acceptedAt === undefined && grant.principal === undefined) return 'pending';
  return null;
}

/** An ISO date `days` from now, for Add expiration (at most one year). */
export function expiryDate(days: number, now: number = Date.now()): string {
  return new Date(now + Math.min(days, 365) * 86_400_000).toISOString();
}

function who(grant: AccessGrantView): string {
  return grant.principal !== undefined ? nameOf(grant.principal) : (grant.email ?? '');
}

function whoKey(grant: AccessGrantView): string {
  return grant.principal?.principalId ?? grant.email ?? '';
}

export function ShareDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const access = input.access;
  const origin = input.origin ?? (typeof window === 'undefined' ? '' : window.location.origin);
  const title = input.document.deck.title;
  const capabilities = input.capabilities;
  const may = (capability: 'share' | 'settings' | 'publish' | 'transfer') =>
    capabilities === undefined || capabilities.includes(capability);
  const owner = access?.via === 'owner' || input.role === 'owner';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emails, setEmails] = useState('');
  const [inviteRole, setInviteRole] = useState<EditorRole>('viewer');
  const [notify, setNotify] = useState(true);
  const [message, setMessage] = useState('');
  const [review, setReview] = useState(false);
  const [gear, setGear] = useState(false);
  const [linkUrl, setLinkUrl] = useState<string | null>(access?.linkUrl ?? null);
  const [expiring, setExpiring] = useState<string | null>(null);

  const copy = (url: string) => {
    navigator.clipboard
      .writeText(url)
      .then(() => shell.say(SNACKBARS.linkCopied))
      .catch(() => shell.say(url));
  };

  const write = (
    action: string,
    payload: Record<string, unknown>,
    done?: (result: unknown) => void,
  ) => {
    if (busy || access === undefined) return;
    setBusy(true);
    setError(null);
    input
      .dispatch(action as never, { id: input.deckId, baseRevision: access.revision, ...payload })
      .then((result) => done?.(result))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
  };

  const invite = () => {
    const list = emails
      .split(/[\s,;]+/)
      .map((each) => each.trim())
      .filter((each) => each !== '');
    if (list.length === 0) return;
    write(
      'share.invite',
      {
        emails: list,
        role: inviteRole,
        notify,
        ...(message.trim() === '' ? {} : { message: message.trim() }),
      },
      () => {
        setEmails('');
        setMessage('');
        shell.say(list.length === 1 ? 'Invitation sent' : `${list.length} invitations sent`);
      },
    );
  };

  /* the round one dialog for a deck with no record */
  if (access === undefined) {
    const links = shareLinks(origin, input.deckId);
    return (
      <Dialog
        title={DIALOGS.share.title(title)}
        onClose={shell.closeDialog}
        width={520}
        control="dialog.share"
        actions={[
          {
            label: DIALOGS.share.done,
            primary: true,
            onClick: shell.closeDialog,
            control: 'dialog.share.done',
            doc: 'Closes the dialog',
          },
        ]}
      >
        <section aria-labelledby="ts-share-links">
          <h3 id="ts-share-links" className="ts-dialog-field-label">
            Links
          </h3>
          <ul className="ts-dialog-list">
            {links.map((link) => (
              <li key={link.id} className="ts-dialog-row" data-control={`dialog.share.${link.id}`}>
                <span className="ts-dialog-row-title">
                  <b>{link.label}</b>
                  {link.note !== undefined ? (
                    <span className="ts-dialog-hint"> · {link.note}</span>
                  ) : null}
                </span>
                <button
                  type="button"
                  className="pt-ib is-text"
                  data-control={`dialog.share.${link.id}.copy`}
                  onClick={() => copy(link.url)}
                  {...tipProps({ name: DIALOGS.share.copyLink, doc: link.url })}
                >
                  <span className="pt-lb">{DIALOGS.share.copyLink}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <p className="ts-share-footer-sentence">{DIALOGS.share.footer}</p>
      </Dialog>
    );
  }

  const requests = access.requests ?? [];
  const grants = access.grants ?? [];
  const links = (access.links ?? []).filter(
    (link) => link.revokedAt === undefined || link.revokedAt === null,
  );
  const mode = access.generalAccess.mode;
  const canShare = may('share');
  const generalCopy = () => {
    if (mode === 'link' && linkUrl !== null) copy(linkUrl);
    else if (mode === 'link' && links[0] !== undefined) {
      /* the token is never shown twice: rotate to mint a fresh one and copy it */
      write('share.rotateLink', { linkId: links[0].id }, (result) => {
        const url = (result as { url?: string }).url;
        if (url !== undefined) {
          setLinkUrl(url);
          copy(url);
        }
      });
    } else copy(`${origin}/deck/${encodeURIComponent(input.deckId)}`);
  };

  return (
    <Dialog
      title={DIALOGS.share.title(title)}
      onClose={shell.closeDialog}
      width={520}
      control="dialog.share"
      className="ts-share"
      actions={[
        {
          label: DIALOGS.share.copyLink,
          onClick: generalCopy,
          control: 'dialog.share.copyLink',
          doc:
            mode === 'link'
              ? 'The address of the link; it carries no notes and no skipped slides'
              : 'The address; only people with access can open it',
        },
        {
          label: DIALOGS.share.done,
          primary: true,
          onClick: shell.closeDialog,
          control: 'dialog.share.done',
          doc: 'Closes the dialog',
        },
      ]}
    >
      {/* the Review banner slot, present at every moment (9.3) */}
      <div
        className={cn('ts-share-review', requests.length > 0 && 'has-requests')}
        data-control="dialog.share.review"
        data-count={requests.length}
      >
        {requests.length === 0 ? (
          <span className="ts-share-quiet">{DIALOGS.share.noPendingRequests}</span>
        ) : (
          <>
            <span>
              {requests.length === 1
                ? 'One person asked for access'
                : `${requests.length} people asked for access`}
            </span>
            <button
              type="button"
              className="pt-ib is-text"
              aria-expanded={review}
              data-control="dialog.share.review.toggle"
              onClick={() => setReview((on) => !on)}
              {...tipProps({
                name: DIALOGS.share.review,
                doc: 'Who asked, for what, and your answer',
              })}
            >
              <span className="pt-lb">{DIALOGS.share.review}</span>
            </button>
          </>
        )}
      </div>
      {review && requests.length > 0 ? (
        <ul className="ts-share-requests pt-scroll" data-control="dialog.share.requests">
          {requests.map((request) => (
            <RequestRow
              key={request.id}
              request={request}
              busy={busy}
              onRespond={(grant, notifyThem) =>
                write('share.respond', { requestId: request.id, grant, notify: notifyThem })
              }
            />
          ))}
        </ul>
      ) : null}

      {access.claimable === true ? (
        <div className="ts-share-claim" data-control="dialog.share.claim">
          <span>{DIALOGS.share.claim}</span>
          <button
            type="button"
            className="pt-ib is-solid"
            disabled={busy || input.account?.signedIn !== true}
            data-control="dialog.share.claim.button"
            onClick={() =>
              write('share.claim', {}, () => shell.say('You own this presentation now'))
            }
            {...tipProps({
              name: DIALOGS.share.claimButton,
              doc:
                input.account?.signedIn === true
                  ? 'You become the owner; the address keeps working for viewers'
                  : 'Sign in first, so the presentation survives a cleared browser',
            })}
          >
            <span className="pt-lb">{DIALOGS.share.claimButton}</span>
          </button>
        </div>
      ) : null}

      {/* the people half */}
      {canShare ? (
        <section className="ts-share-people" aria-label={DIALOGS.share.addPeople}>
          <div className="ts-share-invite">
            <input
              type="text"
              className="ts-share-emails"
              value={emails}
              placeholder={DIALOGS.share.addPeople}
              aria-label={DIALOGS.share.addPeople}
              data-control="dialog.share.emails"
              autoComplete="off"
              {...tipProps({
                name: DIALOGS.share.addPeople,
                doc: 'Addresses separated by commas; Enter sends',
              })}
              onChange={(event) => setEmails(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  invite();
                }
              }}
            />
            <select
              className="ts-share-role"
              value={inviteRole}
              aria-label="Role"
              data-control="dialog.share.inviteRole"
              onChange={(event) => setInviteRole(event.target.value as EditorRole)}
              {...tipProps({ name: 'Role', doc: 'Viewer, Commenter or Editor' })}
            >
              {ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="pt-ib is-solid"
              disabled={busy || emails.trim() === ''}
              data-control="dialog.share.send"
              onClick={invite}
              {...tipProps({
                name: DIALOGS.share.send,
                doc: 'One invitation per address; the mail carries your message',
              })}
            >
              <span className="pt-lb">{DIALOGS.share.send}</span>
            </button>
          </div>
          <div className="ts-share-notify">
            <DialogCheck
              label={DIALOGS.share.notifyPeople}
              checked={notify}
              onChange={setNotify}
              control="dialog.share.notify"
              doc="A mail with the link and your message"
            />
            {notify ? (
              <input
                type="text"
                className="ts-share-message"
                value={message}
                placeholder={DIALOGS.share.message}
                aria-label={DIALOGS.share.message}
                data-control="dialog.share.message"
                onChange={(event) => setMessage(event.target.value)}
                {...tipProps({ name: DIALOGS.share.message, doc: 'Goes in the invitation mail' })}
              />
            ) : (
              <span className="ts-share-message is-empty" aria-hidden="true" />
            )}
          </div>
        </section>
      ) : null}

      <ul
        className="ts-share-list pt-scroll"
        data-control="dialog.share.people"
        aria-label="People with access"
      >
        {access.owner ? (
          <li className="ts-share-row is-owner" data-control="dialog.share.owner">
            <IdentityChip identity={access.owner} size={24} />
            <span className="ts-share-row-name">{nameOf(access.owner)}</span>
            <span className="ts-share-row-chip" aria-hidden="true" />
            <span className="ts-share-row-role">{DIALOGS.share.roles.owner}</span>
          </li>
        ) : null}
        {access.pendingOwner ? (
          <li className="ts-share-row is-pending-owner" data-control="dialog.share.pendingOwner">
            <IdentityChip identity={access.pendingOwner} size={24} />
            <span className="ts-share-row-name">{nameOf(access.pendingOwner)}</span>
            <span className="ts-share-row-chip">{DIALOGS.share.pending}</span>
            <span className="ts-share-row-role">{DIALOGS.share.pendingOwnership}</span>
          </li>
        ) : null}
        {grants.map((grant) => (
          <GrantRow
            key={whoKey(grant)}
            grant={grant}
            canShare={canShare}
            canTransfer={owner && may('transfer')}
            busy={busy}
            expiring={expiring === whoKey(grant)}
            onExpiring={(on) => setExpiring(on ? whoKey(grant) : null)}
            onRole={(role) => write('share.setRole', { who: whoKey(grant), role })}
            onRemove={() => write('share.remove', { who: whoKey(grant) })}
            onExpiry={(at) => write('share.setExpiry', { who: whoKey(grant), expiresAt: at })}
            onTransfer={() =>
              write('share.transferOwnership', { to: whoKey(grant) }, () =>
                shell.say('The transfer is waiting for their answer'),
              )
            }
          />
        ))}
      </ul>

      {/* the general access half */}
      <section className="ts-share-general" aria-label={DIALOGS.share.generalAccess}>
        <h3 className="ts-dialog-field-label">{DIALOGS.share.generalAccess}</h3>
        {mode === 'open' ? (
          <div className="ts-share-general-row" data-control="dialog.share.legacy">
            <Icon name="link" />
            <span className="ts-share-general-words">{DIALOGS.share.legacy}</span>
            {canShare ? (
              <button
                type="button"
                className="pt-ib is-text"
                disabled={busy}
                data-control="dialog.share.switchToLink"
                onClick={() =>
                  write('share.setGeneralAccess', { mode: 'link', role: 'viewer' }, (result) =>
                    setLinkUrl((result as { url?: string }).url ?? null),
                  )
                }
                {...tipProps({
                  name: DIALOGS.share.switchToLink,
                  doc: 'A link that can be revoked; the address alone stops opening the presentation',
                })}
              >
                <span className="pt-lb">{DIALOGS.share.switchToLink}</span>
              </button>
            ) : null}
          </div>
        ) : (
          <div className="ts-share-general-row" data-control="dialog.share.general">
            <Icon name={mode === 'restricted' ? 'lock-closed' : 'link'} />
            <select
              className="ts-share-mode"
              value={mode}
              disabled={!canShare || busy}
              aria-label={DIALOGS.share.generalAccess}
              data-control="dialog.share.mode"
              onChange={(event) => {
                const next = event.target.value;
                if (next === 'link')
                  write('share.setGeneralAccess', { mode: 'link', role: 'viewer' }, (result) =>
                    setLinkUrl((result as { url?: string }).url ?? null),
                  );
                else
                  write('share.setGeneralAccess', { mode: 'restricted' }, () => setLinkUrl(null));
              }}
              {...tipProps({
                name: DIALOGS.share.generalAccess,
                doc:
                  mode === 'restricted'
                    ? DIALOGS.share.restrictedDoc
                    : 'No sign in needed; the link can be revoked',
              })}
            >
              <option value="restricted">{DIALOGS.share.restricted}</option>
              <option value="link">{DIALOGS.share.anyoneWithLink}</option>
            </select>
            {mode === 'link' ? (
              <select
                className="ts-share-role"
                value={access.generalAccess.role}
                disabled={!canShare || busy}
                aria-label="Link role"
                data-control="dialog.share.linkRole"
                onChange={(event) =>
                  write(
                    'share.setGeneralAccess',
                    { mode: 'link', role: event.target.value },
                    (result) => setLinkUrl((result as { url?: string }).url ?? linkUrl),
                  )
                }
                {...tipProps({ name: 'Link role', doc: 'What anyone with the link may do' })}
              >
                {ROLES.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            ) : (
              <span className="ts-share-quiet">{DIALOGS.share.restrictedDoc}</span>
            )}
          </div>
        )}
        {links.length > 1 || (links.length === 1 && canShare) ? (
          <ul className="ts-share-links pt-scroll" data-control="dialog.share.links">
            {links.map((link) => (
              <li
                key={link.id}
                className="ts-share-row is-link"
                data-control={`dialog.share.link.${link.id}`}
              >
                <span className="ts-share-row-name">
                  {link.label ?? DIALOGS.share.anyoneWithLink}
                </span>
                <span className="ts-share-row-role">
                  {ROLES.find((role) => role.value === link.role)?.label ?? link.role}
                </span>
                <span className="ts-share-row-meta">
                  {new Date(link.createdAt).toLocaleDateString()}
                  {link.expiresAt
                    ? ` · ${DIALOGS.share.links.expires} ${new Date(link.expiresAt).toLocaleDateString()}`
                    : ''}
                </span>
                {canShare ? (
                  <span className="ts-share-row-acts">
                    <button
                      type="button"
                      className="pt-ib is-text"
                      disabled={busy}
                      data-control={`dialog.share.link.${link.id}.rotate`}
                      onClick={() =>
                        write('share.rotateLink', { linkId: link.id }, (result) => {
                          const url = (result as { url?: string }).url;
                          if (url) {
                            setLinkUrl(url);
                            copy(url);
                          }
                        })
                      }
                      {...tipProps({
                        name: DIALOGS.share.rotate,
                        doc: 'A new address; the old one stops working',
                      })}
                    >
                      <span className="pt-lb">{DIALOGS.share.rotate}</span>
                    </button>
                    <button
                      type="button"
                      className="pt-ib is-text"
                      disabled={busy}
                      data-control={`dialog.share.link.${link.id}.revoke`}
                      onClick={() => write('share.revokeLink', { linkId: link.id })}
                      {...tipProps({
                        name: DIALOGS.share.revoke,
                        doc: 'The address stops working for everyone who has it',
                      })}
                    >
                      <span className="pt-lb">{DIALOGS.share.revoke}</span>
                    </button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {mode !== 'restricted' && canShare ? (
          <button
            type="button"
            className="pt-ib is-text ts-share-stop"
            disabled={busy}
            data-control="dialog.share.stop"
            onClick={() => write('share.stop', {}, () => setLinkUrl(null))}
            {...tipProps({
              name: DIALOGS.share.stopSharing,
              doc: 'Restricted, with every link revoked',
            })}
          >
            <span className="pt-lb">{DIALOGS.share.stopSharing}</span>
          </button>
        ) : null}
      </section>

      {/* the gear: owner only (6.5) */}
      {owner && may('settings') ? (
        <section className="ts-share-gear" aria-label="Settings">
          <button
            type="button"
            className="pt-ib pt-icon ts-share-gear-btn"
            aria-expanded={gear}
            aria-label="Settings"
            data-control="dialog.share.gear"
            onClick={() => setGear((on) => !on)}
            {...tipProps({ name: 'Settings', doc: 'What editors, viewers and commenters may do' })}
          >
            <Icon name="adjustments" />
          </button>
          {gear ? (
            <div className="ts-share-switches" data-control="dialog.share.settings">
              {(
                [
                  ['editorsCanShare', DIALOGS.share.settings.editorsCanShare, true],
                  ['viewersCanDownload', DIALOGS.share.settings.viewersCanDownload, true],
                  ['viewersCanSeeComments', DIALOGS.share.settings.viewersCanSeeComments, false],
                  [
                    'showNamesToLinkVisitors',
                    DIALOGS.share.settings.showNamesToLinkVisitors,
                    false,
                  ],
                  ['allowHtmlBlocks', DIALOGS.share.settings.allowHtmlBlocks, false],
                ] as const
              ).map(([key, label, fallback]) => (
                <DialogCheck
                  key={key}
                  label={label}
                  checked={access.settings?.[key] ?? fallback}
                  disabled={busy}
                  onChange={(on) => write('share.settings', { [key]: on })}
                  control={`dialog.share.settings.${key}`}
                  doc={
                    key === 'viewersCanDownload' ? DIALOGS.share.settings.downloadNote : undefined
                  }
                />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="ts-share-foot">
        {may('publish') ? (
          <button
            type="button"
            className="pt-ib is-text"
            data-control="dialog.share.publish"
            onClick={() => shell.openDialog('publish')}
            {...tipProps({
              name: DIALOGS.share.publishToWeb,
              doc: 'A player link and an embed code; Stop publishing lives there too',
            })}
          >
            <span className="pt-lb">{DIALOGS.share.publishToWeb}</span>
          </button>
        ) : null}
        <p className="ts-share-footer-sentence" data-control="dialog.share.footer">
          {DIALOGS.share.footer}
        </p>
      </div>
      <p className="ts-dialog-error-row" role="alert" data-control="dialog.share.error">
        {error ?? ''}
      </p>
    </Dialog>
  );
}

function RequestRow({
  request,
  busy,
  onRespond,
}: {
  request: AccessRequestView;
  busy: boolean;
  onRespond: (grant: EditorRole | null, notify: boolean) => void;
}) {
  const [notify, setNotify] = useState(true);
  const name = request.principal !== undefined ? nameOf(request.principal) : (request.email ?? '');
  const roleLabel = ROLES.find((role) => role.value === request.role)?.label ?? request.role;
  return (
    <li className="ts-share-request" data-control={`dialog.share.request.${request.id}`}>
      <span className="ts-share-request-who">
        {request.principal ? (
          <IdentityChip identity={request.principal} size={24} />
        ) : (
          <span className="ts-chip is-blank" />
        )}
        <span className="ts-share-row-name">{name}</span>
        <span className="ts-share-row-role">{roleLabel}</span>
      </span>
      {request.message !== undefined && request.message !== '' ? (
        <q className="ts-share-request-message">{request.message}</q>
      ) : (
        <span className="ts-share-request-message" />
      )}
      <span className="ts-share-request-acts">
        <label
          className="ts-share-request-notify"
          {...tipProps({ name: DIALOGS.share.notify, doc: 'Mail the answer to the requester' })}
        >
          <input
            type="checkbox"
            checked={notify}
            data-control={`dialog.share.request.${request.id}.notify`}
            onChange={(event) => setNotify(event.target.checked)}
          />
          <span>{DIALOGS.share.notify}</span>
        </label>
        <button
          type="button"
          className="pt-ib is-text"
          disabled={busy}
          data-control={`dialog.share.request.${request.id}.decline`}
          onClick={() => onRespond(null, notify)}
          {...tipProps({
            name: DIALOGS.share.decline,
            doc: 'No access; the requester is told when Notify is on',
          })}
        >
          <span className="pt-lb">{DIALOGS.share.decline}</span>
        </button>
        <button
          type="button"
          className="pt-ib is-solid"
          disabled={busy}
          data-control={`dialog.share.request.${request.id}.approve`}
          onClick={() => onRespond(request.role, notify)}
          {...tipProps({
            name: DIALOGS.share.approveAs(roleLabel),
            doc: 'Grants the role that was asked for',
          })}
        >
          <span className="pt-lb">{DIALOGS.share.approveAs(roleLabel)}</span>
        </button>
      </span>
    </li>
  );
}

function GrantRow({
  grant,
  canShare,
  canTransfer,
  busy,
  expiring,
  onExpiring,
  onRole,
  onRemove,
  onExpiry,
  onTransfer,
}: {
  grant: AccessGrantView;
  canShare: boolean;
  canTransfer: boolean;
  busy: boolean;
  expiring: boolean;
  onExpiring: (on: boolean) => void;
  onRole: (role: EditorRole) => void;
  onRemove: () => void;
  onExpiry: (at: string | null) => void;
  onTransfer: () => void;
}) {
  const status = grantStatus(grant);
  const identity: IdentityView | undefined = grant.principal;
  const key = whoKey(grant);
  return (
    <li
      className={cn('ts-share-row', status !== null && `is-${status}`)}
      data-control={`dialog.share.grant.${key}`}
      data-status={status ?? 'active'}
    >
      {identity ? (
        <IdentityChip identity={identity} size={24} />
      ) : (
        <span className="ts-chip is-blank" />
      )}
      <span className="ts-share-row-name" title={grant.email}>
        {who(grant)}
      </span>
      <span className="ts-share-row-chip">
        {status === 'pending'
          ? DIALOGS.share.pending
          : status === 'expired'
            ? DIALOGS.share.expired
            : ''}
      </span>
      {canShare ? (
        <select
          className="ts-share-role"
          value={expiring ? 'expiry' : grant.role}
          disabled={busy}
          aria-label={`Role of ${who(grant)}`}
          data-control={`dialog.share.grant.${key}.role`}
          onChange={(event) => {
            const value = event.target.value;
            if (value === 'transfer') onTransfer();
            else if (value === 'expiry') onExpiring(true);
            else if (value === 'remove') {
              if (window.confirm(`${DIALOGS.share.removeAccess}? ${DIALOGS.share.removeNote}`))
                onRemove();
            } else onRole(value as EditorRole);
          }}
          {...tipProps({
            name: 'Role',
            doc: 'Viewer, Commenter, Editor; Transfer ownership, Add expiration, Remove access',
          })}
        >
          {ROLES.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
          {canTransfer && identity?.kind === 'account' ? (
            <option value="transfer">{DIALOGS.share.transferOwnership}</option>
          ) : null}
          <option value="expiry">{DIALOGS.share.addExpiration}</option>
          <option value="remove">{DIALOGS.share.removeAccess}</option>
        </select>
      ) : (
        <span className="ts-share-row-role">
          {ROLES.find((role) => role.value === grant.role)?.label ?? grant.role}
        </span>
      )}
      {expiring ? (
        <select
          className="ts-share-expiry"
          autoFocus
          aria-label={DIALOGS.share.addExpiration}
          data-control={`dialog.share.grant.${key}.expiry`}
          defaultValue=""
          onChange={(event) => {
            const chosen = EXPIRY_DAYS.find((each) => each.id === event.target.value);
            onExpiring(false);
            if (chosen === undefined) return;
            onExpiry(chosen.days === null ? null : expiryDate(chosen.days));
          }}
          {...tipProps({ name: DIALOGS.share.addExpiration, doc: 'Up to one year' })}
          onBlur={() => onExpiring(false)}
        >
          <option value="" disabled>
            {DIALOGS.share.addExpiration}
          </option>
          {EXPIRY_DAYS.map((each) => (
            <option key={each.id} value={each.id}>
              {each.label}
            </option>
          ))}
        </select>
      ) : null}
    </li>
  );
}
