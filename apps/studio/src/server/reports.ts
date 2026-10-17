// The daily counts of the reports (hardening HR-O#2c, RELIABILITY-14; docs/hardening/HARDENING.md
// 4.8): every line `/api/x/errors` accepts and every CSP report `/api/x/csp/report` reads adds one
// to its row of `ts_reports` in the accounts database, by UTC day, kind, route and key. The log
// keeps a line for a day on the hosting plan; the counts stay 30 days and answer "how many, since
// when, on which route" in one query, which is what the alert of HR-O#3 and the CSP gate of HR-W#4
// (seven days of zero `csp` counts on the document routes) read.
//
// On D1 the table comes from apps/realtime-worker/migrations/0006_reports.sql and the two
// statements below are in the Worker's allowlist (apps/realtime-worker/src/db-statements.json,
// recorded by auth/record-statements.test.ts). On SQLite (a checkout) this module makes the table
// on first use. No address, token or deck text is stored:
// the route is scrubbed (`@turboslide/report/scrub`), the key is a scrubbed message or a CSP
// directive with a host. A day holds at most REPORT_ROWS_PER_DAY rows: past it a known row still
// counts and a new key is in the log line alone. A count that fails is one log line and never
// changes the route's answer.
//
// Read on a deployment with `wrangler d1 execute turboslide-accounts --remote --command "select
// kind, route, key, count from ts_reports where day = '<yyyy-mm-dd>' order by count desc"` (add
// `--env preview` for the preview's database); nothing here reads the table back.
import { sql } from 'kysely';
import type { Kysely } from 'kysely';

import type { AuthDb } from './auth/db';
import type { AuthDatabase } from './auth/schema';

/** The kinds a count is kept under: the reporter's three and the CSP reports. */
export type ReportCountKind = 'error' | 'rejection' | 'route' | 'csp';

export type ReportCount = { kind: ReportCountKind; route: string; key: string };

/** The most rows one day holds (0006_reports.sql). */
export const REPORT_ROWS_PER_DAY = 500;
/** The days a count is kept. */
export const REPORT_KEEP_DAYS = 30;
/** The longest route and key stored, in characters. */
export const REPORT_FIELD_MAX = 80;

const DAY_MS = 86_400_000;

/** The UTC day of a clock time, `yyyy-mm-dd`. */
export function reportDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

/** The counting store over one accounts database. */
export type ReportCounter = {
  /** Adds one to the row of the entry's day, kind, route and key. */
  count: (entry: ReportCount, now?: number) => Promise<void>;
  /** Removes the days before `beforeDay`. */
  prune: (beforeDay: string) => Promise<void>;
};

/** The table on the engine that makes its own (SQLite); the D1 migration is the same. */
async function ensureTable(db: Kysely<AuthDatabase>): Promise<void> {
  await sql`create table if not exists "ts_reports" ("day" text not null, "kind" text not null, "route" text not null, "key" text not null, "count" integer not null default 0, primary key ("day", "kind", "route", "key"))`.execute(
    db,
  );
}

/**
 * The counter over the runtime's accounts database (`IdentityRuntime.db`). On D1 it sends the two
 * allowlisted statements alone; elsewhere the first call makes the table.
 */
export function reportCounter(auth: Pick<AuthDb, 'kind' | 'db'>): ReportCounter {
  let ready: Promise<void> | null = auth.kind === 'd1' ? Promise.resolve() : null;
  const table = (): Promise<void> => {
    ready ??= ensureTable(auth.db).catch((error: unknown) => {
      ready = null;
      throw error;
    });
    return ready;
  };
  return {
    async count(entry, now = Date.now()) {
      await table();
      const day = reportDay(now);
      const route = entry.route.slice(0, REPORT_FIELD_MAX);
      const key = entry.key.slice(0, REPORT_FIELD_MAX);
      // one statement: a known row always counts; a new row only while the day has room
      await sql`insert into "ts_reports" ("day", "kind", "route", "key", "count") select ${day}, ${entry.kind}, ${route}, ${key}, 1 where (select count(*) from "ts_reports" where "day" = ${day}) < ${REPORT_ROWS_PER_DAY} or exists (select 1 from "ts_reports" where "day" = ${day} and "kind" = ${entry.kind} and "route" = ${route} and "key" = ${key}) on conflict ("day", "kind", "route", "key") do update set "count" = "ts_reports"."count" + "excluded"."count"`.execute(
        auth.db,
      );
    },
    async prune(beforeDay) {
      await table();
      await sql`delete from "ts_reports" where "day" < ${beforeDay}`.execute(auth.db);
    },
  };
}

type CounterSource = () => Pick<AuthDb, 'kind' | 'db'> | null;

const state: { source: CounterSource | null; counter: ReportCounter | null; prunedDay: string } = {
  source: null,
  counter: null,
  prunedDay: '',
};

/** Binds where the counts go (tests; the default is the identity runtime's database). */
export function bindReportCounts(source: CounterSource | null): void {
  state.source = source;
  state.counter = null;
  state.prunedDay = '';
}

async function defaultSource(): Promise<Pick<AuthDb, 'kind' | 'db'> | null> {
  // read inside the call: the identity runtime is server only and heavy, so a module that
  // imports this one does not build it until a report arrives
  const { identityRuntime } = await import('./auth/identity');
  return identityRuntime().db;
}

/**
 * Adds one to an entry's row, and once a day per instance removes the days past
 * REPORT_KEEP_DAYS. Never throws: a database that does not answer is one line in the log.
 */
export async function countReport(entry: ReportCount, now = Date.now()): Promise<boolean> {
  try {
    if (state.counter === null) {
      const db = state.source !== null ? state.source() : await defaultSource();
      if (db === null) return false;
      state.counter = reportCounter(db);
    }
    await state.counter.count(entry, now);
    const day = reportDay(now);
    if (state.prunedDay !== day) {
      state.prunedDay = day;
      await state.counter.prune(reportDay(now - REPORT_KEEP_DAYS * DAY_MS));
    }
    return true;
  } catch (error) {
    console.error(
      JSON.stringify({
        source: 'server',
        event: 'report.count.failed',
        kind: entry.kind,
        error: error instanceof Error ? error.name : 'unknown',
      }),
    );
    return false;
  }
}
