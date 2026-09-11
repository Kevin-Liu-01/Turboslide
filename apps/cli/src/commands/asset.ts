// The asset commands (SPEC 7.1, 7.2; MILESTONES M5 items 1 and 2): `asset add` (a file, a URL
// or a pasted data URL with the license fields, optionally through the two-tone pipeline),
// `asset capture` (a page through a per-site recipe with identical-region detail crops) and
// `asset dither` (a re-run with new parameters, or `--from-recorded` over the committed twins
// with `--verify-cells`). Each runs the one implementation in @turboslide/materials/actions,
// which ends in the store's asset.set write with --base-revision, --author, --note and --force.
import type { Asset } from '@turboslide/schema/assets';
import type { AssetActionDeps } from '@turboslide/materials/actions';
import { assetAdd, assetCapture, assetDither } from '@turboslide/materials/actions';
import type { FileStore } from '@turboslide/store/file-store';
import type { DitherReport } from '@turboslide/headless/capture/twins';
import { recipeIds } from '@turboslide/headless/capture/recipes';
import '@turboslide/headless/capture/gt-site';

import { flagAll, flagBoolean, flagList, flagNumber, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { UsageError } from '../exit.ts';
import { baseRevision, openStore, requirePositional, runAction, writeContext } from '../write.ts';

const USAGE = `usage: turboslide asset <add|capture|dither> ...
  asset add <file|url> --role <role> --alt <text> [--id <slug>] [--title <t>] [--artist <a>] [--license <l>] [--share-alike]
            [--source-url <url>] [--credit <text>] [--two-tone] [--crop l,t,r,b] [--channel gray|r|g|b] [--invert]
            [--blur <px>] [--black <n>] [--white <n>] [--gamma <g>] [--min-filter <px>] [--polarity dark-ground|light-ground]
            [--plate lower-left|lower-right|upper-left] [--allow <host>]
  asset capture <url> --theme light|dark|both [--recipe gt-site|plain] [--region x,y,w,h] [--detail x,y,w,h ...]
            [--id <slug>] [--alt <text>] [--role capture|detail] [--format jpg|png] [--settle <ms>] [--allow <host>]
  asset dither <id> [--gamma <g>] [--black <n>] [--white <n>] [--blur <px>] [--channel c] [--crop l,t,r,b] [--invert]
            [--min-filter <px>] [--polarity p] [--plate <side>] [--source <file>]
  asset dither --all-two-tone --from-recorded [--verify-cells] [--json]
Every write takes --base-revision <n> (default: the current revision), --author <name>, --note <text>, --force and --json.`;

export async function asset(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  const inner = { ...ctx, rest };
  switch (sub) {
    case 'add':
      return assetAddCommand(inner);
    case 'capture':
      return assetCaptureCommand(inner);
    case 'dither':
      return assetDitherCommand(inner);
    default:
      throw new UsageError(USAGE);
  }
}

/** A flag that must be one of a few words, typed; undefined when absent. */
export function oneOf<T extends string>(
  ctx: CommandContext,
  flag: string,
  options: ReadonlyArray<T>,
): T | undefined {
  const value = flagString(ctx.args, flag);
  if (value === undefined) return undefined;
  const match = options.find((option) => option === value);
  if (match === undefined)
    throw new UsageError(`--${flag} wants ${options.join(', ')}, got ${value}`);
  return match;
}

/** The deps every asset action takes: the store, the cwd for relative files, --allow hosts. */
export function assetDeps(ctx: CommandContext): AssetActionDeps & { store: FileStore } {
  const store = openStore(ctx);
  const allow = flagAll(ctx.args, 'allow');
  return {
    store,
    cwd: ctx.cwd,
    ...(allow.length > 0 ? { allowHosts: allow } : {}),
    log: (line) => ctx.out.human(line),
  };
}

function box(
  flag: string,
  value: string | undefined,
): [number, number, number, number] | undefined {
  if (value === undefined) return undefined;
  const parts = value.split(',').map((s) => Number(s.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n)))
    throw new UsageError(`--${flag} wants four numbers, got ${value}`);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 0];
}

export function plateFlag(
  ctx: CommandContext,
): 'lower-left' | 'lower-right' | 'upper-left' | undefined {
  return oneOf(ctx, 'plate', ['lower-left', 'lower-right', 'upper-left'] as const);
}

/** The two-tone parameters from the flags; undefined when none is given. */
export function twoToneFlags(ctx: CommandContext) {
  const params: {
    crop?: [number, number, number, number];
    channel?: 'gray' | 'r' | 'g' | 'b';
    invert?: boolean;
    blur?: number;
    black?: number;
    white?: number;
    gamma?: number;
    minFilter?: number;
    polarity?: 'dark-ground' | 'light-ground';
  } = {};
  const crop = box('crop', flagString(ctx.args, 'crop'));
  if (crop !== undefined) params.crop = crop;
  const channel = oneOf(ctx, 'channel', ['gray', 'r', 'g', 'b'] as const);
  if (channel !== undefined) params.channel = channel;
  if (flagBoolean(ctx.args, 'invert')) params.invert = true;
  for (const [flag, key] of [
    ['blur', 'blur'],
    ['black', 'black'],
    ['white', 'white'],
    ['gamma', 'gamma'],
    ['min-filter', 'minFilter'],
  ] as const) {
    if (flagString(ctx.args, flag) !== undefined) params[key] = flagNumber(ctx.args, flag, 0);
  }
  const polarity = oneOf(ctx, 'polarity', ['dark-ground', 'light-ground'] as const);
  if (polarity !== undefined) params.polarity = polarity;
  return Object.keys(params).length > 0 ? params : undefined;
}

function printAsset(ctx: CommandContext, verb: string, asset: Asset, revision: number): void {
  ctx.out.result(asset);
  const twins =
    'neutral' in asset.twins ? asset.twins.neutral : `${asset.twins.light}, ${asset.twins.dark}`;
  ctx.out.human(
    `${verb} ${asset.id} (${asset.role}, ${asset.size[0]} by ${asset.size[1]} at ${asset.scale}x): ${twins}; revision ${revision}`,
  );
  if (asset.metrics !== undefined) {
    const m = asset.metrics;
    const plate = m.plateClear
      ? `, plate ${m.plateClear.plate.join(',')}: ${m.plateClear.litUnder} lit under, ${m.plateClear.litInBand} in the band, nearest ${m.plateClear.nearestLitPx} px`
      : '';
    ctx.out.human(`  lit ${(m.litFraction * 100).toFixed(1)} percent${plate}`);
  }
}

async function assetAddCommand(ctx: CommandContext): Promise<number> {
  const input = requirePositional(ctx, 0, USAGE);
  const role = oneOf(ctx, 'role', [
    'opener',
    'mood',
    'capture',
    'detail',
    'thumb',
    'render',
    'icon',
    'logo',
    'frame',
    'other',
  ] as const);
  const alt = flagString(ctx.args, 'alt');
  if (role === undefined || alt === undefined)
    throw new UsageError(`asset add wants --role and --alt\n${USAGE}`);
  const deps = assetDeps(ctx);
  const base = await baseRevision(ctx, deps.store);
  const treatment = twoToneFlags(ctx);
  const plate = plateFlag(ctx);
  const request = {
    ...(flagString(ctx.args, 'id') !== undefined
      ? { id: flagString(ctx.args, 'id') as string }
      : {}),
    ...(/^https?:\/\//i.test(input) ? { url: input } : { file: input }),
    role,
    alt,
    ...(flagString(ctx.args, 'title') !== undefined
      ? { title: flagString(ctx.args, 'title') as string }
      : {}),
    ...(flagString(ctx.args, 'artist') !== undefined
      ? { artist: flagString(ctx.args, 'artist') as string }
      : {}),
    ...(flagString(ctx.args, 'license') !== undefined
      ? { license: flagString(ctx.args, 'license') as string }
      : {}),
    ...(flagBoolean(ctx.args, 'share-alike') ? { shareAlike: true } : {}),
    ...(flagString(ctx.args, 'source-url') !== undefined
      ? { sourceUrl: flagString(ctx.args, 'source-url') as string }
      : {}),
    ...(flagString(ctx.args, 'credit') !== undefined
      ? { credit: flagString(ctx.args, 'credit') as string }
      : {}),
    ...(flagBoolean(ctx.args, 'two-tone') ? { twoTone: true } : {}),
    ...(treatment !== undefined ? { treatment } : {}),
    ...(plate !== undefined ? { plate } : {}),
    baseRevision: base,
  };
  const asset = await runAction(ctx, () => assetAdd(deps, writeContext(ctx), request));
  printAsset(ctx, 'added', asset, await deps.store.revision());
  return 0;
}

async function assetCaptureCommand(ctx: CommandContext): Promise<number> {
  const url = requirePositional(ctx, 0, USAGE);
  const theme = oneOf(ctx, 'theme', ['light', 'dark', 'both'] as const) ?? 'both';
  const recipe = flagString(ctx.args, 'recipe');
  if (recipe !== undefined && !recipeIds().includes(recipe))
    throw new UsageError(`--recipe wants one of ${recipeIds().join(', ')}`);
  const deps = assetDeps(ctx);
  const base = await baseRevision(ctx, deps.store);
  const scaleFlag = flagString(ctx.args, 'scale');
  const scale = scaleFlag === undefined ? undefined : flagNumber(ctx.args, 'scale', 2);
  if (scale !== undefined && scale !== 1 && scale !== 2)
    throw new UsageError('--scale wants 1 or 2');
  const role = oneOf(ctx, 'role', ['capture', 'detail'] as const);
  const format = oneOf(ctx, 'format', ['jpg', 'png'] as const);
  const details = flagAll(ctx.args, 'detail').map(
    (value) => box('detail', value) as [number, number, number, number],
  );
  const region = box('region', flagString(ctx.args, 'region'));
  const request = {
    url,
    theme,
    ...(flagString(ctx.args, 'id') !== undefined
      ? { id: flagString(ctx.args, 'id') as string }
      : {}),
    ...(flagString(ctx.args, 'alt') !== undefined
      ? { alt: flagString(ctx.args, 'alt') as string }
      : {}),
    ...(role !== undefined ? { role } : {}),
    ...(scale !== undefined ? { scale: scale as 1 | 2 } : {}),
    ...(region !== undefined ? { region } : {}),
    ...(details.length > 0 ? { details } : {}),
    ...(recipe !== undefined ? { recipe } : {}),
    ...(flagString(ctx.args, 'settle') !== undefined
      ? { settleMs: flagNumber(ctx.args, 'settle', 800) }
      : {}),
    ...(format !== undefined ? { format } : {}),
    baseRevision: base,
  };
  const asset = await runAction(ctx, () => assetCapture(deps, writeContext(ctx), request));
  printAsset(ctx, 'captured', asset, await deps.store.revision());
  if (details.length > 0)
    ctx.out.human(`  ${details.length} detail crop(s) as ${asset.id}-detail-<n>`);
  return 0;
}

function printReport(ctx: CommandContext, report: DitherReport): void {
  const m = report.metrics;
  const plate = m?.plateClear
    ? `, plate ${m.plateClear.plate.join(',')}: ${m.plateClear.litUnder} under, ${m.plateClear.litInBand} in the band, nearest ${m.plateClear.nearestLitPx} px`
    : '';
  const flags = [
    report.mismatchedCells !== undefined
      ? `${report.mismatchedCells} cell(s) differ from the source re-run`
      : '',
    report.twinInverseMismatch !== undefined && report.twinInverseMismatch > 0
      ? `${report.twinInverseMismatch} twin cell(s) not inverse`
      : '',
    report.missingParameter ? 'no two-tone treatment recorded' : '',
    report.missingSource ? 'source not on disk' : '',
    report.written.length > 0 ? `wrote ${report.written.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('; ');
  ctx.out.human(
    `${report.assetId}: lit ${m ? (m.litFraction * 100).toFixed(1) : '?'} percent${plate}${flags ? ` (${flags})` : ''}`,
  );
}

async function assetDitherCommand(ctx: CommandContext): Promise<number> {
  const all = flagBoolean(ctx.args, 'all-two-tone');
  const assetId = ctx.rest[0];
  if (!all && assetId === undefined) throw new UsageError(USAGE);
  const deps = assetDeps(ctx);
  const base = await baseRevision(ctx, deps.store);
  const params = twoToneFlags(ctx);
  const plate = plateFlag(ctx);
  const fromRecorded = flagBoolean(ctx.args, 'from-recorded');
  const verifyCells = flagBoolean(ctx.args, 'verify-cells');
  const request = {
    ...(assetId !== undefined && !all ? { assetId } : {}),
    ...(params !== undefined ? { params } : {}),
    ...(plate !== undefined ? { plate } : {}),
    ...(flagString(ctx.args, 'source') !== undefined
      ? { source: flagString(ctx.args, 'source') as string }
      : {}),
    ...(all ? { allTwoTone: true } : {}),
    ...(fromRecorded || (params === undefined && !all) ? { fromRecorded: true } : {}),
    ...(verifyCells ? { verifyCells: true } : {}),
    baseRevision: base,
  };
  if (params === undefined && !fromRecorded && !all && !verifyCells) {
    ctx.out.human(
      'asset dither: no parameter given; reading the recorded twins back (--from-recorded)',
    );
  }
  const report = await runAction(ctx, () => assetDither(deps, writeContext(ctx), request));
  ctx.out.result(report);
  for (const row of Array.isArray(report) ? report : [report]) printReport(ctx, row);
  return 0;
}

/** The themes flag is shared with render; kept here for the human summary. */
export function themesOf(ctx: CommandContext): string[] {
  return flagList(ctx.args, 'theme', ['light', 'dark']);
}
