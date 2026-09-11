// Image hosting for createImage (SPEC 8.3, 11): the Slides API fetches every raster from a URL at
// write time, so the exporter hosts each PNG once, content addressed by its sha256, behind an
// ImageHost. Two hosts: the local static host, which stages files under .turboslide/gslides-assets
// for the studio's /api/assets/<token> route (dev; reachable to Google only through a public
// tunnel, docs/google-slides.md), and the Cloud Storage host, which uploads to a bucket with a
// service account and hands out V4 signed URLs with a 15 minute TTL that are never logged. A dry
// run plans URLs without copying or uploading. Google's fetchers cannot reach a loopback or
// unspecified origin, so assetBaseUrlProblem names the origins a live run must refuse (build.ts
// refuses them before the browser pass and before presentations.create). Pictures that cover-crop
// in the browser are cropped here before hosting, because ImageProperties.cropProperties is
// read-only in the API.
import { createHash, sign as rsaSign } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

import { decodeImage, encodePngRgba } from '@turboslide/effects/io';
import type { Box } from '@turboslide/schema/render';

import type { Scene } from '../scene/types.ts';
import type { ImageUse, UrlResolver } from './requests.ts';

export type HostKind = 'local' | 'gcs';

export type HostedImage = {
  token: string;
  url: string;
  bytes: number;
  sha256: string;
  mime: string;
  /** True when the file was copied or uploaded; false in a dry run. */
  staged: boolean;
  /** The signed URL's expiry, ISO 8601, for the Cloud Storage host. */
  expiresAt?: string;
  /** False when a Cloud Storage URL was planned without a key (dry run with config only). */
  signed?: boolean;
};

export type ImageHost = {
  kind: HostKind;
  /** One line for the manifest and the report; never includes a signature or a key. */
  describe: () => string;
  /** Hosts a file's bytes; idempotent per content hash. */
  host: (file: string, bytes: Uint8Array, mime: string) => Promise<HostedImage>;
  /** The local host's origin, checked by the live run's reachability gate (assetBaseUrlProblem). */
  baseUrl?: string;
};

export type ImageManifestEntry = {
  token: string;
  url: string;
  /** The hosted file: the raster, or the cover crop derived from `source`. */
  file: string;
  source?: string;
  bytes: number;
  sha256: string;
  mime: string;
  staged: boolean;
  expiresAt?: string;
  signed?: boolean;
  uses: { slideId: string; blockId: string; kind: string; role: ImageUse['role'] }[];
};

export type ImageManifest = {
  host: string;
  kind: HostKind;
  staged: boolean;
  images: ImageManifestEntry[];
  /** Files a scene named that do not exist; the builder skips them with a warning. */
  missing: { file: string; slideId: string; blockId: string; role: ImageUse['role'] }[];
  /** The longest URL in bytes; SPEC 8.3 asks for signed URLs under 2 KB. */
  maxUrlBytes: number;
};

export function mimeOf(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

export function extensionOf(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/webp') return 'webp';
  return 'png';
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

// ---------------------------------------------------------------------------------------------
// The local static host

/** Where the local host stages files, under the workspace root; the studio route reads the same folder. */
export const LOCAL_ASSET_DIR = '.turboslide/gslides-assets';
export const LOCAL_ASSET_ROUTE = '/api/assets';
export const DEFAULT_ASSET_BASE_URL = 'http://localhost:4321';
export const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

export type LocalHostOptions = {
  /** The staging directory; default <root>/.turboslide/gslides-assets. */
  dir: string;
  /** The studio's origin; default http://localhost:4321 (TURBOSLIDE_ASSET_BASE_URL). */
  baseUrl?: string;
  /** Copy the files (a live run); false plans URLs only (a dry run). */
  stage: boolean;
};

/** Thrown by a live run whose image origin Google's servers cannot fetch from (docs/google-slides.md, Images). */
export class UnreachableImageHostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnreachableImageHostError';
  }
}

/** The loopback hostnames the WHATWG parser leaves as written (IPv4 loopback is the 127. prefix). */
const LOOPBACK_HOSTNAMES = new Set(['localhost', '[::1]']);

/**
 * Why Google's fetchers could not load an image from this origin, or undefined when nothing in the
 * URL rules it out: not an absolute http or https URL; a loopback host (localhost and every
 * `.localhost` name, 127.0.0.0/8, ::1); or an unspecified address (0.0.0.0, ::). The parser
 * normalizes IPv4 forms (127.1 becomes 127.0.0.1) and lowercases the host. Private and
 * link-local ranges are not checked; a reverse proxy in front of them is the caller's setup.
 */
export function assetBaseUrlProblem(baseUrl: string): string | undefined {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return 'is not an absolute URL';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    return `uses ${url.protocol.replace(/:$/, '')}, not http or https`;
  const host = url.hostname.toLowerCase();
  if (host === '0.0.0.0' || host === '[::]')
    return `has the unspecified address ${url.hostname}, which resolves to no machine`;
  if (LOOPBACK_HOSTNAMES.has(host) || host.endsWith('.localhost') || host.startsWith('127.'))
    return `has the loopback host ${url.hostname}, which only this machine can reach`;
  return undefined;
}

export function createLocalStaticHost(options: LocalHostOptions): ImageHost {
  const baseUrl = (options.baseUrl ?? DEFAULT_ASSET_BASE_URL).replace(/\/+$/, '');
  return {
    kind: 'local',
    baseUrl,
    describe: () =>
      `local static host: ${baseUrl}${LOCAL_ASSET_ROUTE}/<sha256> served by the studio from ${options.dir}${options.stage ? '' : ' (planned, nothing copied)'}`,
    async host(file, bytes, mime) {
      const token = sha256Hex(bytes);
      if (options.stage) {
        await mkdir(options.dir, { recursive: true });
        const target = join(options.dir, `${token}.${extensionOf(mime)}`);
        if (!existsSync(target)) await copyFile(file, target);
      }
      return {
        token,
        url: `${baseUrl}${LOCAL_ASSET_ROUTE}/${token}`,
        bytes: bytes.byteLength,
        sha256: token,
        mime,
        staged: options.stage,
      };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The Cloud Storage host: V4 signed URLs and a media upload with a service account

export type ServiceAccountKey = {
  type: 'service_account';
  client_email: string;
  private_key: string;
  project_id?: string;
  token_uri?: string;
};

export function isServiceAccountKey(value: unknown): value is ServiceAccountKey {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.type === 'service_account' &&
    typeof v.client_email === 'string' &&
    typeof v.private_key === 'string'
  );
}

export const STORAGE_HOST = 'storage.googleapis.com';
export const STORAGE_SCOPE = 'https://www.googleapis.com/auth/devstorage.read_write';
export const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';

function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodeObjectPath(object: string): string {
  return object.split('/').map(rfc3986).join('/');
}

function stamp(now: Date): { date: string; time: string } {
  const iso = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  return { date: iso.slice(0, 8), time: iso };
}

export type SignedUrlInput = {
  bucket: string;
  object: string;
  key: ServiceAccountKey;
  expiresSeconds: number;
  now: Date;
  method?: 'GET';
};

export type SignedUrl = { url: string; expiresAt: string; stringToSign: string };

/**
 * A V4 signed URL (https://cloud.google.com/storage/docs/access-control/signing-urls-manually):
 * the canonical request over the object path, the five X-Goog query parameters and the host
 * header with an unsigned payload, hashed into the string to sign, signed RSA-SHA256 with the
 * service account's key and appended hex as X-Goog-Signature.
 */
export function signStorageUrl(input: SignedUrlInput): SignedUrl {
  const method = input.method ?? 'GET';
  const { date, time } = stamp(input.now);
  const scope = `${date}/auto/storage/goog4_request`;
  const params: [string, string][] = [
    ['X-Goog-Algorithm', 'GOOG4-RSA-SHA256'],
    ['X-Goog-Credential', `${input.key.client_email}/${scope}`],
    ['X-Goog-Date', time],
    ['X-Goog-Expires', String(input.expiresSeconds)],
    ['X-Goog-SignedHeaders', 'host'],
  ];
  params.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const query = params.map(([k, v]) => `${rfc3986(k)}=${rfc3986(v)}`).join('&');
  const uri = `/${input.bucket}/${encodeObjectPath(input.object)}`;
  const canonical = [
    method,
    uri,
    query,
    `host:${STORAGE_HOST}`,
    '',
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'GOOG4-RSA-SHA256',
    time,
    scope,
    createHash('sha256').update(canonical).digest('hex'),
  ].join('\n');
  const signature = rsaSign(
    'RSA-SHA256',
    Buffer.from(stringToSign),
    input.key.private_key,
  ).toString('hex');
  return {
    url: `https://${STORAGE_HOST}${uri}?${query}&X-Goog-Signature=${signature}`,
    expiresAt: new Date(input.now.getTime() + input.expiresSeconds * 1000).toISOString(),
    stringToSign,
  };
}

function base64url(bytes: Uint8Array | string): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/** A signed JWT assertion for the service account (RS256), one hour. */
export function serviceAccountAssertion(key: ServiceAccountKey, scope: string, now: Date): string {
  const iat = Math.floor(now.getTime() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: key.client_email,
      scope,
      aud: key.token_uri ?? DEFAULT_TOKEN_URI,
      iat,
      exp: iat + 3600,
    }),
  );
  const signature = base64url(
    rsaSign('RSA-SHA256', Buffer.from(`${header}.${claims}`), key.private_key),
  );
  return `${header}.${claims}.${signature}`;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** An access token for the bucket through the JWT bearer grant. */
export async function serviceAccountToken(
  key: ServiceAccountKey,
  fetchImpl: FetchLike,
  now: Date = new Date(),
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: serviceAccountAssertion(key, STORAGE_SCOPE, now),
  });
  const response = await fetchImpl(key.token_uri ?? DEFAULT_TOKEN_URI, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!response.ok) throw new Error(`gcs: token request answered ${response.status}`);
  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('gcs: token response carries no access_token');
  return data.access_token;
}

export type CloudStorageHostOptions = {
  bucket: string;
  /** Object name prefix; default turboslide. */
  prefix?: string;
  key?: ServiceAccountKey;
  ttlSeconds?: number;
  /** Upload the objects (a live run); false plans URLs only. */
  upload: boolean;
  fetch?: FetchLike;
  now?: () => Date;
};

export function createCloudStorageHost(options: CloudStorageHostOptions): ImageHost {
  const prefix = (options.prefix ?? 'turboslide').replace(/^\/+|\/+$/g, '');
  const ttl = options.ttlSeconds ?? 900;
  const fetchImpl: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));
  const now = options.now ?? (() => new Date());
  let token: Promise<string> | undefined;
  const accessToken = (): Promise<string> => {
    const key = options.key;
    if (!key) throw new Error('gcs: an upload needs a service account key');
    token ??= serviceAccountToken(key, fetchImpl, now());
    return token;
  };
  return {
    kind: 'gcs',
    describe: () =>
      `Cloud Storage host: gs://${options.bucket}/${prefix}/<sha256>, V4 signed URLs with a ${ttl} s TTL${
        options.key ? '' : ' (no key: unsigned URLs planned)'
      }${options.upload ? '' : ' (planned, nothing uploaded)'}`,
    async host(_file, bytes, mime) {
      const sha = sha256Hex(bytes);
      const object = `${prefix}/${sha}.${extensionOf(mime)}`;
      if (options.upload) {
        const bearer = await accessToken();
        const meta = await fetchImpl(
          `https://${STORAGE_HOST}/storage/v1/b/${rfc3986(options.bucket)}/o/${rfc3986(object)}`,
          { headers: { authorization: `Bearer ${bearer}` } },
        );
        if (meta.status === 404) {
          const put = await fetchImpl(
            `https://${STORAGE_HOST}/upload/storage/v1/b/${rfc3986(options.bucket)}/o?uploadType=media&name=${rfc3986(object)}`,
            {
              method: 'POST',
              headers: { authorization: `Bearer ${bearer}`, 'content-type': mime },
              body: Buffer.from(bytes),
            },
          );
          if (!put.ok) throw new Error(`gcs: upload of ${object} answered ${put.status}`);
        } else if (!meta.ok) {
          throw new Error(`gcs: metadata of ${object} answered ${meta.status}`);
        }
      }
      if (!options.key) {
        return {
          token: sha,
          url: `https://${STORAGE_HOST}/${options.bucket}/${encodeObjectPath(object)}`,
          bytes: bytes.byteLength,
          sha256: sha,
          mime,
          staged: options.upload,
          signed: false,
        };
      }
      const signed = signStorageUrl({
        bucket: options.bucket,
        object,
        key: options.key,
        expiresSeconds: ttl,
        now: now(),
      });
      return {
        token: sha,
        url: signed.url,
        bytes: bytes.byteLength,
        sha256: sha,
        mime,
        staged: options.upload,
        expiresAt: signed.expiresAt,
        signed: true,
      };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Cover crops

/** The source rectangle, in natural pixels, that `object-fit: cover` shows of an image in a box. */
export function coverCropRect(
  naturalWidth: number,
  naturalHeight: number,
  box: Box,
  objectPosition: string,
): [number, number, number, number] {
  const [, , bw, bh] = box;
  const scale = Math.max(bw / naturalWidth, bh / naturalHeight);
  const w = Math.min(naturalWidth, Math.round(bw / scale));
  const h = Math.min(naturalHeight, Math.round(bh / scale));
  const parts = objectPosition.trim().split(/\s+/);
  const pct = (v: string | undefined, fallback: number): number => {
    if (!v) return fallback;
    const m = /^([\d.]+)%$/.exec(v);
    return m ? Number(m[1]) / 100 : fallback;
  };
  const px = pct(parts[0], 0.5);
  const py = pct(parts[1], 0.5);
  return [Math.round((naturalWidth - w) * px), Math.round((naturalHeight - h) * py), w, h];
}

/** True when the picture's aspect is the box's within half a percent, so no crop is needed. */
export function sameAspect(naturalWidth: number, naturalHeight: number, box: Box): boolean {
  const [, , bw, bh] = box;
  if (naturalWidth <= 0 || naturalHeight <= 0 || bw <= 0 || bh <= 0) return false;
  return Math.abs(naturalWidth / naturalHeight - bw / bh) / (bw / bh) < 0.005;
}

/** Writes the cover crop of a picture as a PNG beside the work files; returns the path. */
export async function writeCoverCrop(
  file: string,
  crop: NonNullable<ImageUse['crop']>,
  outDir: string,
): Promise<string> {
  const image = await decodeImage(file);
  const [sx, sy, w, h] = coverCropRect(image.width, image.height, crop.box, crop.objectPosition);
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    const src = ((sy + y) * image.width + sx) * 4;
    data.set(image.data.subarray(src, src + w * 4), y * w * 4);
  }
  await mkdir(outDir, { recursive: true });
  const out = join(outDir, `${basename(file, extname(file))}-cover-${w}x${h}.png`);
  await writeFile(out, await encodePngRgba({ width: w, height: h, data }));
  return out;
}

// ---------------------------------------------------------------------------------------------
// Collecting and hosting a presentation's images

export type ImageWant = { file: string; use: ImageUse };

/** Every file the request builder will ask a URL for, in the order it asks. */
export function collectImageWants(
  scenes: readonly Scene[],
  mode: 'native' | 'flatten',
  wordmarkFile: string | undefined,
): ImageWant[] {
  const wants: ImageWant[] = [];
  for (const scene of scenes) {
    if (mode === 'flatten') {
      if (scene.sheetImage)
        wants.push({
          file: scene.sheetImage,
          use: { slideId: scene.slideId, blockId: 'sheet', kind: 'sheet', role: 'sheet' },
        });
      continue;
    }
    if (scene.picture && !scene.pictureExcluded && scene.pictureFile)
      wants.push({
        file: scene.pictureFile,
        use: {
          slideId: scene.slideId,
          blockId: scene.picture.assetId ?? 'picture',
          kind: 'picture',
          role: 'picture',
          crop: {
            box: scene.picture.box,
            naturalWidth: scene.picture.naturalWidth,
            naturalHeight: scene.picture.naturalHeight,
            objectPosition: scene.picture.objectPosition,
          },
        },
      });
    if (scene.wordmark && wordmarkFile)
      wants.push({
        file: wordmarkFile,
        use: { slideId: scene.slideId, blockId: 'wordmark', kind: 'mark', role: 'wordmark' },
      });
    for (const raster of scene.rasters) {
      if (raster.blockId === 'wordmark' || !raster.file) continue;
      wants.push({
        file: raster.file,
        use: { slideId: scene.slideId, blockId: raster.blockId, kind: raster.kind, role: 'raster' },
      });
    }
  }
  return wants;
}

export type HostImagesOptions = {
  host: ImageHost;
  /** Where derived files (cover crops) land. */
  workDir: string;
  log?: (line: string) => void;
};

export type HostedSet = {
  manifest: ImageManifest;
  /** The resolver the request builder takes. */
  resolveUrl: UrlResolver;
};

/**
 * Hosts every wanted file once (by content), crops pictures that cover-crop in the browser, and
 * returns the manifest and a synchronous resolver keyed by the original file path.
 */
export async function hostImages(
  wants: readonly ImageWant[],
  options: HostImagesOptions,
): Promise<HostedSet> {
  const byFile = new Map<string, ImageManifestEntry>();
  const byHash = new Map<string, ImageManifestEntry>();
  const missing: ImageManifest['missing'] = [];
  const cropDir = join(options.workDir, 'crops');
  for (const want of wants) {
    const known = byFile.get(want.file);
    if (known) {
      known.uses.push({
        slideId: want.use.slideId,
        blockId: want.use.blockId,
        kind: want.use.kind,
        role: want.use.role,
      });
      continue;
    }
    if (!existsSync(want.file)) {
      missing.push({
        file: want.file,
        slideId: want.use.slideId,
        blockId: want.use.blockId,
        role: want.use.role,
      });
      continue;
    }
    let file = want.file;
    let source: string | undefined;
    const crop = want.use.crop;
    if (crop && !sameAspect(crop.naturalWidth, crop.naturalHeight, crop.box)) {
      // a 2x regenerated twin covers the sheet exactly; a photograph with another aspect is cropped
      const info = await stat(want.file);
      const image = await decodeImage(want.file);
      if (!sameAspect(image.width, image.height, crop.box)) {
        source = want.file;
        file = await writeCoverCrop(want.file, crop, cropDir);
        options.log?.(`images: cropped ${basename(want.file)} (${info.size} B) to the cover box`);
      }
    }
    const bytes = await readFile(file);
    const mime = mimeOf(file);
    const sha = sha256Hex(bytes);
    const same = byHash.get(sha);
    if (same) {
      same.uses.push({
        slideId: want.use.slideId,
        blockId: want.use.blockId,
        kind: want.use.kind,
        role: want.use.role,
      });
      byFile.set(want.file, same);
      continue;
    }
    const hosted = await options.host.host(file, bytes, mime);
    const entry: ImageManifestEntry = {
      token: hosted.token,
      url: hosted.url,
      file,
      bytes: hosted.bytes,
      sha256: hosted.sha256,
      mime,
      staged: hosted.staged,
      uses: [
        {
          slideId: want.use.slideId,
          blockId: want.use.blockId,
          kind: want.use.kind,
          role: want.use.role,
        },
      ],
    };
    if (source) entry.source = source;
    if (hosted.expiresAt) entry.expiresAt = hosted.expiresAt;
    if (hosted.signed !== undefined) entry.signed = hosted.signed;
    byFile.set(want.file, entry);
    byHash.set(sha, entry);
  }
  const images = [...byHash.values()];
  const manifest: ImageManifest = {
    host: options.host.describe(),
    kind: options.host.kind,
    staged: images.every((i) => i.staged) && images.length > 0,
    images,
    missing,
    maxUrlBytes: images.reduce((m, i) => Math.max(m, Buffer.byteLength(i.url)), 0),
  };
  return {
    manifest,
    resolveUrl: (file) => byFile.get(file)?.url,
  };
}

/** The manifest with signed URLs redacted, for logs and reports (SPEC 11: never logged). */
export function redactManifest(manifest: ImageManifest): ImageManifest {
  return {
    ...manifest,
    images: manifest.images.map((image) =>
      image.signed
        ? {
            ...image,
            url: image.url.replace(/X-Goog-Signature=[0-9a-f]+/, 'X-Goog-Signature=<redacted>'),
          }
        : image,
    ),
  };
}
