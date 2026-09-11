// `turboslide mcp` (SPEC 7.3, MILESTONES M2 item 3): the MCP server over stdio for the deck the
// CLI resolves. The server itself is @turboslide/mcp, a wrapper over the action table; this file
// supplies what the wrapper needs from the file transport: a dispatcher with a handler per
// implemented action, and a DeckSource over the deck directory and .turboslide/ for the deck://
// resources. JSON-RPC frames use stdout, so every human line goes to stderr here.
//
// Read actions reuse the M1 commands (render, sheet, build) through a captured Output and read the
// deck files directly for info, list, get, lint and validate. Write actions are the store-backed
// functions of store-actions.ts, registered through registerStoreActions so the CLI commands and
// the MCP tools run one implementation over the FileStore (MILESTONES M2 items 1 and 2).
// export.run runs the export command (commands/export.ts) the same way and returns the merged
// ExportReport; with `verify` it needs LibreOffice, which lives in the render worker image, so a
// missing soffice is refused with a plain error before anything is exported. Not registered here,
// judge.bundle runs the judge command into the derived directory (MILESTONES M4 item 4). Not
// registered here, so not offered as tools: asset.*, material.capture and view.goto, whose handlers
// land with their packages.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { delimiter, isAbsolute, join, resolve } from 'node:path';

import { createDispatcher } from '@turboslide/agent/dispatch';
import type { ActionContext, Dispatcher } from '@turboslide/agent/dispatch';
import { resolveTools } from '@turboslide/export/verify/libreoffice';
import { sheetPaths } from '@turboslide/headless/sheet';
import type { SheetMap } from '@turboslide/headless/sheet';
import { countsBySlide, lintDeck, lintStatic } from '@turboslide/lint/run';
import type { LintLayers } from '@turboslide/lint/run';
import type { DeckSource } from '@turboslide/mcp/resources';
import { createMcpServer } from '@turboslide/mcp/server';
import { redirectConsoleToStderr, serveStdio } from '@turboslide/mcp/stdio';
import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';
import type { Finding } from '@turboslide/schema/findings';
import type { RenderRecord } from '@turboslide/schema/render';
import type { RuleId } from '@turboslide/schema/rules';
import { validateDeck } from '@turboslide/schema/validate';
import { openFileStore } from '@turboslide/store/file-store';
import type { FileStore } from '@turboslide/store/file-store';
import {
  COMPOSITE,
  CONTENT,
  INSET,
  PAD,
  PANEL,
  RAIL,
  SEMANTIC,
  SHEET,
  SWATCH_PLATES,
  TOKENS,
} from '@turboslide/theme/tokens';

import { flagString, parseArgs } from '../args.ts';
import type { Author, CommandContext } from '../context.ts';
import {
  derivedDir,
  findDeckDir,
  loadDeck,
  readJson,
  readRenderRecords,
  resolveOut,
  slideRows,
} from '../deck-files.ts';
import type { LoadedDeck } from '../deck-files.ts';
import { lintLists } from '../deps/theme.ts';
import { EXIT } from '../exit.ts';
import type { Output } from '../output.ts';
import { registerStoreActions } from '../store-actions.ts';
import { build } from './build.ts';
import { decksDirOfDeck, registerDeckActions } from './deck.ts';
import { exportCommand } from './export.ts';
import { judge } from './judge.ts';
import { render } from './render.ts';
import { sheet } from './sheet.ts';

type Theme = 'light' | 'dark';
type SlideIds = 'all' | string[];

/** What every handler works with: the deck directory, the store, the derived directory and the author. */
type HandlerEnv = {
  dir: string;
  store: FileStore;
  derived: string;
  cwd: string;
  processEnv: NodeJS.ProcessEnv;
  author: Author;
  log: (line: string) => void;
};

type Command = (ctx: CommandContext) => Promise<number>;

/** Runs an M1 command with its `--json` result captured and its human lines on stderr. */
async function runCommand(
  env: HandlerEnv,
  command: Command,
  argv: string[],
): Promise<{ code: number; result: unknown }> {
  let result: unknown;
  const args = parseArgs(argv);
  const out: Output = {
    json: true,
    human: env.log,
    warn: env.log,
    result: (value) => {
      result = value;
    },
  };
  const code = await command({
    args,
    out,
    cwd: env.cwd,
    env: env.processEnv,
    author: env.author,
    rest: args.positionals,
    readStdin: async () => '',
  });
  return { code, result };
}

function idsArgv(slideIds: SlideIds): string[] {
  return slideIds === 'all' ? ['all'] : [...slideIds];
}

/** True when `bin` is a path that exists or a command found in a PATH directory. */
function executableExists(bin: string, processEnv: NodeJS.ProcessEnv): boolean {
  if (bin.includes('/')) return existsSync(bin);
  return (processEnv.PATH ?? '')
    .split(delimiter)
    .some((dir) => dir !== '' && existsSync(join(dir, bin)));
}

/** The render worker image is where LibreOffice lives (docker/render-worker.Dockerfile). */
export const RENDER_WORKER_IMAGE = 'turboslide-render-worker';

function documentOf(loaded: LoadedDeck): DeckDocument {
  return { deck: loaded.deck, slides: loaded.slides };
}

function outline(loaded: LoadedDeck) {
  const rows = slideRows(loaded).filter((row) => row.kind !== 'missing');
  return loaded.deck.sections.map((section) => ({
    id: section.id,
    name: section.name,
    slides: rows
      .filter((row) => row.sectionId === section.id)
      .map(({ id, n, title, kind }) => ({ id, n, title, kind })),
  }));
}

function htmlBlockCount(loaded: LoadedDeck): number {
  let count = 0;
  for (const slide of Object.values(loaded.slides))
    for (const { block } of slideBlocks(slide)) if (block.type === 'html') count += 1;
  return count;
}

/** Asset ids a slide references, from the picture and every block's asset paths. */
function assetIdsOf(slide: Slide): Set<string> {
  const ids = new Set<string>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (key === 'asset' && typeof item === 'string') ids.add(item);
      else if (key === 'assets' && Array.isArray(item))
        item.forEach((id) => typeof id === 'string' && ids.add(id));
      else walk(item);
    }
  };
  walk(slide);
  return ids;
}

function renderDir(env: HandlerEnv): string {
  return join(env.derived, 'render');
}

function renderRecords(env: HandlerEnv): RenderRecord[] {
  return readRenderRecords(join(renderDir(env), 'render.json'));
}

function lintSlides(
  document: DeckDocument,
  records: readonly RenderRecord[],
  options: { slideIds?: SlideIds; layers?: LintLayers; rule?: RuleId },
): Finding[] {
  return lintDeck(document, records, {
    layers: options.layers ?? 'both',
    rules: options.rule === undefined ? [] : [options.rule],
    slideIds:
      options.slideIds === undefined || options.slideIds === 'all' ? undefined : options.slideIds,
    ...lintLists(),
  });
}

// ---------------------------------------------------------------------------------------------
// Read actions

function registerReadActions(dispatcher: Dispatcher, env: HandlerEnv): void {
  dispatcher.register('deck.info', () => {
    const loaded = loadDeck(env.dir);
    const rows = slideRows(loaded);
    return {
      id: loaded.deck.id,
      title: loaded.deck.title,
      theme: loaded.deck.theme,
      revision: loaded.deck.revision,
      sections: outline(loaded),
      counts: {
        slides: rows.length,
        sections: loaded.deck.sections.length,
        assets: Object.keys(loaded.deck.assets).length,
        htmlBlocks: htmlBlockCount(loaded),
      },
    };
  });

  dispatcher.register('slide.list', (input) => {
    const { sectionId } = input as { sectionId?: string };
    const loaded = loadDeck(env.dir);
    const counts = countsBySlide(lintStatic(documentOf(loaded), lintLists()));
    return slideRows(loaded)
      .filter((row) => row.kind !== 'missing')
      .filter((row) => sectionId === undefined || row.sectionId === sectionId)
      .map((row) => ({
        id: row.id,
        n: row.n,
        section: row.sectionId,
        title: row.title,
        kind: row.kind,
        lint: { s3: counts[row.id]?.s3 ?? 0, s2: counts[row.id]?.s2 ?? 0 },
      }));
  });

  dispatcher.register('slide.get', (input) => {
    const { slideId } = input as { slideId: string };
    const loaded = loadDeck(env.dir);
    const slide = loaded.slides[slideId];
    if (slide === undefined) throw new RangeError(`No slide "${slideId}" in ${env.dir}`);
    const section = loaded.deck.sections.find((row) => row.slideIds.includes(slideId));
    if (section === undefined) throw new RangeError(`Slide "${slideId}" is in no section`);
    const assets: Record<string, unknown> = {};
    for (const id of assetIdsOf(slide)) {
      const asset = loaded.deck.assets[id];
      if (asset !== undefined) assets[id] = asset;
    }
    const records = renderRecords(env).filter((record) => record.slideId === slideId);
    return {
      slide,
      n: loaded.order.indexOf(slideId) + 1,
      section: section.id,
      assets,
      render: records[records.length - 1] ?? null,
    };
  });

  dispatcher.register('lint.run', (input) => {
    const options = input as { slideIds: SlideIds; layers?: LintLayers; rule?: RuleId };
    const records = options.layers === 'static' ? [] : renderRecords(env);
    return lintSlides(documentOf(loadDeck(env.dir)), records, options);
  });

  dispatcher.register('validate.run', (input) => {
    const { path } = input as { path?: string };
    const dir = path === undefined ? env.dir : findDeckDir(env.cwd, path, env.processEnv);
    const loaded = loadDeck(dir);
    const issues: {
      code: string;
      severity: 1 | 2 | 3;
      file: string;
      pointer: string;
      message: string;
    }[] = [];
    for (const id of loaded.missing)
      issues.push({
        code: 'missing_file',
        severity: 3,
        file: `slides/${id}.json`,
        pointer: '',
        message: `slides/${id}.json is listed in deck.json but missing`,
      });
    for (const id of loaded.orphans)
      issues.push({
        code: 'unlisted',
        severity: 2,
        file: `slides/${id}.json`,
        pointer: '',
        message: `slides/${id}.json is not listed in any section`,
      });
    const result = validateDeck({ deck: loaded.deck, slides: loaded.slides });
    for (const issue of result.issues)
      issues.push({
        code: issue.code,
        severity: issue.severity,
        file: issue.file,
        pointer: issue.pointer,
        message: issue.message,
      });
    return {
      ok: result.ok && loaded.missing.length === 0,
      issues,
      revision: result.deck?.revision ?? null,
    };
  });

  dispatcher.register('render.slide', async (input) => {
    const {
      slideIds,
      themes = ['light', 'dark'],
      scale = 1,
      out,
    } = input as {
      slideIds: SlideIds;
      themes?: Theme[];
      scale?: 1 | 2;
      format?: 'png' | 'jpg';
      out?: string;
    };
    const outDir = out === undefined ? renderDir(env) : resolveOut(env.cwd, out, renderDir(env));
    const { result } = await runCommand(env, render, [
      ...idsArgv(slideIds),
      '--deck',
      env.dir,
      '--theme',
      themes.join(','),
      '--scale',
      String(scale),
      '--out',
      outDir,
    ]);
    const records = Array.isArray(result) ? (result as RenderRecord[]) : [];
    return {
      records,
      images: records.map((record) =>
        isAbsolute(record.image) ? record.image : resolve(outDir, record.image),
      ),
    };
  });

  dispatcher.register('render.sheet', async (input) => {
    const { slideIds, themes, cols, thumb, numbered, overlay, out } = input as {
      slideIds: SlideIds;
      themes?: Theme[];
      cols?: number;
      thumb?: number;
      numbered?: boolean;
      overlay?: 'lint' | 'plate';
      out?: string;
    };
    const outDir = join(env.derived, 'sheet');
    const argv = [
      ...idsArgv(slideIds),
      '--deck',
      env.dir,
      '--render',
      renderDir(env),
      '--out',
      out === undefined ? outDir : resolveOut(env.cwd, out, outDir),
    ];
    if (themes !== undefined) argv.push('--theme', themes.join(','));
    if (cols !== undefined) argv.push('--cols', String(cols));
    if (thumb !== undefined) argv.push('--thumb', String(thumb));
    if (numbered === false) argv.push('--numbered=false');
    if (overlay !== undefined) argv.push('--overlay', overlay);
    const { result } = await runCommand(env, sheet, argv);
    const written =
      (result as { sheets?: { theme: Theme; png: string; map: string }[] } | undefined)?.sheets ??
      [];
    const sheets = [];
    for (const row of written) {
      const map = readJson(row.map) as SheetMap;
      sheets.push({
        theme: row.theme,
        image: row.png,
        cells: map.cells.map((cell) => ({ slideId: cell.slideId, n: cell.n, box: cell.box })),
      });
    }
    return { sheets };
  });

  dispatcher.register('judge.bundle', async (input) => {
    const { slideIds, out } = input as { slideIds: SlideIds; out: string };
    const { result } = await runCommand(env, judge, [
      'bundle',
      ...idsArgv(slideIds),
      '--deck',
      env.dir,
      '--render',
      renderDir(env),
      '--out',
      resolveOut(env.cwd, out, join(env.derived, 'judge')),
    ]);
    if (result === undefined) throw new Error('judge.bundle: the judge command produced no result');
    return result;
  });

  dispatcher.register('export.run', async (input) => {
    const {
      format,
      mode = 'flatten',
      theme = ['light', 'dark'],
      fonts = 'exact',
      headings,
      rasterScale,
      pictureScale,
      excludeShareAlike = false,
      baseline = 'libreoffice',
      verify = false,
      slideIds = 'all',
      out,
    } = input as {
      format: 'pptx' | 'gslides' | 'pdf';
      mode?: 'native' | 'flatten';
      theme?: Theme[];
      fonts?: 'exact' | 'standard';
      headings?: 'raster';
      rasterScale?: 'auto' | 2 | 3;
      pictureScale?: 2 | 3;
      excludeShareAlike?: boolean;
      baseline?: 'libreoffice' | 'none';
      verify?: boolean;
      slideIds?: SlideIds;
      out?: string;
    };
    if (verify) {
      const { soffice } = resolveTools(env.processEnv);
      if (!executableExists(soffice, env.processEnv))
        throw new Error(
          `export.run: verify needs LibreOffice and "${soffice}" is not on PATH here; run the export inside the render worker image (${RENDER_WORKER_IMAGE}, docker/render-worker.Dockerfile) or point TURBOSLIDE_SOFFICE at an installation`,
        );
    }
    const exportDir = join(env.derived, 'export');
    const argv = [
      format,
      ...idsArgv(slideIds),
      '--deck',
      env.dir,
      '--mode',
      mode,
      '--theme',
      theme.join(','),
      '--fonts',
      fonts,
      '--baseline-target',
      baseline,
      '--out',
      out === undefined ? exportDir : resolveOut(env.cwd, out, exportDir),
    ];
    if (headings === 'raster') argv.push('--headings', 'raster');
    if (rasterScale !== undefined) argv.push('--raster-scale', String(rasterScale));
    if (pictureScale !== undefined) argv.push('--picture-scale', String(pictureScale));
    if (excludeShareAlike) argv.push('--exclude-share-alike');
    if (verify) argv.push('--verify');
    // The command exits 1 when the report's `passed` is false; the tool returns the report either
    // way, because `passed` and `residual` are the result an agent reads.
    const { result } = await runCommand(env, exportCommand, argv);
    if (result === undefined) throw new Error('export.run: the export command produced no report');
    return result;
  });

  dispatcher.register('build.run', async (input) => {
    const { out, budgetMB = 16 } = input as { out: string; budgetMB?: number; quality?: number };
    const { result } = await runCommand(env, build, [
      '--deck',
      env.dir,
      '--out',
      resolveOut(env.cwd, out, out),
      '--budget',
      String(budgetMB),
    ]);
    const built = result as {
      path: string;
      bytes: number;
      budgetBytes: number;
      overBudget: boolean;
      missing: string[];
      failed: { path: string; error: string }[];
    };
    return {
      path: built.path,
      bytes: built.bytes,
      assertions: [
        {
          name: 'budget',
          passed: !built.overBudget,
          detail: `${built.bytes} of ${built.budgetBytes} bytes`,
        },
        {
          name: 'assets',
          passed: built.missing.length === 0 && built.failed.length === 0,
          detail:
            built.missing.length + built.failed.length === 0
              ? 'every asset inlined'
              : `${built.missing.length} missing, ${built.failed.length} failed`,
        },
      ],
    };
  });
}

// ---------------------------------------------------------------------------------------------
// The deck:// resources over the deck directory and .turboslide/

function fileDeckSource(env: HandlerEnv, deckId: string): DeckSource {
  return {
    deckId,
    manifest: async () => readJson(join(env.dir, 'deck.json')),
    slides: async () =>
      slideRows(loadDeck(env.dir))
        .filter((row) => row.kind !== 'missing')
        .map(({ id, n, title }) => ({ id, n, title })),
    slide: async (slideId) => loadDeck(env.dir).slides[slideId],
    latestRender: async (slideId, theme) => {
      const records = renderRecords(env).filter(
        (record) => record.slideId === slideId && record.theme === theme,
      );
      const record = records[records.length - 1];
      if (record === undefined) return undefined;
      const image = isAbsolute(record.image) ? record.image : resolve(renderDir(env), record.image);
      return existsSync(image) ? { image, record } : undefined;
    },
    latestSheet: async (theme) => {
      const paths = sheetPaths(join(env.derived, 'sheet'), theme);
      return existsSync(paths.png) && existsSync(paths.map)
        ? { image: paths.png, map: paths.map }
        : undefined;
    },
    theme: () => ({
      theme: 'gt-ink-paper',
      tokens: TOKENS,
      composite: COMPOSITE,
      semantic: SEMANTIC,
      panel: PANEL,
      swatchPlates: SWATCH_PLATES,
      sheet: SHEET,
      rail: RAIL,
      inset: INSET,
      pad: PAD,
      content: CONTENT,
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// The command

/** `turboslide mcp [--deck <dir>] [--derived <dir>] [--author agent:<runId>]`: serve until the client disconnects. */
export async function mcp(ctx: CommandContext): Promise<number> {
  const dir = findDeckDir(ctx.cwd, flagString(ctx.args, 'deck'), ctx.env);
  const derived = resolveOut(ctx.cwd, flagString(ctx.args, 'derived'), derivedDir(dir, ctx.cwd));
  const loaded = loadDeck(dir);
  redirectConsoleToStderr();
  const env: HandlerEnv = {
    dir,
    store: openFileStore({ dir }),
    derived,
    cwd: ctx.cwd,
    processEnv: ctx.env,
    author: ctx.author,
    log: (line) => ctx.out.warn(line),
  };
  const dispatcher = createDispatcher();
  registerReadActions(dispatcher, env);
  registerStoreActions(dispatcher, {
    store: env.store,
    lint: lintLists(),
    renderRecords: () => renderRecords(env),
  });
  /* deck.create makes a sibling of this deck under the same decks/ folder; deck.rename writes this deck */
  registerDeckActions(dispatcher, {
    store: env.store,
    lint: lintLists(),
    decksDir: decksDirOfDeck(dir),
  });
  const context: ActionContext = { author: ctx.author, deckDir: dir };
  const { server, tools } = createMcpServer({
    dispatcher,
    source: fileDeckSource(env, loaded.deck.id),
    author: context.author,
    deckDir: context.deckDir,
    version: await cliVersion(),
    log: env.log,
  });
  ctx.out.warn(
    `turboslide mcp: ${loaded.deck.id} at revision ${loaded.deck.revision} from ${dir}; ${tools.length} tools; derived files under ${derived}; stdio`,
  );
  await serveStdio(server);
  ctx.out.warn('turboslide mcp: connection closed');
  return EXIT.ok;
}

async function cliVersion(): Promise<string> {
  try {
    const text = await readFile(new URL('../../package.json', import.meta.url), 'utf8');
    const parsed = JSON.parse(text) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}
