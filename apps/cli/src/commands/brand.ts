// The brand kit commands (docs/PRODUCT.md 4.1; B5a): `turboslide brand get`, `turboslide brand set
// <path> <value>` (a JSON value or a bare string; `--unset` removes the field) and `turboslide brand
// reset [path]`, each the CLI transport of brand.get, brand.set and brand.reset over the checkout's
// deck folder (brand-actions.ts), so the CLI, the MCP server, the HTTP route and the editor run
// one implementation. With `--to <studio>` the action runs on the hosted studio (dispatch.ts).
import type { CommandContext } from '../context.ts';
import { UsageError } from '../exit.ts';
import { runDeckAction } from '../dispatch.ts';
import { openStore } from '../write.ts';
import { baseRevision } from '../write.ts';
import type { BrandGetResult, BrandResetResult, BrandSetResult } from '../brand-actions.ts';

const USAGE = `usage:
  turboslide brand get
  turboslide brand set <path> <value>       a JSON value or a bare string; --unset removes the field
  turboslide brand reset [path]             the whole record, or one field
paths: /colors/<light|dark>/<text|background|caption|hint|primary|accent>, /fonts/<display|text>,
  /mark, /footer/<logo|assetId|text>, /counter/<show|format|skipTitle>, /frame/<rails|rules|crosses>,
  /positions/<mark|footerLogo>, /lexicon, /appearance, /name`;

/** A value as JSON when it parses, else the bare string (a hex, a face id, a word). */
function parseValue(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

async function revisionOf(ctx: CommandContext): Promise<number> {
  const store = openStore(ctx);
  return baseRevision(ctx, store);
}

export async function brand(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  const inner = { ...ctx, rest };
  switch (sub) {
    case 'get': {
      const result = await runDeckAction<BrandGetResult>(inner, 'brand.get', {});
      ctx.out.result(result);
      ctx.out.human(
        result.own
          ? `brand kit: ${Object.keys(result.brand).join(', ') || 'an empty record'} (revision ${result.revision})`
          : `brand kit: none of its own; the deck reads the deployment's default kit (revision ${result.revision})`,
      );
      return 0;
    }
    case 'set': {
      const unset = ctx.args.flags['unset'] !== undefined;
      const path = rest[0];
      const raw = rest[1];
      if (path === undefined) throw new UsageError(`brand set needs a path\n${USAGE}`);
      if (!unset && raw === undefined)
        throw new UsageError(
          `brand set ${path} needs a value, or --unset to remove the field\n${USAGE}`,
        );
      const result = await runDeckAction<BrandSetResult>(inner, 'brand.set', {
        path,
        ...(unset || raw === undefined ? {} : { value: parseValue(raw) }),
        baseRevision: await revisionOf(inner),
      });
      ctx.out.result(result);
      ctx.out.human(
        'value' in result
          ? `set ${result.path} to ${JSON.stringify(result.value)}: revision ${result.revision}`
          : `removed ${result.path}: revision ${result.revision}`,
      );
      return 0;
    }
    case 'reset': {
      const path = rest[0];
      const result = await runDeckAction<BrandResetResult>(inner, 'brand.reset', {
        ...(path === undefined ? {} : { path }),
        baseRevision: await revisionOf(inner),
      });
      ctx.out.result(result);
      ctx.out.human(
        result.changed
          ? `${path === undefined ? 'the brand kit' : path} reset: revision ${result.revision}`
          : 'nothing to reset',
      );
      return 0;
    }
    default:
      throw new UsageError(`unknown subcommand "brand ${sub ?? ''}"\n${USAGE}`);
  }
}
