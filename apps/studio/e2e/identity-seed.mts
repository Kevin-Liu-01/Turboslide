// The identity seed of the e2e specs (accounts.spec.ts, agent-http.spec.ts): a Node script the
// specs run with `node`, over the same identity database and state folder the server under test
// uses, so a spec can mint an API key, revoke it, read a captured sign in code or an alias, and
// write a picture avatar file the way the server would. The engine follows the spec's
// environment the way the server's does (auth/db.ts `selectAuthDb`): the SQLite file of
// `TURBOSLIDE_AUTH_DB` (the `<dbPath>` argument wins when given), or, under
// `TURBOSLIDE_ACCOUNTS=d1`, the realtime Worker's D1 through the same proxy dialect over
// `TURBOSLIDE_ROOM_HOST` and `TURBOSLIDE_ROOM_BEARER` (docs/CLOUDFLARE.md 4.3: the second harness
// mode, against `wrangler dev`'s D1 on a checkout and the preview Worker's D1 on the preview);
// `<dbPath>` is then ignored. The `mail` and `alias` reads can go through wrangler instead when
// `TURBOSLIDE_SEED_D1=wrangler` names the way (4.3's `wrangler d1 execute <database> --local|--remote
// --json --command`), with `TURBOSLIDE_SEED_D1_DATABASE` (default `turboslide-accounts`),
// `TURBOSLIDE_SEED_D1_REMOTE=1` for `--remote`, `TURBOSLIDE_SEED_D1_ENV` for `--env` and
// `TURBOSLIDE_SEED_D1_PERSIST` for `--persist-to`; the binary is the workspace's
// apps/realtime-worker/node_modules/.bin/wrangler, never a global one. Node strips the types of
// the studio's modules (erasable syntax only, explicit extensions); nothing here imports the
// framework. Every value it prints is a test fixture and never a deployment's secret, and no
// bearer is ever printed.
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
//   node identity-seed.mts cookie <principalId> <origin>              -> { name, value } the sealed identity cookie of an anonymous record (build/b5.md R2): `ts_id` on an http origin, `__Host-ts_id` on https; sealed under TURBOSLIDE_SESSION_SECRET, else the overlay's state folder's file
//   node identity-seed.mts engine                                    -> { engine, reads, host? } which engine and which read path this environment selects (the d1 harness mode)
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { anonymousPrincipalId } from '@turboslide/identity/ids';
import { labelFor } from '@turboslide/identity/labels';
import { markHash } from '@turboslide/identity/marks';
import { newPrincipalRecord } from '@turboslide/identity/principal';
import type { Scope } from '@turboslide/schema/access';
import sharp from 'sharp';
import type { Sharp } from 'sharp';

import { dbAliasStore } from '../src/server/auth/alias.ts';
import { fileAvatarStore, newAvatarKey, processAvatar } from '../src/server/auth/avatar.ts';
import {
  ACCOUNTS_VARIABLE,
  migrateAuthDb,
  openAuthDb,
  selectAuthDb,
} from '../src/server/auth/db.ts';
import type { AuthDb } from '../src/server/auth/db.ts';
import { dbCaptureStore } from '../src/server/auth/mail/mailer.ts';
import type { PrincipalStore } from '@turboslide/identity/principal';
import {
  PRINCIPALS_DIR,
  d1PrincipalStore,
  filePrincipalStore,
} from '../src/server/auth/principal.ts';
import { sessionSecret } from '../src/server/auth/secret.ts';
import { sealPrincipalCookie } from '../src/server/auth/session.ts';
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

/** The engine of the server under test (the header): D1 through the proxy under `TURBOSLIDE_ACCOUNTS=d1`, else the SQLite file named. */
function d1Mode(): boolean {
  return (process.env[ACCOUNTS_VARIABLE] ?? '').trim().toLowerCase() === 'd1';
}

function open(path: string): AuthDb {
  if (d1Mode()) {
    const selection = selectAuthDb(process.env, process.cwd());
    if (selection.kind !== 'd1') throw new Error('TURBOSLIDE_ACCOUNTS=d1 selected no d1 engine');
    return openAuthDb(selection, process.env);
  }
  return openAuthDb({ kind: 'sqlite', path, reason: 'e2e seed' });
}

/** The server's principal store for a seeded record: `ts_principal` on D1, the files under the state folder otherwise. */
function principalsFor(stateDir: string, auth: AuthDb | null): PrincipalStore {
  if (auth !== null && auth.kind === 'd1') return d1PrincipalStore(auth.db, { cacheMs: 0 });
  return filePrincipalStore(`${stateDir}/${PRINCIPALS_DIR}`);
}

/**
 * One read through wrangler (`TURBOSLIDE_SEED_D1=wrangler`): the rows of a select against the
 * local or the remote D1, as `wrangler d1 execute --json` prints them (an array with one
 * `{ results, success, meta }` per statement). The statement carries its values as SQL literals,
 * quoted here, since the command takes no parameters; the values are an address and an id.
 */
function wranglerRows(sql: string): Record<string, unknown>[] {
  const root = join(import.meta.dirname, '..', '..', '..');
  const worker = join(root, 'apps', 'realtime-worker');
  const database = process.env.TURBOSLIDE_SEED_D1_DATABASE ?? 'turboslide-accounts';
  const args = ['d1', 'execute', database, '--json', '--command', sql];
  args.push(process.env.TURBOSLIDE_SEED_D1_REMOTE === '1' ? '--remote' : '--local');
  const env = process.env.TURBOSLIDE_SEED_D1_ENV;
  if (env !== undefined && env !== '') args.push('--env', env);
  const persist = process.env.TURBOSLIDE_SEED_D1_PERSIST;
  if (persist !== undefined && persist !== '') args.push('--persist-to', persist);
  const config = process.env.TURBOSLIDE_SEED_D1_CONFIG;
  if (config !== undefined && config !== '') args.push('--config', config);
  const out = execFileSync(join(worker, 'node_modules', '.bin', 'wrangler'), args, {
    cwd: worker,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    maxBuffer: 16 * 1024 * 1024,
  });
  const start = out.indexOf('[');
  const parsed = JSON.parse(out.slice(start)) as { results?: Record<string, unknown>[] }[];
  return parsed[0]?.results ?? [];
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

const wranglerReads = (): boolean => (process.env.TURBOSLIDE_SEED_D1 ?? '') === 'wrangler';

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
      if (auth.kind !== 'd1') await migrateAuthDb(auth);
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
      const lower = (email ?? '').toLowerCase();
      let text: string | undefined;
      if (wranglerReads()) {
        const rows = wranglerRows(
          `select text from ts_mail where toAddress = ${sqlLiteral(lower)} and kind = 'sign-in' order by createdAt desc limit 1`,
        );
        text = typeof rows[0]?.text === 'string' ? rows[0].text : undefined;
      } else {
        const auth = open(path ?? '');
        if (auth.kind !== 'd1') await migrateAuthDb(auth);
        const mails = await dbCaptureStore(auth.db).list({ limit: 50 });
        await auth.close();
        text = mails.find((m) => m.to === lower && m.kind === 'sign-in')?.text;
      }
      if (text === undefined) return { code: null, link: null };
      return {
        code: /Code: (\d{6})/.exec(text)?.[1] ?? null,
        link: /(https?:\/\/\S+magic-link\/verify\S+)/.exec(text)?.[1] ?? null,
      };
    }
    case 'alias': {
      const [path, anonymousId] = rest;
      if (wranglerReads()) {
        const rows = wranglerRows(
          `select userId from ts_alias where anonymousId = ${sqlLiteral(anonymousId ?? '')}`,
        );
        return { userId: typeof rows[0]?.userId === 'string' ? rows[0].userId : null };
      }
      const auth = open(path ?? '');
      if (auth.kind !== 'd1') await migrateAuthDb(auth);
      const userId = await dbAliasStore(auth.db).accountOf(anonymousId ?? '');
      await auth.close();
      return { userId };
    }
    case 'engine': {
      /* which engine this seed reads, for a spec's annotation: never a host's bearer */
      const selection = d1Mode() ? selectAuthDb(process.env, process.cwd()) : null;
      return {
        engine: selection?.kind ?? 'sqlite',
        reads: wranglerReads() ? 'wrangler' : selection?.kind === 'd1' ? 'proxy' : 'file',
        ...(selection?.kind === 'd1' ? { host: selection.host } : {}),
      };
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
      const auth = d1Mode() ? open('') : null;
      const store = principalsFor(stateDir ?? '.turboslide', auth);
      const seen = new Map<string, string>();
      let pair: [string, string] | null = null;
      let label = '';
      for (let i = 0; i < 200_000 && pair === null; i += 1) {
        const id = anonymousPrincipalId(randomUUID());
        const found = labelFor(id);
        const other = seen.get(found);
        /* the pair's plates must differ too (the row reads "the two chips' plates differ"): the
           initials field's density is two bits of the id's hash, so one pair in four draws one
           field; such a pair is passed over and the search goes on */
        if (
          other !== undefined &&
          other !== id &&
          markHash(other).density !== markHash(id).density
        ) {
          pair = [other, id];
          label = found;
        } else if (other === undefined) seen.set(found, id);
      }
      if (pair === null) throw new Error('no label collision found');
      const now = new Date();
      for (const id of pair) await store.put(newPrincipalRecord(id, now));
      await auth?.close();
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
      const bytes = await testPicture(
        format,
        width,
        height,
        fill === 'noise' ? 'noise' : 'gradient',
      );
      return {
        base64: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64'),
        mime: MIME[format],
        bytes: bytes.byteLength,
      };
    }
    case 'cookie': {
      /* the sealed identity cookie of an existing anonymous record (build/b5.md R2), so a spec
         opens a browser context as a seeded principal: the name the server accepts on the origin
         (session.ts: `ts_id` over plain http, `__Host-ts_id` over https; the reader takes both),
         the value sealed under the server's session secret (TURBOSLIDE_SESSION_SECRET in this
         process's environment, else the overlay's state folder's file), never printed by name */
      const [principalId, origin] = rest;
      const overlay = process.env.TURBOSLIDE_OVERLAY_DIR;
      const { secret } = sessionSecret(
        process.env,
        overlay === undefined || overlay === '' ? undefined : join(overlay, '.turboslide'),
        () => undefined,
      );
      const value = await sealPrincipalCookie(principalId ?? '', secret);
      return { name: (origin ?? '').startsWith('https:') ? '__Host-ts_id' : 'ts_id', value };
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
