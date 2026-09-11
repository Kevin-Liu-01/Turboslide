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
import sharp from 'sharp';

import { decodeImage } from '@turboslide/effects/io';
import type { TwoToneMetrics } from '@turboslide/effects/metrics';
import { twoTone } from '@turboslide/effects/two-tone';
import type { Asset, AssetRole, AssetSource } from '@turboslide/schema/assets';

import {
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
import type { PlateSide, TwoToneRequestParams } from './shared.ts';

/** OPENERS.md, "Photograph pipeline": sources are scaled to 1800 pixels on the long side first. */
export const SOURCE_LONG_SIDE = 1800;

export type AssetIntakeRequest = {
  id?: string;
  file?: string;
  url?: string;
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

export type AssetIntakeOptions = {
  deckDir: string;
  cwd?: string;
  allowHosts?: ReadonlyArray<string>;
  fetchImpl?: typeof fetch;
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

/** Adds one asset: reads the input, writes the twins (and the source) under assets/, builds the record. */
export async function addAsset(
  request: AssetIntakeRequest,
  options: AssetIntakeOptions,
): Promise<AssetIntakeResult> {
  const input = request.file ?? request.url;
  if (input === undefined) throw new TypeError('asset.add wants a file or a url');
  const read = await readInput(input, {
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    ...(options.allowHosts !== undefined ? { allowHosts: options.allowHosts } : {}),
    ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
  });
  const info = await imageInfo(read.bytes);
  const id =
    request.id !== undefined
      ? slugify(request.id)
      : assetIdFrom(read.kind === 'data' ? request.role : input);
  const source = sourceFromFields(request, read.origin);
  const credit = creditFor(request, source);
  const warnings: string[] = [];
  if (source.kind === 'photo' && source.license === 'unknown')
    warnings.push(
      `${id}: no license given; asset/license-missing will name it until one is recorded`,
    );
  const files: string[] = [];

  if (request.twoTone === true) {
    const scaled = await scaleSource(read.bytes, info);
    const sourceFile = await writeUnder(
      options.deckDir,
      `assets/${id}.source${scaled.ext}`,
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
    const paths = twinPaths(id);
    files.push(await writeUnder(options.deckDir, paths.light, result.light.png));
    files.push(await writeUnder(options.deckDir, paths.dark, result.dark.png));
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

  const ext = extFor(info.format);
  const path = await writeUnder(options.deckDir, `assets/${id}${ext}`, read.bytes);
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
