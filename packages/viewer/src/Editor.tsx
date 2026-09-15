// The stage in edit mode (SPEC 6.4; gslides-parity SPEC 4.3, 7.2.14, 7.2.15, 10.2; SPEC-2
// sections 1 and 6): the theme's .ts-sheet root, the fitted sheet with the frame at the fit or at
// the View > Zoom factor, the slide rendered through renderSlide as innerHTML (SPEC 5.3: React
// owns chrome, overlays and view state only) with the prompts of empty placeholders, the measured
// object boxes, hover and selection, the gestures with a live preview from a draft document,
// inline text editing, the draw tools, the clipboard and paint format, drop to insert or replace a
// picture, the right-click classification the chrome's context menu draws, and the overlay layer
// the chrome fills. Nothing here reaches the document except through an action-table call (SPEC
// 7.1): a drag ends in one call that `dispatch` receives as the same `block.set`, `block.move` or
// `slide.update` call the CLI and the MCP server make, with the document's revision as
// baseRevision. The owner of the client store (undo, autosave, conflicts; SPEC 6.7) provides
// `dispatch`.
//
// Every slide is a canvas (Kevin's directive of 2026-09-12, SPEC-2 1.1): every top level block of
// every slide kind, a title's mark, heading and lead, a statement's big line, a picture kind's
// photograph, plate and plate blocks are objects a person drags, resizes, rotates, reorders,
// groups, duplicates, deletes and edits in place. The first canvas gesture on a slide that is not
// on the freeform layout converts it losslessly and travels the conversion in the same write
// (SPEC-2 1.6): the gesture previews over a provisional conversion from the stage's boxes, and the
// release measures the slide on a hidden 1x sheet (canvas-measure.ts, the one measurer the CLI
// shares) and commits one `slide.update` of `[slide.replace, ...the gesture's writes]`, one
// revision and one undo step. Typing, table commands, typography, colour, Apply layout and Delete
// of a block stay grammar writes and never convert. Selection, hover, Tab and a right-click never
// write. The overlay draws a rotated object's ring from `pos` (SPEC-2 1.5), the readouts, the
// deck's guides and the rulers; zoom and pan are view state through `onZoom`.
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
import type { Block, BlockType, ShotTrim } from '@turboslide/schema/blocks';
import type { TableBlock, TableCommand } from '@turboslide/schema/blocks/table';
import { applyTableCommand } from '@turboslide/schema/blocks/table';
import type { GuidesInput } from '@turboslide/schema/canvas';
import { GUIDE_CENTRE } from '@turboslide/schema/canvas';
import { isMultilinePath } from '@turboslide/schema/catalog';
import type { Color } from '@turboslide/schema/color';
import { detachConnectors, followConnectors } from '@turboslide/schema/connect';
import type { DeckDocument, DeckGuides, Slide } from '@turboslide/schema/deck';
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
import type { Position } from '@turboslide/schema/position';
import { applyMutations } from '@turboslide/schema/reduce';
import type { Box } from '@turboslide/schema/render';
import { isClosedShapeKind } from '@turboslide/schema/shapes';
import type { Text as Markup } from '@turboslide/schema/text';
import { canonicalText, parseText, plainLength } from '@turboslide/schema/text';
import type { RunMarks } from '@turboslide/schema/text';
import { TYPE_LADDER } from '@turboslide/schema/typography';
import { CONTENT_ORIGIN } from '@turboslide/theme/tokens';

import { measureForCanvas, measureForFit, virtualObjectIds } from './canvas-measure';
import type { FitMeasure, VirtualObjectId } from './canvas-measure';
import {
  altFor,
  assetIdFor,
  clipboardStore,
  decodeClipboard,
  encodeClipboard,
  fileToDataUrl,
  freeId,
  imageFilesOf,
  paintFormatOf,
  paintMutations,
  pastedBlockInserts,
  pastedSlideInserts,
  PICTURE_MAX_BYTES,
  takenBlockIds,
} from './clipboard';
import type { ClipboardPayload, ClipboardStore, PaintFormat } from './clipboard';
import { cropByHandle, fullExtent, isNoTrim, NO_TRIM, normalizeTrim, panCrop } from './crop';
import { Frame } from './Frame';
import {
  alignMutations,
  boundingBoxOf,
  distributeMutations,
  expandGroups,
  freeformBlocks,
  freeNudgeMutations,
  freshGroupTag,
  groupBox as groupBoxOf,
  groupMembers,
  groupMutations,
  isFreeformSlide,
  isObjectId,
  measureBoxes,
  objectIds,
  placedOf,
  posFor,
  selectionUnion,
  sharedGroup,
  toFreeform,
  ungroupMutations,
  zOrderMutations,
} from './Freeform';
import type { FreeformSlide } from './Freeform';
import {
  actionForMutations,
  blockMoveFor,
  blockMoveHandle,
  centredBox,
  drawnBox,
  drawnLineOrientation,
  EMPTY_BOXES,
  freeGesture,
  gestureMutation,
  handlesFor,
  isLineBlock,
  isLineTool,
  isPointTool,
  isScribbleTool,
  labelClearanceBox,
  locateBlock,
  nudgeMutation,
  pathFromPoints,
  SCRIBBLE_SAMPLE_PX,
  sheetPoint,
  simplifyPoints,
  siteUnder,
  sitesUnder,
  TOOL_DEFAULT_SIZE,
  toolBlockType,
  toolInsertMutation,
} from './Gestures';
import type {
  EditorTool,
  FreeContext,
  GestureContext,
  GestureMods,
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
import type {
  CaretInfo,
  CaretPlacement,
  InlineTextEndReason,
  InlineTextHandle,
} from './InlineText';
import { editorKeyAction, isBareCharacterKey } from './keys';
import { toggleMark } from './marks';
import type { ToggleMark } from './marks';
import { isMarquee, marqueeBox, marqueeHits } from './Marquee';
import { MaterialMount } from './MaterialMount';
import { isPictureKind } from './model';
import { flipMutations, ROTATE_READOUT_MS, rotateMutations } from './rotate';
import { inchesLabel, rulerToSheet } from './rulers-model';
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
  objectContextTarget,
  resolveObject,
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
import { boxSnapLines, deckGuideLines, sheetEdgeLines, sheetSnapLines } from './snap';
import { applyThemeToTree } from './theme';
import type { Theme } from './theme';
import { centerKeepingPoint, clampZoom, scrollForCenter, stepZoom, zoomFromWheel } from './zoom';

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
 * The arrange actions of a selection, the stage's side of block.align, block.distribute and
 * block.order with the schema's vocabulary; the context menu calls them.
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

/** The rulers' state the overlay draws (SPEC-2 6.1 row 29): on, the scale and the selection's extent. */
export type RulersView = {
  on: boolean;
  /** the pointer over the stage in sheet pixels, for the hairline; null off the stage */
  pointer: Point | null;
  /** the selection's bounding box in sheet pixels, shaded on both rulers */
  selection: Box | null;
};

/**
 * A guide being dragged: its axis, its live position in sheet pixels, the inch readout (SPEC-2
 * 0.86) and, for a stored guide, the position it started from (a drag out of a ruler has none).
 */
export type DraggingGuide = { axis: 'x' | 'y'; at: number; label: string; from?: number };

/** Crop mode's state for the overlay (SPEC-2 6.1 row 19): the frame, the full picture behind it and the trim. */
export type CropView = { blockId: string; frame: Box; full: Box; trim: ShotTrim };

/** What the Editor hands the overlay layer on every render (SPEC 6.4); the chrome's Overlay draws it. */
export type EditorOverlayView = {
  slideId: string;
  /** the stage scale: sheet pixels times k are CSS pixels inside the overlay */
  k: number;
  boxes: MeasuredBoxes;
  /** the sheet body (`.pt-slide`) the remote carets are measured in (SPEC-3 4.4); null before the mount */
  body: HTMLElement | null;
  /** the block under the pointer, when it is not the selected one */
  hover: Box | null;
  selection: Selection;
  /** the selected block's or run's box */
  selectionBox: Box | null;
  /** the selected object's position, so the ring and the handles rotate and flip with it (SPEC-2 1.5) */
  selectionPos: Position | null;
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
  /** the slide is a canvas: blocks carry `pos` */
  freeform: boolean;
  /** the boxes of the other selected blocks of a multi-selection; the anchor is selectionBox */
  extraBoxes: Box[];
  /** the union box while more than one block is selected */
  groupBox: Box | null;
  /** the group tag the selection shares (the ring carries role="group", the chip reads "Group") */
  groupTag: string | null;
  /** the member names of a group, for the ring's accessible name */
  groupMembers: string[];
  /** the selected block count */
  count: number;
  /** the marquee being dragged, or the box a draw tool is drawing */
  marquee: Box | null;
  /** the snap guides of the gesture under way */
  guides: Guide[];
  /** the arrange actions of a selection, null when none applies */
  arrange: ArrangeActions | null;
  /** paint format is armed: the next click paints */
  paint: boolean;
  /** the live angle while a rotation is down or for 600 ms after a rotate key (SPEC-2 0.86) */
  rotation: number | null;
  /** the live size while a resize is down, in sheet pixels */
  sizeReadout: { w: number; h: number } | null;
  /** the rulers (SPEC-2 6.1 row 29); null while View > Show ruler is off */
  rulers: RulersView | null;
  /** the deck's guides while View > Guides > Show guides is on */
  deckGuides: DeckGuides | null;
  /** a guide being dragged, with its inch readout */
  draggingGuide: DraggingGuide | null;
  /** crop mode (SPEC-2 6.1 row 19) */
  crop: CropView | null;
  /** the connection sites of the shape under a dragged line end or an armed line tool (6 px rings) */
  sites: Point[];
  /** the points placed so far by a Curve or Polyline tool, in sheet pixels */
  drawPoints: Point[];
  onHandleDown: (handle: Handle, event: PointerEvent) => void;
  /** `axis` names the arrow pair for a two-axis handle; the default is the handle's own axis */
  onHandleNudge: (handle: Handle, delta: number, axis?: 'x' | 'y') => void;
  /**
   * Alt with Up or Down on a focused move chip (Overlay.tsx): the paint order of a positioned
   * block, or one step within its slot on a grammar slide; `forward` is Up.
   */
  onHandleOrder: (handle: Handle, move: OrderMove) => void;
  /** a press on a deck guide starts its drag (SPEC-2 6.1 row 30) */
  onGuideDown: (axis: 'x' | 'y', at: number, event: PointerEvent) => void;
  /** a right-click on a deck guide opens its menu */
  onGuideContextMenu: (axis: 'x' | 'y', at: number, event: MouseEvent) => void;
  /** a press on a ruler starts a drag out that creates a guide at the drop (row 29) */
  onRulerDown: (axis: 'x' | 'y', event: PointerEvent) => void;
};

/** The right-click targets of gslides-parity SPEC 4.3 and SPEC-2 4.3 the stage tells apart; the chrome's ContextMenu draws them. */
export type EditorContextTarget =
  | 'emptyCanvas'
  | 'textBlock'
  | 'image'
  | 'tableCell'
  | 'shape'
  | 'line'
  | 'group'
  | 'chart'
  | 'cellRange'
  | 'guide';

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
  /** the guide of a guide target */
  guide?: { axis: 'x' | 'y'; at: number };
};

/** What the menu model's predicates read about the selection (menus/model.ts MenuContext.selection). */
export type EditorMenuSelection = {
  blocks: number;
  blockIds: string[];
  block?: BlockFamily;
  textBlock: boolean;
  listItem: boolean;
  tableCell: boolean;
  linked: boolean;
  order: { forward: boolean; backward: boolean; front: boolean; back: boolean };
  editing: boolean;
  freeform: boolean;
  /* round two (SPEC-2 4.1, section 1) */
  /** the selected blocks are objects of the canvas (top level blocks of any kind) */
  object: boolean;
  /** every selected block carries a pos (the slide is a canvas) */
  positioned: boolean;
  /** the slide is on the freeform layout */
  canvas: boolean;
  /** the selection shares a group tag */
  group?: string;
  /** the editor remembers an ungrouped set whose blocks are still on the slide */
  regroup: boolean;
  /** the selected picture object covers the sheet at the bottom of the stack (SPEC-2 0.100) */
  coversSheet: boolean;
  /** the marks of the caret's run and the plain range, while a run is being edited */
  marks?: RunMarks & { b?: true };
  range?: [number, number];
  /** the selected picture carries a crop, mask or adjustment */
  imageEdited: boolean;
  /** the selected list item's level */
  listLevel?: number;
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
  /** front and back on a canvas; forward and backward everywhere */
  order: (move: OrderMove) => void;
  align: (edge: AlignEdge, to?: AlignTarget) => void;
  distribute: (axis: DistributeAxis) => void;
  /** the link popover on the selected block's first run (Cmd K) */
  link: () => void;
  /** one of the nine table commands on the selected table, at the cell being edited */
  table: (kind: StageTableCommand['kind']) => void;
  /** arms Paint format from the selection: true when the selection carried a look */
  armPaint: (keep?: boolean) => boolean;
  disarmPaint: () => void;
  paintArmed: () => boolean;
  /** ends an editing session as Esc does */
  commitText: () => void;
  focus: () => void;
  menuSelection: () => EditorMenuSelection;
  /**
   * one step insert of a picture (SPEC 7.2.14): asset.add, then block.insert, or the replace of an
   * image block or a picture slide; `background` lands the picture object at the bottom of the
   * stack (Change background > Choose image, SPEC-2 2.6.4; the integrator's seam at merge 2)
   */
  insertPicture: (
    file: File,
    where?: { blockId?: string; point?: Point; replace?: boolean; background?: boolean },
  ) => Promise<void>;
  /* round two: the canvas (SPEC-2 sections 1 and 6) */
  /** converts the slide to the canvas with no other write (slide.toCanvas) */
  toCanvas: () => Promise<void>;
  zoomTo: (zoom: SheetZoom, center?: Point) => void;
  zoomStep: (direction: 1 | -1) => void;
  rotate: (by: number) => void;
  flip: (axis: 'h' | 'v') => void;
  group: () => void;
  ungroup: () => void;
  regroup: () => void;
  cropMode: () => void;
  exitCrop: () => void;
  mask: (shape: string | null) => void;
  centerOnPage: (axis: 'x' | 'y') => void;
  addGuide: (axis: 'x' | 'y', at?: number) => void;
  clearGuides: () => void;
  /** inserts text at the caret, or into a new text box when nothing is being edited */
  insertText: (text: string) => void;
  /** the word art bar's insert */
  wordArt: (text: string) => void;
  /** Edit > Select none */
  selectNone: () => void;
  /** measures and writes the fit of block.autofit on the window transport (SPEC-2 0.64) */
  applyAutofit: (blockId: string) => Promise<void>;
  /** an Insert row's block as an object at the sheet centre (or the box), converting the slide first (SPEC-2 0.8) */
  insertObject: (block: Block, options?: { box?: Box; bottom?: boolean }) => void;
  /** a mark toggled on the caret's range or the selected objects' whole text (the toolbar's buttons) */
  toggleMark: (mark: ToggleMark) => void;
  /** a text or highlight colour on the caret's range */
  setTextColor: (which: 'color' | 'highlight', color: Color | null) => void;
  /** the list item's level or the block's indent, one step (Cmd ] and [) */
  indent: (by: 1 | -1) => void;
  /** the objects' positions, for the Format options fields (Size & rotation, Position) */
  positions: () => { id: string; pos: Position }[];
  /** writes a position field on the selected objects (the Format options fields), converting first */
  setPosition: (blockId: string, pos: Position) => void;
};

/**
 * The nine round one table commands the stage runs by kind alone (SPEC 7.3); the round two
 * commands carry fields and arrive as a plan through the shell's `tableCommand(plan)` (SPEC-2 2.7,
 * B5's table-tools.ts), never through this handle.
 */
type StageTableCommand = Extract<
  TableCommand,
  {
    kind:
      | 'insertRowAbove'
      | 'insertRowBelow'
      | 'insertColumnLeft'
      | 'insertColumnRight'
      | 'deleteRow'
      | 'deleteColumn'
      | 'deleteTable'
      | 'distributeRows'
      | 'distributeColumns';
  }
>;

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
  /**
   * the ids of the selected objects beyond the anchor (a Shift or Cmd click, a marquee, Select
   * all), whenever they change: the page's selection names the anchor alone, so this is the
   * page's signal to read `menuSelection()` again (SPEC-2 4.1: Group, Ungroup, Regroup, Align
   * and Distribute read the whole selection)
   */
  onMultiSelectionChange?: (ids: readonly string[]) => void;
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
  /** the sheet point view.zoom keeps under the stage centre (SPEC-2 0.81); the stage scrolls there when it changes */
  zoomCenter?: Point | null;
  /** the zoom a wheel, a pinch, Cmd+plus or the handle asked for; the route writes view.zoom */
  onZoom?: (zoom: SheetZoom, center?: Point) => void;
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
  /* round two (SPEC-2 6.1 rows 29 to 31) */
  /** the deck's guides, drawn in the overlay while `showGuides` is on and snapped to under `snapGuides` */
  guides?: DeckGuides;
  /** a guide added, moved or removed from the rulers and the overlay: the route writes deck.guides */
  onGuides?: (input: GuidesInput) => void;
  showRuler?: boolean;
  showGuides?: boolean;
  /** View > Snap to > Guides (on unless set) and Grid (off unless set) */
  snapGuides?: boolean;
  snapGrid?: boolean;
  /** a slide converted to the canvas by a gesture (a notice hook; the write travels with the gesture) */
  onCanvasConvert?: (slideId: string) => void;
  /** the caret's marks and range changed inside a run (the toolbar's pressed state) */
  onCaret?: (info: CaretInfo | null) => void;
  /* round three (gslides-parity SPEC-3 5.3, 6.3) */
  /**
   * View > Mode: Editing, Commenting or Viewing. Commenting and Viewing refuse every edit gesture
   * (no handles, no caret, no drag, no write) and keep the selection so a comment can anchor to
   * an object; the root's `data-edit-mode` attribute the editor shell sets is the fallback when
   * the route passes nothing.
   */
  mode?: 'editing' | 'commenting' | 'viewing';
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
  /** the slide is not a canvas: the context holds a provisional conversion and the release measures */
  convert: Mutation | null;
  /** Option was held at the press: the drag drops copies where the pointer releases (SPEC-2 0.79) */
  duplicate: boolean;
  /** the last previewed mutations, so an unchanged move re-renders nothing */
  last: Mutation[] | null;
  /** the last modifiers seen, for the release */
  mods: GestureMods;
};

/** A press on a block's body that may become a drag; CSS pixels. */
type Press = { blockId: string; clientX: number; clientY: number; alt: boolean };

/** A run to edit once the slide re-rendered with it (a new list item, the next cell, a drawn text box). */
type PendingEdit = { blockId: string; pointer: string; caret: CaretPlacement; link?: boolean };

/** Crop mode's live state (SPEC-2 6.1 row 19): the frame and the trim as the handles move them. */
type CropState = {
  blockId: string;
  frame: Box;
  trim: ShotTrim;
  original: { frame: Box; trim: ShotTrim };
};

/** A body drag starts once the pointer has moved this many CSS pixels from the press. */
const DRAG_START_PX = 4;
/** How long the stage waits for a server write (an asset) to reach the document before it gives up. */
const ASSET_WAIT_MS = 20_000;
/** The default box of a dropped picture (palette-data.ts DEFAULT_SIZE shot). */
const DROP_PICTURE_SIZE: [number, number] = [480, 272];
/** Pictures up to 25 MB (gslides-parity SPEC 11.3; the sentence of menus/strings.ts ERRORS.pictureSize). */
const PICTURE_SIZE_NOTICE = 'Pictures up to 25 MB';
/** The indent step of Cmd+] and Cmd+[ in px (SPEC-2 2.2.11). */
const INDENT_STEP_PX = 64;

function backdropFor(document: DeckDocument, slide: Slide | undefined, theme: Theme, base: string) {
  if (!slide || !isPictureKind(slide.kind) || !('picture' in slide)) return undefined;
  const asset = document.deck.assets[slide.picture.asset];
  if (!asset) return undefined;
  if ('neutral' in asset.twins) return base + asset.twins.neutral;
  return base + (theme === 'dark' ? asset.twins.dark : asset.twins.light);
}

/** The chip handle of a block, the one a body drag stands for: free-move. */
function chipHandleFor(
  slide: Slide,
  boxes: MeasuredBoxes,
  blockId: string,
  ids: readonly string[],
): Handle | undefined {
  return handlesFor(slide, boxes, { kind: 'block', blockId }, { ids }).find(
    (h) => h.shape === 'chip',
  );
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

/** The boxes of a canvas slide from its positions, for a gesture over a converted slide. */
function boxesFromPositions(slide: Slide, measured: MeasuredBoxes): MeasuredBoxes {
  const blocks: Record<string, Box> = {};
  for (const block of freeformBlocks(slide)) {
    if (block.pos) blocks[block.id] = [block.pos.x, block.pos.y, block.pos.w, block.pos.h];
  }
  return { ...measured, blocks };
}

/** The next smaller ladder size, or undefined at the bottom (the store action's ladderStepDown). */
function ladderStepDown(size: number): number | undefined {
  const sorted = [...TYPE_LADDER].sort((a, b) => b - a);
  return sorted.find((step) => step < size);
}

/** True for a picture that shows an asset a crop applies to: the picture object or a shot. */
function isCroppable(
  block: Block | undefined,
): block is Extract<Block, { type: 'picture' | 'shot' }> {
  return block !== undefined && (block.type === 'picture' || block.type === 'shot');
}

/** True when the object covers the sheet at the bottom of the stack (the background photograph, SPEC-2 0.100). */
function coversSheet(slide: Slide, blockId: string): boolean {
  const blocks = freeformBlocks(slide);
  const block = blocks.find((each) => each.id === blockId);
  if (!block || block.type !== 'picture' || !block.pos) return false;
  const stack = sortByZ(blocks);
  if (stack[0]?.id !== blockId) return false;
  const b = boundingBoxOf(block.pos);
  return b[0] <= 0 && b[1] <= 0 && b[0] + b[2] >= 1600 && b[1] + b[3] >= 900;
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
  onMultiSelectionChange,
  findings,
  lintLayer = false,
  overlay,
  onError,
  onRemoved,
  zoom = 'fit',
  zoomCenter = null,
  onZoom,
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
  guides: deckGuides,
  onGuides,
  showRuler = false,
  showGuides = false,
  snapGuides = true,
  snapGrid = false,
  onCanvasConvert,
  onCaret,
  mode: modeProp,
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
  /* View > Mode from the root attribute the editor shell sets, when the route passes no prop (SPEC-3 5.3) */
  const [rootMode, setRootMode] = useState<string | null>(null);
  const effectiveMode: 'editing' | 'commenting' | 'viewing' =
    modeProp ?? (rootMode === 'commenting' || rootMode === 'viewing' ? rootMode : 'editing');
  const editable = effectiveMode === 'editing';
  const editableRef = useRef(editable);
  editableRef.current = editable;
  /* the anchor the stage itself set with a multi-selection (Select all, a group click), so the
     effect that ends a multi-selection on an external anchor change leaves it alone
     (VERIFICATION-2 findings 17 and 18) */
  const internalAnchor = useRef<string | null>(null);
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const [drop, setDrop] = useState<Box | null>(null);
  const [dropSlot, setDropSlot] = useState<Box | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [alt, setAlt] = useState(false);
  const [paint, setPaint] = useState<{ format: PaintFormat; keep: boolean } | null>(null);
  /* round two */
  const [crop, setCrop] = useState<CropState | null>(null);
  /* a member selected alone inside its group after a double click (SPEC-2 6.1 row 14) */
  const [groupEntered, setGroupEntered] = useState<string | null>(null);
  const [readout, setReadout] = useState<
    { kind: 'angle'; value: number } | { kind: 'size'; w: number; h: number } | null
  >(null);
  const [space, setSpace] = useState(false);
  const [draggingGuide, setDraggingGuide] = useState<DraggingGuide | null>(null);
  const [pointer, setPointer] = useState<Point | null>(null);
  const [sites, setSites] = useState<Point[]>([]);
  const [drawPoints, setDrawPoints] = useState<Point[]>([]);
  const [scroll, setScroll] = useState({ left: 0, top: 0 });

  const root = useRef<HTMLDivElement>(null);
  /* the editor shell stamps View > Mode on the viewer root; the stage follows it when the route
     passes no `mode` prop (SPEC-3 5.3) */
  useEffect(() => {
    const viewer = root.current?.closest<HTMLElement>('.pt-viewer');
    if (!viewer) return;
    const read = () => setRootMode(viewer.getAttribute('data-edit-mode'));
    read();
    const observer = new MutationObserver(read);
    observer.observe(viewer, { attributes: true, attributeFilter: ['data-edit-mode'] });
    return () => observer.disconnect();
  }, []);
  const body = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
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
  const cropRef = useRef(crop);
  cropRef.current = crop;
  const groupEnteredRef = useRef(groupEntered);
  groupEnteredRef.current = groupEntered;
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const assetBaseRef = useRef(assetBase);
  assetBaseRef.current = assetBase;
  const settingsRef = useRef({ snapGuides, snapGrid, showGuides, showRuler });
  settingsRef.current = { snapGuides, snapGrid, showGuides, showRuler };
  const deckGuidesRef = useRef(deckGuides);
  deckGuidesRef.current = deckGuides;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const spaceRef = useRef(space);
  spaceRef.current = space;
  /* the set Ungroup left, for Regroup (SPEC-2 6.1 row 14) */
  const ungrouped = useRef<{ slideId: string; ids: string[]; tag: string } | null>(null);
  /* the caret's marks and range while a run is being edited */
  const caretRef = useRef<CaretInfo | null>(null);
  const inlineRef = useRef<InlineTextHandle | null>(null);
  /* the points a Curve or Polyline tool placed so far */
  const drawPointsRef = useRef<Point[]>([]);
  const readoutTimer = useRef(0);
  /* the markup shown while a run is edited: frozen at the session's start so a burst's re-render
     never replaces the editable element under the caret */
  const frozenHtml = useRef<string | null>(null);
  /* the markup of the run as the document last held it, what the next burst diffs against */
  const committedText = useRef<Markup>('');
  const pendingEdit = useRef<PendingEdit | null>(null);
  const pendingSelect = useRef<string[] | null>(null);
  /* crop mode to enter once the slide re-rendered with the picture object (a double click on a kind's photograph converts first) */
  const pendingCrop = useRef<string | null>(null);
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onSelectionRef = useRef(onSelectionChange);
  onSelectionRef.current = onSelectionChange;
  const onMultiRef = useRef(onMultiSelectionChange);
  onMultiRef.current = onMultiSelectionChange;
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
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;
  const onGuidesRef = useRef(onGuides);
  onGuidesRef.current = onGuides;
  const onConvertRef = useRef(onCanvasConvert);
  onConvertRef.current = onCanvasConvert;
  const onCaretRef = useRef(onCaret);
  onCaretRef.current = onCaret;
  const clipboardRef = useRef(clipboard);
  clipboardRef.current = clipboard;
  const deckIdRef = useRef(deckId ?? doc.deck.id);
  deckIdRef.current = deckId ?? doc.deck.id;

  const select = (next: Selection, nextExtra: string[] = []) => {
    const anchor = selectedBlockId(next);
    const pruned = anchor === null ? [] : nextExtra.filter((id) => id !== anchor);
    if (pruned.length > 0) internalAnchor.current = anchor;
    if (!jsonEqual(pruned, extraRef.current)) {
      extraRef.current = pruned;
      setExtra(pruned);
    }
    if (jsonEqual(next, selectionRef.current)) return;
    selectionRef.current = next;
    setInnerSelection(next);
    onSelectionRef.current?.(next);
  };

  /** A selection of objects widened to whole groups unless a member was entered (SPEC-2 6.1 row 14). */
  const selectObjects = (ids: readonly string[]) => {
    const slideNow = slideRef.current;
    if (!slideNow || ids.length === 0) {
      select(null);
      return;
    }
    const entered = groupEnteredRef.current;
    const widened =
      entered !== null && ids.length === 1 && ids[0] === entered
        ? [...ids]
        : expandGroups(slideNow, ids);
    const picked = selectionOf(widened);
    select(picked.selection, picked.extra);
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
    /* the stage set this anchor together with the rest of the selection (Cmd+A, a click on a
       group member): the anchor is not in `extra` by construction and the selection stands */
    if (anchorId !== null && internalAnchor.current === anchorId) {
      internalAnchor.current = null;
      return;
    }
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

  /* a selection that leaves the entered group's member ends the entered state */
  useEffect(() => {
    if (groupEntered !== null && anchorId !== groupEntered) setGroupEntered(null);
  }, [anchorId, groupEntered]);

  /* the rest of the multi-selection changed while the anchor stayed (a Shift click, a marquee,
     Select all, a deselect): the page's signal to read menuSelection() again */
  useEffect(() => {
    onMultiRef.current?.(extra);
  }, [extra]);

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
    if (mutations.length === 0 || !editableRef.current) {
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

  /** The slide as the document will hold it after the mutations this tick issued (the reducer applied them; this ref lags one render). */
  const slideAfter = (mutations: ReadonlyArray<Mutation>): Slide | undefined => {
    if (mutations.length === 0) return slideRef.current;
    try {
      return applyMutations(docRef.current, [...mutations]).document.slides[slideIdRef.current];
    } catch {
      return slideRef.current;
    }
  };

  // -------------------------------------------------------------------------------------------
  // The conversion (SPEC-2 1.2, 1.3, 1.6)

  /** The provisional conversion from the stage's boxes: what a gesture previews before the hidden sheet measured. */
  const provisionalCanvas = (
    slideNow: Slide,
    boxesNow: MeasuredBoxes,
  ): { slide: FreeformSlide; replace: Mutation } | null => {
    if (isFreeformSlide(slideNow)) return null;
    const converted = toFreeform(slideNow, boxesNow);
    if (!converted) return null;
    return {
      slide: converted.slide,
      replace: { op: 'slide.replace', slideId: slideNow.id, slide: converted.slide },
    };
  };

  /**
   * The measured conversion (SPEC-2 1.3): the slide rendered once more into a hidden 1x sheet and
   * measured by the one function the CLI shares, so the pos the editor writes equal the CLI's. The
   * stage's boxes stand in when the hidden sheet cannot render (a test without layout).
   */
  const measuredCanvas = async (
    slideNow: Slide,
  ): Promise<{ slide: FreeformSlide; replace: Mutation } | null> => {
    if (isFreeformSlide(slideNow)) return null;
    let converted: ReturnType<typeof toFreeform> = null;
    try {
      const measured = await measureForCanvas(docRef.current, slideNow, themeRef.current, {
        assetBase: assetBaseRef.current,
      });
      converted = toFreeform(slideNow, measured);
    } catch (error) {
      onErrorRef.current?.(error);
    }
    if (!converted) converted = toFreeform(slideNow, boxesRef.current);
    if (!converted) return null;
    return {
      slide: converted.slide,
      replace: { op: 'slide.replace', slideId: slideNow.id, slide: converted.slide },
    };
  };

  /**
   * The autofit writes after a gesture (SPEC-2 6.2 Autofit, 0.64): the slide as the write leaves
   * it is rendered into the hidden sheet and measured; a `grow` block whose text needs more than
   * its box takes the text height as `pos.h`, a `shrink` block steps its size down the ladder by
   * one, the same one step `block.autofit --apply` writes. Only the blocks the mutations touched.
   *
   * A `grow` block whose box the write resized keeps the box the user set and turns its autofit
   * off (`autofit: 'none'`, Google's "Do not autofit" after a handle drag on a "Resize shape to
   * fit text" box), so the committed box is the previewed box and the height handles can shorten
   * it (hotfix-3 cause R2); a move leaves the fit alone.
   */
  const withAutofit = async (
    slideNow: Slide,
    mutations: Mutation[],
    touched: ReadonlyArray<string>,
  ): Promise<Mutation[]> => {
    const before = docRef.current.slides[slideNow.id];
    const after = (() => {
      try {
        return applyMutations(docRef.current, mutations).document.slides[slideNow.id];
      } catch {
        return undefined;
      }
    })();
    if (!after) return mutations;
    const wasPos = new Map(
      (before ? freeformBlocks(before) : []).map((block) => [block.id, block.pos] as const),
    );
    const resized = (block: Block): boolean => {
      const was = wasPos.get(block.id);
      return (
        block.pos !== undefined &&
        was !== undefined &&
        (was.w !== block.pos.w || was.h !== block.pos.h)
      );
    };
    const candidates = freeformBlocks(after).filter(
      (block) =>
        touched.includes(block.id) &&
        block.pos !== undefined &&
        'autofit' in block &&
        (block.autofit === 'grow' || block.autofit === 'shrink'),
    );
    const out = [...mutations];
    const fitted: Block[] = [];
    for (const block of candidates) {
      if ('autofit' in block && block.autofit === 'grow' && resized(block)) {
        out.push({
          op: 'block.set',
          slideId: after.id,
          blockId: block.id,
          path: '/autofit',
          value: 'none',
        });
        continue;
      }
      fitted.push(block);
    }
    if (fitted.length === 0) return out;
    let measured: FitMeasure;
    try {
      const withSlide: DeckDocument = {
        ...docRef.current,
        slides: { ...docRef.current.slides, [after.id]: after },
      };
      measured = await measureForFit(withSlide, after, themeRef.current, {
        assetBase: assetBaseRef.current,
      });
    } catch {
      return out;
    }
    for (const block of fitted) {
      const fit = measured[block.id];
      const pos = block.pos;
      if (!fit || fit.contentHeight === undefined || !pos || fit.contentHeight <= pos.h + 1)
        continue;
      if ('autofit' in block && block.autofit === 'grow') {
        out.push({
          op: 'block.set',
          slideId: after.id,
          blockId: block.id,
          path: '/pos/h',
          value: Math.ceil(fit.contentHeight),
        });
        continue;
      }
      const typography =
        'typography' in block && block.typography !== undefined ? { ...block.typography } : {};
      const size =
        fit.fontSize ?? (typeof typography.size === 'number' ? typography.size : undefined);
      const step = size !== undefined ? ladderStepDown(size) : undefined;
      if (step === undefined) continue;
      out.push({
        op: 'block.set',
        slideId: after.id,
        blockId: block.id,
        path: '/typography',
        value: { ...typography, size: step },
      });
    }
    return out;
  };

  /**
   * One canvas write (SPEC-2 1.6): `build` reads the canvas slide and its boxes and returns the
   * gesture's mutations; on a slide that is not a canvas yet the measured conversion's
   * `slide.replace` travels first in the same `slide.update`, so the write is one revision and one
   * undo step. The attached connectors follow the objects the write moved (2.4.7) and autofit runs
   * over the objects it touched. The optional `then` runs after the write with the slide as written.
   */
  const commitCanvas = async (
    build: (canvas: Slide, boxesNow: MeasuredBoxes) => Mutation[],
    options: { autofit?: boolean; select?: (canvas: Slide) => string[] | null } = {},
  ): Promise<void> => {
    const slideNow = slideRef.current;
    if (!slideNow) return;
    let canvas: Slide = slideNow;
    let prefix: Mutation[] = [];
    if (!isFreeformSlide(slideNow)) {
      const converted = await measuredCanvas(slideNow);
      if (!converted) return;
      canvas = converted.slide;
      prefix = [converted.replace];
    }
    const boxesNow = isFreeformSlide(slideNow)
      ? boxesRef.current
      : boxesFromPositions(canvas, boxesRef.current);
    const own = build(canvas, boxesNow);
    if (own.length === 0 && prefix.length === 0) {
      setDraft(null);
      return;
    }
    const touched = own.flatMap((m) =>
      m.op === 'block.set' && m.path.startsWith('/pos') ? [m.blockId] : [],
    );
    const followed = followAfter(canvas, [...prefix, ...own], touched);
    let mutations = [...prefix, ...own, ...followed];
    if (options.autofit !== false && touched.length > 0)
      mutations = await withAutofit(slideNow, mutations, touched);
    const wanted = options.select?.(canvas) ?? null;
    if (wanted) pendingSelect.current = wanted;
    commit(mutations);
    if (prefix.length > 0) onConvertRef.current?.(slideNow.id);
  };

  /** The connector follow mutations over the slide as the mutations leave it (SPEC-2 2.4.7). */
  const followAfter = (
    canvas: Slide,
    mutations: ReadonlyArray<Mutation>,
    moved: ReadonlyArray<string>,
  ): Mutation[] => {
    if (moved.length === 0) return [];
    try {
      const after = applyMutations(docRef.current, [...mutations]).document.slides[canvas.id];
      return after ? followConnectors(after, moved) : [];
    } catch {
      return [];
    }
  };

  /** The positions of the selected objects on the canvas the gesture reads (a grammar slide's from the stage's boxes). */
  const selectedPositions = (
    canvas: Slide,
    boxesNow: MeasuredBoxes,
    ids: readonly string[],
  ): { id: string; pos: Position }[] => placedOf(canvas, ids, boxesNow);

  /**
   * One order step for a block: the paint order on a canvas (block.order), one place within its
   * slot on a grammar slide (block.move, the round one reorder, which SPEC-2 1.6 keeps as a grammar
   * write; editor.spec.ts pins Cmd Down on the chip moving the block one place down its slot).
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
    const chip = blockMoveHandle(slideNow, boxesRef.current, blockId);
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

  /* Alt held: the diagram handles take the pointer (SPEC 6.4 Alt-drag); Space held: the stage
     pans (SPEC-2 6.1 row 28); released, or the window loses focus, they yield to selection again */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAlt(true);
      if (
        e.key === ' ' &&
        !editingRef.current &&
        !isEditableTarget(e.target) &&
        !isChromeControlTarget(e.target, root.current) &&
        selectionRef.current === null
      ) {
        setSpace(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAlt(false);
      if (e.key === ' ') setSpace(false);
    };
    const off = () => {
      setAlt(false);
      setSpace(false);
    };
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
  // Text editing (gslides-parity SPEC 7.2.15, 7.4, 10.2; SPEC-2 6.2)

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

  const endEdit = (text: Markup, reason: InlineTextEndReason) => {
    const current = editingRef.current;
    if (!current) return;
    setEditing(null);
    frozenHtml.current = null;
    caretRef.current = null;
    onCaretRef.current?.(null);
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
      case 'list-backspace':
      case 'list-leave': {
        /* Backspace on an empty item removes it and moves the caret to the item before (SPEC 7.4);
           Enter on an empty item leaves the list the same way and selects the block (SPEC-2 6.2) */
        const block = blockById(slideNow, current.blockId);
        const removed = block ? listRemoveMutation(slideNow, block, current.pointer) : null;
        if (!block || !removed) {
          backToBlock();
          return;
        }
        if (removed.pointer === null || reason === 'list-leave') pendingSelect.current = [block.id];
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

  /** Tab at the start of a list item, Cmd ] and Cmd [ in it: the item's level steps 1 to 9 (SPEC-2 6.2 Lists). */
  const onListLevel = (by: 1 | -1): boolean => {
    const current = editingRef.current;
    const slideNow = slideRef.current;
    if (!current || !slideNow) return false;
    const block = blockById(slideNow, current.blockId);
    if (!block || block.type !== 'plain') return false;
    const item = listItemPointer(current.pointer);
    if (item === null) return false;
    const items = [...block.items];
    const target = items[item.index];
    if (!target) return false;
    const level = Math.min(9, Math.max(1, (target.level ?? 1) + by));
    if (level === (target.level ?? 1)) return true;
    const next = { ...target } as typeof target & { level?: number };
    if (level === 1) delete next.level;
    else next.level = level;
    items[item.index] = next;
    commit([
      { op: 'block.set', slideId: slideNow.id, blockId: block.id, path: '/items', value: items },
    ]);
    return true;
  };

  /** Cmd ] and Cmd [ on a text block: the paragraph's left indent steps 64 px (SPEC-2 2.2.11). */
  const indentBlocks = (ids: readonly string[], by: 1 | -1): boolean => {
    const slideNow = slideRef.current;
    if (!slideNow) return false;
    const mutations: Mutation[] = [];
    for (const id of ids) {
      const block = blockById(slideNow, id);
      if (!block || !isTextBlockType(block.type) || block.type === 'table') continue;
      const typography = (block as { typography?: Record<string, unknown> }).typography ?? {};
      const current = typeof typography['indent'] === 'number' ? typography['indent'] : 0;
      const next = Math.max(0, current + by * INDENT_STEP_PX);
      if (next === current) continue;
      const value = { ...typography };
      if (next === 0) delete value['indent'];
      else value['indent'] = next;
      mutations.push({
        op: 'block.set',
        slideId: slideNow.id,
        blockId: id,
        path: '/typography',
        ...(Object.keys(value).length > 0 ? { value } : {}),
      });
    }
    if (mutations.length === 0) return false;
    commit(mutations);
    return true;
  };

  const onIndent = (by: 1 | -1): boolean => {
    const current = editingRef.current;
    return current ? indentBlocks([current.blockId], by) : false;
  };

  const onCaretInfo = (info: CaretInfo) => {
    caretRef.current = info;
    onCaretRef.current?.(info);
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
    if (
      wanted &&
      wanted.every((id) => el.querySelector(`[data-block="${id}"], .free[data-free="${id}"]`))
    ) {
      pendingSelect.current = null;
      const picked = selectionOf(wanted);
      select(picked.selection, picked.extra);
    }
    const cropNext = pendingCrop.current;
    if (cropNext && slideRef.current && blockById(slideRef.current, cropNext)) {
      pendingCrop.current = null;
      window.setTimeout(() => enterCrop(cropNext), 0);
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

  /* a selection that names an object the slide no longer has is dropped */
  useEffect(() => {
    const current = selectionRef.current;
    const slideNow = slideRef.current;
    if (!current || !slideNow || !body.current) return;
    if (blockOrder(body.current).length === 0 && Object.keys(boxes.blocks).length === 0) return;
    if (!isObjectId(slideNow, boxes, current.blockId)) select(null);
  }, [html, boxes]);

  /* crop mode ends when the slide or the picture changes under it; the photograph of an
     unconverted picture kind is a virtual object with no block until the crop's own commit
     converts the slide (enterCropProvisional), so it counts as present (VERIFICATION-3 finding 27:
     the block test alone ended the provisional crop on its first render, chip and handles gone) */
  useEffect(() => {
    if (!crop) return;
    const present =
      slide !== undefined &&
      (blockById(slide, crop.blockId) !== undefined ||
        virtualObjectIds(slide).has(crop.blockId as VirtualObjectId));
    if (!present) setCrop(null);
  }, [slide, crop]);

  /* the zoom centre: the stage scrolls the named sheet point under its centre (SPEC-2 0.81) */
  const pad = present ? SHEET_PAD.present : narrow ? SHEET_PAD.narrow : SHEET_PAD.wide;
  const fitted = fitSheetAt({ aw: stageSize.width, ah: stageSize.height, pad, zoom });
  /* the same placement Sheet makes: under the toolbar on a narrow viewport */
  const fit = narrow && !present && zoom === 'fit' ? { ...fitted, top: pad } : fitted;
  const k = fit.scale;
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || zoom === 'fit') return;
    const center = zoomCenter ?? { x: 800, y: 450 };
    const target = scrollForCenter(center, fit, stageSize);
    el.scrollLeft = target.left;
    el.scrollTop = target.top;
    setScroll({ left: el.scrollLeft, top: el.scrollTop });
    // the scroll follows the zoom, its centre and the stage box
  }, [zoom, zoomCenter, stageSize.width, stageSize.height]);

  // -------------------------------------------------------------------------------------------
  // Gestures (SPEC-2 6.1 rows 7, 9, 11, 20)

  /**
   * The snap context of a canvas gesture on `ids` (SPEC-2 6.1 rows 7 and 31): under Snap to >
   * Guides the sheet's edges and centre, the GT lines, the deck's guides and the resting objects'
   * bounding box edges and centres; under Snap to > Grid the 8 px grid; nothing under both off.
   */
  const freeContextFor = (canvas: Slide, ids: string[], boxesNow: MeasuredBoxes): FreeContext => {
    const settings = settingsRef.current;
    const lines: Guide[] = [];
    const spacing: Box[] = [];
    if (settings.snapGuides) {
      lines.push(
        ...sheetEdgeLines(),
        ...sheetSnapLines(),
        ...deckGuideLines(deckGuidesRef.current),
      );
      for (const block of freeformBlocks(canvas)) {
        if (ids.includes(block.id)) continue;
        const box = block.pos ? boundingBoxOf(block.pos) : boxesNow.blocks[block.id];
        if (box) {
          lines.push(...boxSnapLines(box));
          spacing.push(box);
        }
      }
    }
    return { ids, lines, grid: settings.snapGrid, spacing };
  };

  /** The copies an Option+drag drops (SPEC-2 0.79): every selected object inserted at its dragged pos on top of the stack. */
  const duplicateMutations = (g: ActiveGesture, moved: Mutation[]): Mutation[] => {
    const canvas = g.ctx.slide;
    const taken = takenBlockIds(canvas);
    const stack = freeformBlocks(canvas);
    let z = Math.max(0, ...stack.map((b) => b.pos?.z ?? 0));
    let after = stack[stack.length - 1]?.id;
    const tags = new Map<string, string>();
    const out: Mutation[] = [];
    for (const mutation of moved) {
      if (mutation.op !== 'block.set' || mutation.path !== '/pos') continue;
      const source = blockById(canvas, mutation.blockId);
      if (!source) continue;
      const id = freeId(`${source.id}-2`, taken);
      taken.add(id);
      z += 1;
      const pos = { ...(mutation.value as Position), z };
      if (pos.group !== undefined) {
        let tag = tags.get(pos.group);
        if (tag === undefined) {
          tag = freshGroupTag({ ...canvas, slots: { main: [...stack] } } as Slide, pos.group);
          tags.set(pos.group, tag);
        }
        pos.group = tag;
      }
      const copy = { ...(JSON.parse(JSON.stringify(source)) as Block), id, pos } as Block;
      out.push({
        op: 'block.insert',
        slideId: canvas.id,
        slot: 'main',
        ...(after !== undefined ? { after } : {}),
        block: copy,
      });
      after = id;
    }
    return out;
  };

  /** The mutations a gesture stands for at a point, and what the overlay shows meanwhile. */
  const gestureAt = (
    g: ActiveGesture,
    now: Point,
    mods: GestureMods,
  ): { mutations: Mutation[]; guides: Guide[]; sites: Point[] } => {
    const kind = g.handle.kind;
    if (
      kind === 'free-move' ||
      kind === 'free-resize' ||
      kind === 'free-rotate' ||
      kind === 'line-end'
    ) {
      const result = freeGesture(g.handle, g.ctx, g.start, now, mods);
      if (result?.angle !== undefined) setReadout({ kind: 'angle', value: result.angle });
      else if (result?.size !== undefined)
        setReadout({ kind: 'size', w: result.size.w, h: result.size.h });
      let mutations = result?.mutations ?? [];
      if (g.duplicate && kind === 'free-move') mutations = duplicateMutations(g, mutations);
      return { mutations, guides: result?.guides ?? [], sites: result?.sites ?? [] };
    }
    const mutation = gestureMutation(g.handle, g.ctx, g.start, now);
    return { mutations: mutation === null ? [] : [mutation], guides: [], sites: [] };
  };

  const endGestureState = () => {
    gesture.current = null;
    setActiveHandle(null);
    setDrop(null);
    setDropSlot(null);
    setGuides([]);
    setSites([]);
    setReadout(null);
  };

  const modsOf = (ev: {
    shiftKey: boolean;
    altKey: boolean;
    metaKey: boolean;
    ctrlKey: boolean;
  }): GestureMods => ({
    shift: ev.shiftKey,
    alt: ev.altKey,
    meta: ev.metaKey || ev.ctrlKey,
  });

  /**
   * A gesture from a handle or a body press: the preview follows the pointer through the draft
   * document, the release commits the same mutations once (SPEC 6.4). A canvas gesture on a
   * member of the selection moves the whole selection; on a slide that is not a canvas the
   * gesture previews over the provisional conversion and the release measures and converts (1.6).
   */
  const beginGesture = (
    handle: Handle,
    clientX: number,
    clientY: number,
    options: { duplicate?: boolean } = {},
  ) => {
    const slideNow = slideRef.current;
    const rect = stageRect();
    if (!slideNow || !rect || editingRef.current || gesture.current) return;
    const start = sheetPoint(rect, clientX, clientY);
    const boxesNow = boxesRef.current;
    const canvasKind =
      handle.kind === 'free-move' ||
      handle.kind === 'free-resize' ||
      handle.kind === 'free-rotate' ||
      handle.kind === 'line-end';
    let ctx: GestureContext = { slide: slideNow, boxes: boxesNow };
    let convert: Mutation | null = null;
    if (canvasKind && !isFreeformSlide(slideNow)) {
      const provisional = provisionalCanvas(slideNow, boxesNow);
      if (!provisional) return;
      convert = provisional.replace;
      ctx = { slide: provisional.slide, boxes: boxesFromPositions(provisional.slide, boxesNow) };
    }
    if (handle.blockId !== undefined && canvasKind) {
      const selected = selectedIds(selectionRef.current, extraRef.current);
      const ids = selected.includes(handle.blockId) ? selected : [handle.blockId];
      ctx.free = freeContextFor(ctx.slide, ids, ctx.boxes);
    }
    gesture.current = {
      handle,
      start,
      ctx,
      convert,
      duplicate: options.duplicate === true,
      last: null,
      mods: { shift: false },
    };
    setActiveHandle(handle.id);
    setHover(null);
    if (handle.blockId !== undefined) {
      const selected = selectedIds(selectionRef.current, extraRef.current);
      if (!selected.includes(handle.blockId)) selectObjects([handle.blockId]);
    }
    if (handle.kind === 'block-move' && handle.blockId !== undefined) {
      const first = blockMoveFor(slideNow, handle.blockId, start, ctx.boxes);
      setDrop(first.indicator);
      setDropSlot(first.slotBox);
    }
    const preview = (mutations: Mutation[]) => {
      const g = gesture.current;
      if (!g) return;
      const all = g.convert ? [g.convert, ...mutations] : mutations;
      if (all.length === 0) {
        setDraft(null);
        return;
      }
      try {
        setDraft(applyMutations(docRef.current, all).document);
      } catch {
        // a preview the reducer refuses: the last good preview stays up
      }
    };
    const move = (ev: PointerEvent) => {
      const g = gesture.current;
      const r = stageRect();
      if (!g || !r) return;
      const now = sheetPoint(r, ev.clientX, ev.clientY);
      const mods = modsOf(ev);
      g.mods = mods;
      if (g.handle.kind === 'block-move' && g.handle.blockId !== undefined) {
        const at = blockMoveFor(g.ctx.slide, g.handle.blockId, now, g.ctx.boxes);
        setDrop(at.indicator);
        setDropSlot(at.slotBox);
      }
      const { mutations, guides: nextGuides, sites: nextSites } = gestureAt(g, now, mods);
      setGuides(nextGuides);
      setSites(nextSites);
      if (jsonEqual(mutations, g.last)) return;
      g.last = mutations;
      preview(mutations);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      const g = gesture.current;
      const r = stageRect();
      const mods = g ? { ...g.mods, ...modsOf(ev) } : modsOf(ev);
      endGestureState();
      if (!g || !r) {
        setDraft(null);
        return;
      }
      const now = sheetPoint(r, ev.clientX, ev.clientY);
      if (!g.convert) {
        const { mutations } = gestureAt(g, now, mods);
        void finishCanvasGesture(g, mutations);
        return;
      }
      /* the release on a slide that is not a canvas: measure, convert exactly, re-run the gesture
         over the measured canvas and commit the conversion with the writes as one slide.update */
      void (async () => {
        const measured = await measuredCanvas(slideNow);
        if (!measured) {
          setDraft(null);
          return;
        }
        const exact: ActiveGesture = {
          ...g,
          convert: measured.replace,
          ctx: {
            slide: measured.slide,
            boxes: boxesFromPositions(measured.slide, boxesNow),
            ...(g.ctx.free
              ? {
                  free: freeContextFor(
                    measured.slide,
                    g.ctx.free.ids,
                    boxesFromPositions(measured.slide, boxesNow),
                  ),
                }
              : {}),
          },
        };
        const { mutations } = gestureAt(exact, now, mods);
        await finishCanvasGesture(exact, mutations);
      })();
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

  /** The commit of a gesture: the conversion first, the writes, the connectors that follow and the autofit (SPEC-2 1.6). */
  const finishCanvasGesture = async (g: ActiveGesture, own: Mutation[]): Promise<void> => {
    const canvas = g.ctx.slide;
    const prefix = g.convert ? [g.convert] : [];
    if (own.length === 0) {
      /* a click on a chip writes nothing, and a slide nothing moved on stays unconverted */
      setDraft(null);
      return;
    }
    const kind = g.handle.kind;
    const isCanvasWrite =
      kind === 'free-move' ||
      kind === 'free-resize' ||
      kind === 'free-rotate' ||
      kind === 'line-end';
    if (!isCanvasWrite) {
      commit(own);
      return;
    }
    const touched = own.flatMap((m) =>
      m.op === 'block.set' && m.path.startsWith('/pos') ? [m.blockId] : [],
    );
    const followed = followAfter(canvas, [...prefix, ...own], touched);
    let mutations = [...prefix, ...own, ...followed];
    if (kind === 'free-resize' && touched.length > 0)
      mutations = await withAutofit(slideRef.current ?? canvas, mutations, touched);
    if (g.duplicate) {
      const copies = own.flatMap((m) => (m.op === 'block.insert' ? [m.block.id] : []));
      if (copies.length > 0) pendingSelect.current = copies;
    }
    commit(mutations);
    if (prefix.length > 0) onConvertRef.current?.(canvas.id);
  };

  // -------------------------------------------------------------------------------------------
  // Crop mode (SPEC-2 6.1 row 19, 6.2)

  const enterCropAt = (blockId: string, frame: Box, trim: ShotTrim) => {
    if (editingRef.current) editingRef.current.element.blur();
    select({ kind: 'block', blockId });
    setCrop({ blockId, frame, trim, original: { frame, trim } });
  };

  const enterCrop = (blockId: string) => {
    const slideNow = slideRef.current;
    if (!slideNow) return;
    const block = blockById(slideNow, blockId);
    if (!isCroppable(block)) return;
    const box = boxesRef.current.blocks[blockId];
    if (!box) return;
    const frame: Box = block.pos
      ? [block.pos.x, block.pos.y, block.pos.w, block.pos.h]
      : [Math.round(box[0]), Math.round(box[1]), Math.round(box[2]), Math.round(box[3])];
    enterCropAt(blockId, frame, block.trim ?? NO_TRIM);
  };

  /**
   * Crop mode on the photograph of an unconverted picture kind (VERIFICATION-2 finding 19; SPEC-2
   * 1.1, 7.1): the entry writes nothing. The slide is converted in memory to find the picture
   * object's box, the crop runs on that frame, and the Enter that commits it writes the
   * conversion and the crop as one slide.update through commitCanvas; Esc leaves the slide as it
   * was, unconverted.
   */
  const enterCropProvisional = async (blockId: string): Promise<void> => {
    const slideNow = slideRef.current;
    if (!slideNow) return;
    const converted = await measuredCanvas(slideNow);
    if (!converted || slideRef.current !== slideNow) return;
    const block = blockById(converted.slide, blockId);
    if (!isCroppable(block) || !block.pos) return;
    enterCropAt(
      blockId,
      [block.pos.x, block.pos.y, block.pos.w, block.pos.h],
      block.trim ?? NO_TRIM,
    );
  };

  /** Enter, Esc or a click outside: one write of the trim and the frame, converting the slide first (SPEC-2 1.6 "Crop image"). */
  const exitCrop = (commitCrop = true) => {
    const state = cropRef.current;
    if (!state) return;
    setCrop(null);
    if (!commitCrop) return;
    const trim = normalizeTrim(state.trim);
    const unchanged =
      jsonEqual(trim, normalizeTrim(state.original.trim)) &&
      jsonEqual(state.frame, state.original.frame);
    if (unchanged) return;
    void commitCanvas(
      (canvas) => {
        const block = blockById(canvas, state.blockId);
        if (!block || !isCroppable(block) || !block.pos) return [];
        const mutations: Mutation[] = [];
        if (isNoTrim(trim)) {
          if (block.trim !== undefined)
            mutations.push({
              op: 'block.set',
              slideId: canvas.id,
              blockId: block.id,
              path: '/trim',
            });
        } else if (!jsonEqual(block.trim, trim)) {
          mutations.push({
            op: 'block.set',
            slideId: canvas.id,
            blockId: block.id,
            path: '/trim',
            value: trim,
          });
        }
        const [x, y, w, h] = state.frame;
        if (block.pos.x !== x || block.pos.y !== y || block.pos.w !== w || block.pos.h !== h) {
          mutations.push({
            op: 'block.set',
            slideId: canvas.id,
            blockId: block.id,
            path: '/pos',
            value: { ...block.pos, x, y, w, h },
          });
        }
        return mutations;
      },
      { autofit: false },
    );
  };

  /** A crop handle or a pan inside the frame: the live trim, committed on exit. */
  const beginCropDrag = (dir: Handle['dir'] | 'pan', clientX: number, clientY: number) => {
    const state = cropRef.current;
    const rect = stageRect();
    if (!state || !rect) return;
    const start = sheetPoint(rect, clientX, clientY);
    const origin = { frame: state.frame, trim: state.trim };
    const move = (ev: PointerEvent) => {
      const r = stageRect();
      const current = cropRef.current;
      if (!r || !current) return;
      const now = sheetPoint(r, ev.clientX, ev.clientY);
      const dx = now.x - start.x;
      const dy = now.y - start.y;
      if (dir === 'pan' || dir === undefined) {
        setCrop({ ...current, trim: panCrop(origin.frame, origin.trim, dx, dy) });
        return;
      }
      const next = cropByHandle(origin.frame, origin.trim, dir, dx, dy);
      setCrop({ ...current, frame: next.frame, trim: next.trim });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
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

  /**
   * Delete and Backspace (SPEC-2 6.1 row 17): every selected object in one write. A block of a
   * grammar slide is removed in place (no conversion, 1.6); a kind's object that is not a block
   * (the title's heading, the photograph) converts first so it can leave. The connectors attached
   * to a removed object detach in the same write (2.4.7).
   */
  const removeSelected = (): boolean => {
    const slideNow = slideRef.current;
    if (!slideNow) return false;
    const ids = selectedIds(selectionRef.current, extraRef.current).filter((id) =>
      isObjectId(slideNow, boxesRef.current, id),
    );
    if (ids.length === 0) return false;
    const needsConversion = ids.some((id) => blockById(slideNow, id) === undefined);
    const anchor = ids[0];
    const anchorType = anchor === undefined ? undefined : blockTypeOf(slideNow, anchor);
    select(null);
    if (!needsConversion) {
      const mutations: Mutation[] = ids.map((id) => ({
        op: 'block.remove',
        slideId: slideNow.id,
        blockId: id,
      }));
      commit([...detachConnectors(slideNow, ids), ...mutations]);
    } else {
      void commitCanvas(
        (canvas) => [
          ...detachConnectors(canvas, ids),
          ...ids.flatMap((id): Mutation[] =>
            blockById(canvas, id) ? [{ op: 'block.remove', slideId: canvas.id, blockId: id }] : [],
          ),
        ],
        { autofit: false },
      );
    }
    /* the write is the one block.remove (or one slide.update of several) above; the chrome's
       snackbar names the block and the undo key so the removal is never silent (SPEC 6.9) */
    if (anchor !== undefined)
      onRemovedRef.current?.({ type: (anchorType ?? 'text') as BlockType, id: anchor });
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

  /** A block with the same look as the paste, inserted from a text payload as an object (SPEC-2 0.8). */
  const insertTextBlock = (text: string, point?: Point) => {
    const markup = canonicalText(text.replace(/\r\n?/g, '\n').trim());
    const [w, h] = TOOL_DEFAULT_SIZE.text;
    const box: Box = point ? [point.x, point.y, w, h] : centredBox([w, h]);
    insertObject({ id: 'text', type: 'text', text: markup, autofit: 'grow' } as Block, { box });
  };

  /**
   * A paste of blocks (SPEC-2 0.84): the copies keep their `pos` on another slide and land 16 px
   * right and down on the slide they were copied from; a paste of positioned blocks on a slide
   * that is not a canvas converts it first, so the objects arrive where they were.
   */
  const pasteBlocks = (payload: Extract<ClipboardPayload, { kind: 'blocks' }>) => {
    const slideNow = slideRef.current;
    if (!slideNow) return;
    const positioned = payload.blocks.some((block) => block.pos !== undefined);
    if (!isFreeformSlide(slideNow) && !positioned) {
      const selected = selectedBlockId(selectionRef.current) ?? undefined;
      const planned = pastedBlockInserts(slideNow, payload, {
        sameSlide: payload.deckId === deckIdRef.current && payload.slideId === slideNow.id,
        ...(selected !== undefined ? { selectedBlockId: selected } : {}),
      });
      if (planned.mutations.length === 0) return;
      pendingSelect.current = planned.ids;
      commit(planned.mutations);
      return;
    }
    void commitCanvas(
      (canvas) => {
        const planned = pastedBlockInserts(canvas, payload, {
          sameSlide: payload.deckId === deckIdRef.current && payload.slideId === canvas.id,
        });
        pendingSelect.current = planned.ids;
        return planned.mutations;
      },
      { autofit: false },
    );
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

  /**
   * Cmd+D (SPEC-2 6.1 row 15): the copies 16 px right and down on top of the stack. On a canvas
   * the write is block.duplicate, as the CLI's; on a slide that is not a canvas yet the measured
   * conversion travels with the inserts of the copies in one slide.update (1.6).
   */
  const duplicateSelection = async (): Promise<void> => {
    const slideNow = slideRef.current;
    if (!slideNow) return;
    const ids = selectedIds(selectionRef.current, extraRef.current).filter((id) =>
      isObjectId(slideNow, boxesRef.current, id),
    );
    if (ids.length === 0) return;
    if (isFreeformSlide(slideNow) || ids.every((id) => blockById(slideNow, id) !== undefined)) {
      /* the copies take `<id>-2` and up, as store-actions blockDuplicate names them; the selection
         moves to them once the slide re-renders with them. On a slide that is not a canvas yet the
         store action converts it through the route's measurer and lands each copy after its source
         (integrator merge 2: one implementation for Cmd+D and the CLI, SPEC 7.1; the copy sits
         after its source in the list as round one's text-editing spec pins), so the stage's own
         paste path below serves only a kind's object that is not a block (the photograph, the
         plate, the mark), which block.duplicate cannot name before the conversion */
      const taken = takenBlockIds(slideNow);
      const copies = ids.map((id) => {
        const next = freeId(`${id}-2`, taken);
        taken.add(next);
        return next;
      });
      pendingSelect.current = copies;
      await call('block.duplicate', { slideId: slideNow.id, blockIds: ids });
      return;
    }
    await commitCanvas(
      (canvas) => {
        const payload: Extract<ClipboardPayload, { kind: 'blocks' }> = {
          kind: 'blocks',
          deckId: deckIdRef.current,
          slideId: canvas.id,
          blocks: ids.flatMap((id) => {
            const block = blockById(canvas, id);
            return block ? [JSON.parse(JSON.stringify(block)) as Block] : [];
          }),
        };
        const planned = pastedBlockInserts(canvas, payload, { sameSlide: true });
        pendingSelect.current = planned.ids;
        return planned.mutations;
      },
      { autofit: false },
    );
  };

  /** Cmd+A with the canvas owning focus: every object of the slide (SPEC-2 6.1 row 5). */
  const selectAll = () => {
    const slideNow = slideRef.current;
    if (!slideNow || !body.current) return;
    const ids = objectIds(slideNow, boxesRef.current, blockOrder(body.current)).filter((id) =>
      isFreeformSlide(slideNow) ? true : isObjectId(slideNow, boxesRef.current, id),
    );
    const all = ids.length > 0 ? ids : allBlockIds(slideNow);
    const picked = selectionOf(all);
    select(picked.selection, picked.extra);
  };

  const armPaint = (keep = false): boolean => {
    const blocks = selectedBlocks();
    const source = blocks[0];
    if (!source) return false;
    const format = paintFormatOf(source, caretRef.current?.marks);
    if (Object.keys(format).length === 0) return false;
    setPaint({ format, keep });
    return true;
  };

  const disarmPaint = () => {
    if (paintRef.current) setPaint(null);
  };

  /** Paint format on an object: one block.set per field the target takes, plus the marks over its text (SPEC 3.1 row 6, SPEC-2 0.37). */
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

  /**
   * A mark on the caret's range while a run is being edited, else over the whole text of every
   * selected text object as one text.replace per object (SPEC-2 6.2 "Text marks").
   */
  const toggleMarkOnSelection = (mark: ToggleMark) => {
    if (inlineRef.current) {
      inlineRef.current.toggleMark(mark);
      return;
    }
    const slideNow = slideRef.current;
    if (!slideNow) return;
    const mutations = selectedBlocks().flatMap((block): Mutation[] => {
      const path =
        block.type === 'heading' || block.type === 'paragraph' || block.type === 'text'
          ? '/text'
          : (block.type === 'box' || block.type === 'shape') && typeof block.text === 'string'
            ? '/text'
            : null;
      if (path === null) return [];
      const text = (block as { text?: Markup }).text ?? '';
      const length = plainLength(text);
      if (length === 0) return [];
      const next = canonicalText(toggleMark(text, [0, length], mark));
      if (next === text) return [];
      return [
        {
          op: 'text.replace',
          slideId: slideNow.id,
          blockId: block.id,
          path,
          range: [0, text.length],
          text: next,
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
  const tableCommand = (kind: StageTableCommand['kind']) => {
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
   * An Insert row's block as an object (SPEC-2 0.8, 6.2): centred on the sheet at its default
   * size (or the box given; the Background dialog's picture takes the whole sheet at the bottom of
   * the stack), on top of the stack, converting the slide first. A new text box opens in the caret
   * state.
   */
  const insertObject = (block: Block, options: { box?: Box; bottom?: boolean } = {}) => {
    void commitCanvas(
      (canvas) => {
        const taken = takenBlockIds(canvas);
        const id = freeId(block.id, taken);
        const stack = freeformBlocks(canvas);
        const size = TOOL_DEFAULT_SIZE[block.type as keyof typeof TOOL_DEFAULT_SIZE] ?? [320, 160];
        const box =
          options.box ?? (block.type === 'picture' ? [0, 0, 1600, 900] : centredBox(size));
        const bottom = options.bottom === true || block.type === 'picture';
        const z = bottom ? -1 : Math.max(0, ...stack.map((b) => b.pos?.z ?? 0)) + 1;
        const pos: Position = {
          x: Math.round(box[0]),
          y: Math.round(box[1]),
          w: Math.max(1, Math.round(box[2])),
          h: Math.max(1, Math.round(box[3])),
          z: Math.max(0, z),
        };
        const mutations: Mutation[] = [];
        if (bottom) {
          /* the picture takes z 0 and everything else moves up one, so it is the bottom of the stack */
          for (const each of stack) {
            mutations.push({
              op: 'block.set',
              slideId: canvas.id,
              blockId: each.id,
              path: '/pos/z',
              value: (each.pos?.z ?? 0) + 1,
            });
          }
        }
        const last = stack[stack.length - 1]?.id;
        mutations.push({
          op: 'block.insert',
          slideId: canvas.id,
          slot: 'main',
          ...(last !== undefined ? { after: last } : {}),
          block: { ...block, id, pos } as Block,
        });
        if (block.type === 'text' && (block as { text?: string }).text === '')
          pendingEdit.current = { blockId: id, pointer: 'text', caret: 'end' };
        else pendingSelect.current = [id];
        return mutations;
      },
      { autofit: false },
    );
  };

  /**
   * One step insert of a picture (gslides-parity SPEC 7.2.14): asset.add with the alt from the
   * file name and the capture role, then the block or slide write once the asset has reached the
   * document over the watch channel: a drop on an image block replaces its picture, a drop on the
   * background of a picture slide replaces the slide's, anything else inserts a picture block as
   * an object at the drop (SPEC-2 0.8).
   */
  const insertPicture = async (
    file: File,
    where: { blockId?: string; point?: Point; replace?: boolean; background?: boolean } = {},
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
    if (where.background === true) {
      /* the picture object covering the sheet at the bottom of the stack (SPEC-2 2.6.4) */
      insertObject({ id: 'picture', type: 'picture', asset: asset.id } as Block, { bottom: true });
      return;
    }
    const target = where.blockId !== undefined ? blockById(slideNow, where.blockId) : undefined;
    if (target && (target.type === 'shot' || target.type === 'picture')) {
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
    const [ox, oy] = CONTENT_ORIGIN;
    const [w, h] = DROP_PICTURE_SIZE;
    const at = where.point ?? { x: ox, y: oy };
    insertObject({ id: 'shot', type: 'shot', asset: asset.id } as Block, {
      box: [Math.round(at.x / 8) * 8, Math.round(at.y / 8) * 8, w, h],
    });
  };

  // -------------------------------------------------------------------------------------------
  // The canvas commands the keys, the menu rows and the handle share (SPEC-2 6.1)

  const selectedObjectIds = (): string[] => {
    const slideNow = slideRef.current;
    if (!slideNow) return [];
    return selectedIds(selectionRef.current, extraRef.current).filter((id) =>
      isObjectId(slideNow, boxesRef.current, id),
    );
  };

  const showAngle = (value: number) => {
    setReadout({ kind: 'angle', value });
    window.clearTimeout(readoutTimer.current);
    readoutTimer.current = window.setTimeout(() => setReadout(null), ROTATE_READOUT_MS);
  };

  /** Option+Left and Right, the Rotate rows: one rotation over the selection (about the union for several, SPEC-2 6.2). */
  const rotateSelection = (by: number) => {
    const ids = selectedObjectIds();
    if (ids.length === 0 || editingRef.current) return;
    void commitCanvas((canvas, boxesNow) => {
      const rows = selectedPositions(canvas, boxesNow, ids);
      const mutations = rotateMutations(
        canvas,
        rows,
        { by },
        rows.length > 1 ? 'selection' : 'each',
      );
      const first = mutations[0];
      if (first && first.op === 'block.set' && first.value !== undefined)
        showAngle(((first.value as Position).rotate ?? 0) as number);
      return mutations;
    });
  };

  const flipSelection = (axis: 'h' | 'v') => {
    const ids = selectedObjectIds();
    if (ids.length === 0 || editingRef.current) return;
    void commitCanvas((canvas, boxesNow) =>
      flipMutations(
        canvas,
        selectedPositions(canvas, boxesNow, ids),
        axis,
        ids.length > 1 ? 'selection' : 'each',
      ),
    );
  };

  const groupSelection = () => {
    const ids = selectedObjectIds();
    if (ids.length < 2) return;
    void commitCanvas(
      (canvas) => {
        const tag = freshGroupTag(canvas);
        pendingSelect.current = ids;
        return groupMutations(canvas, ids, tag);
      },
      { autofit: false },
    );
  };

  const ungroupSelection = () => {
    const slideNow = slideRef.current;
    const ids = selectedObjectIds();
    if (!slideNow || ids.length === 0) return;
    const tag = sharedGroup(slideNow, ids);
    if (tag === null) return;
    const members = groupMembers(slideNow, tag);
    ungrouped.current = { slideId: slideNow.id, ids: members, tag };
    setGroupEntered(null);
    commit(ungroupMutations(slideNow, members));
  };

  const regroupSelection = () => {
    const slideNow = slideRef.current;
    const remembered = ungrouped.current;
    if (!slideNow || !remembered || remembered.slideId !== slideNow.id) return;
    const present = remembered.ids.filter((id) => blockById(slideNow, id) !== undefined);
    if (present.length < 2) return;
    const tag = freshGroupTag(slideNow, remembered.tag);
    ungrouped.current = null;
    pendingSelect.current = present;
    commit(groupMutations(slideNow, present, tag));
  };

  const canRegroup = (): boolean => {
    const slideNow = slideRef.current;
    const remembered = ungrouped.current;
    if (!slideNow || !remembered || remembered.slideId !== slideNow.id) return false;
    return remembered.ids.filter((id) => blockById(slideNow, id) !== undefined).length >= 2;
  };

  /** The arrows: 1 px, 10 px with Shift, on every slide kind; the first nudge converts (SPEC-2 0.87). */
  const nudgeSelection = (dx: number, dy: number) => {
    const ids = selectedObjectIds();
    if (ids.length === 0) return;
    void commitCanvas((canvas, boxesNow) => freeNudgeMutations(canvas, ids, boxesNow, dx, dy));
  };

  const alignSelection = (edge: AlignEdge, to?: AlignTarget) => {
    const ids = selectedObjectIds();
    if (ids.length === 0) return;
    void commitCanvas((canvas, boxesNow) => alignMutations(canvas, ids, boxesNow, edge, to));
  };

  const distributeSelection = (axis: DistributeAxis) => {
    const ids = selectedObjectIds();
    if (ids.length < 3) return;
    void commitCanvas((canvas, boxesNow) => distributeMutations(canvas, ids, boxesNow, axis));
  };

  /** Arrange > Order on a canvas or a slide about to become one (block.order); a grammar slot reorder otherwise (orderBlock). */
  const orderSelection = (move: OrderMove) => {
    const slideNow = slideRef.current;
    const anchor = selectedBlockId(selectionRef.current);
    if (!slideNow || anchor === null) return;
    if (isFreeformSlide(slideNow) || blockById(slideNow, anchor) !== undefined) {
      orderBlock(anchor, move);
      return;
    }
    /* a kind's object that is not a block (the photograph, the plate, the mark): convert, then order */
    void commitCanvas((canvas) => zOrderMutations(canvas, anchor, move), { autofit: false });
  };

  /** The Format options fields: one pos written on an object, converting first (SPEC-2 6.1 row 24). */
  const setPosition = (blockId: string, pos: Position) => {
    void commitCanvas((canvas) => {
      const block = blockById(canvas, blockId);
      if (!block || !block.pos || jsonEqual(block.pos, pos)) return [];
      return [{ op: 'block.set', slideId: canvas.id, blockId, path: '/pos', value: pos }];
    });
  };

  const maskSelection = (shape: string | null) => {
    const slideNow = slideRef.current;
    const anchor = selectedBlockId(selectionRef.current);
    if (!slideNow || anchor === null) return;
    const block = blockById(slideNow, anchor);
    if (!isCroppable(block)) return;
    if (shape !== null && !isClosedShapeKind(shape)) return;
    commit([
      shape === null
        ? { op: 'block.set', slideId: slideNow.id, blockId: anchor, path: '/mask' }
        : { op: 'block.set', slideId: slideNow.id, blockId: anchor, path: '/mask', value: shape },
    ]);
  };

  /** slide.toCanvas from the handle: the conversion alone, one write (SPEC-2 1.6). */
  const toCanvas = async (): Promise<void> => {
    const slideNow = slideRef.current;
    if (!slideNow || isFreeformSlide(slideNow)) return;
    const converted = await measuredCanvas(slideNow);
    if (!converted) return;
    commit([converted.replace]);
    onConvertRef.current?.(slideNow.id);
  };

  /** block.autofit on the window transport: the fit measured now and written (SPEC-2 0.64). */
  const applyAutofit = async (blockId: string): Promise<void> => {
    const slideNow = slideRef.current;
    if (!slideNow) return;
    const block = blockById(slideNow, blockId);
    if (!block || !('autofit' in block) || block.autofit === undefined || block.autofit === 'none')
      return;
    const mutations = await withAutofit(slideNow, [], [blockId]);
    if (mutations.length > 0) commit(mutations);
  };

  const zoomTo = (next: SheetZoom, center?: Point) => {
    onZoomRef.current?.(next === 'fit' ? 'fit' : clampZoom(next), center);
  };

  const zoomStepBy = (direction: 1 | -1) => {
    zoomTo(stepZoom(k, direction));
  };

  const addGuide = (axis: 'x' | 'y', at?: number) => {
    onGuidesRef.current?.({ add: [{ axis, at: at ?? GUIDE_CENTRE[axis] }] });
  };

  const clearGuides = () => {
    onGuidesRef.current?.({ clear: true });
  };

  /** The word art bar's Enter: a text object at 88 px display weight 500 with an ink outline, centred (SPEC-2 6.2). */
  const insertWordArt = (text: string) => {
    const trimmed = text.trim();
    if (trimmed === '') return;
    const [w, h] = TOOL_DEFAULT_SIZE.wordArt;
    insertObject(
      {
        id: 'text',
        type: 'text',
        text: canonicalText(trimmed),
        typography: { size: 88, weight: 500, align: 'center' },
        outline: { color: 'ink', width: 1.5 },
      } as Block,
      { box: centredBox([w, h]) },
    );
  };

  /** The special characters picker's insert: at the caret, or into a new text box (SPEC-2 6.2). */
  const insertText = (text: string) => {
    if (inlineRef.current) {
      inlineRef.current.insertText(text);
      return;
    }
    const [w, h] = TOOL_DEFAULT_SIZE.text;
    insertObject(
      { id: 'text', type: 'text', text: canonicalText(text), autofit: 'grow' } as Block,
      {
        box: centredBox([w, h]),
      },
    );
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
    if (slideNow && free && anchor !== undefined) {
      const stack = sortByZ(freeformBlocks(slideNow)).map((b) => b.id);
      const at = stack.indexOf(anchor);
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
    } else if (slideNow && anchor !== undefined) {
      /* a kind's object that is not a block: the stack it joins on conversion has room both ways */
      order = { forward: true, backward: true, front: true, back: true };
    }
    const linked =
      (block !== undefined && block.link !== undefined) ||
      (slideNow !== undefined &&
        anchor !== undefined &&
        pointer !== undefined &&
        markupHasLink(readRunText(slideNow, anchor, pointer)));
    const group = slideNow ? sharedGroup(slideNow, ids) : null;
    const item = pointer !== undefined ? listItemPointer(pointer) : null;
    const listLevel =
      block?.type === 'plain' && item !== null ? (block.items[item.index]?.level ?? 1) : undefined;
    const imageEdited =
      isCroppable(block) &&
      (block.trim !== undefined || block.mask !== undefined || block.adjust !== undefined);
    return {
      blocks: ids.length,
      blockIds: ids,
      ...(anchor !== undefined ? { block: blockFamily(type) } : {}),
      textBlock:
        isTextBlockType(type) ||
        (slideNow?.kind === 'title' && anchor !== undefined && anchor !== 'mark') ||
        (slideNow?.kind === 'statement' && anchor !== undefined),
      listItem:
        pointer !== undefined &&
        item !== null &&
        (block?.type === 'plain' || block?.type === 'rows' || block?.type === 'refs'),
      tableCell: block?.type === 'table' && pointer !== undefined && cellPointer(pointer) !== null,
      linked,
      order,
      editing: editingNow !== null,
      freeform: free,
      object:
        slideNow !== undefined &&
        ids.length > 0 &&
        ids.every((id) => isObjectId(slideNow, boxesRef.current, id)),
      positioned:
        slideNow !== undefined &&
        ids.length > 0 &&
        ids.every((id) => blockById(slideNow, id)?.pos !== undefined),
      canvas: free,
      ...(group !== null ? { group } : {}),
      regroup: canRegroup(),
      coversSheet: slideNow !== undefined && anchor !== undefined && coversSheet(slideNow, anchor),
      ...(caretRef.current ? { marks: caretRef.current.marks, range: caretRef.current.range } : {}),
      imageEdited,
      ...(listLevel !== undefined ? { listLevel } : {}),
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
      order: orderSelection,
      align: alignSelection,
      distribute: distributeSelection,
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
      toCanvas,
      zoomTo,
      zoomStep: zoomStepBy,
      rotate: rotateSelection,
      flip: flipSelection,
      group: groupSelection,
      ungroup: ungroupSelection,
      regroup: regroupSelection,
      cropMode: () => {
        const anchor = selectedBlockId(selectionRef.current);
        if (anchor !== null) enterCrop(anchor);
      },
      exitCrop: () => exitCrop(true),
      mask: maskSelection,
      centerOnPage: (axis) => alignSelection(axis === 'x' ? 'center' : 'middle', 'sheet'),
      addGuide,
      clearGuides,
      insertText,
      wordArt: insertWordArt,
      selectNone: () => {
        if (editingRef.current) editingRef.current.element.blur();
        select(null);
      },
      applyAutofit,
      insertObject,
      toggleMark: toggleMarkOnSelection,
      setTextColor: (which, color) => inlineRef.current?.setColor(which, color),
      indent: (by) => {
        if (onListLevel(by)) return;
        if (onIndent(by)) return;
        indentBlocks(selectedObjectIds(), by);
      },
      positions: () => {
        const slideNow = slideRef.current;
        if (!slideNow) return [];
        return placedOf(slideNow, selectedObjectIds(), boxesRef.current);
      },
      setPosition,
    };
  }
  useEffect(() => {
    handleRef.current?.(api.current);
    return () => handleRef.current?.(null);
  }, []);

  // -------------------------------------------------------------------------------------------
  // Keys (gslides-parity SPEC 10.1, 10.2; SPEC-2 section 9; keys.ts editorKeyAction)

  const openContextMenuFromKeyboard = () => {
    const el = body.current;
    const slideNow = slideRef.current;
    const cb = onContextMenuRef.current;
    if (!el || !slideNow || !cb) return;
    const anchor = selectedBlockId(selectionRef.current);
    const box = anchor !== null ? boxesRef.current.blocks[anchor] : undefined;
    const rect = stageRect();
    if (!rect) return;
    const kk = rect.width / 1600 || 1;
    const x = rect.left + (box ? (box[0] + box[2] / 2) * kk : rect.width / 2);
    const y = rect.top + (box ? (box[1] + box[3] / 2) * kk : rect.height / 2);
    const element =
      (anchor !== null ? el.querySelector<HTMLElement>(`[data-block="${anchor}"]`) : null) ?? el;
    cb({
      target: anchor === null ? 'emptyCanvas' : contextTargetFor(slideNow, anchor),
      x,
      y,
      element,
      ...(anchor !== null ? { blockId: anchor } : {}),
    });
  };

  /** The right-click target of an object (SPEC-2 4.3): a group when the selection shares a tag, else by type. */
  const contextTargetFor = (slideNow: Slide, id: string): EditorContextTarget => {
    const ids = selectedIds(selectionRef.current, extraRef.current);
    if (ids.includes(id) && ids.length > 1 && sharedGroup(slideNow, ids) !== null) return 'group';
    const target = objectContextTarget(slideNow, id);
    return target === 'table' ? 'textBlock' : target;
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
      /* a focused overlay handle nudges, orders and flips itself with the plain and Cmd arrows,
         Enter and Space (Overlay.tsx); every other chord (Delete, Esc, Option arrows, Cmd letters)
         is the stage's, so a rotate key after a drag from the chip still turns the object */
      if (e.target instanceof Element && e.target.closest('.ts-overlay')) {
        const arrow = e.key.startsWith('Arrow');
        if ((arrow && !e.altKey) || e.key === 'Enter' || e.key === ' ') return;
      }
      const el = body.current;
      const slideNow = slideRef.current;
      if (!el || !slideNow) return;
      const current = selectionRef.current;
      const stop = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      /* crop mode owns Enter and Esc (SPEC-2 6.1 row 19) */
      if (cropRef.current) {
        if (e.key === 'Enter' || e.key === 'Escape') {
          exitCrop(true);
          stop();
          return;
        }
      }
      /* the point tools end on Enter and cancel on Esc (SPEC-2 6.2) */
      if (toolRef.current !== 'select' && drawPointsRef.current.length > 0) {
        if (e.key === 'Enter') {
          finishPointTool(false);
          stop();
          return;
        }
        if (e.key === 'Escape') {
          drawPointsRef.current = [];
          setDrawPoints([]);
          onToolDoneRef.current?.();
          stop();
          return;
        }
      }
      /* a key on a chrome control (an inspector button, a swatch, a menu row, a filmstrip card)
         is that control's: only Tab below still reads it, to decide whether the page or the
         browser owns the order */
      const fromControl = isChromeControlTarget(e.target, root.current);
      const apple =
        typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
      if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        /* with nothing selected, Tab from the page (the body, or the stage itself) selects the
           first object and Shift Tab the last (cycleSelection from -1); from a field or a chrome
           button the browser's focus order runs instead; the order is paint order on a canvas and
           document order otherwise (SPEC-2 0.83) */
        const inside = e.target instanceof Node && root.current?.contains(e.target);
        const fromPage = e.target === document.body;
        if (current === null && !inside && !fromPage) return;
        const order = objectIds(slideNow, boxesRef.current, blockOrder(el));
        const next = cycleSelection(order, current, e.shiftKey ? -1 : 1);
        setGroupEntered(null);
        if (next) selectObjects([next.blockId]);
        else select(null);
        stop();
        return;
      }
      if (fromControl) return;
      /* Commenting and Viewing mode (SPEC-3 5.3): Tab walks the objects above; Esc clears the
         selection; every writing key is inert */
      if (!editableRef.current) {
        if (e.key === 'Escape' && current !== null) {
          select(null);
          stop();
        }
        return;
      }
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
      const ids = selectedIds(current, extraRef.current);
      const action = editorKeyAction(e, {
        selected: current !== null,
        freeform: free,
        editing: false,
        editable: false,
        apple,
        several: ids.length > 1,
        grouped: sharedGroup(slideNow, ids) !== null,
      });
      if (action === null) {
        /* no bare letter does anything on the stage (SPEC 0.28); with a block selected the letter
           is consumed, so a stray keystroke never reaches a shell key */
        if (current !== null && isBareCharacterKey(e)) stop();
        return;
      }
      switch (action.type) {
        case 'escape':
          if (paintRef.current) {
            setPaint(null);
            stop();
            return;
          }
          if (toolRef.current !== 'select') {
            onToolDoneRef.current?.();
            stop();
            return;
          }
          if (groupEnteredRef.current !== null) {
            /* Esc from a member returns to the group (SPEC-2 6.1 row 14) */
            const member = groupEnteredRef.current;
            setGroupEntered(null);
            groupEnteredRef.current = null;
            selectObjects([member]);
            stop();
            return;
          }
          if (pendingEdit.current !== null) {
            /* Esc before a drawn text box's session opened (its write is still landing): the
               session is off and the box stays selected, as it would after Esc inside it */
            pendingSelect.current = [pendingEdit.current.blockId];
            pendingEdit.current = null;
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
          nudgeSelection(action.dx, action.dy);
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
            orderSelection(action.move);
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
        case 'rotate':
          rotateSelection(action.by);
          stop();
          return;
        case 'group':
          groupSelection();
          stop();
          return;
        case 'ungroup':
          ungroupSelection();
          stop();
          return;
        case 'mark':
          /* Cmd Shift X on a selected list item keeps the round one `no` flag through the menu row */
          toggleMarkOnSelection(action.mark);
          stop();
          return;
        case 'indent':
          indentBlocks(ids, action.by);
          stop();
          return;
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

  /* Cmd+scroll and a trackpad pinch zoom about the pointer (SPEC-2 6.1 row 27): the default is
     prevented over the stage so the page never zooms there */
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sheet = stageRect();
      const current = zoomRef.current === 'fit' ? k : zoomRef.current;
      const next = zoomFromWheel(current, e.deltaY);
      if (Math.abs(next - current) < 1e-4) return;
      const pointerAt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const under = sheet ? sheetPoint(sheet, e.clientX, e.clientY) : { x: 800, y: 450 };
      onZoomRef.current?.(
        next,
        centerKeepingPoint(under, pointerAt, { width: rect.width, height: rect.height }, next),
      );
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [k]);

  const onHandleDown = (handle: Handle, e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    if (handle.kind === 'crop-edge') {
      beginCropDrag(handle.dir, e.clientX, e.clientY);
      return;
    }
    beginGesture(handle, e.clientX, e.clientY, {
      duplicate: e.altKey && handle.kind === 'free-move',
    });
  };

  const onHandleNudge = (handle: Handle, delta: number, axis?: 'x' | 'y') => {
    const slideNow = slideRef.current;
    if (!slideNow || gesture.current) return;
    if (handle.kind === 'free-move' && handle.blockId !== undefined) {
      const dx = (axis ?? 'x') === 'x' ? delta : 0;
      const dy = axis === 'y' ? -delta : 0;
      nudgeSelection(dx, dy);
      return;
    }
    if (handle.kind === 'free-rotate') {
      rotateSelection(delta);
      return;
    }
    if (handle.kind === 'free-resize' && handle.blockId !== undefined) {
      void commitCanvas((canvas, boxesNow) => {
        const mutation = nudgeMutation(
          handle,
          { slide: canvas, boxes: boxesNow },
          delta,
          axis ?? (handle.axis === 'y' ? 'y' : 'x'),
        );
        return mutation ? [mutation] : [];
      });
      return;
    }
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

  /** A press on a deck guide drags it; the release writes deck.guides move (SPEC-2 6.1 row 30). */
  const onGuideDown = (axis: 'x' | 'y', at: number, e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const rect = stageRect();
    if (!rect) return;
    let last = at;
    setDraggingGuide({ axis, at, label: inchesLabel(at), from: at });
    const move = (ev: PointerEvent) => {
      const r = stageRect();
      if (!r) return;
      const point = sheetPoint(r, ev.clientX, ev.clientY);
      last = Math.round(axis === 'x' ? point.x : point.y);
      last = Math.max(0, Math.min(axis === 'x' ? 1600 : 900, last));
      setDraggingGuide({ axis, at: last, label: inchesLabel(last), from: at });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setDraggingGuide(null);
      if (last !== at) onGuidesRef.current?.({ move: [{ axis, from: at, to: last }] });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const onGuideContextMenu = (axis: 'x' | 'y', at: number, e: MouseEvent) => {
    const cb = onContextMenuRef.current;
    if (!cb || !root.current) return;
    e.preventDefault();
    cb({ target: 'guide', x: e.clientX, y: e.clientY, element: root.current, guide: { axis, at } });
  };

  /** A press on a ruler drags a new guide out of it; the release inside the sheet writes deck.guides add (row 29). */
  const onRulerDown = (axis: 'x' | 'y', e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    let last: number | null = null;
    const move = (ev: PointerEvent) => {
      const r = stageRect();
      if (!r) return;
      const kk = r.width / 1600 || 1;
      const edge = axis === 'x' ? r.left : r.top;
      const client = axis === 'x' ? ev.clientX : ev.clientY;
      const at = rulerToSheet(axis, client, edge, kk);
      const inside = axis === 'x' ? ev.clientY >= r.top - 1 : ev.clientX >= r.left - 1;
      last = inside ? at : null;
      setDraggingGuide(inside ? { axis, at, label: inchesLabel(at) } : null);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setDraggingGuide(null);
      if (last !== null) onGuidesRef.current?.({ add: [{ axis, at: last }] });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = body.current;
    const slideNow = slideRef.current;
    if (!el || !slideNow) return;
    if (settingsRef.current.showRuler) {
      const rect = stageRect();
      if (rect) setPointer(sheetPoint(rect, e.clientX, e.clientY));
    }
    if (gesture.current) return;
    const id = resolveObject(e.target, el, slideNow);
    setHover((prev) => (prev === id ? prev : id));
    const drawTool = toolRef.current;
    if (drawTool !== 'select' && isLineTool(drawTool) && isFreeformSlide(slideNow)) {
      const rect = stageRect();
      if (rect) setSites(sitesUnder(slideNow, sheetPoint(rect, e.clientX, e.clientY)));
    }
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
      const ids = selectedIds(selectionRef.current, extraRef.current);
      const chip = chipHandleFor(slideNow, boxesRef.current, p.blockId, ids);
      if (chip) beginGesture(chip, p.clientX, p.clientY, { duplicate: p.alt });
    };
    const up = () => {
      press.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /** A press on the empty sheet or the workspace drags a marquee over the objects' bounding boxes; a plain click clears (SPEC-2 6.1 row 3, 0.100). */
  const armMarquee = (clientX: number, clientY: number) => {
    const rect = stageRect();
    if (!rect) return;
    const start = sheetPoint(rect, clientX, clientY);
    let live = false;
    const move = (ev: PointerEvent) => {
      const r = stageRect();
      const slideNow = slideRef.current;
      const el = body.current;
      if (!r || !slideNow || !el) return;
      const box = marqueeBox(start, sheetPoint(r, ev.clientX, ev.clientY));
      if (!live && !isMarquee(box)) return;
      live = true;
      setMarquee(box);
      const order = objectIds(slideNow, boxesRef.current, blockOrder(el));
      const bounding: Record<string, Box> = {};
      for (const id of order) {
        const block = blockById(slideNow, id);
        const box2 = block?.pos ? boundingBoxOf(block.pos) : boxesRef.current.blocks[id];
        if (!box2) continue;
        /* the picture covering the sheet at the bottom of the stack (the background photograph)
           is crossed by every marquee inside the sheet; it joins only when the marquee holds it
           whole, so a marquee over the plate selects the plate (SPEC-2 0.100) */
        if (
          coversSheet(slideNow, id) &&
          !(
            box[0] <= box2[0] &&
            box[1] <= box2[1] &&
            box[0] + box[2] >= box2[0] + box2[2] &&
            box[1] + box[3] >= box2[1] + box2[3]
          )
        )
          continue;
        bounding[id] = box2;
      }
      const hits = selectionOf(expandGroups(slideNow, marqueeHits(box, bounding, order)));
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

  /** Space+drag pans the zoomed stage (SPEC-2 6.1 row 28). */
  const armPan = (clientX: number, clientY: number) => {
    const el = scroller.current;
    if (!el) return;
    const startLeft = el.scrollLeft;
    const startTop = el.scrollTop;
    const move = (ev: PointerEvent) => {
      el.scrollLeft = startLeft - (ev.clientX - clientX);
      el.scrollTop = startTop - (ev.clientY - clientY);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  /** The one insert of a draw tool, converting the slide first (SPEC-2 6.1 row 33). */
  const insertDrawn = (
    drawTool: Exclude<EditorTool, 'select'>,
    box: Box,
    options: {
      points?: [number, number][];
      orientation?: 'horizontal' | 'vertical' | 'diagonal-down' | 'diagonal-up';
      start?: Point;
      end?: Point;
    } = {},
  ) => {
    void commitCanvas(
      (canvas) => {
        const type = toolBlockType(drawTool);
        const id = freeId(type, takenBlockIds(canvas));
        const mutation = toolInsertMutation(canvas, drawTool, id, box, 'main', undefined, {
          grid: settingsRef.current.snapGrid,
          ...(options.points ? { points: options.points } : {}),
          ...(options.orientation ? { orientation: options.orientation } : {}),
        });
        if (!mutation || mutation.op !== 'block.insert') return [];
        const mutations: Mutation[] = [mutation];
        /* a connector's ends snap to the sites under the drag's start and end (SPEC-2 6.2, 2.4.7) */
        if (
          mutation.block.type === 'shape' &&
          isLineBlock(mutation.block) &&
          options.start &&
          options.end &&
          (mutation.block.shape === 'line' ||
            mutation.block.shape === 'arrow' ||
            mutation.block.shape === 'elbow' ||
            mutation.block.shape === 'curved')
        ) {
          const startSite = siteUnder(canvas, options.start);
          const endSite = siteUnder(canvas, options.end);
          if (startSite || endSite) {
            const connect: NonNullable<Extract<Block, { type: 'shape' }>['connect']> = {};
            if (startSite) connect.start = { block: startSite.blockId, site: startSite.site };
            if (endSite) connect.end = { block: endSite.blockId, site: endSite.site };
            const attached = { ...mutation.block, connect } as Block;
            mutations[0] = { ...mutation, block: attached };
          }
        }
        if (drawTool.kind === 'text')
          pendingEdit.current = { blockId: id, pointer: 'text', caret: 'end' };
        else pendingSelect.current = [id];
        return mutations;
      },
      { autofit: false },
    );
    onToolDoneRef.current?.();
  };

  /** Curve and Polyline: the placed points as one path block (SPEC-2 6.2); `closed` when the last click met the first point. */
  const finishPointTool = (closed: boolean) => {
    const drawTool = toolRef.current;
    const points = drawPointsRef.current;
    drawPointsRef.current = [];
    setDrawPoints([]);
    if (drawTool === 'select' || !isPointTool(drawTool)) return;
    const path = pathFromPoints(points);
    if (!path) {
      onToolDoneRef.current?.();
      return;
    }
    void commitCanvas(
      (canvas) => {
        const id = freeId('shape', takenBlockIds(canvas));
        const mutation = toolInsertMutation(canvas, drawTool, id, path.box, 'main', undefined, {
          grid: false,
          points: path.points,
        });
        if (!mutation || mutation.op !== 'block.insert') return [];
        const block = closed ? ({ ...mutation.block, closed: true } as Block) : mutation.block;
        pendingSelect.current = [id];
        return [{ ...mutation, block }];
      },
      { autofit: false },
    );
    onToolDoneRef.current?.();
  };

  /**
   * A press with a draw tool (SPEC-2 6.1 row 33, 6.2): the pointer draws a box in the marquee's
   * ink; the release inserts the tool's block there, or the default box at the press when the
   * pointer did not travel; Shift constrains, Option draws from the centre; Curve and Polyline
   * take a click per point; Scribble samples the pointer. A text box opens in the caret state
   * (R09 A1); the tool then returns to Select through onToolDone.
   */
  const armDraw = (
    clientX: number,
    clientY: number,
    drawTool: Exclude<EditorTool, 'select'>,
    mods: { shift: boolean; alt: boolean },
  ) => {
    const rect = stageRect();
    if (!rect) return;
    const start = sheetPoint(rect, clientX, clientY);
    if (isPointTool(drawTool)) {
      const points = drawPointsRef.current;
      const first = points[0];
      if (first && points.length >= 2 && Math.hypot(first.x - start.x, first.y - start.y) < 8) {
        finishPointTool(true);
        return;
      }
      drawPointsRef.current = [...points, start];
      setDrawPoints(drawPointsRef.current);
      return;
    }
    if (isScribbleTool(drawTool)) {
      const samples: Point[] = [start];
      const move = (ev: PointerEvent) => {
        const r = stageRect();
        if (!r) return;
        const now = sheetPoint(r, ev.clientX, ev.clientY);
        const last = samples[samples.length - 1];
        if (!last || Math.hypot(now.x - last.x, now.y - last.y) >= SCRIBBLE_SAMPLE_PX) {
          samples.push(now);
          setDrawPoints([...samples]);
        }
      };
      const finish = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        setDrawPoints([]);
        const path = pathFromPoints(simplifyPoints(samples));
        if (path) insertDrawn(drawTool, path.box, { points: path.points });
        else onToolDoneRef.current?.();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
      return;
    }
    let current = mods;
    const move = (ev: PointerEvent) => {
      const r = stageRect();
      if (!r) return;
      current = { shift: ev.shiftKey, alt: ev.altKey };
      const drawn = drawnBox(drawTool, start, sheetPoint(r, ev.clientX, ev.clientY), current);
      setMarquee(drawn.dragged ? drawn.box : null);
    };
    const finishDraw = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finishDraw);
      window.removeEventListener('pointercancel', cancel);
      setMarquee(null);
      setSites([]);
      const r = stageRect();
      if (!r) return;
      const end = sheetPoint(r, ev.clientX, ev.clientY);
      const drawn = drawnBox(drawTool, start, end, current);
      const orientation =
        isLineTool(drawTool) && drawTool.line !== 'rule' && drawn.dragged
          ? drawnLineOrientation(start, end)
          : undefined;
      insertDrawn(drawTool, drawn.box, {
        ...(orientation ? { orientation } : {}),
        start,
        end: drawn.dragged ? end : { x: start.x + drawn.box[2], y: start.y + drawn.box[3] / 2 },
      });
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

  /** A press on the stage root outside the sheet: the workspace (SPEC-2 0.100) starts a marquee, a click deselects. */
  const onWorkspacePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (e.target instanceof Element && e.target.closest('.sheet')) return;
    if (e.target instanceof Element && e.target.closest('.ts-overlay')) return;
    if (editingRef.current) return;
    if (spaceRef.current) {
      armPan(e.clientX, e.clientY);
      return;
    }
    if (cropRef.current) {
      exitCrop(true);
      return;
    }
    const drawTool = toolRef.current;
    if (drawTool !== 'select' && editableRef.current) {
      e.preventDefault();
      armDraw(e.clientX, e.clientY, drawTool, { shift: e.shiftKey, alt: e.altKey });
      return;
    }
    setGroupEntered(null);
    armMarquee(e.clientX, e.clientY);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = body.current;
    const slideNow = slideRef.current;
    if (!el || !slideNow || e.button !== 0) return;
    const current = editingRef.current;
    /* a click inside the editable run is the caret's; one outside ends the edit through its blur */
    if (current) return;
    if (spaceRef.current) {
      e.preventDefault();
      armPan(e.clientX, e.clientY);
      return;
    }
    const cropNow = cropRef.current;
    if (cropNow) {
      /* inside the frame a drag pans the picture; outside commits (SPEC-2 6.1 row 19) */
      const rect = stageRect();
      const point = rect ? sheetPoint(rect, e.clientX, e.clientY) : null;
      const [fx, fy, fw, fh] = cropNow.frame;
      if (point && point.x >= fx && point.x <= fx + fw && point.y >= fy && point.y <= fy + fh) {
        e.preventDefault();
        beginCropDrag('pan', e.clientX, e.clientY);
        return;
      }
      exitCrop(true);
      return;
    }
    const drawTool = toolRef.current;
    if (drawTool !== 'select') {
      e.preventDefault();
      armDraw(e.clientX, e.clientY, drawTool, { shift: e.shiftKey, alt: e.altKey });
      return;
    }
    const id = resolveObject(e.target, el, slideNow);
    /* paint format armed: the click paints the block and nothing else (SPEC 3.1 row 6) */
    if (paintRef.current && id !== null) {
      e.preventDefault();
      applyPaint(id);
      select({ kind: 'block', blockId: id });
      return;
    }
    if (id === null) {
      setGroupEntered(null);
      armMarquee(e.clientX, e.clientY);
      return;
    }
    const selected = selectedIds(selectionRef.current, extraRef.current);
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      /* Shift and Cmd click toggle membership (SPEC-2 6.1 row 2); a group toggles whole */
      const members = expandGroups(slideNow, [id]);
      let next = { selection: selectionRef.current, extra: extraRef.current as string[] };
      const adding = !selected.includes(id);
      for (const member of members) {
        if (adding === !selectedIds(next.selection, next.extra).includes(member))
          next = toggleSelected(next.selection, next.extra, member);
      }
      select(next.selection, next.extra);
      return;
    }
    /* a click on a member of a group selects the group, caret or not, until a double click enters
       the member (SPEC-2 6.1 row 14; VERIFICATION-2 finding 17): the run's caret waits */
    const grouped =
      blockById(slideNow, id)?.pos?.group !== undefined && groupEnteredRef.current !== id;
    /* Commenting and Viewing mode: the click selects the object for a comment's anchor and
       nothing else, no caret, no drag (SPEC-3 5.3, 6.3) */
    if (!editableRef.current) {
      if (!selected.includes(id)) selectObjects([id]);
      return;
    }
    /* a single click inside text places the caret there (gslides-parity SPEC 10.2, R09 A1);
       the block's frame and the overlay's handles are the drag surface */
    const run = resolveRun(e.target, el);
    if (run && run.blockId === id && !grouped) {
      const text = readRunText(slideNow, run.blockId, run.pointer);
      if (text !== undefined) {
        startEdit(run, { x: e.clientX, y: e.clientY });
        return;
      }
    }
    if (!selected.includes(id) || (grouped && selected.length === 1)) {
      /* a click on a member of a group selects the group, so the drag that follows moves it whole */
      if (groupEnteredRef.current !== id) setGroupEntered(null);
      selectObjects([id]);
    }
    /* every object drags by its body: a picture, a shape, a material anywhere; the text of a
       title or statement slide by its frame through the overlay (its interior is the caret's) */
    if (isObjectId(slideNow, boxesRef.current, id)) {
      armPress({ blockId: id, clientX: e.clientX, clientY: e.clientY, alt: e.altKey });
    }
  };

  /** A double click: a member of a group alone (SPEC-2 6.1 row 14), crop mode on a picture (row 19). */
  const onDoubleClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    const el = body.current;
    const slideNow = slideRef.current;
    if (!el || !slideNow || editingRef.current) return;
    /* Commenting and Viewing mode: no crop, no member entry, no caret (SPEC-3 5.3) */
    if (!editableRef.current) return;
    const id = resolveObject(e.target, el, slideNow);
    if (id === null) return;
    const block = blockById(slideNow, id);
    if (isCroppable(block) && (isFreeformSlide(slideNow) || block.type === 'shot')) {
      e.preventDefault();
      enterCrop(id);
      return;
    }
    if (id === 'picture' && !isFreeformSlide(slideNow)) {
      /* the photograph of a picture kind: crop mode on the picture object's box without a write;
         the conversion travels with the crop's own commit (finding 19) */
      e.preventDefault();
      void enterCropProvisional('picture');
      return;
    }
    const tag = block?.pos?.group;
    if (tag !== undefined && groupEnteredRef.current !== id) {
      e.preventDefault();
      setGroupEntered(id);
      groupEnteredRef.current = id;
      select({ kind: 'block', blockId: id }, []);
    }
  };

  /* links are text on the stage in edit mode, never navigation */
  const onClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.target instanceof Element && e.target.closest('a')) e.preventDefault();
  };

  /** A right-click: the target of gslides-parity SPEC 4.3 and SPEC-2 4.3 for the chrome's menu; inside an editing session the browser's own menu carries the spelling suggestions. */
  const onContextMenuEvent = (e: ReactMouseEvent<HTMLDivElement>) => {
    const cb = onContextMenuRef.current;
    const el = body.current;
    const slideNow = slideRef.current;
    if (!cb || !el || !slideNow) return;
    const current = editingRef.current;
    if (current && e.target instanceof Node && current.element.contains(e.target)) return;
    e.preventDefault();
    const inSheet = e.target instanceof Element && e.target.closest('.sheet') !== null;
    const id = inSheet ? resolveObject(e.target, el, slideNow) : null;
    const run = resolveRun(e.target, el);
    const element =
      (e.target instanceof Element ? e.target.closest<HTMLElement>('[data-block]') : null) ?? el;
    if (id === null) {
      cb({ target: 'emptyCanvas', x: e.clientX, y: e.clientY, element });
      return;
    }
    const block = blockById(slideNow, id);
    if (!selectedIds(selectionRef.current, extraRef.current).includes(id)) {
      selectObjects([id]);
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
      target: contextTargetFor(slideNow, id),
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
    const slideNow = slideRef.current;
    if (files.length === 0 || !el || !slideNow) return;
    e.preventDefault();
    const rect = stageRect();
    const point = rect ? sheetPoint(rect, e.clientX, e.clientY) : undefined;
    const id = resolveObject(e.target, el, slideNow);
    const [first] = files;
    if (!first) return;
    void insertPicture(first, {
      ...(id !== null && blockById(slideNow, id) ? { blockId: id } : {}),
      ...(point ? { point } : {}),
      replace: id === 'picture' && !isFreeformSlide(slideNow),
    });
  };

  const selectedId = selectedBlockId(selection);
  const ids = selectedIds(selection, extra);
  const anchorBlock = slide && selectedId !== null ? blockById(slide, selectedId) : undefined;
  const anchorPos: Position | null =
    anchorBlock?.pos ??
    (slide && selectedId !== null ? posFor(slide, selectedId, boxes) : null) ??
    null;
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
  const group =
    ids.length > 1 && slide ? (selectionUnion(slide, ids, boxes) ?? groupBoxOf(ids, boxes)) : null;
  const groupTag = slide ? sharedGroup(slide, ids) : null;
  const hoverBox =
    hover !== null && !ids.includes(hover) && !activeHandle ? (boxes.blocks[hover] ?? null) : null;
  const handles =
    shownSlide && !editing && editable
      ? handlesFor(shownSlide, boxes, selection, {
          ids,
          ...(crop ? { crop: { frame: crop.frame } } : {}),
        })
      : [];
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

  /* the arrange actions of a selection: each is one write, on every slide kind (SPEC-2 6.1 rows 13, 21, 22) */
  const arrange: ArrangeActions | null =
    selectedId !== null && !editing
      ? {
          count: ids.length,
          canDistribute: ids.length >= 3,
          align: (edge) => alignSelection(edge),
          distribute: (axis) => distributeSelection(axis),
          zOrder: (move) => orderSelection(move),
        }
      : null;

  const chip =
    selectedId !== null && shownSlide
      ? groupTag !== null && ids.length > 1
        ? 'Group'
        : ids.length > 1
          ? `${ids.length} objects`
          : `${blockDisplayName(shownSlide, selectedId)}${showIds ? ` · ${selectedId}` : ''}`
      : null;

  const view: EditorOverlayView = {
    slideId,
    k,
    boxes,
    body: body.current,
    hover: hoverBox,
    selection,
    selectionBox,
    selectionPos: ids.length === 1 ? anchorPos : null,
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
    groupTag: ids.length > 1 ? groupTag : null,
    groupMembers:
      groupTag !== null && shownSlide ? ids.map((id) => blockDisplayName(shownSlide, id)) : [],
    count: ids.length,
    marquee,
    guides,
    arrange,
    paint: paint !== null,
    rotation: readout?.kind === 'angle' ? readout.value : null,
    sizeReadout: readout?.kind === 'size' ? { w: readout.w, h: readout.h } : null,
    rulers: showRuler
      ? {
          on: true,
          pointer,
          selection:
            slide && ids.length > 0
              ? (selectionUnion(slide, ids, boxes) ?? groupBoxOf(ids, boxes))
              : null,
        }
      : null,
    deckGuides: showGuides ? (deckGuides ?? { x: [], y: [] }) : null,
    draggingGuide,
    crop: crop
      ? {
          blockId: crop.blockId,
          frame: crop.frame,
          full: fullExtent(crop.frame, crop.trim),
          trim: crop.trim,
        }
      : null,
    sites,
    drawPoints,
    onHandleDown,
    onHandleNudge,
    onHandleOrder,
    onGuideDown,
    onGuideContextMenu,
    onRulerDown,
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
    space && 'is-pan',
    crop && 'is-crop',
    !editable && 'is-readonly',
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
        data-pan={space ? '' : undefined}
        data-crop={crop ? '' : undefined}
        data-mode={effectiveMode}
        tabIndex={-1}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onPointerDown={onWorkspacePointerDown}
        onContextMenu={onContextMenuEvent}
        onPointerLeave={() => setPointer(null)}
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
          scrollerRef={scroller}
          onScroll={setScroll}
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
            onDoubleClick={onDoubleClick}
            onClick={onClick}
            dangerouslySetInnerHTML={{ __html: shownHtml }}
          />
          {/* the live shader over every material frame of the slide (SPEC 5.3, 5.4; M5): it re-mounts on every commit that moves or resizes an object (SPEC-2 0.94) */}
          <MaterialMount body={body} html={shownHtml} onError={onError} />
        </Sheet>
      </div>
      {/* the overlay layer (SPEC 2.2 junction table): chrome, over the sheet's box, in CSS pixels; it follows the stage's scroll while zoomed */}
      <div
        className="ts-overlay ts-chrome"
        data-active-handle={activeHandle ?? undefined}
        data-alt={alt ? '' : undefined}
        data-freeform={freeform ? '' : undefined}
        data-crop={crop ? '' : undefined}
        style={{
          left: fit.left + 1 - (zoom === 'fit' ? 0 : scroll.left),
          top: fit.top + 1 - (zoom === 'fit' ? 0 : scroll.top),
          width: fit.width,
          height: fit.height,
        }}
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
            onListLevel={onListLevel}
            onListLeave={onListBackspace}
            onIndent={onIndent}
            onCaret={onCaretInfo}
            onInput={measure}
            onUndo={() => onUndoRef.current?.()}
            onRedo={() => onRedoRef.current?.()}
            handle={(inline) => {
              inlineRef.current = inline;
            }}
          />
        ) : null}
      </div>
    </>
  );
}
