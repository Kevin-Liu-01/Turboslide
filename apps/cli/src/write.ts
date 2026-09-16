// The CLI side of the typed write path (SPEC 7.2): the deck's FileStore, --base-revision (the
// current revision when omitted, the convenience mode for a human at a shell), --force and --note,
// documents from stdin or --file, values parsed as JSON with a string fallback, and the mapping
// of the error classes to exit codes: a ConflictError prints the current document as the JSON
// result and exits 1; TypeError and RangeError are usage errors and exit 2.
import { isAbsolute, join, resolve } from 'node:path';

import { formatFinding } from '@turboslide/lint/run';
import type { Slide } from '@turboslide/schema/deck';
import { makeDiagram } from '@turboslide/schema/diagrams';
import { ConflictError, ForbiddenError, GoneError } from '@turboslide/schema/errors';
import { parseBlockAddress } from '@turboslide/schema/ids';
import { parseJson } from '@turboslide/schema/json';
import { openFileStore } from '@turboslide/store/file-store';
import type { FileStore } from '@turboslide/store/file-store';

import type { Asset } from '@turboslide/schema/assets';
import { assetAdd, materialCapture } from '@turboslide/materials/actions';

import { flagBoolean, flagString } from './args.ts';
import type { CommandContext } from './context.ts';
import {
  derivedDir,
  findDeckDir,
  loadDeck,
  readJson,
  readRenderRecords,
  repoRootFor,
} from './deck-files.ts';
import { headlessCanvasMeasurer, headlessFitMeasurer } from './deps/canvas.ts';
import { lintLists } from './deps/theme.ts';
import { GateError, UsageError } from './exit.ts';
import type { LaneDeps } from './actions/deps.ts';
import { localCaller, originOf } from './record-actions.ts';
import type { RecordDeps } from './record-actions.ts';
import { localPreferencesStore, principalIdOf } from './records/principal.ts';
import { importLaneDeps } from '@turboslide/import/lane-node';
import {
  documentSpelling,
  readDictionaryFile,
  writeDictionaryFile,
} from '@turboslide/spelling/node';
import { deckTextRefs } from '@turboslide/lint/static/spelling';
import { CORRECTIONS } from '@turboslide/schema/autocorrect-lists';
import { PRODUCT_TOKENS, PROPER_NOUNS } from '@turboslide/theme/copy';
import { versionPath } from '@turboslide/store/versions';
import { rmSync } from 'node:fs';
import type { SlideResult, WriteContext } from './store-actions.ts';

/** The store over the deck the run resolves (--deck, TURBOSLIDE_DECK, the nearest deck.json). */
export function openStore(ctx: CommandContext): FileStore {
  const dir = findDeckDir(ctx.cwd, flagString(ctx.args, 'deck'), ctx.env);
  return openFileStore({ dir });
}

/**
 * The checkout's state folder, `<repo>/.turboslide`: the inbox, the principal records and the
 * preferences live there, beside the derived folder when the deck sits outside a repository.
 */
export function stateDirOf(ctx: CommandContext, store: FileStore): string {
  return join(
    repoRootFor(store.dir) ?? derivedDir(store.dir, ctx.cwd).replace(/\/\.turboslide$/, ''),
    '.turboslide',
  );
}

export function storeDeps(ctx: CommandContext, store: FileStore): LaneDeps {
  // the canvas and fit measurers run headless Chromium over the deck directory, one page per
  // action call (gslides-parity SPEC-2 1.3, 0.104); the slides are read from disk at call time
  const slidesOf = (): Record<string, Slide> => loadDeck(store.dir).slides;
  return {
    store,
    lint: lintLists(),
    renderRecords: () =>
      readRenderRecords(join(derivedDir(store.dir, ctx.cwd), 'render', 'render.json')),
    measureCanvas: headlessCanvasMeasurer(store.dir, slidesOf),
    measureFit: headlessFitMeasurer(store.dir, slidesOf),
    // the diagram templates (SPEC-2 2.8.3): B5's @turboslide/schema/diagrams, bound at merge 2
    diagrams: makeDiagram,
    // the caller's preferences record on the checkout (gslides-parity SPEC-5 7.1; b5.md request
    // 1): the --author principal's file under <repo>/.turboslide/principals/, the file the editor
    // on localhost reads, so prefs.get and prefs.set run on the CLI without a studio
    preferences: localPreferencesStore(stateDirOf(ctx, store), principalIdOf(ctx.author)),
    /* round five (gslides-parity SPEC-5 5.5, 4.6; b3.md B3-7): the import bridge over the decks
       folder, file paths allowed on a checkout */
    imports: importLaneDeps({ decksDir: decksDirOfStore(store), cwd: ctx.cwd, allowPaths: true }),
    /* SPEC-5 7.2, 7.4, 7.7 (b5.md request 9): nspell over the deck's language with the personal
       dictionary of the --author principal, the checkout's dictionary.txt, the version files */
    spelling: documentSpelling({
      corrections: CORRECTIONS,
      stateDir: stateDirOf(ctx, store),
      ignore: [...PROPER_NOUNS, ...PRODUCT_TOKENS],
      refs: deckTextRefs,
      personal: async () =>
        (await localPreferencesStore(stateDirOf(ctx, store), principalIdOf(ctx.author)).load())
          .spelling.dictionary,
    }),
    dictionaryFile: {
      read: () => readDictionaryFile(stateDirOf(ctx, store)),
      write: (words) => {
        writeDictionaryFile(stateDirOf(ctx, store), words);
      },
    },
    versions: {
      remove: async (ns) => {
        for (const n of ns) rmSync(versionPath(store.dir, n), { force: true });
      },
    },
  };
}

/** The `decks/` folder a deck folder sits in. */
export function decksDirOfStore(store: FileStore): string {
  return join(store.dir, '..');
}

/**
 * The record actions' deps over a deck (record-actions.ts): the caller is the CLI's author as the
 * checkout principal (`local:<name>`, `agent:<runId>`), the inbox and the principal records live
 * under the repository's `.turboslide/`, URLs print against TURBOSLIDE_ORIGIN or the dev server,
 * and the file and url forms of the background picture and the material frame run the materials
 * package's asset.add and material.capture over the same store.
 */
export function recordDeps(ctx: CommandContext, store: FileStore): RecordDeps {
  const author = { ...ctx.author, principalId: principalIdOf(ctx.author) };
  const deps = storeDeps(ctx, store);
  const assetDeps = { store, cwd: ctx.cwd, log: (line: string) => ctx.out.human(line) };
  return {
    store,
    deckId: store.id,
    stateDir: stateDirOf(ctx, store),
    decksDir: decksDirOfStore(store),
    origin: originOf(ctx.env),
    caller: localCaller(author),
    author,
    storeDeps: deps,
    addAsset: async (request, writeCtx, baseRevision) =>
      assetAdd(assetDeps, writeCtx, { ...request, baseRevision }),
    captureMaterial: async (request, writeCtx, baseRevision) => {
      const captured = await materialCapture(assetDeps, writeCtx, {
        materialId: request.materialId,
        ...(request.preset !== undefined ? { preset: request.preset } : {}),
        ...(request.uniforms !== undefined ? { uniforms: request.uniforms as never } : {}),
        anchors: [request.anchor ?? 5500],
        role: 'frame',
        baseRevision,
      });
      const frame: Asset | undefined = Array.isArray(captured) ? captured[0] : captured;
      if (frame === undefined) throw new Error('material.capture produced no frame');
      return frame;
    },
  };
}

/** --base-revision, or the current revision when omitted. */
export async function baseRevision(ctx: CommandContext, store: FileStore): Promise<number> {
  const flag = flagString(ctx.args, 'base-revision');
  if (flag === undefined) return store.revision();
  const n = Number(flag);
  if (!Number.isInteger(n) || n < 0)
    throw new UsageError(`--base-revision wants a non-negative integer, got ${flag}`);
  return n;
}

export function writeContext(ctx: CommandContext): WriteContext {
  const note = flagString(ctx.args, 'note');
  return {
    author: ctx.author,
    force: flagBoolean(ctx.args, 'force'),
    ...(note !== undefined ? { note } : {}),
    onWarning: (line) =>
      ctx.out.warn(`lease: ${line} (the write went through; leases are advisory)`),
  };
}

/**
 * Runs an action and maps its errors: a ConflictError becomes the JSON result (the current
 * document included, so the re-read is free) and exit 1; malformed input and unknown ids exit 2.
 */
export async function runAction<T>(ctx: CommandContext, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ConflictError) {
      ctx.out.result({
        error: 'ConflictError',
        status: error.status,
        message: error.message,
        currentRevision: error.currentRevision,
        ...(error.holder !== undefined ? { holder: error.holder } : {}),
        ...(error.current !== undefined ? { current: error.current } : {}),
      });
      throw new GateError(`${error.message}; re-read the document and retry`);
    }
    if (error instanceof TypeError || error instanceof RangeError)
      throw new UsageError(error.message);
    // a missing right and a revoked token (gslides-parity SPEC-3 6.2, 6.4) read as the fixed
    // sentences with exit 2; the JSON result carries the status for a script
    if (error instanceof ForbiddenError || error instanceof GoneError) {
      ctx.out.result({
        error: error.name,
        status: error.status,
        code: error.code,
        message: error.message,
      });
      throw new UsageError(error.message);
    }
    throw error;
  }
}

/** A JSON document from --file, or from stdin. */
export async function readDocumentInput(ctx: CommandContext, what: string): Promise<unknown> {
  const file = flagString(ctx.args, 'file');
  if (file !== undefined) return readJson(isAbsolute(file) ? file : resolve(ctx.cwd, file));
  const text = await ctx.readStdin();
  if (text.trim() === '')
    throw new UsageError(`${what} expected as JSON on stdin (or pass --file <path>)`);
  try {
    return parseJson(text, 'stdin');
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
}

/** A command-line value: JSON when it parses (22, true, [1,2], "x"), the text itself otherwise (4/8). */
export function parseValue(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/** `<slideId>#<blockId>` from the first positional. */
export function requireAddress(
  ctx: CommandContext,
  usage: string,
): { slideId: string; blockId: string } {
  const address = ctx.rest[0];
  if (!address) throw new UsageError(usage);
  try {
    return parseBlockAddress(address);
  } catch (error) {
    throw new UsageError(`${error instanceof Error ? error.message : String(error)}\n${usage}`);
  }
}

export function requirePositional(ctx: CommandContext, index: number, usage: string): string {
  const value = ctx.rest[index];
  if (!value) throw new UsageError(usage);
  return value;
}

/** Prints a slide result: the machine shape on stdout with --json, one summary line otherwise. */
export function printSlideResult(ctx: CommandContext, verb: string, result: SlideResult): void {
  ctx.out.result(result);
  ctx.out.human(
    `${verb} ${result.slide.id}: revision ${result.revision}, ${result.findings.length} finding(s)`,
  );
  for (const finding of result.findings) ctx.out.human(`  ${formatFinding(finding)}`);
}
