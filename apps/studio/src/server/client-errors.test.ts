import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { REPORT_LINE_MAX_BYTES, encodeReportLine, reportLine } from '@turboslide/report/line';

import {
  ERRORS_PER_ADDRESS,
  LOGGED_PER_MINUTE,
  SAMPLE_PAST_BUDGET,
  acceptClientError,
  resetClientErrorWindow,
} from './client-errors';
import type { ClientErrorDeps } from './client-errors';
import { memoryLimiter } from './ratelimit';

// POST /api/x/errors (hardening HR-O#2a, RELIABILITY-14): the cap, the rate limit, the sampling
// and the scrubbed line. Every value below is a test value.

const ORIGIN = 'http://localhost:4868';

function post(body: string, address = '198.51.100.20', headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/api/x/errors`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-vercel-forwarded-for': address,
      ...headers,
    },
    body,
  });
}

let lines: string[];
let deps: ClientErrorDeps;

beforeEach(() => {
  vi.stubEnv('VERCEL', '1');
  resetClientErrorWindow();
  lines = [];
  deps = {
    limiter: memoryLimiter(),
    log: (line) => lines.push(line),
    now: () => Date.parse('2026-10-12T21:00:00.000Z'),
    build: () => '8c9465b6823c3b9ed1bcc4174dc7e8c0f59f169e',
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const good = (message = 'TypeError: x is undefined') =>
  encodeReportLine(reportLine({ kind: 'error', route: '/decks', error: new Error(message) }));

describe('POST /api/x/errors', () => {
  test('a line is logged once, scrubbed, with the build and without the address', async () => {
    const { response } = await acceptClientError(
      post(
        JSON.stringify({
          kind: 'route',
          route: '/deck/q3-board-review',
          message: 'Error: "Acme layoffs slide" for kevin@example.test',
          stack: ['at Stage (https://www.turboslide.com/assets/deck-C1.js:3:7)'],
        }),
      ),
      deps,
    );
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(lines).toHaveLength(1);
    const logged = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(logged).toEqual({
      t: '2026-10-12T21:00:00.000Z',
      source: 'client',
      event: 'client.error',
      build: '8c9465b6823c3b9ed1bcc4174dc7e8c0f59f169e',
      kind: 'route',
      route: '/deck/$',
      message: 'Error: "…" for <address>',
      stack: ['at Stage (https://www.turboslide.com/assets/deck-C1.js:3:7)'],
    });
    expect(lines[0]).not.toContain('198.51.100.20');
    expect(lines[0]).not.toContain('Acme');
  });

  test('a body over 4 KB answers 413, by its declared length and by its bytes', async () => {
    const big = 'x'.repeat(REPORT_LINE_MAX_BYTES + 1);
    expect(
      (
        await acceptClientError(
          post(big, undefined, { 'content-length': String(big.length) }),
          deps,
        )
      ).response.status,
    ).toBe(413);
    expect((await acceptClientError(post(big), deps)).response.status).toBe(413);
    expect(lines).toHaveLength(0);
  });

  test('a body that is not a line answers 400 and logs nothing', async () => {
    expect((await acceptClientError(post('not json'), deps)).response.status).toBe(400);
    expect(
      (await acceptClientError(post(JSON.stringify({ kind: 'x', route: '/', message: '' })), deps))
        .response.status,
    ).toBe(400);
    expect(lines).toHaveLength(0);
  });

  test('one address sends 30 lines a minute; the 31st answers 429; another address goes on', async () => {
    for (let i = 0; i < ERRORS_PER_ADDRESS; i += 1)
      expect((await acceptClientError(post(good()), deps)).response.status).toBe(204);
    const refused = (await acceptClientError(post(good()), deps)).response;
    expect(refused.status).toBe(429);
    expect(refused.headers.get('retry-after')).toBe('60');
    expect((await acceptClientError(post(good(), '198.51.100.21'), deps)).response.status).toBe(
      204,
    );
    expect(lines).toHaveLength(ERRORS_PER_ADDRESS + 1);
  });

  test('past 300 lines in a minute an instance logs one in ten, marked as a sample', async () => {
    const open: ClientErrorDeps = {
      ...deps,
      limiter: { kind: 'memory', limit: async () => ({ ok: true, remaining: 1, resetAt: 0 }) },
    };
    const extra = SAMPLE_PAST_BUDGET * 5;
    for (let i = 0; i < LOGGED_PER_MINUTE + extra; i += 1)
      expect((await acceptClientError(post(good()), open)).response.status).toBe(204);
    expect(lines).toHaveLength(LOGGED_PER_MINUTE + 5);
    const samples = lines
      .slice(LOGGED_PER_MINUTE)
      .map((line) => (JSON.parse(line) as { sampled?: number }).sampled);
    expect(samples).toEqual(Array.from({ length: 5 }, () => SAMPLE_PAST_BUDGET));
    // a new minute logs every line again
    open.now = () => Date.parse('2026-10-12T21:01:00.000Z');
    await acceptClientError(post(good()), open);
    expect(JSON.parse(lines.at(-1)!)).not.toHaveProperty('sampled');
  });
});
