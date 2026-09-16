// The spelling commands (gslides-parity SPEC-5 7.2, 13; R10 4.9; MILESTONES-5 B5): `spelling
// check` walks the deck through the language dictionary and prints the misspellings with their
// suggestions; `spelling replace` writes one range, or every occurrence of the word under
// `--all`, as one write. On a checkout the engine is nspell over the installed dictionary
// packages (`@turboslide/spelling/node`, composed in write.ts); with `--to <studio>` the hosted
// dispatcher's. The route is a one line request in cli.ts (b5.md request 2).
import { flagBoolean, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { runDeckAction } from '../dispatch.ts';
import { UsageError } from '../exit.ts';
import { requirePositional } from '../write.ts';

export const SPELLING_USAGE = `usage: turboslide spelling <check|replace> ...
  spelling check [--slides <id,...>] [--notes] [--alt] [--language <tag>] [--json]
                                    the misspellings of the named slides (every slide when absent), the notes and the
                                    alt texts when asked, with up to five suggestions each (spelling.check)
  spelling replace <slideId>#<blockId> <path> --range <a,b> <text> [--all]
                                    write <text> over the plain range of the Text, or over every occurrence of the
                                    word under --all, as one write (spelling.replace)
Every command takes --to <studio>, --author <name>, --base-revision <n> and --json.`;

type Finding = {
  slideId: string;
  blockId?: string;
  path: string;
  range: [number, number];
  word: string;
  suggestions: string[];
};

function parseRange(raw: string | undefined): [number, number] {
  const match = /^(\d+),(\d+)$/u.exec(raw ?? '');
  if (match === null)
    throw new UsageError(`--range wants two offsets such as 4,9\n${SPELLING_USAGE}`);
  return [Number(match[1]), Number(match[2])];
}

function parseAddress(text: string): { slideId: string; blockId: string } {
  const hash = text.indexOf('#');
  if (hash <= 0 || hash === text.length - 1)
    throw new UsageError(`"${text}" is not a <slideId>#<blockId> address\n${SPELLING_USAGE}`);
  return { slideId: text.slice(0, hash), blockId: text.slice(hash + 1) };
}

export async function spelling(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  switch (sub) {
    case 'check': {
      const slides = flagString(ctx.args, 'slides');
      const language = flagString(ctx.args, 'language');
      const answer = await runDeckAction<{ language: string; misspellings: Finding[] }>(
        ctx,
        'spelling.check',
        {
          ...(slides === undefined
            ? {}
            : {
                slideIds: slides
                  .split(',')
                  .map((id) => id.trim())
                  .filter((id) => id !== ''),
              }),
          ...(flagBoolean(ctx.args, 'notes') ? { notes: true } : {}),
          ...(flagBoolean(ctx.args, 'alt') ? { alt: true } : {}),
          ...(language === undefined ? {} : { language }),
        },
      );
      ctx.out.result(answer);
      if (answer.misspellings.length === 0)
        ctx.out.human(`No misspellings found (${answer.language})`);
      for (const row of answer.misspellings)
        ctx.out.human(
          `${row.slideId}${row.blockId === undefined ? '' : `#${row.blockId}`}${row.path} ${row.range[0]},${row.range[1]}  ${row.word}  ${row.suggestions.join(', ')}`,
        );
      return 0;
    }
    case 'replace': {
      const address = parseAddress(requirePositional({ ...ctx, rest }, 0, SPELLING_USAGE));
      const path = requirePositional({ ...ctx, rest }, 1, SPELLING_USAGE);
      const text = requirePositional({ ...ctx, rest }, 2, SPELLING_USAGE);
      const range = parseRange(flagString(ctx.args, 'range'));
      const baseRevision = flagString(ctx.args, 'base-revision');
      const answer = await runDeckAction<{ replacements: number; revision: number }>(
        ctx,
        'spelling.replace',
        {
          slideId: address.slideId,
          blockId: address.blockId,
          path,
          range,
          text,
          ...(flagBoolean(ctx.args, 'all') ? { all: true } : {}),
          baseRevision:
            baseRevision === undefined ? await currentRevision(ctx) : Number(baseRevision),
        },
      );
      ctx.out.result(answer);
      ctx.out.human(
        `${answer.replacements} replacement${answer.replacements === 1 ? '' : 's'}; revision ${answer.revision}`,
      );
      return 0;
    }
    default:
      throw new UsageError(SPELLING_USAGE);
  }
}

/** The deck's revision for a write without --base-revision, read through deck.info. */
async function currentRevision(ctx: CommandContext): Promise<number> {
  const info = await runDeckAction<{ revision: number }>(ctx, 'deck.info', {});
  return info.revision;
}
