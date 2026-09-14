// The command table and dispatcher of the turboslide binary (SPEC 7.2). Every command receives a
// CommandContext and returns an exit code; the two error classes map to exit 1 and 2, anything
// else is reported on stderr by its message with exit 2 (its stack too when TURBOSLIDE_DEBUG is
// set). runCli is pure over its streams so tests drive it.
import { flagBoolean, flagString, parseArgs } from './args.ts';
import { asset } from './commands/asset.ts';
import { block } from './commands/block.ts';
import { build } from './commands/build.ts';
import { chart } from './commands/chart.ts';
import { deck } from './commands/deck.ts';
import { diagram } from './commands/diagram.ts';
import { diff } from './commands/diff.ts';
import { exportCommand } from './commands/export.ts';
import { fix } from './commands/fix.ts';
import { fonts } from './commands/fonts.ts';
import { generate } from './commands/generate.ts';
import { importCommand } from './commands/import.ts';
import { info } from './commands/info.ts';
import { judge } from './commands/judge.ts';
import { lease } from './commands/lease.ts';
import { line } from './commands/line.ts';
import { lint } from './commands/lint.ts';
import { material } from './commands/material.ts';
import { mcp } from './commands/mcp.ts';
import { render } from './commands/render.ts';
import { sections } from './commands/sections.ts';
import { shape } from './commands/shape.ts';
import { sheet } from './commands/sheet.ts';
import { slide } from './commands/slide.ts';
import { slides } from './commands/slides.ts';
import { table } from './commands/table.ts';
import { text } from './commands/text.ts';
import { validate } from './commands/validate.ts';
import { version } from './commands/version.ts';
import { account } from './commands/account.ts';
import { activity } from './commands/activity.ts';
import { admin } from './commands/admin.ts';
import { comment, comments } from './commands/comment.ts';
import { login, logout } from './commands/login.ts';
import { notifications } from './commands/notifications.ts';
import { picture } from './commands/picture.ts';
import { presence, sync } from './commands/presence.ts';
import { share } from './commands/share.ts';
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
  deck set <path> <value> [--unset] write /title, /theme or a /defaults field of the manifest (deck.set)
  deck list [--include-trashed]     every deck under decks/, newest first (deck.list)
  deck copy <id> --name <name> [--id <newId>] [--slides <id,...>] [--remove-notes] [--copy-comments]
                                    a copy under a new id at revision 0 (deck.copy)
  deck trash <id> | deck restore <id>
                                    move a deck to the trash and back (deck.trash, deck.restore)
  deck remove <id> --confirm        delete a deck for good (deck.remove)
  deck pack <id> [--out <file.zip>] [--no-versions]
                                    decks/<id> as one bundle zip with manifest.json (deck.pack; docs/deck-transfer.md)
  deck unpack <file.zip> [--as <id>] [--replace]
                                    a deck under decks/ from a bundle; a taken id gets a free sibling unless --replace (deck.unpack)
  deck push <id> --to <url> [--token <t>] [--as <id>] [--replace] [--from-url <url>]
                                    upload the bundle to a hosted studio (deck.push); the token is kept in ~/.config/turboslide/hosts.json
  deck pull <id> --from <url> [--token <t>] [--as <id>] [--replace]
                                    download a deck bundle from a hosted studio into decks/ (deck.pull)
  slides [--section <id>]           slide rows with per-slide lint counts
  slide get <id>                    one slide, its assets and its last render records
  slide put <id> < slide.json       replace a slide (slide.replace)
  slide patch <id> --set /p=v ...   set or --unset fields by JSON pointer, or --mutations < list.json
  slide insert --section <s> [--after <id>] < slide.json
  slide remove <id>
  slide move <id> --to <s> [--after <id>]
  slide set-layout <id> --type <layout> [--ratio --gap --head --align --body] | --layout '<json>'
                                    move a content slide to another layout and refile its blocks (slide.setLayout, docs/freeform.md)
  slide new --layout <layout> [--after <id>] [--section <s>] [--id <id>]
                                    one slide from a layout with empty placeholders (slide.new)
  slide duplicate <id,...>          copies after the last of them (slide.duplicate)
  slide skip <id,...> [--off]       leave slides out of the slideshow and the downloads, or show them again (slide.skip)
  slide apply-layout <id,...> <layout>
                                    move a slide's content into another layout's placeholders (slide.applyLayout)
  slide import <sourceDeckId> <id,...> [--after <id>] [--section <s>]
                                    copy slides and their assets from another deck under decks/ (slide.import)
  slide to-canvas <id,...>          arrange the slides by hand: every object takes the box it is drawn at (slide.toCanvas)
  slide background <id,...> --color <color> | --off
                                    the slides' background colour (slide.setBackground)
  deck guides --add-vertical <x> | --add-horizontal <y> | --remove-vertical <x> | --remove-horizontal <y> | --set <json> | --clear
                                    the guide lines the editor shows on every slide (deck.guides)
  deck background --color <color> | --off
                                    the theme background colour (deck.setBackground)
  text replace <find> <replace> [--match-case] [--slides <id,...>]
                                    find and replace across the deck's text and notes in one write (text.replaceAll)
  text style <slide>#<block> <pointer> --range a:b [--italic] [--underline] [--strike] [--superscript] [--subscript] [--color <c>] [--highlight <c>]
  text case <slide>#<block> <pointer> --range a:b lower|upper|title
  text insert <slide>#<block> <pointer> --at <n> <text>
  text list <slide>#<block> [--marker rule|bullet|number] [--preset <preset>] [--items <i,...>] [--level <1-9>|--in|--out]
  text spacing <slide>#<block> [--line <factor>] [--before <px>] [--after <px>]
  text columns <slide>#<block> 1|2|3
  text indent <slide>#<block> --in|--out|--to <px> [--items <i,...>]
                                    the text styles, lists, spacing, columns and indents of round two (text.style, text.case,
                                    text.insert, text.list, text.spacing, text.columns, text.indent)
  block set <slide>#<block> <pointer> <value> [--delete]
  block insert <slide> --slot <slot> [--after <block>] < block.json
  block remove <slide>#<block>
  block move <slide>#<block> --slot <slot> [--after <block>] [--z <n>]
  block duplicate <slide> --blocks <id,...>
                                    copies after their originals, 16 px offset on a freeform slide (block.duplicate)
  block align <slide> --blocks <id,...> --edge left|center|right|top|middle|bottom [--to selection|content|sheet] [--no-snap]
  block distribute <slide> --blocks <id,...> --axis horizontal|vertical [--gap <px>] [--snap]
  block order <slide>#<block> --move front|back|forward|backward | --z <n>
                                    the position boxes of a canvas slide (block.align, block.distribute, block.order)
  block group <slide> --blocks <id,...> [--as <tag>] | block ungroup <slide> --group <tag> | block regroup <slide> --blocks <id,...> --as <tag>
  block rotate <slide>#<block> --to <deg>|--by <deg> [--about each|selection]
  block flip <slide>#<block> --axis h|v [--about each|selection]
  block crop <slide>#<block> --left <f> --right <f> --top <f> --bottom <f>
  block mask <slide>#<block> <preset>|--off | block reset-image <slide>#<block>
  block adjust <slide>#<block> [--transparency <t>] [--brightness <b>] [--contrast <c>]
  block alt <slide>#<block> <text> | block shadow <slide>#<block> --on [...]|--off
  block autofit <slide>#<block> none|shrink|grow [--apply]
                                    the canvas objects of round two (block.group, block.ungroup, block.regroup, block.rotate,
                                    block.flip, block.crop, block.mask, block.resetImage, block.adjust, block.setAlt,
                                    block.shadow, block.autofit); a slide not arranged by hand yet converts first
  table merge|unmerge|insert-rows|insert-columns|delete-rows|delete-columns|distribute|cell-style <slide>#<block> ...
                                    Google's table menus (table.merge, table.unmerge, table.insertRows, table.insertColumns,
                                    table.deleteRows, table.deleteColumns, table.distribute, table.cellStyle)
  chart set-data <slide>#<block> < data.json | chart set-kind <slide>#<block> bar|column|line|pie
                                    the chart's data and type (chart.setData, chart.setKind)
  shape set <slide>#<block> [--kind <preset>] [--adjust <n,...>] [--fill <c>] [--stroke <c>] [--width <w>] [--dash <d>] [--radius <r>]
  line set <slide>#<block> [--kind <kind>] [--start <end>] [--end <end>] [--weight <w>] [--dash <d>] [--bend <b>] [--points "x,y ..."]
           [--connect-start <block>:<site>] [--connect-end <block>:<site>] [--detach start|end|both]
                                    the shape and line fields (shape.set, line.set)
  diagram insert <slide> --kind grid|hierarchy|timeline|process|relationship|cycle --count <n> [--style outline|plate|ink] [--pos x,y,w,h]
                                    a diagram template as one group of objects (diagram.insert)
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
  export pptx ... [--include-skipped] [--include-notes] [--include-comments] [--tables auto|table|rows]
                                    skipped slides stay out unless asked (slide.skip); comments as classic p:cm parts for
                                    editors (parity SPEC-3 5.8); the table block as a:tbl, ruled rows when a cell
                                    misses the budget
  export pdf [<deck>] [ids|all] [--appearance light|dark] [--include-skipped] [--verify] --out <dir>
                                    one page per slide at 13.333 by 7.5 in; --verify gates every page against the
                                    web render where poppler exists
  export jpeg [<deck>] [ids|all] [--theme light|dark] [--scale 1|2] --out <dir>
                                    JPEGs at quality 92
  export txt [<deck>] [ids|all] [--include-notes] [--include-skipped] [--include-comments]
                                    the deck as plain text: one block per slide, cells tab separated (export.text)
  export check <file.pptx | dir> [--python <bin>] [--no-quick-look] [--out <dir>] [--json]
                                    read an exported file back with python-pptx: pages, size, media formats, fonts,
                                    slide names, invalid parts (ExportCheck with --json); exit 1 when it is not valid
  fonts build [--check] [--python <bin>] [--out <dir>]
                                    cut the export font set into packages/fonts/export (scripts/build-fonts.py)
  generate                          the contracts generator (pnpm generate:contracts)
  mcp [--derived <dir>]             the MCP server over stdio: deck_* tools, deck:// resources, the deck_review prompt

Collaboration (every command takes --to <studio> to run on a hosted deck)
  comment add <anchor> -m <text> [--mention <who>] [--assign <who>]
                                    a thread at deck, slide:<id>, <slide>#<block>, <slide>#<block>/<path>:<a>-<b>,
                                    <slide>#<block>/cell:<r>,<c> or notes:<slide> (comment.add)
  comment reply|edit|delete|resolve|reopen|assign|done|react|get|link <threadId> ...
                                    the thread commands (comment.reply, comment.edit, comment.delete, comment.resolve,
                                    comment.reopen, comment.assign, comment.done, comment.react, comment.get, comment.link)
  comments [<slideId>] [--block <id>] [--state open|resolved|all] [--for-me] [--search <text>] [--since <n>]
                                    the threads with their anchors resolved (comment.list)
  notifications [--unread] [--since <iso>] | notifications read <ids>|--all | notifications settings --level for-you
                                    the inbox (notification.list, notification.markRead, notification.settings)
  activity [--since <iso>] [--kind comment,share]
                                    the activity feed (activity.list)
  version diff [<from> [<to>]]      the changes between two revisions by author and block (version.diff)
  share get|access|link|revoke-link|rotate-link|stop|invite|role|remove|expire|settings|requests|respond|transfer|
        accept-ownership|decline-ownership|claim|email <id> ...
                                    the access record (share.get, share.setGeneralAccess, share.createLink, share.revokeLink,
                                    share.rotateLink, share.stop, share.invite, share.setRole, share.remove, share.setExpiry,
                                    share.settings, share.listRequests, share.respond, share.transferOwnership,
                                    share.acceptOwnership, share.declineOwnership, share.claim, share.emailCollaborators)
  deck publish <id> | deck unpublish <id>
                                    the published player (deck.publish, deck.unpublish)
  deck watch <id> [--from <studio>] [--since <n>] | deck follow <id> --from <studio> [--push] [--comments]
                                    the checkpoints as they land; a hosted deck mirrored into the checkout (deck.watch, deck.follow)
  presence list | presence follow <clientId> | presence unfollow | presence pointer --on|--off
                                    the roster and the follow controls (presence.list, presence.follow, presence.unfollow, presence.pointer)
  sync status                       the client's position in the room (sync.status)
  account me|name|avatar|decks|sessions|sign-out|tokens ...
                                    the caller's account (account.me, account.setName, account.setAvatar, account.decks,
                                    account.sessions, account.signOut, account.tokens.create, account.tokens.list, account.tokens.revoke)
  admin flag <name> [on|off] | admin assign-owner <id> --email <a@x> | admin bootstrap --to <url> --email <a@x> |
        admin migrate-storage <step> --to <url> | admin mail --to <url>
                                    the deployment admin's actions (admin.flag, admin.assignOwner, admin.bootstrap,
                                    admin.migrateStorage, admin.mail.list)
  block dither <slide>#<block> [--pattern bayer8] [--black 120 --white 230 --gamma 0.9] [--photograph] [--off]
                                    the deck's two tone screen over a picture (picture.dither)
  picture materialize [<slideIds>] [--prune] [--scale 2] [--dry-run]
                                    the dither variants every export reads (picture.materialize)
  slide background-picture <ids> --asset <id>|--file <path>|--url <url> [--dither] | slide background-material <ids> <materialId> [--dither]
                                    a covering picture, or a shader frame, at the back of each slide (slide.setBackgroundPicture,
                                    slide.setBackgroundMaterial)
  login --to <url> | logout --to <url>
                                    an API key over the device flow, kept in ~/.config/turboslide/hosts.json

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
  text,
  table,
  chart,
  shape,
  line,
  diagram,
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
  comment,
  comments,
  notifications,
  activity,
  share,
  presence,
  sync,
  account,
  admin,
  picture,
  login,
  logout,
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
