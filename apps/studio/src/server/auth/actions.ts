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
import type { DeckHead } from '@turboslide/store/templates';

import { openDeckStore } from '../root';
import { fileAvatarStore, pictureUrl, setPictureAvatar } from './avatar.ts';
import type { AvatarStore } from './avatar.ts';
import { deckIndexFor, identityRuntime, identityViewFor } from './identity.ts';
import type { DeckIndexView, IdentityRuntime, RequestIdentity } from './identity.ts';
import { ANON_COOKIE, sealPrincipalCookie, serializeAnonymousCookie } from './session.ts';
import type { ApiKeyRecord } from './tokens.ts';

export type ActionRequestFacts = {
  identity: RequestIdentity;
  /** The request, for the library calls that read the session cookie (sessions, sign out). */
  request?: Request;
  /** The deck the transport runs the action on, for per deck name uniqueness (0.19). */
  deckId?: string;
  /** Sets a header on the transport's response (Forget this browser's cookie, 7.4). */
  setHeader?: (name: string, value: string) => void;
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
export const AVATAR_USERS_DIR = 'users';

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

export function registerAccountActions(dispatcher: Dispatcher, deps: AccountActionDeps): void {
  const runtime = (): IdentityRuntime => deps.runtime ?? identityRuntime();
  const now = deps.now ?? (() => new Date());
  const avatarStore =
    deps.avatarStore ?? (() => fileAvatarStore(`${runtime().stateDir}/${AVATAR_USERS_DIR}`));
  const namesInUse = deps.namesInUse ?? namesInVersionLog;

  const recordOf = async (identity: RequestIdentity): Promise<PrincipalRecord> => {
    if (!isRecordKind(identity)) throw new TypeError(NOT_SIGNED_IN);
    return (
      identity.record ??
      (await runtime().principals.touch(identity.principalId, now(), true)) ??
      newPrincipalRecord(identity.principalId, now())
    );
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
    const record = await recordOf(facts.identity);
    const taken = await namesInUse(facts.deckId, facts.identity.principalId);
    const result = normalizeName(name, { taken });
    if (!result.ok) throw new TypeError(result.message);
    await rt.principals.put({ ...record, name: result.name, lastSeenAt: now().toISOString() });
    if (facts.identity.principalId !== null) {
      /* the name onto the principal's deck index, the carrier every instance reads (b1.md R17),
         and out of this instance's identity cache, so the next presence post resolves the new
         record at once (R18); a refused index write leaves the record's name standing */
      const principalId = facts.identity.principalId;
      const [access, room] = await Promise.all([import('../access'), import('../room')]);
      await access.noteDisplayName(principalId, result.name).catch(() => undefined);
      room.forgetIdentity(principalId);
    }
    if (facts.identity.kind === 'account' && facts.identity.account !== null && rt.db !== null)
      await rt.db.db
        .updateTable('user')
        .set({ name: result.name, updatedAt: now().toISOString() })
        .where('id', '=', facts.identity.account.userId)
        .execute();
    const next = { ...facts.identity, record: { ...record, name: result.name } };
    return meOf(rt, next);
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
    const record = await recordOf(facts.identity);
    let choice: AvatarChoice;
    if (variant === 'picture') {
      if (picture === undefined) throw new TypeError('picture is required for the picture variant');
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
    } else {
      choice = { variant };
      if (initials !== undefined && initials.trim() !== '') choice.initials = initials.trim();
      if (salt !== undefined) choice.salt = salt;
      await rt.principals.put({ ...record, avatar: choice, lastSeenAt: now().toISOString() });
      if (facts.identity.kind === 'account' && facts.identity.account !== null) {
        const profile = await rt.profiles.get(facts.identity.account.userId);
        await rt.profiles.setAvatar(facts.identity.account.userId, choice, null, now());
        if (profile?.avatarKey) await avatarStore().removeKey(profile.avatarKey);
      }
    }
    return meOf(rt, { ...facts.identity, record: { ...record, avatar: choice } });
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
      try {
        const response = await rt.auth.api.signOut({ headers: request.headers, asResponse: true });
        for (const line of response.headers.getSetCookie()) facts.setHeader?.('set-cookie', line);
      } catch {
        await rt.auth.api.revokeSession({
          body: { token: target.token },
          headers: request.headers,
        });
      }
      return { signedOut: 1 };
    }
    await rt.auth.api.revokeSession({ body: { token: target.token }, headers: request.headers });
    return { signedOut: 1 };
  });

  dispatcher.register('account.forget', async () => {
    const facts = await deps.facts();
    const rt = runtime();
    const principalId = anonymousPrincipalId(crypto.randomUUID());
    const record = newPrincipalRecord(principalId, now());
    await rt.principals.put(record);
    const value = await sealPrincipalCookie(principalId, rt.secret, now().getTime());
    const name = facts.secure === false ? 'ts_id' : ANON_COOKIE;
    facts.setHeader?.('set-cookie', serializeAnonymousCookie(name, value));
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
