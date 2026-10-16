// The app's health check (hardening HR-O#3, RELIABILITY-14; docs/hardening/HARDENING.md 4.8), the
// reading behind `GET /api/health`. Before it the app had no route that read the store:
// `getServerHealth` in health.ts answers a marker and the Node version for the client bundle
// check, and stays as it is (decks.index.tsx imports that module into the client, so the store
// and the database stay out of it and live here).
//
// Two checks decide `ok`, each with its own deadline: the store heads the canary deck's manifest
// through the deployment's own layout (`hasStoredDeck`, the head every deck route makes; the deck
// is `TURBOSLIDE_CANARY_DECK`, `gt-brand` by default), and the accounts database answers the
// schema version read every cold instance sends (an allowlisted statement on D1). Beside them, on
// a deployment with the backup store, the night's `backup/<day>/done.json` and the month's
// `backup/drills/<yyyy-mm>.json`, which the realtime Worker's check turns into the backup and
// drill alerts. A reading is kept HEALTH_CACHE_MS per instance and concurrent calls share one,
// so the route costs at most two store reads and one database read per instance per 30 s
// whoever calls it. The public answer is `{ ok, commit }`; the details (which check, how long,
// the error's name, never its message) go to a caller with the room bearer, which the Worker's
// scheduled check sends.
import { AUTH_SCHEMA_KEY } from './auth/schema';
import { DRILLS_PREFIX, backupBlobClient, backupDay, dayPrefix } from './backup';
import type { BackupDone, DrillRecord } from './backup';
import { buildCommit } from './build-commit';
import { hasStoredDeck } from './root';

type Env = Readonly<Record<string, string | undefined>>;

export const CANARY_DECK_VARIABLE = 'TURBOSLIDE_CANARY_DECK';
export const DEFAULT_CANARY_DECK = 'gt-brand';
/** How long one reading is kept per instance. */
export const HEALTH_CACHE_MS = 30_000;
/** How long one check waits before it fails with `TimeoutError`. */
export const CHECK_MS = 8_000;

export type HealthCheck = { ok: boolean; ms: number; reason?: string };

export type HealthReading = {
  ok: boolean;
  commit: string | null;
  checkedAt: string;
  checks: {
    store: HealthCheck & { canary: string };
    accounts: HealthCheck & { engine: 'd1' | 'sqlite' | 'postgres' | 'none' | 'unknown' };
  };
  /** the night's backup by its UTC day; null on a deployment without the backup store */
  backup: { day: string; done: boolean; failed: number; reason?: string } | null;
  /** this month's restore drill; null before it ran or without the backup store */
  drill: { month: string; ok: boolean | null } | null;
};

export type HealthDeps = {
  env: Env;
  now: () => number;
  /** heads the canary deck's manifest: true when it is there */
  hasDeck: (deckId: string) => Promise<boolean>;
  /** reads the schema version row; null when the deployment has no accounts database */
  accounts: () => Promise<{ engine: 'd1' | 'sqlite' | 'postgres' } | null>;
  /** reads one JSON document of the backup store; null without the store */
  backupJson: ((pathname: string) => Promise<unknown>) | null;
  /** each check's deadline; CHECK_MS when absent */
  checkMs?: number;
};

/** A deadline around one check, so a store that hangs fails the check instead of the route. */
async function timed<T>(
  ms: number,
  run: () => Promise<T>,
): Promise<{ value?: T; ms: number; reason?: string }> {
  const started = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`no answer in ${ms} ms`);
          error.name = 'TimeoutError';
          reject(error);
        }, ms);
      }),
    ]);
    return { value, ms: Math.round(performance.now() - started) };
  } catch (error) {
    return {
      ms: Math.round(performance.now() - started),
      reason: error instanceof Error ? error.name.slice(0, 60) : 'failed',
    };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** One reading of every check (no cache). */
export async function readHealth(deps: HealthDeps): Promise<HealthReading> {
  const now = deps.now();
  const canary = deps.env[CANARY_DECK_VARIABLE]?.trim() || DEFAULT_CANARY_DECK;
  const day = backupDay(now);
  const month = day.slice(0, 7);
  const ms = deps.checkMs ?? CHECK_MS;
  const backupJson = deps.backupJson;
  const [store, accounts, done, drill] = await Promise.all([
    timed(ms, () => deps.hasDeck(canary)),
    timed(ms, () => deps.accounts()),
    backupJson === null
      ? Promise.resolve(null)
      : timed(ms, () => backupJson(`${dayPrefix(day)}done.json`)),
    backupJson === null
      ? Promise.resolve(null)
      : timed(ms, () => backupJson(`${DRILLS_PREFIX}${month}.json`)),
  ]);
  const storeCheck: HealthReading['checks']['store'] =
    store.reason !== undefined
      ? { ok: false, ms: store.ms, canary, reason: store.reason }
      : store.value === true
        ? { ok: true, ms: store.ms, canary }
        : { ok: false, ms: store.ms, canary, reason: 'missing' };
  const accountsCheck: HealthReading['checks']['accounts'] =
    accounts.reason !== undefined
      ? { ok: false, ms: accounts.ms, engine: 'unknown', reason: accounts.reason }
      : { ok: true, ms: accounts.ms, engine: accounts.value?.engine ?? 'none' };
  const backup: HealthReading['backup'] =
    done === null
      ? null
      : done.reason !== undefined
        ? { day, done: false, failed: 0, reason: done.reason }
        : done.value === null || done.value === undefined
          ? { day, done: false, failed: 0 }
          : { day, done: true, failed: Number((done.value as BackupDone).failedCount ?? 0) };
  const drillRecord =
    drill === null ||
    drill.reason !== undefined ||
    drill.value === null ||
    drill.value === undefined
      ? null
      : (drill.value as DrillRecord);
  return {
    ok: storeCheck.ok && accountsCheck.ok,
    commit: buildCommit(deps.env),
    checkedAt: new Date(now).toISOString(),
    checks: { store: storeCheck, accounts: accountsCheck },
    backup,
    drill:
      drill === null
        ? null
        : drillRecord === null
          ? null
          : { month, ok: typeof drillRecord.ok === 'boolean' ? drillRecord.ok : null },
  };
}

/** The deployment's own checks: the store, the identity runtime's database, the backup store. */
export function deploymentHealthDeps(env: Env = process.env): HealthDeps {
  const backup = backupBlobClient(env);
  return {
    env,
    now: () => Date.now(),
    hasDeck: (deckId) => hasStoredDeck(deckId),
    accounts: async () => {
      // read inside the call: the identity runtime is heavy and server only
      const { identityRuntime } = await import('./auth/identity');
      const db = identityRuntime().db;
      if (db === null) return null;
      // the read every cold instance sends (auth/schema.ts `schemaIsCurrent`), so the Worker's
      // allowlist holds it, here without the swallowed error
      await db.db
        .selectFrom('ts_schema')
        .select('v')
        .where('k', '=', AUTH_SCHEMA_KEY)
        .executeTakeFirst();
      return { engine: db.kind };
    },
    backupJson:
      backup === null
        ? null
        : async (pathname) => {
            const found = await backup.get(pathname);
            return found === null
              ? null
              : (JSON.parse(new TextDecoder().decode(found.bytes)) as unknown);
          },
  };
}

const cache: { at: number; reading: Promise<HealthReading> | null } = { at: 0, reading: null };

/** The reading of this instance, at most HEALTH_CACHE_MS old; concurrent calls share one. */
export function cachedHealth(
  deps: () => HealthDeps = () => deploymentHealthDeps(),
  now: number = Date.now(),
): Promise<HealthReading> {
  if (cache.reading !== null && now - cache.at < HEALTH_CACHE_MS) return cache.reading;
  cache.at = now;
  cache.reading = readHealth(deps());
  return cache.reading;
}

/** Forgets the kept reading (tests). */
export function resetHealthCache(): void {
  cache.at = 0;
  cache.reading = null;
}

/** The public part of a reading: whether the app is well, and its build. */
export function publicHealth(reading: HealthReading): { ok: boolean; commit: string | null } {
  return { ok: reading.ok, commit: reading.commit };
}
