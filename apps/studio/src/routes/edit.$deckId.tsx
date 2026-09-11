import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router';
import type { ActionContext, Dispatcher } from '@turboslide/agent/dispatch';
import { createDispatcher } from '@turboslide/agent/dispatch';
import { createLiveAdapter } from '@turboslide/agent/window/adapter';
import type { StudioAdapter } from '@turboslide/agent/window/adapter';
import { createEditHistory } from '@turboslide/agent/window/history';
import type { HistoryEntry, HistoryStep } from '@turboslide/agent/window/history';
import {
  SCOPE_ATTRIBUTE,
  registerStudioAutomation,
  studioAutomationForOwner,
  viewerActionIds,
  windowActionIds,
} from '@turboslide/agent/window/registry';
import { DeckName } from '@turboslide/chrome/DeckName';
import { ExportMenu } from '@turboslide/chrome/ExportMenu';
import type {
  ExportCapabilities,
  ExportMenuInput,
  ExportProgress,
} from '@turboslide/chrome/ExportMenu';
import { ExportReportCard } from '@turboslide/chrome/ExportReportCard';
import type { ArtifactRun, ExportDownload } from '@turboslide/chrome/ExportReportCard';
import { Inspector } from '@turboslide/chrome/Inspector';
import type { DitherWorkerLike } from '@turboslide/chrome/inspector/dither';
import { Overlay } from '@turboslide/chrome/Overlay';
import { Palette } from '@turboslide/chrome/Palette';
import { buildPaletteEntries } from '@turboslide/chrome/palette-data';
import type { PaletteEntry } from '@turboslide/chrome/palette-data';
import { usePtShell, usePtStage } from '@turboslide/chrome/shell-context';
import type { ShellState } from '@turboslide/chrome/shell-context';
import type { ShellItem, ShellMode, ShellSection } from '@turboslide/chrome/shell-data';
import { SourceDrawer } from '@turboslide/chrome/SourceDrawer';
import type { SourceOwnerApi } from '@turboslide/chrome/SourceDrawer';
import { StatusChip } from '@turboslide/chrome/StatusChip';
import type { SaveState } from '@turboslide/chrome/StatusChip';
import { EditTools } from '@turboslide/chrome/Toolbar';
import { TwinStage } from '@turboslide/chrome/TwinStage';
import { ViewerShell } from '@turboslide/chrome/ViewerShell';
import { lintStatic } from '@turboslide/lint/lint-static';
import { renderSlide } from '@turboslide/render/slide';
import type { ActionId, DeckTemplateId } from '@turboslide/schema/actions';
import type { Asset } from '@turboslide/schema/assets';
import type { Block } from '@turboslide/schema/blocks';
import { blockAssetRefs } from '@turboslide/schema/catalog';
import { slideBlocks, slideTitle } from '@turboslide/schema/deck';
import type { DeckDocument, Section, Slide } from '@turboslide/schema/deck';
import { ConflictError } from '@turboslide/schema/errors';
import type { ExportReport } from '@turboslide/schema/export';
import type { Finding } from '@turboslide/schema/findings';
import { ICON_NAMES } from '@turboslide/schema/icons';
import { canonicalJson } from '@turboslide/schema/json';
import { parseAuthor } from '@turboslide/schema/mutations';
import type { Author, Lease, Mutation, Version, Write } from '@turboslide/schema/mutations';
import { applyMutations, applyWrite } from '@turboslide/schema/reduce';
import { validateSlide } from '@turboslide/schema/validate';
import type { Issue } from '@turboslide/schema/validate';
import { authorLabel, sameAuthor, touchedSlides } from '@turboslide/store/store';
import type { VersionRecord } from '@turboslide/store/store';
import { PRODUCT_TOKENS, PROPER_NOUNS } from '@turboslide/theme/copy';
import { SHEET, TOKENS, TOKEN_NAMES } from '@turboslide/theme/tokens';
import { BookView } from '@turboslide/viewer/BookView';
import { Editor as StageEditor } from '@turboslide/viewer/Editor';
import { GridView } from '@turboslide/viewer/GridView';
import { isPictureKind, pad2, trimTitle } from '@turboslide/viewer/model';
import type { ViewerDeck, ViewerSlide } from '@turboslide/viewer/model';
import type { Selection as StageSelection } from '@turboslide/viewer/Selection';
import { Stage } from '@turboslide/viewer/Stage';
import { applyTheme, installThemeBridge, readTheme, useTheme } from '@turboslide/viewer/theme';
import type { Theme } from '@turboslide/viewer/theme';

import { useMountEffect } from '../components/useMountEffect';
import { useStudioSession } from '../components/useStudioSession';
import { runDeckAction } from '../server/agent-actions';
import type { ServerSideWindowAction } from '../server/agent-actions';
import { createNewDeck } from '../server/decks';
import {
  EXPORT_POLL_MS,
  exportCapabilities,
  pollExport,
  runBuild,
  signDownload,
  startExport,
} from '../server/download';
import type { ExportRunInput } from '../server/download';
import { lintSlides } from '../server/lint';
import { renderSlideImages } from '../server/render';
import { warmThumbnails } from '../server/warm';
import {
  leaseSlide,
  listVersions,
  readEditorDeck,
  saveVersion,
  watchDeck,
  writeDeck,
} from '../server/write';
import type { EditorDeck, WatchDeckResult, WriteDeckResult } from '../server/write';

import './edit.$deckId.css';

/**
 * The editor, /edit/:deckId with ssr: false (SPEC 3.4, 6; MILESTONES M3). The chrome's
 * ViewerShell around the viewer's stage, as /deck/:deckId, plus the editing surfaces: the
 * Edit | View, Twin, Lint and Source controls in the toolbar slot (EditTools), the status chip,
 * the Cmd K palette, the inspector column, the source drawer, the twin view, the conflict card and
 * the external revision banner. In edit mode the stage is the viewer's Editor (selection, the
 * direct manipulation table of SPEC 6.4, inline text) with the chrome's Overlay drawing the ring,
 * the chip, the handles and the lint boxes.
 *
 * One write path (SPEC 7.1): every gesture, inspector change, palette entry, sidebar drag, source
 * Apply and window API call is one action of the ACTIONS table, dispatched through the same
 * dispatcher, applied through applyWrite in the browser for optimism and then sent to the writeDeck
 * server function, which is the authority. Undo and redo are forward writes carrying the inverse
 * mutations (SPEC 6.7). window.turboslide.studio has three owners here: the editor while editing,
 * the viewer while View is up, and the source drawer as a delegating owner (SPEC 7.4).
 */

const MODES: readonly ShellMode[] = ['slide', 'grid', 'book'];

/** The author of a browser session when ?author= is absent (SPEC 7.2 names $USER for the CLI). */
const DEFAULT_AUTHOR = 'studio';

/** Lease length the editor takes on the slide it edits (SPEC 6.7); enforced against agent writes from M4. */
const LEASE_MINUTES = 10;

/** How long the external revision banner stays once the revision has been brought in (M4 item 2). */
const EXTERNAL_BANNER_MS = 8000;

const ASSET_BASE = (deckId: string): string => `/decks/${deckId}/`;

/** The dither preview worker of the inspector's Dither section (SPEC 6.5; workers/dither.worker.ts). */
const createDitherWorker = (): DitherWorkerLike =>
  new Worker(new URL('../workers/dither.worker.ts', import.meta.url), {
    type: 'module',
  }) as DitherWorkerLike;

// ---------------------------------------------------------------------------------------------
// Search params (SPEC 6.1): ?mode, ?edit=0|1, ?theme, ?twin=1, ?lint=1, ?src=1, plus ?author=

export type EditSearch = {
  mode?: ShellMode;
  theme?: Theme;
  /** 0 turns editing off; absent or 1 is the editor's default */
  edit?: 0 | 1;
  twin?: 1;
  lint?: 1;
  src?: 1;
  /** opens the Export menu on load (the deck list's Export link) */
  export?: 1;
  author?: string;
};

function isMode(value: unknown): value is ShellMode {
  return value === 'slide' || value === 'grid' || value === 'book';
}

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

function flag(value: unknown): value is 1 {
  return value === 1 || value === '1' || value === true;
}

function off(value: unknown): value is 0 {
  return value === 0 || value === '0' || value === false;
}

export function validateEditSearch(search: Record<string, unknown>): EditSearch {
  const out: EditSearch = {};
  if (isMode(search.mode)) out.mode = search.mode;
  if (isTheme(search.theme)) out.theme = search.theme;
  if (off(search.edit)) out.edit = 0;
  else if (flag(search.edit)) out.edit = 1;
  if (flag(search.twin)) out.twin = 1;
  if (flag(search.lint)) out.lint = 1;
  if (flag(search.src)) out.src = 1;
  if (flag(search.export)) out.export = 1;
  if (typeof search.author === 'string' && search.author.trim()) out.author = search.author;
  return out;
}

export const Route = createFileRoute('/edit/$deckId')({
  ssr: false,
  validateSearch: validateEditSearch,
  loader: async ({ params }) => {
    const payload = await readEditorDeck({ deckId: params.deckId });
    if (!payload) throw notFound();
    return payload;
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData ? `${loaderData.document.deck.title}, editor, Turboslide` : 'Turboslide',
      },
    ],
  }),
  component: EditPage,
  notFoundComponent: EditMissing,
});

function EditMissing() {
  const { deckId } = Route.useParams();
  return (
    <main className="ts-home">
      <h1>No deck named {deckId}</h1>
      <p>Nothing under decks/{deckId}; the editor opens a folder with a deck.json.</p>
    </main>
  );
}

function EditPage() {
  const payload = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const author = useMemo(() => parseAuthor(search.author ?? DEFAULT_AUTHOR), [search.author]);
  const onSearch = (patch: Partial<EditSearch>) => {
    void navigate({
      search: (prev) => {
        const next: Record<string, unknown> = { ...prev, ...patch };
        for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
        return next;
      },
      hash: true,
      replace: true,
    });
  };
  const onDeckCreated = (deckId: string) => {
    void navigate({ to: '/edit/$deckId', params: { deckId } });
  };
  return (
    <EditorRoot
      key={`${payload.deckId}:${authorLabel(author)}`}
      payload={payload}
      search={search}
      author={author}
      onSearch={onSearch}
      onDeckCreated={onDeckCreated}
    />
  );
}

// ---------------------------------------------------------------------------------------------
// The controller: the document, the write queue, undo, versions, leases, the watch loop, the
// dispatcher. Framework free inside; React reads it through useSyncExternalStore.

type Committed = { revision: number; entry: VersionRecord };

type PendingWrite = {
  write: Write;
  label: string;
  resolve: (value: Committed) => void;
  reject: (error: unknown) => void;
};

export type Conflict = {
  message: string;
  currentRevision: number;
  current: DeckDocument;
  holder?: Author;
  /** the version records written since the pending base */
  since: VersionRecord[];
  /** the local writes that were waiting, in order */
  pending: Write[];
  /** slides both sides touched; empty when the card is only about a deck-level write */
  overlap: string[];
  /** a rebase attempt that failed, with the reducer's reason */
  error?: string;
};

export type External = { revision: number; author?: Author; note?: string };

/** The selection the inspector and the palette read: a block, or a run inside it while it is edited. */
export type Selection = { slideId: string; blockId: string; pointer?: string };

/** What the shell shows, mirrored into the snapshot by ShellBridge for the palette and the keys. */
export type EditorView = { mode: ShellMode; present: boolean };

/** The export surface's state: a run in flight (export.run or build.run) and the last finished one. */
export type ArtifactState = { progress: ExportProgress | null; run: ArtifactRun | null };

export type EditorSnapshot = {
  deckId: string;
  author: Author;
  document: DeckDocument;
  /** rendered HTML per slide id, from renderSlide over the current document */
  html: ReadonlyMap<string, string>;
  /** the last revision the server confirmed */
  serverRevision: number;
  /** writes queued or in flight */
  pending: number;
  conflict: Conflict | null;
  external: External | null;
  versions: readonly Version[];
  leases: readonly Lease[];
  history: {
    entries: readonly HistoryEntry[];
    log: readonly HistoryStep[];
    /** the undo stack as Version rows (n = the entry id), what the History section lists */
    versions: readonly Version[];
    canUndo: boolean;
    canRedo: boolean;
  };
  activeSlide: string;
  view: EditorView;
  selection: Selection | null;
  /** the last write or action error, for the toast and the status chip */
  error: string | null;
  /** Cmd S asked for a version note */
  versionPrompt: boolean;
  /** the Export menu's run in flight and the last report card */
  artifact: ArtifactState;
};

export type EditorController = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => EditorSnapshot;
  start: () => void;
  stop: () => void;
  attachShell: (shell: ShellState) => void;
  setActiveSlide: (slideId: string) => void;
  select: (selection: Selection | null) => void;
  /** one Write: applied locally now, sent to the server in order; resolves when the server confirmed */
  commit: (mutations: Mutation[], label: string) => Promise<Committed>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  undoTo: (id: number) => Promise<void>;
  rebase: () => Promise<void>;
  discard: () => void;
  reload: () => Promise<void>;
  saveVersion: (note: string) => Promise<Version>;
  restoreVersion: (n: number) => Promise<{ revision: number }>;
  refreshVersions: () => Promise<Version[]>;
  promptVersion: (open: boolean) => void;
  leaseActive: () => void;
  readSource: () => string;
  /** the validator behind the source drawer's Apply and the window API's applySource */
  validateSource: (source: string) => { slide: Slide | null; issues: Issue[]; error?: string };
  applySource: (source: string) => Promise<void>;
  invoke: (action: string, input?: unknown) => Promise<unknown>;
  editorAdapter: () => StudioAdapter;
  viewerAdapter: () => StudioAdapter;
  clearError: () => void;
  findingsFor: (slideId: string) => Finding[];
  allFindings: () => Finding[];
  /** the Edit | View seg's state, for view.* results */
  setEditing: (enabled: boolean) => void;
  /** export.run posts the sync route instead of queueing a job (a hosted studio) */
  setExportSync: (enabled: boolean) => void;
  /** what the shell shows, from ShellBridge */
  setView: (view: EditorView) => void;
  /** the shell's toast */
  say: (message: string) => void;
  /** the validator behind every applySource: the slide, or a RangeError (unknown slide) or TypeError */
  assertSource: (source: string) => Slide;
  /** History's "Undo to here": undoes every entry after the one with this id */
  undoAfter: (id: number) => Promise<void>;
  /** renders the missing thumbnails of a theme once per session (M3 item 5) */
  warmThumbs: (theme: Theme) => void;
  /** a fresh one-time URL for a file of the last run, then the browser's download */
  downloadArtifact: (run: ArtifactRun, file: ExportDownload) => Promise<void>;
  /** closes the report card */
  clearArtifact: () => void;
};

function lintLists() {
  return { properNouns: PROPER_NOUNS, tokens: PRODUCT_TOKENS, iconNames: ICON_NAMES };
}

/** Sections with their slides numbered and titled (the `outline` of the slide actions). */
function outlineOf(document: DeckDocument) {
  let n = 0;
  return document.deck.sections.map((section) => ({
    id: section.id,
    name: section.name,
    slides: section.slideIds.map((id) => {
      n += 1;
      const slide = document.slides[id];
      return {
        id,
        n,
        title: slide === undefined ? id : slideTitle(slide, n),
        kind: slide?.kind ?? ('content' as const),
      };
    }),
  }));
}

function slideOrder(document: DeckDocument): string[] {
  return document.deck.sections.flatMap((section) => section.slideIds);
}

/** Every mutation of slide.update must address the named slide (store-actions checkSlideMutations). */
function checkSlideMutations(slideId: string, mutations: ReadonlyArray<Mutation>): void {
  mutations.forEach((mutation, index) => {
    const target =
      mutation.op === 'slide.insert'
        ? mutation.slide.id
        : 'slideId' in mutation
          ? mutation.slideId
          : undefined;
    if (target === undefined) {
      throw new TypeError(
        `slide.update: mutation ${index} (${mutation.op}) is a deck-level mutation; use its own action`,
      );
    }
    if (target !== slideId) {
      throw new TypeError(
        `slide.update: mutation ${index} addresses slide "${target}", not "${slideId}"`,
      );
    }
  });
}

/** True for a mutation that changes no slide file on its own (order, assets, manifest, restore). */
function isDeckLevel(mutation: Mutation): boolean {
  return (
    mutation.op === 'section.set' ||
    mutation.op === 'asset.set' ||
    mutation.op === 'asset.remove' ||
    mutation.op === 'deck.set' ||
    mutation.op === 'version.restore'
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A browser download of a same-origin URL the server signed (tokens.ts): an anchor click. */
function triggerDownload(url: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = '';
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/** A stored copy is asked for as an attachment (Vercel Blob honours `download=1`); a route of ours already is one. */
function downloadUrlOf(url: string): string {
  if (url.startsWith('/')) return url;
  return `${url}${url.includes('?') ? '&' : '?'}download=1`;
}

/** The JSON answer of POST /api/export/:deckId?sync=1&format=json (server/export-sync.ts jsonBody). */
type SyncExportAnswer = {
  summary: { job: string; ms: number };
  report: ExportReport;
  files: { name: string; bytes: number; url: string | null }[];
  error?: { message?: string };
};

/**
 * A hosted studio's export (docs/hosting.md): one POST to the sync route runs the export inside
 * that request and answers the report with the files' URLs, because a job queued by one function
 * invocation is not visible to the next; the download then fetches the URL (a stored copy on the
 * blob backend, this instance's job file on the tmp backend).
 */
async function runSyncExport(
  deckId: string,
  input: ExportRunInput,
): Promise<Extract<ArtifactRun, { kind: 'export' }>> {
  const response = await fetch(`/api/export/${deckId}?sync=1&format=json`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as SyncExportAnswer;
  if (!response.ok)
    throw new Error(body.error?.message ?? `the export answered ${response.status}`);
  return {
    kind: 'export',
    input: menuInputOf(input),
    report: body.report,
    downloads: body.files.map(({ name, bytes, url }) => ({
      name,
      bytes,
      ...(url !== null ? { url } : {}),
    })),
    jobId: body.summary.job,
    ms: body.summary.ms,
  };
}

/** The menu's shape of an export.run input, for the report card's title (defaults as the action's). */
function menuInputOf(input: ExportRunInput): ExportMenuInput {
  return {
    format: 'pptx',
    mode: input.mode ?? 'flatten',
    theme: input.theme ?? ['light', 'dark'],
    fonts: input.fonts ?? 'exact',
    ...(input.embedFonts === true ? { embedFonts: true as const } : {}),
    ...(input.headings === 'raster' ? { headings: 'raster' as const } : {}),
    verify: input.verify ?? false,
  };
}

function createEditorController(init: {
  deckId: string;
  author: Author;
  payload: EditorDeck;
  /** deck.create from this editor: open the new deck */
  onDeckCreated?: (deckId: string) => void;
}): EditorController {
  const { deckId, author } = init;
  const history = createEditHistory();
  /* the local revision each history entry produced, for the History rows */
  const revisionOf = new Map<number, number>();
  const warmed = new Set<Theme>();
  const listeners = new Set<() => void>();
  let queue: PendingWrite[] = [];
  let pumping = false;
  let alive = false;
  let shell: ShellState | null = null;
  let leased: string | null = null;
  let findingsCache: { document: DeckDocument; findings: Finding[] } | null = null;

  const initialOrder = slideOrder(init.payload.document);
  let snapshot: EditorSnapshot = {
    deckId,
    author,
    document: init.payload.document,
    html: new Map(),
    serverRevision: init.payload.document.deck.revision,
    pending: 0,
    conflict: null,
    external: null,
    versions: init.payload.versions,
    leases: init.payload.leases,
    history: { entries: [], log: [], versions: [], canUndo: false, canRedo: false },
    activeSlide: initialOrder[0] ?? '',
    view: { mode: 'slide', present: false },
    selection: null,
    error: null,
    versionPrompt: false,
    artifact: { progress: null, run: null },
  };

  /* the current snapshot through a call, so a check after an await reads the fresh one */
  const latest = (): EditorSnapshot => snapshot;

  const historyVersions = (): Version[] =>
    history.entries().map((entry) => ({
      n: entry.id,
      revision: revisionOf.get(entry.id) ?? 0,
      author,
      note: entry.label,
      createdAt: entry.at,
      mutations: entry.mutations,
    }));

  const publish = (patch: Partial<EditorSnapshot>): void => {
    snapshot = {
      ...snapshot,
      ...patch,
      history: {
        entries: history.entries(),
        log: history.log(),
        versions: historyVersions(),
        canUndo: history.canUndo(),
        canRedo: history.canRedo(),
      },
    };
    for (const listener of listeners) listener();
  };

  /** renderSlide over the document for the slides not yet cached (SPEC 5.2: one renderer). */
  const renderMissing = (
    document: DeckDocument,
    html: Map<string, string>,
  ): Map<string, string> => {
    const theme = readTheme();
    for (const id of slideOrder(document)) {
      if (html.has(id)) continue;
      const slide = document.slides[id];
      if (!slide) continue;
      html.set(
        id,
        renderSlide(document.deck, slide, {
          theme,
          chrome: true,
          assetBase: ASSET_BASE(deckId),
          blockAttrs: true,
          gtWord: true,
        }).html,
      );
    }
    return html;
  };

  /** Replaces the document and drops the cached HTML of the slides that changed ('all' after a reload). */
  const setDocument = (document: DeckDocument, changed: readonly string[] | 'all'): void => {
    const html = changed === 'all' ? new Map<string, string>() : new Map(snapshot.html);
    if (changed !== 'all') for (const id of changed) html.delete(id);
    for (const id of html.keys()) if (document.slides[id] === undefined) html.delete(id);
    findingsCache = null;
    publish({ document, html: renderMissing(document, html) });
  };

  const changedBy = (mutations: ReadonlyArray<Mutation>): readonly string[] | 'all' =>
    mutations.some(isDeckLevel) ? 'all' : touchedSlides(mutations);

  const allFindings = (): Finding[] => {
    if (findingsCache && findingsCache.document === snapshot.document)
      return findingsCache.findings;
    const findings = lintStatic(snapshot.document, lintLists());
    findingsCache = { document: snapshot.document, findings };
    return findings;
  };

  const findingsFor = (slideId: string): Finding[] =>
    allFindings().filter((finding) => finding.slideId === slideId);

  const say = (message: string): void => {
    shell?.say(message);
  };

  const idle = async (): Promise<void> => {
    while (queue.length > 0 || pumping) await sleep(40);
  };

  const rejectAll = (jobs: PendingWrite[], error: unknown): void => {
    for (const job of jobs) job.reject(error);
  };

  /** Replays writes on a newer document; null when a mutation no longer applies. */
  const replay = (
    base: DeckDocument,
    writes: PendingWrite[],
  ): { document: DeckDocument; jobs: PendingWrite[] } | { error: string } => {
    let document = base;
    const jobs: PendingWrite[] = [];
    for (const job of writes) {
      const result = applyWrite(document, {
        ...job.write,
        baseRevision: document.deck.revision,
      });
      if (!result.ok) return { error: result.message };
      jobs.push({ ...job, write: { ...job.write, baseRevision: document.deck.revision } });
      document = result.document;
    }
    return { document, jobs };
  };

  const onConflict = (result: Extract<WriteDeckResult, { code: 'conflict' }>): void => {
    const waiting = queue;
    queue = [];
    const outside = touchedSlides(result.since.flatMap((record) => record.mutations));
    const deckLevelOutside = result.since.some((record) => record.mutations.some(isDeckLevel));
    const mine = touchedSlides(waiting.flatMap((row) => row.write.mutations));
    const overlap = mine.filter((id) => outside.includes(id));
    const deckLevelMine = waiting.some((row) => row.write.mutations.some(isDeckLevel));
    // Pending mutations that touch other slides rebase on their own (SPEC 6.7); the card appears
    // when both sides touched one slide, or when either side changed the deck itself.
    if (overlap.length === 0 && !deckLevelOutside && !deckLevelMine) {
      const replayed = replay(result.current, waiting);
      if (!('error' in replayed)) {
        queue = replayed.jobs;
        publish({ serverRevision: result.currentRevision, pending: queue.length, external: null });
        setDocument(replayed.document, 'all');
        say(
          `Rebased ${waiting.length} pending change${waiting.length === 1 ? '' : 's'} onto r${result.currentRevision}`,
        );
        return;
      }
    }
    const conflict: Conflict = {
      message: result.message,
      currentRevision: result.currentRevision,
      current: result.current,
      ...(result.holder !== undefined ? { holder: result.holder } : {}),
      since: result.since,
      pending: waiting.map((row) => row.write),
      overlap,
    };
    publish({ conflict, pending: 0, error: result.message });
    rejectAll(
      waiting,
      new ConflictError(result.message, {
        currentRevision: result.currentRevision,
        current: result.current,
        ...(result.holder !== undefined ? { holder: result.holder } : {}),
      }),
    );
  };

  const pump = async (): Promise<void> => {
    if (pumping) return;
    pumping = true;
    try {
      while (queue.length > 0 && latest().conflict === null) {
        const job = queue[0];
        if (!job) break;
        let result: WriteDeckResult;
        try {
          result = await writeDeck({ deckId, write: job.write });
        } catch (error) {
          const waiting = queue;
          queue = [];
          publish({ pending: 0, error: errorMessage(error) });
          rejectAll(waiting, error);
          break;
        }
        if (result.ok) {
          queue.shift();
          const versions = [...snapshot.versions];
          const { baseRevision: _base, inverse: _inverse, ...version } = result.entry;
          versions.push(version);
          const document =
            snapshot.document.deck.revision === result.revision
              ? {
                  deck: { ...snapshot.document.deck, updatedAt: result.entry.createdAt },
                  slides: snapshot.document.slides,
                }
              : snapshot.document;
          publish({
            serverRevision: result.revision,
            pending: queue.length,
            versions,
            document,
            error: null,
          });
          for (const line of result.warnings) say(line);
          job.resolve({ revision: result.revision, entry: result.entry });
          continue;
        }
        if (result.code === 'conflict') {
          onConflict(result);
          if (latest().conflict) break;
          continue;
        }
        // The server refused what the local reducer accepted: the two documents differ, so the
        // server's wins. Pending writes after this one were computed on the local one.
        const waiting = queue;
        queue = [];
        publish({ pending: 0, error: result.message });
        rejectAll(waiting, new TypeError(result.message));
        await reload();
        break;
      }
    } finally {
      pumping = false;
    }
  };

  const enqueue = (write: Write, label: string): Promise<Committed> =>
    new Promise<Committed>((resolve, reject) => {
      queue.push({ write, label, resolve, reject });
      publish({ pending: queue.length });
      void pump();
    });

  /** The local half of a write: the reducer now, the history entry, the queued server write. */
  const commitAs = (
    mutations: Mutation[],
    label: string,
    kind: 'edit' | 'undo' | 'redo',
  ): Promise<Committed> => {
    if (snapshot.conflict) {
      return Promise.reject(
        new ConflictError('Resolve the conflict card before writing again', {
          currentRevision: snapshot.conflict.currentRevision,
          current: snapshot.conflict.current,
        }),
      );
    }
    const base = snapshot.document.deck.revision;
    const write: Write = { baseRevision: base, author, mutations };
    const result = applyWrite(snapshot.document, write);
    if (!result.ok) {
      const error =
        result.code === 'invalid'
          ? new TypeError(result.message)
          : new ConflictError(result.message, {
              currentRevision: result.currentRevision,
              current: result.current,
            });
      publish({ error: error.message });
      return Promise.reject(error);
    }
    if (kind === 'edit') {
      const entry = history.push({ mutations, inverse: result.inverse, label });
      revisionOf.set(entry.id, result.document.deck.revision);
    }
    setDocument(result.document, changedBy(mutations));
    return enqueue(write, label);
  };

  const commit = (mutations: Mutation[], label: string): Promise<Committed> =>
    commitAs(mutations, label, 'edit');

  const undo = async (): Promise<void> => {
    const entry = history.undo();
    if (!entry) return;
    try {
      await commitAs(entry.inverse, `undo ${entry.label}`, 'undo');
    } catch (error) {
      say(`Undo failed: ${errorMessage(error)}`);
    }
  };

  const redo = async (): Promise<void> => {
    const entry = history.redo();
    if (!entry) return;
    try {
      await commitAs(entry.mutations, `redo ${entry.label}`, 'redo');
    } catch (error) {
      say(`Redo failed: ${errorMessage(error)}`);
    }
  };

  const undoTo = async (id: number): Promise<void> => {
    const entries = history.undoTo(id);
    for (const entry of entries) {
      try {
        await commitAs(entry.inverse, `undo ${entry.label}`, 'undo');
      } catch (error) {
        say(`Undo failed: ${errorMessage(error)}`);
        return;
      }
    }
  };

  const reload = async (): Promise<void> => {
    const payload = await readEditorDeck({ deckId });
    if (!payload) return;
    history.clear();
    publish({
      serverRevision: payload.document.deck.revision,
      versions: payload.versions,
      leases: payload.leases,
      conflict: null,
      external: null,
      error: null,
    });
    setDocument(payload.document, 'all');
  };

  const rebase = async (): Promise<void> => {
    const conflict = snapshot.conflict;
    if (!conflict) return;
    let document = conflict.current;
    const writes: Write[] = [];
    for (const write of conflict.pending) {
      const result = applyWrite(document, { ...write, baseRevision: document.deck.revision });
      if (!result.ok) {
        publish({ conflict: { ...conflict, error: result.message } });
        return;
      }
      writes.push({ ...write, baseRevision: document.deck.revision });
      document = result.document;
    }
    publish({ conflict: null, serverRevision: conflict.currentRevision, error: null });
    setDocument(document, 'all');
    for (const write of writes) {
      void enqueue(write, 'rebase').catch(() => undefined);
    }
  };

  const discard = (): void => {
    const conflict = snapshot.conflict;
    if (!conflict) return;
    history.clear();
    publish({
      conflict: null,
      serverRevision: conflict.currentRevision,
      error: null,
      external: null,
    });
    setDocument(conflict.current, 'all');
  };

  /** A write the server applies first (version.restore needs the version log); the document comes back. */
  const commitServerFirst = async (mutations: Mutation[], label: string): Promise<Committed> => {
    await idle();
    const conflict = latest().conflict;
    if (conflict) {
      throw new ConflictError('Resolve the conflict card first', {
        currentRevision: conflict.currentRevision,
      });
    }
    const write: Write = { baseRevision: latest().document.deck.revision, author, mutations };
    const result = await writeDeck({ deckId, write, returnDocument: true });
    if (!result.ok) {
      if (result.code === 'conflict') {
        publish({ error: result.message });
        throw new ConflictError(result.message, {
          currentRevision: result.currentRevision,
          current: result.current,
        });
      }
      publish({ error: result.message });
      throw new TypeError(result.message);
    }
    const entry = history.push({ mutations, inverse: result.entry.inverse, label });
    revisionOf.set(entry.id, result.revision);
    const { baseRevision: _base, inverse: _inverse, ...version } = result.entry;
    publish({ serverRevision: result.revision, versions: [...snapshot.versions, version] });
    if (result.document) setDocument(result.document, 'all');
    return { revision: result.revision, entry: result.entry };
  };

  const refreshVersions = async (): Promise<Version[]> => {
    const versions = await listVersions({ deckId });
    publish({ versions });
    return versions;
  };

  const saveVersionNamed = async (note: string): Promise<Version> => {
    await idle();
    const version = await saveVersion({ deckId, author, note });
    publish({ versions: [...snapshot.versions, version], versionPrompt: false });
    say(`Version ${version.n} saved at r${version.revision}`);
    return version;
  };

  const restoreVersion = async (n: number): Promise<{ revision: number }> => {
    const committed = await commitServerFirst([{ op: 'version.restore', n }], `restore ${n}`);
    return { revision: committed.revision };
  };

  const leaseActive = (): void => {
    const slideId = snapshot.activeSlide;
    if (!slideId || slideId === leased || snapshot.document.slides[slideId] === undefined) return;
    const previous = leased;
    leased = slideId;
    void (async () => {
      try {
        if (previous && snapshot.document.slides[previous] !== undefined) {
          await leaseSlide({ deckId, slideId: previous, author, release: true }).catch(
            () => undefined,
          );
        }
        await leaseSlide({ deckId, slideId, author, minutes: LEASE_MINUTES });
      } catch (error) {
        say(`Lease: ${errorMessage(error)}`);
      }
    })();
  };

  // The watch channel (SPEC 6.7; MILESTONES M4 item 2): the store's fs.watch reaches the browser
  // as a long poll; a revision this session did not write is brought into the document once the
  // queue is idle, and the banner names it and its author.
  const running = (): boolean => alive;
  let externalTimer: ReturnType<typeof setTimeout> | undefined;
  const showExternal = (external: External): void => {
    if (externalTimer !== undefined) clearTimeout(externalTimer);
    publish({ external });
    externalTimer = setTimeout(() => {
      if (latest().external?.revision === external.revision) publish({ external: null });
    }, EXTERNAL_BANNER_MS);
  };
  /**
   * Applies the records written since the local revision forward through the reducer with the
   * server's timestamps, so the document equals the server's without a reload and the undo stack
   * survives; a record that does not apply (a version.restore, a gap in the log) reloads instead.
   */
  const adoptExternal = async (result: WatchDeckResult): Promise<void> => {
    const local = latest();
    const records = result.since
      .filter((record) => record.revision > local.serverRevision && record.mutations.length > 0)
      .sort((a, b) => a.revision - b.revision);
    const last = records[records.length - 1];
    const author = last?.author ?? result.head?.author;
    const external: External = {
      revision: result.revision,
      ...(author !== undefined ? { author } : {}),
      ...(last?.note ? { note: last.note } : {}),
    };
    let document = local.document;
    const changed = new Set<string>();
    let deckLevel = false;
    let applied = 0;
    for (const record of records) {
      if (
        record.baseRevision !== document.deck.revision ||
        record.mutations.some((mutation) => mutation.op === 'version.restore')
      )
        break;
      const step = applyWrite(
        document,
        {
          baseRevision: record.baseRevision,
          author: record.author,
          mutations: record.mutations,
          ...(record.note ? { note: record.note } : {}),
        },
        { now: record.createdAt },
      );
      if (!step.ok) break;
      document = step.document;
      if (record.mutations.some(isDeckLevel)) deckLevel = true;
      for (const id of touchedSlides(record.mutations)) changed.add(id);
      applied += 1;
    }
    if (applied !== records.length || document.deck.revision !== result.revision) {
      await reload();
      showExternal(external);
      return;
    }
    const versions = [
      ...latest().versions,
      ...records.map(({ baseRevision: _base, inverse: _inverse, ...version }) => version),
    ];
    publish({ serverRevision: result.revision, versions, error: null });
    setDocument(document, deckLevel ? 'all' : [...changed]);
    showExternal(external);
  };
  const watchLoop = async (): Promise<void> => {
    let since = snapshot.serverRevision;
    while (running()) {
      try {
        const result = await watchDeck({ deckId, since });
        if (!running()) break;
        publish({ leases: result.leases });
        if (!result.changed) continue;
        since = Math.max(since, result.revision);
        if (result.revision <= latest().serverRevision) continue;
        if (queue.length > 0 || pumping) {
          await idle();
          if (!running() || result.revision <= latest().serverRevision) continue;
        }
        if (latest().conflict) continue;
        await adoptExternal(result);
      } catch {
        await sleep(2000);
      }
    }
  };

  const validateSource = (source: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(source) as unknown;
    } catch (error) {
      return { slide: null, issues: [], error: `Not JSON: ${errorMessage(error)}` };
    }
    const validation = validateSlide(parsed);
    if (!validation.ok || validation.slide === null)
      return { slide: null, issues: validation.issues };
    if (snapshot.document.slides[validation.slide.id] === undefined) {
      return {
        slide: null,
        issues: validation.issues,
        error: `No slide "${validation.slide.id}" in this deck; the source drawer replaces an existing slide`,
      };
    }
    return { slide: validation.slide, issues: validation.issues };
  };

  const assertSource = (source: string): Slide => {
    const checked = validateSource(source);
    if (checked.slide === null) {
      const blocking = checked.issues.filter((issue) => issue.severity === 3);
      const reason =
        checked.error ??
        blocking.map((issue) => `${issue.pointer || '/'}: ${issue.message}`).join('; ');
      if (checked.error !== undefined && /^No slide/.test(checked.error))
        throw new RangeError(reason);
      throw new TypeError(reason || 'The source does not validate');
    }
    return checked.slide;
  };

  const applySource = async (source: string): Promise<void> => {
    const slide = assertSource(source);
    await commit([{ op: 'slide.replace', slideId: slide.id, slide }], 'source');
    if (slide.id !== snapshot.activeSlide) shell?.select(slide.id);
  };

  const readSource = (): string => {
    const slide = snapshot.document.slides[snapshot.activeSlide];
    return canonicalJson(slide ?? snapshot.document.deck);
  };

  /* the Edit | View seg's state, read by view.* results */
  const editingRef = { current: true };
  /* export.run goes through the sync route on a hosted studio (server/download.ts capabilities.sync) */
  let exportSync = false;

  // The dispatcher: the same ACTIONS table and validation the CLI and MCP run (SPEC 7.1).
  const dispatcher: Dispatcher = createDispatcher();
  const context: ActionContext = { author };
  const on = <T,>(id: ActionId, run: (input: T) => Promise<unknown> | unknown): void => {
    dispatcher.register(id, (input) => run(input as T));
  };
  const checkBase = (baseRevision: number): void => {
    const current = snapshot.document.deck.revision;
    if (baseRevision !== current) {
      throw new ConflictError(
        `baseRevision ${baseRevision} is stale; the document is at revision ${current}`,
        { currentRevision: current, current: snapshot.document },
      );
    }
  };
  const requireSlide = (slideId: string): Slide => {
    const slide = snapshot.document.slides[slideId];
    if (slide === undefined) throw new RangeError(`No slide "${slideId}"`);
    return slide;
  };
  const slideResult = (committed: Committed, slideId: string) => ({
    slide: requireSlide(slideId),
    revision: committed.revision,
    findings: findingsFor(slideId),
  });
  const viewState = () => {
    const document = snapshot.document;
    const order = slideOrder(document);
    const slideId = shell?.active || snapshot.activeSlide || order[0] || '';
    return {
      slideId,
      n: Math.max(1, order.indexOf(slideId) + 1),
      mode: shell?.mode ?? 'slide',
      theme: readTheme(),
      present: shell?.present ?? false,
      edit: editingRef.current,
    };
  };

  on<{ name: string; baseRevision: number }>('deck.rename', async (input) => {
    checkBase(input.baseRevision);
    const name = input.name.trim();
    if (name === '') throw new TypeError('deck.rename: name must not be empty');
    const committed = await commit(
      [{ op: 'deck.set', path: '/title', value: name }],
      'deck.rename',
    );
    return { title: snapshot.document.deck.title, revision: committed.revision };
  });
  on<{ name: string; from: DeckTemplateId; id?: string }>('deck.create', async (input) => {
    const created = await createNewDeck(input);
    say(`Created ${created.deckId} from ${created.from}: ${created.counts.slides} slides`);
    init.onDeckCreated?.(created.deckId);
    return created;
  });
  /* asset.add, asset.dither, material.capture and material.list run on the server (sharp, the
     capture browser, the catalog); the write they end in comes back over the watch channel */
  const serverSide = (id: ServerSideWindowAction): void => {
    on<unknown>(id, async (input) => {
      const output = await runDeckAction({ deckId, action: id, input, author });
      if (id !== 'material.list') {
        const outputs = Array.isArray(output) ? output : [output];
        const ids = outputs
          .map((entry) => (entry as { id?: string } | null)?.id)
          .filter((entry): entry is string => typeof entry === 'string');
        if (ids.length > 0) say(`${id}: ${ids.join(', ')}`);
      }
      return output;
    });
  };
  serverSide('asset.add');
  serverSide('asset.dither');
  serverSide('material.capture');
  serverSide('material.list');
  on<ExportRunInput>('export.run', async (input) => {
    const label = `${input.format.toUpperCase()} ${input.mode ?? 'flatten'}`;
    publish({ artifact: { progress: { label: `Exporting ${label}` }, run: null } });
    try {
      if (exportSync) {
        const run = await runSyncExport(deckId, input);
        publish({ artifact: { progress: null, run } });
        const first = run.downloads[0];
        if (first?.url !== undefined) triggerDownload(downloadUrlOf(first.url));
        return run.report;
      }
      const started = await startExport({ deckId, input });
      for (;;) {
        const poll = await pollExport({ jobId: started.jobId });
        if (poll.status === 'done' && poll.report) {
          const run: ArtifactRun = {
            kind: 'export',
            input: menuInputOf(input),
            report: poll.report,
            downloads: (poll.downloads ?? []).map(({ name, bytes }) => ({ name, bytes })),
            jobId: started.jobId,
            ms: poll.ms ?? 0,
          };
          publish({ artifact: { progress: null, run } });
          // the first file downloads at once; the card offers every file again
          const first = poll.downloads?.[0];
          if (first) triggerDownload(first.url);
          return poll.report;
        }
        if (poll.status === 'failed') throw new Error(poll.error ?? 'the export failed');
        publish({
          artifact: {
            progress: {
              label: `${poll.status === 'queued' ? 'Queued' : 'Exporting'} ${label}`,
              ...(poll.line !== undefined ? { line: poll.line } : {}),
            },
            run: null,
          },
        });
        await sleep(EXPORT_POLL_MS);
      }
    } catch (error) {
      publish({
        artifact: { progress: null, run: snapshot.artifact.run },
        error: errorMessage(error),
      });
      throw error;
    }
  });
  on<{ out: string; budgetMB?: number; quality?: number }>('build.run', async (input) => {
    publish({ artifact: { progress: { label: 'Building the standalone file' }, run: null } });
    try {
      const built = await runBuild({
        deckId,
        ...(input.budgetMB !== undefined ? { budgetMB: input.budgetMB } : {}),
      });
      const run: ArtifactRun = {
        kind: 'build',
        path: built.path,
        bytes: built.bytes,
        assertions: built.assertions,
        downloads: built.download
          ? [{ name: built.download.name, bytes: built.download.bytes }]
          : [],
        ms: built.ms,
      };
      publish({ artifact: { progress: null, run } });
      if (built.download) triggerDownload(built.download.url);
      return { path: built.path, bytes: built.bytes, assertions: built.assertions };
    } catch (error) {
      publish({
        artifact: { progress: null, run: snapshot.artifact.run },
        error: errorMessage(error),
      });
      throw error;
    }
  });
  on<Record<string, never>>('deck.info', () => {
    const document = snapshot.document;
    const sections = outlineOf(document);
    return {
      id: document.deck.id,
      title: document.deck.title,
      theme: document.deck.theme,
      revision: document.deck.revision,
      sections,
      counts: {
        slides: sections.reduce((sum, section) => sum + section.slides.length, 0),
        sections: sections.length,
        assets: Object.keys(document.deck.assets).length,
        htmlBlocks: Object.values(document.slides).reduce(
          (sum, slide) =>
            sum + slideBlocks(slide).filter((row) => row.block.type === 'html').length,
          0,
        ),
      },
    };
  });
  on<{ sectionId?: string }>('slide.list', (input) => {
    const rows: {
      id: string;
      n: number;
      section: string;
      title: string;
      kind: Slide['kind'];
      lint: { s3: number; s2: number };
    }[] = [];
    const findings = allFindings();
    for (const section of outlineOf(snapshot.document)) {
      if (input.sectionId !== undefined && section.id !== input.sectionId) continue;
      for (const row of section.slides) {
        const mine = findings.filter((finding) => finding.slideId === row.id);
        rows.push({
          id: row.id,
          n: row.n,
          section: section.id,
          title: row.title,
          kind: row.kind,
          lint: {
            s3: mine.filter((finding) => finding.severity === 3).length,
            s2: mine.filter((finding) => finding.severity === 2).length,
          },
        });
      }
    }
    return rows;
  });
  on<{ slideId: string }>('slide.get', (input) => {
    const slide = requireSlide(input.slideId);
    const document = snapshot.document;
    const order = slideOrder(document);
    const section = document.deck.sections.find((row) => row.slideIds.includes(input.slideId));
    const assets: Record<string, Asset> = {};
    for (const { block } of slideBlocks(slide)) {
      for (const ref of blockAssetRefs(block)) {
        const asset = document.deck.assets[ref.assetId];
        if (asset) assets[ref.assetId] = asset;
      }
    }
    if ('picture' in slide) {
      const asset = document.deck.assets[slide.picture.asset];
      if (asset) assets[slide.picture.asset] = asset;
    }
    return {
      slide,
      n: order.indexOf(input.slideId) + 1,
      section: section?.id ?? document.deck.sections[0]?.id ?? '',
      assets,
      render: null,
    };
  });
  on<{ sectionId: string; after?: string; slide: Slide; baseRevision: number }>(
    'slide.insert',
    async (input) => {
      checkBase(input.baseRevision);
      const committed = await commit(
        [
          {
            op: 'slide.insert',
            sectionId: input.sectionId,
            ...(input.after !== undefined ? { after: input.after } : {}),
            slide: input.slide,
          },
        ],
        'slide.insert',
      );
      return {
        slide: requireSlide(input.slide.id),
        revision: committed.revision,
        outline: outlineOf(snapshot.document),
      };
    },
  );
  on<{ slideId: string; baseRevision: number }>('slide.remove', async (input) => {
    checkBase(input.baseRevision);
    requireSlide(input.slideId);
    const committed = await commit(
      [{ op: 'slide.remove', slideId: input.slideId }],
      'slide.remove',
    );
    return { revision: committed.revision, outline: outlineOf(snapshot.document) };
  });
  on<{ slideId: string; sectionId: string; after?: string; baseRevision: number }>(
    'slide.move',
    async (input) => {
      checkBase(input.baseRevision);
      const committed = await commit(
        [
          {
            op: 'slide.move',
            slideId: input.slideId,
            sectionId: input.sectionId,
            ...(input.after !== undefined ? { after: input.after } : {}),
          },
        ],
        'slide.move',
      );
      return { sections: snapshot.document.deck.sections, revision: committed.revision };
    },
  );
  on<{ slideId: string; baseRevision: number; mutations: Mutation[] }>(
    'slide.update',
    async (input) => {
      checkBase(input.baseRevision);
      requireSlide(input.slideId);
      checkSlideMutations(input.slideId, input.mutations);
      const committed = await commit(input.mutations, 'slide.update');
      return slideResult(committed, input.slideId);
    },
  );
  on<{ slideId: string; baseRevision: number; slide: Slide }>('slide.replace', async (input) => {
    checkBase(input.baseRevision);
    requireSlide(input.slideId);
    const committed = await commit(
      [{ op: 'slide.replace', slideId: input.slideId, slide: input.slide }],
      'slide.replace',
    );
    return slideResult(committed, input.slideId);
  });
  on<{ slideId: string; blockId: string; path: string; value?: unknown; baseRevision: number }>(
    'block.set',
    async (input) => {
      checkBase(input.baseRevision);
      requireSlide(input.slideId);
      const committed = await commit(
        [
          {
            op: 'block.set',
            slideId: input.slideId,
            blockId: input.blockId,
            path: input.path,
            ...(input.value !== undefined ? { value: input.value } : {}),
          },
        ],
        'block.set',
      );
      return slideResult(committed, input.slideId);
    },
  );
  on<{
    slideId: string;
    slot: Extract<Mutation, { op: 'block.insert' }>['slot'];
    after?: string;
    block: Block;
    baseRevision: number;
  }>('block.insert', async (input) => {
    checkBase(input.baseRevision);
    requireSlide(input.slideId);
    const committed = await commit(
      [
        {
          op: 'block.insert',
          slideId: input.slideId,
          slot: input.slot,
          ...(input.after !== undefined ? { after: input.after } : {}),
          block: input.block,
        },
      ],
      'block.insert',
    );
    return slideResult(committed, input.slideId);
  });
  on<{ slideId: string; blockId: string; baseRevision: number }>('block.remove', async (input) => {
    checkBase(input.baseRevision);
    requireSlide(input.slideId);
    const committed = await commit(
      [{ op: 'block.remove', slideId: input.slideId, blockId: input.blockId }],
      'block.remove',
    );
    return slideResult(committed, input.slideId);
  });
  on<{
    slideId: string;
    blockId: string;
    slot: Extract<Mutation, { op: 'block.move' }>['slot'];
    after?: string;
    baseRevision: number;
  }>('block.move', async (input) => {
    checkBase(input.baseRevision);
    requireSlide(input.slideId);
    const committed = await commit(
      [
        {
          op: 'block.move',
          slideId: input.slideId,
          blockId: input.blockId,
          slot: input.slot,
          ...(input.after !== undefined ? { after: input.after } : {}),
        },
      ],
      'block.move',
    );
    return slideResult(committed, input.slideId);
  });
  on<{ sections: Section[]; baseRevision: number }>('section.set', async (input) => {
    checkBase(input.baseRevision);
    const committed = await commit(
      [{ op: 'section.set', sections: input.sections }],
      'section.set',
    );
    return { sections: snapshot.document.deck.sections, revision: committed.revision };
  });
  on<{ slideId: string; minutes?: number; force?: boolean; release?: boolean }>(
    'slide.lease',
    async (input) => {
      requireSlide(input.slideId);
      const lease = await leaseSlide({
        deckId,
        slideId: input.slideId,
        author,
        ...(input.minutes !== undefined ? { minutes: input.minutes } : {}),
        ...(input.force !== undefined ? { force: input.force } : {}),
        ...(input.release !== undefined ? { release: input.release } : {}),
      });
      const leases = snapshot.leases.filter(
        (row) => !(row.slideId === lease.slideId && sameAuthor(row.holder, lease.holder)),
      );
      publish({ leases: input.release === true ? leases : [...leases, lease] });
      return lease;
    },
  );
  on<{ note: string }>('version.save', (input) => saveVersionNamed(input.note));
  on<Record<string, never>>('version.list', () => refreshVersions());
  on<{ n: number; baseRevision: number }>('version.restore', async (input) => {
    checkBase(input.baseRevision);
    return restoreVersion(input.n);
  });
  on<{
    slideIds: 'all' | string[];
    layers?: 'static' | 'rendered' | 'both';
    rule?: Finding['rule'];
  }>('lint.run', (input) =>
    lintSlides({
      deckId,
      slideIds: input.slideIds,
      ...(input.layers !== undefined ? { layers: input.layers } : {}),
      ...(input.rule !== undefined ? { rule: input.rule } : {}),
    }),
  );
  on<{
    slideIds: 'all' | string[];
    rule?: Finding['rule'];
    dryRun?: boolean;
    baseRevision: number;
  }>('fix.run', async (input) => {
    checkBase(input.baseRevision);
    const ids = input.slideIds === 'all' ? slideOrder(snapshot.document) : input.slideIds;
    for (const id of ids) requireSlide(id);
    const candidates = allFindings().filter(
      (finding) =>
        ids.includes(finding.slideId) &&
        (input.rule === undefined || finding.rule === input.rule) &&
        finding.fix !== undefined &&
        finding.fix.length > 0,
    );
    let document = snapshot.document;
    const applied: Finding[] = [];
    const mutations: Mutation[] = [];
    for (const finding of candidates) {
      try {
        document = applyMutations(document, finding.fix ?? []).document;
        applied.push(finding);
        mutations.push(...(finding.fix ?? []));
      } catch {
        // a fix that no longer applies on top of the earlier ones is skipped, as the CLI does
      }
    }
    if (input.dryRun === true || mutations.length === 0) {
      const remaining = lintStatic(document, { ...lintLists(), slideIds: ids });
      return { applied, remaining, revision: snapshot.document.deck.revision };
    }
    const committed = await commit(mutations, 'fix');
    const remaining = allFindings().filter((finding) => ids.includes(finding.slideId));
    return { applied, remaining, revision: committed.revision };
  });
  on<{ slideIds: 'all' | string[]; themes?: Theme[]; scale?: 1 | 2 }>('render.slide', (input) =>
    renderSlideImages({
      deckId,
      slideIds: input.slideIds,
      ...(input.themes !== undefined ? { themes: input.themes } : {}),
      ...(input.scale !== undefined ? { scale: input.scale } : {}),
    }),
  );
  on<{ slideId: string }>('view.goto', (input) => {
    requireSlide(input.slideId);
    if (shell?.mode === 'grid') shell.setMode('slide');
    shell?.select(input.slideId);
    return viewState();
  });
  on<{ mode: ShellMode }>('view.mode', (input) => {
    shell?.setMode(input.mode);
    return viewState();
  });
  on<{ theme: Theme }>('view.theme', (input) => {
    applyTheme(input.theme);
    return viewState();
  });
  on<{ on: boolean }>('view.present', (input) => {
    shell?.setPresent(input.on);
    return viewState();
  });

  const invoke = (action: string, input?: unknown): Promise<unknown> =>
    dispatcher.dispatch(action, input ?? {}, context);

  const editorAdapter = (): StudioAdapter => ({
    owner: 'editor',
    actions: windowActionIds(),
    getSource: readSource,
    applySource,
    invoke,
    state: () => ({
      deckId,
      revision: snapshot.document.deck.revision,
      serverRevision: snapshot.serverRevision,
      pending: snapshot.pending,
      slideId: snapshot.activeSlide,
      blockId: snapshot.selection?.blockId ?? null,
      mode: shell?.mode ?? 'slide',
      theme: readTheme(),
      author: authorLabel(author),
    }),
  });

  const viewerAdapter = (): StudioAdapter => ({
    owner: 'viewer',
    actions: viewerActionIds(),
    invoke: (action, input) => {
      if (!viewerActionIds().includes(action)) {
        throw new RangeError(
          `The viewer owner does not expose "${action}"; switch to Edit for it.`,
        );
      }
      return invoke(action, input);
    },
    state: () => ({
      deckId,
      revision: snapshot.document.deck.revision,
      slideId: snapshot.activeSlide,
      mode: shell?.mode ?? 'slide',
      theme: readTheme(),
    }),
  });

  const controller: EditorController = {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    start() {
      if (alive) return;
      alive = true;
      setDocument(snapshot.document, 'all');
      void watchLoop();
    },
    stop() {
      alive = false;
    },
    attachShell(next) {
      shell = next;
    },
    setActiveSlide(slideId) {
      if (slideId === snapshot.activeSlide) return;
      const selection =
        snapshot.selection && snapshot.selection.slideId !== slideId ? null : snapshot.selection;
      publish({ activeSlide: slideId, selection });
    },
    select(selection) {
      publish({ selection });
    },
    commit,
    undo,
    redo,
    undoTo,
    rebase,
    discard,
    reload,
    saveVersion: saveVersionNamed,
    restoreVersion,
    refreshVersions,
    promptVersion(open) {
      publish({ versionPrompt: open });
    },
    leaseActive,
    readSource,
    validateSource,
    applySource,
    invoke,
    editorAdapter,
    viewerAdapter,
    clearError() {
      publish({ error: null });
    },
    findingsFor,
    allFindings,
    setEditing(enabled) {
      editingRef.current = enabled;
    },
    setExportSync(enabled) {
      exportSync = enabled;
    },
    setView(view) {
      if (view.mode === snapshot.view.mode && view.present === snapshot.view.present) return;
      publish({ view });
    },
    say,
    assertSource,
    async undoAfter(id) {
      const entries = history.entries();
      const at = entries.findIndex((entry) => entry.id === id);
      const next = entries[at + 1];
      if (at < 0 || !next) return;
      await undoTo(next.id);
    },
    warmThumbs(theme) {
      if (warmed.has(theme)) return;
      warmed.add(theme);
      warmThumbnails({ data: { deckId, theme } }).catch((error: unknown) => {
        warmed.delete(theme);
        say(`Thumbnails: ${errorMessage(error)}`);
      });
    },
    async downloadArtifact(run, file) {
      try {
        if (file.url !== undefined) {
          // a sync export's file: the stored copy, or this instance's job file, which another
          // instance answers with 404 and the advice to run the export again
          const probe = await fetch(file.url, { method: 'HEAD' });
          if (probe.status === 404) {
            const body = (await fetch(file.url).then((r) => r.json())) as SyncExportAnswer;
            throw new Error(body.error?.message ?? 'the file is not on this instance');
          }
          triggerDownload(downloadUrlOf(file.url));
          return;
        }
        const { url } = await signDownload(
          run.kind === 'export'
            ? { kind: 'job', jobId: run.jobId, name: file.name }
            : { kind: 'build', deckId, name: file.name },
        );
        triggerDownload(url);
      } catch (error) {
        say(`Download: ${errorMessage(error)}`);
      }
    },
    clearArtifact() {
      publish({ artifact: { progress: snapshot.artifact.progress, run: null } });
    },
  };
  return controller;
}

// ---------------------------------------------------------------------------------------------
// React glue

/** Registers an adapter once per owner element; later renders update the live adapter. */
function useStudioOwner(adapter: StudioAdapter, owner: HTMLElement | null): void {
  const live = useRef(createLiveAdapter(adapter));
  live.current.update(adapter);
  useLayoutEffect(() => {
    if (!owner) return;
    return registerStudioAutomation(live.current.adapter, owner);
  }, [owner]);
}

/** The thumbnail width the sidebar mini and the grid tiles load (server/thumbs.ts THUMB_WIDTHS). */
const THUMB_W = 320;

/**
 * A stamp of the slide's content (FNV-1a over its canonical JSON), so a thumbnail URL changes
 * only when the slide does: the browser keeps the immutable capture of an unchanged slide across
 * revisions and asks the worker for the changed one alone (M3 item 5; /api/render ?w=&r=).
 */
function slideStamp(slide: Slide): string {
  const text = canonicalJson(slide);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function thumbShotFor(deckId: string, slide: Slide): { light: string; dark: string } {
  const stamp = slideStamp(slide);
  const url = (theme: Theme) =>
    `/api/render/${encodeURIComponent(slide.id)}?deck=${encodeURIComponent(deckId)}&theme=${theme}&w=${THUMB_W}&r=${stamp}`;
  return { light: url('light'), dark: url('dark') };
}

function toViewerDeck(snap: EditorSnapshot): ViewerDeck {
  const { deck, slides } = snap.document;
  const assetBase = ASSET_BASE(snap.deckId);
  const out: ViewerSlide[] = [];
  let n = 0;
  for (const section of deck.sections) {
    for (const slideId of section.slideIds) {
      const slide = slides[slideId];
      if (!slide) continue;
      n += 1;
      const asset = 'picture' in slide ? deck.assets[slide.picture.asset] : undefined;
      const picture =
        isPictureKind(slide.kind) && asset
          ? 'neutral' in asset.twins
            ? { light: assetBase + asset.twins.neutral, dark: assetBase + asset.twins.neutral }
            : { light: assetBase + asset.twins.light, dark: assetBase + asset.twins.dark }
          : undefined;
      out.push({
        id: slideId,
        n,
        title: slideTitle(slide, n),
        kind: slide.kind,
        sectionId: section.id,
        html: snap.html.get(slideId) ?? '',
        shot: thumbShotFor(snap.deckId, slide),
        ...(picture ? { picture } : {}),
        ...(slide.notes !== undefined ? { notes: slide.notes } : {}),
      });
    }
  }
  return {
    id: deck.id,
    title: deck.title,
    revision: deck.revision,
    sections: deck.sections.map((section) => ({
      id: section.id,
      name: section.name,
      slideIds: section.slideIds.filter((id) => slides[id]),
    })),
    slides: out,
  };
}

function toSections(
  deck: ViewerDeck,
  findings: readonly Finding[],
  leases: readonly Lease[],
  author: Author,
): readonly ShellSection[] {
  const byId = new Map(deck.slides.map((slide) => [slide.id, slide]));
  return deck.sections.map((section) => ({
    id: section.id,
    label: section.name,
    items: section.slideIds.flatMap((id): ShellItem[] => {
      const slide = byId.get(id);
      if (!slide) return [];
      const mine = findings.filter((finding) => finding.slideId === id);
      const leased = leases.some(
        (lease) => lease.slideId === id && !sameAuthor(lease.holder, author),
      );
      return [
        {
          id: slide.id,
          n: pad2(slide.n),
          title: trimTitle(slide.title),
          kind: slide.kind,
          html: slide.html,
          ...(slide.shot ? { shot: slide.shot } : {}),
          lint: {
            s3: mine.filter((finding) => finding.severity === 3).length,
            s2: mine.filter((finding) => finding.severity === 2).length,
          },
          ...(leased ? { leased: true } : {}),
        },
      ];
    }),
  }));
}

function isEditable(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

/** The route's selection as the stage Editor's: a block, or the run being edited inside it. */
function toStageSelection(selection: Selection | null, slideId: string): StageSelection {
  if (!selection || selection.slideId !== slideId) return null;
  return selection.pointer !== undefined
    ? { kind: 'run', blockId: selection.blockId, pointer: selection.pointer }
    : { kind: 'block', blockId: selection.blockId };
}

function fromStageSelection(selection: StageSelection, slideId: string): Selection | null {
  if (selection === null) return null;
  return selection.kind === 'run'
    ? { slideId, blockId: selection.blockId, pointer: selection.pointer }
    : { slideId, blockId: selection.blockId };
}

function isApple(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
}

type EditorRootProps = {
  payload: EditorDeck;
  search: EditSearch;
  author: Author;
  onSearch: (patch: Partial<EditSearch>) => void;
  onDeckCreated: (deckId: string) => void;
};

function EditorRoot({ payload, search, author, onSearch, onDeckCreated }: EditorRootProps) {
  const [controller] = useState(() =>
    createEditorController({ deckId: payload.deckId, author, payload, onDeckCreated }),
  );
  /* the Export menu (SPEC 8): open from the toolbar or from the deck list's Export link (?export=1) */
  const [exportOpen, setExportOpen] = useState(search.export === 1);
  const [capabilities, setCapabilities] = useState<ExportCapabilities | null>(null);
  const snap = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const theme = useTheme();
  const editing = search.edit !== 0;
  const twin = search.twin === 1;
  const lintLayer = search.lint === 1;
  const src = search.src === 1;
  const [paletteOpen, setPaletteOpen] = useState(false);
  controller.setEditing(editing);

  const flags = useRef({ editing, twin, lintLayer, src });
  flags.current = { editing, twin, lintLayer, src };
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;

  useMountEffect(() => {
    if (search.theme) applyTheme(search.theme);
    const stopBridge = installThemeBridge();
    controller.start();
    exportCapabilities()
      .then((caps) => {
        controller.setExportSync(caps.sync);
        setCapabilities(caps);
      })
      .catch((error: unknown) => controller.say(`Export: ${errorMessage(error)}`));
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const f = flags.current;
      const patch = onSearchRef.current;
      const meta = event.metaKey || event.ctrlKey;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      /* two chords work from any field, the drawer's own editor included: the drawer (Cmd /)
         and the lint layer (Cmd L); CodeMirror never sees them (SPEC 6.9) */
      if (meta && !event.altKey && key === '/') {
        event.preventDefault();
        event.stopPropagation();
        patch({ src: f.src ? undefined : 1 });
        return;
      }
      if (meta && !event.altKey && key === 'l') {
        event.preventDefault();
        event.stopPropagation();
        patch({ lint: f.lintLayer ? undefined : 1 });
        return;
      }
      if (isEditable(event.target)) {
        /* keys are inert inside inputs except Escape (SPEC 6.9) */
        return;
      }
      if (meta && !event.altKey && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) void controller.redo();
        else void controller.undo();
        return;
      }
      if (meta && !event.altKey && key === 's') {
        event.preventDefault();
        if (!f.editing) patch({ edit: undefined });
        controller.promptVersion(true);
        return;
      }
      if (meta || event.altKey) return;
      /* Tab, with or without a selection, belongs to the stage Editor (SPEC 6.4): a second
         handler here moved the selection twice per keydown */
      if (event.shiftKey && key === 'd') {
        event.preventDefault();
        patch({ twin: f.twin ? undefined : 1 });
        return;
      }
      if (event.shiftKey) return;
      if (key === 'e') {
        event.preventDefault();
        patch({ edit: f.editing ? 0 : undefined });
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      stopBridge();
      controller.stop();
    };
  });

  /* Cmd S and the status chip: the note field of the Versions section takes focus once the
     inspector shows it; until then the prompt stays pending */
  useLayoutEffect(() => {
    if (!snap.versionPrompt) return;
    const field = document.querySelector<HTMLElement>('[data-control="version.save.note"]');
    if (!field) return;
    field.focus();
    controller.promptVersion(false);
  }, [snap.versionPrompt, editing, snap.activeSlide, controller]);

  const viewerDeck = useMemo(() => toViewerDeck(snap), [snap.document, snap.html, snap.deckId]);
  const findings = useMemo(() => controller.allFindings(), [controller, snap.document]);
  const sections = useMemo(
    () => toSections(viewerDeck, findings, snap.leases, author),
    [viewerDeck, findings, snap.leases, author],
  );
  const activeFindings = useMemo(
    () => findings.filter((finding) => finding.slideId === snap.activeSlide),
    [findings, snap.activeSlide],
  );
  const { deck } = snap.document;
  const slide = snap.document.slides[snap.activeSlide];
  const revision = deck.revision;
  const selection =
    snap.selection && snap.selection.slideId === snap.activeSlide ? snap.selection : null;

  const status: SaveState = snap.conflict ? 'conflict' : snap.pending > 0 ? 'unsaved' : 'saved';
  const otherLease = snap.leases.find(
    (lease) => lease.slideId === snap.activeSlide && !sameAuthor(lease.holder, author),
  );

  /* the source drawer as a delegating owner (SPEC 6.6, 7.4): Apply from the drawer and
     applySource from an agent run one validator; an action the drawer does not know reaches
     the editor around it */
  const registerOwner = useMemo(
    () =>
      (owner: HTMLElement, api: SourceOwnerApi): (() => void) =>
        registerStudioAutomation(
          {
            owner: 'source-drawer',
            actions: ['source.read', 'source.apply'],
            getSource: api.getSource,
            applySource: async (text) => {
              const checked = controller.assertSource(text);
              /* the drawer replaces the slide it shows, while the editor owner replaces any slide
                 by id: a source naming another slide is refused here, never resolved with nothing
                 written (SPEC 7.4: RangeError for an id the owner does not take) */
              if (checked.id !== api.slideId) {
                throw new RangeError(
                  `The source drawer replaces slide "${api.slideId}", not "${checked.id}"; close the drawer (Cmd /) to replace another slide through the editor`,
                );
              }
              await api.applySource(text);
            },
            invoke: (action, input) => {
              const editor = studioAutomationForOwner(owner, { excludeOwner: owner });
              if (!editor) throw new Error('The source drawer has no editor to delegate to');
              return editor.invoke(action, input);
            },
            state: () => ({
              deckId: controller.getSnapshot().deckId,
              slideId: controller.getSnapshot().activeSlide,
            }),
          },
          owner,
        ),
    [controller],
  );

  const paletteEntries = useMemo<readonly PaletteEntry[]>(() => {
    if (!paletteOpen) return [];
    const patch = onSearchRef.current;
    return buildPaletteEntries({
      deck,
      slides: snap.document.slides,
      ...(slide ? { slideId: slide.id } : {}),
      ...(selection ? { blockId: selection.blockId } : {}),
      revision,
      versions: snap.versions,
      view: {
        mode: snap.view.mode,
        theme,
        present: snap.view.present,
        edit: editing,
        twin,
        lint: lintLayer,
        source: src,
      },
      toggles: {
        edit: () => patch({ edit: editing ? 0 : undefined }),
        twin: () => patch({ twin: twin ? undefined : 1 }),
        lint: () => patch({ lint: lintLayer ? undefined : 1 }),
        source: () => patch({ src: src ? undefined : 1 }),
      },
      apple: isApple(),
    });
  }, [
    paletteOpen,
    deck,
    snap.document.slides,
    slide,
    selection,
    revision,
    snap.versions,
    snap.view,
    theme,
    editing,
    twin,
    lintLayer,
    src,
  ]);

  const tokens = useMemo(
    () => TOKEN_NAMES.map((name) => ({ name, value: TOKENS[theme][name] })),
    [theme],
  );

  /* the live copy lint of a Text field (SPEC 6.5): the same rules over a draft of the slide */
  const lintText = (text: string, spec: { path: string }): readonly string[] => {
    if (!slide || !selection) return [];
    try {
      const draft = applyMutations(snap.document, [
        {
          op: 'block.set',
          slideId: slide.id,
          blockId: selection.blockId,
          path: spec.path,
          value: text,
        },
      ]).document;
      return lintStatic(draft, { ...lintLists(), slideIds: [slide.id] })
        .filter(
          (finding) => finding.blockId === selection.blockId && finding.rule.startsWith('copy/'),
        )
        .map((finding) => finding.proposal);
    } catch {
      return [];
    }
  };

  const scopeAttr = { [SCOPE_ATTRIBUTE]: `editor:${snap.deckId}` };

  /* the Export menu's runs are actions through the dispatcher (SPEC 7.1); the menu stays up with
     the progress line while a run is in flight and closes when the report card takes over */
  const runExport = (input: ExportMenuInput) => {
    controller
      .invoke('export.run', input)
      .then(() => setExportOpen(false))
      .catch((error: unknown) => controller.say(`Export: ${errorMessage(error)}`));
  };
  const runBuildAction = () => {
    controller
      .invoke('build.run', { out: `.turboslide/${snap.deckId}.html`, budgetMB: 16 })
      .then(() => setExportOpen(false))
      .catch((error: unknown) => controller.say(`Build: ${errorMessage(error)}`));
  };

  return (
    <div
      className="ts-editor"
      data-editing={editing ? '1' : '0'}
      data-status={status}
      {...scopeAttr}
    >
      <div
        className="ts-sprite"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: payload.sprite }}
      />
      <ViewerShell
        id={`edit:${snap.deckId}`}
        title={deck.title}
        count={`${viewerDeck.slides.length} slides`}
        sections={sections}
        modes={MODES}
        /* the URL carries the view (SPEC 6.1): without ?mode the editor opens on the slide, at
           every width, so the stage and its Tab selection exist where the shell's phone rule
           would have opened the book (measured: lint --chrome at 390 found no stage) */
        initialMode={search.mode ?? 'slide'}
        thumb="shot"
        keys="paged"
        hash="id"
        onModeChange={(mode) => onSearch({ mode: mode === 'slide' ? undefined : mode })}
        homeHref="/decks"
        onSearch={() => setPaletteOpen(true)}
        searchOpen={paletteOpen}
        toolbarStatus={
          <>
            <DeckName
              title={deck.title}
              revision={revision}
              dispatch={controller.invoke}
              onNotice={controller.say}
            />
            <StatusChip
              revision={snap.serverRevision}
              state={status}
              lease={
                otherLease
                  ? { holder: authorLabel(otherLease.holder), until: otherLease.until }
                  : null
              }
              onClick={() => controller.promptVersion(true)}
            />
          </>
        }
        toolbarSlot={
          <>
            <EditTools
              edit={editing}
              onEdit={(on) => onSearch({ edit: on ? undefined : 0 })}
              twin={twin}
              onTwin={() => onSearch({ twin: twin ? undefined : 1 })}
              lint={lintLayer}
              lintCount={activeFindings.length}
              onLint={() => onSearch({ lint: lintLayer ? undefined : 1 })}
              source={src}
              onSource={() => onSearch({ src: src ? undefined : 1 })}
            />
            <ExportMenu
              open={exportOpen}
              onOpenChange={(open) => {
                setExportOpen(open);
                if (!open && search.export === 1) onSearch({ export: undefined });
              }}
              capabilities={capabilities}
              progress={snap.artifact.progress}
              onExport={runExport}
              onBuild={runBuildAction}
            />
          </>
        }
        sidebarEdit={
          editing
            ? { revision, dispatch: controller.invoke, onNotice: controller.say, deck }
            : undefined
        }
        panel={
          editing && slide ? (
            <Inspector
              deck={deck}
              slide={slide}
              blockId={selection?.blockId}
              revision={revision}
              dispatch={controller.invoke}
              findings={activeFindings}
              versions={snap.versions}
              history={snap.history.versions}
              leases={snap.leases.filter((lease) => !sameAuthor(lease.holder, author))}
              tokens={tokens}
              onSelectBlock={(blockId) =>
                controller.select(blockId === undefined ? null : { slideId: slide.id, blockId })
              }
              onUndoTo={(entry) => {
                void controller.undoAfter(entry.n);
              }}
              lintText={lintText}
              assetUrl={(path) => ASSET_BASE(snap.deckId) + path}
              busy={snap.conflict !== null}
              createDitherWorker={createDitherWorker}
              onNotice={controller.say}
            />
          ) : undefined
        }
        drawer={
          src && slide ? (
            <SourceDrawer
              open
              slide={slide}
              revision={revision}
              dispatch={controller.invoke}
              onClose={() => onSearch({ src: undefined })}
              deckId={snap.deckId}
              external={
                snap.external
                  ? {
                      revision: snap.external.revision,
                      author: snap.external.author ? authorLabel(snap.external.author) : 'outside',
                    }
                  : null
              }
              registerOwner={registerOwner}
              onNotice={controller.say}
            />
          ) : undefined
        }
      >
        <ShellBridge controller={controller} editing={editing} />
        <SessionBridge deckId={snap.deckId} author={author} />
        <EditorStage
          controller={controller}
          snap={snap}
          viewerDeck={viewerDeck}
          editing={editing}
          twin={twin}
          lintLayer={lintLayer}
          findings={activeFindings}
        />
      </ViewerShell>
      <Palette
        open={paletteOpen}
        entries={paletteEntries}
        dispatch={controller.invoke}
        onClose={() => setPaletteOpen(false)}
        onNotice={controller.say}
      />
      {snap.artifact.run ? (
        <ExportReportCard
          run={snap.artifact.run}
          downloads={capabilities?.downloads ?? true}
          onDownload={(run, file) => {
            void controller.downloadArtifact(run, file);
          }}
          onClose={controller.clearArtifact}
        />
      ) : null}
      {snap.conflict ? <ConflictCard controller={controller} conflict={snap.conflict} /> : null}
      {snap.external ? (
        <ExternalRevisionBanner controller={controller} external={snap.external} />
      ) : payload.hosting.notice !== null ? (
        <HostingBanner notice={payload.hosting.notice} store={payload.hosting.store} />
      ) : null}
    </div>
  );
}

/**
 * Attaches this page to the studio's session registry (server/sessions.ts) so the hosted agent
 * surface can drive it: deck_goto_slide over /mcp runs in this page through the active owner's
 * handle (MILESTONES M4 item 1).
 */
function SessionBridge({ deckId, author }: { deckId: string; author: Author }) {
  useStudioSession({ deckId, author: authorLabel(author) });
  return null;
}

/**
 * Inside the shell: hands the shell state to the controller, keeps the active slide and the view
 * in step, takes the lease while editing (enforced against agent writes from M4), warms the thumbnails once the sidebar or the
 * grid asks for them, and registers the editor and viewer owners on two marker elements whose
 * data-active flags follow the Edit | View seg, so exactly one is active and the handoff fires one
 * ready event (SPEC 7.4).
 */
function ShellBridge({ controller, editing }: { controller: EditorController; editing: boolean }) {
  const shell = usePtShell();
  const theme = useTheme();
  controller.attachShell(shell);
  const [editorEl, setEditorEl] = useState<HTMLElement | null>(null);
  const [viewerEl, setViewerEl] = useState<HTMLElement | null>(null);
  useStudioOwner(controller.editorAdapter(), editorEl);
  useStudioOwner(controller.viewerAdapter(), viewerEl);
  useLayoutEffect(() => {
    controller.setActiveSlide(shell.active);
    controller.setView({ mode: shell.mode, present: shell.present });
    if (editing) controller.leaseActive();
  }, [controller, shell.active, shell.mode, shell.present, editing]);
  useLayoutEffect(() => {
    if (shell.density === 'thumbs' || shell.mode === 'grid') controller.warmThumbs(theme);
  }, [controller, shell.density, shell.mode, theme]);
  return (
    <>
      <span
        ref={setEditorEl}
        className="ts-owner"
        data-owner="editor"
        data-active={editing ? 'true' : 'false'}
      />
      <span
        ref={setViewerEl}
        className="ts-owner"
        data-owner="viewer"
        data-active={editing ? 'false' : 'true'}
      />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// The stage: the viewer's Editor in edit mode, the Stage otherwise, the twin view, the grid, the book

type EditorStageProps = {
  controller: EditorController;
  snap: EditorSnapshot;
  viewerDeck: ViewerDeck;
  editing: boolean;
  twin: boolean;
  lintLayer: boolean;
  findings: readonly Finding[];
};

function EditorStage({
  controller,
  snap,
  viewerDeck,
  editing,
  twin,
  lintLayer,
  findings,
}: EditorStageProps) {
  const shell = usePtShell();
  const { stageSize } = usePtStage();
  const theme = useTheme();
  const slide =
    viewerDeck.slides.find((entry) => entry.id === shell.active) ?? viewerDeck.slides[0];
  const showTwin = twin && shell.mode === 'slide' && !shell.present && slide !== undefined;
  const editStage =
    editing && shell.mode === 'slide' && !shell.present && !showTwin && slide !== undefined;
  const selectedBlock =
    snap.selection && slide && snap.selection.slideId === slide.id
      ? snap.selection.blockId
      : undefined;
  return (
    <>
      {editStage ? (
        <StageEditor
          document={snap.document}
          slideId={slide.id}
          theme={theme}
          assetBase={ASSET_BASE(snap.deckId)}
          stageSize={stageSize}
          index={Math.max(0, shell.index)}
          total={shell.total}
          present={shell.present}
          narrow={shell.narrow}
          dispatch={controller.invoke}
          selection={toStageSelection(snap.selection, slide.id)}
          onSelectionChange={(next) => controller.select(fromStageSelection(next, slide.id))}
          findings={findings}
          lintLayer={lintLayer}
          overlay={(view) => <Overlay view={view} />}
          onError={(error) => controller.say(errorMessage(error))}
          onRemoved={(block) =>
            controller.say(
              `Removed ${block.type} · ${block.id}. ${isApple() ? 'Cmd' : 'Ctrl'} Z undoes`,
            )
          }
        />
      ) : showTwin ? (
        <TwinStage
          slide={slide}
          index={Math.max(0, shell.index)}
          total={shell.total}
          stageSize={stageSize}
          narrow={shell.narrow}
          dir={shell.dir ?? 'next'}
          onStep={editing ? undefined : shell.step}
          overlay={() => (
            <TwinOverlay
              slideId={slide.id}
              html={slide.html}
              blockId={selectedBlock}
              findings={lintLayer ? findings : []}
            />
          )}
        />
      ) : (
        <Stage
          slide={slide}
          index={Math.max(0, shell.index)}
          total={shell.total}
          stageSize={stageSize}
          mode={shell.mode}
          present={shell.present}
          narrow={shell.narrow}
          theme={theme}
          dir={shell.dir ?? 'next'}
          onStep={shell.step}
        />
      )}
      {shell.mode === 'grid' ? (
        <GridView
          deck={viewerDeck}
          active={shell.active}
          theme={theme}
          onSelect={(id) => {
            shell.setMode('slide');
            shell.select(id);
          }}
        />
      ) : null}
      {shell.mode === 'book' ? (
        <BookView
          deck={viewerDeck}
          active={shell.active}
          theme={theme}
          isMode
          onSelect={shell.select}
          onOpen={(id) => {
            shell.setMode('slide');
            shell.select(id);
          }}
          lead={`${viewerDeck.slides.length} slides in ${viewerDeck.sections.length} sections at revision ${viewerDeck.revision}.`}
          meta={[
            { key: 'Sections', value: String(viewerDeck.sections.length) },
            { key: 'Slides', value: String(viewerDeck.slides.length) },
            { key: 'Revision', value: `r${viewerDeck.revision}` },
          ]}
        />
      ) : null}
    </>
  );
}

type Box = { left: number; top: number; width: number; height: number };

/**
 * The twin panes' overlay (SPEC 6.8: selection and lint boxes on both sheets). It sits inside
 * the pane's scaled stage, so sheet pixels are its CSS pixels: a finding's evidence box places
 * itself and the selected block is measured against the stage and divided by its scale. The
 * classes are the chrome Overlay's (Overlay.css): the ring is ink as a state, the boxes
 * titanium and ink by severity.
 */
function TwinOverlay({
  slideId,
  html,
  blockId,
  findings,
}: {
  slideId: string;
  html: string;
  blockId: string | undefined;
  findings: readonly Finding[];
}) {
  const root = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(null);
  useLayoutEffect(() => {
    const stage = root.current?.closest<HTMLElement>('.ts-stage');
    const target = blockId ? stage?.querySelector<HTMLElement>(`[data-block="${blockId}"]`) : null;
    if (!stage || !target) {
      setBox(null);
      return;
    }
    const s = stage.getBoundingClientRect();
    const k = s.width / SHEET.width || 1;
    const r = target.getBoundingClientRect();
    setBox({
      left: (r.left - s.left) / k,
      top: (r.top - s.top) / k,
      width: r.width / k,
      height: r.height / k,
    });
  }, [slideId, html, blockId]);
  return (
    <div ref={root} className="ts-twin-overlay" aria-hidden="true">
      {findings.map((finding) => {
        const b = finding.evidence.box;
        if (!b) return null;
        return (
          <div
            key={finding.id}
            className="ts-lint-box"
            data-severity={finding.severity}
            data-rule={finding.rule}
            style={{ left: b[0], top: b[1], width: b[2], height: b[3] }}
          >
            <span className="ts-lint-box-chip">{finding.rule}</span>
          </div>
        );
      })}
      {box ? <div className="ts-select is-selected" style={box} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The conflict card and the external revision banner (SPEC 6.6, 6.7)

function slideJson(document: DeckDocument, slideId: string): string {
  const slide = document.slides[slideId];
  return slide ? canonicalJson(slide) : `slide ${slideId} is absent`;
}

function ConflictCard({
  controller,
  conflict,
}: {
  controller: EditorController;
  conflict: Conflict;
}) {
  const snap = controller.getSnapshot();
  const last = conflict.since[conflict.since.length - 1];
  const author = last
    ? authorLabel(last.author)
    : conflict.holder
      ? authorLabel(conflict.holder)
      : 'another writer';
  const slideId =
    conflict.overlap[0] ?? touchedSlides(conflict.pending.flatMap((write) => write.mutations))[0];
  const pendingCount = conflict.pending.reduce((sum, write) => sum + write.mutations.length, 0);
  return (
    <div className="ts-card ts-chrome" role="dialog" aria-label="Conflict" data-state="conflict">
      <div className="ts-card-head">
        <b>Conflict at r{conflict.currentRevision}</b>
        <span>{conflict.message}</span>
      </div>
      <p>
        {`${author} wrote ${conflict.since.length} revision${conflict.since.length === 1 ? '' : 's'} while ${pendingCount} local mutation${pendingCount === 1 ? '' : 's'} waited`}
        {conflict.overlap.length > 0 ? `; both touched ${conflict.overlap.join(', ')}.` : '.'}
      </p>
      {slideId ? (
        <div className="ts-card-both">
          <div>
            <h4>Current document (server)</h4>
            <pre>{slideJson(conflict.current, slideId)}</pre>
          </div>
          <div>
            <h4>This editor</h4>
            <pre>{slideJson(snap.document, slideId)}</pre>
          </div>
        </div>
      ) : null}
      {conflict.error ? (
        <p className="ts-card-error">{`Rebase failed: ${conflict.error}`}</p>
      ) : null}
      <div className="ts-card-actions">
        <button
          type="button"
          className="pt-ib is-text is-solid"
          title="Replay the waiting mutations on the current document and write them again"
          data-control="conflict.rebase"
          onClick={() => {
            void controller.rebase();
          }}
        >
          <span className="pt-lb">Rebase</span>
        </button>
        <button
          type="button"
          className="pt-ib is-text"
          title="Drop the waiting mutations and show the current document"
          data-control="conflict.discard"
          onClick={() => controller.discard()}
        >
          <span className="pt-lb">Discard</span>
        </button>
      </div>
    </div>
  );
}

/**
 * The store's notice (the hosting round, docs/hosting.md): a hosted studio without a Blob store
 * keeps edits on one server instance, so the editor says so for as long as the page is open. The
 * external revision banner takes the same slot while it is up.
 */
function HostingBanner({ notice, store }: { notice: string; store: string }) {
  return (
    <div className="ts-banner ts-chrome" role="status" data-state="hosting" data-store={store}>
      <span>{`${notice}. Connect a Blob store to the Vercel project to keep them.`}</span>
    </div>
  );
}

function ExternalRevisionBanner({
  controller,
  external,
}: {
  controller: EditorController;
  external: External;
}) {
  return (
    <div className="ts-banner ts-chrome" role="status" data-state="external">
      <span>
        {`Revision r${external.revision}${external.author ? ` by ${authorLabel(external.author)}` : ''} arrived from outside this editor and is shown${external.note ? `: ${external.note}` : ''}.`}
      </span>
      <button
        type="button"
        className="pt-ib is-text"
        title="Reload the document from the server; unsaved local edits are dropped"
        data-control="external.reload"
        onClick={() => {
          void controller.reload();
        }}
      >
        <span className="pt-lb">Reload</span>
      </button>
    </div>
  );
}
