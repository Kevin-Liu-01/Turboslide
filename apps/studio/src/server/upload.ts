import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

import { sniffImage } from '@turboslide/headless/capture/shared';
import type { SniffedFormat } from '@turboslide/headless/capture/shared';
import { SLUG_PATTERN } from '@turboslide/schema/ids';

import { authorize, identityLabel, requestContext } from './authorize';
import type { AuthContext } from './authorize';
import { requireFlag } from './flags';
import { RETENTION_MS, logSecurityEvent } from './log';
import {
  RateLimitedError,
  checkQuota,
  largestPictureBytes,
  rateLimitedResponse,
  tierOf,
} from './ratelimit';
import type { QuotaContext } from './ratelimit';
import { stateDir } from './root';
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

/**
 * The reason a refused upload carries for the seller (the product round, docs/PRODUCT.md section
 * 2 rank 10; research 07 rule 22: a sentence, never a code or an action id). The chrome reads
 * `reason` off the route's JSON and shows "The picture could not be uploaded: <reason>"; `message`
 * stays the API's own line. Three sentences cover every refusal: the file is not a picture (the
 * declared type is not one of the four, or the bytes are not what was declared), the file is over
 * the tier's cap, the upload did not finish (a missing body, an expired token, a stream that
 * broke or overran its declared size, a second PUT of one token).
 */
export const UPLOAD_REASONS = {
  notPicture: 'the file is not a picture',
  tooLarge: (maxBytes: number): string => `the file is over ${Math.round(maxBytes / MB)} MB`,
  unfinished: 'the upload did not finish',
} as const;

const MB = 1024 * 1024;

/** The seller's reason for a refusal the route answers, from its code and status. */
export function uploadFailureReason(refusal: {
  code: string;
  status: number;
  maxBytes?: number;
}): string {
  if (refusal.code === 'payload_too_large' && refusal.maxBytes !== undefined)
    return UPLOAD_REASONS.tooLarge(refusal.maxBytes);
  if (refusal.code === 'not_picture') return UPLOAD_REASONS.notPicture;
  return UPLOAD_REASONS.unfinished;
}

/** How long an upload token is good for. */
export const UPLOAD_TOKEN_TTL_MS = 10 * 60 * 1000;

/** The content types an upload may declare (SPEC-3 8.5: png, jpeg, webp, gif hosted). */
export const UPLOAD_CONTENT_TYPES: ReadonlyArray<string> = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];

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
        {
          error: 'invalid_input',
          message: 'send a png, jpeg, webp or gif',
          reason: UPLOAD_REASONS.notPicture,
        },
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
          reason: UPLOAD_REASONS.tooLarge(largestPictureBytes(tier)),
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
  | { ok: true; key: string; bytes: number; sniffedType: SniffedFormat }
  | {
      ok: false;
      status: number;
      /** the API's line */
      reason: string;
      /** the seller's sentence (UPLOAD_REASONS) */
      sellerReason: string;
    };

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
    return {
      ok: false,
      status: 403,
      reason: 'the upload token is invalid or expired',
      sellerReason: UPLOAD_REASONS.unfinished,
    };
  // the PUT ends the in flight window whatever its outcome; the next grant may be issued
  inFlight.delete(payload.slot);
  if (body === null)
    return {
      ok: false,
      status: 400,
      reason: 'the body is empty',
      sellerReason: UPLOAD_REASONS.unfinished,
    };
  const path = uploadPath(payload.key);
  if (existsSync(path))
    return {
      ok: false,
      status: 409,
      reason: 'the upload was received already',
      sellerReason: UPLOAD_REASONS.unfinished,
    };
  mkdirSync(join(path, '..'), { recursive: true });
  const reader = body.getReader();
  const stream = createWriteStream(`${path}.part`);
  let total = 0;
  let head: Uint8Array | null = null;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > payload.bytes) {
        await reader.cancel();
        throw new RangeError('over the cap');
      }
      if (head === null) head = value.slice(0, 64);
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
    return { ok: false, status: 413, reason, sellerReason: UPLOAD_REASONS.unfinished };
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
      sellerReason: UPLOAD_REASONS.notPicture,
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
