// The deck commands (SPEC 7.1, 7.2; Kevin's directive for the GT template): `deck create <name>
// --from gt-brand|blank [--id <id>] [--decks <dir>]` makes decks/<id> from the template record
// under decks/templates (deck.create), and `deck rename <name>` sets the title as one deck.set of
// /title through the store (deck.rename). registerDeckActions puts both on the dispatcher for
// `turboslide mcp`, so the CLI, the MCP server and the studio run one implementation
// (@turboslide/store/templates for create, the store's write path for rename).
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import type { ActionContext, Dispatcher } from '@turboslide/agent/dispatch';
import type { DeckTemplateId } from '@turboslide/schema/actions';
import { DECK_TEMPLATES } from '@turboslide/schema/actions';
import { createDeck } from '@turboslide/store/templates';
import type { CreateDeckInput, CreateDeckResult } from '@turboslide/store/templates';

import { flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { repoRootFor } from '../deck-files.ts';
import { UsageError } from '../exit.ts';
import { commit } from '../store-actions.ts';
import type { StoreActionDeps, WriteContext } from '../store-actions.ts';
import {
  baseRevision,
  openStore,
  requirePositional,
  runAction,
  storeDeps,
  writeContext,
} from '../write.ts';

const USAGE = `usage: turboslide deck <create|rename> ...
  deck create <name> --from gt-brand|blank [--id <id>] [--decks <dir>]
                                    decks/<id> from decks/templates/<from> (gt-brand: the GT brand deck, 85 slides) or as one title slide
  deck rename <name>                set the deck title (--deck, --base-revision, --author, --note, --json)`;

export type DeckRenameInput = { name: string; baseRevision: number };
export type DeckRenameResult = { title: string; revision: number };

function isTemplateId(value: string): value is DeckTemplateId {
  return (DECK_TEMPLATES as ReadonlyArray<string>).includes(value);
}

/** The decks folder: --decks, TURBOSLIDE_DECKS_DIR, else <repo root>/decks. */
export function decksDirFor(ctx: CommandContext): string {
  const flag = flagString(ctx.args, 'decks');
  if (flag !== undefined) return resolve(ctx.cwd, flag);
  if (ctx.env.TURBOSLIDE_DECKS_DIR) return resolve(ctx.cwd, ctx.env.TURBOSLIDE_DECKS_DIR);
  const root = repoRootFor(ctx.cwd) ?? ctx.cwd;
  const decks = join(root, 'decks');
  if (!existsSync(decks))
    throw new UsageError(
      `no decks folder at ${decks}; pass --decks <dir> or set TURBOSLIDE_DECKS_DIR`,
    );
  return decks;
}

/** deck.rename as a function from the action's input to its output, over the store. */
export async function deckRename(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: DeckRenameInput,
): Promise<DeckRenameResult> {
  const name = input.name.trim();
  if (name === '') throw new TypeError('deck.rename: name must not be empty');
  const committed = await commit(deps, ctx, input.baseRevision, [
    { op: 'deck.set', path: '/title', value: name },
  ]);
  return { title: committed.document.deck.title, revision: committed.revision };
}

/** Registers deck.create and deck.rename on a dispatcher (the MCP server). */
export function registerDeckActions(
  dispatcher: Dispatcher,
  deps: StoreActionDeps & { decksDir: string },
): void {
  dispatcher.register('deck.create', (input) =>
    createDeck(deps.decksDir, input as CreateDeckInput),
  );
  dispatcher.register('deck.rename', (input, context: ActionContext) =>
    deckRename(deps, context, input as DeckRenameInput),
  );
}

export async function deck(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  const inner = { ...ctx, rest };
  switch (sub) {
    case 'create':
      return create(inner);
    case 'rename':
      return rename(inner);
    default:
      throw new UsageError(`unknown subcommand "deck ${sub ?? ''}"\n${USAGE}`);
  }
}

async function create(ctx: CommandContext): Promise<number> {
  const name = requirePositional(ctx, 0, USAGE);
  const from = flagString(ctx.args, 'from') ?? 'gt-brand';
  if (!isTemplateId(from))
    throw new UsageError(`--from wants ${DECK_TEMPLATES.join(' or ')}, got ${from}\n${USAGE}`);
  const id = flagString(ctx.args, 'id');
  const decksDir = decksDirFor(ctx);
  const result: CreateDeckResult = await runAction(ctx, async () =>
    createDeck(decksDir, { name, from, ...(id !== undefined ? { id } : {}) }),
  );
  ctx.out.result(result);
  ctx.out.human(
    `created ${result.deckId} from ${result.from}: ${result.counts.slides} slides in ${result.counts.sections} sections, ${result.counts.assets} assets, revision ${result.revision}`,
  );
  ctx.out.human(`  ${result.dir}`);
  return 0;
}

async function rename(ctx: CommandContext): Promise<number> {
  const name = requirePositional(ctx, 0, USAGE);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    deckRename(storeDeps(ctx, store), writeContext(ctx), {
      name,
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  ctx.out.result(result);
  ctx.out.human(`renamed the deck to "${result.title}": revision ${result.revision}`);
  return 0;
}

/** The decks folder a per-deck MCP server creates siblings in: the deck directory's parent. */
export function decksDirOfDeck(deckDir: string): string {
  return dirname(deckDir);
}
