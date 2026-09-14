// Asset intake (SPEC 7.1 asset.add; MILESTONES M5 item 1 "photograph intake with license,
// share-alike flag"): a file, a pasted data URL or a fetched URL becomes an asset under the
// deck's assets/. A continuous asset keeps its bytes as one neutral twin; a two-tone asset goes
// through the photograph pipeline of OPENERS.md (the source scaled to 1800 px on its long side as
// the rounds did, the crop in those pixels, the tone steps, the 8 by 8 screen) into a light and
// a dark 1-bit PNG, with the scaled source kept as assets/<id>.source.<ext> so the inspector's
// Dither section and `asset dither` can re-tone it, and the plate metrics recorded. The license
// fields (title, artist, license, share-alike, source URL) become the photo provenance record,
// and the credit line the plate needs is composed the way the deck writes it ("Photograph: Hans
// Hillewaert, CC BY-SA 4.0"). The store write is the caller's.
import { createHash } from 'node:crypto';

import sharp from 'sharp';

import { decodeImage } from '@turboslide/effects/io';
import type { TwoToneMetrics } from '@turboslide/effects/metrics';
import { twoTone } from '@turboslide/effects/two-tone';
import type { Asset, AssetRole, AssetSource } from '@turboslide/schema/assets';

import {
  MAX_INPUT_BYTES,
  assetIdFrom,
  extFor,
  fullTreatment,
  imageInfo,
  inlineRuleFor,
  plateBoxFor,
  readInput,
  slugify,
  treatmentParams,
  twinPaths,
  writeUnder,
} from './shared.ts';
import type { PlateSide, ReadInput, TwoToneRequestParams } from './shared.ts';

/** OPENERS.md, "Photograph pipeline": sources are scaled to 1800 pixels on the long side first. */
export const SOURCE_LONG_SIDE = 1800;

export type AssetIntakeRequest = {
  id?: string;
  file?: string;
  url?: string;
  /** Hosted: the key of a presigned client upload (gslides-parity SPEC-3 0.29, 8.5). */
  upload?: string;
  role: AssetRole;
  alt: string;
  source?: AssetSource;
  title?: string;
  artist?: string;
  license?: string;
  shareAlike?: boolean;
  sourceUrl?: string;
  credit?: string;
  twoTone?: boolean;
  treatment?: TwoToneRequestParams;
  plate?: PlateSide;
};

/** What `putAsset` answers (packages/store `AssetPut`): where the file landed. */
export type AssetPutLike = { relative: string; existed: boolean };

export type AssetIntakeOptions = {
  deckDir: string;
  cwd?: string;
  allowHosts?: ReadonlyArray<string>;
  fetchImpl?: typeof fetch;
  /** File paths as inputs; the process policy when absent (SPEC-3 8.6). */
  allowPaths?: boolean;
  /** The hosted rules: the loopback names out of the allowlist, svg refused, the re-encode (SPEC-3 8.5). */
  hosted?: boolean;
  /**
   * The store's asset write (gslides-parity SPEC-3 8.5, 0.39; report 10 F49): every file the
   * intake produces goes through it before the record commits, so a hosted instance's twin
   * reaches the store and not the instance alone. Without it the bytes land under `deckDir`
   * (a checkout's CLI).
   */
  putAsset?: (relative: string, bytes: Uint8Array) => Promise<AssetPutLike>;
  /** Reads a presigned upload by key (the studio's upload.ts `readUpload`); required for `upload`. */
  readUpload?: (key: string) => Promise<Uint8Array | null>;
  /** The byte cap of the caller's tier (SPEC-3 8.5: 25 MB anonymous, 50 MB signed in). */
  maxBytes?: number;
  /**
   * Re-encode a continuous asset through sharp so no attacker byte survives (SPEC-3 8.5, 0.29):
   * the hosted default; a checkout keeps the bytes as they came so the GT import is byte stable.
   */
  reencode?: boolean;
  /** Names the twins by their content digest (`assets/<id>.<sha8>.<ext>`), so nothing is ever overwritten hosted. */
  digestNames?: boolean;
};

export type AssetIntakeResult = {
  asset: Asset;
  /** Files written, relative to the deck directory. */
  files: string[];
  metrics?: TwoToneMetrics;
  warnings: string[];
};

const SHARE_ALIKE = /\bBY-SA\b|share[- ]?alike/i;

/** The word the deck's credits open with, by what the picture is (OPENERS.md, the mood credits). */
export function creditWord(role: AssetRole, title?: string): string {
  const t = (title ?? '').toLowerCase();
  if (/\bmap\b|\bchart\b/.test(t)) return 'Map';
  if (/\bprint\b|woodblock/.test(t)) return 'Print';
  if (/engraving/.test(t)) return 'Engraving';
  if (/calligraph/.test(t)) return 'Calligraphy';
  if (/photograph|\bphoto\b/.test(t)) return 'Photograph';
  return role === 'mood' ? 'Photograph' : 'Image';
}

/** The provenance record from the license fields, or `file` when none is given. */
export function sourceFromFields(request: AssetIntakeRequest, origin: string): AssetSource {
  if (request.source !== undefined) return request.source;
  const hasFields =
    request.title !== undefined ||
    request.artist !== undefined ||
    request.license !== undefined ||
    request.shareAlike !== undefined ||
    request.sourceUrl !== undefined;
  if (!hasFields) return { kind: 'file' };
  const license = request.license ?? 'unknown';
  return {
    kind: 'photo',
    origin: request.sourceUrl ?? origin,
    ...(request.title !== undefined ? { title: request.title } : {}),
    ...(request.artist !== undefined ? { artist: request.artist } : {}),
    license,
    shareAlike: request.shareAlike ?? SHARE_ALIKE.test(license),
  };
}

/** `Photograph: <artist>, <license>` unless the request names the credit. */
export function creditFor(request: AssetIntakeRequest, source: AssetSource): string | undefined {
  if (request.credit !== undefined) return request.credit;
  if (source.kind !== 'photo') return undefined;
  const who = source.artist ?? source.origin;
  return `${creditWord(request.role, source.title ?? request.title)}: ${who}, ${source.license}`;
}

/** The source scaled to 1800 px on its long side (never enlarged), as the rounds worked. */
export async function scaleSource(
  bytes: Uint8Array,
  info: { width: number; height: number; format: string },
): Promise<{ bytes: Uint8Array; width: number; height: number; ext: string }> {
  const long = Math.max(info.width, info.height);
  const lossless = info.format === 'png' || info.format === 'gif' || info.format === 'svg';
  let pipeline = sharp(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  if (long > SOURCE_LONG_SIDE) {
    pipeline = pipeline.resize({
      width: info.width >= info.height ? SOURCE_LONG_SIDE : undefined,
      height: info.height > info.width ? SOURCE_LONG_SIDE : undefined,
      kernel: 'lanczos3',
      withoutEnlargement: true,
    });
  }
  const out = lossless
    ? await pipeline.png().toBuffer({ resolveWithObject: true })
    : await pipeline
        .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
        .toBuffer({ resolveWithObject: true });
  return {
    bytes: new Uint8Array(out.data.buffer, out.data.byteOffset, out.data.byteLength),
    width: out.info.width,
    height: out.info.height,
    ext: lossless ? '.png' : '.jpg',
  };
}

/** The first eight hex characters of the sha256 of the bytes, the digest a hosted file name carries. */
export function assetDigest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 8);
}

/**
 * A continuous asset re-encoded in its own format at the twin size (SPEC-3 8.5, 0.29): sharp
 * decodes with the pixel budget and writes fresh bytes, so no byte of the input survives into the
 * store; an animated GIF is flattened to its first frame; svg never reaches here (refused hosted).
 */
export async function reencodeContinuous(
  bytes: Uint8Array,
  info: { format: string },
): Promise<{ bytes: Uint8Array; ext: string }> {
  const pipeline = sharp(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), {
    limitInputPixels: 64_000_000,
    failOn: 'error',
    animated: false,
  });
  let out: Buffer;
  let ext: string;
  switch (info.format) {
    case 'jpeg':
    case 'jpg':
      out = await pipeline.jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer();
      ext = '.jpg';
      break;
    case 'webp':
      out = await pipeline.webp({ quality: 92 }).toBuffer();
      ext = '.webp';
      break;
    default:
      // png, gif (flattened): a lossless png
      out = await pipeline.png().toBuffer();
      ext = '.png';
  }
  return { bytes: new Uint8Array(out.buffer, out.byteOffset, out.byteLength), ext };
}

/** Writes through the store when the caller gave one, else under the deck directory. */
async function place(
  options: AssetIntakeOptions,
  relative: string,
  bytes: Uint8Array,
): Promise<string> {
  if (options.putAsset !== undefined) {
    const put = await options.putAsset(relative, bytes);
    return put.relative;
  }
  return writeUnder(options.deckDir, relative, bytes);
}

/** Adds one asset: reads the input, writes the twins (and the source) under assets/, builds the record. */
export async function addAsset(
  request: AssetIntakeRequest,
  options: AssetIntakeOptions,
): Promise<AssetIntakeResult> {
  const input = request.file ?? request.url ?? request.upload;
  if (input === undefined) throw new TypeError('asset.add wants a file, a url or an upload');
  const maxBytes = options.maxBytes ?? MAX_INPUT_BYTES;
  let read: ReadInput;
  if (request.upload !== undefined && request.file === undefined && request.url === undefined) {
    if (options.readUpload === undefined)
      throw new TypeError('asset.add: uploads are not accepted on this transport');
    const bytes = await options.readUpload(request.upload);
    if (bytes === null) throw new RangeError('asset.add: the upload is not there; upload it again');
    if (bytes.byteLength > maxBytes) throw new RangeError('the upload exceeds the size cap');
    read = { bytes, name: 'upload.bin', origin: 'uploaded picture', kind: 'data' };
  } else {
    read = await readInput(input, {
      ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
      ...(options.allowHosts !== undefined ? { allowHosts: options.allowHosts } : {}),
      ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
      ...(options.allowPaths !== undefined ? { allowPaths: options.allowPaths } : {}),
      ...(options.hosted !== undefined ? { hosted: options.hosted } : {}),
      maxBytes,
    });
  }
  const info = await imageInfo(read.bytes, {
    ...(options.hosted !== undefined ? { hosted: options.hosted } : {}),
  });
  const id =
    request.id !== undefined
      ? slugify(request.id)
      : assetIdFrom(read.kind === 'data' || request.upload !== undefined ? request.role : input);
  const source = sourceFromFields(request, read.origin);
  const credit = creditFor(request, source);
  const warnings: string[] = [];
  if (source.kind === 'photo' && source.license === 'unknown')
    warnings.push(
      `${id}: no license given; asset/license-missing will name it until one is recorded`,
    );
  const files: string[] = [];

  const digest = options.digestNames === true;
  if (request.twoTone === true) {
    const scaled = await scaleSource(read.bytes, info);
    const sourceFile = await place(
      options,
      digest
        ? `assets/${id}.source.${assetDigest(scaled.bytes)}${scaled.ext}`
        : `assets/${id}.source${scaled.ext}`,
      scaled.bytes,
    );
    files.push(sourceFile);
    const treatment = fullTreatment(request.treatment ?? {}, scaled);
    const plate =
      request.plate ??
      (request.role === 'mood'
        ? 'lower-right'
        : request.role === 'opener'
          ? 'lower-left'
          : undefined);
    const rgba = await decodeImage(scaled.bytes);
    const result = twoTone(rgba, treatmentParams(treatment), {
      ...(plate !== undefined ? { plate: plateBoxFor(plate) } : {}),
    });
    const paths = digest
      ? {
          light: `assets/${id}.${assetDigest(result.light.png)}-light.png`,
          dark: `assets/${id}.${assetDigest(result.dark.png)}-dark.png`,
        }
      : twinPaths(id);
    files.push(await place(options, paths.light, result.light.png));
    files.push(await place(options, paths.dark, result.dark.png));
    warnings.push(...result.metrics.warnings.map((line) => `${id}: ${line}`));
    const asset: Asset = {
      id,
      role: request.role,
      alt: request.alt,
      twins: paths,
      size: [result.dark.bits.width, result.dark.bits.height],
      scale: 1,
      source,
      treatment,
      sourceFile,
      ...(credit !== undefined ? { credit } : {}),
      inline: inlineRuleFor(request.role, true),
      metrics: {
        litFraction: result.metrics.litFraction,
        ...(result.metrics.plateClear !== undefined
          ? { plateClear: result.metrics.plateClear }
          : {}),
      },
    };
    return { asset, files, metrics: result.metrics, warnings };
  }

  // the continuous asset: re-encoded hosted so no byte of the input survives (SPEC-3 8.5)
  const stored =
    (options.reencode ?? options.hosted ?? false) && info.format !== 'svg'
      ? await reencodeContinuous(read.bytes, info)
      : { bytes: read.bytes, ext: extFor(info.format) };
  const path = await place(
    options,
    digest ? `assets/${id}.${assetDigest(stored.bytes)}${stored.ext}` : `assets/${id}${stored.ext}`,
    stored.bytes,
  );
  files.push(path);
  const asset: Asset = {
    id,
    role: request.role,
    alt: request.alt,
    twins: { neutral: path },
    size: [info.width, info.height],
    scale: 1,
    source,
    ...(request.role === 'opener' || request.role === 'mood'
      ? { treatment: { kind: 'continuous' as const, quality: 92 as const } }
      : {}),
    ...(credit !== undefined ? { credit } : {}),
    inline: inlineRuleFor(request.role, false),
  };
  return { asset, files, warnings };
}
