// Image hosting: the local host's content-addressed URLs and staging, the Cloud Storage host's V4
// signed URL (the signature verifies with the key's public half over the reconstructed string to
// sign, the five X-Goog parameters are present and sorted, the URL stays under 2 KB), the service
// account assertion, the cover crop arithmetic and the manifest over repeated files.
import { generateKeyPairSync, verify as rsaVerify } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { encodePngRgba } from '@turboslide/effects/io';

import {
  collectImageWants,
  coverCropRect,
  createCloudStorageHost,
  createLocalStaticHost,
  hostImages,
  redactManifest,
  sameAspect,
  serviceAccountAssertion,
  sha256Hex,
  signStorageUrl,
  writeCoverCrop,
} from './images.ts';
import type { ServiceAccountKey } from './images.ts';
import type { Scene } from '../scene/types.ts';

let dir = '';
let png: string;
let png2: string;

async function solidPng(path: string, width: number, height: number, value: number): Promise<void> {
  const data = new Uint8Array(width * height * 4).fill(value);
  await writeFile(path, await encodePngRgba({ width, height, data }));
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'turboslide-gslides-images-'));
  png = join(dir, 'a.png');
  png2 = join(dir, 'b.png');
  await solidPng(png, 4, 4, 10);
  await solidPng(png2, 4, 4, 20);
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('local static host', () => {
  test('plans a content-addressed URL without copying, and stages when asked', async () => {
    const bytes = await readFile(png);
    const sha = sha256Hex(bytes);
    const planned = createLocalStaticHost({
      dir: join(dir, 'staged'),
      baseUrl: 'http://localhost:4321/',
      stage: false,
    });
    const a = await planned.host(png, bytes, 'image/png');
    expect(a.url).toBe(`http://localhost:4321/api/assets/${sha}`);
    expect(a.token).toBe(sha);
    expect(a.staged).toBe(false);
    expect(existsSync(join(dir, 'staged', `${sha}.png`))).toBe(false);

    const staging = createLocalStaticHost({ dir: join(dir, 'staged'), stage: true });
    const b = await staging.host(png, bytes, 'image/png');
    expect(b.staged).toBe(true);
    expect(existsSync(join(dir, 'staged', `${sha}.png`))).toBe(true);
    expect(staging.describe()).toMatch(/localhost:4321\/api\/assets/);
  });
});

describe('Cloud Storage host', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const key: ServiceAccountKey = {
    type: 'service_account',
    client_email: 'exporter@turboslide-test.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };

  test('signs a V4 URL that verifies with the public key and stays under 2 KB', () => {
    const now = new Date('2026-09-10T12:34:56.000Z');
    const signed = signStorageUrl({
      bucket: 'turboslide-rasters',
      object: 'turboslide/ab cd/one+two.png',
      key,
      expiresSeconds: 900,
      now,
    });
    const url = new URL(signed.url);
    expect(url.host).toBe('storage.googleapis.com');
    expect(url.pathname).toBe('/turboslide-rasters/turboslide/ab%20cd/one%2Btwo.png');
    const keys = [...url.searchParams.keys()];
    expect(keys).toEqual([
      'X-Goog-Algorithm',
      'X-Goog-Credential',
      'X-Goog-Date',
      'X-Goog-Expires',
      'X-Goog-SignedHeaders',
      'X-Goog-Signature',
    ]);
    expect(url.searchParams.get('X-Goog-Date')).toBe('20260910T123456Z');
    expect(url.searchParams.get('X-Goog-Expires')).toBe('900');
    expect(url.searchParams.get('X-Goog-Credential')).toBe(
      `${key.client_email}/20260910/auto/storage/goog4_request`,
    );
    expect(signed.expiresAt).toBe('2026-09-10T12:49:56.000Z');
    expect(Buffer.byteLength(signed.url)).toBeLessThan(2048);
    const signature = Buffer.from(url.searchParams.get('X-Goog-Signature') ?? '', 'hex');
    expect(rsaVerify('RSA-SHA256', Buffer.from(signed.stringToSign), publicKey, signature)).toBe(
      true,
    );
    expect(signed.stringToSign.split('\n')[0]).toBe('GOOG4-RSA-SHA256');
    expect(signed.stringToSign.split('\n')[2]).toBe('20260910/auto/storage/goog4_request');
  });

  test('the service account assertion is an RS256 JWT with the storage scope', () => {
    const jwt = serviceAccountAssertion(
      key,
      'https://www.googleapis.com/auth/devstorage.read_write',
      new Date(1_700_000_000_000),
    );
    const [header, claims, signature] = jwt.split('.');
    const decode = (part: string | undefined): unknown =>
      JSON.parse(Buffer.from(part ?? '', 'base64url').toString('utf8'));
    expect(decode(header)).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(decode(claims)).toMatchObject({
      iss: key.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    });
    expect(
      rsaVerify(
        'RSA-SHA256',
        Buffer.from(`${header}.${claims}`),
        publicKey,
        Buffer.from(signature ?? '', 'base64url'),
      ),
    ).toBe(true);
  });

  test('plans unsigned URLs without a key and uploads once per object with one', async () => {
    const bytes = await readFile(png);
    const sha = sha256Hex(bytes);
    const planned = createCloudStorageHost({ bucket: 'b', upload: false });
    const a = await planned.host(png, bytes, 'image/png');
    expect(a.url).toBe(`https://storage.googleapis.com/b/turboslide/${sha}.png`);
    expect(a.signed).toBe(false);
    expect(a.staged).toBe(false);

    const calls: { url: string; method: string }[] = [];
    const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
      calls.push({ url, method: init?.method ?? 'GET' });
      if (url.includes('oauth2.googleapis.com'))
        return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), {
          status: 200,
        });
      if (url.includes('/upload/')) return new Response('{}', { status: 200 });
      // metadata: the first object is new, the second exists
      return new Response('{}', { status: url.includes(sha) ? 404 : 200 });
    };
    const live = createCloudStorageHost({
      bucket: 'b',
      key,
      upload: true,
      fetch: fetchImpl,
      now: () => new Date('2026-09-10T00:00:00Z'),
      ttlSeconds: 900,
    });
    const hosted = await live.host(png, bytes, 'image/png');
    expect(hosted.signed).toBe(true);
    expect(hosted.staged).toBe(true);
    expect(hosted.url).toMatch(/X-Goog-Signature=[0-9a-f]+$/);
    const other = await live.host(png2, await readFile(png2), 'image/png');
    expect(other.url).toMatch(/X-Goog-Signature/);
    const methods = calls.map(
      (c) => `${c.method} ${c.url.split('?')[0]?.split('/').slice(2, 4).join('/')}`,
    );
    expect(methods[0]).toMatch(/^POST oauth2.googleapis.com/);
    expect(calls.filter((c) => c.url.includes('/upload/'))).toHaveLength(1);
    expect(calls.filter((c) => c.url.includes('oauth2.googleapis.com'))).toHaveLength(1);
  });
});

describe('cover crops', () => {
  test('the cover rectangle follows object-fit: cover and object-position', () => {
    expect(sameAspect(3200, 1800, [0, 0, 1600, 900])).toBe(true);
    expect(sameAspect(1200, 900, [0, 0, 1600, 900])).toBe(false);
    // a 4:3 picture in a 16:9 box keeps its width and crops the height, centered
    expect(coverCropRect(1200, 900, [0, 0, 1600, 900], '50% 50%')).toEqual([0, 113, 1200, 675]);
    // top-anchored
    expect(coverCropRect(1200, 900, [0, 0, 1600, 900], '50% 0%')).toEqual([0, 0, 1200, 675]);
    // a wide picture in a square box crops the width
    expect(coverCropRect(2000, 1000, [0, 0, 500, 500], '50% 50%')).toEqual([500, 0, 1000, 1000]);
  });

  test('writeCoverCrop writes the cropped pixels', async () => {
    const wide = join(dir, 'wide.png');
    const data = new Uint8Array(8 * 4 * 4);
    for (let x = 0; x < 8; x += 1)
      for (let y = 0; y < 4; y += 1) data.set([x * 30, 0, 0, 255], (y * 8 + x) * 4);
    await writeFile(wide, await encodePngRgba({ width: 8, height: 4, data }));
    const out = await writeCoverCrop(
      wide,
      { box: [0, 0, 100, 100], naturalWidth: 8, naturalHeight: 4, objectPosition: '50% 50%' },
      join(dir, 'crops'),
    );
    expect(out).toMatch(/wide-cover-4x4\.png$/);
    const { decodeImage } = await import('@turboslide/effects/io');
    const cropped = await decodeImage(out);
    expect([cropped.width, cropped.height]).toEqual([4, 4]);
    // columns 2..5 of the source: red 60, 90, 120, 150
    expect([cropped.data[0], cropped.data[4], cropped.data[8], cropped.data[12]]).toEqual([
      60, 90, 120, 150,
    ]);
  });
});

describe('hostImages', () => {
  test('hosts each distinct file once, folds repeated files and hashes, and lists missing ones', async () => {
    const scene = (id: string, files: (string | undefined)[]): Scene => ({
      slideId: id,
      n: 1,
      total: 1,
      theme: 'light',
      kind: 'content',
      sheet: [0, 0, 1600, 900],
      paper: '#ffffff',
      ink: '#070707',
      frame: { rules: [], crosses: [], crossColor: '#000' },
      plates: [],
      chips: [],
      texts: [],
      rules: [],
      rects: [],
      rasters: files.map((file, i) => ({
        id: `b${i}:${i}`,
        blockId: `b${i}`,
        kind: 'icon' as const,
        selector: '',
        box: [0, 0, 10, 10] as [number, number, number, number],
        alpha: true,
        scale: 2 as const,
        ...(file ? { file } : {}),
      })),
      blocks: [],
      fonts: [],
      warnings: [],
      wordmark: [72, 864, 28, 18],
    });
    const copy = join(dir, 'a-copy.png');
    await writeFile(copy, await readFile(png));
    const wants = collectImageWants(
      [scene('s1', [png, png2, join(dir, 'missing.png')]), scene('s2', [png, copy])],
      'native',
      png2,
    );
    // s1: wordmark, three rasters (one missing); s2: wordmark, two rasters
    expect(wants).toHaveLength(7);
    const host = createLocalStaticHost({ dir: join(dir, 'h'), stage: false });
    const { manifest, resolveUrl } = await hostImages(wants, { host, workDir: join(dir, 'work') });
    expect(manifest.images).toHaveLength(2);
    expect(manifest.missing).toEqual([
      { file: join(dir, 'missing.png'), slideId: 's1', blockId: 'b2', role: 'raster' },
    ]);
    const a = manifest.images.find((i) => i.file === png);
    expect(a?.uses.map((u) => `${u.slideId}#${u.blockId}`)).toEqual(['s1#b0', 's2#b0', 's2#b1']);
    expect(resolveUrl(copy, { slideId: 's2', blockId: 'b1', kind: 'icon', role: 'raster' })).toBe(
      a?.url,
    );
    expect(
      resolveUrl(join(dir, 'missing.png'), {
        slideId: 's1',
        blockId: 'b2',
        kind: 'icon',
        role: 'raster',
      }),
    ).toBeUndefined();
    expect(manifest.staged).toBe(false);
    expect(manifest.maxUrlBytes).toBeGreaterThan(0);
    const redacted = redactManifest({
      ...manifest,
      images: manifest.images.map((i) => ({
        ...i,
        signed: true,
        url: `${i.url}?X-Goog-Signature=abc123`,
      })),
    });
    expect(redacted.images[0]?.url).toMatch(/X-Goog-Signature=<redacted>$/);
  });
});
