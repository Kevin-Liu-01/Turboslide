import { randomBytes } from 'node:crypto';
import { basename } from 'node:path';

import { createMiddleware } from '@tanstack/react-start';
import {
  TRUST_PROXY_ENV,
  effectiveHost,
  forwardedHost,
  isLocalRequest,
  refuseSpoofedLocalhost,
  socketHost,
  trustsProxy,
} from '@turboslide/agent/http/dispatch';
import { MEDIA_MIMES } from '@turboslide/schema/assets';
import {
  YOUTUBE_FRAME_HOSTS,
  YOUTUBE_SCRIPT_HOSTS,
  YOUTUBE_THUMBNAIL_HOST,
} from '@turboslide/schema/blocks/media';

import { logSecurityEvent } from './log';

/**
 * The request and response header rules of the third Google Slides parity round (gslides-parity
 * SPEC-3 0.28, 0.31, 8.7, 8.8, 11.4; report 04 F5, F10, F11, F13, F15, report 10 F30, F48).
 * Day one carried the forwarded host trust of `TURBOSLIDE_TRUST_PROXY` (the rule itself lives in
 * @turboslide/agent/http/dispatch, framework free and unit tested), the client address the rate
 * limiter and the log key on, and the headers the assets route sets so an `.svg` or a `.json`
 * file is a download and never a document in the app's origin. Day five adds the global headers
 * middleware (`securityHeadersMiddleware`: HSTS, nosniff, the frame rule with the `/embed`
 * exception, the referrer rule with the `/s/*` exception, the permissions policy, COOP, CORP on
 * the asset routes, `no-store` on every API answer, the request id, and the nonce based CSP in
 * report only mode with the report endpoint), the widened CSRF filter (`csrfFilter`), the JSON
 * content type rule (`contentTypeMiddleware`) and the browser `Origin` refusal of the agent
 * routes (`refuseForeignOrigin`). Server only.
 */
export {
  TRUST_PROXY_ENV,
  effectiveHost,
  forwardedHost,
  isLocalRequest,
  refuseSpoofedLocalhost,
  socketHost,
  trustsProxy,
};

export type Env = Readonly<Record<string, string | undefined>>;

/**
 * The client address a limit or a log line keys on, or null when the request carries none the
 * deployment trusts. Vercel sets `x-real-ip` and `x-vercel-forwarded-for` itself (a client cannot
 * spoof them there); `x-forwarded-for` is read only under `TURBOSLIDE_TRUST_PROXY=1`, first entry,
 * because a client can prepend to it on any other deployment.
 */
export function clientAddress(request: Request, env: Env = process.env): string | null {
  const vercel = request.headers.get('x-vercel-forwarded-for') ?? request.headers.get('x-real-ip');
  if (env.VERCEL !== undefined && env.VERCEL !== '' && vercel) return firstAddress(vercel);
  if (trustsProxy(env)) {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) return firstAddress(forwarded);
    if (vercel) return firstAddress(vercel);
  }
  return null;
}

function firstAddress(value: string): string | null {
  const first = value.split(',')[0]?.trim() ?? '';
  return first === '' ? null : first;
}

/**
 * The file types the assets route serves inline; anything else is an attachment. The four raster
 * types, and from round five the five media types (gslides-parity SPEC-5 3.3; R11 1.5), so a
 * `<video>` or `<audio>` element in the show reads the file with `nosniff` and never as an
 * attachment; a media file is bytes a decoder reads, never markup the origin runs.
 */
export const INLINE_TYPES: ReadonlyArray<string> = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  ...MEDIA_MIMES,
];

/**
 * The response headers of one asset file (SPEC-3 0.28, 11.3; report 04 F5): `nosniff` on every
 * file, `Cross-Origin-Resource-Policy: same-site` (8.8), and for `image/svg+xml`,
 * `application/json` and any type outside the raster four and the media five a
 * `Content-Disposition: attachment` with a sandboxing policy, so a navigation to the file cannot
 * run script or CSS in the studio's origin. The `<img>` tags the renderer emits never load an svg
 * from this route on a hosted instance (svg is refused at intake there), and a checkout's GT
 * import keeps its svg files as downloads.
 */
export function assetResponseHeaders(
  relative: string,
  contentType: string,
  cacheControl: string = assetCacheControl(relative),
): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': contentType,
    'cache-control': cacheControl,
    'x-content-type-options': 'nosniff',
    'cross-origin-resource-policy': 'same-site',
  };
  const type = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!INLINE_TYPES.includes(type)) {
    const name = basename(relative).replace(/[^A-Za-z0-9._-]/g, '_') || 'asset';
    headers['content-disposition'] = `attachment; filename="${name}"`;
    headers['content-security-policy'] = "sandbox; default-src 'none'";
  }
  return headers;
}

/** A year, the cache life of a file whose name carries its content digest (gslides-parity SPEC-5 3.3; R11 2 rule 4). */
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** The cache life of an asset whose name may be reused with other bytes (the GT deck's twins). */
export const MUTABLE_ASSET_CACHE_CONTROL = 'public, max-age=60';

/**
 * True for an asset file whose name carries its content digest and is never overwritten (SPEC-3
 * 0.26): the intake's `assets/<id>.<sha8>.<ext>` and `assets/<id>.<sha8>-light.png` twins, the
 * dither variants `assets/<id>.dither-<key12>-light.png`, the material frames and the media files
 * of SPEC-5 3.3. The GT deck's committed twins (`opener-brand-light.jpg`) carry none and keep the
 * short cache.
 */
export function isDigestNamedAsset(relative: string): boolean {
  const name = basename(relative);
  return (
    /\.[0-9a-f]{8}(?:[.-][^/]*)?\.[a-z0-9]+$/i.test(name) || /\.dither-[0-9a-f]{12}-/.test(name)
  );
}

/** The `Cache-Control` of one asset file: a year and immutable for a digest named file, a minute otherwise (R11 2 rule 2). */
export function assetCacheControl(relative: string): string {
  return isDigestNamedAsset(relative) ? IMMUTABLE_CACHE_CONTROL : MUTABLE_ASSET_CACHE_CONTROL;
}

// ---------------------------------------------------------------------------------------------
// The global headers (SPEC-3 8.8; report 04 8.3, the OWASP cheat sheet)

/** Two years, subdomains, preload: the value the specification fixes. */
export const HSTS = 'max-age=63072000; includeSubDomains; preload';

export const PERMISSIONS_POLICY =
  'geolocation=(), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()';

/**
 * The policy on the routes that use the device camera and microphone (gslides-parity SPEC-5 3.3,
 * 3.7, 7.3; R11 6): the editor (the Camera dialog, Dictate speaker notes), the audience route
 * (the speaker spotlight in the show) and the presenter (Voice type). `camera=(self)` and
 * `microphone=(self)` name this origin alone; every other directive stays closed, and `/embed`
 * and every other route keep `PERMISSIONS_POLICY`.
 */
export const DEVICE_PERMISSIONS_POLICY =
  'geolocation=(), camera=(self), microphone=(self), payment=(), usb=(), interest-cohort=()';

/** The routes whose pages may ask for the camera or the microphone: the editor, the draft, the audience route and the presenter. */
export function isDeviceRoute(pathname: string): boolean {
  return (
    pathname === '/new' ||
    /^\/edit\/[^/]+/.test(pathname) ||
    /^\/deck\/[^/]+/.test(pathname) ||
    /^\/present\/[^/]+/.test(pathname)
  );
}

/** The `Permissions-Policy` of one route (SPEC-5 3.3): the device policy on the four device routes, the closed one elsewhere. */
export function permissionsPolicyFor(pathname: string): string {
  return isDeviceRoute(pathname) && !isEmbedPath(pathname)
    ? DEVICE_PERMISSIONS_POLICY
    : PERMISSIONS_POLICY;
}

/** The customer domains the embed is sold for, beside Prototemplate; a comma list in the variable. */
export const EMBED_ANCESTORS_ENV = 'TURBOSLIDE_EMBED_ANCESTORS';

export const DEFAULT_EMBED_ANCESTORS: ReadonlyArray<string> = [
  'https://prototemplate.com',
  'https://*.prototemplate.com',
];

export function embedAncestors(env: Env = process.env): string[] {
  const extra = (env[EMBED_ANCESTORS_ENV] ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => /^https:\/\/[A-Za-z0-9*.-]+(?::\d+)?$/.test(entry));
  return [...DEFAULT_EMBED_ANCESTORS, ...extra];
}

/** Where the CSP is a nonce based policy: the document routes. */
export function isEmbedPath(pathname: string): boolean {
  return pathname === '/embed' || pathname.startsWith('/embed/');
}

/** The link exchange route (SPEC-3 6.4): `Referrer-Policy: no-referrer`, unsafe methods only under CSRF. */
export function isExchangePath(pathname: string): boolean {
  return pathname === '/s' || pathname.startsWith('/s/');
}

/** The routes whose answers are never cached and never framed: every API and server function path. */
export function isApiPath(pathname: string): boolean {
  return pathname.startsWith('/api/') || pathname.startsWith('/_serverFn/') || pathname === '/mcp';
}

/** The spelling dictionaries under `public/dictionaries/` (SPEC-5 7.2), served immutable. */
export function isDictionaryPath(pathname: string): boolean {
  return pathname.startsWith('/dictionaries/');
}

/** The asset routes: `Cross-Origin-Resource-Policy: same-site`. */
export function isAssetPath(pathname: string): boolean {
  return /^\/decks\/[^/]+\/assets\//.test(pathname) || pathname.startsWith('/api/render/');
}

/** A request id: Vercel's, else 16 hex characters minted here (8.8: error bodies carry it, never a stack). */
export function requestIdOf(request: Request): string {
  return request.headers.get('x-vercel-id') ?? randomBytes(8).toString('hex');
}

/** A CSP nonce: 128 bits, base64. */
export function mintNonce(): string {
  return randomBytes(16).toString('base64');
}

export type CspOptions = {
  nonce: string;
  /** The public store's host, for `img-src` and `connect-src` (SPEC-3 8.8). */
  publicStoreHost?: string | null;
  /** The private store's presign host, for `connect-src`. */
  presignHost?: string | null;
  /** The report endpoint, absolute or relative. */
  reportUri?: string;
  pathname?: string;
  env?: Env;
};

/** The variable that names the public store's host (the twins' origin), for the policy. */
export const PUBLIC_STORE_HOST_ENV = 'TURBOSLIDE_PUBLIC_STORE_HOST';
export const PRESIGN_HOST_ENV = 'TURBOSLIDE_PRESIGN_HOST';
/** `report` (the default) ships the policy as `Content-Security-Policy-Report-Only`; `enforce` enforces it; `off` sends none. */
export const CSP_MODE_ENV = 'TURBOSLIDE_CSP';

export type CspMode = 'report' | 'enforce' | 'off';

export function cspMode(env: Env = process.env): CspMode {
  const value = env[CSP_MODE_ENV]?.trim().toLowerCase();
  if (value === 'enforce') return 'enforce';
  if (value === 'off' || value === '0' || value === 'false') return 'off';
  return 'report';
}

/** The report endpoint, a POST route under the WAF visible prefix (`x.csp.$.ts`). */
export const CSP_REPORT_PATH = '/api/x/csp/report';

/**
 * The policy of SPEC-3 8.8, nonce based because `__root.tsx` renders an inline boot script:
 * `'strict-dynamic'` lets the scripts the nonced ones load run; `style-src 'unsafe-inline'` stays
 * because the renderer emits inline style attributes on every block (the reason `img-src` and
 * `connect-src` name hosts); `worker-src 'self' blob:` keeps the dither worker (0.31, asserted by
 * the hosted smoke row); `frame-src 'self'` covers the sandboxed `srcdoc` frames of the `html`
 * block (an `about:srcdoc` document inherits the host's policy and matches `'self'`);
 * `frame-ancestors` is `'none'` except on `/embed`. `upgrade-insecure-requests` is left off a
 * plain http dev server, where it would break the page's own requests.
 */
export function buildCsp(options: CspOptions): string {
  const env = options.env ?? process.env;
  const publicStore = options.publicStoreHost ?? env[PUBLIC_STORE_HOST_ENV] ?? null;
  const presign = options.presignHost ?? env[PRESIGN_HOST_ENV] ?? null;
  const store = publicStore ? ` https://${publicStore}` : '';
  const connect = `${store}${presign ? ` https://${presign}` : ''}`;
  const embed = options.pathname !== undefined && isEmbedPath(options.pathname);
  // round five (gslides-parity SPEC-5 3.3; R11 2 rule 5, 4.2, 4.3): `media-src` names the page's
  // own origin, `blob:` (the camera preview and a recording) and the public store the hosted
  // media files are read from; `frame-src` names the two YouTube hosts the IFrame API mounts on
  // and may rewrite to; `img-src` names the live thumbnail host the editor shows and never
  // stores; `script-src` lists the IFrame API hosts for engines without `'strict-dynamic'`,
  // which the strict dynamic engines ignore (the nonced loader inherits trust there)
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${options.nonce}' 'strict-dynamic' ${YOUTUBE_SCRIPT_HOSTS.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${store} ${YOUTUBE_THUMBNAIL_HOST}`,
    "font-src 'self' data:",
    `connect-src 'self'${connect}`,
    `media-src 'self' blob:${store}`,
    "worker-src 'self' blob:",
    `frame-src 'self' ${YOUTUBE_FRAME_HOSTS.join(' ')}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    embed ? `frame-ancestors ${embedAncestors(env).join(' ')}` : "frame-ancestors 'none'",
  ];
  if (env.VERCEL !== undefined && env.VERCEL !== '') directives.push('upgrade-insecure-requests');
  if (options.reportUri !== undefined) directives.push(`report-uri ${options.reportUri}`);
  return directives.join('; ');
}

export type SecurityHeaderOptions = {
  nonce: string;
  requestId: string;
  /** The request was served over https (or a localhost name browsers treat as secure). */
  secure: boolean;
  env?: Env;
};

/**
 * The headers of one response by its path (SPEC-3 8.8). Nothing here sets `Content-Type`; the
 * route did. HSTS goes out on https answers only (a plain http dev server must not pin itself).
 */
export function securityHeadersFor(
  pathname: string,
  options: SecurityHeaderOptions,
): Record<string, string> {
  const env = options.env ?? process.env;
  const embed = isEmbedPath(pathname);
  const headers: Record<string, string> = {
    'x-content-type-options': 'nosniff',
    'referrer-policy': isExchangePath(pathname) ? 'no-referrer' : 'strict-origin-when-cross-origin',
    'permissions-policy': permissionsPolicyFor(pathname),
    'x-request-id': options.requestId,
  };
  // the dictionaries change only with a package bump and the Worker appends the manifest's
  // digest as `?v=` (gslides-parity SPEC-5 7.2; b5.md request 5 to B2), so the files are immutable
  if (isDictionaryPath(pathname)) headers['cache-control'] = IMMUTABLE_CACHE_CONTROL;
  if (options.secure) headers['strict-transport-security'] = HSTS;
  if (!embed) {
    headers['x-frame-options'] = 'DENY';
    headers['cross-origin-opener-policy'] = 'same-origin';
  }
  if (isAssetPath(pathname)) headers['cross-origin-resource-policy'] = 'same-site';
  if (isApiPath(pathname)) headers['cache-control'] = 'no-store';
  const mode = cspMode(env);
  if (mode !== 'off' && !isApiPath(pathname)) {
    const name =
      mode === 'enforce' ? 'content-security-policy' : 'content-security-policy-report-only';
    headers[name] = buildCsp({
      nonce: options.nonce,
      pathname,
      reportUri: CSP_REPORT_PATH,
      env,
    });
  }
  return headers;
}

/** https directly or through the proxy header, or a localhost name, which browsers treat as secure. */
export function isSecureRequest(request: Request): boolean {
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  if (proto === 'https') return true;
  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Sets the headers on a response, cloning one whose headers are immutable (`Response.redirect`). */
export function withHeaders(response: Response, headers: Record<string, string>): Response {
  let target = response;
  try {
    for (const [name, value] of Object.entries(headers)) {
      if (!target.headers.has(name)) target.headers.set(name, value);
    }
    return target;
  } catch {
    target = new Response(response.body, response);
    for (const [name, value] of Object.entries(headers)) {
      if (!target.headers.has(name)) target.headers.set(name, value);
    }
    return target;
  }
}

/**
 * The global request middleware (SPEC-3 8.8): mints the request's CSP nonce into the request
 * context (`context.nonce`, the field the framework's `RequestOptions` names, so `getRouter()` can
 * hand it to `ssr.nonce` and the root document to its boot script), lets the handler answer, and
 * sets the headers of `securityHeadersFor` on the answer without overriding one a route set.
 */
export function securityHeadersMiddleware() {
  return createMiddleware({ type: 'request' }).server(async ({ request, next, pathname }) => {
    const nonce = mintNonce();
    const requestId = requestIdOf(request);
    const result = await next({ context: { nonce, requestId } });
    const headers = securityHeadersFor(pathname, {
      nonce,
      requestId,
      secure: isSecureRequest(request),
    });
    return { ...result, response: withHeaders(result.response, headers) };
  });
}

// ---------------------------------------------------------------------------------------------
// CSRF (SPEC-3 8.7; report 04 F13, report 10 F30, F48)

const UNSAFE_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** The routes the CSRF filter widens to beside the server functions (SPEC-3 8.7). */
export const CSRF_ROUTE_PATTERNS: ReadonlyArray<RegExp> = [
  /^\/api\/decks\/[^/]+\/(?:stream|ops|presence)$/,
  /^\/api\/comments(?:\/|$)/,
  /^\/api\/share(?:\/|$)/,
  /^\/api\/access(?:\/|$)/,
  // /api/x/csp/report is left out: a browser posts a CSP report with no Sec-Fetch-Site the
  // middleware accepts and the endpoint has no effect beyond a log line and its own rate limit
  /^\/api\/x(?!\/csp(?:\/|$))(?:\/|$)/,
  /^\/api\/avatar(?:\/|$)/,
  /^\/api\/notify(?:\/|$)/,
  /^\/api\/auth(?:\/|$)/,
  /^\/device(?:\/|$)/,
];

/**
 * True when the CSRF middleware validates the request: every server function (as before), the
 * widened routes on every method, and `/s/*` on unsafe methods only (the exchange is a GET that
 * accepts top level navigations from any origin, SPEC-3 6.4). The agent routes (`/api/actions`,
 * `/api/agent`, `/mcp`, the export, render and bundle routes) stay bearer surfaces with the
 * `Origin` refusal of `refuseForeignOrigin` instead, because agents send no `Origin`.
 */
export function csrfFilter(ctx: {
  handlerType: 'serverFn' | 'router';
  pathname: string;
  request: Request;
}): boolean {
  if (ctx.handlerType === 'serverFn') return true;
  const path = ctx.pathname;
  if (isExchangePath(path)) return UNSAFE_METHODS.has(ctx.request.method.toUpperCase());
  const method = ctx.request.method.toUpperCase();
  // a bearer or API key agent on the room routes (curl, the CLI's follow, an MCP client) sends no
  // Sec-Fetch-Site; the bearer is its proof and the agent surface's own rule applies (SPEC-3 8.7;
  // b2.md R14, the integrator at merge 2)
  if (ROOM_ROUTE_PATTERN.test(path) && ctx.request.headers.has('authorization')) return false;
  // a top level navigation typed into the address bar or clicked in a mail (Sec-Fetch-Site none
  // or cross-site) is how a person reaches /device and the magic link's verify URL; the library
  // runs its own origin and state checks there (SPEC-3 7.3, 7.5; b3.md R11)
  if (method === 'GET' && NAVIGATION_GET_PATTERNS.some((pattern) => pattern.test(path)))
    return false;
  return CSRF_ROUTE_PATTERNS.some((pattern) => pattern.test(path));
}

/** The three room routes of SPEC-3 3.3 (the stream, the ops, the presence). */
const ROOM_ROUTE_PATTERN = /^\/api\/decks\/[^/]+\/(?:stream|ops|presence)$/;

/** The GET pages a person reaches by a typed or mailed address (b3.md R11). */
const NAVIGATION_GET_PATTERNS: ReadonlyArray<RegExp> = [
  /^\/device(?:\/|$)/,
  /^\/api\/auth\/magic-link\/verify(?:\/|$)/,
];

/** The 403 a refused cross site request gets: no detail, logged as `csrf.refused`. */
export function csrfFailure(ctx: { pathname: string; request: Request }): Response {
  logSecurityEvent({
    event: 'csrf.refused',
    status: 403,
    action: ctx.pathname,
    reason: ctx.request.headers.get('sec-fetch-site') ?? 'no sec-fetch-site',
    transport: 'route',
  });
  return Response.json(
    { error: 'forbidden' },
    { status: 403, headers: { 'cache-control': 'no-store' } },
  );
}

/** The JSON routes (SPEC-3 8.7): a body on an unsafe method arrives as `application/json` or is refused. */
export const JSON_ROUTE_PATTERNS: ReadonlyArray<RegExp> = [
  /^\/api\/decks\/[^/]+\/(?:ops|presence)$/,
  /^\/api\/comments(?:\/|$)/,
  /^\/api\/share(?:\/|$)/,
  /^\/api\/access(?:\/|$)/,
  /^\/api\/notify(?:\/|$)/,
  /^\/api\/actions\//,
  // the CSP report endpoint parses `application/csp-report` itself
  /^\/api\/x\/(?:export|render)(?:\/|$)/,
  /^\/api\/export\//,
];

/**
 * True when the request must carry `Content-Type: application/json`: an unsafe method with a body
 * on a JSON route. An empty body (a bare POST from an agent, the pagehide cancel with `keepalive`)
 * needs no content type, and a cross site form POST always carries one, so the rule closes F13
 * without breaking the CLI. Uploads and bundles (multipart, a zip) are not JSON routes.
 */
export function requiresJsonBody(request: Request, pathname: string): boolean {
  if (!UNSAFE_METHODS.has(request.method.toUpperCase())) return false;
  if (!JSON_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname))) return false;
  const length = request.headers.get('content-length');
  const type = request.headers.get('content-type');
  // an empty body carries nothing whatever its declared type (a client library stamps text/plain
  // on an empty string); a body with no type is a bare POST, which the routes read as `{}`
  if (length === '0') return false;
  if (length === null && type === null) return false;
  return true;
}

export function isJsonContentType(value: string | null): boolean {
  if (value === null) return false;
  const type = value.split(';')[0]?.trim().toLowerCase() ?? '';
  return type === 'application/json' || type.endsWith('+json');
}

/** The 415 a JSON route answers a body of another type (SPEC-3 8.7), logged as `content_type.refused`. */
export function contentTypeRefusal(request: Request, pathname: string): Response | null {
  if (!requiresJsonBody(request, pathname)) return null;
  const type = request.headers.get('content-type');
  if (isJsonContentType(type)) return null;
  logSecurityEvent({
    event: 'content_type.refused',
    status: 415,
    action: pathname,
    reason: (type ?? 'none').split(';')[0]?.trim().slice(0, 64),
    transport: 'route',
  });
  return Response.json(
    { error: 'unsupported_media_type', message: 'send the body as application/json' },
    { status: 415, headers: { 'cache-control': 'no-store' } },
  );
}

/** The request middleware form of the JSON rule, for start.ts. */
export function contentTypeMiddleware() {
  return createMiddleware({ type: 'request' }).server(async ({ request, next, pathname }) => {
    const refused = contentTypeRefusal(request, pathname);
    if (refused !== null) return refused;
    return next();
  });
}

/**
 * The agent routes' browser rule (SPEC-3 8.7; report 04 F13): a request that carries an `Origin`
 * header comes from a browser, and a browser may call the agent surface only from the studio's
 * own origin (the window API pages, the hosted smoke). Agents and the CLI send no `Origin`. The
 * comparison is by host, because a dev server is reached as `http://localhost:4333` and a hosted
 * instance as `https://<host>`, and the scheme is the proxy's business (`TURBOSLIDE_TRUST_PROXY`).
 */
export function refuseForeignOrigin(request: Request, env: Env = process.env): Response | null {
  const origin = request.headers.get('origin');
  if (origin === null || origin === 'null') {
    if (origin === 'null') {
      logSecurityEvent({ event: 'origin.refused', status: 403, reason: 'opaque origin' });
      return Response.json(
        { error: 'forbidden' },
        { status: 403, headers: { 'cache-control': 'no-store' } },
      );
    }
    return null;
  }
  let host: string;
  try {
    host = new URL(origin).host.toLowerCase();
  } catch {
    host = '';
  }
  if (host !== '' && host === effectiveHost(request, env).toLowerCase()) return null;
  logSecurityEvent({ event: 'origin.refused', status: 403, reason: 'foreign origin' });
  return Response.json(
    { error: 'forbidden' },
    { status: 403, headers: { 'cache-control': 'no-store' } },
  );
}
