// Tier selection (gslides-parity SPEC-3 2.5; the Cloudflare move, docs/CLOUDFLARE.md 3.6.1): one
// place decides which realtime implementation a process runs, from the environment alone, in the
// shape of `selectStore`:
//
//   TURBOSLIDE_REALTIME=memory|blob|do   an explicit choice wins (do needs TURBOSLIDE_ROOM_HOST,
//                                       TURBOSLIDE_ROOM_SECRET and TURBOSLIDE_ROOM_BEARER)
//   TURBOSLIDE_ROOM_HOST set            do (the realtime Worker)
//   VERCEL set                          blob (hosted without a Worker)
//   otherwise                           memory (a checkout, the tests, one process)
//
// The Redis tier and its `REDIS_URL` left in hardening HR-C#8 (CLEANUP-6). The selection names the
// tier and the reason and never a secret: the room secret and the bearer are secrets, and no log
// line or facts object may print them. The channel itself is constructed by the studio's server
// module from the selection (`memoryChannel`, `blobChannel` over the deck store, `doChannel` over
// fetch), so this file stays browser safe.
import type { RealtimeTier } from './channel.ts';
import { REALTIME_TIERS } from './channel.ts';

export const REALTIME_VARIABLE = 'TURBOSLIDE_REALTIME';
/** The realtime Worker's host (`turboslide-realtime.<subdomain>.workers.dev`, or `127.0.0.1:87<lane>` on a checkout). */
export const ROOM_HOST_VARIABLE = 'TURBOSLIDE_ROOM_HOST';
/** The ticket HMAC key both hosts hold (docs/CLOUDFLARE.md 3.3). */
export const ROOM_SECRET_VARIABLE = 'TURBOSLIDE_ROOM_SECRET';
/** The bearer between the two hosts, both directions (3.3). */
export const ROOM_BEARER_VARIABLE = 'TURBOSLIDE_ROOM_BEARER';
/**
 * A second room bearer the app accepts on the object's calls while a rotation is in flight, and
 * never sends (docs/hosting.md 13.8): the coming value before the Worker switches, the old one
 * after.
 */
export const ROOM_BEARER_PREVIOUS_VARIABLE = 'TURBOSLIDE_ROOM_BEARER_PREVIOUS';
/** `1` makes the room URL `ws://` and the Worker calls `http://` (a checkout against `wrangler dev`). */
export const ROOM_INSECURE_VARIABLE = 'TURBOSLIDE_ROOM_INSECURE';

/** The title row's sentence on the blob tier (SPEC-3 2.5). */
// presence follows the store's shared roster record a few seconds behind on the blob tier since
// the focus round's cycle 3 (b6's presence-store.ts, wired in blob.ts); the live cursors still
// need a stream every instance shares
export const BLOB_TIER_NOTICE = 'Live cursors need the realtime Worker on this deployment';

export type Env = Readonly<Record<string, string | undefined>>;

export type RealtimeSelection = {
  tier: RealtimeTier;
  /** why this tier was chosen, for the facts and the logs; never a secret */
  reason: string;
  /** the realtime Worker's three variables are all present in the environment, whatever the tier (3.6.1) */
  room: boolean;
  /** the sentence the title row shows, or null when presence works across instances */
  notice: string | null;
};

export function isRealtimeTier(value: unknown): value is RealtimeTier {
  return typeof value === 'string' && (REALTIME_TIERS as ReadonlyArray<string>).includes(value);
}

function isSet(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}

/** True when the host, the ticket secret and the bearer are all set (the `do` tier's three variables). */
export function hasRoomVariables(env: Env = process.env): boolean {
  return (
    isSet(env[ROOM_HOST_VARIABLE]) &&
    isSet(env[ROOM_SECRET_VARIABLE]) &&
    isSet(env[ROOM_BEARER_VARIABLE])
  );
}

/** The names of the three Worker variables that are missing, for the TypeError's sentence. */
function missingRoomVariables(env: Env): string[] {
  return [ROOM_HOST_VARIABLE, ROOM_SECRET_VARIABLE, ROOM_BEARER_VARIABLE].filter(
    (name) => !isSet(env[name]),
  );
}

function noticeFor(tier: RealtimeTier): string | null {
  return tier === 'blob' ? BLOB_TIER_NOTICE : null;
}

/**
 * The tier for this process. A TypeError names the problem when TURBOSLIDE_REALTIME holds an
 * unknown word (`redis` among them since HR-C#8) or asks for `do` without the Worker's three
 * variables, so a misconfigured deploy fails at the first request with a message instead of
 * running the wrong tier quietly.
 */
export function selectRealtime(env: Env = process.env): RealtimeSelection {
  const room = hasRoomVariables(env);
  const forced = env[REALTIME_VARIABLE];
  if (isSet(forced)) {
    if (!isRealtimeTier(forced)) {
      throw new TypeError(
        `${REALTIME_VARIABLE} must be one of ${REALTIME_TIERS.join(', ')}, got ${JSON.stringify(forced)}`,
      );
    }
    if (forced === 'do' && !room) {
      throw new TypeError(
        `${REALTIME_VARIABLE}=do needs ${missingRoomVariables(env).join(', ')} in the environment`,
      );
    }
    return {
      tier: forced,
      reason: `${REALTIME_VARIABLE}=${forced}`,
      room,
      notice: noticeFor(forced),
    };
  }
  if (isSet(env[ROOM_HOST_VARIABLE])) {
    if (!room) {
      throw new TypeError(
        `${ROOM_HOST_VARIABLE} is set but ${missingRoomVariables(env).join(', ')} ${missingRoomVariables(env).length === 1 ? 'is' : 'are'} not; the do tier needs all three`,
      );
    }
    return { tier: 'do', reason: `${ROOM_HOST_VARIABLE} is set`, room, notice: null };
  }
  if (isSet(env.VERCEL)) {
    return {
      tier: 'blob',
      reason: `VERCEL without ${ROOM_HOST_VARIABLE}`,
      room,
      notice: BLOB_TIER_NOTICE,
    };
  }
  return { tier: 'memory', reason: 'one process', room, notice: null };
}
