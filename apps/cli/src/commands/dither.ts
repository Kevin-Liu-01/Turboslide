// The dither and background commands (gslides-parity SPEC-3 10.5, 12): `block dither
// <slide>#<block> --pattern bayer8 ... [--off]` writes the picture's dither field (picture.dither),
// `slide background-picture <slideIds> --asset <id>|--file <path>|--url <url> [--dither] [--alt]
// [--no-replace]` places a covering picture at the back of each slide with the deck's two tone
// screen when asked (slide.setBackgroundPicture; `--dither` alone applies the Photograph preset,
// the Background dialog's toggle; `--dither neutral` the identity), and `slide background-material
// <slideIds> <materialId> [--preset] [--anchor] [--dither]` captures a shader frame first
// (slide.setBackgroundMaterial).
import type { PictureDither } from '@turboslide/schema/blocks/dither';
import {
  DITHER_CELLS,
  DITHER_CHANNELS,
  DITHER_PATTERNS,
  DITHER_PHOTOGRAPH_VALUE,
  DITHER_POLARITIES,
  DITHER_TOGGLE_VALUE,
  DITHER_TONES,
} from '@turboslide/schema/blocks/dither';

import { flagBoolean, flagNumber, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { runDeckAction } from '../dispatch.ts';
import { UsageError } from '../exit.ts';
import type { PictureDitherResult, SlideSetBackgroundPictureResult } from '../store-actions.ts';
import { baseRevision, openStore, printSlideResult, requireAddress } from '../write.ts';

export const DITHER_USAGE = `usage: turboslide block dither <slideId>#<blockId> [--pattern bayer8|bayer4|blue64|random] [--tone two|three|original] [--steps <2-7>]
         [--cell 1|2|3|4] [--strength <0-1>] [--black <0-255>] [--white <0-255>] [--gamma <0.5-2>] [--invert]
         [--polarity auto|dark-ground|light-ground|same] [--blur <0-8>] [--min-filter <0-9>] [--channel gray|r|g|b] [--seed <n>]
         [--photograph] [--off]
  the deck's two tone screen over a picture, as a field on the block (picture.dither); no flag writes the identity,
  --photograph the Background dialog's preset (black 120, white 230, gamma 0.9), --off removes the field`;

export const BACKGROUND_USAGE = `usage: turboslide slide background-picture <slideIds> --asset <assetId>|--file <path>|--url <url> [--alt <text>] [--dither[=photograph|neutral]] [--no-replace]
       turboslide slide background-material <slideIds> <materialId> [--preset <name>] [--anchor <ms>] [--dither[=photograph|neutral]]
  one write for a covering picture at the back of each slide (slide.setBackgroundPicture); the material form captures a
  frame first (slide.setBackgroundMaterial). --dither applies the Photograph preset, --dither=neutral the identity.`;

function oneOf<T extends string>(
  ctx: CommandContext,
  flag: string,
  allowed: ReadonlyArray<T>,
): T | undefined {
  const value = flagString(ctx.args, flag);
  if (value === undefined) return undefined;
  if (!(allowed as ReadonlyArray<string>).includes(value)) {
    throw new UsageError(`--${flag} wants one of ${allowed.join(', ')}, got ${value}`);
  }
  return value as T;
}

/** The dither the flags spell: the identity when none, the Photograph preset with --photograph, every field a flag. */
export function ditherFlags(ctx: CommandContext): PictureDither {
  const base: PictureDither = flagBoolean(ctx.args, 'photograph')
    ? { ...DITHER_PHOTOGRAPH_VALUE }
    : { ...DITHER_TOGGLE_VALUE };
  const dither: PictureDither = { ...base };
  const pattern = oneOf(ctx, 'pattern', DITHER_PATTERNS);
  if (pattern !== undefined) dither.pattern = pattern;
  const tone = oneOf(ctx, 'tone', DITHER_TONES);
  if (tone !== undefined) dither.tone = tone;
  const polarity = oneOf(ctx, 'polarity', DITHER_POLARITIES);
  if (polarity !== undefined) dither.polarity = polarity;
  const channel = oneOf(ctx, 'channel', DITHER_CHANNELS);
  if (channel !== undefined) dither.channel = channel;
  const cell = flagString(ctx.args, 'cell');
  if (cell !== undefined) {
    const n = Number(cell);
    if (!(DITHER_CELLS as ReadonlyArray<number>).includes(n))
      throw new UsageError(`--cell wants 1, 2, 3 or 4, got ${cell}`);
    dither.cell = n as PictureDither['cell'];
  }
  for (const [flag, key] of [
    ['steps', 'steps'],
    ['strength', 'strength'],
    ['black', 'black'],
    ['white', 'white'],
    ['gamma', 'gamma'],
    ['blur', 'blur'],
    ['min-filter', 'minFilter'],
    ['seed', 'seed'],
  ] as const) {
    if (flagString(ctx.args, flag) !== undefined) dither[key] = flagNumber(ctx.args, flag, 0);
  }
  if (flagBoolean(ctx.args, 'invert')) dither.invert = true;
  return dither;
}

/** `--dither`, `--dither photograph` or `--dither neutral` on the background commands; undefined without the flag. */
export function backgroundDitherFlag(ctx: CommandContext): PictureDither | undefined {
  const raw = ctx.args.flags.dither;
  if (raw === undefined) return undefined;
  const value: string =
    raw === true ? 'photograph' : Array.isArray(raw) ? (raw[raw.length - 1] ?? 'photograph') : raw;
  if (value === 'photograph') return { ...DITHER_PHOTOGRAPH_VALUE };
  if (value === 'neutral') return { ...DITHER_TOGGLE_VALUE };
  throw new UsageError(
    `--dither wants photograph or neutral, got ${String(value)}\n${BACKGROUND_USAGE}`,
  );
}

/** `turboslide block dither <slide>#<block> ...` (picture.dither). */
export async function blockDitherCommand(ctx: CommandContext): Promise<number> {
  const { slideId, blockId } = requireAddress(ctx, DITHER_USAGE);
  const store = openStore(ctx);
  const dither = flagBoolean(ctx.args, 'off') ? null : ditherFlags(ctx);
  const result = await runDeckAction<PictureDitherResult>(ctx, 'picture.dither', {
    slideId,
    blockId,
    dither,
    baseRevision: await baseRevision(ctx, store),
  });
  printSlideResult(ctx, dither === null ? 'dither removed on' : 'dithered', result);
  if (result.key !== undefined)
    ctx.out.human(
      `  variant key ${result.key.slice(0, 12)}${result.metrics ? `, lit ${(result.metrics.litFraction * 100).toFixed(1)} percent` : ''}`,
    );
  for (const warning of result.warnings) ctx.out.human(`  ${warning}`);
  return 0;
}

function slideIdsArg(ctx: CommandContext, usage: string): string[] {
  const raw = ctx.rest[0];
  if (raw === undefined) throw new UsageError(usage);
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) throw new UsageError(usage);
  return ids;
}

function printBackground(ctx: CommandContext, result: SlideSetBackgroundPictureResult): void {
  ctx.out.result(result);
  ctx.out.human(
    `background ${result.assetId} on ${result.slides.map((row) => `${row.slideId}#${row.blockId}`).join(', ')}: revision ${result.revision}, ${result.findings.length} finding(s)`,
  );
}

/** `turboslide slide background-picture <slideIds> ...` (slide.setBackgroundPicture). */
export async function slideBackgroundPictureCommand(ctx: CommandContext): Promise<number> {
  const slideIds = slideIdsArg(ctx, BACKGROUND_USAGE);
  const asset = flagString(ctx.args, 'asset');
  const file = flagString(ctx.args, 'file');
  const url = flagString(ctx.args, 'url');
  const given = [asset, file, url].filter((v) => v !== undefined).length;
  if (given !== 1)
    throw new UsageError(
      `name the picture with exactly one of --asset, --file or --url\n${BACKGROUND_USAGE}`,
    );
  const alt = flagString(ctx.args, 'alt');
  const dither = backgroundDitherFlag(ctx);
  const store = openStore(ctx);
  const result = await runDeckAction<SlideSetBackgroundPictureResult>(
    ctx,
    'slide.setBackgroundPicture',
    {
      slideIds,
      ...(asset !== undefined ? { assetId: asset } : {}),
      ...(file !== undefined ? { file } : {}),
      ...(url !== undefined ? { url } : {}),
      ...(alt !== undefined ? { alt } : {}),
      ...(dither !== undefined ? { dither } : {}),
      ...(flagBoolean(ctx.args, 'no-replace') ? { replace: false } : {}),
      baseRevision: await baseRevision(ctx, store),
    },
  );
  printBackground(ctx, result);
  return 0;
}

/** `turboslide slide background-material <slideIds> <materialId> ...` (slide.setBackgroundMaterial). */
export async function slideBackgroundMaterialCommand(ctx: CommandContext): Promise<number> {
  const slideIds = slideIdsArg(ctx, BACKGROUND_USAGE);
  const materialId = ctx.rest[1];
  if (materialId === undefined)
    throw new UsageError(`slide background-material wants <materialId>\n${BACKGROUND_USAGE}`);
  const preset = flagString(ctx.args, 'preset');
  const anchor = flagString(ctx.args, 'anchor');
  const dither = backgroundDitherFlag(ctx);
  const store = openStore(ctx);
  const result = await runDeckAction<SlideSetBackgroundPictureResult>(
    ctx,
    'slide.setBackgroundMaterial',
    {
      slideIds,
      materialId,
      ...(preset !== undefined ? { preset } : {}),
      ...(anchor !== undefined ? { anchor: flagNumber(ctx.args, 'anchor', 5500) } : {}),
      ...(dither !== undefined ? { dither } : {}),
      baseRevision: await baseRevision(ctx, store),
    },
  );
  printBackground(ctx, result);
  return 0;
}
