import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import { getRequest, setResponseHeader } from '@tanstack/react-start/server';
import { createDispatcher } from '@turboslide/agent/dispatch';
import type { ActionContext, Dispatcher } from '@turboslide/agent/dispatch';
import { registerReadActions } from '@turboslide/agent/http/readers';
import type { StudioSession } from '@turboslide/agent/http/sessions';
import { setIntakePolicy, setSsrfReporter } from '@turboslide/headless/capture/shared';
import { registerDeckActions } from '@turboslide/cli/commands/deck';
import type { DeckCopyInput, DeckIdInput, DeckListInput } from '@turboslide/cli/commands/deck';
import { registerRecordActions } from '@turboslide/cli/record-actions';
import type { RecordDeps } from '@turboslide/cli/record-actions';
import type { Caller } from '@turboslide/cli/records/access';
import { registerStoreActions, slideImport } from '@turboslide/cli/store-actions';
import type { SlideImportInput, StoreActionDeps } from '@turboslide/cli/store-actions';
import { labelFor } from '@turboslide/identity/labels';
import { normalizeName } from '@turboslide/identity/names';
import type { DeckSource } from '@turboslide/mcp/resources';
import { parseJsonResult, runTurboslide } from '@turboslide/render-worker/cli';
import { createWorkerClient } from '@turboslide/render-worker/client';
import type { WorkerClient } from '@turboslide/render-worker/client';
import type { SheetJobResult } from '@turboslide/render-worker/jobs/sheet';
import { cacheDir, defaultPaths } from '@turboslide/render-worker/paths';
import type { Asset } from '@turboslide/schema/assets';
import type { CanvasBoxes } from '@turboslide/schema/canvas';
import type { DeckDocument } from '@turboslide/schema/deck';
import { makeDiagram } from '@turboslide/schema/diagrams';
import { ConflictError, ForbiddenError, GoneError } from '@turboslide/schema/errors';
import type { ExportReport } from '@turboslide/schema/export';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import type { Author } from '@turboslide/schema/mutations';
import { THEME_NAMES } from '@turboslide/schema/render';
import type { RenderRecord, Theme } from '@turboslide/schema/render';
import { loadDeckDir, openFileStore } from '@turboslide/store/file-store';
import type { FileStore } from '@turboslide/store/file-store';
import type { HostedDecks } from '@turboslide/store/hosted';
import { AssetExistsError } from '@turboslide/store/store';
import type { DeckStore } from '@turboslide/store/store';
import { StaleRevisionError } from '@turboslide/store/templates';
import type { CreateDeckInput } from '@turboslide/store/templates';
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

import { hostedAccessHooks } from './access';
import { agentAuth } from './auth';
import { bootstrapAgentContext } from './authorize';
import type { AuthContext } from './authorize';
import {
  registerAccountActions,
  registerAdminActions as registerAccountAdminActions,
} from './auth/actions';
import type { ActionRequestFacts } from './auth/actions';
import { requestIdentity } from './auth/identity';
import type { RequestIdentity } from './auth/identity';
import { isSecureRequest } from './auth/session';
import {
  COMMENT_ACTION_IDS,
  notificationList,
  notificationMarkRead,
  notificationSettings,
  runCommentAction,
} from './comments';
import type { NotificationCaller } from './comments';
import { FLAG_DEFAULTS, flagOn, setFlag } from './flags';
import type { FlagName } from './flags';
import { lintLists } from './lint';
import { logSecurityEvent } from './log';
import { measureSlidesThroughWorker } from './measure';
import { registerMigrateStorage } from './migrate';
import {
  commentCallerFor,
  decideFor,
  redisCommands,
  requestIdentity as roomIdentity,
} from './room';
import {
  deckDir,
  ensureDeckAssets,
  ensureDecks,
  isHosted,
  openDeckStore,
  repoRoot,
  stateDir,
  storeSelection,
  workerClientOptions,
} from './root';
import { studioSessions } from './sessions';
import { deleteUpload, readUpload } from './upload';

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
  client ??= createWorkerClient(workerClientOptions());
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
  await ensureDeckAssets(deckId);
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
    await ensureDeckAssets(deckId);
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

/**
 * The intake policy of the studio's dispatchers (gslides-parity SPEC-3 8.6, 11.5 R0; report 04
 * F3 fix steps 1 and 2): the HTTP, MCP and window transports all run through this composition,
 * so a caller never names a file on the server (`allowPaths: false`), and on a hosted store the
 * loopback names leave the allowlist and svg leaves the accepted formats (`hosted`). The CLI and
 * `turboslide mcp` over stdio run in their own process with the checkout policy. A fetch the
 * pinned lookup refuses (a name resolving to a private address) is one `ssrf.refused` line.
 */
function setStudioIntakePolicy(): void {
  setIntakePolicy({ allowPaths: false, hosted: isHosted() });
  setSsrfReporter((event) =>
    logSecurityEvent({
      event: 'ssrf.refused',
      reason: `${event.reason}: ${event.host}`,
      status: 400,
    }),
  );
}

/**
 * The actions @turboslide/materials/actions implements that this dispatcher serves from it
 * (registerAssetActions; kept as a literal so the materials module stays out of this module's
 * static graph). `picture.materialize` is round three's (gslides-parity SPEC-3 10.4): it replaces
 * the store actions' registration of the same id because the materials package carries the
 * dither pipeline. The two background writes of 10.5 stay the record actions' (one write per
 * call, the file, url and upload forms through asset.add), as on the CLI.
 */
const ASSET_ACTION_IDS = [
  'asset.add',
  'asset.dither',
  'asset.capture',
  'material.capture',
  'material.list',
  'picture.materialize',
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
function assetDispatcherLoader(
  dispatcher: Dispatcher,
  deckId: string,
  store: FileStore,
  deckStore: DeckStore,
): () => Promise<Dispatcher> {
  let inner: Promise<Dispatcher> | undefined;
  const load = (): Promise<Dispatcher> => {
    inner ??= import('@turboslide/materials/actions').then(({ registerAssetActions }) => {
      setStudioIntakePolicy();
      const d = createDispatcher();
      // the hosted store with the mirror folder as `dir` (gslides-parity SPEC-3 8.5, 0.39; report
      // 10 F49): the record commit goes through the Blob protocol and `putAsset` reaches the store,
      // so a twin added on one instance is served by every instance
      const hosted: DeckStore & { readonly dir: string } = { ...deckStore, dir: store.dir };
      registerAssetActions(d, {
        store: hosted,
        cwd: repoRoot(),
        // the intake policy of the studio's transports (SPEC-3 8.5, 8.6; b4.md request 2.4.4,
        // b5.md request 5): no file paths, the hosted rules on a hosted store, the presigned
        // uploads of server/upload.ts, and the deck dispatcher for the canvas conversion a
        // background picture needs (integrator, merge 2)
        allowPaths: false,
        hosted: isHosted(),
        readUpload,
        dispatch: (id, input, context) => dispatcher.dispatch(id, input, context),
        log: (line) => {
          if (process.env.TURBOSLIDE_AGENT_LOG === '1') console.error(`agent ${deckId}: ${line}`);
        },
      });
      return d;
    });
    return inner;
  };
  return load;
}

/** Registers the asset ids over the lazily loaded materials dispatcher. */
function registerAssetActionsLazily(dispatcher: Dispatcher, load: () => Promise<Dispatcher>): void {
  for (const id of ASSET_ACTION_IDS) {
    dispatcher.register(id, async (input, context) => {
      const output = await (await load()).dispatch(id, input, context);
      // a presigned upload is consumed by the commit it fed (SPEC-3 8.5; b4.md request 2.4.4)
      const upload = (input as { upload?: unknown } | null)?.upload;
      if (id === 'asset.add' && typeof upload === 'string') deleteUpload(upload);
      return output;
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Round three: the caller of a request and the record, comment, notification and account actions
// (gslides-parity SPEC-3 sections 5, 6, 7 and 12; the integrator at merge 2 for b1.md, b2.md R12
// and b3.md R13)

/** The anonymous principal of a request that carries none (a unit test, a bearer with no key). */
const NO_PRINCIPAL = 'anon_00000000-0000-4000-8000-000000000000';

/** The checkout holder's principal id: the agent id of `bootstrapAgentContext('localhost')`. */
const CHECKOUT_PRINCIPAL = 'agent:localhost';

/**
 * A cookieless request the localhost rule admits (SPEC-3 0.23; server/auth.ts): curl, the CLI's
 * `--to`, an MCP client on a checkout's dev server. It carries no bearer and no cookie, so the
 * identity middleware would mint a fresh anonymous principal for every call and the second call
 * would be a stranger to the record the first one wrote; the caller is the checkout holder, as
 * the route's `authorize()` already decides (actions.$action.ts, `bootstrapAgentContext`).
 */
function isCheckoutAgent(request: Request): boolean {
  if (request.headers.has('authorization') || request.headers.has('cookie')) return false;
  const auth = agentAuth(request);
  return auth.ok && auth.mode === 'localhost';
}

/** The request being served, when the dispatcher is built inside one; undefined in a unit test. */
function currentRequest(given: Request | undefined): Request | undefined {
  if (given !== undefined) return given;
  try {
    return getRequest();
  } catch {
    return undefined;
  }
}

type CallerFacts = {
  identity: RequestIdentity | null;
  caller: Caller;
  author: Author;
  origin: string;
};

/**
 * Who the record actions act for (SPEC-3 6.2, 7.1): the request's identity from B3's resolver
 * (the account session, the API key record, the checkout token, the sealed anonymous cookie),
 * mapped to the record functions' caller and to the author the server derives. Never the body.
 */
/**
 * The identity a created deck is owned by (SPEC-3 6.1): the request's identity context, the
 * checkout holder for a cookieless localhost call, nobody without a request (a unit test).
 */
function creatorContextOf(request: Request | undefined, facts: CallerFacts): AuthContext | null {
  if (facts.identity !== null) return facts.identity.ctx;
  if (request !== undefined && isCheckoutAgent(request)) return bootstrapAgentContext('localhost');
  return null;
}

async function callerFactsFor(request: Request | undefined): Promise<CallerFacts> {
  const origin =
    request === undefined
      ? (process.env.TURBOSLIDE_ORIGIN ?? 'http://localhost:4321')
      : new URL(request.url).origin;
  const anonymous: CallerFacts = {
    identity: null,
    caller: { principalId: NO_PRINCIPAL, kind: 'anonymous' },
    author: { kind: 'human', name: labelFor(NO_PRINCIPAL) },
    origin,
  };
  if (request === undefined) return anonymous;
  if (isCheckoutAgent(request)) {
    const runId = request.headers
      .get('x-turboslide-author')
      ?.trim()
      .replace(/^agent:/, '');
    return {
      identity: null,
      caller: { principalId: CHECKOUT_PRINCIPAL, kind: 'agent', admin: true },
      author: {
        kind: 'agent',
        name: 'checkout',
        ...(runId ? { runId } : {}),
        principalId: CHECKOUT_PRINCIPAL,
      },
      origin,
    };
  }
  let identity: RequestIdentity;
  try {
    identity = await requestIdentity(request);
  } catch {
    return anonymous;
  }
  const agentish =
    identity.kind === 'agent' || identity.kind === 'bootstrap' || identity.kind === 'checkout';
  const principalId =
    identity.principalId ??
    (agentish ? `agent:${identity.ctx.agent?.tokenId ?? 'bootstrap'}` : NO_PRINCIPAL);
  const admin =
    identity.account?.admin === true ||
    identity.ctx.principal?.admin === true ||
    identity.kind === 'bootstrap' ||
    identity.kind === 'checkout';
  const caller: Caller = {
    principalId,
    kind: identity.kind === 'account' ? 'account' : agentish ? 'agent' : 'anonymous',
    ...(identity.account?.email !== undefined ? { email: identity.account.email } : {}),
    ...(admin ? { admin: true } : {}),
  };
  const author: Author = identity.author ?? {
    kind: 'human',
    name: labelFor(principalId),
    ...(identity.principalId !== null ? { principalId } : {}),
  };
  return { identity, caller, author, origin };
}

/** The request facts B3's account and admin actions read (auth/actions.ts). */
function accountFactsFor(request: Request, deckId: string): () => Promise<ActionRequestFacts> {
  return async () => ({
    identity: await requestIdentity(request),
    request,
    deckId,
    secure: isSecureRequest(request),
    setHeader: (name, value) => {
      try {
        setResponseHeader(name, value);
      } catch {
        // outside a Start response (a unit test): the header has nowhere to go
      }
    },
  });
}

/** A denial of `authorize()` as the error class every transport maps to its status (SPEC-3 6.2). */
function deniedError(status: number, body: unknown): Error {
  const words =
    typeof body === 'object' && body !== null && 'message' in body
      ? String((body as { message: unknown }).message)
      : 'not allowed';
  const capability =
    typeof body === 'object' && body !== null && 'capability' in body
      ? String((body as { capability: unknown }).capability)
      : undefined;
  if (status === 410) return new GoneError(words);
  if (status === 404) return new RangeError(words);
  return new ForbiddenError(words, capability);
}

/**
 * The twelve comment actions over the room's stream path (SPEC-3 5.9; b2.md R12): the window,
 * HTTP and MCP transports and the /api/comments route are one implementation, the checkpointer
 * writes the sidecar, and the anchors follow the text. They replace the file record handlers
 * registerRecordActions put on the same ids, which the CLI runs over a checkout with no server.
 */
function registerRoomCommentHandlers(dispatcher: Dispatcher, request: Request, deckId: string) {
  for (const id of COMMENT_ACTION_IDS) {
    dispatcher.register(id, async (input) => {
      const result = await commentCallerFor(request, deckId, id);
      if (!result.ok) throw deniedError(result.status, result.body);
      return runCommentAction(result.caller, id, input);
    });
  }
}

/** The caller's inbox over B2's inbox store (SPEC-3 5.5; b2.md R12), the same as /api/notify. */
function registerNotificationHandlers(dispatcher: Dispatcher, request: Request, deckId: string) {
  const caller = async (action: string): Promise<NotificationCaller> => {
    const identity = await roomIdentity(request);
    const owner = await decideFor(identity, deckId, 'settings', action);
    return {
      principalId: identity.principalId ?? identity.identity,
      deckId,
      settingsCapability: owner.ok && owner.shadow === undefined,
      redis: redisCommands(),
    };
  };
  dispatcher.register('notification.list', async (input) =>
    notificationList(
      await caller('notification.list'),
      input as Parameters<typeof notificationList>[1],
    ),
  );
  dispatcher.register('notification.markRead', async (input) =>
    notificationMarkRead(
      await caller('notification.markRead'),
      input as Parameters<typeof notificationMarkRead>[1],
    ),
  );
  dispatcher.register('notification.settings', async (input) =>
    notificationSettings(
      await caller('notification.settings'),
      input as Parameters<typeof notificationSettings>[1],
    ),
  );
}

/**
 * B1's record actions (apps/cli/src/record-actions.ts) over the studio's store: the share and
 * publish writes run the record functions over the access store's `load` and `save` with the
 * etag (server/access.ts `hostedAccessHooks`), the file and url forms of a background picture
 * run the materials package through the lazily loaded asset dispatcher, and the display name
 * rules are the identity package's. The caller is the request's identity.
 */
function registerRecordActionsFor(
  dispatcher: Dispatcher,
  deckId: string,
  store: FileStore,
  deckStore: DeckStore,
  storeDeps: StoreActionDeps,
  facts: CallerFacts,
  assets: () => Promise<Dispatcher>,
): void {
  const deps: RecordDeps = {
    store: { ...deckStore, dir: store.dir },
    deckId,
    stateDir: stateDir(),
    decksDir: join(repoRoot(), 'decks'),
    origin: facts.origin,
    caller: facts.caller,
    author: facts.author,
    storeDeps,
    addAsset: async (request, ctx, baseRevision) =>
      (await (await assets()).dispatch('asset.add', { ...request, baseRevision }, ctx)) as Asset,
    captureMaterial: async (request, ctx, baseRevision) => {
      const captured = await (
        await assets()
      ).dispatch(
        'material.capture',
        {
          materialId: request.materialId,
          ...(request.preset !== undefined ? { preset: request.preset } : {}),
          ...(request.uniforms !== undefined ? { uniforms: request.uniforms } : {}),
          anchors: [request.anchor ?? 5500],
          role: 'frame',
          baseRevision,
        },
        ctx,
      );
      const frame = (Array.isArray(captured) ? captured[0] : captured) as Asset | undefined;
      if (frame === undefined) throw new Error('material.capture produced no frame');
      return frame;
    },
    normalizeName: (name, taken) => {
      const result = normalizeName(name, { taken });
      return result.ok ? { ok: true, name: result.name } : { ok: false, message: result.message };
    },
    access: hostedAccessHooks(deckId),
  };
  registerRecordActions(dispatcher, deps);
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

/** A stale baseRevision against the collection is the ConflictError every transport maps to 409. */
async function mapStale<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof StaleRevisionError)
      throw new ConflictError(error.message, { currentRevision: error.currentRevision });
    throw error;
  }
}

/**
 * The deck collection actions of the Google Slides parity round (gslides-parity SPEC 7.5:
 * deck.list, deck.copy, deck.trash, deck.restore, deck.remove) over the hosted collection
 * (@turboslide/store/hosted), registered after registerDeckActions so they replace the CLI's
 * folder handlers: on the Blob backend the collection pushes the copy, stamps the trash with
 * ifMatch and deletes the prefix, which a handler over the mirror folder alone would not do.
 */
function registerHostedDeckActions(
  dispatcher: Dispatcher,
  decks: HostedDecks,
  creator: AuthContext | null,
): void {
  // a deck this caller creates or copies gets its record at once (SPEC-3 6.1; VERIFICATION-3
  // finding 4): restricted, the caller its owner; a caller with no identity leaves none
  const record = async <T extends { deckId: string }>(made: T): Promise<T> => {
    if (creator !== null) {
      const { recordNewDeck } = await import('./access');
      await recordNewDeck(made.deckId, creator);
    }
    return made;
  };
  // deck.create lands in the store (HostedDecks.create is what createStoredDeck calls), not in
  // the instance's overlay the folder handler wrote to (docs/EDITOR-DEPTH-STATUS.md section 10)
  dispatcher.register('deck.create', async (input) =>
    record(await decks.create(input as CreateDeckInput)),
  );
  dispatcher.register('deck.list', (input) => {
    const { includeTrashed } = input as DeckListInput;
    return decks.list(includeTrashed === true ? { includeTrashed: true } : {});
  });
  dispatcher.register('deck.copy', async (input) => {
    const { baseRevision, ...rest } = input as DeckCopyInput;
    return record(await mapStale(() => decks.copy(rest, baseRevision)));
  });
  dispatcher.register('deck.trash', (input) => {
    const { id, baseRevision } = input as DeckIdInput;
    return mapStale(() => decks.trash(id, baseRevision));
  });
  dispatcher.register('deck.restore', (input) => {
    const { id, baseRevision } = input as DeckIdInput;
    return mapStale(() => decks.restore(id, baseRevision));
  });
  dispatcher.register('deck.remove', (input) => {
    const { id, confirm, baseRevision } = input as DeckIdInput & { confirm?: boolean };
    if (confirm !== true) throw new TypeError('deck.remove needs confirm: true');
    return mapStale(() => decks.remove(id, baseRevision));
  });
}

/** An asset file path a deck record may name: under assets/, no traversal (SPEC 4.1, 4.3). */
function isAssetRelative(relative: string): boolean {
  return (
    relative.startsWith('assets/') &&
    !relative.includes('..') &&
    !relative.includes('\\') &&
    !relative.includes('//')
  );
}

/**
 * slide.import on the studio (gslides-parity SPEC 7.5): the source deck is read through the
 * collection, its twins are on disk before the copy, each asset file the imported slides need is
 * copied under this deck and, on the Blob backend, pushed under the deck's prefix (the store's
 * write pushes documents, not twins); the slide copies are then one write through the store
 * actions' slideImport, the implementation the CLI runs.
 */
function registerSlideImport(
  dispatcher: Dispatcher,
  deckId: string,
  deps: StoreActionDeps,
  targetDir: string,
  targetStore: DeckStore,
  decks: HostedDecks,
): void {
  dispatcher.register('slide.import', async (input, context: ActionContext) => {
    const request = input as SlideImportInput;
    const sourceDeckId = request.sourceDeckId;
    if (sourceDeckId === deckId)
      throw new RangeError(
        'slide.import copies from another deck; slide.duplicate copies within one',
      );
    const sourceStore = await decks.open(sourceDeckId);
    const document = (await sourceStore.read()).document;
    await decks.ensureAssets(sourceDeckId);
    const sourceDir = join(decks.decksDir, sourceDeckId);
    return slideImport(deps, context, request, {
      document,
      copyAsset: async (relative) => {
        if (!isAssetRelative(relative))
          throw new RangeError(`${sourceDeckId} names a file outside assets/: ${relative}`);
        const from = join(sourceDir, ...relative.split('/'));
        if (!existsSync(from)) throw new RangeError(`${sourceDeckId} has no file ${relative}`);
        // through the target store's asset write (gslides-parity SPEC-3 8.5, 0.39): the file
        // reaches the store before the record commits and nothing is ever overwritten; a name the
        // target holds with other bytes is refused, never replaced
        try {
          await targetStore.putAsset(relative, new Uint8Array(readFileSync(from)));
        } catch (error) {
          if (error instanceof AssetExistsError)
            throw new RangeError(
              `${deckId} already holds a different file at ${relative}; rename the asset in ${sourceDeckId} first`,
            );
          throw error;
        }
        const to = join(targetDir, ...relative.split('/'));
        if (!existsSync(to)) {
          mkdirSync(dirname(to), { recursive: true });
          cpSync(from, to);
        }
      },
    });
  });
}

/**
 * `admin.flag` (gslides-parity SPEC-3 0.33, 8.12): reads or flips a kill switch through
 * server/flags.ts; every instance reads the change within 5 s. The window and HTTP transports
 * reach it through the dispatcher like every action; `authorize()` ran before (an admin only
 * action by the capability table once the record store binds; the bootstrap bearer and the
 * checkout holder are the admin today).
 */
function registerAdminActions(dispatcher: Dispatcher): void {
  dispatcher.register('admin.flag', async (input) => {
    const { name, on } = input as { name: FlagName; on?: boolean };
    if (on !== undefined) await setFlag(name, on);
    const value = await flagOn(name);
    const source: 'redis' | 'file' | 'default' =
      storeSelection().kind === 'file' || process.env.TURBOSLIDE_REALTIME !== 'redis'
        ? 'file'
        : 'redis';
    return { name, on: value, default: FLAG_DEFAULTS[name], source };
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
  /**
   * The request the dispatcher acts for (its identity is the caller of the record, comment,
   * notification and account actions, SPEC-3 6.2, 7.1); the request being served when omitted,
   * and no request in a unit test, where those actions act as an anonymous caller over the files.
   */
  request?: Request;
};

/**
 * One dispatcher over one deck: the store actions, the readers, the worker actions and, when
 * attached, the view. The document reads and writes go through the selected store (the Blob
 * mirror when hosted: `openDeckStore`), so an agent's write reaches every instance; the plain
 * FileStore over the same folder serves the dir-based helpers (renders, assets). Before this the
 * route wrote through the FileStore alone and a hosted agent write never left the instance
 * (measured 2026-09-11: eight HTTP writes answered r11 to r18 while the Blob store stayed at r10).
 */
export async function deckDispatcher(
  deckId: string,
  options: DeckDispatcherOptions = {},
): Promise<DeckDispatcher> {
  // the hosted store first: opening it pulls the deck's mirror into this instance's overlay, which
  // the FileStore check below expects (a deck created after this instance started was a 404 here)
  const deckStore = await openDeckStore(deckId);
  const store = storeFor(deckId);
  const dispatcher = createDispatcher();
  const load = async (): Promise<DeckDocument> => (await deckStore.read()).document;
  const renderRecords = (document: DeckDocument): RenderRecord[] =>
    cachedRecords(deckId, document.deck.revision, orderOf(document));
  registerReadActions(dispatcher, {
    load,
    lint: lintLists(),
    renderRecords,
    // deck.info's counts.snapshots on the Blob backend (SPEC-2 8.2; B6's BlobStore.snapshots)
    ...('snapshots' in deckStore && typeof deckStore.snapshots === 'function'
      ? { snapshots: () => (deckStore as { snapshots: () => Promise<number> }).snapshots() }
      : {}),
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
  // the store actions' dependencies: fix.run's rendered layer reads the worker's cache for the
  // current revision (sync, like the CLI's render.json read); the canvas and fit measurers of
  // round two (gslides-parity SPEC-2 1.3, 0.64, 0.104) run through the render worker facade of
  // server/render.ts, one measurement per action call, so slide.toCanvas and every canvas write
  // on a slide that is not a canvas yet convert on this transport as they do on the CLI, and
  // headless Chromium stays out of this process
  const storeDeps: StoreActionDeps = {
    store: deckStore,
    lint: lintLists(),
    renderRecords: () => renderRecords(loadDeckDir(store.dir).document),
    measureCanvas: async (_deck, slides) => {
      const measured = await measureSlidesThroughWorker(
        deckId,
        slides.map((slide) => slide.id),
      );
      const boxes: Record<string, CanvasBoxes> = {};
      for (const [id, entry] of Object.entries(measured)) boxes[id] = entry.canvas;
      return boxes;
    },
    measureFit: async (_deck, slide) =>
      (await measureSlidesThroughWorker(deckId, [slide.id]))[slide.id]?.fit ?? {},
    // the diagram templates (SPEC-2 2.8.3): B5's @turboslide/schema/diagrams, bound at merge 2
    diagrams: makeDiagram,
  };
  registerStoreActions(dispatcher, storeDeps);
  // deck.create makes a sibling under decks/; deck.rename writes this deck's title
  registerDeckActions(dispatcher, { ...storeDeps, decksDir: join(repoRoot(), 'decks') });
  // the collection actions over the hosted backend (they replace the folder handlers
  // registerDeckActions put on the same ids) and slide.import, which no CLI registration offers
  // because it needs the source deck
  const decks = await ensureDecks();
  // round three, in this order (the later registration of an id wins): B1's record actions over
  // the store and the access store; B2's stream path for the twelve comment ids and the inbox
  // for the three notification ids; B2's storage migration; B3's account and admin ids with the
  // request's identity; B5's asset ids with the dither pipeline; then the worker actions and
  // admin.flag as before
  const request = currentRequest(options.request);
  const facts = await callerFactsFor(request);
  registerHostedDeckActions(dispatcher, decks, creatorContextOf(request, facts));
  registerSlideImport(dispatcher, deckId, storeDeps, store.dir, deckStore, decks);
  const assets = assetDispatcherLoader(dispatcher, deckId, store, deckStore);
  registerRecordActionsFor(dispatcher, deckId, store, deckStore, storeDeps, facts, assets);
  if (request !== undefined) {
    registerRoomCommentHandlers(dispatcher, request, deckId);
    registerNotificationHandlers(dispatcher, request, deckId);
    registerAccountActions(dispatcher, { facts: accountFactsFor(request, deckId) });
    registerAccountAdminActions(dispatcher, { facts: accountFactsFor(request, deckId) });
  }
  registerMigrateStorage(dispatcher);
  // the asset ids last, so the materials package's picture.materialize replaces the store
  // actions' handler of the same id
  registerAssetActionsLazily(dispatcher, assets);
  registerWorkerActions(dispatcher, deckId, store);
  registerAdminActions(dispatcher);
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
