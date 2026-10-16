import { describe, expect, test } from 'vitest';

import {
  ALERT_VARIABLES,
  DEFAULT_ALERT_FROM,
  RESEND_EMAILS_URL,
  alertChannel,
  sendAlert,
} from './alert.ts';

// The alert sender of hardening HR-O#3 (RELIABILITY-14, CRIT-M10): its own key, straight to
// Resend, whatever TURBOSLIDE_MAIL says. Every value is a test value.

describe('alertChannel', () => {
  test('reads the three alert variables and never TURBOSLIDE_MAIL or the mailer’s', () => {
    const read: string[] = [];
    const env = new Proxy(
      {
        TURBOSLIDE_MAIL: 'off',
        RESEND_API_KEY: 're_mailer_key_test',
        TURBOSLIDE_MAIL_FROM: 'Mailer <mail@example.test>',
        TURBOSLIDE_ALERT_RESEND_KEY: 're_alert_key_test',
        TURBOSLIDE_ALERT_TO: 'oncall@example.test, second@example.test',
      } as Record<string, string>,
      {
        get(target, key: string) {
          read.push(key);
          return target[key];
        },
      },
    );
    const channel = alertChannel(env);
    expect(channel).toEqual({
      configured: true,
      key: 're_alert_key_test',
      to: ['oncall@example.test', 'second@example.test'],
      from: DEFAULT_ALERT_FROM,
    });
    expect([...new Set(read)].sort()).toEqual([...ALERT_VARIABLES].sort());
    expect(read).not.toContain('TURBOSLIDE_MAIL');
  });

  test('names what is missing, never a value', () => {
    expect(alertChannel({})).toEqual({
      configured: false,
      missing: ['TURBOSLIDE_ALERT_RESEND_KEY', 'TURBOSLIDE_ALERT_TO'],
    });
    expect(
      alertChannel({ TURBOSLIDE_ALERT_RESEND_KEY: 're_x', TURBOSLIDE_ALERT_TO: 'not an address' }),
    ).toEqual({ configured: false, missing: ['TURBOSLIDE_ALERT_TO'] });
    expect(
      alertChannel({
        TURBOSLIDE_ALERT_RESEND_KEY: 're_x',
        TURBOSLIDE_ALERT_TO: 'a@example.test',
        TURBOSLIDE_ALERT_FROM: 'Ops <ops@example.test>',
      }),
    ).toMatchObject({ configured: true, from: 'Ops <ops@example.test>' });
  });
});

describe('sendAlert', () => {
  const channel = {
    configured: true as const,
    key: 're_alert_key_test',
    to: ['oncall@example.test'],
    from: DEFAULT_ALERT_FROM,
  };

  test('one POST to Resend with the key in the header alone', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Response.json({ id: 'mail_1' });
    }) as unknown as typeof fetch;
    const sent = await sendAlert(channel, { subject: 'Turboslide: test', text: 'line' }, fake);
    expect(sent).toEqual({ ok: true, id: 'mail_1' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(RESEND_EMAILS_URL);
    expect((calls[0]!.init.headers as Record<string, string>)['authorization']).toBe(
      'Bearer re_alert_key_test',
    );
    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(body).toEqual({
      from: DEFAULT_ALERT_FROM,
      to: ['oncall@example.test'],
      subject: 'Turboslide: test',
      text: 'line',
    });
    expect(String(calls[0]!.init.body)).not.toContain('re_alert_key_test');
  });

  test('a refusal answers its status and name; a network failure answers 0; nothing throws', async () => {
    const refused = (async () =>
      Response.json(
        { name: 'validation_error', message: 'from' },
        { status: 422 },
      )) as unknown as typeof fetch;
    expect(await sendAlert(channel, { subject: 's', text: 't' }, refused)).toEqual({
      ok: false,
      status: 422,
      reason: 'validation_error',
    });
    const offline = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const failed = await sendAlert(channel, { subject: 's', text: 't' }, offline);
    expect(failed).toEqual({ ok: false, status: 0, reason: 'TypeError' });
    expect(JSON.stringify(failed)).not.toContain('re_alert_key_test');
  });
});
