// The asset and material action handlers (SPEC 7.1: one implementation every transport runs):
// asset.add, asset.dither, asset.capture, material.capture and material.list as functions from
// the action's typed input to its output, with the one store write each mutating action ends in
// (`asset.set`, SPEC 4.2 mutations), and registerAssetActions to put them on a dispatcher for
// `turboslide mcp`, the studio's server functions and the HTTP transport. The CLI commands call
// the same functions and print the outputs. Errors follow SPEC 7.1: a stale baseRevision or a
// held lease is ConflictError (409) with the current document, malformed input TypeError,
// an unknown id RangeError.
import { addAsset } from '@turboslide/headless/capture/intake';
import type { AssetIntakeRequest } from '@turboslide/headless/capture/intake';
import { capturePage } from '@turboslide/headless/capture/page';
import type { PageCaptureRequest } from '@turboslide/headless/capture/page';
import type { PlateSide, TwoToneRequestParams } from '@turboslide/headless/capture/shared';
import { ditherAsset, twoToneAssets } from '@turboslide/headless/capture/twins';
import type { DitherReport } from '@turboslide/headless/capture/twins';
import type { LaunchOptions } from '@turboslide/headless/launch';
import type { ActionId } from '@turboslide/schema/actions';
import type { Asset, AssetTreatment } from '@turboslide/schema/assets';
import type { MaterialCatalogEntry, MaterialUniforms } from '@turboslide/schema/blocks/material';
import { ConflictError } from '@turboslide/schema/errors';
import type { Author, Mutation } from '@turboslide/schema/mutations';
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
  log?: (line: string) => void;
};

/** The per-call context: the author, and the CLI's --force and --note. */
export type AssetWriteContext = ActionContext & { force?: boolean; note?: string };

type Rev = { baseRevision: number };

export type AssetAddInput = Rev & AssetIntakeRequest;

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

/** Writes asset.set mutations as one Write and maps a refused outcome to the error classes. */
export async function commitAssets(
  deps: AssetActionDeps,
  ctx: AssetWriteContext,
  baseRevision: number,
  assets: ReadonlyArray<Asset>,
): Promise<{ revision: number; assets: Asset[] }> {
  if (assets.length === 0) return { revision: baseRevision, assets: [] };
  const mutations: Mutation[] = assets.map((asset) => ({ op: 'asset.set', asset }));
  const outcome = await deps.store.write(
    {
      baseRevision,
      author: ctx.author,
      ...(ctx.note !== undefined && ctx.note !== '' ? { note: ctx.note } : {}),
      mutations,
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
  // the store normalizes, so the committed records are the ones handed back
  const committed = assets.map((asset) => outcome.document.deck.assets[asset.id] ?? asset);
  return { revision: outcome.revision, assets: committed };
}

export async function assetAdd(
  deps: AssetActionDeps,
  ctx: AssetWriteContext,
  input: AssetAddInput,
): Promise<Asset> {
  const { baseRevision, ...request } = input;
  const result = await addAsset(request, {
    deckDir: deps.store.dir,
    ...(deps.cwd !== undefined ? { cwd: deps.cwd } : {}),
    ...(deps.allowHosts !== undefined ? { allowHosts: deps.allowHosts } : {}),
  });
  for (const line of result.warnings) deps.log?.(line);
  const committed = await commitAssets(deps, ctx, baseRevision, [result.asset]);
  return committed.assets[0] ?? result.asset;
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
  const committed = await commitAssets(deps, ctx, baseRevision, [result.asset, ...result.details]);
  deps.log?.(`capture: ${result.files.length} file(s) in ${result.ms} ms`);
  return committed.assets[0] ?? result.asset;
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

/** Registers the five handlers; inputs arrive validated by the action's schema. */
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
}

/** The uniforms of a resolved recipe are what the block records; exported for the studio's Material section. */
export type { MaterialUniforms, Author };
