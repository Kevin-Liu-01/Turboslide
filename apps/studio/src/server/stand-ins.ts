import { createHmac } from 'node:crypto';

import { isPrincipalId } from '@turboslide/identity/ids';

import { downloadSecret } from './tokens';

/**
 * Stand-ins for principal ids in the answers to a reader who may not share the deck (hardening
 * HR-SD#1, DATA-V2). A principal id names the person's deck index on the store
 * (`users/<id>/decks.json`), so before this one deck read by a viewer led to its owner's and its
 * collaborators' whole library. A reader without the `share` capability gets, in place of each
 * other person's id, a stand-in: `ref_` and 22 characters of an HMAC over the deck id and the
 * principal id under the deployment's signing secret (`TURBOSLIDE_DOWNLOAD_SECRET`). It is the
 * same for one person on one deck on every instance, so the page's people map, the version rows
 * and the Share dialog's owner row still meet, and it differs between decks, so two decks never
 * show that they name the same person. It is no principal id: no store path, lookup or index
 * takes it. The reader's own ids stay as they are, because the page tells "You" by them.
 */

export const STAND_IN_PREFIX = 'ref_';

/** The stand-in of one principal on one deck. */
export function standInFor(deckId: string, principalId: string): string {
  const mac = createHmac('sha256', downloadSecret())
    .update(`stand-in\n${deckId}\n${principalId}`)
    .digest('base64url');
  return `${STAND_IN_PREFIX}${mac.slice(0, 22)}`;
}

/** True for a stand-in this module makes. */
export function isStandIn(value: string): boolean {
  return value.startsWith(STAND_IN_PREFIX) && /^[A-Za-z0-9_-]{22}$/.test(value.slice(4));
}

/**
 * The mapping one answer applies: another principal's id (a person's or an agent key's) becomes
 * its stand-in; the reader's own ids, and every string that is no principal id (`seed`,
 * `legacy`, a round one author name), pass through.
 */
export type StandIns = (id: string) => string;

export function standInsFor(deckId: string, own: Iterable<string | null | undefined>): StandIns {
  const mine = new Set<string>();
  for (const id of own) if (typeof id === 'string' && id !== '') mine.add(id);
  const made = new Map<string, string>();
  return (id) => {
    if (mine.has(id) || !isPrincipalId(id)) return id;
    let standIn = made.get(id);
    if (standIn === undefined) {
      standIn = standInFor(deckId, id);
      made.set(id, standIn);
    }
    return standIn;
  };
}
