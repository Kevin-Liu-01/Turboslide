// The bearer between the two hosts (docs/CLOUDFLARE.md 3.3): `TURBOSLIDE_ROOM_BEARER`, carried as
// `Authorization: Bearer` by the function's calls to the Worker and by the object's calls to the
// function (the checkpoint and seed routes). Compared in constant time through `node:crypto`; a
// deployment without the variable refuses every call, so nothing commits under an empty bearer.
import { timingSafeEqual } from 'node:crypto';

import { ROOM_BEARER_VARIABLE } from '@turboslide/realtime/select';

type Env = Readonly<Record<string, string | undefined>>;

/** True when the request carries the room bearer the environment holds. */
export function roomBearerMatches(request: Request, env: Env = process.env): boolean {
  const expected = env[ROOM_BEARER_VARIABLE];
  if (expected === undefined || expected === '') return false;
  const header = request.headers.get('authorization');
  if (header === null) return false;
  const space = header.indexOf(' ');
  if (space <= 0 || header.slice(0, space).toLowerCase() !== 'bearer') return false;
  const given = Buffer.from(header.slice(space + 1).trim(), 'utf8');
  const want = Buffer.from(expected, 'utf8');
  return given.length === want.length && timingSafeEqual(given, want);
}
