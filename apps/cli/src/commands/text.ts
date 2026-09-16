// The text commands (gslides-parity SPEC 7.5 text.replaceAll; SPEC-2 section 3): `text replace`
// is Google's Edit > Find and replace over the whole deck as one write; the round two commands
// write one block's Text through the mark span rule and the typography fields. `text style`
// marks a plain text range italic, underlined, struck, superscript or subscript, or colours it
// (text.style); `text case` rewrites a range's case (text.case); `text insert` inserts a string
// at an offset, the special characters picker's write (text.insert); `text list` sets a list
// block's marker, preset and item levels (text.list); `text spacing`, `text columns` and `text
// indent` write the typography fields (text.spacing, text.columns, text.indent). A range is
// `start:end` in the plain text of the Text, one character per paragraph break.
import { LIST_MARKERS, BULLET_PRESETS, NUMBER_PRESETS, CASE_MODES } from '@turboslide/schema/text';
import type { BulletPreset, CaseMode, ListMarker, NumberPreset } from '@turboslide/schema/text';

import { flagBoolean, flagList, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { runDeckAction } from '../dispatch.ts';
import { UsageError } from '../exit.ts';
import {
  textCase,
  textColumns,
  textIndent,
  textInsert,
  textList,
  textReplaceAll,
  textSpacing,
  textStyle,
} from '../store-actions.ts';
import {
  baseRevision,
  openStore,
  printSlideResult,
  requireAddress,
  requirePositional,
  runAction,
  storeDeps,
  writeContext,
} from '../write.ts';

const USAGE = `usage: turboslide text <replace|style|case|insert|list|spacing|columns|indent|autocorrect> ...
  text replace <find> <replace> [--match-case] [--slides <id,id,...>]
                                    every occurrence in the deck's visible text and the notes (text.replaceAll)
  text style <slideId>#<blockId> <pointer> --range <start:end> [--italic|--no-italic] [--underline|--no-underline]
             [--strike|--no-strike] [--superscript|--no-superscript] [--subscript|--no-subscript]
             [--color <color>|--no-color] [--highlight <color>|--no-highlight]
                                    marks and colours on a range of the Text (text.style)
  text case <slideId>#<blockId> <pointer> --range <start:end> lower|upper|title
                                    the characters of the range rewritten (text.case)
  text insert <slideId>#<blockId> <pointer> --at <offset> <text>
                                    a string inserted at a plain text offset (text.insert)
  text list <slideId>#<blockId> [--marker rule|bullet|number] [--preset <preset>] [--items <i,i>] [--level <1-9>|--in|--out]
                                    the marker, the preset and the item levels of a list (text.list)
  text spacing <slideId>#<blockId>[,<blockId>] [--line <factor>] [--before <px>] [--after <px>]
                                    line spacing and the space before and after paragraphs (text.spacing)
  text columns <slideId>#<blockId>[,<blockId>] <1|2|3>
                                    the column count (text.columns)
  text indent <slideId>#<blockId>[,<blockId>] --in | --out | --to <px> [--items <i,i>]
                                    the left indent by 64 px steps, or a list's item levels (text.indent)
The bullet presets: ${BULLET_PRESETS.join(', ')}. The numbering presets: ${NUMBER_PRESETS.join(', ')}.
Every write takes --base-revision <n> (default: the current revision), --author <name>, --note <text>, --force and --json.
  text autocorrect [<slideId>[#<blockId>]] [<path>] [--dry-run]
                                    the autocorrect rules and the caller's substitutions over a Text, a block or the deck (text.autocorrect)`;

export async function text(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  const inner = { ...ctx, rest };
  switch (sub) {
    case 'replace':
      return replace(inner);
    case 'style':
      return style(inner);
    case 'case':
      return caseCommand(inner);
    case 'insert':
      return insert(inner);
    case 'list':
      return list(inner);
    case 'spacing':
      return spacing(inner);
    case 'columns':
      return columns(inner);
    case 'indent':
      return indent(inner);
    case 'autocorrect':
      return autocorrect(inner);
    default:
      throw new UsageError(`unknown subcommand "text ${sub ?? ''}"\n${USAGE}`);
  }
}

/** `<slideId>#<blockId>[,<blockId>]`: one slide, one or more blocks. */
function requireAddresses(ctx: CommandContext): { slideId: string; blockIds: string[] } {
  const raw = requirePositional(ctx, 0, USAGE);
  const hash = raw.indexOf('#');
  if (hash <= 0 || hash === raw.length - 1)
    throw new UsageError(`Expected slideId#blockId[,blockId], got ${raw}\n${USAGE}`);
  const blockIds = raw
    .slice(hash + 1)
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (blockIds.length === 0) throw new UsageError(USAGE);
  return { slideId: raw.slice(0, hash), blockIds };
}

/** `--range start:end` as two integers. */
function requireRange(ctx: CommandContext): [number, number] {
  const raw = flagString(ctx.args, 'range');
  const match = raw === undefined ? null : /^(\d+):(\d+)$/.exec(raw);
  if (match === null)
    throw new UsageError(`--range wants <start:end>, got ${raw ?? 'nothing'}\n${USAGE}`);
  return [Number(match[1]), Number(match[2])];
}

function optionalNumber(ctx: CommandContext, flag: string): number | undefined {
  const raw = flagString(ctx.args, flag);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new UsageError(`--${flag} wants a number, got ${raw}`);
  return n;
}

/** `--<flag>` sets, `--no-<flag>` clears, neither leaves the mark. */
function tri(ctx: CommandContext, flag: string): boolean | undefined {
  if (flagBoolean(ctx.args, flag)) return true;
  if (flagBoolean(ctx.args, `no-${flag}`)) return false;
  return undefined;
}

async function replace(ctx: CommandContext): Promise<number> {
  const find = requirePositional(ctx, 0, USAGE);
  const replacement = ctx.rest[1] ?? '';
  if (ctx.rest[1] === undefined)
    throw new UsageError(`text replace needs a replacement (pass "" to delete)\n${USAGE}`);
  const slideIds = flagList(ctx.args, 'slides', []);
  const matchCase = flagBoolean(ctx.args, 'match-case');
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    textReplaceAll(storeDeps(ctx, store), writeContext(ctx), {
      find,
      replace: replacement,
      ...(matchCase ? { matchCase: true } : {}),
      ...(slideIds.length > 0 ? { slideIds } : {}),
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  ctx.out.result(result);
  ctx.out.human(
    `replaced ${result.replacements} occurrence(s) of "${find}" on ${result.slideIds.length} slide(s): revision ${result.revision}`,
  );
  return 0;
}

async function style(ctx: CommandContext): Promise<number> {
  const { slideId, blockId } = requireAddress(ctx, USAGE);
  const path = requirePositional(ctx, 1, USAGE);
  const range = requireRange(ctx);
  const marks: Record<string, boolean | string | null> = {};
  for (const [flag, key] of [
    ['italic', 'i'],
    ['underline', 'u'],
    ['strike', 's'],
    ['superscript', 'sup'],
    ['subscript', 'sub'],
  ] as const) {
    const value = tri(ctx, flag);
    if (value !== undefined) marks[key] = value;
  }
  for (const key of ['color', 'highlight'] as const) {
    const value = flagString(ctx.args, key);
    if (value !== undefined) marks[key] = value;
    else if (flagBoolean(ctx.args, `no-${key}`)) marks[key] = null;
  }
  if (Object.keys(marks).length === 0)
    throw new UsageError(`text style wants at least one mark flag\n${USAGE}`);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    textStyle(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockId,
      path,
      range,
      marks: marks as never,
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(ctx, `styled ${blockId}${path} ${range[0]}:${range[1]} on`, result);
  ctx.out.human(`  ${result.text}`);
  return 0;
}

async function caseCommand(ctx: CommandContext): Promise<number> {
  const { slideId, blockId } = requireAddress(ctx, USAGE);
  const path = requirePositional(ctx, 1, USAGE);
  const mode = ctx.rest[2];
  if (mode === undefined || !(CASE_MODES as ReadonlyArray<string>).includes(mode))
    throw new UsageError(`text case wants one of ${CASE_MODES.join(', ')}\n${USAGE}`);
  const range = requireRange(ctx);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    textCase(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockId,
      path,
      range,
      mode: mode as CaseMode,
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(
    ctx,
    `rewrote ${blockId}${path} ${range[0]}:${range[1]} in ${mode} case on`,
    result,
  );
  return 0;
}

async function insert(ctx: CommandContext): Promise<number> {
  const { slideId, blockId } = requireAddress(ctx, USAGE);
  const path = requirePositional(ctx, 1, USAGE);
  const inserted = ctx.rest[2];
  if (inserted === undefined || inserted === '')
    throw new UsageError(`text insert needs the text to insert\n${USAGE}`);
  const at = optionalNumber(ctx, 'at');
  if (at === undefined || !Number.isInteger(at) || at < 0)
    throw new UsageError(`text insert wants --at <offset>\n${USAGE}`);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    textInsert(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockId,
      path,
      at,
      text: inserted,
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(
    ctx,
    `inserted ${JSON.stringify(inserted)} at ${at} of ${blockId}${path} on`,
    result,
  );
  return 0;
}

function numberItems(ctx: CommandContext): number[] | undefined {
  const raw = flagList(ctx.args, 'items', []);
  if (raw.length === 0) return undefined;
  return raw.map((value) => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0)
      throw new UsageError(`--items wants item indexes, got ${value}`);
    return n;
  });
}

async function list(ctx: CommandContext): Promise<number> {
  const { slideId, blockId } = requireAddress(ctx, USAGE);
  const marker = flagString(ctx.args, 'marker');
  if (marker !== undefined && !(LIST_MARKERS as ReadonlyArray<string>).includes(marker))
    throw new UsageError(`--marker wants one of ${LIST_MARKERS.join(', ')}\n${USAGE}`);
  const preset = flagString(ctx.args, 'preset');
  if (
    preset !== undefined &&
    !(BULLET_PRESETS as ReadonlyArray<string>).includes(preset) &&
    !(NUMBER_PRESETS as ReadonlyArray<string>).includes(preset)
  )
    throw new UsageError(`--preset wants a bullet or numbering preset\n${USAGE}`);
  const level = optionalNumber(ctx, 'level');
  const levelBy = flagBoolean(ctx.args, 'in') ? 1 : flagBoolean(ctx.args, 'out') ? -1 : undefined;
  const items = numberItems(ctx);
  if (marker === undefined && preset === undefined && level === undefined && levelBy === undefined)
    throw new UsageError(`text list wants --marker, --preset, --level, --in or --out\n${USAGE}`);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    textList(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockId,
      ...(marker !== undefined ? { marker: marker as ListMarker } : {}),
      ...(preset !== undefined ? { preset: preset as BulletPreset | NumberPreset } : {}),
      ...(items !== undefined ? { items } : {}),
      ...(level !== undefined ? { level } : {}),
      ...(levelBy !== undefined ? { levelBy } : {}),
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(ctx, `set the list options of ${blockId} on`, result);
  return 0;
}

/** A numeric flag that also takes `none` to clear the field. */
function numberOrClear(ctx: CommandContext, flag: string): number | null | undefined {
  const raw = flagString(ctx.args, flag);
  if (raw === undefined) return undefined;
  if (raw === 'none' || raw === 'off') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new UsageError(`--${flag} wants a number or none, got ${raw}`);
  return n;
}

async function spacing(ctx: CommandContext): Promise<number> {
  const { slideId, blockIds } = requireAddresses(ctx);
  const line = numberOrClear(ctx, 'line');
  const before = numberOrClear(ctx, 'before');
  const after = numberOrClear(ctx, 'after');
  if (line === undefined && before === undefined && after === undefined)
    throw new UsageError(`text spacing wants --line, --before or --after\n${USAGE}`);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    textSpacing(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockIds,
      ...(line !== undefined ? { line } : {}),
      ...(before !== undefined ? { before } : {}),
      ...(after !== undefined ? { after } : {}),
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(ctx, `set the spacing of ${blockIds.join(', ')} on`, result);
  return 0;
}

async function columns(ctx: CommandContext): Promise<number> {
  const { slideId, blockIds } = requireAddresses(ctx);
  const raw = ctx.rest[1];
  const count = Number(raw);
  if (count !== 1 && count !== 2 && count !== 3)
    throw new UsageError(`text columns wants 1, 2 or 3, got ${raw ?? 'nothing'}\n${USAGE}`);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    textColumns(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockIds,
      columns: count,
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(ctx, `set ${count} column(s) on ${blockIds.join(', ')} of`, result);
  return 0;
}

async function indent(ctx: CommandContext): Promise<number> {
  const { slideId, blockIds } = requireAddresses(ctx);
  const inward = flagBoolean(ctx.args, 'in');
  // `--out` is an optional value flag (export --out <dir>); here it is the step out
  const outward = ctx.args.flags['out'] !== undefined;
  const to = optionalNumber(ctx, 'to');
  if ([inward, outward, to !== undefined].filter(Boolean).length !== 1)
    throw new UsageError(`text indent wants one of --in, --out or --to <px>\n${USAGE}`);
  const items = numberItems(ctx);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    textIndent(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      blockIds,
      ...(to !== undefined ? { to } : { by: inward ? (1 as const) : (-1 as const) }),
      ...(items !== undefined ? { items } : {}),
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(ctx, `indented ${blockIds.join(', ')} on`, result);
  return 0;
}

/**
 * `text autocorrect [<slideId>[#<blockId>]] [<path>] [--dry-run]` (gslides-parity SPEC-5 7.1;
 * b5.md request 9): the autocorrect rules and the caller's substitution table over one Text, one
 * block, one slide or the deck through the shared handler; --dry-run lists the changes alone.
 */
async function autocorrect(ctx: CommandContext): Promise<number> {
  const [address, path] = ctx.rest;
  const parsed: { slideId?: string; blockId?: string } = {};
  if (address !== undefined) {
    const [slideId, blockId] = address.split('#');
    if (slideId !== undefined && slideId !== '') parsed.slideId = slideId;
    if (blockId !== undefined && blockId !== '') parsed.blockId = blockId;
  }
  const store = openStore(ctx);
  const result = await runDeckAction<{ changes: unknown[]; revision: number }>(
    ctx,
    'text.autocorrect',
    {
      ...parsed,
      ...(path === undefined ? {} : { path }),
      ...(flagBoolean(ctx.args, 'dry-run') ? { dryRun: true } : {}),
      baseRevision: await baseRevision(ctx, store),
    },
  );
  ctx.out.result(result);
  ctx.out.human(
    `${flagBoolean(ctx.args, 'dry-run') ? 'would change' : 'changed'} ${result.changes.length} text(s) at revision ${result.revision}`,
  );
  return 0;
}
