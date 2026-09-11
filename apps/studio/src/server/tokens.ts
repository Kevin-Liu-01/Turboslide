import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';

import type { WorkerClient } from '@turboslide/render-worker/client';
import { defaultPaths } from '@turboslide/render-worker/paths';
import { SLUG_PATTERN } from '@turboslide/schema/ids';

/**
 * Signed one-time download tokens (SPEC 11: a deployed studio exposes no path a caller chooses).
 * A token names a produced file by what the server already knows, an export job id and the
 * file's base name, or a deck id and the standalone file's name; the route resolves that to a
 * path under the worker's own directories, checks the base name against the job's report and
 * streams it once. The payload is base64url JSON signed with HMAC-SHA256 under a per-process
 * secret (TURBOSLIDE_DOWNLOAD_SECRET when set, random otherwise, kept on globalThis so a dev
 * server reload does not invalidate tokens minted a moment ago); each token carries a nonce that
 * is spent on the first successful resolution and expires after fifteen minutes. Server only:
 * download.ts calls signDownloadToken inside its handlers and the download route calls
 * resolveDownload; nothing here reaches the browser.
 */
export type DownloadTarget =
  /** a file the export job wrote: its report lists the file */
  | { k: 'job'; j: string; n: string }
  /** the standalone file build.run wrote under the worker's builds folder */
  | { k: 'build'; d: string; n: string };

type Payload = DownloadTarget & { exp: number; nonce: string };

/** How long a token stays valid. */
export const TOKEN_TTL_MS = 15 * 60 * 1000;

type Shared = { secret?: Buffer; used?: Map<string, number> };

const shared = globalThis as typeof globalThis & { __turboslideDownloads?: Shared };

function state(): Required<Shared> {
  shared.__turboslideDownloads ??= {};
  const s = shared.__turboslideDownloads;
  s.secret ??= process.env.TURBOSLIDE_DOWNLOAD_SECRET
    ? Buffer.from(process.env.TURBOSLIDE_DOWNLOAD_SECRET, 'utf8')
    : randomBytes(32);
  s.used ??= new Map();
  return s as Required<Shared>;
}

function sign(body: string): string {
  return createHmac('sha256', state().secret).update(body).digest('hex');
}

function pruneUsed(used: Map<string, number>, now: number): void {
  for (const [nonce, exp] of used) if (exp < now) used.delete(nonce);
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
  const expected = sign(body);
  if (given.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(given, 'utf8'), Buffer.from(expected, 'utf8'))) return null;
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
  const { used } = state();
  pruneUsed(used, now);
  if (used.has(payload.nonce)) return null;
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
  used.set(payload.nonce, payload.exp);
  return { path, name: payload.n, bytes: statSync(path).size, type: contentType(payload.n) };
}
