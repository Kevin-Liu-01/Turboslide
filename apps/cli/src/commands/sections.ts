// `turboslide sections set < sections.json` (SPEC 7.1 section.set): replaces the section list,
// the only place slide order lives; a whole-deck write that takes no lease.
import { sectionSchema } from '@turboslide/schema/deck';

import type { CommandContext } from '../context.ts';
import { UsageError } from '../exit.ts';
import { sectionSet } from '../store-actions.ts';
import {
  baseRevision,
  openStore,
  readDocumentInput,
  runAction,
  storeDeps,
  writeContext,
} from '../write.ts';

const USAGE = `usage: turboslide sections set [--file sections.json] < sections.json
The document is the sections array: [{ "id", "name", "slideIds": [...] }, ...].
Takes --base-revision <n> (default: the current revision), --author <name>, --note <text> and --json.`;

export async function sections(ctx: CommandContext): Promise<number> {
  const [sub] = ctx.rest;
  if (sub !== 'set') throw new UsageError(`unknown subcommand "sections ${sub ?? ''}"\n${USAGE}`);
  const raw = await readDocumentInput(ctx, 'the sections array');
  const parsed = sectionSchema.array().safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new UsageError(
      `the sections array is invalid at /${first?.path.map(String).join('/') ?? ''}: ${first?.message ?? 'invalid'}`,
    );
  }
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    sectionSet(storeDeps(ctx, store), writeContext(ctx), {
      sections: parsed.data,
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  ctx.out.result(result);
  ctx.out.human(
    `sections set: ${result.sections.map((section) => `${section.id} (${section.slideIds.length})`).join(', ')}; revision ${result.revision}`,
  );
  return 0;
}
