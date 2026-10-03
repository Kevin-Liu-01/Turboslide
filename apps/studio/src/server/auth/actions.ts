// The account and admin actions, server side (gslides-parity SPEC-3 7.9, 12; MILESTONES-3 B3
// day 5): `account.me`, `account.setName`, `account.setAvatar`, `account.sessions`,
// `account.signOut`, `account.forget`, `account.decks`, `account.tokens.create`, `.list`,
// `.revoke`, `admin.bootstrap` and `admin.mail.list`, registered on the dispatcher every transport
// runs (`registerAccountActions`, `registerAdminActions`; B4's deckDispatcher calls them, b3.md
// request). The handlers know nothing of a transport: `deps.facts()` answers who is calling
// (`requestIdentity` of the request, or the checkout's holder on stdio) and how to set a response
// header (Forget this browser's cookie). Every answer is validated by the dispatcher against the
// action's output schema, so the shapes here are the ones section 12 declares.
import type { Dispatcher } from '@turboslide/agent/dispatch';
import { anonymousPrincipalId } from '@turboslide/identity/ids';
import { matchesLabelGrammar } from '@turboslide/identity/labels';
import { NAME_REFUSALS, normalizeName } from '@turboslide/identity/names';
import type { AvatarChoice, AvatarVariant, PrincipalRecord } from '@turboslide/identity/principal';
import { newPrincipalRecord } from '@turboslide/identity/principal';
import type { Scope } from '@turboslide/schema/access';
import { isActionId } from '@turboslide/schema/actions';
import type { IndexAvatarChoice } from '@turboslide/store/hosted';
import type { DeckHead } from '@turboslide/store/templates';

import { openDeckStore } from '../root';
import {
  AVATAR_MAX_DATA_URL_LENGTH,
  AVATAR_SWEEP_NEEDS_DATABASE,
  AVATAR_TOO_LARGE,
  AVATAR_USERS_DIR,
  AvatarRefusal,
  fileAvatarStore,
  pictureUrl,
  setPictureAvatar,
  sweepOrphanAvatars,
} from './avatar.ts';
import type { AvatarStore } from './avatar.ts';
import { deckIndexFor, forgetAccountFacts, identityRuntime, identityViewFor } from './identity.ts';
import type { AccountFacts, DeckIndexView, IdentityRuntime, RequestIdentity } from './identity.ts';
import { ANON_COOKIE, sealPrincipalCookie, serializeAnonymousCookie } from './session.ts';
import type { ApiKeyRecord } from './tokens.ts';

export type ActionRequestFacts = {
  identity: RequestIdentity;
  /** The request, for the library calls that read the session cookie (sessions, sign out). */
  request?: Request;
  /** The deck the transport runs the action on, for per deck name uniqueness (0.19). */
  deckId?: string;
  /**
   * Sets a header on the transport's response (Forget this browser's cookie, 7.4). A list sets
   * every value at once: the cookies of a sign out (the library's cleared session cookies and the
   * fresh anonymous cookie) are several `set-cookie` lines, and one value at a time replaces the
   * last (docs/NEXT.md 3.2 H3).
   */
  setHeader?: (name: string, value: string | string[]) => void;
  /** Whether the request arrived over https or localhost, for the cookie's name. */
  secure?: boolean;
};

export type AccountActionDeps = {
  runtime?: IdentityRuntime;
  facts: () => Promise<ActionRequestFacts>;
  /** Where picture files go; the checkout's folder by default. */
  avatarStore?: () => AvatarStore;
  /** The names held in the presentation (the owner, the roster, the version log); the default reads the version log. */
  namesInUse?: (deckId: string | undefined, callerId: string | null) => Promise<string[]>;
  now?: () => Date;
};

/** The header Forget this browser sets so the boot script and the room client clear their mirrors. */
export const FORGET_HEADER = 'x-turboslide-forget';
export const SIGN_IN_FOR_KEYS = 'Sign in to create an API key';
export const NOT_SIGNED_IN = 'Not signed in';
export const ADMIN_ONLY = 'This action is the deployment admin’s';
export const CAPTURE_ONLY = 'Captured mail exists only under TURBOSLIDE_MAIL=capture';
/** An API key without the write scope may read its owner's account and not change it. */
export const KEY_SCOPE_FOR_ACCOUNT =
  'This API key cannot change its owner’s name or avatar: it needs the write scope';
/** The id of the janitor's action; registered once the schema header declares it (PEOPLE.md 4.6). */
export const AVATAR_SWEEP_ACTION = 'admin.avatar.sweep';

/**
 * The person an account action changes (docs/archive/rounds/PEOPLE.md 4.7): the anonymous or account principal
 * of the request, or the owner of an API key with the write scope, so `turboslide account
 * avatar --picture` and `account name` through `turboslide login`'s key act on the owner's own
 * record. A checkout's holder, the bootstrap bearer and a refused bearer have no subject.
 */
type Subject = {
  principalId: string;
  account: AccountFacts | null;
  /** True when the subject is an API key's owner, so the answer is the owner's `me`. */
  viaKey: boolean;
};

function subjectOf(identity: RequestIdentity): Subject | null {
  if (
    identity.principalId !== null &&
    (identity.kind === 'anonymous' || identity.kind === 'account')
  )
    return { principalId: identity.principalId, account: identity.account, viaKey: false };
  if (identity.kind === 'agent' && identity.agent !== null && identity.account !== null) {
    if (identity.account.profile.deletedAt !== null) return null;
    const scopes = identity.agent.scopes as readonly string[];
    if (!scopes.includes('write') && !scopes.includes('admin'))
      throw new TypeError(KEY_SCOPE_FOR_ACCOUNT);
    return { principalId: identity.account.principalId, account: identity.account, viaKey: true };
  }
  return null;
}

/** The request identity `meOf` reads for the subject: the owner's account when a key acted for it. */
function identityForSubject(
  identity: RequestIdentity,
  subject: Subject,
  record: PrincipalRecord,
): RequestIdentity {
  if (!subject.viaKey || subject.account === null) return { ...identity, record };
  const account = subject.account;
  return {
    ...identity,
    kind: 'account',
    ctx: {
      principal: {
        id: account.principalId,
        kind: 'account',
        email: account.email,
        admin: account.admin,
      },
      linkGrants: record.linkGrants,
    },
    principalId: account.principalId,
    author: {
      kind: 'human',
      name: account.name.trim() || record.name?.trim() || record.label,
      principalId: account.principalId,
    },
    account,
    agent: null,
    record,
  };
}

type MeAnswer = {
  principal: {
    id: string;
    kind: 'anonymous' | 'account' | 'agent';
    email?: string;
    admin: boolean;
  };
  trust: 'label' | 'guest' | 'verified' | 'agent';
  label: string;
  name?: string;
  mark: Record<string, unknown>;
  avatar: { variant: AvatarVariant; initials?: string; salt?: number; url?: string } | null;
  sessions?: SessionAnswer[];
};

type SessionAnswer = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
  userAgent?: string;
};

type TokenAnswer = {
  tokenId: string;
  name: string;
  scopes: Scope[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
};

function tokenAnswer(record: ApiKeyRecord): TokenAnswer {
  return {
    tokenId: record.id,
    name: record.name,
    scopes: record.scopes,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    lastUsedAt: record.lastUsedAt,
  };
}

/** The avatar choice as `account.me` reports it: the picture as its 64 px URL, never the key. */
export function avatarAnswer(choice: AvatarChoice | null | undefined): MeAnswer['avatar'] {
  if (choice === null || choice === undefined) return null;
  const out: NonNullable<MeAnswer['avatar']> = { variant: choice.variant };
  if (choice.initials !== undefined) out.initials = choice.initials;
  if (choice.salt !== undefined) out.salt = choice.salt;
  const url = pictureUrl(choice, 64);
  if (url !== undefined) out.url = url;
  return out;
}

function isRecordKind(
  identity: RequestIdentity,
): identity is RequestIdentity & { principalId: string } {
  return (
    identity.principalId !== null && (identity.kind === 'anonymous' || identity.kind === 'account')
  );
}

function principalOf(identity: RequestIdentity): MeAnswer['principal'] {
  if (identity.kind === 'agent' && identity.agent !== null)
    return {
      id: identity.principalId ?? `agent:${identity.agent.id}`,
      kind: 'agent',
      admin: identity.ctx.principal?.admin ?? false,
      ...(identity.ctx.principal?.email !== undefined
        ? { email: identity.ctx.principal.email }
        : {}),
    };
  if (identity.kind === 'bootstrap' || identity.kind === 'checkout')
    return { id: `agent:${identity.kind}`, kind: 'agent', admin: true };
  if (identity.kind === 'account' && identity.account !== null)
    return {
      id: identity.account.principalId,
      kind: 'account',
      email: identity.account.email,
      admin: identity.account.admin,
    };
  return {
    id: identity.principalId ?? 'anon_00000000-0000-4000-8000-000000000000',
    kind: 'anonymous',
    admin: false,
  };
}

/** `account.me` (7.9; 11 7.3): the principal, the trust state, the label, the mark, the choice. */
export async function meOf(runtime: IdentityRuntime, identity: RequestIdentity): Promise<MeAnswer> {
  const principal = principalOf(identity);
  const { identity: resolved, mark } = await identityViewFor(runtime, principal.id, {
    self: true,
    showEmail: true,
    ...(identity.agent !== null
      ? {
          agent: {
            name: identity.agent.name,
            ...(identity.ctx.agent?.runId !== undefined ? { runId: identity.ctx.agent.runId } : {}),
          },
        }
      : {}),
  });
  const record =
    identity.record ??
    (isRecordKind(identity) ? await runtime.principals.get(identity.principalId) : null);
  const name = record?.name?.trim();
  const answer: MeAnswer = {
    principal,
    trust: resolved.trust,
    label: resolved.trust === 'label' ? resolved.label : resolved.displayName,
    mark: mark as unknown as Record<string, unknown>,
    avatar:
      identity.kind === 'anonymous' || identity.kind === 'account'
        ? avatarAnswer(record?.avatar ?? resolved.avatar)
        : null,
  };
  if (name !== undefined && name.length > 0) answer.name = name;
  else if (
    identity.kind === 'account' &&
    identity.account !== null &&
    identity.account.name.trim() !== ''
  )
    answer.name = identity.account.name.trim();
  return answer;
}

/** The names the version log of a deck holds, other than the caller's own and the generated labels. */
export async function namesInVersionLog(
  deckId: string | undefined,
  callerId: string | null,
): Promise<string[]> {
  if (deckId === undefined) return [];
  try {
    const store = await openDeckStore(deckId);
    const versions = await store.listVersions();
    const names = new Set<string>();
    for (const version of versions) {
      const author = version.author;
      if (author.kind !== 'human') continue;
      if (author.principalId !== undefined && author.principalId === callerId) continue;
      if (matchesLabelGrammar(author.name) || author.name === 'studio') continue;
      names.add(author.name);
    }
    return [...names];
  } catch {
    return [];
  }
}

const DATA_URL = /^data:(image\/[a-z0-9.+-]+)?(;base64)?,(.*)$/is;

/** The bytes of a data URL; a TypeError for anything else (a path is never taken on the server). */
export function dataUrlBytes(value: string): Uint8Array {
  const match = DATA_URL.exec(value.trim());
  if (match === null) throw new TypeError('picture must be a data URL');
  const payload = match[3] ?? '';
  if (match[2] !== undefined) return new Uint8Array(Buffer.from(payload, 'base64'));
  return new TextEncoder().encode(decodeURIComponent(payload));
}

async function sessionsOf(
  runtime: IdentityRuntime,
  facts: ActionRequestFacts,
): Promise<SessionAnswer[]> {
  const { identity, request } = facts;
  if (runtime.auth === null || identity.kind !== 'account' || request === undefined) return [];
  const listed = (await runtime.auth.api.listSessions({ headers: request.headers })) as {
    id: string;
    createdAt: Date | string;
    updatedAt: Date | string;
    userAgent?: string | null;
  }[];
  return listed.map((session) => ({
    id: session.id,
    createdAt: new Date(session.createdAt).toISOString(),
    lastSeenAt: new Date(session.updatedAt).toISOString(),
    current: session.id === identity.session?.id,
    ...(session.userAgent ? { userAgent: session.userAgent } : {}),
  }));
}

function requireAdmin(identity: RequestIdentity): void {
  const admin =
    identity.kind === 'bootstrap' ||
    identity.kind === 'checkout' ||
    (identity.kind === 'account' && identity.account?.admin === true) ||
    (identity.kind === 'agent' &&
      identity.ctx.principal?.admin === true &&
      identity.ctx.agent?.scopes.includes('admin') === true);
  if (!admin) throw new TypeError(ADMIN_ONLY);
}

function newUserId(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(24)))
    .toString('base64url')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 32)
    .padEnd(32, 'x');
}

/** Finds or creates the user row of an address, the way the library would name it. */
export async function ensureUserByEmail(
  runtime: IdentityRuntime,
  email: string,
  now: Date = new Date(),
): Promise<{ id: string; created: boolean }> {
  if (runtime.db === null) throw new RangeError('accounts need a database on this deployment');
  await runtime.ready;
  const lower = email.trim().toLowerCase();
  const existing = await runtime.db.db
    .selectFrom('user')
    .select('id')
    .where('email', '=', lower)
    .executeTakeFirst();
  if (existing !== undefined) return { id: existing.id, created: false };
  const id = newUserId();
  const stamp = now.toISOString();
  await runtime.db.db
    .insertInto('user')
    .values({
      id,
      name: '',
      email: lower,
      emailVerified: 1,
      image: null,
      createdAt: stamp,
      updatedAt: stamp,
    })
    .execute();
  return { id, created: true };
}

/**
 * A fresh anonymous principal for this browser (SPEC-3 7.4): its record and the sealed cookie's
 * `set-cookie` line. Forget this browser sets it, and since docs/NEXT.md 3.2 H3 so does the sign
 * out of this browser's own session, so a signed out browser reads as a new label to itself and
 * to others; the anonymous id it held before stays linked to the account, and the edits made
 * under it keep the account's name.
 */
async function freshAnonymousCookie(
  rt: IdentityRuntime,
  facts: ActionRequestFacts,
  at: Date,
): Promise<{ principalId: string; cookie: string }> {
  const principalId = anonymousPrincipalId(crypto.randomUUID());
  await rt.principals.put(newPrincipalRecord(principalId, at));
  const value = await sealPrincipalCookie(principalId, rt.secret, at.getTime());
  const name = facts.secure === false ? 'ts_id' : ANON_COOKIE;
  return { principalId, cookie: serializeAnonymousCookie(name, value) };
}

export function registerAccountActions(dispatcher: Dispatcher, deps: AccountActionDeps): void {
  const runtime = (): IdentityRuntime => deps.runtime ?? identityRuntime();
  const now = deps.now ?? (() => new Date());
  const avatarStore =
    deps.avatarStore ?? (() => fileAvatarStore(`${runtime().stateDir}/${AVATAR_USERS_DIR}`));
  const namesInUse = deps.namesInUse ?? namesInVersionLog;

  const recordOf = async (
    identity: RequestIdentity,
  ): Promise<{ subject: Subject; record: PrincipalRecord }> => {
    const subject = subjectOf(identity);
    if (subject === null) throw new TypeError(NOT_SIGNED_IN);
    const record =
      (!subject.viaKey ? identity.record : null) ??
      (await runtime().principals.touch(subject.principalId, now(), true)) ??
      newPrincipalRecord(subject.principalId, now());
    return { subject, record };
  };

  /* the choice and the name out of this instance's identity cache, so the next presence post
     resolves the new record at once (b1.md R18), and onto the principal's deck index, the
     carrier every instance reads (R17; PEOPLE.md 3.13): a refused index write leaves the record
     standing. The account's cached session facts leave too (identity.ts `accountSession`, the D1
     engine's 300 s cache; docs/CLOUDFLARE.md 4.1), so a renamed account reads its new name on the
     next request of this instance */
  const propagate = async (
    principalId: string,
    write: (access: typeof import('../access')) => Promise<void>,
  ): Promise<void> => {
    const [access, room] = await Promise.all([import('../access'), import('../room')]);
    await write(access).catch(() => undefined);
    forgetAccountFacts(principalId, runtime());
    room.forgetIdentity(principalId);
  };

  dispatcher.register('account.me', async () => {
    const facts = await deps.facts();
    const me = await meOf(runtime(), facts.identity);
    if (facts.identity.kind === 'account') me.sessions = await sessionsOf(runtime(), facts);
    return me;
  });

  dispatcher.register('account.setName', async (input) => {
    const { name } = input as { name: string };
    const facts = await deps.facts();
    const rt = runtime();
    const { subject, record } = await recordOf(facts.identity);
    const taken = await namesInUse(facts.deckId, subject.principalId);
    const result = normalizeName(name, { taken });
    if (!result.ok) throw new TypeError(result.message);
    await rt.principals.put({ ...record, name: result.name, lastSeenAt: now().toISOString() });
    await propagate(subject.principalId, (access) =>
      access.noteDisplayName(subject.principalId, result.name),
    );
    if (subject.account !== null && rt.db !== null)
      await rt.db.db
        .updateTable('user')
        .set({ name: result.name, updatedAt: now().toISOString() })
        .where('id', '=', subject.account.userId)
        .execute();
    return meOf(rt, identityForSubject(facts.identity, subject, { ...record, name: result.name }));
  });

  dispatcher.register('account.setAvatar', async (input) => {
    const { variant, initials, salt, picture } = input as {
      variant: AvatarVariant;
      initials?: string;
      salt?: number;
      picture?: string;
    };
    const facts = await deps.facts();
    const rt = runtime();
    const { subject, record } = await recordOf(facts.identity);
    let choice: AvatarChoice;
    if (variant === 'picture') {
      if (picture === undefined) throw new TypeError('picture is required for the picture variant');
      // the cap on the string before Buffer.from, so an oversized body is refused undecoded (4.2)
      if (picture.length > AVATAR_MAX_DATA_URL_LENGTH) throw new AvatarRefusal(AVATAR_TOO_LARGE);
      choice = await setPictureAvatar(
        {
          store: avatarStore(),
          profiles: rt.profiles,
          principals: rt.principals,
          quotas: rt.quotas,
          now,
        },
        record.principalId,
        dataUrlBytes(picture),
      );
      // a picture is never carried on the index: it needs an account, which needs the database
      await propagate(subject.principalId, (access) =>
        access.noteAvatarChoice(subject.principalId, null),
      );
    } else {
      const plain: IndexAvatarChoice = { variant };
      if (initials !== undefined && initials.trim() !== '') plain.initials = initials.trim();
      if (salt !== undefined) plain.salt = salt;
      choice = plain;
      await rt.principals.put({ ...record, avatar: choice, lastSeenAt: now().toISOString() });
      if (subject.account !== null) {
        const profile = await rt.profiles.get(subject.account.userId);
        await rt.profiles.setAvatar(subject.account.userId, choice, null, now());
        if (profile?.avatarKey) await avatarStore().removeKey(profile.avatarKey);
      }
      await propagate(subject.principalId, (access) =>
        access.noteAvatarChoice(subject.principalId, plain),
      );
    }
    return meOf(rt, identityForSubject(facts.identity, subject, { ...record, avatar: choice }));
  });

  dispatcher.register('account.sessions', async () => {
    const facts = await deps.facts();
    return { sessions: await sessionsOf(runtime(), facts) };
  });

  dispatcher.register('account.signOut', async (input) => {
    const { sessionId, all } = input as { sessionId?: string; all?: true };
    const facts = await deps.facts();
    const rt = runtime();
    const { identity, request } = facts;
    if (rt.auth === null || identity.kind !== 'account' || request === undefined)
      return { signedOut: 0 };
    /* a revoked session must not answer from the facts cache for the rest of its 300 s */
    if (identity.principalId !== null) forgetAccountFacts(identity.principalId, rt);
    const listed = (await rt.auth.api.listSessions({ headers: request.headers })) as {
      id: string;
      token: string;
    }[];
    if (all === true) {
      await rt.auth.api.revokeOtherSessions({ headers: request.headers });
      return { signedOut: Math.max(0, listed.length - 1) };
    }
    const target = listed.find((session) => session.id === sessionId);
    if (target === undefined) return { signedOut: 0 };
    if (target.id === identity.session?.id) {
      const cookies: string[] = [];
      try {
        const response = await rt.auth.api.signOut({ headers: request.headers, asResponse: true });
        cookies.push(...response.headers.getSetCookie());
      } catch {
        await rt.auth.api.revokeSession({
          body: { token: target.token },
          headers: request.headers,
        });
      }
      /* the browser leaves as a new anonymous principal (audit-auth finding 3: the old id is
         aliased to the account, so a browser that kept it rendered as the account with the
         badge); every cookie line goes in one call */
      cookies.push((await freshAnonymousCookie(rt, facts, now())).cookie);
      facts.setHeader?.('set-cookie', cookies);
      return { signedOut: 1 };
    }
    await rt.auth.api.revokeSession({ body: { token: target.token }, headers: request.headers });
    return { signedOut: 1 };
  });

  dispatcher.register('account.forget', async () => {
    const facts = await deps.facts();
    const { principalId, cookie } = await freshAnonymousCookie(runtime(), facts, now());
    facts.setHeader?.('set-cookie', cookie);
    facts.setHeader?.(FORGET_HEADER, '1');
    return { principalId };
  });

  dispatcher.register('account.decks', async (input) => {
    const { view } = input as { view: DeckIndexView };
    const facts = await deps.facts();
    const rt = runtime();
    const callerId = facts.identity.principalId;
    if (view === 'all') requireAdmin(facts.identity);
    const heads = await deckIndexFor(
      rt,
      callerId ?? 'anon_00000000-0000-4000-8000-000000000000',
      view,
    );
    return heads.map((head: DeckHead & { owner?: string | null; role?: string }) =>
      rt.hooks.deckIndex !== null
        ? head
        : rt.hosted
          ? { ...head, owner: null }
          : { ...head, owner: callerId, role: 'owner' as const },
    );
  });

  dispatcher.register('account.tokens.create', async (input) => {
    const { name, scopes, expiresAt } = input as {
      name: string;
      scopes: Scope[];
      expiresAt?: string;
    };
    const facts = await deps.facts();
    const { identity } = facts;
    if (identity.kind !== 'account' || identity.account === null)
      throw new TypeError(SIGN_IN_FOR_KEYS);
    const { record, secret } = await runtime().keys.create({
      userId: identity.account.userId,
      name,
      scopes,
      expiresAt: expiresAt ?? null,
      now: now(),
    });
    return { token: tokenAnswer(record), secret };
  });

  dispatcher.register('account.tokens.list', async () => {
    const facts = await deps.facts();
    const { identity } = facts;
    const userId =
      identity.kind === 'account'
        ? identity.account?.userId
        : identity.kind === 'agent'
          ? identity.agent?.userId
          : undefined;
    if (userId === undefined) return { tokens: [] };
    return { tokens: (await runtime().keys.list(userId)).map(tokenAnswer) };
  });

  dispatcher.register('account.tokens.revoke', async (input) => {
    const { tokenId } = input as { tokenId: string };
    const facts = await deps.facts();
    const { identity } = facts;
    const rt = runtime();
    const owner =
      identity.kind === 'account'
        ? identity.account?.userId
        : identity.kind === 'agent'
          ? identity.agent?.userId
          : undefined;
    const revoked =
      identity.kind === 'bootstrap' ||
      identity.kind === 'checkout' ||
      identity.account?.admin === true
        ? await rt.keys.revoke(tokenId, undefined, now())
        : owner === undefined
          ? null
          : await rt.keys.revoke(tokenId, owner, now());
    if (revoked === null) throw new RangeError(`no API key ${tokenId} of yours`);
    const sessionsClosed =
      rt.hooks.closeAgentSessions !== null ? await rt.hooks.closeAgentSessions(tokenId) : 0;
    return { tokenId, revoked: true as const, sessionsClosed };
  });
}

export function registerAdminActions(dispatcher: Dispatcher, deps: AccountActionDeps): void {
  const runtime = (): IdentityRuntime => deps.runtime ?? identityRuntime();
  const now = deps.now ?? (() => new Date());
  const avatarStore =
    deps.avatarStore ?? (() => fileAvatarStore(`${runtime().stateDir}/${AVATAR_USERS_DIR}`));

  /* the janitor for orphan files under u/ (PEOPLE.md 4.6): the admin group, HTTP and CLI; the id
     is registered once the schema header declares it (the integrator's, by b4.md's request) */
  if (isActionId(AVATAR_SWEEP_ACTION))
    dispatcher.register(AVATAR_SWEEP_ACTION, async (input) => {
      const { dryRun } = input as { dryRun?: boolean };
      const facts = await deps.facts();
      requireAdmin(facts.identity);
      const rt = runtime();
      if (rt.db === null) throw new RangeError(AVATAR_SWEEP_NEEDS_DATABASE);
      return sweepOrphanAvatars(avatarStore(), rt.profiles, {
        dryRun: dryRun ?? false,
        now,
      });
    });

  dispatcher.register('admin.bootstrap', async (input) => {
    const { email } = input as { email: string };
    const facts = await deps.facts();
    requireAdmin(facts.identity);
    const rt = runtime();
    const { id } = await ensureUserByEmail(rt, email, now());
    await rt.profiles.setAdmin(id, true, now());
    const { secret } = await rt.keys.create({
      userId: id,
      name: 'bootstrap',
      scopes: ['admin'],
      now: now(),
    });
    await rt.principals.touch(`usr_${id}`, now(), true);
    return { principalId: `usr_${id}`, tokenOnce: secret };
  });

  dispatcher.register('admin.mail.list', async (input) => {
    const { since, limit } = input as { since?: string; limit?: number };
    const facts = await deps.facts();
    requireAdmin(facts.identity);
    const rt = runtime();
    if (rt.mailer.mode !== 'capture') throw new RangeError(CAPTURE_ONLY);
    const mail = await rt.mailer.list({
      ...(since !== undefined ? { since } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
    return {
      mail: mail.map((m) => ({
        id: m.id,
        to: m.to,
        subject: m.subject,
        text: m.text,
        ...(m.html !== undefined ? { html: m.html } : {}),
        kind: m.kind,
        sentAt: m.createdAt,
      })),
    };
  });
}

export { NAME_REFUSALS };
