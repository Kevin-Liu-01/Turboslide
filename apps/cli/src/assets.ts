// Asset data URIs for the standalone build, one per twin path, by the asset's inline rule
// (SPEC 5.2 renderStandalone; Prototemplate/scripts/build-deck.mjs lines 72 to 76): `two-color`
// detects a two-tone picture (98 percent of pixels at the two extremes) and writes it as a 1-bit
// PNG through the pure Node encoder, `native` re-encodes at native size as JPEG quality 88,
// `resample-1280` resizes to 1280 wide at quality 78, `pass-through` inlines the file as is.
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

import sharp from 'sharp';

import { decodeImage } from '@turboslide/effects/io';
import { encodePng1 } from '@turboslide/effects/png1';
import { toGray } from '@turboslide/effects/tone';
import type { Asset } from '@turboslide/schema/assets';
import { vectorOf } from '@turboslide/schema/assets';
import { inlineRuleFor } from '@turboslide/render/standalone';

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
};

function dataUri(mime: string, bytes: Uint8Array): string {
  return `data:${mime};base64,${Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64')}`;
}

export const TWO_COLOR_SHARE = 0.98;

export type TwoColorSplit = {
  /** The two palette entries: the mean color of the dark cluster, then of the light cluster. */
  palette: [[number, number, number], [number, number, number]];
  /** One byte per pixel, 1 where the luminance exceeds 127. */
  bits: Uint8Array;
};

/**
 * build-deck.mjs's two-tone test: at least TWO_COLOR_SHARE of the pixels have a luminance under
 * 48 or at least 208. The two colors are the means of the dark and light clusters, so a warm
 * paper or an inked blue survives and the JPEG's ringing around each cell does not.
 */
export function twoColorSplit(rgba: Uint8Array, gray: Uint8Array): TwoColorSplit | null {
  const n = gray.length;
  let extremes = 0;
  for (const v of gray) if (v < 48 || v >= 208) extremes += 1;
  if (n === 0 || extremes / n < TWO_COLOR_SHARE) return null;
  const sum = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  const bits = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    const cluster = (gray[i] ?? 0) > 127 ? 1 : 0;
    bits[i] = cluster;
    const acc = sum[cluster] as number[];
    acc[0] = (acc[0] ?? 0) + (rgba[i * 4] ?? 0);
    acc[1] = (acc[1] ?? 0) + (rgba[i * 4 + 1] ?? 0);
    acc[2] = (acc[2] ?? 0) + (rgba[i * 4 + 2] ?? 0);
    acc[3] = (acc[3] ?? 0) + 1;
  }
  const mean = (acc: number[]): [number, number, number] => {
    const count = Math.max(1, acc[3] ?? 0);
    return [
      Math.round((acc[0] ?? 0) / count),
      Math.round((acc[1] ?? 0) / count),
      Math.round((acc[2] ?? 0) / count),
    ];
  };
  return { palette: [mean(sum[0] as number[]), mean(sum[1] as number[])], bits };
}

export type InlinedAsset = { path: string; rule: Asset['inline']; bytes: number; uri: string };

/** One data URI for one twin file under the deck directory. */
export async function inlineAssetFile(
  deckDir: string,
  asset: Asset,
  twinPath: string,
): Promise<InlinedAsset> {
  const file = join(deckDir, twinPath);
  const rule = inlineRuleFor(asset);
  const ext = extname(twinPath).toLowerCase();
  const raw = new Uint8Array(await readFile(file));
  let uri: string;
  if (rule === 'pass-through' || ext === '.svg' || ext === '.gif') {
    uri = dataUri(MIME[ext] ?? 'application/octet-stream', raw);
  } else if (rule === 'two-color') {
    const rgba = await decodeImage(raw);
    const gray = toGray(rgba);
    const split = twoColorSplit(rgba.data, gray.data);
    if (split) {
      uri = dataUri(
        'image/png',
        encodePng1(
          { width: gray.width, height: gray.height, bits: split.bits },
          { palette: split.palette },
        ),
      );
    } else {
      const jpeg = await sharp(raw).jpeg({ quality: 88, chromaSubsampling: '4:4:4' }).toBuffer();
      uri = dataUri('image/jpeg', new Uint8Array(jpeg));
    }
  } else if (rule === 'resample-1280') {
    const jpeg = await sharp(raw)
      .resize({ width: 1280, withoutEnlargement: true })
      .jpeg({ quality: 78 })
      .toBuffer();
    uri = dataUri('image/jpeg', new Uint8Array(jpeg));
  } else {
    const jpeg = await sharp(raw).jpeg({ quality: 88, chromaSubsampling: '4:4:4' }).toBuffer();
    uri = dataUri('image/jpeg', new Uint8Array(jpeg));
  }
  return { path: twinPath, rule, bytes: uri.length, uri };
}

/**
 * Every twin of every asset as a data URI, keyed by the twin path renderStandalone looks up, and
 * since the vector round the vector file of an svg asset beside them (docs/VECTOR.md 4.6: the
 * standalone page's `<img src>` is the vector file the resolver writes, inlined as image/svg+xml).
 */
export async function inlineAssets(
  deckDir: string,
  assets: Record<string, Asset>,
): Promise<{
  uris: Record<string, string>;
  inlined: InlinedAsset[];
  failed: { path: string; error: string }[];
}> {
  const uris: Record<string, string> = {};
  const inlined: InlinedAsset[] = [];
  const failed: { path: string; error: string }[] = [];
  for (const asset of Object.values(assets)) {
    const twins =
      'neutral' in asset.twins ? [asset.twins.neutral] : [asset.twins.light, asset.twins.dark];
    const vector = vectorOf(asset);
    const vectors =
      vector === undefined
        ? []
        : 'neutral' in vector
          ? [vector.neutral]
          : [vector.light, vector.dark];
    for (const twin of new Set([...twins, ...vectors])) {
      if (uris[twin]) continue;
      try {
        const item = await inlineAssetFile(deckDir, asset, twin);
        uris[twin] = item.uri;
        inlined.push(item);
      } catch (error) {
        failed.push({ path: twin, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  return { uris, inlined, failed };
}
