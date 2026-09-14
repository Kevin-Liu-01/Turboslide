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
import { dbAliasStore } from '../src/server/auth/alias.ts';
import { fileAvatarStore, newAvatarKey, processAvatar } from '../src/server/auth/avatar.ts';
import { migrateAuthDb, openAuthDb } from '../src/server/auth/db.ts';
import type { AuthDb } from '../src/server/auth/db.ts';
import { dbCaptureStore } from '../src/server/auth/mail/mailer.ts';
import { dbApiKeyStore } from '../src/server/auth/tokens.ts';
import type { Scope } from '@turboslide/schema/access';
import sharp from 'sharp';

async function gradientPng(width: number, height: number): Promise<Uint8Array> {
  const raw = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      raw[i] = Math.round((x / (width - 1)) * 255);
      raw[i + 1] = 96;
      raw[i + 2] = Math.round((y / (height - 1)) * 255);
    }
  const png = await sharp(Buffer.from(raw), { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
  return new Uint8Array(png.buffer, png.byteOffset, png.byteLength);
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
