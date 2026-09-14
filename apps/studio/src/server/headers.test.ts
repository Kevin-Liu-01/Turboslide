import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CSP_REPORT_PATH,
  assetResponseHeaders,
  buildCsp,
  clientAddress,
  contentTypeRefusal,
  csrfFilter,
  effectiveHost,
  embedAncestors,
  isLocalRequest,
  refuseForeignOrigin,
  refuseSpoofedLocalhost,
  requiresJsonBody,
  securityHeadersFor,
  trustsProxy,
  withHeaders,
} from './headers';
import { setSecurityLogSink } from './log';

// The request and response header rules of gslides-parity SPEC-3 8.8 and 0.28 (report 04 F5,
// F11): forwarded host trust under TURBOSLIDE_TRUST_PROXY, the client address a limit keys on,
// the attachment rule of the assets route, and the WAF rules file of 8.3 (R1 to R21 committed in
// log mode with the enforce action beside each, in the shape the firewall API takes).

const ROOT = join(import.meta.dirname, '..', '..', '..', '..');

function req(headers: Record<string, string>, url = 'http://localhost:4321/api/agent'): Request {
  return new Request(url, { headers });
}

describe('forwarded host trust (SPEC-3 8.8, TURBOSLIDE_TRUST_PROXY)', () => {
  it('is off unless the variable spells 1, true or yes', () => {
    expect(trustsProxy({})).toBe(false);
    expect(trustsProxy({ TURBOSLIDE_TRUST_PROXY: '0' })).toBe(false);
    expect(trustsProxy({ TURBOSLIDE_TRUST_PROXY: '1' })).toBe(true);
    expect(trustsProxy({ TURBOSLIDE_TRUST_PROXY: 'true' })).toBe(true);
    expect(trustsProxy({ TURBOSLIDE_TRUST_PROXY: ' Yes ' })).toBe(true);
  });

  it('without trust a forwarded local name never opens a public socket, and a forwarded public name still refuses', () => {
    // the F11 spoof: X-Forwarded-Host: localhost over a public Host
    const spoof = req({ host: 'studio.example.com', 'x-forwarded-host': 'localhost' });
    expect(effectiveHost(spoof, {})).toBe('studio.example.com');
    expect(isLocalRequest(spoof, {})).toBe(false);
    const refused = refuseSpoofedLocalhost(spoof, {});
    expect(refused?.status).toBe(401);
    // the round one test's shape: a public forwarded name over a local Host refuses either way
    const narrowed = req({ host: 'localhost:4321', 'x-forwarded-host': 'studio.example.com' });
    expect(effectiveHost(narrowed, {})).toBe('studio.example.com');
    expect(isLocalRequest(narrowed, {})).toBe(false);
    // a plain local request is local
    const local = req({ host: 'localhost:4321' });
    expect(isLocalRequest(local, {})).toBe(true);
    expect(refuseSpoofedLocalhost(local, {})).toBeNull();
    // a proxy that says the client used a local name is only believed once trusted
    expect(isLocalRequest(spoof, { TURBOSLIDE_TRUST_PROXY: '1' })).toBe(true);
    expect(effectiveHost(narrowed, { TURBOSLIDE_TRUST_PROXY: '1' })).toBe('studio.example.com');
    // the first entry of a list is the one read
    const list = req({
      host: 'localhost:4321',
      'x-forwarded-host': 'a.example.com, b.example.com',
    });
    expect(effectiveHost(list, {})).toBe('a.example.com');
    // no Host header: the URL's host
    const bare = new Request('http://studio.example.com/x');
    expect(effectiveHost(bare, {})).toBe('studio.example.com');
  });

  it('never prints a token in the refusal', async () => {
    const spoof = req({ host: 'studio.example.com', 'x-forwarded-host': 'localhost' });
    const refused = refuseSpoofedLocalhost(spoof, { TURBOSLIDE_TOKEN: 'sekrit-value' });
    const body = (await refused?.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('unauthorized');
    expect(body.error.message).not.toContain('sekrit');
  });
});

describe('the client address', () => {
  it('reads the platform headers on Vercel, x-forwarded-for only under trust, else null', () => {
    const vercel = req({ 'x-vercel-forwarded-for': '203.0.113.9', 'x-forwarded-for': '10.0.0.1' });
    expect(clientAddress(vercel, { VERCEL: '1' })).toBe('203.0.113.9');
    expect(clientAddress(vercel, {})).toBeNull();
    const forwarded = req({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' });
    expect(clientAddress(forwarded, { TURBOSLIDE_TRUST_PROXY: '1' })).toBe('203.0.113.7');
    expect(clientAddress(forwarded, {})).toBeNull();
    const real = req({ 'x-real-ip': '203.0.113.5' });
    expect(clientAddress(real, { VERCEL: '1' })).toBe('203.0.113.5');
    expect(clientAddress(real, { TURBOSLIDE_TRUST_PROXY: '1' })).toBe('203.0.113.5');
    expect(clientAddress(req({}), { VERCEL: '1' })).toBeNull();
  });
});

describe('the assets route headers (SPEC-3 0.28, 11.3; report 04 F5)', () => {
  it('serves the four raster types inline with nosniff', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
      const headers = assetResponseHeaders('assets/a.png', type);
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['content-type']).toBe(type);
      expect(headers['cache-control']).toBe('public, max-age=60');
      expect(headers['content-disposition']).toBeUndefined();
      expect(headers['content-security-policy']).toBeUndefined();
    }
  });

  it('serves svg, json and unknown types as attachments under a sandboxing policy', () => {
    const svg = assetResponseHeaders('assets/logo.svg', 'image/svg+xml');
    expect(svg['content-disposition']).toBe('attachment; filename="logo.svg"');
    expect(svg['content-security-policy']).toBe("sandbox; default-src 'none'");
    expect(svg['x-content-type-options']).toBe('nosniff');
    const json = assetResponseHeaders('assets/map.json', 'application/json');
    expect(json['content-disposition']).toBe('attachment; filename="map.json"');
    const other = assetResponseHeaders('assets/x.bin', 'application/octet-stream');
    expect(other['content-disposition']).toBe('attachment; filename="x.bin"');
    // a file name is one safe segment
    const odd = assetResponseHeaders('assets/sub/we"ird name.svg', 'image/svg+xml; charset=utf-8');
    expect(odd['content-disposition']).toBe('attachment; filename="we_ird_name.svg"');
  });
});

type Condition = { type: string; op: string; value?: unknown; key?: string; neg?: boolean };
type Mitigate = {
  action: string;
  rateLimit: { algo: string; window: number; limit: number; keys: string[]; action: string } | null;
  redirect: unknown;
  actionDuration: string | null;
};
type Rule = {
  key: string;
  value: {
    name: string;
    description: string;
    active: boolean;
    conditionGroup: { conditions: Condition[] }[];
    action: { mitigate: Mitigate };
  };
  enforce: { mitigate: Mitigate };
};
type RulesFile = { version: number; mode: string; rules: Rule[]; order: string[] };

const CONDITION_TYPES = new Set([
  'path',
  'method',
  'header',
  'user_agent',
  'host',
  'query',
  'cookie',
  'ja4_digest',
  'environment',
]);
const OPS = new Set([
  'eq',
  'neq',
  'inc',
  'ninc',
  'sub',
  'pre',
  'suf',
  're',
  'ex',
  'nex',
  'gt',
  'gte',
  'lt',
  'lte',
]);
const ACTIONS = new Set(['deny', 'challenge', 'log', 'bypass', 'rate_limit', 'redirect']);
const RATE_ACTIONS = new Set(['rate_limit', 'deny', 'challenge', 'log']);
const DURATIONS = new Set(['1m', '5m', '15m', '30m', '1h']);

describe('firewall/rules.json (SPEC-3 0.25, 8.3, 11.5 R0)', () => {
  const file = JSON.parse(readFileSync(join(ROOT, 'firewall', 'rules.json'), 'utf8')) as RulesFile;
  const byKey = new Map(file.rules.map((rule) => [rule.key, rule]));

  it('holds R1 to R21 and R16b once each, in log mode, under Pro limits', () => {
    const expected = [...Array.from({ length: 21 }, (_, i) => `R${i + 1}`), 'R16b'];
    for (const key of expected) expect(byKey.has(key), key).toBe(true);
    expect(file.mode).toBe('log');
    expect(file.rules.length).toBeLessThanOrEqual(40);
    expect(new Set(file.rules.map((rule) => rule.key)).size).toBe(file.rules.length);
    expect([...file.order].sort()).toEqual(file.rules.map((rule) => rule.key).sort());
  });

  it('spells every rule as the firewall API takes it and every applied action as log', () => {
    for (const rule of file.rules) {
      const { value, enforce } = rule;
      expect(value.name.length, rule.key).toBeLessThanOrEqual(160);
      expect(value.description.length, rule.key).toBeLessThanOrEqual(256);
      expect(typeof value.active).toBe('boolean');
      expect(value.conditionGroup.length, rule.key).toBeGreaterThan(0);
      for (const group of value.conditionGroup) {
        expect(group.conditions.length, rule.key).toBeGreaterThan(0);
        for (const condition of group.conditions) {
          expect(CONDITION_TYPES.has(condition.type), `${rule.key} ${condition.type}`).toBe(true);
          expect(OPS.has(condition.op), `${rule.key} ${condition.op}`).toBe(true);
          if (condition.op === 'ex' || condition.op === 'nex')
            expect(condition.value).toBeUndefined();
          else expect(condition.value, `${rule.key} value`).toBeDefined();
          if (
            condition.type === 'header' ||
            condition.type === 'cookie' ||
            condition.type === 'query'
          )
            expect(typeof condition.key, `${rule.key} key`).toBe('string');
          if (condition.op === 're')
            expect(() => new RegExp(String(condition.value))).not.toThrow();
        }
      }
      for (const mitigate of [value.action.mitigate, enforce.mitigate]) {
        expect(ACTIONS.has(mitigate.action), `${rule.key} ${mitigate.action}`).toBe(true);
        if (mitigate.actionDuration !== null)
          expect(DURATIONS.has(mitigate.actionDuration)).toBe(true);
        if (mitigate.action === 'rate_limit') {
          const limit = mitigate.rateLimit;
          expect(limit, rule.key).not.toBeNull();
          if (limit === null) continue;
          expect(limit.algo).toBe('fixed_window');
          expect(limit.window).toBeGreaterThanOrEqual(10);
          expect(limit.window).toBeLessThanOrEqual(600);
          expect(limit.limit).toBeGreaterThanOrEqual(1);
          expect(
            limit.keys.every((key) => key === 'ip' || key === 'ja4'),
            rule.key,
          ).toBe(true);
          expect(RATE_ACTIONS.has(limit.action), `${rule.key} ${limit.action}`).toBe(true);
        } else {
          expect(mitigate.rateLimit).toBeNull();
        }
      }
      // log mode: the applied rule counts and logs, never blocks
      const applied = value.action.mitigate;
      const appliedAction =
        applied.action === 'rate_limit' ? applied.rateLimit?.action : applied.action;
      expect(appliedAction, rule.key).toBe('log');
      expect(applied.actionDuration, rule.key).toBeNull();
    }
  });

  it('carries the numbers of the 8.3 table', () => {
    const limits: Record<string, [number, number, string, string]> = {
      R1: [60, 600, 'ip', 'rate_limit'],
      R2: [60, 240, 'ip', 'rate_limit'],
      R3: [600, 12, 'ip', 'deny'],
      R4: [600, 6, 'ip', 'deny'],
      R5: [60, 300, 'ip', 'rate_limit'],
      R6: [60, 300, 'ip', 'rate_limit'],
      R7: [60, 30, 'ip', 'deny'],
      R8: [60, 10, 'ip', 'deny'],
      R9: [600, 60, 'ja4', 'challenge'],
      R10: [60, 600, 'ip', 'rate_limit'],
      R11: [10, 200, 'ja4', 'challenge'],
      R12: [60, 30, 'ip', 'rate_limit'],
      R13: [60, 3600, 'ip', 'rate_limit'],
      R14: [60, 900, 'ip', 'rate_limit'],
      R15: [60, 30, 'ip', 'rate_limit'],
      R16: [600, 20, 'ip', 'deny'],
      R16b: [60, 120, 'ip', 'rate_limit'],
      R17: [60, 20, 'ip', 'rate_limit'],
      R18: [600, 10, 'ip', 'rate_limit'],
      R20: [60, 120, 'ip', 'rate_limit'],
      R21: [600, 600, 'ja4', 'challenge'],
    };
    for (const [key, [window, limit, keyed, action]] of Object.entries(limits)) {
      const rule = byKey.get(key);
      expect(rule, key).toBeDefined();
      if (rule === undefined) continue;
      expect(rule.value.action.mitigate.rateLimit, key).toMatchObject({
        window,
        limit,
        keys: [keyed],
      });
      expect(rule.enforce.mitigate.rateLimit, key).toMatchObject({
        window,
        limit,
        keys: [keyed],
        action,
      });
    }
    // the persistent denies of R3, R4, R7, R8 and R16
    expect(byKey.get('R3')?.enforce.mitigate.actionDuration).toBe('15m');
    expect(byKey.get('R4')?.enforce.mitigate.actionDuration).toBe('15m');
    expect(byKey.get('R7')?.enforce.mitigate.actionDuration).toBe('1h');
    expect(byKey.get('R8')?.enforce.mitigate.actionDuration).toBe('15m');
    expect(byKey.get('R16')?.enforce.mitigate.actionDuration).toBe('15m');
    // R19 waits for round four
    expect(byKey.get('R19')?.value.active).toBe(false);
    // R7 keys on the missing Authorization header
    const r7 = byKey.get('R7');
    expect(
      r7?.value.conditionGroup.every((group) =>
        group.conditions.some(
          (c) => c.type === 'header' && c.key === 'authorization' && c.op === 'nex',
        ),
      ),
    ).toBe(true);
    // the bypass is narrow: a user agent prefix and an agent path together, log mode now
    const bypass = byKey.get('bypass-cli');
    expect(bypass?.value.action.mitigate.action).toBe('log');
    expect(bypass?.enforce.mitigate.action).toBe('bypass');
    expect(bypass?.value.conditionGroup.every((group) => group.conditions.length >= 2)).toBe(true);
  });
});

describe('the global headers and the CSP (SPEC-3 8.8; report 04 8.3)', () => {
  const base = {
    nonce: 'abc123',
    requestId: 'req-1',
    secure: true,
    env: {} as Record<string, string>,
  };

  it('sets every header of the specification on a page and the exceptions on /embed and /s', () => {
    const page = securityHeadersFor('/edit/q4-review', base);
    expect(page['strict-transport-security']).toBe('max-age=63072000; includeSubDomains; preload');
    expect(page['x-content-type-options']).toBe('nosniff');
    expect(page['x-frame-options']).toBe('DENY');
    expect(page['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(page['cross-origin-opener-policy']).toBe('same-origin');
    expect(page['permissions-policy']).toContain('camera=()');
    expect(page['x-request-id']).toBe('req-1');
    expect(page['content-security-policy-report-only']).toContain("frame-ancestors 'none'");
    expect(page['content-security-policy']).toBeUndefined();
    const embed = securityHeadersFor('/embed/q4-review', base);
    expect(embed['x-frame-options']).toBeUndefined();
    expect(embed['cross-origin-opener-policy']).toBeUndefined();
    expect(embed['content-security-policy-report-only']).toContain(
      'frame-ancestors https://prototemplate.com https://*.prototemplate.com',
    );
    const exchange = securityHeadersFor('/s/abcdefghijklmnopqrstuv', base);
    expect(exchange['referrer-policy']).toBe('no-referrer');
    // plain http never pins itself; API answers are never cached and carry no page policy
    expect(
      securityHeadersFor('/new', { ...base, secure: false })['strict-transport-security'],
    ).toBeUndefined();
    const api = securityHeadersFor('/api/actions/deck.info', base);
    expect(api['cache-control']).toBe('no-store');
    expect(api['content-security-policy-report-only']).toBeUndefined();
    expect(securityHeadersFor('/decks/q4/assets/a.png', base)['cross-origin-resource-policy']).toBe(
      'same-site',
    );
  });

  it('builds the nonce based policy with worker-src blob, the store hosts and the report endpoint', () => {
    const csp = buildCsp({
      nonce: 'n0nce',
      publicStoreHost: 'abc.public.blob.vercel-storage.com',
      presignHost: 'private.blob.vercel-storage.com',
      reportUri: CSP_REPORT_PATH,
      env: {},
    });
    expect(csp).toContain("script-src 'self' 'nonce-n0nce' 'strict-dynamic'");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain("img-src 'self' data: blob: https://abc.public.blob.vercel-storage.com");
    expect(csp).toContain(
      "connect-src 'self' https://abc.public.blob.vercel-storage.com https://private.blob.vercel-storage.com",
    );
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain('report-uri /api/x/csp/report');
    expect(csp).not.toContain('upgrade-insecure-requests');
    expect(buildCsp({ nonce: 'x', env: { VERCEL: '1' } })).toContain('upgrade-insecure-requests');
    expect(
      securityHeadersFor('/new', { ...base, env: { TURBOSLIDE_CSP: 'enforce' } })[
        'content-security-policy'
      ],
    ).toContain('nonce-abc123');
    expect(
      securityHeadersFor('/new', { ...base, env: { TURBOSLIDE_CSP: 'off' } })[
        'content-security-policy-report-only'
      ],
    ).toBeUndefined();
  });

  it('reads the extra embed ancestors from the variable, https names only', () => {
    expect(
      embedAncestors({
        TURBOSLIDE_EMBED_ANCESTORS:
          'https://customer.example, http://evil.example, https://*.corp.example',
      }),
    ).toEqual([
      'https://prototemplate.com',
      'https://*.prototemplate.com',
      'https://customer.example',
      'https://*.corp.example',
    ]);
  });

  it('sets headers on an immutable response by cloning it and never overrides a route header', () => {
    const redirect = withHeaders(Response.redirect('http://localhost/x', 302), {
      'x-request-id': 'r',
    });
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get('x-request-id')).toBe('r');
    const own = withHeaders(
      new Response('', { headers: { 'cache-control': 'public, max-age=60' } }),
      {
        'cache-control': 'no-store',
      },
    );
    expect(own.headers.get('cache-control')).toBe('public, max-age=60');
  });
});

describe('the widened CSRF filter and the JSON rule (SPEC-3 8.7; report 04 F13)', () => {
  const ctx = (
    pathname: string,
    method = 'POST',
    handlerType: 'serverFn' | 'router' = 'router',
  ) => ({
    handlerType,
    pathname,
    request: new Request(`http://localhost:4333${pathname}`, { method }),
  });

  it('validates every server function, the new routes on every method, and /s on unsafe methods only', () => {
    expect(csrfFilter(ctx('/_serverFn/abc', 'POST', 'serverFn'))).toBe(true);
    for (const path of [
      '/api/decks/q4/stream',
      '/api/decks/q4/ops',
      '/api/decks/q4/presence',
      '/api/comments/q4',
      '/api/share/q4/link',
      '/api/access/q4',
      '/api/x/export/q4',
      '/api/x/upload/picture',
      '/api/avatar/me',
      '/api/notify/settings',
      '/api/auth/sign-in',
    ])
      expect(csrfFilter(ctx(path, 'GET')), path).toBe(true);
    // /device and the magic link's verify URL are reached by a typed or mailed address on GET
    // (Sec-Fetch-Site none or cross-site), so only their unsafe methods are filtered (b3.md R11)
    expect(csrfFilter(ctx('/device', 'GET'))).toBe(false);
    expect(csrfFilter(ctx('/device', 'POST'))).toBe(true);
    expect(csrfFilter(ctx('/api/auth/magic-link/verify', 'GET'))).toBe(false);
    expect(csrfFilter(ctx('/api/auth/magic-link/verify', 'POST'))).toBe(true);
    // a bearer agent on the room routes sends no Sec-Fetch-Site; the bearer is its proof (b2.md R14)
    for (const path of ['/api/decks/q4/stream', '/api/decks/q4/ops', '/api/decks/q4/presence']) {
      const bearer = {
        handlerType: 'router' as const,
        pathname: path,
        request: new Request(`http://localhost:4333${path}`, {
          method: 'POST',
          headers: { authorization: 'Bearer test-token-not-a-secret' },
        }),
      };
      expect(csrfFilter(bearer), path).toBe(false);
    }
    expect(
      csrfFilter({
        handlerType: 'router',
        pathname: '/api/comments/q4',
        request: new Request('http://localhost:4333/api/comments/q4', {
          method: 'POST',
          headers: { authorization: 'Bearer test-token-not-a-secret' },
        }),
      }),
    ).toBe(true);
    // the CSP report endpoint is a sink a browser posts to without the headers the filter wants
    expect(csrfFilter(ctx('/api/x/csp/report', 'POST'))).toBe(false);
    expect(
      requiresJsonBody(
        new Request('http://localhost:4333/api/x/csp/report', {
          method: 'POST',
          headers: { 'content-type': 'application/csp-report' },
          body: '{}',
        }),
        '/api/x/csp/report',
      ),
    ).toBe(false);
    expect(csrfFilter(ctx('/s/abcdefghijklmnopqrstuv', 'GET'))).toBe(false);
    expect(csrfFilter(ctx('/s/abcdefghijklmnopqrstuv', 'POST'))).toBe(true);
    // the agent surface and the pages stay outside the filter
    for (const path of [
      '/api/actions/slide.update',
      '/api/agent',
      '/mcp',
      '/api/export/q4',
      '/edit/q4',
      '/decks/q4/assets/a.png',
    ])
      expect(csrfFilter(ctx(path)), path).toBe(false);
  });

  it('requires application/json for a body on a JSON route and lets an empty body and other routes through', () => {
    const lines: unknown[] = [];
    const previous = setSecurityLogSink((line) => lines.push(line));
    try {
      const plain = new Request('http://localhost:4333/api/decks/q4/ops', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: '{}',
      });
      expect(requiresJsonBody(plain, '/api/decks/q4/ops')).toBe(true);
      const refused = contentTypeRefusal(plain, '/api/decks/q4/ops');
      expect(refused?.status).toBe(415);
      expect(lines).toHaveLength(1);
      const json = new Request('http://localhost:4333/api/actions/slide.update', {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: '{}',
      });
      expect(contentTypeRefusal(json, '/api/actions/slide.update')).toBeNull();
      const form = new Request('http://localhost:4333/api/actions/slide.remove', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'a=b',
      });
      expect(contentTypeRefusal(form, '/api/actions/slide.remove')?.status).toBe(415);
      // a bare POST (the pagehide cancel with keepalive, a curl without a body) carries no type
      const empty = new Request('http://localhost:4333/api/export/q4?cancel=abc', {
        method: 'POST',
      });
      expect(contentTypeRefusal(empty, '/api/export/q4')).toBeNull();
      // an empty body stamped text/plain by a client library (Playwright's request context)
      const stamped = new Request('http://localhost:4333/api/export/q4?cancel=abc', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', 'content-length': '0' },
      });
      expect(contentTypeRefusal(stamped, '/api/export/q4')).toBeNull();
      // a GET, an upload and a bundle are not JSON routes
      expect(
        contentTypeRefusal(new Request('http://localhost:4333/api/share/q4'), '/api/share/q4'),
      ).toBeNull();
      const zip = new Request('http://localhost:4333/api/decks/bundle', {
        method: 'POST',
        headers: { 'content-type': 'application/zip' },
        body: 'PK',
      });
      expect(contentTypeRefusal(zip, '/api/decks/bundle')).toBeNull();
      const put = new Request('http://localhost:4333/api/x/upload/put/tok', {
        method: 'PUT',
        headers: { 'content-type': 'image/png' },
        body: 'x',
      });
      expect(contentTypeRefusal(put, '/api/x/upload/put/tok')).toBeNull();
    } finally {
      setSecurityLogSink(previous);
    }
  });

  it("refuses a browser Origin that is not the studio's own on the agent routes, and lets agents and the page through", () => {
    const previous = setSecurityLogSink(() => undefined);
    try {
      const own = new Request('http://localhost:4333/api/actions/deck.info', {
        headers: { host: 'localhost:4333', origin: 'http://localhost:4333' },
      });
      expect(refuseForeignOrigin(own, {})).toBeNull();
      const agent = new Request('http://localhost:4333/api/actions/deck.info', {
        headers: { host: 'localhost:4333' },
      });
      expect(refuseForeignOrigin(agent, {})).toBeNull();
      const foreign = new Request('http://localhost:4333/api/actions/deck.info', {
        headers: { host: 'localhost:4333', origin: 'http://evil.example' },
      });
      expect(refuseForeignOrigin(foreign, {})?.status).toBe(403);
      const opaque = new Request('http://localhost:4333/api/actions/deck.info', {
        headers: { host: 'localhost:4333', origin: 'null' },
      });
      expect(refuseForeignOrigin(opaque, {})?.status).toBe(403);
    } finally {
      setSecurityLogSink(previous);
    }
  });
});
