// The template commands (docs/PRODUCT.md 4.3; build/b5b.md R3): `turboslide template list`,
// `template slides <id>`, `template create <deckId> <name> [--sentence <s>]`, `template update <id>
// <deckId> [--sentence <s>]`, `template rename <id> <name>`, `template delete <id> --confirm` and
// `template default <id>`, each the CLI transport of one template.* action over the checkout's
// decks folder (commands/deck.ts registerDeckActions), so the CLI, the MCP server, the HTTP route
// and the gallery page run one implementation (@turboslide/store/templates). With `--to <studio>`
// the action runs on the hosted studio (dispatch.ts); the three deckless writes need an agent
// token with the admin scope there.
import type { TemplateIndexEntry } from '@turboslide/schema/actions';
import type { TemplateSlideRow, TemplateWriteResult } from '@turboslide/store/templates';

import { flagBoolean, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { runDeckAction } from '../dispatch.ts';
import { UsageError } from '../exit.ts';
import { baseRevision, openStore } from '../write.ts';

const USAGE = `usage:
  turboslide template list
  turboslide template slides <id>
  turboslide template create <deckId> <name> [--sentence <sentence>]
  turboslide template update <id> <deckId> [--sentence <sentence>]
  turboslide template rename <id> <name>
  turboslide template delete <id> --confirm
  turboslide template default <id>          blank restores the blank deck Turboslide ships`;

type ListAnswer = { templates: TemplateIndexEntry[]; default: string };
type SlidesAnswer = { id: string; name: string; slides: TemplateSlideRow[] };

/** The deck's revision for the two writes that base on a deck (create and update). */
async function revisionOf(ctx: CommandContext): Promise<number> {
  const store = openStore(ctx);
  return baseRevision(ctx, store);
}

function positional(rest: string[], at: number, what: string): string {
  const value = rest[at];
  if (value === undefined || value === '') throw new UsageError(`template needs ${what}\n${USAGE}`);
  return value;
}

export async function template(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  const inner = { ...ctx, rest };
  switch (sub) {
    case 'list': {
      const answer = await runDeckAction<ListAnswer>(inner, 'template.list', {});
      ctx.out.result(answer);
      for (const row of answer.templates)
        ctx.out.human(
          `${row.id.padEnd(32)} ${String(row.slides).padStart(3)} slides  ${row.organisation === true ? 'your organisation' : 'Turboslide'}${row.id === answer.default ? '  used for new presentations' : ''}  ${row.name}`,
        );
      ctx.out.human(
        `${answer.templates.length} template(s); new presentations start from ${answer.default}`,
      );
      return 0;
    }
    case 'slides': {
      const id = positional(rest, 0, 'a template id');
      const answer = await runDeckAction<SlidesAnswer>(inner, 'template.slides', { id });
      ctx.out.result(answer);
      for (const row of answer.slides)
        ctx.out.human(
          `${String(row.index).padStart(3)}  ${row.slideId.padEnd(24)} ${row.kind.padEnd(10)} ${row.title}`,
        );
      ctx.out.human(`${answer.slides.length} slide(s) in ${answer.name}`);
      return 0;
    }
    case 'create': {
      const deckId = positional(rest, 0, 'the deck id to save');
      const name = positional(rest, 1, 'the template name');
      const sentence = flagString(ctx.args, 'sentence');
      const result = await runDeckAction<TemplateWriteResult>(inner, 'template.create', {
        deckId,
        name,
        ...(sentence === undefined ? {} : { sentence }),
        baseRevision: await revisionOf(inner),
      });
      ctx.out.result(result);
      ctx.out.human(
        `${result.replaced === true ? 'replaced' : 'saved'} the template ${result.id} (${result.name}), ${result.slides} slide(s)`,
      );
      return 0;
    }
    case 'update': {
      const id = positional(rest, 0, 'a template id');
      const deckId = positional(rest, 1, 'the deck id whose slides replace it');
      const sentence = flagString(ctx.args, 'sentence');
      const result = await runDeckAction<TemplateWriteResult>(inner, 'template.update', {
        id,
        deckId,
        ...(sentence === undefined ? {} : { sentence }),
        baseRevision: await revisionOf(inner),
      });
      ctx.out.result(result);
      ctx.out.human(
        `replaced the template ${result.id} (${result.name}), ${result.slides} slide(s)`,
      );
      return 0;
    }
    case 'rename': {
      const id = positional(rest, 0, 'a template id');
      const name = positional(rest, 1, 'the new name');
      const result = await runDeckAction<TemplateWriteResult>(inner, 'template.rename', {
        id,
        name,
      });
      ctx.out.result(result);
      ctx.out.human(`renamed the template ${result.id} to "${result.name}"`);
      return 0;
    }
    case 'delete': {
      const id = positional(rest, 0, 'a template id');
      if (!flagBoolean(ctx.args, 'confirm'))
        throw new UsageError(`template delete removes ${id} for good; pass --confirm\n${USAGE}`);
      const result = await runDeckAction<{ id: string; removed: true }>(inner, 'template.delete', {
        id,
        confirm: true,
      });
      ctx.out.result(result);
      ctx.out.human(`deleted the template ${result.id}`);
      return 0;
    }
    case 'default': {
      const id = positional(rest, 0, 'a template id');
      const result = await runDeckAction<{ default: string; name: string }>(
        inner,
        'template.setDefault',
        { id },
      );
      ctx.out.result(result);
      ctx.out.human(`new presentations start from ${result.name} (${result.default})`);
      return 0;
    }
    default:
      throw new UsageError(`unknown subcommand "template ${sub ?? ''}"\n${USAGE}`);
  }
}
