import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { sniffImage } from '@turboslide/headless/capture/shared';
import type { SniffedFormat } from '@turboslide/headless/capture/shared';
import { MEDIA_MIMES } from '@turboslide/schema/assets';
import type { MediaMime } from '@turboslide/schema/assets';
import { mediaKindOfMime } from '@turboslide/schema/blocks/media';
import type { MediaKind } from '@turboslide/schema/blocks/media';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import {
  DOCUMENTS_TOKEN_VARIABLE,
  PRIVATE_UPLOADS_PREFIX,
  deletePrivateUpload,
  presignPrivatePut,
  readPrivateUpload,
} from '@turboslide/store/blob-vercel';
import { SNIFF_WINDOW_BYTES, sniffMedia } from '@turboslide/store/media/sniff';
import type { SniffedMedia } from '@turboslide/store/media/sniff';
import type { StoreKind } from '@turboslide/store/select';

import { authorize, identityLabel, requestContext } from './authorize';
import type { AuthContext } from './authorize';
import { requireFlag } from './flags';
import { RETENTION_MS, logSecurityEvent } from './log';
import {
  RateLimitedError,
  checkQuota,
  largestMediaBytes,
  largestPictureBytes,
  mediaTooLargeSentence,
  rateLimitedResponse,
  tierOf,
} from './ratelimit';
import type { QuotaContext } from './ratelimit';
import { stateDir, storeSelection } from './root';
import { downloadSecret } from './tokens';

/**
 * The presigned upload path (gslides-parity SPEC-3 0.29, 8.5; report 10 F51, F52, 5.3): a picture
 * over 3 MB cannot travel inside a function's 4.5 MB request body once base64 grows it, so
 * `POST /api/x/upload/picture` runs `authorize(write)`, the `uploads` switch and the picture
 * quotas, and issues a token for `uploads/<principalId>/<uuid>` with the identity's size cap and
 * the four content types, valid ten minutes; the browser PUTs the bytes; `asset.add { upload }`
 * reads the object by key (`readUpload`), sniffs, decodes, re-encodes, puts the twins and deletes
 * the upload; unclaimed uploads are swept after 24 hours (`sweepUploads`).
 *
 * Two backends behind one token: `local` writes under `<state>/uploads/` on this instance (a
 * checkout, the `tmp` store, and the fallback), the PUT streamed and counted against the cap and
 * sniffed before it is kept; `blob` is the private store's client upload (Vercel Blob's client
 * token over `TURBOSLIDE_BLOB_PRIVATE_TOKEN`), which the account boundary of this round does not
 * create, so the route answers the local form and docs/hosting.md names the switch. Server only.
 */

/** Above this a hosted picture takes the presigned path (SPEC-3 8.5). */
export const PRESIGN_THRESHOLD_BYTES = 3 * 1024 * 1024;

/** How long an upload token is good for. */
export const UPLOAD_TOKEN_TTL_MS = 10 * 60 * 1000;

/** The content types a picture upload may declare (SPEC-3 8.5: png, jpeg, webp, gif hosted). */
export const UPLOAD_CONTENT_TYPES: ReadonlyArray<string> = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];

/**
 * The content types the media grant admits (gslides-parity SPEC-5 3.3; R11 1.5, 1.8): the five
 * stored media mimes, on `POST /api/x/upload/media` alone (B2 day 3); the picture grant keeps its
 * four. The schema's list is the one source, so the grant, the sniff and the store agree.
 */
export const MEDIA_UPLOAD_CONTENT_TYPES: ReadonlyArray<string> = MEDIA_MIMES;

export const UPLOADS_DIR = 'uploads';

/** `uploads/<principalId>/<uuid>`; the principal segment is the identity with `:` folded to `_`. */
export const UPLOAD_KEY_PATTERN = /^uploads\/[A-Za-z0-9_.-]{1,80}\/[0-9a-f-]{36}$/;

export type UploadGrant = {
  key: string;
  token: string;
  /** Where the browser PUTs the bytes: the local route, or the store's client upload endpoint. */
  url: string;
  method: 'PUT';
  expiresAt: number;
  maxBytes: number;
  contentType: string;
  backend: 'local' | 'blob';
};

type TokenPayload = { key: string; bytes: number; type: string; exp: number; slot: string };

function sign(payload: TokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = createHmac('sha256', downloadSecret())
    .update(`upload\n${body}`)
    .digest('hex')
    .slice(0, 40);
  return `${body}.${mac}`;
}

/** The payload of a token that verifies and has not expired, else null. */
export function verifyUploadToken(token: string, now: number = Date.now()): TokenPayload | null {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const given = token.slice(dot + 1);
  const expected = createHmac('sha256', downloadSecret())
    .update(`upload\n${body}`)
    .digest('hex')
    .slice(0, 40);
  if (given.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as unknown;
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const p = parsed as Partial<TokenPayload>;
  if (
    typeof p.key !== 'string' ||
    !UPLOAD_KEY_PATTERN.test(p.key) ||
    typeof p.bytes !== 'number' ||
    typeof p.type !== 'string' ||
    typeof p.exp !== 'number' ||
    typeof p.slot !== 'string' ||
    p.exp < now
  )
    return null;
  return { key: p.key, bytes: p.bytes, type: p.type, exp: p.exp, slot: p.slot };
}

function principalSegment(identity: string): string {
  return identity.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 80) || 'anonymous';
}

/** The local folder the uploads land in. */
export function uploadsDir(): string {
  return join(stateDir(), UPLOADS_DIR);
}

function uploadPath(key: string): string {
  const [, principal, uuid] = key.split('/');
  const path = resolve(uploadsDir(), principal ?? '', uuid ?? '');
  if (!path.startsWith(resolve(uploadsDir()) + sep))
    throw new RangeError('upload key outside the folder');
  return path;
}

export type IssueInput = {
  deckId: string;
  contentType: string;
  bytes: number;
};

export type IssueResult = { grant: UploadGrant } | { refused: Response };

/** The in flight uploads per identity and deck: one at a time (SPEC-3 8.3). */
const inFlight = new Map<string, number>();

/**
 * `POST /api/x/upload/picture`: `authorize(write)` on the deck, the `uploads` switch, the largest
 * picture cap of the tier, the pictures per day and bytes per day quotas, one upload in flight per
 * identity and deck, then the token. Every refusal is a Response the route returns as it is.
 */
export async function issueUploadGrant(
  ctx: AuthContext,
  input: IssueInput,
  now: number = Date.now(),
): Promise<IssueResult> {
  if (!SLUG_PATTERN.test(input.deckId))
    return {
      refused: Response.json(
        { error: 'invalid_input', message: 'deckId must be a slug' },
        { status: 400 },
      ),
    };
  if (!UPLOAD_CONTENT_TYPES.includes(input.contentType))
    return {
      refused: Response.json(
        { error: 'invalid_input', message: 'send a png, jpeg, webp or gif' },
        { status: 400 },
      ),
    };
  if (!Number.isInteger(input.bytes) || input.bytes <= 0)
    return {
      refused: Response.json(
        { error: 'invalid_input', message: 'bytes must be a positive integer' },
        { status: 400 },
      ),
    };
  const decision = await authorize(ctx, input.deckId, 'write', {
    action: 'asset.add',
    transport: 'route',
  });
  if (!decision.ok) {
    return {
      refused: Response.json(
        decision.code === 'forbidden'
          ? { error: 'forbidden', capability: 'write' }
          : { error: decision.code === 'unauthorized' ? 'unauthorized' : 'not_found' },
        { status: decision.status },
      ),
    };
  }
  const identity = identityLabel(ctx) ?? 'anonymous';
  const flagged = await requireFlag('uploads', {
    identity,
    deckId: input.deckId,
    action: 'asset.add',
  });
  if (flagged !== null) return { refused: flagged };
  const tier = tierOf(ctx);
  const quota: QuotaContext = {
    identity,
    tier,
    deckId: input.deckId,
    action: 'asset.add',
    transport: 'route',
  };
  if (input.bytes > largestPictureBytes(tier)) {
    logSecurityEvent({
      event: 'upload.rejected',
      identity,
      deckId: input.deckId,
      bytes: input.bytes,
      reason: 'too large',
      status: 413,
    });
    return {
      refused: Response.json(
        {
          error: 'payload_too_large',
          message: 'This picture is too large',
          maxBytes: largestPictureBytes(tier),
        },
        { status: 413 },
      ),
    };
  }
  const slot = `${identity}:${input.deckId}`;
  const held = inFlight.get(slot);
  if (held !== undefined && held > now) {
    return {
      refused: Response.json(
        {
          error: 'rate_limited',
          message: 'Another picture is still uploading. Wait for it to finish',
        },
        { status: 429, headers: { 'retry-after': String(Math.ceil((held - now) / 1000)) } },
      ),
    };
  }
  for (const [name, cost] of [
    ['picturesPerDay', 1],
    ['pictureBytesPerDay', input.bytes],
  ] as const) {
    const refused = await checkQuota(name, quota, cost);
    if (refused instanceof RateLimitedError) return { refused: rateLimitedResponse(refused) };
  }
  const key = `${UPLOADS_DIR}/${principalSegment(identity)}/${randomUUID()}`;
  const exp = now + UPLOAD_TOKEN_TTL_MS;
  const token = sign({ key, bytes: input.bytes, type: input.contentType, exp, slot });
  inFlight.set(slot, exp);
  logSecurityEvent({
    event: 'upload.token_issued',
    identity,
    deckId: input.deckId,
    uploadBytes: input.bytes,
    sniffedType: input.contentType,
    action: 'asset.add',
  });
  return {
    grant: {
      key,
      token,
      url: `/api/x/upload/put/${token}`,
      method: 'PUT',
      expiresAt: exp,
      maxBytes: input.bytes,
      contentType: input.contentType,
      backend: 'local',
    },
  };
}

/** Frees the in flight slot once the object is read or the upload failed. */
export function releaseUploadSlot(identity: string, deckId: string): void {
  inFlight.delete(`${identity}:${deckId}`);
}

const SNIFF_BY_TYPE: Readonly<Record<string, SniffedFormat>> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export type PutResult =
  | { ok: true; key: string; bytes: number; sniffedType: SniffedFormat | SniffedMedia['container'] }
  | { ok: false; status: number; reason: string };

/**
 * `PUT /api/x/upload/put/<token>`: the body streamed to the local folder and counted, aborted the
 * moment it passes the token's cap (report 04 F3 sketch 5), then sniffed by its magic bytes; a
 * mismatch with the declared type, a fifth format or an svg is removed and refused with 400
 * (SPEC-3 8.5: nothing is written that fails the sniff).
 */
export async function receiveUpload(
  token: string,
  body: ReadableStream<Uint8Array> | null,
  now: number = Date.now(),
): Promise<PutResult> {
  const payload = verifyUploadToken(token, now);
  if (payload === null)
    return { ok: false, status: 403, reason: 'the upload token is invalid or expired' };
  // the PUT ends the in flight window whatever its outcome; the next grant may be issued
  inFlight.delete(payload.slot);
  if (body === null) return { ok: false, status: 400, reason: 'the body is empty' };
  const path = uploadPath(payload.key);
  if (existsSync(path))
    return { ok: false, status: 409, reason: 'the upload was received already' };
  mkdirSync(join(path, '..'), { recursive: true });
  const reader = body.getReader();
  const stream = createWriteStream(`${path}.part`);
  let total = 0;
  let head: Uint8Array | null = null;
  // a media file's sniff may need the frame search window of an mp3 with a long tag (SPEC-5
  // 3.3; R11 1.2), a picture's the first 64 bytes
  const headBytes = isMediaUploadType(payload.type) ? SNIFF_WINDOW_BYTES : 64;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > payload.bytes) {
        await reader.cancel();
        throw new RangeError('over the cap');
      }
      if (head === null) head = value.slice(0, headBytes);
      else if (head.byteLength < headBytes) {
        const previous: Uint8Array = head;
        const joined = new Uint8Array(Math.min(headBytes, previous.byteLength + value.byteLength));
        joined.set(previous.subarray(0, joined.byteLength));
        joined.set(value.subarray(0, joined.byteLength - previous.byteLength), previous.byteLength);
        head = joined;
      }
      await new Promise<void>((ok, fail) =>
        stream.write(value, (error) => (error ? fail(error) : ok())),
      );
    }
    await new Promise<void>((ok) => stream.end(ok));
  } catch (error) {
    stream.destroy();
    rmSync(`${path}.part`, { force: true });
    const reason =
      error instanceof RangeError ? 'the body is over the declared size' : 'the upload failed';
    logSecurityEvent({ event: 'upload.rejected', reason, uploadBytes: total, status: 413 });
    return { ok: false, status: 413, reason };
  }
  if (isMediaUploadType(payload.type)) {
    // a media upload on the local backend (a checkout): the container must be the declared
    // type's (R11 1.2); the parser's word on the file is `media.insert`'s
    const container = head === null ? null : sniffMedia(head);
    if (container === null || !mediaSniffMatches(container, payload.type as MediaMime)) {
      rmSync(`${path}.part`, { force: true });
      logSecurityEvent({
        event: 'upload.rejected',
        reason: 'sniff mismatch',
        sniffedType: container?.container ?? 'unknown',
        uploadBytes: total,
        status: 400,
      });
      return {
        ok: false,
        status: 400,
        reason: 'the bytes are not the audio or video type the upload declared',
      };
    }
    const { renameSync: rename } = await import('node:fs');
    rename(`${path}.part`, path);
    logSecurityEvent({
      event: 'upload.completed',
      uploadBytes: total,
      sniffedType: container.container,
    });
    return { ok: true, key: payload.key, bytes: total, sniffedType: container.container };
  }
  const sniffed = head === null ? null : sniffImage(head);
  if (sniffed === null || sniffed !== SNIFF_BY_TYPE[payload.type]) {
    rmSync(`${path}.part`, { force: true });
    logSecurityEvent({
      event: 'upload.rejected',
      reason: 'sniff mismatch',
      sniffedType: sniffed ?? 'unknown',
      uploadBytes: total,
      status: 400,
    });
    return {
      ok: false,
      status: 400,
      reason: 'the bytes are not the picture type the upload declared',
    };
  }
  const { renameSync } = await import('node:fs');
  renameSync(`${path}.part`, path);
  logSecurityEvent({ event: 'upload.completed', uploadBytes: total, sniffedType: sniffed });
  return { ok: true, key: payload.key, bytes: total, sniffedType: sniffed };
}

/** The bytes of an upload `asset.add { upload }` names, or null when none is there. */
export async function readUpload(key: string): Promise<Uint8Array | null> {
  if (!UPLOAD_KEY_PATTERN.test(key)) return null;
  const path = uploadPath(key);
  if (!existsSync(path)) return null;
  return new Uint8Array(await readFile(path));
}

/** Removes an upload once its asset is committed (or refused). */
export function deleteUpload(key: string): void {
  if (!UPLOAD_KEY_PATTERN.test(key)) return;
  rmSync(uploadPath(key), { force: true });
}

/** The daily sweep of report 10 6.3: uploads older than 24 hours go; answers how many. */
export function sweepUploads(
  now: number = Date.now(),
  maxAgeMs: number = RETENTION_MS.uploads,
): number {
  const root = uploadsDir();
  if (!existsSync(root)) return 0;
  let removed = 0;
  for (const principal of readdirSync(root)) {
    const dir = join(root, principal);
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      const file = join(dir, name);
      const stat = statSync(file, { throwIfNoEntry: false });
      if (!stat) continue;
      if (now - stat.mtimeMs > maxAgeMs) {
        rmSync(file, { force: true });
        removed += 1;
      }
    }
    try {
      if (readdirSync(dir).length === 0) rmSync(dir, { recursive: true, force: true });
    } catch {
      // gone
    }
  }
  if (removed > 0) logSecurityEvent({ event: 'upload.swept', removed, retentionClass: 'uploads' });
  return removed;
}

/** The identity for `releaseUploadSlot` from a request, matching what `issueUploadGrant` used. */
export async function uploadIdentity(request: Request): Promise<string> {
  return identityLabel(await requestContext(request)) ?? 'anonymous';
}

// ---------------------------------------------------------------------------------------------
// The media grant (gslides-parity SPEC-5 0.18, 3.3; R11 1.7, 1.8; MILESTONES-5 B2 day 3)

/** True for one of the five media mimes the media grant admits. */
export function isMediaUploadType(type: string): type is MediaMime {
  return (MEDIA_UPLOAD_CONTENT_TYPES as readonly string[]).includes(type);
}

/** True when a sniffed container is the one the declared media type names (R11 1.2 table). */
export function mediaSniffMatches(sniffed: SniffedMedia, type: MediaMime): boolean {
  switch (type) {
    case 'video/mp4':
    case 'audio/mp4':
      return sniffed.container === 'isobmff' && sniffed.brand !== 'qt  ';
    case 'video/webm':
      return sniffed.container === 'ebml' && sniffed.docType === 'webm';
    case 'audio/mpeg':
      return sniffed.container === 'mp3';
    case 'audio/wav':
      return sniffed.container === 'wav';
  }
}

/** Under this a media file travels as a data URL inside `media.insert { file }` (one request, the function's 4.5 MB body cap; R11 1.8 path 1). */
export const MEDIA_DATA_URL_THRESHOLD_BYTES = PRESIGN_THRESHOLD_BYTES;

/** The tmp tier's sentence (SPEC-5 3.3, 0.18; strings.ts ROUND_FIVE.mediaNeedsBlob). */
export const MEDIA_NEEDS_BLOB_SENTENCE = 'Audio and video need the Blob store on this instance';
/** The blob tier without the private store (R11 1.8): a file over the data URL threshold has nowhere to land. */
export const MEDIA_NEEDS_PRIVATE_STORE_SENTENCE =
  'Audio and video over 3 MB need the private store on this instance; docs/hosting.md names the switch (TURBOSLIDE_BLOB_PRIVATE_TOKEN)';

export type MediaUploadBackend =
  { kind: 'local' } | { kind: 'blob' } | { kind: 'refused'; sentence: string };

/**
 * Where a media upload lands (R11 1.8, 2 rule 3): a checkout writes under `<state>/uploads/`;
 * a hosted instance with the private store's token mints a presigned `PUT` to its `uploads/`
 * prefix; the `tmp` tier refuses media (a function body cannot leave with a video and the tier's
 * edits do not persist); the blob tier without the private store refuses the presigned form and
 * names the switch (files under the data URL threshold still arrive inside `media.insert`).
 */
export function mediaUploadBackend(
  storeKind: StoreKind,
  env: Readonly<Record<string, string | undefined>> = process.env,
): MediaUploadBackend {
  if (storeKind === 'file') return { kind: 'local' };
  if (storeKind === 'tmp') return { kind: 'refused', sentence: MEDIA_NEEDS_BLOB_SENTENCE };
  const token = env[DOCUMENTS_TOKEN_VARIABLE];
  if (token !== undefined && token !== '') return { kind: 'blob' };
  return { kind: 'refused', sentence: MEDIA_NEEDS_PRIVATE_STORE_SENTENCE };
}

export type MediaIssueInput = {
  deckId: string;
  contentType: string;
  bytes: number;
  /** the kind the caller means; a webm carries video unless the caller says audio */
  kind?: MediaKind;
};

export type MediaUploadGrant = UploadGrant & {
  kind: MediaKind;
  /** the presigned PUT's expiry on the blob backend; the token's on the local one */
  presigned?: boolean;
};

export type MediaIssueResult = { grant: MediaUploadGrant } | { refused: Response };

/**
 * `POST /api/x/upload/media` (SPEC-5 3.3; R11 1.8 path 2): `authorize(write)` on the deck as
 * `media.insert`, the `uploads` switch, the tier's largest cap for the kind, one upload in
 * flight per identity and deck, the `mediaPerDay` and `mediaBytesPerDay` quotas, then the grant:
 * a presigned `PUT` to the private store (`uploads/<principal>/<uuid>`, the one content type, the
 * declared size, ten minutes) hosted, the local `PUT` route on a checkout, or the refusal the tier
 * names. Every refusal is a Response the route returns as it is.
 */
export async function issueMediaUploadGrant(
  ctx: AuthContext,
  input: MediaIssueInput,
  now: number = Date.now(),
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<MediaIssueResult> {
  const invalid = (message: string): MediaIssueResult => ({
    refused: Response.json({ error: 'invalid_input', message }, { status: 400 }),
  });
  if (!SLUG_PATTERN.test(input.deckId)) return invalid('deckId must be a slug');
  if (!isMediaUploadType(input.contentType))
    return invalid('send an mp4, webm, mp3, m4a or wav as its media type');
  if (!Number.isInteger(input.bytes) || input.bytes <= 0)
    return invalid('bytes must be a positive integer');
  const kind: MediaKind = input.kind ?? mediaKindOfMime(input.contentType);
  const decision = await authorize(ctx, input.deckId, 'write', {
    action: 'media.insert',
    transport: 'route',
  });
  if (!decision.ok) {
    return {
      refused: Response.json(
        decision.code === 'forbidden'
          ? { error: 'forbidden', capability: 'write' }
          : { error: decision.code === 'unauthorized' ? 'unauthorized' : 'not_found' },
        { status: decision.status },
      ),
    };
  }
  const identity = identityLabel(ctx) ?? 'anonymous';
  const flagged = await requireFlag('uploads', {
    identity,
    deckId: input.deckId,
    action: 'media.insert',
  });
  if (flagged !== null) return { refused: flagged };
  const backend = mediaUploadBackend(storeSelection().kind, env);
  if (backend.kind === 'refused') {
    return {
      refused: Response.json(
        { error: 'unavailable', message: backend.sentence },
        { status: 503, headers: { 'cache-control': 'no-store' } },
      ),
    };
  }
  const tier = tierOf(ctx);
  const quota: QuotaContext = {
    identity,
    tier,
    deckId: input.deckId,
    action: 'media.insert',
    transport: 'route',
  };
  const cap = largestMediaBytes(kind, tier);
  if (input.bytes > cap) {
    logSecurityEvent({
      event: 'upload.rejected',
      identity,
      deckId: input.deckId,
      bytes: input.bytes,
      reason: 'too large',
      status: 413,
    });
    return {
      refused: Response.json(
        { error: 'payload_too_large', message: mediaTooLargeSentence(kind), maxBytes: cap },
        { status: 413 },
      ),
    };
  }
  const slot = `${identity}:${input.deckId}`;
  const held = inFlight.get(slot);
  if (held !== undefined && held > now) {
    return {
      refused: Response.json(
        {
          error: 'rate_limited',
          message: 'Another file is still uploading. Wait for it to finish',
        },
        { status: 429, headers: { 'retry-after': String(Math.ceil((held - now) / 1000)) } },
      ),
    };
  }
  for (const [name, cost] of [
    ['mediaPerDay', 1],
    ['mediaBytesPerDay', input.bytes],
  ] as const) {
    const refused = await checkQuota(name, quota, cost);
    if (refused instanceof RateLimitedError) return { refused: rateLimitedResponse(refused) };
  }
  const key = `${UPLOADS_DIR}/${principalSegment(identity)}/${randomUUID()}`;
  const exp = now + UPLOAD_TOKEN_TTL_MS;
  const token = sign({ key, bytes: input.bytes, type: input.contentType, exp, slot });
  let url = `/api/x/upload/put/${token}`;
  if (backend.kind === 'blob') {
    try {
      const presigned = await presignPrivatePut(
        { pathname: key, contentType: input.contentType, bytes: input.bytes, validUntil: exp },
        env,
      );
      url = presigned.url;
    } catch (error) {
      logSecurityEvent({
        event: 'upload.rejected',
        identity,
        deckId: input.deckId,
        reason: `presign failed: ${error instanceof Error ? error.message.slice(0, 120) : 'error'}`,
        status: 503,
      });
      return {
        refused: Response.json(
          { error: 'unavailable', message: MEDIA_NEEDS_PRIVATE_STORE_SENTENCE },
          { status: 503, headers: { 'cache-control': 'no-store' } },
        ),
      };
    }
  }
  inFlight.set(slot, exp);
  logSecurityEvent({
    event: 'upload.token_issued',
    identity,
    deckId: input.deckId,
    uploadBytes: input.bytes,
    sniffedType: input.contentType,
    action: 'media.insert',
  });
  return {
    grant: {
      key,
      token,
      url,
      method: 'PUT',
      expiresAt: exp,
      maxBytes: input.bytes,
      contentType: input.contentType,
      backend: backend.kind,
      kind,
      presigned: backend.kind === 'blob',
    },
  };
}

/** A staged upload as `media.insert { upload }` reads it: the file on this instance and how to remove it. */
export type StagedUpload = {
  /** the absolute local path the intake reads, digests and puts */
  path: string;
  bytes: number;
  /** the declared content type on the blob backend; the token's on the local one */
  contentType: string | null;
  /** removes the object everywhere it lived, once the record committed or the file was refused */
  cleanup: () => Promise<void>;
};

/** The staging folder of hosted media uploads on the function's temp volume (R11 1.8 path 3). */
export function mediaStagingDir(): string {
  return join(tmpdir(), 'turboslide-uploads');
}

/**
 * Stages the upload a key names for the media intake (R11 1.8 path 3): on the local backend the
 * file the `PUT` route kept; on the blob backend the private object streamed by pathname into
 * `<tmpdir>/turboslide-uploads/<uuid>` so the bytes cross the function once as an internal fetch.
 * null when nothing is there.
 */
export async function stageMediaUpload(
  key: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<StagedUpload | null> {
  if (!UPLOAD_KEY_PATTERN.test(key)) return null;
  const local = uploadPath(key);
  if (existsSync(local)) {
    return {
      path: local,
      bytes: statSync(local).size,
      contentType: null,
      cleanup: async () => deleteUpload(key),
    };
  }
  if (mediaUploadBackend(storeSelection().kind, env).kind !== 'blob') return null;
  const remote = await readPrivateUpload(key, env);
  if (remote === null) return null;
  const dir = mediaStagingDir();
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${randomUUID()}.part`);
  await pipeline(Readable.fromWeb(remote.stream as never), createWriteStream(path));
  return {
    path,
    bytes: statSync(path).size,
    contentType: remote.contentType,
    cleanup: async () => {
      rmSync(path, { force: true });
      await deletePrivateUpload(key, env);
    },
  };
}

export { PRIVATE_UPLOADS_PREFIX };
