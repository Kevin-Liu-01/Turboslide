// The exporter's materialization pass (gslides-parity SPEC-3 10.4; research-3 06 4.6): every
// dithered picture the export shoots reads a variant file, never a live canvas, so before the
// shoot the missing variants are rendered (the stages of @turboslide/effects dither-io.ts), their
// files written under the deck's `assets/` (digest named, an existing file with the same bytes is
// left as it is) and their records added to a copy of the document the render surface reads. The
// deck's own record is not committed here: the store's write is `picture.materialize`
// (packages/materials/src/actions.ts), which the CLI and the studio run around an export; the pass
// makes the export `perfect` on a deck whose owner has not run it yet. The `dither:` residual line
// per picture names the key and the state the page was shot in.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { renderVariant } from '@turboslide/effects/io';
import { ditherKey12, ditheredPictures, variantRecordOf } from '@turboslide/render/dither-key';
import type { DitheredPicture } from '@turboslide/render/dither-key';
import type { Asset } from '@turboslide/schema/assets';
import type { PictureDither } from '@turboslide/schema/blocks/dither';
import type { DeckDocument } from '@turboslide/schema/deck';

export type MaterializeForExportOptions = {
  /** Device pixels per sheet pixel of the files; 2 unless set (the export's raster scale). */
  scale?: 1 | 2;
  /** Only these slides; every slide when absent. */
  slideIds?: readonly string[];
  log?: (line: string) => void;
  now?: () => string;
};

export type MaterializedForExport = {
  /** The document with the variants recorded (a copy; the deck's own record is the store's). */
  document: DeckDocument;
  /** The variant files written by this pass, relative to the deck directory. */
  written: string[];
  /** Every dithered picture of the exported slides with the state the page reads it in. */
  dithers: DitherResidual[];
};

export type DitherResidual = {
  slideId: string;
  blockId: string;
  assetId: string;
  key: string;
  key12: string;
  /** `variant` once the record lists the key (this pass or an earlier materialization), else `live`. */
  state: 'variant' | 'live';
};

/** The residual line of a dithered picture (SPEC-3 10.4): `dither: <slideId>#<blockId> <key12> <state>`. */
export function ditherResidualLine(entry: DitherResidual): string {
  return `dither: ${entry.slideId}#${entry.blockId} ${entry.key12} ${entry.state}`;
}

function sameBytes(path: string, bytes: Uint8Array): boolean {
  const existing = readFileSync(path);
  if (existing.byteLength !== bytes.byteLength) return false;
  for (let i = 0; i < bytes.byteLength; i += 1) if (existing[i] !== bytes[i]) return false;
  return true;
}

/** Writes a variant file under the deck directory unless the same bytes are there; refuses other bytes under the name. */
export function writeVariantFile(deckDir: string, relative: string, bytes: Uint8Array): boolean {
  const path = join(deckDir, ...relative.split('/'));
  if (existsSync(path)) {
    if (sameBytes(path, bytes)) return false;
    throw new Error(
      `${relative} exists with other bytes; variant files are digest named and never overwritten`,
    );
  }
  mkdirSync(dirname(path), { recursive: true });
  const partial = `${path}.${process.pid}.part`;
  writeFileSync(partial, bytes);
  renameSync(partial, path);
  return true;
}

/**
 * Renders and writes every missing variant of the document's dithered pictures and returns the
 * document with the records, so the shoot reads state `variant` on every page.
 */
export async function materializeForExport(
  document: DeckDocument,
  deckDir: string,
  options: MaterializeForExportOptions = {},
): Promise<MaterializedForExport> {
  const scale = options.scale ?? 2;
  const now = options.now ?? (() => new Date().toISOString());
  const targets = ditheredPictures(document, options.slideIds);
  const assets: Record<string, Asset> = { ...document.deck.assets };
  const written: string[] = [];
  const done = new Set<string>();
  for (const target of targets) {
    const asset = assets[target.asset.id] ?? target.asset;
    if (asset.variants?.[target.key] !== undefined) continue;
    const stamp = `${asset.id}:${target.key}`;
    if (done.has(stamp)) continue;
    done.add(stamp);
    const block = target.block;
    const rendered = await renderVariant({
      source: join(deckDir, target.source),
      box: { width: target.box[0], height: target.box[1] },
      dither: target.dither as PictureDither,
      scale,
      ...(block.trim !== undefined ? { trim: block.trim } : {}),
      ...(block.type === 'picture' && block.position !== undefined && block.position !== 'center'
        ? { position: block.position }
        : {}),
      ...(block.adjust !== undefined
        ? {
            adjust: {
              ...(block.adjust.brightness !== undefined
                ? { brightness: block.adjust.brightness }
                : {}),
              ...(block.adjust.contrast !== undefined ? { contrast: block.adjust.contrast } : {}),
            },
          }
        : {}),
      ...(target.plate !== undefined ? { plate: target.plate } : {}),
    });
    const { variant } = variantRecordOf(asset.id, target.key, rendered, now());
    const byTheme = new Map(rendered.files.map((file) => [file.theme, file.bytes] as const));
    const pairs: [string, Uint8Array][] =
      'neutral' in variant.twins
        ? [[variant.twins.neutral, byTheme.get('neutral') ?? new Uint8Array()]]
        : [
            [variant.twins.light, byTheme.get('light') ?? new Uint8Array()],
            [variant.twins.dark, byTheme.get('dark') ?? new Uint8Array()],
          ];
    for (const [relative, bytes] of pairs) {
      if (writeVariantFile(deckDir, relative, bytes)) written.push(relative);
      options.log?.(`export: variant ${relative} (${bytes.byteLength} bytes, ${rendered.ms} ms)`);
    }
    assets[asset.id] = { ...asset, variants: { ...(asset.variants ?? {}), [target.key]: variant } };
  }
  const next: DeckDocument = { ...document, deck: { ...document.deck, assets } };
  const dithers = targets.map((target) => residualOf(target, assets));
  return { document: next, written, dithers };
}

function residualOf(target: DitheredPicture, assets: Record<string, Asset>): DitherResidual {
  const listed = assets[target.asset.id]?.variants?.[target.key] !== undefined;
  return {
    slideId: target.slideId,
    blockId: target.block.id,
    assetId: target.asset.id,
    key: target.key,
    key12: ditherKey12(target.key),
    state: listed ? 'variant' : 'live',
  };
}

/** The dithered pictures of a document as residual entries, without rendering (the state as recorded). */
export function ditherResiduals(
  document: DeckDocument,
  slideIds?: readonly string[],
): DitherResidual[] {
  return ditheredPictures(document, slideIds).map((target) =>
    residualOf(target, document.deck.assets),
  );
}
