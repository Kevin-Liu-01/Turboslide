// The slide commands (SPEC 7.1, 7.2): `slide get` from M1, and the typed writes slide put
// (slide.replace), patch (slide.update), insert, remove and move, each with --base-revision,
// --author and --json. Documents come from stdin or --file; patch takes --set <pointer>=<value>
// and --unset <pointer>, or a mutation list as JSON. The freeform round adds slide set-layout
// (slide.setLayout), which refiles the blocks when a slide changes layout (docs/freeform.md).
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { ActionContext, Dispatcher } from '@turboslide/agent/dispatch';
import type { Layout } from '@turboslide/schema/deck';
import { LAYOUT_IDS, layoutSchema } from '@turboslide/schema/deck';
import { isLayoutId } from '@turboslide/schema/layouts';
import type { Mutation } from '@turboslide/schema/mutations';
import { mutationSchema } from '@turboslide/schema/mutations';
import { loadDeckDir } from '@turboslide/store/file-store';

import { flagAll, flagBoolean, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { UsageError } from '../exit.ts';
import {
  slideApplyLayout,
  slideDuplicate,
  slideImport,
  slideInsert,
  slideMove,
  slideNew,
  slideRemove,
  slideReplace,
  slideSetLayout,
  slideSkip,
  slideUpdate,
} from '../store-actions.ts';
import type { SlideImportInput, SlideImportSource, StoreActionDeps } from '../store-actions.ts';
import {
  baseRevision,
  openStore,
  parseValue,
  printSlideResult,
  readDocumentInput,
  requirePositional,
  runAction,
  storeDeps,
  writeContext,
} from '../write.ts';
import { decksDirFor } from './deck.ts';
import { slideGet } from './slides.ts';

const USAGE = `usage: turboslide slide <get|put|patch|insert|remove|move|set-layout|new|duplicate|skip|apply-layout|import> ...
  slide get <id>
  slide put <id> [--file slide.json] < slide.json
  slide patch <id> --set <pointer>=<value> [--unset <pointer>] | --mutations [--file mutations.json]
  slide insert --section <sectionId> [--after <slideId>] [--file slide.json] < slide.json
  slide remove <id>
  slide move <id> --to <sectionId> [--after <slideId>]
  slide set-layout <id> --type cols|split|center|left-mid|stack|freeform [--ratio 5/7] [--gap <px>] [--head single|5/7|4/8] [--align start|center] [--body start|center|end]
  slide set-layout <id> --layout '<json>'      the layout object as written in a slide file
  slide new --layout <layout> [--after <slideId>] [--section <sectionId>] [--id <slideId>]
                                               one slide from a layout with empty placeholders (slide.new); a Section
                                               header after a slide starts a new section
  slide duplicate <id,id,...>                  copies after the last of them (slide.duplicate)
  slide skip <id,id,...> [--off]               skip the slides, or show them again (slide.skip)
  slide apply-layout <id,id,...> <layout>      move the content into the layout's placeholders (slide.applyLayout)
  slide import <sourceDeckId> <id,id,...> [--after <slideId>] [--section <sectionId>] [--decks <dir>]
                                               copy slides and their assets from another deck under decks/ (slide.import)
The layouts: ${LAYOUT_IDS.join(', ')}.
Every write takes --base-revision <n> (default: the current revision), --author <name>, --note <text>, --force and --json.`;

export async function slide(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  const inner = { ...ctx, rest };
  switch (sub) {
    case 'get':
      return slideGet(inner);
    case 'put':
      return slidePut(inner);
    case 'patch':
      return slidePatch(inner);
    case 'insert':
      return slideInsertCommand(inner);
    case 'remove':
      return slideRemoveCommand(inner);
    case 'move':
      return slideMoveCommand(inner);
    case 'set-layout':
      return slideSetLayoutCommand(inner);
    case 'new':
      return slideNewCommand(inner);
    case 'duplicate':
      return slideDuplicateCommand(inner);
    case 'skip':
      return slideSkipCommand(inner);
    case 'apply-layout':
      return slideApplyLayoutCommand(inner);
    case 'import':
      return slideImportCommand(inner);
    default:
      throw new UsageError(`unknown subcommand "slide ${sub ?? ''}"\n${USAGE}`);
  }
}

/** A layout id from a flag or a positional, checked against the list. */
function requireLayout(value: string | undefined): (typeof LAYOUT_IDS)[number] {
  if (value === undefined || !isLayoutId(value))
    throw new UsageError(
      `a layout is one of ${LAYOUT_IDS.join(', ')}, got ${value ?? 'nothing'}\n${USAGE}`,
    );
  return value;
}

/** `a,b,c` from the positional at `index`. */
function requireSlideIds(ctx: CommandContext, index: number): string[] {
  const raw = requirePositional(ctx, index, USAGE);
  const ids = raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '');
  if (ids.length === 0) throw new UsageError(USAGE);
  return ids;
}

async function slideNewCommand(ctx: CommandContext): Promise<number> {
  const layout = requireLayout(flagString(ctx.args, 'layout'));
  const after = flagString(ctx.args, 'after');
  const sectionId = flagString(ctx.args, 'section');
  const id = flagString(ctx.args, 'id');
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    slideNew(storeDeps(ctx, store), writeContext(ctx), {
      layout,
      ...(after !== undefined ? { after } : {}),
      ...(sectionId !== undefined ? { sectionId } : {}),
      ...(id !== undefined ? { id } : {}),
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  ctx.out.result(result);
  ctx.out.human(
    `new ${layout} slide ${result.slide.id}${after !== undefined ? ` after ${after}` : ''}: revision ${result.revision}`,
  );
  return 0;
}

async function slideDuplicateCommand(ctx: CommandContext): Promise<number> {
  const slideIds = requireSlideIds(ctx, 0);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    slideDuplicate(storeDeps(ctx, store), writeContext(ctx), {
      slideIds,
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  ctx.out.result(result);
  ctx.out.human(
    `duplicated ${slideIds.join(', ')} as ${result.slides.map((slide) => slide.id).join(', ')}: revision ${result.revision}`,
  );
  return 0;
}

async function slideSkipCommand(ctx: CommandContext): Promise<number> {
  const slideIds = requireSlideIds(ctx, 0);
  const skip = !flagBoolean(ctx.args, 'off');
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    slideSkip(storeDeps(ctx, store), writeContext(ctx), {
      slideIds,
      skip,
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  ctx.out.result(result);
  ctx.out.human(
    `${skip ? 'skipped' : 'showing'} ${result.slideIds.join(', ')}: revision ${result.revision}`,
  );
  return 0;
}

async function slideApplyLayoutCommand(ctx: CommandContext): Promise<number> {
  const slideIds = requireSlideIds(ctx, 0);
  const layout = requireLayout(ctx.rest[1]);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    slideApplyLayout(storeDeps(ctx, store), writeContext(ctx), {
      slideIds,
      layout,
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  ctx.out.result(result);
  ctx.out.human(
    `applied ${layout} to ${slideIds.join(', ')}: revision ${result.revision}, ${result.findings.length} finding(s)`,
  );
  for (const row of result.dropped)
    ctx.out.human(
      `  ${row.slideId}: ${row.blockIds.length} block(s) did not fit this layout (${row.blockIds.join(', ')})`,
    );
  for (const id of result.moved) ctx.out.human(`  ${id} starts a new section`);
  return 0;
}

async function slideImportCommand(ctx: CommandContext): Promise<number> {
  const sourceDeckId = requirePositional(ctx, 0, USAGE);
  const slideIds = requireSlideIds(ctx, 1);
  const after = flagString(ctx.args, 'after');
  const sectionId = flagString(ctx.args, 'section');
  const store = openStore(ctx);
  const decksDir = decksDirFor(ctx);
  const sourceDir = join(decksDir, sourceDeckId);
  if (!existsSync(join(sourceDir, 'deck.json')))
    throw new UsageError(`no deck ${sourceDeckId}: ${sourceDir} has no deck.json`);
  const result = await runAction(ctx, async () =>
    slideImport(
      storeDeps(ctx, store),
      writeContext(ctx),
      {
        sourceDeckId,
        slideIds,
        ...(after !== undefined ? { after } : {}),
        ...(sectionId !== undefined ? { sectionId } : {}),
        baseRevision: await baseRevision(ctx, store),
      },
      slideImportSource(decksDir, sourceDeckId, store.dir),
    ),
  );
  ctx.out.result(result);
  ctx.out.human(
    `imported ${result.slides.map((slide) => slide.id).join(', ')} from ${sourceDeckId}: ${result.assets.length} asset(s) copied, revision ${result.revision}`,
  );
  for (const row of result.renamed) ctx.out.human(`  ${row.from} landed as ${row.to}`);
  return 0;
}

/**
 * What slide.import reads from a sibling deck under decks/: its document, and a copy of each asset
 * file (the twins and the source file) into the target deck. RangeError when the deck or a file is
 * missing; the slug schema on sourceDeckId keeps the path inside the decks folder.
 */
export function slideImportSource(
  decksDir: string,
  sourceDeckId: string,
  targetDir: string,
): SlideImportSource {
  const sourceDir = join(decksDir, sourceDeckId);
  if (!existsSync(join(sourceDir, 'deck.json')))
    throw new RangeError(`No deck ${sourceDeckId} under ${decksDir}`);
  return {
    document: loadDeckDir(sourceDir).document,
    copyAsset: async (relative) => {
      const from = join(sourceDir, ...relative.split('/'));
      const to = join(targetDir, ...relative.split('/'));
      if (!existsSync(from)) throw new RangeError(`${sourceDeckId} has no file ${relative}`);
      mkdirSync(dirname(to), { recursive: true });
      cpSync(from, to);
    },
  };
}

/**
 * Registers slide.import on a dispatcher (the stdio MCP server's deck_import_slides): the source
 * deck is a sibling of the served deck under the same decks/ folder, read the way `slide import`
 * reads it, so the CLI and the MCP tool run one implementation.
 */
export function registerSlideImportAction(
  dispatcher: Dispatcher,
  deps: StoreActionDeps,
  decksDir: string,
  targetDir: string,
): void {
  dispatcher.register('slide.import', (input, context: ActionContext) => {
    const typed = input as SlideImportInput;
    return slideImport(
      deps,
      context,
      typed,
      slideImportSource(decksDir, typed.sourceDeckId, targetDir),
    );
  });
}

/** The layout of `slide set-layout`: `--layout <json>`, or `--type` with the layout's options as flags. */
export function layoutFromFlags(ctx: CommandContext): Layout {
  const raw = flagString(ctx.args, 'layout');
  let candidate: unknown;
  if (raw !== undefined) {
    candidate = parseValue(raw);
  } else {
    const type = flagString(ctx.args, 'type');
    if (type === undefined)
      throw new UsageError(`slide set-layout needs --type or --layout\n${USAGE}`);
    const record: Record<string, unknown> = { type };
    const ratio = flagString(ctx.args, 'ratio');
    if (ratio !== undefined) record.ratio = parseValue(ratio);
    const gap = flagString(ctx.args, 'gap');
    if (gap !== undefined) record.gap = Number(gap);
    const head = flagString(ctx.args, 'head');
    if (head !== undefined) record.head = head === 'single' ? 'single' : { cols: head };
    const align = flagString(ctx.args, 'align');
    if (align !== undefined) record.align = align;
    const body = flagString(ctx.args, 'body');
    if (body !== undefined) record.body = { align: body };
    candidate = record;
  }
  const parsed = layoutSchema.safeParse(candidate);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new UsageError(
      `the layout is invalid at /${first?.path.map(String).join('/') ?? ''}: ${first?.message ?? 'invalid'}\n${USAGE}`,
    );
  }
  return parsed.data;
}

async function slideSetLayoutCommand(ctx: CommandContext): Promise<number> {
  const slideId = requirePositional(ctx, 0, USAGE);
  const layout = layoutFromFlags(ctx);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    slideSetLayout(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      layout,
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  printSlideResult(ctx, `set layout ${layout.type} on`, result);
  return 0;
}

async function slidePut(ctx: CommandContext): Promise<number> {
  const slideId = requirePositional(ctx, 0, USAGE);
  const document = await readDocumentInput(ctx, 'the slide');
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    slideReplace(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      baseRevision: await baseRevision(ctx, store),
      // The reducer validates the slide against the schema; a bad document is a TypeError.
      slide: document as never,
    }),
  );
  printSlideResult(ctx, 'replaced', result);
  return 0;
}

/** `--set /path=value` pairs and `--unset /path` flags as slide.set mutations. */
export function patchMutations(ctx: CommandContext, slideId: string): Mutation[] {
  const mutations: Mutation[] = [];
  for (const pair of flagAll(ctx.args, 'set')) {
    const eq = pair.indexOf('=');
    if (eq <= 0) throw new UsageError(`--set wants <pointer>=<value>, got ${pair}`);
    mutations.push({
      op: 'slide.set',
      slideId,
      path: pair.slice(0, eq),
      value: parseValue(pair.slice(eq + 1)),
    });
  }
  for (const path of flagAll(ctx.args, 'unset')) mutations.push({ op: 'slide.set', slideId, path });
  return mutations;
}

async function slidePatch(ctx: CommandContext): Promise<number> {
  const slideId = requirePositional(ctx, 0, USAGE);
  let mutations = patchMutations(ctx, slideId);
  if (flagBoolean(ctx.args, 'mutations') || flagString(ctx.args, 'file') !== undefined) {
    const raw = await readDocumentInput(ctx, 'the mutation list');
    const parsed = mutationSchema.array().min(1).safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new UsageError(
        `the mutation list is invalid at /${first?.path.map(String).join('/') ?? ''}: ${first?.message ?? 'invalid'}`,
      );
    }
    mutations = [...mutations, ...parsed.data];
  }
  if (mutations.length === 0)
    throw new UsageError(`slide patch needs --set, --unset or a mutation list\n${USAGE}`);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    slideUpdate(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      baseRevision: await baseRevision(ctx, store),
      mutations,
    }),
  );
  printSlideResult(ctx, 'patched', result);
  return 0;
}

async function slideInsertCommand(ctx: CommandContext): Promise<number> {
  const sectionId = flagString(ctx.args, 'section');
  if (sectionId === undefined) throw new UsageError(`slide insert needs --section\n${USAGE}`);
  const after = flagString(ctx.args, 'after');
  const document = await readDocumentInput(ctx, 'the slide');
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    slideInsert(storeDeps(ctx, store), writeContext(ctx), {
      sectionId,
      ...(after !== undefined ? { after } : {}),
      baseRevision: await baseRevision(ctx, store),
      slide: document as never,
    }),
  );
  ctx.out.result(result);
  ctx.out.human(
    `inserted ${result.slide.id} in ${sectionId}${after !== undefined ? ` after ${after}` : ' first'}: revision ${result.revision}`,
  );
  return 0;
}

async function slideRemoveCommand(ctx: CommandContext): Promise<number> {
  const slideId = requirePositional(ctx, 0, USAGE);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    slideRemove(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  ctx.out.result(result);
  ctx.out.human(`removed ${slideId}: revision ${result.revision}`);
  return 0;
}

async function slideMoveCommand(ctx: CommandContext): Promise<number> {
  const slideId = requirePositional(ctx, 0, USAGE);
  const sectionId = flagString(ctx.args, 'to');
  if (sectionId === undefined) throw new UsageError(`slide move needs --to <sectionId>\n${USAGE}`);
  const after = flagString(ctx.args, 'after');
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    slideMove(storeDeps(ctx, store), writeContext(ctx), {
      slideId,
      sectionId,
      ...(after !== undefined ? { after } : {}),
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  ctx.out.result(result);
  ctx.out.human(
    `moved ${slideId} to ${sectionId}${after !== undefined ? ` after ${after}` : ' first'}: revision ${result.revision}`,
  );
  return 0;
}
