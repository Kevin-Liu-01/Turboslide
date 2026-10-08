import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getRequest } from '@tanstack/react-start/server';
import { bearerToken } from '@turboslide/agent/http/auth';
import type {
  AccessRecord,
  AuthContext,
  Capability,
  Decision,
  LinkGrant,
  Principal,
  Role,
  Scope,
  Via,
} from '@turboslide/identity/access';
import { CAPABILITIES, decide } from '@turboslide/identity/access';
import { labelFor } from '@turboslide/identity/labels';
import { ACTIONS, isActionId } from '@turboslide/schema/actions';
import type { ActionId } from '@turboslide/schema/actions';
import { accessRecordSchema } from '@turboslide/schema/access';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import type { Author } from '@turboslide/schema/mutations';

import { studioSessionSecret } from './auth/middleware';
import { readLinkGrantCookie } from './auth/session';
import { logSecurityEvent } from './log';
import { deckDir } from './root';

/**
 * The server wrapper of the third Google Slides parity round (gslides-parity SPEC-3 0.14, 6.2,
 * 11.5 R3; MILESTONES-3 "The seams every builder types against", B4 days 1 and 3): `authorize(ctx,
 * deckId, capability)` loads the deck's access record and asks the identity package's pure
 * `decide()` (packages/identity/src/access.ts, B3, table tested) for the decision, and sits first
 * in every server function and route B4 owns. A denial is refused with the status and body of
 * SPEC-3 6.2 on every deployment. The shadow mode of R3 (`TURBOSLIDE_AUTHORIZE=shadow`, the
 * default until security hotfix H3) logged a denial and let the call proceed; production kept it
 * long past its week, so a stranger who knew a deck id read, renamed, copied, trashed and removed
 * it (DATA-1). No environment variable weakens a decision since H3: `authorizeMode()` answers
 * `enforce` whatever the variable says and logs once when it names anything else.
 *
 * Day three (merge 1b, build-3/integrator.md section 4): the types are the identity package's,
 * `decide` is bound by default, and the record loader reads `decks/<id>/.turboslide/access.json`
 * (the checkout's record of SPEC-3 6.9, validated by the schema package) until B2's access store
 * of day five is bound through `bindAuthorize({ loadRecord })`. A deck without a stored record is
 * the bound loader's to describe (`access.ts` `missingRecordRule`, security hotfix H3) and a null
 * record is a deck that does not exist.
 * The request's identity comes from `requestContext()` (the room's `requestIdentity`: the
 * bootstrap bearer, the account session, the sealed anonymous cookie and the link grants), never
 * from the body or a query parameter (SPEC-3 8.2: `?author=` and the body author are refused on
 * browser transports). Server only.
 */

export type { AccessRecord, AuthContext, Capability, Decision, Principal, Role, Scope, Via };
export { CAPABILITIES };

export type DenyCode = Extract<Decision, { ok: false }>['code'];
export type DenyStatus = Extract<Decision, { ok: false }>['status'];

export type DecideFn<R = AccessRecord> = (
  record: R | null,
  ctx: AuthContext,
  capability: Capability,
) => Decision;

export type LoadRecordFn<R = AccessRecord> = (deckId: string) => Promise<R | null>;

export const AUTHORIZE_MODE_ENV = 'TURBOSLIDE_AUTHORIZE';
export const MISSING_RECORD_ENV = 'TURBOSLIDE_MISSING_RECORD';

/** The one mode since H3 (DATA-1); the word stays because `/api/access` and the logs name it. */
export type AuthorizeMode = 'enforce';

export type Env = Readonly<Record<string, string | undefined>>;

let ignoredModeLogged = false;

/**
 * `enforce`, whatever `TURBOSLIDE_AUTHORIZE` says (H3, DATA-1). Production carried
 * `TURBOSLIDE_AUTHORIZE=shadow` from the R3 week on, so a variable that names anything but
 * `enforce` (or nothing) is logged once per process as ignored and changes nothing.
 */
export function authorizeMode(env: Env = process.env): AuthorizeMode {
  const value = env[AUTHORIZE_MODE_ENV]?.trim().toLowerCase();
  if (value !== undefined && value !== '' && value !== 'enforce' && !ignoredModeLogged) {
    ignoredModeLogged = true;
    console.error(
      `turboslide authorize: ${AUTHORIZE_MODE_ENV}=${value} is ignored; every decision is enforced since security hotfix H3`,
    );
  }
  return 'enforce';
}

/**
 * What a deck without a record means on a checkout's file store (SPEC-3 09 1.6, 11.5 R8): the
 * folder holder's open editor deck, or nothing. A hosted store never reads the variable since H3
 * (DATA-V3): `access.ts` `missingRecordRule` gives such a deck the seed, creator or closed record.
 */
export function missingRecordMode(env: Env = process.env): 'open' | 'notFound' {
  const value = env[MISSING_RECORD_ENV]?.trim().toLowerCase();
  return value === 'notfound' || value === 'not_found' || value === '404' ? 'notFound' : 'open';
}

/** The record file a checkout's `share.*` actions write (SPEC-3 6.9; .gitignore names it). */
export const ACCESS_RECORD_FILE = join('.turboslide', 'access.json');

/**
 * The interim record loader: the checkout's `decks/<id>/.turboslide/access.json`, validated by
 * the schema package, or null when the deck has none. B2's access store (`ifMatch`, the Redis
 * cache, pub/sub) replaces it through `bindAuthorize({ loadRecord })` on day five; a file that
 * does not validate is a loader failure, which `authorize()` treats as a denial.
 */
export const fileRecordLoader: LoadRecordFn = (deckId) => {
  if (!SLUG_PATTERN.test(deckId)) return Promise.resolve(null);
  const path = join(deckDir(deckId), ACCESS_RECORD_FILE);
  if (!existsSync(path)) return Promise.resolve(null);
  const parsed = accessRecordSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  if (!parsed.success) return Promise.reject(new TypeError(`${path} is not an access record`));
  return Promise.resolve(parsed.data);
};

export type AuthorizeDeps<R = AccessRecord> = {
  decide: DecideFn<R>;
  loadRecord: LoadRecordFn<R>;
  /** The clock, for tests. */
  now: () => number;
};

const DEPS = Symbol.for('turboslide.studio.authorize');

function holder(): Record<symbol, AuthorizeDeps<unknown> | undefined> {
  return globalThis as unknown as Record<symbol, AuthorizeDeps<unknown> | undefined>;
}

/**
 * The identity package's `decide()` with the clock. A null record is a deck that does not exist:
 * the bound loader (`access.ts` `loadAccessRecord`) answers the record of every deck the store
 * holds, a deck without a stored record included (H3, DATA-V3), so null is one 404 for everyone,
 * the same answer a restricted deck gives a stranger.
 */
export const boundDecide: DecideFn = (record, ctx, capability) =>
  decide(record, ctx, capability, {
    now: deps().now(),
    missingRecord: 'notFound',
  });

function deps(): AuthorizeDeps<unknown> {
  return (holder()[DEPS] ??= {
    decide: boundDecide as DecideFn<unknown>,
    loadRecord: fileRecordLoader,
    now: () => Date.now(),
  });
}

/**
 * Binds another implementation (B2's record loader over the access store on day five; a test
 * binds only what it drives). Returns the previous binding so a test can restore it.
 */
export function bindAuthorize<R>(next: Partial<AuthorizeDeps<R>>): AuthorizeDeps<unknown> {
  const previous = deps();
  holder()[DEPS] = { ...previous, ...(next as Partial<AuthorizeDeps<unknown>>) };
  return previous;
}

export type Transport = 'window' | 'http' | 'mcp' | 'cli' | 'route';

export type AuthorizeOptions = {
  /** The action the call is about, for the log line. */
  action?: string;
  transport?: Transport;
  requestId?: string;
  /**
   * The mode of this call: the agent surface passes `enforce` (server/agent-gate.ts, H2). Since
   * H3 every call is enforced and `enforce` is the one value; the field stays for the callers.
   */
  mode?: AuthorizeMode;
};

/** The identity field of a log line: a principal id or the agent's token id, never an address. */
export function identityLabel(ctx: AuthContext): string | undefined {
  if (ctx.agent !== undefined) return `agent:${ctx.agent.tokenId}`;
  return ctx.principal?.id;
}

/**
 * The call every server function and route makes first (SPEC-3 6.2). Deny by default: a loader
 * failure is a 404. Every denial is refused and logged as one `authorize.deny` line; no mode lets
 * a denial through (H3, DATA-1).
 */
export async function authorize(
  ctx: AuthContext,
  deckId: string,
  capability: Capability,
  options: AuthorizeOptions = {},
): Promise<Decision> {
  const d = deps();
  const base = {
    identity: identityLabel(ctx),
    deckId,
    capability,
    action: options.action,
    transport: options.transport,
    requestId: options.requestId,
  };
  let record: unknown;
  try {
    record = await d.loadRecord(deckId);
  } catch (error) {
    logSecurityEvent({
      ...base,
      event: 'authorize.error',
      status: 404,
      reason: error instanceof Error ? error.name : 'load failed',
    });
    return { ok: false, status: 404, code: 'not_found' };
  }
  const decision = d.decide(record, ctx, capability);
  if (decision.ok) return decision;
  logSecurityEvent({
    ...base,
    event: 'authorize.deny',
    status: decision.status,
    reason: decision.code,
  });
  return decision;
}

/** The body of a refused request (SPEC-3 6.2, report 09 8.2): no detail beyond the capability. */
export function denialBody(decision: Extract<Decision, { ok: false }>, capability: Capability) {
  switch (decision.code) {
    case 'unauthorized':
      return { error: 'unauthorized' as const };
    case 'forbidden':
      return { error: 'forbidden' as const, capability };
    case 'gone':
      return { error: 'gone' as const };
    default:
      return { error: 'not_found' as const };
  }
}

/** The refusal a denied server function throws: the 6.2 body as the message, the status on the error. */
export class DeniedError extends Error {
  readonly status: number;
  readonly body: ReturnType<typeof denialBody>;

  constructor(status: number, body: ReturnType<typeof denialBody>) {
    super(JSON.stringify(body));
    this.name = 'DeniedError';
    this.status = status;
    this.body = body;
  }
}

/** The context of a request that carries no identity: a stranger. */
export function anonymousContext(): AuthContext {
  return { principal: null, linkGrants: [] };
}

/**
 * The context of the bootstrap bearer and of a checkout's open localhost surface (SPEC-3 0.23:
 * `TURBOSLIDE_TOKEN` stays the bootstrap admin token; report 09 1.6: on a checkout the holder of
 * the folder is its owner). B3's key resolver replaces this for API key records (day four).
 */
export function bootstrapAgentContext(mode: 'token' | 'localhost', runId?: string): AuthContext {
  return {
    // the deployment admin of the matrix (`admin: true`, via `admin`), so the bearer reaches
    // every cell whatever the record says; the agent record names the author (`agent:bootstrap`)
    principal: {
      id: mode === 'token' ? 'usr_admin' : 'usr_checkout',
      kind: 'account',
      admin: true,
    },
    agent: {
      tokenId: mode === 'token' ? 'bootstrap' : 'localhost',
      ownerId: mode === 'token' ? 'admin' : 'checkout',
      scopes: ['admin'],
      name: mode === 'token' ? 'bootstrap token' : 'checkout',
      ...(runId !== undefined ? { runId } : {}),
    },
    linkGrants: [],
  };
}

/**
 * The context of an identity a signed ticket named (bundle-core.ts): a principal id of either
 * kind as that principal, `agent:<tokenId>` as an agent with the read, write and export scopes
 * (what a bundle needs), anything else as the stranger.
 */
export function contextForIdentity(identity: string): AuthContext {
  if (identity.startsWith('agent:')) {
    const tokenId = identity.slice('agent:'.length);
    if (tokenId === 'bootstrap') return bootstrapAgentContext('token');
    if (tokenId === 'localhost') return bootstrapAgentContext('localhost');
    return {
      principal: null,
      agent: {
        tokenId,
        ownerId: `agent:${tokenId}`,
        scopes: ['read', 'write', 'export'],
        name: 'agent',
      },
      linkGrants: [],
    };
  }
  if (identity.startsWith('anon_'))
    return { principal: { id: identity, kind: 'anonymous', admin: false }, linkGrants: [] };
  if (identity.startsWith('usr_'))
    return { principal: { id: identity, kind: 'account', admin: false }, linkGrants: [] };
  return anonymousContext();
}

/** True when the request carries the deployment's bootstrap bearer (SPEC-3 0.23). */
export function carriesBootstrapToken(request: Request, env: Env = process.env): boolean {
  const token = env.TURBOSLIDE_TOKEN;
  if (token === undefined || token === '') return false;
  const given = bearerToken(request);
  if (given === undefined || given.length !== token.length) return false;
  let same = 0;
  for (let i = 0; i < token.length; i += 1) same |= given.charCodeAt(i) ^ token.charCodeAt(i);
  return same === 0;
}

/**
 * The caller of a request (SPEC-3 6.2, 8.2), for the server functions and the routes that answer
 * a Response: the context of `room.requestIdentity`, the one builder the room routes use (security
 * hotfix H3, DATA-V4). The bootstrap bearer is the admin agent, a signed in browser is its account
 * with its verified address and its aliases, an anonymous browser is its sealed cookie's principal
 * (the one the request middleware minted for a first request included), each with the link grants
 * of the principal record, the deck index and the grant cookie; anything else is a stranger.
 * Before H3 this read the anonymous cookie alone, so in enforce mode a signed in owner was a
 * stranger to `/deck/<id>`, rename, trash and every other server function. Nothing is minted here
 * (the function has no answer to carry the cookie). `request` defaults to the request being
 * served; outside one (a unit test) the answer is the stranger, and so is a failed resolution.
 */
export async function requestContext(request?: Request): Promise<AuthContext> {
  let req = request;
  if (req === undefined) {
    try {
      req = getRequest();
    } catch {
      return anonymousContext();
    }
  }
  try {
    // room.ts imports this module, so the builder loads late
    const { requestIdentity } = await import('./room');
    return (await requestIdentity(req, { mint: false })).ctx;
  } catch {
    return anonymousContext();
  }
}

/**
 * The grants of a principal from both places the exchange writes them (cycle 2, VERIFICATION.md
 * pass 2 F-share-404): the principal record of this instance and the principal's deck index on
 * the Blob store, which every instance reads (`server/access.ts` `noteLinkGrant`). The blob tier's
 * principal store is a file under the instance's own state folder, so a grant exchanged on one
 * instance was unknown to the next. One entry per link id, the record's first. The room routes
 * read the same union through this function (b7's `room.requestIdentity`, request R1 of b6.md
 * cycle 2); an index that cannot be read adds nothing, which is the refusal, never an admission.
 */
export async function linkGrantsFor(
  principalId: string,
  record: { linkGrants: readonly LinkGrant[] } | null,
): Promise<LinkGrant[]> {
  const grants: LinkGrant[] = [...(record?.linkGrants ?? [])];
  try {
    const { linkGrantsFromIndex } = await import('./access');
    for (const grant of await linkGrantsFromIndex(principalId)) {
      if (!grants.some((held) => held.linkId === grant.linkId)) grants.push(grant);
    }
  } catch {
    // the index is a second source; the record's grants stand on their own
  }
  return grants;
}

/** The grants of `first`, then those of `second` whose link `first` does not hold. */
export function unionLinkGrants(
  first: readonly LinkGrant[],
  second: readonly LinkGrant[],
): LinkGrant[] {
  const out = [...first];
  for (const grant of second) {
    if (!out.some((held) => held.linkId === grant.linkId)) out.push(grant);
  }
  return out;
}

/**
 * The grants the request's link grant cookie carries for the principal (auth/session.ts: the
 * exchange's last 120 s), after this instance's record of each deck is brought up to the
 * grant's link (access.ts `settleHeldLinks`). Empty when there is no cookie, it belongs to
 * another principal or it does not verify; a failed read adds nothing, which is the refusal.
 */
export async function cookieLinkGrants(
  request: Request,
  principalId: string,
): Promise<LinkGrant[]> {
  let grants: LinkGrant[];
  try {
    grants = await readLinkGrantCookie(request, principalId, studioSessionSecret());
  } catch {
    return [];
  }
  if (grants.length === 0) return grants;
  try {
    const { settleHeldLinks } = await import('./access');
    await settleHeldLinks(grants);
  } catch {
    // the reads only refresh the cache; the decision reads the record either way
  }
  return grants;
}

/**
 * The author a server derived identity writes as (SPEC-3 8.2 "the author derived from the
 * session"): the anonymous label of the principal id with the id itself under `principalId`, an
 * agent's token id and run, and for a request with no identity the caller's fallback with no
 * `principalId` (a record that renders by its label, as every round one and two record does).
 */
export function authorFor(ctx: AuthContext, fallback?: Author): Author {
  if (ctx.agent !== undefined) {
    const runId = ctx.agent.runId ?? fallback?.runId;
    return {
      kind: 'agent',
      name: 'agent',
      ...(runId !== undefined ? { runId } : {}),
      principalId: `agent:${ctx.agent.tokenId}`,
    };
  }
  if (ctx.principal !== null) {
    return {
      kind: 'human',
      name: authorNamer()(ctx.principal),
      principalId: ctx.principal.id,
    };
  }
  return fallback ?? { kind: 'human', name: 'studio' };
}

const NAMER = Symbol.for('turboslide.studio.authorNamer');

/**
 * The display name a principal writes under: the anonymous label of SPEC-3 4.1 by default; B3's
 * resolver (`resolvePrincipal` over the alias table and the account profile) replaces it through
 * `bindAuthorNamer` so a signed in person's records carry their name and never their address.
 */
export function authorNamer(): (principal: Principal) => string {
  const store = globalThis as unknown as Record<symbol, ((p: Principal) => string) | undefined>;
  return store[NAMER] ?? ((principal) => labelFor(principal.id));
}

export function bindAuthorNamer(namer: ((principal: Principal) => string) | undefined): void {
  (globalThis as unknown as Record<symbol, unknown>)[NAMER] = namer;
}

export type Authorized = { ctx: AuthContext; decision: Decision; author: Author };

/**
 * `authorize()` for the request being served: the context from the request, the decision, and
 * the author the write is attributed to. Throws `DeniedError` on a refusal. The
 * server functions call this first; the routes call `requestContext()` and `authorize()`
 * themselves because they answer a Response.
 */
export async function authorizeRequest(
  deckId: string,
  capability: Capability,
  options: AuthorizeOptions & { fallbackAuthor?: Author } = {},
): Promise<Authorized> {
  const ctx = await requestContext();
  const { fallbackAuthor, ...rest } = options;
  const decision = await authorize(ctx, deckId, capability, {
    transport: 'window',
    ...rest,
  });
  if (!decision.ok) throw new DeniedError(decision.status, denialBody(decision, capability));
  return { ctx, decision, author: authorFor(ctx, fallbackAuthor) };
}

/**
 * The decision on a deck an action names in its input (security hotfix H3, DATA-1): the window
 * transport authorizes the deck the page is on and the HTTP transport the `?deck=` one, while
 * `deck.copy`, `deck.trash`, `deck.restore`, `deck.remove` and `slide.import` name another deck,
 * so an owner of any deck trashed, removed or read any other. Each is decided on the deck it
 * names with the caller's context; a request with no identity is refused, and a dispatcher built
 * outside a request (the CLI's rule, a unit test) is not checked.
 */
export type NamedDeckCheck = (
  deckId: string,
  capability: Capability,
  action: string,
) => Promise<void>;

export function namedDeckCheck(caller: AuthContext | null, requestBound: boolean): NamedDeckCheck {
  return async (deckId, capability, action) => {
    if (caller === null) {
      if (requestBound)
        throw new DeniedError(
          401,
          denialBody({ ok: false, status: 401, code: 'unauthorized' }, capability),
        );
      return;
    }
    const decision = await authorize(caller, deckId, capability, { action, transport: 'http' });
    if (!decision.ok) throw new DeniedError(decision.status, denialBody(decision, capability));
  };
}

/**
 * The capability an action needs on its deck (SPEC-3 6.2 per route; section 12 per action): the
 * delete, trash, restore, copy, rename, export, history, share, publish and comment ids by name,
 * every other mutating action `write`, every other read `read`. `null` for an action that has no
 * deck (accounts, notifications, admin) or that must answer the same to everyone
 * (`share.requestAccess`, SPEC-3 6.5).
 */
export function capabilityForAction(id: string): Capability | null {
  if (id === 'share.requestAccess') return null;
  if (id.startsWith('account.') || id.startsWith('notification.') || id.startsWith('admin.'))
    return null;
  if (id === 'deck.remove') return 'remove';
  if (id === 'deck.trash') return 'trash';
  if (id === 'deck.restore') return 'restore';
  if (id === 'deck.copy') return 'copy';
  if (id === 'deck.rename') return 'rename';
  if (id === 'deck.publish' || id === 'deck.unpublish') return 'publish';
  if (id === 'share.settings') return 'settings';
  if (id === 'share.transferOwnership') return 'transfer';
  if (id === 'share.get') return 'read';
  if (id.startsWith('share.')) return 'share';
  if (id === 'comment.list' || id === 'comment.get' || id === 'comment.link') return 'readComments';
  if (id.startsWith('comment.')) return 'comment';
  if (id === 'activity.list' || id.startsWith('version.')) return 'history';
  if (id === 'presence.follow') return 'follow';
  if (id.startsWith('presence.')) return 'presence';
  if (id.startsWith('export.') || id === 'build.run') return 'export';
  // deck.list has no deck to check: its handler answers the caller's own and shared decks
  // (docs/NEXT.md 3.2 H2; server/deck-scope.ts); deck.create makes one
  if (id === 'deck.list' || id === 'deck.create') return null;
  if (!isActionId(id)) return 'read';
  return ACTIONS[id as ActionId].mutates ? 'write' : 'read';
}
