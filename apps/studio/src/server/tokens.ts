import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';

import type { WorkerClient } from '@turboslide/render-worker/client';
import { defaultPaths } from '@turboslide/render-worker/paths';
import { downloadSpentKey } from '@turboslide/realtime/keys';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import { selectStore } from '@turboslide/store/select';

import { logSecurityEvent } from './log';

/**
 * Signed one-time download tokens (SPEC 11: a deployed studio exposes no path a caller chooses).
 * A token names a produced file by what the server already knows, an export job id and the
 * file's base name, or a deck id and the standalone file's name; the route resolves that to a
 * path under the worker's own directories, checks the base name against the job's report and
 * streams it once. The payload is base64url JSON signed with HMAC-SHA256 under
 * TURBOSLIDE_DOWNLOAD_SECRET, kept on globalThis so a dev server reload does not invalidate
 * tokens minted a moment ago; each token carries a nonce that is spent on the first successful
 * resolution and expires after fifteen minutes. Server only: download.ts calls signDownloadToken
 * inside its handlers and the download route calls resolveDownload; nothing here reaches the
 * browser.
 *
 * Round three (gslides-parity SPEC-3 8.10, 8.13, 11.4, 11.5 R0; report 04 F6, F9, F19): the
 * secret is required on a hosted store (a token minted on one instance must verify on another);
 * the spent set moves behind `SpentSet` with a memory default and `kvSpentSet` over the key value
 * client of the redis tier (`dl:spent:<nonce>`, B2's channel binds it through `bindSpentSet`), so
 * a token spent on one instance is spent on every instance; the export cancel token (an HMAC over
 * the job id, `cancelTokenFor`) replaces the bare job id as the cancel capability; and the
 * thumbnail grant (`signThumbGrant`, an HMAC over deck id, role and an expiry of 10 minutes,
 * handed to the page by the `thumbGrant` server function) gates the `?w=` variant of the render
 * route in enforce mode.
 *
 * The return round (docs/RETURN.md 2.19): the render grant (`signRenderGrant`, an HMAC over the
 * deck, the slide, the theme, the scale, the format and an expiry of 10 minutes), appended by the
 * `renderSlideImages` server function to every picture url it answers, so the tab File > Download
 * > JPEG image or PNG image opens on the render route is served without the bearer and as an
 * attachment named after the deck and the slide.
 */

export const DOWNLOAD_SECRET_ENV = 'TURBOSLIDE_DOWNLOAD_SECRET';

/** The least a secret may hold: 16 bytes, `openssl rand -hex 16` and up (docs/security.md). */
export const DOWNLOAD_SECRET_MIN_BYTES = 16;

export type Env = Readonly<Record<string, string | undefined>>;

export class MissingSecretError extends Error {
  readonly status = 500;
  readonly variable: string;

  constructor(variable: string, reason: string) {
    super(`${variable} ${reason}`);
    this.name = 'MissingSecretError';
    this.variable = variable;
  }
}

/**
 * The signing key from the environment: required and at least 16 bytes when the process runs a
 * hosted store (`tmp` or `blob`: a Vercel function, or `TURBOSLIDE_STORE=tmp` on a checkout,
 * which is how the builders' dev servers run), random per process on the file store. The
 * refusal is a MissingSecretError (500) at the first token, logged once as `config.missing`, so
 * a deployment that forgot the variable fails at its first export instead of minting tokens
 * that verify on one instance in three.
 */
export function downloadSecret(env: Env = process.env, hosted?: boolean): Buffer {
  const value = env[DOWNLOAD_SECRET_ENV];
  const isHosted = hosted ?? selectStore(env).kind !== 'file';
  if (value !== undefined && value !== '') {
    const bytes = Buffer.from(value, 'utf8');
    if (isHosted && bytes.byteLength < DOWNLOAD_SECRET_MIN_BYTES) {
      logSecurityEvent({ event: 'config.missing', reason: `${DOWNLOAD_SECRET_ENV} too short` });
      throw new MissingSecretError(
        DOWNLOAD_SECRET_ENV,
        `must hold at least ${DOWNLOAD_SECRET_MIN_BYTES} bytes on a hosted store`,
      );
    }
    return bytes;
  }
  if (isHosted) {
    logSecurityEvent({ event: 'config.missing', reason: `${DOWNLOAD_SECRET_ENV} unset` });
    throw new MissingSecretError(
      DOWNLOAD_SECRET_ENV,
      'must be set on a hosted store (docs/security.md, the deploy variables)',
    );
  }
  // one value per process on a checkout (the docblock's rule): a grant signed with one key and a
  // PUT verified with another made every presigned upload 403 on a checkout without the
  // variable, and security.spec.ts's upload row red on the check chain's server (b6 FR1)
  checkoutSecret ??= randomBytes(32);
  return checkoutSecret;
}

let checkoutSecret: Buffer | null = null;

/** What the health function reports: whether the secret is set, never its value. */
export function downloadSecretStatus(env: Env = process.env): {
  variable: string;
  set: boolean;
  required: boolean;
} {
  const value = env[DOWNLOAD_SECRET_ENV];
  return {
    variable: DOWNLOAD_SECRET_ENV,
    set: value !== undefined && value !== '',
    required: selectStore(env).kind !== 'file',
  };
}
export type DownloadTarget =
  /** a file the export job wrote: its report lists the file */
  | { k: 'job'; j: string; n: string }
  /** the standalone file build.run wrote under the worker's builds folder */
  | { k: 'build'; d: string; n: string };

type Payload = DownloadTarget & { exp: number; nonce: string };

/** How long a token stays valid. */
export const TOKEN_TTL_MS = 15 * 60 * 1000;

// ---------------------------------------------------------------------------------------------
// The spent set (SPEC-3 8.10): per instance in memory, or the key value client of the redis tier

export type SpentSet = {
  kind: 'memory' | 'kv';
  has: (nonce: string) => Promise<boolean>;
  add: (nonce: string, expiresAt: number) => Promise<void>;
};

export type SpentKv = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
};

export function memorySpentSet(now: () => number = () => Date.now()): SpentSet {
  const used = new Map<string, number>();
  return {
    kind: 'memory',
    async has(nonce) {
      const t = now();
      for (const [key, exp] of used) if (exp < t) used.delete(key);
      return used.has(nonce);
    },
    async add(nonce, expiresAt) {
      used.set(nonce, expiresAt);
    },
  };
}

/** `dl:spent:<nonce>` with the token's own TTL, so the set forgets what has expired anyway. */
export function kvSpentSet(kv: SpentKv, now: () => number = () => Date.now()): SpentSet {
  return {
    kind: 'kv',
    async has(nonce) {
      return (await kv.get(downloadSpentKey(nonce))) !== null;
    },
    async add(nonce, expiresAt) {
      await kv.set(downloadSpentKey(nonce), '1', Math.max(1000, expiresAt - now()));
    },
  };
}

type Shared = { secret?: Buffer; spent?: SpentSet };

const shared = globalThis as typeof globalThis & { __turboslideDownloads?: Shared };

function state(): Required<Shared> {
  shared.__turboslideDownloads ??= {};
  const s = shared.__turboslideDownloads;
  s.secret ??= downloadSecret();
  s.spent ??= memorySpentSet();
  return s as Required<Shared>;
}

/** Binds the spent set of the deployment (the redis tier's client); returns the previous one. */
export function bindSpentSet(next: SpentSet | undefined): SpentSet {
  const previous = state().spent;
  shared.__turboslideDownloads!.spent = next ?? memorySpentSet();
  return previous;
}

function sign(body: string, purpose = ''): string {
  return createHmac('sha256', state().secret)
    .update(purpose === '' ? body : `${purpose}\n${body}`)
    .digest('hex');
}

function sameHex(given: string, expected: string): boolean {
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given, 'utf8'), Buffer.from(expected, 'utf8'));
}

/** A file name a token may carry: one path segment, no separators, with an extension. */
export function isFileName(name: string): boolean {
  return (
    name !== '' && name === basename(name) && !name.startsWith('.') && /\.[a-z0-9]+$/i.test(name)
  );
}

/** The URL path of a fresh token for a target. */
export function signDownloadToken(target: DownloadTarget, now: number = Date.now()): string {
  if (!isFileName(target.n)) throw new TypeError(`"${target.n}" is not a file name`);
  if (target.k === 'build' && !SLUG_PATTERN.test(target.d))
    throw new TypeError('the deck id must be a slug');
  const payload: Payload = {
    ...target,
    exp: now + TOKEN_TTL_MS,
    nonce: randomBytes(8).toString('hex'),
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sign(body)}`;
}

/** The path the download route serves a token at. */
export function downloadUrl(token: string): string {
  return `/api/download/${token}`;
}

function isPayload(value: unknown): value is Payload {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.exp !== 'number' || typeof v.nonce !== 'string' || typeof v.n !== 'string')
    return false;
  if (v.k === 'job') return typeof v.j === 'string';
  if (v.k === 'build') return typeof v.d === 'string';
  return false;
}

/** The payload of a well formed, signed, unexpired token, or null. Spends nothing. */
export function verifyDownloadToken(token: string, now: number = Date.now()): Payload | null {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const given = token.slice(dot + 1);
  if (!sameHex(given, sign(body))) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as unknown;
  } catch {
    return null;
  }
  if (!isPayload(parsed)) return null;
  if (parsed.exp < now) return null;
  if (!isFileName(parsed.n)) return null;
  return parsed;
}

let client: WorkerClient | undefined;

/** The worker client, loaded on first use (download.ts says why the import is not at the top). */
async function worker(): Promise<WorkerClient> {
  if (client === undefined) {
    const { createWorkerClient } = await import('@turboslide/render-worker/client');
    const { workerClientOptions } = await import('./root');
    client = createWorkerClient(workerClientOptions());
  }
  return client;
}

export type ResolvedDownload = {
  path: string;
  name: string;
  bytes: number;
  type: string;
};

const TYPES: Record<string, string> = {
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

function contentType(name: string): string {
  const dot = name.lastIndexOf('.');
  return TYPES[name.slice(dot).toLowerCase()] ?? 'application/octet-stream';
}

function inside(base: string, path: string): boolean {
  const root = resolve(base);
  const file = resolve(path);
  return file.startsWith(root + sep);
}

/** The folder build.run writes a deck's standalone file to, under the worker's directory. */
export function buildsDir(deckId: string): string {
  return join(defaultPaths().workerDir, 'builds', deckId);
}

/**
 * Resolves a token to the file it names and spends it: null when the token is invalid, expired,
 * already used, or names a file the job's report or the builds folder does not hold. The path is
 * always derived from the server's own records, never from the token.
 */
export async function resolveDownload(
  token: string,
  now: number = Date.now(),
): Promise<ResolvedDownload | null> {
  const payload = verifyDownloadToken(token, now);
  if (!payload) return null;
  const { spent } = state();
  if (await spent.has(payload.nonce)) return null;
  let path: string | null = null;
  if (payload.k === 'job') {
    const job = await (await worker()).job(payload.j);
    if (!job || job.status !== 'done') return null;
    const result = job.result as
      { outDir?: string; report?: { files?: { path: string; bytes: number }[] } } | undefined;
    const outDir = result?.outDir;
    const file = result?.report?.files?.find((entry) => basename(entry.path) === payload.n);
    if (!outDir || !file) return null;
    const candidate = resolve(outDir, basename(file.path));
    if (!inside(outDir, candidate)) return null;
    path = candidate;
  } else {
    if (!SLUG_PATTERN.test(payload.d) || !payload.n.endsWith('.html')) return null;
    const dir = buildsDir(payload.d);
    const candidate = resolve(dir, payload.n);
    if (!inside(dir, candidate)) return null;
    path = candidate;
  }
  if (!existsSync(path) || !statSync(path).isFile()) return null;
  await spent.add(payload.nonce, payload.exp);
  return { path, name: payload.n, bytes: statSync(path).size, type: contentType(payload.n) };
}

// ---------------------------------------------------------------------------------------------
// The export cancel token (SPEC-3 0.32, 8.13; report 04 F9): an HMAC over the job id under the
// download secret, minted with the job and sent back from `pagehide` with `keepalive`, where the
// page can carry no header; the bare 32 bit job id is no longer the capability.

export const CANCEL_TOKEN_QUERY = 'ct';

/** The cancel token of a job: hex, 32 characters, tied to the job id and this deployment's secret. */
export function cancelTokenFor(jobId: string): string {
  if (!/^[a-z0-9-]{1,80}$/.test(jobId)) throw new TypeError('jobId must be a job id');
  return sign(jobId, 'cancel').slice(0, 32);
}

export function verifyCancelToken(jobId: string, token: string | null | undefined): boolean {
  if (typeof token !== 'string' || !/^[a-z0-9-]{1,80}$/.test(jobId)) return false;
  return sameHex(token, cancelTokenFor(jobId));
}

// ---------------------------------------------------------------------------------------------
// The thumbnail grant (SPEC-3 0.32, 8.13; report 04 F6): the page's `<img>` cannot send a header,
// so the loader hands it a short lived grant the render route verifies on the `?w=` variant.

/** How long a thumbnail grant is good for: 10 minutes; the page renews it with the deck's revision. */
export const THUMB_GRANT_TTL_MS = 10 * 60 * 1000;
export const THUMB_GRANT_QUERY = 's';

export type ThumbGrant = { deckId: string; role: string; exp: number };

/** `<exp>.<hmac>` over `<deckId>|<role>|<exp>`; the width and revision travel in the URL and are bounded by the route. */
export function signThumbGrant(deckId: string, role: string, now: number = Date.now()): string {
  if (!SLUG_PATTERN.test(deckId)) throw new TypeError('deckId must be a slug');
  const exp = now + THUMB_GRANT_TTL_MS;
  const mac = sign(`${deckId}|${role}|${exp}`, 'thumb').slice(0, 32);
  return `${exp}.${role}.${mac}`;
}

/** The grant's facts when it verifies for the deck and is not expired, else null. */
export function verifyThumbGrant(
  deckId: string,
  grant: string | null | undefined,
  now: number = Date.now(),
): ThumbGrant | null {
  if (typeof grant !== 'string' || !SLUG_PATTERN.test(deckId)) return null;
  const parts = grant.split('.');
  if (parts.length !== 3) return null;
  const exp = Number(parts[0]);
  const role = parts[1] ?? '';
  const mac = parts[2] ?? '';
  if (!Number.isFinite(exp) || exp < now || !/^[a-z]{1,16}$/.test(role)) return null;
  if (!sameHex(mac, sign(`${deckId}|${role}|${exp}`, 'thumb').slice(0, 32))) return null;
  return { deckId, role, exp };
}

// ---------------------------------------------------------------------------------------------
// The render grant (the return round, docs/RETURN.md 2.19; audit-surface rows 27 and 28): File >
// Download > JPEG image and PNG image run `render.slide` and open the first picture url in a tab,
// which carries no header, so on a deployment with TURBOSLIDE_TOKEN set the render route answered
// 401 "bearer token required". The `renderSlideImages` server function, which runs `authorize(read)`
// first, appends this grant to every url it answers; the route accepts it in place of the bearer
// for the one picture it names and answers that picture as an attachment.

/** How long a render grant is good for: 10 minutes; the tab opens the moment the row runs. */
export const RENDER_GRANT_TTL_MS = 10 * 60 * 1000;
export const RENDER_GRANT_QUERY = 'g';

/** The one picture a grant names: the full size render's own parameters, never a thumbnail or the JSON variant. */
export type RenderGrantTarget = {
  deckId: string;
  slideId: string;
  theme: 'light' | 'dark';
  scale: 1 | 2;
  format: 'png' | 'jpg';
};

function renderGrantBody(target: RenderGrantTarget, exp: number): string {
  return `${target.deckId}|${target.slideId}|${target.theme}|${target.scale}|${target.format}|${exp}`;
}

/** `<exp>.<hmac>` over the target and the expiry, under the download secret with its own purpose. */
export function signRenderGrant(target: RenderGrantTarget, now: number = Date.now()): string {
  if (!SLUG_PATTERN.test(target.deckId) || !SLUG_PATTERN.test(target.slideId))
    throw new TypeError('the deck and slide ids must be slugs');
  const exp = now + RENDER_GRANT_TTL_MS;
  return `${exp}.${sign(renderGrantBody(target, exp), 'render').slice(0, 32)}`;
}

/** True when the grant verifies for exactly this picture and is not expired. */
export function verifyRenderGrant(
  target: RenderGrantTarget,
  grant: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (typeof grant !== 'string') return false;
  if (!SLUG_PATTERN.test(target.deckId) || !SLUG_PATTERN.test(target.slideId)) return false;
  const parts = grant.split('.');
  if (parts.length !== 2) return false;
  const exp = Number(parts[0]);
  if (!Number.isFinite(exp) || exp < now) return false;
  return sameHex(parts[1] ?? '', sign(renderGrantBody(target, exp), 'render').slice(0, 32));
}

/**
 * The attachment's name, `<deck id>-<slide id>.<png|jpg>`: the deck id names the file, as the
 * PowerPoint (`<deck id>-<theme>.pptx`) and the bundle (`<deck id>-<revision>.zip`) are named.
 */
export function renderFileName(target: RenderGrantTarget): string {
  return `${target.deckId}-${target.slideId}.${target.format}`;
}
