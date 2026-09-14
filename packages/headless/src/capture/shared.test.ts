// The R0 edits of the third Google Slides parity round on the intake path (gslides-parity SPEC-3
// 11.5 R0, 8.6; report 04 F3, F5, F17; MILESTONES-3 B4 day 1): the hosted allowlist without the
// loopback names, the process policy the studio's dispatchers set, `file` refused when paths are
// off, the fetch timeout, the redirect hops re-checked, the counted body, the magic byte sniff
// before sharp, and the HEIF and JXL loaders blocked. Every test runs without a network: the fetch
// is a fake that answers from a table.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';

import {
  CHECKOUT_INTAKE_POLICY,
  DEFAULT_ALLOW_HOSTS,
  HOSTED_ALLOW_HOSTS,
  HOSTED_INPUT_FORMATS,
  LOOPBACK_HOSTS,
  MAX_INPUT_BYTES,
  READ_INPUT_MAX_REDIRECTS,
  assertAllowedHost,
  blockUntrustedLoaders,
  fetchAllowed,
  imageInfo,
  intakePolicy,
  isPrivateAddress,
  readCapped,
  readInput,
  resolvePinned,
  safeFetch,
  setIntakePolicy,
  setSsrfReporter,
  sniffImage,
} from './shared.ts';

const PNG_2X2 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGNgYGD4z8DAwAAADxUD+/8p7CwAAAAASUVORK5CYII=',
  'base64',
);

/** A fetch that answers from a table of URL to response factory and records what it was asked. */
function fakeFetch(table: Record<string, () => Response>): typeof fetch & { calls: string[] } {
  const calls: string[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push(href);
    init?.signal?.throwIfAborted();
    const make = table[href];
    if (make === undefined) return new Response('not found', { status: 404 });
    return make();
  }) as typeof fetch & { calls: string[] };
  impl.calls = calls;
  return impl;
}

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'turboslide-shared-'));
  await writeFile(join(dir, 'dot.png'), PNG_2X2);
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

afterEach(() => {
  setIntakePolicy(CHECKOUT_INTAKE_POLICY);
});

describe('the allowlist and the process policy (SPEC-3 8.6)', () => {
  test('the hosted list is the checkout list without the loopback names', () => {
    for (const host of LOOPBACK_HOSTS) {
      expect(DEFAULT_ALLOW_HOSTS).toContain(host);
      expect(HOSTED_ALLOW_HOSTS).not.toContain(host);
    }
    expect(HOSTED_ALLOW_HOSTS).toEqual(
      DEFAULT_ALLOW_HOSTS.filter((host) => !LOOPBACK_HOSTS.includes(host)),
    );
    expect(HOSTED_ALLOW_HOSTS).toContain('commons.wikimedia.org');
  });

  test('a checkout captures localhost; a hosted instance refuses every loopback form', () => {
    expect(assertAllowedHost('http://localhost:3005/brand').port).toBe('3005');
    for (const url of [
      'http://localhost:3005/brand',
      'http://127.0.0.1:9001/2018-06-01/runtime/invocation/next',
      'http://[::1]/x',
    ]) {
      expect(() => assertAllowedHost(url, [], { hosted: true }), url).toThrow(/allowlist/);
    }
    expect(
      assertAllowedHost('https://upload.wikimedia.org/a.jpg', [], { hosted: true }).hostname,
    ).toBe('upload.wikimedia.org');
    // an explicit extra host still admits a loopback name when the caller asks for it
    expect(assertAllowedHost('http://localhost:3005/x', ['localhost'], { hosted: true }).port).toBe(
      '3005',
    );
  });

  test('the process policy is the default the studio sets once; explicit options win', () => {
    expect(intakePolicy()).toEqual({ allowPaths: true, hosted: false });
    const previous = setIntakePolicy({ allowPaths: false, hosted: true });
    expect(previous).toEqual(CHECKOUT_INTAKE_POLICY);
    expect(intakePolicy()).toEqual({ allowPaths: false, hosted: true });
    expect(() => assertAllowedHost('http://localhost:3005/x')).toThrow(/allowlist/);
    expect(assertAllowedHost('http://localhost:3005/x', [], { hosted: false }).port).toBe('3005');
  });
});

describe('readInput (SPEC-3 11.5 R0: file refused, the timeout and the byte cap)', () => {
  test('a path reads on a checkout and is a TypeError when paths are off, without naming the path', async () => {
    const read = await readInput(join(dir, 'dot.png'));
    expect(read.kind).toBe('path');
    expect(read.bytes.byteLength).toBe(PNG_2X2.byteLength);
    await expect(readInput(join(dir, 'dot.png'), { allowPaths: false })).rejects.toThrow(TypeError);
    await expect(readInput('/etc/hosts', { allowPaths: false })).rejects.toThrow(
      /file paths are not accepted/,
    );
    await expect(readInput('/etc/hosts', { allowPaths: false })).rejects.not.toThrow(/etc/);
    setIntakePolicy({ allowPaths: false, hosted: false });
    await expect(readInput(join(dir, 'dot.png'))).rejects.toThrow(TypeError);
    // a relative path never becomes a lookup either
    await expect(readInput('dot.png', { cwd: dir })).rejects.toThrow(TypeError);
  });

  test('a data URL and an allowlisted https URL still read with paths off', async () => {
    const data = `data:image/png;base64,${PNG_2X2.toString('base64')}`;
    const pasted = await readInput(data, { allowPaths: false, hosted: true });
    expect(pasted).toMatchObject({ kind: 'data', name: 'pasted.png' });
    const fetchImpl = fakeFetch({
      'https://upload.wikimedia.org/dot.png': () =>
        new Response(PNG_2X2, { status: 200, headers: { 'content-type': 'image/png' } }),
    });
    const fetched = await readInput('https://upload.wikimedia.org/dot.png', {
      allowPaths: false,
      hosted: true,
      fetchImpl,
    });
    expect(fetched).toMatchObject({ kind: 'url', name: 'dot.png' });
    expect(fetched.bytes.byteLength).toBe(PNG_2X2.byteLength);
  });

  test('a redirect is followed only onto an allowlisted host and only three times', async () => {
    const redirect = (to: string) => () =>
      new Response(null, { status: 302, headers: { location: to } });
    const ok = () => new Response(PNG_2X2, { status: 200 });
    const chain = fakeFetch({
      'https://commons.wikimedia.org/a': redirect('https://upload.wikimedia.org/b'),
      'https://upload.wikimedia.org/b': ok,
    });
    const followed = await fetchAllowed('https://commons.wikimedia.org/a', { fetchImpl: chain });
    expect(followed.url.href).toBe('https://upload.wikimedia.org/b');
    expect(chain.calls).toEqual([
      'https://commons.wikimedia.org/a',
      'https://upload.wikimedia.org/b',
    ]);

    const escape = fakeFetch({
      'https://commons.wikimedia.org/a': redirect('http://169.254.169.254/latest/meta-data/'),
    });
    await expect(
      fetchAllowed('https://commons.wikimedia.org/a', { fetchImpl: escape }),
    ).rejects.toThrow(/allowlist/);
    expect(escape.calls).toEqual(['https://commons.wikimedia.org/a']);

    const loop = fakeFetch({
      'https://commons.wikimedia.org/a': redirect('/a'),
    });
    await expect(
      fetchAllowed('https://commons.wikimedia.org/a', { fetchImpl: loop }),
    ).rejects.toThrow(new RegExp(`more than ${READ_INPUT_MAX_REDIRECTS} redirects`));
    expect(loop.calls).toHaveLength(READ_INPUT_MAX_REDIRECTS + 1);
  });

  test('a body over the cap is refused while it streams, whatever Content-Length says', async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let pulled = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(chunk);
      },
    });
    const response = new Response(endless, { status: 200 });
    await expect(readCapped(response, 3 * 1024 * 1024, 'x')).rejects.toThrow(/exceeds 3 MB/);
    expect(pulled).toBeLessThan(8);
    const declared = new Response(PNG_2X2, {
      status: 200,
      headers: { 'content-length': String(MAX_INPUT_BYTES + 1) },
    });
    await expect(readCapped(declared, MAX_INPUT_BYTES, 'y')).rejects.toThrow(/exceeds 25 MB/);
    const small = await readCapped(new Response(PNG_2X2), 1024, 'z');
    expect(small.byteLength).toBe(PNG_2X2.byteLength);
  });

  test('a fetch that never answers ends at the timeout as a RangeError', async () => {
    const hang = (async (_input: string | URL | Request, init?: RequestInit): Promise<Response> =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      })) as typeof fetch;
    await expect(
      fetchAllowed('https://upload.wikimedia.org/slow.png', { fetchImpl: hang, timeoutMs: 30 }),
    ).rejects.toThrow(/no answer within 30 ms/);
  });
});

describe('the sniff and the sharp guard (SPEC-3 8.5, 0.28; report 04 F17)', () => {
  test('the five formats by magic bytes; anything else is null', async () => {
    expect(sniffImage(new Uint8Array(PNG_2X2))).toBe('png');
    const jpeg = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#000' } })
      .jpeg()
      .toBuffer();
    expect(sniffImage(new Uint8Array(jpeg))).toBe('jpeg');
    const webp = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#000' } })
      .webp()
      .toBuffer();
    expect(sniffImage(new Uint8Array(webp))).toBe('webp');
    expect(sniffImage(new Uint8Array(Buffer.from('GIF89a  ')))).toBe('gif');
    expect(
      sniffImage(new Uint8Array(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))),
    ).toBe('svg');
    expect(
      sniffImage(
        new Uint8Array(Buffer.from('﻿<?xml version="1.0"?>\n<!-- x -->\n<svg viewBox="0 0 1 1"/>')),
      ),
    ).toBe('svg');
    // an HEIF container disguised as a png by its name is what the sniff exists for
    const heif = Buffer.concat([
      Buffer.from([0, 0, 0, 24]),
      Buffer.from('ftypheic'),
      Buffer.alloc(16),
    ]);
    expect(sniffImage(new Uint8Array(heif))).toBeNull();
    expect(sniffImage(new Uint8Array(Buffer.from('%PDF-1.4')))).toBeNull();
    expect(sniffImage(new Uint8Array(0))).toBeNull();
    expect(HOSTED_INPUT_FORMATS).toEqual(['png', 'jpeg', 'webp', 'gif']);
  });

  test('imageInfo refuses what the sniff refuses, refuses svg hosted and keeps it on a checkout', async () => {
    const info = await imageInfo(new Uint8Array(PNG_2X2), { hosted: true });
    expect(info).toMatchObject({ width: 2, height: 2, format: 'png', ext: '.png' });
    const heif = Buffer.concat([
      Buffer.from([0, 0, 0, 24]),
      Buffer.from('ftypheic'),
      Buffer.alloc(64),
    ]);
    await expect(imageInfo(new Uint8Array(heif))).rejects.toThrow(/not an image/);
    const svg = new Uint8Array(
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>'),
    );
    await expect(imageInfo(svg, { hosted: true })).rejects.toThrow(/svg is not accepted here/);
    const kept = await imageInfo(svg, { hosted: false });
    expect(kept.format).toBe('svg');
    setIntakePolicy({ allowPaths: false, hosted: true });
    await expect(imageInfo(svg)).rejects.toThrow(TypeError);
  });

  test('the HEIF and JXL loaders are blocked for the process and the guard is idempotent', async () => {
    blockUntrustedLoaders();
    blockUntrustedLoaders();
    // a blocked loader makes libvips refuse the format; sharp reports the input as unsupported
    const heif = Buffer.concat([
      Buffer.from([0, 0, 0, 24]),
      Buffer.from('ftypheic'),
      Buffer.alloc(64),
    ]);
    await expect(sharp(heif).metadata()).rejects.toThrow();
    // the raster formats the deck uses still decode
    const meta = await sharp(PNG_2X2).metadata();
    expect(meta.format).toBe('png');
  });
});

describe('the pinned lookup (SPEC-3 0.30, 8.6; report 04 F3 sketches 3 and 4)', () => {
  test('knows the private, loopback, link local, multicast, reserved and mapped ranges', () => {
    for (const address of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '255.255.255.255',
      '192.0.0.1',
      '198.18.0.1',
      '::1',
      '::',
      'fc00::1',
      'fd12::1',
      'fe80::1',
      'ff02::1',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '64:ff9b::10.0.0.1',
      'not an address',
    ])
      expect(isPrivateAddress(address), address).toBe(true);
    for (const address of [
      '8.8.8.8',
      '1.1.1.1',
      '93.184.216.34',
      '172.32.0.1',
      '2606:4700:4700::1111',
    ])
      expect(isPrivateAddress(address), address).toBe(false);
  });

  test('refuses a name that resolves to a private address, whole, and never names the address', async () => {
    const reports: { host: string; reason: string }[] = [];
    setSsrfReporter((event) => reports.push({ host: event.host, reason: event.reason }));
    try {
      const table: Record<string, string[]> = {
        'upload.wikimedia.org': ['93.184.216.34'],
        'evil.wikimedia.org': ['93.184.216.34', '127.0.0.1'],
        'meta.wikimedia.org': ['169.254.169.254'],
      };
      const resolver = (host: string) => Promise.resolve(table[host] ?? []);
      expect(await resolvePinned(new URL('https://upload.wikimedia.org/a'), resolver)).toBe(
        '93.184.216.34',
      );
      await expect(
        resolvePinned(new URL('https://evil.wikimedia.org/a'), resolver),
      ).rejects.toThrow(/never fetches/);
      await expect(
        resolvePinned(new URL('https://evil.wikimedia.org/a'), resolver),
      ).rejects.not.toThrow(/127\.0\.0\.1/);
      await expect(
        resolvePinned(new URL('https://meta.wikimedia.org/a'), resolver),
      ).rejects.toThrow(RangeError);
      await expect(
        resolvePinned(new URL('https://nowhere.wikimedia.org/a'), resolver),
      ).rejects.toThrow(/did not resolve/);
      await expect(
        resolvePinned(new URL('http://169.254.169.254/latest'), resolver),
      ).rejects.toThrow(/not a public address/);
      expect(await resolvePinned(new URL('https://[2606:4700:4700::1111]/x'), resolver)).toBe(
        '2606:4700:4700::1111',
      );
      expect(reports.map((r) => r.reason)).toEqual([
        'resolves to a private address',
        'resolves to a private address',
        'resolves to a private address',
        'private address',
      ]);
      // through fetchAllowed with an injected fetch and resolver: the fetch never runs
      const fetchImpl = fakeFetch({
        'https://evil.wikimedia.org/a.png': () => new Response(PNG_2X2, { status: 200 }),
      });
      await expect(
        safeFetch('https://evil.wikimedia.org/a.png', {
          fetchImpl,
          resolver,
          allowHosts: ['evil.wikimedia.org'],
        }),
      ).rejects.toThrow(/never fetches/);
      expect(fetchImpl.calls).toEqual([]);
      // a redirect onto a name that resolves privately is refused at the hop
      const chain = fakeFetch({
        'https://upload.wikimedia.org/a': () =>
          new Response(null, {
            status: 302,
            headers: { location: 'https://meta.wikimedia.org/b' },
          }),
        'https://meta.wikimedia.org/b': () => new Response(PNG_2X2, { status: 200 }),
      });
      await expect(
        fetchAllowed('https://upload.wikimedia.org/a', {
          fetchImpl: chain,
          resolver,
          allowHosts: ['meta.wikimedia.org'],
        }),
      ).rejects.toThrow(RangeError);
      expect(chain.calls).toEqual(['https://upload.wikimedia.org/a']);
    } finally {
      setSsrfReporter(null);
    }
  });
});
