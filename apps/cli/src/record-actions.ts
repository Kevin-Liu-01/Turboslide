// The record actions over a deck folder (gslides-parity SPEC-3 5.9, 6.9, 7.9, 10.5, 12; MILESTONES-3
// B1 day 3 to 5): comments, notifications, activity, sharing and publishing, the checkout's
// account facts, the kill switches, presence and sync reads, deck.watch, and the file, url and
// material forms of the background picture. Every function reads and writes the deck's side
// records (`comments/`, `.turboslide/access.json`, `.turboslide/activity.jsonl`) and the
// repository's `.turboslide/` (the inbox, the principal records, the flags) through the modules
// under records/, so the CLI commands, `turboslide mcp` over stdio and, once the studio registers
// them (b1.md requests B4's actions.ts to call registerRecordActions with the session's
// principal), the HTTP and window transports run one implementation. This module needs the file
// system, so it is not imported by the editor page; store-actions.ts stays browser safe.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { ActionContext, ActionHandler, Dispatcher } from '@turboslide/agent/dispatch';
import type {
  AccessRecord,
  Capability,
  FlagName,
  GrantRole,
  GrantWho,
} from '@turboslide/schema/access';
import type { ActivityKind } from '@turboslide/schema/actions';
import type { Asset } from '@turboslide/schema/assets';
import type { PictureDither } from '@turboslide/schema/blocks/dither';
import type {
  CommentAnchor,
  CommentAuthor,
  CommentBody,
  Emoji,
  Mention,
} from '@turboslide/schema/comments';
import type { DeckDocument } from '@turboslide/schema/deck';
import type { Author, Version } from '@turboslide/schema/mutations';
import type { DeckStore } from '@turboslide/store/store';
import { listDeckHeads } from '@turboslide/store/templates';
import { watchDeck } from '@turboslide/store/watch';

import type { Caller } from './records/access.ts';
import {
  adminAssignOwner,
  capabilitiesOf,
  deckPublish,
  deckUnpublish,
  loadRecord,
  shareAcceptOwnership,
  shareClaim,
  shareCreateLink,
  shareDeclineOwnership,
  shareEmailCollaborators,
  shareGet,
  shareInvite,
  shareListRequests,
  shareRemove,
  shareRequestAccess,
  shareRespond,
  shareRevokeLink,
  shareRotateLink,
  shareSetExpiry,
  shareSetGeneralAccess,
  shareSetRole,
  shareSettings,
  shareStop,
  shareTransferOwnership,
  standing,
} from './records/access.ts';
import { commentEvents, mergeActivity, readAppended, versionEvents } from './records/activity.ts';
import type { CommentsDeps } from './records/comments.ts';
import {
  commentAdd,
  commentAssign,
  commentDelete,
  commentDone,
  commentEdit,
  commentGet,
  commentLink,
  commentList,
  commentReact,
  commentReopen,
  commentReply,
  commentResolve,
  mapCommentError,
  readIndex,
  readThreads,
} from './records/comments.ts';
import { readFlag, writeFlag } from './records/flags.ts';
import {
  listNotifications,
  markRead,
  readInbox,
  settingsFor,
  writeSettings,
} from './records/inbox.ts';
import type { AvatarVariant, LocalPrincipalRecord } from './records/principal.ts';
import {
  displayNameOf,
  localMarkSpec,
  principalIdOf,
  readLocalPrincipal,
  trustOf,
  writeLocalPrincipal,
} from './records/principal.ts';
import {
  presenceFollow,
  presenceList,
  presencePointer,
  presenceUnfollow,
  syncStatus,
} from './records/presence.ts';
import type { PresenceDeps } from './records/presence.ts';
import type { StoreActionDeps, WriteContext } from './store-actions.ts';
import { slideSetBackgroundPicture } from './store-actions.ts';

/** The studio's origin the URLs are printed against; the dev server's on a checkout. */
export const DEFAULT_ORIGIN = 'http://localhost:4321';
export const ORIGIN_ENV = 'TURBOSLIDE_ORIGIN';

export type RecordDeps = {
  /** The deck folder; the store over it. */
  store: DeckStore & { readonly dir: string };
  deckId: string;
  /** The repository's `.turboslide/`: the inbox files, the principal records and the flags. */
  stateDir: string;
  /** The `decks/` folder, for account.decks; absent skips the action. */
  decksDir?: string;
  origin: string;
  /** The caller of every call; the CLI's `--author`, the hosted transports' session. */
  caller: Caller;
  author: Author;
  /** The store actions' deps, for the background picture writes. */
  storeDeps: StoreActionDeps;
  /** asset.add for the file and url forms of slide.setBackgroundPicture (the materials package, bound by the CLI). */
  addAsset?: (
    request: { file?: string; url?: string; upload?: string; alt: string; role: 'other' },
    ctx: WriteContext,
    baseRevision: number,
  ) => Promise<Asset>;
  /** material.capture for slide.setBackgroundMaterial (the materials package, bound by the CLI). */
  captureMaterial?: (
    request: {
      materialId: string;
      preset?: string;
      uniforms?: Record<string, unknown>;
      anchor?: number;
    },
    ctx: WriteContext,
    baseRevision: number,
  ) => Promise<Asset>;
  /** The name rules of SPEC-3 0.19 (identity's normalizeName) when the package is bound; the basic rules otherwise. */
  normalizeName?: (
    name: string,
    taken: readonly string[],
  ) => { ok: true; name: string } | { ok: false; message: string };
  /**
   * Where the access record lives when it is not the deck folder's `access.json`: the studio's
   * access store with its etag (integrator, merge 2, b2.md R8; `hostedAccessHooks` of
   * apps/studio/src/server/access.ts). The file under the deck when absent.
   */
  access?: {
    load: () => Promise<AccessRecord | null> | AccessRecord | null;
    save: (record: AccessRecord) => Promise<void> | void;
  };
  now?: () => string;
  id?: () => string;
};

/** The caller of a checkout: `local:<name>` for a person, `agent:<runId>` for an agent, the folder's holder. */
export function localCaller(author: Author): Caller {
  const principalId = principalIdOf(author);
  return { principalId, kind: principalId.startsWith('agent:') ? 'agent' : 'local' };
}

export function originOf(env: NodeJS.ProcessEnv): string {
  const value = env[ORIGIN_ENV]?.trim();
  return value !== undefined && value !== '' ? value.replace(/\/$/, '') : DEFAULT_ORIGIN;
}

const RESERVED_BASIC = [
  'turboslide',
  'admin',
  'owner',
  'agent',
  'system',
  'presenter',
  'studio',
  'anonymous',
  'you',
  'me',
  'everyone',
];
const BIDI_OR_CONTROL = /[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/;

/** The basic name rules of SPEC-3 0.19 until identity's normalizeName is bound: NFC, whitespace, length, a letter or digit, the reserved list, uniqueness. */
export function basicNormalizeName(
  input: string,
  taken: readonly string[],
): { ok: true; name: string } | { ok: false; message: string } {
  const name = input.normalize('NFC').replace(/\s+/g, ' ').trim();
  const points = [...name].length;
  if (points < 1 || points > 40 || !/\p{L}|\p{Nd}/u.test(name) || BIDI_OR_CONTROL.test(name)) {
    return { ok: false, message: 'Use 1 to 40 letters or digits in one script' };
  }
  const key = name.toLowerCase();
  if (RESERVED_BASIC.includes(key) || key.startsWith('agent:'))
    return { ok: false, message: 'That name is reserved' };
  if (taken.some((other) => other.toLowerCase() === key)) {
    return { ok: false, message: 'That name is already in use in this presentation' };
  }
  return { ok: true, name };
}

function nowOf(deps: RecordDeps): string {
  return deps.now?.() ?? new Date().toISOString();
}

async function documentOf(deps: RecordDeps): Promise<DeckDocument> {
  return (await deps.store.read()).document;
}

/** The caller's capabilities on this deck now, from the access record (every one for the folder's holder). */
async function capabilitiesNow(deps: RecordDeps): Promise<Set<Capability>> {
  const { record } = await loadRecord(accessDeps(deps));
  return capabilitiesOf(record, standing(record, deps.caller, nowOf(deps)));
}

function accessDeps(deps: RecordDeps) {
  return {
    deckDir: deps.store.dir,
    deckId: deps.deckId,
    stateDir: deps.stateDir,
    caller: deps.caller,
    origin: deps.origin,
    ...(deps.now !== undefined ? { now: deps.now } : {}),
    ...(deps.access !== undefined ? { load: deps.access.load, save: deps.access.save } : {}),
  };
}

function localPrincipal(deps: RecordDeps): LocalPrincipalRecord {
  return readLocalPrincipal(deps.stateDir, deps.caller.principalId, nowOf(deps));
}

/** The comment author of the caller: its principal id, its display name as the label, its kind. */
function commentAuthorOf(deps: RecordDeps): CommentAuthor {
  const record = localPrincipal(deps);
  return {
    principalId: deps.caller.principalId,
    label: displayNameOf(record).slice(0, 40),
    kind: deps.author.kind,
  };
}

async function commentsDeps(deps: RecordDeps): Promise<CommentsDeps> {
  return {
    deckDir: deps.store.dir,
    deckId: deps.deckId,
    stateDir: deps.stateDir,
    document: () => documentOf(deps),
    principal: commentAuthorOf(deps),
    capabilities: await capabilitiesNow(deps),
    origin: deps.origin,
    ...(deps.now !== undefined ? { now: deps.now } : {}),
    ...(deps.id !== undefined ? { id: deps.id } : {}),
  };
}

function presenceDeps(deps: RecordDeps): PresenceDeps {
  return {
    deckId: deps.deckId,
    stateDir: deps.stateDir,
    author: deps.author,
    principalId: deps.caller.principalId,
    revision: () => deps.store.revision(),
    ...(deps.now !== undefined ? { now: deps.now } : {}),
  };
}

/** The account facts of the caller (account.me), the shape meSchema names. */
export function accountMe(deps: RecordDeps): Record<string, unknown> {
  const record = localPrincipal(deps);
  // the checkout's principal is `local`; hosted, the session's kind (anonymous, account, agent)
  const kind = deps.caller.kind;
  return {
    principal: {
      id: deps.caller.principalId,
      kind,
      ...(deps.caller.email !== undefined ? { email: deps.caller.email } : {}),
      admin: deps.caller.admin === true,
    },
    trust: trustOf(record),
    label: record.label,
    ...(record.name !== undefined ? { name: record.name } : {}),
    mark: localMarkSpec(record),
    avatar: {
      variant: record.avatar.variant,
      ...(record.avatar.initials !== undefined ? { initials: record.avatar.initials } : {}),
      ...(record.avatar.salt !== undefined ? { salt: record.avatar.salt } : {}),
    },
  };
}

/** The names already taken on this deck: the comment authors and the version authors (SPEC-3 0.19 per deck uniqueness). */
async function takenNames(deps: RecordDeps): Promise<string[]> {
  const out = new Set<string>();
  for (const thread of readThreads(deps.store.dir, deps.deckId)) {
    for (const comment of [thread.comment, ...thread.replies]) {
      if (comment.author.principalId !== deps.caller.principalId) out.add(comment.author.label);
    }
  }
  for (const version of await deps.store.listVersions()) {
    if (principalIdOf(version.author) !== deps.caller.principalId) out.add(version.author.name);
  }
  return [...out];
}

async function accountSetName(
  deps: RecordDeps,
  input: { name: string },
): Promise<Record<string, unknown>> {
  const normalize = deps.normalizeName ?? basicNormalizeName;
  const result = normalize(input.name, await takenNames(deps));
  if (!result.ok) throw new TypeError(result.message);
  const record = localPrincipal(deps);
  record.name = result.name;
  record.lastSeenAt = nowOf(deps);
  writeLocalPrincipal(deps.stateDir, record);
  return accountMe(deps);
}

function accountSetAvatar(
  deps: RecordDeps,
  input: { variant: AvatarVariant; initials?: string; salt?: number; picture?: string },
): Record<string, unknown> {
  if (input.variant === 'picture' || input.picture !== undefined) {
    throw new TypeError('Sign in to upload a picture');
  }
  const record = localPrincipal(deps);
  record.avatar = {
    variant: input.variant,
    ...(input.initials !== undefined ? { initials: input.initials } : {}),
    ...(input.salt !== undefined ? { salt: input.salt } : {}),
  };
  record.lastSeenAt = nowOf(deps);
  writeLocalPrincipal(deps.stateDir, record);
  return accountMe(deps);
}

function accountDecks(
  deps: RecordDeps,
  input: { view: 'owned' | 'shared' | 'recent' | 'trash' | 'all' },
) {
  if (deps.decksDir === undefined)
    throw new TypeError('account.decks needs a decks/ folder on this transport');
  if (input.view === 'shared') return [];
  const heads = listDeckHeads(deps.decksDir, {
    includeTrashed: input.view === 'trash' || input.view === 'all',
  });
  const rows =
    input.view === 'trash' ? heads.filter((head) => head.trashedAt !== undefined) : heads;
  return rows.map((head) => ({ ...head, owner: deps.caller.principalId, role: 'owner' as const }));
}

async function activityList(
  deps: RecordDeps,
  input: { since?: string; kinds?: ActivityKind[]; limit?: number },
) {
  const capabilities = await capabilitiesNow(deps);
  const inbox = readInbox(deps.stateDir, deps.caller.principalId);
  const allowed =
    capabilities.has('history') ||
    (capabilities.has('comment') && settingsFor(inbox, deps.deckId).activityForCommenters);
  if (!allowed)
    throw new TypeError(
      'the Activity panel is for editors and the owner, and for commenters when the owner allows it',
    );
  const versions: Version[] = await deps.store.listVersions();
  const events = [
    ...versionEvents(deps.deckId, versions),
    ...commentEvents(deps.deckId, readThreads(deps.store.dir, deps.deckId)),
    ...readAppended(deps.store.dir),
  ];
  return { events: mergeActivity(events, input) };
}

/** deck.watch on a checkout: waits for the deck folder to move past `since` (a document or comment write), else times out. */
async function deckWatch(deps: RecordDeps, input: { since?: number; timeoutMs?: number }) {
  const revisionNow = await deps.store.revision();
  const since = input.since ?? revisionNow;
  const timeoutMs = Math.min(input.timeoutMs ?? 25_000, 30_000);
  const commentsAt = readIndex(deps.store.dir, deps.deckId).revision;
  const answer = async (timedOut: boolean) => {
    const revision = await deps.store.revision();
    const versions = (await deps.store.listVersions()).filter(
      (version) => version.revision > since,
    );
    return {
      since,
      revision,
      versions,
      comments: [],
      commentsRevision: readIndex(deps.store.dir, deps.deckId).revision,
      timedOut,
    };
  };
  if (revisionNow > since) return answer(false);
  if (timeoutMs === 0) return answer(true);
  return new Promise<Awaited<ReturnType<typeof answer>>>((resolve) => {
    let done = false;
    let stop: (() => void) | undefined;
    const finish = (timedOut: boolean): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stop?.();
      void answer(timedOut).then(resolve);
    };
    const timer = setTimeout(() => finish(true), timeoutMs);
    stop = watchDeck(deps.store.dir, (event) => {
      const revision = event.revision ?? 0;
      const commentsMoved =
        event.files.some((file) => file.startsWith('comments/')) &&
        readIndex(deps.store.dir, deps.deckId).revision !== commentsAt;
      if (revision > since || commentsMoved) finish(false);
    });
  });
}

async function setBackgroundPicture(
  deps: RecordDeps,
  ctx: WriteContext,
  input: {
    slideIds: string[];
    assetId?: string;
    file?: string;
    url?: string;
    upload?: string;
    alt?: string;
    dither?: PictureDither;
    replace?: boolean;
    baseRevision: number;
  },
) {
  let assetId = input.assetId;
  let baseRevision = input.baseRevision;
  if (assetId === undefined) {
    if (deps.addAsset === undefined) {
      throw new TypeError(
        'the file, url and upload forms of slide.setBackgroundPicture run asset.add first, which this transport does not carry; pass assetId',
      );
    }
    const asset = await deps.addAsset(
      {
        ...(input.file !== undefined ? { file: input.file } : {}),
        ...(input.url !== undefined ? { url: input.url } : {}),
        ...(input.upload !== undefined ? { upload: input.upload } : {}),
        alt: input.alt ?? 'A background picture',
        role: 'other',
      },
      ctx,
      baseRevision,
    );
    assetId = asset.id;
    baseRevision = await deps.store.revision();
  }
  return slideSetBackgroundPicture(deps.storeDeps, ctx, {
    slideIds: input.slideIds,
    assetId,
    ...(input.alt !== undefined ? { alt: input.alt } : {}),
    ...(input.dither !== undefined ? { dither: input.dither } : {}),
    ...(input.replace !== undefined ? { replace: input.replace } : {}),
    baseRevision,
  });
}

async function setBackgroundMaterial(
  deps: RecordDeps,
  ctx: WriteContext,
  input: {
    slideIds: string[];
    materialId: string;
    preset?: string;
    uniforms?: Record<string, unknown>;
    anchor?: number;
    dither?: PictureDither;
    baseRevision: number;
  },
) {
  if (deps.captureMaterial === undefined) {
    throw new TypeError(
      'slide.setBackgroundMaterial captures a frame through material.capture, which this transport does not carry (docs/gslides-parity/SPEC-3.md 10.5)',
    );
  }
  const frame = await deps.captureMaterial(
    {
      materialId: input.materialId,
      ...(input.preset !== undefined ? { preset: input.preset } : {}),
      ...(input.uniforms !== undefined ? { uniforms: input.uniforms } : {}),
      ...(input.anchor !== undefined ? { anchor: input.anchor } : {}),
    },
    ctx,
    input.baseRevision,
  );
  return slideSetBackgroundPicture(deps.storeDeps, ctx, {
    slideIds: input.slideIds,
    assetId: frame.id,
    ...(input.dither !== undefined ? { dither: input.dither } : {}),
    baseRevision: await deps.store.revision(),
  });
}

/** Maps a comment reducer refusal to the transports' classes on the way out. */
function comments<T>(run: (deps: CommentsDeps) => Promise<T>): (deps: RecordDeps) => Promise<T> {
  return async (deps) => {
    try {
      return await run(await commentsDeps(deps));
    } catch (error) {
      throw mapCommentError(error);
    }
  };
}

/** Registers every record action on a dispatcher; inputs arrive validated by the action's schema. */
export function registerRecordActions(dispatcher: Dispatcher, deps: RecordDeps): void {
  const on = <T>(
    run: (input: T, ctx: ActionContext) => Promise<unknown> | unknown,
  ): ActionHandler => {
    return (input, ctx) => run(input as T, ctx);
  };
  const access = () => accessDeps(deps);

  // comments (SPEC-3 5.9)
  dispatcher.register(
    'comment.add',
    on<{ anchor: CommentAnchor; body: CommentBody; assignee?: Mention }>((i) =>
      comments((d) => commentAdd(d, i))(deps),
    ),
  );
  dispatcher.register(
    'comment.reply',
    on<{ threadId: string; body: CommentBody }>((i) => comments((d) => commentReply(d, i))(deps)),
  );
  dispatcher.register(
    'comment.edit',
    on<{ threadId: string; commentId: string; body: CommentBody; expectedUpdatedAt: string }>((i) =>
      comments((d) => commentEdit(d, i))(deps),
    ),
  );
  dispatcher.register(
    'comment.delete',
    on<{ threadId: string; commentId: string; restore?: boolean }>((i) =>
      comments((d) => commentDelete(d, i))(deps),
    ),
  );
  dispatcher.register(
    'comment.resolve',
    on<{ threadId: string }>((i) => comments((d) => commentResolve(d, i))(deps)),
  );
  dispatcher.register(
    'comment.reopen',
    on<{ threadId: string }>((i) => comments((d) => commentReopen(d, i))(deps)),
  );
  dispatcher.register(
    'comment.assign',
    on<{ threadId: string; assignee: Mention | null }>((i) =>
      comments((d) => commentAssign(d, i))(deps),
    ),
  );
  dispatcher.register(
    'comment.done',
    on<{ threadId: string }>((i) => comments((d) => commentDone(d, i))(deps)),
  );
  dispatcher.register(
    'comment.react',
    on<{ threadId: string; commentId: string; emoji: Emoji; on: boolean }>((i) =>
      comments((d) => commentReact(d, i))(deps),
    ),
  );
  dispatcher.register(
    'comment.list',
    on<Parameters<typeof commentList>[1]>((i) => comments((d) => commentList(d, i))(deps)),
  );
  dispatcher.register(
    'comment.get',
    on<{ threadId: string }>((i) => comments((d) => commentGet(d, i))(deps)),
  );
  dispatcher.register(
    'comment.link',
    on<{ threadId: string }>((i) => comments(async (d) => commentLink(d, i))(deps)),
  );

  // notifications and activity (SPEC-3 5.5, 5.7)
  dispatcher.register(
    'notification.list',
    on<{ unread?: boolean; since?: string; limit?: number }>((i) =>
      listNotifications(readInbox(deps.stateDir, deps.caller.principalId), i),
    ),
  );
  dispatcher.register(
    'notification.markRead',
    on<{ ids?: string[]; all?: true }>((i) =>
      markRead(deps.stateDir, deps.caller.principalId, i, nowOf(deps)),
    ),
  );
  dispatcher.register(
    'notification.settings',
    on<{ level?: 'all' | 'forYou' | 'none'; email?: boolean; activityForCommenters?: boolean }>(
      async (i) => {
        if (
          i.level === undefined &&
          i.email === undefined &&
          i.activityForCommenters === undefined
        ) {
          return settingsFor(readInbox(deps.stateDir, deps.caller.principalId), deps.deckId);
        }
        if (
          i.activityForCommenters !== undefined &&
          !(await capabilitiesNow(deps)).has('settings')
        ) {
          throw new TypeError('only the owner decides whether commenters read the Activity panel');
        }
        return writeSettings(deps.stateDir, deps.caller.principalId, deps.deckId, i);
      },
    ),
  );
  dispatcher.register(
    'activity.list',
    on<{ since?: string; kinds?: ActivityKind[]; limit?: number }>((i) => activityList(deps, i)),
  );

  // sharing and publishing (SPEC-3 6.9)
  dispatcher.register(
    'share.get',
    on<{ id: string }>(() => shareGet(access())),
  );
  dispatcher.register(
    'share.setGeneralAccess',
    on<{ mode: 'restricted' | 'link'; role?: GrantRole; baseRevision: number }>((i) =>
      shareSetGeneralAccess(access(), i),
    ),
  );
  dispatcher.register(
    'share.createLink',
    on<{ role: GrantRole; label?: string; expiresAt?: string; baseRevision: number }>((i) =>
      shareCreateLink(access(), i),
    ),
  );
  dispatcher.register(
    'share.revokeLink',
    on<{ linkId: string; baseRevision: number }>((i) => shareRevokeLink(access(), i)),
  );
  dispatcher.register(
    'share.rotateLink',
    on<{ linkId: string; baseRevision: number }>((i) => shareRotateLink(access(), i)),
  );
  dispatcher.register(
    'share.stop',
    on<{ baseRevision: number }>((i) => shareStop(access(), i)),
  );
  dispatcher.register(
    'share.invite',
    on<{
      emails: string[];
      role: GrantRole;
      message?: string;
      notify?: boolean;
      baseRevision: number;
    }>((i) => shareInvite(access(), i)),
  );
  dispatcher.register(
    'share.setRole',
    on<{ who: GrantWho; role: GrantRole; baseRevision: number }>((i) => shareSetRole(access(), i)),
  );
  dispatcher.register(
    'share.remove',
    on<{ who: GrantWho; baseRevision: number }>((i) => shareRemove(access(), i)),
  );
  dispatcher.register(
    'share.setExpiry',
    on<{ who: GrantWho; expiresAt: string | null; baseRevision: number }>((i) =>
      shareSetExpiry(access(), i),
    ),
  );
  dispatcher.register(
    'share.settings',
    on<Parameters<typeof shareSettings>[1]>((i) => shareSettings(access(), i)),
  );
  dispatcher.register(
    'share.requestAccess',
    on<{ role: GrantRole; message?: string; email?: string }>((i) =>
      shareRequestAccess(access(), i),
    ),
  );
  dispatcher.register(
    'share.listRequests',
    on<{ id: string }>(() => shareListRequests(access())),
  );
  dispatcher.register(
    'share.respond',
    on<{ requestId: string; grant: GrantRole | null; notify?: boolean; baseRevision: number }>(
      (i) => shareRespond(access(), i),
    ),
  );
  dispatcher.register(
    'share.transferOwnership',
    on<{ to: GrantWho; baseRevision: number }>((i) => shareTransferOwnership(access(), i)),
  );
  dispatcher.register(
    'share.acceptOwnership',
    on<{ baseRevision: number }>((i) => shareAcceptOwnership(access(), i)),
  );
  dispatcher.register(
    'share.declineOwnership',
    on<{ baseRevision: number }>((i) => shareDeclineOwnership(access(), i)),
  );
  dispatcher.register(
    'share.claim',
    on<{ baseRevision: number }>((i) => shareClaim(access(), i)),
  );
  dispatcher.register('share.emailCollaborators', () => shareEmailCollaborators());
  dispatcher.register(
    'deck.publish',
    on<{ baseRevision: number }>((i) => deckPublish(access(), i)),
  );
  dispatcher.register(
    'deck.unpublish',
    on<{ baseRevision: number }>((i) => deckUnpublish(access(), i)),
  );

  // accounts and admin on a checkout (SPEC-3 7.9)
  dispatcher.register('account.me', () => accountMe(deps));
  dispatcher.register(
    'account.setName',
    on<{ name: string }>((i) => accountSetName(deps, i)),
  );
  dispatcher.register(
    'account.setAvatar',
    on<{ variant: AvatarVariant; initials?: string; salt?: number; picture?: string }>((i) =>
      accountSetAvatar(deps, i),
    ),
  );
  dispatcher.register(
    'account.decks',
    on<{ view: 'owned' | 'shared' | 'recent' | 'trash' | 'all' }>((i) => accountDecks(deps, i)),
  );
  dispatcher.register(
    'admin.flag',
    on<{ name: FlagName; on?: boolean }>((i) =>
      i.on === undefined ? readFlag(deps.stateDir, i.name) : writeFlag(deps.stateDir, i.name, i.on),
    ),
  );
  dispatcher.register(
    'admin.assignOwner',
    on<{ to: GrantWho; baseRevision: number }>((i) => adminAssignOwner(access(), i)),
  );

  // presence and sync reads (SPEC-3 3.10, 4.11)
  dispatcher.register('presence.list', () => presenceList(presenceDeps(deps)));
  dispatcher.register('presence.follow', () => presenceFollow());
  dispatcher.register('presence.unfollow', () => presenceUnfollow());
  dispatcher.register(
    'presence.pointer',
    on<{ on: boolean }>((i) => presencePointer(presenceDeps(deps), i)),
  );
  dispatcher.register('sync.status', () => syncStatus(presenceDeps(deps)));
  dispatcher.register(
    'deck.watch',
    on<{ since?: number; timeoutMs?: number }>((i) => deckWatch(deps, i)),
  );

  // the background picture and material (SPEC-3 10.5)
  dispatcher.register(
    'slide.setBackgroundPicture',
    on<Parameters<typeof setBackgroundPicture>[2]>((i, c) => setBackgroundPicture(deps, c, i)),
  );
  dispatcher.register(
    'slide.setBackgroundMaterial',
    on<Parameters<typeof setBackgroundMaterial>[2]>((i, c) => setBackgroundMaterial(deps, c, i)),
  );
}

/** True when the deck folder has a comments sidecar or an access record, for the MCP resource list. */
export function hasSideRecords(deckDir: string): boolean {
  return (
    existsSync(join(deckDir, 'comments')) || existsSync(join(deckDir, '.turboslide', 'access.json'))
  );
}
