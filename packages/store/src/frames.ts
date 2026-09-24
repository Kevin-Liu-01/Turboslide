// The frame assets of the shader library (docs/FEATURES.md 5.5, the storage rule; judge-design
// addition 6). A shader block's resting still is an asset named by its frame key
// (`frame-<the first 16 hex of the key>`), so a repeated recipe reuses the asset and two clients
// capturing one key resolve to one record. A superseded frame of the same block is removed by
// the `shader.frame` write itself (`supersededFrameOf`); an orphan, a material asset no block, no
// slide picture and no kit names (the frame of a deleted block, the frames a kit colour change re
// keyed across a deck), is removed by `pruneFrameAssets`, modelled on `pruneThumbs`
// (blob-store.ts) and on the snapshot prune's grace (snapshots.ts SNAPSHOT_GRACE_MS): one listing
// of the deck's `assets/` files, every unreferenced frame older than the grace removed from the
// store and from `deck.assets` in one write, run by the `shader.frame` handler behind the
// response (`waitUntil`, the thumbnail route's pattern). The listing is the caller's (a Blob
// prefix list on the hosted tiers, `readdir` on a checkout), so this module stays a pure rule
// over a store and a list. Cmd+Z past a removed frame restores the recipe; the frame is stale by
// key and re captured 800 ms later (packages/viewer shader-frame.ts).
import type { Asset } from '@turboslide/schema/assets';
import { blockAssetRefs } from '@turboslide/schema/catalog';
import type { DeckDocument } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';
import type { Mutation } from '@turboslide/schema/mutations';

import type { DeckStore } from './store.ts';

/**
 * How long an unreferenced frame is left alone before the prune removes it: another client puts
 * its file before its `shader.frame` write commits, and a write in flight may name it. The same
 * five minutes as the snapshot prune (snapshots.ts).
 */
export const FRAME_GRACE_MS = 5 * 60_000;

/** How many times the prune's write follows the head when another write lands between the read and the write. */
export const FRAME_PRUNE_RETRIES = 3;

/** One stored asset file, as the caller's listing names it: the path under the deck and its upload time when known. */
export type FrameFileEntry = { relative: string; uploadedAt?: string };

/** The `frame-<16 hex>` shape every `shader.frame` write names (recipe-key.ts frameAssetId). */
export function isFrameAssetId(id: string): boolean {
  return /^frame-[0-9a-f]{16}$/.test(id);
}

/** The relative paths an asset's record names under `assets/`: the twins, the source and the variants. */
export function assetFiles(asset: Asset): string[] {
  const out: string[] = [];
  const twins = asset.twins;
  if ('neutral' in twins) out.push(twins.neutral);
  else out.push(twins.light, twins.dark);
  if (asset.sourceFile !== undefined) out.push(asset.sourceFile);
  for (const variant of Object.values(asset.variants ?? {})) {
    if ('neutral' in variant.twins) out.push(variant.twins.neutral);
    else out.push(variant.twins.light, variant.twins.dark);
  }
  return out;
}

/**
 * Every asset id the document names: each block's asset paths on every slide (the material
 * block's frame, a picture over a material frame, the covering picture Change background
 * places), the picture of an opener or a mood slide, and the brand kit's logo slots.
 */
export function referencedAssetIds(document: DeckDocument): Set<string> {
  const ids = new Set<string>();
  for (const slide of Object.values(document.slides)) {
    for (const { block } of slideBlocks(slide)) {
      for (const ref of blockAssetRefs(block)) if (ref.assetId !== '') ids.add(ref.assetId);
    }
    if ('picture' in slide && typeof slide.picture?.asset === 'string')
      ids.add(slide.picture.asset);
  }
  const kit = document.deck.brand;
  if (kit?.mark?.assetId !== undefined) ids.add(kit.mark.assetId);
  if (kit?.footer?.assetId !== undefined) ids.add(kit.footer.assetId);
  return ids;
}

/** True for an asset a `shader.frame` or a `material.capture` made: a material source (any role). */
export function isMaterialFrameAsset(asset: Asset): boolean {
  return asset.source.kind === 'material';
}

/**
 * The block's previous frame to remove in the same write as its new one (5.5): the asset the
 * block named before, when it is a material frame, differs from the new id and nothing else in
 * the document names it. `null` when the block keeps its asset or another reference holds it.
 */
export function supersededFrameOf(
  document: DeckDocument,
  slideId: string,
  blockId: string,
  nextAssetId: string,
): string | null {
  const slide = document.slides[slideId];
  if (slide === undefined) return null;
  const block = slideBlocks(slide).find((row) => row.block.id === blockId)?.block;
  if (block === undefined || block.type !== 'material') return null;
  const previous = block.asset;
  if (previous === undefined || previous === nextAssetId) return null;
  const asset = document.deck.assets[previous];
  if (asset === undefined || !isMaterialFrameAsset(asset)) return null;
  // the count of references: the block's own reference is the one that goes away
  let others = 0;
  for (const other of Object.values(document.slides)) {
    for (const { block: candidate } of slideBlocks(other)) {
      if (other.id === slideId && candidate.id === blockId) continue;
      if (blockAssetRefs(candidate).some((ref) => ref.assetId === previous)) others += 1;
    }
    if ('picture' in other && other.picture?.asset === previous) others += 1;
  }
  const kit = document.deck.brand;
  if (kit?.mark?.assetId === previous || kit?.footer?.assetId === previous) others += 1;
  return others === 0 ? previous : null;
}

export type OrphanFrame = { assetId: string; files: string[] };

/**
 * The material assets no reference holds whose files are all older than the grace (an asset with
 * no listed file is dangling and goes too). `now` and the entries' `uploadedAt` are compared as
 * epoch milliseconds; an entry without an upload time counts as old, the way the snapshot prune
 * reads one.
 */
export function orphanFrameAssets(
  document: DeckDocument,
  entries: ReadonlyArray<FrameFileEntry>,
  now: number = Date.now(),
  graceMs: number = FRAME_GRACE_MS,
): OrphanFrame[] {
  const referenced = referencedAssetIds(document);
  const uploadedAt = new Map(entries.map((entry) => [entry.relative, entry.uploadedAt]));
  const out: OrphanFrame[] = [];
  for (const asset of Object.values(document.deck.assets)) {
    if (!isMaterialFrameAsset(asset) || referenced.has(asset.id)) continue;
    const files = assetFiles(asset);
    const young = files.some((relative) => {
      if (!uploadedAt.has(relative)) return false;
      const at = uploadedAt.get(relative);
      if (at === undefined) return false;
      const ms = Date.parse(at);
      return Number.isFinite(ms) && now - ms < graceMs;
    });
    if (young) continue;
    out.push({ assetId: asset.id, files: files.filter((relative) => uploadedAt.has(relative)) });
  }
  return out;
}

export type PruneFramesDeps = {
  store: DeckStore;
  /** The deck's stored files under `assets/` (a Blob prefix list, a `readdir`), with upload times when known. */
  list: () => Promise<ReadonlyArray<FrameFileEntry>>;
  author?: { kind: 'human' | 'agent'; name: string };
  now?: () => number;
  graceMs?: number;
  log?: (line: string) => void;
};

export type PruneFramesResult = {
  /** The asset ids removed from `deck.assets`. */
  removed: string[];
  /** The files removed from the store. */
  files: string[];
  /** The revision the removal write made; the head when nothing was removed. */
  revision: number;
};

/**
 * Removes every orphan frame from the document (one `asset.remove` per orphan in one write, made
 * against the head and made again when another write lands in between, a bounded number of
 * times) and then its files from the store. Never throws into the caller's response path: a
 * conflict that outlasts the retries leaves the orphans for the next prune.
 */
export async function pruneFrameAssets(deps: PruneFramesDeps): Promise<PruneFramesResult> {
  const now = deps.now ?? (() => Date.now());
  const author = deps.author ?? { kind: 'agent' as const, name: 'shader-frame-prune' };
  const entries = await deps.list();
  for (let attempt = 0; attempt <= FRAME_PRUNE_RETRIES; attempt += 1) {
    const document = (await deps.store.read()).document;
    const orphans = orphanFrameAssets(document, entries, now(), deps.graceMs ?? FRAME_GRACE_MS);
    if (orphans.length === 0) return { removed: [], files: [], revision: document.deck.revision };
    const mutations: Mutation[] = orphans.map((orphan) => ({
      op: 'asset.remove',
      assetId: orphan.assetId,
    }));
    const outcome = await deps.store.write({
      baseRevision: document.deck.revision,
      author,
      mutations,
    });
    if (!outcome.ok) {
      if (outcome.code === 'conflict') continue;
      deps.log?.(`frames: the prune was refused: ${outcome.message}`);
      return { removed: [], files: [], revision: document.deck.revision };
    }
    const files: string[] = [];
    for (const orphan of orphans) {
      for (const relative of orphan.files) {
        try {
          await deps.store.removeAsset(relative);
          files.push(relative);
        } catch (error) {
          deps.log?.(
            `frames: ${relative} was not removed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
    deps.log?.(`frames: pruned ${orphans.length} frame asset(s), ${files.length} file(s)`);
    return { removed: orphans.map((orphan) => orphan.assetId), files, revision: outcome.revision };
  }
  deps.log?.('frames: the prune gave way to other writes; the orphans wait for the next one');
  return { removed: [], files: [], revision: (await deps.store.read()).document.deck.revision };
}
