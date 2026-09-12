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
import {
  blockDuplicate,
  deckText,
  slideApplyLayout,
  slideDuplicate,
  slideNew,
  slideSkip,
  textReplaceAll,
} from '@turboslide/cli/store-actions';
import type {
  BlockDuplicateInput,
  ExportTextInput,
  SlideApplyLayoutInput,
  SlideDuplicateInput,
  SlideNewInput,
  SlideSkipInput,
  StoreActionDeps,
  TextReplaceAllInput,
} from '@turboslide/cli/store-actions';
import type {
  ExportCapabilities,
  ExportMenuInput,
  ExportProgress,
} from '@turboslide/chrome/ExportMenu';
import { ContextMenu, contextMenuLabel } from '@turboslide/chrome/ContextMenu';
import type { EditorDispatch } from '@turboslide/chrome/dispatch';
import type {
  DrawTool,
  EditorClipboard,
  EditorSelection,
  EditorShellInput,
  PictureTarget,
} from '@turboslide/chrome/editor-shell';
import { useEditorShell } from '@turboslide/chrome/editor-shell-context';
import type { EditorShellState } from '@turboslide/chrome/editor-shell-context';
import { LayoutGrid } from '@turboslide/chrome/LayoutGrid';
import type { MenuContext } from '@turboslide/chrome/menus/model';
import { HOME, SNACKBARS } from '@turboslide/chrome/menus/strings';
import { NOTES_DEFAULT_HEIGHT, NotesPane } from '@turboslide/chrome/NotesPane';
import type { SidebarEdit } from '@turboslide/chrome/Sidebar';
import type { SnackbarAction } from '@turboslide/chrome/Snackbar';
import { tipProps } from '@turboslide/chrome/Tooltip';
import { ExportReportCard } from '@turboslide/chrome/ExportReportCard';
import type { ArtifactRun, ExportDownload } from '@turboslide/chrome/ExportReportCard';
import type { DitherWorkerLike } from '@turboslide/chrome/inspector/dither';
import { Overlay } from '@turboslide/chrome/Overlay';
import { buildPaletteEntries } from '@turboslide/chrome/palette-data';
import type { PaletteEntry } from '@turboslide/chrome/palette-data';
import { usePtShell, usePtStage } from '@turboslide/chrome/shell-context';
import type { ShellState } from '@turboslide/chrome/shell-context';
import type { ShellItem, ShellMode, ShellSection } from '@turboslide/chrome/shell-data';
import { SourceDrawer } from '@turboslide/chrome/SourceDrawer';
import type { SourceOwnerApi } from '@turboslide/chrome/SourceDrawer';
import type { SaveState } from '@turboslide/chrome/StatusChip';
import { TwinStage } from '@turboslide/chrome/TwinStage';
import { ViewerShell } from '@turboslide/chrome/ViewerShell';
import { lintStatic } from '@turboslide/lint/lint-static';
import { renderSlide } from '@turboslide/render/slide';
import type { ActionId, DeckTemplateId } from '@turboslide/schema/actions';
import { deckAppearance, isTrashed, unskippedSlideOrder } from '@turboslide/schema/deck';
import type { LayoutId } from '@turboslide/schema/layouts';
import { derivedLayout } from '@turboslide/schema/layouts';
import type { Asset } from '@turboslide/schema/assets';
import type { Block } from '@turboslide/schema/blocks';
import { blockAssetRefs } from '@turboslide/schema/catalog';
import { slideBlocks, slideTitle } from '@turboslide/schema/deck';
import type { ContentSlide, DeckDocument, Layout, Section, Slide } from '@turboslide/schema/deck';
import { ConflictError } from '@turboslide/schema/errors';
import type { Finding } from '@turboslide/schema/findings';
import {
  alignPositions,
  convertLayout,
  distributePositions,
  reorderZ,
  snapToGrid,
} from '@turboslide/schema/freeform';
import type {
  AlignEdge,
  AlignTarget,
  DistributeAxis,
  OrderMove,
} from '@turboslide/schema/freeform';
import { ICON_NAMES } from '@turboslide/schema/icons';
import { canonicalJson } from '@turboslide/schema/json';
import { parseAuthor } from '@turboslide/schema/mutations';
import type { Author, Lease, Mutation, Version, Write } from '@turboslide/schema/mutations';
import type { Position } from '@turboslide/schema/position';
import { applyMutations, applyWrite } from '@turboslide/schema/reduce';
import { validateSlide } from '@turboslide/schema/validate';
import type { Issue } from '@turboslide/schema/validate';
import { authorLabel, sameAuthor, touchedSlides } from '@turboslide/store/store';
import type { DeckStore, VersionRecord } from '@turboslide/store/store';
import { PRODUCT_TOKENS, PROPER_NOUNS } from '@turboslide/theme/copy';
import { SHEET } from '@turboslide/theme/tokens';
import { BookView } from '@turboslide/viewer/BookView';
import { clipboardStore, pastedSlideInserts } from '@turboslide/viewer/clipboard';
import { Editor as StageEditor } from '@turboslide/viewer/Editor';
import type { EditorContextMenu, EditorHandle, EditorNotice } from '@turboslide/viewer/Editor';
import {
  GRAMMAR_EXT_KEY,
  readStageBoxes,
  toFreeform,
  toGrammar,
} from '@turboslide/viewer/Freeform';
import type { EditorTool } from '@turboslide/viewer/Gestures';
import { GRID_DEFAULT_TILE, GridView } from '@turboslide/viewer/GridView';
import type { GridTileSize } from '@turboslide/viewer/GridView';
import { isPictureKind, pad2, trimTitle } from '@turboslide/viewer/model';
import type { ViewerDeck, ViewerSlide } from '@turboslide/viewer/model';
import { currentPlayIndex, playList, stepPlayIndex } from '@turboslide/viewer/present/presentModel';
import type { Selection as StageSelection } from '@turboslide/viewer/Selection';
import { blockFamily, cellPointer, listItemPointer } from '@turboslide/viewer/Selection';
import { Stage } from '@turboslide/viewer/Stage';
import { applyTheme, installThemeBridge, readTheme, useTheme } from '@turboslide/viewer/theme';
import type { Theme } from '@turboslide/viewer/theme';

import {
  exitPresentFullscreen,
  presenterView,
  requestPresentFullscreen,
  startSlideshow,
} from '../components/presentActions';
import type { PresentHost } from '../components/presentActions';
import { Slideshow } from '../components/Slideshow';
import { useMountEffect } from '../components/useMountEffect';
import { useStudioSession } from '../components/useStudioSession';
import { runDeckAction } from '../server/agent-actions';
import type { ServerSideWindowAction } from '../server/agent-actions';
import { bundleDownloadTicket, bundleUploadTicket, connectFacts } from '../server/bundle';
import { createNewDeck, listDecks, readSourceDeckSlides, restoreStoredDeck } from '../server/decks';
import {
  EXPORT_POLL_MS,
  exportCapabilities,
  pollExport,
  runBuild,
  signDownload,
  startExport,
  syncExport,
} from '../server/download';
import type { ExportRunInput, SyncExportAnswer } from '../server/download';
import { lintSlides } from '../server/lint';
import { renderSlideImages } from '../server/render';
import { warmThumbnails } from '../server/warm';
import {
  DECK_CREATED_EVENT,
  autoTitleMutations,
  leaseSlide,
  listVersions,
  readEditorDeck,
  saveVersion,
  watchDeck,
  writeDeck,
} from '../server/write';
import type {
  DeckCreatedDetail,
  EditorDeck,
  WatchDeckResult,
  WriteDeckResult,
} from '../server/write';

import { recordDeckOpened } from './decks.index';

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
  /** retries after the hosted store refused to commit on a copy it could not prove yet */
  attempts?: number;
};

/** The hosted store's refusal while another instance's write has not reached its mirror (StaleMirrorError, packages/store/src/blob-store.ts). */
function isRetryableWriteError(error: unknown): boolean {
  return error instanceof Error && /retry the write/.test(error.message);
}
const WRITE_RETRIES = 6;
const WRITE_RETRY_MS = 1500;

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
  /** the stage scale view.zoom set, or 'fit' (gslides-parity SPEC 7.2.16); the Sheet draws it (B4) */
  zoom: number | 'fit';
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

/**
 * The slide that takes the current one's place when a write, an undo or an external change
 * removes it (gslides-parity SPEC 4.1; Google selects the slide that moves into the deleted
 * slide's position, and the previous slide when the last one was deleted): the slide now at the
 * removed slide's index, clamped to the end; the first slide when the current id was never in
 * the order (an empty deck that gained its first slide). Null while the current slide still
 * exists, so nothing moves; the empty string when the deck has no slides left.
 */
function replacementSlide(
  before: readonly string[],
  after: readonly string[],
  active: string,
): string | null {
  if (active !== '' && after.includes(active)) return null;
  const at = before.indexOf(active);
  if (at < 0) return after[0] ?? '';
  return after[Math.min(at, after.length - 1)] ?? '';
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

/**
 * A hosted studio's export (docs/hosting.md): one call to the syncExport server function runs the
 * export inside that request and answers the report with the files' URLs (the same runSyncExport
 * and the same JSON as POST /api/export/:deckId?sync=1&format=json), because a job queued by one
 * function invocation is not visible to the next; the download then fetches the URL (a stored copy
 * on the blob backend, this instance's job file on the tmp backend). It is a server function, not
 * a fetch of the route, so the route can require TURBOSLIDE_TOKEN (SPEC 11; docs/hosting.md
 * section 6, option 2) while the page never holds the token.
 */
async function runSyncExport(
  deckId: string,
  input: ExportRunInput,
): Promise<Extract<ArtifactRun, { kind: 'export' }>> {
  const body: SyncExportAnswer = await syncExport({ deckId, input });
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
    zoom: 'fit',
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

  /* the shell knows a new item after its next render: a select that found nothing runs once
     more after a frame (measured: the new slide stayed unselected one run in five) */
  const selectSoon = (slideId: string): void => {
    shell?.select(slideId);
    if (typeof requestAnimationFrame === 'function')
      requestAnimationFrame(() => {
        if (latest().activeSlide !== slideId) shell?.select(slideId);
      });
  };

  /**
   * Replaces the document and drops the cached HTML of the slides that changed ('all' after a
   * reload). When the change removed the current slide (Delete, an undone New slide or Duplicate,
   * an external write), the slide that took its place becomes current on the snapshot and on the
   * shell, so describe().state, the filmstrip's ring and the next insert never name a slide the
   * deck no longer has (gslides-parity SPEC 4.1; `replacementSlide`).
   */
  const setDocument = (document: DeckDocument, changed: readonly string[] | 'all'): void => {
    const html = changed === 'all' ? new Map<string, string>() : new Map(snapshot.html);
    if (changed !== 'all') for (const id of changed) html.delete(id);
    for (const id of html.keys()) if (document.slides[id] === undefined) html.delete(id);
    findingsCache = null;
    const replacement = replacementSlide(
      slideOrder(snapshot.document),
      slideOrder(document),
      snapshot.activeSlide,
    );
    const moved = replacement !== null && replacement !== snapshot.activeSlide;
    publish({
      document,
      html: renderMissing(document, html),
      ...(moved ? { activeSlide: replacement, selection: null } : {}),
    });
    if (moved && replacement !== '') selectSoon(replacement);
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
    // when both sides touched one slide, or when either side changed the deck itself. A lease
    // refusal (the result names the holder) is not a revision conflict: the server changed
    // nothing, so `since` is empty and a rebase would re-send the same write to the same refusal
    // (measured on the dev server: the pump re-sent it every 2 ms for two minutes against the
    // ten minute lease a closed tab had left on the slide); the card names the holder instead.
    const leaseRefused = result.holder !== undefined;
    if (!leaseRefused && overlap.length === 0 && !deckLevelOutside && !deckLevelMine) {
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
          const attempts = (job.attempts ?? 0) + 1;
          if (isRetryableWriteError(error) && attempts <= WRITE_RETRIES) {
            job.attempts = attempts;
            await new Promise((resolve) => setTimeout(resolve, WRITE_RETRY_MS * attempts));
            continue;
          }
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

  /* the auto-title (gslides-parity SPEC 6.3): the first committed heading of an Untitled
     presentation renames the deck in the same write, so one undo removes both */
  const commit = (mutations: Mutation[], label: string): Promise<Committed> =>
    commitAs([...mutations, ...autoTitleMutations(snapshot.document, mutations)], label, 'edit');

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
    /* the shell's active id first, the snapshot's next, either only while the deck still has
       the slide (the shell re-renders one frame after a removal moved the selection) */
    const present = (id: string | undefined): string =>
      id !== undefined && id !== '' && document.slides[id] !== undefined ? id : '';
    const slideId = present(shell?.active) || present(snapshot.activeSlide) || order[0] || '';
    return {
      slideId,
      n: Math.max(1, order.indexOf(slideId) + 1),
      mode: shell?.mode ?? 'slide',
      theme: readTheme(),
      present: shell?.present ?? false,
      edit: editingRef.current,
      zoom: snapshot.zoom,
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
  /* deck.set (gslides-parity SPEC 7.2.3 to 7.2.5): the Themes panel's and Slide numbers' write as
     an action, so an agent writes /defaults the way the panel does; the reducer keeps the roots */
  on<{ path: string; value?: unknown; baseRevision: number }>('deck.set', async (input) => {
    checkBase(input.baseRevision);
    const committed = await commit(
      [
        {
          op: 'deck.set',
          path: input.path,
          ...(input.value === undefined ? {} : { value: input.value }),
        },
      ],
      'deck.set',
    );
    let value: unknown = snapshot.document.deck;
    for (const key of input.path.split('/').slice(1)) {
      value =
        value !== null && typeof value === 'object'
          ? (value as Record<string, unknown>)[key]
          : undefined;
    }
    return {
      path: input.path,
      ...(value === undefined ? {} : { value }),
      revision: committed.revision,
    };
  });
  on<{ name: string; from: DeckTemplateId; id?: string }>('deck.create', async (input) => {
    const created = await createNewDeck(input);
    say(`Created ${created.deckId} from ${created.from}: ${created.counts.slides} slides`);
    init.onDeckCreated?.(created.deckId);
    return created;
  });
  /* asset.add, asset.dither, material.capture and material.list run on the server (sharp, the
     capture browser, the catalog); the write they end in comes back over the watch channel */
  const serverSide = (id: ServerSideWindowAction, options: { announce?: boolean } = {}): void => {
    on<unknown>(id, async (input) => {
      const output = await runDeckAction({ deckId, action: id, input, author });
      if (options.announce === true) {
        const outputs = Array.isArray(output) ? output : [output];
        const ids = outputs
          .map((entry) => (entry as { id?: string } | null)?.id)
          .filter((entry): entry is string => typeof entry === 'string');
        if (ids.length > 0) say(`${id}: ${ids.join(', ')}`);
      }
      return output;
    });
  };
  serverSide('asset.add', { announce: true });
  serverSide('asset.dither', { announce: true });
  serverSide('material.capture', { announce: true });
  serverSide('material.list');
  /* the deck collection actions of the parity round (gslides-parity SPEC 7.5) run on the server
     over the hosted collection; the menu handlers word their own snackbars (SPEC 12) */
  serverSide('deck.list');
  serverSide('deck.copy');
  serverSide('deck.trash');
  serverSide('deck.restore');
  serverSide('deck.remove');
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
        skipped: slideOrder(document).filter((id) => document.slides[id]?.skip === true).length,
      },
      // the parity round's manifest facts (gslides-parity SPEC 7.2.3 to 7.2.5), only when written
      ...(document.deck.defaults !== undefined ? { defaults: document.deck.defaults } : {}),
      ...(document.deck.trashedAt !== undefined ? { trashedAt: document.deck.trashedAt } : {}),
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
      skip?: boolean;
      template?: Slide['template'];
    }[] = [];
    const findings = allFindings();
    for (const section of outlineOf(snapshot.document)) {
      if (input.sectionId !== undefined && section.id !== input.sectionId) continue;
      for (const row of section.slides) {
        const mine = findings.filter((finding) => finding.slideId === row.id);
        const record = snapshot.document.slides[row.id];
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
          // the parity round's facts (gslides-parity SPEC 7.2.1, 7.2.2), only when set
          ...(record?.skip === true ? { skip: true } : {}),
          ...(record?.template !== undefined ? { template: record.template } : {}),
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
  // Freeform (docs/freeform.md). The arithmetic is the schema's, the same the CLI's store-actions
  // use, so an arrange from the inspector, the stage or an agent writes the same block.set /pos
  // mutations; each action is one commit, so one history entry and one version record.
  type Positioned = { id: string; pos: Position };
  const freeformRows = (slideId: string): Positioned[] => {
    const slide = requireSlide(slideId);
    if (slide.kind !== 'content' || slide.layout.type !== 'freeform') {
      throw new TypeError(
        `Slide "${slideId}" is not on the freeform layout; slide.setLayout moves it there (docs/freeform.md)`,
      );
    }
    return (slide.slots.main ?? []).flatMap((block) =>
      block.pos === undefined ? [] : [{ id: block.id, pos: block.pos }],
    );
  };
  const pickRows = (rows: Positioned[], ids: readonly string[], slideId: string): Positioned[] =>
    ids.map((id) => {
      const row = rows.find((candidate) => candidate.id === id);
      if (row === undefined)
        throw new RangeError(`No positioned block "${id}" on slide "${slideId}"`);
      return row;
    });
  const positionMutations = (
    slideId: string,
    rows: readonly Positioned[],
    next: readonly Position[],
  ): Mutation[] =>
    rows.flatMap((row, index) => {
      const pos = next[index];
      if (pos === undefined || canonicalJson(pos) === canonicalJson(row.pos)) return [];
      return [{ op: 'block.set' as const, slideId, blockId: row.id, path: '/pos', value: pos }];
    });
  const commitPositions = async (slideId: string, mutations: Mutation[], label: string) => {
    if (mutations.length === 0) {
      return {
        slide: requireSlide(slideId),
        revision: snapshot.document.deck.revision,
        findings: findingsFor(slideId),
      };
    }
    const committed = await commit(mutations, label);
    return slideResult(committed, slideId);
  };
  on<{
    slideId: string;
    blockIds: string[];
    edge: AlignEdge;
    to?: AlignTarget;
    snap?: boolean;
    baseRevision: number;
  }>('block.align', (input) => {
    checkBase(input.baseRevision);
    const rows = pickRows(freeformRows(input.slideId), input.blockIds, input.slideId);
    const next = alignPositions(
      rows.map((row) => row.pos),
      input.edge,
      input.to,
      input.snap !== false,
    );
    return commitPositions(
      input.slideId,
      positionMutations(input.slideId, rows, next),
      'block.align',
    );
  });
  on<{
    slideId: string;
    blockIds: string[];
    axis: DistributeAxis;
    gap?: number;
    snap?: boolean;
    baseRevision: number;
  }>('block.distribute', (input) => {
    checkBase(input.baseRevision);
    const rows = pickRows(freeformRows(input.slideId), input.blockIds, input.slideId);
    let next = distributePositions(
      rows.map((row) => row.pos),
      input.axis,
      input.gap,
    );
    if (input.snap === true) {
      next = next.map((pos) =>
        input.axis === 'horizontal'
          ? { ...pos, x: snapToGrid(pos.x) }
          : { ...pos, y: snapToGrid(pos.y) },
      );
    }
    return commitPositions(
      input.slideId,
      positionMutations(input.slideId, rows, next),
      'block.distribute',
    );
  });
  on<{ slideId: string; blockId: string; move?: OrderMove; z?: number; baseRevision: number }>(
    'block.order',
    (input) => {
      checkBase(input.baseRevision);
      const rows = freeformRows(input.slideId);
      const stack = reorderZ(rows, input.blockId, input.move ?? { z: input.z ?? 0 });
      const mutations: Mutation[] = rows.flatMap((row) => {
        const z = stack[row.id];
        if (z === undefined || z === row.pos.z) return [];
        return [
          {
            op: 'block.set' as const,
            slideId: input.slideId,
            blockId: row.id,
            path: '/pos/z',
            value: z,
          },
        ];
      });
      return commitPositions(input.slideId, mutations, 'block.order');
    },
  );
  on<{ slideId: string; layout: Layout; baseRevision: number }>(
    'slide.setLayout',
    async (input) => {
      checkBase(input.baseRevision);
      const slide = requireSlide(input.slideId);
      if (slide.kind !== 'content')
        throw new TypeError(
          `Slide "${slide.id}" is a ${slide.kind} slide and has no layout to set`,
        );
      const next = convertedLayout(slide, input.layout);
      const committed = await commit(
        [{ op: 'slide.replace', slideId: input.slideId, slide: next }],
        'slide.setLayout',
      );
      return slideResult(committed, input.slideId);
    },
  );
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
  on<{ zoom: number | 'fit' }>('view.zoom', (input) => {
    // the schema caps the factor at 4; the floor is Google's 25 percent (gslides-parity SPEC 3.1)
    if (input.zoom !== 'fit' && input.zoom < 0.25)
      throw new TypeError(`view.zoom: zoom must be at least 0.25 or 'fit'; got ${input.zoom}`);
    publish({ zoom: input.zoom });
    return viewState();
  });

  /*
   * The document actions of the Google Slides parity round (gslides-parity SPEC 7.5: slide.new,
   * slide.duplicate, slide.skip, slide.applyLayout, block.duplicate, text.replaceAll, export.text)
   * run the store actions of @turboslide/cli/store-actions, the one implementation the CLI and the
   * hosted dispatcher run (SPEC 7.1), over a DeckStore whose read is the local document and whose
   * write is this editor's commit: the reducer applies the write now, the history takes the entry
   * for undo, and the server confirms it in order. Only read, revision and write are reachable
   * from those actions; the version, lease and watch methods belong to the server (server/write.ts)
   * and throw if a later action reaches for them here.
   */
  const editorStore = (label: string): DeckStore => {
    const unavailable = (method: string) => (): never => {
      throw new TypeError(
        `${method} is not available on the editor's store; commit is its write path`,
      );
    };
    return {
      id: deckId,
      read: async () => ({ document: snapshot.document, issues: [], ok: true }),
      revision: async () => snapshot.document.deck.revision,
      write: async (write) => {
        checkBase(write.baseRevision);
        const committed = await commit(write.mutations, label);
        return {
          ok: true,
          document: snapshot.document,
          revision: committed.revision,
          entry: committed.entry,
          changed: [...touchedSlides(write.mutations)],
          issues: [],
          warnings: [],
        };
      },
      saveVersion: unavailable('saveVersion'),
      listVersions: unavailable('listVersions'),
      records: unavailable('records'),
      documentAt: unavailable('documentAt'),
      documentAtRevision: unavailable('documentAtRevision'),
      lease: unavailable('lease'),
      release: unavailable('release'),
      leases: unavailable('leases'),
      watch: unavailable('watch'),
    };
  };
  const storeDeps = (label: string): StoreActionDeps => ({
    store: editorStore(label),
    lint: lintLists(),
  });
  on<SlideNewInput>('slide.new', async (input) => {
    const result = await slideNew(storeDeps('slide.new'), context, input);
    // Google selects the new slide (R01 Slide > New slide); a grid stays a grid
    selectSoon(result.slide.id);
    return result;
  });
  on<SlideDuplicateInput>('slide.duplicate', async (input) => {
    const result = await slideDuplicate(storeDeps('slide.duplicate'), context, input);
    const last = result.slides[result.slides.length - 1];
    if (last !== undefined) selectSoon(last.id);
    return result;
  });
  on<SlideSkipInput>('slide.skip', (input) => slideSkip(storeDeps('slide.skip'), context, input));
  on<SlideApplyLayoutInput>('slide.applyLayout', (input) =>
    slideApplyLayout(storeDeps('slide.applyLayout'), context, input),
  );
  on<BlockDuplicateInput>('block.duplicate', (input) =>
    blockDuplicate(storeDeps('block.duplicate'), context, input),
  );
  on<TextReplaceAllInput>('text.replaceAll', (input) =>
    textReplaceAll(storeDeps('text.replaceAll'), context, input),
  );
  on<ExportTextInput>('export.text', (input) => deckText(snapshot.document, input));
  /* slide.import reads another deck, so it runs on the server (server/actions.ts) and its write
     comes back over the watch channel; the handler waits for that revision so a caller can address
     the imported slides at once, then selects the first of them */
  const awaitRevision = async (revision: number, ms: number): Promise<boolean> => {
    const until = Date.now() + ms;
    while (latest().document.deck.revision < revision) {
      if (Date.now() > until) return false;
      await sleep(40);
    }
    return true;
  };
  on<{
    sourceDeckId: string;
    slideIds: string[];
    after?: string;
    sectionId?: string;
    baseRevision: number;
  }>('slide.import', async (input) => {
    const output = (await runDeckAction({
      deckId,
      action: 'slide.import',
      input,
      author,
    })) as { slides: Slide[]; revision: number };
    if (!(await awaitRevision(output.revision, 5000))) await reload();
    const first = output.slides[0];
    if (first !== undefined && latest().document.slides[first.id] !== undefined)
      shell?.select(first.id);
    return output;
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
      zoom: snapshot.zoom,
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
            const body = (await fetch(file.url).then((r) => r.json())) as {
              error?: { message?: string };
            };
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
        // the parity facts (gslides-parity SPEC 7.2.1, 7.2.2): the show and the grid read skip, the grid the layout
        ...(slide.skip === true ? { skip: true } : {}),
        ...(slide.template !== undefined ? { template: slide.template } : {}),
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

/**
 * The slide slide.setLayout writes for a picked layout. To freeform the stage's measured boxes
 * place every block where it is drawn (toFreeform, which records the source under ext.grammar);
 * back to the recorded grammar layout type toGrammar is lossless; every other case is the
 * schema's convertLayout, the same arithmetic the CLI's store action uses (docs/freeform.md).
 */
function convertedLayout(slide: ContentSlide, layout: Layout): ContentSlide {
  const boxes = typeof document === 'undefined' ? null : readStageBoxes();
  if (layout.type === 'freeform' && slide.layout.type !== 'freeform' && boxes) {
    const converted = toFreeform(slide, boxes);
    if (converted) return converted.slide;
  }
  if (slide.layout.type === 'freeform' && layout.type !== 'freeform') {
    const record = slide.ext?.[GRAMMAR_EXT_KEY] as { layout?: Layout } | undefined;
    if (record?.layout?.type === layout.type) {
      const back = toGrammar(slide);
      if (back && back.lossless) return back.slide;
    }
  }
  return convertLayout(slide, layout);
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

/**
 * The route's selection in the shell's words (gslides-parity SPEC 3.2 to 3.8): the block, whether
 * the caret is in one of its runs, the table cell or the list item the run pointer names.
 */
function toShellSelection(selection: Selection | null): EditorSelection | null {
  if (selection === null) return null;
  const pointer = selection.pointer;
  const cell = pointer === undefined ? null : cellPointer(pointer);
  const item = pointer === undefined ? null : listItemPointer(pointer);
  return {
    blockId: selection.blockId,
    text: pointer !== undefined,
    ...(cell === null ? {} : { cell: { row: cell.row, column: cell.col } }),
    ...(item === null ? {} : { listItem: true }),
  };
}

/** The plain word of a deleted block for the snackbar (gslides-parity SPEC 13.7: the type, never the id). */
function deletedWord(type: string): string {
  switch (blockFamily(type)) {
    case 'image':
      return 'Image';
    case 'table':
      return 'Table';
    case 'shape':
      return 'Shape';
    case 'line':
      return 'Line';
    case 'text':
      return 'Text box';
    default:
      return 'Object';
  }
}

/** The toolbar's draw tool (the shell's words) as the stage's (Gestures.tsx EditorTool). */
function toEditorTool(tool: DrawTool): EditorTool {
  switch (tool.kind) {
    case 'text':
      return { kind: 'text' };
    case 'rule':
      return { kind: 'line', line: 'rule' };
    case 'shape':
      return tool.shape === 'line' || tool.shape === 'arrow'
        ? { kind: 'line', line: tool.shape }
        : { kind: 'shape', shape: tool.shape };
  }
}

function isApple(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
}

/** The region that has focus, for the Edit menu's Cut, Copy, Delete and Duplicate (SPEC 2.2). */
type FocusRegion = 'filmstrip' | 'canvas' | 'notes';

function regionOf(target: EventTarget | null): FocusRegion | null {
  if (!(target instanceof HTMLElement)) return null;
  if (target.closest('.ts-filmstrip')) return 'filmstrip';
  if (target.closest('.ts-notes-slot')) return 'notes';
  if (target.closest('.pt-stagewrap')) return 'canvas';
  return null;
}

/**
 * The Upload tab of Open and Import slides (SPEC 6.5): the bundle route with a ticket from the
 * server function, the zip as the body; answers the new deck's id.
 */
async function uploadBundleFile(file: File): Promise<{ id: string }> {
  const ticket = await bundleUploadTicket();
  if (file.size > ticket.maxBytes) {
    throw new Error(
      `${file.name} is ${file.size} bytes; a bundle is at most ${ticket.maxBytes} bytes`,
    );
  }
  const response = await fetch(new URL(ticket.url, window.location.origin), {
    method: 'POST',
    headers: { 'content-type': 'application/zip', accept: 'application/json' },
    body: file,
  });
  const answer = (await response.json()) as { deckId?: string; error?: { message?: string } };
  if (!response.ok || answer.deckId === undefined) {
    throw new Error(answer.error?.message ?? `The upload answered ${response.status}`);
  }
  return { id: answer.deckId };
}

/** The OS file picker for one picture. */
function pickPicture(onFile: (file: File) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';
  input.onchange = () => {
    const file = input.files?.[0];
    input.remove();
    if (file) onFile(file);
  };
  document.body.appendChild(input);
  input.click();
}

type EditorRootProps = {
  payload: EditorDeck;
  search: EditSearch;
  author: Author;
  onSearch: (patch: Partial<EditSearch>) => void;
  onDeckCreated: (deckId: string) => void;
};

/**
 * The editor page, on /edit/:deckId and on the draft of /new (gslides-parity SPEC 6.1). The
 * chrome's ViewerShell takes the `editor` input, from which it draws the title row, the menu bar,
 * the toolbar with its contextual tail, the filmstrip, the notes pane, the right panel, the bottom
 * bar, the dialogs and the snackbar (EditorShell.tsx); this component supplies the document, the
 * dispatcher and every handler a row needs, and mounts the stage, the slideshow and the canvas
 * menus inside the shell.
 */
export function EditorRoot({ payload, search, author, onSearch, onDeckCreated }: EditorRootProps) {
  const [controller] = useState(() =>
    createEditorController({ deckId: payload.deckId, author, payload, onDeckCreated }),
  );
  const [capabilities, setCapabilities] = useState<ExportCapabilities | null>(null);
  /* Extensions > Agent access: whether the deployment asks for TURBOSLIDE_TOKEN */
  const [tokenRequired, setTokenRequired] = useState(true);
  /* the report card, from the Download dialog's Details link and nowhere else (SPEC 6.7) */
  const [reportOpen, setReportOpen] = useState(false);
  const snap = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const theme = useTheme();
  /* a trashed presentation is read only under its banner (SPEC 6.4) */
  const trashed = isTrashed(snap.document.deck);
  const editing = search.edit !== 0 && !trashed;
  const twin = search.twin === 1;
  const lintLayer = search.lint === 1;
  const src = search.src === 1;
  controller.setEditing(editing);

  /* the draft of /new: Not saved yet until the first write has created the deck (SPEC 6.1) */
  const [draft, setDraft] = useState(payload.draft === true);
  /* the stage's imperative surface (null while the stage is not the editor) */
  const [editorHandle, setEditorHandle] = useState<EditorHandle | null>(null);
  /* the toolbar's draw tool; Select between inserts */
  const [tool, setTool] = useState<EditorTool>('select');
  /* the filmstrip's and the grid's multi-selection */
  const [selectedSlideIds, setSelectedSlideIds] = useState<string[]>([]);
  /* the region that last took focus */
  const [region, setRegion] = useState<FocusRegion | null>(null);
  /* the notes pane's height; 0 hides it (SPEC 8) */
  const [notesHeight, setNotesHeight] = useState<number>(NOTES_DEFAULT_HEIGHT);
  const clipboardKind = useSyncExternalStore(
    clipboardStore.subscribe,
    clipboardStore.kind,
    () => 'empty' as const,
  );
  /* the shell's snackbar with an action and its runItem, captured by ShellBridge inside the shell */
  const shellApi = useRef<EditorShellState | null>(null);

  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;
  const handleRef = useRef(editorHandle);
  handleRef.current = editorHandle;

  useMountEffect(() => {
    if (search.theme) applyTheme(search.theme);
    const stopBridge = installThemeBridge();
    controller.start();
    if (payload.draft !== true) recordDeckOpened(payload.deckId);
    exportCapabilities()
      .then((caps) => {
        controller.setExportSync(caps.sync);
        setCapabilities(caps);
      })
      .catch((error: unknown) => controller.say(`Export: ${errorMessage(error)}`));
    connectFacts()
      .then((facts) => setTokenRequired(facts.tokenRequired))
      .catch(() => undefined);
    /* the first write of a draft created the deck: the save words change and Recent counts it */
    const onCreated = (event: Event) => {
      const detail = (event as CustomEvent<DeckCreatedDetail>).detail;
      if (detail.deckId !== payload.deckId) return;
      setDraft(false);
      recordDeckOpened(detail.deckId);
    };
    window.addEventListener(DECK_CREATED_EVENT, onCreated);
    /* which region has focus (the menus, the toolbar and the dialogs leave it as it was) */
    const onFocus = (event: FocusEvent) => {
      const next = regionOf(event.target);
      if (next !== null) setRegion(next);
    };
    document.addEventListener('focusin', onFocus);
    return () => {
      window.removeEventListener(DECK_CREATED_EVENT, onCreated);
      document.removeEventListener('focusin', onFocus);
      stopBridge();
      controller.stop();
    };
  });

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
  const deckId = snap.deckId;
  const assetBase = ASSET_BASE(deckId);
  const slide = snap.document.slides[snap.activeSlide];
  const revision = deck.revision;
  const selection =
    snap.selection && snap.selection.slideId === snap.activeSlide ? snap.selection : null;

  const status: SaveState = snap.conflict ? 'conflict' : snap.pending > 0 ? 'unsaved' : 'saved';

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
                  `The source drawer replaces slide "${api.slideId}", not "${checked.id}"; close the drawer (Tools > Advanced > Show source) to replace another slide through the editor`,
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

  /* the full palette (Tools > Advanced > Run an action): every action with the current facts */
  const paletteEntries = useMemo<readonly PaletteEntry[]>(() => {
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

  /* the live copy lint of a Text field (SPEC 6.5): the same rules over a draft of the slide */
  const lintText = (text: string, spec: { path: string }): readonly string[] => {
    if (!slide || !selection) return [];
    try {
      const draftDocument = applyMutations(snap.document, [
        {
          op: 'block.set',
          slideId: slide.id,
          blockId: selection.blockId,
          path: spec.path,
          value: text,
        },
      ]).document;
      return lintStatic(draftDocument, { ...lintLists(), slideIds: [slide.id] })
        .filter(
          (finding) => finding.blockId === selection.blockId && finding.rule.startsWith('copy/'),
        )
        .map((finding) => finding.proposal);
    } catch {
      return [];
    }
  };

  const scopeAttr = { [SCOPE_ATTRIBUTE]: `editor:${deckId}` };

  /* navigation for the menu's route effects and the dialogs: a new tab, or a full load of another route */
  const go = (path: string, newTab?: boolean): void => {
    if (newTab) {
      window.open(path, '_blank', 'noopener');
      return;
    }
    window.location.assign(path);
  };

  /* the Slideshow button's host (SPEC 9.1): the play list's first slide, goto and present as actions */
  const presentHost: PresentHost = {
    deckId,
    firstSlideId: () => unskippedSlideOrder(controller.getSnapshot().document)[0],
    goto: (slideId) => {
      controller.invoke('view.goto', { slideId }).catch(() => undefined);
    },
    present: (on) => {
      controller.invoke('view.present', { on }).catch(() => undefined);
    },
  };

  /*
   * The shell's dispatcher: the controller's, plus two effects an action alone does not carry.
   * Slideshow from the title row or the View menu (view.present on) asks for full screen while the
   * click's gesture is live, as Google does (SPEC 9.1); the same action from the window API or an
   * agent asks for nothing (the browser refuses full screen without a gesture). deck.pack from
   * File > Download > Turboslide bundle downloads the zip through the bundle route's ticket: the
   * page cannot run the CLI's packer.
   */
  const shellDispatch: EditorDispatch = (action, input) => {
    if (action === 'view.present' && (input as { on?: boolean }).on === true) {
      requestPresentFullscreen();
    }
    if (action === 'deck.pack') {
      return bundleDownloadTicket({ deckId }).then(({ url }) => {
        triggerDownload(url);
        return { path: `${deckId}.zip`, url };
      });
    }
    return controller.invoke(action, input);
  };

  const shellSay = (text: string, action?: SnackbarAction): void => {
    if (shellApi.current) shellApi.current.say(text, action);
    else controller.say(text);
  };

  /* the clipboard handlers of the Edit menu (gslides-parity SPEC 2.2). The canvas's while a block
     or a run is selected there; the slides' while the filmstrip last had focus or nothing is
     selected on the canvas, which is what Google cuts, copies and pastes from the menu with a
     slide card selected (the menu bar takes focus, so the region that last had it decides; the
     filmstrip answers its own keys). The notes textarea keeps the browser's own clipboard, and
     the menu's Delete with no canvas selection runs Delete slide through the plan. */
  const liveSlideIds = (selectedSlideIds.length > 0 ? selectedSlideIds : [snap.activeSlide]).filter(
    (id) => snap.document.slides[id] !== undefined,
  );
  const slideClipboard = region !== 'notes' && (region === 'filmstrip' || selection === null);
  const canvasClipboard = region !== 'filmstrip' && region !== 'notes' && editorHandle !== null;
  const copySlides = async (): Promise<void> => {
    const slides = liveSlideIds.flatMap((id) => {
      const record = snap.document.slides[id];
      return record ? [record] : [];
    });
    if (slides.length === 0) return;
    await clipboardStore.write({
      kind: 'slides',
      deckId,
      slides: JSON.parse(JSON.stringify(slides)) as Slide[],
    });
  };
  /* one slide.remove per slide with the revision each write will find (the reducer applies
     locally before the next call), and the snackbar with one Undo per removed slide */
  const removeSlides = (ids: readonly string[]): void => {
    const ordered = slideOrder(snap.document).filter((id) => ids.includes(id));
    if (ordered.length === 0) return;
    let base = revision;
    for (const id of ordered) {
      void shellDispatch('slide.remove', { slideId: id, baseRevision: base }).catch(
        (error: unknown) => shellSay(errorMessage(error)),
      );
      base += 1;
    }
    const count = ordered.length;
    shellSay(count === 1 ? SNACKBARS.slideDeleted : SNACKBARS.slidesDeleted(count), {
      label: SNACKBARS.undo,
      run: () => {
        for (let i = 0; i < count; i += 1) void controller.undo();
      },
    });
  };
  /* slides after the last selected card (slide.import when they come from another deck, so the
     assets travel); anything else is the canvas's paste onto the current slide */
  const pasteSlidesOrCanvas = async (plain: boolean): Promise<void> => {
    const payload = await clipboardStore.read();
    if (payload === null) return;
    if (payload.kind !== 'slides') {
      await editorHandle?.paste({ plain });
      return;
    }
    const after = liveSlideIds[liveSlideIds.length - 1] ?? snap.activeSlide;
    if (payload.deckId !== deckId && payload.deckId !== '') {
      await shellDispatch('slide.import', {
        sourceDeckId: payload.deckId,
        slideIds: payload.slides.map((row) => row.id),
        ...(after !== '' ? { after } : {}),
        baseRevision: revision,
      });
      return;
    }
    let base = revision;
    for (const input of pastedSlideInserts(
      snap.document.deck,
      payload,
      after === '' ? undefined : after,
    )) {
      void shellDispatch('slide.insert', { ...input, baseRevision: base }).catch((error: unknown) =>
        shellSay(errorMessage(error)),
      );
      base += 1;
    }
  };
  const clipboard: EditorClipboard = {
    kind: clipboardKind,
    ...(slideClipboard
      ? {
          cut: () => void copySlides().then(() => removeSlides(liveSlideIds)),
          copy: () => void copySlides(),
          paste: () =>
            void pasteSlidesOrCanvas(false).catch((e: unknown) => shellSay(errorMessage(e))),
          pasteWithoutFormatting: () =>
            void pasteSlidesOrCanvas(true).catch((e: unknown) => shellSay(errorMessage(e))),
          /* Select all on the canvas selects every block of the slide; the filmstrip's is its own key */
          ...(canvasClipboard ? { selectAll: () => editorHandle.selectAll() } : {}),
        }
      : canvasClipboard
        ? {
            cut: () => void editorHandle.cut(),
            copy: () => void editorHandle.copy(),
            paste: () => void editorHandle.paste(),
            pasteWithoutFormatting: () => void editorHandle.paste({ plain: true }),
            delete: () => editorHandle.remove(),
            selectAll: () => editorHandle.selectAll(),
          }
        : {}),
  };

  const focus: MenuContext['focus'] =
    region === 'filmstrip'
      ? 'filmstrip'
      : region === 'notes'
        ? 'notes'
        : selection?.pointer !== undefined
          ? 'text'
          : selection
            ? 'canvas'
            : 'none';

  const uploadPicture = (target: PictureTarget): void => {
    pickPicture((file) => {
      const handle = handleRef.current;
      if (!handle) {
        controller.say('Open a slide in Editing mode to add a picture');
        return;
      }
      const where =
        target.kind === 'block'
          ? { blockId: target.blockId, replace: true }
          : target.kind === 'slide'
            ? { replace: true }
            : {};
      handle
        .insertPicture(file, where)
        .catch((error: unknown) => controller.say(errorMessage(error)));
    });
  };

  const editorInput: EditorShellInput = {
    deckId,
    document: snap.document,
    slideId: snap.activeSlide,
    selectedSlideIds: selectedSlideIds.length > 0 ? selectedSlideIds : [snap.activeSlide],
    selection: toShellSelection(selection),
    focus,
    revision,
    dispatch: shellDispatch,
    commit: controller.commit,
    history: {
      canUndo: snap.history.canUndo,
      canRedo: snap.history.canRedo,
      undo: () => void controller.undo(),
      redo: () => void controller.redo(),
    },
    save: {
      state: status,
      draft,
      lastEditAt: deck.updatedAt,
      ...(authorLabel(author) !== DEFAULT_AUTHOR ? { lastEditBy: authorLabel(author) } : {}),
    },
    clipboard,
    toggles: {
      viewing: !editing,
      onViewing: (viewing) => onSearch({ edit: viewing ? 0 : undefined }),
      sideBySide: twin,
      onSideBySide: (on) => onSearch({ twin: on ? 1 : undefined }),
      source: src,
      onSource: (on) => onSearch({ src: on ? 1 : undefined }),
      suggestionMarks: lintLayer,
      onSuggestionMarks: (on) => onSearch({ lint: on ? 1 : undefined }),
    },
    findings,
    versions: snap.versions,
    historyEntries: snap.history.versions,
    leases: snap.leases.filter((lease) => !sameAuthor(lease.holder, author)),
    onUndoTo: (entry) => {
      void controller.undoAfter(entry.n);
    },
    onSelectBlock: (blockId) =>
      controller.select(
        blockId === undefined || slide === undefined ? null : { slideId: slide.id, blockId },
      ),
    lintText,
    assetUrl: (path) => assetBase + path,
    createDitherWorker,
    busy: snap.conflict !== null,
    renderSlide: (record, renderTheme) =>
      renderSlide(deck, record, {
        theme: renderTheme,
        chrome: false,
        assetBase,
        blockAttrs: false,
        gtWord: true,
        live: true,
        active: true,
      }).html,
    paletteEntries,
    onNotice: controller.say,
    ...(slide !== undefined
      ? {
          notes: (
            <NotesPane
              slideId={slide.id}
              notes={slide.notes ?? ''}
              onCommit={(notes) => {
                const current = controller.getSnapshot();
                const target = current.document.slides[slide.id];
                if (!target || (target.notes ?? '') === notes) return;
                controller
                  .invoke('slide.update', {
                    slideId: slide.id,
                    baseRevision: current.document.deck.revision,
                    mutations: [
                      {
                        op: 'slide.set',
                        slideId: slide.id,
                        path: '/notes',
                        ...(notes === '' ? {} : { value: notes }),
                      },
                    ],
                  })
                  .catch((error: unknown) => controller.say(errorMessage(error)));
              }}
              height={notesHeight}
              onHeightChange={setNotesHeight}
              readOnly={!editing}
            />
          ),
        }
      : {}),
    ...(src && slide
      ? {
          drawer: (
            <SourceDrawer
              open
              slide={slide}
              revision={revision}
              dispatch={controller.invoke}
              onClose={() => onSearch({ src: undefined })}
              deckId={deckId}
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
          ),
        }
      : {}),
    export: {
      capabilities,
      progress: snap.artifact.progress,
      run: snap.artifact.run,
      onDownload: (run, file) => {
        void controller.downloadArtifact(run, file);
      },
      onClearRun: controller.clearArtifact,
      onShowReport: () => setReportOpen(true),
    },
    listDecks: () => listDecks(),
    readDeck: async (id) => {
      const read = await readSourceDeckSlides({ deckId: id });
      if (read === null) throw new RangeError(`No presentation named ${id}`);
      return read;
    },
    uploadBundle: uploadBundleFile,
    uploadPicture,
    origin: typeof window === 'undefined' ? '' : window.location.origin,
    tokenRequired,
    onLink: () => {
      if (handleRef.current) handleRef.current.link();
      else controller.say('Select a block first');
    },
    onPaintFormat: () => {
      const handle = handleRef.current;
      if (!handle) return;
      if (!handle.armPaint()) controller.say('Select a block with a look to copy first');
    },
    onDrawTool: (drawTool) => setTool(toEditorTool(drawTool)),
    present: {
      start: (fromBeginning) =>
        startSlideshow(presentHost, { from: fromBeginning ? 'beginning' : 'current' }),
      presenterView: () => presenterView(presentHost),
    },
    navigate: go,
    onTrashed: () => {
      void controller.reload();
    },
  };

  const sidebarEdit: SidebarEdit | undefined = editing
    ? {
        revision,
        dispatch: controller.invoke,
        onNotice: controller.say,
        deck,
        document: snap.document,
        deckId,
        snack: shellSay,
        undo: () => void controller.undo(),
        history: { undo: snap.history.canUndo, redo: snap.history.canRedo },
        onSelectionChange: setSelectedSlideIds,
        onMenuItem: (item) => shellApi.current?.runItem(item),
        onFocusCanvas: () => handleRef.current?.focus(),
        clipboard: clipboardStore,
      }
    : undefined;

  return (
    <div
      className="ts-editor"
      data-editing={editing ? '1' : '0'}
      data-status={status}
      {...(draft ? { 'data-draft': '' } : {})}
      {...scopeAttr}
    >
      <div
        className="ts-sprite"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: payload.sprite }}
      />
      <ViewerShell
        id={`edit:${deckId}`}
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
        sidebarEdit={sidebarEdit}
        editor={editorInput}
      >
        <ShellBridge controller={controller} editing={editing} api={shellApi} />
        <SessionBridge deckId={deckId} author={author} />
        <EditorStage
          controller={controller}
          snap={snap}
          viewerDeck={viewerDeck}
          editing={editing}
          twin={twin}
          lintLayer={lintLayer}
          findings={activeFindings}
          tool={tool}
          onToolDone={() => setTool('select')}
          onHandle={setEditorHandle}
          selectedSlideIds={selectedSlideIds}
          onSelectedSlideIds={setSelectedSlideIds}
        />
      </ViewerShell>
      {reportOpen && snap.artifact.run ? (
        <ExportReportCard
          run={snap.artifact.run}
          downloads={capabilities?.downloads ?? true}
          onDownload={(run, file) => {
            void controller.downloadArtifact(run, file);
          }}
          onClose={() => setReportOpen(false)}
        />
      ) : null}
      {snap.conflict ? <ConflictCard controller={controller} conflict={snap.conflict} /> : null}
      {trashed ? (
        <TrashedBanner deckId={deckId} controller={controller} />
      ) : snap.external ? (
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
 * in step, takes the lease while editing (enforced against agent writes from M4), warms the
 * thumbnails once the sidebar or the grid asks for them, registers the editor and viewer owners
 * on two marker elements whose data-active flags follow Editing and Viewing, so exactly one is
 * active and the handoff fires one ready event (SPEC 7.4), and captures the editor shell's
 * snackbar and runItem for the route, which renders outside the shell's context.
 */
function ShellBridge({
  controller,
  editing,
  api,
}: {
  controller: EditorController;
  editing: boolean;
  api: { current: EditorShellState | null };
}) {
  const shell = usePtShell();
  const editorShell = useEditorShell();
  const theme = useTheme();
  controller.attachShell(shell);
  api.current = editorShell;
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
  /* leaving the show leaves full screen too (SPEC 9.1: Esc leaves both) */
  useLayoutEffect(() => {
    if (!shell.present) exitPresentFullscreen();
  }, [shell.present]);
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
// The stage: the viewer's Editor in edit mode, the Stage otherwise, the slideshow, the twin view,
// the grid, the book, and the canvas and grid right-click menus

type EditorStageProps = {
  controller: EditorController;
  snap: EditorSnapshot;
  viewerDeck: ViewerDeck;
  editing: boolean;
  twin: boolean;
  lintLayer: boolean;
  findings: readonly Finding[];
  tool: EditorTool;
  onToolDone: () => void;
  onHandle: (handle: EditorHandle | null) => void;
  selectedSlideIds: readonly string[];
  onSelectedSlideIds: (ids: string[]) => void;
};

/** A right-click on a grid tile (SPEC 4.4): the card menu at the pointer. */
type GridMenu = { slideId: string; x: number; y: number; element: HTMLElement };

function EditorStage({
  controller,
  snap,
  viewerDeck,
  editing,
  twin,
  lintLayer,
  findings,
  tool,
  onToolDone,
  onHandle,
  selectedSlideIds,
  onSelectedSlideIds,
}: EditorStageProps) {
  const shell = usePtShell();
  const editorShell = useEditorShell();
  const { stageSize } = usePtStage();
  const theme = useTheme();
  const [canvasMenu, setCanvasMenu] = useState<EditorContextMenu | null>(null);
  const [gridMenu, setGridMenu] = useState<GridMenu | null>(null);
  const [tile, setTile] = useState<GridTileSize>(GRID_DEFAULT_TILE);
  const slide =
    viewerDeck.slides.find((entry) => entry.id === shell.active) ?? viewerDeck.slides[0];
  const record = snap.document.slides[shell.active];
  const showTwin = twin && shell.mode === 'slide' && !shell.present && slide !== undefined;
  const editStage =
    editing && shell.mode === 'slide' && !shell.present && !showTwin && slide !== undefined;
  const selectedBlock =
    snap.selection && slide && snap.selection.slideId === slide.id
      ? snap.selection.blockId
      : undefined;
  /* the show runs over the unskipped slides (SPEC 9.2); a click on the sheet steps through them */
  const play = useMemo(() => playList(viewerDeck.slides), [viewerDeck.slides]);
  const onStep = (delta: number) => {
    if (!shell.present) {
      shell.step(delta);
      return;
    }
    const at = currentPlayIndex(viewerDeck.slides, play, shell.active);
    const target = play[stepPlayIndex(at, delta, play.length)];
    if (target && target.id !== shell.active) shell.select(target.id);
  };
  const say = (text: string, hold?: number) => shell.say(text, hold);
  const undoAction: SnackbarAction = {
    label: SNACKBARS.undo,
    run: () => void controller.undo(),
  };
  const notice = (n: EditorNotice) => editorShell.say(n.text, n.undo ? undoAction : undefined);
  /* the layout grid inside the right-click menus' Apply layout submenu */
  const renderLayouts = (pick: (layout: LayoutId) => void) => (
    <div className="ts-layout-plate is-submenu">
      <LayoutGrid
        document={snap.document}
        slide={record}
        theme={deckAppearance(snap.document.deck)}
        render={editorShell.input.renderSlide}
        onPick={pick}
        onAddPicture={() =>
          editorShell.input.uploadPicture?.({
            kind: 'slide',
            slideId: shell.active,
            path: '/picture/asset',
          })
        }
        control="layout.apply"
      />
    </div>
  );
  const moveSlides = (ids: string[], target: { sectionId: string; after?: string }) => {
    void (async () => {
      let after = target.after;
      for (const id of ids) {
        try {
          await controller.invoke('slide.move', {
            slideId: id,
            sectionId: target.sectionId,
            ...(after === undefined ? {} : { after }),
            baseRevision: controller.getSnapshot().document.deck.revision,
          });
        } catch (error) {
          controller.say(errorMessage(error));
          return;
        }
        after = id;
      }
    })();
  };
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
          onRemoved={(block) => editorShell.say(`${deletedWord(block.type)} deleted`, undoAction)}
          zoom={snap.zoom}
          tool={tool}
          onToolDone={onToolDone}
          showIds={editorShell.settings.showIds === true}
          onContextMenu={setCanvasMenu}
          onNotice={notice}
          onUndo={() => void controller.undo()}
          onRedo={() => void controller.redo()}
          handle={onHandle}
          clipboard={clipboardStore}
          deckId={snap.deckId}
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
          onStep={onStep}
        />
      )}
      {shell.present ? (
        <Slideshow
          deckId={snap.deckId}
          slides={play}
          activeId={shell.active}
          theme={theme}
          onGoto={shell.select}
          onExit={() => shell.setPresent(false)}
          say={say}
        />
      ) : null}
      {shell.mode === 'grid' ? (
        <GridView
          deck={viewerDeck}
          active={shell.active}
          theme={theme}
          onSelect={(id) => {
            shell.setMode('slide');
            shell.select(id);
          }}
          {...(editing
            ? {
                edit: {
                  selected: selectedSlideIds,
                  onSelectionChange: onSelectedSlideIds,
                  onMove: moveSlides,
                  onContextMenu: (slideId, point, element) => {
                    if (!selectedSlideIds.includes(slideId)) onSelectedSlideIds([slideId]);
                    if (slideId !== shell.active) shell.select(slideId);
                    setGridMenu({ slideId, x: point.x, y: point.y, element });
                  },
                  onOpen: (id) => {
                    shell.setMode('slide');
                    shell.select(id);
                  },
                  tile,
                  onTile: setTile,
                  sections: editorShell.settings.sections === true,
                },
              }
            : {})}
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
          lead={`${viewerDeck.slides.length} slides in ${viewerDeck.sections.length} sections.`}
          meta={[
            { key: 'Sections', value: String(viewerDeck.sections.length) },
            { key: 'Slides', value: String(viewerDeck.slides.length) },
          ]}
        />
      ) : null}
      {canvasMenu ? (
        <ContextMenu
          target={canvasMenu.target}
          context={editorShell.menuContext}
          anchor={{ x: canvasMenu.x, y: canvasMenu.y }}
          returnFocusTo={canvasMenu.element}
          onSelect={(item) => {
            setCanvasMenu(null);
            editorShell.runItem(item, canvasMenu.element);
          }}
          onClose={() => setCanvasMenu(null)}
          label={contextMenuLabel(canvasMenu.target)}
          {...(record === undefined ? {} : { layout: derivedLayout(record) })}
          onLayout={(layout) => editorShell.pickLayout(layout, 'apply')}
          renderLayouts={renderLayouts}
          id="ts-menu-canvas"
        />
      ) : null}
      {gridMenu ? (
        <ContextMenu
          target="filmstripCard"
          context={editorShell.menuContext}
          anchor={{ x: gridMenu.x, y: gridMenu.y }}
          returnFocusTo={gridMenu.element}
          onSelect={(item) => {
            setGridMenu(null);
            editorShell.runItem(item, gridMenu.element);
          }}
          onClose={() => setGridMenu(null)}
          label={contextMenuLabel('filmstripCard')}
          {...(record === undefined ? {} : { layout: derivedLayout(record) })}
          onLayout={(layout) => editorShell.pickLayout(layout, 'apply')}
          renderLayouts={renderLayouts}
          id="ts-menu-grid"
        />
      ) : null}
    </>
  );
}

/**
 * The banner over a trashed presentation (gslides-parity SPEC 6.4): the editor is read only under
 * it; Restore runs deck.restore through the store and reloads the document.
 */
function TrashedBanner({ deckId, controller }: { deckId: string; controller: EditorController }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="ts-banner ts-chrome" role="status" data-state="trashed">
      <span>{HOME.inTrash.split(' · ')[0]}</span>
      <button
        type="button"
        className="pt-ib is-text"
        data-control="deck.restore"
        disabled={busy}
        {...tipProps({ name: HOME.restore, doc: 'Takes the presentation out of the trash' })}
        onClick={() => {
          setBusy(true);
          restoreStoredDeck({ deckId })
            .then(() => controller.reload())
            .catch((error: unknown) => controller.say(errorMessage(error)))
            .finally(() => setBusy(false));
        }}
      >
        <span className="pt-lb">{HOME.restore}</span>
      </button>
    </div>
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
    <div
      className="ts-conflict ts-chrome"
      role="dialog"
      aria-label="Conflict"
      data-state="conflict"
    >
      <div className="ts-conflict-head">
        <b>Conflict at r{conflict.currentRevision}</b>
        <span>{conflict.message}</span>
      </div>
      <p>
        {`${author} wrote ${conflict.since.length} revision${conflict.since.length === 1 ? '' : 's'} while ${pendingCount} local mutation${pendingCount === 1 ? '' : 's'} waited`}
        {conflict.overlap.length > 0 ? `; both touched ${conflict.overlap.join(', ')}.` : '.'}
      </p>
      {slideId ? (
        <div className="ts-conflict-both">
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
        <p className="ts-conflict-error">{`Rebase failed: ${conflict.error}`}</p>
      ) : null}
      <div className="ts-conflict-actions">
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
