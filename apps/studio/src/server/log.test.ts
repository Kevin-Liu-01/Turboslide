import { afterEach, describe, expect, it } from 'vitest';

import {
  ALERTS,
  IP_SALT_RETENTION_MS,
  RETENTION,
  RETENTION_MS,
  SECURITY_EVENT_NAMES,
  ipHash,
  ipSalt,
  isSecurityEventName,
  logSecurityEvent,
  resetIpSalts,
  setSecurityLogSink,
} from './log';
import type { SecurityLine } from './log';

// The structured security log of gslides-parity SPEC-3 8.11 and report 10 6.1 to 6.3: the event
// names, the scrub of addresses, the keyed IP hash under a daily salt kept 48 hours, and the alert
// and retention tables as data.

const lines: SecurityLine[] = [];
const previous = setSecurityLogSink((line) => lines.push(line));

afterEach(() => {
  lines.length = 0;
  resetIpSalts();
});

describe('the line', () => {
  it('names every event of 8.11 and 10 6.1, scrubs an address from every text field and hashes a raw IP', () => {
    for (const name of [
      'stream.open',
      'ops.reject',
      'checkpoint.commit',
      'redis.unavailable',
      'mention.email',
      'name.rejected',
      'sanitizer.rewrite',
      'ssrf.refused',
      'chromium.crash',
      'upload.rejected',
      'http.429',
    ])
      expect(isSecurityEventName(name), name).toBe(true);
    expect(SECURITY_EVENT_NAMES.length).toBeGreaterThan(50);
    const line = logSecurityEvent(
      {
        event: 'share.grant',
        identity: 'sam@example.test',
        recipient: 'maya@example.test',
        reason: 'invited maya@example.test',
        ip: '203.0.113.7',
        linkId: 'lnk_abc123',
      },
      new Date('2026-09-13T10:00:00Z'),
    );
    expect(line.identity).toBe('[redacted]');
    expect(line.recipient).toBe('[redacted]');
    expect(line.reason).toBe('[redacted]');
    expect(line.ip).toMatch(/^20260913:[0-9a-f]{16}$/);
    expect(line.t).toBe('2026-09-13T10:00:00.000Z');
    expect(line.source).toBe('turboslide');
    expect(JSON.stringify(lines)).not.toContain('example.test');
    expect(JSON.stringify(lines)).not.toContain('203.0.113.7');
    // an agent identity carries a colon and no address; a hash is left as it is
    expect(
      logSecurityEvent({ event: 'write', identity: 'agent:bootstrap', ip: '20260913:abcd' }).ip,
    ).toBe('20260913:abcd');
    expect(lines.at(-1)?.identity).toBe('agent:bootstrap');
  });

  it('never throws when the sink does', () => {
    setSecurityLogSink(() => {
      throw new Error('drain down');
    });
    try {
      expect(() => logSecurityEvent({ event: 'write' })).not.toThrow();
    } finally {
      setSecurityLogSink((line) => lines.push(line));
    }
  });
});

describe('the IP hash', () => {
  it('is the same within a day, differs across days and addresses, and drops salts after 48 hours', () => {
    const day1 = new Date('2026-09-13T08:00:00Z');
    const later = new Date('2026-09-13T20:00:00Z');
    const day2 = new Date('2026-09-14T08:00:00Z');
    const a = ipHash('203.0.113.7', day1);
    expect(ipHash('203.0.113.7', later)).toBe(a);
    expect(ipHash('203.0.113.8', day1)).not.toBe(a);
    expect(ipHash('203.0.113.7', day2)).not.toBe(a);
    // the salt of day 1 is still held on day 2 (48 h) and gone on day 4
    const salt1 = ipSalt(day1);
    expect(ipSalt(day1).equals(salt1)).toBe(true);
    ipSalt(day2);
    expect(ipSalt(day1).equals(salt1)).toBe(true);
    ipSalt(new Date(day1.getTime() + IP_SALT_RETENTION_MS + 24 * 60 * 60 * 1000));
    expect(ipSalt(day1).equals(salt1)).toBe(false);
    expect(RETENTION_MS.ipSalt).toBe(48 * 60 * 60 * 1000);
  });
});

describe('the alert and retention tables', () => {
  it('name the alerts of 8.11 and 10 6.1 over known events, and every retention class of 10 6.3', () => {
    expect(ALERTS.length).toBeGreaterThanOrEqual(14);
    for (const alert of ALERTS) {
      expect(alert.events.length).toBeGreaterThan(0);
      for (const event of alert.events) expect(isSecurityEventName(event), alert.id).toBe(true);
      expect(['page', 'notify']).toContain(alert.severity);
    }
    expect(ALERTS.map((alert) => alert.id)).toEqual(
      expect.arrayContaining([
        'sanitizer-shared',
        'chromium-crash',
        'ssrf',
        'redis-unavailable',
        'confusable-names',
        'mail-plan',
        'config-degraded',
      ]),
    );
    const ids = RETENTION.map((row) => row.id);
    for (const id of [
      'ops-stream',
      'presence',
      'rate-counters',
      'sessions',
      'codes',
      'versions',
      'comments',
      'notifications',
      'uploads',
      'exports-bundles',
      'log',
      'ip-salt',
    ])
      expect(ids).toContain(id);
    expect(RETENTION_MS.uploads).toBe(24 * 60 * 60 * 1000);
    expect(RETENTION_MS.exports).toBe(7 * 24 * 60 * 60 * 1000);
    expect(RETENTION_MS.log).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

afterEach(() => {
  if (previous !== undefined) setSecurityLogSink((line) => lines.push(line));
});
