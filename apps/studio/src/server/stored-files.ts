import { createHmac } from 'node:crypto';

import { safeEqual } from '@turboslide/identity/safe-equal';
import { SLUG_PATTERN } from '@turboslide/schema/ids';

import type { AuthContext } from './authorize';
import { downloadSecret, isFileName } from './tokens';

/**
 * The produced files through the download route (hardening K1#5a; docs/hardening/HARDENING.md 4.1,
 * CRIT-M4 and DATA-3). An export under `exports/`, a bundle under `bundles/` and a web page build
 * under `builds/` are stored where any instance reads them, and the browser never receives the
 * store's address for one: every answer names `/api/download/s.<token>`, a token signed with the
 * download secret that names the store path, the deck, the principal it was minted for and an
 * expiry ten minutes out. The route serves it only to that principal (or one of its aliases, or
 * the agent key's owner), answers 410 once it has expired, and streams the file from whichever
 * store holds it through the deployment's client, which routes by the storage layout, so the link
 * keeps working when the produced files move to the private store (K1#5b). A job record keeps
 * the path (export-jobs.ts `ExportJobFile`), never a URL, and every answer mints the link for its own caller.
 * The token is not spent on use: the principal is the capability, and a download that resumes
 * asks again.
 */

/** The prefix that tells a stored file's token from the instance tokens of tokens.ts. */
export const STORED_TOKEN_PREFIX = 's.';

/** How long a link is good for. */
export const STORED_LINK_TTL_MS = 10 * 60 * 1000;

/** The folders a produced file lives under; nothing else is ever served by this route. */
const PRODUCED_PATH = /^(?:exports|bundles|builds)\/[a-z0-9][a-z0-9-]*\/[^/]+\/[^/]+$/;

type Payload = {
  /** the store path */
  p: string;
  /** the deck */
  d: string;
  /** the principal the link was minted for */
  u: string;
  /** the name the download saves as */
  n: string;
  exp: number;
};

function sign(body: string): string {
  return createHmac('sha256', downloadSecret()).update(`stored\n${body}`).digest('hex');
}

/** True for a store path this route may serve for that deck. */
export function isProducedPath(path: string, deckId: string): boolean {
  return PRODUCED_PATH.test(path) && path.split('/')[1] === deckId;
}

/** The ids a context answers to: its principal, the principal's aliases, an agent key's owner. */
export function principalIdsOf(ctx: AuthContext): Set<string> {
  const ids = new Set<string>(ctx.principal?.aliases ?? []);
  if (ctx.principal !== null) ids.add(ctx.principal.id);
  if (ctx.agent !== undefined) ids.add(ctx.agent.ownerId);
  return ids;
}

/** The principal a link is minted for: the session's, else the agent key's owner; null for none. */
function ownerOf(ctx: AuthContext): string | null {
  return ctx.principal?.id ?? ctx.agent?.ownerId ?? null;
}

/** The token for one stored file and one principal. */
export function signStoredToken(
  target: { path: string; deckId: string; principalId: string; name: string },
  now: number = Date.now(),
): string {
  if (!SLUG_PATTERN.test(target.deckId)) throw new TypeError('the deck id must be a slug');
  if (!isProducedPath(target.path, target.deckId))
    throw new TypeError(`"${target.path}" is not a produced file of ${target.deckId}`);
  if (!isFileName(target.name)) throw new TypeError(`"${target.name}" is not a file name`);
  if (target.principalId === '') throw new TypeError('a link names a principal');
  const payload: Payload = {
    p: target.path,
    d: target.deckId,
    u: target.principalId,
    n: target.name,
    exp: now + STORED_LINK_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${STORED_TOKEN_PREFIX}${body}.${sign(body)}`;
}

export type StoredTokenCheck =
  | { ok: true; path: string; deckId: string; principalId: string; name: string }
  | { ok: false; status: 404 | 410 };

/** A token's facts when it is well formed and signed, else 404; 410 once it has expired. */
export function verifyStoredToken(token: string, now: number = Date.now()): StoredTokenCheck {
  if (!token.startsWith(STORED_TOKEN_PREFIX)) return { ok: false, status: 404 };
  const rest = token.slice(STORED_TOKEN_PREFIX.length);
  const dot = rest.indexOf('.');
  if (dot <= 0) return { ok: false, status: 404 };
  const body = rest.slice(0, dot);
  if (!safeEqual(rest.slice(dot + 1), sign(body))) return { ok: false, status: 404 };
  let payload: Partial<Payload>;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<Payload>;
  } catch {
    return { ok: false, status: 404 };
  }
  const { p, d, u, n, exp } = payload;
  if (
    typeof p !== 'string' ||
    typeof d !== 'string' ||
    typeof u !== 'string' ||
    typeof n !== 'string' ||
    typeof exp !== 'number' ||
    !SLUG_PATTERN.test(d) ||
    !isProducedPath(p, d) ||
    !isFileName(n)
  )
    return { ok: false, status: 404 };
  if (exp < now) return { ok: false, status: 410 };
  return { ok: true, path: p, deckId: d, principalId: u, name: n };
}

/** The route path of a token. */
export function storedFileUrl(token: string): string {
  return `/api/download/${token}`;
}

/**
 * The signer of links for the caller of the request being served (or `ctx`), so one answer links
 * several files with one identity read. A link for a caller without an identity is a TypeError:
 * a link names the one who may open it.
 */
export async function storedFileSigner(
  ctx?: AuthContext,
): Promise<(target: { path: string; deckId: string; name: string }) => string> {
  let caller = ctx;
  if (caller === undefined) {
    const { requestContext } = await import('./authorize');
    caller = await requestContext();
  }
  const principalId = ownerOf(caller);
  return (target) => {
    if (principalId === null)
      throw new TypeError('a stored file is linked for a caller with an identity');
    return storedFileUrl(signStoredToken({ ...target, principalId }));
  };
}

/** The link to one stored file for the caller of the request being served (or `ctx`). */
export async function storedFileLink(
  target: { path: string; deckId: string; name: string },
  ctx?: AuthContext,
): Promise<string> {
  return (await storedFileSigner(ctx))(target);
}

const TYPES: Record<string, string> = {
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
};

function contentTypeOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return TYPES[name.slice(dot).toLowerCase()] ?? 'application/octet-stream';
}

/** The size above which the answer is streamed in parts: under Vercel's 4.5 MB body cap. */
const STREAM_PART_BYTES = 1024 * 1024;

/**
 * The route's answer for a stored file's token (`/api/download/s.<token>`): 404 for a token that
 * does not verify or a file the store no longer holds, 410 once expired, 403 for a caller the
 * link was not minted for, else the file as an attachment, not cached. The body is a stream of
 * 1 MB parts, so a file over a function's 4.5 MB answer cap travels too.
 */
export async function storedFileResponse(
  token: string,
  request: Request,
  deps: {
    now?: number;
    context?: (request: Request) => Promise<AuthContext>;
    read?: (path: string) => Promise<Uint8Array | null>;
  } = {},
): Promise<Response> {
  const check = verifyStoredToken(token, deps.now ?? Date.now());
  if (!check.ok) {
    return check.status === 410
      ? Response.json(
          { error: { message: 'This download link has expired; download the file again' } },
          { status: 410, headers: { 'cache-control': 'no-store' } },
        )
      : new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  }
  const context =
    deps.context ?? (async (req: Request) => (await import('./authorize')).requestContext(req));
  const ctx = await context(request);
  if (!principalIdsOf(ctx).has(check.principalId)) {
    const { logSecurityEvent } = await import('./log');
    logSecurityEvent({
      event: 'http.403',
      deckId: check.deckId,
      action: 'download.stored',
      reason: 'the link names another principal',
      status: 403,
      transport: 'route',
    });
    return Response.json(
      { error: { message: 'This download link was made for someone else' } },
      { status: 403, headers: { 'cache-control': 'no-store' } },
    );
  }
  const read =
    deps.read ??
    (async (path: string) => {
      const { exportBlobClient } = await import('./root');
      const client = await exportBlobClient();
      if (client === null) return null;
      return (await client.get(path))?.bytes ?? null;
    });
  const bytes = await read(check.path);
  if (bytes === null)
    return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  let offset = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close();
        return;
      }
      const end = Math.min(bytes.byteLength, offset + STREAM_PART_BYTES);
      controller.enqueue(bytes.slice(offset, end));
      offset = end;
    },
  });
  return new Response(body, {
    headers: {
      'content-type': contentTypeOf(check.name),
      'content-disposition': `attachment; filename="${check.name.replace(/"/g, '')}"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
