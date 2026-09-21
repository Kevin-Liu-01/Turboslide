import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { useRouter } from '@tanstack/react-router';

import {
  SCOPE_ATTRIBUTE,
  registerStudioAutomation,
  studioAutomationForOwner,
} from '@turboslide/agent/window/registry';
import type { ExportCapabilities } from '@turboslide/chrome/ExportMenu';
import { ContextMenu, contextMenuLabel } from '@turboslide/chrome/ContextMenu';
import type { EditorDispatch } from '@turboslide/chrome/dispatch';
import type {
  CommentAnchorView,
  CommentBodyInput,
  DrawTool,
  EditorAccess,
  EditorAccount,
  EditorClipboard,
  EditorComments,
  EditorInbox,
  EditorMode,
  EditorPresence,
  EditorSelection,
  EditorShellInput,
  EditorSync,
  IdentityView,
  PictureTarget,
  ShellSettings,
} from '@turboslide/chrome/editor-shell';
import { useEditorShell } from '@turboslide/chrome/editor-shell-context';
import type { EditorShellState } from '@turboslide/chrome/editor-shell-context';
import { LayoutGrid } from '@turboslide/chrome/LayoutGrid';
import type { MenuContext } from '@turboslide/chrome/menus/model';
import { HOME, REFUSALS, SNACKBARS } from '@turboslide/chrome/menus/strings';
import { NOTES_DEFAULT_HEIGHT, NotesPane } from '@turboslide/chrome/NotesPane';
import type { SidebarEdit } from '@turboslide/chrome/Sidebar';
import type { SnackbarAction } from '@turboslide/chrome/Snackbar';
import { tipProps } from '@turboslide/chrome/Tooltip';
import { ExportReportCard } from '@turboslide/chrome/ExportReportCard';
import type { DitherWorkerLike } from '@turboslide/chrome/inspector/dither';
import { chartFormatSlot } from '@turboslide/chrome/inspector/chart';
import { tableFormatSlot } from '@turboslide/chrome/inspector/table';
import { Overlay } from '@turboslide/chrome/Overlay';
import { buildPaletteEntries } from '@turboslide/chrome/palette-data';
import type { PaletteEntry } from '@turboslide/chrome/palette-data';
import { usePtShell, usePtStage } from '@turboslide/chrome/shell-context';
import type { ShellItem, ShellMode, ShellSection } from '@turboslide/chrome/shell-data';
import { SourceDrawer } from '@turboslide/chrome/SourceDrawer';
import type { SourceOwnerApi } from '@turboslide/chrome/SourceDrawer';
import type { SaveState } from '@turboslide/chrome/StatusChip';
import { TwinStage } from '@turboslide/chrome/TwinStage';
import { ViewerShell } from '@turboslide/chrome/ViewerShell';
import { labelFor } from '@turboslide/identity/labels';
import { lintStatic } from '@turboslide/lint/lint-static';
import { renderSlide } from '@turboslide/render/slide';
import { bandAssetResolver, frameBandOf } from '@turboslide/render/stage';
import { PRINCIPAL_ID_PATTERN } from '@turboslide/schema/comments';
import type { CommentAnchor, CommentBody } from '@turboslide/schema/comments';
import { SHAPE_KINDS } from '@turboslide/schema/blocks';
import { deckAppearance, isTrashed, unskippedSlideOrder } from '@turboslide/schema/deck';
import type { LayoutId } from '@turboslide/schema/layouts';
import { derivedLayout } from '@turboslide/schema/layouts';
import type { Slide } from '@turboslide/schema/deck';
import type { Finding } from '@turboslide/schema/findings';
import { parseAuthor } from '@turboslide/schema/mutations';
import type { Author, Lease } from '@turboslide/schema/mutations';
import { applyMutations } from '@turboslide/schema/reduce';
import { authorDisplay, sameAuthor } from '@turboslide/store/store';
import { SHEET } from '@turboslide/theme/tokens';
import { BookView } from '@turboslide/viewer/BookView';
import { clipboardStore, pastedSlideInserts } from '@turboslide/viewer/clipboard';
import { Editor as StageEditor } from '@turboslide/viewer/Editor';
import type {
  EditorContextMenu,
  EditorHandle,
  EditorMenuSelection,
  EditorNotice,
} from '@turboslide/viewer/Editor';
import type { EditorTool } from '@turboslide/viewer/Gestures';
import type { CaretInfo } from '@turboslide/viewer/InlineText';
import { GRID_DEFAULT_TILE, GridView } from '@turboslide/viewer/GridView';
import type { GridTileSize } from '@turboslide/viewer/GridView';
import { pad2, trimTitle } from '@turboslide/viewer/model';
import type { ViewerDeck } from '@turboslide/viewer/model';
import { currentPlayIndex, playList, stepPlayIndex } from '@turboslide/viewer/present/presentModel';
import type { Selection as StageSelection } from '@turboslide/viewer/Selection';
import { blockFamily, cellPointer, listItemPointer } from '@turboslide/viewer/Selection';
import { Stage } from '@turboslide/viewer/Stage';
import { applyTheme, installThemeBridge, useTheme } from '@turboslide/viewer/theme';

import {
  presenterView,
  requestPresentFullscreen,
  startSlideshow,
} from '../components/presentActions';
import type { PresentHost } from '../components/presentActions';
import { Slideshow } from '../components/Slideshow';
import { useMountEffect } from '../components/useMountEffect';
import { bundleDownloadTicket, bundleUploadTicket, connectFacts } from '../server/bundle';
import { listDecks, readSourceDeckSlides, restoreStoredDeck } from '../server/decks';
import { exportCapabilities } from '../server/download';
import { rememberLinkUrl } from '@turboslide/chrome/dialogs/share-links';
import { DECK_CREATED_EVENT, holdDraft } from '../server/write';
import type { DeckCreatedDetail, EditorDeck, EditorIdentity } from '../server/write';
import { RouterLinkSlot } from '../routes/-link-slot';
import { recordDeckOpened } from '../routes/-recent';
import type { DeckOpenFacts } from '../routes/-recent';
import {
  ASSET_BASE,
  createEditorController,
  errorMessage,
  identityView,
  lintLists,
  participantOf,
  slideOrder,
  toViewerDeck,
  triggerDownload,
} from './controller';
import type {
  EditorController,
  EditorSnapshot,
  External,
  RejectNotice,
  Selection,
} from './controller';
import type { EditSearch } from '../routes/-edit-search';
import { partitionRoster } from './client-ids';
import { SessionBridge, ShellBridge, isPrerendering, whenShown } from './shell-bridge';

/* the route's own CSS travels with the editor since round four day 2 (the banners, the owner
   markers, the twin overlay, the conflict card): a document that never mounts the editor never
   loads it (gslides-parity SPEC-4 0.44) */
import '../routes/edit.$deckId.css';

// The editor page, moved verbatim from routes/edit.$deckId.tsx in the round four split
// (gslides-parity SPEC-4 0.44; PP 7 row 1). The route imports EditorRoot inside its component so
// the editor's graph leaves the entry; the controller is ./controller.tsx (B4's from merge 1)
// and the shell glue ./shell-bridge.tsx.

const MODES: readonly ShellMode[] = ['slide', 'grid', 'book'];

/**
 * The author of a browser session before the server has named one (a draft with no identity in
 * its payload): the round one word. Since round three the author is derived from the session on
 * the server (gslides-parity SPEC-3 0.17) and the page shows the identity the payload carries;
 * `?author=` in the address is accepted and ignored.
 */
const DEFAULT_AUTHOR = 'studio';

/** The author a page writes as, from the identity the server derived (SPEC-3 0.17, 7.8). */
export function authorOfIdentity(identity: EditorIdentity | undefined): Author {
  if (identity === undefined) return parseAuthor(DEFAULT_AUTHOR);
  return {
    kind: identity.kind === 'agent' ? 'agent' : 'human',
    name: identity.name ?? identity.label,
    principalId: identity.principalId,
  };
}

/** The dither preview worker of the inspector's Dither section (SPEC 6.5; workers/dither.worker.ts). */
const createDitherWorker = (): DitherWorkerLike =>
  new Worker(new URL('../workers/dither.worker.ts', import.meta.url), {
    type: 'module',
  }) as DitherWorkerLike;

/** The card's anchor as the server stores it (SPEC-3 5.1): the quote of a text anchor is filled by the server when empty. */
function anchorOfView(view: CommentAnchorView): CommentAnchor {
  const slideId = view.slideId ?? '';
  const blockId = view.blockId ?? '';
  switch (view.kind) {
    case 'deck':
      return { kind: 'deck' };
    case 'slide':
      return { kind: 'slide', slideId };
    case 'notes':
      return { kind: 'notes', slideId };
    case 'block':
      return { kind: 'block', slideId, blockId };
    case 'cell':
      return {
        kind: 'cell',
        slideId,
        blockId,
        cell: [view.cell?.row ?? 0, view.cell?.column ?? 0],
      };
    case 'text':
      return {
        kind: 'text',
        slideId,
        blockId,
        path: view.path ?? '/text',
        range: view.range ?? [0, 0],
        quoted: view.quote ?? '',
      };
  }
}

/** The card's body as the server stores it (SPEC-3 5.4): mention ids become principal or invitation mentions in token order. */
function bodyOfInput(body: CommentBodyInput): CommentBody {
  return {
    text: body.text,
    mentions: (body.mentions ?? []).map((id) =>
      PRINCIPAL_ID_PATTERN.test(id)
        ? { kind: 'principal' as const, principalId: id }
        : { kind: 'invite' as const, inviteId: id },
    ),
  };
}

/**
 * One call of better-auth's routes (SPEC-3 7.3; B3's `/api/auth/$`): the magic link mail with
 * its six digit code, the code exchange, sign out and the GitHub redirect. Same origin, JSON, the
 * library's own cookies; a refusal's sentence is the dialog's error row.
 */
async function authPost(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`/api/auth/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
  });
  if (!response.ok) {
    let message = `Sign in did not complete (${response.status})`;
    try {
      const data = (await response.json()) as {
        message?: string;
        error?: { message?: string } | string;
      };
      message =
        data.message ??
        (typeof data.error === 'string' ? data.error : data.error?.message) ??
        message;
    } catch {
      // no body
    }
    throw new Error(message);
  }
  return response.json().catch(() => null);
}

/** The address the sign in mail's link and the GitHub callback return to: this deck, no token. */
function signInReturnAddress(): string {
  return `${window.location.origin}${window.location.pathname}${window.location.search}`;
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
 * The route's selection in the shell's words (gslides-parity SPEC 3.2 to 3.8; SPEC-2 seams): the
 * block, whether the caret is in one of its runs, the table cell or the list item the run pointer
 * names, and the canvas facts the stage reads about the selection (`menuSelection()`, B4): the
 * selected ids, the shared group, the caret's marks and range, whether every block carries a pos,
 * whether the slide is a canvas, a covering picture, an edited picture, a nested block.
 */
function toShellSelection(
  selection: Selection | null,
  facts: EditorMenuSelection | null,
): EditorSelection | null {
  if (selection === null) return null;
  const pointer = selection.pointer;
  const cell = pointer === undefined ? null : cellPointer(pointer);
  const item = pointer === undefined ? null : listItemPointer(pointer);
  const base: EditorSelection = {
    blockId: selection.blockId,
    text: pointer !== undefined,
    ...(cell === null ? {} : { cell: { row: cell.row, column: cell.col } }),
    ...(item === null ? {} : { listItem: true }),
  };
  if (facts === null || facts.blocks === 0) return base;
  return {
    ...base,
    ...(facts.blockIds.length > 1 ? { blockIds: facts.blockIds } : {}),
    ...(facts.group !== undefined ? { group: facts.group } : {}),
    ...(facts.marks !== undefined ? { marks: facts.marks } : {}),
    ...(facts.range !== undefined ? { range: facts.range } : {}),
    /* the cell range of the selected table (viewer table-range.ts; docs/RETURN.md 2.4): the
       Merge cells rows and the table plans read it as `cells` */
    ...(facts.cells !== undefined ? { cells: facts.cells } : {}),
    ...(facts.listLevel !== undefined ? { listLevel: facts.listLevel } : {}),
    imageEdited: facts.imageEdited,
    positioned: facts.positioned,
    coversSheet: facts.coversSheet,
    canvas: facts.canvas,
    nested: !facts.object,
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

/**
 * The toolbar's draw tool (the shell's words) as the stage's (Gestures.tsx EditorTool; SPEC-2
 * 6.2): the two types share every kind, so the tool passes through; a shape id the schema does
 * not know falls back to Select rather than arming a tool the stage cannot draw.
 */
function toEditorTool(tool: DrawTool): EditorTool {
  switch (tool.kind) {
    case 'text':
      return { kind: 'text' };
    case 'shape':
      return SHAPE_KINDS.includes(tool.shape) ? { kind: 'shape', shape: tool.shape } : 'select';
    case 'line':
      return { kind: 'line', line: tool.line };
    case 'table':
      return { kind: 'table', columns: tool.columns, rows: tool.rows };
    case 'chart':
      return { kind: 'chart', chart: tool.chart };
    case 'wordArt':
      return { kind: 'wordArt', text: tool.text };
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
/**
 * The facts the Recent record keeps of the open deck (routes/-recent.ts; gslides-parity SPEC-4
 * 0.29): the title, the appearance, the first slide id and the revision, read from the document
 * the editor holds so the /decks Recent row draws the card without the store.
 */
function openFactsOf(document: EditorDeck['document']): DeckOpenFacts {
  const first = document.deck.sections.flatMap((section) => section.slideIds)[0];
  return {
    title: document.deck.title,
    appearance: deckAppearance(document.deck),
    firstSlide: first ?? null,
    revision: document.deck.revision,
  };
}

/** The Slideshow arrow of the title row (TitleRow.tsx): a pointer over it preloads the presenter route. */
const PRESENT_ARROW = '[data-control="present.arrow"]';

export function EditorRoot({ payload, search, author, onSearch, onDeckCreated }: EditorRootProps) {
  const router = useRouter();
  const [controller] = useState(() =>
    createEditorController({
      deckId: payload.deckId,
      author,
      payload,
      onDeckCreated,
      ...(search.comment !== undefined ? { initialThread: search.comment } : {}),
    }),
  );
  const [capabilities, setCapabilities] = useState<ExportCapabilities | null>(null);
  /* View > Mode for an editor (SPEC-3 5.3): Editing or Commenting; Viewing is the `?edit=0` flag */
  const [chosenMode, setChosenMode] = useState<'editing' | 'commenting'>('editing');
  /* Extensions > Agent access: whether the deployment asks for TURBOSLIDE_TOKEN */
  const [tokenRequired, setTokenRequired] = useState(true);
  /* the report card, from the Download dialog's Details link and nowhere else (SPEC 6.7) */
  const [reportOpen, setReportOpen] = useState(false);
  /* the shell's stored settings as it reports them (docs/FOCUS.md 3.1): Tools > Advanced tools
     reaches the palette's Insert group here and the window API through the controller */
  const [shellSettings, setShellSettings] = useState<ShellSettings>({});
  const snap = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const theme = useTheme();
  /* a trashed presentation is read only under its banner (SPEC 6.4); a viewer role too (SPEC-3 6.3) */
  const trashed = isTrashed(snap.document.deck);
  const editing = search.edit !== 0 && !trashed && snap.access.role !== 'viewer';
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
  /* the tab title follows the deck's title on both routes (docs/FOCUS.md rank 28: the /new route's
     head is static and a rename left "Untitled presentation" in the tab until a reload; the second
     browser's tab kept the old name after a rename); the route's head sets the same words at the
     first paint and this keeps them true afterwards */
  const deckTitle = snap.document.deck.title;
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const next = `${deckTitle}, editor, Turboslide`;
    if (document.title !== next) document.title = next;
  }, [deckTitle]);
  /* the caret's marks and range inside a run (the toolbar's pressed state and Format options' Text
     colour), reported by the stage; a state so the shell re-reads the selection facts on change */
  const [caret, setCaret] = useState<CaretInfo | null>(null);
  useEffect(() => {
    controller.noteInlineSession(caret !== null);
  }, [controller, caret]);
  /* the stage's selection beyond the anchor (B4's onMultiSelectionChange): a Shift click, a
     marquee or Select all changes it while the route's selection keeps the anchor, so it is a
     change signal of its own for the facts the menus read */
  const [multiSelection, setMultiSelection] = useState<readonly string[]>([]);
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
    // a draft stays the same draft while this editor holds it (server/write.ts holdDraft): the
    // loader of /new reruns on every search change and would otherwise mint another
    const releaseDraft = payload.draft === true ? holdDraft(payload.deckId) : () => undefined;
    // a /new document Chrome prerenders from /home's speculation rules (gslides-parity SPEC-4
    // 0.42) renders but must not attach: the room stream starts when the page is shown
    // (prerenderingchange); a document that is not prerendering starts at once
    const stopWaiting = whenShown(() => controller.start());
    if (payload.draft !== true) recordDeckOpened(payload.deckId, openFactsOf(payload.document));
    // the presenter's chunk and loader are in the cache before window.open (SPEC-4 0.36; PP 3.7):
    // the arrow is the chrome's, so the pointer is read at the document and the route preloaded
    // once per page
    let presenterPreloaded = false;
    const onPointerOver = (event: PointerEvent) => {
      if (presenterPreloaded || isPrerendering()) return;
      const target = event.target;
      if (!(target instanceof Element) || target.closest(PRESENT_ARROW) === null) return;
      presenterPreloaded = true;
      void router
        .preloadRoute({ to: '/present/$deckId', params: { deckId: payload.deckId } })
        .catch(() => undefined);
    };
    document.addEventListener('pointerover', onPointerOver, { passive: true });
    exportCapabilities()
      .then((caps) => {
        controller.setExportSync(caps.sync, caps.batchSize);
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
      /* the general link minted with the record, remembered under its id (b7.md FR1), so the
         Share dialog's field holds the address at its first open and Copy link copies it */
      if (detail.link !== undefined)
        rememberLinkUrl(
          detail.deckId,
          detail.link.id,
          `${window.location.origin}/s/${detail.link.token}`,
        );
      recordDeckOpened(detail.deckId, {
        ...openFactsOf(controller.getSnapshot().document),
        revision: detail.revision,
      });
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
      document.removeEventListener('pointerover', onPointerOver);
      stopWaiting();
      stopBridge();
      controller.stop();
      releaseDraft();
    };
  });

  const viewerDeck = useMemo(
    () => toViewerDeck(snap, draft),
    [snap.document, snap.html, snap.deckId, draft],
  );
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
  /* the revision every chrome write bases on: the one the controller reports and checks against
     (`reportedRevision`, SPEC-3 3.10), never the document's alone. On the blob tier an ops POST
     answer moves the confirmed revision at once while the document's moves with the checkpoint
     frame from the stream's instance, seconds later; a write based on the document's in that
     window was refused as stale by the tab itself (hotfix 2 cause A5). */
  const revision = Math.max(deck.revision, snap.serverRevision);
  const selection =
    snap.selection && snap.selection.slideId === snap.activeSlide ? snap.selection : null;

  /* the save words (SPEC-3 3.6): Saving… while anything is pending or retained, the retry word
     while the wire is down; a reject notice is the one conflict state left */
  const status: SaveState =
    snap.rejects.length > 0
      ? 'conflict'
      : snap.sync?.offline === true
        ? 'unsaved'
        : snap.pending > 0
          ? 'unsaved'
          : 'saved';
  /* the caller's standing, from the loader and again on every access event of the stream */
  const roleOf = snap.access.role ?? undefined;
  const roleCapabilities = snap.access.capabilities;
  const overCeiling = snap.sync?.overCeiling === true;
  /* the role shaped editor (SPEC-3 6.3, 0.9): a viewer and a tab over the editing ceiling open in
     Viewing mode, a commenter in Commenting mode; an editor's mode is the chrome's own setting */
  const forcedMode: EditorMode | undefined =
    roleOf === 'viewer' || overCeiling
      ? 'viewing'
      : roleOf === 'commenter'
        ? 'commenting'
        : undefined;
  /* View > Mode as the shell shows it (SPEC-3 5.3): the role's mode, else Viewing under the
     round one flag, else the editor's own choice; the root's data-edit-mode gates the stage */
  const effectiveMode: EditorMode = forcedMode ?? (editing ? chosenMode : 'viewing');
  const canWrite = effectiveMode === 'editing';
  /* View > Mode's rows (EditorHandle.setMode): Viewing is the address's flag, so a reload keeps
     it; Commenting is this page's state; a change never remounts the editor (VERIFICATION-3
     finding 2) */
  const setChromeMode = (mode: EditorMode): void => {
    if (mode === 'viewing') {
      setChosenMode('editing');
      if (search.edit !== 0) onSearch({ edit: 0 });
      return;
    }
    setChosenMode(mode);
    if (search.edit === 0) onSearch({ edit: undefined });
  };
  /* the leave warning while operations are pending (SPEC-3 0.7, 3.6), and the presence leave on
     the way out (hotfix 2 cause B1): a reload or a navigation fires `pagehide` and nothing else
     that the room client sees, so the controller stops there and the room client posts the leave
     with keepalive; a page the browser restores from its cache afterwards reloads, since its
     stream and its client id are gone */
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const current = controller.getSnapshot();
      if ((current.sync?.pending ?? current.pending) > 0) {
        event.preventDefault();
        event.returnValue = REFUSALS.leaveAnyway;
      }
    };
    const onPageHide = () => controller.stop();
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [controller]);
  /* the tab's presence (SPEC-3 3.8): the slide, the selection and the caret, coalesced by the room client */
  useEffect(() => {
    const blockIds =
      selection === null
        ? []
        : [selection.blockId, ...multiSelection.filter((id) => id !== selection.blockId)];
    controller.reportPresence({
      slideId: snap.activeSlide,
      selection: {
        blockIds: blockIds.slice(0, 64),
        ...(selection !== null && selection.pointer !== undefined && caret !== null
          ? {
              caret: {
                blockId: selection.blockId,
                path: `/${selection.pointer}`,
                range: caret.range,
              },
            }
          : {}),
      },
      presenting: snap.view.present,
    });
  }, [controller, snap.activeSlide, selection, multiSelection, caret, snap.view.present]);
  const now = new Date().toISOString();
  const ownClientId = snap.sync?.clientId ?? null;
  const rosterRows = useMemo(
    () => snap.roster.map((entry) => participantOf(entry, now)),
    [snap.roster],
  );
  /* this tab is every id it was issued (hotfix 2 cause B3), so a roster row of its earlier id after
     a reload or a remount is never a chip, a mark, an outline, a caret or a roster row */
  const { self: ownRow, others: otherRows } = useMemo(
    () => partitionRoster(rosterRows, new Set(snap.ownClientIds), ownClientId),
    [rosterRows, snap.ownClientIds, ownClientId],
  );
  const presence: EditorPresence = {
    ...(ownRow !== null ? { self: ownRow } : {}),
    others: otherRows,
    cap: 20,
    /* View > Live pointers > Show collaborator pointers (SPEC-3 4.6): the controller's setting */
    pointersVisible: snap.pointersVisible,
    pointerMine: snap.pointerOn,
    following: snap.following,
    showNames: snap.access.record?.settings.showNamesToLinkVisitors ?? false,
    ...(payload.room !== undefined ? { tier: payload.room.tier } : {}),
    onFollow: (clientId) => controller.followClient(clientId),
    onUnfollow: () => controller.unfollow(),
    onGoTo: (clientId) => controller.goToClient(clientId),
    onPointer: (on) => controller.setPointerOn(on),
    onPointerOthers: (on) => controller.setPointersVisible(on),
  };
  const sync: EditorSync = {
    seq: snap.sync?.seq ?? payload.room?.seq ?? 0,
    revision: snap.serverRevision,
    pending: snap.sync?.pending ?? snap.pending,
    retained: snap.sync?.retained ?? 0,
    tier: snap.sync?.tier ?? payload.room?.tier ?? 'memory',
    transport: snap.sync === null ? 'none' : 'sse',
    connected: snap.sync?.connected ?? false,
    offline: snap.sync?.offline ?? false,
    storeDegraded: snap.sync?.storeDegraded ?? false,
    streamDown: snap.sync?.streamDown ?? false,
    ...(snap.persisted !== null
      ? {
          persisted: {
            count: snap.persisted.count,
            onApply: () => void snap.persisted?.apply(),
            onDiscard: () => void snap.persisted?.discard(),
          },
        }
      : {}),
  };
  const selfIdentity = identityView(payload.identity, author);
  /* the deployment's sign in facts (SPEC-3 7.3): the row exists when a database is configured;
     the dialog's exchanges run over better-auth's own routes and the page reloads with the
     account's identity once one lands (B2 R19; VERIFICATION-3 finding 9) */
  const auth = payload.auth;
  const account: EditorAccount = {
    principal: selfIdentity,
    signedIn: payload.identity?.kind === 'account',
    signInAvailable: auth?.signIn ?? false,
    passkeysAvailable: auth?.passkeys ?? false,
    githubAvailable: auth?.github ?? false,
    namePrompt: {
      open: snap.namePrompt,
      prefilled: payload.identity?.name ?? payload.identity?.label ?? author.name,
    },
    onNamePrompt: (open) => controller.promptName(open),
    setName: (name) =>
      controller.invoke('account.setName', { name }).then((answer) => {
        /* the chip in the other browsers inside the matrix's 5 s (b1.md R18) */
        controller.refreshPresence();
        return answer;
      }),
    setAvatar: (choice) =>
      controller.invoke('account.setAvatar', {
        variant: choice.variant,
        ...(choice.initials !== undefined ? { initials: choice.initials } : {}),
        ...(choice.salt !== undefined ? { salt: Number(choice.salt) } : {}),
      }),
    forget: () => controller.invoke('account.forget', {}),
    ...(auth?.email === true
      ? {
          requestCode: (email) =>
            authPost('sign-in/magic-link', { email, callbackURL: signInReturnAddress() }),
          verifyCode: async (email, code) => {
            await authPost('sign-in/email-otp', { email, otp: code });
            window.location.reload();
          },
        }
      : {}),
    ...(auth?.github === true
      ? {
          github: () => {
            void authPost('sign-in/social', {
              provider: 'github',
              callbackURL: signInReturnAddress(),
            })
              .then((answer) => {
                const url = (answer as { url?: string } | null)?.url;
                if (typeof url === 'string') window.location.assign(url);
              })
              .catch((error: unknown) => controller.say(errorMessage(error)));
          },
        }
      : {}),
    ...(payload.identity?.kind === 'account'
      ? {
          signOut: async (sessionId) => {
            if (sessionId === undefined) {
              await authPost('sign-out', {});
              window.location.reload();
              return null;
            }
            return controller.invoke(
              'account.signOut',
              sessionId === 'all' ? { all: true } : { sessionId },
            );
          },
        }
      : {}),
  };
  const record = snap.access.record ?? undefined;
  const access: EditorAccess | undefined =
    record === undefined
      ? undefined
      : {
          revision: record.revision,
          owner:
            record.owner === null
              ? null
              : {
                  principalId: record.owner,
                  label: labelFor(record.owner),
                  trust: record.owner.startsWith('usr_') ? 'verified' : 'label',
                  kind: record.owner.startsWith('usr_') ? 'account' : 'anonymous',
                },
          pendingOwner:
            record.pendingOwner === null || record.pendingOwner.principalId === null
              ? null
              : {
                  principalId: record.pendingOwner.principalId,
                  label: labelFor(record.pendingOwner.principalId),
                  trust: 'verified',
                  kind: 'account',
                },
          generalAccess: record.generalAccess,
          grants: record.grants.map((grant) => ({
            ...(grant.principalId !== null
              ? {
                  principal: {
                    principalId: grant.principalId,
                    label: labelFor(grant.principalId),
                    trust: grant.principalId.startsWith('usr_')
                      ? ('verified' as const)
                      : ('label' as const),
                    kind: grant.principalId.startsWith('usr_')
                      ? ('account' as const)
                      : ('anonymous' as const),
                  },
                }
              : {}),
            ...(grant.email !== null ? { email: grant.email } : {}),
            role: grant.role,
            invitedAt: grant.invitedAt,
            ...(grant.acceptedAt !== null ? { acceptedAt: grant.acceptedAt } : {}),
            expiresAt: grant.expiresAt,
            status:
              grant.acceptedAt === null
                ? ('pending' as const)
                : grant.expiresAt !== null && Date.parse(grant.expiresAt) < Date.now()
                  ? ('expired' as const)
                  : ('active' as const),
          })),
          links: record.links
            .filter((link) => link.revokedAt === null)
            .map((link) => ({
              id: link.id,
              role: link.role,
              ...(link.label !== undefined ? { label: link.label } : {}),
              createdAt: link.createdAt,
              expiresAt: link.expiresAt,
              revokedAt: link.revokedAt,
              ...(link.useCount !== undefined ? { useCount: link.useCount } : {}),
            })),
          requests: record.requests
            .filter((request) => request.respondedAt === null)
            .map((request) => ({
              id: request.id,
              ...(request.principalId !== null
                ? {
                    principal: {
                      principalId: request.principalId,
                      label: labelFor(request.principalId),
                      trust: 'label' as const,
                      kind: 'anonymous' as const,
                    },
                  }
                : {}),
              ...(request.email !== null ? { email: request.email } : {}),
              role: request.role,
              ...(request.message !== undefined ? { message: request.message } : {}),
              askedAt: request.askedAt,
            })),
          settings: record.settings,
          published: null,
          claimable: record.owner === null && payload.identity?.kind === 'account',
          ...(payload.via !== undefined ? { via: payload.via } : {}),
        };

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
      advancedTools: shellSettings.advancedTools === true,
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
    shellSettings.advancedTools,
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
    if (action === 'account.forget' && shellApi.current) {
      // the own chip's row asks first with ACCOUNT.forgetConfirm (SPEC-3 7.4); Forget in the
      // dialog runs the action through EditorAccount.forget
      shellApi.current.openDialog('forgetBrowser');
      return Promise.resolve({ asked: true });
    }
    if (action === 'deck.pack') {
      /* the bundle is saved from the page's own fetch of the ticket url (controller.tsx
         triggerDownload): a refused ticket rejects with the server's sentence and the shell says
         it instead of "The bundle is at" */
      return bundleDownloadTicket({ deckId }).then(async ({ url }) => {
        await triggerDownload(url);
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
  /* the selected cards leave in one write of one slide.remove per slide (one revision, one
     history entry, so Edit > Undo brings them all back; gslides-parity SPEC-2 8.6), through the
     editor's commit; Delete says so with Undo, Cut says nothing, as Google's Cut does not (SPEC-2
     0.30) */
  const removeSlides = (ids: readonly string[], options: { quiet?: boolean } = {}): void => {
    const ordered = slideOrder(snap.document).filter((id) => ids.includes(id));
    if (ordered.length === 0) return;
    void controller
      .commit(
        ordered.map((id) => ({ op: 'slide.remove' as const, slideId: id })),
        'slide.remove',
      )
      .catch((error: unknown) => shellSay(errorMessage(error)));
    if (options.quiet === true) return;
    const count = ordered.length;
    shellSay(count === 1 ? SNACKBARS.slideDeleted : SNACKBARS.slidesDeleted(count), {
      label: SNACKBARS.undo,
      run: () => void controller.undo(),
    });
  };
  /* slides after the last selected card (slide.import when they come from another deck, so the
     assets travel); anything else is the canvas's paste onto the current slide */
  const pasteSlidesOrCanvas = async (plain: boolean): Promise<void> => {
    const clip = await clipboardStore.read();
    if (clip === null) return;
    if (clip.kind !== 'slides') {
      await editorHandle?.paste({ plain });
      return;
    }
    const after = liveSlideIds[liveSlideIds.length - 1] ?? snap.activeSlide;
    if (clip.deckId !== deckId && clip.deckId !== '') {
      await shellDispatch('slide.import', {
        sourceDeckId: clip.deckId,
        slideIds: clip.slides.map((row) => row.id),
        ...(after !== '' ? { after } : {}),
        baseRevision: revision,
      });
      return;
    }
    let base = revision;
    for (const input of pastedSlideInserts(
      snap.document.deck,
      clip,
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
          cut: () => void copySlides().then(() => removeSlides(liveSlideIds, { quiet: true })),
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
      if (target.kind === 'background') {
        /* Change background > Choose image (SPEC-2 2.6.4): the picture object at the bottom of
           the stack, the slide converted first; the handle's asset.add then insertObject */
        handle
          .insertPicture(file, { background: true })
          .catch((error: unknown) => controller.say(errorMessage(error)));
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

  /* the stage's facts about the selection (B4's menuSelection): the route's selection, the
     stage's multi selection, the caret the stage reports and the document are the states that
     change them; the stage reads them through its refs, so they are listed as change signals */
  const selectionFacts = useMemo<EditorMenuSelection | null>(
    () => (editorHandle !== null && selection !== null ? editorHandle.menuSelection() : null),
    [editorHandle, selection, multiSelection, caret, snap.document],
  );
  /* the selected objects' boxes in sheet px, for Size & rotation and Position on a slide nothing
     converted yet (SPEC-2 section 5 row 1; the stage measures them, the first edit converts) */
  const measuredBoxes =
    editorHandle !== null && selection !== null
      ? Object.fromEntries(
          editorHandle
            .positions()
            .map(({ id, pos }) => [id, { x: pos.x, y: pos.y, w: pos.w, h: pos.h }]),
        )
      : undefined;
  /* the stage's handle in the shell's words (SPEC-2 seams): the same object, plus the Background
     dialog's Choose landing the picture object at the bottom of the stack */
  const shellEditor: EditorShellInput['editor'] = {
    ...(editorHandle === null
      ? {}
      : {
          ...editorHandle,
          insertBackgroundPicture: (asset) =>
            editorHandle.insertObject({ id: 'picture', type: 'picture', asset }, { bottom: true }),
        }),
    /* View > Mode and comment.link's target are the route's, whatever the stage shows (SPEC-3 5.3, 5.9) */
    setMode: setChromeMode,
    openComment: (threadId) => controller.openComment(threadId),
  };
  /* the comments and the inbox as the chrome reads them (SPEC-3 5.3, 5.5; VERIFICATION-3
     finding 1): the sidecar for a role with readComments, the writes for one with comment; a
     draft's creator holds both until the loader names a role */
  const canReadComments = payload.draft === true || roleCapabilities.includes('readComments');
  const canComment = payload.draft === true || roleCapabilities.includes('comment');
  const threadViews = snap.comments.loaded ? controller.threadViews() : [];
  const mentionables = useMemo<IdentityView[]>(() => {
    const seen = new Map<string, IdentityView>();
    for (const row of rosterRows) seen.set(row.principalId, row);
    seen.set(selfIdentity.principalId, selfIdentity);
    for (const thread of threadViews) {
      for (const comment of [thread.comment, ...thread.replies]) {
        if (!seen.has(comment.author.principalId))
          seen.set(comment.author.principalId, comment.author);
      }
    }
    return [...seen.values()];
  }, [rosterRows, selfIdentity.principalId, threadViews]);
  /* a viewer or a commenter whose role holds readComments takes the editing stage too, in the
     role's forced mode (Viewing or Commenting, SPEC-3 5.3): the comment markers mount inside the
     stage's overlay, and the plain Stage has none (docs/FOCUS.md `comments.reaches-second-browser`
     for a second browser on a view link; b6.md R10) */
  const readsComments =
    !trashed &&
    search.edit !== 0 &&
    payload.draft !== true &&
    roleCapabilities.includes('readComments');
  const comments: EditorComments | undefined = canReadComments
    ? {
        threads: threadViews,
        revision: snap.comments.revision,
        display: snap.comments.display,
        onDisplay: (display) => controller.setCommentsDisplay(display),
        openThreadId: snap.comments.openThreadId,
        onOpen: (threadId) => controller.openComment(threadId),
        mentionables,
        link: (threadId) =>
          controller.invoke('comment.link', { threadId }) as Promise<{
            url: string;
            viewUrl?: string;
          }>,
        ...(canComment
          ? {
              add: (input) =>
                controller.roomAction('comment.add', {
                  anchor: anchorOfView(input.anchor),
                  body: bodyOfInput(input.body),
                  ...(input.assignee !== undefined && input.assignee !== null
                    ? { assignee: { kind: 'principal', principalId: input.assignee } }
                    : {}),
                }),
              reply: (threadId, body) =>
                controller.roomAction('comment.reply', { threadId, body: bodyOfInput(body) }),
              edit: (threadId, commentId, body) =>
                controller.roomAction('comment.edit', {
                  threadId,
                  commentId,
                  body: bodyOfInput(body),
                  expectedUpdatedAt:
                    snap.comments.threads.find((thread) => thread.id === threadId)?.updatedAt ??
                    new Date(0).toISOString(),
                }),
              remove: (threadId, commentId, restore) =>
                controller.roomAction('comment.delete', {
                  threadId,
                  commentId,
                  ...(restore === true ? { restore: true } : {}),
                }),
              resolve: (threadId) => controller.roomAction('comment.resolve', { threadId }),
              reopen: (threadId) => controller.roomAction('comment.reopen', { threadId }),
              assign: (threadId, assignee) =>
                controller.roomAction('comment.assign', {
                  threadId,
                  assignee: assignee === null ? null : { kind: 'principal', principalId: assignee },
                }),
              done: (threadId) => controller.roomAction('comment.done', { threadId }),
              react: (threadId, commentId, emoji, on) =>
                controller.roomAction('comment.react', { threadId, commentId, emoji, on }),
            }
          : {}),
      }
    : undefined;
  const inbox: EditorInbox = {
    items: controller.inboxViews(),
    unread: snap.inbox.unread,
    ...(snap.inbox.level !== undefined ? { level: snap.inbox.level } : {}),
    ...(snap.inbox.email !== undefined ? { email: snap.inbox.email } : {}),
    ...(snap.inbox.activityForCommenters !== undefined
      ? { activityForCommenters: snap.inbox.activityForCommenters }
      : {}),
    onOpen: (item) => controller.openInboxItem(item),
    onMarkRead: (ids) => void controller.roomAction('notification.markRead', { ids: [...ids] }),
    onMarkAllRead: () => void controller.roomAction('notification.markRead', { all: true }),
    onSettings: (settings) => controller.roomAction('notification.settings', settings),
  };
  /* B5's Chart data and Table sections inside Format options (SPEC-2 section 5) */
  const formatSlots: NonNullable<EditorShellInput['formatSlots']> = {
    chart: (props) =>
      chartFormatSlot({
        block: props.block,
        slide: { id: props.slideId },
        revision: props.revision,
        dispatch: props.dispatch,
        busy: props.busy,
        onNotice: shellSay,
      }),
    table: (props) =>
      tableFormatSlot({
        block: props.block,
        slide: { id: props.slideId },
        revision: props.revision,
        dispatch: props.dispatch,
        selection: props.selection,
        busy: props.busy,
        onNotice: shellSay,
      }),
  };

  const editorInput: EditorShellInput = {
    deckId,
    /* the title row's mark is the router's Link to /decks (SPEC-4 0.16, 1.10): a same document
       transition with the list's loader preloaded on intent, in place of a document load */
    linkComponent: RouterLinkSlot,
    document: snap.document,
    slideId: snap.activeSlide,
    selectedSlideIds: selectedSlideIds.length > 0 ? selectedSlideIds : [snap.activeSlide],
    selection: toShellSelection(selection, selectionFacts),
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
      /* an agent's write reads Assistant on the title row (docs/PRODUCT.md 6.1; build/b6.md R8) */
      ...(snap.versions.length > 0
        ? { lastEditBy: authorDisplay(snap.versions[snap.versions.length - 1]?.author ?? author) }
        : {}),
    },
    /* the deployment's default kit for the Brand kit panel (docs/PRODUCT.md 4.1; build/b5.md R4) */
    ...(payload.defaultKit === undefined ? {} : { defaultKit: payload.defaultKit }),
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
    /* round three (SPEC-3 sections 3 to 7; B6's surfaces read these) */
    presence,
    sync,
    account,
    ...(comments !== undefined ? { comments } : {}),
    inbox,
    ...(access !== undefined ? { access } : {}),
    ...(roleOf !== undefined ? { role: roleOf } : {}),
    ...(payload.draft === true ? {} : { capabilities: roleCapabilities }),
    /* View > Mode's radio and the root's data-edit-mode follow this (SPEC-3 5.3) */
    mode: effectiveMode,
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
    busy: false,
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
    onSettingsChange: (settings) => {
      controller.setShellSettings(settings);
      setShellSettings(settings);
    },
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
                    baseRevision: Math.max(current.document.deck.revision, current.serverRevision),
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
                      author: snap.external.author
                        ? authorDisplay(snap.external.author)
                        : 'outside',
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
    /* the toolbar Select button returns the stage to the Select tool as well as clearing the
       selection (docs/FOCUS.md `arrange.toolbar.select`: the tool stayed `text`) */
    onSelectTool: () => setTool('select'),
    /* the canvas (SPEC-2 sections 1 and 6): the stage's handle, the deck's guides, the zoom the
       stage reports and the measured boxes of a grammar slide's objects */
    editor: shellEditor,
    ...(snap.document.deck.guides !== undefined ? { guides: snap.document.deck.guides } : {}),
    ...(typeof snap.zoom === 'number' ? { view: { zoom: snap.zoom } } : {}),
    ...(measuredBoxes !== undefined ? { measuredBoxes } : {}),
    formatSlots,
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
        <ShellBridge controller={controller} editing={canWrite} api={shellApi} />
        <SessionBridge deckId={deckId} author={author} />
        <EditorStage
          controller={controller}
          snap={snap}
          viewerDeck={viewerDeck}
          editing={editing}
          readsComments={readsComments}
          twin={twin}
          lintLayer={lintLayer}
          findings={activeFindings}
          tool={tool}
          onToolDone={() => setTool('select')}
          onHandle={setEditorHandle}
          onCaret={setCaret}
          onMultiSelection={setMultiSelection}
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
      {snap.rejects.length > 0 ? (
        <RejectCard controller={controller} notices={snap.rejects} />
      ) : null}
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

// ---------------------------------------------------------------------------------------------
// The stage: the viewer's Editor in edit mode, the Stage otherwise, the slideshow, the twin view,
// the grid, the book, and the canvas and grid right-click menus

type EditorStageProps = {
  controller: EditorController;
  snap: EditorSnapshot;
  viewerDeck: ViewerDeck;
  editing: boolean;
  /** a viewer or commenter who may read comments: the editing stage in the role's mode, for the markers */
  readsComments: boolean;
  twin: boolean;
  lintLayer: boolean;
  findings: readonly Finding[];
  tool: EditorTool;
  onToolDone: () => void;
  onHandle: (handle: EditorHandle | null) => void;
  /** the caret's marks and range inside a run, for the toolbar's pressed state */
  onCaret: (info: CaretInfo | null) => void;
  /** the stage's selected objects beyond the anchor, for the facts the menus read */
  onMultiSelection: (ids: readonly string[]) => void;
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
  readsComments,
  twin,
  lintLayer,
  findings,
  tool,
  onToolDone,
  onHandle,
  onCaret,
  onMultiSelection,
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
    (editing || readsComments) &&
    shell.mode === 'slide' &&
    !shell.present &&
    !showTwin &&
    slide !== undefined;
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
          const current = controller.getSnapshot();
          await controller.invoke('slide.move', {
            slideId: id,
            sectionId: target.sectionId,
            ...(after === undefined ? {} : { after }),
            baseRevision: Math.max(current.document.deck.revision, current.serverRevision),
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
          onMultiSelectionChange={onMultiSelection}
          findings={findings}
          lintLayer={lintLayer}
          overlay={(view) => <Overlay view={view} />}
          onError={(error) => controller.say(errorMessage(error))}
          onRemoved={(block) => editorShell.say(`${deletedWord(block.type)} deleted`, undoAction)}
          zoom={snap.zoom}
          zoomCenter={snap.zoomCenter}
          onZoom={(zoom, center) => {
            void controller
              .invoke('view.zoom', { zoom, ...(center === undefined ? {} : { center }) })
              .catch((error: unknown) => controller.say(errorMessage(error)));
          }}
          /* the canvas (SPEC-2 6.1 rows 29 to 31): the deck's guides, the View toggles, the snaps */
          {...(snap.document.deck.guides !== undefined
            ? { guides: snap.document.deck.guides }
            : {})}
          onGuides={(input) => {
            const current = controller.getSnapshot();
            void controller
              .invoke('deck.guides', {
                ...input,
                baseRevision: Math.max(current.document.deck.revision, current.serverRevision),
              })
              .catch((error: unknown) => controller.say(errorMessage(error)));
          }}
          showRuler={editorShell.settings.showRuler === true}
          showGuides={editorShell.settings.showGuides === true}
          snapGuides={editorShell.settings.snapGuides !== false}
          snapGrid={editorShell.settings.snapGrid === true}
          onCaret={onCaret}
          tool={tool}
          onToolDone={onToolDone}
          showIds={editorShell.settings.showIds === true}
          onContextMenu={(menu) => {
            /* Delete guide reads the guide under the pointer from the shell (B3's plan fills `remove`) */
            editorShell.setGuideUnderPointer(menu.target === 'guide' ? (menu.guide ?? null) : null);
            setCanvasMenu(menu);
          }}
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
          band={frameBandOf(
            snap.document.deck,
            theme,
            bandAssetResolver(
              snap.document.deck,
              (_id, _theme, path) => ASSET_BASE(snap.deckId) + path,
            ),
          )}
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
          renderDynamic={editorShell.renderDynamicSubmenu}
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
          renderDynamic={editorShell.renderDynamicSubmenu}
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

/** The change a refused operation made, in the seller's words: the operations' names, deduplicated. */
export function changeWords(mutations: ReadonlyArray<{ op: string }>): string {
  const words: Record<string, string> = {
    'slide.insert': 'Slide added',
    'slide.remove': 'Slide deleted',
    'slide.move': 'Slide moved',
    'slide.set': 'Slide changed',
    'slide.replace': 'Slide changed',
    'block.insert': 'Object added',
    'block.remove': 'Object deleted',
    'block.set': 'Object changed',
    'block.move': 'Object moved',
    'text.splice': 'Text typed',
    'text.replace': 'Text changed',
    'text.mark': 'Text styled',
    'deck.set': 'Presentation changed',
    'section.set': 'Sections changed',
  };
  const seen = new Set<string>();
  for (const m of mutations) seen.add(words[m.op] ?? 'Change');
  return [...seen].join(', ') || 'Change';
}

/**
 * The reject card (gslides-parity SPEC-3 3.5, 3.6): an operation the room could not place comes
 * back to its author with its content and a fixed reason; the card lists it with Copy text so no
 * typed word is lost, and Dismiss. The rebase and discard of round one's conflict card retired
 * with the queue they resolved.
 */
function RejectCard({
  controller,
  notices,
}: {
  controller: EditorController;
  notices: readonly RejectNotice[];
}) {
  return (
    <div
      className="ts-conflict ts-chrome"
      role="dialog"
      aria-label="Changes not applied"
      data-state="conflict"
    >
      <div className="ts-conflict-head">
        <b>
          {notices.length === 1
            ? 'A change was not applied'
            : `${notices.length} changes were not applied`}
        </b>
        <span>{notices[0]?.message ?? 'Another change landed first; the text is kept here'}</span>
      </div>
      {notices.map((notice) => (
        <div key={notice.opId} className="ts-conflict-both" data-reason={notice.reason}>
          <div>
            <h4>{notice.text === '' ? changeWords(notice.mutations) : 'Your text'}</h4>
            {notice.text === '' ? (
              /* the mutation JSON stays behind Details: the seller reads the change's name and the
                 sentence, never the JSON (docs/FOCUS.md rank 3) */
              <details className="ts-conflict-details" data-control="conflict.details">
                <summary>Details</summary>
                <pre>{JSON.stringify(notice.mutations, null, 2)}</pre>
              </details>
            ) : (
              <pre>{notice.text}</pre>
            )}
          </div>
          <div className="ts-conflict-actions">
            {notice.text !== '' ? (
              <button
                type="button"
                className="pt-ib is-text is-solid"
                title="Copy the text of this change"
                data-control="conflict.copy"
                onClick={() => {
                  void navigator.clipboard?.writeText(notice.text).catch(() => undefined);
                }}
              >
                <span className="pt-lb">Copy text</span>
              </button>
            ) : null}
            <button
              type="button"
              className="pt-ib is-text"
              title="Dismiss this notice"
              data-control="conflict.discard"
              onClick={() => controller.dismissReject(notice.opId)}
            >
              <span className="pt-lb">Dismiss</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The store's notice (the hosting round, docs/hosting.md): a hosted studio without a Blob store
 * keeps edits on one server instance, so the editor says so for as long as the page is open. The
 * external revision banner takes the same slot while it is up. The slot is the status row's
 * empty middle (edit.$deckId.css `.ts-banner`; VERIFICATION-4 finding 4): the banner stands
 * over no toolbar button and no slide content, so a click on the sheet's top right reaches the
 * block there on the tmp tier as it does on the others.
 */
function HostingBanner({ notice, store }: { notice: string; store: string }) {
  return (
    <div className="ts-banner ts-chrome" role="status" data-state="hosting" data-store={store}>
      <span>{`${notice}; connect one to the Vercel project to keep them.`}</span>
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
        {`Revision r${external.revision}${external.author ? ` by ${authorDisplay(external.author)}` : ''} arrived from outside this editor and is shown${external.note ? `: ${external.note}` : ''}.`}
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
