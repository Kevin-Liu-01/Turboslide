// The command table and dispatcher of the turboslide binary (SPEC 7.2). Every command receives a
// CommandContext and returns an exit code; the two error classes map to exit 1 and 2, anything
// else is reported on stderr by its message with exit 2 (its stack too when TURBOSLIDE_DEBUG is
// set). runCli is pure over its streams so tests drive it.
import { flagBoolean, flagString, parseArgs } from './args.ts';
import { asset } from './commands/asset.ts';
import { block } from './commands/block.ts';
import { build } from './commands/build.ts';
import { deck } from './commands/deck.ts';
import { diff } from './commands/diff.ts';
import { exportCommand } from './commands/export.ts';
import { fix } from './commands/fix.ts';
import { fonts } from './commands/fonts.ts';
import { generate } from './commands/generate.ts';
import { importCommand } from './commands/import.ts';
import { info } from './commands/info.ts';
import { judge } from './commands/judge.ts';
import { lease } from './commands/lease.ts';
import { lint } from './commands/lint.ts';
import { material } from './commands/material.ts';
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
  deck create <name> --from gt-brand|blank [--id <id>] [--decks <dir>]
                                    decks/<id> from the GT brand template (85 slides) or as one title slide (deck.create)
  deck rename <name>                set the deck title (deck.rename)
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
  asset add <file|url> --role <r> --alt <t> [--artist --license --share-alike --source-url] [--two-tone --black --gamma --plate <side>]
                                    a picture as an asset with its license fields; --two-tone runs the deck's screen and keeps the source
  asset capture <url> --theme both [--recipe gt-site] [--region x,y,w,h] [--detail x,y,w,h ...]
                                    a page at 1440 by 900 at 2x through a per-site recipe, with identical-region detail crops
  asset dither <id> [--gamma --black --white --crop --plate <side>] | --all-two-tone --from-recorded [--verify-cells]
                                    re-run a two-tone treatment, or read the committed twins back and verify them
  material list [<id>]              the material catalog: paper:* with uniforms and presets, proto:* as unavailable
  material capture <id> --anchor 4000,5500,7000 [--preset <name>] [--uniforms <recipe.json>] [--set u_x=v] [--two-tone --plate <side>]
                                    frozen frames at 3200 by 1800 as assets with recipe keys
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
  judge bundle [ids|all] --out <dir> [--render <dir>] [--fresh]
                                    renders, sheets with cell maps, lint.json with the gate, the document, the
                                    numerals per slide and the six lens instructions in one directory (SPEC 7.6)
  build --out <file> --budget 16    the standalone file under a byte budget; exit 1 over budget
  export pptx [ids|all] --mode flatten|native --theme light,dark|both --fonts exact|standard|embed
                                    [--embed-fonts] [--headings raster] [--raster-scale auto|2|3] [--picture-scale 2|3]
                                    [--exclude-share-alike] [--baseline-target libreoffice|none] [--no-jpeg] [--verify] --out <dir>
                                    PPTX per theme (flatten is perfect, native is editable text), <deckId>-both.zip for both
                                    themes, export-report.json; exit 1 when the report fails
  export check <file.pptx> [--python <bin>] [--no-quick-look] [--out <dir>] [--json]
                                    read an exported file back with python-pptx: pages, size, media formats, fonts,
                                    slide names, invalid parts (ExportCheck with --json); exit 1 when it is not valid
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
  deck,
  slides,
  slide,
  block,
  sections,
  asset,
  material,
  version,
  lease,
  diff,
  fix,
  render,
  sheet,
  lint,
  judge,
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
    // the message alone: a stack here buries the cause under frames for whoever reads the tail of
    // stderr (the render worker's job error, the studio's 502 body); TURBOSLIDE_DEBUG=1 adds it
    const debug = Boolean(env.TURBOSLIDE_DEBUG);
    const message =
      error instanceof Error
        ? debug && error.stack
          ? error.stack
          : error.message || String(error)
        : String(error);
    out.warn(`turboslide: ${message}`);
    return EXIT.usage;
  }
}
