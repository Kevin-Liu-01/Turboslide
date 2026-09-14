import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { afterEach, describe, expect, test } from 'vitest';

import { memoryPrincipalStore } from '@turboslide/identity/principal';

import {
  AVATAR_QUOTA,
  AVATAR_SIZES,
  AVATAR_TOO_LARGE,
  AvatarRefusal,
  SIGN_IN_TO_UPLOAD,
  fileAvatarStore,
  newAvatarKey,
  parseAvatarPath,
  pictureUrl,
  processAvatar,
  removePictureFiles,
  setPictureAvatar,
  sniffAvatar,
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

function fakeStore(): AvatarStore & { files: Map<string, AvatarFile>; removed: string[] } {
  const files = new Map<string, AvatarFile>();
  const removed: string[] = [];
  return {
    files,
    removed,
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
  };
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
    const huge = new Uint8Array(5 * 1024 * 1024 + 1);
    await expect(processAvatar(huge, newAvatarKey())).rejects.toThrow(AVATAR_TOO_LARGE);
    const tiny = await picture('png', 4, 4);
    await expect(processAvatar(tiny, newAvatarKey())).rejects.toThrow(AvatarRefusal);
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
    expect(await store.removeKey(key)).toBe(5);
    expect(existsSync(join(dir, 'u', key))).toBe(false);
    expect(await store.removeKey(key)).toBe(0);
    expect(await store.removeKey('../..')).toBe(0);
  });
});
