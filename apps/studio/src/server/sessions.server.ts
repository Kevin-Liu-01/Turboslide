import { getRequest } from '@tanstack/react-start/server';

import type { StudioSession } from '@turboslide/agent/http/sessions';

import type { RequestIdentity } from './auth/identity';
import type { SessionBinding, SessionDirectory } from './sessions';
import { memorySessionDirectory, redisSessionDirectory } from './sessions';

/**
 * The server only half of the attached pages (the integrator at merge 2; SPEC-3 3.11, 7.4): the
 * process wide session directory over the room's Redis commands and the identity of the request a
 * server function runs in. Kept out of sessions.ts because that module is in the client's graph
 * (components/useStudioSession.ts imports its server function wrappers) and the production
 * build's import protection refuses `@tanstack/react-start/server` and the room there; the `.server`
 * suffix makes an accidental client import fail at build time.
 */

const DIRECTORY = Symbol.for('turboslide.studio.sessions.directory');

/** The process wide directory: Redis on the redis tier, memory elsewhere. */
export async function sessionDirectory(): Promise<SessionDirectory> {
  const holder = globalThis as unknown as Record<symbol, SessionDirectory | undefined>;
  if (holder[DIRECTORY] === undefined) {
    const room = await import('./room');
    const kv = room.redisCommands();
    holder[DIRECTORY] = kv === null ? memorySessionDirectory() : redisSessionDirectory(kv);
  }
  return holder[DIRECTORY];
}

/** The identity of the request a server function runs in, or the unknown visitor outside one. */
export async function identityOfRequest(): Promise<{
  identity: string;
  kind: SessionBinding['kind'];
}> {
  try {
    const room = await import('./room');
    const identity = await room.requestIdentity(getRequest());
    const kind: SessionBinding['kind'] =
      identity.kind === 'agent'
        ? 'agent'
        : identity.kind === 'signedIn'
          ? 'account'
          : identity.kind === 'anonymous'
            ? 'anonymous'
            : 'unknown';
    return { identity: identity.identity, kind };
  } catch {
    return { identity: 'unknown', kind: 'unknown' };
  }
}

/** The pages a principal has attached, across instances (`account.sessions`' studio rows). */
export async function attachedPagesOf(identity: string): Promise<SessionBinding[]> {
  return (await sessionDirectory()).forIdentity(identity);
}

/**
 * Whether the request may attach a page to a deck (security hotfix H3, DATA-1: a page attached to
 * any deck and heard the commands an agent sent that deck): the read cell, except an unsaved
 * draft of /new, which nothing can read yet. A refusal reads as the store's missing deck.
 */
export async function admitAttach(deckId: string): Promise<void> {
  const root = await import('./root');
  if (await root.isUnsavedDraft(deckId)) return;
  const room = await import('./room');
  const identity = await room.requestIdentity(getRequest());
  const decision = await room.decideFor(identity, deckId, 'read', 'session.attach');
  if (!decision.ok) throw new RangeError(`No deck ${deckId}`);
}

/** Whose attached pages a caller reaches: all of them (`principalId` undefined), its own, or none. */
export type ViewScope = { allowed: boolean; principalId: string | undefined };

/**
 * Whose pages a caller may drive and list (security hotfix H3): every page for the deployment's
 * admin (the bootstrap bearer, a checkout's holder, an admin account, an admin account's key with
 * the admin scope), else the pages attached as the caller's principal (an API key's owner), else
 * none.
 */
export function viewScopeOf(facts: {
  identity: Pick<RequestIdentity, 'kind' | 'ctx'> | null;
  caller: { admin?: boolean };
}): ViewScope {
  const id = facts.identity;
  if (id === null) return { allowed: facts.caller.admin === true, principalId: undefined };
  const admin =
    id.kind === 'bootstrap' ||
    id.kind === 'checkout' ||
    (id.ctx.principal?.admin === true &&
      (id.kind !== 'agent' || id.ctx.agent?.scopes.includes('admin') === true));
  if (admin) return { allowed: true, principalId: undefined };
  const principalId = id.ctx.principal?.id ?? id.ctx.agent?.ownerId;
  return principalId === undefined
    ? { allowed: false, principalId: undefined }
    : { allowed: true, principalId };
}

/**
 * The attached pages a caller may see (`/api/agent`'s `sessions`; H3): every page for the
 * admin, the caller's own otherwise, none for a caller with no principal. The session id is a
 * capability (the poll and the answer take it alone), so another person's page is never listed.
 */
export function visibleSessions(
  sessions: readonly StudioSession[],
  scope: ViewScope,
): StudioSession[] {
  if (!scope.allowed) return [];
  if (scope.principalId === undefined) return [...sessions];
  return sessions.filter((session) => session.principalId === scope.principalId);
}
