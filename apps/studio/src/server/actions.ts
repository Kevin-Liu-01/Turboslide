import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { createDispatcher } from '@turboslide/agent/dispatch';
import type { Dispatcher } from '@turboslide/agent/dispatch';
import { registerReadActions } from '@turboslide/agent/http/readers';
import type { StudioSession } from '@turboslide/agent/http/sessions';
import { registerDeckActions } from '@turboslide/cli/commands/deck';
import { registerStoreActions } from '@turboslide/cli/store-actions';
import type { DeckSource } from '@turboslide/mcp/resources';
import { parseJsonResult, runTurboslide } from '@turboslide/render-worker/cli';
import { createWorkerClient } from '@turboslide/render-worker/client';
import type { WorkerClient } from '@turboslide/render-worker/client';
import type { SheetJobResult } from '@turboslide/render-worker/jobs/sheet';
import { cacheDir, defaultPaths } from '@turboslide/render-worker/paths';
import type { DeckDocument } from '@turboslide/schema/deck';
import type { ExportReport } from '@turboslide/schema/export';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import { THEME_NAMES } from '@turboslide/schema/render';
import type { RenderRecord, Theme } from '@turboslide/schema/render';
import { loadDeckDir, openFileStore } from '@turboslide/store/file-store';
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

import { lintLists } from './lint';
import { deckDir, repoRoot } from './root';
import { studioSessions } from './sessions';

/**
 * The dispatcher behind the hosted agent surface (SPEC 7.1 "one action table"; MILESTONES M4
 * item 1): what POST /api/actions/:action and the /mcp tools run. It is the same composition the
 * CLI's `turboslide mcp` makes over a deck directory, with two differences the studio's rules
 * force: renders, sheets and exports go through the render worker (SPEC 3.3 item 7, never
 * Chromium in the web app), and the read handlers come from @turboslide/agent/http/readers over
 * the store's normalized document. The writes are the CLI's own store actions
 * (@turboslide/cli/store-actions registerStoreActions), so every transport runs one
 * implementation; leases are enforced for agent authors by the store itself (packages/store
 * lease.ts) and `force` arrives in the action context from the request (the store actions read
 * `ctx.force`, the CLI's --force).
 *
 * view.goto is registered only when a studio page is attached to the deck (server/sessions.ts):
 * the command runs in that page through window.turboslide.studio and the page's view state comes
 * back, so the tool list an MCP client reads is what it can call (SPEC 7.3).
 *
 * This module is server only (node:fs, the worker client); the routes import it, nothing under
 * the client bundle does.
 */

/** The deck a request without ?deck= addresses. */
export const DEFAULT_DECK = 'gt-brand';

/** What the latest sheet of a deck and theme is, for deck://sheet/<theme>; per process. */
type SheetPaths = { image: string; map: string };

const SHEETS = Symbol.for('turboslide.studio.sheets');
type SheetStore = Map<string, SheetPaths>;

function latestSheets(): SheetStore {
  const holder = globalThis as unknown as Record<symbol, SheetStore | undefined>;
  holder[SHEETS] ??= new Map();
  return holder[SHEETS];
}

let client: WorkerClient | undefined;

function worker(): WorkerClient {
  client ??= createWorkerClient();
  return client;
}

export function storeFor(deckId: string): FileStore {
  if (!SLUG_PATTERN.test(deckId)) throw new RangeError('deckId must be a slug');
  const dir = deckDir(deckId);
  if (!existsSync(join(dir, 'deck.json'))) throw new RangeError(`No deck ${deckId} under decks/`);
  return openFileStore({ dir });
}

/** The worker's cached records for a revision, both themes, 1x (server/lint.ts reads the same files). */
export function cachedRecords(
  deckId: string,
  revision: number,
  slideIds: readonly string[],
): RenderRecord[] {
  const paths = defaultPaths();
  const out: RenderRecord[] = [];
  for (const theme of THEME_NAMES) {
    const dir = cacheDir(paths, deckId, revision, theme, 1);
    if (!existsSync(dir)) continue;
    for (const slideId of slideIds) {
      const file = join(dir, `${slideId}.json`);
      if (!existsSync(file)) continue;
      try {
        out.push(JSON.parse(readFileSync(file, 'utf8')) as RenderRecord);
      } catch {
        // a half-written cache file: the rendered layer skips this slide
      }
    }
  }
  return out;
}

/** The facade URL of one render; the revision names the pixels (server/render.ts imageUrl). */
export function renderUrl(
  deckId: string,
  slideId: string,
  theme: Theme,
  scale: 1 | 2,
  revision: number,
): string {
  return `/api/render/${encodeURIComponent(slideId)}?deck=${encodeURIComponent(deckId)}&theme=${theme}&scale=${scale}&revision=${revision}`;
}

/**
 * Reads an image the MCP server names: a facade URL from render.slide (the worker answers from its
 * cache) or a file path from a deck:// resource (the cached render or a sheet), for image content.
 */
export async function readRenderUrl(url: string): Promise<Uint8Array> {
  if (!url.startsWith('/api/render/')) return new Uint8Array(await readFile(url));
  const parsed = new URL(url, 'http://localhost');
  const match = /^\/api\/render\/([^/?]+)$/.exec(parsed.pathname);
  if (match === null) throw new RangeError(`${url} is not a render URL`);
  const slideId = decodeURIComponent(match[1] ?? '');
  const deckId = parsed.searchParams.get('deck') ?? DEFAULT_DECK;
  const theme: Theme = parsed.searchParams.get('theme') === 'dark' ? 'dark' : 'light';
  const scale: 1 | 2 = parsed.searchParams.get('scale') === '2' ? 2 : 1;
  const rendered = await worker().renderSlide({ deckId, slideId, theme, scale });
  return rendered.png;
}

type SlideIds = 'all' | string[];

function orderOf(document: DeckDocument): string[] {
  return document.deck.sections.flatMap((section) => section.slideIds);
}

/** Registers render.slide, render.sheet, export.run, judge.bundle and build.run over the render worker and the CLI. */
function registerWorkerActions(dispatcher: Dispatcher, deckId: string, store: FileStore): void {
  dispatcher.register('render.slide', async (input) => {
    const {
      slideIds,
      themes = ['light', 'dark'],
      scale = 1,
    } = input as {
      slideIds: SlideIds;
      themes?: Theme[];
      scale?: 1 | 2;
    };
    const { document } = await store.read();
    const ids = slideIds === 'all' ? orderOf(document) : slideIds;
    for (const id of ids)
      if (document.slides[id] === undefined) throw new RangeError(`No slide "${id}"`);
    const records: RenderRecord[] = [];
    const images: string[] = [];
    // sequential: the local queue runs one Chromium at a time and the machine is shared
    for (const slideId of ids) {
      for (const theme of themes) {
        const rendered = await worker().renderSlide({ deckId, slideId, theme, scale });
        const url = renderUrl(deckId, slideId, theme, scale, rendered.record.revision);
        records.push({ ...rendered.record, image: url });
        images.push(url);
      }
    }
    return { records, images };
  });

  dispatcher.register('render.sheet', async (input) => {
    const { slideIds, themes, cols, thumb, numbered, overlay } = input as {
      slideIds: SlideIds;
      themes?: Theme[];
      cols?: number;
      thumb?: number;
      numbered?: boolean;
      overlay?: 'lint' | 'plate';
      out?: string;
    };
    const job = await worker().submit('sheet', {
      deckId,
      slideIds,
      ...(themes !== undefined ? { themes } : {}),
      ...(cols !== undefined ? { cols } : {}),
      ...(thumb !== undefined ? { thumb } : {}),
      ...(numbered !== undefined ? { numbered } : {}),
      ...(overlay !== undefined ? { overlay } : {}),
    });
    const done = await worker().wait(job.id, 600_000);
    if (done.status !== 'done') throw new Error(done.error?.message ?? 'the sheet job failed');
    const result = done.result as SheetJobResult;
    const sheets = result.sheets.map((sheet) => {
      latestSheets().set(`${deckId}:${sheet.theme}`, { image: sheet.png, map: sheet.map });
      return {
        theme: sheet.theme,
        image: sheet.png,
        cells: sheet.cellMap.cells.map((cell) => ({
          slideId: cell.slideId,
          n: cell.n,
          box: cell.box,
        })),
      };
    });
    return { sheets };
  });

  dispatcher.register('export.run', async (input) => {
    const {
      out: _out,
      slideIds: _slideIds,
      baseline: _baseline,
      ...rest
    } = input as Record<string, unknown>;
    // the output directory is the worker's job directory, never a caller-chosen path (SPEC 11)
    const job = await worker().submit('export', { deckId, ...rest });
    const done = await worker().wait(job.id, 900_000);
    if (done.status !== 'done') throw new Error(done.error?.message ?? 'the export job failed');
    const report = (done.result as { report?: ExportReport } | undefined)?.report;
    if (report === undefined) throw new Error('export.run: the export job produced no report');
    return report;
  });

  dispatcher.register('judge.bundle', async (input) => {
    const { slideIds, out } = input as { slideIds: SlideIds; out: string };
    // the bundle lands under the repository's derived directory, named by the caller's base name
    const dir = join(repoRoot(), '.turboslide', 'http', 'judge', deckId);
    mkdirSync(dir, { recursive: true });
    const name = basename(out).replace(/[^a-zA-Z0-9._-]/g, '_') || 'judge';
    const run = await runTurboslide([
      'judge',
      'bundle',
      ...(slideIds === 'all' ? ['all'] : slideIds),
      '--deck',
      store.dir,
      '--out',
      join(dir, name),
      '--json',
    ]);
    return parseJsonResult<{ dir: string; files: string[]; revision: number }>(run, 'judge bundle');
  });

  dispatcher.register('build.run', async (input) => {
    const { out, budgetMB = 16 } = input as { out: string; budgetMB?: number; quality?: number };
    // the file lands under the repository's derived directory, named by the caller's base name
    const dir = join(repoRoot(), '.turboslide', 'http', 'build', deckId);
    mkdirSync(dir, { recursive: true });
    const name = basename(out).replace(/[^a-zA-Z0-9._-]/g, '_') || 'deck.html';
    const path = join(dir, name.endsWith('.html') ? name : `${name}.html`);
    const run = await runTurboslide([
      'build',
      '--deck',
      store.dir,
      '--out',
      path,
      '--budget',
      String(budgetMB),
      '--json',
    ]);
    const built = parseJsonResult<{
      path: string;
      bytes: number;
      budgetBytes: number;
      overBudget: boolean;
      missing: string[];
      failed: { path: string; error: string }[];
    }>(run, 'build');
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

/** The actions @turboslide/materials/actions implements (registerAssetActions). */
const ASSET_ACTION_IDS = [
  'asset.add',
  'asset.dither',
  'asset.capture',
  'material.capture',
  'material.list',
] as const;

/**
 * Registers asset.add, asset.dither, asset.capture, material.capture and material.list with
 * handlers that load @turboslide/materials/actions on first call. The module is loaded lazily,
 * not imported at the top, because the route files that import this module (routes/mcp.ts,
 * routes/api/actions.$action.ts) are in the client's module graph and the materials package
 * reaches the headless package and playwright-core, whose vite import made the dev server's
 * dependency optimizer fail on fsevents (measured on the M5 integration; the production build
 * tree-shakes it either way). sharp and the capture browser run on this process's Node side only.
 */
function registerAssetActionsLazily(
  dispatcher: Dispatcher,
  deckId: string,
  store: FileStore,
): void {
  let inner: Promise<Dispatcher> | undefined;
  const load = (): Promise<Dispatcher> => {
    inner ??= import('@turboslide/materials/actions').then(({ registerAssetActions }) => {
      const d = createDispatcher();
      registerAssetActions(d, {
        store,
        cwd: repoRoot(),
        log: (line) => {
          if (process.env.TURBOSLIDE_AGENT_LOG === '1') console.error(`agent ${deckId}: ${line}`);
        },
      });
      return d;
    });
    return inner;
  };
  for (const id of ASSET_ACTION_IDS) {
    dispatcher.register(id, async (input, context) => (await load()).dispatch(id, input, context));
  }
}

/** view.goto runs in the attached page; the latest attached session at call time answers. */
function registerViewActions(dispatcher: Dispatcher, deckId: string): void {
  dispatcher.register('view.goto', async (input) => {
    const session = studioSessions().attached(deckId, 'view.goto');
    if (session === undefined) {
      throw new RangeError(
        `No studio page is attached to deck ${deckId}; open /deck/${deckId} or /edit/${deckId}`,
      );
    }
    return studioSessions().request(session.id, 'view.goto', input);
  });
}

export type DeckDispatcher = {
  deckId: string;
  store: FileStore;
  dispatcher: Dispatcher;
  source: DeckSource;
  /** The attached page the view actions run in, when one is attached at creation. */
  session: StudioSession | undefined;
};

export type DeckDispatcherOptions = {
  /** Register view.goto when a studio page is attached (the MCP server binds its tool list at initialize). */
  withView?: boolean;
};

/** One dispatcher over one deck: the store actions, the readers, the worker actions and, when attached, the view. */
export function deckDispatcher(
  deckId: string,
  options: DeckDispatcherOptions = {},
): DeckDispatcher {
  const store = storeFor(deckId);
  const dispatcher = createDispatcher();
  const load = async (): Promise<DeckDocument> => (await store.read()).document;
  const renderRecords = (document: DeckDocument): RenderRecord[] =>
    cachedRecords(deckId, document.deck.revision, orderOf(document));
  registerReadActions(dispatcher, {
    load,
    lint: lintLists(),
    renderRecords,
    deckDirFor: (path) => {
      const id = basename(path);
      if (
        !SLUG_PATTERN.test(id) ||
        (path !== id && path !== `decks/${id}` && path !== `decks/${id}/`)
      ) {
        throw new RangeError(
          `validate.run reads decks under decks/ by id; got ${JSON.stringify(path)}`,
        );
      }
      return storeFor(id).dir;
    },
  });
  registerStoreActions(dispatcher, {
    store,
    lint: lintLists(),
    // fix.run's rendered layer reads the worker's cache for the current revision (sync, like the CLI's render.json read)
    renderRecords: () => renderRecords(loadDeckDir(store.dir).document),
  });
  // deck.create makes a sibling under decks/; deck.rename writes this deck's title
  registerDeckActions(dispatcher, {
    store,
    lint: lintLists(),
    renderRecords: () => renderRecords(loadDeckDir(store.dir).document),
    decksDir: join(repoRoot(), 'decks'),
  });
  registerAssetActionsLazily(dispatcher, deckId, store);
  registerWorkerActions(dispatcher, deckId, store);
  const session = options.withView ? studioSessions().attached(deckId, 'view.goto') : undefined;
  if (session !== undefined) registerViewActions(dispatcher, deckId);
  const source: DeckSource = {
    deckId,
    manifest: async () => (await load()).deck,
    slides: async () => {
      const document = await load();
      let n = 0;
      return orderOf(document).flatMap((id) => {
        const slide = document.slides[id];
        if (slide === undefined) return [];
        n += 1;
        const title =
          slide.kind === 'title' ? slide.heading : slide.kind === 'statement' ? slide.big : id;
        return [{ id, n, title: typeof title === 'string' ? title : id }];
      });
    },
    slide: async (slideId) => (await load()).slides[slideId],
    latestRender: async (slideId, theme) => {
      // the newest cached revision that holds the slide: the current one when it was rendered
      // since the last write, else the last render of the slide (deck://render is "the latest")
      const paths = defaultPaths();
      const root = join(paths.workerDir, 'cache', deckId);
      if (!existsSync(root)) return undefined;
      const revisions = readdirSync(root)
        .map((name) => Number(name))
        .filter((revision) => Number.isInteger(revision))
        .sort((a, b) => b - a);
      for (const revision of revisions) {
        const dir = cacheDir(paths, deckId, revision, theme, 1);
        const image = join(dir, `${slideId}.png`);
        const json = join(dir, `${slideId}.json`);
        if (existsSync(image) && existsSync(json)) {
          return { image, record: JSON.parse(readFileSync(json, 'utf8')) as unknown };
        }
      }
      return undefined;
    },
    latestSheet: async (theme) => latestSheets().get(`${deckId}:${theme}`),
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
  return { deckId, store, dispatcher, source, session };
}
