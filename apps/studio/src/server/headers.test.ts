import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CSP_REPORT_PATH,
  STATIC_HEADERS,
  assetResponseHeaders,
  buildCsp,
  clientAddress,
  cspMode,
  contentTypeRefusal,
  csrfFilter,
  effectiveHost,
  embedAncestors,
  isDocumentPath,
  isLocalRequest,
  isStaticPagePath,
  prerenderNonce,
  publicStoreHost,
  publicStoreOrigin,
  refuseForeignOrigin,
  refuseSpoofedLocalhost,
  requestNonce,
  requiresJsonBody,
  routePath,
  securityHeadersFor,
  staticPageCsp,
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

describe('the public store host (docs/archive/rounds/PEOPLE.md 4.3)', () => {
  it('reads the variable as a bare host and answers the https origin the picture URLs are built from', () => {
    const host = 'ggmycvj7j6224ay5.public.blob.vercel-storage.com';
    expect(publicStoreHost({ TURBOSLIDE_PUBLIC_STORE_HOST: host })).toBe(host);
    expect(publicStoreHost({ TURBOSLIDE_PUBLIC_STORE_HOST: ` https://${host}/ ` })).toBe(host);
    expect(publicStoreOrigin({ TURBOSLIDE_PUBLIC_STORE_HOST: host })).toBe(`https://${host}`);
    expect(publicStoreHost({})).toBeNull();
    expect(publicStoreHost({ TURBOSLIDE_PUBLIC_STORE_HOST: '   ' })).toBeNull();
    expect(publicStoreOrigin({})).toBeNull();
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
    // a document route enforces the policy by default (HR-W#2)
    expect(page['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(page['content-security-policy-report-only']).toBeUndefined();
    const embed = securityHeadersFor('/embed/q4-review', base);
    expect(embed['x-frame-options']).toBeUndefined();
    expect(embed['cross-origin-opener-policy']).toBeUndefined();
    // the embed enforces every directive but the frame rule, which stays report only by default:
    // a published embed is framed by whatever site its owner pastes the snippet into
    expect(embed['content-security-policy']).toContain("script-src 'self' 'nonce-abc123'");
    expect(embed['content-security-policy']).not.toContain('frame-ancestors');
    expect(embed['content-security-policy-report-only']).toBe(
      'frame-ancestors https://prototemplate.com https://*.prototemplate.com; report-uri /api/x/csp/report',
    );
    const embedEnforced = securityHeadersFor('/embed/q4-review', {
      ...base,
      env: { TURBOSLIDE_CSP: 'enforce' },
    });
    expect(embedEnforced['content-security-policy']).toContain(
      'frame-ancestors https://prototemplate.com https://*.prototemplate.com',
    );
    expect(embedEnforced['content-security-policy-report-only']).toBeUndefined();
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

  it('gives the answers the CDN serves the headers the middleware sets on an https page (HR-W#3a)', () => {
    // the route rules of vite.deploy.config.ts carry STATIC_HEADERS on /, /home, the docs, the icon
    // and robots.txt, which the middleware never sees; each value is the one it sets itself
    const page = securityHeadersFor('/home', base);
    expect(Object.keys(STATIC_HEADERS).sort()).toEqual([
      'cross-origin-opener-policy',
      'permissions-policy',
      'referrer-policy',
      'strict-transport-security',
      'x-content-type-options',
      'x-frame-options',
    ]);
    for (const [name, value] of Object.entries(STATIC_HEADERS)) expect(page[name]).toBe(value);
    expect(STATIC_HEADERS['strict-transport-security']).toBe(
      'max-age=63072000; includeSubDomains; preload',
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
    expect(csp).toContain("script-src 'self' 'nonce-n0nce' 'strict-dynamic' 'wasm-unsafe-eval'");
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
    // a report only policy cannot carry the directive: the browser ignores it and Chromium logs
    // one console error per page load (VERIFICATION-5 finding 16; the product round, b7)
    expect(buildCsp({ nonce: 'x', env: { VERCEL: '1' }, reportOnly: true })).not.toContain(
      'upgrade-insecure-requests',
    );
    const reported = securityHeadersFor('/edit/q4', {
      nonce: 'n',
      requestId: 'r',
      secure: true,
      env: { VERCEL: '1', TURBOSLIDE_CSP: 'report' },
    });
    expect(reported['content-security-policy-report-only']).not.toContain(
      'upgrade-insecure-requests',
    );
    const enforced = securityHeadersFor('/edit/q4', {
      nonce: 'n',
      requestId: 'r',
      secure: true,
      env: { VERCEL: '1', TURBOSLIDE_CSP: 'enforce' },
    });
    expect(enforced['content-security-policy']).toContain('upgrade-insecure-requests');
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

  it('enforces the policy on the document routes by default and report only elsewhere (HR-W#2)', () => {
    const headerOf = (path: string, env: Record<string, string> = {}) => {
      const headers = securityHeadersFor(path, { ...base, env });
      return headers['content-security-policy'] !== undefined
        ? 'enforce'
        : headers['content-security-policy-report-only'] !== undefined
          ? 'report'
          : 'none';
    };
    for (const path of [
      '/deck/q4',
      '/embed/q4',
      '/present/q4',
      '/print/q4',
      '/s/abcdefghijklmnopqrstuv',
      '/edit/q4',
      '/new',
    ]) {
      expect(isDocumentPath(path), path).toBe(true);
      expect(headerOf(path), path).toBe('enforce');
      // the way back: TURBOSLIDE_CSP=report sends every route report only
      expect(headerOf(path, { TURBOSLIDE_CSP: 'report' }), path).toBe('report');
      expect(headerOf(path, { TURBOSLIDE_CSP: 'off' }), path).toBe('none');
    }
    // /home and the docs enforce since HR-W#3b (the next test)
    for (const path of ['/decks', '/decks/trash', '/homes', '/docsy', '/signin', '/newer', '/']) {
      expect(isDocumentPath(path), path).toBe(false);
      expect(isStaticPagePath(path), path).toBe(false);
      expect(headerOf(path), path).toBe('report');
      expect(headerOf(path, { TURBOSLIDE_CSP: 'enforce' }), path).toBe('enforce');
    }
    // an API answer carries no page policy in any mode
    expect(headerOf('/api/actions/deck.info')).toBe('none');
    expect(headerOf('/api/actions/deck.info', { TURBOSLIDE_CSP: 'enforce' })).toBe('none');
    expect(cspMode({}, '/edit/q4')).toBe('enforce');
    expect(cspMode({}, '/decks')).toBe('report');
    expect(cspMode({})).toBe('report');
    expect(cspMode({ TURBOSLIDE_CSP: ' Report ' }, '/edit/q4')).toBe('report');
    // the enforced policy carries the nonce, the report endpoint and no inline script source
    const enforced = securityHeadersFor('/deck/q4', base)['content-security-policy'] ?? '';
    expect(enforced).toContain("'nonce-abc123'");
    expect(enforced).toContain('report-uri /api/x/csp/report');
    expect(enforced).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it('gives the prerendered pages one nonce per build and the enforced policy that names it (HR-W#3b)', () => {
    // the middleware enforces the policy on /home and the docs wherever the function answers them
    for (const path of ['/home', '/home/', '/docs', '/docs/editor/slides', '/Docs/Reference']) {
      expect(isStaticPagePath(path), path).toBe(true);
      const headers = securityHeadersFor(path, base);
      expect(headers['content-security-policy'], path).toContain("frame-ancestors 'none'");
      expect(headers['content-security-policy-report-only'], path).toBeUndefined();
      const report = securityHeadersFor(path, { ...base, env: { TURBOSLIDE_CSP: 'report' } });
      expect(report['content-security-policy'], path).toBeUndefined();
      expect(report['content-security-policy-report-only'], path).toBeDefined();
    }

    // the build mints its nonce once and keeps it in the environment for the prerender's server
    const env: Record<string, string | undefined> = {};
    const nonce = prerenderNonce(env);
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(env.TURBOSLIDE_PRERENDER_NONCE).toBe(nonce);
    expect(prerenderNonce(env)).toBe(nonce);
    // a value of another shape is replaced, so the header and the pages never disagree
    const odd: Record<string, string | undefined> = { TURBOSLIDE_PRERENDER_NONCE: 'abc' };
    expect(prerenderNonce(odd)).not.toBe('abc');
    expect(prerenderNonce(odd)).toBe(odd.TURBOSLIDE_PRERENDER_NONCE);

    // the request takes the build's nonce only while TanStack Start prerenders
    const prerendering = { TSS_PRERENDERING: 'true', TURBOSLIDE_PRERENDER_NONCE: nonce };
    expect(requestNonce(prerendering)).toBe(nonce);
    expect(requestNonce({ TURBOSLIDE_PRERENDER_NONCE: nonce })).not.toBe(nonce);
    expect(requestNonce({ TSS_PRERENDERING: 'true', TURBOSLIDE_PRERENDER_NONCE: 'abc' })).toMatch(
      /^[A-Za-z0-9+/]{22}==$/,
    );
    expect(requestNonce({})).not.toBe(requestNonce({}));

    // the route header: the builder's policy with that nonce and no frame
    const csp = staticPageCsp(nonce, {});
    expect(Object.keys(csp)).toEqual(['content-security-policy']);
    expect(csp['content-security-policy']).toBe(
      buildCsp({ nonce, pathname: '/home', reportUri: CSP_REPORT_PATH, env: {} }),
    );
    expect(csp['content-security-policy']).toContain(`'nonce-${nonce}' 'strict-dynamic'`);
    expect(csp['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(csp['content-security-policy']).not.toContain('upgrade-insecure-requests');
    expect(staticPageCsp(nonce, { VERCEL: '1' })['content-security-policy']).toContain(
      'upgrade-insecure-requests',
    );
    // the switches as the build reads them
    expect(Object.keys(staticPageCsp(nonce, { TURBOSLIDE_CSP: 'report' }))).toEqual([
      'content-security-policy-report-only',
    ]);
    expect(staticPageCsp(nonce, { TURBOSLIDE_CSP: 'off' })).toEqual({});
  });

  it('reads every path rule as the router matches the path, without regard to case (HR-W#2, verifier F1)', () => {
    // the router renders /Edit/<deck> as /edit/<deck>, so the policy must be the same
    const headerOf = (path: string) => {
      const headers = securityHeadersFor(path, base);
      return headers['content-security-policy'] !== undefined
        ? 'enforce'
        : headers['content-security-policy-report-only'] !== undefined
          ? 'report'
          : 'none';
    };
    for (const path of [
      '/Edit/gt-brand',
      '/EDIT/gt-brand',
      '/Deck/gt-brand',
      '/Present/gt-brand',
      '/PRESENT/gt-brand',
      '/Print/gt-brand',
      '/EMBED/gt-brand',
      '/New',
      '/S/abcdefghijklmnopqrstuv',
    ]) {
      expect(isDocumentPath(path), path).toBe(true);
      expect(headerOf(path), path).toBe('enforce');
      expect(cspMode({}, path), path).toBe('enforce');
    }
    // the embed's exceptions follow it in any case: the frame rule report only, no DENY
    const embed = securityHeadersFor('/Embed/gt-brand', base);
    expect(embed['x-frame-options']).toBeUndefined();
    expect(embed['content-security-policy']).not.toContain('frame-ancestors');
    expect(securityHeadersFor('/S/abcdefghijklmnopqrstuv', base)['referrer-policy']).toBe(
      'no-referrer',
    );
    // the API routes in any case: no page policy, never cached
    const api = securityHeadersFor('/API/access/gt-brand', base);
    expect(api['content-security-policy']).toBeUndefined();
    expect(api['content-security-policy-report-only']).toBeUndefined();
    expect(api['cache-control']).toBe('no-store');
    expect(isDocumentPath('/Decks')).toBe(false);
    expect(isDocumentPath('/Newer')).toBe(false);
  });

  it('decodes the path before it drops the case, so the Kelvin sign path enforces too (verifier pass 2, N1)', () => {
    // U+212A lower cases to k, and the middleware receives it percent encoded, as new URL() writes it
    expect('K'.toLowerCase()).toBe('k');
    for (const path of [
      '/dec%E2%84%AA/gt-brand',
      '/DEC%E2%84%AA/gt-brand',
      '/dec%e2%84%aa/gt-brand',
      '/decK/gt-brand',
      '/de%63k/gt-brand',
      '/%45dit/gt-brand',
    ]) {
      expect(
        routePath(path).startsWith('/deck/') || routePath(path).startsWith('/edit/'),
        path,
      ).toBe(true);
      expect(isDocumentPath(path), path).toBe(true);
      expect(cspMode({}, path), path).toBe('enforce');
      const headers = securityHeadersFor(path, base);
      expect(headers['content-security-policy'], path).toContain("'nonce-abc123'");
      expect(headers['content-security-policy-report-only'], path).toBeUndefined();
    }
    // the API rule reads the decoded path as well: never cached, CSRF filtered
    expect(securityHeadersFor('/%61pi/access/gt-brand', base)['cache-control']).toBe('no-store');
    // a segment that does not decode is read as it came, and the rest of the path still decodes
    expect(routePath('/dec%E2%84%AA/%ZZ')).toBe('/deck/%zz');
    expect(routePath('/decks/%E0%A4%A')).toBe('/decks/%e0%a4%a');
    expect(isDocumentPath('/decks/%E0%A4%A')).toBe(false);
    expect(isDocumentPath('/dec%E2%84%AAs')).toBe(false);
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
    // the OAuth provider callbacks arrive as a cross site top level GET; better-auth checks the
    // state and the PKCE verifier there, so only their unsafe methods are filtered
    for (const provider of ['google', 'github']) {
      expect(csrfFilter(ctx(`/api/auth/callback/${provider}`, 'GET')), provider).toBe(false);
      expect(csrfFilter(ctx(`/api/auth/callback/${provider}`, 'POST')), provider).toBe(true);
    }
    expect(csrfFilter(ctx('/api/auth/callback/google/extra', 'GET'))).toBe(true);
    // the terminal's two device flow endpoints read no cookie, so `turboslide login`'s POSTs with
    // no Origin pass; approving and denying a code stay filtered (polish two, request A-R2)
    expect(csrfFilter(ctx('/api/auth/device/code', 'POST'))).toBe(false);
    expect(csrfFilter(ctx('/api/auth/device/token', 'POST'))).toBe(false);
    expect(csrfFilter(ctx('/api/auth/device/token', 'GET'))).toBe(true);
    expect(csrfFilter(ctx('/api/auth/device/approve', 'POST'))).toBe(true);
    expect(csrfFilter(ctx('/api/auth/device/deny', 'POST'))).toBe(true);
    expect(csrfFilter(ctx('/api/auth/device/code/extra', 'POST'))).toBe(true);
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

  it('filters a route whose path changes case, as the router reaches the same route (verifier F1)', () => {
    for (const path of [
      '/API/access/gt-brand',
      '/Api/Comments/q4',
      '/api/Share/q4/link',
      '/API/decks/q4/STREAM',
      '/API/auth/sign-in',
    ])
      expect(csrfFilter(ctx(path, 'GET')), path).toBe(true);
    expect(csrfFilter(ctx('/S/abc', 'POST'))).toBe(true);
    expect(csrfFilter(ctx('/S/abc', 'GET'))).toBe(false);
    expect(csrfFilter(ctx('/Device', 'POST'))).toBe(true);
    const plain = new Request('http://localhost:4333/API/Actions/slide.remove', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{}',
    });
    expect(requiresJsonBody(plain, '/API/Actions/slide.remove')).toBe(true);
    expect(contentTypeRefusal(plain, '/API/Actions/slide.remove')?.status).toBe(415);
  });

  it('filters a room route under the Kelvin sign as the router reaches it (verifier pass 2, N1)', () => {
    // /api/dec<U+212A>s/<deck>/ops is the ops route to the router; the filter and the JSON rule read it so
    const ops = '/api/dec%E2%84%AAs/q4/ops';
    expect(csrfFilter(ctx(ops, 'POST')), ops).toBe(true);
    expect(csrfFilter(ctx('/api/dec%E2%84%AAs/q4/stream', 'GET'))).toBe(true);
    const plain = new Request(`http://localhost:4333${ops}`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{}',
    });
    expect(contentTypeRefusal(plain, ops)?.status).toBe(415);
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
