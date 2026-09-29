// The tailoring pass from the shell (docs/POLISH.md item 119; the action table's `deck.tailor`
// usage): `turboslide tailor --replace <from>=<to> [--replace ...] --skip <slideId> --logo
// <assetId> --logo-alt <replaceAlt>` runs the same `deckTailor` the editor's Tools > Tailor for a
// customer runs, one write labelled "Tailor for <name>", and prints the counts.
import { flagAll, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { UsageError } from '../exit.ts';
import { deckTailor } from '../store-actions.ts';
import { baseRevision, openStore, runAction, storeDeps, writeContext } from '../write.ts';

const USAGE = `usage: turboslide tailor --replace <from>=<to> [--replace <from>=<to>] [--skip <slideId>] [--logo <assetId> [--logo-alt <word>]]
  --replace <from>=<to>   the customer name as the deck spells it, and the name that takes its place (up to 20)
  --skip <slideId>        a slide to skip (repeatable)
  --logo <assetId>        the asset every picture whose alt text names --logo-alt takes
  --logo-alt <word>       the word the pictures' alt text names (with --logo)`;

/** `Acme=Globex` into a replacement pair; a pair without `=` is a usage error. */
export function parseReplacement(raw: string): { from: string; to: string } {
  const at = raw.indexOf('=');
  if (at <= 0) throw new UsageError(`--replace wants <from>=<to>, got "${raw}"\n${USAGE}`);
  return { from: raw.slice(0, at), to: raw.slice(at + 1) };
}

export async function tailor(ctx: CommandContext): Promise<number> {
  const replacements = flagAll(ctx.args, 'replace').map(parseReplacement);
  const skip = flagAll(ctx.args, 'skip');
  const logo = flagString(ctx.args, 'logo');
  const logoAlt = flagString(ctx.args, 'logo-alt');
  if (replacements.length === 0 && skip.length === 0 && logo === undefined)
    throw new UsageError(`tailor needs --replace, --skip or --logo\n${USAGE}`);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    deckTailor(storeDeps(ctx, store), writeContext(ctx), {
      ...(replacements.length > 0 ? { replacements } : {}),
      ...(skip.length > 0 ? { skip } : {}),
      ...(logo !== undefined
        ? { logo: { assetId: logo, ...(logoAlt === undefined ? {} : { replaceAlt: logoAlt }) } }
        : {}),
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  ctx.out.result(result);
  ctx.out.human(
    `${result.replacements} replacement${result.replacements === 1 ? '' : 's'} on ${result.slideIds.length} slide${result.slideIds.length === 1 ? '' : 's'}, ${result.pictures} picture${result.pictures === 1 ? '' : 's'} swapped, ${result.skipped.length} skipped; revision ${result.revision}`,
  );
  return 0;
}
