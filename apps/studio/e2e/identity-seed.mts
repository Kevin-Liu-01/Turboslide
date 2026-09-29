// The identity seed of the e2e specs (accounts.spec.ts, agent-http.spec.ts): a Node script the
// specs run with `node`, over the same SQLite file and state folder the dev server on 4332 uses
// (`TURBOSLIDE_AUTH_DB=.turboslide/auth-b3.sqlite`), so a spec can mint an API key, revoke it,
// read a captured sign in code or an alias, and write a picture avatar file the way the server
// would. Node strips the types of the studio's modules (erasable syntax only, explicit
// extensions); nothing here imports the framework. Every value it prints is a test fixture and
// never a deployment's secret.
//
//   node identity-seed.mts key <dbPath> <email> <name> <scope,scope>   -> { userId, tokenId, secret }
//   node identity-seed.mts revoke <dbPath> <tokenId>                   -> { revoked }
//   node identity-seed.mts mail <dbPath> <email>                       -> { code, link } of the newest sign in mail
//   node identity-seed.mts alias <dbPath> <anonymousId>                -> { userId }
//   node identity-seed.mts avatar <stateDir> <pngBase64>               -> { relative, url }
//   node identity-seed.mts principals <stateDir>                       -> { ids: [a, b], label } two records whose ids share a label (PEOPLE.md 3.17)
//   node identity-seed.mts oriented                                    -> { base64, mime, width, height, orientation } a 64 by 32 JPEG with EXIF orientation 6 (PEOPLE.md 4.1)
//   node identity-seed.mts picture <jpeg|png|webp|gif> <w> <h> [noise|gradient]
//                                                                      -> { base64, mime, bytes } a picture of that size (gradient by default; noise does not compress)
import { randomUUID } from 'node:crypto';

import { anonymousPrincipalId } from '@turboslide/identity/ids';
import { labelFor } from '@turboslide/identity/labels';
import { newPrincipalRecord } from '@turboslide/identity/principal';
import type { Scope } from '@turboslide/schema/access';
import sharp from 'sharp';
import type { Sharp } from 'sharp';

import { dbAliasStore } from '../src/server/auth/alias.ts';
import { fileAvatarStore, newAvatarKey, processAvatar } from '../src/server/auth/avatar.ts';
import { migrateAuthDb, openAuthDb } from '../src/server/auth/db.ts';
import type { AuthDb } from '../src/server/auth/db.ts';
import { dbCaptureStore } from '../src/server/auth/mail/mailer.ts';
import { PRINCIPALS_DIR, filePrincipalStore } from '../src/server/auth/principal.ts';
import { dbApiKeyStore } from '../src/server/auth/tokens.ts';

type SeedFormat = 'jpeg' | 'png' | 'webp' | 'gif';

/** The raw RGB field of a test picture: a horizontal red ramp and a vertical blue ramp, or noise. */
function rawField(width: number, height: number, fill: 'gradient' | 'noise'): Buffer {
  const raw = new Uint8Array(width * height * 3);
  let seed = 0x9e3779b9;
  const next = (): number => {
    // xorshift32, so a noise picture is the same bytes on every run
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) & 255;
  };
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      if (fill === 'noise') {
        raw[i] = next();
        raw[i + 1] = next();
        raw[i + 2] = next();
      } else {
        raw[i] = Math.round((x / Math.max(1, width - 1)) * 255);
        raw[i + 1] = 96;
        raw[i + 2] = Math.round((y / Math.max(1, height - 1)) * 255);
      }
    }
  return Buffer.from(raw);
}

function encoded(
  base: Sharp,
  format: SeedFormat,
  options: { quality?: number } = {},
): Promise<Buffer> {
  switch (format) {
    case 'jpeg':
      return base.jpeg({ quality: options.quality ?? 90 }).toBuffer();
    case 'png':
      return base.png().toBuffer();
    case 'webp':
      return base.webp({ quality: options.quality ?? 90 }).toBuffer();
    case 'gif':
      return base.gif().toBuffer();
  }
}

async function testPicture(
  format: SeedFormat,
  width: number,
  height: number,
  fill: 'gradient' | 'noise' = 'gradient',
): Promise<Uint8Array> {
  const out = await encoded(
    sharp(rawField(width, height, fill), { raw: { width, height, channels: 3 } }),
    format,
  );
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}

async function gradientPng(width: number, height: number): Promise<Uint8Array> {
  return testPicture('png', width, height);
}

const MIME: Record<SeedFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

function isSeedFormat(value: string | undefined): value is SeedFormat {
  return value === 'jpeg' || value === 'png' || value === 'webp' || value === 'gif';
}

function open(path: string): AuthDb {
  return openAuthDb({ kind: 'sqlite', path, reason: 'e2e seed' });
}

async function ensureUser(auth: AuthDb, email: string, name: string): Promise<string> {
  const lower = email.toLowerCase();
  const existing = await auth.db
    .selectFrom('user')
    .select('id')
    .where('email', '=', lower)
    .executeTakeFirst();
  if (existing !== undefined) return existing.id;
  const id = `e2e${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
  const stamp = new Date().toISOString();
  await auth.db
    .insertInto('user')
    .values({
      id,
      name,
      email: lower,
      emailVerified: 1,
      image: null,
      createdAt: stamp,
      updatedAt: stamp,
    })
    .execute();
  return id;
}

async function main(): Promise<unknown> {
  const [mode, ...rest] = process.argv.slice(2);
  switch (mode) {
    case 'key': {
      const [path, email, name, scopes] = rest;
      const auth = open(path ?? '');
      await migrateAuthDb(auth);
      const userId = await ensureUser(auth, email ?? 'e2e@example.test', 'E2E');
      const store = dbApiKeyStore(auth);
      const { record, secret } = await store.create({
        userId,
        name: name ?? 'e2e-key',
        scopes: (scopes ?? 'read').split(',') as Scope[],
      });
      await auth.close();
      return { userId, tokenId: record.id, secret };
    }
    case 'revoke': {
      const [path, tokenId] = rest;
      const auth = open(path ?? '');
      const revoked = await dbApiKeyStore(auth).revoke(tokenId ?? '');
      await auth.close();
      return { revoked: revoked !== null };
    }
    case 'mail': {
      const [path, email] = rest;
      const auth = open(path ?? '');
      await migrateAuthDb(auth);
      const mails = await dbCaptureStore(auth.db).list({ limit: 50 });
      await auth.close();
      const mail = mails.find((m) => m.to === (email ?? '').toLowerCase() && m.kind === 'sign-in');
      if (mail === undefined) return { code: null, link: null };
      return {
        code: /Code: (\d{6})/.exec(mail.text)?.[1] ?? null,
        link: /(https?:\/\/\S+magic-link\/verify\S+)/.exec(mail.text)?.[1] ?? null,
      };
    }
    case 'alias': {
      const [path, anonymousId] = rest;
      const auth = open(path ?? '');
      await migrateAuthDb(auth);
      const userId = await dbAliasStore(auth.db).accountOf(anonymousId ?? '');
      await auth.close();
      return { userId };
    }
    case 'avatar': {
      const [stateDir, pngBase64] = rest;
      const store = fileAvatarStore(`${stateDir}/users`);
      const key = newAvatarKey();
      // `gradient` builds a 32 by 32 test picture through the studio's sharp; anything else is PNG bytes
      const bytes =
        pngBase64 === 'gradient'
          ? await gradientPng(32, 32)
          : Buffer.from(pngBase64 ?? '', 'base64');
      const processed = await processAvatar(bytes, key);
      let url = '';
      for (const file of processed.files) url = await store.put(file);
      const first = processed.files[0];
      return {
        relative: first?.relative ?? '',
        url: url.replace(/[^/]+$/, `${processed.digest}-32.webp`),
      };
    }
    case 'principals': {
      // two anonymous records whose ids share a label (PEOPLE.md 3.17, 6.1): random v4 UUIDs
      // until two hash to one label (the space is 57,280, so a few hundred draws suffice), written
      // where the server reads them (`<stateDir>/principals/`)
      const [stateDir] = rest;
      const store = filePrincipalStore(`${stateDir ?? '.turboslide'}/${PRINCIPALS_DIR}`);
      const seen = new Map<string, string>();
      let pair: [string, string] | null = null;
      let label = '';
      for (let i = 0; i < 200_000 && pair === null; i += 1) {
        const id = anonymousPrincipalId(randomUUID());
        const found = labelFor(id);
        const other = seen.get(found);
        if (other !== undefined && other !== id) {
          pair = [other, id];
          label = found;
        } else seen.set(found, id);
      }
      if (pair === null) throw new Error('no label collision found');
      const now = new Date();
      for (const id of pair) await store.put(newPrincipalRecord(id, now));
      return { ids: pair, label };
    }
    case 'oriented': {
      // a 64 by 32 JPEG whose orientation tag says 6 (rotate 90 clockwise), so the served files
      // are upright only when the pipeline applied the tag (PEOPLE.md 4.1, people.avatar-metadata-stripped)
      const width = 64;
      const height = 32;
      const jpeg = await sharp(rawField(width, height, 'gradient'), {
        raw: { width, height, channels: 3 },
      })
        .jpeg({ quality: 95 })
        .withMetadata({ orientation: 6 })
        .toBuffer();
      return {
        base64: jpeg.toString('base64'),
        mime: 'image/jpeg',
        width,
        height,
        orientation: 6,
      };
    }
    case 'picture': {
      const [format, w, h, fill] = rest;
      if (!isSeedFormat(format)) throw new Error('picture wants jpeg, png, webp or gif');
      const width = Math.max(1, Math.floor(Number(w ?? '256')));
      const height = Math.max(1, Math.floor(Number(h ?? '256')));
      const bytes = await testPicture(format, width, height, fill === 'noise' ? 'noise' : 'gradient');
      return {
        base64: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64'),
        mime: MIME[format],
        bytes: bytes.byteLength,
      };
    }
    default:
      throw new Error(`unknown mode ${mode ?? ''}`);
  }
}

main().then(
  (out) => {
    process.stdout.write(`${JSON.stringify(out)}\n`);
  },
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  },
);
