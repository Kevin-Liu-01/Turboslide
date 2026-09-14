// Small counters with a reset time (gslides-parity SPEC-3 7.6, 7.7; research 10 F43, F42):
// avatar uploads per identity per day, device code attempts per code, request access mails per
// deck per hour. Kept in the identity database's ts_quota table when there is one, so every
// instance sharing the database sees one count, and in memory otherwise. Not the rate limiter of
// 8.3 (B4's, over the realtime channel's budgets): these are product quotas with a day or an hour
// as the window and a handful of calls a day.
import type { Kysely } from 'kysely';

import type { AuthDatabase } from './schema.ts';

export type QuotaTake = { ok: boolean; count: number; limit: number; resetAt: string };

export type QuotaStore = {
  /** Counts one use of `key`; `ok` is false once the count passes `limit` inside the window. */
  take: (key: string, limit: number, windowMs: number, now?: Date) => Promise<QuotaTake>;
  /** The count without taking. */
  peek: (key: string, now?: Date) => Promise<number>;
  /** Forgets a key (a verified device code, a test). */
  reset: (key: string) => Promise<void>;
};

function windowEnd(now: Date, windowMs: number): string {
  return new Date(now.getTime() + windowMs).toISOString();
}

export function memoryQuotaStore(): QuotaStore {
  const rows = new Map<string, { count: number; resetAt: string }>();
  const live = (key: string, now: Date): { count: number; resetAt: string } | undefined => {
    const row = rows.get(key);
    if (row === undefined) return undefined;
    if (Date.parse(row.resetAt) <= now.getTime()) {
      rows.delete(key);
      return undefined;
    }
    return row;
  };
  return {
    take(key, limit, windowMs, now = new Date()) {
      const row = live(key, now) ?? { count: 0, resetAt: windowEnd(now, windowMs) };
      row.count += 1;
      rows.set(key, row);
      return Promise.resolve({
        ok: row.count <= limit,
        count: row.count,
        limit,
        resetAt: row.resetAt,
      });
    },
    peek: (key, now = new Date()) => Promise.resolve(live(key, now)?.count ?? 0),
    reset(key) {
      rows.delete(key);
      return Promise.resolve();
    },
  };
}

export function dbQuotaStore(db: Kysely<AuthDatabase>): QuotaStore {
  const read = async (
    key: string,
    now: Date,
  ): Promise<{ count: number; resetAt: string } | null> => {
    const row = await db
      .selectFrom('ts_quota')
      .selectAll()
      .where('key', '=', key)
      .executeTakeFirst();
    if (row === undefined) return null;
    if (Date.parse(row.resetAt) <= now.getTime()) {
      await db.deleteFrom('ts_quota').where('key', '=', key).execute();
      return null;
    }
    return { count: row.count, resetAt: row.resetAt };
  };
  return {
    async take(key, limit, windowMs, now = new Date()) {
      const row = await read(key, now);
      if (row === null) {
        const resetAt = windowEnd(now, windowMs);
        await db.insertInto('ts_quota').values({ key, count: 1, resetAt }).execute();
        return { ok: 1 <= limit, count: 1, limit, resetAt };
      }
      const count = row.count + 1;
      await db.updateTable('ts_quota').set({ count }).where('key', '=', key).execute();
      return { ok: count <= limit, count, limit, resetAt: row.resetAt };
    },
    async peek(key, now = new Date()) {
      return (await read(key, now))?.count ?? 0;
    },
    async reset(key) {
      await db.deleteFrom('ts_quota').where('key', '=', key).execute();
    },
  };
}

export const DAY_MS = 24 * 60 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;
