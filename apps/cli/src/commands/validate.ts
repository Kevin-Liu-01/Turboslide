// validate.run (SPEC 7.1, 7.2): issues and the normalized document; exit 2 on any error.
import { resolve } from 'node:path';

import { flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { findDeckDir, loadDeck } from '../deck-files.ts';
import { validateLoadedDeck } from '../deps/schema.ts';
import { EXIT } from '../exit.ts';

export async function validate(ctx: CommandContext): Promise<number> {
  const target = ctx.rest[0];
  const dir = target
    ? findDeckDir(ctx.cwd, resolve(ctx.cwd, target), ctx.env)
    : findDeckDir(ctx.cwd, flagString(ctx.args, 'deck'), ctx.env);
  const loaded = loadDeck(dir);
  const { ok, issues } = validateLoadedDeck(loaded);
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  ctx.out.result({
    dir,
    deckId: loaded.deck.id,
    revision: loaded.deck.revision,
    slides: loaded.order.length,
    sections: loaded.deck.sections.length,
    ok,
    issues,
  });
  for (const issue of issues) {
    ctx.out.human(
      `${issue.severity}  ${issue.file}${issue.pointer ? `#${issue.pointer}` : ''}  ${issue.code}: ${issue.message}`,
    );
  }
  ctx.out.human(
    `${loaded.deck.id}: ${loaded.order.length} slides, ${errors.length} error(s), ${warnings.length} warning(s)`,
  );
  return ok ? EXIT.ok : EXIT.usage;
}
