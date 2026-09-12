// `turboslide text replace <find> <replace> [--match-case] [--slides <id,...>]` (gslides-parity
// SPEC 7.5 text.replaceAll): Google's Edit > Find and replace over the whole deck as one write,
// every Text of every block (the table cells included), the title slide fields and the speaker
// notes; case insensitive unless --match-case. The output counts the replacements and names the
// slides that changed.
import { flagBoolean, flagList } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { UsageError } from '../exit.ts';
import { textReplaceAll } from '../store-actions.ts';
import {
  baseRevision,
  openStore,
  requirePositional,
  runAction,
  storeDeps,
  writeContext,
} from '../write.ts';

const USAGE = `usage: turboslide text replace <find> <replace> [--match-case] [--slides <id,id,...>]
Replaces every occurrence in the deck's visible text and the speaker notes (text.replaceAll).
Takes --base-revision <n> (default: the current revision), --author <name>, --note <text>, --force and --json.`;

export async function text(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  if (sub !== 'replace') throw new UsageError(`unknown subcommand "text ${sub ?? ''}"\n${USAGE}`);
  const inner = { ...ctx, rest };
  const find = requirePositional(inner, 0, USAGE);
  const replace = inner.rest[1] ?? '';
  if (inner.rest[1] === undefined)
    throw new UsageError(`text replace needs a replacement (pass "" to delete)\n${USAGE}`);
  const slideIds = flagList(ctx.args, 'slides', []);
  const matchCase = flagBoolean(ctx.args, 'match-case');
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    textReplaceAll(storeDeps(ctx, store), writeContext(ctx), {
      find,
      replace,
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
