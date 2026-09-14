// The identity runtime of one studio process (gslides-parity SPEC-3 2.4, 6.2, 7; MILESTONES-3
// B3 days 3 to 5): one composition of the stores of this folder, built from the environment
// alone and kept on globalThis so the dev server's module reloads keep the open database, and
// the one function every route and server function calls to learn who is asking:
// `requestIdentity(request)` turns the bearer, the account session and the anonymous cookie into
// the `AuthContext` `decide()` reads, the `Author` the store writes, and the facts the account
// surfaces show. The rules, in order:
//
//   1. A bearer: an API key record acts for its owner with its scopes (0.23); the static token
//      is the bootstrap admin (every action while no key exists, `admin.bootstrap` alone after);
//      the per checkout token is the checkout's holder; an unknown key is refused. The author is
//      the record's registered name and `agent:<tokenId>`, the header's run id kept (8.2).
//   2. A sign in session (better-auth): the account principal `usr_<id>` with its address and the
//      admin flag; the anonymous cookie beside it is linked to the account if it is not yet (7.4).
//   3. The anonymous cookie: `anon_<uuid>` with its record's typed name or label.
//   4. Nothing: a fresh anonymous principal is minted and the cookie handed back to set.
//
// The seams other builders bind (`bindIdentityHooks`): the index and inbox merge on a link, the
// invitation binding, the deck index, the share link lookup, the MCP session close on a revoke.
// Every default is the honest local reading (the store's own decks, no link found).
import type { Author } from '@turboslide/schema/mutations';
import type { DeckHead } from '@turboslide/store/templates';
import type { GrantRole } from '@turboslide/schema/access';
import { Resend } from 'resend';

import type { AgentContext, AuthContext, LinkGrant, Principal } from '@turboslide/identity/access';
import { accountPrincipalId, agentPrincipalId, parsePrincipalId } from '@turboslide/identity/ids';
import { labelFor } from '@turboslide/identity/labels';
import type { HueSlot } from '@turboslide/identity/hues';
import { markSpec } from '@turboslide/identity/marks';
import type { MarkSpec } from '@turboslide/identity/marks';
import type { PrincipalRecord, PrincipalStore } from '@turboslide/identity/principal';
import { newPrincipalRecord } from '@turboslide/identity/principal';
import { resolvePrincipal, sanitizeRunId, toIdentityView } from '@turboslide/identity/resolve';
import type {
  AccountProfile,
  IdentityView,
  ResolvedIdentity,
  TokenProfile,
} from '@turboslide/identity/resolve';
import { bearerToken, requestRunId } from '@turboslide/agent/http/auth';

import { ensureDecks, isHosted, repoRoot, stateDir } from '../root';
import { dbAliasStore, memoryAliasStore, mergePrincipalRecords } from './alias.ts';
import type { AliasStore } from './alias.ts';
import {
  createAuth,
  isFreshSession,
  migrateBetterAuth,
  sessionOf,
  signInMethods,
} from './better-auth.ts';
import type { SignInMethods, TurboslideAuth } from './better-auth.ts';
import { migrateAuthDb, openAuthDb, selectAuthDb } from './db.ts';
import type { AuthDb, AuthDbSelection } from './db.ts';
import {
  dbCaptureStore,
  fileCaptureStore,
  memoryCaptureStore,
  selectMail,
  selectMailer,
} from './mail/mailer.ts';
import type { CaptureStore, MailMode, Mailer } from './mail/mailer.ts';
import { selectPrincipalStore } from './principal.ts';
import { adminEmails, dbProfileStore, memoryProfileStore } from './profile.ts';
import type { Profile, ProfileStore } from './profile.ts';
import { dbQuotaStore, memoryQuotaStore } from './quota.ts';
import type { QuotaStore } from './quota.ts';
import { flagOf, stampOf } from './schema.ts';
import { sessionSecret } from './secret.ts';
import { redisSecondaryStorage } from './secondary-storage.ts';
import type { RedisKvLike } from './secondary-storage.ts';
import { boundPrincipal, ensurePrincipal, readPrincipal } from './session.ts';
import type { EnsuredPrincipal } from './session.ts';
import {
  checkoutToken,
  dbApiKeyStore,
  localTokenRequired,
  noApiKeyStore,
  resolveBearerSync,
} from './tokens.ts';
import type { ApiKeyRecord, ApiKeyStore, BearerResolution } from './tokens.ts';

export type Env = Readonly<Record<string, string | undefined>>;

/** A share link found by its token hash (SPEC-3 6.4); B2's access store answers it hosted. */
export type ShareLinkHit = { deckId: string; linkId: string; role: GrantRole };

/**
 * How the exchange asks for a link. `fresh: true` reads past any record cache: the blob tier's
 * 60 s cache is process local, so a link minted or revoked seconds ago on one instance is stale
 * on the others until it expires, and the exchange must count the mint and the revocation on
 * every instance (SPEC-3 6.4). The checkout lookup reads the record files and is fresh by nature.
 */
export type ShareLinkLookupOptions = { fresh: boolean };

export type DeckIndexView = 'owned' | 'shared' | 'recent' | 'trash' | 'all';

export type IdentityHooks = {
  /** After an anonymous id links to an account: the index and the inbox merge (B2). */
  onLinked: ((anonymousId: string, userId: string) => Promise<void>)[];
  /** Before an account is deleted; throw to refuse (owned decks other people hold grants on). */
  beforeDelete: ((userId: string) => Promise<void>)[];
  /** After an account is deleted: the files, the aliases and the profile are this module's; the rest is the hook's. */
  onDeleted: ((userId: string) => Promise<void>)[];
  /** Binds pending invitations (grants by email) to a principal on the first verified session (6.5). */
  bindInvitations: ((userId: string, email: string) => Promise<void>) | null;
  /** The caller's deck index (6.7); the default lists the store as owned on a checkout. */
  deckIndex: ((principalId: string, view: DeckIndexView) => Promise<DeckHead[]>) | null;
  /**
   * Finds a share link by `sha256:<hex>` of its token; the default reads no record. The exchange
   * passes `{ fresh: true }` and a hosted binding drops its cached record before the read.
   */
  findShareLink:
    ((tokenHash: string, options: ShareLinkLookupOptions) => Promise<ShareLinkHit | null>) | null;
  /** Closes the MCP sessions bound to a revoked key and answers how many (B1's routes/mcp.ts). */
  closeAgentSessions: ((tokenId: string) => Promise<number>) | null;
  /** Records a link grant for an account on its index (`shared` with `via: 'link'`, 6.4). */
  onLinkGrant: ((principalId: string, grant: LinkGrant) => Promise<void>) | null;
};

export type IdentityRuntime = {
  env: Env;
  hosted: boolean;
  stateDir: string;
  /** The identity cookie's secret. */
  secret: string;
  dbSelection: AuthDbSelection;
  mailMode: MailMode;
  db: AuthDb | null;
  auth: TurboslideAuth | null;
  keys: ApiKeyStore;
  aliases: AliasStore;
  profiles: ProfileStore;
  quotas: QuotaStore;
  mailer: Mailer;
  principals: PrincipalStore;
  checkoutToken: string | null;
  methods: SignInMethods;
  hooks: IdentityHooks;
  /** Resolves when the tables exist; every database read awaits it. */
  ready: Promise<void>;
  close: () => Promise<void>;
};

export type BuildRuntimeInput = {
  env: Env;
  root: string;
  stateDir: string;
  hosted: boolean;
  /** The Redis client of the realtime tier, when the deployment has one (B2 binds it). */
  redis?: RedisKvLike;
  announce?: (line: string) => void;
  log?: (line: string) => void;
  /** Injected so tests never construct Resend's SDK. */
  resend?: (apiKey: string) => Resend;
};

function emptyHooks(): IdentityHooks {
  return {
    onLinked: [],
    beforeDelete: [],
    onDeleted: [],
    bindInvitations: null,
    deckIndex: null,
    findShareLink: null,
    closeAgentSessions: null,
    onLinkGrant: null,
  };
}

/** Builds a runtime from its inputs; `identityRuntime()` keeps one per process. */
export function buildIdentityRuntime(input: BuildRuntimeInput): IdentityRuntime {
  const log = input.log ?? ((line: string) => console.error(line));
  const secret = sessionSecret(input.env, input.hosted ? undefined : input.stateDir, log).secret;
  const dbSelection = selectAuthDb(input.env, input.root);
  const db = dbSelection.kind === 'none' ? null : openAuthDb(dbSelection);
  const captureStore: CaptureStore =
    db !== null
      ? dbCaptureStore(db.db)
      : input.hosted
        ? memoryCaptureStore()
        : fileCaptureStore(input.stateDir);
  const mailer = selectMailer(input.env, {
    store: captureStore,
    resend: input.resend ?? ((apiKey) => new Resend(apiKey)),
    warn: log,
  });
  const redisKv =
    input.redis !== undefined
      ? {
          get: (key: string) => input.redis!.get(key),
          set: async (key: string, value: string, ttlMs: number) => {
            await input.redis!.set(key, value, 'EX', Math.max(1, Math.ceil(ttlMs / 1000)));
          },
          del: async (key: string) => {
            await input.redis!.del(key);
          },
        }
      : undefined;
  const principals = selectPrincipalStore({
    ...(redisKv !== undefined ? { kv: redisKv } : {}),
    stateDir: input.stateDir,
  }).store;
  const hooks = emptyHooks();
  const runtime: IdentityRuntime = {
    env: input.env,
    hosted: input.hosted,
    stateDir: input.stateDir,
    secret,
    dbSelection,
    mailMode: selectMail(input.env).mode,
    db,
    auth: null,
    keys: db !== null ? dbApiKeyStore(db) : noApiKeyStore(),
    aliases: db !== null ? dbAliasStore(db.db) : memoryAliasStore(),
    profiles: db !== null ? dbProfileStore(db.db) : memoryProfileStore(),
    quotas: db !== null ? dbQuotaStore(db.db) : memoryQuotaStore(),
    mailer,
    principals,
    checkoutToken: input.hosted ? null : checkoutToken(input.stateDir, input.announce ?? log),
    methods: signInMethods(input.env, db !== null),
    hooks,
    ready: Promise.resolve(),
    close: async () => {
      await db?.close();
    },
  };
  if (db !== null) {
    runtime.auth = createAuth({
      db,
      env: input.env,
      sessionSecret: secret,
      mailer,
      quotas: runtime.quotas,
      hosted: input.hosted,
      ...(input.redis !== undefined
        ? { secondaryStorage: redisSecondaryStorage(input.redis) }
        : {}),
      onSessionCreated: (session, request) => onSessionCreated(runtime, session, request),
      beforeUserDelete: async (userId) => {
        for (const hook of hooks.beforeDelete) await hook(userId);
      },
      onUserDeleted: (userId) => onUserDeleted(runtime, userId),
      log,
    });
    runtime.ready = (async () => {
      await migrateAuthDb(db);
      await migrateBetterAuth(runtime.auth!);
    })().catch((error: unknown) => {
      log(
        `turboslide auth: the identity database did not migrate: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    });
  }
  return runtime;
}

const HOLDER = Symbol.for('turboslide.studio.identity');

function holder(): Record<symbol, IdentityRuntime | undefined> {
  return globalThis as unknown as Record<symbol, IdentityRuntime | undefined>;
}

/** The process wide runtime, built on first use from the environment and the store's folders. */
export function identityRuntime(): IdentityRuntime {
  return (holder()[HOLDER] ??= buildIdentityRuntime({
    env: process.env,
    root: repoRoot(),
    stateDir: stateDir(),
    hosted: isHosted(),
  }));
}

/** Replaces the process runtime (tests, or B2 rebinding the Redis client); the previous one is closed. */
export async function setIdentityRuntime(runtime: IdentityRuntime | undefined): Promise<void> {
  const previous = holder()[HOLDER];
  holder()[HOLDER] = runtime;
  if (previous !== undefined && previous !== runtime) await previous.close();
}

/** Binds the seams other builders provide; each call adds or replaces. */
export function bindIdentityHooks(
  partial: Partial<Omit<IdentityHooks, 'onLinked' | 'beforeDelete' | 'onDeleted'>> & {
    onLinked?: IdentityHooks['onLinked'][number];
    beforeDelete?: IdentityHooks['beforeDelete'][number];
    onDeleted?: IdentityHooks['onDeleted'][number];
  },
  runtime: IdentityRuntime = identityRuntime(),
): void {
  const { onLinked, beforeDelete, onDeleted, ...rest } = partial;
  if (onLinked !== undefined) runtime.hooks.onLinked.push(onLinked);
  if (beforeDelete !== undefined) runtime.hooks.beforeDelete.push(beforeDelete);
  if (onDeleted !== undefined) runtime.hooks.onDeleted.push(onDeleted);
  Object.assign(runtime.hooks, rest);
}

// ------------------------------------------------------------------------------------------
// Accounts

export type AccountFacts = {
  userId: string;
  principalId: string;
  email: string;
  emailVerified: boolean;
  name: string;
  admin: boolean;
  profile: Profile;
};

/** The user row and the profile of an account, or null when there is no such user. */
export async function accountFacts(
  runtime: IdentityRuntime,
  userId: string,
): Promise<AccountFacts | null> {
  if (runtime.db === null) return null;
  await runtime.ready;
  const row = await runtime.db.db
    .selectFrom('user')
    .select(['id', 'email', 'emailVerified', 'name'])
    .where('id', '=', userId)
    .executeTakeFirst();
  if (row === undefined) return null;
  const profile = await runtime.profiles.ensure(userId);
  const email = row.email.toLowerCase();
  return {
    userId,
    principalId: accountPrincipalId(userId),
    email,
    emailVerified: flagOf(row.emailVerified),
    name: row.name,
    admin: profile.admin || adminEmails(runtime.env).includes(email),
    profile,
  };
}

async function accountProfile(
  runtime: IdentityRuntime,
  userId: string,
): Promise<AccountProfile | null> {
  const facts = await accountFacts(runtime, userId);
  if (facts === null) return null;
  const record = await runtime.principals.get(facts.principalId);
  return {
    userId,
    name: facts.name,
    email: facts.email,
    emailVerified: facts.emailVerified,
    admin: facts.admin,
    ...(record?.avatar !== undefined ? { avatar: record.avatar } : {}),
    ...(facts.profile.deletedAt !== null ? { deleted: true } : {}),
  };
}

/** Links the browser's anonymous principal to the account and merges the records once (7.4). */
export async function linkAnonymous(
  runtime: IdentityRuntime,
  anonymousId: string,
  userId: string,
): Promise<boolean> {
  const linked = await runtime.aliases.link(anonymousId, userId);
  if (!linked) return false;
  const accountId = accountPrincipalId(userId);
  const anonymous = await runtime.principals.get(anonymousId);
  const account = (await runtime.principals.get(accountId)) ?? newPrincipalRecord(accountId);
  if (anonymous !== null) await runtime.principals.put(mergePrincipalRecords(anonymous, account));
  else await runtime.principals.put(account);
  for (const hook of runtime.hooks.onLinked) await hook(anonymousId, userId);
  return true;
}

async function onSessionCreated(
  runtime: IdentityRuntime,
  session: { id: string; userId: string; token: string },
  request: Request | undefined,
): Promise<void> {
  await runtime.ready;
  const facts = await accountFacts(runtime, session.userId);
  if (facts === null) return;
  await runtime.principals.touch(facts.principalId, new Date(), true);
  if (adminEmails(runtime.env).includes(facts.email) && !facts.profile.admin)
    await runtime.profiles.setAdmin(session.userId, true);
  if (request !== undefined) {
    const anonymous = await readPrincipal(request, runtime.secret);
    if (anonymous !== null) await linkAnonymous(runtime, anonymous.id, session.userId);
  }
  if (facts.emailVerified && runtime.hooks.bindInvitations !== null)
    await runtime.hooks.bindInvitations(session.userId, facts.email);
}

async function onUserDeleted(runtime: IdentityRuntime, userId: string): Promise<void> {
  await runtime.profiles.markDeleted(userId);
  await runtime.aliases.unlinkAll(userId);
  await runtime.principals.delete(accountPrincipalId(userId));
  for (const key of await runtime.keys.list(userId)) await runtime.keys.revoke(key.id, userId);
  for (const hook of runtime.hooks.onDeleted) await hook(userId);
}

// ------------------------------------------------------------------------------------------
// Who is asking

export type IdentityKind = 'none' | 'anonymous' | 'account' | 'agent' | 'bootstrap' | 'checkout';

export type RequestIdentity = {
  kind: IdentityKind;
  ctx: AuthContext;
  /** The acting principal id; null for a refused or empty bearer and for the bootstrap bearer. */
  principalId: string | null;
  /** The author the store writes for this request; null when nothing may write. */
  author: Author | null;
  session: { id: string; userId: string; fresh: boolean; expiresAt: string } | null;
  account: AccountFacts | null;
  agent: ApiKeyRecord | null;
  bearer: BearerResolution;
  /** Set when this request minted a fresh anonymous id; the caller sends the cookie. */
  minted: EnsuredPrincipal | null;
  /** The principal record, when there is one. */
  record: PrincipalRecord | null;
};

const EMPTY_CTX: AuthContext = { principal: null, linkGrants: [] };

/**
 * The static bearer is the deployment admin and a checkout's holder is the folder's owner (SPEC-3
 * 0.23; research 09 1.6): the context carries the admin flag, so `decide()` answers every cell
 * with `via: 'admin'`, and an agent record naming the bearer so the log and the roster show it.
 */
function bootstrapContext(kind: 'bootstrap' | 'checkout', runId: string | undefined): AuthContext {
  const agent: AgentContext = {
    tokenId: kind,
    ownerId: `agent:${kind}`,
    scopes: ['admin'],
    name: kind === 'bootstrap' ? 'bootstrap token' : 'checkout',
    ...(runId !== undefined ? { runId } : {}),
  };
  return {
    principal: { id: `agent:${kind}`, kind: 'account', admin: true },
    agent,
    linkGrants: [],
  };
}

/** The display name of a principal record: the typed name, else the label. */
export function displayNameOf(record: PrincipalRecord | null, principalId: string): string {
  const name = record?.name?.trim();
  return name !== undefined && name.length > 0 ? name : (record?.label ?? labelFor(principalId));
}

/**
 * Who this request is, by the rules at the top of the file. `mint` (default true) creates an
 * anonymous principal when the request carries nothing; a read that must not set a cookie
 * passes false.
 */
export async function requestIdentity(
  request: Request,
  runtime: IdentityRuntime = identityRuntime(),
  options: { mint?: boolean; now?: Date } = {},
): Promise<RequestIdentity> {
  const now = options.now ?? new Date();
  const bearer = resolveBearerSync(bearerToken(request), {
    env: runtime.env,
    keys: runtime.keys,
    checkoutToken: runtime.checkoutToken,
  });
  const runId = requestRunId(request);
  if (bearer.kind === 'api-key') {
    const record = bearer.record;
    void runtime.keys.touch(record.id, now).catch(() => undefined);
    const owner = await accountFacts(runtime, record.userId);
    const principal: Principal | null =
      owner === null
        ? null
        : { id: owner.principalId, kind: 'account', email: owner.email, admin: owner.admin };
    const agent: AgentContext = {
      tokenId: record.id,
      ownerId: owner?.principalId ?? accountPrincipalId(record.userId),
      scopes: record.scopes,
      name: record.name,
      ...(runId !== undefined ? { runId } : {}),
    };
    const author: Author = {
      kind: 'agent',
      name: record.name,
      ...(runId !== undefined ? { runId } : {}),
      principalId: agentPrincipalId(record.id),
    };
    return {
      kind: 'agent',
      ctx: { principal, agent, linkGrants: [] },
      principalId: agentPrincipalId(record.id),
      author,
      session: null,
      account: owner,
      agent: record,
      bearer,
      minted: null,
      record: null,
    };
  }
  if (bearer.kind === 'bootstrap' || bearer.kind === 'checkout') {
    return {
      kind: bearer.kind,
      ctx: bootstrapContext(bearer.kind, runId),
      principalId: null,
      author: {
        kind: 'agent',
        name: bearer.kind === 'bootstrap' ? 'bootstrap' : 'checkout',
        ...(runId !== undefined ? { runId } : {}),
      },
      session: null,
      account: null,
      agent: null,
      bearer,
      minted: null,
      record: null,
    };
  }
  if (bearer.kind === 'refused') {
    return {
      kind: 'none',
      ctx: EMPTY_CTX,
      principalId: null,
      author: null,
      session: null,
      account: null,
      agent: null,
      bearer,
      minted: null,
      record: null,
    };
  }
  // no bearer: the account session, then the anonymous cookie. The request middleware may have
  // minted the anonymous principal for this very request (its cookie is on the response, not in
  // the request); the binding hands it over so no route mints a second one.
  const bound = boundPrincipal(request);
  const anonymous = bound?.principal ?? (await readPrincipal(request, runtime.secret));
  if (runtime.auth !== null) {
    await runtime.ready;
    const found = await sessionOf(runtime.auth, request).catch(() => null);
    if (found !== null) {
      const account = await accountFacts(runtime, found.user.id);
      if (account !== null && account.profile.deletedAt === null) {
        if (anonymous !== null) await linkAnonymous(runtime, anonymous.id, account.userId);
        const record =
          (await runtime.principals.touch(account.principalId, now, true)) ??
          newPrincipalRecord(account.principalId, now);
        const name = account.name.trim() || displayNameOf(record, account.principalId);
        return {
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
          author: { kind: 'human', name, principalId: account.principalId },
          session: {
            id: found.session.id,
            userId: found.user.id,
            fresh: isFreshSession(found.session, now),
            expiresAt: found.session.expiresAt.toISOString(),
          },
          account,
          agent: null,
          bearer,
          minted: null,
          record,
        };
      }
    }
  }
  if (anonymous !== null) {
    const record =
      (await runtime.principals.touch(anonymous.id, now, true)) ??
      newPrincipalRecord(anonymous.id, now);
    return {
      kind: 'anonymous',
      ctx: { principal: anonymous, linkGrants: record.linkGrants },
      principalId: anonymous.id,
      author: {
        kind: 'human',
        name: displayNameOf(record, anonymous.id),
        principalId: anonymous.id,
      },
      session: null,
      account: null,
      agent: null,
      bearer,
      minted: null,
      record,
    };
  }
  if (options.mint === false) {
    return {
      kind: 'none',
      ctx: EMPTY_CTX,
      principalId: null,
      author: null,
      session: null,
      account: null,
      agent: null,
      bearer,
      minted: null,
      record: null,
    };
  }
  const minted = await ensurePrincipal(request, runtime.secret, { now: now.getTime() });
  if (minted === null) {
    return {
      kind: 'none',
      ctx: EMPTY_CTX,
      principalId: null,
      author: null,
      session: null,
      account: null,
      agent: null,
      bearer,
      minted: null,
      record: null,
    };
  }
  const record = newPrincipalRecord(minted.principal.id, now);
  await runtime.principals.put(record);
  return {
    kind: 'anonymous',
    ctx: { principal: minted.principal, linkGrants: [] },
    principalId: minted.principal.id,
    author: { kind: 'human', name: record.label, principalId: minted.principal.id },
    session: null,
    account: null,
    agent: null,
    bearer,
    minted,
    record,
  };
}

/** True when a checkout's open localhost surface needs the per checkout token and the request has none. */
export function localTokenMissing(identity: RequestIdentity, runtime: IdentityRuntime): boolean {
  if (runtime.hosted || !localTokenRequired(runtime.env)) return false;
  return identity.bearer.kind === 'none';
}

// ------------------------------------------------------------------------------------------
// Rendering a principal

/** Prefetches what `resolvePrincipal` needs and resolves one id. */
export async function resolveIdentity(
  runtime: IdentityRuntime,
  principalId: string,
  options: { agent?: Pick<AgentContext, 'name' | 'runId'> } = {},
): Promise<ResolvedIdentity> {
  const parsed = parsePrincipalId(principalId);
  const record = await runtime.principals.get(principalId);
  let alias: string | null = null;
  let account: AccountProfile | null = null;
  let token: TokenProfile | null = null;
  if (parsed?.kind === 'anonymous') {
    alias = await runtime.aliases.accountOf(principalId);
    if (alias !== null) account = await accountProfile(runtime, alias);
  } else if (parsed?.kind === 'account') {
    account = await accountProfile(runtime, parsed.userId);
  } else if (parsed?.kind === 'agent') {
    const key = await runtime.keys.get(parsed.tokenId);
    if (key !== null)
      token = {
        tokenId: key.id,
        ownerId: accountPrincipalId(key.userId),
        name: key.name,
        revokedAt: key.revokedAt,
      };
  }
  return resolvePrincipal(
    principalId,
    {
      record: () => record,
      alias: () => (alias === null ? null : accountPrincipalId(alias)),
      account: () => account,
      token: () => token,
    },
    {
      ...(options.agent !== undefined
        ? { agent: { name: options.agent.name, runId: sanitizeRunId(options.agent.runId) } }
        : {}),
    },
  );
}

/** The mark and the view the chrome draws for a principal (SPEC-3 4.1, 4.11). */
export async function identityViewFor(
  runtime: IdentityRuntime,
  principalId: string,
  options: {
    hueSlot?: HueSlot | null;
    presenter?: boolean;
    self?: boolean;
    showEmail?: boolean;
    pictureUrl?: string;
    agent?: Pick<AgentContext, 'name' | 'runId'>;
  } = {},
): Promise<{ identity: ResolvedIdentity; mark: MarkSpec; view: IdentityView }> {
  const identity = await resolveIdentity(
    runtime,
    principalId,
    options.agent !== undefined ? { agent: options.agent } : {},
  );
  const mark = markSpec(identity, {
    ...(options.hueSlot !== undefined ? { hueSlot: options.hueSlot } : {}),
    ...(options.presenter !== undefined ? { presenter: options.presenter } : {}),
    ...(options.self !== undefined ? { self: options.self } : {}),
    ...(options.pictureUrl !== undefined ? { pictureUrl: options.pictureUrl } : {}),
  });
  const view = toIdentityView(identity, {
    mark,
    ...(options.showEmail !== undefined ? { showEmail: options.showEmail } : {}),
  });
  return { identity, mark, view };
}

/** The caller's deck index (6.7): the bound index, else every deck of the store as owned. */
export async function deckIndexFor(
  runtime: IdentityRuntime,
  principalId: string,
  view: DeckIndexView,
): Promise<DeckHead[]> {
  if (runtime.hooks.deckIndex !== null) return runtime.hooks.deckIndex(principalId, view);
  if (view === 'shared') return [];
  const heads = await (
    await ensureDecks()
  ).list({ includeTrashed: view !== 'owned' && view !== 'recent' });
  if (view === 'trash') return heads.filter((head) => head.trashedAt !== undefined);
  if (view === 'all') return heads;
  return heads.filter((head) => head.trashedAt === undefined);
}

export { stampOf };
