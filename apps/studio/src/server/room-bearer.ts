// The bearer between the two hosts (docs/CLOUDFLARE.md 3.3): `TURBOSLIDE_ROOM_BEARER`, carried as
// `Authorization: Bearer` by the function's calls to the Worker and by the object's calls to the
// function (the checkpoint and seed routes). Compared in constant time through `node:crypto`; a
// deployment without the variable refuses every call, so nothing commits under an empty bearer.
// While a rotation is in flight `TURBOSLIDE_ROOM_BEARER_PREVIOUS` is accepted too and never sent
// (docs/hosting.md 13.8), so the object's calls land whichever value the Worker sends.
import { createHash, timingSafeEqual } from 'node:crypto';

import { ROOM_BEARER_PREVIOUS_VARIABLE, ROOM_BEARER_VARIABLE } from '@turboslide/realtime/select';

type Env = Readonly<Record<string, string | undefined>>;

const digest = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest();

/** True when the request carries the room bearer the environment holds, or its rotation partner. */
export function roomBearerMatches(request: Request, env: Env = process.env): boolean {
  const current = env[ROOM_BEARER_VARIABLE];
  if (current === undefined || current === '') return false;
  const partner = env[ROOM_BEARER_PREVIOUS_VARIABLE];
  const expected = partner === undefined || partner === '' ? [current] : [current, partner];
  const header = request.headers.get('authorization');
  if (header === null) return false;
  const space = header.indexOf(' ');
  if (space <= 0 || header.slice(0, space).toLowerCase() !== 'bearer') return false;
  const given = digest(header.slice(space + 1).trim());
  // every expected value is compared, so the time does not say which one matched
  return expected.map((want) => timingSafeEqual(given, digest(want))).includes(true);
}
