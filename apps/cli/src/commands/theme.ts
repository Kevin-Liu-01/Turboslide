// The theme and layout commands (gslides-parity SPEC-5 9.4, 13; R03 4.8; MILESTONES-5 B6 day 5):
// `theme get` reads the deck's theme id, its edit record, its imported records and its custom
// layouts (theme.get); `theme set <path> <value>` writes one field of the edit record by JSON
// pointer, the value read as JSON then as a string, `--unset` removing it (theme.set); `theme
// rename <name>` (theme.rename); `theme reset [<path>]` (theme.reset); `theme apply-imported
// <index>` (theme.applyImported). `layout list`, `layout create --from <id> --name <name>`,
// `layout duplicate <id>`, `layout rename <id> <name>`, `layout delete <id> --confirm` and
// `layout placeholder <layoutId> <blockId> <kind|none>` are the six layout actions. The routes in
// cli.ts are the integrator's lines (b6.md request R8); every write takes --base-revision <n>,
// --author <name>, --note <text> and --json.
import { flagBoolean, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { runDeckAction } from '../dispatch.ts';
import { UsageError } from '../exit.ts';
import { baseRevision, openStore } from '../write.ts';
import { themeImportCommand } from './template.ts';

export const THEME_USAGE = `usage: turboslide theme <get|set|rename|reset|apply-imported> ...
  theme get                         the theme id, the edit record, the imported records and the custom layouts (theme.get)
  theme set <path> <value>          write one field of the edit record by JSON pointer, the value read as JSON then
                                    as a string: theme set /colors/light/ink '#101010', theme set /frame/crosses false,
                                    theme set /mark '{"kind":"picture","assetId":"acme-mark"}', theme set /fonts/text roboto (theme.set)
  theme set <path> --unset          remove the field
  theme rename <name>               the edited theme's name, shown under In this presentation (theme.rename)
  theme reset [<path>]              remove one field, or the whole record without a path (theme.reset)
  theme apply-imported <index>      write an imported record's colours and faces into the edit record (theme.applyImported)
Every write takes --base-revision <n>, --author <name>, --note <text> and --json.`;

export const LAYOUT_USAGE = `usage: turboslide layout <list|create|duplicate|rename|delete|placeholder> ...
  layout list                       the 21 built in layouts and the custom ones, with hidden and placeholders (layout.list)
  layout create --name <name> [--from <layoutId>]
                                    a custom layout from a built in or custom layout's blocks, blank without --from (layout.create)
  layout duplicate <id>             a copy under a new id and name (layout.duplicate)
  layout rename <id> <name>         a custom layout's display name (layout.rename)
  layout delete <id> --confirm      remove a custom layout, or hide a built in one (layout.delete)
  layout placeholder <layoutId> <blockId> <title|subtitle|body|slideNumber|picture|none>
                                    mark a block of a custom layout as a placeholder, none clearing it (layout.setPlaceholder)
Every write takes --base-revision <n>, --author <name>, --note <text> and --json.`;

/** The value of `theme set`: JSON when it parses (false, 64, {"kind":"none"}), the string otherwise. */
export function parseThemeValue(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function describe(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** The base revision of a write: the flag, else the checkout's current revision; a `--to` studio reads its own. */
async function base(ctx: CommandContext): Promise<number> {
  const flag = flagString(ctx.args, 'base-revision');
  if (flag !== undefined || flagString(ctx.args, 'to') === undefined)
    return baseRevision(ctx, openStore(ctx));
  const state = await runDeckAction<{ revision: number }>(ctx, 'deck.info', {});
  return state.revision;
}

export async function theme(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  switch (sub) {
    /* `theme import` is B3's (b3.md B3-21): the one line the integrator added at merge 2 */
    case 'import':
      return themeImportCommand({ ...ctx, rest });
    case 'get': {
      const answer = await runDeckAction<{
        theme: string;
        themeEdits?: Record<string, unknown>;
        importedThemes?: { name: string }[];
        customLayouts?: Record<string, { displayName?: string; name?: string; hidden?: boolean }>;
      }>(ctx, 'theme.get', {});
      ctx.out.result(answer);
      ctx.out.human(`theme ${answer.theme}`);
      ctx.out.human(
        answer.themeEdits === undefined
          ? 'edits none'
          : `edits ${JSON.stringify(answer.themeEdits)}`,
      );
      for (const record of answer.importedThemes ?? []) ctx.out.human(`imported ${record.name}`);
      for (const [id, layout] of Object.entries(answer.customLayouts ?? {}))
        ctx.out.human(
          layout.hidden === true
            ? `layout ${id} (hidden)`
            : `layout ${id} ${layout.displayName ?? layout.name ?? ''}`,
        );
      return 0;
    }
    case 'set': {
      const path = rest[0];
      if (path === undefined || path === '')
        throw new UsageError(`theme set wants a JSON pointer\n${THEME_USAGE}`);
      const unset = flagBoolean(ctx.args, 'unset');
      const raw = rest[1];
      if (!unset && raw === undefined)
        throw new UsageError(
          `theme set ${path} wants a value, or --unset to remove the field\n${THEME_USAGE}`,
        );
      if (unset && raw !== undefined)
        throw new UsageError(`theme set takes a value or --unset, not both\n${THEME_USAGE}`);
      const answer = await runDeckAction<{ path: string; revision: number }>(ctx, 'theme.set', {
        path,
        ...(unset ? {} : { value: parseThemeValue(raw ?? '') }),
        baseRevision: await base(ctx),
      });
      ctx.out.result(answer);
      ctx.out.human(
        unset
          ? `${path} removed at revision ${answer.revision}`
          : `${path} ${describe(parseThemeValue(raw ?? ''))} at revision ${answer.revision}`,
      );
      return 0;
    }
    case 'rename': {
      const name = rest.join(' ').trim();
      if (name === '') throw new UsageError(`theme rename wants a name\n${THEME_USAGE}`);
      const answer = await runDeckAction<{ name: string; revision: number }>(ctx, 'theme.rename', {
        name,
        baseRevision: await base(ctx),
      });
      ctx.out.result(answer);
      ctx.out.human(`theme named ${answer.name} at revision ${answer.revision}`);
      return 0;
    }
    case 'reset': {
      const path = rest[0];
      const answer = await runDeckAction<{ revision: number }>(ctx, 'theme.reset', {
        ...(path !== undefined && path !== '' ? { path } : {}),
        baseRevision: await base(ctx),
      });
      ctx.out.result(answer);
      ctx.out.human(
        `${path === undefined || path === '' ? 'the theme edits' : path} reset at revision ${answer.revision}`,
      );
      return 0;
    }
    case 'apply-imported': {
      const index = Number(rest[0]);
      if (!Number.isInteger(index) || index < 0)
        throw new UsageError(`theme apply-imported wants a record index\n${THEME_USAGE}`);
      const answer = await runDeckAction<{ revision: number }>(ctx, 'theme.applyImported', {
        index,
        baseRevision: await base(ctx),
      });
      ctx.out.result(answer);
      ctx.out.human(`imported theme ${index} applied at revision ${answer.revision}`);
      return 0;
    }
    default:
      throw new UsageError(THEME_USAGE);
  }
}

export async function layout(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  switch (sub) {
    case 'list': {
      const answer = await runDeckAction<{
        layouts: {
          id: string;
          name: string;
          builtIn: boolean;
          hidden: boolean;
          placeholders: string[];
        }[];
      }>(ctx, 'layout.list', {});
      ctx.out.result(answer);
      for (const row of answer.layouts)
        ctx.out.human(
          `${row.id.padEnd(24)} ${row.name.padEnd(24)} ${row.builtIn ? 'built in' : 'custom'}${row.hidden ? ' hidden' : ''}${
            row.placeholders.length > 0 ? ` ${row.placeholders.join(', ')}` : ''
          }`,
        );
      return 0;
    }
    case 'create': {
      const name = flagString(ctx.args, 'name');
      if (name === undefined || name === '')
        throw new UsageError(`layout create wants --name\n${LAYOUT_USAGE}`);
      const from = flagString(ctx.args, 'from');
      const answer = await runDeckAction<{ id: string; revision: number }>(ctx, 'layout.create', {
        name,
        ...(from !== undefined ? { from } : {}),
        baseRevision: await base(ctx),
      });
      ctx.out.result(answer);
      ctx.out.human(`${answer.id} at revision ${answer.revision}`);
      return 0;
    }
    case 'duplicate': {
      const id = rest[0];
      if (id === undefined)
        throw new UsageError(`layout duplicate wants a layout id\n${LAYOUT_USAGE}`);
      const answer = await runDeckAction<{ id: string; revision: number }>(
        ctx,
        'layout.duplicate',
        {
          id,
          baseRevision: await base(ctx),
        },
      );
      ctx.out.result(answer);
      ctx.out.human(`${answer.id} at revision ${answer.revision}`);
      return 0;
    }
    case 'rename': {
      const id = rest[0];
      const name = rest.slice(1).join(' ').trim();
      if (id === undefined || name === '')
        throw new UsageError(`layout rename wants a layout id and a name\n${LAYOUT_USAGE}`);
      const answer = await runDeckAction<{ id: string; name: string; revision: number }>(
        ctx,
        'layout.rename',
        {
          id,
          name,
          baseRevision: await base(ctx),
        },
      );
      ctx.out.result(answer);
      ctx.out.human(`${answer.id} named ${answer.name} at revision ${answer.revision}`);
      return 0;
    }
    case 'delete': {
      const id = rest[0];
      if (id === undefined)
        throw new UsageError(`layout delete wants a layout id\n${LAYOUT_USAGE}`);
      if (!flagBoolean(ctx.args, 'confirm'))
        throw new UsageError(`layout delete ${id} wants --confirm\n${LAYOUT_USAGE}`);
      const answer = await runDeckAction<{ id: string; hidden: boolean; revision: number }>(
        ctx,
        'layout.delete',
        {
          id,
          confirm: true,
          baseRevision: await base(ctx),
        },
      );
      ctx.out.result(answer);
      ctx.out.human(
        `${answer.id} ${answer.hidden ? 'hidden' : 'removed'} at revision ${answer.revision}`,
      );
      return 0;
    }
    case 'placeholder': {
      const [layoutId, blockId, kind] = rest;
      if (layoutId === undefined || blockId === undefined || kind === undefined)
        throw new UsageError(
          `layout placeholder wants a layout id, a block id and a kind\n${LAYOUT_USAGE}`,
        );
      const answer = await runDeckAction<{ revision: number }>(ctx, 'layout.setPlaceholder', {
        layoutId,
        blockId,
        placeholder: kind === 'none' ? null : kind,
        baseRevision: await base(ctx),
      });
      ctx.out.result(answer);
      ctx.out.human(
        `${layoutId}#${blockId} ${kind === 'none' ? 'cleared' : kind} at revision ${answer.revision}`,
      );
      return 0;
    }
    default:
      throw new UsageError(LAYOUT_USAGE);
  }
}
