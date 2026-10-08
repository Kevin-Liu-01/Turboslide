import { createServerFn } from '@tanstack/react-start';
import { getRequest, setCookie } from '@tanstack/react-start/server';
import type { AccessRecord, Capability, Role, Via } from '@turboslide/schema/access';
import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import type { AvatarVariant } from '@turboslide/identity/principal';
import { markSpec } from '@turboslide/identity/marks';
import type { MarkSpec } from '@turboslide/identity/marks';
import { PICTURE_MARK_SIZE, pictureUrlOf } from '@turboslide/identity/picture';
import { toIdentityView } from '@turboslide/identity/resolve';
import type { ResolvedIdentity } from '@turboslide/identity/resolve';
import { authorSchema, writeSchema } from '@turboslide/schema/mutations';
import type { Author, Lease, Version, Write } from '@turboslide/schema/mutations';
import type { Issue } from '@turboslide/schema/validate';
import { loadDeckDir } from '@turboslide/store/file-store';
import type { HostingFacts } from '@turboslide/store/hosted';
import type { DeckStore, VersionRecord } from '@turboslide/store/store';
import {
  DEFAULT_BLANK_TITLE,
  readDefaultKit,
  readDefaultTemplateId,
} from '@turboslide/store/templates';
import type { DefaultKit } from '@turboslide/store/templates';
import { toVersion } from '@turboslide/store/versions';
import type { RealtimeTier } from '@turboslide/realtime/channel';
import { spriteMarkup } from '@turboslide/theme/sprite';

import type { MailMode } from './auth/mail/mailer';
import { parseJsonInput } from './json';
import type { Untrusted } from './json';
import { originsSince } from './origins';
import type { RecordOrigin } from './origins';
import {
  createStoredDeck,
  ensureDecks,
  hasStoredDeck,
  hostingFacts,
  isUnsavedDraft,
  newDraftDeckId,
  openDeckStore,
  templateDir,
} from './root';

/**
 * The editor's store functions (SPEC 6.7, 7.1; MILESTONES M3 items 3 and 4): every write from the
 * browser lands here and goes through @turboslide/store's writeDeck, the same applyWrite path the
 * CLI and the MCP server use, with the caller's baseRevision and Author. A stale baseRevision comes
 * back as a conflict outcome carrying the current document and the version records written since
 * the caller's base, so the editor can rebase pending mutations that touch other slides and show
 * both versions when they touch the same one. Versions, leases and the watch channel are the
 * store's as well; the watch channel reaches the browser as a long poll, since fs.watch lives in
 * this process. createServerFn appears only under apps/studio/src/server (SPEC 3.3 item 4).
 *
 * The boundary is JSON text: TanStack Start's serializability typing refuses `unknown`, which the
 * document types carry on purpose (`ext` on slides, blocks and assets; mutation values), so each
 * server function takes and returns a JSON string, the validator parses and checks the input with
 * the schema package, and the exported wrappers give the client the typed shapes. The bytes on the
 * wire are what they would have been.
 *
 * The store comes from server/root.ts (the hosting round): FileStore over the checkout's decks/,
 * or the hosted overlay, or the Blob mirror, whose write pushes to the store before it answers.
 *
 * The fresh presentation (gslides-parity SPEC 6.1): /new edits a draft built from the blank
 * template under an id of root.ts's draft shape that the store has not seen. `readDraftDeck`
 * hands the editor that document; the first write against revision 0 creates the deck through
 * `createStoredDeck` (the Blob backend uploads it before the write lands) and then applies the
 * write, so a visit that only looks creates nothing; a lease, a watch poll or a thumbnail warm
 * on an unsaved draft answers as an empty deck would instead of failing, so the editor shows no
 * error before the first edit.
 */

async function storeFor(deckId: string): Promise<DeckStore> {
  if (!SLUG_PATTERN.test(deckId)) throw new RangeError('deckId must be a slug');
  return openDeckStore(deckId);
}

/** The sprite the stage carries: the same markup the renderer inlines (SPEC 5.1). */
function readSprite(): string {
  return spriteMarkup();
}

function requireSlug(value: unknown, name: string): string {
  if (typeof value !== 'string' || !SLUG_PATTERN.test(value)) {
    throw new TypeError(`${name} must be a slug`);
  }
  return value;
}

function parseAuthor(value: unknown): Author {
  const parsed = authorSchema.safeParse(value);
  if (!parsed.success) throw new TypeError('author must be { kind, name, runId? }');
  return parsed.data;
}

/** The own avatar choice as `account.me` reports it (auth/actions.ts avatarAnswer): the picture as its 64 px URL, never the key. */
export type EditorAvatar = {
  variant: AvatarVariant;
  initials?: string;
  salt?: number;
  url?: string;
};

/**
 * A person as the route shows one (gslides-parity SPEC-3 7.8; the chrome's IdentityView): the
 * caller's own identity on `identity`, and every principal the page names on `identities`
 * (docs/archive/rounds/PEOPLE.md 3.8), resolved through the room's resolver (the alias table, the account
 * profiles), with the mark the chrome draws and the address when the reader may see it.
 */
export type EditorIdentity = {
  principalId: string;
  label: string;
  name?: string;
  trust: 'label' | 'guest' | 'verified' | 'agent';
  kind: 'anonymous' | 'account' | 'agent';
  email?: string;
  /** the mark (`self` on the own identity; the 64 px picture URL on it when the choice is a picture) */
  mark?: MarkSpec;
  /** the own identity's choice (docs/archive/rounds/PEOPLE.md 3.11), so the builder starts from it; absent on `identities` */
  avatar?: EditorAvatar;
  runId?: string;
  /** a deleted account (SPEC-3 7.4): no badge beside "Deleted account" */
  deleted?: boolean;
  /** the account (`usr_<id>`) an aliased anonymous id renders as (7.4), so the two ids are one person to the label suffix */
  accountId?: string;
};

/** The own identity of a payload: the view with `self` on its mark and the choice beside it. */
function ownIdentityOf(resolved: ResolvedIdentity): EditorIdentity {
  const view = toIdentityView(resolved, {
    mark: markSpec(resolved, { self: true }),
    showEmail: true,
  });
  const choice = resolved.avatar;
  const url = pictureUrlOf(choice, PICTURE_MARK_SIZE);
  const avatar: EditorAvatar = {
    variant: choice.variant,
    ...(choice.initials !== undefined ? { initials: choice.initials } : {}),
    ...(choice.salt !== undefined ? { salt: choice.salt } : {}),
    ...(url !== undefined ? { url } : {}),
  };
  return { ...view, avatar };
}

/**
 * The principal ids a payload names (docs/archive/rounds/PEOPLE.md 3.8): the trimmed log's authors, the comment
 * authors when the reader may read comments, the record's owner, pending owner, grants and
 * requests. Pure; the order is the order of first appearance the label suffix reads.
 */
function peopleOf(input: {
  versions: ReadonlyArray<Version>;
  commentAuthors: ReadonlyArray<string>;
  access: AccessRecord | null | undefined;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (id: string | null | undefined): void => {
    if (id === null || id === undefined || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };
  for (const version of input.versions) add(version.author.principalId);
  for (const id of input.commentAuthors) add(id);
  const record = input.access ?? null;
  if (record !== null) {
    add(record.owner);
    add(record.pendingOwner?.principalId);
    for (const grant of record.grants) add(grant.principalId);
    for (const request of record.requests) add(request.principalId);
  }
  return out;
}

/**
 * The room's facts the editor starts from (SPEC-3 3.6): the stream position of the document it
 * was handed, and on the `do` tier (the Cloudflare move, docs/CLOUDFLARE.md 3.3, 3.6.1) the
 * socket URL and the ticket the loader minted, so the tab opens its socket without a second
 * request; the transport refreshes the ticket at `ticketExpiresAt` minus two minutes through
 * `GET /api/decks/:id/ticket`.
 */
export type EditorRoom = {
  /** the last stream entry the document includes; the room client resumes after it */
  seq: number;
  tier: RealtimeTier;
  /** the title row's sentence on the blob tier, else null */
  notice: string | null;
  /** `wss://<host>/rooms/<id>` on the do tier */
  url?: string;
  /** the room ticket of 3.3, a credential for ten minutes; never logged */
  ticket?: string;
  /** when the ticket expires, ms since the epoch */
  ticketExpiresAt?: number;
};

/**
 * What the deployment offers for sign in (gslides-parity SPEC-3 7.3; the identity runtime's
 * `signInMethods`): the own chip's Sign in row exists when `signIn` is true, the dialog offers the
 * methods that are on, and `mail` says how the sign in mail travels (`capture` on a checkout and
 * the previews, `resend` once Kevin's sending domain is set, `off` otherwise).
 */
export type EditorAuthFacts = {
  signIn: boolean;
  email: boolean;
  passkeys: boolean;
  passkeysNotice: string | null;
  github: boolean;
  /** the Google client is configured: Continue with Google is offered first (docs/REALTIME.md 4.1) */
  google: boolean;
  mail: MailMode;
};

export type EditorDeck = {
  deckId: string;
  document: DeckDocument;
  issues: Issue[];
  ok: boolean;
  sprite: string;
  /**
   * The version log as the loader carries it (gslides-parity SPEC-4 0.34; PP 3.5 item 3): the
   * newest EDITOR_VERSIONS_KEPT records without their `mutations`, oldest first as the log is.
   * The Version history panel loads the whole log with its mutations through `listVersions`
   * when it opens (the controller's call), and the editor's own writes refresh it the same way.
   * A draft's log is empty.
   */
  versions: Version[];
  /** every record the store holds, counted before the trim; absent on a draft */
  versionCount?: number;
  /**
   * The origins of the records above the caller's `since` (docs/archive/rounds/SYNC.md 3.2): present when the
   * read carried `since` (the room client's resync), oldest first, at most RESYNC_ORIGINS_MAX
   * records considered; the client acknowledges every pending op named here at its `seq`
   */
  origins?: RecordOrigin[];
  leases: Lease[];
  /** the store this studio runs on, for the banner over a store whose edits do not persist */
  hosting: HostingFacts;
  /**
   * What the assistant can do on this deployment (docs/archive/rounds/POLISH.md item 113; server/assist.ts
   * assistMode): the panel draws Tailor and one sentence when it is not set up, the starters
   * and the composer when a model answers
   */
  assistMode?: 'fixture' | 'off' | 'model' | 'unconfigured';
  /**
   * The deployment's default kit (docs/archive/rounds/PRODUCT.md 4.1, 4.3): the template new presentations start
   * from, its name for "Reset to <name>", the appearance a new presentation opens in and the kit
   * record; the Brand kit panel reads it through the shell's input
   */
  defaultKit?: DefaultKit;
  /**
   * set on the document /new edits (SPEC 6.1): the store holds nothing under `deckId` until the
   * first write; the title row reads "Not saved yet" and the address moves to /edit/<deckId> once
   * that write has landed
   */
  draft?: true;
  /* round three (gslides-parity SPEC-3 3.6, 6.3, 7.8; MILESTONES-3 B2 day 4) */
  room?: EditorRoom;
  identity?: EditorIdentity;
  /**
   * The people the page names, keyed by principal id (docs/archive/rounds/PEOPLE.md 3.8): the version authors,
   * the comment authors, the owner, the pending owner and the grants, resolved once at load; the
   * controller merges the map under the roster and the caller for the version rows, the comment
   * cards and the Share dialog. Absent on a draft, which names nobody yet.
   */
  identities?: Readonly<Record<string, EditorIdentity>>;
  /** the caller's role on the deck; absent on a draft */
  role?: Role;
  via?: Via;
  capabilities?: Capability[];
  /** the effective access record (the legacy synthesis for a deck nobody claimed), tokens hashed */
  access?: AccessRecord;
  /** the deployment's sign in facts (7.3) */
  auth?: EditorAuthFacts;
};

/** How many version records the editor's loader carries (SPEC-4 0.34). */
export const EDITOR_VERSIONS_KEPT = 50;

/**
 * The version log trimmed for the loader (SPEC-4 0.34; PP 3.5 item 3): the newest
 * EDITOR_VERSIONS_KEPT records in the log's own order, each without its `mutations` (a
 * `slide.replace` carries the slide, so the GT deck's seven records weigh 184 KB and a deck
 * edited for weeks would send megabytes on every open). The author, the note, the stamp, the
 * number and the revision stay, which is what the title row's "last edit by" line and the
 * Version history panel's rows read before the panel loads the full log. Pure.
 */
export function trimVersionLog(versions: ReadonlyArray<Version>): Version[] {
  return versions
    .slice(Math.max(0, versions.length - EDITOR_VERSIONS_KEPT))
    .map((version) => ({ ...version, mutations: [] }));
}

/**
 * The room's live document with the store's trash stamp (gslides-parity SPEC 6.4, 7.5): Move to
 * trash and Restore write `trashedAt` on the manifest at the store level without moving the
 * revision (`@turboslide/store/templates` trashDeck, restoreDeck), so a room that was open before
 * the write keeps serving a document without the stamp and the editor it fed never showed the
 * trashed banner on a warm instance (the round four fixer, found by editor.spec.ts's banner
 * row). The loader reads the store beside the room, so the manifest's stamp is applied here: set
 * when the store has one, removed when the store has none, the same object when they agree. Pure.
 */
export function withTrashStamp(
  document: DeckDocument,
  trashedAt: string | undefined,
): DeckDocument {
  const stamped = typeof trashedAt === 'string' && trashedAt !== '' ? trashedAt : undefined;
  if (document.deck.trashedAt === stamped) return document;
  if (stamped === undefined) {
    const { trashedAt: _cleared, ...deck } = document.deck;
    return { ...document, deck };
  }
  return { ...document, deck: { ...document.deck, trashedAt: stamped } };
}

/**
 * The payload shaped by role (SPEC-3 6.3): notes leave below editor, skipped slides leave below
 * commenter, the version log leaves without `history`. Pure, so the loader and the tests share it.
 */
export function shapeByRole(
  payload: EditorDeck,
  capabilities: ReadonlyArray<Capability>,
): EditorDeck {
  const caps = new Set(capabilities);
  let document = payload.document;
  if (!caps.has('readNotes') || !caps.has('readSkipped')) {
    const slides: Record<string, Slide> = {};
    for (const [id, slide] of Object.entries(document.slides)) {
      if (!caps.has('readSkipped') && slide.skip === true) continue;
      if (!caps.has('readNotes') && slide.notes !== undefined) {
        const { notes: _notes, ...rest } = slide;
        slides[id] = rest as Slide;
      } else slides[id] = slide;
    }
    const sections = caps.has('readSkipped')
      ? document.deck.sections
      : document.deck.sections.map((section) => ({
          ...section,
          slideIds: section.slideIds.filter((id) => slides[id] !== undefined),
        }));
    document = { deck: { ...document.deck, sections }, slides };
  }
  return {
    ...payload,
    document,
    versions: caps.has('history') ? payload.versions : [],
  };
}

/** Sets the identity cookie a server function minted (the Set-Cookie value of session.ts). */
function sendMintedCookie(setCookieValue: string | undefined): void {
  if (setCookieValue === undefined) return;
  const [pair, ...attributes] = setCookieValue.split(';');
  const eq = pair?.indexOf('=') ?? -1;
  if (pair === undefined || eq <= 0) return;
  const name = pair.slice(0, eq);
  const value = pair.slice(eq + 1);
  const secure = attributes.some((attribute) => attribute.trim().toLowerCase() === 'secure');
  const maxAge = attributes
    .map((attribute) => /^\s*max-age=(\d+)/i.exec(attribute))
    .find((match) => match !== null);
  setCookie(name, value, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    ...(maxAge ? { maxAge: Number(maxAge[1]) } : {}),
  });
}

/** True for the store's answer to a deck whose files are gone: a RangeError, or the missing file's words. */
function isGoneDeck(error: unknown): boolean {
  if (error instanceof RangeError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /no deck|not found|ENOENT|does not exist|is not in the store/i.test(message);
}

/** True for authorize.ts `DeniedError` by name (that module stays out of this file's client graph). */
function isDenied(error: unknown): boolean {
  return error instanceof Error && error.name === 'DeniedError';
}

/**
 * `authorize()` for a server function of this module, over the room's identity (security hotfix
 * H3, DATA-1: `saveVersion`, `listVersions`, `leaseSlide` and `watchDeck` read or wrote any deck
 * with no decision at all). A refusal and a deck the store does not hold answer one sentence,
 * `No deck <id>`, the one `writeDeck` answers.
 */
async function admitRequest(deckId: string, capability: Capability, action: string) {
  const room = await import('./room');
  const identity = await room.requestIdentity(getRequest());
  const decision = await room.decideFor(identity, deckId, capability, action);
  if (!decision.ok) throw new RangeError(`No deck ${deckId}`);
  return identity;
}

const readEditorDeckFn = createServerFn({ method: 'GET' })
  .validator((input: string) => {
    const parsed = parseJsonInput<{ deckId: unknown; atLeast?: unknown; since?: unknown }>(input);
    const atLeast =
      typeof parsed.atLeast === 'number' && Number.isInteger(parsed.atLeast) && parsed.atLeast > 0
        ? parsed.atLeast
        : undefined;
    // the tab's position before a resync (docs/archive/rounds/SYNC.md 3.2): a non negative integer, else absent;
    // a hand parsed optional, so a deployment without it and one with it read the same input
    const since =
      typeof parsed.since === 'number' && Number.isInteger(parsed.since) && parsed.since >= 0
        ? parsed.since
        : undefined;
    return {
      deckId: requireSlug(parsed.deckId, 'deckId'),
      ...(atLeast === undefined ? {} : { atLeast }),
      ...(since === undefined ? {} : { since }),
    };
  })
  .handler(async ({ data }): Promise<string> => {
    /* each store read of the chain is one `server-timing` entry of the answer (docs/NEXT.md 3.2
       H9; audit-performance item 2 names the chain): loaded here with the room, since the module
       imports node:async_hooks and the client stub of this file must not */
    const { timed } = await import('./server-timing');
    if (!(await timed('deck-head', () => hasStoredDeck(data.deckId)))) return JSON.stringify(null);
    // the room and the identity (round three): loaded here, not at the top, so the client stub of
    // this module never pulls the channel's Node graph (agent-actions.ts explains the rule)
    const room = await import('./room');
    const access = await import('./access');
    const auth = await import('./auth/identity');
    /* the caller's index read past this instance's cache (docs/archive/rounds/PEOPLE.md 6.4): a reload's payload
       carries the name and the choice written on another instance at once */
    const identity = await timed('identity', () =>
      room.requestIdentity(getRequest(), { freshIndex: true }),
    );
    sendMintedCookie(identity.setCookie);
    const decision = await timed('access', () =>
      room.decideFor(identity, data.deckId, 'read', 'readEditorDeck'),
    );
    if (!decision.ok) return JSON.stringify(null);
    /* an invitation by email binds to the account whose verified address it names at that
       account's first read of the deck (docs/archive/rounds/PEOPLE.md 3.10; SPEC-3 6.5; access.ts
       bindEmailGrants says why here and not at sign in): the decision above admitted the invitee
       through the address, and the record the payload carries below names them from now on */
    if (identity.kind === 'signedIn' && identity.ctx.principal !== null) {
      const principal = identity.ctx.principal;
      await timed('grants', () => access.bindEmailGrants(data.deckId, principal)).catch(() => null);
    }
    const runtime = auth.identityRuntime();
    const deckRoom = await timed('room', () => room.roomFor(data.deckId));
    // the head on the blob tier (the focus round, cycle 2): a page load and a tab's reload read
    // the store's current document, not this instance's mirror as it stood within the sync
    // window (750 ms), and a caller that names the revision it learned from a write's answer
    // (`atLeast`, the editor's resync after a version.restore) gets a document at or above it
    // (room.ts liveAtLeast). The show's loader reads here too, so a slide skipped a moment
    // before the show opened is left out on every instance (b4.md FR8)
    let live: Awaited<ReturnType<typeof room.liveAtLeast>>;
    let read: Awaited<ReturnType<typeof deckRoom.store.read>>;
    let versions: Awaited<ReturnType<typeof deckRoom.store.listVersions>>;
    let leases: Awaited<ReturnType<typeof deckRoom.store.leases>>;
    try {
      live = await timed('live', () => room.liveAtLeast(deckRoom, data.atLeast));
      [read, versions, leases] = await Promise.all([
        timed('document', () => deckRoom.store.read()),
        timed('versions', () => deckRoom.store.listVersions()),
        timed('leases', () => deckRoom.store.leases()),
      ]);
    } catch (error) {
      /* a deck deleted forever a moment ago (docs/archive/rounds/POLISH.md item 98; audit-tables item 20): the
         listing still names it while the index catches up and the read meets no files; the
         address answers 404, never 500 */
      if (isGoneDeck(error)) return JSON.stringify(null);
      throw error;
    }
    // the resync read's answer (docs/archive/rounds/SYNC.md 3.2): the origins of the records above the tab's
    // old position, off the mirror the reads above synced (no store call of its own), so the
    // client drops every pending op a record already names instead of re-folding it
    const origins =
      data.since === undefined
        ? undefined
        : originsSince(await timed('records', () => deckRoom.store.records()), data.since);
    const record = await timed('access-record', () => access.effectiveAccess(data.deckId));
    const standing = access.standingOf(decision, record);
    // the caller as the room resolves it (docs/archive/rounds/PEOPLE.md 3.6): the account behind a session or
    // an aliased cookie, else the record's name or label
    const resolved = await timed('resolve', () => room.resolveRequestIdentity(identity));
    const selection = room.realtimeSelection();
    // the do tier (docs/CLOUDFLARE.md 3.3, 3.6.1): the socket URL and the ticket of the reader's
    // decision ride the payload; a mint that fails leaves the room without one and the transport
    // asks the ticket route
    let roomExtra: Pick<EditorRoom, 'url' | 'ticket' | 'ticketExpiresAt'> = {};
    if (selection.tier === 'do') {
      try {
        const ticketing = await import('./room-ticket');
        const reader = await room.viewerFacts(
          data.deckId,
          decision,
          identity.ctx,
          identity.identity,
        );
        const minted = ticketing.mintRoomTicket(
          ticketing.ticketClaimsFor({
            deckId: data.deckId,
            clientId: room.mintClientId(data.deckId, identity.identity),
            identity: identity.identity,
            kind: identity.kind,
            principalId: identity.principalId,
            role: decision.role,
            reader,
            resolved,
            origin: new URL(getRequest().url).origin,
          }),
        );
        const url = ticketing.roomUrlFor(data.deckId);
        roomExtra = {
          ...(url === null ? {} : { url }),
          ticket: minted.ticket,
          ticketExpiresAt: minted.expiresAt,
        };
      } catch (error) {
        console.error(
          `turboslide editor: the room ticket was not minted for ${data.deckId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    const result: EditorDeck = {
      deckId: data.deckId,
      // the room's document carries the store's trash stamp (withTrashStamp says why)
      document: withTrashStamp(live.document, read.document.deck.trashedAt),
      issues: read.issues,
      ok: read.ok,
      sprite: readSprite(),
      versions,
      ...(origins === undefined ? {} : { origins }),
      leases,
      hosting: hostingFacts(),
      assistMode: (await import('./assist')).assistMode(),
      /* the deployment's default kit (docs/archive/rounds/PRODUCT.md 4.1): the name Reset reads, the default logo;
         the store's template index is pulled first so a default set on another instance holds */
      defaultKit: await timed('templates', () => defaultKitOfCollection()),
      room: { seq: live.seq, tier: selection.tier, notice: selection.notice, ...roomExtra },
      identity: ownIdentityOf(resolved),
      ...(standing.role !== null ? { role: standing.role } : {}),
      ...(standing.via !== null ? { via: standing.via } : {}),
      capabilities: standing.capabilities,
      access: record,
      auth: {
        signIn: runtime.methods.available,
        email: runtime.methods.email,
        passkeys: runtime.methods.passkeys,
        passkeysNotice: runtime.methods.passkeysNotice,
        github: runtime.methods.github,
        google: runtime.methods.google,
        mail: runtime.mailMode,
      },
    };
    const shaped = shapeByRole(result, standing.capabilities);
    /* the people the page names, resolved once (docs/archive/rounds/PEOPLE.md 3.8): the shaped log's authors (a
       role without history names none), the comment authors for a role with readComments, the
       record's people; the address for the owner and a grant holder (SPEC-3 4.8), a role word for
       a verified person read by a link visitor without the owner's switch (0.12; 4.5) */
    const commentAuthors = standing.capabilities.includes('readComments')
      ? await timed('comments', async () => (await import('./comments')).liveThreads(deckRoom))
          .then(({ threads }) =>
            [...threads.values()].flatMap((thread) =>
              [thread.comment, ...thread.replies].map((comment) => comment.author.principalId),
            ),
          )
          .catch(() => [] as string[])
      : [];
    const byLink = standing.via === 'link' || standing.via === 'open';
    const identities = await timed('views', () =>
      room.identityViewsFor(
        peopleOf({ versions: shaped.versions, commentAuthors, access: record }),
        {
          showEmail: standing.via === 'owner' || standing.via === 'grant',
          roleWords: byLink && !(record.settings.showNamesToLinkVisitors ?? false),
          access: record,
        },
      ),
    );
    // the trim after the shaping: a role without history carries an empty log and no count
    return JSON.stringify({
      ...shaped,
      identities,
      versions: trimVersionLog(shaped.versions),
      ...(shaped.versions.length > 0 || standing.capabilities.includes('history')
        ? { versionCount: shaped.versions.length }
        : {}),
    });
  });

/**
 * Which of the given op ids the deck's records already hold (docs/archive/rounds/POLISH.md item 109): the
 * recovered writes plate offers a saved queue of an earlier tab only for the ops no record
 * names, so a write the server acknowledged but the tab never persisted as acknowledged (a
 * reload right after the answer) is never offered again. A caller without the read right, or a
 * deck the store does not hold, answers none held.
 */
const heldOpIdsFn = createServerFn({ method: 'POST' })
  .validator((input: { deckId: string; opIds: string[] }) => ({
    deckId: requireSlug(input.deckId, 'deckId'),
    opIds: Array.isArray(input.opIds)
      ? input.opIds.filter((id): id is string => typeof id === 'string').slice(0, 500)
      : [],
  }))
  .handler(async ({ data }): Promise<{ held: string[] }> => {
    if (data.opIds.length === 0 || !(await hasStoredDeck(data.deckId))) return { held: [] };
    const room = await import('./room');
    const identity = await room.requestIdentity(getRequest());
    const decision = await room.decideFor(identity, data.deckId, 'read', 'heldOpIds');
    if (!decision.ok) return { held: [] };
    const deckRoom = await room.roomFor(data.deckId);
    let records: ReadonlyArray<VersionRecord>;
    try {
      records = await deckRoom.store.records();
    } catch {
      return { held: [] };
    }
    const wanted = new Set(data.opIds);
    const held: string[] = [];
    for (const record of records) {
      for (const opId of record.origin?.opIds ?? []) if (wanted.has(opId)) held.push(opId);
    }
    return { held };
  });

export async function heldOpIds(input: {
  deckId: string;
  opIds: string[];
}): Promise<{ held: string[] }> {
  return heldOpIdsFn({ data: input });
}

/**
 * The raw normalized document with the trimmed version log (SPEC-4 0.34: the newest 50 records
 * without their mutations, and `versionCount`) and the unexpired leases, for the editor's loader.
 */
export async function readEditorDeck(input: {
  deckId: string;
  /** a revision the caller knows the store reached; the answer is at or above it on the blob tier */
  atLeast?: number;
  /**
   * the tab's stream position before a resync (docs/archive/rounds/SYNC.md 3.2): the answer then carries
   * `origins`, the records above it that name the ops they folded, so the client acknowledges
   * a pending op whose first attempt committed instead of sending it again
   */
  since?: number;
}): Promise<EditorDeck | null> {
  return JSON.parse(await readEditorDeckFn({ data: JSON.stringify(input) })) as EditorDeck | null;
}

/**
 * The template a draft is cut from (SPEC 6.1; docs/archive/rounds/PRODUCT.md 4.3): the deployment's default
 * (decks/templates/default.json, written by Use for new presentations), `blank` when none is set;
 * the first write's `createStoredDeck` copies the same folder.
 */
async function draftTemplateId(): Promise<string> {
  const decks = await ensureDecks();
  // the default set on another instance (Use for new presentations) is in the store's templates
  // index; one head brings it and the template's folder here (blob-templates.ts)
  await decks.templates.pull();
  return readDefaultTemplateId(decks.decksDir);
}

/**
 * The deployment's default kit for the editor payload (docs/archive/rounds/PRODUCT.md 4.1): the store's template
 * index is pulled first so a default template set on another instance of the deployment (Use for
 * new presentations, b7.md FR2) names the kit the Reset row and the default logo read.
 */
async function defaultKitOfCollection(): Promise<DefaultKit> {
  const decks = await ensureDecks();
  await decks.templates.pull();
  return readDefaultKit(decks.decksDir);
}

/** A draft's first save at or over this many milliseconds is logged with its phases (C2-F9). */
const FIRST_SAVE_LOG_MS = 1000;

const readDraftDeckFn = createServerFn({ method: 'GET' }).handler(async (): Promise<string> => {
  /* the person the draft belongs to (docs/archive/rounds/PEOPLE.md 3.11; production 1 and 2): the same identity
     the editor boot carries, so the own chip, the account menu and the name prompt on the first
     edit read the person and not the page's default author; the sign in facts beside it so the
     Sign in row exists on /new where the deployment offers one */
  const room = await import('./room');
  const auth = await import('./auth/identity');
  const identity = await room.requestIdentity(getRequest(), { freshIndex: true });
  sendMintedCookie(identity.setCookie);
  const resolved = await room.resolveRequestIdentity(identity);
  const runtime = auth.identityRuntime();
  const decks = await ensureDecks();
  await decks.templates.pull();
  const from = readDefaultTemplateId(decks.decksDir);
  const dir = await templateDir(from);
  /* the realtime tier the draft's room will run on (docs/CLOUDFLARE.md 3.6.3; build/r2.md R2-C3):
     the deck does not exist yet, so no ticket and no url ride here, but the tier word does, so a
     deck made from /new on the do tier opens its socket on its first write (the ticket route mints
     the client id) instead of starting on the stream route, meeting its 503 and waiting out the
     30 s retry before the switch (the integrator's two process run of 2026-10-01: `connected`
     false for 45 s on every realtime row made from /new) */
  const selection = room.realtimeSelection();
  const { document } = loadDeckDir(dir);
  const now = new Date();
  let deckId = newDraftDeckId(now);
  // the four characters make a collision unlikely; a saved deck under the id is skipped anyway
  while (await hasStoredDeck(deckId)) deckId = newDraftDeckId(now);
  const stamp = now.toISOString();
  const defaultKit = readDefaultKit(decks.decksDir);
  /* the appearance a new presentation opens in (docs/archive/rounds/PRODUCT.md 4.1, section 1's decision;
     build/b5.md R8): the template's own when its manifest names one, else its kit's, light on
     General Translation's deployment; a stored deck keeps whatever it has */
  const defaults =
    document.deck.defaults?.appearance === undefined
      ? { ...document.deck.defaults, appearance: defaultKit.appearance }
      : document.deck.defaults;
  const result: EditorDeck = {
    deckId,
    document: {
      deck: {
        ...document.deck,
        id: deckId,
        title: DEFAULT_BLANK_TITLE,
        revision: 0,
        createdAt: stamp,
        updatedAt: stamp,
        defaults,
      },
      slides: document.slides,
    },
    issues: [],
    ok: true,
    sprite: readSprite(),
    versions: [],
    leases: [],
    hosting: hostingFacts(),
    defaultKit,
    draft: true,
    room: { seq: 0, tier: selection.tier, notice: selection.notice },
    identity: ownIdentityOf(resolved),
    auth: {
      signIn: runtime.methods.available,
      email: runtime.methods.email,
      passkeys: runtime.methods.passkeys,
      passkeysNotice: runtime.methods.passkeysNotice,
      github: runtime.methods.github,
      google: runtime.methods.google,
      mail: runtime.mailMode,
    },
  };
  return JSON.stringify(result);
});

/* the drafts an editor on /new holds open in this page (holdDraft), and the last draft read */
const heldDrafts = new Set<string>();
let lastDraft: EditorDeck | null = null;

/**
 * Marks a draft as open in an editor of this page, until the disposer runs (the editor's
 * unmount). While a draft is held, `readDraftDeck` answers it again instead of minting another:
 * the router reruns /new's loader on every search change (a Mode or View toggle after the first
 * save), and a fresh id would remount the editor on a phantom draft at revision 0 and hand the
 * window API to it (VERIFICATION-3 finding 2). A reload starts a new module, so /new before any
 * write still shows a fresh draft; two tabs are two modules, so two decks.
 */
export function holdDraft(deckId: string): () => void {
  heldDrafts.add(deckId);
  return () => {
    heldDrafts.delete(deckId);
    if (lastDraft?.deckId === deckId) lastDraft = null;
  };
}

/**
 * The document /new edits (gslides-parity SPEC 6.1): the blank template (one Title slide with
 * empty heading and lead, the theme starter pictures, title "Untitled presentation") under a
 * fresh draft id at revision 0, with no version log and no leases. Nothing is written; the first
 * `writeDeck` against the id creates the deck. Two calls give two ids (two tabs, two decks),
 * except while an editor of this page holds the last draft open (`holdDraft`).
 */
export async function readDraftDeck(): Promise<EditorDeck> {
  if (lastDraft !== null && heldDrafts.has(lastDraft.deckId)) return lastDraft;
  const payload = JSON.parse(await readDraftDeckFn()) as EditorDeck;
  lastDraft = payload;
  return payload;
}

export type WriteDeckInput = {
  deckId: string;
  write: Write;
  /** skip the lease check (SPEC 6.7 force) */
  force?: boolean;
  /** send the normalized document back; the editor asks for it after a version.restore */
  returnDocument?: boolean;
};

export type WriteDeckResult =
  | {
      ok: true;
      revision: number;
      entry: VersionRecord;
      changed: string[];
      warnings: string[];
      issues: Issue[];
      document?: DeckDocument;
      /** this write created the deck in the store: the first save of a draft (SPEC 6.1) */
      created?: true;
      /**
       * The general link the new record was minted with, in the clear for this one answer (b7.md
       * FR1): the page remembers `<origin>/s/<token>` under the link's id, so the Share dialog's
       * field holds the address at its first open and Copy link copies it without rotating it.
       */
      link?: { id: string; token: string };
      /** the stream position of the entry the room admitted (SPEC-3 3.7 c); the revision on the blob tier */
      seq?: number;
    }
  | {
      ok: false;
      code: 'conflict';
      message: string;
      currentRevision: number;
      current: DeckDocument;
      holder?: Author;
      /** the version records after the caller's baseRevision: what changed under it */
      since: VersionRecord[];
    }
  | { ok: false; code: 'invalid'; message: string; index?: number; issues: Issue[] };

const writeDeckFn = createServerFn({ method: 'POST' })
  .validator((raw: string): WriteDeckInput => {
    const input = parseJsonInput<Untrusted<WriteDeckInput>>(raw);
    const deckId = requireSlug(input.deckId, 'deckId');
    const parsed = writeSchema.safeParse(input.write);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new TypeError(
        `write: invalid input at /${first?.path.map(String).join('/') ?? ''}: ${first?.message ?? 'invalid'}`,
      );
    }
    return {
      deckId,
      write: parsed.data,
      ...(input.force === true ? { force: true } : {}),
      ...(input.returnDocument === true ? { returnDocument: true } : {}),
    };
  })
  .handler(async ({ data }): Promise<string> => {
    // the first save of a draft (SPEC 6.1): the deck is created from the blank template under the
    // draft's id, then the write applies against revision 0; the id shape keeps any other missing
    // deck a 404, and a write with a base above 0 names a deck that once existed, not a draft
    // the strict, checkpointed write of round three (gslides-parity SPEC-3 3.7 c, 11.3): the
    // author is the session's, never the body's, on a browser transport; the write is admitted
    // through the room so every open tab receives it live, and checkpointed at once so the answer
    // carries a revision and its record
    const room = await import('./room');
    const identity = await room.requestIdentity(getRequest());
    sendMintedCookie(identity.setCookie);
    let created = false;
    let minted: { id: string; token: string } | undefined;
    // the phases of a draft's first save, timed for the server log (the focus round, cycle 2;
    // VERIFICATION C2-F9: a second tab's first write on /new did not move the address within
    // 30 s on the blob tier and nothing named which of the create, the record, the room's open
    // or the admission took the time): every phase over a second is logged with its duration
    const phases: [string, number][] = [];
    let phaseAt = performance.now();
    const phase = (name: string): void => {
      const now = performance.now();
      phases.push([name, Math.round(now - phaseAt)]);
      phaseAt = now;
    };
    if (data.write.baseRevision === 0 && (await isUnsavedDraft(data.deckId))) {
      phase('draft check');
      const from = await draftTemplateId();
      // the new deck's record (SPEC-3 6.1) before the deck (H3, DATA-V3): restricted, this
      // session its owner, so the decision below reads it (VERIFICATION-3 finding 4) and a failed
      // record write leaves no deck behind; a request with no identity creates nothing
      const access = await import('./access');
      let recorded: Awaited<ReturnType<typeof access.createWithRecord>>['recorded'];
      try {
        ({ recorded } = await access.createWithRecord(data.deckId, identity.ctx, () =>
          createStoredDeck({ name: DEFAULT_BLANK_TITLE, from, id: data.deckId }),
        ));
      } catch (error) {
        if (error instanceof access.DeckIdTakenError || isDenied(error))
          throw new RangeError(`No deck ${data.deckId}`);
        throw error;
      }
      created = true;
      if (recorded.general !== undefined)
        minted = { id: recorded.general.linkId, token: recorded.general.token };
      phase('record and create');
    }
    const decision = await room.decideFor(identity, data.deckId, 'write', 'writeDeck');
    if (!decision.ok) {
      throw new RangeError(`No deck ${data.deckId}`);
    }
    const author =
      identity.ctx.agent !== undefined && data.write.author.kind === 'agent'
        ? data.write.author
        : room.authorOf(identity);
    const deckRoom = await room.roomFor(data.deckId);
    if (created) phase('decide and open the room');
    const admitted = await room.admitServerWrite(deckRoom, {
      author,
      mutations: data.write.mutations,
      baseRevision: data.write.baseRevision,
      strict: true,
      ...(data.write.note === undefined ? {} : { note: data.write.note }),
    });
    if (created) {
      phase('admit');
      const total = phases.reduce((sum, [, ms]) => sum + ms, 0);
      if (total >= FIRST_SAVE_LOG_MS) {
        console.error(
          `turboslide write: the first save of ${data.deckId} took ${total} ms (${phases
            .map(([name, ms]) => `${name} ${ms} ms`)
            .join(', ')}) on the ${room.realtimeTier()} tier`,
        );
      }
    }
    if (admitted.ok) {
      // the card's capture on save (card-thumb.ts): slide 1 renders once the writes settle
      const { scheduleCardThumb } = await import('./card-thumb');
      scheduleCardThumb(data.deckId);
    }
    let result: WriteDeckResult;
    if (!admitted.ok) {
      // the refusal in the server log with the ops and both revisions (the focus round, cycle 2):
      // a refused server first write (a version.restore) shows the seller a notice in the panel
      // and nothing else, and the walk of docs/FOCUS.md 6.1 read "restore changed the deck false"
      // with no sentence anywhere (VERIFICATION F-versions); the log line names the mechanism
      console.error(
        `turboslide write: ${data.deckId} refused a ${data.write.mutations.map((m) => m.op).join(', ')} write at base ${data.write.baseRevision} as ${admitted.code}: ${admitted.message}`,
      );
    }
    if (admitted.ok) {
      const document = data.returnDocument === true ? (await deckRoom.live()).document : undefined;
      result = {
        ok: true,
        revision: admitted.revision,
        entry: admitted.record,
        changed: [
          ...new Set(admitted.record.mutations.flatMap((m) => ('slideId' in m ? [m.slideId] : []))),
        ],
        warnings: [],
        issues: [],
        ...(document === undefined ? {} : { document }),
        ...(created ? { created: true } : {}),
        ...(created && minted !== undefined ? { link: minted } : {}),
        seq: admitted.seq,
      };
    } else if (admitted.code === 'conflict') {
      result = {
        ok: false,
        code: 'conflict',
        message: admitted.message,
        currentRevision: admitted.currentRevision,
        current: admitted.current,
        since: admitted.since,
      };
    } else {
      result = { ok: false, code: 'invalid', message: admitted.message, issues: [] };
    }
    return JSON.stringify(result);
  });

/**
 * The event the page raises when a write created the deck (the first save of a draft, SPEC
 * 6.1); /new listens for it and moves the address to /edit/<deckId> without a reload.
 */
export const DECK_CREATED_EVENT = 'turboslide:deck-created';

export type DeckCreatedDetail = {
  deckId: string;
  revision: number;
  /** the minted general link, once (FR1); the listener remembers its address for the Share dialog */
  link?: { id: string; token: string };
};

/** One Write through the store: the authority behind every editor gesture and window action. */
export async function writeDeck(input: WriteDeckInput): Promise<WriteDeckResult> {
  const result = JSON.parse(await writeDeckFn({ data: JSON.stringify(input) })) as WriteDeckResult;
  if (result.ok && result.created === true && typeof window !== 'undefined') {
    const detail: DeckCreatedDetail = {
      deckId: input.deckId,
      revision: result.revision,
      ...(result.link === undefined ? {} : { link: result.link }),
    };
    window.dispatchEvent(new CustomEvent(DECK_CREATED_EVENT, { detail }));
  }
  return result;
}

const saveVersionFn = createServerFn({ method: 'POST' })
  .validator((raw: string) => {
    const input = parseJsonInput<{ deckId: unknown; author: unknown; note: unknown }>(raw);
    if (typeof input.note !== 'string' || input.note.trim() === '') {
      throw new TypeError('A named version needs a note');
    }
    return {
      deckId: requireSlug(input.deckId, 'deckId'),
      author: parseAuthor(input.author),
      note: input.note,
    };
  })
  .handler(async ({ data }): Promise<string> => {
    // a named version pins the live document (SPEC-3 0.3: version.save forces a checkpoint);
    // the history cell first (H3)
    const identity = await admitRequest(data.deckId, 'history', 'version.save');
    const room = await import('./room');
    const author = identity.ctx.agent !== undefined ? data.author : room.authorOf(identity);
    const deckRoom = await room.roomFor(data.deckId);
    if (deckRoom.tier !== 'blob') await deckRoom.checkpointer.run({ force: true });
    return JSON.stringify(await deckRoom.store.saveVersion(author, data.note));
  });

/** version.save: a named version at the current revision. */
export async function saveVersion(input: {
  deckId: string;
  author: Author;
  note: string;
}): Promise<Version> {
  return JSON.parse(await saveVersionFn({ data: JSON.stringify(input) })) as Version;
}

const listVersionsFn = createServerFn({ method: 'GET' })
  .validator((raw: string) => {
    const input = parseJsonInput<{ deckId: unknown }>(raw);
    return { deckId: requireSlug(input.deckId, 'deckId') };
  })
  .handler(async ({ data }): Promise<string> => {
    await admitRequest(data.deckId, 'history', 'version.list');
    return JSON.stringify(await (await storeFor(data.deckId)).listVersions());
  });

/** version.list: every log entry, oldest first; the server log the undo spec counts. */
export async function listVersions(input: { deckId: string }): Promise<Version[]> {
  return JSON.parse(await listVersionsFn({ data: JSON.stringify(input) })) as Version[];
}

export type LeaseSlideInput = {
  deckId: string;
  slideId: string;
  author: Author;
  minutes?: number;
  force?: boolean;
  release?: boolean;
};

const leaseSlideFn = createServerFn({ method: 'POST' })
  .validator((raw: string): LeaseSlideInput => {
    const input = parseJsonInput<Untrusted<LeaseSlideInput>>(raw);
    return {
      deckId: requireSlug(input.deckId, 'deckId'),
      slideId: requireSlug(input.slideId, 'slideId'),
      author: parseAuthor(input.author),
      ...(typeof input.minutes === 'number' ? { minutes: input.minutes } : {}),
      ...(input.force === true ? { force: true } : {}),
      ...(input.release === true ? { release: true } : {}),
    };
  })
  .handler(async ({ data }): Promise<string> => {
    if (await isUnsavedDraft(data.deckId)) {
      // nothing exists to lease yet (SPEC 6.1): the editor's presence marker holds in name only
      // until the first write creates the deck and the next lease call reaches the store
      const minutes = data.minutes ?? 10;
      const until = new Date(Date.now() + (data.release === true ? 0 : minutes * 60_000));
      const lease: Lease = {
        slideId: data.slideId,
        holder: data.author,
        until: until.toISOString(),
      };
      return JSON.stringify(lease);
    }
    await admitRequest(data.deckId, 'write', 'slide.lease');
    const store = await storeFor(data.deckId);
    if (data.release === true) {
      const released = await store.release(data.slideId, data.author);
      if (released === undefined) {
        throw new RangeError(`No lease held by this author on slide "${data.slideId}"`);
      }
      return JSON.stringify(released);
    }
    const lease = await store.lease(data.slideId, data.author, {
      ...(data.minutes !== undefined ? { minutes: data.minutes } : {}),
      ...(data.force !== undefined ? { force: data.force } : {}),
    });
    return JSON.stringify(lease);
  });

/** slide.lease: take, renew or release the author's advisory lease on a slide (SPEC 6.7). */
export async function leaseSlide(input: LeaseSlideInput): Promise<Lease> {
  return JSON.parse(await leaseSlideFn({ data: JSON.stringify(input) })) as Lease;
}

export type WatchDeckInput = {
  deckId: string;
  /** the revision the caller knows; the poll answers when the deck moves past it, or at the timeout */
  since: number;
  /** how long to hold the poll; 20 s by default, 25 s at most */
  timeoutMs?: number;
};

export type WatchDeckResult = {
  revision: number;
  /** the newest version log entry, with its author, for the external revision banner */
  head: Version | null;
  leases: Lease[];
  /** true when the deck moved past `since` */
  changed: boolean;
  /**
   * the version records written after `since`, oldest first, so the editor can apply an external
   * revision forward on its own document instead of reloading (MILESTONES M4 item 2)
   */
  since: VersionRecord[];
};

const WATCH_DEFAULT_MS = 20_000;
const WATCH_MAX_MS = 25_000;
/** how often a poll on an unsaved draft looks for the deck its first write creates */
const DRAFT_POLL_MS = 1000;

async function snapshot(store: DeckStore, since: number): Promise<WatchDeckResult> {
  const [revision, records, leases] = await Promise.all([
    store.revision(),
    store.records(),
    store.leases(),
  ]);
  const last = records[records.length - 1];
  return {
    revision,
    head: last === undefined ? null : toVersion(last),
    leases,
    changed: revision !== since,
    since: revision === since ? [] : records.filter((record) => record.revision > since),
  };
}

/**
 * The store's watch channel as a long poll (SPEC 6.7 "External changes arrive over the store's
 * watch channel as a new revision"; MILESTONES M4 item 2): resolves as soon as deck.json carries a
 * revision other than `since`, or with the current state at the timeout, with the version records
 * written in between so the editor applies them forward within the second. The editor loops on it.
 * Over the Blob mirror the channel is a revision poll against the store every few seconds
 * (@turboslide/store/blob-store watch), so a write from another instance arrives within that.
 */
const watchDeckFn = createServerFn({ method: 'POST' })
  .validator((raw: string): WatchDeckInput => {
    const input = parseJsonInput<Untrusted<WatchDeckInput>>(raw);
    if (typeof input.since !== 'number' || !Number.isInteger(input.since) || input.since < 0) {
      throw new TypeError('since must be a non-negative integer revision');
    }
    const timeoutMs = typeof input.timeoutMs === 'number' ? input.timeoutMs : WATCH_DEFAULT_MS;
    return {
      deckId: requireSlug(input.deckId, 'deckId'),
      since: input.since,
      timeoutMs: Math.min(WATCH_MAX_MS, Math.max(0, timeoutMs)),
    };
  })
  .handler(async ({ data }): Promise<string> => {
    if (await isUnsavedDraft(data.deckId)) {
      // an unsaved draft (SPEC 6.1) has no store to watch: the poll holds, looking once a second
      // for the deck the first write creates, and answers as an empty deck at the timeout
      const deadline = Date.now() + (data.timeoutMs ?? WATCH_DEFAULT_MS);
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, DRAFT_POLL_MS));
        if (await hasStoredDeck(data.deckId)) break;
      }
      if (!(await hasStoredDeck(data.deckId))) {
        const empty: WatchDeckResult = {
          revision: 0,
          head: null,
          leases: [],
          changed: false,
          since: [],
        };
        return JSON.stringify(empty);
      }
    }
    await admitRequest(data.deckId, 'read', 'watchDeck');
    const store = await storeFor(data.deckId);
    const now = await snapshot(store, data.since);
    if (now.changed) return JSON.stringify(now);
    const result = await new Promise<WatchDeckResult>((resolve, reject) => {
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        stop();
        // the deck may have gone away while the poll held (a scratch deck removed by a test):
        // the rejection becomes the route's error, never an unhandled rejection in the server
        snapshot(store, data.since).then(resolve, reject);
      };
      const stop = store.watch((event) => {
        if (event.revision !== null && event.revision !== data.since) finish();
      });
      const timer = setTimeout(finish, data.timeoutMs ?? WATCH_DEFAULT_MS);
    });
    return JSON.stringify(result);
  });

export async function watchDeck(input: WatchDeckInput): Promise<WatchDeckResult> {
  return JSON.parse(await watchDeckFn({ data: JSON.stringify(input) })) as WatchDeckResult;
}
