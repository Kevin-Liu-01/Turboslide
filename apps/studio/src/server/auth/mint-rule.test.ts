import { describe, expect, it } from 'vitest';

import { mintsIdentityCookie } from './middleware';

// Hardening PS#9 (docs/hardening/HARDENING.md 4.9; PERF-14): the identity cookie is minted on a
// document load and a server function alone. A cookieless request for a contract, a file or an
// API route gets no Set-Cookie, so the CDN keeps a public answer.

const request = (path: string, init: RequestInit = {}): Request =>
  new Request(`https://www.turboslide.com${path}`, init);

describe('hardening PS#9: the identity cookie on documents and server functions alone', () => {
  it('mints on a document load and an embed', () => {
    for (const dest of ['document', 'iframe'])
      expect(
        mintsIdentityCookie(request('/new', { headers: { 'sec-fetch-dest': dest } }), '/new'),
        dest,
      ).toBe(true);
    // a client that sends no fetch metadata and asks for HTML
    expect(
      mintsIdentityCookie(request('/decks', { headers: { accept: 'text/html' } }), '/decks'),
    ).toBe(true);
  });

  it('mints on a server function, whatever its method', () => {
    const path = '/_serverFn/abc123';
    expect(mintsIdentityCookie(request(path, { method: 'POST' }), path)).toBe(true);
    expect(mintsIdentityCookie(request(path), path)).toBe(true);
  });

  it('mints nothing for a contract, a file, an API route or a fetch', () => {
    for (const path of ['/llms.txt', '/llms-full.txt', '/openapi.json', '/sitemap.xml'])
      expect(mintsIdentityCookie(request(path, { headers: { accept: '*/*' } }), path), path).toBe(
        false,
      );
    expect(
      mintsIdentityCookie(
        request('/api/render/title?deck=gt-brand', { headers: { 'sec-fetch-dest': 'image' } }),
        '/api/render/title',
      ),
    ).toBe(false);
    expect(
      mintsIdentityCookie(
        request('/api/actions/deck.info', {
          method: 'POST',
          headers: { 'sec-fetch-dest': 'empty', accept: 'text/html' },
        }),
        '/api/actions/deck.info',
      ),
    ).toBe(false);
    expect(
      mintsIdentityCookie(
        request('/llms.txt', { headers: { 'sec-fetch-dest': 'empty', accept: 'text/html' } }),
        '/llms.txt',
      ),
    ).toBe(false);
  });
});
