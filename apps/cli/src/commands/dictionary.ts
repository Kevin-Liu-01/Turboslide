// The dictionary commands (gslides-parity SPEC-5 7.2, 7.4, 13; R10 4.9, 8; MILESTONES-5 B5):
// `dictionary add <word>`, `remove <word>` and `list` over the caller's personal dictionary (the
// principal record, and `.turboslide/dictionary.txt` on a checkout), record writes with no
// revision; `dictionary lookup <word> [--language <tag>]` answers the Wiktionary page of the
// deck's language and, on a hosted studio that proxies definitions, the definitions per part of
// speech with their attribution. The route is a one line request in cli.ts (b5.md request 2).
import { flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { runDeckAction } from '../dispatch.ts';
import { UsageError } from '../exit.ts';
import { requirePositional } from '../write.ts';

export const DICTIONARY_USAGE = `usage: turboslide dictionary <add|remove|list|lookup> ...
  dictionary add <word>             a word the spell check skips from now on (dictionary.add)
  dictionary remove <word>          remove a word (dictionary.remove)
  dictionary list                   the words of your personal dictionary (dictionary.list)
  dictionary lookup <word> [--language <tag>]
                                    the Wiktionary page and, hosted with the proxy on, the definitions (dictionary.lookup)
Every command takes --to <studio>, --author <name> and --json.`;

type Lookup = {
  word: string;
  url: string;
  definitions?: { partOfSpeech: string; definitions: string[] }[];
  attribution?: string;
};

export async function dictionary(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  const scoped = { ...ctx, rest };
  switch (sub) {
    case 'add':
    case 'remove': {
      const word = requirePositional(scoped, 0, DICTIONARY_USAGE);
      const answer = await runDeckAction<{ dictionary: string[] }>(
        ctx,
        sub === 'add' ? 'dictionary.add' : 'dictionary.remove',
        { word },
      );
      ctx.out.result(answer);
      ctx.out.human(
        `${sub === 'add' ? 'Added' : 'Removed'} ${word}; ${answer.dictionary.length} word${answer.dictionary.length === 1 ? '' : 's'}`,
      );
      return 0;
    }
    case 'list': {
      const answer = await runDeckAction<{ dictionary: string[] }>(ctx, 'dictionary.list', {});
      ctx.out.result(answer);
      ctx.out.human(
        answer.dictionary.length === 0
          ? 'No words in your personal dictionary'
          : answer.dictionary.join('\n'),
      );
      return 0;
    }
    case 'lookup': {
      const word = requirePositional(scoped, 0, DICTIONARY_USAGE);
      const language = flagString(ctx.args, 'language');
      const answer = await runDeckAction<Lookup>(ctx, 'dictionary.lookup', {
        word,
        ...(language === undefined ? {} : { language }),
      });
      ctx.out.result(answer);
      ctx.out.human(`${answer.word}  ${answer.url}`);
      for (const entry of answer.definitions ?? []) {
        ctx.out.human(entry.partOfSpeech);
        entry.definitions.forEach((definition, index) =>
          ctx.out.human(`  ${index + 1}. ${definition}`),
        );
      }
      if (answer.attribution !== undefined) ctx.out.human(answer.attribution);
      return 0;
    }
    default:
      throw new UsageError(DICTIONARY_USAGE);
  }
}
