import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getRequest } from '@tanstack/react-start/server';
import { bearerToken } from '@turboslide/agent/http/auth';
import type {
  AccessRecord,
  AuthContext,
  Capability,
  Decision,
  Principal,
  Role,
  Scope,
  Via,
} from '@turboslide/identity/access';
import { CAPABILITIES, decide, standingOf } from '@turboslide/identity/access';
import { labelFor } from '@turboslide/identity/labels';
import { ACTIONS, isActionId } from '@turboslide/schema/actions';
import type { ActionId } from '@turboslide/schema/actions';
import { accessRecordSchema } from '@turboslide/schema/access';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import type { Author } from '@turboslide/schema/mutations';

import { studioSessionSecret } from './auth/middleware';
import { authContextFor } from './auth/session';
import { logSecurityEvent } from './log';
import { deckDir } from './root';

/**
 * The server wrapper of the third Google Slides parity round (gslides-parity SPEC-3 0.14, 6.2,
 * 11.5 R3; MILESTONES-3 "The seams every builder types against", B4 days 1 and 3): `authorize(ctx,
 * deckId, capability)` loads the deck's access record and asks the identity package's pure
 * `decide()` (packages/identity/src/access.ts, B3, table tested) for the decision, and sits first
 * in every server function and route B4 owns. The mode is `TURBOSLIDE_AUTHORIZE`: `shadow` (the
 * default this round) logs a denial and lets the call proceed as today, so the shadow week of R3
 * shows what enforcement will refuse without refusing it; `enforce` refuses it with the status and
 * body of SPEC-3 6.2.
 *
 * Day three (merge 1b, build-3/integrator.md section 4): the types are the identity package's,
 * `decide` is bound by default, and the record loader reads `decks/<id>/.turboslide/access.json`
 * (the checkout's record of SPEC-3 6.9, validated by the schema package) until B2's access store
 * of day five is bound through `bindAuthorize({ loadRecord })`; a deck without a record is the
 * legacy synthesis inside `decide()` (`open: editor`) until R8 sets `TURBOSLIDE_MISSING_RECORD`.
 * The request's identity comes from B3's sealed cookie (`authContextFor`) or the bootstrap
 * bearer, never from the body or a query parameter (SPEC-3 8.2: `?author=` and the body author are
 * refused on browser transports). Server only.
 */

export type { AccessRecord, AuthContext, Capability, Decision, Principal, Role, Scope, Via };
export { CAPABILITIES };

export type DenyCode = Extract<Decision, { ok: false }>['code'];
export type DenyStatus = Extract<Decision, { ok: false }>['status'];

/** The `ok` branch with the denial shadow mode let through attached (SPEC-3 11.5 R3). */
export type ShadowedDecision =
  | (Extract<Decision, { ok: true }> & { shadow?: { status: DenyStatus; code: DenyCode } })
  | Extract<Decision, { ok: false }>;

export type DecideFn<R = AccessRecord> = (
  record: R | null,
  ctx: AuthContext,
  capability: Capability,
) => Decision;

export type LoadRecordFn<R = AccessRecord> = (deckId: string) => Promise<R | null>;

export const AUTHORIZE_MODE_ENV = 'TURBOSLIDE_AUTHORIZE';
export const MISSING_RECORD_ENV = 'TURBOSLIDE_MISSING_RECORD';

export type AuthorizeMode = 'shadow' | 'enforce';

export type Env = Readonly<Record<string, string | undefined>>;

/** `shadow` unless the variable spells `enforce`; anything else is `shadow`. */
export function authorizeMode(env: Env = process.env): AuthorizeMode {
  const value = env[AUTHORIZE_MODE_ENV]?.trim().toLowerCase();
  if (value === 'enforce') return 'enforce';
  return 'shadow';
}

/** What a deck without a record means: today's open editor deck, or after R8 nothing (SPEC-3 11.5 R8). */
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
  mode: () => AuthorizeMode;
  /** The clock, for tests. */
  now: () => number;
};

const DEPS = Symbol.for('turboslide.studio.authorize');

function holder(): Record<symbol, AuthorizeDeps<unknown> | undefined> {
  return globalThis as unknown as Record<symbol, AuthorizeDeps<unknown> | undefined>;
}

/** The identity package's `decide()` with the deployment's missing record rule and the clock. */
export const boundDecide: DecideFn = (record, ctx, capability) =>
  decide(record, ctx, capability, {
    now: deps().now(),
    missingRecord: missingRecordMode(),
  });

function deps(): AuthorizeDeps<unknown> {
  return (holder()[DEPS] ??= {
    decide: boundDecide as DecideFn<unknown>,
    loadRecord: fileRecordLoader,
    mode: () => authorizeMode(),
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
};

/** The identity field of a log line: a principal id or the agent's token id, never an address. */
export function identityLabel(ctx: AuthContext): string | undefined {
  if (ctx.agent !== undefined) return `agent:${ctx.agent.tokenId}`;
  return ctx.principal?.id;
}

/** The role and via the record gives the caller outside `decide()`, for the shadow fallback. */
export function roleOf(
  record: AccessRecord | null,
  ctx: AuthContext,
  now: number = Date.now(),
): { role: Role; via: Via } | null {
  const principal: Principal | null =
    ctx.principal ??
    (ctx.agent !== undefined ? { id: ctx.agent.ownerId, kind: 'account', admin: false } : null);
  if (record === null) return { role: 'editor', via: 'open' };
  if (principal === null)
    return record.generalAccess.mode === 'open'
      ? { role: record.generalAccess.role, via: 'open' }
      : null;
  return standingOf(record, principal, ctx.linkGrants, now);
}

/**
 * The call every server function and route makes first (SPEC-3 6.2). Deny by default: a loader
 * failure is a denial (404 in enforce mode, logged either way). In shadow mode a denial comes
 * back as `ok: true` with the legacy role and the denial attached under `shadow`, so the caller
 * proceeds as today and the log shows what enforcement will refuse; the one denial shadow mode
 * refuses is the 410 of a revoked publish token (the comment at the check says why).
 */
export async function authorize(
  ctx: AuthContext,
  deckId: string,
  capability: Capability,
  options: AuthorizeOptions = {},
): Promise<ShadowedDecision> {
  const d = deps();
  const mode = d.mode();
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
      shadow: mode === 'shadow',
    });
    if (mode === 'enforce') return { ok: false, status: 404, code: 'not_found' };
    return { ok: true, role: 'editor', via: 'open', shadow: { status: 404, code: 'not_found' } };
  }
  const decision = d.decide(record, ctx, capability);
  if (decision.ok) return decision;
  // a revoked publish token is refused in shadow mode as well (SPEC-3 6.4: the player "answers
  // 410 'This presentation is no longer published' after deck.unpublish"): publishing is a round
  // three construct, so the shadow week has no earlier behaviour to keep for it, and a dead
  // published link must not open the deck it once showed; every other denial passes as before
  const refused = mode === 'enforce' || decision.code === 'gone';
  logSecurityEvent({
    ...base,
    event: 'authorize.deny',
    status: decision.status,
    reason: decision.code,
    shadow: !refused,
  });
  if (refused) return decision;
  const legacy = roleOf((record as AccessRecord | null) ?? null, ctx, d.now());
  return {
    ok: true,
    role: legacy?.role ?? 'editor',
    via: legacy?.via ?? 'open',
    shadow: { status: decision.status, code: decision.code },
  };
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
 * The caller of a request (SPEC-3 6.2, 8.2): the bootstrap bearer as the admin agent, else the
 * anonymous principal of B3's sealed cookie, else a stranger. The account session, the exchanged
 * link grants and the API key records join through B3's `authContextFor` as they land. `request`
 * defaults to the request being served; outside one (a unit test) the answer is the stranger.
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
  if (carriesBootstrapToken(req)) {
    const runId = req.headers.get('x-turboslide-author')?.trim() || undefined;
    return bootstrapAgentContext('token', runId?.replace(/^agent:/, ''));
  }
  try {
    return await authContextFor(req, studioSessionSecret());
  } catch {
    return anonymousContext();
  }
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

export type Authorized = { ctx: AuthContext; decision: ShadowedDecision; author: Author };

/**
 * `authorize()` for the request being served: the context from the request, the decision, and
 * the author the write is attributed to. Throws `DeniedError` on a refusal (enforce mode). The
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
  if (id === 'deck.list' || id === 'deck.create') return null;
  if (!isActionId(id)) return 'read';
  return ACTIONS[id as ActionId].mutates ? 'write' : 'read';
}
