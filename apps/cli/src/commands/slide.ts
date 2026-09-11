// The slide commands (SPEC 7.1, 7.2): `slide get` from M1, and the typed writes slide put
// (slide.replace), patch (slide.update), insert, remove and move, each with --base-revision,
// --author and --json. Documents come from stdin or --file; patch takes --set <pointer>=<value>
// and --unset <pointer>, or a mutation list as JSON.
import type { Mutation } from '@turboslide/schema/mutations';
import { mutationSchema } from '@turboslide/schema/mutations';

import { flagAll, flagBoolean, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { UsageError } from '../exit.ts';
import {
  slideInsert,
  slideMove,
  slideRemove,
  slideReplace,
  slideUpdate,
} from '../store-actions.ts';
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
import { slideGet } from './slides.ts';

const USAGE = `usage: turboslide slide <get|put|patch|insert|remove|move> ...
  slide get <id>
  slide put <id> [--file slide.json] < slide.json
  slide patch <id> --set <pointer>=<value> [--unset <pointer>] | --mutations [--file mutations.json]
  slide insert --section <sectionId> [--after <slideId>] [--file slide.json] < slide.json
  slide remove <id>
  slide move <id> --to <sectionId> [--after <slideId>]
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
    default:
      throw new UsageError(`unknown subcommand "slide ${sub ?? ''}"\n${USAGE}`);
  }
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
