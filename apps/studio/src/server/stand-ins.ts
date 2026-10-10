import {
  STAND_IN_PREFIX,
  isStandIn,
  standInKey,
  standInOf,
  standInsWith,
} from '@turboslide/identity/stand-in';
import type { StandIns } from '@turboslide/identity/stand-in';
import { ROOM_SECRET_VARIABLE } from '@turboslide/realtime/select';

import { downloadSecret } from './tokens';

/**
 * Stand-ins for principal ids in the answers to a reader who may not share the deck (hardening
 * HR-SD#1, DATA-V2). A principal id names the person's deck index on the store
 * (`users/<id>/decks.json`), so before this one deck read by a viewer led to its owner's and its
 * collaborators' whole library. A reader without the `share` capability gets, in place of each
 * other person's id, a stand-in: `ref_` and 22 characters of an HMAC over the deck id and the
 * principal id (@turboslide/identity/stand-in, the one definition). The key comes from
 * `TURBOSLIDE_ROOM_SECRET` when it is set, the value the realtime Worker verifies the room tickets
 * with, so the Worker's deck room names a person on a deck as the studio's answers do (the fix
 * round after verifier pass 2, F2), and from `TURBOSLIDE_DOWNLOAD_SECRET` otherwise. It is the same
 * for one person on one deck on every instance, so the page's people map, the version rows and the
 * Share dialog's owner row still meet, and it differs between decks, so two decks never show that
 * they name the same person. It is no principal id: no store path, lookup or index takes it. The
 * reader's own ids stay as they are, because the page tells "You" by them.
 */

export { STAND_IN_PREFIX, isStandIn };
export type { StandIns };

let cached: { id: string; key: Uint8Array } | undefined;

/** The deployment's stand-in key, derived once per secret value. */
function key(env: NodeJS.ProcessEnv = process.env): Uint8Array {
  const room = env[ROOM_SECRET_VARIABLE];
  const secret = room !== undefined && room !== '' ? room : downloadSecret(env);
  const id = typeof secret === 'string' ? `room:${secret}` : `download:${secret.toString('hex')}`;
  if (cached === undefined || cached.id !== id) cached = { id, key: standInKey(secret) };
  return cached.key;
}

/** The stand-in of one principal on one deck. */
export function standInFor(deckId: string, principalId: string): string {
  return standInOf(key(), deckId, principalId);
}

export function standInsFor(deckId: string, own: Iterable<string | null | undefined>): StandIns {
  return standInsWith((principalId) => standInFor(deckId, principalId), own);
}

/**
 * The principal a stand-in names on a deck among the principals the deck knows, or undefined. A
 * reader who may not share writes a mention or an assignee with the stand-ins it read, and the
 * server stores the principal (comments.ts).
 */
export function principalOfStandIn(
  deckId: string,
  standIn: string,
  known: Iterable<string>,
): string | undefined {
  if (!isStandIn(standIn)) return undefined;
  for (const principalId of known)
    if (standInFor(deckId, principalId) === standIn) return principalId;
  return undefined;
}
