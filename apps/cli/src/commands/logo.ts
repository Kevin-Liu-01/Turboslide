// The logo commands (docs/FEATURES.md 4.11; build/b6.md R11): `turboslide logo search <query>`,
// `turboslide logo insert <slug>` and `turboslide logo refresh`, the CLI transport of logo.search,
// logo.insert and logo.refresh (packages/schema/src/actions.ts), so the CLI, the MCP server, the
// HTTP route and the editor run one implementation (apps/studio/src/server/logos.ts). The index
// and the mark cache are a deployment's, so the three run on the hosted studio `--to <studio>`
// names (`--host <studio>` is the same flag, the spelling the core specs use); on a checkout
// without `--to` the local dispatcher carries no handler and says so. The insert names the
// checkout's deck the way every hosted write does (`--deck <dir>` for the folder, `--base-revision
// <n>` for the hosted deck's revision when the folder is not a pull of it).
import { flagBoolean, flagNumber, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { UsageError } from '../exit.ts';
import { runDeckAction } from '../dispatch.ts';
import { baseRevision, openStore } from '../write.ts';

const USAGE = `usage:
  turboslide logo search <query> [--limit <n>] [--kind symbol|wordmark] [--collection brands|all]
  turboslide logo insert <slug> [--variant <variant>] [--slide <slideId>] [--every-slide] [--kit] [--block <blockId>]
  turboslide logo refresh [--dry-run]
The index lives on the hosted studio: pass --to <studio> (the saved credential or TURBOSLIDE_TOKEN signs the call).`;

/** The rows `logo.search` answers, as much of them as the human line reads. */
export type LogoSearchResult = {
  logos: Array<{ slug: string; title: string; license: string; licenceSentence: string }>;
  updatedAt: string | null;
  indexed: number;
  source: string;
};

export type LogoInsertResult = {
  asset: { id: string };
  blockId?: string;
  slideId?: string;
  revision: number;
  variant: string;
};

export type LogoRefreshResult = {
  icons: number;
  brands: number;
  cachedMarks: number;
  unavailable: number;
  updatedAt: string | null;
  fetched: number;
  dropped: string[];
  dryRun: boolean;
  upstream: string;
};

/** `--host <studio>` reads as `--to <studio>` when `--to` is not given. */
function withHostAlias(ctx: CommandContext): CommandContext {
  const host = flagString(ctx.args, 'host');
  if (host === undefined || flagString(ctx.args, 'to') !== undefined) return ctx;
  return { ...ctx, args: { ...ctx.args, flags: { ...ctx.args.flags, to: host } } };
}

async function revisionOf(ctx: CommandContext): Promise<number> {
  const store = openStore(ctx);
  return baseRevision(ctx, store);
}

function oneOf<T extends string>(
  ctx: CommandContext,
  name: string,
  values: ReadonlyArray<T>,
): T | undefined {
  const raw = flagString(ctx.args, name);
  if (raw === undefined) return undefined;
  if ((values as ReadonlyArray<string>).includes(raw)) return raw as T;
  throw new UsageError(`--${name} wants one of ${values.join(', ')}, got ${raw}\n${USAGE}`);
}

export async function logo(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  const inner = withHostAlias({ ...ctx, rest });
  switch (sub) {
    case 'search': {
      const query = rest.join(' ').trim();
      if (query === '') throw new UsageError(`logo search needs a company name\n${USAGE}`);
      const limit =
        flagString(inner.args, 'limit') === undefined
          ? undefined
          : flagNumber(inner.args, 'limit', 20);
      const kind = oneOf(inner, 'kind', ['symbol', 'wordmark'] as const);
      const collection = oneOf(inner, 'collection', ['brands', 'all'] as const);
      const result = await runDeckAction<LogoSearchResult>(
        inner,
        'logo.search',
        {
          query,
          ...(limit !== undefined ? { limit } : {}),
          ...(kind !== undefined ? { kind } : {}),
          ...(collection !== undefined ? { collection } : {}),
        },
        { hostedOnly: true },
      );
      ctx.out.result(result);
      if (result.logos.length === 0) ctx.out.human(`no logo named ${query} on ${result.source}`);
      for (const row of result.logos)
        ctx.out.human(`${row.title} (${row.slug}): ${row.licenceSentence}`);
      ctx.out.human(
        `${result.logos.length} of ${result.indexed} marks from ${result.source}${result.updatedAt === null ? '' : `, updated ${result.updatedAt}`}`,
      );
      return 0;
    }
    case 'insert': {
      const slug = rest[0];
      if (slug === undefined) throw new UsageError(`logo insert needs a slug\n${USAGE}`);
      const variant = flagString(inner.args, 'variant');
      const slideId = flagString(inner.args, 'slide');
      const blockId = flagString(inner.args, 'block');
      const everySlide = flagBoolean(inner.args, 'every-slide');
      const kit = flagBoolean(inner.args, 'kit');
      const result = await runDeckAction<LogoInsertResult>(inner, 'logo.insert', {
        slug,
        ...(variant !== undefined ? { variant } : {}),
        ...(slideId !== undefined ? { slideId } : {}),
        ...(blockId !== undefined ? { blockId } : {}),
        ...(everySlide ? { everySlide: true } : {}),
        ...(kit ? { kit: true } : {}),
        baseRevision: await revisionOf(inner),
      });
      ctx.out.result(result);
      const where =
        result.blockId !== undefined
          ? `in the box of ${result.blockId}`
          : result.slideId !== undefined
            ? `on slide ${result.slideId}`
            : kit
              ? 'in the brand kit'
              : 'as an asset';
      ctx.out.human(`the ${slug} logo (${result.variant}) ${where}: revision ${result.revision}`);
      return 0;
    }
    case 'refresh': {
      const dryRun = flagBoolean(inner.args, 'dry-run');
      const result = await runDeckAction<LogoRefreshResult>(
        inner,
        'logo.refresh',
        dryRun ? { dryRun: true } : {},
        { hostedOnly: true },
      );
      ctx.out.result(result);
      ctx.out.human(
        `${result.dryRun ? 'dry run: ' : ''}${result.icons} marks (${result.brands} brands), ${result.cachedMarks} cached, ${result.unavailable} unavailable, ${result.dropped.length} dropped, upstream ${result.upstream}${result.updatedAt === null ? ', no complete build yet' : `, updated ${result.updatedAt}`}`,
      );
      return 0;
    }
    default:
      throw new UsageError(USAGE);
  }
}
