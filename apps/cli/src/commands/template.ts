// The template and building block commands (gslides-parity SPEC-5 4.3 to 4.6; MILESTONES-5 B3 day
// 7): `template list` (template.list), `template slides <id>` (template.slides), `blocks list
// [--category <c>]` (buildingBlock.list) and `blocks insert <slideId> <id> [--at x,y]`
// (buildingBlock.insert), plus `theme import <file|--deck-id <id>> [--index <n>]` (theme.import)
// for the theme command's route. With `--to <url>` every one runs on the hosted studio through
// runDeckAction; on a checkout the lane's functions run over the import bridge composed here
// (`importLaneDeps` over the decks folder), so the commands work before the integrator's
// composition of `LaneDeps.imports` lands (b3.md request B3-7). The routes in cli.ts are the
// integrator's lines (B3-20).
import { importLaneDeps } from '@turboslide/import/lane-node';
import { BUILDING_BLOCK_CATEGORIES } from '@turboslide/schema/building-blocks';
import type { BuildingBlockCategory } from '@turboslide/schema/building-blocks';

import { themeImport } from '../actions/import.ts';
import type { ThemeImportResult } from '../actions/import.ts';
import {
  buildingBlockInsert,
  buildingBlockList,
  templateList,
  templateSlides,
} from '../actions/templates.ts';
import type { BuildingBlockInsertResult } from '../actions/templates.ts';
import { flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { remoteOf, runDeckAction } from '../dispatch.ts';
import { UsageError } from '../exit.ts';
import { baseRevision, openStore, storeDeps, writeContext } from '../write.ts';
import { decksDirFor } from './deck.ts';

export const TEMPLATE_USAGE = `usage: turboslide template <list|slides> ...
  template list                     the template index: id, name, category, slides, theme (template.list)
  template slides <id>              one template's slides with their titles (template.slides)`;

export const BLOCKS_USAGE = `usage: turboslide blocks <list|insert> ...
  blocks list [--category <c>]      the building blocks by category: ${BUILDING_BLOCK_CATEGORIES.join(', ')} (buildingBlock.list)
  blocks insert <slideId> <id> [--at <x,y>]
                                    a building block's blocks as one group on the slide, at the content box or the point (buildingBlock.insert)
Every write takes --base-revision <n>, --author <name>, --note <text> and --json.`;

export const THEME_IMPORT_USAGE = `usage: turboslide theme import <file.pptx> [--index <themeIndex>] | theme import --deck-id <id> [--index <n>]
  appends one theme record to In this presentation, at most five (theme.import)`;

/** The lane deps over the checkout's deck and decks folder, with the import bridge composed locally. */
function laneDeps(ctx: CommandContext) {
  const store = openStore(ctx);
  return {
    store,
    deps: {
      ...storeDeps(ctx, store),
      imports: importLaneDeps({ decksDir: decksDirFor(ctx), cwd: ctx.cwd, allowPaths: true }),
    },
  };
}

export async function template(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  switch (sub) {
    case 'list': {
      const answer =
        remoteOf(ctx) !== undefined
          ? await runDeckAction<ReturnType<typeof templateList>>(ctx, 'template.list', {})
          : templateList(laneDeps(ctx).deps);
      ctx.out.result(answer);
      for (const row of answer.templates)
        ctx.out.human(
          `${row.id.padEnd(22)} ${row.name.padEnd(24)} ${row.category.padEnd(10)} ${String(row.slides).padStart(3)} slide(s)  ${row.theme}`,
        );
      return 0;
    }
    case 'slides': {
      const id = rest[0];
      if (!id) throw new UsageError(TEMPLATE_USAGE);
      const answer =
        remoteOf(ctx) !== undefined
          ? await runDeckAction<ReturnType<typeof templateSlides>>(ctx, 'template.slides', { id })
          : templateSlides(laneDeps(ctx).deps, { id });
      ctx.out.result(answer);
      for (const row of answer.slides)
        ctx.out.human(
          `${String(row.index).padStart(3)}  ${row.slideId.padEnd(24)} ${row.kind.padEnd(10)} ${row.title}`,
        );
      return 0;
    }
    default:
      throw new UsageError(TEMPLATE_USAGE);
  }
}

function categoryFlag(ctx: CommandContext): BuildingBlockCategory | undefined {
  const value = flagString(ctx.args, 'category');
  if (value === undefined) return undefined;
  if (!(BUILDING_BLOCK_CATEGORIES as ReadonlyArray<string>).includes(value))
    throw new UsageError(
      `--category wants one of ${BUILDING_BLOCK_CATEGORIES.join(', ')}, got ${value}\n${BLOCKS_USAGE}`,
    );
  return value as BuildingBlockCategory;
}

export async function blocks(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  switch (sub) {
    case 'list': {
      const category = categoryFlag(ctx);
      const input = category === undefined ? {} : { category };
      const answer =
        remoteOf(ctx) !== undefined
          ? await runDeckAction<ReturnType<typeof buildingBlockList>>(
              ctx,
              'buildingBlock.list',
              input,
            )
          : buildingBlockList(laneDeps(ctx).deps, input);
      ctx.out.result(answer);
      for (const row of answer.blocks)
        ctx.out.human(
          `${row.id.padEnd(36)} ${row.label.padEnd(28)} ${row.box[0]} by ${row.box[1]}`,
        );
      return 0;
    }
    case 'insert': {
      const [slideId, id] = rest;
      if (!slideId || !id) throw new UsageError(BLOCKS_USAGE);
      const atFlag = flagString(ctx.args, 'at');
      let at: [number, number] | undefined;
      if (atFlag !== undefined) {
        const parts = atFlag.split(',').map((part) => Number(part.trim()));
        if (parts.length !== 2 || parts.some((part) => !Number.isFinite(part)))
          throw new UsageError(`--at wants x,y in sheet px, got ${atFlag}\n${BLOCKS_USAGE}`);
        at = [parts[0] as number, parts[1] as number];
      }
      let answer: BuildingBlockInsertResult;
      if (remoteOf(ctx) !== undefined) {
        const state = await runDeckAction<{ revision: number }>(ctx, 'deck.info', {});
        answer = await runDeckAction<BuildingBlockInsertResult>(ctx, 'buildingBlock.insert', {
          slideId,
          id,
          ...(at !== undefined ? { at } : {}),
          baseRevision: Number(flagString(ctx.args, 'base-revision') ?? state.revision),
        });
      } else {
        const { store, deps } = laneDeps(ctx);
        answer = await buildingBlockInsert(deps, writeContext(ctx), {
          slideId,
          id,
          ...(at !== undefined ? { at } : {}),
          baseRevision: await baseRevision(ctx, store),
        });
      }
      ctx.out.result(answer);
      ctx.out.human(
        `inserted ${id} on ${slideId} as group ${answer.group} (${answer.blockIds.join(', ')}): revision ${answer.revision}, ${answer.findings.length} finding(s)`,
      );
      return 0;
    }
    default:
      throw new UsageError(BLOCKS_USAGE);
  }
}

/** `theme import`: the subcommand the theme command routes here (B6's `theme.ts`, b3.md request B3-21). */
export async function themeImportCommand(ctx: CommandContext): Promise<number> {
  const file = ctx.rest[0];
  const deckId = flagString(ctx.args, 'deck-id');
  const indexFlag = flagString(ctx.args, 'index');
  const themeIndex = indexFlag === undefined ? undefined : Number(indexFlag);
  if ((file === undefined) === (deckId === undefined)) throw new UsageError(THEME_IMPORT_USAGE);
  if (themeIndex !== undefined && (!Number.isInteger(themeIndex) || themeIndex < 0))
    throw new UsageError(`--index wants a non negative integer\n${THEME_IMPORT_USAGE}`);
  const request = {
    ...(file !== undefined ? { file } : {}),
    ...(deckId !== undefined ? { deckId } : {}),
    ...(themeIndex !== undefined ? { themeIndex } : {}),
  };
  let answer: ThemeImportResult;
  if (remoteOf(ctx) !== undefined) {
    const state = await runDeckAction<{ revision: number }>(ctx, 'deck.info', {});
    answer = await runDeckAction<ThemeImportResult>(ctx, 'theme.import', {
      ...request,
      baseRevision: Number(flagString(ctx.args, 'base-revision') ?? state.revision),
    });
  } else {
    const { store, deps } = laneDeps(ctx);
    answer = await themeImport(deps, writeContext(ctx), {
      ...request,
      baseRevision: await baseRevision(ctx, store),
    });
  }
  ctx.out.result(answer);
  ctx.out.human(
    `imported theme "${answer.record.name}" as record ${answer.index} of ${answer.importedThemes.length}: revision ${answer.revision}`,
  );
  return 0;
}
