// The command table and dispatcher of the turboslide binary (SPEC 7.2). Every command receives a
// CommandContext and returns an exit code; the two error classes map to exit 1 and 2, anything
// else is reported on stderr with exit 2. runCli is pure over its streams so tests drive it.
import { flagBoolean, flagString, parseArgs } from './args.ts';
import { build } from './commands/build.ts';
import { generate } from './commands/generate.ts';
import { importCommand } from './commands/import.ts';
import { info } from './commands/info.ts';
import { lint } from './commands/lint.ts';
import { render } from './commands/render.ts';
import { sheet } from './commands/sheet.ts';
import { slideGet, slides } from './commands/slides.ts';
import { validate } from './commands/validate.ts';
import { parseAuthor } from './context.ts';
import type { CommandContext } from './context.ts';
import { EXIT, GateError, UsageError } from './exit.ts';
import { createOutput } from './output.ts';
import type { Streams } from './output.ts';

export const USAGE = `turboslide <command> [options]

Commands
  import <dir> --into <id>          import the Prototemplate deck HTML into decks/<id>/
  validate [dir]                    parse, migrate and normalize a deck; exit 2 on errors
  info                              title, theme, sections, counts, revision
  slides [--section <id>]           slide rows with per-slide lint counts
  slide get <id>                    one slide, its assets and its last render records
  render [ids|all] --theme light,dark --scale 1 --out <dir> [--rasters]
                                    PNGs and render.json (RenderRecord[]); exit 1 on page errors
  sheet [ids|all] --cols 4 --thumb 480 --numbered --out <dir> [--overlay lint|plate --kind opener]
                                    contact sheets with a JSON cell map from the last render
  lint [ids|all] [--rule <id>] [--layers static|rendered|both] [--baseline]
                                    Finding[]; exit 1 when a severity 3 finding is not in known-findings.json
  lint --chrome --url <url> [--widths 1440,1280,390] [--themes light,dark] [--states list,grid,book]
                                    the line law auditor on the studio shell; exit 2 when a state did not apply
  build --out <file> --budget 16    the standalone file under a byte budget; exit 1 over budget
  generate                          the contracts generator (pnpm generate:contracts)

Global flags
  --deck <dir>    the deck directory (default: TURBOSLIDE_DECK, the nearest deck.json, or decks/gt-brand)
  --json          machine output on stdout, human output on stderr
  --author <name> the author of writes (default $USER; agents pass agent:<runId>; TURBOSLIDE_AUTHOR)

Exit codes: 0; 1 findings at the gate or a verify failure; 2 usage or validation error.`;

type Command = (ctx: CommandContext) => Promise<number>;

const COMMANDS: Record<string, Command> = {
  import: importCommand,
  validate,
  info,
  slides,
  render,
  sheet,
  lint,
  build,
  generate,
};

export type RunOptions = { cwd: string; env?: NodeJS.ProcessEnv; streams: Streams };

export async function runCli(argv: readonly string[], options: RunOptions): Promise<number> {
  const env = options.env ?? process.env;
  let out = createOutput(false, options.streams);
  try {
    const args = parseArgs(argv);
    out = createOutput(flagBoolean(args, 'json'), options.streams);
    const [command, ...rest] = args.positionals;
    if (!command || command === 'help' || flagBoolean(args, 'help')) {
      options.streams.stdout(`${USAGE}\n`);
      return EXIT.ok;
    }
    const author = parseAuthor(
      flagString(args, 'author') ?? env.TURBOSLIDE_AUTHOR ?? env.USER ?? 'unknown',
    );
    const ctx: CommandContext = { args, out, cwd: options.cwd, env, author, rest };
    if (command === 'slide') {
      const [sub, ...tail] = rest;
      if (sub === 'get') return await slideGet({ ...ctx, rest: tail });
      throw new UsageError(
        `unknown subcommand "slide ${sub ?? ''}"; M1 ships slide get (writes land in M2)`,
      );
    }
    const handler = COMMANDS[command];
    if (!handler) throw new UsageError(`unknown command "${command}"\n\n${USAGE}`);
    return await handler(ctx);
  } catch (error) {
    if (error instanceof UsageError || error instanceof GateError) {
      out.warn(`turboslide: ${error.message}`);
      return error.exitCode;
    }
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    out.warn(`turboslide: ${message}`);
    return EXIT.usage;
  }
}
