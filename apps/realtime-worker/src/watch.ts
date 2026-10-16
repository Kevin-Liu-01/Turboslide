// The Worker's scheduled check (hardening HR-O#3, RELIABILITY-14, CRIT-M10; docs/hardening/
// HARDENING.md 4.8). Before it nothing read production between pushes: the guard checks a push
// from Kevin's machine, and a failure afterwards reached no person. Every five minutes, beside the
// sweep (wrangler.jsonc's cron, index.ts `scheduled`), the Worker reads the app's
// `GET /api/health` (the canary deck's manifest in the store, the accounts database, the night's
// backup and the month's restore drill; apps/studio/src/server/health-check.ts) under the room
// bearer, and its own state (its database answers, the deck objects reach the app), and raises
// three kinds of incident:
//
//   health  a failing read twice in a row; the incident starts at the first of them
//   backup  the night's backup not done, or done with failures, at 06:00 UTC; one per day
//   drill   the month's restore drill recorded `ok: false`; one per month
//
// An incident sends one mail through `@turboslide/report/alert` (Resend with the Worker's own
// key, never the studio's mailer) and no other while it stays open; it closes when the check
// passes again, with no mail. Mails of one kind are at least ALERT_FLOOR_MS apart: an incident
// that opens sooner after the last mail of its kind waits, and mails once the hour has passed if
// it is still open. A send that fails is tried again at the next check. The state lives in
// `rt_flags` (`watch.health` and `alert.<kind>`, names the `/control/flags` grammar refuses, so
// no hand write can forge them). Without the key or the address an incident is a line at error,
// once, and `/health` answers it under `alerts`.
import { alertChannel, sendAlert } from '@turboslide/report/alert';
import type { AlertChannel, AlertMail, AlertSent } from '@turboslide/report/alert';

import { callbacksState, readFlags } from './control.ts';

export type WatchKind = 'health' | 'backup' | 'drill';

/** The consecutive failing reads: `<count>:<first failing ms>`. */
export const WATCH_HEALTH_ROW = 'watch.health';
/** `alert.<kind>`: `<open|pending|closed>:<incident>:<last mail ms>`. */
export const ALERT_ROW_PREFIX = 'alert.';
/** Failing reads in a row that open a health incident. */
export const FAILS_TO_ALERT = 2;
/** The least time between two mails of one kind. */
export const ALERT_FLOOR_MS = 3_600_000;
/** The hour (UTC) by which the night's backup is done (its cron runs 03:00 to 05:59). */
export const BACKUP_DUE_HOUR_UTC = 6;
/** How long the read of the app's health waits. */
export const HEALTH_READ_MS = 10_000;

/** The parts of the app's `/api/health` answer the check reads. */
export type AppHealth = {
  ok: boolean;
  checks?: Record<string, { ok: boolean; reason?: string }>;
  backup?: { day: string; done: boolean; failed: number } | null;
  drill?: { month: string; ok: boolean | null } | null;
};

export type WatchEnv = {
  ACCOUNTS: D1Database;
  TURBOSLIDE_APP_ORIGIN?: string;
  TURBOSLIDE_ROOM_BEARER?: string;
  VERCEL_AUTOMATION_BYPASS_SECRET?: string;
  TURBOSLIDE_ALERT_RESEND_KEY?: string;
  TURBOSLIDE_ALERT_TO?: string;
  TURBOSLIDE_ALERT_FROM?: string;
};

export type WatchDeps = {
  fetch: typeof fetch;
  now: () => number;
  send: (
    channel: Extract<AlertChannel, { configured: true }>,
    mail: AlertMail,
  ) => Promise<AlertSent>;
  log: (line: Record<string, unknown>) => void;
};

/** What one check decided per kind: nothing, a mail, a wait, an incident closed. */
export type WatchOutcome =
  'ok' | 'counting' | 'sent' | 'held' | 'waiting' | 'failed' | 'unsent' | 'closed' | 'unknown';

export type WatchResult = {
  failing: string[];
  outcomes: Record<WatchKind, WatchOutcome>;
};

type AlertRow = { state: 'open' | 'pending' | 'closed'; incident: string; mailedAt: number };

function parseAlertRow(value: string | undefined): AlertRow | null {
  if (value === undefined) return null;
  const [state, incident, mailedAt] = value.split(':');
  if (state !== 'open' && state !== 'pending' && state !== 'closed') return null;
  const at = Number(mailedAt);
  return { state, incident: incident ?? '', mailedAt: Number.isFinite(at) ? at : 0 };
}

async function writeRow(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare(
      'INSERT INTO rt_flags (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v',
    )
    .bind(key, value)
    .run();
}

function defaultDeps(): WatchDeps {
  return {
    fetch: (input, init) => fetch(input, init),
    now: () => Date.now(),
    send: (channel, mail) => sendAlert(channel, mail),
    log: (line) => console.error(JSON.stringify(line)),
  };
}

function hostOf(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}

function utc(at: number): string {
  return `${new Date(at).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/** The app's health answer, or why it could not be read. */
async function readAppHealth(
  env: WatchEnv,
  deps: WatchDeps,
): Promise<{ health: AppHealth | null; failing: string[] }> {
  const origin = (env.TURBOSLIDE_APP_ORIGIN ?? '').replace(/\/$/, '');
  if (origin === '') return { health: null, failing: [] };
  const bypass = env.VERCEL_AUTOMATION_BYPASS_SECRET;
  try {
    const response = await deps.fetch(`${origin}/api/health`, {
      headers: {
        authorization: `Bearer ${env.TURBOSLIDE_ROOM_BEARER ?? ''}`,
        ...(bypass !== undefined && bypass !== '' ? { 'x-vercel-protection-bypass': bypass } : {}),
      },
      signal: AbortSignal.timeout(HEALTH_READ_MS),
    });
    const body = (await response.json().catch(() => null)) as AppHealth | null;
    if (body === null || typeof body.ok !== 'boolean')
      return {
        health: null,
        failing: [`the app's health check answers ${response.status} with no reading`],
      };
    const failing = Object.entries(body.checks ?? {})
      .filter(([, check]) => !check.ok)
      .map(([name, check]) => `the app's ${name} check (${check.reason ?? 'failed'})`);
    if (!body.ok && failing.length === 0)
      failing.push(`the app's health check answers ${response.status}`);
    return { health: body, failing };
  } catch (error) {
    return {
      health: null,
      failing: [
        `the app's health check does not answer (${error instanceof Error ? error.name : 'failed'})`,
      ],
    };
  }
}

/**
 * Raises or keeps an incident of one kind: the first mail of an incident when the floor allows
 * and the channel is set, nothing more while it stays open.
 */
async function raise(
  env: WatchEnv,
  deps: WatchDeps,
  rows: Record<string, string>,
  kind: WatchKind,
  incident: string,
  mail: AlertMail,
): Promise<WatchOutcome> {
  const key = `${ALERT_ROW_PREFIX}${kind}`;
  const row = parseAlertRow(rows[key]);
  if (row !== null && row.state === 'open' && row.incident === incident) return 'held';
  const now = deps.now();
  const lastMail = row?.mailedAt ?? 0;
  if (now - lastMail < ALERT_FLOOR_MS) {
    // a check that keeps waiting finds its row written and writes nothing
    if (rows[key] !== `pending:${incident}:${lastMail}`)
      await writeRow(env.ACCOUNTS, key, `pending:${incident}:${lastMail}`);
    if (row?.state !== 'pending' || row.incident !== incident)
      deps.log({ level: 'error', message: 'alert.waiting', kind, incident, subject: mail.subject });
    return 'waiting';
  }
  const channel = alertChannel(env);
  if (!channel.configured) {
    await writeRow(env.ACCOUNTS, key, `open:${incident}:${lastMail}`);
    deps.log({
      level: 'error',
      message: 'alert.unsent',
      kind,
      incident,
      missing: channel.missing,
      subject: mail.subject,
      text: mail.text,
    });
    return 'unsent';
  }
  const sent = await deps.send(channel, mail);
  if (!sent.ok) {
    await writeRow(env.ACCOUNTS, key, `pending:${incident}:${lastMail}`);
    deps.log({
      level: 'error',
      message: 'alert.failed',
      kind,
      incident,
      status: sent.status,
      reason: sent.reason,
    });
    return 'failed';
  }
  await writeRow(env.ACCOUNTS, key, `open:${incident}:${now}`);
  deps.log({ level: 'error', message: 'alert.sent', kind, incident, id: sent.id });
  return 'sent';
}

/** Closes an open or waiting incident of one kind; no mail. */
async function close(
  env: WatchEnv,
  deps: WatchDeps,
  rows: Record<string, string>,
  kind: WatchKind,
): Promise<WatchOutcome> {
  const key = `${ALERT_ROW_PREFIX}${kind}`;
  const row = parseAlertRow(rows[key]);
  if (row === null || row.state === 'closed') return 'ok';
  await writeRow(env.ACCOUNTS, key, `closed:${row.incident}:${row.mailedAt}`);
  deps.log({ level: 'info', message: 'alert.closed', kind, incident: row.incident });
  return 'closed';
}

/**
 * One check (the cron's call): reads the app and the Worker, counts the failing reads, and opens,
 * keeps or closes the three kinds of incident. Never throws; a database that does not answer is
 * a line at error, since the one mail rule cannot be kept without it.
 */
export async function watchOnce(
  env: WatchEnv,
  deps: WatchDeps = defaultDeps(),
): Promise<WatchResult> {
  const outcomes: Record<WatchKind, WatchOutcome> = {
    health: 'unknown',
    backup: 'unknown',
    drill: 'unknown',
  };
  const rows = await readFlags(env.ACCOUNTS);
  if (rows === null) {
    deps.log({ level: 'error', message: 'watch: the Worker’s database does not answer' });
    return { failing: ['the Worker’s database'], outcomes };
  }
  try {
    const { health, failing } = await readAppHealth(env, deps);
    if ((await callbacksState(env.ACCOUNTS, deps.now())) === 'failing')
      failing.push('the deck objects do not reach the app (callbacks)');
    const now = deps.now();
    const host = hostOf(env.TURBOSLIDE_APP_ORIGIN ?? '');

    // health: two failing reads in a row
    const [countText, sinceText] = (rows[WATCH_HEALTH_ROW] ?? '0:0').split(':');
    const count = failing.length > 0 ? Number(countText ?? 0) + 1 : 0;
    const since = failing.length === 0 ? 0 : count === 1 ? now : Number(sinceText ?? now) || now;
    // a passing check on a passing row writes nothing, so a quiet day costs no write
    const healthRow = `${count}:${since}`;
    if (healthRow !== (rows[WATCH_HEALTH_ROW] ?? '0:0'))
      await writeRow(env.ACCOUNTS, WATCH_HEALTH_ROW, healthRow);
    if (count >= FAILS_TO_ALERT)
      outcomes.health = await raise(env, deps, rows, 'health', String(since), {
        subject: `Turboslide: ${host} fails its health check`,
        text: [
          `${host} failed its health check ${count} times in a row, starting ${utc(since)}.`,
          '',
          'What failed:',
          ...failing.map((line) => `- ${line}`),
          '',
          `Read now: ${env.TURBOSLIDE_APP_ORIGIN ?? ''}/api/health with the room bearer, the realtime Worker's /health, and the function's log (vercel logs).`,
          '',
          'This is the one mail for this incident. The next one comes after the check passes again.',
        ].join('\n'),
      });
    else outcomes.health = count > 0 ? 'counting' : await close(env, deps, rows, 'health');

    // backup: the night's copy done by 06:00 UTC
    if (health !== null && health.backup !== undefined) {
      const today = new Date(now).toISOString().slice(0, 10);
      const backup = health.backup;
      const due = new Date(now).getUTCHours() >= BACKUP_DUE_HOUR_UTC;
      const late =
        backup !== null && due && backup.day === today && (!backup.done || backup.failed > 0);
      outcomes.backup = late
        ? await raise(env, deps, rows, 'backup', today, {
            subject: `Turboslide: the backup of ${today} is not done`,
            text: [
              backup.done
                ? `The backup of ${today} finished with ${backup.failed} objects not copied.`
                : `The backup of ${today} was not done by ${String(BACKUP_DUE_HOUR_UTC).padStart(2, '0')}:00 UTC.`,
              '',
              `Read the function's log for "turboslide backup:" between 03:00 and 06:00 UTC, and backup/${today}/ in the backup store. A call of GET /api/cron/backup with the cron secret continues the night from its cursor.`,
              '',
              'This is the one mail for this day.',
            ].join('\n'),
          })
        : await close(env, deps, rows, 'backup');
    }

    // drill: the month's restore drill
    if (health !== null && health.drill !== undefined) {
      const drill = health.drill;
      outcomes.drill =
        drill !== null && drill.ok === false
          ? await raise(env, deps, rows, 'drill', drill.month, {
              subject: `Turboslide: the restore drill of ${drill.month} failed`,
              text: [
                `The monthly restore drill of ${drill.month} recorded a failure.`,
                '',
                `Read backup/drills/${drill.month}.json in the backup store for the check that failed, and run scripts/restore-drill.mjs by hand to read it again.`,
                '',
                'This is the one mail for this month.',
              ].join('\n'),
            })
          : await close(env, deps, rows, 'drill');
    }
    return { failing, outcomes };
  } catch (error) {
    deps.log({
      level: 'error',
      message: 'watch: the check failed',
      error: error instanceof Error ? error.message : String(error),
    });
    return { failing: ['the check itself'], outcomes };
  }
}

/** The kinds with an open or waiting incident. */
export async function openAlerts(db: D1Database): Promise<WatchKind[]> {
  const rows = (await readFlags(db)) ?? {};
  const open: WatchKind[] = [];
  for (const kind of ['health', 'backup', 'drill'] as const) {
    const row = parseAlertRow(rows[`${ALERT_ROW_PREFIX}${kind}`]);
    if (row !== null && row.state !== 'closed') open.push(kind);
  }
  return open;
}

/**
 * `/health`'s `alerts`: `set` when the Worker holds the alert key and an address, else `unset`
 * (an incident is then a line at error alone), and the kinds with an open incident. Never a value.
 */
export async function alertsHealth(
  env: WatchEnv,
): Promise<{ channel: 'set' | 'unset'; open: WatchKind[] }> {
  return {
    channel: alertChannel(env).configured ? 'set' : 'unset',
    open: await openAlerts(env.ACCOUNTS),
  };
}
