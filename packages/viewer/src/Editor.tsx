// The stage in edit mode (SPEC 6.4; gslides-parity SPEC 4.3, 7.2.14, 7.2.15, 10.2): the theme's
// .ts-sheet root, the fitted sheet with the frame at the fit or at the View > Zoom factor, the
// slide rendered through renderSlide as innerHTML (SPEC 5.3: React owns chrome, overlays and view
// state only) with the prompts of empty placeholders, the measured block boxes, hover and
// selection, the gestures with a live preview from a draft document, inline text editing, the
// draw tools, the clipboard and paint format, drop to insert or replace a picture, the right-click
// classification the chrome's context menu draws, and the overlay layer the chrome fills.
// Nothing here reaches the document except through an action-table call (SPEC 7.1): a drag ends
// in one mutation that `dispatch` receives as the same `block.set`, `block.move` or `slide.update`
// call the CLI and the MCP server make, with the document's revision as baseRevision. The owner of
// the client store (undo, autosave, conflicts; SPEC 6.7) provides `dispatch`.
//
// Google's text model (gslides-parity SPEC 10.2, R09 A1): a single click inside text places the
// caret where it landed and the block's frame is the drag surface; double click selects a word
// and triple click a paragraph, the browser's own behaviour on the editable run; Esc commits and
// selects the block; Enter breaks a paragraph in the four multiline pointers, appends an item in
// a list and commits elsewhere; Tab and Shift Tab walk the cells of a table, the last cell adding
// a row; typing is one `text.replace` per 400 ms pause, so one Cmd Z removes one burst; the
// arrows nudge on a freeform slide and are inert on a grammar slide; no bare letter does anything
// (keys.ts editorKeyAction). The freeform layout (Freeform.tsx) drags its blocks anywhere with
// snapping and guides, resizes them from eight handles, selects several with Shift click or a
// marquee and moves them as a group. Every gesture still ends in one write: several `pos`
// mutations travel as one `slide.update` (actionForMutations).
import type {
  DragEvent as ReactDragEvent,
  PointerEvent as ReactPointerEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { renderSlide } from '@turboslide/render/slide';
import type { ActionId } from '@turboslide/schema/actions';
import type { Asset } from '@turboslide/schema/assets';
import type { Block, BlockType } from '@turboslide/schema/blocks';
import type { TableBlock, TableCommand } from '@turboslide/schema/blocks/table';
import { applyTableCommand } from '@turboslide/schema/blocks/table';
import { isMultilinePath } from '@turboslide/schema/catalog';
import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import type { Finding } from '@turboslide/schema/findings';
import type {
  AlignEdge,
  AlignTarget,
  DistributeAxis,
  OrderMove,
} from '@turboslide/schema/freeform';
import { sortByZ } from '@turboslide/schema/freeform';
import type { Mutation } from '@turboslide/schema/mutations';
import { jsonEqual } from '@turboslide/schema/pointer';
import { applyMutations } from '@turboslide/schema/reduce';
import type { Box } from '@turboslide/schema/render';
import type { Text as Markup } from '@turboslide/schema/text';
import { canonicalText, parseText } from '@turboslide/schema/text';
import { CONTENT_ORIGIN } from '@turboslide/theme/tokens';

import {
  altFor,
  assetIdFor,
  clipboardStore,
  decodeClipboard,
  encodeClipboard,
  fileToDataUrl,
  freeId,
  imageFilesOf,
  insertSlotFor,
  paintFormatOf,
  paintMutations,
  pastedBlockInserts,
  pastedSlideInserts,
  PICTURE_MAX_BYTES,
  takenBlockIds,
} from './clipboard';
import type { ClipboardPayload, ClipboardStore, PaintFormat } from './clipboard';
import { Frame } from './Frame';
import {
  alignMutations,
  distributeMutations,
  freeformBlocks,
  freeNudgeMutations,
  groupBox as groupBoxOf,
  isFreeformSlide,
  measureBoxes,
  zOrderMutations,
} from './Freeform';
import {
  actionForMutations,
  blockMoveFor,
  drawnBox,
  EMPTY_BOXES,
  freeGesture,
  gestureMutation,
  handlesFor,
  labelClearanceBox,
  locateBlock,
  nudgeMutation,
  sheetPoint,
  toolBlockType,
  toolInsertMutation,
} from './Gestures';
import type {
  EditorTool,
  FreeContext,
  GestureContext,
  Handle,
  MeasuredBoxes,
  Point,
} from './Gestures';
import type { Guide } from './Guides';
import {
  InlineText,
  listAppendMutation,
  listRemoveMutation,
  nextCellPointer,
  readRunText,
  tableRowAppendMutation,
  textBurstMutation,
} from './InlineText';
import type { CaretPlacement, InlineTextEndReason } from './InlineText';
import { editorKeyAction, isBareCharacterKey } from './keys';
import { isMarquee, marqueeBox, marqueeHits } from './Marquee';
import { MaterialMount } from './MaterialMount';
import { isPictureKind } from './model';
import {
  allBlockIds,
  blockById,
  blockDisplayName,
  blockFamily,
  blockOrder,
  blockTypeOf,
  cellPointer,
  cycleSelection,
  escapeSelection,
  firstRunOf,
  isEditableTarget,
  isTextBlockType,
  listItemPointer,
  resolveBlock,
  resolveRun,
  runElement,
  selectedBlockId,
  selectedIds,
  selectionOf,
  toggleSelected,
} from './Selection';
import type { BlockFamily, Selection } from './Selection';
import { fitSheetAt, Sheet, SHEET_PAD } from './Sheet';
import type { SheetZoom } from './Sheet';
import { boxSnapLines, sheetSnapLines } from './snap';
import { applyThemeToTree } from './theme';
import type { Theme } from './theme';

import './Editor.css';

/**
 * The one door to the document: an action id from the table and its input, including
 * baseRevision (SPEC 7.1). The studio's client store applies the write through the reducer for
 * optimism, records it for undo and sends it to writeDeck (SPEC 6.7).
 */
export type EditorDispatch = (
  id: ActionId,
  input: Record<string, unknown>,
) => Promise<unknown> | unknown;

/** A lint finding placed on the sheet: the evidence box, or the block's box (SPEC 6.4). */
export type LintBox = {
  id: string;
  rule: string;
  severity: 1 | 2 | 3;
  box: Box;
  blockId?: string;
};

/**
 * The arrange actions of a freeform selection, the stage's side of block.align,
 * block.distribute and block.order with the schema's vocabulary; the context menu calls them.
 */
export type ArrangeActions = {
  /** the selected block count */
  count: number;
  /** distribute needs three blocks */
  canDistribute: boolean;
  align: (edge: AlignEdge) => void;
  distribute: (axis: DistributeAxis) => void;
  /** on the anchor block */
  zOrder: (move: OrderMove) => void;
};

/** What the Editor hands the overlay layer on every render (SPEC 6.4); the chrome's Overlay draws it. */
export type EditorOverlayView = {
  slideId: string;
  /** the stage scale: sheet pixels times k are CSS pixels inside the overlay */
  k: number;
  boxes: MeasuredBoxes;
  /** the block under the pointer, when it is not the selected one */
  hover: Box | null;
  selection: Selection;
  /** the selected block's or run's box */
  selectionBox: Box | null;
  /** the block's plain name for the chip (gslides-parity SPEC 13.7); with the id after a middle dot only when ids are shown */
  chip: string | null;
  handles: Handle[];
  /** the handle being dragged */
  activeHandle: string | null;
  /** the insertion line of a block drag */
  drop: Box | null;
  /** the slot a block drag would land in, outlined while the drag is on */
  dropSlot: Box | null;
  lint: LintBox[];
  /** a run is being edited inline */
  editing: boolean;
  /** Alt is held: the diagram label and marker handles are live (SPEC 6.4 Alt-drag, M5) */
  alt: boolean;
  /** the 12 px clearance ring of the dragged diagram label, ink when a stroke intrudes (SPEC 6.4) */
  clearance: { box: Box; ok: boolean } | null;
  /** the slide is a freeform slide: blocks carry `pos` */
  freeform: boolean;
  /** the boxes of the other selected blocks of a multi-selection; the anchor is selectionBox */
  extraBoxes: Box[];
  /** the union box while more than one block is selected */
  groupBox: Box | null;
  /** the selected block count */
  count: number;
  /** the marquee being dragged, or the box a draw tool is drawing */
  marquee: Box | null;
  /** the snap guides of the gesture under way */
  guides: Guide[];
  /** the arrange actions of a freeform selection, null when none applies */
  arrange: ArrangeActions | null;
  /** paint format is armed: the next click paints */
  paint: boolean;
  onHandleDown: (handle: Handle, event: PointerEvent) => void;
  /** `axis` names the arrow pair for a two-axis handle; the default is the handle's own axis */
  onHandleNudge: (handle: Handle, delta: number, axis?: 'x' | 'y') => void;
  /**
   * Alt with Up or Down on a focused move chip (Overlay.tsx): the paint order of a positioned
   * block, or one step within its slot on a grammar slide; `forward` is Up.
   */
  onHandleOrder: (handle: Handle, move: OrderMove) => void;
};

/** The right-click targets of gslides-parity SPEC 4.3 the stage tells apart; the chrome's ContextMenu draws them. */
export type EditorContextTarget = 'emptyCanvas' | 'textBlock' | 'image' | 'tableCell';

/** A right-click on the stage, or Shift F10 with a block selected. */
export type EditorContextMenu = {
  target: EditorContextTarget;
  /** the pointer, in client pixels */
  x: number;
  y: number;
  /** where focus returns when the menu closes: the block element, or the stage */
  element: HTMLElement;
  blockId?: string;
  /** the cell of a table target */
  cell?: { row: number; col: number; pointer: string };
};

/** What the menu model's predicates read about the selection (menus/model.ts MenuContext.selection). */
export type EditorMenuSelection = {
  blocks: number;
  block?: BlockFamily;
  textBlock: boolean;
  listItem: boolean;
  tableCell: boolean;
  linked: boolean;
  order: { forward: boolean; backward: boolean; front: boolean; back: boolean };
  editing: boolean;
  freeform: boolean;
};

/** A line for the snackbar (gslides-parity SPEC 12); `undo` asks for the Undo action. */
export type EditorNotice = { text: string; undo?: true };

/**
 * The stage's imperative surface for the chrome (the context menu, the toolbar, the menu bar):
 * every method is what the matching key does, so a menu item and its shortcut are one code path.
 */
export type EditorHandle = {
  cut: () => Promise<void>;
  copy: () => Promise<void>;
  paste: (options?: { plain?: boolean }) => Promise<void>;
  remove: () => void;
  duplicate: () => Promise<void>;
  selectAll: () => void;
  deselect: () => void;
  /** front and back on a freeform slide; forward and backward everywhere */
  order: (move: OrderMove) => void;
  align: (edge: AlignEdge, to?: AlignTarget) => void;
  distribute: (axis: DistributeAxis) => void;
  /** the link popover on the selected block's first run (Cmd K) */
  link: () => void;
  /** one of the nine table commands on the selected table, at the cell being edited */
  table: (kind: TableCommand['kind']) => void;
  /** arms Paint format from the selection: true when the selection carried a look */
  armPaint: (keep?: boolean) => boolean;
  disarmPaint: () => void;
  paintArmed: () => boolean;
  /** ends an editing session as Esc does */
  commitText: () => void;
  focus: () => void;
  menuSelection: () => EditorMenuSelection;
  /** one step insert of a picture (SPEC 7.2.14): asset.add, then block.insert, or the replace of an image block or a picture slide */
  insertPicture: (
    file: File,
    where?: { blockId?: string; point?: Point; replace?: boolean },
  ) => Promise<void>;
};

export type EditorProps = {
  document: DeckDocument;
  slideId: string;
  theme: Theme;
  /** the URL prefix of the deck's asset twins, `/decks/<id>/` (the studio's decks.ts) */
  assetBase: string;
  /** the stage box, measured by the shell's ResizeObserver */
  stageSize: { width: number; height: number };
  /** 0-based position of the slide and the deck's length, for the counter */
  index: number;
  total: number;
  present?: boolean;
  narrow: boolean;
  dispatch: EditorDispatch;
  /** the selection, when the page owns it (the inspector reads it); internal otherwise */
  selection?: Selection;
  onSelectionChange?: (selection: Selection) => void;
  /** the slide's findings; drawn while `lintLayer` is on */
  findings?: readonly Finding[];
  lintLayer?: boolean;
  /** the overlay layer's content, from the chrome's Overlay */
  overlay?: (view: EditorOverlayView) => ReactNode;
  /** a dispatch that threw or rejected */
  onError?: (error: unknown) => void;
  /** Delete removed this block; the chrome's snackbar names it and the undo key (SPEC 6.9) */
  onRemoved?: (block: { type: BlockType; id: string }) => void;
  /** View > Zoom (gslides-parity SPEC 7.2.16); the fit when absent */
  zoom?: SheetZoom;
  /** the toolbar's draw tool; Select when absent. The stage calls onToolDone after one insert */
  tool?: EditorTool;
  onToolDone?: () => void;
  /** Tools > Advanced > Show slide and block ids: the chip prints the id too */
  showIds?: boolean;
  /** a right-click on the stage (gslides-parity SPEC 4.3); the chrome draws the menu */
  onContextMenu?: (menu: EditorContextMenu) => void;
  /** a snackbar line (gslides-parity SPEC 12): "Row added" with Undo, "Pictures up to 25 MB" */
  onNotice?: (notice: EditorNotice) => void;
  /** Cmd Z and Cmd Shift Z inside a text run end the session and run the page's history */
  onUndo?: () => void;
  onRedo?: () => void;
  /** the stage's imperative surface, handed once mounted and null on unmount */
  handle?: (handle: EditorHandle | null) => void;
  /** the clipboard store; the module's shared one when absent */
  clipboard?: ClipboardStore;
  /** the deck id the clipboard payloads carry, so a paste from another deck imports its assets */
  deckId?: string;
};

type Editing = {
  blockId: string;
  pointer: string;
  element: HTMLElement;
  caret: CaretPlacement;
  multiline: boolean;
  /** open the link popover once the session is up (Cmd K on a selected block) */
  link?: boolean;
};

type ActiveGesture = {
  handle: Handle;
  start: Point;
  ctx: GestureContext;
  /** the last previewed mutations, so an unchanged move re-renders nothing */
  last: Mutation[] | null;
};

/** A press on a block's body that may become a drag; CSS pixels. */
type Press = { blockId: string; clientX: number; clientY: number };

/** A run to edit once the slide re-rendered with it (a new list item, the next cell, a drawn text box). */
type PendingEdit = { blockId: string; pointer: string; caret: CaretPlacement; link?: boolean };

/** A body drag starts once the pointer has moved this many CSS pixels from the press. */
const DRAG_START_PX = 4;
/** How long the stage waits for a server write (an asset) to reach the document before it gives up. */
const ASSET_WAIT_MS = 20_000;
/** The default box of a dropped picture on a freeform slide (palette-data.ts DEFAULT_SIZE shot). */
const DROP_PICTURE_SIZE: [number, number] = [480, 272];
/** Pictures up to 25 MB (gslides-parity SPEC 11.3; the sentence of menus/strings.ts ERRORS.pictureSize). */
const PICTURE_SIZE_NOTICE = 'Pictures up to 25 MB';

function backdropFor(document: DeckDocument, slide: Slide | undefined, theme: Theme, base: string) {
  if (!slide || !isPictureKind(slide.kind) || !('picture' in slide)) return undefined;
  const asset = document.deck.assets[slide.picture.asset];
  if (!asset) return undefined;
  if ('neutral' in asset.twins) return base + asset.twins.neutral;
  return base + (theme === 'dark' ? asset.twins.dark : asset.twins.light);
}

/** The chip handle of a block, the one a body drag stands for: block-move or free-move. */
function chipHandleFor(slide: Slide, boxes: MeasuredBoxes, blockId: string): Handle | undefined {
  return handlesFor(slide, boxes, { kind: 'block', blockId }).find((h) => h.shape === 'chip');
}

/** The controls of the chrome a keydown may start from: their own keys, never the stage's. */
const CHROME_CONTROL =
  'button, input, select, textarea, [contenteditable], [role="menu"], [role="dialog"], [role="listbox"], .ts-inspector';

/**
 * True when a key was pressed on a control outside the stage (an inspector button, a palette
 * swatch, a menu row, a filmstrip card): the stage's edit keys stay inert there, so Enter
 * activates the button instead of opening the selected block's text for editing (measured on the
 * editor depth preview: Enter on a fill swatch started inline editing and left the fill
 * unchanged). The overlay's handles sit outside the stage root too and keep their own keys
 * (Overlay.tsx).
 */
export function isChromeControlTarget(target: EventTarget | null, stage: Element | null): boolean {
  if (!(target instanceof Element)) return false;
  if (stage !== null && stage.contains(target)) return false;
  return target.closest(CHROME_CONTROL) !== null;
}

/**
 * A layout effect that runs once per mounted instance and survives StrictMode's simulated
 * unmount (chrome/lib/useMountEffect.ts explains the device): the cleanup waits one task and a
 * re-run inside it cancels the wait. The stage's window key listener needs this so it keeps the
 * place it took at mount, ahead of the page's own capture listeners; a plain effect re-registered
 * by the simulated re-run lands behind them (measured on the dev server: the route's legacy `e`
 * handler ran before the stage could consume the letter).
 */
function useOnceLayoutEffect(effect: () => () => void): void {
  const cleanup = useRef<(() => void) | undefined>(undefined);
  const pending = useRef(0);
  useLayoutEffect(() => {
    if (pending.current) {
      window.clearTimeout(pending.current);
      pending.current = 0;
    } else {
      cleanup.current = effect();
    }
    return () => {
      pending.current = window.setTimeout(() => {
        pending.current = 0;
        cleanup.current?.();
        cleanup.current = undefined;
      }, 0);
    };
    // mount-only by contract: the effect reads nothing that changes
  }, []);
}

/** True while the value is not yet what the caller waits for, within the budget. */
async function waitFor(check: () => boolean, ms: number): Promise<boolean> {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) return false;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  return true;
}

/** Whether a linked run sits in the markup, for the menu's `linked` predicate. */
function markupHasLink(text: Markup | undefined): boolean {
  return text !== undefined && parseText(text).some((run) => run.link !== undefined);
}

export function Editor({
  document: doc,
  slideId,
  theme,
  assetBase,
  stageSize,
  index,
  total,
  present = false,
  narrow,
  dispatch,
  selection: controlled,
  onSelectionChange,
  findings,
  lintLayer = false,
  overlay,
  onError,
  onRemoved,
  zoom = 'fit',
  tool = 'select',
  onToolDone,
  showIds = false,
  onContextMenu,
  onNotice,
  onUndo,
  onRedo,
  handle: onHandle,
  clipboard = clipboardStore,
  deckId,
}: EditorProps) {
  const slide = doc.slides[slideId];
  const [draft, setDraft] = useState<DeckDocument | null>(null);
  const shown = draft ?? doc;
  const shownSlide = shown.slides[slideId];
  const freeform = isFreeformSlide(slide);

  const html = useMemo(() => {
    if (!shownSlide) return '';
    try {
      return renderSlide(shown.deck, shownSlide, {
        theme,
        chrome: true,
        assetBase,
        blockAttrs: true,
        gtWord: true,
        // the editor stage alone draws the prompts of empty placeholders (gslides-parity SPEC 5.4)
        live: true,
      }).html;
    } catch {
      return '';
    }
  }, [shown, shownSlide, theme, assetBase]);

  const [innerSelection, setInnerSelection] = useState<Selection>(null);
  const selection = controlled === undefined ? innerSelection : controlled;
  /* the rest of a multi-selection beyond the anchor the page owns */
  const [extra, setExtra] = useState<string[]>([]);
  const [boxes, setBoxes] = useState<MeasuredBoxes>(EMPTY_BOXES);
  const [hover, setHover] = useState<string | null>(null);
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const [drop, setDrop] = useState<Box | null>(null);
  const [dropSlot, setDropSlot] = useState<Box | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [alt, setAlt] = useState(false);
  const [paint, setPaint] = useState<{ format: PaintFormat; keep: boolean } | null>(null);

  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const gesture = useRef<ActiveGesture | null>(null);
  const press = useRef<Press | null>(null);
  /* the listeners bound once read the latest values through these refs */
  const docRef = useRef(doc);
  docRef.current = doc;
  /* the revision the next write is based on: the document's, bumped once per write this tick
     issues, because the page's reducer applies a write before React re-renders this ref */
  const revisionRef = useRef(doc.deck.revision);
  revisionRef.current = doc.deck.revision;
  const slideRef = useRef(slide);
  slideRef.current = slide;
  const slideIdRef = useRef(slideId);
  slideIdRef.current = slideId;
  const boxesRef = useRef(boxes);
  boxesRef.current = boxes;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const extraRef = useRef(extra);
  extraRef.current = extra;
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const paintRef = useRef(paint);
  paintRef.current = paint;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const htmlRef = useRef(html);
  htmlRef.current = html;
  /* the markup shown while a run is edited: frozen at the session's start so a burst's re-render
     never replaces the editable element under the caret */
  const frozenHtml = useRef<string | null>(null);
  /* the markup of the run as the document last held it, what the next burst diffs against */
  const committedText = useRef<Markup>('');
  const pendingEdit = useRef<PendingEdit | null>(null);
  const pendingSelect = useRef<string[] | null>(null);
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onSelectionRef = useRef(onSelectionChange);
  onSelectionRef.current = onSelectionChange;
  const onRemovedRef = useRef(onRemoved);
  onRemovedRef.current = onRemoved;
  const onToolDoneRef = useRef(onToolDone);
  onToolDoneRef.current = onToolDone;
  const onContextMenuRef = useRef(onContextMenu);
  onContextMenuRef.current = onContextMenu;
  const onNoticeRef = useRef(onNotice);
  onNoticeRef.current = onNotice;
  const onUndoRef = useRef(onUndo);
  onUndoRef.current = onUndo;
  const onRedoRef = useRef(onRedo);
  onRedoRef.current = onRedo;
  const clipboardRef = useRef(clipboard);
  clipboardRef.current = clipboard;
  const deckIdRef = useRef(deckId ?? doc.deck.id);
  deckIdRef.current = deckId ?? doc.deck.id;

  const select = (next: Selection, nextExtra: string[] = []) => {
    const anchor = selectedBlockId(next);
    const pruned = anchor === null ? [] : nextExtra.filter((id) => id !== anchor);
    if (!jsonEqual(pruned, extraRef.current)) {
      extraRef.current = pruned;
      setExtra(pruned);
    }
    if (jsonEqual(next, selectionRef.current)) return;
    selectionRef.current = next;
    setInnerSelection(next);
    onSelectionRef.current?.(next);
  };

  /* an anchor the page changed from outside the group (the inspector, Tab) ends the
     multi-selection; an anchor promoted from the group keeps the rest */
  const anchorId = selectedBlockId(selection);
  const lastAnchor = useRef<string | null>(anchorId);
  useEffect(() => {
    const previous = lastAnchor.current;
    lastAnchor.current = anchorId;
    if (anchorId === previous) return;
    const current = extraRef.current;
    if (anchorId === null || (previous !== null && !current.includes(anchorId))) {
      if (current.length > 0) {
        extraRef.current = [];
        setExtra([]);
      }
      return;
    }
    const pruned = current.filter((id) => id !== anchorId);
    if (pruned.length !== current.length) {
      extraRef.current = pruned;
      setExtra(pruned);
    }
  }, [anchorId]);

  const measure = () => {
    const el = body.current;
    if (!el) return;
    const next = measureBoxes(el);
    if (!next) return;
    setBoxes((prev) => (jsonEqual(prev, next) ? prev : next));
  };

  const notice = (text: string, undo?: true) => {
    onNoticeRef.current?.(undo ? { text, undo } : { text });
  };

  /** One action call per gesture (SPEC 7.1); several mutations travel as one slide.update. */
  const commit = (mutations: ReadonlyArray<Mutation>): void => {
    if (mutations.length === 0) {
      setDraft(null);
      return;
    }
    const call = actionForMutations(mutations, revisionRef.current);
    let result: unknown;
    try {
      result = dispatchRef.current(call.id, call.input);
      /* the page's reducer applied the write; the next write this tick bases on the result */
      revisionRef.current += 1;
    } catch (error) {
      onErrorRef.current?.(error);
      setDraft(null);
      return;
    }
    Promise.resolve(result)
      .then(
        () => undefined,
        (error: unknown) => onErrorRef.current?.(error),
      )
      .finally(() => setDraft(null));
  };

  /** A named action with the current revision; the promise is the server's confirmation. */
  const call = (id: ActionId, input: Record<string, unknown>): Promise<unknown> => {
    const base = revisionRef.current;
    const result = Promise.resolve(dispatchRef.current(id, { ...input, baseRevision: base }));
    revisionRef.current = base + 1;
    return result.then(
      (value) => value,
      (error: unknown) => {
        onErrorRef.current?.(error);
        throw error;
      },
    );
  };

  /**
   * One order step for a block: the paint order on a freeform slide (block.order), one place
   * within its slot on a grammar slide (block.move). Cmd Up and Cmd Down, Shift for the ends
   * (gslides-parity SPEC 10.1). On a grammar slide the direction follows the arrow on the key:
   * `forward` (Cmd Up) moves the block one place up its slot, `backward` (Cmd Down) one place
   * down, `front` and `back` to the first and the last place, the convention of the editor
   * depth round (editor.spec.ts pins Down moving the first block to the second place). The parity
   * round's first cut inverted the sign, so Down on the first block computed an index of -1 and
   * wrote nothing (VERIFICATION.md finding 18).
   */
  const orderBlock = (blockId: string, move: OrderMove) => {
    const slideNow = slideRef.current;
    if (!slideNow || gesture.current) return;
    if (isFreeformSlide(slideNow)) {
      commit(zOrderMutations(slideNow, blockId, move));
      return;
    }
    const located = locateBlock(slideNow, blockId);
    if (!located) return;
    if (move === 'front' || move === 'back') {
      const others = located.blocks.filter((block) => block.id !== blockId);
      const after = move === 'back' ? others[others.length - 1]?.id : undefined;
      const currentAfter = located.index > 0 ? located.blocks[located.index - 1]?.id : undefined;
      if (after === currentAfter) return;
      commit([
        {
          op: 'block.move',
          slideId: slideNow.id,
          blockId,
          slot: located.slot,
          ...(after !== undefined ? { after } : {}),
        },
      ]);
      return;
    }
    const chip = chipHandleFor(slideNow, boxesRef.current, blockId);
    const mutation = chip
      ? nudgeMutation(
          chip,
          { slide: slideNow, boxes: boxesRef.current },
          move === 'forward' ? -1 : 1,
          'y',
        )
      : null;
    if (mutation) commit([mutation]);
  };

  /* a new document ends any preview: the write landed, or the world moved on */
  useEffect(() => {
    setDraft(null);
  }, [doc]);

  /* Alt held: the diagram handles take the pointer (SPEC 6.4 Alt-drag); released, or the window
     loses focus, they yield to selection again */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAlt(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAlt(false);
    };
    const off = () => setAlt(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', off);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', off);
    };
  }, []);

  // -------------------------------------------------------------------------------------------
  // Text editing (gslides-parity SPEC 7.2.15, 7.4, 10.2)

  const startEdit = (
    run: { blockId: string; pointer: string; element: HTMLElement },
    caret: CaretPlacement = 'end',
    options: { link?: boolean } = {},
  ) => {
    if (gesture.current) return;
    const slideNow = slideRef.current;
    if (!slideNow) return;
    const block = blockById(slideNow, run.blockId);
    const multiline = block !== undefined && isMultilinePath(block, `/${run.pointer}`);
    committedText.current = readRunText(slideNow, run.blockId, run.pointer) ?? '';
    frozenHtml.current = htmlRef.current;
    setEditing({ ...run, caret, multiline, ...(options.link ? { link: true } : {}) });
    select({ kind: 'run', blockId: run.blockId, pointer: run.pointer });
  };

  /** The write of one burst, or of the final text: the changed span against what the document holds. */
  const writeText = (current: Editing, text: Markup): Mutation | null => {
    const slideNow = slideRef.current;
    if (!slideNow) return null;
    const mutation = textBurstMutation(
      slideNow,
      current.blockId,
      current.pointer,
      committedText.current,
      text,
    );
    if (mutation) {
      committedText.current = text;
      commit([mutation]);
    }
    return mutation;
  };

  const onBurst = (text: Markup) => {
    const current = editingRef.current;
    if (current) writeText(current, text);
  };

  /** The slide as the document will hold it after the mutations this tick issued (the reducer applied them; this ref lags one render). */
  const slideAfter = (mutations: Mutation[]): Slide | undefined => {
    if (mutations.length === 0) return slideRef.current;
    try {
      return applyMutations(docRef.current, mutations).document.slides[slideIdRef.current];
    } catch {
      return slideRef.current;
    }
  };

  const endEdit = (text: Markup, reason: InlineTextEndReason) => {
    const current = editingRef.current;
    if (!current) return;
    setEditing(null);
    frozenHtml.current = null;
    const written = writeText(current, text);
    const slideNow = slideAfter(written ? [written] : []);
    const backToBlock = () => select({ kind: 'block', blockId: current.blockId });
    if (!slideNow) {
      backToBlock();
      return;
    }
    switch (reason) {
      case 'tab':
      case 'shift-tab': {
        const block = blockById(slideNow, current.blockId);
        if (block?.type !== 'table') {
          backToBlock();
          return;
        }
        const next = nextCellPointer(block, current.pointer, reason === 'tab' ? 1 : -1);
        if (next === null) {
          backToBlock();
          return;
        }
        if (next === 'append') {
          const appended = tableRowAppendMutation(slideNow, block);
          pendingEdit.current = { blockId: block.id, pointer: appended.pointer, caret: 'end' };
          commit([appended.mutation]);
          notice('Row added', true);
          return;
        }
        const el = body.current ? runElement(body.current, block.id, next.pointer) : null;
        if (el && !written) {
          startEdit({ blockId: block.id, pointer: next.pointer, element: el }, 'all');
          return;
        }
        pendingEdit.current = { blockId: block.id, pointer: next.pointer, caret: 'all' };
        return;
      }
      case 'list-enter': {
        /* Enter at the end of a list item appends an item and moves the caret into it (SPEC 7.4);
           the items are read from the slide after the burst above, so the typed text survives */
        const block = blockById(slideNow, current.blockId);
        const appended = block ? listAppendMutation(slideNow, block, current.pointer) : null;
        if (!block || !appended) {
          backToBlock();
          return;
        }
        pendingEdit.current = { blockId: block.id, pointer: appended.pointer, caret: 'end' };
        commit([appended.mutation]);
        return;
      }
      case 'list-backspace': {
        /* Backspace on an empty item removes it and moves the caret to the item before (SPEC 7.4) */
        const block = blockById(slideNow, current.blockId);
        const removed = block ? listRemoveMutation(slideNow, block, current.pointer) : null;
        if (!block || !removed) {
          backToBlock();
          return;
        }
        if (removed.pointer === null) pendingSelect.current = [block.id];
        else pendingEdit.current = { blockId: block.id, pointer: removed.pointer, caret: 'end' };
        commit([removed.mutation]);
        return;
      }
      default:
        backToBlock();
    }
  };

  /** True when the run being edited is an item of a plain, rows or refs list: Enter appends an item (SPEC 7.4). */
  const onListEnter = (): boolean => {
    const current = editingRef.current;
    const slideNow = slideRef.current;
    if (!current || !slideNow) return false;
    const block = blockById(slideNow, current.blockId);
    return block !== undefined && listAppendMutation(slideNow, block, current.pointer) !== null;
  };

  /** True when the run being edited is an item of a list with more than one item: Backspace on an empty one removes it (SPEC 7.4). */
  const onListBackspace = (): boolean => {
    const current = editingRef.current;
    const slideNow = slideRef.current;
    if (!current || !slideNow) return false;
    const block = blockById(slideNow, current.blockId);
    return block !== undefined && listRemoveMutation(slideNow, block, current.pointer) !== null;
  };

  const stageRect = () => body.current?.parentElement?.getBoundingClientRect();

  /* the fresh markup: the theme's twins and dither canvases, then the boxes; fonts and images
     re-measure; a run queued for editing (a new item, the next cell, a drawn text box) starts */
  const shownHtml = editing && frozenHtml.current !== null ? frozenHtml.current : html;
  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    applyThemeToTree(el, theme);
    measure();
    const editingNow = editingRef.current;
    if (editingNow && !el.contains(editingNow.element)) setEditing(null);
    const queued = pendingEdit.current;
    if (queued && !editingRef.current) {
      const run = runElement(el, queued.blockId, queued.pointer);
      if (run) {
        pendingEdit.current = null;
        startEdit(
          { blockId: queued.blockId, pointer: queued.pointer, element: run },
          queued.caret,
          queued.link ? { link: true } : {},
        );
      }
    }
    const wanted = pendingSelect.current;
    if (wanted && wanted.every((id) => el.querySelector(`[data-block="${id}"]`))) {
      pendingSelect.current = null;
      const picked = selectionOf(wanted);
      select(picked.selection, picked.extra);
    }
    const onLoad = () => measure();
    el.addEventListener('load', onLoad, true);
    let cancelled = false;
    if (typeof document !== 'undefined' && 'fonts' in document) {
      void document.fonts.ready.then(() => {
        if (!cancelled) measure();
      });
    }
    return () => {
      cancelled = true;
      el.removeEventListener('load', onLoad, true);
    };
    // the boxes follow the markup and the theme; measure, select and startEdit are closures over refs
  }, [shownHtml, theme]);

  /* a selection that names a block the slide no longer has is dropped */
  useEffect(() => {
    const current = selectionRef.current;
    if (current && slide && blockOrder(body.current ?? document).length > 0) {
      if (!body.current?.querySelector(`[data-block="${current.blockId}"]`)) select(null);
    }
  }, [html]);

  // -------------------------------------------------------------------------------------------
  // Gestures

  /** The snap lines a freeform gesture on `ids` can land on: the sheet's and the resting blocks'. */
  const freeContextFor = (slideNow: Slide, ids: string[], boxesNow: MeasuredBoxes): FreeContext => {
    const lines = sheetSnapLines();
    for (const block of freeformBlocks(slideNow)) {
      if (ids.includes(block.id)) continue;
      const box = boxesNow.blocks[block.id];
      if (box) lines.push(...boxSnapLines(box));
    }
    return { ids, lines };
  };

  /** The mutations a gesture stands for at a point, and what the overlay shows meanwhile. */
  const gestureAt = (
    g: ActiveGesture,
    now: Point,
    shift: boolean,
  ): { mutations: Mutation[]; guides: Guide[] } => {
    if (g.handle.kind === 'free-move' || g.handle.kind === 'free-resize') {
      const result = freeGesture(g.handle, g.ctx, g.start, now, { shift });
      return { mutations: result?.mutations ?? [], guides: result?.guides ?? [] };
    }
    const mutation = gestureMutation(g.handle, g.ctx, g.start, now);
    return { mutations: mutation === null ? [] : [mutation], guides: [] };
  };

  const endGestureState = () => {
    gesture.current = null;
    setActiveHandle(null);
    setDrop(null);
    setDropSlot(null);
    setGuides([]);
  };

  /**
   * A gesture from a handle or a body press: the preview follows the pointer through the draft
   * document, the release commits the same mutations once (SPEC 6.4). A free-move gesture on a
   * block of the multi-selection moves the whole group.
   */
  const beginGesture = (handle: Handle, clientX: number, clientY: number) => {
    const slideNow = slideRef.current;
    const rect = stageRect();
    if (!slideNow || !rect || editingRef.current || gesture.current) return;
    const start = sheetPoint(rect, clientX, clientY);
    const boxesNow = boxesRef.current;
    const ctx: GestureContext = { slide: slideNow, boxes: boxesNow };
    if (handle.blockId !== undefined && isFreeformSlide(slideNow)) {
      const selected = selectedIds(selectionRef.current, extraRef.current);
      const ids = selected.includes(handle.blockId) ? selected : [handle.blockId];
      ctx.free = freeContextFor(slideNow, ids, boxesNow);
    }
    gesture.current = { handle, start, ctx, last: null };
    setActiveHandle(handle.id);
    setHover(null);
    if (handle.blockId !== undefined) {
      const selected = selectedIds(selectionRef.current, extraRef.current);
      if (!selected.includes(handle.blockId)) select({ kind: 'block', blockId: handle.blockId });
    }
    if (handle.kind === 'block-move' && handle.blockId !== undefined) {
      const first = blockMoveFor(slideNow, handle.blockId, start, ctx.boxes);
      setDrop(first.indicator);
      setDropSlot(first.slotBox);
    }
    const move = (ev: PointerEvent) => {
      const g = gesture.current;
      const r = stageRect();
      if (!g || !r) return;
      const now = sheetPoint(r, ev.clientX, ev.clientY);
      if (g.handle.kind === 'block-move' && g.handle.blockId !== undefined) {
        const at = blockMoveFor(g.ctx.slide, g.handle.blockId, now, g.ctx.boxes);
        setDrop(at.indicator);
        setDropSlot(at.slotBox);
      }
      const { mutations, guides: nextGuides } = gestureAt(g, now, ev.shiftKey);
      if (g.handle.kind === 'free-move' || g.handle.kind === 'free-resize') setGuides(nextGuides);
      if (jsonEqual(mutations, g.last)) return;
      g.last = mutations;
      if (mutations.length === 0) {
        setDraft(null);
        return;
      }
      try {
        setDraft(applyMutations(docRef.current, mutations).document);
      } catch {
        // a preview the reducer refuses: the last good preview stays up
      }
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      const g = gesture.current;
      endGestureState();
      const r = stageRect();
      if (!g || !r) {
        setDraft(null);
        return;
      }
      const now = sheetPoint(r, ev.clientX, ev.clientY);
      commit(gestureAt(g, now, ev.shiftKey).mutations);
    };
    const cancel = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      endGestureState();
      setDraft(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };

  // -------------------------------------------------------------------------------------------
  // The clipboard, duplicate, delete, paint format, pictures

  /** The real blocks of the selection, in selection order. */
  const selectedBlocks = (): Block[] => {
    const slideNow = slideRef.current;
    if (!slideNow) return [];
    return selectedIds(selectionRef.current, extraRef.current).flatMap((id) => {
      const block = blockById(slideNow, id);
      return block ? [block] : [];
    });
  };

  const removeSelected = (): boolean => {
    const slideNow = slideRef.current;
    if (!slideNow) return false;
    // real blocks only: the text of a title or statement slide is a field, not a block
    const blocks = selectedBlocks();
    const anchor = blocks[0];
    if (!anchor) return false;
    commit(
      blocks.map((block): Mutation => ({
        op: 'block.remove',
        slideId: slideNow.id,
        blockId: block.id,
      })),
    );
    select(null);
    /* the write is the one block.remove (or one slide.update of several) above; the chrome's
       snackbar names the block and the undo key so the removal is never silent (SPEC 6.9) */
    onRemovedRef.current?.({ type: anchor.type, id: anchor.id });
    return true;
  };

  const payloadOfSelection = (): ClipboardPayload | null => {
    const slideNow = slideRef.current;
    const blocks = selectedBlocks();
    if (!slideNow || blocks.length === 0) return null;
    return {
      kind: 'blocks',
      deckId: deckIdRef.current,
      slideId: slideNow.id,
      blocks: JSON.parse(JSON.stringify(blocks)) as Block[],
    };
  };

  const copySelection = async (cut: boolean): Promise<void> => {
    const payload = payloadOfSelection();
    if (!payload) return;
    await clipboardRef.current.write(payload);
    if (cut) removeSelected();
  };

  /** A block with the same look as the paste, inserted from a text payload. */
  const insertTextBlock = (text: string, point?: Point) => {
    const slideNow = slideRef.current;
    if (!slideNow) return;
    const id = freeId('text', takenBlockIds(slideNow));
    const markup = canonicalText(text.replace(/\r\n?/g, '\n').trim());
    const selected = selectedBlockId(selectionRef.current) ?? undefined;
    const [ox, oy] = CONTENT_ORIGIN;
    const at = point ?? { x: ox, y: oy };
    const mutation = toolInsertMutation(
      slideNow,
      { kind: 'text' },
      id,
      [at.x, at.y, 480, 64],
      insertSlotFor(slideNow, selected),
      selected,
    );
    if (!mutation || mutation.op !== 'block.insert') return;
    const block = { ...mutation.block, text: markup } as Block;
    pendingSelect.current = [id];
    commit([{ ...mutation, block }]);
  };

  const pasteBlocks = (payload: Extract<ClipboardPayload, { kind: 'blocks' }>) => {
    const slideNow = slideRef.current;
    if (!slideNow) return;
    const selected = selectedBlockId(selectionRef.current) ?? undefined;
    const planned = pastedBlockInserts(slideNow, payload, {
      sameSlide: payload.deckId === deckIdRef.current && payload.slideId === slideNow.id,
      ...(selected !== undefined ? { selectedBlockId: selected } : {}),
    });
    if (planned.mutations.length === 0) return;
    pendingSelect.current = planned.ids;
    commit(planned.mutations);
  };

  const pasteSlides = async (payload: Extract<ClipboardPayload, { kind: 'slides' }>) => {
    const document = docRef.current;
    const after = slideIdRef.current;
    if (payload.deckId !== deckIdRef.current) {
      await call('slide.import', {
        sourceDeckId: payload.deckId,
        slideIds: payload.slides.map((row) => row.id),
        after,
      });
      return;
    }
    for (const input of pastedSlideInserts(document.deck, payload, after)) {
      void call('slide.insert', input);
    }
  };

  const pastePayload = async (payload: ClipboardPayload | null, plain: boolean): Promise<void> => {
    if (payload === null) return;
    if (payload.kind === 'text' || plain) {
      const text =
        payload.kind === 'text'
          ? payload.text
          : payload.kind === 'blocks'
            ? payload.blocks
                .map((block) =>
                  'text' in block && typeof block.text === 'string' ? block.text : '',
                )
                .filter((t) => t !== '')
                .join('\n')
            : '';
      if (text === '') return;
      if (editingRef.current) {
        document.execCommand('insertText', false, text);
        return;
      }
      insertTextBlock(text);
      return;
    }
    if (payload.kind === 'blocks') {
      pasteBlocks(payload);
      return;
    }
    await pasteSlides(payload);
  };

  const duplicateSelection = async (): Promise<void> => {
    const slideNow = slideRef.current;
    const blocks = selectedBlocks();
    if (!slideNow || blocks.length === 0) return;
    /* the copies take `<id>-2` and up, as store-actions blockDuplicate names them; the selection
       moves to them once the slide re-renders with them */
    const taken = takenBlockIds(slideNow);
    const ids = blocks.map((block) => {
      const id = freeId(`${block.id}-2`, taken);
      taken.add(id);
      return id;
    });
    pendingSelect.current = ids;
    await call('block.duplicate', { slideId: slideNow.id, blockIds: blocks.map((b) => b.id) });
  };

  const selectAll = () => {
    const slideNow = slideRef.current;
    if (!slideNow) return;
    const picked = selectionOf(allBlockIds(slideNow));
    select(picked.selection, picked.extra);
  };

  const armPaint = (keep = false): boolean => {
    const blocks = selectedBlocks();
    const source = blocks[0];
    if (!source) return false;
    const format = paintFormatOf(source);
    if (Object.keys(format).length === 0) return false;
    setPaint({ format, keep });
    return true;
  };

  const disarmPaint = () => {
    if (paintRef.current) setPaint(null);
  };

  /** Paint format on a block: one block.set per field the target takes (SPEC 3.1 row 6). */
  const applyPaint = (blockId: string): boolean => {
    const armed = paintRef.current;
    const slideNow = slideRef.current;
    if (!armed || !slideNow) return false;
    const target = blockById(slideNow, blockId);
    if (!target) return false;
    const mutations = paintMutations(slideNow, target, armed.format);
    if (mutations.length > 0) commit(mutations);
    if (!armed.keep) setPaint(null);
    return true;
  };

  /** Cmd B with a text block selected: the display weight on the whole block (SPEC 3.2 row 14). */
  const toggleWeight = () => {
    const slideNow = slideRef.current;
    if (!slideNow) return;
    const mutations = selectedBlocks().flatMap((block): Mutation[] => {
      if (!isTextBlockType(block.type) || block.type === 'table') return [];
      const typography = (block as { typography?: Record<string, unknown> }).typography ?? {};
      const bold = typography['weight'] === 500;
      const next = { ...typography };
      if (bold) delete next['weight'];
      else next['weight'] = 500;
      return [
        Object.keys(next).length === 0
          ? { op: 'block.set', slideId: slideNow.id, blockId: block.id, path: '/typography' }
          : {
              op: 'block.set',
              slideId: slideNow.id,
              blockId: block.id,
              path: '/typography',
              value: next,
            },
      ];
    });
    commit(mutations);
  };

  const openLink = () => {
    const el = body.current;
    const current = editingRef.current;
    if (current) {
      current.element.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true, bubbles: true }),
      );
      return;
    }
    const anchor = selectedBlockId(selectionRef.current);
    if (!el || anchor === null) return;
    const run = firstRunOf(el, anchor);
    if (run) startEdit(run, 'end', { link: true });
  };

  /** One of the nine table commands (SPEC 7.3) on the selected table, at the cell being edited. */
  const tableCommand = (kind: TableCommand['kind']) => {
    const slideNow = slideRef.current;
    if (!slideNow) return;
    const current = editingRef.current;
    const anchor = current?.blockId ?? selectedBlockId(selectionRef.current);
    if (anchor === null) return;
    const block = blockById(slideNow, anchor);
    if (!block || block.type !== 'table') return;
    const table = block as TableBlock;
    const cell = (current ? cellPointer(current.pointer) : null) ??
      (selectionRef.current?.kind === 'run' ? cellPointer(selectionRef.current.pointer) : null) ?? {
        row: 0,
        col: 0,
      };
    if (current) current.element.blur();
    const command: TableCommand =
      kind === 'insertRowAbove' || kind === 'insertRowBelow' || kind === 'deleteRow'
        ? { kind, row: cell.row }
        : kind === 'insertColumnLeft' || kind === 'insertColumnRight' || kind === 'deleteColumn'
          ? { kind, column: cell.col }
          : { kind };
    const edited = applyTableCommand(table, command);
    if ('deleted' in edited) {
      commit([{ op: 'block.remove', slideId: slideNow.id, blockId: table.id }]);
      select(null);
      return;
    }
    const mutations: Mutation[] = [];
    if (!jsonEqual(edited.rows, table.rows))
      mutations.push({
        op: 'block.set',
        slideId: slideNow.id,
        blockId: table.id,
        path: '/rows',
        value: edited.rows,
      });
    if (!jsonEqual(edited.columns, table.columns))
      mutations.push({
        op: 'block.set',
        slideId: slideNow.id,
        blockId: table.id,
        path: '/columns',
        value: edited.columns,
      });
    commit(mutations);
    select({ kind: 'block', blockId: table.id });
  };

  /**
   * One step insert of a picture (gslides-parity SPEC 7.2.14): asset.add with the alt from the
   * file name and the capture role, then the block or slide write once the asset has reached the
   * document over the watch channel: a drop on an image block replaces its picture, a drop on the
   * background of a picture slide replaces the slide's, anything else inserts a picture block.
   */
  const insertPicture = async (
    file: File,
    where: { blockId?: string; point?: Point; replace?: boolean } = {},
  ): Promise<void> => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > PICTURE_MAX_BYTES) {
      notice(PICTURE_SIZE_NOTICE);
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    const taken = new Set(Object.keys(docRef.current.deck.assets));
    const id = assetIdFor(file.name, taken);
    let asset: Asset;
    try {
      asset = (await call('asset.add', {
        id,
        file: dataUrl,
        role: 'capture',
        alt: altFor(file.name),
      })) as Asset;
    } catch {
      return;
    }
    const landed = await waitFor(
      () => docRef.current.deck.assets[asset.id] !== undefined,
      ASSET_WAIT_MS,
    );
    if (!landed) {
      notice('The picture did not reach this presentation; try the drop again');
      return;
    }
    const slideNow = slideRef.current;
    if (!slideNow) return;
    const target = where.blockId !== undefined ? blockById(slideNow, where.blockId) : undefined;
    if (target && target.type === 'shot') {
      commit([
        {
          op: 'block.set',
          slideId: slideNow.id,
          blockId: target.id,
          path: '/asset',
          value: asset.id,
        },
      ]);
      select({ kind: 'block', blockId: target.id });
      return;
    }
    if (where.replace === true && target === undefined && 'picture' in slideNow) {
      commit([{ op: 'slide.set', slideId: slideNow.id, path: '/picture/asset', value: asset.id }]);
      return;
    }
    const blockId = freeId('shot', takenBlockIds(slideNow));
    const block: Block = { id: blockId, type: 'shot', asset: asset.id };
    const selected = selectedBlockId(selectionRef.current) ?? undefined;
    if (isFreeformSlide(slideNow)) {
      const [ox, oy] = CONTENT_ORIGIN;
      const [w, h] = DROP_PICTURE_SIZE;
      const at = where.point ?? { x: ox, y: oy };
      const maxZ = Math.max(0, ...freeformBlocks(slideNow).map((b) => b.pos?.z ?? 0));
      pendingSelect.current = [blockId];
      commit([
        {
          op: 'block.insert',
          slideId: slideNow.id,
          slot: 'main',
          block: {
            ...block,
            pos: {
              x: Math.round(at.x / 8) * 8,
              y: Math.round(at.y / 8) * 8,
              w,
              h,
              z: maxZ + 1,
            },
          },
        },
      ]);
      return;
    }
    const slot = insertSlotFor(slideNow, selected);
    if (slot === null) return;
    pendingSelect.current = [blockId];
    commit([
      {
        op: 'block.insert',
        slideId: slideNow.id,
        slot,
        ...(selected !== undefined ? { after: selected } : {}),
        block,
      },
    ]);
  };

  /** What the menu model reads about the selection (menus/model.ts MenuContext.selection). */
  const menuSelection = (): EditorMenuSelection => {
    const slideNow = slideRef.current;
    const current = selectionRef.current;
    const ids = selectedIds(current, extraRef.current);
    const anchor = ids[0];
    const block = slideNow && anchor !== undefined ? blockById(slideNow, anchor) : undefined;
    const type = slideNow && anchor !== undefined ? blockTypeOf(slideNow, anchor) : undefined;
    const editingNow = editingRef.current;
    const pointer = editingNow?.pointer ?? (current?.kind === 'run' ? current.pointer : undefined);
    const free = isFreeformSlide(slideNow);
    let order = { forward: false, backward: false, front: false, back: false };
    if (slideNow && block && free) {
      const stack = sortByZ(freeformBlocks(slideNow)).map((b) => b.id);
      const at = stack.indexOf(block.id);
      order = {
        forward: at >= 0 && at < stack.length - 1,
        backward: at > 0,
        front: at >= 0 && at < stack.length - 1,
        back: at > 0,
      };
    } else if (slideNow && block) {
      const located = locateBlock(slideNow, block.id);
      if (located) {
        order = {
          forward: located.index < located.blocks.length - 1,
          backward: located.index > 0,
          front: located.index < located.blocks.length - 1,
          back: located.index > 0,
        };
      }
    }
    const linked =
      (block !== undefined && block.link !== undefined) ||
      (slideNow !== undefined &&
        anchor !== undefined &&
        pointer !== undefined &&
        markupHasLink(readRunText(slideNow, anchor, pointer)));
    return {
      blocks: ids.length,
      ...(anchor !== undefined ? { block: blockFamily(type) } : {}),
      textBlock:
        isTextBlockType(type) ||
        (slideNow?.kind === 'title' && anchor !== undefined) ||
        (slideNow?.kind === 'statement' && anchor !== undefined),
      listItem:
        pointer !== undefined &&
        listItemPointer(pointer) !== null &&
        (block?.type === 'plain' || block?.type === 'rows' || block?.type === 'refs'),
      tableCell: block?.type === 'table' && pointer !== undefined && cellPointer(pointer) !== null,
      linked,
      order,
      editing: editingNow !== null,
      freeform: free,
    };
  };

  /* the imperative surface, handed once and kept current through the refs it reads */
  const handleRef = useRef(onHandle);
  handleRef.current = onHandle;
  const api = useRef<EditorHandle | null>(null);
  if (api.current === null) {
    api.current = {
      cut: () => copySelection(true),
      copy: () => copySelection(false),
      paste: async (options = {}) => {
        const payload = await clipboardRef.current.read();
        await pastePayload(payload, options.plain === true);
      },
      remove: () => {
        removeSelected();
      },
      duplicate: duplicateSelection,
      selectAll,
      deselect: () => select(null),
      order: (move) => {
        const anchor = selectedBlockId(selectionRef.current);
        if (anchor !== null) orderBlock(anchor, move);
      },
      align: (edge, to) => {
        const slideNow = slideRef.current;
        const ids = selectedIds(selectionRef.current, extraRef.current);
        if (!slideNow || ids.length === 0) return;
        if (to !== undefined) {
          void call('block.align', { slideId: slideNow.id, blockIds: ids, edge, to });
          return;
        }
        commit(alignMutations(slideNow, ids, boxesRef.current, edge));
      },
      distribute: (axis) => {
        const slideNow = slideRef.current;
        const ids = selectedIds(selectionRef.current, extraRef.current);
        if (!slideNow || ids.length < 3) return;
        commit(distributeMutations(slideNow, ids, boxesRef.current, axis));
      },
      link: openLink,
      table: tableCommand,
      armPaint,
      disarmPaint,
      paintArmed: () => paintRef.current !== null,
      commitText: () => {
        editingRef.current?.element.blur();
      },
      focus: () => root.current?.focus({ preventScroll: true }),
      menuSelection,
      insertPicture,
    };
  }
  useEffect(() => {
    handleRef.current?.(api.current);
    return () => handleRef.current?.(null);
  }, []);

  // -------------------------------------------------------------------------------------------
  // Keys (gslides-parity SPEC 10.1, 10.2; keys.ts editorKeyAction)

  const openContextMenuFromKeyboard = () => {
    const el = body.current;
    const slideNow = slideRef.current;
    const cb = onContextMenuRef.current;
    if (!el || !slideNow || !cb) return;
    const anchor = selectedBlockId(selectionRef.current);
    const box = anchor !== null ? boxesRef.current.blocks[anchor] : undefined;
    const rect = stageRect();
    if (!rect) return;
    const k = rect.width / 1600 || 1;
    const x = rect.left + (box ? (box[0] + box[2] / 2) * k : rect.width / 2);
    const y = rect.top + (box ? (box[1] + box[3] / 2) * k : rect.height / 2);
    const element =
      (anchor !== null ? el.querySelector<HTMLElement>(`[data-block="${anchor}"]`) : null) ?? el;
    const block = anchor !== null ? blockById(slideNow, anchor) : undefined;
    const family = blockFamily(
      block?.type ?? (anchor !== null ? blockTypeOf(slideNow, anchor) : undefined),
    );
    cb({
      target: anchor === null ? 'emptyCanvas' : family === 'image' ? 'image' : 'textBlock',
      x,
      y,
      element,
      ...(anchor !== null ? { blockId: anchor } : {}),
    });
  };

  /* the edit-mode keys (SPEC 6.9; gslides-parity SPEC 10.1, 10.2), in the capture phase so the
     shell's paging keys yield while a block is selected; inert inside fields and the editable run,
     and over the overlay's handles, which nudge themselves. This handler is the one owner of Tab in
     edit mode, the from-nothing case included: a second handler for that case in the studio route
     moved the selection twice per keydown (its uSES update flushed between the two capture
     listeners). A key pressed on a chrome control outside the stage (isChromeControlTarget) is
     that control's. Cmd C, X and V are left to the browser's copy, cut and paste events, which
     the handlers below answer, so one path serves the keys and the menu. */
  useOnceLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingRef.current || isEditableTarget(e.target)) return;
      if (e.target instanceof Element && e.target.closest('.ts-overlay')) return;
      const el = body.current;
      const slideNow = slideRef.current;
      if (!el || !slideNow) return;
      const current = selectionRef.current;
      const stop = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      /* a key on a chrome control (an inspector button, a swatch, a menu row, a filmstrip card)
         is that control's: only Tab below still reads it, to decide whether the page or the
         browser owns the order */
      const fromControl = isChromeControlTarget(e.target, root.current);
      const apple =
        typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
      if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        /* with nothing selected, Tab from the page (the body, or the stage itself) selects the
           first block and Shift Tab the last (cycleSelection from -1); from a field or a chrome
           button the browser's focus order runs instead */
        const inside = e.target instanceof Node && root.current?.contains(e.target);
        const fromPage = e.target === document.body;
        if (current === null && !inside && !fromPage) return;
        select(cycleSelection(blockOrder(el), current, e.shiftKey ? -1 : 1));
        stop();
        return;
      }
      if (fromControl) return;
      /* Shift F10 and Cmd Shift \ open the right-click menu on the selection (SPEC 13.2) */
      if (
        (e.key === 'F10' && e.shiftKey) ||
        ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === '\\')
      ) {
        if (
          current === null &&
          e.target !== document.body &&
          !root.current?.contains(e.target as Node)
        )
          return;
        openContextMenuFromKeyboard();
        stop();
        return;
      }
      const free = isFreeformSlide(slideNow);
      const action = editorKeyAction(e, {
        selected: current !== null,
        freeform: free,
        editing: false,
        editable: false,
        apple,
      });
      if (action === null) {
        /* no bare letter does anything on the stage (SPEC 0.28); with a block selected the letter
           is consumed, so a stray keystroke never reaches a shell key */
        if (current !== null && isBareCharacterKey(e)) stop();
        return;
      }
      const ids = selectedIds(current, extraRef.current);
      switch (action.type) {
        case 'escape':
          if (paintRef.current) {
            setPaint(null);
            stop();
            return;
          }
          select(escapeSelection(current));
          stop();
          return;
        case 'inert':
          stop();
          return;
        case 'nudge':
          commit(freeNudgeMutations(slideNow, ids, boxesRef.current, action.dx, action.dy));
          stop();
          return;
        case 'enter': {
          if (current === null) return;
          const run = firstRunOf(el, current.blockId);
          if (run) {
            startEdit(run, 'end');
            stop();
          }
          return;
        }
        case 'delete':
          if (removeSelected()) stop();
          return;
        case 'order':
          if (current !== null) {
            if (!free && (action.move === 'front' || action.move === 'back')) {
              orderBlock(current.blockId, action.move);
            } else {
              orderBlock(current.blockId, action.move);
            }
            stop();
          }
          return;
        case 'duplicate':
          void duplicateSelection();
          stop();
          return;
        case 'selectAll': {
          const active = document.activeElement;
          const canvasOwns =
            current !== null ||
            active === document.body ||
            active === null ||
            (root.current?.contains(active) ?? false);
          if (!canvasOwns) return;
          selectAll();
          stop();
          return;
        }
        case 'cut':
        case 'copy':
        case 'paste': {
          /* the browser's copy, cut and paste events carry these (below): the default stays so
             the browser fires them, and the chord stops here so the shell's key table (which
             prevents the default of every Edit menu chord it matches) never swallows it */
          const owns =
            current !== null ||
            e.target === document.body ||
            (e.target instanceof Node && (root.current?.contains(e.target) ?? false));
          if (owns) e.stopImmediatePropagation();
          return;
        }
        case 'link':
          openLink();
          stop();
          return;
        case 'bold':
          toggleWeight();
          stop();
          return;
        case 'paintCopy':
          if (armPaint()) stop();
          return;
        case 'paintPaste': {
          const armed = paintRef.current;
          if (!armed) return;
          for (const id of ids) applyPaint(id);
          stop();
          return;
        }
        case 'tab':
          return;
        default:
          return;
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // bound once; every value it reads comes through a ref
  });

  /* the clipboard events: with a block selected and no text session, Cmd C and Cmd X take the
     blocks (the payload lands on the system clipboard through the event, no permission asked)
     and Cmd V pastes blocks, slides, text or an image file (gslides-parity SPEC 2.2) */
  useEffect(() => {
    const stageOwns = (e: ClipboardEvent): boolean => {
      if (editingRef.current || isEditableTarget(e.target)) return false;
      if (isChromeControlTarget(e.target, root.current)) return false;
      return (
        selectionRef.current !== null ||
        e.target === document.body ||
        (e.target instanceof Node && (root.current?.contains(e.target) ?? false))
      );
    };
    const onCopyOrCut = (e: ClipboardEvent) => {
      if (!stageOwns(e)) return;
      const payload = payloadOfSelection();
      if (!payload) return;
      e.preventDefault();
      e.clipboardData?.setData('text/plain', encodeClipboard(payload));
      void clipboardRef.current.write(payload);
      if (e.type === 'cut') removeSelected();
    };
    const onPaste = (e: ClipboardEvent) => {
      if (!stageOwns(e)) return;
      const files = imageFilesOf(e.clipboardData);
      if (files.length > 0) {
        e.preventDefault();
        const [first] = files;
        if (first) void insertPicture(first);
        return;
      }
      const text = e.clipboardData?.getData('text/plain') ?? '';
      const payload = decodeClipboard(text) ?? clipboardRef.current.last();
      if (payload === null) return;
      e.preventDefault();
      void pastePayload(payload, false);
    };
    document.addEventListener('copy', onCopyOrCut);
    document.addEventListener('cut', onCopyOrCut);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('copy', onCopyOrCut);
      document.removeEventListener('cut', onCopyOrCut);
      document.removeEventListener('paste', onPaste);
    };
  }, []);

  const onHandleDown = (handle: Handle, e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    beginGesture(handle, e.clientX, e.clientY);
  };

  const onHandleNudge = (handle: Handle, delta: number, axis?: 'x' | 'y') => {
    const slideNow = slideRef.current;
    if (!slideNow || gesture.current) return;
    const mutation = nudgeMutation(
      handle,
      { slide: slideNow, boxes: boxesRef.current },
      delta,
      axis ?? (handle.axis === 'y' ? 'y' : 'x'),
    );
    if (mutation) commit([mutation]);
  };

  const onHandleOrder = (handle: Handle, move: OrderMove) => {
    if (handle.blockId === undefined) return;
    orderBlock(handle.blockId, move);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = body.current;
    if (!el || gesture.current) return;
    const id = resolveBlock(e.target, el);
    setHover((prev) => (prev === id ? prev : id));
  };

  /** A press on a block's body arms a drag: past DRAG_START_PX it becomes the chip's gesture. */
  const armPress = (next: Press) => {
    press.current = next;
    const move = (ev: PointerEvent) => {
      const p = press.current;
      if (!p) return;
      if (Math.hypot(ev.clientX - p.clientX, ev.clientY - p.clientY) < DRAG_START_PX) return;
      press.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const slideNow = slideRef.current;
      if (!slideNow) return;
      const chip = chipHandleFor(slideNow, boxesRef.current, p.blockId);
      if (chip) beginGesture(chip, p.clientX, p.clientY);
    };
    const up = () => {
      press.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /** A press on the empty sheet of a freeform slide drags a marquee; a plain click clears. */
  const armMarquee = (clientX: number, clientY: number) => {
    const rect = stageRect();
    if (!rect) return;
    const start = sheetPoint(rect, clientX, clientY);
    let live = false;
    const move = (ev: PointerEvent) => {
      const r = stageRect();
      const slideNow = slideRef.current;
      if (!r || !slideNow) return;
      const box = marqueeBox(start, sheetPoint(r, ev.clientX, ev.clientY));
      if (!live && !isMarquee(box)) return;
      live = true;
      setMarquee(box);
      const order = freeformBlocks(slideNow).map((block) => block.id);
      const hits = selectionOf(marqueeHits(box, boxesRef.current.blocks, order));
      select(hits.selection, hits.extra);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setMarquee(null);
      if (!live) select(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  /**
   * A press with a draw tool (gslides-parity SPEC 3.1 rows 9 to 12): the pointer draws a box in
   * the marquee's ink; the release inserts the tool's block there, or the default box at the
   * press when the pointer did not travel. A text box opens in the caret state (R09 A1); the
   * tool then returns to Select through onToolDone.
   */
  const armDraw = (clientX: number, clientY: number, drawTool: Exclude<EditorTool, 'select'>) => {
    const rect = stageRect();
    if (!rect) return;
    const start = sheetPoint(rect, clientX, clientY);
    const move = (ev: PointerEvent) => {
      const r = stageRect();
      if (!r) return;
      const drawn = drawnBox(drawTool, start, sheetPoint(r, ev.clientX, ev.clientY));
      setMarquee(drawn.dragged ? drawn.box : null);
    };
    const finishDraw = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finishDraw);
      window.removeEventListener('pointercancel', cancel);
      setMarquee(null);
      const r = stageRect();
      const slideNow = slideRef.current;
      if (!r || !slideNow) return;
      const drawn = drawnBox(drawTool, start, sheetPoint(r, ev.clientX, ev.clientY));
      const type = toolBlockType(drawTool);
      const id = freeId(type, takenBlockIds(slideNow));
      const selected = selectedBlockId(selectionRef.current) ?? undefined;
      const mutation = toolInsertMutation(
        slideNow,
        drawTool,
        id,
        drawn.box,
        insertSlotFor(slideNow, selected),
        selected,
      );
      if (mutation) {
        if (drawTool.kind === 'text')
          pendingEdit.current = { blockId: id, pointer: 'text', caret: 'end' };
        else pendingSelect.current = [id];
        commit([mutation]);
      }
      onToolDoneRef.current?.();
    };
    const cancel = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finishDraw);
      window.removeEventListener('pointercancel', cancel);
      setMarquee(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finishDraw);
    window.addEventListener('pointercancel', cancel);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = body.current;
    const slideNow = slideRef.current;
    if (!el || !slideNow || e.button !== 0) return;
    const current = editingRef.current;
    /* a click inside the editable run is the caret's; one outside ends the edit through its blur */
    if (current) return;
    const drawTool = toolRef.current;
    if (drawTool !== 'select') {
      e.preventDefault();
      armDraw(e.clientX, e.clientY, drawTool);
      return;
    }
    const id = resolveBlock(e.target, el);
    /* paint format armed: the click paints the block and nothing else (SPEC 3.1 row 6) */
    if (paintRef.current && id !== null) {
      e.preventDefault();
      applyPaint(id);
      select({ kind: 'block', blockId: id });
      return;
    }
    const free = isFreeformSlide(slideNow);
    if (id === null) {
      if (free) armMarquee(e.clientX, e.clientY);
      else select(null);
      return;
    }
    const selected = selectedIds(selectionRef.current, extraRef.current);
    if (e.shiftKey || (free && (e.metaKey || e.ctrlKey))) {
      const toggled = toggleSelected(selectionRef.current, extraRef.current, id);
      select(toggled.selection, toggled.extra);
      return;
    }
    /* a single click inside text places the caret there (gslides-parity SPEC 10.2, R09 A1);
       the block's frame and the overlay's handles are the drag surface */
    const run = resolveRun(e.target, el);
    if (run && run.blockId === id) {
      const text = readRunText(slideNow, run.blockId, run.pointer);
      if (text !== undefined) {
        startEdit(run, { x: e.clientX, y: e.clientY });
        return;
      }
    }
    if (!selected.includes(id)) {
      // a click on a block of the group keeps the group, so the drag that follows moves it whole
      select({ kind: 'block', blockId: id });
    }
    /* real blocks drag by their body: to reorder on a grammar slide, anywhere on a freeform one;
       the text of a title or statement slide is a field and has no chip */
    if (blockById(slideNow, id)) {
      armPress({ blockId: id, clientX: e.clientX, clientY: e.clientY });
    }
  };

  /* links are text on the stage in edit mode, never navigation */
  const onClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.target instanceof Element && e.target.closest('a')) e.preventDefault();
  };

  /** A right-click: the target of gslides-parity SPEC 4.3 for the chrome's menu; inside an editing session the browser's own menu carries the spelling suggestions. */
  const onContextMenuEvent = (e: ReactMouseEvent<HTMLDivElement>) => {
    const cb = onContextMenuRef.current;
    const el = body.current;
    const slideNow = slideRef.current;
    if (!cb || !el || !slideNow) return;
    const current = editingRef.current;
    if (current && e.target instanceof Node && current.element.contains(e.target)) return;
    e.preventDefault();
    const id = resolveBlock(e.target, el);
    const run = resolveRun(e.target, el);
    const element =
      (e.target instanceof Element ? e.target.closest<HTMLElement>('[data-block]') : null) ?? el;
    if (id === null) {
      cb({ target: 'emptyCanvas', x: e.clientX, y: e.clientY, element });
      return;
    }
    const block = blockById(slideNow, id);
    const family = blockFamily(block?.type ?? blockTypeOf(slideNow, id));
    if (!selectedIds(selectionRef.current, extraRef.current).includes(id)) {
      select({ kind: 'block', blockId: id });
    }
    const cell = block?.type === 'table' && run ? cellPointer(run.pointer) : null;
    if (cell && run) {
      select({ kind: 'run', blockId: id, pointer: run.pointer });
      cb({
        target: 'tableCell',
        x: e.clientX,
        y: e.clientY,
        element,
        blockId: id,
        cell: { ...cell, pointer: run.pointer },
      });
      return;
    }
    cb({
      target: family === 'image' ? 'image' : 'textBlock',
      x: e.clientX,
      y: e.clientY,
      element,
      blockId: id,
    });
  };

  /* drop to insert or replace a picture (gslides-parity SPEC 7.2.14, task 4 of 11.2) */
  const onDragOver = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDrop = (e: ReactDragEvent<HTMLDivElement>) => {
    const files = imageFilesOf(e.dataTransfer);
    const el = body.current;
    if (files.length === 0 || !el) return;
    e.preventDefault();
    const rect = stageRect();
    const point = rect ? sheetPoint(rect, e.clientX, e.clientY) : undefined;
    const id = resolveBlock(e.target, el);
    const [first] = files;
    if (!first) return;
    void insertPicture(first, {
      ...(id !== null ? { blockId: id } : {}),
      ...(point ? { point } : {}),
      replace: id === null,
    });
  };

  const pad = present ? SHEET_PAD.present : narrow ? SHEET_PAD.narrow : SHEET_PAD.wide;
  const fitted = fitSheetAt({ aw: stageSize.width, ah: stageSize.height, pad, zoom });
  /* the same placement Sheet makes: under the toolbar on a narrow viewport */
  const fit = narrow && !present && zoom === 'fit' ? { ...fitted, top: pad } : fitted;
  const k = fit.scale;

  const selectedId = selectedBlockId(selection);
  const ids = selectedIds(selection, extra);
  const selectionBox =
    selection === null
      ? null
      : selection.kind === 'run'
        ? (boxes.runs[`${selection.blockId}/${selection.pointer}`] ??
          boxes.blocks[selection.blockId] ??
          null)
        : (boxes.blocks[selection.blockId] ?? null);
  const extraBoxes = extra.flatMap((id) => {
    const box = boxes.blocks[id];
    return box ? [box] : [];
  });
  const group = ids.length > 1 ? groupBoxOf(ids, boxes) : null;
  const hoverBox =
    hover !== null && !ids.includes(hover) && !activeHandle ? (boxes.blocks[hover] ?? null) : null;
  const handles = shownSlide && !editing ? handlesFor(shownSlide, boxes, selection) : [];
  const lint: LintBox[] =
    lintLayer && findings
      ? findings.flatMap((finding): LintBox[] => {
          if (finding.slideId !== slideId) return [];
          const box =
            finding.evidence.box ??
            (finding.blockId !== undefined ? boxes.blocks[finding.blockId] : undefined);
          if (!box) return [];
          return [
            {
              id: finding.id,
              rule: finding.rule,
              severity: finding.severity,
              box,
              ...(finding.blockId !== undefined ? { blockId: finding.blockId } : {}),
            },
          ];
        })
      : [];

  /* the clearance ring follows the preview document, so it moves with the label under the pointer */
  const active = activeHandle !== null ? handles.find((h) => h.id === activeHandle) : undefined;
  const clearance =
    active && shownSlide && active.kind === 'dia-label'
      ? labelClearanceBox(shownSlide, active, boxes)
      : null;

  /* the arrange actions of a freeform selection: each is one write */
  const arrange: ArrangeActions | null =
    freeform && selectedId !== null && !editing
      ? {
          count: ids.length,
          canDistribute: ids.length >= 3,
          align: (edge) => {
            const slideNow = slideRef.current;
            if (slideNow) commit(alignMutations(slideNow, ids, boxesRef.current, edge));
          },
          distribute: (axis) => {
            const slideNow = slideRef.current;
            if (slideNow) commit(distributeMutations(slideNow, ids, boxesRef.current, axis));
          },
          zOrder: (move) => orderBlock(selectedId, move),
        }
      : null;

  const chip =
    selectedId !== null && shownSlide
      ? `${blockDisplayName(shownSlide, selectedId)}${showIds ? ` · ${selectedId}` : ''}`
      : null;

  const view: EditorOverlayView = {
    slideId,
    k,
    boxes,
    hover: hoverBox,
    selection,
    selectionBox,
    chip,
    handles,
    activeHandle,
    drop,
    dropSlot,
    lint,
    editing: editing !== null,
    alt,
    clearance: clearance ? { box: clearance.box, ok: clearance.ok } : null,
    freeform,
    extraBoxes,
    groupBox: group,
    count: ids.length,
    marquee,
    guides,
    arrange,
    paint: paint !== null,
    onHandleDown,
    onHandleNudge,
    onHandleOrder,
  };

  const backdrop = backdropFor(shown, shownSlide, theme, assetBase);
  const isPicture = backdrop !== undefined;
  const editingBox = editing
    ? (boxes.runs[`${editing.blockId}/${editing.pointer}`] ?? boxes.blocks[editing.blockId] ?? null)
    : null;

  const rootClass = [
    'ts-stagewrap ts-sheet ts-editor',
    isPicture && 'is-picture',
    freeform && 'is-freeform',
  ]
    .filter(Boolean)
    .join(' ');

  const toolName = tool === 'select' ? undefined : tool.kind;

  return (
    <>
      <div
        ref={root}
        className={rootClass}
        data-theme={theme}
        data-editing={editing ? '' : undefined}
        data-marquee={marquee ? '' : undefined}
        data-tool={toolName}
        data-paint={paint ? '' : undefined}
        tabIndex={-1}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <div className="backdrop" aria-hidden="true">
          {backdrop ? <img src={backdrop} alt="" /> : null}
        </div>
        <Sheet
          stageSize={stageSize}
          zoom={zoom}
          present={present}
          narrow={narrow}
          dir="next"
          edges={false}
        >
          <Frame index={index} total={total} />
          <div
            key={slideId}
            ref={body}
            className="pt-slide"
            data-slide-id={slideId}
            onPointerMove={onPointerMove}
            onPointerLeave={() => setHover(null)}
            onPointerDown={onPointerDown}
            onClick={onClick}
            onContextMenu={onContextMenuEvent}
            dangerouslySetInnerHTML={{ __html: shownHtml }}
          />
          {/* the live shader over every material frame of the slide (SPEC 5.3, 5.4; M5) */}
          <MaterialMount body={body} html={shownHtml} onError={onError} />
        </Sheet>
      </div>
      {/* the overlay layer (SPEC 2.2 junction table): chrome, over the sheet's box, in CSS pixels */}
      <div
        className="ts-overlay ts-chrome"
        data-active-handle={activeHandle ?? undefined}
        data-alt={alt ? '' : undefined}
        data-freeform={freeform ? '' : undefined}
        style={{ left: fit.left + 1, top: fit.top + 1, width: fit.width, height: fit.height }}
        hidden={stageSize.width <= 0}
      >
        {overlay ? overlay(view) : null}
        {editing && editingBox ? (
          <InlineText
            key={`${slideId}:${editing.blockId}/${editing.pointer}`}
            element={editing.element}
            box={editingBox}
            k={k}
            multiline={editing.multiline}
            caret={editing.caret}
            autoLink={editing.link === true}
            onBurst={onBurst}
            onEnd={endEdit}
            onListEnter={onListEnter}
            onListBackspace={onListBackspace}
            onInput={measure}
            onUndo={() => onUndoRef.current?.()}
            onRedo={() => onRedoRef.current?.()}
          />
        ) : null}
      </div>
    </>
  );
}
