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
//      The session's facts are read through a per instance cache under the SHA-256 of the session
//      cookie for 300 s on the D1 engine (`accountSession`; docs/CLOUDFLARE.md 4.1), and a D1
//      proxy that does not answer makes the request anonymous after one retry.
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
import { sha256Hex } from '@turboslide/identity/sha256';
import type { HueSlot } from '@turboslide/identity/hues';
import { markSpec } from '@turboslide/identity/marks';
import type { MarkSpec } from '@turboslide/identity/marks';
import type { KvClient, PrincipalRecord, PrincipalStore } from '@turboslide/identity/principal';
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
import { isD1ProxyError } from './d1-proxy-dialect.ts';
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
import { bindPrincipalD1, d1PrincipalStore, selectPrincipalStore } from './principal.ts';
import { adminEmails, dbProfileStore, memoryProfileStore } from './profile.ts';
import type { Profile, ProfileStore } from './profile.ts';
import { dbQuotaStore, memoryQuotaStore } from './quota.ts';
import type { QuotaStore } from './quota.ts';
import { flagOf, markSchemaCurrent, schemaIsCurrent, stampOf } from './schema.ts';
import { sessionSecret } from './secret.ts';
import { redisSecondaryStorage } from './secondary-storage.ts';
import type { RedisKvLike } from './secondary-storage.ts';
import { noteTiming } from '../server-timing.ts';
import { boundPrincipal, ensurePrincipal, parseCookies, readPrincipal } from './session.ts';
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
  /** The runtime's log line sink (the console's error stream by default). */
  log: (line: string) => void;
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
  /** The per instance cache of a session's account facts (docs/CLOUDFLARE.md 4.1); `ttlMs` 0 is off. */
  sessionFacts: SessionFactsCache;
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
  /** The fetch the D1 proxy posts with; a test hands a fake `/db/query`. */
  fetch?: typeof fetch;
  /** The session facts cache's life; the default is 300 s on the `d1` engine and off elsewhere. */
  sessionFactsCacheMs?: number;
  /** How long a failed migration stands before the next read runs it again (`READY_RETRY_MS`). */
  readyRetryMs?: number;
};

// ------------------------------------------------------------------------------------------
// The session facts cache (docs/CLOUDFLARE.md 4.1, 4.2; the rows `cost.d1.reads`,
// `cost.d1.writes`)

/** The cookie cache's life (better-auth.ts `cookieCache.maxAge`), the cache's too. */
export const SESSION_FACTS_CACHE_MS = 5 * 60_000;

/**
 * How long a failed migration of the identity database stands before the next read of
 * `runtime.ready` runs it again. A process that boots while its database is not reachable (on the
 * `d1` engine, the Worker behind the proxy during a deploy or an outage) recovers when it answers,
 * instead of refusing every identity read for the rest of its life.
 */
export const READY_RETRY_MS = 5_000;

export type AccountSession = {
  session: {
    id: string;
    userId: string;
    token: string;
    createdAt: Date;
    updatedAt: Date;
    expiresAt: Date;
  };
  account: AccountFacts;
  /** The anonymous ids linked to the account, as the context carries them. */
  aliases: string[];
};

type SessionFactsRow = {
  at: number;
  value: AccountSession;
  /** The anonymous ids this instance already linked under this session, so the alias read is not repeated. */
  linked: Set<string>;
};

export type SessionFactsCache = {
  ttlMs: number;
  rows: Map<string, SessionFactsRow>;
  /** The cache keys of each account principal, for the drop by principal id. */
  byPrincipal: Map<string, Set<string>>;
};

function newSessionFactsCache(ttlMs: number): SessionFactsCache {
  return { ttlMs, rows: new Map(), byPrincipal: new Map() };
}

/** The library's session cookie names under the `ts` prefix (better-auth.ts `cookiePrefix`), secure first. */
const SESSION_COOKIES = ['__Secure-ts.session_token', 'ts.session_token'];

/**
 * The key a request's session is cached under: the SHA-256 of the session cookie's value (the
 * token and its signature), never the value itself; null when the request carries no session
 * cookie, in which case the library would answer no session without a read.
 */
export function sessionCacheKey(request: Request): string | null {
  const cookies = parseCookies(request.headers.get('cookie'));
  for (const name of SESSION_COOKIES) {
    const value = cookies.get(name);
    if (value !== undefined && value !== '') return sha256Hex(value);
  }
  return null;
}

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

// ------------------------------------------------------------------------------------------
// The principal store's tier (the realtime round, docs/REALTIME.md 3.6, the row
// `realtime.departed-guest.name-stable`; audit-sync.md defect 8)

const REDIS_BINDING = Symbol.for('turboslide.studio.identity.redis');

function redisHolder(): Record<symbol, RedisKvLike | undefined> {
  return globalThis as unknown as Record<symbol, RedisKvLike | undefined>;
}

/**
 * Binds the deployment's Redis client for the principal records. The room module constructs the
 * one ioredis client of the redis tier (room.ts `state()`) and the identity runtime is built
 * earlier at boot (start.ts `bindServerSeams` binds the identity hooks before it reads the room's
 * Redis), so the runtime cannot take the client as an input; the principal store reads this
 * binding at every call instead and falls to the file store under the state folder while none
 * is bound (a checkout, the blob tier, the tests). Before this round the hosted principal store
 * was a file per instance on every tier, so a name typed on one instance was a label on the next.
 */
export function bindIdentityRedis(client: RedisKvLike | undefined): void {
  redisHolder()[REDIS_BINDING] = client;
}

function boundIdentityRedis(): RedisKvLike | undefined {
  return redisHolder()[REDIS_BINDING];
}

/** The key value shape the principal store takes (`@turboslide/identity/principal` KvClient) over an ioredis shaped client; the TTL arrives in ms and leaves as `EX` seconds. */
export function principalKvOf(client: RedisKvLike): KvClient {
  return {
    get: (key) => client.get(key),
    set: async (key, value, ttlMs) => {
      await client.set(key, value, 'EX', Math.max(1, Math.ceil(ttlMs / 1000)));
    },
    del: async (key) => {
      await client.del(key);
    },
  };
}

/**
 * The principal store that follows the deployment's tier at the call: Redis when the runtime was
 * built with a client or one is bound (`bindIdentityRedis`), the file store otherwise. One store
 * object for the runtime's life, so `runtime.principals` keeps its identity.
 */
function tieredPrincipalStore(
  input: Pick<BuildRuntimeInput, 'redis' | 'stateDir'>,
): PrincipalStore {
  const file = selectPrincipalStore({ stateDir: input.stateDir }).store;
  let kvStore: PrincipalStore | undefined;
  let kvClient: RedisKvLike | undefined;
  const pick = (): PrincipalStore => {
    const client = input.redis ?? boundIdentityRedis();
    if (client === undefined) return file;
    if (kvStore === undefined || kvClient !== client) {
      kvClient = client;
      kvStore = selectPrincipalStore({ kv: principalKvOf(client), stateDir: input.stateDir }).store;
    }
    return kvStore;
  };
  return {
    get: (principalId, now) => pick().get(principalId, now),
    put: (record) => pick().put(record),
    touch: (principalId, now, create) => pick().touch(principalId, now, create),
    delete: (principalId) => pick().delete(principalId),
  };
}

/** Builds a runtime from its inputs; `identityRuntime()` keeps one per process. */
export function buildIdentityRuntime(input: BuildRuntimeInput): IdentityRuntime {
  const log = input.log ?? ((line: string) => console.error(line));
  const secret = sessionSecret(input.env, input.hosted ? undefined : input.stateDir, log).secret;
  const dbSelection = selectAuthDb(input.env, input.root);
  const db =
    dbSelection.kind === 'none'
      ? null
      : openAuthDb(dbSelection, input.env, input.fetch === undefined ? {} : { fetch: input.fetch });
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
  /* the principal records follow the account database on the `d1` engine (docs/CLOUDFLARE.md
     4.2: one `ts_principal` table for every instance); the redis tier's binding and the file
     store stand for the other engines */
  const principals = db?.kind === 'd1' ? d1PrincipalStore(db.db) : tieredPrincipalStore(input);
  const hooks = emptyHooks();
  /* the mail mode gates the email method (REALTIME.md 4.1, default 7.7): with TURBOSLIDE_MAIL=off
     the dialog hides the field, so a database with no sender never offers a mail that is dropped */
  const mailMode = selectMail(input.env).mode;
  const runtime: IdentityRuntime = {
    env: input.env,
    hosted: input.hosted,
    stateDir: input.stateDir,
    log,
    secret,
    dbSelection,
    mailMode,
    db,
    auth: null,
    keys: db !== null ? dbApiKeyStore(db) : noApiKeyStore(),
    aliases: db !== null ? dbAliasStore(db.db) : memoryAliasStore(),
    profiles: db !== null ? dbProfileStore(db.db) : memoryProfileStore(),
    quotas: db !== null ? dbQuotaStore(db.db) : memoryQuotaStore(),
    mailer,
    principals,
    checkoutToken: input.hosted ? null : checkoutToken(input.stateDir, input.announce ?? log),
    methods: signInMethods(input.env, db !== null, mailMode),
    hooks,
    sessionFacts: newSessionFactsCache(
      input.sessionFactsCacheMs ?? (db?.kind === 'd1' ? SESSION_FACTS_CACHE_MS : 0),
    ),
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
    const migrate = async (): Promise<void> => {
      /* the `ts_schema` row (docs/CLOUDFLARE.md 4.2): a cold instance on the D1 engine makes one
         statement and skips the two migration sets when the version matches; the first instance
         of a deployment with a new version runs them once and writes the row. Two cold instances
         of one deployment may boot together on a new version: the library's `createTable` has no
         `if not exists`, so the second reads "already exists", waits, and reads the row the first
         wrote; three tries, then the error stands */
      if (db.kind !== 'd1') {
        await migrateAuthDb(db);
        await migrateBetterAuth(runtime.auth!);
        return;
      }
      for (let attempt = 0; ; attempt += 1) {
        if (await schemaIsCurrent(db.db)) return;
        try {
          await migrateAuthDb(db);
          await migrateBetterAuth(runtime.auth!);
          await markSchemaCurrent(db.db);
          return;
        } catch (error) {
          if (attempt >= 2) throw error;
          await new Promise<void>((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        }
      }
    };
    /* a failed migration is not kept for the process's life (the integrator's merge pass, 2026-10-01:
       a node server that booted while `wrangler dev` was still starting read "the D1 proxy ... was
       not reached" three times in 1.5 s and refused every later identity read, so no share link
       landed on it): the first read of `ready` at least `readyRetryMs` after the failure runs the
       migration again, and a read while a run is in flight waits on that run */
    const retryMs = input.readyRetryMs ?? READY_RETRY_MS;
    let current: Promise<void> = Promise.resolve();
    let failedAt: number | null = null;
    const start = (): Promise<void> => {
      failedAt = null;
      current = migrate().catch((error: unknown) => {
        failedAt = Date.now();
        log(
          `turboslide auth: the identity database did not migrate: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      });
      // a run nobody awaits yet is not an unhandled rejection; every reader still sees the error
      current.catch(() => undefined);
      return current;
    };
    start();
    Object.defineProperty(runtime, 'ready', {
      configurable: true,
      enumerable: true,
      get: (): Promise<void> =>
        failedAt !== null && Date.now() - failedAt >= retryMs ? start() : current,
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
  const existing = holder()[HOLDER];
  if (existing !== undefined) return existing;
  const built = buildIdentityRuntime({
    env: process.env,
    root: repoRoot(),
    stateDir: stateDir(),
    hosted: isHosted(),
  });
  holder()[HOLDER] = built;
  bindProcessPrincipals(built);
  return built;
}

/**
 * The process's principal store binding (principal.ts `bindPrincipalD1`): on the `d1` engine
 * every `selectPrincipalStore` of the process (the room's state among them) reads the runtime's
 * table; on the other engines the binding is cleared and each caller keeps its own store.
 */
function bindProcessPrincipals(runtime: IdentityRuntime | undefined): void {
  bindPrincipalD1(runtime?.db?.kind === 'd1' ? runtime.principals : undefined);
}

/** Replaces the process runtime (tests, or B2 rebinding the Redis client); the previous one is closed. */
export async function setIdentityRuntime(runtime: IdentityRuntime | undefined): Promise<void> {
  const previous = holder()[HOLDER];
  holder()[HOLDER] = runtime;
  bindProcessPrincipals(runtime);
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
  /* one source for the choice (PEOPLE.md 3.13; avatars 11): the profile row first, because it
     outlives the principal record's 90 day sliding TTL and is the one place deletion finds the
     files; the record second, for an account whose profile row never wrote a choice */
  const avatar = facts.profile.avatar ?? record?.avatar;
  return {
    userId,
    name: facts.name,
    email: facts.email,
    emailVerified: facts.emailVerified,
    admin: facts.admin,
    ...(avatar !== undefined && avatar !== null ? { avatar } : {}),
    ...(facts.profile.deletedAt !== null ? { deleted: true } : {}),
  };
}

// ------------------------------------------------------------------------------------------
// The account session through the cache (docs/CLOUDFLARE.md 4.1, 4.2)

let d1FailureLoggedAt = 0;

function rememberSession(
  runtime: IdentityRuntime,
  key: string,
  value: AccountSession,
  now: number,
): SessionFactsRow {
  const row: SessionFactsRow = { at: now, value, linked: new Set() };
  if (runtime.sessionFacts.ttlMs <= 0) return row;
  runtime.sessionFacts.rows.set(key, row);
  const keys = runtime.sessionFacts.byPrincipal.get(value.account.principalId) ?? new Set<string>();
  keys.add(key);
  runtime.sessionFacts.byPrincipal.set(value.account.principalId, keys);
  return row;
}

/**
 * Drops every cached session of an account principal (a rename, an avatar change, a deletion, a
 * sign out on this instance), so the next request reads the rows again inside the cookie cache's
 * 300 s. The room's `forgetIdentity` (room.ts) calls it beside its own cache drop.
 */
export function forgetAccountFacts(
  principalId: string,
  runtime: IdentityRuntime = identityRuntime(),
): void {
  const keys = runtime.sessionFacts.byPrincipal.get(principalId);
  if (keys === undefined) return;
  for (const key of keys) runtime.sessionFacts.rows.delete(key);
  runtime.sessionFacts.byPrincipal.delete(principalId);
}

/** Drops the whole cache (a test, a rebuilt runtime). */
export function forgetAllAccountFacts(runtime: IdentityRuntime = identityRuntime()): void {
  runtime.sessionFacts.rows.clear();
  runtime.sessionFacts.byPrincipal.clear();
}

async function readAccountSession(
  runtime: IdentityRuntime,
  request: Request,
): Promise<AccountSession | null> {
  const found = await sessionOf(runtime.auth!, request);
  if (found === null) return null;
  const account = await accountFacts(runtime, found.user.id);
  if (account === null || account.profile.deletedAt !== null) return null;
  /* the verified address and the aliased anonymous ids (docs/PEOPLE.md 3.6; b1.md R3), as the
     room's session branch carries them (room.ts sessionIdentity): a pending grant by email admits
     the invitee and a deck made before the sign in keeps its creator as owner */
  const aliases = await runtime.aliases.aliasesOf(account.userId).catch(() => []);
  return { session: found.session, account, aliases };
}

/**
 * The account session of a request and its facts (the user row, the profile, the aliases), or
 * null for a request with no live session: through the per instance cache under the SHA-256 of
 * the session cookie for the cookie cache's 300 s on the `d1` engine (`fresh: true` reads past
 * it; `forgetAccountFacts` drops it), so a signed in editor hour costs at most about twelve
 * misses of four to five indexed rows each (docs/CLOUDFLARE.md 2.2, `cost.d1.reads`). A refused
 * or timed out D1 proxy call is retried once and then read as no session, so the request falls
 * to its anonymous cookie (CLOUDFLARE.md 3.8's row for the D1 route) and the failure is logged
 * at most once a minute.
 */
export async function accountSession(
  runtime: IdentityRuntime,
  request: Request,
  options: { now?: Date; fresh?: boolean } = {},
): Promise<AccountSession | null> {
  if (runtime.auth === null) return null;
  const key = sessionCacheKey(request);
  if (key === null) return null;
  const now = (options.now ?? new Date()).getTime();
  const cache = runtime.sessionFacts;
  if (options.fresh !== true && cache.ttlMs > 0) {
    const hit = cache.rows.get(key);
    if (hit !== undefined) {
      if (now - hit.at < cache.ttlMs && hit.value.session.expiresAt.getTime() > now) {
        // the `facts` entry of the answer's server-timing (docs/NEXT.md 3.2 H9)
        noteTiming({ name: 'facts', desc: 'hit' });
        return hit.value;
      }
      cache.rows.delete(key);
      cache.byPrincipal.get(hit.value.account.principalId)?.delete(key);
    }
  }
  await runtime.ready;
  let value: AccountSession | null = null;
  const readStarted = performance.now();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      value = await readAccountSession(runtime, request);
      noteTiming({
        name: 'facts',
        dur: performance.now() - readStarted,
        desc: cache.ttlMs > 0 ? 'miss' : 'off',
      });
      break;
    } catch (error) {
      const proxy = isD1ProxyError(error);
      if (proxy && attempt === 0) continue;
      if (now - d1FailureLoggedAt > 60_000) {
        d1FailureLoggedAt = now;
        (runtime.log ?? ((line: string) => console.error(line)))(
          `turboslide auth: the account session was not read${proxy ? ' from the D1 proxy after one retry' : ''}: ${error instanceof Error ? error.message : String(error)}; the request is anonymous`,
        );
      }
      return null;
    }
  }
  if (value === null) return null;
  rememberSession(runtime, key, value, now);
  return value;
}

/**
 * Links the request's anonymous principal to the session's account once per cached session: the
 * alias read of `linkAnonymous` runs the first time this instance sees the pair and not on every
 * request of the 300 s (CLOUDFLARE.md 2.2).
 */
async function linkUnderSession(
  runtime: IdentityRuntime,
  request: Request,
  found: AccountSession,
  anonymousId: string,
): Promise<void> {
  const key = sessionCacheKey(request);
  const row = key === null ? undefined : runtime.sessionFacts.rows.get(key);
  if (row?.linked.has(anonymousId)) return;
  await linkAnonymous(runtime, anonymousId, found.account.userId);
  row?.linked.add(anonymousId);
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
  forgetAccountFacts(accountPrincipalId(userId), runtime);
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
  options: { mint?: boolean; now?: Date; fresh?: boolean } = {},
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
    /* the owner's verified address and aliases, as the session branch carries them below */
    const ownerAliases =
      owner === null ? [] : await runtime.aliases.aliasesOf(owner.userId).catch(() => []);
    const principal: Principal | null =
      owner === null
        ? null
        : {
            id: owner.principalId,
            kind: 'account',
            ...(owner.emailVerified ? { email: owner.email } : {}),
            admin: owner.admin,
            ...(ownerAliases.length > 0 ? { aliases: ownerAliases } : {}),
          };
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
    const found = await accountSession(runtime, request, {
      now,
      ...(options.fresh === true ? { fresh: true } : {}),
    });
    if (found !== null) {
      const { account, aliases } = found;
      if (anonymous !== null) await linkUnderSession(runtime, request, found, anonymous.id);
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
            ...(account.emailVerified ? { email: account.email } : {}),
            admin: account.admin,
            ...(aliases.length > 0 ? { aliases } : {}),
          },
          linkGrants: record.linkGrants,
        },
        principalId: account.principalId,
        author: { kind: 'human', name, principalId: account.principalId },
        session: {
          id: found.session.id,
          userId: found.session.userId,
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
  if (anonymous !== null) {
    /* a principal store that does not answer (the D1 proxy down, CLOUDFLARE.md 3.8) leaves the
       request its anonymous id and its label for this request, as before the records moved */
    const record =
      (await runtime.principals.touch(anonymous.id, now, true).catch(() => null)) ??
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
  await runtime.principals.put(record).catch(() => undefined);
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
  /* the picture's 64 px URL rides the resolved identity itself (PEOPLE.md 4.4; resolve.ts
     `pictureUrl`, B1), so `markSpec` draws a picture avatar with no per caller argument; the
     option stays for a caller that already knows a URL */
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
