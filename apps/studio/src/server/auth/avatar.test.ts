import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { afterEach, describe, expect, test } from 'vitest';

import { memoryPrincipalStore } from '@turboslide/identity/principal';

import type { BlobClient, BlobEntry, BlobPutOptions } from '@turboslide/store/blob-store';

import {
  AVATAR_CACHE_MAX_AGE_S,
  AVATAR_MAX_BYTES,
  AVATAR_MAX_DATA_URL_LENGTH,
  AVATAR_QUOTA,
  AVATAR_SIZES,
  AVATAR_STORE_UNAVAILABLE,
  AVATAR_TOO_LARGE,
  AVATAR_TOO_MANY_PIXELS,
  AvatarRefusal,
  SIGN_IN_TO_UPLOAD,
  blobAvatarStore,
  fileAvatarStore,
  newAvatarKey,
  parseAvatarPath,
  pictureUrl,
  processAvatar,
  removePictureFiles,
  setPictureAvatar,
  sniffAvatar,
  sweepOrphanAvatars,
} from './avatar.ts';
import type { AvatarFile, AvatarStore } from './avatar.ts';
import { memoryProfileStore } from './profile.ts';
import { memoryQuotaStore } from './quota.ts';

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop() ?? '', { recursive: true, force: true });
});

/** A test picture with a horizontal gradient, so a crop changes the bytes. */
async function picture(format: 'png' | 'jpeg' | 'webp' | 'gif', width = 300, height = 200) {
  const raw = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      raw[i] = Math.round((x / Math.max(1, width - 1)) * 255);
      raw[i + 1] = 96;
      raw[i + 2] = Math.round((y / Math.max(1, height - 1)) * 255);
    }
  const base = sharp(Buffer.from(raw), { raw: { width, height, channels: 3 } });
  const out =
    format === 'png'
      ? await base.png().toBuffer()
      : format === 'jpeg'
        ? await base.jpeg().toBuffer()
        : format === 'webp'
          ? await base.webp().toBuffer()
          : await base.gif().toBuffer();
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}

function fakeStore(): AvatarStore & {
  files: Map<string, AvatarFile>;
  removed: string[];
  /** the write time per key the listing reports; unset keys report null */
  times: Map<string, string>;
} {
  const files = new Map<string, AvatarFile>();
  const removed: string[] = [];
  const times = new Map<string, string>();
  return {
    files,
    removed,
    times,
    put(file) {
      files.set(file.relative, file);
      return Promise.resolve(`https://store.test/${file.relative}`);
    },
    removeKey(key) {
      removed.push(key);
      let n = 0;
      for (const relative of [...files.keys()])
        if (relative.startsWith(`u/${key}/`)) {
          files.delete(relative);
          n += 1;
        }
      return Promise.resolve(n);
    },
    base: (key) => `https://store.test/u/${key}`,
    listKeys() {
      const keys = new Map<string, number>();
      for (const relative of files.keys()) {
        const key = relative.split('/')[1] ?? '';
        keys.set(key, (keys.get(key) ?? 0) + 1);
      }
      return Promise.resolve(
        [...keys.entries()].map(([avatarKey, count]) => ({
          avatarKey,
          files: count,
          newestAt: times.get(avatarKey) ?? null,
        })),
      );
    },
  };
}

/** A Blob client over a map, the shape `blobAvatarStore` needs and nothing more. */
function fakeBlobClient(origin = 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com'): BlobClient & {
  puts: { pathname: string; options: BlobPutOptions }[];
  blobs: Map<string, BlobEntry>;
} {
  const blobs = new Map<string, BlobEntry>();
  const puts: { pathname: string; options: BlobPutOptions }[] = [];
  const client = {
    puts,
    blobs,
    head: (pathname: string) => Promise.resolve(blobs.get(pathname) ?? null),
    get: () => Promise.resolve(null),
    list: (prefix: string) =>
      Promise.resolve([...blobs.values()].filter((entry) => entry.pathname.startsWith(prefix))),
    folders: () => Promise.resolve([]),
    put: (pathname: string, bytes: Uint8Array, options: BlobPutOptions) => {
      puts.push({ pathname, options });
      const entry: BlobEntry = {
        pathname,
        url: `${origin}/${pathname}`,
        size: bytes.byteLength,
        version: 'v1',
        uploadedAt: '2026-09-29T10:00:00.000Z',
      };
      blobs.set(pathname, entry);
      return Promise.resolve(entry);
    },
    del: (pathnames: ReadonlyArray<string>) => {
      for (const pathname of pathnames) blobs.delete(pathname);
      return Promise.resolve();
    },
  };
  return client as unknown as typeof client & BlobClient;
}

describe('sniffAvatar', () => {
  test('knows the four picture formats by their magic numbers and nothing else', async () => {
    expect(sniffAvatar(await picture('png'))).toBe('png');
    expect(sniffAvatar(await picture('jpeg'))).toBe('jpeg');
    expect(sniffAvatar(await picture('webp'))).toBe('webp');
    expect(sniffAvatar(await picture('gif'))).toBe('gif');
    expect(
      sniffAvatar(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).toBeNull();
    // an HEIF box: size, 'ftyp', 'heic'
    expect(
      sniffAvatar(
        Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0]),
      ),
    ).toBeNull();
    expect(sniffAvatar(new Uint8Array(4))).toBeNull();
  });
});

describe('processAvatar', () => {
  test('writes the four WebP sizes and the 256 px PNG under the key, with a digest of the PNG', async () => {
    const bytes = await picture('jpeg', 640, 480);
    const key = newAvatarKey();
    expect(key).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const processed = await processAvatar(bytes, key);
    expect(processed.sizes).toEqual([...AVATAR_SIZES]);
    expect(processed.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(processed.files.map((f) => f.relative)).toEqual([
      ...AVATAR_SIZES.map((s) => `u/${key}/${processed.digest}-${s}.webp`),
      `u/${key}/${processed.digest}-256.png`,
    ]);
    for (const file of processed.files) {
      const meta = await sharp(Buffer.from(file.bytes)).metadata();
      expect(meta.width).toBe(file.size);
      expect(meta.height).toBe(file.size);
      expect(meta.format).toBe(file.contentType === 'image/png' ? 'png' : 'webp');
      // metadata is stripped: no exif, no icc
      expect(meta.exif).toBeUndefined();
    }
    // the same bytes give the same digest and files; a crop changes them
    const again = await processAvatar(bytes, key);
    expect(again.digest).toBe(processed.digest);
    const cropped = await processAvatar(bytes, key, { left: 0, top: 0, size: 200 });
    expect(cropped.digest).not.toBe(processed.digest);
  });

  test('refuses what is not a picture, a document that lies about its type, and a large upload', async () => {
    await expect(processAvatar(new TextEncoder().encode('<svg/>'), newAvatarKey())).rejects.toThrow(
      AvatarRefusal,
    );
    const lying = await picture('png');
    lying.set([0xff, 0xd8, 0xff], 0);
    await expect(processAvatar(lying, newAvatarKey())).rejects.toThrow(AvatarRefusal);
    // the request cap of PEOPLE.md 4.2: 512 KB plus one byte is refused before the sniff
    expect(AVATAR_MAX_BYTES).toBe(512 * 1024);
    const huge = new Uint8Array(AVATAR_MAX_BYTES + 1);
    await expect(processAvatar(huge, newAvatarKey())).rejects.toThrow(AVATAR_TOO_LARGE);
    expect(sniffAvatar(huge)).toBeNull();
    // the data URL bound admits the cap's bytes in base64 with a header and nothing more
    expect(AVATAR_MAX_DATA_URL_LENGTH).toBeGreaterThanOrEqual(Math.ceil(AVATAR_MAX_BYTES / 3) * 4 + 23);
    expect(AVATAR_MAX_DATA_URL_LENGTH).toBeLessThan(700_000);
    const tiny = await picture('png', 4, 4);
    await expect(processAvatar(tiny, newAvatarKey())).rejects.toThrow(AvatarRefusal);
  });

  test('the pixel cap refuses a 2048 by 2048 picture in words and takes 1024 by 1024', async () => {
    // a flat picture is a few KB, so the byte cap passes and the pixel cap is what answers
    const flat = async (side: number) =>
      new Uint8Array(
        await sharp({ create: { width: side, height: side, channels: 3, background: '#406080' } })
          .png()
          .toBuffer(),
      );
    const large = await flat(2048);
    expect(large.byteLength).toBeLessThan(AVATAR_MAX_BYTES);
    await expect(processAvatar(large, newAvatarKey())).rejects.toThrow(AVATAR_TOO_MANY_PIXELS);
    const edge = await processAvatar(await flat(1024), newAvatarKey());
    expect(edge.files).toHaveLength(5);
  });

  test('an orientation 6 JPEG lands upright with no Exif in the files', async () => {
    // a 64 by 32 gradient (red along x) stored with orientation 6: rotated 90 degrees clockwise
    // it is 32 wide and 64 tall with red running down the rows, so the 256 px PNG's red is flat
    // along x and ramps along y; a pipeline that ignored the tag would ramp along x
    const width = 64;
    const height = 32;
    const raw = new Uint8Array(width * height * 3);
    for (let y = 0; y < height; y += 1)
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 3;
        raw[i] = Math.round((x / (width - 1)) * 255);
        raw[i + 1] = 96;
        raw[i + 2] = Math.round((y / (height - 1)) * 255);
      }
    const jpeg = await sharp(Buffer.from(raw), { raw: { width, height, channels: 3 } })
      .jpeg({ quality: 95 })
      .withMetadata({ orientation: 6 })
      .toBuffer();
    expect((await sharp(jpeg).metadata()).orientation).toBe(6);
    const processed = await processAvatar(
      new Uint8Array(jpeg.buffer, jpeg.byteOffset, jpeg.byteLength),
      newAvatarKey(),
    );
    const png = processed.files.find((file) => file.contentType === 'image/png');
    expect(png).toBeDefined();
    const { data, info } = await sharp(Buffer.from(png!.bytes))
      .raw()
      .toBuffer({ resolveWithObject: true });
    const red = (x: number, y: number): number => data[(y * info.width + x) * info.channels] ?? -1;
    expect(Math.abs(red(16, 16) - red(240, 16))).toBeLessThan(24);
    expect(red(128, 240) - red(128, 16)).toBeGreaterThan(60);
    for (const file of processed.files) {
      const meta = await sharp(Buffer.from(file.bytes)).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.orientation).toBeUndefined();
    }
  });
});

describe('blobAvatarStore', () => {
  test('the base is computed from the public store origin on every call, the put carries a year of cache, and keys list', async () => {
    const client = fakeBlobClient();
    const store = blobAvatarStore(client, {
      origin: 'https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/',
    });
    const key = newAvatarKey();
    // before any put in this process, the base is already the public URL of the key's folder
    expect(store.base(key)).toBe(
      `https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/u/${key}`,
    );
    const processed = await processAvatar(await picture('png'), key);
    for (const file of processed.files) {
      const url = await store.put(file);
      expect(url).toBe(`${store.base(key)}/${file.relative.split('/')[2]}`);
    }
    expect(client.puts).toHaveLength(5);
    for (const put of client.puts) {
      expect(put.options.overwrite).toBe(false);
      expect(put.options.cacheControlMaxAge).toBe(AVATAR_CACHE_MAX_AGE_S);
      expect(put.options.contentType).toMatch(/^image\/(webp|png)$/);
    }
    expect(await store.listKeys()).toEqual([
      { avatarKey: key, files: 5, newestAt: '2026-09-29T10:00:00.000Z' },
    ]);
    expect(await store.removeKey(key)).toBe(5);
    expect(await store.listKeys()).toEqual([]);
    expect(await store.removeKey('../..')).toBe(0);
  });

  test('without an origin the base is relative until a put names one; a lazy client answering null refuses', async () => {
    const client = fakeBlobClient('https://other.test');
    const store = blobAvatarStore(() => Promise.resolve(client));
    const key = newAvatarKey();
    expect(store.base(key)).toBe(`u/${key}`);
    const processed = await processAvatar(await picture('png', 16, 16), key);
    await store.put(processed.files[0]!);
    expect(store.base(key)).toBe(`https://other.test/u/${key}`);
    const none = blobAvatarStore(() => Promise.resolve(null), { origin: 'https://x.test' });
    expect(none.base(key)).toBe(`https://x.test/u/${key}`);
    await expect(none.put(processed.files[0]!)).rejects.toThrow(AVATAR_STORE_UNAVAILABLE);
  });
});

describe('sweepOrphanAvatars', () => {
  test('keeps a profile\'s key and a young key, removes an old orphan, and lists only on a dry run', async () => {
    const store = fakeStore();
    const profiles = memoryProfileStore();
    const principals = memoryPrincipalStore();
    const deps = { store, profiles, principals, quotas: memoryQuotaStore() };
    const bytes = await picture('png', 16, 16);
    const named = await setPictureAvatar(deps, 'usr_maya', bytes);
    const namedKey = named.picture?.avatarKey ?? '';
    // an orphan: files written under a key no profile names (a put that never reached the record)
    const orphanKey = newAvatarKey();
    for (const file of (await processAvatar(bytes, orphanKey)).files) await store.put(file);
    const youngKey = newAvatarKey();
    for (const file of (await processAvatar(bytes, youngKey)).files) await store.put(file);
    const unknownAgeKey = newAvatarKey();
    for (const file of (await processAvatar(bytes, unknownAgeKey)).files) await store.put(file);
    const now = new Date('2026-09-29T12:00:00.000Z');
    store.times.set(namedKey, '2026-09-01T00:00:00.000Z');
    store.times.set(orphanKey, '2026-09-27T12:00:00.000Z');
    store.times.set(youngKey, '2026-09-29T11:30:00.000Z');
    const dry = await sweepOrphanAvatars(store, profiles, { dryRun: true, now: () => now });
    expect(dry).toEqual({
      dryRun: true,
      scanned: 4,
      kept: 1,
      young: 2,
      orphans: [orphanKey],
      filesRemoved: 0,
    });
    expect(store.files.size).toBe(20);
    const swept = await sweepOrphanAvatars(store, profiles, { now: () => now });
    expect(swept).toEqual({
      dryRun: false,
      scanned: 4,
      kept: 1,
      young: 2,
      orphans: [orphanKey],
      filesRemoved: 5,
    });
    expect(store.removed).toEqual([orphanKey]);
    expect([...store.files.keys()].some((relative) => relative.startsWith(`u/${orphanKey}/`))).toBe(
      false,
    );
    expect([...store.files.keys()].some((relative) => relative.startsWith(`u/${namedKey}/`))).toBe(
      true,
    );
    // a window of zero hours makes the unknown age key stay young still: no time, no removal
    const again = await sweepOrphanAvatars(store, profiles, { olderThanHours: 0, now: () => now });
    expect(again.orphans).toEqual([youngKey]);
    expect(again.young).toBe(1);
  });
});

describe('setPictureAvatar', () => {
  test('refuses an anonymous principal with the sentence and never touches the quota', async () => {
    const quotas = memoryQuotaStore();
    const deps = {
      store: fakeStore(),
      profiles: memoryProfileStore(),
      principals: memoryPrincipalStore(),
      quotas,
    };
    await expect(
      setPictureAvatar(deps, 'anon_9f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b', await picture('png')),
    ).rejects.toThrow(SIGN_IN_TO_UPLOAD);
    expect(await quotas.peek('avatar:anon_9f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b')).toBe(0);
  });

  test('stores the files under a fresh key, records the choice, and deletes the previous key on change', async () => {
    const store = fakeStore();
    const profiles = memoryProfileStore();
    const principals = memoryPrincipalStore();
    const deps = { store, profiles, principals, quotas: memoryQuotaStore() };
    const first = await setPictureAvatar(deps, 'usr_maya', await picture('png'));
    expect(first.variant).toBe('picture');
    const key1 = first.picture?.avatarKey ?? '';
    expect(first.picture?.base).toBe(`https://store.test/u/${key1}`);
    expect(store.files.size).toBe(5);
    expect((await profiles.get('maya'))?.avatarKey).toBe(key1);
    expect((await principals.get('usr_maya'))?.avatar).toEqual(first);
    expect(pictureUrl(first, 32)).toBe(
      `https://store.test/u/${key1}/${first.picture?.digest}-32.webp`,
    );
    expect(pictureUrl({ variant: 'initials' }, 32)).toBeUndefined();
    const second = await setPictureAvatar(deps, 'usr_maya', await picture('jpeg'));
    const key2 = second.picture?.avatarKey ?? '';
    expect(key2).not.toBe(key1);
    expect(store.removed).toEqual([key1]);
    expect([...store.files.keys()].every((relative) => relative.startsWith(`u/${key2}/`))).toBe(
      true,
    );
    expect(await removePictureFiles({ store, profiles }, 'maya')).toBe(5);
    expect(store.files.size).toBe(0);
  });

  test('the eleventh upload of a day is refused', async () => {
    const deps = {
      store: fakeStore(),
      profiles: memoryProfileStore(),
      principals: memoryPrincipalStore(),
      quotas: memoryQuotaStore(),
    };
    const bytes = await picture('png', 16, 16);
    for (let i = 0; i < 10; i += 1) await setPictureAvatar(deps, 'usr_kai', bytes);
    await expect(setPictureAvatar(deps, 'usr_kai', bytes)).rejects.toThrow(AVATAR_QUOTA);
  });
});

describe('the file store of a checkout', () => {
  test('writes under the state folder, reads by the path grammar, and removes a key', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'turboslide-avatar-'));
    dirs.push(dir);
    const store = fileAvatarStore(dir, '/api/avatar');
    const key = newAvatarKey();
    const processed = await processAvatar(await picture('png'), key);
    for (const file of processed.files)
      expect(await store.put(file)).toBe(`/api/avatar/${file.relative}`);
    expect(store.base(key)).toBe(`/api/avatar/u/${key}`);
    const relative = processed.files[0]?.relative ?? '';
    expect(parseAvatarPath(relative)).toEqual({ avatarKey: key, file: relative.split('/')[2] });
    expect(parseAvatarPath('u/../../etc/passwd')).toBeNull();
    expect(parseAvatarPath(`u/${key}/evil.webp`)).toBeNull();
    expect(parseAvatarPath(`x/${key}/${processed.digest}-32.webp`)).toBeNull();
    const read = store.read(relative);
    expect(read?.contentType).toBe('image/webp');
    expect(read?.bytes.byteLength).toBe(processed.files[0]?.bytes.byteLength);
    expect(store.read('u/nope/x.webp')).toBeNull();
    expect(existsSync(join(dir, 'u', key))).toBe(true);
    const listed = await store.listKeys();
    expect(listed.map((row) => row.avatarKey)).toEqual([key]);
    expect(listed[0]?.files).toBe(5);
    expect(Date.parse(listed[0]?.newestAt ?? '')).toBeGreaterThan(0);
    expect(await store.removeKey(key)).toBe(5);
    expect(existsSync(join(dir, 'u', key))).toBe(false);
    expect(await store.listKeys()).toEqual([]);
    expect(await store.removeKey(key)).toBe(0);
    expect(await store.removeKey('../..')).toBe(0);
  });
});
