// Helpers the capture and intake jobs share (MILESTONES M5 items 1 and 2): the plate rectangle
// of a slide's plate side, ids from file names and URLs, reading an input from a path, a data URL
// or an http(s) URL with the host allowlist of SPEC 11 ("Capture targets are restricted to an
// allowlist ... to prevent server-side request forgery"), image facts through sharp, the inline
// rule per role (build-deck.mjs:72-76) and the full two-tone treatment record from the partial
// parameters a request carries.
import { lookup as dnsLookup } from 'node:dns/promises';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { Readable } from 'node:stream';

import sharp from 'sharp';

import { PLATE_BOXES } from '@turboslide/effects/metrics';
import type { Box } from '@turboslide/effects/image';
import type { TwoToneParams } from '@turboslide/effects/two-tone';
import type { AssetRole, InlineRule, TwoToneTreatment } from '@turboslide/schema/assets';

export type PlateSide = 'lower-left' | 'lower-right' | 'upper-left';
export type PlateKind = 'opener' | 'mood' | 'closing';

/** The partial two-tone parameters an action input carries (actions.ts twoToneParamsSchema). */
export type TwoToneRequestParams = {
  crop?: [number, number, number, number];
  channel?: 'gray' | 'r' | 'g' | 'b';
  invert?: boolean;
  blur?: number;
  black?: number;
  white?: number;
  gamma?: number;
  minFilter?: number;
  polarity?: 'dark-ground' | 'light-ground';
};

export function plateKindOf(side: PlateSide): PlateKind {
  return side === 'lower-left' ? 'opener' : side === 'lower-right' ? 'mood' : 'closing';
}

/** The kinds' default plate max widths (SPEC 2.1): PLATE_BOXES were screened at these. */
const DEFAULT_MAX_WIDTH: Record<PlateKind, number> = { opener: 740, mood: 560, closing: 720 };

/** PLATE_BOXES for the side; a plate max width other than the kind's moves the far edge by the difference. */
export function plateBoxFor(side: PlateSide, maxWidth?: number): Box {
  const kind = plateKindOf(side);
  const [x, y, w, h] = PLATE_BOXES[kind];
  const delta = maxWidth === undefined ? 0 : maxWidth - DEFAULT_MAX_WIDTH[kind];
  if (delta === 0) return [x, y, w, h];
  return side === 'lower-right' ? [x - delta, y, w + delta, h] : [x, y, w + delta, h];
}

/** A slug: lower case, runs of anything but letters and digits as one hyphen, no edge hyphens. */
export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'asset' : slug;
}

/** An asset id from a path or URL: the file name without its extension, or the URL's host and path. */
export function assetIdFrom(input: string): string {
  if (/^https?:\/\//i.test(input)) {
    const url = new URL(input);
    const path = url.pathname.replace(/\/+$/, '');
    const host = url.hostname.replace(/^www\./, '').split('.')[0] ?? 'site';
    return slugify(path === '' ? host : `${host}${path.replace(/\.[a-z0-9]+$/i, '')}`);
  }
  if (input.startsWith('data:')) return 'pasted';
  const name = basename(input);
  return slugify(name.replace(/\.[a-z0-9]+$/i, ''));
}

/** The loopback names a checkout may capture (the Prototemplate dev server on 3005) and a hosted instance never fetches (gslides-parity SPEC-3 8.6; report 04 F3). */
export const LOOPBACK_HOSTS: ReadonlyArray<string> = ['localhost', '127.0.0.1', '::1'];

/** Hosts a capture or an intake may fetch without `--allow` on a checkout (SPEC 11 captureHosts). */
export const DEFAULT_ALLOW_HOSTS: ReadonlyArray<string> = [
  ...LOOPBACK_HOSTS,
  'generaltranslation.com',
  'prototemplate.com',
  'glyphfield.com',
  'commons.wikimedia.org',
  'upload.wikimedia.org',
];

/** The same list without the loopback names: what a hosted instance fetches (SPEC-3 11.5 R0). */
export const HOSTED_ALLOW_HOSTS: ReadonlyArray<string> = DEFAULT_ALLOW_HOSTS.filter(
  (host) => !LOOPBACK_HOSTS.includes(host),
);

/**
 * How this process reads intake inputs (SPEC-3 8.6, report 04 F3 fix steps 1 and 2). A checkout's
 * CLI keeps file paths and the loopback hosts; the studio's dispatchers (the HTTP, MCP and window
 * transports, apps/studio/src/server/actions.ts) set `allowPaths: false` so a caller never names
 * a file on the server, and `hosted: true` when the process runs a hosted store so the loopback
 * names leave the allowlist. Explicit options on readInput and assertAllowedHost win over the
 * process policy; the policy is the default for callers that cannot pass them.
 */
export type IntakePolicy = {
  /** File paths as inputs; false refuses them with a TypeError. */
  allowPaths: boolean;
  /** The hosted allowlist (no loopback) and the hosted format rule (no svg). */
  hosted: boolean;
};

const POLICY = Symbol.for('turboslide.headless.intakePolicy');

function policyHolder(): Record<symbol, IntakePolicy | undefined> {
  return globalThis as unknown as Record<symbol, IntakePolicy | undefined>;
}

/** The process default: a checkout (paths allowed, loopback allowed). */
export const CHECKOUT_INTAKE_POLICY: IntakePolicy = { allowPaths: true, hosted: false };

export function intakePolicy(): IntakePolicy {
  return policyHolder()[POLICY] ?? CHECKOUT_INTAKE_POLICY;
}

/** Sets the process policy; returns the previous one so a test can restore it. */
export function setIntakePolicy(policy: IntakePolicy): IntakePolicy {
  const previous = intakePolicy();
  policyHolder()[POLICY] = { ...policy };
  return previous;
}

function hostMatches(host: string, allowed: string): boolean {
  const h = host.toLowerCase();
  const a = allowed.toLowerCase();
  return h === a || h.endsWith(`.${a}`);
}

export type AllowHostOptions = {
  /** The hosted list (no loopback) instead of the checkout list; the process policy otherwise. */
  hosted?: boolean;
};

/** Throws RangeError when the URL's host is outside the built-in list plus `extra`. */
export function assertAllowedHost(
  url: string,
  extra: ReadonlyArray<string> = [],
  options: AllowHostOptions = {},
): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new TypeError(`not a URL: ${url}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    throw new RangeError(`only http and https URLs are captured, got ${parsed.protocol}`);
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  const hosted = options.hosted ?? intakePolicy().hosted;
  const base = hosted ? HOSTED_ALLOW_HOSTS : DEFAULT_ALLOW_HOSTS;
  const allowed = [...base, ...extra].some((entry) => hostMatches(host, entry));
  if (!allowed) {
    throw new RangeError(
      `host ${host} is not in the capture allowlist; pass --allow ${host} (SPEC 11 captureHosts)`,
    );
  }
  return parsed;
}

export const MAX_INPUT_BYTES = 25 * 1024 * 1024;

// ---------------------------------------------------------------------------------------------
// The media intake's entries (gslides-parity SPEC-5 3.3; R11 1.2, 1.7, 4.3; B2): the container
// sniff the store's parsers share, re-exported so `readInput`'s callers and the bundle scan run
// one code; the per kind byte caps a media read takes in place of the picture's 25 MB; and the
// two hosts the YouTube title and thumbnail reads may reach, passed as `allowHosts` for that one
// fetch and never added to the general allowlist.

export { sniffMedia } from '@turboslide/store/media/sniff';
export type { MediaContainer, SniffedMedia } from '@turboslide/store/media/sniff';

/** The byte cap a media read takes per kind (SPEC-5 0.18: the account and agent tiers' rows). */
export const MEDIA_INPUT_BYTES: Readonly<Record<'audio' | 'video', number>> = {
  audio: 50 * 1024 * 1024,
  video: 200 * 1024 * 1024,
};

/** `www.youtube.com` for the oEmbed title (R11 4.3, M3). */
export const YOUTUBE_OEMBED_HOST = 'www.youtube.com';
/** `i.ytimg.com` for the live thumbnail the editor shows and never stores (R11 4.3, M4). */
export const YOUTUBE_THUMBNAIL_FETCH_HOST = 'i.ytimg.com';

// ---------------------------------------------------------------------------------------------
// The pinned lookup (gslides-parity SPEC-3 0.30, 8.6; report 04 F3 sketches 3 and 4): a host name
// is resolved once, every address it resolves to is checked against the private, loopback, link
// local, multicast, reserved and mapped ranges, and the connection is made to the checked address
// with the name kept for TLS and the Host header, so nothing can change between the check and the
// connect (DNS rebinding).

/** True for an address no intake fetch may reach: private, loopback, link local, multicast, reserved, unspecified. */
export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPrivateV4(address);
  if (family === 6) return isPrivateV6(address);
  return true;
}

function isPrivateV4(address: string): boolean {
  const parts = address.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255))
    return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0 && parts[2] === 0) return true;
  if (a === 192 && b === 0 && parts[2] === 2) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && parts[2] === 100) return true;
  if (a === 203 && b === 0 && parts[2] === 113) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateV6(address: string): boolean {
  const lower = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (lower === '::' || lower === '::1') return true;
  // a mapped or NAT64 v4 address: the v4 rules decide
  const mapped = /^(?:::ffff:|64:ff9b::)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower);
  if (mapped !== null) return isPrivateV4(mapped[1] ?? '');
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (mappedHex !== null) {
    const hi = parseInt(mappedHex[1] ?? '0', 16);
    const lo = parseInt(mappedHex[2] ?? '0', 16);
    return isPrivateV4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  const first = parseInt(lower.split(':')[0] || '0', 16);
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (first === 0x2001 && (lower.startsWith('2001:db8:') || lower.startsWith('2001:0db8:')))
    return true;
  return false;
}

/** The addresses a host name resolves to; injected by the tests. */
export type Resolver = (hostname: string) => Promise<string[]>;

/** The DNS resolver of the process: every address, both families. */
export const dnsResolver: Resolver = async (hostname) =>
  (await dnsLookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);

/** What the studio logs when a fetch is refused (`ssrf.refused`); nothing by default. */
export type SsrfReporter = (event: { host: string; address: string; reason: string }) => void;

const REPORTER = Symbol.for('turboslide.headless.ssrfReporter');

export function setSsrfReporter(reporter: SsrfReporter | null): void {
  (globalThis as unknown as Record<symbol, SsrfReporter | null>)[REPORTER] = reporter;
}

function report(event: { host: string; address: string; reason: string }): void {
  const reporter = (globalThis as unknown as Record<symbol, SsrfReporter | null | undefined>)[
    REPORTER
  ];
  reporter?.(event);
}

/**
 * The one address a fetch of `url` connects to: the literal when the host is one (checked), else
 * the first address the resolver answers after every address passed the range check. A name that
 * resolves to any private address is refused whole (a split answer is the rebinding trick), with
 * a RangeError that names the host and never the address.
 */
export async function resolvePinned(url: URL, resolver: Resolver = dnsResolver): Promise<string> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) !== 0) {
    if (isPrivateAddress(host)) {
      report({ host, address: host, reason: 'private address' });
      throw new RangeError(`host ${host} is not a public address`);
    }
    return host;
  }
  let addresses: string[];
  try {
    addresses = await resolver(host);
  } catch (error) {
    throw new RangeError(
      `host ${host} did not resolve (${error instanceof Error ? error.message : String(error)})`,
    );
  }
  if (addresses.length === 0) throw new RangeError(`host ${host} did not resolve`);
  for (const address of addresses) {
    if (isPrivateAddress(address)) {
      report({ host, address, reason: 'resolves to a private address' });
      throw new RangeError(`host ${host} resolves to an address this instance never fetches`);
    }
  }
  return addresses[0] ?? host;
}

/**
 * A fetch over `node:http(s)` pinned to one address: the socket connects to `address`, the TLS
 * server name and the Host header stay the URL's host, redirects are never followed (the caller
 * re-checks each hop). The answer is a web Response over the message stream so `readCapped` reads
 * it like any other.
 */
export function pinnedFetch(
  url: URL,
  address: string,
  init: { signal?: AbortSignal; method?: string; headers?: Record<string, string> } = {},
): Promise<Response> {
  return new Promise<Response>((resolveResponse, reject) => {
    const family = isIP(address) === 6 ? 6 : 4;
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port === '' ? undefined : Number(url.port),
        path: `${url.pathname}${url.search}`,
        method: init.method ?? 'GET',
        headers: { accept: '*/*', ...(init.headers ?? {}) },
        servername: url.protocol === 'https:' ? url.hostname.replace(/^\[|\]$/g, '') : undefined,
        // the pinned address: whatever the name says by the time the socket opens
        lookup: (
          _hostname: string,
          options: { all?: boolean },
          callback: (
            error: Error | null,
            result: string | { address: string; family: number }[],
            family?: number,
          ) => void,
        ) => {
          if (options.all === true) callback(null, [{ address, family }]);
          else callback(null, address, family);
        },
        signal: init.signal,
      } as never,
      (message: IncomingMessage) => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(message.headers)) {
          if (value === undefined) continue;
          headers.set(name, Array.isArray(value) ? value.join(', ') : value);
        }
        const status = message.statusCode ?? 0;
        const body =
          status === 204 || status === 304
            ? null
            : (Readable.toWeb(message) as ReadableStream<Uint8Array>);
        resolveResponse(new Response(body, { status, headers }));
      },
    );
    request.on('error', reject);
    request.end();
  });
}

export type SafeFetchOptions = {
  allowHosts?: ReadonlyArray<string>;
  hosted?: boolean;
  timeoutMs?: number;
  maxBytes?: number;
  /** The address resolver; the process DNS when absent and no fetch is injected. */
  resolver?: Resolver;
  /**
   * A fetch to use instead of the pinned one (the tests answer from a table). With a fetch
   * injected and no resolver, the range check runs on literal addresses only.
   */
  fetchImpl?: typeof fetch;
};

/**
 * One fetch of an allowlisted URL (SPEC-3 8.6 `safeFetch`): the allowlist, the pinned lookup with
 * the range check, the timeout, at most three redirect hops each re-checked and re-resolved, and
 * the counted body. `readInput`, the bundle fetch, Image by URL and `slide.setBackgroundPicture
 * { url }` all go through here.
 */
export async function safeFetch(
  input: string,
  options: SafeFetchOptions = {},
): Promise<{ url: URL; bytes: Uint8Array }> {
  return fetchAllowed(input, options);
}

/** How long one fetch of an input may take (SPEC-3 8.6: 20 s). */
export const READ_INPUT_TIMEOUT_MS = 20_000;

/** How many redirects a fetch follows, each hop checked against the allowlist (SPEC-3 8.6). */
export const READ_INPUT_MAX_REDIRECTS = 3;

export type ReadInput = {
  bytes: Uint8Array;
  /** A file name to derive the id and extension from. */
  name: string;
  /** Where it came from, for the provenance record. */
  origin: string;
  kind: 'path' | 'data' | 'url';
};

export type ReadInputOptions = {
  cwd?: string;
  allowHosts?: ReadonlyArray<string>;
  fetchImpl?: typeof fetch;
  /** File paths as inputs; the process policy when absent (SPEC-3 8.6 `allowPaths: false` hosted). */
  allowPaths?: boolean;
  /** The hosted allowlist; the process policy when absent. */
  hosted?: boolean;
  /** The fetch budget in milliseconds; READ_INPUT_TIMEOUT_MS when absent. */
  timeoutMs?: number;
  /** The byte cap; MAX_INPUT_BYTES when absent. */
  maxBytes?: number;
  /** The address resolver of the pinned lookup; the process DNS when absent and no fetch is injected. */
  resolver?: Resolver;
};

/**
 * Reads a response body under a byte cap: the stream is counted as it arrives and cancelled the
 * moment it passes the cap, so a body that never ends or lies in Content-Length holds neither
 * memory nor the invocation past the cap (report 04 F3, sketch 5).
 */
export async function readCapped(
  response: Response,
  maxBytes: number,
  label: string,
): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes)
    throw new RangeError(`${label} exceeds ${Math.round(maxBytes / (1024 * 1024))} MB`);
  if (response.body === null) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes)
      throw new RangeError(`${label} exceeds ${Math.round(maxBytes / (1024 * 1024))} MB`);
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new RangeError(`${label} exceeds ${Math.round(maxBytes / (1024 * 1024))} MB`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** The resolver of a test with an injected fetch: a name resolves to nothing private by fiat. */
const literalOnlyResolver: Resolver = () => Promise.resolve(['1.1.1.1']);

/**
 * Fetches an allowlisted URL with the pinned lookup, the timeout, the redirect hops re-checked
 * and re-resolved one by one and the counted body (SPEC-3 0.30, 8.6; report 04 F3 sketches 2 to
 * 5). Without an injected fetch the connection is `pinnedFetch` to the checked address; with one
 * (the tests) the range check runs through the injected resolver when there is one, and on
 * literal addresses always.
 */
export async function fetchAllowed(
  input: string,
  options: ReadInputOptions = {},
): Promise<{ url: URL; bytes: Uint8Array }> {
  const hostOptions: AllowHostOptions =
    options.hosted !== undefined ? { hosted: options.hosted } : {};
  let url = assertAllowedHost(input, options.allowHosts, hostOptions);
  const timeoutMs = options.timeoutMs ?? READ_INPUT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_INPUT_BYTES;
  const signal = AbortSignal.timeout(timeoutMs);
  const injected = options.fetchImpl;
  const resolver = options.resolver ?? (injected === undefined ? dnsResolver : literalOnlyResolver);
  for (let hop = 0; ; hop += 1) {
    let response: Response;
    try {
      const address = await resolvePinned(url, resolver);
      response =
        injected !== undefined
          ? await injected(url, { redirect: 'manual', signal })
          : await pinnedFetch(url, address, { signal });
    } catch (error) {
      if (signal.aborted) throw new RangeError(`${url.href}: no answer within ${timeoutMs} ms`);
      throw error;
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location === null) throw new Error(`${url.href}: HTTP ${response.status}`);
      if (hop >= READ_INPUT_MAX_REDIRECTS)
        throw new RangeError(`${url.href}: more than ${READ_INPUT_MAX_REDIRECTS} redirects`);
      await response.body?.cancel();
      url = assertAllowedHost(new URL(location, url).href, options.allowHosts, hostOptions);
      continue;
    }
    if (!response.ok) throw new Error(`${url.href}: HTTP ${response.status}`);
    try {
      return { url, bytes: await readCapped(response, maxBytes, url.href) };
    } catch (error) {
      if (signal.aborted) throw new RangeError(`${url.href}: no answer within ${timeoutMs} ms`);
      throw error;
    }
  }
}

/** A path (relative to cwd), a data: URL or an http(s) URL, as bytes (SPEC 11: 25 MB at most). */
export async function readInput(input: string, options: ReadInputOptions = {}): Promise<ReadInput> {
  const maxBytes = options.maxBytes ?? MAX_INPUT_BYTES;
  if (input.startsWith('data:')) {
    const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(input);
    if (match === null) throw new TypeError('malformed data URL');
    const mime = match[1] ?? '';
    const payload = match[3] ?? '';
    const bytes =
      match[2] !== undefined
        ? new Uint8Array(Buffer.from(payload, 'base64'))
        : new Uint8Array(Buffer.from(decodeURIComponent(payload), 'utf8'));
    if (bytes.byteLength > maxBytes) throw new RangeError('the data URL exceeds 25 MB');
    const ext = mime === 'image/jpeg' ? 'jpg' : mime.startsWith('image/') ? mime.slice(6) : 'bin';
    return { bytes, name: `pasted.${ext}`, origin: 'pasted image', kind: 'data' };
  }
  if (/^https?:\/\//i.test(input)) {
    const { url, bytes } = await fetchAllowed(input, options);
    const name = basename(url.pathname) || `${url.hostname}.bin`;
    return { bytes, name: decodeURIComponent(name), origin: url.href, kind: 'url' };
  }
  const allowPaths = options.allowPaths ?? intakePolicy().allowPaths;
  if (!allowPaths) {
    // the message names the shape, never the path a caller tried (report 04 F10)
    throw new TypeError(
      'file paths are not accepted on this transport; send a data URL or an allowlisted https URL',
    );
  }
  const path = isAbsolute(input) ? input : resolve(options.cwd ?? process.cwd(), input);
  if (!existsSync(path)) throw new RangeError(`no file at ${path}`);
  const bytes = new Uint8Array(await readFile(path));
  if (bytes.byteLength > maxBytes) throw new RangeError(`${path} exceeds 25 MB`);
  return { bytes, name: basename(path), origin: basename(path), kind: 'path' };
}

/** The formats an intake decodes: the four raster formats everywhere, svg on a checkout only (SPEC-3 0.28, 8.5). */
export type SniffedFormat = 'png' | 'jpeg' | 'webp' | 'gif' | 'svg';

export const HOSTED_INPUT_FORMATS: ReadonlyArray<SniffedFormat> = ['png', 'jpeg', 'webp', 'gif'];

/**
 * The format by magic bytes, before sharp sees the buffer (SPEC-3 8.5: "a magic byte sniff (png,
 * jpeg, webp, gif only on hosted)"; report 04 F17: HEIF, AVIF and JXL never reach libheif). null
 * when the bytes are none of the five.
 */
export function sniffImage(bytes: Uint8Array): SniffedFormat | null {
  if (bytes.length >= 8) {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (png.every((byte, i) => bytes[i] === byte)) return 'png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'jpeg';
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return 'webp';
  if (bytes.length >= 6) {
    const head = String.fromCharCode(...bytes.subarray(0, 6));
    if (head === 'GIF87a' || head === 'GIF89a') return 'gif';
  }
  // svg: text that opens with <svg or an XML prolog or a comment leading to <svg
  const text = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 4096)))
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(text))
    return 'svg';
  return null;
}

/** sharp's pixel budget for an untrusted input: 64 megapixels (SPEC-3 8.5; sharp's default is 268 megapixels). */
export const LIMIT_INPUT_PIXELS = 64_000_000;

const BLOCKED = Symbol.for('turboslide.headless.sharpBlocked');

/**
 * Blocks libvips' HEIF and JXL loaders for the process (SPEC-3 11.5 R0; report 04 F17: the
 * libheif heap overflows of GHSA-rgj7-g3m4-5g8c are reachable through AVIF input). Idempotent; runs
 * when this module loads and again before every untrusted decode, so the order in which the
 * studio's modules load cannot leave a window. The deck's own twins never carry those formats.
 */
export function blockUntrustedLoaders(): void {
  const holder = globalThis as unknown as Record<symbol, boolean | undefined>;
  if (holder[BLOCKED] === true) return;
  sharp.block({ operation: ['VipsForeignLoadHeif', 'VipsForeignLoadJxl'] });
  holder[BLOCKED] = true;
}

blockUntrustedLoaders();

export type ImageInfo = { width: number; height: number; format: string; ext: string };

/**
 * Width, height and format of an image buffer through sharp, after the magic byte sniff: a buffer
 * that is none of png, jpeg, webp, gif or svg is refused before libvips opens it, svg is refused
 * on a hosted instance (SPEC-3 0.28), and sharp runs with the 64 megapixel budget and
 * `failOn: 'error'` (SPEC-3 8.5).
 */
export async function imageInfo(
  bytes: Uint8Array,
  options: { hosted?: boolean } = {},
): Promise<ImageInfo> {
  blockUntrustedLoaders();
  const sniffed = sniffImage(bytes);
  if (sniffed === null) throw new TypeError('not an image: expected png, jpeg, webp, gif or svg');
  const hosted = options.hosted ?? intakePolicy().hosted;
  if (hosted && !HOSTED_INPUT_FORMATS.includes(sniffed))
    throw new TypeError(`${sniffed} is not accepted here; send png, jpeg, webp or gif`);
  const meta = await sharp(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), {
    limitInputPixels: LIMIT_INPUT_PIXELS,
    failOn: 'error',
  }).metadata();
  const format = meta.format ?? 'unknown';
  if (meta.width === undefined || meta.height === undefined)
    throw new TypeError(`not an image sharp can read (${format})`);
  return { width: meta.width, height: meta.height, format, ext: extFor(format) };
}

/** The file extension the deck uses for a format (`.jpg`, not `.jpeg`). */
export function extFor(format: string): string {
  switch (format) {
    case 'jpeg':
    case 'jpg':
      return '.jpg';
    case 'png':
      return '.png';
    case 'webp':
      return '.webp';
    case 'gif':
      return '.gif';
    case 'svg':
      return '.svg';
    default:
      return `.${format}`;
  }
}

/** The build rule per role (build-deck.mjs:72-76): openers, moods and details native, captures resampled, marks as is. */
export function inlineRuleFor(role: AssetRole, twoTone: boolean): InlineRule {
  if (twoTone) return 'two-color';
  switch (role) {
    case 'opener':
    case 'mood':
    case 'detail':
    case 'frame':
      return 'native';
    case 'capture':
    case 'thumb':
    case 'render':
      return 'resample-1280';
    default:
      return 'pass-through';
  }
}

/** The recorded treatment (SPEC 4.2) from the request's parameters and the source size. */
export function fullTreatment(
  params: TwoToneRequestParams,
  size: { width: number; height: number },
): TwoToneTreatment {
  const treatment: TwoToneTreatment = {
    kind: 'two-tone',
    crop: params.crop ?? [0, 0, size.width, size.height],
    autocontrast: 0.5,
    polarity: params.polarity ?? 'dark-ground',
    cell: 2,
    bayer: 8,
    resampler: 'lanczos3',
  };
  if (params.channel !== undefined && params.channel !== 'gray') treatment.channel = params.channel;
  if (params.invert === true) treatment.invert = true;
  if (params.blur !== undefined && params.blur > 0) treatment.blur = params.blur;
  if (params.black !== undefined && params.black > 0) treatment.black = params.black;
  if (params.white !== undefined && params.white < 255) treatment.white = params.white;
  if (params.gamma !== undefined && params.gamma !== 1) treatment.gamma = params.gamma;
  if (params.minFilter !== undefined && params.minFilter > 0)
    treatment.minFilter = params.minFilter;
  return treatment;
}

/** The pipeline's parameters from a recorded treatment (the kind and the fixed fields dropped). */
export function treatmentParams(treatment: TwoToneTreatment): TwoToneParams {
  const params: TwoToneParams = { crop: treatment.crop, polarity: treatment.polarity };
  if (treatment.channel !== undefined) params.channel = treatment.channel;
  if (treatment.invert !== undefined) params.invert = treatment.invert;
  if (treatment.blur !== undefined) params.blur = treatment.blur;
  if (treatment.black !== undefined) params.black = treatment.black;
  if (treatment.white !== undefined) params.white = treatment.white;
  if (treatment.gamma !== undefined) params.gamma = treatment.gamma;
  if (treatment.minFilter !== undefined) params.minFilter = treatment.minFilter;
  if (treatment.unsharp !== undefined) params.unsharp = treatment.unsharp;
  return params;
}

/** Writes bytes under the deck directory; returns the path relative to it. */
export async function writeUnder(
  deckDir: string,
  relative: string,
  bytes: Uint8Array,
): Promise<string> {
  const path = join(deckDir, relative);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  return relative;
}

/** `assets/<id>-light.png` and its dark twin. */
export function twinPaths(id: string, ext = '.png'): { light: string; dark: string } {
  return { light: `assets/${id}-light${ext}`, dark: `assets/${id}-dark${ext}` };
}

export function extOfPath(path: string): string {
  return extname(path).toLowerCase();
}
