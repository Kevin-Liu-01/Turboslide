// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  attachmentName,
  clickDownloadAnchor,
  downloadFromPage,
  refusalSentence,
  sameOriginAddress,
} from '../download';
import type { PageDownloadIo } from '../download';

// The page download of the return round fix round (download.ts): a same origin address is
// fetched by the page and saved from its bytes under the server's file name, a refusal is the
// server's own sentence, another origin and a failed request take the anchor click.

const ORIGIN = 'https://studio.example';

type Click = { href: string; download: string; rel: string };

/** Records every anchor click the module makes, without a navigation (jsdom has none). */
function recordClicks(): Click[] {
  const clicks: Click[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicks.push({ href: this.href, download: this.download, rel: this.rel });
  });
  return clicks;
}

function io(fetchImpl: typeof fetch): { io: Partial<PageDownloadIo>; revoked: string[] } {
  const revoked: string[] = [];
  return {
    io: {
      fetch: fetchImpl,
      doc: document,
      origin: ORIGIN,
      objectUrl: (blob) => `blob:${ORIGIN}/${blob.size}-${blob.type}`,
      revoke: (url) => revoked.push(url),
    },
    revoked,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('sameOriginAddress', () => {
  it('takes a path of ours and an absolute address on the origin, nothing else', () => {
    expect(sameOriginAddress('/api/render/title?deck=a&g=x', ORIGIN)).toBe(true);
    expect(sameOriginAddress(`${ORIGIN}/api/download/tok`, ORIGIN)).toBe(true);
    expect(sameOriginAddress('//evil.example/x', ORIGIN)).toBe(false);
    expect(sameOriginAddress('https://blob.example/copies/a.pdf?download=1', ORIGIN)).toBe(false);
    expect(sameOriginAddress(`${ORIGIN}.evil.example/x`, ORIGIN)).toBe(false);
  });
});

describe('attachmentName', () => {
  it('reads filename, filename* and the address in that order, and never a path', () => {
    expect(attachmentName('attachment; filename="acme-r6.zip"', '/api/x', 'download')).toBe(
      'acme-r6.zip',
    );
    expect(attachmentName('attachment; filename=deck-title.png', '/api/x', 'download')).toBe(
      'deck-title.png',
    );
    expect(
      attachmentName(
        'attachment; filename="fallback.html"; filename*=UTF-8\'\'r%C3%A9sum%C3%A9.html',
        '/api/x',
        'download',
      ),
    ).toBe('résumé.html');
    expect(attachmentName('attachment; filename="../../etc/passwd"', '/api/x', 'download')).toBe(
      '....etcpasswd',
    );
    expect(attachmentName(null, '/api/export/acme?job=1&file=acme.pdf', 'download')).toBe(
      'download',
    );
    expect(attachmentName(null, '/files/acme-light.pptx?x=1', 'download')).toBe('acme-light.pptx');
    expect(attachmentName(undefined, '/api/download/abc', 'acme.html')).toBe('acme.html');
  });
});

describe('refusalSentence', () => {
  it('is the server error body message when there is one, else the status with a short plain body', () => {
    expect(
      refusalSentence(
        429,
        JSON.stringify({
          error: { name: 'Error', status: 429, message: 'You have reached today’s export limit' },
        }),
      ),
    ).toBe('You have reached today’s export limit');
    expect(refusalSentence(404, 'Not found')).toBe(
      'The file could not be downloaded (HTTP 404: Not found)',
    );
    expect(refusalSentence(401, '<!doctype html><html>…</html>')).toBe(
      'The file could not be downloaded (HTTP 401)',
    );
    expect(refusalSentence(500, '')).toBe('The file could not be downloaded (HTTP 500)');
  });
});

describe('clickDownloadAnchor', () => {
  it('appends, clicks and removes one anchor with the name and noopener', () => {
    const clicks = recordClicks();
    clickDownloadAnchor('/api/download/tok', 'acme.html', document);
    expect(clicks).toEqual([
      {
        href: `${window.location.origin}/api/download/tok`,
        download: 'acme.html',
        rel: 'noopener',
      },
    ]);
    expect(document.querySelectorAll('a')).toHaveLength(0);
  });
});

describe('downloadFromPage', () => {
  it('fetches a same origin address with the page credentials and saves its bytes under the server name', async () => {
    vi.useFakeTimers();
    const clicks = recordClicks();
    const calls: Array<{ url: string; credentials: RequestCredentials | undefined }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), credentials: init?.credentials });
      return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
        status: 200,
        headers: {
          'content-type': 'image/png',
          'content-disposition': 'attachment; filename="acme-title.png"',
        },
      });
    };
    const fakes = io(fetchImpl);
    const saved = await downloadFromPage('/api/render/title?deck=acme&g=grant', {
      name: 'acme.png',
      io: fakes.io,
    });
    expect(calls).toEqual([
      { url: '/api/render/title?deck=acme&g=grant', credentials: 'same-origin' },
    ]);
    expect(saved).toEqual({ name: 'acme-title.png', bytes: 4, type: 'image/png' });
    expect(clicks).toEqual([
      { href: `blob:${ORIGIN}/4-image/png`, download: 'acme-title.png', rel: 'noopener' },
    ]);
    expect(fakes.revoked).toEqual([]);
    vi.runAllTimers();
    expect(fakes.revoked).toEqual([`blob:${ORIGIN}/4-image/png`]);
  });

  it('names the file from the caller when the server sends no disposition and the address has no extension', async () => {
    const clicks = recordClicks();
    const fetchImpl: typeof fetch = async () =>
      new Response('<!doctype html><title>Acme</title>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    const saved = await downloadFromPage('/api/download/a1b2c3', {
      name: 'acme.html',
      io: io(fetchImpl).io,
    });
    expect(saved?.name).toBe('acme.html');
    expect(clicks[0]?.download).toBe('acme.html');
  });

  it('rejects with the server sentence on a refused address and clicks nothing', async () => {
    const clicks = recordClicks();
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          error: { name: 'Error', status: 429, message: 'You have reached today’s export limit' },
        }),
        { status: 429, headers: { 'content-type': 'application/json' } },
      );
    await expect(
      downloadFromPage('/api/decks/acme/bundle?t=ticket', { io: io(fetchImpl).io }),
    ).rejects.toThrow('You have reached today’s export limit');
    expect(clicks).toEqual([]);
  });

  it('rejects with the status when a refused address carries a plain body', async () => {
    const fetchImpl: typeof fetch = async () => new Response('Not found', { status: 404 });
    await expect(downloadFromPage('/api/download/spent', { io: io(fetchImpl).io })).rejects.toThrow(
      'The file could not be downloaded (HTTP 404: Not found)',
    );
  });

  it('keeps the anchor click for another origin without a fetch', async () => {
    const clicks = recordClicks();
    const fetchImpl = vi.fn<typeof fetch>();
    const url = 'https://blob.example/copies/acme-light.pdf?download=1';
    const saved = await downloadFromPage(url, { io: io(fetchImpl).io });
    expect(saved).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(clicks).toEqual([{ href: url, download: '', rel: 'noopener' }]);
  });

  it('falls back to the anchor click when the page request itself fails', async () => {
    const clicks = recordClicks();
    const fetchImpl: typeof fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    const saved = await downloadFromPage('/api/decks/acme/bundle?t=ticket', {
      io: io(fetchImpl).io,
    });
    expect(saved).toBeNull();
    expect(clicks).toEqual([
      {
        href: `${window.location.origin}/api/decks/acme/bundle?t=ticket`,
        download: '',
        rel: 'noopener',
      },
    ]);
  });
});
