// import.run (SPEC 7.1, 9): `turboslide import <from> --into <id> --json` runs the importer and
// prints its report ({ slides, sections, htmlBlocks, ... }); the deck lands in decks/<id>/ under
// the repository root (or the working directory outside a repository).
import { join, resolve } from 'node:path';

import { flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { repoRootFor } from '../deck-files.ts';
import { importDeck } from '../deps/import.ts';
import { UsageError } from '../exit.ts';

export async function importCommand(ctx: CommandContext): Promise<number> {
  const from = ctx.rest[0];
  const into = flagString(ctx.args, 'into');
  if (!from || !into) {
    throw new UsageError(
      'usage: turboslide import <prototemplate-deck-dir> --into <deckId> [--json]',
    );
  }
  const decksDir = flagString(ctx.args, 'decks') ?? join(repoRootFor(ctx.cwd) ?? ctx.cwd, 'decks');
  const report = importDeck(resolve(ctx.cwd, from), into, decksDir);
  ctx.out.result(report);
  ctx.out.human(
    `import: ${report.slides} slides, ${report.sections} sections, ${report.htmlBlocks} html escape block(s), ${report.assets} assets -> ${join(decksDir, into)}`,
  );
  for (const w of report.warnings) ctx.out.warn(`import: ${w}`);
  return 0;
}
