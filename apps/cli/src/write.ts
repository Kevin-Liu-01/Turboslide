// The CLI side of the typed write path (SPEC 7.2): the deck's FileStore, --base-revision (the
// current revision when omitted, the convenience mode for a human at a shell), --force and --note,
// documents from stdin or --file, values parsed as JSON with a string fallback, and the mapping
// of the error classes to exit codes: a ConflictError prints the current document as the JSON
// result and exits 1; TypeError and RangeError are usage errors and exit 2.
import { isAbsolute, join, resolve } from 'node:path';

import { formatFinding } from '@turboslide/lint/run';
import { ConflictError } from '@turboslide/schema/errors';
import { parseBlockAddress } from '@turboslide/schema/ids';
import { parseJson } from '@turboslide/schema/json';
import { openFileStore } from '@turboslide/store/file-store';
import type { FileStore } from '@turboslide/store/file-store';

import { flagBoolean, flagString } from './args.ts';
import type { CommandContext } from './context.ts';
import { derivedDir, findDeckDir, readJson, readRenderRecords } from './deck-files.ts';
import { lintLists } from './deps/theme.ts';
import { GateError, UsageError } from './exit.ts';
import type { SlideResult, StoreActionDeps, WriteContext } from './store-actions.ts';

/** The store over the deck the run resolves (--deck, TURBOSLIDE_DECK, the nearest deck.json). */
export function openStore(ctx: CommandContext): FileStore {
  const dir = findDeckDir(ctx.cwd, flagString(ctx.args, 'deck'), ctx.env);
  return openFileStore({ dir });
}

export function storeDeps(ctx: CommandContext, store: FileStore): StoreActionDeps {
  return {
    store,
    lint: lintLists(),
    renderRecords: () =>
      readRenderRecords(join(derivedDir(store.dir, ctx.cwd), 'render', 'render.json')),
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
