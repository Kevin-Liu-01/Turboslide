// The replay floor token (hardening HR-SD#1e): the stream position of the document the editor
// loader handed a reader without `history`, signed by the function so a later request of the same
// tab can prove it. The stream route reads it to keep the replay of `?since=` at or above it on
// the memory and blob tiers, and the ticket route reads it to sign the same position into
// a refreshed room ticket's `fl` on the do tier, where the Worker keeps the socket's replay at or
// above it. The token is `<seq>.<mac>`: 32 hex of an HMAC-SHA256 under the session secret (the
// key `clientIdMac` in room.ts signs client ids with) over the deck, the identity the request
// resolves to, the tier and the position. It proves a position to the identity that was handed
// it and to nobody else, and only on the tier whose numbering the position is in: a token from
// another identity, deck or tier, or one that does not parse, reads as no token. It rides the
// `x-turboslide-floor` header, never a query string, and is never logged.
import { createHmac } from 'node:crypto';

import { safeEqual } from '@turboslide/identity/safe-equal';

import { studioSessionSecret } from './auth/middleware';

/** What a floor token is bound to besides its position. */
export type ReplayFloorScope = {
  deckId: string;
  /** the identity the budgets key on (room.ts `RequestIdentity.identity`) */
  identity: string;
  /** the tier whose stream numbering the position is in */
  tier: string;
};

const TOKEN = /^(0|[1-9][0-9]{0,15})\.([0-9a-f]{32})$/;

function floorMac(scope: ReplayFloorScope, seq: number, secret: string): string {
  return createHmac('sha256', secret)
    .update(`floor\n${scope.deckId}\n${scope.identity}\n${scope.tier}\n${seq}`)
    .digest('hex')
    .slice(0, 32);
}

/** Signs a reader's floor: the position of the document the loader handed it. */
export function mintReplayFloor(
  scope: ReplayFloorScope,
  seq: number,
  secret: string = studioSessionSecret(),
): string {
  if (!Number.isSafeInteger(seq) || seq < 0)
    throw new RangeError(`A replay floor is a non negative integer, not ${seq}`);
  return `${seq}.${floorMac(scope, seq, secret)}`;
}

/** The position a floor token proves for this scope, or undefined when it proves none. */
export function readReplayFloor(
  token: string | null | undefined,
  scope: ReplayFloorScope,
  secret: string = studioSessionSecret(),
): number | undefined {
  if (typeof token !== 'string') return undefined;
  const match = TOKEN.exec(token.trim());
  if (match === null) return undefined;
  const seq = Number(match[1]);
  if (!Number.isSafeInteger(seq)) return undefined;
  return safeEqual(match[2] ?? '', floorMac(scope, seq, secret)) ? seq : undefined;
}
