import { useEffect, useState } from 'react';

import { labelFor } from '@turboslide/identity/labels';

import { Dialog, DialogCheck } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import type {
  AccessGrantView,
  AccessLinkView,
  AccessRequestView,
  EditorAccess,
  EditorCapability,
  EditorRole,
  IdentityView,
} from '../editor-shell';
import { Icon } from '../icons';
import { cn } from '../lib/cn';
import { DIALOGS, SNACKBARS } from '../menus/strings';
import { IdentityChip, nameOf } from '../presence/IdentityChip';
import { tipProps } from '../Tooltip';

import './share.css';

/**
 * The Share dialog (gslides-parity SPEC-3 0.16, 6.5, 9.3; research 09 3.6, 8.5; docs/FOCUS.md 2.7
 * and section 5 rank 1): Google's two halves in Turboslide's words at a fixed width of 520 with
 * rows of fixed height inside scroll regions. "Share <title>"; the Review banner slot at the top,
 * present at every moment; "Add people by email" with the role dropdown (Viewer selected), Notify
 * people on by default, the message field and Send; the people list (the owner first, then each
 * grant with its mark, name or email, Pending or Expired in fixed width chips, and a per row
 * dropdown with the roles, Transfer ownership, Add expiration and Remove access); the three link
 * rows of the focus round, View link, Present link and Edit link, each a share link that grants
 * its role (viewer, viewer opening as a show, editor; the orchestrator's ruling 2), minted on the
 * first Copy link and remembered on this browser so a second copy sends the same address; General
 * access, Restricted by default, Anyone with the link with its role, the legacy sentence with
 * Switch to a link, the links list with Rotate and Revoke; the gear's five switches for the owner;
 * the footer with Copy link, Done, Publish to the web, the sentence about notes and skipped slides
 * and the sentence naming the deployment's mode, so the dialog never promises what shadow mode
 * does not enforce. Every write is one `share.*` action based on the freshest revision the dialog
 * knows and retried once on a conflict after a re-read (SPEC-3 6.4 "re-read and retry").
 *
 * The record the dialog reads. The shell's `input.access` when the page carries it; else, on a
 * saved deck, the dialog reads `GET /api/access/<deckId>` itself, which is how the page of `/new`
 * shows its record right after the first write created it (the page keeps its draft payload until
 * a reload, `audit-present` row 17: the dialog with no role control). The same read names the
 * deployment's `TURBOSLIDE_AUTHORIZE` mode. A deck with no record is the legacy open deck: its
 * rows carry the plain addresses, which are the truth for such a deck, and no note promising a
 * read only address (the words "Read only, opens on slide 1" left with the focus round).
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

export type ShareLinkRowId = 'view' | 'present' | 'edit';

/**
 * The three link rows (docs/FOCUS.md 2.7, the rows `share.copy-view-link`,
 * `share.copy-present-link`, `share.copy-edit-link`): the label is the one the minted link carries
 * on the record, so the rows find their links again; `note` is the role word beside the label.
 */
export const LINK_ROWS: ReadonlyArray<{
  id: ShareLinkRowId;
  label: string;
  role: EditorRole;
  note: string;
}> = [
  { id: 'view', label: DIALOGS.share.viewLink, role: 'viewer', note: DIALOGS.share.roles.viewer },
  {
    id: 'present',
    label: DIALOGS.share.presentLink,
    role: 'viewer',
    note: `${DIALOGS.share.roles.viewer}, opens as a show`,
  },
  { id: 'edit', label: DIALOGS.share.editLink, role: 'editor', note: DIALOGS.share.roles.editor },
];

/**
 * The plain addresses of a deck with no access record (a checkout, a legacy open deck): the
 * viewer, the show and the editor. They are the truth for such a deck, where anyone with the
 * address is an editor, so the edit row says so and the view row promises nothing.
 */
export function shareLinks(
  origin: string,
  deckId: string,
): ReadonlyArray<{ id: ShareLinkRowId; label: string; url: string; note?: string }> {
  const id = encodeURIComponent(deckId);
  return [
    { id: 'view', label: DIALOGS.share.viewLink, url: `${origin}/deck/${id}` },
    {
      id: 'present',
      label: DIALOGS.share.presentLink,
      url: `${origin}/deck/${id}?present=1`,
      note: 'Opens as a show',
    },
    {
      id: 'edit',
      label: DIALOGS.share.editLink,
      url: `${origin}/edit/${id}`,
      note: DIALOGS.share.anyoneCanEdit,
    },
  ];
}

/** The address a row hands out for a minted link: the Present link carries `?present=1` (routes/s.$token.ts). */
export function rowAddress(rowId: ShareLinkRowId, url: string): string {
  return rowId === 'present' ? `${url}${url.includes('?') ? '&' : '?'}present=1` : url;
}

/** True while a link can be exchanged: not revoked and not past its expiry. */
export function linkIsLive(link: AccessLinkView, now: number = Date.now()): boolean {
  if (link.revokedAt !== undefined && link.revokedAt !== null) return false;
  if (link.expiresAt !== undefined && link.expiresAt !== null)
    return new Date(link.expiresAt).getTime() > now;
  return true;
}

/** The live links a row minted, newest first. */
export function liveLinksFor(
  links: ReadonlyArray<AccessLinkView> | undefined,
  label: string,
  now: number = Date.now(),
): AccessLinkView[] {
  return (links ?? [])
    .filter((link) => link.label === label && linkIsLive(link, now))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * The addresses this browser minted, by deck and link id (`localStorage`). A share token is
 * stored hashed on the record (SPEC-3 6.4), so the address exists only where it was minted; keeping
 * it here lets Copy link send the same address twice instead of rotating the link, which would
 * stop the address the seller already sent. A browser that never minted the link mints another
 * one with the same label; the earlier address keeps opening until it is revoked.
 */
export const LINK_URLS_KEY = 'ts-share-links';

type LinkUrlStore = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): LinkUrlStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readLinkUrls(
  deckId: string,
  storage: LinkUrlStore | null = defaultStorage(),
): Record<string, string> {
  if (storage === null) return {};
  try {
    const raw = storage.getItem(LINK_URLS_KEY);
    if (raw === null) return {};
    const parsed = JSON.parse(raw) as Record<string, Record<string, string>>;
    const mine = parsed[deckId];
    return mine !== null && typeof mine === 'object' ? { ...mine } : {};
  } catch {
    return {};
  }
}

function writeLinkUrls(
  deckId: string,
  urls: Record<string, string>,
  storage: LinkUrlStore | null,
): void {
  if (storage === null) return;
  try {
    const raw = storage.getItem(LINK_URLS_KEY);
    const parsed = (raw === null ? {} : JSON.parse(raw)) as Record<string, Record<string, string>>;
    if (Object.keys(urls).length === 0) delete parsed[deckId];
    else parsed[deckId] = urls;
    storage.setItem(LINK_URLS_KEY, JSON.stringify(parsed));
  } catch {
    // a full or refused storage forgets the address; the next Copy link mints another link
  }
}

export function rememberLinkUrl(
  deckId: string,
  linkId: string,
  url: string,
  storage: LinkUrlStore | null = defaultStorage(),
): void {
  writeLinkUrls(deckId, { ...readLinkUrls(deckId, storage), [linkId]: url }, storage);
}

/** Keeps the addresses of the live links alone (a revoked or rotated link's address is dead). */
export function pruneLinkUrls(
  deckId: string,
  liveIds: ReadonlyArray<string>,
  storage: LinkUrlStore | null = defaultStorage(),
): Record<string, string> {
  const kept: Record<string, string> = {};
  const known = readLinkUrls(deckId, storage);
  for (const id of liveIds) if (known[id] !== undefined) kept[id] = known[id];
  if (Object.keys(kept).length !== Object.keys(known).length) writeLinkUrls(deckId, kept, storage);
  return kept;
}

/** The 409 a share write meets when the record moved under it (SPEC-3 6.4; server/access.ts). */
export function isShareConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /re-read and retry|changed since they were read|is stale/i.test(message);
}

/**
 * The revision the 409 sentence names ("the access record is at revision 2, not 1; re-read and
 * retry", apps/cli/src/records/access.ts), or the `currentRevision` on the error, so the retry
 * bases on the server's revision even when the route's re-read answers an older one (the focus
 * round, VERIFICATION.md pass 2 F-share-copy: the second Copy link of a session was refused as
 * stale and the retry repeated the refused base).
 */
export function conflictRevision(error: unknown): number | null {
  const carried = (error as { currentRevision?: unknown } | null)?.currentRevision;
  if (typeof carried === 'number' && Number.isInteger(carried) && carried >= 0) return carried;
  const message = error instanceof Error ? error.message : String(error);
  const match = /is at revision (\d+), not \d+/.exec(message);
  return match === null ? null : Number(match[1]);
}

export type AuthorizeMode = 'shadow' | 'enforce';

/**
 * The sentence naming the deployment's mode (docs/FOCUS.md section 5 rank 1: "the dialog says
 * which mode the deployment runs"). In shadow mode the roles are shown and logged and the server
 * refuses nothing, so the dialog says so instead of promising a restriction.
 */
export function authorizeSentence(mode: AuthorizeMode | undefined): string | null {
  if (mode === 'shadow')
    return 'Sharing is not enforced on this deployment: the roles here are shown and logged, anyone with the address can open the presentation, and a change from any browser is accepted.';
  if (mode === 'enforce')
    return 'Sharing is enforced on this deployment: only people with access or a link can open the presentation.';
  return null;
}

/** What `GET /api/access/<deckId>` answers (routes/api/access.$.ts): the record shaped for the caller, the standing, the mode. */
export type AccessRecordJson = {
  deckId: string;
  owner: string | null;
  pendingOwner?: { principalId: string | null } | null;
  generalAccess: { mode: 'restricted' | 'link' | 'open'; role: EditorRole };
  grants?: ReadonlyArray<{
    principalId: string | null;
    email: string | null;
    role: EditorRole;
    invitedAt: string;
    acceptedAt: string | null;
    expiresAt: string | null;
  }>;
  links?: ReadonlyArray<{
    id: string;
    role: EditorRole;
    label?: string;
    createdAt: string;
    expiresAt: string | null;
    revokedAt: string | null;
    useCount?: number;
  }>;
  requests?: ReadonlyArray<{
    id: string;
    principalId: string | null;
    email: string | null;
    role: EditorRole;
    message?: string;
    askedAt: string;
    respondedAt: string | null;
  }>;
  settings?: EditorAccess['settings'];
  revision?: number;
};

export type AccessAnswerJson = {
  record: AccessRecordJson;
  role: EditorRole | null;
  via: EditorAccess['via'] | null;
  capabilities: ReadonlyArray<EditorCapability>;
  authorize?: AuthorizeMode;
};

export type FetchedAccess = {
  view: EditorAccess;
  role: EditorRole | null;
  capabilities: ReadonlyArray<EditorCapability>;
  authorize: AuthorizeMode | undefined;
};

function identityOf(principalId: string): IdentityView {
  const account = principalId.startsWith('usr_');
  return {
    principalId,
    label: labelFor(principalId),
    trust: account ? 'verified' : 'label',
    kind: account ? 'account' : 'anonymous',
  };
}

/** The record as the dialog draws it, from the route's JSON (the mapping the editor page makes for `input.access`). */
export function accessViewOfRecord(
  record: AccessRecordJson,
  options: { signedIn: boolean; via?: EditorAccess['via'] | null; now?: number } = {
    signedIn: false,
  },
): EditorAccess {
  const now = options.now ?? Date.now();
  return {
    revision: record.revision ?? 0,
    owner: record.owner === null ? null : identityOf(record.owner),
    pendingOwner:
      record.pendingOwner === undefined ||
      record.pendingOwner === null ||
      record.pendingOwner.principalId === null
        ? null
        : identityOf(record.pendingOwner.principalId),
    generalAccess: record.generalAccess,
    grants: (record.grants ?? []).map((grant) => ({
      ...(grant.principalId !== null ? { principal: identityOf(grant.principalId) } : {}),
      ...(grant.email !== null ? { email: grant.email } : {}),
      role: grant.role,
      invitedAt: grant.invitedAt,
      ...(grant.acceptedAt !== null ? { acceptedAt: grant.acceptedAt } : {}),
      expiresAt: grant.expiresAt,
      status:
        grant.acceptedAt === null
          ? ('pending' as const)
          : grant.expiresAt !== null && Date.parse(grant.expiresAt) < now
            ? ('expired' as const)
            : ('active' as const),
    })),
    links: (record.links ?? [])
      .filter((link) => link.revokedAt === null)
      .map((link) => ({
        id: link.id,
        role: link.role,
        ...(link.label !== undefined ? { label: link.label } : {}),
        createdAt: link.createdAt,
        expiresAt: link.expiresAt,
        revokedAt: link.revokedAt,
        ...(link.useCount !== undefined ? { useCount: link.useCount } : {}),
      })),
    requests: (record.requests ?? [])
      .filter((request) => request.respondedAt === null)
      .map((request) => ({
        id: request.id,
        ...(request.principalId !== null ? { principal: identityOf(request.principalId) } : {}),
        ...(request.email !== null ? { email: request.email } : {}),
        role: request.role,
        ...(request.message !== undefined ? { message: request.message } : {}),
        askedAt: request.askedAt,
      })),
    ...(record.settings === undefined ? {} : { settings: record.settings }),
    published: null,
    claimable: record.owner === null && options.signedIn,
    ...(options.via !== undefined && options.via !== null ? { via: options.via } : {}),
  };
}

/**
 * What the last share write on this page answered, by deck: the revision, and the record when the
 * answer carried a whole one (`share.createLink` and the other record actions answer `record`).
 * A dialog is mounted anew on every open (the rows close it with Done after a copy), and the
 * page's own record (`input.access`) follows the stream's `access` event, which on the blob tier
 * is process local, while `/api/access/<id>` can answer another instance's entry for a moment; so
 * a reopened dialog reads here first and bases its write on the highest revision it knows, and
 * finds the link the previous open minted instead of minting a second one (the cycle 2 preview:
 * the Present row's Copy link right after the View row's mint was refused with "the access record
 * is at revision 1, not 0", and the View row's second copy minted a second token).
 */
const answered = new Map<string, { revision: number; view?: EditorAccess }>();

/** The revision and record the last write on this page answered for a deck. */
export function answeredAccess(deckId: string): { revision: number; view?: EditorAccess } | null {
  return answered.get(deckId) ?? null;
}

/** Forgets what the writes answered (a test, a deck that left the page). */
export function forgetAnsweredAccess(deckId?: string): void {
  if (deckId === undefined) answered.clear();
  else answered.delete(deckId);
}

/** Records a write's answer: the revision always, the record when the answer carried a whole one. */
export function noteAnsweredAccess(
  deckId: string,
  result: unknown,
  options: { signedIn: boolean; via?: EditorAccess['via'] | null } = { signedIn: false },
): void {
  const record = (result as { record?: unknown } | null)?.record;
  if (record === null || typeof record !== 'object') return;
  const revision = (record as { revision?: unknown }).revision;
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 0) return;
  const current = answered.get(deckId);
  if (current !== undefined && current.revision > revision) return;
  const whole =
    typeof (record as { deckId?: unknown }).deckId === 'string' &&
    'owner' in (record as object) &&
    typeof (record as { generalAccess?: unknown }).generalAccess === 'object';
  const view = whole
    ? accessViewOfRecord(record as AccessRecordJson, {
        signedIn: options.signedIn,
        ...(options.via === undefined ? {} : { via: options.via }),
      })
    : current?.view;
  answered.set(deckId, { revision, ...(view === undefined ? {} : { view }) });
}

/**
 * The record the dialog draws and bases on: the newest by revision of the page's, the route's and
 * the last answered one, carrying the page's standing (`via`, `published`, `claimable`) when a
 * later record wins, since a write's answer names no caller.
 */
export function newestAccess(
  ...candidates: ReadonlyArray<EditorAccess | undefined>
): EditorAccess | undefined {
  const present = candidates.filter((view): view is EditorAccess => view !== undefined);
  const first = present[0];
  if (first === undefined) return undefined;
  const newest = present.reduce((best, view) => (view.revision > best.revision ? view : best));
  if (newest === first) return first;
  return {
    ...newest,
    ...(first.via !== undefined ? { via: first.via } : {}),
    ...(first.published !== undefined ? { published: first.published } : {}),
    ...(first.claimable !== undefined ? { claimable: first.claimable } : {}),
    ...(first.linkUrl !== undefined ? { linkUrl: first.linkUrl } : {}),
  };
}

/**
 * Reads the caller's standing and the record from the studio's route, past whatever the page
 * carried: the fresh revision every write bases on, the mode of the deployment, and the record of
 * a deck the page still holds as a draft. Null when the route refuses or is unreachable.
 */
export async function loadAccess(
  deckId: string,
  options: { signedIn: boolean; fetchFn?: typeof fetch } = { signedIn: false },
): Promise<FetchedAccess | null> {
  const fetchFn = options.fetchFn ?? (typeof fetch === 'function' ? fetch : undefined);
  if (fetchFn === undefined) return null;
  try {
    const response = await fetchFn(`/api/access/${encodeURIComponent(deckId)}`, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return null;
    const answer = (await response.json()) as AccessAnswerJson;
    if (answer === null || typeof answer !== 'object' || answer.record === undefined) return null;
    return {
      view: accessViewOfRecord(answer.record, { signedIn: options.signedIn, via: answer.via }),
      role: answer.role,
      capabilities: answer.capabilities ?? [],
      authorize: answer.authorize,
    };
  } catch {
    return null;
  }
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

/** The sentence of the draft's dialog: nothing to share before the first write saves the deck. */
export const DRAFT_SENTENCE =
  'Links appear once the presentation is saved. The first change saves it.';

/** The sentence under the plain addresses of a deck with no record. */
export const LEGACY_SENTENCE = 'Anyone with the address can open and edit this presentation.';

export function ShareDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const origin = input.origin ?? (typeof window === 'undefined' ? '' : window.location.origin);
  const title = input.document.deck.title;
  const draft = input.save?.draft === true;
  const signedIn = input.account?.signedIn === true;
  /* the route's answer: null while it loads, 'failed' when it refused or could not be reached */
  const [fetched, setFetched] = useState<FetchedAccess | 'failed' | null>(null);
  /* the highest revision a write answered or a read carried, the base of the next write; the
     writes of earlier opens of this page count too (answeredAccess) */
  const [known, setKnown] = useState(() => answeredAccess(input.deckId)?.revision ?? 0);
  useEffect(() => {
    if (draft) return undefined;
    let live = true;
    void loadAccess(input.deckId, { signedIn }).then((got) => {
      if (!live) return;
      setFetched(got ?? 'failed');
      if (got !== null) setKnown((current) => Math.max(current, got.view.revision));
    });
    return () => {
      live = false;
    };
  }, [input.deckId, draft, signedIn]);

  const loaded: FetchedAccess | null = fetched === null || fetched === 'failed' ? null : fetched;
  /* the newest record this page knows: the page's, the route's, or the one the last write answered */
  const access: EditorAccess | undefined = newestAccess(
    input.access,
    loaded?.view,
    answeredAccess(input.deckId)?.view,
  );
  const capabilities: ReadonlyArray<EditorCapability> | undefined =
    input.capabilities ?? (input.access === undefined ? loaded?.capabilities : undefined);
  const authorize = loaded?.authorize;
  const may = (capability: 'share' | 'settings' | 'publish' | 'transfer') =>
    capabilities === undefined || capabilities.includes(capability);
  const role = input.role ?? loaded?.role ?? undefined;
  const owner = access?.via === 'owner' || role === 'owner';
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

  /* after the copy the focus goes to Done, so Escape still closes the dialog: the Copy link
     button re-renders through the busy state and the focus fell to the body, where the card's key
     handler never saw the Escape (b4.md fix round FR1; VERIFICATION.md pass 1 F8) */
  const copy = (url: string) => {
    navigator.clipboard
      .writeText(url)
      .then(() => shell.say(SNACKBARS.linkCopied))
      .catch(() => shell.say(url))
      .finally(() => focusDone());
  };
  const focusDone = () => {
    if (typeof document === 'undefined') return;
    const card = document.querySelector<HTMLElement>('[data-control="dialog.share"]');
    if (card === null) return;
    if (card.contains(document.activeElement) && document.activeElement !== document.body) return;
    const done = card.querySelector<HTMLElement>('[data-control="dialog.share.done"]');
    (done ?? card).focus();
  };

  const baseRevision = (): number =>
    Math.max(access?.revision ?? 0, known, answeredAccess(input.deckId)?.revision ?? 0);

  const noteAnswer = (result: unknown): void => {
    const record = (result as { record?: { revision?: number } } | null)?.record;
    if (record !== undefined && typeof record.revision === 'number')
      setKnown((current) => Math.max(current, record.revision ?? 0));
    noteAnsweredAccess(input.deckId, result, { signedIn, via: access?.via ?? null });
  };

  /**
   * One share write, based on the freshest revision the dialog knows; a conflict re-reads the
   * record through the route and retries once on its revision (SPEC-3 6.4).
   */
  const write = (
    action: string,
    payload: Record<string, unknown>,
    done?: (result: unknown) => void,
  ) => {
    if (busy || access === undefined) return;
    setBusy(true);
    setError(null);
    const attempt = (base: number) =>
      input.dispatch(action as never, { id: input.deckId, baseRevision: base, ...payload });
    void (async () => {
      try {
        let result: unknown;
        try {
          result = await attempt(baseRevision());
        } catch (first: unknown) {
          if (!isShareConflict(first)) throw first;
          // the server's revision from the refusal itself, then the route's re-read (which can
          // still answer an older copy for a moment); the retry bases on the highest of the two
          const named = conflictRevision(first);
          const fresh = await loadAccess(input.deckId, { signedIn });
          if (fresh === null && named === null) throw first;
          if (fresh !== null) setFetched(fresh);
          const base = Math.max(fresh?.view.revision ?? 0, named ?? 0, baseRevision());
          setKnown((current) => Math.max(current, base));
          noteAnsweredAccess(input.deckId, { record: { revision: base } });
          result = await attempt(base);
        }
        noteAnswer(result);
        done?.(result);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    })();
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

  const doneAction = {
    label: DIALOGS.share.done,
    primary: true,
    onClick: shell.closeDialog,
    control: 'dialog.share.done',
    doc: 'Closes the dialog',
  };

  /* the draft of /new before its first write: nothing exists in the store to share yet */
  if (draft && access === undefined) {
    return (
      <Dialog
        title={DIALOGS.share.title(title)}
        onClose={shell.closeDialog}
        width={520}
        control="dialog.share"
        className="ts-share"
        actions={[doneAction]}
      >
        <p className="ts-share-draft" data-control="dialog.share.draft">
          {DRAFT_SENTENCE}
        </p>
        <p className="ts-share-footer-sentence" data-control="dialog.share.footer">
          {DIALOGS.share.footer}
        </p>
      </Dialog>
    );
  }

  /* a saved deck whose record is still on its way from the route, or could not be read */
  if (access === undefined) {
    const failed = fetched === 'failed';
    const links = shareLinks(origin, input.deckId);
    return (
      <Dialog
        title={DIALOGS.share.title(title)}
        onClose={shell.closeDialog}
        width={520}
        control="dialog.share"
        className="ts-share"
        actions={[doneAction]}
      >
        {failed ? (
          <section aria-labelledby="ts-share-links">
            <h3 id="ts-share-links" className="ts-dialog-field-label">
              Links
            </h3>
            <ul className="ts-dialog-list">
              {links.map((link) => (
                <li
                  key={link.id}
                  className="ts-dialog-row"
                  data-control={`dialog.share.${link.id}`}
                >
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
            <p
              className="ts-share-quiet ts-share-legacy-sentence"
              data-control="dialog.share.unread"
            >
              The sharing settings could not be read; the addresses above open the presentation for
              anyone who may open it.
            </p>
          </section>
        ) : (
          <div className="ts-share-loading" data-control="dialog.share.loading" aria-busy="true">
            <span className="ts-share-quiet">Reading who has access</span>
          </div>
        )}
        <p className="ts-share-footer-sentence" data-control="dialog.share.footer">
          {DIALOGS.share.footer}
        </p>
      </Dialog>
    );
  }

  const requests = access.requests ?? [];
  const grants = access.grants ?? [];
  const links = (access.links ?? []).filter(
    (link) => link.revokedAt === undefined || link.revokedAt === null,
  );
  const mode = access.generalAccess.mode;
  const legacy = mode === 'open';
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

  /* the link rows: the plain addresses of a legacy deck, else the row's live link this browser
     minted, else a new link with the row's role and label (docs/FOCUS.md 2.7; ruling 2) */
  const plain = shareLinks(origin, input.deckId);
  const copyRow = (row: (typeof LINK_ROWS)[number]) => {
    if (legacy) {
      const address = plain.find((link) => link.id === row.id);
      if (address !== undefined) copy(address.url);
      return;
    }
    const mine = liveLinksFor(access.links, row.label);
    const remembered = pruneLinkUrls(
      input.deckId,
      (access.links ?? []).filter((link) => linkIsLive(link)).map((link) => link.id),
    );
    const known = mine.map((link) => remembered[link.id]).find((url) => url !== undefined);
    if (known !== undefined) {
      copy(rowAddress(row.id, known));
      return;
    }
    write('share.createLink', { role: row.role, label: row.label }, (result) => {
      const answer = result as { url?: string; link?: { id?: string } };
      if (answer.url === undefined) return;
      if (answer.link?.id !== undefined) rememberLinkUrl(input.deckId, answer.link.id, answer.url);
      copy(rowAddress(row.id, answer.url));
    });
  };
  const showRows = legacy || canShare;
  const modeSentence = authorizeSentence(authorize);

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
              : authorize === 'shadow'
                ? 'The address; sharing is not enforced on this deployment'
                : 'The address; only people with access can open it',
        },
        doneAction,
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
            disabled={busy || !signedIn}
            data-control="dialog.share.claim.button"
            onClick={() =>
              write('share.claim', {}, () => shell.say('You own this presentation now'))
            }
            {...tipProps({
              name: DIALOGS.share.claimButton,
              doc: signedIn
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
              {ROLES.map((each) => (
                <option key={each.value} value={each.value}>
                  {each.label}
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
            onRole={(next) => write('share.setRole', { who: whoKey(grant), role: next })}
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

      {/* the three link rows (docs/FOCUS.md 2.7) */}
      {showRows ? (
        <section className="ts-share-rows" aria-labelledby="ts-share-links">
          <h3 id="ts-share-links" className="ts-dialog-field-label">
            Links
          </h3>
          <ul className="ts-dialog-list" data-control="dialog.share.rows">
            {LINK_ROWS.map((row) => {
              const address = plain.find((link) => link.id === row.id);
              const note = legacy ? address?.note : row.note;
              const minted = legacy ? 0 : liveLinksFor(access.links, row.label).length;
              return (
                <li
                  key={row.id}
                  className="ts-dialog-row"
                  data-control={`dialog.share.${row.id}`}
                  data-minted={minted}
                >
                  <span className="ts-dialog-row-title">
                    <b>{row.label}</b>
                    {note !== undefined ? <span className="ts-dialog-hint"> · {note}</span> : null}
                  </span>
                  <button
                    type="button"
                    className="pt-ib is-text"
                    disabled={busy}
                    data-control={`dialog.share.${row.id}.copy`}
                    onClick={() => copyRow(row)}
                    {...tipProps({
                      name: DIALOGS.share.copyLink,
                      doc: legacy
                        ? (address?.url ?? '')
                        : `A link that opens the presentation as ${row.note.toLowerCase()}; it can be revoked below`,
                    })}
                  >
                    <span className="pt-lb">{DIALOGS.share.copyLink}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {legacy ? (
            <p className="ts-share-quiet ts-share-legacy-sentence" data-control="dialog.share.open">
              {LEGACY_SENTENCE}
            </p>
          ) : null}
        </section>
      ) : null}

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
                {ROLES.map((each) => (
                  <option key={each.value} value={each.value}>
                    {each.label}
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
                  {ROLES.find((each) => each.value === link.role)?.label ?? link.role}
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
                          const answer = result as { url?: string; link?: { id?: string } };
                          if (answer.url) {
                            if (answer.link?.id !== undefined)
                              rememberLinkUrl(input.deckId, answer.link.id, answer.url);
                            setLinkUrl(answer.url);
                            copy(answer.url);
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
            onClick={() =>
              write('share.stop', {}, () => {
                setLinkUrl(null);
                pruneLinkUrls(input.deckId, []);
              })
            }
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
        {modeSentence !== null ? (
          <p
            className="ts-share-footer-sentence ts-share-mode-sentence"
            data-control="dialog.share.authorize"
            data-mode={authorize}
          >
            {modeSentence}
          </p>
        ) : null}
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
  const roleLabel = ROLES.find((each) => each.value === request.role)?.label ?? request.role;
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
          {ROLES.map((each) => (
            <option key={each.value} value={each.value}>
              {each.label}
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
          {ROLES.find((each) => each.value === grant.role)?.label ?? grant.role}
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
