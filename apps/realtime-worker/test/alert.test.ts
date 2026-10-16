import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { sendAlert } from '@turboslide/report/alert';

import worker from '../src/index.ts';
import { ALERT_FLOOR_MS, watchOnce } from '../src/watch.ts';
import type { WatchDeps, WatchEnv } from '../src/watch.ts';

// HR-O#3 (RELIABILITY-14, CRIT-M10): the Worker's scheduled check over the test D1 with a failing
// fetch for the app and a fake Resend behind the real sender. One mail after the second failing
// read, none on the third within the hour, none while the incident stays open, one per day for a
// backup not done by 06:00 UTC. Every value here is a test value.

const ORIGIN = 'https://app.test';
const T = Date.parse('2026-10-12T21:00:00.000Z');
const MIN = 60_000;

type Rig = {
  deps: WatchDeps;
  mails: { to: string[]; subject: string; text: string }[];
  lines: Record<string, unknown>[];
  setApp: (answer: 'down' | Record<string, unknown>) => void;
  at: (ms: number) => void;
};

function rig(): Rig {
  let app: 'down' | Record<string, unknown> = 'down';
  let now = T;
  const mails: Rig['mails'] = [];
  const lines: Record<string, unknown>[] = [];
  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === 'https://api.resend.com/emails') {
      expect((init?.headers as Record<string, string>)['authorization']).toBe(
        'Bearer re_alert_test_key',
      );
      mails.push(JSON.parse(String(init?.body)) as Rig['mails'][number]);
      return Response.json({ id: `mail_${mails.length}` });
    }
    if (url === `${ORIGIN}/api/health`) {
      expect((init?.headers as Record<string, string>)['authorization']).toBe(
        `Bearer ${env.TURBOSLIDE_ROOM_BEARER}`,
      );
      if (app === 'down') throw new TypeError('fetch failed');
      return Response.json(app, { status: app['ok'] === true ? 200 : 503 });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  return {
    mails,
    lines,
    deps: {
      fetch: fakeFetch,
      now: () => now,
      send: (channel, mail) => sendAlert(channel, mail, fakeFetch),
      log: (line) => lines.push(line),
    },
    setApp: (answer) => {
      app = answer;
    },
    at: (ms) => {
      now = ms;
    },
  };
}

const watchEnv = (extra: Partial<WatchEnv> = {}): WatchEnv => ({
  ACCOUNTS: env.ACCOUNTS,
  TURBOSLIDE_APP_ORIGIN: ORIGIN,
  TURBOSLIDE_ROOM_BEARER: env.TURBOSLIDE_ROOM_BEARER,
  TURBOSLIDE_ALERT_RESEND_KEY: 're_alert_test_key',
  TURBOSLIDE_ALERT_TO: 'oncall@example.test',
  ...extra,
});

const healthy = (extra: Record<string, unknown> = {}) => ({
  ok: true,
  checks: { store: { ok: true }, accounts: { ok: true } },
  backup: null,
  drill: null,
  ...extra,
});

beforeEach(async () => {
  await env.ACCOUNTS.prepare(
    "DELETE FROM rt_flags WHERE k LIKE 'alert.%' OR k = 'watch.health' OR k = 'callbacks'",
  ).run();
});

describe('the scheduled check (HR-O#3)', () => {
  it('one mail after the second failing read, none on the third within the hour', async () => {
    const r = rig();
    expect((await watchOnce(watchEnv(), r.deps)).outcomes.health).toBe('counting');
    expect(r.mails).toHaveLength(0);
    r.at(T + 5 * MIN);
    expect((await watchOnce(watchEnv(), r.deps)).outcomes.health).toBe('sent');
    expect(r.mails).toHaveLength(1);
    expect(r.mails[0]!.to).toEqual(['oncall@example.test']);
    expect(r.mails[0]!.subject).toBe('Turboslide: app.test fails its health check');
    expect(r.mails[0]!.text).toContain('starting 2026-10-12 21:00 UTC');
    expect(r.mails[0]!.text).toContain("the app's health check does not answer (TypeError)");
    r.at(T + 10 * MIN);
    expect((await watchOnce(watchEnv(), r.deps)).outcomes.health).toBe('held');
    r.at(T + 50 * MIN);
    expect((await watchOnce(watchEnv(), r.deps)).outcomes.health).toBe('held');
    expect(r.mails).toHaveLength(1);
  });

  it('an incident closes with no mail; a new one within the hour waits, and mails once the hour has passed', async () => {
    const r = rig();
    await watchOnce(watchEnv(), r.deps);
    r.at(T + 5 * MIN);
    await watchOnce(watchEnv(), r.deps);
    expect(r.mails).toHaveLength(1);
    r.setApp(healthy());
    r.at(T + 10 * MIN);
    expect((await watchOnce(watchEnv(), r.deps)).outcomes.health).toBe('closed');
    r.setApp({ ok: false, checks: { store: { ok: false, reason: 'TimeoutError' } } });
    r.at(T + 15 * MIN);
    expect((await watchOnce(watchEnv(), r.deps)).outcomes.health).toBe('counting');
    r.at(T + 20 * MIN);
    expect((await watchOnce(watchEnv(), r.deps)).outcomes.health).toBe('waiting');
    r.at(T + 25 * MIN);
    expect((await watchOnce(watchEnv(), r.deps)).outcomes.health).toBe('waiting');
    expect(r.mails).toHaveLength(1);
    r.at(T + 5 * MIN + ALERT_FLOOR_MS);
    expect((await watchOnce(watchEnv(), r.deps)).outcomes.health).toBe('sent');
    expect(r.mails).toHaveLength(2);
    expect(r.mails[1]!.text).toContain("the app's store check (TimeoutError)");
  });

  it('a backup not done by 06:00 UTC sends one mail for the day; done closes it', async () => {
    const r = rig();
    const day = '2026-10-13';
    r.setApp(healthy({ backup: { day, done: false, failed: 0 } }));
    r.at(Date.parse(`${day}T05:55:00.000Z`));
    expect((await watchOnce(watchEnv(), r.deps)).outcomes.backup).toBe('ok');
    r.at(Date.parse(`${day}T06:00:00.000Z`));
    expect((await watchOnce(watchEnv(), r.deps)).outcomes.backup).toBe('sent');
    r.at(Date.parse(`${day}T09:00:00.000Z`));
    expect((await watchOnce(watchEnv(), r.deps)).outcomes.backup).toBe('held');
    expect(r.mails.map((mail) => mail.subject)).toEqual([
      `Turboslide: the backup of ${day} is not done`,
    ]);
    r.setApp(healthy({ backup: { day, done: true, failed: 0 } }));
    expect((await watchOnce(watchEnv(), r.deps)).outcomes.backup).toBe('closed');
    expect(r.mails).toHaveLength(1);
  });

  it('a failed drill sends one mail for the month', async () => {
    const r = rig();
    r.setApp(healthy({ drill: { month: '2026-11', ok: false } }));
    r.at(Date.parse('2026-11-01T06:10:00.000Z'));
    expect((await watchOnce(watchEnv(), r.deps)).outcomes.drill).toBe('sent');
    r.at(Date.parse('2026-11-01T06:15:00.000Z'));
    expect((await watchOnce(watchEnv(), r.deps)).outcomes.drill).toBe('held');
    expect(r.mails.map((mail) => mail.subject)).toEqual([
      'Turboslide: the restore drill of 2026-11 failed',
    ]);
  });

  it('without the key an incident is one line at error, and /health names it', async () => {
    const r = rig();
    const bare = watchEnv({ TURBOSLIDE_ALERT_RESEND_KEY: undefined });
    await watchOnce(bare, r.deps);
    r.at(T + 5 * MIN);
    expect((await watchOnce(bare, r.deps)).outcomes.health).toBe('unsent');
    r.at(T + 10 * MIN);
    expect((await watchOnce(bare, r.deps)).outcomes.health).toBe('held');
    expect(r.mails).toHaveLength(0);
    const unsent = r.lines.filter((line) => line['message'] === 'alert.unsent');
    expect(unsent).toHaveLength(1);
    expect(unsent[0]!['missing']).toEqual(['TURBOSLIDE_ALERT_RESEND_KEY']);
    const health = (await (
      await worker.fetch(new Request('https://rooms.test/health'), env)
    ).json()) as { alerts: { channel: string; open: string[] } };
    expect(health.alerts).toEqual({ channel: 'unset', open: ['health'] });
  });
});
