// Helpers the capture and intake jobs share (MILESTONES M5 items 1 and 2): the plate rectangle
// of a slide's plate side, ids from file names and URLs, reading an input from a path, a data URL
// or an http(s) URL with the host allowlist of SPEC 11 ("Capture targets are restricted to an
// allowlist ... to prevent server-side request forgery"), image facts through sharp, the inline
// rule per role (build-deck.mjs:72-76) and the full two-tone treatment record from the partial
// parameters a request carries.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path';

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

/** Hosts a capture or an intake may fetch without `--allow` (SPEC 11 captureHosts). */
export const DEFAULT_ALLOW_HOSTS: ReadonlyArray<string> = [
  'localhost',
  '127.0.0.1',
  '::1',
  'generaltranslation.com',
  'prototemplate.com',
  'glyphfield.com',
  'commons.wikimedia.org',
  'upload.wikimedia.org',
];

function hostMatches(host: string, allowed: string): boolean {
  const h = host.toLowerCase();
  const a = allowed.toLowerCase();
  return h === a || h.endsWith(`.${a}`);
}

/** Throws RangeError when the URL's host is outside the built-in list plus `extra`. */
export function assertAllowedHost(url: string, extra: ReadonlyArray<string> = []): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new TypeError(`not a URL: ${url}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    throw new RangeError(`only http and https URLs are captured, got ${parsed.protocol}`);
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  const allowed = [...DEFAULT_ALLOW_HOSTS, ...extra].some((entry) => hostMatches(host, entry));
  if (!allowed) {
    throw new RangeError(
      `host ${host} is not in the capture allowlist; pass --allow ${host} (SPEC 11 captureHosts)`,
    );
  }
  return parsed;
}

export const MAX_INPUT_BYTES = 25 * 1024 * 1024;

export type ReadInput = {
  bytes: Uint8Array;
  /** A file name to derive the id and extension from. */
  name: string;
  /** Where it came from, for the provenance record. */
  origin: string;
  kind: 'path' | 'data' | 'url';
};

/** A path (relative to cwd), a data: URL or an http(s) URL, as bytes (SPEC 11: 25 MB at most). */
export async function readInput(
  input: string,
  options: { cwd?: string; allowHosts?: ReadonlyArray<string>; fetchImpl?: typeof fetch } = {},
): Promise<ReadInput> {
  if (input.startsWith('data:')) {
    const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(input);
    if (match === null) throw new TypeError('malformed data URL');
    const mime = match[1] ?? '';
    const payload = match[3] ?? '';
    const bytes =
      match[2] !== undefined
        ? new Uint8Array(Buffer.from(payload, 'base64'))
        : new Uint8Array(Buffer.from(decodeURIComponent(payload), 'utf8'));
    if (bytes.byteLength > MAX_INPUT_BYTES) throw new RangeError('the data URL exceeds 25 MB');
    const ext = mime === 'image/jpeg' ? 'jpg' : mime.startsWith('image/') ? mime.slice(6) : 'bin';
    return { bytes, name: `pasted.${ext}`, origin: 'pasted image', kind: 'data' };
  }
  if (/^https?:\/\//i.test(input)) {
    const url = assertAllowedHost(input, options.allowHosts);
    const doFetch = options.fetchImpl ?? fetch;
    const response = await doFetch(url, { redirect: 'follow' });
    if (!response.ok) throw new Error(`${url.href}: HTTP ${response.status}`);
    const length = Number(response.headers.get('content-length') ?? '0');
    if (length > MAX_INPUT_BYTES) throw new RangeError(`${url.href} exceeds 25 MB`);
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > MAX_INPUT_BYTES) throw new RangeError(`${url.href} exceeds 25 MB`);
    const name = basename(url.pathname) || `${url.hostname}.bin`;
    return { bytes: buffer, name: decodeURIComponent(name), origin: url.href, kind: 'url' };
  }
  const path = isAbsolute(input) ? input : resolve(options.cwd ?? process.cwd(), input);
  if (!existsSync(path)) throw new RangeError(`no file at ${path}`);
  const bytes = new Uint8Array(await readFile(path));
  if (bytes.byteLength > MAX_INPUT_BYTES) throw new RangeError(`${path} exceeds 25 MB`);
  return { bytes, name: basename(path), origin: basename(path), kind: 'path' };
}

export type ImageInfo = { width: number; height: number; format: string; ext: string };

/** Width, height and format of an image buffer through sharp. */
export async function imageInfo(bytes: Uint8Array): Promise<ImageInfo> {
  const meta = await sharp(
    Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
  ).metadata();
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
