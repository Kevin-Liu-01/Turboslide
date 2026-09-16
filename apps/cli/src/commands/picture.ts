// `turboslide picture materialize [<slideIds>] [--prune] [--scale 2] [--dry-run]` (gslides-parity
// SPEC-3 10.4, 10.5, 12 picture.materialize): writes the variant files and records of every
// dithered picture on the named slides, prunes the variants no picture references, or names the
// missing variants without writing. The write path runs the dither pipeline of
// @turboslide/effects (B5's, bound on the CLI once it lands); the dry run and the prune run today.
import { flagBoolean, flagList, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { runDeckAction } from '../dispatch.ts';
import { UsageError } from '../exit.ts';
import type { PictureMaterializeResult } from '../store-actions.ts';
import { baseRevision, openStore } from '../write.ts';

export const PICTURE_USAGE = `usage: turboslide picture materialize [<slideIds>|all] [--prune] [--scale 1|2] [--dry-run] [--clone] [--blocks <id,id>]
  writes the dither variants every export reads (picture.materialize); --dry-run names the missing ones`;

export async function picture(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  if (sub !== 'materialize')
    throw new UsageError(`unknown subcommand "picture ${sub ?? ''}"\n${PICTURE_USAGE}`);
  const ids = rest
    .flatMap((arg) => arg.split(','))
    .map((s) => s.trim())
    .filter(Boolean);
  const slideIds = ids.length === 0 || ids.includes('all') ? 'all' : ids;
  const scaleFlag = flagString(ctx.args, 'scale');
  const scale = scaleFlag === undefined ? undefined : Number(scaleFlag);
  if (scale !== undefined && scale !== 1 && scale !== 2)
    throw new UsageError(`--scale wants 1 or 2\n${PICTURE_USAGE}`);
  const blocks = flagList(ctx.args, 'blocks', []);
  const store = openStore(ctx);
  const result = await runDeckAction<PictureMaterializeResult>(ctx, 'picture.materialize', {
    slideIds,
    ...(blocks.length > 0 ? { blockIds: blocks } : {}),
    ...(flagBoolean(ctx.args, 'prune') ? { prune: true } : {}),
    ...(scale !== undefined ? { scale } : {}),
    ...(flagBoolean(ctx.args, 'dry-run') ? { dryRun: true } : {}),
    // the 320 px twin variant of every picture that lacks one (gslides-parity SPEC-5 11; b2.md R17)
    ...(flagBoolean(ctx.args, 'clone') ? { clone: true } : {}),
    baseRevision: await baseRevision(ctx, store),
  });
  ctx.out.result(result);
  ctx.out.human(
    `revision ${result.revision}: ${result.written.length} written, ${result.pruned.length} pruned, ${result.missing.length} missing`,
  );
  for (const row of result.missing)
    ctx.out.human(
      `  missing ${row.slideId}#${row.blockId} (${row.assetId}, ${row.key.slice(0, 12)})`,
    );
  for (const row of result.written)
    ctx.out.human(`  wrote ${row.assetId} ${row.key.slice(0, 12)}: ${row.files.join(', ')}`);
  return 0;
}
