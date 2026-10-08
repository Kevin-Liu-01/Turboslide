// The one gate of the agent surface (hardening H2; docs/hardening/research/auth-verify.md AUTH-1,
// AUTH-2, AV-1, AV-2). `/api/actions/:action` and `/mcp` decide every call here, for the identity
// the bearer resolves to, before the deck's dispatcher runs it:
//
// - The caller is the bearer's: an API key acts for its owner with its scopes; the bootstrap token
//   and a checkout's localhost holder are the deployment admin (SPEC-3 0.23, 7.7). Before H2 the
//   HTTP route gave every bearer the admin context and `/mcp` decided nothing.
// - `gateDeckRead` runs before the store opens the deck the transport is bound to (`?deck=`, the
//   MCP session's deck): a deck the caller cannot see answers `deckNotFound`, the answer a deck
//   that does not exist gets once the store is asked.
// - `gateAgentAction` decides one call: the bound deck at the action's capability, and the decks
//   the input names at theirs (`INPUT_DECKS`); a named deck that does not exist answers the same
//   not found. A key's scopes hold whatever its owner's role (`decide()` skips the scopes of a
//   deployment admin's key); a write needs a writing scope; `admin.*` is the deployment admin's;
//   a mutating call meets the read only switch and the writes per minute per deck quota (SPEC-3
//   8.3, 8.12), as the HTTP route applied them before.
//
// Every decision here enforces whatever `TURBOSLIDE_AUTHORIZE` says: the callers of this surface
// are the admin or a key, and a key's reach must not wait for the enforce flip.
import type { Dispatcher } from '@turboslide/agent/dispatch';
import { bearerToken } from '@turboslide/agent/http/auth';
import type { AuthContext, Capability, Decision, Scope } from '@turboslide/identity/access';
import { SCOPES_FOR } from '@turboslide/identity/access';
import { accountPrincipalId } from '@turboslide/identity/ids';
import type { KeyBinding } from '@turboslide/mcp/http';
import type { DeckSource } from '@turboslide/mcp/resources';
import { ACTIONS, isActionId } from '@turboslide/schema/actions';
import { ForbiddenError, GoneError } from '@turboslide/schema/errors';
import { SLUG_PATTERN } from '@turboslide/schema/ids';

import { agentAuth } from './auth';
import { ADMIN_ONLY } from './auth/actions';
import { identityRuntime, requestIdentity } from './auth/identity';
import { resolveBearerSync } from './auth/tokens';
import { authorize, bootstrapAgentContext, capabilityForAction, identityLabel } from './authorize';
import { assertFlag } from './flags';
import { checkQuota } from './ratelimit';
import { hasStoredDeck } from './root';

export type AgentTransport = 'http' | 'mcp';

/** Who calls the agent surface: an API key, or the deployment admin (the bootstrap token, a checkout's holder). */
export type AgentCaller = { kind: 'agent' | 'admin'; ctx: AuthContext };

/** One call for the gate: the action, the deck the transport is bound to, and the input. */
export type GateCall = {
  action: string;
  deckId: string;
  input: unknown;
  transport: AgentTransport;
};

/** The one not found message, for a deck that does not exist and for one the caller cannot see. */
export function deckNotFound(deckId: string): string {
  return `No deck ${deckId}`;
}

/** A 401 the gate answers; `errorStatus` reads the status it carries. */
export class UnauthorizedError extends Error {
  readonly status = 401;

  constructor() {
    super('unauthorized');
    this.name = 'UnauthorizedError';
  }
}

/** The caller of a request `requireAgentAuth` admitted; UnauthorizedError for anything else. */
export async function agentCaller(request: Request): Promise<AgentCaller> {
  const auth = agentAuth(request);
  if (!auth.ok) throw new UnauthorizedError();
  if (auth.mode === 'localhost') return { kind: 'admin', ctx: bootstrapAgentContext('localhost') };
  const identity = await requestIdentity(request, identityRuntime(), { mint: false });
  if (identity.kind === 'agent') return { kind: 'agent', ctx: identity.ctx };
  if (identity.kind === 'bootstrap') return { kind: 'admin', ctx: bootstrapAgentContext('token') };
  throw new UnauthorizedError();
}

/** The API key record a request carries, for the MCP session binding; null for the admin bearers. */
export function keyBindingOf(request: Request): KeyBinding | null {
  const runtime = identityRuntime();
  const resolved = resolveBearerSync(bearerToken(request), {
    env: runtime.env,
    keys: runtime.keys,
    checkoutToken: runtime.checkoutToken,
  });
  if (resolved.kind !== 'api-key') return null;
  const { record } = resolved;
  return {
    tokenId: record.id,
    ownerId: accountPrincipalId(record.userId),
    scopes: record.scopes,
    name: record.name,
  };
}

/**
 * The decks an action's input names, with the capability each needs. `replaces`: the action acts
 * on that deck and not on the bound one, which is then only read. A map, because the action id
 * comes from the request path.
 */
export const INPUT_DECKS: ReadonlyMap<
  string,
  { field: string; capability: Capability; replaces: boolean }
> = new Map([
  ['deck.copy', { field: 'id', capability: 'copy', replaces: true }],
  ['deck.trash', { field: 'id', capability: 'trash', replaces: true }],
  ['deck.restore', { field: 'id', capability: 'restore', replaces: true }],
  ['deck.remove', { field: 'id', capability: 'remove', replaces: true }],
  ['template.create', { field: 'deckId', capability: 'copy', replaces: true }],
  ['template.update', { field: 'deckId', capability: 'copy', replaces: true }],
  ['slide.import', { field: 'sourceDeckId', capability: 'read', replaces: false }],
]);

/** The deckless families: no deck capability, no read only switch, no per deck quota. */
const DECKLESS = ['account.', 'notification.', 'admin.'];

/** The scopes that let a key write; a capability whose own scopes are read or export ones needs `write` to mutate. */
const WRITING_SCOPES: readonly Scope[] = ['write', 'comment', 'share', 'admin'];

function inputDeck(input: unknown, field: string): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const value = (input as Record<string, unknown>)[field];
  // anything but a slug is refused by the action's schema before a handler runs
  return typeof value === 'string' && SLUG_PATTERN.test(value) ? value : undefined;
}

function refusal(
  decision: Extract<Decision, { ok: false }>,
  deckId: string,
  capability: Capability,
) {
  switch (decision.code) {
    case 'not_found':
      return new RangeError(deckNotFound(deckId));
    case 'forbidden':
      return new ForbiddenError(`The caller may not ${capability} on this deck`, capability);
    case 'gone':
      return new GoneError('This presentation is no longer published');
    default:
      return new UnauthorizedError();
  }
}

async function decideDeck(
  caller: AgentCaller,
  deckId: string,
  capability: Capability,
  call: { action: string; transport: AgentTransport },
): Promise<void> {
  const decision = await authorize(caller.ctx, deckId, capability, {
    action: call.action,
    transport: call.transport,
    mode: 'enforce',
  });
  if (!decision.ok) throw refusal(decision, deckId, capability);
}

/**
 * The decks an input names, decided for a browser caller as the gate decides them for an agent
 * (security hotfix H3: the editor's runDeckAction decided the page's deck alone, so the owner of
 * any deck trashed, removed, copied, saved as a template or imported from any other). A deck the
 * caller cannot see and one that does not exist answer `deckNotFound`.
 */
export async function gateInputDecks(
  ctx: AuthContext,
  action: string,
  input: unknown,
): Promise<void> {
  const named = INPUT_DECKS.get(action);
  const target = named === undefined ? undefined : inputDeck(input, named.field);
  if (named === undefined || target === undefined) return;
  await decideDeck({ kind: 'agent', ctx }, target, named.capability, { action, transport: 'http' });
}

/** The deployment admin: the admin bearers, or a key with the admin scope of an admin account (auth/actions.ts requireAdmin). */
export function isDeploymentAdmin(caller: AgentCaller): boolean {
  if (caller.kind === 'admin') return true;
  return (
    caller.ctx.principal?.admin === true && caller.ctx.agent?.scopes.includes('admin') === true
  );
}

/**
 * Whether a key's scopes allow a call: the capability's scopes (`SCOPES_FOR`), `read` for a
 * deckless read and `write` for a deckless write, and a writing scope for any write; the `admin`
 * scope stands for every scope. The admin bearers carry no scopes to hold.
 */
export function scopesAllow(
  caller: AgentCaller,
  capability: Capability | null,
  mutates: boolean,
): boolean {
  if (caller.kind !== 'agent') return true;
  const scopes = caller.ctx.agent?.scopes ?? [];
  if (scopes.includes('admin')) return true;
  const family: readonly Scope[] =
    capability === null ? (mutates ? ['write'] : ['read']) : SCOPES_FOR[capability];
  if (!family.some((scope) => scopes.includes(scope))) return false;
  if (mutates && !family.some((scope) => WRITING_SCOPES.includes(scope)))
    return scopes.includes('write');
  return true;
}

/** The bound deck read for the caller before the store opens it: `deckNotFound` when it may not. */
export async function gateDeckRead(
  caller: AgentCaller,
  deckId: string,
  transport: AgentTransport,
  action = 'deck.open',
): Promise<void> {
  await decideDeck(caller, deckId, 'read', { action, transport });
}

/**
 * One call of the agent surface, decided for the caller. Throws what the transport answers:
 * RangeError (404, `deckNotFound`), ForbiddenError (403), GoneError (410), UnauthorizedError
 * (401), FlagOffError (503) or RateLimitedError (429).
 */
export async function gateAgentAction(caller: AgentCaller, call: GateCall): Promise<void> {
  const { action } = call;
  const mutates = isActionId(action) && ACTIONS[action].mutates;
  if (action.startsWith('admin.') && !isDeploymentAdmin(caller))
    throw new ForbiddenError(ADMIN_ONLY);
  const capability = capabilityForAction(action);
  const named = INPUT_DECKS.get(action);
  const target = named === undefined ? undefined : inputDeck(call.input, named.field);
  const replaces = named?.replaces === true;
  await decideDeck(
    caller,
    call.deckId,
    capability === null || replaces ? 'read' : capability,
    call,
  );
  if (named !== undefined && target !== undefined) {
    // a deck that does not exist answers what one the caller cannot see answers
    if (!(await hasStoredDeck(target))) throw new RangeError(deckNotFound(target));
    await decideDeck(caller, target, named.capability, call);
  }
  const acting = replaces ? named.capability : capability;
  if (!scopesAllow(caller, acting, mutates))
    throw new ForbiddenError(
      `This API key's scopes do not allow ${action}`,
      acting === null ? undefined : acting,
    );
  if (!mutates || DECKLESS.some((prefix) => action.startsWith(prefix))) return;
  // the read only switch and the writes per minute per deck quota (SPEC-3 8.3, 8.12)
  const deckId = replaces && target !== undefined ? target : call.deckId;
  const identity = identityLabel(caller.ctx) ?? `agent:${call.transport}`;
  await assertFlag('readOnly', { identity, deckId, action });
  const refused = await checkQuota('writesPerMinutePerDeck', {
    identity,
    tier: 'agent',
    deckId,
    action,
    transport: call.transport,
  });
  if (refused !== null) throw refused;
}

/** The dispatcher of an MCP session: every call through the gate first, for the session's caller and deck. */
export function gatedDispatcher(
  dispatcher: Dispatcher,
  caller: AgentCaller,
  bound: { deckId: string; transport: AgentTransport },
): Dispatcher {
  return {
    ...dispatcher,
    dispatch: async (id, input, context) => {
      await gateAgentAction(caller, {
        action: id,
        deckId: bound.deckId,
        input,
        transport: bound.transport,
      });
      return dispatcher.dispatch(id, input, context);
    },
  };
}

/** The resources of an MCP session: each read of the deck decided again, so a share that ends ends them. */
export function gatedSource(source: DeckSource, read: () => Promise<void>): DeckSource {
  const after =
    <TArgs extends unknown[], TOut>(run: (...args: TArgs) => Promise<TOut>) =>
    async (...args: TArgs): Promise<TOut> => {
      await read();
      return run(...args);
    };
  return {
    ...source,
    manifest: after(source.manifest),
    slides: after(source.slides),
    slide: after(source.slide),
    latestRender: after(source.latestRender),
    latestSheet: after(source.latestSheet),
  };
}
