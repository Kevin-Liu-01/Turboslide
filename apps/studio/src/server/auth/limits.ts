// The one limiter's counters in the accounts database (HR-SA#3, AUTH-8; docs/hardening/HARDENING.md
// 4.3): the table `ts_limits` (schema.ts; apps/realtime-worker/migrations/0005_limits.sql on D1)
// behind ratelimit.ts `dbLimiter`, which serves the sign in limits of better-auth.ts, the
// application quotas and the spent download tokens of tokens.ts. Before it each of the three
// counted in the memory of one function instance, so a caller spread over instances passed every
// limit.
//
// One statement counts: an upsert that adds the cost to the key's window, or starts a new window
// when the stored one has ended, and that writes nothing when the sum would pass the limit. Its
// `returning` names the row it wrote, so a refusal is the answer with no row, and only a refusal
// reads the row once more for its reset time. A fixed window per key; the key is stored as its
// SHA-256 digest, never as the caller's address or ids. Statements here go through the D1 proxy
// and must be in the Worker's list (apps/realtime-worker/src/db-statements.json, recorded by
// record-statements.test.ts).
import { sql } from 'kysely';
import type { Kysely } from 'kysely';

import { sha256Hex } from '@turboslide/identity/sha256';

import type { AuthDatabase } from './schema.ts';

export type LimitTake = {
  /** True when the cost was counted; false when it would pass the limit and nothing was written. */
  ok: boolean;
  count: number;
  resetAt: number;
};

/** The counters the shared limiter needs (ratelimit.ts `dbLimiter`), by the counted key. */
export type LimitStore = {
  take: (
    key: string,
    cost: number,
    limit: number,
    windowMs: number,
    now: number,
  ) => Promise<LimitTake>;
  release: (key: string, cost: number) => Promise<void>;
  /** Deletes the rows whose window ended before `before`. */
  prune: (before: number) => Promise<void>;
};

/** The stored key: the SHA-256 hex of the counted key. */
export function limitDigest(key: string): string {
  return sha256Hex(`turboslide limit:${key}`);
}

export function dbLimitStore(db: Kysely<AuthDatabase>): LimitStore {
  return {
    async take(key, cost, limit, windowMs, now) {
      const digest = limitDigest(key);
      const row = await db
        .insertInto('ts_limits')
        .values({ key: digest, count: cost, reset_at: now + windowMs })
        .onConflict((oc) =>
          oc
            .column('key')
            .doUpdateSet({
              count: sql<number>`case when ${sql.ref('ts_limits.reset_at')} <= ${now} then ${sql.ref('excluded.count')} else ${sql.ref('ts_limits.count')} + ${sql.ref('excluded.count')} end`,
              reset_at: sql<number>`case when ${sql.ref('ts_limits.reset_at')} <= ${now} then ${sql.ref('excluded.reset_at')} else ${sql.ref('ts_limits.reset_at')} end`,
            })
            .where(
              sql<boolean>`${sql.ref('ts_limits.reset_at')} <= ${now} or ${sql.ref('ts_limits.count')} + ${sql.ref('excluded.count')} <= ${limit}`,
            ),
        )
        .returning(['count', 'reset_at'])
        .executeTakeFirst();
      if (row !== undefined) return { ok: true, count: row.count, resetAt: Number(row.reset_at) };
      const held = await db
        .selectFrom('ts_limits')
        .select(['count', 'reset_at'])
        .where('key', '=', digest)
        .executeTakeFirst();
      return {
        ok: false,
        count: held?.count ?? limit,
        resetAt: held === undefined ? now + windowMs : Number(held.reset_at),
      };
    },
    async release(key, cost) {
      await db
        .updateTable('ts_limits')
        .set({
          count: sql<number>`case when ${sql.ref('count')} > ${cost} then ${sql.ref('count')} - ${cost} else 0 end`,
        })
        .where('key', '=', limitDigest(key))
        .execute();
    },
    async prune(before) {
      await db.deleteFrom('ts_limits').where('reset_at', '<', before).execute();
    },
  };
}
