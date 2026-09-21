import { pruneLinkUrls, rememberLinkUrl, rememberedGeneralUrl } from './share-links';
import { useEffect, useState } from 'react';

import { labelFor } from '@turboslide/identity/labels';

import { Dialog, DialogCheck } from '../Dialog';
import { NamePromptDialog, SHARE_NAME_PROMPT_TITLE } from './NamePrompt';
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
 * and section 5 rank 1; docs/PRODUCT.md section 2 rank 3): two stages at a fixed width of 520.
 *
 * The seller's stage first: the General access select (Restricted, Anyone with the link) with the
 * role select beside it (Viewer, Commenter, Editor), one sentence under them that states what the
 * chosen access does on this deployment, the address in a read only field with the one Copy link
 * beside it, a checkbox that swaps the address for the present link, the people rows when any
 * exist, Done. The address is the link for the selected access: under Anyone with the link the
 * tokenized general link `share.setGeneralAccess` answers, minted by the first Copy link and
 * remembered on this browser (`linkUrl`), and Copy link copies that field; under Restricted the
 * deck's own `/edit/<id>` address with the sentence that only you can open it. Behind one row,
 * More (Settings while open): Add people by email with the role dropdown, Notify people and the
 * message; the requests band; the people list (the owner first, then each grant with its chip,
 * a per row dropdown with the roles, Transfer ownership, Add expiration and Remove access); the
 * three link rows of the focus round (View link, Present link, Edit link) with their Created dates,
 * each minted on the first Copy link and remembered so a second copy sends the same address; the
 * links list with Rotate and Revoke; Stop sharing; the gear's five switches for the owner; Publish
 * to the web. The two footer sentences of the parity rounds left: the sentence under the select
 * carries the deployment's mode. The own row reads You (rank 4). The first Share on a browser with
 * no display name asks for one first ("Your name, shown to collaborators"), once per browser.
 * Every write is one `share.*` action based on the freshest revision the dialog knows and retried
 * once on a conflict after a re-read (SPEC-3 6.4 "re-read and retry").
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

/* the addresses this browser minted, by deck and link id (share-links.ts); re exported for the
   dialog's tests and the callers that reached them here */
export { LINK_URLS_KEY, pruneLinkUrls, readLinkUrls, rememberLinkUrl } from './share-links';

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

/**
 * The sentence under the access select (rank 3): what the chosen access does on this deployment,
 * in one line. The mode's words replace the footer paragraph of the parity rounds.
 */
export function accessSentence(
  mode: 'restricted' | 'link' | 'open',
  role: EditorRole,
  authorize: AuthorizeMode | undefined,
): string {
  if (mode === 'open') return LEGACY_SENTENCE;
  if (mode === 'link') {
    if (role === 'editor')
      return 'Anyone with this link can open and edit this presentation. Pick Viewer before you send it to a customer';
    if (role === 'commenter') return 'Anyone with this link can open it and leave comments';
    return 'Anyone with this link can open it and cannot change it';
  }
  if (authorize === 'enforce') return DIALOGS.share.restrictedDoc;
  return 'Only you can open this address on this Turboslide until sign in arrives; pick Anyone with the link to share it';
}

/** The browser's memory that the first Share already asked for a name (rank 4). */
export const SHARE_NAME_ASKED_KEY = 'ts-share-name-asked';

function nameAskedBefore(): boolean {
  try {
    return (
      typeof localStorage !== 'undefined' && localStorage.getItem(SHARE_NAME_ASKED_KEY) === '1'
    );
  } catch {
    return true;
  }
}

function rememberNameAsked(): void {
  try {
    localStorage.setItem(SHARE_NAME_ASKED_KEY, '1');
  } catch {
    // private mode: the prompt returns on the next open
  }
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
  /* the general link's address: the page's, else the one this browser remembers for a live
     general link (the creation handed the token, or an earlier Copy link minted it; FR1), so the
     field holds the address at the first open and Copy link copies it without rotating it */
  const [linkUrl, setLinkUrl] = useState<string | null>(
    () => access?.linkUrl ?? rememberedGeneralUrl(input.deckId, access?.links ?? []),
  );
  const [expiring, setExpiring] = useState<string | null>(null);
  /* the second stage (rank 3): Add people, the requests, the link rows, the links, the gear */
  const [more, setMore] = useState(false);
  /* Open as a slideshow: the address field reads the present link */
  const [asShow, setAsShow] = useState(false);
  /* the first Share on a browser with no display name asks for one (rank 4), once per browser;
     a signed in account already has its name */
  const account = input.account;
  const [naming, setNaming] = useState<boolean>(
    () =>
      account !== undefined &&
      account.setName !== undefined &&
      !account.signedIn &&
      account.principal.kind === 'anonymous' &&
      account.principal.name === undefined &&
      !nameAskedBefore(),
  );
  const me = account?.principal ?? input.presence?.self;
  /** The name a row shows (rank 4): You for this browser's own principal. */
  const personName = (identity: IdentityView): string =>
    me !== undefined && identity.principalId === me.principalId ? 'You' : nameOf(identity);

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

  /* the first Share asks for a display name (rank 4): the prompt stands where the dialog will */
  if (naming) {
    return (
      <NamePromptDialog
        modal
        title={SHARE_NAME_PROMPT_TITLE}
        onDone={() => {
          rememberNameAsked();
          setNaming(false);
        }}
      />
    );
  }

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
  const plain = shareLinks(origin, input.deckId);
  const editAddress =
    plain.find((link) => link.id === 'edit')?.url ?? `${origin}/edit/${input.deckId}`;
  const viewAddress =
    plain.find((link) => link.id === 'view')?.url ?? `${origin}/deck/${input.deckId}`;

  /**
   * The address of the first stage (rank 3): the tokenized general link under Anyone with the
   * link (empty until this browser has minted or received it), the deck's own edit address under
   * Restricted and for a legacy deck; the present link with Open as a slideshow.
   */
  const generalAddress = (): string => {
    if (mode === 'link')
      return linkUrl === null ? '' : asShow ? rowAddress('present', linkUrl) : linkUrl;
    if (asShow) return `${viewAddress}?present=1`;
    return editAddress;
  };
  const address = generalAddress();

  /** Copy link (rank 3): the field's address; under a link mode with no address yet it mints one. */
  const generalCopy = () => {
    if (address !== '') {
      copy(address);
      return;
    }
    if (mode === 'link' && links[0] !== undefined) {
      /* the token is never shown twice: rotate to mint a fresh one, fill the field and copy it */
      write('share.rotateLink', { linkId: links[0].id }, (result) => {
        const answer = result as { url?: string; link?: { id?: string } };
        if (answer.url !== undefined) {
          if (answer.link?.id !== undefined)
            rememberLinkUrl(input.deckId, answer.link.id, answer.url);
          setLinkUrl(answer.url);
          copy(asShow ? rowAddress('present', answer.url) : answer.url);
        }
      });
      return;
    }
    if (mode === 'link') {
      write(
        'share.setGeneralAccess',
        { mode: 'link', role: access.generalAccess.role },
        (result) => {
          const answer = result as { url?: string; link?: { id?: string } };
          if (answer.url !== undefined) {
            if (answer.link?.id !== undefined)
              rememberLinkUrl(input.deckId, answer.link.id, answer.url);
            setLinkUrl(answer.url);
            copy(asShow ? rowAddress('present', answer.url) : answer.url);
          }
        },
      );
      return;
    }
    copy(editAddress);
  };

  /* the link rows of the second stage: the plain addresses of a legacy deck, else the row's live
     link this browser minted, else a new link with the row's role and label (docs/FOCUS.md 2.7) */
  const copyRow = (row: (typeof LINK_ROWS)[number]) => {
    if (legacy) {
      const found = plain.find((link) => link.id === row.id);
      if (found !== undefined) copy(found.url);
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
  const sentence = accessSentence(mode, access.generalAccess.role, authorize);
  /* the people rows of the first stage (rank 3, rank 4): the owner's row reading You, then the
     pending owner and each grant; drawn whenever the record names an owner */
  const peopleRows = access.owner !== null || grants.length > 0 || access.pendingOwner !== null;
  const createdOf = (row: (typeof LINK_ROWS)[number]): string | null => {
    if (legacy) return null;
    const newest = liveLinksFor(access.links, row.label)[0];
    return newest === undefined ? null : new Date(newest.createdAt).toLocaleDateString();
  };
  const addressTip = tipProps({
    name: 'Link',
    doc:
      address === ''
        ? 'Copy link creates the address for the chosen access'
        : 'The address Copy link copies; click to select it',
  });
  const moreLabel = more
    ? 'Settings'
    : requests.length === 0
      ? 'More'
      : `More · ${requests.length === 1 ? 'one request' : `${requests.length} requests`}`;

  return (
    <Dialog
      title={DIALOGS.share.title(title)}
      onClose={shell.closeDialog}
      width={520}
      control="dialog.share"
      className="ts-share"
      actions={[doneAction]}
    >
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

      {/* the first stage (rank 3): the access, its sentence, the address, the show checkbox */}
      <section className="ts-share-general" aria-label={DIALOGS.share.generalAccess}>
        <h3 className="ts-dialog-field-label">{DIALOGS.share.generalAccess}</h3>
        {legacy ? (
          <div className="ts-share-access is-restricted" data-control="dialog.share.legacy">
            <Icon name="link" />
            <span className="ts-share-general-words">{DIALOGS.share.legacy}</span>
          </div>
        ) : (
          <div
            className={cn('ts-share-access', mode === 'restricted' && 'is-restricted')}
            data-control="dialog.share.general"
          >
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
                    ? 'Only you, until you pick Anyone with the link'
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
            ) : null}
          </div>
        )}
        <p
          className="ts-dialog-sentence"
          data-control="dialog.share.accessSentence"
          data-mode={authorize}
        >
          {sentence}
        </p>
        <div className="ts-share-address" data-control="dialog.share.addressRow">
          <input
            type="text"
            readOnly
            value={address}
            placeholder={mode === 'link' ? 'Copy link creates the address' : ''}
            aria-label="Link"
            data-control="dialog.share.address"
            {...addressTip}
            onFocus={(event) => {
              addressTip.onFocus(event);
              event.currentTarget.select();
            }}
          />
          <button
            type="button"
            className="pt-ib is-text"
            disabled={busy || (mode === 'link' && !canShare && address === '')}
            data-control="dialog.share.copy"
            onClick={generalCopy}
            {...tipProps({
              name: DIALOGS.share.copyLink,
              doc:
                mode === 'link'
                  ? 'Copies the link; it carries no notes and no skipped slides'
                  : 'Copies the address of this presentation',
            })}
          >
            <span className="pt-lb">{DIALOGS.share.copyLink}</span>
          </button>
        </div>
        <DialogCheck
          label="Open as a slideshow"
          checked={asShow}
          onChange={setAsShow}
          control="dialog.share.slideshow"
          doc="The address opens the presentation as a show, on slide 1"
        />
      </section>

      {/* the people rows, when any exist (rank 3): the owner first, then each grant */}
      {peopleRows ? (
        <ul
          className="ts-share-list pt-scroll"
          data-control="dialog.share.people"
          aria-label="People with access"
        >
          {access.owner ? (
            <li className="ts-share-row is-owner" data-control="dialog.share.owner">
              <IdentityChip identity={access.owner} size={24} />
              <span className="ts-share-row-name">{personName(access.owner)}</span>
              <span className="ts-share-row-chip" aria-hidden="true" />
              <span className="ts-share-row-role">{DIALOGS.share.roles.owner}</span>
            </li>
          ) : null}
          {access.pendingOwner ? (
            <li className="ts-share-row is-pending-owner" data-control="dialog.share.pendingOwner">
              <IdentityChip identity={access.pendingOwner} size={24} />
              <span className="ts-share-row-name">{personName(access.pendingOwner)}</span>
              <span className="ts-share-row-chip">{DIALOGS.share.pending}</span>
              <span className="ts-share-row-role">{DIALOGS.share.pendingOwnership}</span>
            </li>
          ) : null}
          {grants.map((grant) => (
            <GrantRow
              key={whoKey(grant)}
              grant={grant}
              name={grant.principal === undefined ? who(grant) : personName(grant.principal)}
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
      ) : null}

      {/* the More row (rank 3): the second stage opens under it and the row reads Settings */}
      <div className="ts-share-more">
        <button
          type="button"
          className="ts-dialog-row is-button is-more"
          aria-expanded={more}
          aria-controls="ts-share-settings"
          data-control="dialog.share.more"
          onClick={() => setMore((on) => !on)}
          {...tipProps({
            name: more ? 'Settings' : 'More',
            doc: 'Add people by email, the requests, the view and present links and the settings',
          })}
        >
          <span className="ts-dialog-row-title">{moreLabel}</span>
          <Icon name="chevron-down" />
        </button>
      </div>

      {more ? (
        <div
          className="ts-share-settings"
          id="ts-share-settings"
          data-control="dialog.share.settings"
        >
          {/* the Review banner slot (9.3), present while the stage is open */}
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

          {/* Add people by email */}
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
                    {...tipProps({
                      name: DIALOGS.share.message,
                      doc: 'Goes in the invitation mail',
                    })}
                  />
                ) : (
                  <span className="ts-share-message is-empty" aria-hidden="true" />
                )}
              </div>
            </section>
          ) : null}

          {/* the three link rows (docs/FOCUS.md 2.7) with their Created dates (rank 3) */}
          {showRows ? (
            <section className="ts-share-rows" aria-labelledby="ts-share-links">
              <h3 id="ts-share-links" className="ts-dialog-field-label">
                Links
              </h3>
              <ul className="ts-dialog-list" data-control="dialog.share.rows">
                {LINK_ROWS.map((row) => {
                  const found = plain.find((link) => link.id === row.id);
                  const note = legacy ? found?.note : row.note;
                  const minted = legacy ? 0 : liveLinksFor(access.links, row.label).length;
                  const created = createdOf(row);
                  return (
                    <li
                      key={row.id}
                      className="ts-dialog-row"
                      data-control={`dialog.share.${row.id}`}
                      data-minted={minted}
                    >
                      <span className="ts-dialog-row-title">
                        <b>{row.label}</b>
                        {note !== undefined ? (
                          <span className="ts-dialog-hint"> · {note}</span>
                        ) : null}
                        {created !== null ? (
                          <span className="ts-dialog-hint">
                            {' '}
                            · {DIALOGS.share.links.created} {created}
                          </span>
                        ) : null}
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
                            ? (found?.url ?? '')
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
                <p
                  className="ts-share-quiet ts-share-legacy-sentence"
                  data-control="dialog.share.open"
                >
                  {LEGACY_SENTENCE}
                </p>
              ) : null}
            </section>
          ) : null}

          {/* the general access links with Rotate and Revoke, Switch to a link for a legacy deck, Stop sharing */}
          {legacy && canShare ? (
            <button
              type="button"
              className="pt-ib is-text ts-share-stop"
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
                    {DIALOGS.share.links.created} {new Date(link.createdAt).toLocaleDateString()}
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
          {mode !== 'restricted' && !legacy && canShare ? (
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

          {/* the gear: owner only (6.5) */}
          {owner && may('settings') ? (
            <section className="ts-share-gear" aria-label="Settings">
              <button
                type="button"
                className="pt-ib is-text ts-share-gear-btn"
                aria-expanded={gear}
                data-control="dialog.share.gear"
                onClick={() => setGear((on) => !on)}
                {...tipProps({
                  name: 'Permissions',
                  doc: 'What editors, viewers and commenters may do',
                })}
              >
                <Icon name="adjustments" />
                <span className="pt-lb">Permissions</span>
              </button>
              {gear ? (
                <div className="ts-share-switches" data-control="dialog.share.permissions">
                  {(
                    [
                      ['editorsCanShare', DIALOGS.share.settings.editorsCanShare, true],
                      ['viewersCanDownload', DIALOGS.share.settings.viewersCanDownload, true],
                      [
                        'viewersCanSeeComments',
                        DIALOGS.share.settings.viewersCanSeeComments,
                        false,
                      ],
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
                        key === 'viewersCanDownload'
                          ? DIALOGS.share.settings.downloadNote
                          : undefined
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
            {authorize !== undefined ? (
              <p
                className="ts-share-footer-sentence ts-share-mode-sentence"
                data-control="dialog.share.authorize"
                data-mode={authorize}
              >
                {authorizeSentence(authorize)}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
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
  name,
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
  /** the name the row shows: You for this browser (rank 4), else the person's name or address */
  name?: string;
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
        {name ?? who(grant)}
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
