// The asset and material action handlers (SPEC 7.1: one implementation every transport runs):
// asset.add, asset.dither, asset.capture, material.capture and material.list as functions from
// the action's typed input to its output, with the one store write each mutating action ends in
// (`asset.set`, SPEC 4.2 mutations), and registerAssetActions to put them on a dispatcher for
// `turboslide mcp`, the studio's server functions and the HTTP transport. The CLI commands call
// the same functions and print the outputs. Errors follow SPEC 7.1: a stale baseRevision or a
// held lease is ConflictError (409) with the current document, malformed input TypeError,
// an unknown id RangeError. The one exception since the focus round: a plain `asset.add` writes
// its new record against the store's head (`commitAssetsAtHead`), because the record is additive
// and the editor's base lags or leads the store while its own writes are in flight (docs/FOCUS.md
// rank 5); a record the head already holds under that id is still refused as a conflict.
//
// Round three (gslides-parity SPEC-3 10.4, 10.5, 8.5): every file the actions write goes through
// the store's `putAsset` (digest named, never overwritten; a hosted twin reaches the store and not
// the instance alone); `picture.materialize` writes the dither variant files and records;
// `slide.setBackgroundPicture` and `slide.setBackgroundMaterial` place a covering picture object
// at the back of a slide with its dither in one write; `asset.add --replace-source` attaches a
// continuous source to an existing asset so its committed twins can be re-toned.
import { join } from 'node:path';

import { renderVariant } from '@turboslide/effects/io';
import { addAsset, scaleSource } from '@turboslide/headless/capture/intake';
import type { AssetIntakeRequest } from '@turboslide/headless/capture/intake';
import { capturePage } from '@turboslide/headless/capture/page';
import type { PageCaptureRequest } from '@turboslide/headless/capture/page';
import {
  imageInfo,
  readInput,
  slugify,
  type PlateSide,
  type TwoToneRequestParams,
} from '@turboslide/headless/capture/shared';
import { ditherAsset, twoToneAssets } from '@turboslide/headless/capture/twins';
import type { DitherReport } from '@turboslide/headless/capture/twins';
import type { LaunchOptions } from '@turboslide/headless/launch';
import { ditherKey12, variantRecordOf } from '@turboslide/render/dither-key';
import { boxOfDithered, ditheredPictures, plateBoxOf } from '@turboslide/render/dither-walk';
import type { DitheredPicture } from '@turboslide/render/dither-walk';
import type { ActionId } from '@turboslide/schema/actions';
import type { Asset, AssetTreatment, AssetVariant } from '@turboslide/schema/assets';
import { hasContinuousSource } from '@turboslide/schema/assets';
import type { Block, PictureBlock } from '@turboslide/schema/blocks';
import type { PictureDither } from '@turboslide/schema/blocks/dither-values';
import { DITHER_NO_SOURCE_MESSAGE } from '@turboslide/schema/blocks/dither-values';
import type { MaterialCatalogEntry, MaterialUniforms } from '@turboslide/schema/blocks/material';
import { MATERIAL_ANCHORS } from '@turboslide/schema/blocks/material';
import type { Deck, DeckDocument, Slide } from '@turboslide/schema/deck';
import { canvasObjects, isCanvasSlide, slideBlocks } from '@turboslide/schema/deck';
import { ConflictError } from '@turboslide/schema/errors';
import type { Author, Mutation } from '@turboslide/schema/mutations';
import { SHEET_HEIGHT, SHEET_WIDTH } from '@turboslide/schema/render';
import { assetDigest } from '@turboslide/store/file-store';
import type { DeckStore } from '@turboslide/store/store';

import { listMaterials } from './catalog.ts';
import { captureMaterial } from './capture.ts';
import type { MaterialCaptureRequest } from './capture.ts';

/** The dispatcher surface this module registers on (@turboslide/agent createDispatcher), structurally. */
export type ActionContext = { author: Author; deckDir?: string; force?: boolean };
export type ActionHandler = (input: unknown, context: ActionContext) => Promise<unknown> | unknown;
export type Dispatcher = { register: (id: ActionId, handler: ActionHandler) => void };

export type AssetActionDeps = {
  /** The deck's store; `dir` is where assets/ lives. */
  store: DeckStore & { readonly dir: string };
  /** Browser launch options for the capture jobs (backend, executable). */
  launch?: LaunchOptions;
  /** The working directory a relative `file` resolves against (the CLI's cwd). */
  cwd?: string;
  /** Hosts beyond the built-in allowlist (deck.json captureHosts when it exists). */
  allowHosts?: ReadonlyArray<string>;
  /** File paths as inputs (SPEC-3 8.6); the process policy when absent. */
  allowPaths?: boolean;
  /** The hosted intake rules (SPEC-3 8.5); the process policy when absent. */
  hosted?: boolean;
  /** Reads a presigned upload by key (the studio's upload route); `asset.add { upload }` needs it. */
  readUpload?: (key: string) => Promise<Uint8Array | null>;
  /** The byte cap of the caller's tier (SPEC-3 8.5). */
  maxBytes?: number;
  /**
   * Runs another action on the same deck (the studio's and the CLI's dispatcher), for the writes
   * these handlers compose: `slide.toCanvas` before a background picture lands on a slide that is
   * not a canvas yet. Without it that slide is refused with the sentence naming the conversion.
   */
  dispatch?: (id: ActionId, input: unknown, ctx: ActionContext) => Promise<unknown>;
  log?: (line: string) => void;
};

/** The per-call context: the author, and the CLI's --force and --note. */
export type AssetWriteContext = ActionContext & { force?: boolean; note?: string };

type Rev = { baseRevision: number };

export type AssetAddInput = Rev &
  AssetIntakeRequest & {
    /** Attach the file as the continuous source of this asset instead of adding one (SPEC-3 10.1). */
    replaceSource?: string;
  };

export type AssetDitherInput = Rev & {
  assetId?: string;
  treatment?: AssetTreatment;
  params?: TwoToneRequestParams;
  plate?: PlateSide;
  source?: string;
  allTwoTone?: boolean;
  fromRecorded?: boolean;
  verifyCells?: boolean;
};

export type AssetCaptureInput = Rev & PageCaptureRequest;

export type MaterialCaptureInput = Rev & MaterialCaptureRequest;

export type MaterialListInput = { materialId?: string };

/** Writes mutations as one Write and maps a refused outcome to the error classes. */
export async function commitMutations(
  deps: AssetActionDeps,
  ctx: AssetWriteContext,
  baseRevision: number,
  mutations: ReadonlyArray<Mutation>,
): Promise<{ revision: number; document: DeckDocument }> {
  const outcome = await deps.store.write(
    {
      baseRevision,
      author: ctx.author,
      ...(ctx.note !== undefined && ctx.note !== '' ? { note: ctx.note } : {}),
      mutations: [...mutations],
    },
    { ...(ctx.force !== undefined ? { force: ctx.force } : {}) },
  );
  if (!outcome.ok) {
    if (outcome.code === 'conflict') {
      throw new ConflictError(outcome.message, {
        currentRevision: outcome.currentRevision,
        current: outcome.current,
        ...(outcome.holder !== undefined ? { holder: outcome.holder } : {}),
      });
    }
    throw new TypeError(outcome.message);
  }
  for (const line of outcome.warnings) deps.log?.(line);
  return { revision: outcome.revision, document: outcome.document };
}

/** Writes asset.set mutations as one Write and maps a refused outcome to the error classes. */
export async function commitAssets(
  deps: AssetActionDeps,
  ctx: AssetWriteContext,
  baseRevision: number,
  assets: ReadonlyArray<Asset>,
): Promise<{ revision: number; assets: Asset[] }> {
  if (assets.length === 0) return { revision: baseRevision, assets: [] };
  const mutations: Mutation[] = assets.map((asset) => ({ op: 'asset.set', asset }));
  const outcome = await commitMutations(deps, ctx, baseRevision, mutations);
  // the store normalizes, so the committed records are the ones handed back
  const committed = assets.map((asset) => outcome.document.deck.assets[asset.id] ?? asset);
  return { revision: outcome.revision, assets: committed };
}

/** How many times a new asset's write follows the head after another write moved it between the read and the write. */
export const ASSET_HEAD_RETRIES = 3;

/**
 * Writes new asset records against the store's head revision (docs/FOCUS.md rank 5; audit-images
 * rows 6 to 8, 57 and 61). The editor stamps `asset.add` with the revision its page holds, which
 * is one behind the store whenever a write is pending or retained and one ahead while its own
 * write is in flight, and the reducer refuses either as stale, so an upload, a drop, a paste, a
 * Replace image and a background picture failed while the seller was still typing. An asset.set
 * of a record the head does not hold yet is additive: it commutes with every slide write and with
 * every other asset, so the write is made on the head the store reports, and made again on the new
 * head when another write lands in between (a bounded number of times). The caller's base is
 * honoured when it is the head, and a record the head already holds under the same id is refused
 * the way the stale base was, with the head's document in the error, since that is a real
 * conflict and not a race. `asset.add --replace-source` keeps the strict base: it changes a record.
 */
export async function commitAssetsAtHead(
  deps: AssetActionDeps,
  ctx: AssetWriteContext,
  baseRevision: number,
  assets: ReadonlyArray<Asset>,
): Promise<{ revision: number; assets: Asset[] }> {
  if (assets.length === 0) return { revision: baseRevision, assets: [] };
  let lastConflict: ConflictError | undefined;
  for (let attempt = 0; attempt <= ASSET_HEAD_RETRIES; attempt += 1) {
    const current = (await deps.store.read()).document;
    const head = current.deck.revision;
    if (head !== baseRevision) {
      const taken = assets.find((asset) => current.deck.assets[asset.id] !== undefined);
      if (taken !== undefined) {
        throw new ConflictError(
          `asset.add: baseRevision ${baseRevision} is stale; the document is at revision ${head} and already holds an asset "${taken.id}"`,
          { currentRevision: head, current },
        );
      }
    }
    try {
      return await commitAssets(deps, ctx, head, assets);
    } catch (error) {
      // a held lease is a refusal of its own, never retried; a moved head is read again
      if (!(error instanceof ConflictError) || error.holder !== undefined) throw error;
      lastConflict = error;
    }
  }
  throw lastConflict ?? new TypeError('asset.add: the write did not land');
}

/** The intake options every asset write shares: the store's put, the policy and the caps. */
function intakeOptions(deps: AssetActionDeps) {
  return {
    deckDir: deps.store.dir,
    ...(deps.cwd !== undefined ? { cwd: deps.cwd } : {}),
    ...(deps.allowHosts !== undefined ? { allowHosts: deps.allowHosts } : {}),
    ...(deps.allowPaths !== undefined ? { allowPaths: deps.allowPaths } : {}),
    ...(deps.hosted !== undefined ? { hosted: deps.hosted } : {}),
    ...(deps.readUpload !== undefined ? { readUpload: deps.readUpload } : {}),
    ...(deps.maxBytes !== undefined ? { maxBytes: deps.maxBytes } : {}),
    putAsset: (relative: string, bytes: Uint8Array) => deps.store.putAsset(relative, bytes),
  };
}

export async function assetAdd(
  deps: AssetActionDeps,
  ctx: AssetWriteContext,
  input: AssetAddInput,
): Promise<Asset> {
  const { baseRevision, replaceSource, ...request } = input;
  if (replaceSource !== undefined)
    return assetReplaceSource(deps, ctx, baseRevision, replaceSource, request);
  const result = await addAsset(request, intakeOptions(deps));
  for (const line of result.warnings) deps.log?.(line);
  const committed = await commitAssetsAtHead(deps, ctx, baseRevision, [result.asset]);
  return committed.assets[0] ?? result.asset;
}

/**
 * `asset.add --replace-source <id> <file>` (SPEC-3 10.1; research-3 06 6.3): the file becomes the
 * continuous source of an existing asset (`assets/<id>.source.<sha8>.<ext>`, scaled to the 1800 px
 * long side as the two tone intake keeps its sources) and nothing else changes, so the GT deck's
 * sixteen dithered assets can be re-toned in the app. The former source file, when one exists, is
 * removed after the record commits.
 */
export async function assetReplaceSource(
  deps: AssetActionDeps,
  ctx: AssetWriteContext,
  baseRevision: number,
  assetId: string,
  request: Omit<AssetIntakeRequest, 'role' | 'alt'> & { role?: string; alt?: string },
): Promise<Asset> {
  const current = (await deps.store.read()).document;
  const asset = current.deck.assets[assetId];
  if (asset === undefined) throw new RangeError(`No asset "${assetId}"`);
  const input = request.file ?? request.url;
  if (input === undefined) throw new TypeError('asset.add --replace-source wants a file or a url');
  const read = await readInput(input, {
    ...(deps.cwd !== undefined ? { cwd: deps.cwd } : {}),
    ...(deps.allowHosts !== undefined ? { allowHosts: deps.allowHosts } : {}),
    ...(deps.allowPaths !== undefined ? { allowPaths: deps.allowPaths } : {}),
    ...(deps.hosted !== undefined ? { hosted: deps.hosted } : {}),
    ...(deps.maxBytes !== undefined ? { maxBytes: deps.maxBytes } : {}),
  });
  const info = await imageInfo(read.bytes, {
    ...(deps.hosted !== undefined ? { hosted: deps.hosted } : {}),
  });
  const scaled = await scaleSource(read.bytes, info);
  const relative = `assets/${asset.id}.source.${assetDigest(scaled.bytes)}${scaled.ext}`;
  const put = await deps.store.putAsset(relative, scaled.bytes);
  deps.log?.(
    `source: ${put.relative}${put.existed ? ' (existed)' : ''} ${scaled.width} by ${scaled.height}`,
  );
  const previous = asset.sourceFile;
  const next: Asset = { ...asset, sourceFile: put.relative };
  const committed = await commitAssets(deps, ctx, baseRevision, [next]);
  if (previous !== undefined && previous !== put.relative) await deps.store.removeAsset(previous);
  return committed.assets[0] ?? next;
}

export async function assetDither(
  deps: AssetActionDeps,
  ctx: AssetWriteContext,
  input: AssetDitherInput,
): Promise<DitherReport | DitherReport[]> {
  const current = (await deps.store.read()).document;
  let targets: Asset[];
  if (input.allTwoTone === true) targets = twoToneAssets(current.deck.assets);
  else {
    if (input.assetId === undefined)
      throw new TypeError('asset.dither wants an assetId or allTwoTone');
    const asset = current.deck.assets[input.assetId];
    if (asset === undefined) throw new RangeError(`No asset "${input.assetId}"`);
    targets = [asset];
  }
  const treatment = input.treatment?.kind === 'two-tone' ? input.treatment : undefined;
  if (input.treatment !== undefined && treatment === undefined)
    throw new TypeError(
      'asset.dither runs the two-tone treatment; a continuous treatment is set through asset.set',
    );
  const reports: DitherReport[] = [];
  const changed: Asset[] = [];
  for (const asset of targets) {
    const outcome = await ditherAsset(
      {
        asset,
        ...(treatment !== undefined ? { treatment } : {}),
        ...(input.params !== undefined ? { params: input.params } : {}),
        ...(input.plate !== undefined ? { plate: input.plate } : {}),
        ...(input.source !== undefined ? { source: input.source } : {}),
        ...(input.fromRecorded !== undefined ? { fromRecorded: input.fromRecorded } : {}),
        ...(input.verifyCells !== undefined ? { verifyCells: input.verifyCells } : {}),
      },
      { deckDir: deps.store.dir },
    );
    for (const line of outcome.warnings) deps.log?.(line);
    reports.push(outcome.report);
    if (JSON.stringify(outcome.asset) !== JSON.stringify(asset)) changed.push(outcome.asset);
  }
  await commitAssets(deps, ctx, input.baseRevision, changed);
  return input.allTwoTone === true ? reports : (reports[0] as DitherReport);
}

export async function assetCapture(
  deps: AssetActionDeps,
  ctx: AssetWriteContext,
  input: AssetCaptureInput,
): Promise<Asset> {
  const { baseRevision, ...request } = input;
  const result = await capturePage(
    {
      ...request,
      ...(deps.allowHosts !== undefined
        ? { allowHosts: [...(request.allowHosts ?? []), ...deps.allowHosts] }
        : {}),
    },
    {
      deckDir: deps.store.dir,
      ...(deps.launch !== undefined ? { launch: deps.launch } : {}),
      ...(deps.log !== undefined ? { log: deps.log } : {}),
    },
  );
  await putFiles(deps, result.files);
  const committed = await commitAssets(deps, ctx, baseRevision, [result.asset, ...result.details]);
  deps.log?.(`capture: ${result.files.length} file(s) in ${result.ms} ms`);
  return committed.assets[0] ?? result.asset;
}

/**
 * The files a capture wrote under the deck directory, pushed through the store's `putAsset` so a
 * hosted store holds them before the record commits (SPEC-3 8.5, 0.39); on a file store the put
 * finds the same bytes in place and answers `existed`.
 */
async function putFiles(deps: AssetActionDeps, files: ReadonlyArray<string>): Promise<void> {
  const { readFile } = await import('node:fs/promises');
  for (const relative of files) {
    if (!relative.startsWith('assets/')) continue;
    const bytes = new Uint8Array(await readFile(join(deps.store.dir, relative)));
    await deps.store.putAsset(relative, bytes);
  }
}

export async function materialCapture(
  deps: AssetActionDeps,
  ctx: AssetWriteContext,
  input: MaterialCaptureInput,
): Promise<Asset | Asset[]> {
  const { baseRevision, ...request } = input;
  const result = await captureMaterial(request, {
    deckDir: deps.store.dir,
    ...(deps.launch !== undefined ? { launch: deps.launch } : {}),
    ...(deps.log !== undefined ? { log: deps.log } : {}),
  });
  for (const frame of result.frames)
    for (const line of frame.warnings) deps.log?.(`${frame.asset.id}: ${line}`);
  await putFiles(
    deps,
    result.frames.flatMap((frame) => frame.files),
  );
  const committed = await commitAssets(
    deps,
    ctx,
    baseRevision,
    result.frames.map((frame) => frame.asset),
  );
  deps.log?.(
    `material: ${result.frames.length} frame(s) with ${result.renderer} in ${result.ms} ms`,
  );
  return committed.assets.length === 1 ? (committed.assets[0] as Asset) : committed.assets;
}

export function materialList(input: MaterialListInput = {}): MaterialCatalogEntry[] {
  return listMaterials(input.materialId);
}

// ---------------------------------------------------------------------------------------------
// The block level dither (gslides-parity SPEC-3 10.4, 10.5)

export type MaterializeInput = Rev & {
  slideIds?: 'all' | string[];
  blockIds?: string[];
  prune?: boolean;
  scale?: 1 | 2;
  dryRun?: boolean;
};

export type MaterializeWritten = {
  assetId: string;
  key: string;
  files: string[];
  metrics?: Asset['metrics'];
};

export type MaterializeOutput = {
  revision: number;
  written: MaterializeWritten[];
  pruned: { assetId: string; key: string }[];
  missing: { slideId: string; blockId: string; assetId: string; key: string }[];
};

/**
 * `picture.materialize` (SPEC-3 10.4, 10.5): the variant files and records of every dithered
 * picture on the named slides, one `asset.set` per changed asset in one write; `prune` drops the
 * variants no picture references and removes their files after the commit; `dryRun` names the
 * missing variants and writes nothing. Idempotent: a variant already recorded under its key is
 * neither rendered nor written again.
 */
export async function pictureMaterialize(
  deps: AssetActionDeps,
  ctx: AssetWriteContext,
  input: MaterializeInput,
  options: { now?: () => string } = {},
): Promise<MaterializeOutput> {
  const current = (await deps.store.read()).document;
  const targets = ditheredPictures(current, input.slideIds, input.blockIds);
  const scale = input.scale ?? 2;
  const now = options.now ?? (() => new Date().toISOString());
  const missing = targets.filter((target) => target.asset.variants?.[target.key] === undefined);
  const output: MaterializeOutput = {
    revision: current.deck.revision,
    written: [],
    pruned: [],
    missing: missing.map((target) => ({
      slideId: target.slideId,
      blockId: target.block.id,
      assetId: target.asset.id,
      key: target.key,
    })),
  };
  if (input.dryRun === true) return output;
  const nextAssets = new Map<string, Asset>();
  const assetOf = (id: string): Asset => nextAssets.get(id) ?? (current.deck.assets[id] as Asset);
  const rendered = new Set<string>();
  const removals: string[] = [];
  for (const target of missing) {
    const stamp = `${target.asset.id}:${target.key}`;
    if (rendered.has(stamp)) continue;
    rendered.add(stamp);
    const block = target.block;
    const render = await renderVariant({
      source: join(deps.store.dir, target.source),
      box: { width: target.box[0], height: target.box[1] },
      dither: target.dither,
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
    const { variant, files } = variantRecordOf(target.asset.id, target.key, render, now());
    const byTheme = new Map(render.files.map((file) => [file.theme, file] as const));
    const twins = variant.twins;
    const writes: [string, Uint8Array][] =
      'neutral' in twins
        ? [[twins.neutral, byTheme.get('neutral')?.bytes ?? new Uint8Array()]]
        : [
            [twins.light, byTheme.get('light')?.bytes ?? new Uint8Array()],
            [twins.dark, byTheme.get('dark')?.bytes ?? new Uint8Array()],
          ];
    for (const [relative, bytes] of writes) {
      const put = await deps.store.putAsset(relative, bytes, 'image/png');
      deps.log?.(
        `variant: ${put.relative} ${bytes.byteLength} bytes${put.existed ? ' (existed)' : ''}`,
      );
    }
    const asset = assetOf(target.asset.id);
    nextAssets.set(asset.id, {
      ...asset,
      variants: { ...(asset.variants ?? {}), [target.key]: variant },
    });
    output.written.push({
      assetId: target.asset.id,
      key: target.key,
      files,
      ...(variant.metrics !== undefined ? { metrics: variant.metrics } : {}),
    });
    for (const line of render.metrics.warnings)
      deps.log?.(`${target.slideId}#${block.id}: ${line}`);
  }
  // `missing` names what is still missing after the write: the rows rendered above leave it (the
  // dry run keeps every row; the integrator at merge 2, so the CLI's second dry run and the
  // answer agree)
  output.missing = output.missing.filter((row) => !rendered.has(`${row.assetId}:${row.key}`));
  if (input.prune === true) {
    const referenced = new Set(ditheredPictures(current).map((t) => `${t.asset.id}:${t.key}`));
    for (const id of Object.keys(current.deck.assets)) {
      const asset = assetOf(id);
      if (asset.variants === undefined) continue;
      const kept: Record<string, AssetVariant> = {};
      let changed = false;
      for (const [key, variant] of Object.entries(asset.variants)) {
        if (referenced.has(`${asset.id}:${key}`)) kept[key] = variant;
        else {
          changed = true;
          output.pruned.push({ assetId: asset.id, key });
          removals.push(
            ...('neutral' in variant.twins
              ? [variant.twins.neutral]
              : [variant.twins.light, variant.twins.dark]),
          );
        }
      }
      if (changed) {
        const next: Asset = { ...asset };
        if (Object.keys(kept).length === 0) delete next.variants;
        else next.variants = kept;
        nextAssets.set(asset.id, next);
      }
    }
  }
  if (nextAssets.size > 0) {
    const committed = await commitAssets(deps, ctx, input.baseRevision, [...nextAssets.values()]);
    output.revision = committed.revision;
    for (const relative of removals) await deps.store.removeAsset(relative);
  }
  return output;
}

export type SetBackgroundPictureInput = Rev & {
  slideIds: string[];
  assetId?: string;
  file?: string;
  url?: string;
  upload?: string;
  alt?: string;
  dither?: PictureDither;
  replace?: boolean;
};

export type SetBackgroundOutput = {
  revision: number;
  assetId: string;
  slides: { slideId: string; blockId: string }[];
  findings: never[];
};

/** The covering picture object at the bottom of a canvas slide's stack, when one is there (SPEC-2 2.6.4). */
export function coveringPictureOf(slide: Slide): PictureBlock | undefined {
  const objects = canvasObjects(slide)
    .filter((block): block is PictureBlock => block.type === 'picture' && block.pos !== undefined)
    .filter((block) => {
      const pos = block.pos as NonNullable<PictureBlock['pos']>;
      return (
        pos.x <= 0 && pos.y <= 0 && pos.x + pos.w >= SHEET_WIDTH && pos.y + pos.h >= SHEET_HEIGHT
      );
    })
    .sort((a, b) => (a.pos?.z ?? 0) - (b.pos?.z ?? 0));
  return objects[0];
}

/** A block id free on the slide: `picture`, then `picture-2` and up. */
export function freeBlockId(slide: Slide, stem: string): string {
  const taken = new Set(slideBlocks(slide).map(({ block }) => block.id));
  if (!taken.has(stem)) return stem;
  for (let n = 2; ; n += 1) if (!taken.has(`${stem}-${n}`)) return `${stem}-${n}`;
}

/** The sentence a slide that is not a canvas is refused with when no dispatcher can convert it. */
export const NOT_A_CANVAS = (slideId: string): string =>
  `Slide "${slideId}" is not a canvas; convert it first (slide.toCanvas) so the picture object has a place at the back`;

/**
 * The mutations that put a covering picture object at the back of a canvas slide (SPEC-3 10.5):
 * the covering picture already there takes the asset and the dither in place (`replace` on), else
 * a new object at `0, 0, 1600, 900` under the lowest z.
 */
export function backgroundPictureMutations(
  slide: Slide,
  assetId: string,
  dither: PictureDither | undefined,
  replace: boolean,
): { mutations: Mutation[]; blockId: string } {
  const existing = replace ? coveringPictureOf(slide) : undefined;
  if (existing !== undefined) {
    const mutations: Mutation[] = [
      { op: 'block.set', slideId: slide.id, blockId: existing.id, path: '/asset', value: assetId },
      {
        op: 'block.set',
        slideId: slide.id,
        blockId: existing.id,
        path: '/dither',
        ...(dither !== undefined ? { value: dither } : {}),
      },
    ];
    return { mutations, blockId: existing.id };
  }
  const lowest = Math.min(0, ...canvasObjects(slide).map((block) => block.pos?.z ?? 0));
  const blockId = freeBlockId(slide, 'picture');
  const block: PictureBlock = {
    id: blockId,
    type: 'picture',
    asset: assetId,
    pos: { x: 0, y: 0, w: SHEET_WIDTH, h: SHEET_HEIGHT, z: lowest - 1 },
    ...(dither !== undefined ? { dither } : {}),
  } as PictureBlock;
  return {
    mutations: [{ op: 'block.insert', slideId: slide.id, slot: 'main', block: block as Block }],
    blockId,
  };
}

/**
 * `slide.setBackgroundPicture` (SPEC-3 10.5, 10.6): one write for the covering picture object at
 * the back of every named slide with its dither; the file, url and upload forms run `asset.add`
 * first (their own write), the assetId form writes once. A slide that is not a canvas converts
 * through the dispatcher when one is wired, else is refused by name.
 */
export async function slideSetBackgroundPicture(
  deps: AssetActionDeps,
  ctx: AssetWriteContext,
  input: SetBackgroundPictureInput,
): Promise<SetBackgroundOutput> {
  const forms = [input.assetId, input.file, input.url, input.upload].filter((v) => v !== undefined);
  if (forms.length !== 1)
    throw new TypeError(
      'slide.setBackgroundPicture wants exactly one of assetId, file, url or upload',
    );
  let baseRevision = input.baseRevision;
  let assetId = input.assetId;
  if (assetId === undefined) {
    const added = await assetAdd(deps, ctx, {
      baseRevision,
      ...(input.file !== undefined ? { file: input.file } : {}),
      ...(input.url !== undefined ? { url: input.url } : {}),
      ...(input.upload !== undefined ? { upload: input.upload } : {}),
      role: 'capture',
      alt: input.alt ?? 'A picture behind the slide',
    });
    assetId = added.id;
    baseRevision = (await deps.store.read()).document.deck.revision;
  }
  let current = (await deps.store.read()).document;
  const asset = current.deck.assets[assetId];
  if (asset === undefined) throw new RangeError(`No asset "${assetId}"`);
  if (input.dither !== undefined && !hasContinuousSource(asset))
    throw new TypeError(`Asset "${asset.id}": ${DITHER_NO_SOURCE_MESSAGE}`);
  // a slide that is not a canvas converts first (the rule of block.crop, SPEC-3 10.5)
  for (const slideId of input.slideIds) {
    const slide = current.slides[slideId];
    if (slide === undefined) throw new RangeError(`No slide "${slideId}"`);
    if (isCanvasSlide(slide)) continue;
    if (deps.dispatch === undefined) throw new TypeError(NOT_A_CANVAS(slideId));
    // the action's input names the slides as a list (SPEC-2 1.3; fixed by the integrator at merge 2
    // once the CLI's real dispatcher ran this path)
    await deps.dispatch('slide.toCanvas', { slideIds: [slideId], baseRevision }, ctx);
    current = (await deps.store.read()).document;
    baseRevision = current.deck.revision;
  }
  const mutations: Mutation[] = [];
  const slides: { slideId: string; blockId: string }[] = [];
  for (const slideId of input.slideIds) {
    const slide = current.slides[slideId] as Slide;
    const planned = backgroundPictureMutations(
      slide,
      assetId,
      input.dither,
      input.replace !== false,
    );
    mutations.push(...planned.mutations);
    slides.push({ slideId, blockId: planned.blockId });
  }
  const committed = await commitMutations(deps, ctx, baseRevision, mutations);
  return { revision: committed.revision, assetId, slides, findings: [] };
}

export type SetBackgroundMaterialInput = Rev & {
  slideIds: string[];
  materialId: string;
  preset?: string;
  uniforms?: MaterialUniforms;
  anchor?: number;
  dither?: PictureDither;
};

/** The catalog's default anchor (SPEC-3 10.6: 5,500 ms). */
export const DEFAULT_MATERIAL_ANCHOR: number = MATERIAL_ANCHORS[1];

/**
 * `slide.setBackgroundMaterial` (SPEC-3 10.5, 10.8): `material.capture` at the anchor (its own
 * write), then the frozen frame as the covering picture object at the back of every named slide
 * with its dither, in one call.
 */
export async function slideSetBackgroundMaterial(
  deps: AssetActionDeps,
  ctx: AssetWriteContext,
  input: SetBackgroundMaterialInput,
): Promise<SetBackgroundOutput> {
  const anchor = input.anchor ?? DEFAULT_MATERIAL_ANCHOR;
  const id = slugify(
    `bg-${input.materialId.replace(/^paper:/, '')}${input.preset !== undefined ? `-${input.preset}` : ''}-${anchor}`,
  );
  const captured = await materialCapture(deps, ctx, {
    baseRevision: input.baseRevision,
    materialId: input.materialId,
    ...(input.preset !== undefined ? { preset: input.preset } : {}),
    ...(input.uniforms !== undefined ? { uniforms: input.uniforms } : {}),
    anchors: [anchor],
    id,
    role: 'frame',
  });
  const asset = Array.isArray(captured) ? captured[0] : captured;
  if (asset === undefined)
    throw new RangeError('slide.setBackgroundMaterial: the capture produced no frame');
  const revision = (await deps.store.read()).document.deck.revision;
  return slideSetBackgroundPicture(deps, ctx, {
    baseRevision: revision,
    slideIds: input.slideIds,
    assetId: asset.id,
    ...(input.dither !== undefined ? { dither: input.dither } : {}),
  });
}

/** Registers the handlers; inputs arrive validated by the action's schema. */
export function registerAssetActions(dispatcher: Dispatcher, deps: AssetActionDeps): void {
  const on = <T>(
    run: (input: T, ctx: AssetWriteContext) => Promise<unknown> | unknown,
  ): ActionHandler => {
    return (input, ctx) => run(input as T, ctx as AssetWriteContext);
  };
  dispatcher.register(
    'asset.add',
    on<AssetAddInput>((i, c) => assetAdd(deps, c, i)),
  );
  dispatcher.register(
    'asset.dither',
    on<AssetDitherInput>((i, c) => assetDither(deps, c, i)),
  );
  dispatcher.register(
    'asset.capture',
    on<AssetCaptureInput>((i, c) => assetCapture(deps, c, i)),
  );
  dispatcher.register(
    'material.capture',
    on<MaterialCaptureInput>((i, c) => materialCapture(deps, c, i)),
  );
  dispatcher.register(
    'material.list',
    on<MaterialListInput>((i) => materialList(i)),
  );
  dispatcher.register(
    'picture.materialize',
    on<MaterializeInput>((i, c) => pictureMaterialize(deps, c, i)),
  );
  dispatcher.register(
    'slide.setBackgroundPicture',
    on<SetBackgroundPictureInput>((i, c) => slideSetBackgroundPicture(deps, c, i)),
  );
  dispatcher.register(
    'slide.setBackgroundMaterial',
    on<SetBackgroundMaterialInput>((i, c) => slideSetBackgroundMaterial(deps, c, i)),
  );
}

/** The action ids this module registers, for the studio's lazy registration and the CLI. */
export const ASSET_ACTION_IDS = [
  'asset.add',
  'asset.dither',
  'asset.capture',
  'material.capture',
  'material.list',
  'picture.materialize',
  'slide.setBackgroundPicture',
  'slide.setBackgroundMaterial',
] as const satisfies readonly ActionId[];

/** The uniforms of a resolved recipe are what the block records; exported for the studio's Material section. */
export type { MaterialUniforms, Author, Deck };
export { boxOfDithered, ditherKey12, ditheredPictures, plateBoxOf, variantRecordOf };
export type { DitheredPicture };
