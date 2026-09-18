// Tier selection (gslides-parity SPEC-3 2.5): one place decides which realtime implementation a
// process runs, from the environment alone, in the shape of `selectStore`:
//
//   TURBOSLIDE_REALTIME=memory|redis|blob   an explicit choice wins (redis needs REDIS_URL)
//   REDIS_URL set                           redis
//   VERCEL set                              blob (hosted without a Redis store)
//   otherwise                               memory (a checkout, the tests, one process)
//
// The selection names the tier and the reason and never the URL: REDIS_URL carries a password
// and no log line or facts object may print it. The channel itself is constructed by the studio's
// server module from the selection (`memoryChannel`, `redisChannel` over a client, `blobChannel`
// over the deck store), so this file stays browser safe.
import type { RealtimeTier } from './channel.ts';
import { REALTIME_TIERS } from './channel.ts';

export const REALTIME_VARIABLE = 'TURBOSLIDE_REALTIME';
export const REDIS_URL_VARIABLE = 'REDIS_URL';

/** The title row's sentence on the blob tier (SPEC-3 2.5). */
// presence follows the store's shared roster record a few seconds behind on the blob tier since
// the focus round's cycle 3 (b6's presence-store.ts, wired in blob.ts); the live cursors still
// need a stream every instance shares
export const BLOB_TIER_NOTICE = 'Live cursors need a Redis store on this deployment';

export type Env = Readonly<Record<string, string | undefined>>;

export type RealtimeSelection = {
  tier: RealtimeTier;
  /** why this tier was chosen, for the facts and the logs; never a URL */
  reason: string;
  /** a Redis URL is present in the environment, whatever the tier */
  redis: boolean;
  /** the sentence the title row shows, or null when presence works across instances */
  notice: string | null;
};

export function isRealtimeTier(value: unknown): value is RealtimeTier {
  return typeof value === 'string' && (REALTIME_TIERS as ReadonlyArray<string>).includes(value);
}

function isSet(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}

export function hasRedisUrl(env: Env = process.env): boolean {
  return isSet(env[REDIS_URL_VARIABLE]);
}

function noticeFor(tier: RealtimeTier): string | null {
  return tier === 'blob' ? BLOB_TIER_NOTICE : null;
}

/**
 * The tier for this process. A TypeError names the problem when TURBOSLIDE_REALTIME holds an
 * unknown word or asks for redis without REDIS_URL, so a misconfigured deploy fails at the first
 * request with a message instead of running the wrong tier quietly.
 */
export function selectRealtime(env: Env = process.env): RealtimeSelection {
  const redis = hasRedisUrl(env);
  const forced = env[REALTIME_VARIABLE];
  if (isSet(forced)) {
    if (!isRealtimeTier(forced)) {
      throw new TypeError(
        `${REALTIME_VARIABLE} must be one of ${REALTIME_TIERS.join(', ')}, got ${JSON.stringify(forced)}`,
      );
    }
    if (forced === 'redis' && !redis) {
      throw new TypeError(
        `${REALTIME_VARIABLE}=redis needs ${REDIS_URL_VARIABLE} in the environment`,
      );
    }
    return {
      tier: forced,
      reason: `${REALTIME_VARIABLE}=${forced}`,
      redis,
      notice: noticeFor(forced),
    };
  }
  if (redis) return { tier: 'redis', reason: `${REDIS_URL_VARIABLE} is set`, redis, notice: null };
  if (isSet(env.VERCEL)) {
    return {
      tier: 'blob',
      reason: `VERCEL without ${REDIS_URL_VARIABLE}`,
      redis,
      notice: BLOB_TIER_NOTICE,
    };
  }
  return { tier: 'memory', reason: 'one process', redis, notice: null };
}
