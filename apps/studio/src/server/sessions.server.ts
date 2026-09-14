import { getRequest } from '@tanstack/react-start/server';

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
