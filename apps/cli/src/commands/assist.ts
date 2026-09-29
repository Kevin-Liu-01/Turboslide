// The assistant from the shell (docs/POLISH.md item 119; the action table's `assist.propose` and
// `assist.accept` usages). The assistant's model runs in the studio's server (apps/studio, the
// `assist.propose` and `assist.accept` actions over HTTP and MCP), not in this process: the
// command names the transport that runs it and exits 2, so the usage line the generated skills
// carry names a command that answers instead of "unknown command".
import type { CommandContext } from '../context.ts';
import { EXIT } from '../exit.ts';

const USAGE = `usage: turboslide assist <propose|accept> ...
  assist propose <prompt> --intent <shorter|notes|ask> --slides <slideIds>
  assist accept < card.json`;

/** The sentence the command answers: where the assistant runs and how to reach it. */
export const ASSIST_CLI_SENTENCE =
  'The assistant runs in the studio. Use POST /api/actions/assist.propose and assist.accept on a running studio, or the deck_assist_propose and deck_assist_accept tools over MCP.';

export async function assist(ctx: CommandContext): Promise<number> {
  const sub = ctx.rest[0];
  if (sub !== 'propose' && sub !== 'accept') {
    ctx.out.human(USAGE);
    return EXIT.usage;
  }
  ctx.out.result({ ok: false, command: `assist ${sub}`, message: ASSIST_CLI_SENTENCE });
  ctx.out.human(ASSIST_CLI_SENTENCE);
  return EXIT.usage;
}
