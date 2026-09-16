// import.run (SPEC 7.1, 9; gslides-parity SPEC-5 5.2, 5.5): `turboslide import <from> --into <id>`
// runs one of two importers by the source. A directory is a Prototemplate deck (parts/, slides/)
// and runs the round one importer; a `.pptx` (or a `data:` URL of one) runs the PPTX reader of
// `@turboslide/import/pptx/read` (R04 12) with the flags of `import.pptx`: `--theme adopt|keep`,
// `--sheet match|fit`, `--snap-ladder`, `--no-master-shapes`, `--no-hidden`, `--comments`,
// `--keep-page-raster`, `--replace`, `--dry-run` (the report alone, nothing written) and
// `--document` (the deck and the slides printed with the report under `--json`). The deck lands
// in decks/<id>/ under the repository root (or the working directory outside a repository) with
// `import-report.json` and `import-ids.json` beside the manifest; the human lines print the
// report's sentence ("42 objects imported, 3 shown differently, 1 dropped"), the producer, the
// page and every substituted or dropped row.
import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { importSummarySentence } from '@turboslide/schema/import-report';
import type { ImportSheetMode, ImportThemeMode } from '@turboslide/schema/import-report';
import { producerLine } from '@turboslide/import/pptx/import-pptx';
import { PackageRefusal } from '@turboslide/import/pptx/package';
import { importPptxBytes, readPptxSource, writeImportedDeck } from '@turboslide/import/pptx/read';

import { flagBoolean, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { repoRootFor } from '../deck-files.ts';
import { importDeck } from '../deps/import.ts';
import { UsageError } from '../exit.ts';

export const IMPORT_USAGE = `usage: turboslide import <prototemplate-deck-dir> --into <deckId> [--json]
       turboslide import <file.pptx> [--into <deckId>] [--theme adopt|keep] [--sheet match|fit] [--snap-ladder]
                         [--no-master-shapes] [--no-hidden] [--comments] [--keep-page-raster] [--replace]
                         [--dry-run] [--document] [--decks <dir>] [--json]`;

/** True for a source the PPTX reader takes: a `.pptx` path or a `data:` URL. */
export function isPptxSource(from: string, cwd: string): boolean {
  if (from.startsWith('data:')) return true;
  if (/\.pptx$/i.test(from)) return true;
  const path = resolve(cwd, from);
  return existsSync(path) && statSync(path).isFile();
}

export async function importCommand(ctx: CommandContext): Promise<number> {
  const from = ctx.rest[0];
  if (!from) throw new UsageError(IMPORT_USAGE);
  const decksDir = flagString(ctx.args, 'decks') ?? join(repoRootFor(ctx.cwd) ?? ctx.cwd, 'decks');
  if (isPptxSource(from, ctx.cwd)) return importPptxCommand(ctx, from, decksDir);
  const into = flagString(ctx.args, 'into');
  if (!into) throw new UsageError(IMPORT_USAGE);
  const report = importDeck(resolve(ctx.cwd, from), into, decksDir);
  ctx.out.result(report);
  ctx.out.human(
    `import: ${report.slides} slides, ${report.sections} sections, ${report.htmlBlocks} html escape block(s), ${report.assets} assets -> ${join(decksDir, into)}`,
  );
  for (const w of report.warnings) ctx.out.warn(`import: ${w}`);
  return 0;
}

function enumFlag<T extends string>(
  ctx: CommandContext,
  name: string,
  values: readonly T[],
): T | undefined {
  const value = flagString(ctx.args, name);
  if (value === undefined) return undefined;
  if (!(values as readonly string[]).includes(value))
    throw new UsageError(`--${name} wants ${values.join(' or ')}, got ${value}\n${IMPORT_USAGE}`);
  return value as T;
}

/** The `.pptx` branch: the reader over the file, the report printed, the deck written unless `--dry-run`. */
async function importPptxCommand(
  ctx: CommandContext,
  from: string,
  decksDir: string,
): Promise<number> {
  const theme = enumFlag<ImportThemeMode>(ctx, 'theme', ['adopt', 'keep']);
  const sheet = enumFlag<ImportSheetMode>(ctx, 'sheet', ['match', 'fit']);
  const into = flagString(ctx.args, 'into');
  const dryRun = flagBoolean(ctx.args, 'dry-run') === true;
  const withDocument = flagBoolean(ctx.args, 'document') === true;
  let source;
  try {
    source = readPptxSource(from, { cwd: ctx.cwd });
  } catch (error) {
    if (error instanceof RangeError) throw new UsageError(error.message);
    throw error;
  }
  let document;
  try {
    document = await importPptxBytes(source.bytes, {
      fileName: source.fileName,
      ...(into !== undefined ? { into } : {}),
      ...(theme !== undefined ? { theme } : {}),
      ...(sheet !== undefined ? { sheet } : {}),
      snapLadder: flagBoolean(ctx.args, 'snap-ladder') === true,
      masterShapes: flagBoolean(ctx.args, 'no-master-shapes') !== true,
      includeHidden: flagBoolean(ctx.args, 'no-hidden') !== true,
      comments: flagBoolean(ctx.args, 'comments') === true,
      keepPageRaster: flagBoolean(ctx.args, 'keep-page-raster') === true,
    });
  } catch (error) {
    // a refusal is one sentence (R04 9): the CLI's TypeError form
    if (error instanceof PackageRefusal) throw new TypeError(error.message);
    throw error;
  }
  const written = dryRun
    ? undefined
    : writeImportedDeck(document, decksDir, { replace: flagBoolean(ctx.args, 'replace') === true });
  const report =
    written === undefined ? document.report : { ...document.report, deckId: written.deckId };
  ctx.out.result(
    withDocument ? { ...report, deck: document.deck, slides: document.slides } : report,
  );
  const { imported, substituted, dropped } = report.summary;
  ctx.out.human(
    `${importSummarySentence(report.summary)} (${imported + dropped} objects in the file); ${producerLine(report)}${
      report.theme.mode === 'keep' ? '; colours kept as hexes' : ''
    }`,
  );
  if (report.fonts.length > 0)
    ctx.out.human(
      `fonts: ${report.fonts.map((font) => `${font.family} (${font.runs})`).join(', ')}; every run renders in Inter`,
    );
  for (const row of report.rows) {
    if (row.status === 'kept') continue;
    ctx.out.human(
      `  ${row.status.padEnd(11)} slide ${row.slideIndex}${row.object !== undefined ? ` ${row.object}` : ''}: ${row.message}`,
    );
  }
  if (!report.validation.ok) {
    ctx.out.warn(
      `import: the document has ${report.validation.issues} validation issue(s); the first: ${report.validation.lines?.[0] ?? ''}`,
    );
  }
  if (written === undefined)
    ctx.out.human(
      `dry run: nothing written; ${document.slides.length} slide(s) would land in ${join(decksDir, document.deck.id)}`,
    );
  else
    ctx.out.human(
      `import: ${document.slides.length} slide(s), ${Object.keys(document.deck.assets).length} picture(s), ${Object.keys(document.deck.media ?? {}).length} media file(s) -> ${written.dir}${written.replaced ? ' (replaced)' : ''}`,
    );
  void substituted;
  return 0;
}
