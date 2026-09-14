// The picture avatar (gslides-parity SPEC-3 0.22, 7.6; research 03 I4; report 10 F43): a
// signed in principal's upload runs through sharp once and only the derived files are kept.
// The bytes are sniffed (JPEG, PNG, WebP or GIF by their magic numbers; SVG and HEIF refused
// before any decoder sees them), decoded with `failOn: 'error'` under `limitInputPixels`, rotated
// by the orientation tag, cropped to the square the person dragged, resized to 32, 64, 128 and
// 256 px WebP at quality 80 plus one 256 px PNG, metadata stripped, and stored under
// `u/<avatarKey>/<sha256>-<size>.<ext>` where `avatarKey` is a random 128 bit value per person,
// rotated on every change with the old prefix deleted. Anonymous principals are refused with the
// dialog's sentence, never at the quota; ten uploads per identity per day.
//
// Two stores: the public Blob store hosted (the files are public URLs like the deck twins) and
// `.turboslide/users/` on a checkout, served by routes/api/avatar.$.ts with
// `Cross-Origin-Resource-Policy: same-origin` and `nosniff`. sharp is a native addon reached on
// the server only (apps/studio/vite.config.ts externalizes it).
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, sep } from 'node:path';

import sharp from 'sharp';
import type { Metadata, Sharp } from 'sharp';

import type { AvatarChoice, PrincipalStore } from '@turboslide/identity/principal';
import { parsePrincipalId } from '@turboslide/identity/ids';
import type { BlobClient } from '@turboslide/store/blob-store';

import type { ProfileStore } from './profile.ts';
import { DAY_MS } from './quota.ts';
import type { QuotaStore } from './quota.ts';

export const AVATAR_SIZES = [32, 64, 128, 256] as const;
export const AVATAR_PNG_SIZE = 256;
export const AVATAR_WEBP_QUALITY = 80;
/** 5 MB after the browser's resize to at most 1024 px (7.6). */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
/** 16.7 megapixels: a phone photograph that skipped the client resize still decodes, a bomb does not. */
export const AVATAR_MAX_INPUT_PIXELS = 4096 * 4096;
export const AVATAR_UPLOADS_PER_DAY = 10;
export const AVATAR_PREFIX = 'u';
/** The route a checkout serves the files from (routes/api/avatar.$.ts). */
export const AVATAR_ROUTE = '/api/avatar';
/** The Picture tab's sentence for an anonymous principal (SPEC-3 6.8). */
export const SIGN_IN_TO_UPLOAD = 'Sign in to upload a picture';
export const AVATAR_TOO_LARGE = 'Pictures up to 5 MB';
export const AVATAR_NOT_A_PICTURE = 'Use a JPEG, PNG, WebP or GIF picture';
export const AVATAR_QUOTA = 'You have reached today’s limit of ten pictures';

export type AvatarFormat = 'jpeg' | 'png' | 'webp' | 'gif';

/** The format by magic number, or null for anything else (SVG, HEIF, a document). */
export function sniffAvatar(bytes: Uint8Array): AvatarFormat | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return 'png';
  const ascii = (from: number, to: number): string =>
    String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return 'gif';
  return null;
}

/** A square crop in source pixels, after the orientation tag is applied. */
export type AvatarCrop = { left: number; top: number; size: number };

export type AvatarFile = {
  /** `u/<avatarKey>/<digest>-<size>.<ext>` */
  relative: string;
  bytes: Uint8Array;
  contentType: string;
  size: number;
};

export type ProcessedAvatar = { digest: string; sizes: number[]; files: AvatarFile[] };

/** A fresh 128 bit key, 22 base64url characters. */
export function newAvatarKey(): string {
  return randomBytes(16).toString('base64url');
}

export class AvatarRefusal extends TypeError {
  readonly sentence: string;
  constructor(sentence: string) {
    super(sentence);
    this.name = 'TypeError';
    this.sentence = sentence;
  }
}

/**
 * The sharp pipeline over sniffed bytes; the digest is sha256 of the 256 px PNG so two uploads of
 * one picture are one set of files. The crop is applied after rotation; without one the centre
 * square is taken with sharp's attention strategy.
 */
export async function processAvatar(
  bytes: Uint8Array,
  avatarKey: string,
  crop?: AvatarCrop,
): Promise<ProcessedAvatar> {
  if (bytes.byteLength > AVATAR_MAX_BYTES) throw new AvatarRefusal(AVATAR_TOO_LARGE);
  const format = sniffAvatar(bytes);
  if (format === null) throw new AvatarRefusal(AVATAR_NOT_A_PICTURE);
  const open = (): Sharp =>
    sharp(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), {
      failOn: 'error',
      limitInputPixels: AVATAR_MAX_INPUT_PIXELS,
      animated: false,
    }).rotate();
  let metadata: Metadata;
  try {
    metadata = await open().metadata();
  } catch {
    throw new AvatarRefusal(AVATAR_NOT_A_PICTURE);
  }
  if (metadata.format !== format) throw new AvatarRefusal(AVATAR_NOT_A_PICTURE);
  const rotated = (metadata.orientation ?? 1) >= 5;
  const width = rotated ? (metadata.height ?? 0) : (metadata.width ?? 0);
  const height = rotated ? (metadata.width ?? 0) : (metadata.height ?? 0);
  if (width < 8 || height < 8) throw new AvatarRefusal(AVATAR_NOT_A_PICTURE);
  const square = (): Sharp => {
    if (crop !== undefined) {
      const size = Math.max(1, Math.min(Math.floor(crop.size), width, height));
      const left = Math.max(0, Math.min(Math.floor(crop.left), width - size));
      const top = Math.max(0, Math.min(Math.floor(crop.top), height - size));
      return open().extract({ left, top, width: size, height: size });
    }
    return open();
  };
  const png = await square()
    .resize(AVATAR_PNG_SIZE, AVATAR_PNG_SIZE, {
      fit: 'cover',
      position: crop === undefined ? 'attention' : 'centre',
    })
    .png({ compressionLevel: 6 })
    .toBuffer();
  const digest = createHash('sha256').update(png).digest('hex');
  const folder = `${AVATAR_PREFIX}/${avatarKey}`;
  const files: AvatarFile[] = [];
  for (const size of AVATAR_SIZES) {
    const webp = await square()
      .resize(size, size, {
        fit: 'cover',
        position: crop === undefined ? 'attention' : 'centre',
      })
      .webp({ quality: AVATAR_WEBP_QUALITY, effort: 4 })
      .toBuffer();
    files.push({
      relative: `${folder}/${digest}-${size}.webp`,
      bytes: new Uint8Array(webp.buffer, webp.byteOffset, webp.byteLength),
      contentType: 'image/webp',
      size,
    });
  }
  files.push({
    relative: `${folder}/${digest}-${AVATAR_PNG_SIZE}.png`,
    bytes: new Uint8Array(png.buffer, png.byteOffset, png.byteLength),
    contentType: 'image/png',
    size: AVATAR_PNG_SIZE,
  });
  return { digest, sizes: [...AVATAR_SIZES], files };
}

export type AvatarStore = {
  /** Writes one file and answers its public URL. */
  put: (file: AvatarFile) => Promise<string>;
  /** Removes every file under `u/<avatarKey>/`; answers how many. */
  removeKey: (avatarKey: string) => Promise<number>;
  /** The URL prefix of a key's folder, without the trailing slash. */
  base: (avatarKey: string) => string;
};

const KEY = /^[A-Za-z0-9_-]{22}$/;
const FILE = /^[0-9a-f]{64}-(32|64|128|256)\.(webp|png)$/;

/** A relative path of the avatar grammar, or null. */
export function parseAvatarPath(relative: string): { avatarKey: string; file: string } | null {
  const parts = relative.split('/');
  if (parts.length !== 3 || parts[0] !== AVATAR_PREFIX) return null;
  const [, avatarKey, file] = parts;
  if (avatarKey === undefined || file === undefined) return null;
  if (!KEY.test(avatarKey) || !FILE.test(file)) return null;
  return { avatarKey, file };
}

/** `.turboslide/users/` on a checkout, served by the avatar route. */
export function fileAvatarStore(
  dir: string,
  routeBase: string = AVATAR_ROUTE,
): AvatarStore & {
  read: (relative: string) => { bytes: Uint8Array<ArrayBuffer>; contentType: string } | null;
} {
  const pathOf = (relative: string): string => {
    const full = normalize(join(dir, relative));
    if (!full.startsWith(normalize(dir) + sep)) throw new RangeError('outside the avatar folder');
    return full;
  };
  return {
    put(file) {
      const path = pathOf(file.relative);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, file.bytes);
      return Promise.resolve(`${routeBase}/${file.relative}`);
    },
    removeKey(avatarKey) {
      if (!KEY.test(avatarKey)) return Promise.resolve(0);
      const folder = pathOf(`${AVATAR_PREFIX}/${avatarKey}`);
      let count = 0;
      try {
        count = readdirSync(folder).length;
      } catch {
        return Promise.resolve(0);
      }
      rmSync(folder, { recursive: true, force: true });
      return Promise.resolve(count);
    },
    base: (avatarKey) => `${routeBase}/${AVATAR_PREFIX}/${avatarKey}`,
    read(relative) {
      const parsed = parseAvatarPath(relative);
      if (parsed === null) return null;
      try {
        const bytes = readFileSync(pathOf(relative));
        return {
          // a copy into a fresh ArrayBuffer, the form a Response body takes
          bytes: Uint8Array.from(bytes),
          contentType: relative.endsWith('.png') ? 'image/png' : 'image/webp',
        };
      } catch {
        return null;
      }
    },
  };
}

/** The public Blob store hosted: the files are public URLs, the prefix is deleted on rotation. */
export function blobAvatarStore(client: BlobClient): AvatarStore {
  const bases = new Map<string, string>();
  return {
    async put(file) {
      const entry = await client.put(file.relative, file.bytes, {
        overwrite: false,
        contentType: file.contentType,
      });
      const folder = entry.url.slice(0, entry.url.lastIndexOf('/'));
      bases.set(file.relative.split('/')[1] ?? '', folder);
      return entry.url;
    },
    async removeKey(avatarKey) {
      if (!KEY.test(avatarKey)) return 0;
      const entries = await client.list(`${AVATAR_PREFIX}/${avatarKey}/`);
      if (entries.length > 0) await client.del(entries.map((entry) => entry.pathname));
      bases.delete(avatarKey);
      return entries.length;
    },
    base: (avatarKey) => bases.get(avatarKey) ?? `${AVATAR_PREFIX}/${avatarKey}`,
  };
}

export type SetPictureDeps = {
  store: AvatarStore;
  profiles: ProfileStore;
  principals: PrincipalStore;
  quotas: QuotaStore;
  now?: () => Date;
};

/**
 * `account.setAvatar` with a picture (7.6): refuses an anonymous principal with the sentence,
 * counts the day's uploads, processes the bytes, writes the files under a fresh key, records the
 * choice on the profile and the principal record, and deletes the previous key's files.
 */
export async function setPictureAvatar(
  deps: SetPictureDeps,
  principalId: string,
  bytes: Uint8Array,
  crop?: AvatarCrop,
): Promise<AvatarChoice> {
  const parsed = parsePrincipalId(principalId);
  if (parsed === null || parsed.kind !== 'account') throw new AvatarRefusal(SIGN_IN_TO_UPLOAD);
  const now = (deps.now ?? (() => new Date()))();
  const quota = await deps.quotas.take(
    `avatar:${principalId}`,
    AVATAR_UPLOADS_PER_DAY,
    DAY_MS,
    now,
  );
  if (!quota.ok) throw new AvatarRefusal(AVATAR_QUOTA);
  const avatarKey = newAvatarKey();
  const processed = await processAvatar(bytes, avatarKey, crop);
  for (const file of processed.files) await deps.store.put(file);
  const previous = await deps.profiles.get(parsed.userId);
  const choice: AvatarChoice = {
    variant: 'picture',
    picture: {
      avatarKey,
      digest: processed.digest,
      sizes: processed.sizes,
      base: deps.store.base(avatarKey),
    },
  };
  await deps.profiles.setAvatar(parsed.userId, choice, avatarKey, now);
  const record = await deps.principals.touch(principalId, now, true);
  if (record !== null) await deps.principals.put({ ...record, avatar: choice });
  if (previous?.avatarKey !== null && previous?.avatarKey !== undefined)
    await deps.store.removeKey(previous.avatarKey);
  return choice;
}

/** The URL of the picture at one size, or undefined when the choice is not a picture. */
export function pictureUrl(
  choice: AvatarChoice | null | undefined,
  size: 32 | 64 | 128 | 256,
): string | undefined {
  const picture = choice?.picture;
  if (choice?.variant !== 'picture' || picture === undefined || picture.base === undefined)
    return undefined;
  return `${picture.base}/${picture.digest}-${size}.webp`;
}

/** Removes a person's picture files on account deletion (7.4). */
export async function removePictureFiles(
  deps: Pick<SetPictureDeps, 'store' | 'profiles'>,
  userId: string,
): Promise<number> {
  const profile = await deps.profiles.get(userId);
  if (profile === null || profile.avatarKey === null) return 0;
  return deps.store.removeKey(profile.avatarKey);
}
