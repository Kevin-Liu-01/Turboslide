// The command table and dispatcher of the turboslide binary (SPEC 7.2). Every command receives a
// CommandContext and returns an exit code; the two error classes map to exit 1 and 2, anything
// else is reported on stderr with exit 2. runCli is pure over its streams so tests drive it.
import { flagBoolean, flagString, parseArgs } from './args.ts';
import { block } from './commands/block.ts';
import { build } from './commands/build.ts';
import { diff } from './commands/diff.ts';
import { exportCommand } from './commands/export.ts';
import { fix } from './commands/fix.ts';
import { fonts } from './commands/fonts.ts';
import { generate } from './commands/generate.ts';
import { importCommand } from './commands/import.ts';
import { info } from './commands/info.ts';
import { lease } from './commands/lease.ts';
import { lint } from './commands/lint.ts';
import { mcp } from './commands/mcp.ts';
import { render } from './commands/render.ts';
import { sections } from './commands/sections.ts';
import { sheet } from './commands/sheet.ts';
import { slide } from './commands/slide.ts';
import { slides } from './commands/slides.ts';
import { validate } from './commands/validate.ts';
import { version } from './commands/version.ts';
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
  slide put <id> < slide.json       replace a slide (slide.replace)
  slide patch <id> --set /p=v ...   set or --unset fields by JSON pointer, or --mutations < list.json
  slide insert --section <s> [--after <id>] < slide.json
  slide remove <id>
  slide move <id> --to <s> [--after <id>]
  block set <slide>#<block> <pointer> <value> [--delete]
  block insert <slide> --slot <slot> [--after <block>] < block.json
  block remove <slide>#<block>
  block move <slide>#<block> --slot <slot> [--after <block>]
  sections set < sections.json      replace the section list, the only place order lives
  version save -m <note>            a named version at the current revision
  version list [--named]            every write and save with its author, oldest first
  version restore <n>               restore a version as a write
  lease <slideId> [--minutes 10] [--force] [--release]
  diff [from [to]] [--staged] [--render --theme light --out <dir>]
                                    the mutation log in prose; --render writes before and after crops
  fix [ids|all] [--rule <id>] [--dry-run]
                                    apply the fix mutations of findings that carry one
  render [ids|all] --theme light,dark --scale 1 --out <dir> [--rasters]
                                    PNGs and render.json (RenderRecord[]); exit 1 on page errors
  sheet [ids|all] --cols 4 --thumb 480 --numbered --out <dir> [--overlay lint|plate --kind opener]
                                    contact sheets with a JSON cell map from the last render
  lint [ids|all] [--rule <id>] [--layers static|rendered|both] [--baseline]
                                    Finding[]; exit 1 when a severity 3 finding is not in known-findings.json
  lint --chrome --url <url> [--widths 1440,1280,390] [--themes light,dark] [--states list,grid,book]
                                    the line law auditor on the studio shell; exit 2 when a state did not apply
  build --out <file> --budget 16    the standalone file under a byte budget; exit 1 over budget
  export pptx [ids|all] --mode flatten|native --theme light,dark --fonts exact|standard
                                    [--exclude-share-alike] [--baseline-target libreoffice|none] [--verify] --out <dir>
                                    PPTX per theme with export-report.json; exit 1 when the report fails
  fonts build [--check] [--python <bin>] [--out <dir>]
                                    cut the export font set into packages/fonts/export (scripts/build-fonts.py)
  generate                          the contracts generator (pnpm generate:contracts)
  mcp [--derived <dir>]             the MCP server over stdio: deck_* tools, deck:// resources, the deck_review prompt

Global flags
  --deck <dir>    the deck directory (default: TURBOSLIDE_DECK, the nearest deck.json, or decks/gt-brand)
  --json          machine output on stdout, human output on stderr
  --author <name> the author of writes (default $USER; agents pass agent:<runId>; TURBOSLIDE_AUTHOR)
  --base-revision <n>  for writes: the revision you read; stale is rejected with the current document, exit 1
                       (default: the current revision, the convenience mode for a human at a shell)
  --note <text>   a note on the write's version log entry
  --force         write to a slide another author has leased
  --file <path>   read the document from a file instead of stdin

Exit codes: 0; 1 findings at the gate or a verify failure; 2 usage or validation error.`;

type Command = (ctx: CommandContext) => Promise<number>;

const COMMANDS: Record<string, Command> = {
  import: importCommand,
  validate,
  info,
  slides,
  slide,
  block,
  sections,
  version,
  lease,
  diff,
  fix,
  render,
  sheet,
  lint,
  build,
  export: exportCommand,
  fonts,
  generate,
  mcp,
};

export type RunOptions = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  streams: Streams;
  /** Standard input for the write commands; defaults to the process's stdin, '' on a TTY. */
  stdin?: () => Promise<string>;
};

/** Reads process.stdin to the end; a terminal with nothing piped reads as empty. */
export async function readProcessStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

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
    const ctx: CommandContext = {
      args,
      out,
      cwd: options.cwd,
      env,
      author,
      rest,
      readStdin: options.stdin ?? readProcessStdin,
    };
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
