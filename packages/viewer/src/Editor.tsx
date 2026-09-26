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

import { slideCounter } from '@turboslide/render/deck';
import { renderSlide } from '@turboslide/render/slide';
import { bandAssetResolver, bandForSlide, frameBandOf } from '@turboslide/render/stage';
import type { ActionId } from '@turboslide/schema/actions';
import { assetVector, vectorOf } from '@turboslide/schema/assets';
import type { Asset } from '@turboslide/schema/assets';
import type { Block, BlockType, ShotTrim } from '@turboslide/schema/blocks';
import { formatChartNumber } from '@turboslide/schema/blocks/chart';
import type { TableBlock, TableCommand } from '@turboslide/schema/blocks/table';
import { applyTableCommand } from '@turboslide/schema/blocks/table';
import type { GuidesInput } from '@turboslide/schema/canvas';
import { GUIDE_CENTRE, grammarRecordOf } from '@turboslide/schema/canvas';
import { isMultilinePath, isMultilineType } from '@turboslide/schema/catalog';
import type { Color } from '@turboslide/schema/color';
import { detachConnectors, followConnectors } from '@turboslide/schema/connect';
import type { DeckDocument, DeckGuides, Slide } from '@turboslide/schema/deck';
import { slideOrder, slideTitle } from '@turboslide/schema/deck';
import type { Finding } from '@turboslide/schema/findings';
import type {
  AlignEdge,
  AlignTarget,
  DistributeAxis,
  OrderMove,
} from '@turboslide/schema/freeform';
import { sortByZ } from '@turboslide/schema/freeform';
import { brandWriteMutation } from '@turboslide/schema/brand';
import type { Mutation } from '@turboslide/schema/mutations';
import { jsonEqual } from '@turboslide/schema/pointer';
import type { Position } from '@turboslide/schema/position';
import { applyMutations } from '@turboslide/schema/reduce';
import type { Box } from '@turboslide/schema/render';
import { isClosedShapeKind } from '@turboslide/schema/shapes';
import type { Text as Markup } from '@turboslide/schema/text';
import {
  canonicalText,
  parseText,
  plainLength,
  plainOf,
  styleRange,
} from '@turboslide/schema/text';
import type { RunMarks } from '@turboslide/schema/text';
import { PROMPTS } from '@turboslide/schema/layouts';
import { TYPE_LADDER } from '@turboslide/schema/typography';
import { SHEET } from '@turboslide/theme/tokens';

import { measureForCanvas, measureForFit, virtualObjectIds } from './canvas-measure';
import type { FitMeasure, VirtualObjectId } from './canvas-measure';
import {
  altFor,
  assetIdFor,
  clipboardStore,
  decodeClipboard,
  encodeClipboard,
  encodeClipboardHtml,
  envelopeOf,
  fileToDataUrl,
  freeId,
  imageFilesOf,
  paintFormatOf,
  paintMutations,
  pastedBlockInserts,
  pastedSlideInserts,
  PICTURE_MAX_BYTES,
  svgFileOf,
  svgMarkupOf,
  svgMarkupOfText,
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
  droppedPictureBox,
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
import { GESTURE_IDLE, gestureLife } from './gesture-life';
import type { GestureEnd, GestureLife, GestureLifeEvent, GestureReadout } from './gesture-life';
import type { Guide } from './Guides';
import {
  announceTextChanged,
  clickEntry,
  entryCaret,
  forgetAbsorbed,
  InlineText,
  listAppendMutation,
  listRemoveMutation,
  nextCellPointer,
  readRunText,
  runKey,
  sessionContextTarget,
  sessionPressVerdict,
  tableRowAppendMutation,
  textBurstMutation,
  textFromNode,
} from './InlineText';
import {
  BODY_SLOT,
  PICTURE_MARGIN,
  pictureInsertArea,
  pictureInsertBox,
  pictureNameOf,
  SVG_CROP_SENTENCE,
  sniffPictureKind,
  uploadFailureOf,
  uploadFailureSentence,
  urlFailureSentence,
} from './picture-place';
import {
  growMutation,
  liveContentHeight,
  RECONCILE_RESEND_MS,
  sessionReconcile,
  shrinkMutation,
} from './text-fit';
import type {
  CaretInfo,
  CaretPlacement,
  InlineTextEndReason,
  InlineTextHandle,
} from './InlineText';
import { editorKeyAction, isBareCharacterKey, typingEntry } from './keys';
import { boldOfRange, rangeHasMark, setBoldRange, toggleMark } from './marks';
import type { ToggleMark } from './marks';
import { isMarquee, marqueeBox, marqueeHits } from './Marquee';
import { blockTypeIn, boxContains, ringBoxFor } from './text-ring';
import { MaterialMount } from './MaterialMount';
import { shaderPaletteOfDeck } from '@turboslide/materials/presets';
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
  objectPressPlan,
  resolveObject,
  resolveRun,
  runElement,
  selectedBlockId,
  selectedIds,
  selectionOf,
  stageOwnsClipboard,
  toggleSelected,
} from './Selection';
import type { BlockFamily, Selection } from './Selection';
import {
  adjacentCell,
  cellAtPoint,
  cellInBounds,
  cellRunPointer,
  drawnCellsIn,
  isMultiCell,
  rangeBounds,
  rangeBox,
  rangeStands,
  rowsWithRangeCleared,
  tableRangeShapeOf,
} from './table-range';
import type {
  CellAddress,
  CellBounds,
  CellDirection,
  CellRange,
  TableRangeShape,
} from './table-range';
import { isTableSeamHandle, tableSeamHandles, tableSeamMutation } from './table-seam';
import {
  movedCellPointer,
  parseTablePaste,
  pastedTableBlock,
  pastedTableSize,
  tableShapeOf,
  tableWithPastedGrid,
} from './table-session';
import type { PastedGrid, TableShape } from './table-session';
import { fitSheetAt, Sheet, SHEET_PAD } from './Sheet';
import type { SheetZoom } from './Sheet';
import { boxSnapLines, deckGuideLines, sheetEdgeLines, sheetSnapLines } from './snap';
import {
  GUIDE_HIT_PX,
  crossingGuide,
  drawReadout,
  drawReadoutStyle,
  guideForTravel,
  sizeLabel,
  stageOwnsTab,
} from './stage-rules';
import type { GuidePress } from './stage-rules';
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
  /**
   * a table with a cell open or a cell or range active (docs/FEATURES.md 2.1): the chip and the
   * ring band stay drawn as its move surface although `editing` may be true, and the handles hold
   * its free-move chip and eight resize squares
   */
  tableFrame: boolean;
  /** the selected chart the Edit data button sits under (docs/FEATURES.md 2.2 rank 7), null otherwise */
  editData: { blockId: string } | null;
  /** the value of a tapped chart mark, shown in the readout chip for a moment; null otherwise */
  valueReadout: string | null;
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
  /** the moved column's width while a table's column seam is down, in sheet pixels (docs/RETURN.md 2.4 fix 5) */
  widthReadout: number | null;
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
  /** a right click on selected text inside an editing session (SPEC 4.3 "Text menu") */
  | 'textSelection'
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
  /** the one selected picture draws a vector asset (docs/VECTOR.md 4.4): crop is refused on it */
  vectorPicture: boolean;
  /** the selected list item's level */
  listLevel?: number;
  /** the range of table cells selected on the anchor table, ordered and grown over its merged cells (table-range.ts; docs/RETURN.md 2.4) */
  cells?: CellBounds;
};

/** A line for the snackbar (gslides-parity SPEC 12); `undo` asks for the Undo action. */
export type EditorNotice = { text: string; undo?: true };

/**
 * The stage's imperative surface for the chrome (the context menu, the toolbar, the menu bar):
 * every method is what the matching key does, so a menu item and its shortcut are one code path.
 */
/**
 * The window event the studio's controller sends once a chrome insert (Insert > Table, the table
 * grid, Insert > Chart) has committed, with `{ deckId, slideId, blockIds }` as its detail, so the
 * stage selects the new object as Google does (docs/PRODUCT.md section 2 rank 1; the product
 * round's build/b3.md). The name is the studio's `SELECT_OBJECTS_EVENT` of
 * `apps/studio/src/editor/select-after-write.ts`, repeated here because the viewer cannot import
 * the studio; that module's test pins the two to one string.
 */
export const SELECT_OBJECTS_EVENT = 'turboslide:select-objects';

/**
 * The chart's numbers from the stage (docs/FEATURES.md 2.2 rank 7; audit-objects 17): a double
 * click on a chart, Enter on the selected chart, a click on a bar, a point or a slice of the
 * selected chart and the Edit data button under it all send this window event with the cell the
 * grid should make active (the grid's own coordinates: row 1 is the first category, column 1 the
 * first series). The chrome's Overlay opens Format options on the Chart data section when `open`
 * is set and the Chart data section makes the cell active (inspector/chart.tsx). A window event
 * because the viewer never imports the chrome, as `SELECT_OBJECTS_EVENT` travels the other way.
 */
export const CHART_CELL_EVENT = 'turboslide:chart-cell';

export type ChartCellDetail = {
  deckId: string;
  slideId: string;
  blockId: string;
  row: number;
  column: number;
  /** open Format options on the Chart data section (a double click, Enter, the button) */
  open: boolean;
};

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
  /**
   * a picture at a web address (Insert > Image > By URL, Replace image > By URL; docs/PRODUCT.md
   * section 5 "Image by URL"): the bytes are fetched by the page when the address answers it (its
   * own origin, a host that allows it), and then take the upload's path whole (the sniff, the
   * instant preview, `asset.add`, the placement in the body slot or the swap of `blockId`'s
   * picture); an address the page cannot read goes to the server's `asset.add` by URL. Rejects
   * with the sentence the dialog shows when no picture lands.
   */
  insertPictureFromUrl: (
    url: string,
    where?: { blockId?: string; replace?: boolean },
  ) => Promise<void>;
  /**
   * an asset the document holds already (Image by URL's `asset.add` answer) placed as a picture
   * object centred in the body slot at the largest size with the 40 px margin, selected
   * (docs/PRODUCT.md section 5 "Image by URL"); `blockId` swaps the picture of that block instead.
   * An asset the server answered but the document has not received yet is waited for.
   */
  insertPictureAsset: (
    asset: { id: string; size?: Asset['size'] | undefined },
    where?: { blockId?: string },
  ) => Promise<void>;
  /**
   * a logo asset the document holds (the Logo dialog's `logo.insert` answer; docs/FEATURES.md
   * 4.4, B6): placed at the logo size, a symbol 160 sheet px tall or a wordmark 320 wide at the
   * mark's ratio, centred in the body slot's free area and never at the largest fit, selected;
   * `blockId` swaps that picture's asset and keeps its box (Replace image > Logo); `everySlide`
   * writes the kit's `/mark`, `/footer/logo` and `/footer/assetId` in the same commit and says
   * "The <title> logo is on every slide" with Undo. No snackbar on a plain insert.
   */
  insertLogoAsset: (
    asset: { id: string; size?: Asset['size'] | undefined },
    where: { title: string; variant?: string; everySlide?: boolean; blockId?: string },
  ) => Promise<void>;
  /** Add a caption on the selected shot (docs/PRODUCT.md section 2 rank 10): the caption field appears with its prompt and takes the caret; false when nothing selected takes one */
  addCaption: () => boolean;
  /* round two: the canvas (SPEC-2 sections 1 and 6) */
  /** converts the slide to the canvas with no other write (slide.toCanvas) */
  toCanvas: () => Promise<void>;
  zoomTo: (zoom: SheetZoom, center?: Point) => void;
  zoomStep: (direction: 1 | -1) => void;
  /** the live scale of the sheet (the fit scale while the zoom is Fit), read through the ref the step uses */
  scale: () => number;
  rotate: (by: number) => void;
  flip: (axis: 'h' | 'v') => void;
  group: () => void;
  ungroup: () => void;
  regroup: () => void;
  cropMode: () => void;
  exitCrop: () => void;
  /**
   * True while a crop is open (docs/RETURN.md 4.1; build/b1.md R4): the shell's `key.commit`
   * reads it so a bare Enter with no crop is left to the focused element (the Slideshow button)
   * instead of being consumed by `exitCrop`.
   */
  cropOpen: () => boolean;
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
   * Link detection (docs/PRODUCT.md section 2 rank 9): a typed web or mail address becomes a link
   * as the space or Enter lands; on unless the Tools > Preferences row turns it off. The route
   * passes the stored preference; absent means on.
   */
  linkDetection?: boolean;
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
  /**
   * The parked controls predicate (docs/VECTOR.md 4.8; packages/chrome parked-controls.ts
   * `isParked`, which the viewer cannot import): the four svg ways in and the svg copy read their
   * ids (`intake.svg.upload`, `.paste`, `.drop`, `.url`, `picture.svg.copy`) through it before
   * they act, and a parked way is off: an svg through it reads as a file that is not a picture,
   * a copy of an svg picture writes the envelope alone. Absent, nothing is parked. The server
   * keeps accepting an svg on every transport either way.
   */
  parked?: (id: string) => boolean;
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
type Press = {
  blockId: string;
  clientX: number;
  clientY: number;
  alt: boolean;
  /** what a pointer up without a move does after the press (a table cell's caret, a chart mark's cell) */
  tap?: () => void;
};

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
/** How long the page waits for a web address to answer a picture (Image by URL) before the server tries. */
const URL_FETCH_MS = 15_000;
/** The default box of a dropped picture (palette-data.ts DEFAULT_SIZE shot). */
const DROP_PICTURE_WIDTH = 480;
/** The indent step of Cmd+] and Cmd+[ in px (SPEC-2 2.2.11). */
const INDENT_STEP_PX = 64;

/** How long the value of a tapped chart mark stays in the readout chip (docs/FEATURES.md 2.2 rank 7). */
const MARK_READOUT_MS = 1500;

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

/**
 * The controls of the chrome a keydown may start from: their own keys, never the stage's. A grid
 * and its cells and headers are here for the chart data grid (docs/FEATURES.md 2.2 rank 1; audit
 * objects 1): a letter typed on the active cell opens it, and until this entry the stage's
 * capture listener consumed the letter as a stray key on the selected chart. The panel's own
 * class (`.ts-panel`, Panel.tsx) is here for the same reason, so every key pressed inside a panel
 * is the panel's.
 */
const CHROME_CONTROL =
  'button, input, select, textarea, [contenteditable], [role="menu"], [role="dialog"], [role="listbox"], [role="grid"], [role="gridcell"], [role="columnheader"], [role="rowheader"], .ts-inspector, .ts-panel';

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

/** The ways an svg comes in (docs/VECTOR.md 4.3) and the parked control id each reads (4.8). */
type SvgWay = 'upload' | 'paste' | 'drop' | 'url';
const SVG_WAY_IDS: Readonly<Record<SvgWay, string>> = {
  upload: 'intake.svg.upload',
  paste: 'intake.svg.paste',
  drop: 'intake.svg.drop',
  url: 'intake.svg.url',
};

/** A stand in for a missing asset in `vectorOf`: a raster record, which answers nothing. */
const RASTER: Pick<Asset, 'vector' | 'role' | 'sourceFile' | 'source'> = {
  role: 'other',
  source: { kind: 'file' },
};

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
  linkDetection = true,
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
  parked,
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
  /* the range of table cells on the selected table (table-range.ts; docs/RETURN.md 2.4): a Shift
     click on a second cell or a drag from an open cell into another makes it, Escape, a session,
     another selection or a change of the grid ends it */
  const [cellRange, setCellRange] = useState<CellRange | null>(null);
  const [alt, setAlt] = useState(false);
  const [paint, setPaint] = useState<{ format: PaintFormat; keep: boolean } | null>(null);
  /* round two */
  const [crop, setCrop] = useState<CropState | null>(null);
  /* a member selected alone inside its group after a double click (SPEC-2 6.1 row 14) */
  const [groupEntered, setGroupEntered] = useState<string | null>(null);
  const [readout, setReadout] = useState<GestureReadout>(null);
  /* the value of the chart mark a tap named, shown for a moment in the overlay's readout chip
     (docs/FEATURES.md 2.2 rank 7: "the readout shows the value") */
  const [markReadout, setMarkReadout] = useState<string | null>(null);
  const markReadoutTimer = useRef(0);
  /* the letter size of a word art while its resize is down (docs/FEATURES.md 2.3 item 8), shown
     beside the size readout; cleared with the gesture's readout */
  const [scaleReadout, setScaleReadout] = useState<string | null>(null);
  useEffect(() => {
    if (readout === null) setScaleReadout(null);
  }, [readout]);
  /* the picture being uploaded, drawn at once from the local file at its final box with a thin
     progress bar until the asset lands (docs/PRODUCT.md section 2 rank 10; audit-seller 22) */
  const [uploading, setUploading] = useState<{ box: Box; url: string } | null>(null);
  /* Cmd+Shift+V pressed: the paste event that follows inserts plain text (rank 11 of the gaps) */
  const plainPasteArmed = useRef(false);
  const uploadingUrl = useRef<string | null>(null);
  const clearUploading = () => {
    const url = uploadingUrl.current;
    uploadingUrl.current = null;
    if (url !== null) URL.revokeObjectURL(url);
    setUploading(null);
  };
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
  const cellRangeRef = useRef(cellRange);
  cellRangeRef.current = cellRange;
  /* the grid the range was made on: a row, a column or a merged cell added or removed under it
     ends the range (table-range.ts rangeStands) */
  const cellRangeShape = useRef<TableRangeShape | null>(null);
  /* the cell the last session on the selected table sat in: the anchor of a Shift click made
     after that session ended (a parked session ends in the press's capture phase, before the
     stage reads it; the kept cell pointer of the chrome is the same cell, docs/RETURN.md 2.4 fix 2) */
  const lastCell = useRef<{ blockId: string; cell: CellAddress } | null>(null);
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
  const parkedRef = useRef(parked);
  parkedRef.current = parked;
  /* the markup of every vector asset selected this page life, read ahead for the copy
     (docs/VECTOR.md 4.5): one GET per asset file, keyed by the file's path */
  const svgMarkup = useRef(new Map<string, string>());
  const svgMarkupInFlight = useRef(new Set<string>());
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
  /* the life of the pointer gesture that is down (gesture-life.ts, hotfix-4 cause W1): the size
     and angle readouts of a drag are read from it, so an end event of any kind clears them */
  const life = useRef<GestureLife>(GESTURE_IDLE);
  const stepLife = (event: GestureLifeEvent) => {
    life.current = gestureLife(life.current, event);
    if (event.type !== 'move') window.clearTimeout(readoutTimer.current);
    setReadout(life.current.readout);
  };
  /* the markup shown while a run is edited: frozen at the session's start so a burst's re-render
     never replaces the editable element under the caret */
  const frozenHtml = useRef<string | null>(null);
  /* the markup of the run as the document last held it, what the next burst diffs against */
  const committedText = useRef<Markup>('');
  /* the markup the session's own last write left in the document; a document that reads
     otherwise moved by a write from outside the session (text-fit.ts sessionReconcile) */
  const expectedDocText = useRef<Markup | null>(null);
  /* the pending re-send of a session whose document fell behind it */
  const reconcileTimer = useRef(0);
  const pendingEdit = useRef<PendingEdit | null>(null);
  const pendingSelect = useRef<string[] | null>(null);
  /* the grid of the table a cell session began in: a row or column added or removed under the
     session moves what its positional pointer names (table-session.ts; RETURN.md 2.4) */
  const sessionTableShape = useRef<TableShape | null>(null);
  /* the printable key that opened the session on a selected text object (AMENDMENTS.md A1 rule
     4): typed into the session once its handle is up, over the whole text the entry selected */
  const pendingInsert = useRef<string | null>(null);
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
    /* a new selection inherits nothing of a past gesture (its readout, hotfix-4 cause W1) */
    if (gesture.current === null) stepLife({ type: 'select' });
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

  /**
   * The cell range set or cleared (table-range.ts). The page reads the range through
   * `menuSelection()` (EditorMenuSelection.cells), so a change is announced the way the rest of a
   * multi-selection is: `onMultiSelectionChange` with a fresh array is the page's signal to read
   * the facts again (its comment above), because the route's selection keeps the same anchor
   * while the range grows, shrinks or ends.
   */
  const setRange = (next: CellRange | null) => {
    const slideNow = slideRef.current;
    const block = slideNow && next ? blockById(slideNow, next.blockId) : undefined;
    const kept = next !== null && block?.type === 'table' ? next : null;
    cellRangeShape.current =
      kept !== null && block?.type === 'table' ? tableRangeShapeOf(block) : null;
    if (jsonEqual(kept, cellRangeRef.current)) return;
    cellRangeRef.current = kept;
    setCellRange(kept);
    onMultiRef.current?.([...extraRef.current]);
  };

  /** The bounds of the range on `blockId`, or null when the range names another table or none. */
  const rangeOn = (blockId: string | null): CellBounds | null => {
    const range = cellRangeRef.current;
    const slideNow = slideRef.current;
    if (range === null || blockId === null || range.blockId !== blockId || !slideNow) return null;
    const block = blockById(slideNow, blockId);
    return block?.type === 'table' ? rangeBounds(block, range) : null;
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
      .finally(() => {
        /* the answer of an earlier write, arriving during the next drag, leaves that drag's
           preview alone (the same rule as the document effect below) */
        if (gesture.current === null) setDraft(null);
      });
  };

  /**
   * A named action with the current revision; the promise is the server's confirmation. The
   * base stamped here is the page's count; for `asset.add` and the other asset actions the
   * controller waits for its outbox to drain and restamps the request with the acknowledged
   * revision (`serverSide` in apps/studio/src/editor/controller.tsx, docs/FOCUS.md rank 5), so a
   * picture dropped while a write is pending is never refused as stale. Do not restore the
   * page's count there.
   */
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

  /* a new document ends any preview: the write landed, or the world moved on. Not while a
     gesture is down: on the blob tier the checkpoint frame of the previous drag's write can reach
     the tab seconds later, in the middle of the next drag, and clearing the preview then snaps
     the object back to the document's box under the pointer until the next move redraws it
     (build-4/hotfix-3.md 3.5, seen on production); the next move recomputes the preview over the
     new document through docRef, and the release commits over it */
  useEffect(() => {
    if (gesture.current === null) setDraft(null);
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
    /* a session is one cell: it ends the cell range and becomes the anchor of the next Shift
       click on this table (table-range.ts) */
    if (cellRangeRef.current !== null) setRange(null);
    const sessionCell = block?.type === 'table' ? cellPointer(run.pointer) : null;
    lastCell.current = sessionCell ? { blockId: run.blockId, cell: sessionCell } : null;
    /* a title or statement slide's text run is a slide field, not a block (blockById finds none);
       its type comes from blockTypeOf, and a title's lead is a paragraph, whose /text is
       multiline, so Enter in the subtitle placeholder breaks the line (hotfix-4 cause W4) */
    const multiline =
      block !== undefined
        ? isMultilinePath(block, `/${run.pointer}`)
        : isMultilineType(blockTypeOf(slideNow, run.blockId) ?? '', `/${run.pointer}`);
    /* the base of a new session is the document's text and nothing absorbed by an earlier session
       on this run: a marker the last session left (a collaborator's change absorbed after its
       last burst, so no burst consumed it) made the first burst here diff against a text two
       remote writes old and send the whole run back at stale offsets (VERIFICATION.md C3-F8) */
    forgetAbsorbed(runKey(slideNow.id, run.blockId, run.pointer));
    /* the hovered cell's prompt leaves before the session reads the run's text (2.3 item 9) */
    clearHoverPrompt();
    committedText.current = readRunText(slideNow, run.blockId, run.pointer) ?? '';
    expectedDocText.current = committedText.current;
    frozenHtml.current = htmlRef.current;
    sessionTableShape.current = block?.type === 'table' ? tableShapeOf(block) : null;
    setEditing({ ...run, caret, multiline, ...(options.link ? { link: true } : {}) });
    select({ kind: 'run', blockId: run.blockId, pointer: run.pointer });
  };

  /**
   * The autofit grow of a text box after a burst (docs/FOCUS.md rank 11; SPEC-2 6.2 Autofit): the
   * content height read from the live stage once the burst's text is in the editable, and the
   * `pos.h` write when the text needs more than the box, in the same call as the splice.
   */
  const growAfterBurst = (current: Editing, after: Slide | undefined): Mutation | null => {
    const el = body.current;
    if (!after || !el) return null;
    const block = blockById(after, current.blockId);
    if (!block || block.type !== 'text' || !('autofit' in block)) return null;
    if (block.autofit !== 'grow' && block.autofit !== 'shrink') return null;
    const blockEl = el.querySelector<HTMLElement>(`[data-block="${block.id}"]`);
    if (!blockEl) return null;
    const wrapper = blockEl.parentElement?.closest<HTMLElement>(`.free[data-free="${block.id}"]`);
    const stage = el.parentElement;
    const k = stage ? stage.getBoundingClientRect().width / SHEET.width : 0;
    const content = liveContentHeight(blockEl, wrapper ?? null, k, window);
    if (block.autofit === 'shrink') {
      /* Shrink text on overflow (docs/PRODUCT.md section 5 "Autofit"): the size steps down the
         ladder until the text fits; the live element takes the step at once, since the markup is
         frozen for the session and would draw the old size until Escape */
      const typography =
        'typography' in block && typeof block.typography === 'object' && block.typography !== null
          ? (block.typography as { size?: number })
          : {};
      const drawn = parseFloat(window.getComputedStyle(blockEl).fontSize);
      const size = typography.size ?? (Number.isFinite(drawn) ? Math.round(drawn) : undefined);
      /* the ladder is walked in one pass: each rung is drawn on the live element and the
         content measured again, so one burst of a long paste lands on the rung where the text
         fits, or on the floor, instead of one rung per burst (the walk's 230 characters in a 90 px
         box stopped at 20 px with 150 px of text) */
      let current: Block = block;
      let fontSize = size;
      let measured = content;
      let step: Mutation | null = null;
      for (;;) {
        const rung = shrinkMutation(after.id, current, measured, fontSize, ladderStepDown);
        if (rung === null || rung.op !== 'block.set') break;
        const nextSize = (rung.value as { size?: number }).size;
        if (nextSize === undefined) break;
        step = rung;
        blockEl.style.fontSize = `${nextSize}px`;
        fontSize = nextSize;
        current = { ...current, typography: rung.value } as Block;
        measured = liveContentHeight(blockEl, wrapper ?? null, k, window);
      }
      if (step !== null) window.requestAnimationFrame(measure);
      return step;
    }
    const grow = growMutation(after.id, block, content);
    /* the frame follows the text while the session is open (audit-gaps 5: `pos.h` was written and
       the drawn box stayed 45 px, because the session freezes the markup); the wrapper's height is
       the stored height in sheet px, and the ring re-measures on the next frame */
    if (grow !== null && grow.op === 'block.set' && wrapper && typeof grow.value === 'number') {
      wrapper.style.height = `${grow.value}px`;
      window.requestAnimationFrame(measure);
    }
    return grow;
  };

  /** The writes of one burst, or of the final text: the changed span against what the document holds (empty when nothing changed). */
  const writeText = (current: Editing, text: Markup): Mutation[] => {
    const slideNow = slideRef.current;
    if (!slideNow) return [];
    const mutations = textBurstMutation(
      slideNow,
      current.blockId,
      current.pointer,
      committedText.current,
      text,
    );
    if (mutations.length > 0) {
      committedText.current = text;
      const after = slideAfter(mutations);
      const grow = growAfterBurst(current, after);
      commit(grow ? [...mutations, grow] : mutations);
      const docText = after && readRunText(after, current.blockId, current.pointer);
      expectedDocText.current = docText ?? committedText.current;
      /* the document's markup after the splice can differ from the editable's in its marks alone
         (the reducer's flag inheritance against Chromium's editing: VERIFICATION.md product pass
         1 finding 5 had the address kept by the document and dropped by the anchor, and the next
         link apply then spliced raw markup at the plain offsets of the wrong base). The session
         absorbs the document's markup at once, the way a collaborator's mark write reaches it,
         so the editable draws what the show and the export will, and the next burst diffs
         against the document's own text. The letters must agree: a document a burst behind
         (slideAfter's ref lags one render) is left to the reconcile effect. */
      if (
        docText !== undefined &&
        docText !== text &&
        editingRef.current === current &&
        plainOf(docText) === plainOf(text)
      ) {
        committedText.current = docText;
        announceTextChanged({
          slideId: slideNow.id,
          blockId: current.blockId,
          pointer: current.pointer,
          text: docText,
        });
      }
    }
    return mutations;
  };

  /*
   * A write from outside the session changed the run being edited (text-fit.ts sessionReconcile):
   * the toolbar's Italic or a swatch on a parked session, a Format menu row, or a burst the server
   * refused and the room folded back. A mark write is announced to the session, which absorbs the
   * document's markup with its unflushed keystrokes (InlineText absorbRemote, the collaborator
   * path); a document behind the session re-bases the session on it and re-sends the editable's
   * text as one splice from the acknowledged text (docs/FOCUS.md rank 13: "sends the run's whole
   * text once"). The remote path announces first (the controller), so a collaborator's change
   * reaches here already absorbed and the re-send carries the local keystrokes alone.
   */
  useEffect(() => {
    const current = editingRef.current;
    const slideNow = slideRef.current;
    const expected = expectedDocText.current;
    if (!current || !slideNow || expected === null) return;
    /* a row or column added or removed under a cell session (Format > Table, the cell menu, with
       the session parked; docs/RETURN.md 2.4): the pointer names its cell by position, so the
       re-send below wrote the editable's text into whatever cell now sat there (measured on the
       checkout: Insert row above put "Q1 revenue" into the new row as well, and Cmd+Z took that
       write back instead of the row; build/b5.md section 7). The session ends with no re-send;
       its last write follows the cell that moved, or is dropped when the cell is gone; the table
       stays selected and the sheet redraws its new grid at once. */
    const tableNow = blockById(slideNow, current.blockId);
    const shape = sessionTableShape.current;
    if (
      tableNow?.type === 'table' &&
      shape !== null &&
      (tableNow.rows.length !== shape.rows || tableNow.columns.length !== shape.columns)
    ) {
      const moved = movedCellPointer(tableNow, shape, current.pointer, expected);
      if (moved === null) {
        committedText.current = textFromNode(current.element, { multiline: current.multiline });
      } else if (moved !== current.pointer) {
        editingRef.current = { ...current, pointer: moved };
      }
      sessionTableShape.current = null;
      window.clearTimeout(reconcileTimer.current);
      reconcileTimer.current = 0;
      /* every table command keeps the caret in the cell it had (docs/FEATURES.md 2.3 item 7,
         P1; audit-objects 18: Insert row below from the cell menu left the table selected and
         the caret gone): the session that ends here reopens on the moved cell, at the end of its
         text, from the layout effect the end triggers; a cell that is gone reopens nothing */
      if (moved !== null)
        pendingEdit.current = { blockId: current.blockId, pointer: moved, caret: 'end' };
      inlineRef.current?.end('blur');
      return;
    }
    const docText = readRunText(slideNow, current.blockId, current.pointer);
    if (docText === undefined) return;
    const verdict = sessionReconcile(expected, docText);
    if (verdict === 'none') return;
    if (verdict === 'absorb') {
      expectedDocText.current = docText;
      announceTextChanged({
        slideId: slideNow.id,
        blockId: current.blockId,
        pointer: current.pointer,
        text: docText,
      });
      return;
    }
    /* the re-send waits a moment and reads the document again: a document behind the session for
       one render (a publish that lands before the room folds the pending writes back on it)
       catches up on its own and needs nothing; a refusal stays behind and is re-sent once */
    window.clearTimeout(reconcileTimer.current);
    reconcileTimer.current = window.setTimeout(() => {
      reconcileTimer.current = 0;
      const live = editingRef.current;
      const slideLive = slideRef.current;
      if (!live || live !== current || !slideLive) return;
      const now = readRunText(slideLive, live.blockId, live.pointer);
      if (now === undefined || now !== docText || now === expectedDocText.current) return;
      expectedDocText.current = now;
      committedText.current = now;
      writeText(live, textFromNode(live.element, { multiline: live.multiline }));
    }, RECONCILE_RESEND_MS);
    // the session's refs are read here, not the render's values
  }, [doc]);

  /* the cell range follows the table it names (table-range.ts): a row, a column or a merged cell
     added or removed under it ends it, Merge cells among them, and after a merge the merged cell
     stands selected, as in Google Slides, so Unmerge cells in the cell menu and on the table tail
     act on it at once (the matrix rows tables.cells.merge-unmerge and
     tables.tail.merge-unmerge-buttons); a text write never ends a range */
  useEffect(() => {
    const range = cellRangeRef.current;
    const shape = cellRangeShape.current;
    const slideNow = slideRef.current;
    if (range === null || !slideNow) return;
    const block = blockById(slideNow, range.blockId);
    if (block?.type !== 'table') {
      setRange(null);
      return;
    }
    if (shape !== null && rangeStands(shape, block)) return;
    const bounds = rangeBounds(block, range);
    const spansChanged = shape !== null && shape.spans !== JSON.stringify(block.spans ?? []);
    const anchor: CellAddress = { row: bounds.r0, col: bounds.c0 };
    if (
      spansChanged &&
      editingRef.current === null &&
      anchor.row < block.rows.length &&
      anchor.col < block.columns.length
    ) {
      /* a range stays a range after Merge (docs/FEATURES.md 2.3 item 7, P1): the merged cell
         stands as the range, drawn with the range ring, so Unmerge cells on the tail and in the
         cell menu act on it at once (the matrix rows tables.cells.merge-unmerge,
         tables.tail.merge-unmerge-buttons kept their reading: the merged cell selected) */
      select({ kind: 'block', blockId: block.id });
      setRange({ blockId: block.id, anchor, focus: anchor });
      return;
    }
    setRange(null);
    // the range's refs are read here, not the render's values
  }, [doc]);

  /* the range names the selected table alone: a selection that moves to another object or to
     nothing ends it, and so does another slide; a run of the same table keeps it (a right click
     inside the range selects nothing else). The last session cell goes with the selection too. */
  const rangeSlide = useRef(slideId);
  useEffect(() => {
    const slideChanged = rangeSlide.current !== slideId;
    rangeSlide.current = slideId;
    const range = cellRangeRef.current;
    if (range !== null && (slideChanged || range.blockId !== anchorId)) setRange(null);
    const last = lastCell.current;
    if (last !== null && (slideChanged || last.blockId !== anchorId)) lastCell.current = null;
  }, [anchorId, slideId]);

  const onBurst = (text: Markup) => {
    const current = editingRef.current;
    if (current) writeText(current, text);
  };

  const endEdit = (text: Markup, reason: InlineTextEndReason) => {
    const current = editingRef.current;
    if (!current) return;
    window.clearTimeout(reconcileTimer.current);
    reconcileTimer.current = 0;
    setEditing(null);
    /* a printable key that opened a session never leaves its character behind for the next one:
       the handle callback consumes it on mount, and a session ending clears any unconsumed value */
    pendingInsert.current = null;
    /* the ref follows at once, not at the re-render: a parked session ends in the capture phase
       of the press that lands outside it (InlineText onDocMouseDown), and the pointer handlers
       of that same press must read the stage as free, or Insert > Text box while a run was being
       edited arms the tool and the click places nothing */
    editingRef.current = null;
    frozenHtml.current = null;
    sessionTableShape.current = null;
    caretRef.current = null;
    onCaretRef.current?.(null);
    const written = writeText(current, text);
    /* the final write consumed any marker the session held; one it did not reach (no slide to
       write against) dies with the session rather than waiting for the next one on this run */
    forgetAbsorbed(runKey(slideIdRef.current, current.blockId, current.pointer));
    const slideNow = slideAfter(written);
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
          /* Tab in an open label of a group moves to the next label in the group's order with
             its text selected, Shift+Tab back, the member entered behind it (docs/FEATURES.md 2.2
             rank 6; audit-objects 11: Tab ended the session and opened nothing); the last label's
             Tab and the first's Shift+Tab return to the member, as before */
          const tag = block?.pos?.group;
          const el = body.current;
          if (tag !== undefined && el) {
            const labels = groupLabelRuns(el, slideNow, tag);
            const at = labels.findIndex((run) => run.blockId === current.blockId);
            const next = at >= 0 ? labels[at + (reason === 'tab' ? 1 : -1)] : undefined;
            if (next !== undefined) {
              setGroupEntered(next.blockId);
              groupEnteredRef.current = next.blockId;
              pendingEdit.current = { blockId: next.blockId, pointer: next.pointer, caret: 'all' };
              return;
            }
          }
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
        /* the next cell opens from the layout effect below, on the markup this session's end
           commits, never on the element under the pointer now: the stage shows the markup frozen
           at the session's start, so once a burst had landed the cell element read here belonged
           to markup the re-render replaced, and the session opened on it ended at once with the
           table selected and the next keys replacing its first cell (docs/RETURN.md 2.4 fix 1;
           audit-objects rows 51, 93, 94). The effect runs on the session's end whether or not
           the markup changes, so an empty cell's Tab takes the same path (row 92). */
        pendingEdit.current = { blockId: block.id, pointer: next.pointer, caret: 'all' };
        return;
      }
      case 'arrow-left':
      case 'arrow-right':
      case 'arrow-up':
      case 'arrow-down':
      case 'range-left':
      case 'range-right':
      case 'range-up':
      case 'range-down': {
        /* an arrow at the cell's text edge (docs/FEATURES.md 2.2 rank 5; audit-objects 6): the
           adjacent cell opens with the caret at the matching edge, the start after Right or Down
           and the end after Left or Up, through the same layout effect as Tab; a merged cell
           counts as one (table-range.ts adjacentCell). With Shift the cells from this one to the
           adjacent one become the range and the table stands selected. At the grid's edge the
           cell stays selected as a run, so the next key still reaches it. */
        const block = blockById(slideNow, current.blockId);
        const from = cellPointer(current.pointer);
        const direction = reason.slice(reason.indexOf('-') + 1) as CellDirection;
        if (block?.type !== 'table' || from === null) {
          backToBlock();
          return;
        }
        const next = adjacentCell(block, from, direction);
        if (next === null) {
          select({ kind: 'run', blockId: block.id, pointer: current.pointer });
          return;
        }
        if (reason.startsWith('range-')) {
          select({ kind: 'block', blockId: block.id });
          setRange({ blockId: block.id, anchor: from, focus: next });
          return;
        }
        pendingEdit.current = {
          blockId: block.id,
          pointer: cellRunPointer(next),
          caret: direction === 'right' || direction === 'down' ? 'start' : 'end',
        };
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

  /*
   * A table command from the cell's right click menu keeps the caret in its cell (docs/FEATURES.md
   * 2.3 item 7, P1; audit-objects 18): the right click on a collapsed caret ends the session and
   * selects the cell as a run (onContextMenuEvent, the F4 rule), so when Insert row below lands the
   * stage holds a run selection on a table whose grid changed and no session. The memo below keeps
   * the selected cell's grid and text from before the change; when the grid changes under it the
   * session reopens on the cell that moved (table-session.ts movedCellPointer), at the end of its
   * text, through the same layout effect as Tab. A layout effect, before the markup effect in
   * source order, so the queued cell opens on this render.
   */
  const runCellMemo = useRef<{
    blockId: string;
    pointer: string;
    shape: TableShape;
    text: Markup;
  } | null>(null);
  useLayoutEffect(() => {
    const slideNow = slideRef.current;
    const current = selectionRef.current;
    const block =
      slideNow && current?.kind === 'run' ? blockById(slideNow, current.blockId) : undefined;
    if (
      !slideNow ||
      current?.kind !== 'run' ||
      block?.type !== 'table' ||
      cellPointer(current.pointer) === null
    ) {
      runCellMemo.current = null;
      return;
    }
    const shape = tableShapeOf(block);
    const memo = runCellMemo.current;
    if (
      memo !== null &&
      memo.blockId === block.id &&
      memo.pointer === current.pointer &&
      (memo.shape.rows !== shape.rows || memo.shape.columns !== shape.columns) &&
      editingRef.current === null &&
      pendingEdit.current === null
    ) {
      const moved = movedCellPointer(block, memo.shape, memo.pointer, memo.text);
      if (moved !== null) pendingEdit.current = { blockId: block.id, pointer: moved, caret: 'end' };
    }
    runCellMemo.current = {
      blockId: block.id,
      pointer: current.pointer,
      shape,
      text: readRunText(slideNow, block.id, current.pointer) ?? '',
    };
  }, [doc, selection]);

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
    // the boxes follow the markup and the theme; measure, select and startEdit are closures over
    // refs; a session's end runs it too, so a queued cell (Tab, Shift+Tab) opens on the markup
    // that end committed even when that markup did not change (docs/RETURN.md 2.4 fix 1)
  }, [shownHtml, theme, editing]);

  /*
   * The instant preview of a picture being uploaded (docs/PRODUCT.md section 2 rank 10; the row
   * images.insert.instant-preview): the picture drawn inside the sheet at the box it will take, in
   * sheet px, with the thin progress bar, until the asset lands. It lives inside `.pt-slide`, where
   * the seller's eye and the drivers read the first img, and not on the overlay (the overlay's
   * copy drew at once and counted for nothing: VERIFICATION.md product pass 1 finding 6 timed the
   * block's own img at 727 to 1034 ms). The sheet's markup is one string React sets whole, so the
   * preview is a child appended by hand and put back whenever that markup is set again.
   */
  useLayoutEffect(() => {
    const sheet = body.current;
    if (!sheet || uploading === null) return undefined;
    const holder = document.createElement('div');
    holder.className = 'ts-upload-preview';
    holder.setAttribute('data-control', 'picture.upload');
    holder.setAttribute('aria-hidden', 'true');
    holder.style.left = `${uploading.box[0]}px`;
    holder.style.top = `${uploading.box[1]}px`;
    holder.style.width = `${uploading.box[2]}px`;
    holder.style.height = `${uploading.box[3]}px`;
    const img = document.createElement('img');
    img.src = uploading.url;
    img.alt = '';
    const bar = document.createElement('div');
    bar.className = 'ts-upload-progress';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', 'Uploading the picture');
    bar.setAttribute('data-control', 'picture.upload.progress');
    bar.appendChild(document.createElement('span'));
    holder.append(img, bar);
    sheet.appendChild(holder);
    return () => {
      holder.remove();
    };
  }, [uploading, shownHtml]);

  /*
   * The selection after a chrome insert (docs/PRODUCT.md section 2 rank 1): the controller sends
   * SELECT_OBJECTS_EVENT once Insert > Table, the table grid or Insert > Chart has committed; the
   * stage selects the named objects when they are on the sheet, now if the markup already carries
   * them (the ring, the eight handles, the chip and its tail), else from the layout effect above
   * on the render that brings them. An event for another slide or another deck is not this
   * stage's, and an agent's insert sends none (select-after-write.ts, the origin rule). The
   * handler lives in a ref so the listener, added once, reads the current closures.
   */
  const onSelectObjectsRef = useRef<(event: Event) => void>(() => undefined);
  onSelectObjectsRef.current = (event: Event) => {
    const detail = (
      event as CustomEvent<{ deckId?: string; slideId?: string; blockIds?: string[] } | undefined>
    ).detail;
    if (!detail || !Array.isArray(detail.blockIds) || detail.blockIds.length === 0) return;
    if (detail.deckId !== undefined && detail.deckId !== deckIdRef.current) return;
    if (detail.slideId !== slideRef.current?.id) return;
    const ids = detail.blockIds.filter((id): id is string => typeof id === 'string');
    const el = body.current;
    if (
      el &&
      ids.every((id) => el.querySelector(`[data-block="${id}"], .free[data-free="${id}"]`))
    ) {
      pendingSelect.current = null;
      const picked = selectionOf(ids);
      select(picked.selection, picked.extra);
      return;
    }
    pendingSelect.current = ids;
  };
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const listener = (event: Event) => onSelectObjectsRef.current(event);
    window.addEventListener(SELECT_OBJECTS_EVENT, listener);
    return () => window.removeEventListener(SELECT_OBJECTS_EVENT, listener);
  }, []);

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

  /**
   * The `typography.size` a word art's box height stands for (docs/FEATURES.md 2.3 item 8): the
   * size at the gesture's start times the new height over the start height, rounded and never
   * under 8 px; null for every other block or when the size does not change.
   */
  const wordArtScale = (
    canvas: Slide,
    blockId: string,
    height: number,
  ): { mutation: Mutation; size: number } | null => {
    const block = blockById(canvas, blockId);
    if (block?.type !== 'text' || block.outline === undefined || block.pos === undefined)
      return null;
    const startH = block.pos.h;
    if (!(startH > 0) || !(height > 0)) return null;
    const base = typeof block.typography?.size === 'number' ? block.typography.size : 88;
    const size = Math.max(8, Math.round((base * height) / startH));
    if (size === base) return null;
    return {
      size,
      mutation: {
        op: 'block.set',
        slideId: canvas.id,
        blockId,
        path: '/typography',
        value: { ...(block.typography ?? {}), size },
      },
    };
  };

  /**
   * The mutations a gesture stands for at a point, and what the overlay would show meanwhile: a
   * pure function of the gesture and the point. The pointer move shows the readout it returns
   * through the gesture's life; the release computes its mutations with the same function and
   * shows nothing (hotfix-4 cause W1: the release used to set the readout it had just cleared).
   */
  const gestureAt = (
    g: ActiveGesture,
    now: Point,
    mods: GestureMods,
  ): { mutations: Mutation[]; guides: Guide[]; sites: Point[]; readout: GestureReadout } => {
    const kind = g.handle.kind;
    if (
      kind === 'free-move' ||
      kind === 'free-resize' ||
      kind === 'free-rotate' ||
      kind === 'line-end'
    ) {
      const result = freeGesture(g.handle, g.ctx, g.start, now, mods);
      const readout: GestureReadout =
        result?.angle !== undefined
          ? { kind: 'angle', value: result.angle }
          : result?.size !== undefined
            ? { kind: 'size', w: result.size.w, h: result.size.h }
            : null;
      let mutations = result?.mutations ?? [];
      if (g.duplicate && kind === 'free-move') mutations = duplicateMutations(g, mutations);
      /* word art scales its letters with its box (docs/FEATURES.md 2.3 item 8, P1; audit
         objects 20: the box grew to 1027 by 205 and the letters stayed 88 px): a resize of a text
         block with an outline writes `typography.size` as the size at the gesture's start times
         the new height over the old, in the same commit as the box, and the readout shows the
         size beside the box; the preview draws the scaled letters through the draft document */
      if (kind === 'free-resize' && result?.size !== undefined && g.handle.blockId !== undefined) {
        const scaled = wordArtScale(g.ctx.slide, g.handle.blockId, result.size.h);
        if (scaled !== null) {
          mutations = [...mutations, scaled.mutation];
          setScaleReadout(`${scaled.size} px`);
        }
      }
      return { mutations, guides: result?.guides ?? [], sites: result?.sites ?? [], readout };
    }
    if (isTableSeamHandle(g.handle)) {
      /* the table's column seam (docs/RETURN.md 2.4 fix 5): the left column widens by the drag
         and its neighbour narrows, in the table's own width; the readout is the moved column's
         new width (return/build/b5.md request 3) */
      const seam = tableSeamAt(g.handle.blockId, g.handle.index, g.ctx, now.x - g.start.x);
      return {
        mutations: seam === null ? [] : [seam.mutation],
        guides: [],
        sites: [],
        readout: seam === null ? null : { kind: 'width', value: seam.left },
      };
    }
    const mutation = gestureMutation(g.handle, g.ctx, g.start, now);
    return { mutations: mutation === null ? [] : [mutation], guides: [], sites: [], readout: null };
  };

  /**
   * The seam drag of a table's column `index` by `dx` sheet px over the gesture's context: the
   * table's width is its `pos` on a canvas, else its measured box (a table in a layout slot).
   */
  const tableSeamAt = (
    blockId: string,
    index: number,
    ctx: GestureContext,
    dx: number,
  ): { mutation: Mutation; left: number; right: number; height: number } | null => {
    const block = blockById(ctx.slide, blockId);
    if (block?.type !== 'table') return null;
    const box = ctx.boxes.blocks[blockId];
    const width = block.pos?.w ?? box?.[2];
    if (width === undefined || width <= 0) return null;
    const seam = tableSeamMutation(ctx.slide, block, width, index, dx);
    return seam === null ? null : { ...seam, height: Math.round(block.pos?.h ?? box?.[3] ?? 0) };
  };

  /** The end of the gesture that is down, by whatever event ended it: every live state clears. */
  const endGestureState = (end: GestureEnd) => {
    gesture.current = null;
    setActiveHandle(null);
    setDrop(null);
    setDropSlot(null);
    setGuides([]);
    setSites([]);
    stepLife({ type: end });
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
    options: { duplicate?: boolean; target?: EventTarget | null } = {},
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
    stepLife({ type: 'down' });
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
      const {
        mutations,
        guides: nextGuides,
        sites: nextSites,
        readout: nextReadout,
      } = gestureAt(g, now, mods);
      stepLife({ type: 'move', readout: nextReadout });
      setGuides(nextGuides);
      setSites(nextSites);
      if (jsonEqual(mutations, g.last)) return;
      g.last = mutations;
      preview(mutations);
    };
    /* the end of the gesture by any of its events (gesture-life.ts GESTURE_END_EVENTS): the
       release commits, everything else cancels; every listener leaves with the gesture */
    const pressed = options.target instanceof Element ? options.target : null;
    const detach = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('keydown', onEscape, true);
      pressed?.removeEventListener('lostpointercapture', onLostCapture);
    };
    const up = (ev: PointerEvent) => {
      detach();
      const g = gesture.current;
      const r = stageRect();
      const mods = g ? { ...g.mods, ...modsOf(ev) } : modsOf(ev);
      endGestureState('pointerup');
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
    const cancelBy = (end: GestureEnd) => {
      detach();
      if (gesture.current === null) return;
      endGestureState(end);
      setDraft(null);
    };
    const cancel = () => cancelBy('pointercancel');
    const onLostCapture = () => cancelBy('lostpointercapture');
    /* the window losing focus mid drag (Cmd Tab, a system dialog): no release will come */
    const onBlur = () => cancelBy('blur');
    /* Escape cancels the drag and the object returns to its committed box */
    const onEscape = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || gesture.current === null) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      cancelBy('escape');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', onBlur);
    window.addEventListener('keydown', onEscape, true);
    pressed?.addEventListener('lostpointercapture', onLostCapture);
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

  /** True when the block is a picture of a vector asset (docs/VECTOR.md 4.4: crop has no vector meaning this round). */
  const isVectorPicture = (block: Block | undefined): boolean =>
    isCroppable(block) && vectorOf(docRef.current.deck.assets[block.asset] ?? RASTER) !== undefined;

  const enterCrop = (blockId: string) => {
    const slideNow = slideRef.current;
    if (!slideNow) return;
    const block = blockById(slideNow, blockId);
    if (!isCroppable(block)) return;
    if (isVectorPicture(block)) {
      /* the toolbar's Crop, Format > Image > Crop image and the double click all land here */
      notice(SVG_CROP_SENTENCE);
      return;
    }
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
    if (isVectorPicture(block)) {
      notice(SVG_CROP_SENTENCE);
      return;
    }
    enterCropAt(
      blockId,
      [block.pos.x, block.pos.y, block.pos.w, block.pos.h],
      block.trim ?? NO_TRIM,
    );
  };

  /** Enter or a click outside: one write of the trim and the frame, converting the slide first (SPEC-2 1.6 "Crop image"); Esc cancels (`commitCrop` false) and discards the frame and the trim. */
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

  /**
   * The vector file of the selection when it is exactly one picture of a vector asset
   * (docs/VECTOR.md 4.5), for the theme on screen; null for every other selection.
   */
  const svgPathOfSelection = (): string | null => {
    const slideNow = slideRef.current;
    if (!slideNow) return null;
    const ids = selectedIds(selectionRef.current, extraRef.current);
    if (ids.length !== 1) return null;
    const block = blockById(slideNow, ids[0] as string);
    if (!isCroppable(block)) return null;
    const asset = docRef.current.deck.assets[block.asset];
    if (asset === undefined) return null;
    return assetVector(asset, themeRef.current) ?? null;
  };

  /** The markup the read ahead holds for the selected svg picture, or null before it landed. */
  const svgMarkupOfSelection = (): string | null => {
    const path = svgPathOfSelection();
    return path === null ? null : (svgMarkup.current.get(path) ?? null);
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
      /* a spreadsheet's rows with no session open make a table (docs/FEATURES.md 2.3 item 5);
         Paste without formatting keeps them as text, the chord's own promise */
      const grid = payload.kind === 'text' && !plain ? parseTablePaste(text) : null;
      if (grid !== null) {
        await insertPastedTable(grid);
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
   * Two or more tab separated rows pasted with no session open (docs/FEATURES.md 2.3 item 5;
   * audit-objects 12): a table with one cell per pasted cell, a header row when the first row has
   * no numbers, its box sized to the rows and placed like an insert (centred, on top of the
   * stack, the slide converted first when it is not a canvas yet), in one commit. The snackbar
   * "Table pasted" carries Undo because the table lands under no pointer. Whatever stands
   * selected, a table included, is left alone: the rows make their own table.
   */
  const insertPastedTable = async (grid: PastedGrid): Promise<void> => {
    const block = pastedTableBlock('table', grid);
    const size = pastedTableSize(block.rows.length, block.columns.length);
    await insertObject(block as Block, { box: centredBox(size) });
    notice('Table pasted', true);
  };

  /**
   * A spreadsheet's rows pasted into an open table cell (docs/FEATURES.md 2.3 item 5): the cells
   * fill right and down from that cell, the rows and columns they need added at the edges, at
   * most 20 by 20 (table-session.ts tableWithPastedGrid), in one commit of the rows and columns.
   * The session ends first, so its last keystrokes land before the grid and never over it, and
   * the caret comes back to the same cell on the grid the write draws, through the layout effect
   * Tab uses. False for anything but a grid in a table cell, which the session inserts as text as
   * before (InlineText onPaste).
   */
  const pasteIntoCell = (text: string): boolean => {
    const current = editingRef.current;
    const slideNow = slideRef.current;
    if (!current || !slideNow) return false;
    const block = blockById(slideNow, current.blockId);
    if (block?.type !== 'table') return false;
    const cell = cellPointer(current.pointer);
    if (cell === null) return false;
    const grid = parseTablePaste(text);
    if (grid === null) return false;
    const table = block as TableBlock;
    const edited = tableWithPastedGrid(table, cell, grid);
    if (edited === null) return false;
    inlineRef.current?.end('blur');
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
    if (mutations.length === 0) return true;
    pendingEdit.current = { blockId: table.id, pointer: current.pointer, caret: 'end' };
    commit(mutations);
    return true;
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

  /**
   * The format Cmd+Option+C copied (Google's copy formatting), kept until the next copy: unlike the
   * toolbar's Paint format, the chord arms no click to paint, so an Escape or a click on another
   * object between the copy and Cmd+Option+V leaves it in place (docs/RETURN.md section 5
   * formatting.paint-format.chords; the walk's Escape between the two chords disarmed the click
   * paint and pasted nothing, return/build/integrator.md).
   */
  const copiedFormat = useRef<PaintFormat | null>(null);
  const copyFormat = (): boolean => {
    const source = selectedBlocks()[0];
    if (!source) return false;
    const format = paintFormatOf(source, caretRef.current?.marks);
    if (Object.keys(format).length === 0) return false;
    copiedFormat.current = format;
    return true;
  };
  /** Cmd+Option+V: the armed paint's format when the brush is armed, else the copied one, on every selected object. */
  const pasteFormat = (ids: readonly string[]): boolean => {
    const slideNow = slideRef.current;
    const format = paintRef.current?.format ?? copiedFormat.current;
    if (!slideNow || !format || ids.length === 0) return false;
    const mutations = ids.flatMap((id) => {
      const target = blockById(slideNow, id);
      return target ? paintMutations(slideNow, target, format) : [];
    });
    if (mutations.length > 0) commit(mutations);
    if (paintRef.current && !paintRef.current.keep) setPaint(null);
    return true;
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

  /**
   * Cmd B with a text block selected: the display weight on the whole block (SPEC 3.2 row 14).
   * Answers whether it wrote: the cover title's heading is a field object with no block, so the
   * key falls through to the shell's `format.text.bold` plan, whose write the studio converts
   * (docs/RETURN.md 2.14 item 1; return/build/b2.md R1, `text.title.bold-cmd-b`).
   */
  /**
   * The cells a mark on a selected table writes (docs/FEATURES.md 2.2 rank 8; audit-objects 7):
   * the range's drawn cells when a range stands on the table, else every drawn cell of a table
   * selected by one click, each with its text and its whole plain range. Empty cells are left
   * out: a mark on no character writes nothing.
   */
  const tableMarkTargets = (
    table: TableBlock,
  ): { pointer: string; text: Markup; range: [number, number] }[] => {
    const bounds = rangeOn(table.id) ?? {
      r0: 0,
      c0: 0,
      r1: table.rows.length - 1,
      c1: table.columns.length - 1,
    };
    return drawnCellsIn(table, bounds).flatMap(([r, c]) => {
      const text = table.rows[r]?.cells[c] ?? '';
      const length = plainLength(text);
      return length === 0 ? [] : [{ pointer: `/rows/${r}/cells/${c}`, text, range: [0, length] }];
    });
  };

  /**
   * One text.replace per cell of a selected table toggling a mark over every cell (rank 8, the
   * keys' path; the toolbar and the menu go through the shell's plan): the mark is cleared when
   * every cell already carries it whole and set otherwise, so one Cmd+B bolds the header row and
   * the next one takes it back, in one commit and one Cmd+Z.
   */
  const tableMarkMutations = (slideNow: Slide, table: TableBlock, mark: ToggleMark): Mutation[] => {
    const targets = tableMarkTargets(table);
    if (targets.length === 0) return [];
    const on = targets.every((target) =>
      mark === 'b'
        ? boldOfRange(target.text, target.range)
        : rangeHasMark(target.text, target.range, mark),
    );
    return targets.flatMap((target): Mutation[] => {
      const next = canonicalText(
        mark === 'b'
          ? setBoldRange(target.text, target.range, !on)
          : styleRange(target.text, target.range, { [mark]: !on }),
      );
      if (next === target.text) return [];
      return [
        {
          op: 'text.replace',
          slideId: slideNow.id,
          blockId: table.id,
          path: target.pointer,
          range: [0, target.text.length],
          text: next,
        },
      ];
    });
  };

  const toggleWeight = (): boolean => {
    const slideNow = slideRef.current;
    if (!slideNow) return false;
    const mutations = selectedBlocks().flatMap((block): Mutation[] => {
      /* a table's weight is its cells' bold run over the range or the whole table (rank 8) */
      if (block.type === 'table') return tableMarkMutations(slideNow, block, 'b');
      if (!isTextBlockType(block.type)) return [];
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
    if (mutations.length === 0) return false;
    commit(mutations);
    return true;
  };

  /**
   * A mark on the caret's range while a run is being edited, else over the whole text of every
   * selected text object as one text.replace per object (SPEC-2 6.2 "Text marks"). Answers
   * whether it wrote, as `toggleWeight` does, so the chords on a selected field object (Cmd+I,
   * Cmd+U, Cmd+Shift+X, Cmd+., Cmd+,) reach the shell's `text.style` plans.
   */
  const toggleMarkOnSelection = (mark: ToggleMark): boolean => {
    if (inlineRef.current) {
      inlineRef.current.toggleMark(mark);
      return true;
    }
    const slideNow = slideRef.current;
    if (!slideNow) return false;
    const mutations = selectedBlocks().flatMap((block): Mutation[] => {
      /* a table: the mark over the range's cells or every cell (docs/FEATURES.md 2.2 rank 8) */
      if (block.type === 'table') return tableMarkMutations(slideNow, block, mark);
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
    if (mutations.length === 0) return false;
    commit(mutations);
    return true;
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
  const insertObject = (
    block: Block,
    options: {
      box?: Box;
      bottom?: boolean;
      /**
       * the box read from the slide as a canvas at commit time (a picture's place in the body
       * slot, picture-place.ts), with the empty placeholders the object takes the place of, which
       * leave in the same write so one Cmd+Z restores them with the object gone
       */
      place?: (canvas: Slide) => { box: Box; remove?: ReadonlyArray<string> };
    } = {},
  ): Promise<void> =>
    commitCanvas(
      (canvas) => {
        const taken = takenBlockIds(canvas);
        const id = freeId(block.id, taken);
        const placed = options.place?.(canvas);
        const removed = new Set(placed?.remove ?? []);
        const stack = freeformBlocks(canvas).filter((each) => !removed.has(each.id));
        const size = TOOL_DEFAULT_SIZE[block.type as keyof typeof TOOL_DEFAULT_SIZE] ?? [320, 160];
        const box =
          placed?.box ??
          options.box ??
          (block.type === 'picture' ? [0, 0, 1600, 900] : centredBox(size));
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
        for (const blockId of removed) {
          if (blockById(canvas, blockId) !== undefined)
            mutations.push({ op: 'block.remove', slideId: canvas.id, blockId });
        }
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

  /** The natural size of a picture file, read from the browser's decoder; undefined when it cannot be decoded in time. */
  const pictureSizeOf = (url: string): Promise<readonly [number, number] | undefined> =>
    new Promise((resolve) => {
      const image = new Image();
      const timer = window.setTimeout(() => resolve(undefined), 1500);
      image.onload = () => {
        window.clearTimeout(timer);
        resolve(
          image.naturalWidth > 0 && image.naturalHeight > 0
            ? [image.naturalWidth, image.naturalHeight]
            : undefined,
        );
      };
      image.onerror = () => {
        window.clearTimeout(timer);
        resolve(undefined);
      };
      image.src = url;
    });

  /** What a picture route came to: a picture landed, or the sentence that says why none did. */
  type PictureOutcome = { ok: true } | { ok: false; sentence: string };

  /** Where a picture goes: a block's picture swapped, the picture slide's, the background, a drop point, or the body slot. */
  type PictureWhere = {
    blockId?: string;
    point?: Point;
    replace?: boolean;
    background?: boolean;
    box?: Box;
    /** the way the file came in (docs/VECTOR.md 4.8): each svg way reads its parked id; the chooser when absent */
    way?: SvgWay;
  };

  /**
   * The box a new picture takes on the slide as it stands (picture-place.ts pictureInsertArea):
   * the slide read as a canvas, the stage's measured boxes standing in for the hidden sheet's
   * conversion when the slide is not a canvas yet, so the preview and the write agree to a pixel
   * or so; the write reads the measured canvas itself through insertObject's `place`.
   */
  const picturePlaceOn = (
    slideNow: Slide | undefined,
    size: readonly [number, number] | undefined,
  ): { box: Box; remove: string[] } => {
    if (!slideNow) return { box: pictureInsertBox(size), remove: [] };
    const canvas = isFreeformSlide(slideNow)
      ? slideNow
      : (toFreeform(slideNow, boxesRef.current)?.slide ?? slideNow);
    const placed = pictureInsertArea(canvas, size);
    return { box: pictureInsertBox(size, placed.area), remove: placed.replaces };
  };

  /**
   * The write for an asset the document holds (docs/PRODUCT.md section 2 rank 10; Google puts an
   * inserted image into the slide's empty body placeholder, else centred over the body): a drop
   * keeps its point at the drop width; the picture of `blockId` is swapped in place with its box
   * kept ("Picture replaced" with Undo); `replace` on a picture slide swaps the slide's picture;
   * `background` lands the covering picture object at the bottom of the stack (SPEC-2 2.6.4);
   * every other route places a picture object in the body slot at the largest size with the 40
   * px margin, selected, and the empty body placeholder it fills leaves in the same write, so no
   * prompt sits under it and one Cmd+Z restores it. An asset the server answered but the document
   * has not received over the watch channel yet is waited for first: a block naming it before then
   * is refused by the validator, which is how Image by URL landed nothing (VERIFICATION.md product
   * pass 1 finding 7).
   */
  const placePictureAsset = async (
    asset: { id: string; size?: Asset['size'] | undefined },
    where: PictureWhere = {},
    naturalSize?: readonly [number, number],
  ): Promise<PictureOutcome> => {
    const maxMb = Math.round(PICTURE_MAX_BYTES / (1024 * 1024));
    if (docRef.current.deck.assets[asset.id] === undefined) {
      const landed = await waitFor(
        () => docRef.current.deck.assets[asset.id] !== undefined,
        ASSET_WAIT_MS,
      );
      if (!landed) return { ok: false, sentence: uploadFailureSentence('did-not-finish', maxMb) };
    }
    const slideNow = slideRef.current;
    if (!slideNow) return { ok: false, sentence: 'Open a slide in Editing mode to add a picture' };
    if (where.background === true) {
      /* the picture object covering the sheet at the bottom of the stack (SPEC-2 2.6.4) */
      insertObject({ id: 'picture', type: 'picture', asset: asset.id } as Block, {
        bottom: true,
      });
      return { ok: true };
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
      notice('Picture replaced', true);
      return { ok: true };
    }
    if (where.replace === true && target === undefined && 'picture' in slideNow) {
      commit([{ op: 'slide.set', slideId: slideNow.id, path: '/picture/asset', value: asset.id }]);
      notice('Picture replaced', true);
      return { ok: true };
    }
    /* the box at the picture's own aspect: the picture fills its box since the focus round
       (docs/FOCUS.md rank 18), so a fixed box would squash it at the insert */
    const size = asset.size ?? naturalSize;
    const shot = { id: 'shot', type: 'shot', asset: asset.id } as Block;
    if (where.box !== undefined) {
      insertObject(shot, { box: where.box });
    } else if (where.point !== undefined) {
      insertObject(shot, { box: droppedPictureBox(where.point, DROP_PICTURE_WIDTH, size) });
    } else {
      insertObject(shot, {
        place: (canvas) => {
          const placed = pictureInsertArea(canvas, size);
          return { box: pictureInsertBox(size, placed.area), remove: placed.replaces };
        },
      });
    }
    return { ok: true };
  };

  /**
   * A picture object for an asset the document holds (Image by URL's `asset.add` answer, the
   * upload once its asset landed): placePictureAsset with the sentence shown when nothing lands.
   */
  const insertPictureAsset = async (
    asset: { id: string; size?: Asset['size'] | undefined },
    where: { blockId?: string; box?: Box } = {},
  ): Promise<void> => {
    const outcome = await placePictureAsset(asset, where);
    if (!outcome.ok) notice(outcome.sentence);
  };

  /**
   * A logo asset the document holds (docs/FEATURES.md 4.4; audit-logos 9, 11, 14; B6): the Logo
   * dialog's `logo.insert` stored the mark, and this places it. The size is the logo rule, never
   * the largest fit: a symbol 160 sheet px tall, a wordmark (a `wordmark*`, `lockup` or
   * `horizontal` variant) 320 wide, both at the mark's own ratio, scaled down when the free area
   * of the body slot is smaller and never up, centred in that area (the picture rule's
   * `pictureInsertArea`, so the empty body placeholder it fills leaves in the same write). On a
   * title slide that has become a canvas the mark lands beside the brand's mark on the mark
   * slot's row, scaled to its height (logo-model.ts `logoTitleArea`): the title layout has no
   * body slot and its empty lead read as a placeholder for the whole content box, which put the
   * customer's mark over the heading's words (the verifier's pass 1, F3); the title's placeholders
   * are never removed. The same rules live in packages/chrome/src/logo-model.ts for the server's
   * placement; the viewer cannot import the chrome, so the numbers are repeated here. `blockId` swaps that picture's
   * asset in place with its box kept (Replace image > Logo). `everySlide` adds the kit's three
   * writes to the same commit (the plan of packages/chrome/src/brand/UseOnEverySlide.tsx, made
   * here with the schema's `brandWriteMutation` because the viewer does not import the chrome), so
   * one Cmd+Z takes the picture and the slots back together, and the snackbar names the mark with
   * Undo. A plain insert says nothing (audit-logos 20).
   */
  const insertLogoAsset = async (
    asset: { id: string; size?: Asset['size'] | undefined },
    where: { title: string; variant?: string; everySlide?: boolean; blockId?: string },
  ): Promise<void> => {
    const maxMb = Math.round(PICTURE_MAX_BYTES / (1024 * 1024));
    if (docRef.current.deck.assets[asset.id] === undefined) {
      const landed = await waitFor(
        () => docRef.current.deck.assets[asset.id] !== undefined,
        ASSET_WAIT_MS,
      );
      if (!landed) {
        notice(uploadFailureSentence('did-not-finish', maxMb));
        return;
      }
    }
    const slideNow = slideRef.current;
    if (!slideNow) {
      notice('Open a slide in Editing mode to add a logo');
      return;
    }
    const stored = docRef.current.deck.assets[asset.id];
    const natural = asset.size ?? stored?.size;
    const everySlideMutations = (): Mutation[] => {
      if (where.everySlide !== true) return [];
      const deck = docRef.current.deck;
      const first = brandWriteMutation(deck, '/mark', { kind: 'picture', assetId: asset.id });
      const afterFirst = {
        brand: { ...(deck.brand ?? {}), mark: { kind: 'picture' as const, assetId: asset.id } },
      };
      const second = brandWriteMutation(afterFirst, '/footer/logo', 'picture');
      const afterSecond = {
        brand: {
          ...afterFirst.brand,
          footer: { ...(afterFirst.brand.footer ?? {}), logo: 'picture' as const },
        },
      };
      const third = brandWriteMutation(afterSecond, '/footer/assetId', asset.id);
      return [first, second, third] as Mutation[];
    };
    const everySlideNotice = (): void => {
      if (where.everySlide === true) notice(`The ${where.title} logo is on every slide`, true);
    };
    if (where.blockId !== undefined) {
      const target = blockById(slideNow, where.blockId);
      if (target && (target.type === 'shot' || target.type === 'picture')) {
        commit([
          {
            op: 'block.set',
            slideId: slideNow.id,
            blockId: target.id,
            path: '/asset',
            value: asset.id,
          },
          ...everySlideMutations(),
        ]);
        select({ kind: 'block', blockId: target.id });
        if (where.everySlide === true) everySlideNotice();
        else notice('Picture replaced', true);
        return;
      }
    }
    /* the logo size (4.4): a symbol 160 tall, a wordmark 320 wide, at the mark's ratio */
    const wordmark =
      where.variant !== undefined && /^wordmark|^lockup|^horizontal$/.test(where.variant);
    const ok = natural !== undefined && natural[0] > 0 && natural[1] > 0;
    const ratio = ok ? natural[0] / natural[1] : wordmark ? 4 : 1;
    const wanted: [number, number] = wordmark
      ? [320, Math.max(8, Math.round(320 / ratio))]
      : [Math.max(8, Math.round(160 * ratio)), 160];
    const logoBox = (area: Box): Box => {
      const maxW = Math.max(8, area[2] - 2 * PICTURE_MARGIN);
      const maxH = Math.max(8, area[3] - 2 * PICTURE_MARGIN);
      const scale = Math.min(1, maxW / wanted[0], maxH / wanted[1]);
      const w = Math.max(8, Math.round(wanted[0] * scale));
      const h = Math.max(8, Math.round(wanted[1] * scale));
      return [
        Math.round(area[0] + (area[2] - w) / 2),
        Math.round(area[1] + (area[3] - h) / 2),
        w,
        h,
      ];
    };
    /* the title rule (logo-model.ts logoTitleArea, logoBoxAtStart): the mark slot's row to the
       right of the mark block, past any object already on it, 40 px from each; the logo scaled to
       the row's height at the area's left edge */
    const titleGap = 40;
    const titleArea = (canvas: Slide): Box | null => {
      if (grammarRecordOf(canvas)?.kind !== 'title') return null;
      const objects = freeformBlocks(canvas);
      const mark = objects.find((block) => block.type === 'mark' && block.pos !== undefined);
      const pos = mark?.pos;
      if (pos === undefined) return null;
      let left = pos.x + pos.w + titleGap;
      const right = BODY_SLOT[0] + BODY_SLOT[2] - titleGap;
      for (const block of objects) {
        if (block === mark || block.pos === undefined || block.type === 'picture') continue;
        const own = block.pos;
        if (own.y >= pos.y + pos.h || own.y + own.h <= pos.y) continue;
        if (own.x + own.w <= pos.x + pos.w || own.x >= right) continue;
        left = Math.max(left, own.x + own.w + titleGap);
      }
      return right - left < 8 ? null : [left, pos.y, right - left, pos.h];
    };
    const logoBoxAtStart = (area: Box): Box => {
      const scale = Math.min(1, area[2] / wanted[0], area[3] / wanted[1]);
      const w = Math.max(8, Math.round(wanted[0] * scale));
      const h = Math.max(8, Math.round(wanted[1] * scale));
      return [Math.round(area[0]), Math.round(area[1] + (area[3] - h) / 2), w, h];
    };
    await commitCanvas(
      (canvas) => {
        const onTitle = titleArea(canvas);
        const placed =
          onTitle !== null ? { area: onTitle, replaces: [] } : pictureInsertArea(canvas, natural);
        const box = onTitle !== null ? logoBoxAtStart(onTitle) : logoBox(placed.area);
        const taken = takenBlockIds(canvas);
        const id = freeId('logo', taken);
        const removed = new Set(placed.replaces);
        const stack = freeformBlocks(canvas).filter((each) => !removed.has(each.id));
        const z = Math.max(0, ...stack.map((b) => b.pos?.z ?? 0)) + 1;
        const pos: Position = {
          x: Math.round(box[0]),
          y: Math.round(box[1]),
          w: Math.max(1, Math.round(box[2])),
          h: Math.max(1, Math.round(box[3])),
          z,
        };
        const mutations: Mutation[] = [];
        for (const blockId of removed) {
          if (blockById(canvas, blockId) !== undefined)
            mutations.push({ op: 'block.remove', slideId: canvas.id, blockId });
        }
        const last = stack[stack.length - 1]?.id;
        mutations.push({
          op: 'block.insert',
          slideId: canvas.id,
          slot: 'main',
          ...(last !== undefined ? { after: last } : {}),
          block: { id, type: 'shot', asset: asset.id, pos } as Block,
        });
        mutations.push(...everySlideMutations());
        pendingSelect.current = [id];
        return mutations;
      },
      { autofit: false },
    );
    everySlideNotice();
  };

  /**
   * One step insert of a picture file (gslides-parity SPEC 7.2.14; docs/PRODUCT.md section 2 rank
   * 10): the file's first bytes are read before anything else, so a file that is not a picture is
   * refused at once with the sentence and nothing is drawn; a picture draws at once from a local
   * object URL inside the sheet at the box it will take, with a progress bar while `asset.add`
   * runs (the box is read again once the browser has decoded the picture's size), then the write
   * of placePictureAsset lands once the asset has reached the document over the watch channel.
   * A refusal from the server reads as one sentence with its reason (never a code): "the file is
   * not a picture", "the file is over 25 MB", "the upload did not finish".
   */
  const insertPictureFile = async (file: File, where: PictureWhere): Promise<PictureOutcome> => {
    const maxMb = Math.round(PICTURE_MAX_BYTES / (1024 * 1024));
    if (file.size > PICTURE_MAX_BYTES)
      return { ok: false, sentence: uploadFailureSentence('too-large', maxMb) };
    let head: Uint8Array;
    try {
      head = new Uint8Array(await file.slice(0, 512).arrayBuffer());
    } catch {
      return { ok: false, sentence: uploadFailureSentence('not-a-picture', maxMb) };
    }
    const kind = sniffPictureKind(head);
    if (kind === null)
      return { ok: false, sentence: uploadFailureSentence('not-a-picture', maxMb) };
    /* a parked svg way is off (docs/VECTOR.md 4.8): the file reads as one that is not a picture */
    if (kind === 'svg' && parkedRef.current?.(SVG_WAY_IDS[where.way ?? 'upload']) === true)
      return { ok: false, sentence: uploadFailureSentence('not-a-picture', maxMb) };
    const slideBefore = slideRef.current;
    const target =
      slideBefore && where.blockId !== undefined
        ? blockById(slideBefore, where.blockId)
        : undefined;
    const replacing =
      (target !== undefined && (target.type === 'shot' || target.type === 'picture')) ||
      (where.replace === true &&
        target === undefined &&
        slideBefore !== undefined &&
        'picture' in slideBefore) ||
      where.background === true;
    /* the instant preview: the file drawn at the box it will take (rank 10; audit-seller 22: the
       sheet showed nothing for up to 3 s), first at the 16:9 guess and then at the picture's own
       aspect once the decoder has read its size, so the first frame never waits for the decode */
    const localUrl = URL.createObjectURL(file);
    const previewFor = (size: readonly [number, number] | undefined): Box | null =>
      replacing
        ? null
        : where.box !== undefined
          ? where.box
          : where.point !== undefined
            ? droppedPictureBox(where.point, DROP_PICTURE_WIDTH, size)
            : picturePlaceOn(slideBefore, size).box;
    const firstBox = previewFor(undefined);
    if (firstBox !== null) {
      clearUploading();
      uploadingUrl.current = localUrl;
      setUploading({ box: firstBox, url: localUrl });
    }
    const naturalSize = await pictureSizeOf(localUrl);
    if (firstBox !== null && naturalSize !== undefined && uploadingUrl.current === localUrl) {
      const sized = previewFor(naturalSize);
      if (sized !== null) setUploading({ box: sized, url: localUrl });
    }
    if (firstBox === null) URL.revokeObjectURL(localUrl);
    const done = () => {
      if (uploadingUrl.current === localUrl) clearUploading();
    };
    try {
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
      } catch (error) {
        /* the preview leaves before the sentence, so no placeholder stands under a refusal */
        done();
        return { ok: false, sentence: uploadFailureSentence(uploadFailureOf(error), maxMb) };
      }
      const outcome = await placePictureAsset(asset, where, naturalSize);
      /* the preview stays until the block draws: the write measures a slide that is not a canvas
         yet before it commits, and a preview that left first showed a blank box for that moment */
      if (outcome.ok && firstBox !== null) {
        await waitFor(() => {
          const slideNow = slideRef.current;
          return (
            slideNow !== undefined &&
            freeformBlocks(slideNow).some(
              (block) => (block as { asset?: string }).asset === asset.id,
            )
          );
        }, 2500);
      }
      return outcome;
    } finally {
      done();
    }
  };

  /** The handle's picture insert: insertPictureFile with the sentence shown when nothing lands. */
  const insertPicture = async (file: File, where: PictureWhere = {}): Promise<void> => {
    const outcome = await insertPictureFile(file, where);
    if (!outcome.ok) notice(outcome.sentence);
  };

  /**
   * A picture at a web address (Insert > Image > By URL, Replace image > By URL; docs/PRODUCT.md
   * section 5 "Image by URL"; VERIFICATION.md product pass 1 finding 7): the page fetches the
   * bytes itself when the address lets it (its own origin on every tier, a host that allows a
   * cross origin read), and the file then takes the upload's whole path, the sniff, the instant
   * preview and the placement included. An address the page cannot read (a host with no CORS
   * headers) goes to the server's `asset.add` by URL, which fetches from its capture allowlist
   * with the pinned lookup and never from a private address. Rejects with the sentence the dialog
   * shows when no picture lands; a same origin address that fails is final, since the server
   * cannot reach a page's origin the page itself could not.
   */
  const insertPictureFromUrl = async (
    url: string,
    where: { blockId?: string; replace?: boolean } = {},
  ): Promise<void> => {
    const address = url.trim();
    let sameOrigin = false;
    try {
      sameOrigin = new URL(address, window.location.href).origin === window.location.origin;
    } catch {
      throw new Error(urlFailureSentence('the address is not a web address'));
    }
    let file: File | null = null;
    try {
      const response = await fetch(address, {
        mode: 'cors',
        signal: AbortSignal.timeout(URL_FETCH_MS),
      });
      if (response.ok) {
        const blob = await response.blob();
        file = new File([blob], pictureNameOf(address, blob.type), { type: blob.type });
      } else if (sameOrigin) {
        throw new Error(urlFailureSentence(`the address answered ${response.status}`));
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('The picture could not')) throw error;
      if (sameOrigin) throw new Error(urlFailureSentence('the address did not answer'));
      /* a cross origin read the page may not make: the server tries */
    }
    if (file !== null) {
      const outcome = await insertPictureFile(file, { ...where, way: 'url' });
      if (!outcome.ok) throw new Error(outcome.sentence);
      return;
    }
    let asset: Asset;
    try {
      asset = (await call('asset.add', {
        url: address,
        role: 'capture',
        alt: altFor(pictureNameOf(address, '')),
      })) as Asset;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      /* the server's allowlist sentence of the features round names the four sites and reads whole
         (docs/FEATURES.md 4.7, build/b7.md R2); the older lines keep their clause */
      const allowlistSentence =
        /Pictures can be fetched from these sites only:.*?\.\s+Upload the file instead/i.exec(
          message,
        )?.[0];
      const reason =
        allowlistSentence !== undefined
          ? allowlistSentence.replace(/^Pictures/, 'pictures')
          : /allowlist|not a public address|private address/i.test(message)
            ? 'the page could not read it and the server may not fetch from this host'
            : /no answer within|timed out|timeout/i.test(message)
              ? 'the address did not answer'
              : /HTTP (\d{3})/.exec(message)
                ? `the address answered ${/HTTP (\d{3})/.exec(message)?.[1] ?? ''}`
                : uploadFailureSentence(
                    uploadFailureOf(error),
                    Math.round(PICTURE_MAX_BYTES / (1024 * 1024)),
                  ).replace('The picture could not be uploaded: ', '');
      throw new Error(urlFailureSentence(reason));
    }
    const outcome = await placePictureAsset(asset, where);
    if (!outcome.ok) throw new Error(outcome.sentence);
  };

  /**
   * Add a caption on the selected shot (docs/PRODUCT.md section 2 rank 10; Google's caption is a
   * text box the seller places by hand): the caption field is written empty, so the figure draws
   * its "Add a caption" prompt, and the session opens on it at once; typing stores the caption
   * through the burst path and one Cmd+Z takes it back.
   */
  const addCaption = (): boolean => {
    const slideNow = slideRef.current;
    if (!slideNow || editingRef.current) return false;
    const anchor = selectedBlockId(selectionRef.current);
    const block = anchor === null ? undefined : blockById(slideNow, anchor);
    if (!block || block.type !== 'shot') return false;
    if (block.caption === undefined) {
      commit([
        { op: 'block.set', slideId: slideNow.id, blockId: block.id, path: '/caption', value: '' },
      ]);
    }
    pendingEdit.current = { blockId: block.id, pointer: 'caption', caret: 'end' };
    if (block.caption !== undefined) {
      const el = body.current;
      const run = el ? runElement(el, block.id, 'caption') : null;
      if (run) {
        pendingEdit.current = null;
        startEdit({ blockId: block.id, pointer: 'caption', element: run }, 'end');
      }
    }
    return true;
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

  /* the handle below is built once, so the step reads the live scale through a ref: the first
     render's 0 made every step land on 25 percent (docs/FOCUS.md rank 23) */
  const kRef = useRef(k);
  kRef.current = k;
  const zoomStepBy = (direction: 1 | -1) => {
    zoomTo(stepZoom(kRef.current, direction));
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
    const vectorPicture = ids.length === 1 && isVectorPicture(block);
    const cells = rangeOn(anchor ?? null);
    return {
      blocks: ids.length,
      blockIds: ids,
      ...(cells !== null ? { cells } : {}),
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
      vectorPicture,
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
      insertPictureFromUrl,
      insertPictureAsset,
      insertLogoAsset,
      addCaption,
      toCanvas,
      zoomTo,
      zoomStep: zoomStepBy,
      scale: () => kRef.current,
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
      cropOpen: () => cropRef.current !== null,
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
      /* crop mode owns Enter and Esc (SPEC-2 6.1 row 19): Enter writes the trim, Esc leaves
         without a write (docs/FOCUS.md rank 33) */
      if (cropRef.current) {
        if (e.key === 'Enter' || e.key === 'Escape') {
          exitCrop(e.key === 'Enter');
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
        const inside = e.target instanceof Node && root.current?.contains(e.target) === true;
        const fromPage = e.target === document.body;
        /* a Tab from a chrome control outside the stage and the overlay (the Slideshow half, a
           toolbar button, a panel field) is the browser's whether or not an object is selected
           (docs/RETURN.md 4.1, chrome.split.tab-order: the stage took the Tab from the Slideshow
           half with the title selected and moved the selection to the subtitle); an overlay
           handle keeps the walk, so Tab after a drag from a handle still cycles the objects */
        const fromOverlay = e.target instanceof Element && e.target.closest('.ts-overlay') !== null;
        if (
          !stageOwnsTab({ selected: current !== null, fromControl, fromOverlay, inside, fromPage })
        )
          return;
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
      /* Delete and Backspace with nothing selected do nothing on the stage and never reach the
         document's key table, where `edit.delete` would remove the current slide with no prompt
         (docs/FOCUS.md rank 4; audit-arrange row 48). A slide leaves through the filmstrip's own
         Delete, the Slide menu or Edit > Delete with the filmstrip focused. */
      if (
        current === null &&
        (e.key === 'Delete' || e.key === 'Backspace') &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        stop();
        return;
      }
      const free = isFreeformSlide(slideNow);
      const ids = selectedIds(current, extraRef.current);
      /* the switch as the shell publishes it on its root (EditorShell: data-advanced-tools on
         .pt-viewer, docs/FOCUS.md 3.1); a stage outside the shell reads no switch and keeps every
         chord */
      const shell = root.current?.closest('.pt-viewer') ?? null;
      const action = editorKeyAction(e, {
        selected: current !== null,
        freeform: free,
        editing: false,
        editable: false,
        apple,
        several: ids.length > 1,
        grouped: sharedGroup(slideNow, ids) !== null,
        ...(shell === null ? {} : { advanced: shell.hasAttribute('data-advanced-tools') }),
      });
      if (action === null) {
        /* no bare letter is a command on the stage (SPEC 0.28); with one text object selected a
           printable key is the first keystroke of its session (AMENDMENTS.md A1 rule 4): the
           session opens with the whole text selected and the character replaces it, as in Google
           Slides; with a block selected and nothing to type into the letter is consumed, so a
           stray keystroke never reaches a shell key */
        if (current !== null && isBareCharacterKey(e)) {
          const run = ids.length === 1 ? entryRunOf(el, current.blockId) : null;
          const char = typingEntry(e, {
            textObject:
              run !== null && readRunText(slideNow, run.blockId, run.pointer) !== undefined,
            several: ids.length > 1,
            editing: false,
            editable: false,
            composing: e.isComposing,
          });
          if (char !== null && run !== null && gesture.current === null) {
            /* accumulate, so a second printable key that lands before the session mounts (a slow
               render) is not lost but appended; startEdit is idempotent on the same run */
            pendingInsert.current = (pendingInsert.current ?? '') + char;
            startEdit(run, entryCaretFor(slideNow, current.blockId, 'typing'));
          }
          stop();
        }
        return;
      }
      /* Shift with an arrow while a cell range stands on the selected table and no cell is open
         (docs/FEATURES.md 2.2 rank 5, `tables.range.shift-arrows`): the range's focus steps one
         cell, the anchor stays; the plain arrows keep nudging the object */
      if (
        e.shiftKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        e.key.startsWith('Arrow') &&
        current !== null &&
        cellRangeRef.current !== null &&
        cellRangeRef.current.blockId === current.blockId
      ) {
        const range = cellRangeRef.current;
        const table = blockById(slideNow, range.blockId);
        const direction = e.key.slice(5).toLowerCase() as CellDirection;
        const focus = table?.type === 'table' ? adjacentCell(table, range.focus, direction) : null;
        if (focus !== null) setRange({ ...range, focus });
        stop();
        return;
      }
      switch (action.type) {
        case 'escape':
          /* Escape during a drag cancels the drag (beginGesture's own listener, registered after
             this one) and leaves the selection as it is */
          if (gesture.current !== null) return;
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
          if (cellRangeRef.current !== null) {
            /* Esc on a cell range leaves the table selected: one more step in A1 rule 4's chain
               (the session, the object, nothing) */
            setRange(null);
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
          /* Enter on a selected text object opens its session with the caret at the end
             (AMENDMENTS.md A1 rule 4; SPEC 6.9); on a table the remembered cell (docs/FEATURES.md
             2.2 rank 4); on a selected chart the Chart data grid (rank 7); on a selected group
             the first label, with its member entered behind it (rank 6) */
          if (current === null) return;
          const groupTag = ids.length > 1 ? sharedGroup(slideNow, ids) : null;
          if (groupTag !== null) {
            const first = groupLabelRuns(el, slideNow, groupTag)[0];
            if (first !== undefined) {
              setGroupEntered(first.blockId);
              groupEnteredRef.current = first.blockId;
              select({ kind: 'block', blockId: first.blockId }, []);
              startEdit(first, 'end');
              stop();
            }
            return;
          }
          if (ids.length === 1 && blockById(slideNow, current.blockId)?.type === 'chart') {
            requestChartCell(current.blockId, 1, 1, true);
            stop();
            return;
          }
          const run = entryRunOf(el, current.blockId);
          if (run) {
            startEdit(run, entryCaretFor(slideNow, current.blockId, 'enter'));
            stop();
          }
          return;
        }
        case 'delete': {
          /* Delete and Backspace on a cell range clear the cells' text and keep the cells, as in
             Google Slides (table-range.ts), never the table; one write, one Cmd+Z */
          const bounds = rangeOn(current?.blockId ?? null);
          const table =
            current !== null && bounds !== null ? blockById(slideNow, current.blockId) : undefined;
          if (bounds !== null && table?.type === 'table') {
            const rows = rowsWithRangeCleared(table, bounds);
            if (rows !== null)
              commit([
                {
                  op: 'block.set',
                  slideId: slideNow.id,
                  blockId: table.id,
                  path: '/rows',
                  value: rows,
                },
              ]);
            stop();
            return;
          }
          /* the stage owns Delete and Backspace whenever it owns the key: with nothing selected
             they do nothing, and never fall through to the document's key table, where
             `edit.delete` would remove the current slide with no prompt (docs/FOCUS.md rank 4;
             audit-arrange row 48). A slide leaves through the filmstrip's own Delete or the menu. */
          removeSelected();
          stop();
          return;
        }
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
             prevents the default of every Edit menu chord it matches) never swallows it. Cmd+Shift+V
             arms a plain paste for the paste event the chord fires (docs/PRODUCT.md section 5:
             the handler reads the paste event's text, never the async clipboard, which needs a
             permission and answered nothing, audit-gaps 11) */
          const owns =
            current !== null ||
            e.target === document.body ||
            (e.target instanceof Node && (root.current?.contains(e.target) ?? false));
          if (owns) {
            e.stopImmediatePropagation();
            if (action.type === 'paste') {
              plainPasteArmed.current = action.plain;
              window.setTimeout(() => {
                plainPasteArmed.current = false;
              }, 500);
            }
          }
          return;
        }
        case 'link':
          openLink();
          stop();
          return;
        case 'bold':
          /* consumed only when the stage wrote: on a selected field object (the cover title's
             heading) the key reaches the shell's key table and its format.text.bold plan */
          if (toggleWeight()) stop();
          return;
        case 'paintCopy':
          if (copyFormat()) stop();
          return;
        case 'paintPaste':
          if (pasteFormat(ids)) stop();
          return;
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
          /* Cmd Shift X on a selected list item keeps the round one `no` flag through the menu row;
             a selected field object lets the key through to the shell's text.style plans */
          if (toggleMarkOnSelection(action.mark)) stop();
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
    /* the stage owns the event unless a text session is open, the target is a field or an
       editable region, or it sits in a dialog, a menu or the Format options panel outside the
       stage; a toolbar button or a filmstrip card holding the focus no longer swallows a paste
       (docs/FOCUS.md rank 15; the predicate and its cases are Selection.tsx's) */
    const stageOwns = (e: ClipboardEvent): boolean =>
      stageOwnsClipboard(e.target, root.current, editingRef.current !== null);
    const onCopyOrCut = (e: ClipboardEvent) => {
      if (!stageOwns(e)) return;
      const payload = payloadOfSelection();
      if (!payload) return;
      e.preventDefault();
      /* a selection of exactly one svg picture (docs/VECTOR.md 4.5): its markup as text/plain,
         what Figma, a text editor and a browser read, and the envelope inside a text/html
         comment so the product's own paste across tabs still finds it; the store notes the
         payload without its own system write, which would replace the markup. A copy before
         the read ahead landed, or with the copy parked, writes the envelope alone, as today. */
      const markup =
        parkedRef.current?.('picture.svg.copy') === true ? null : svgMarkupOfSelection();
      if (markup !== null && e.clipboardData) {
        e.clipboardData.setData('text/plain', markup);
        e.clipboardData.setData('text/html', encodeClipboardHtml(payload, markup));
        clipboardRef.current.note(payload, markup);
      } else {
        e.clipboardData?.setData('text/plain', encodeClipboard(payload));
        void clipboardRef.current.write(payload);
      }
      if (e.type === 'cut') removeSelected();
    };
    const onPaste = (e: ClipboardEvent) => {
      /* a paste a session, a grid or a field already took (its default prevented) is not the
         stage's, whatever the target reads as by the time the event reaches the document */
      if (e.defaultPrevented || !stageOwns(e)) return;
      const plain = plainPasteArmed.current;
      plainPasteArmed.current = false;
      const files = imageFilesOf(e.clipboardData);
      if (files.length > 0) {
        e.preventDefault();
        const [first] = files;
        if (first) void insertPicture(first, { way: 'paste' });
        return;
      }
      const text = e.clipboardData?.getData('text/plain') ?? '';
      /* Paste without formatting reads the event's plain text and never the product's envelope
         nor an svg's markup as a picture (docs/VECTOR.md 4.3 item 4: the markup pastes as text) */
      if (plain) {
        if (text === '') return;
        e.preventDefault();
        void pastePayload({ kind: 'text', text }, true);
        return;
      }
      /* the product's envelope first, as text/plain or as the text/html comment of an svg copy */
      const envelope = envelopeOf(e.clipboardData);
      if (envelope !== null) {
        e.preventDefault();
        void pastePayload(envelope, false);
        return;
      }
      /* svg markup (Figma's Copy as SVG, a text editor): a file for the picture path */
      const markup = svgMarkupOf(e.clipboardData);
      if (markup !== null) {
        e.preventDefault();
        void insertPicture(svgFileOf(markup), { way: 'paste' });
        return;
      }
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

  /* the read ahead of an svg picture's markup (docs/VECTOR.md 4.5): the copy event is
     synchronous, so when a selection becomes exactly one vector picture its file is fetched once
     per file per page life (a same origin or public store GET, the store host in connect-src) into
     the map the copy reads; a selection of anything else fetches nothing, and a copy before the
     fetch lands writes the envelope alone. The fetch follows a selection, never a state the cost
     rows measure, and adds no store call and no poll. */
  useEffect(() => {
    const path = svgPathOfSelection();
    if (path === null || svgMarkup.current.has(path) || svgMarkupInFlight.current.has(path)) return;
    svgMarkupInFlight.current.add(path);
    void fetch(`${assetBaseRef.current}${path}`, { mode: 'cors', credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) return;
        const text = await response.text();
        if (svgMarkupOfText(text) !== null) svgMarkup.current.set(path, text.trim());
      })
      .catch(() => {
        /* the copy writes the envelope alone; the next selection tries again */
      })
      .finally(() => {
        svgMarkupInFlight.current.delete(path);
      });
  }, [selection, extra]);

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
    /* the frame of a table with a cell open is its move surface (docs/FEATURES.md 2.1): the
       session ends with its write, the table stands selected and the drag begins; every other
       handle is inert while a session is open, as before */
    const current = editingRef.current;
    if (current !== null && handle.blockId === current.blockId) {
      endSessionForPress(current);
      if (editingRef.current !== null) return;
    }
    beginGesture(handle, e.clientX, e.clientY, {
      duplicate: e.altKey && handle.kind === 'free-move',
      target: e.target,
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
    if (isTableSeamHandle(handle)) {
      const seam = tableSeamAt(
        handle.blockId,
        handle.index,
        { slide: slideNow, boxes: boxesRef.current },
        delta,
      );
      if (seam) commit([seam.mutation]);
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

  /**
   * A press on a deck guide drags it; the release writes deck.guides move (SPEC-2 6.1 row 30).
   * Where two guides cross under the press (the horizontal guide is drawn last and takes the
   * pointer at the crossing, so a press at a vertical guide's centre landed on the horizontal
   * guide at the sheet centre and a horizontal drag wrote nothing: audit-surface row 45, the
   * mechanism measured in build/b3.md), the drag waits for the first travel and moves the guide
   * that lies across it (stage-rules.ts crossingGuide, guideForTravel); the readout appears once
   * the guide is picked.
   */
  const onGuideDown = (axis: 'x' | 'y', at: number, e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const rect = stageRect();
    if (!rect) return;
    const k = rect.width / 1600 || 1;
    const pressed: GuidePress = { axis, at };
    const crossing = crossingGuide(
      pressed,
      sheetPoint(rect, e.clientX, e.clientY),
      deckGuidesRef.current ?? { x: [], y: [] },
      GUIDE_HIT_PX / 2 / k,
    );
    let target: GuidePress | null = crossing === null ? pressed : null;
    let last = at;
    if (target !== null) setDraggingGuide({ axis, at, label: inchesLabel(at), from: at });
    const move = (ev: PointerEvent) => {
      const r = stageRect();
      if (!r) return;
      if (target === null) {
        if (crossing === null) return;
        target = guideForTravel(pressed, crossing, ev.clientX - e.clientX, ev.clientY - e.clientY);
        if (target === null) return;
        last = target.at;
      }
      const point = sheetPoint(r, ev.clientX, ev.clientY);
      last = Math.round(target.axis === 'x' ? point.x : point.y);
      last = Math.max(0, Math.min(target.axis === 'x' ? 1600 : 900, last));
      setDraggingGuide({ axis: target.axis, at: last, label: inchesLabel(last), from: target.at });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setDraggingGuide(null);
      if (target !== null && last !== target.at)
        onGuidesRef.current?.({ move: [{ axis: target.axis, from: target.at, to: last }] });
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
    promptHoveredCell(e.target, el, slideNow);
    const drawTool = toolRef.current;
    if (drawTool !== 'select' && isLineTool(drawTool) && isFreeformSlide(slideNow)) {
      const rect = stageRect();
      if (rect) setSites(sitesUnder(slideNow, sheetPoint(rect, e.clientX, e.clientY)));
    }
  };

  /**
   * The prompt "Click to add text" in the hovered empty cell alone (docs/FEATURES.md 2.3 item 9,
   * P1; audit-objects 24: a 5 by 6 table drew thirty prompts on the stage and faint rows in the
   * filmstrip card): the renderer writes no prompt into a table cell (render/blocks/table.ts), and
   * the stage appends one to the empty cell under the pointer and removes it when the pointer
   * leaves the cell, the sheet, or a session opens there. The span is the renderer's own prompt
   * markup, so the session strips it as it strips every prompt (InlineText mounts).
   */
  const hoverPrompt = useRef<HTMLElement | null>(null);
  const clearHoverPrompt = () => {
    hoverPrompt.current?.remove();
    hoverPrompt.current = null;
  };
  const promptHoveredCell = (target: EventTarget | null, el: HTMLElement, slideNow: Slide) => {
    const run = resolveRun(target, el);
    const cell = run === null ? null : cellPointer(run.pointer);
    const table = run === null ? undefined : blockById(slideNow, run.blockId);
    const para =
      cell !== null && table?.type === 'table' && editingRef.current === null
        ? run?.element.querySelector<HTMLElement>(':scope > .para')
        : null;
    const empty =
      para !== null &&
      para !== undefined &&
      (table as TableBlock).rows[cell?.row ?? -1]?.cells[cell?.col ?? -1] === '';
    if (!empty || para === null || para === undefined) {
      clearHoverPrompt();
      return;
    }
    if (hoverPrompt.current !== null && hoverPrompt.current.parentElement === para) return;
    clearHoverPrompt();
    const prompt = document.createElement('span');
    prompt.className = 'prompt';
    prompt.setAttribute('data-prompt', '');
    prompt.setAttribute('aria-hidden', 'true');
    prompt.textContent = PROMPTS.text;
    para.appendChild(prompt);
    hoverPrompt.current = prompt;
  };

  /**
   * A Shift click on a cell of the edited or selected table selects the cells from the anchor
   * cell to it (Google Slides; table-range.ts, docs/RETURN.md 2.4 "a drag over cells to select a
   * range"; the matrix row tables.cells.merge-unmerge). The anchor is the open session's cell,
   * else the range's own anchor, else the selected run's cell, else the cell of the last session
   * on this table while it stays selected; the session ends with its write and the table stands
   * selected with the range drawn over its cells. With no anchor on a selected table the click
   * selects the cell's run, so the next Shift click has one. Answers true when it took the press.
   */
  const shiftClickOnCell = (
    e: ReactPointerEvent<HTMLDivElement>,
    el: HTMLElement,
    slideNow: Slide,
  ): boolean => {
    if (
      !e.shiftKey ||
      e.metaKey ||
      e.ctrlKey ||
      !editableRef.current ||
      toolRef.current !== 'select' ||
      cropRef.current !== null ||
      spaceRef.current
    )
      return false;
    const run = resolveRun(e.target, el);
    const cell = run === null ? null : cellPointer(run.pointer);
    if (run === null || cell === null) return false;
    const block = blockById(slideNow, run.blockId);
    if (block?.type !== 'table') return false;
    const current = editingRef.current;
    const rangeNow = cellRangeRef.current;
    const selectedNow = selectionRef.current;
    const held = selectedIds(selectedNow, extraRef.current);
    const onThisTable = held.length === 1 && held[0] === run.blockId;
    const anchor: CellAddress | null =
      current !== null && current.blockId === run.blockId
        ? cellPointer(current.pointer)
        : rangeNow !== null && rangeNow.blockId === run.blockId
          ? rangeNow.anchor
          : selectedNow?.kind === 'run' && selectedNow.blockId === run.blockId
            ? cellPointer(selectedNow.pointer)
            : onThisTable && lastCell.current?.blockId === run.blockId
              ? lastCell.current.cell
              : null;
    if (anchor === null) {
      if (!onThisTable || current !== null) return false;
      e.preventDefault();
      select({ kind: 'run', blockId: run.blockId, pointer: run.pointer });
      return true;
    }
    e.preventDefault();
    if (current !== null) endSessionForPress(current);
    if (editingRef.current !== null) return true;
    const next: CellRange = { blockId: run.blockId, anchor, focus: cell };
    if (isMultiCell(block, next)) {
      select({ kind: 'block', blockId: run.blockId });
      setRange(next);
    } else {
      /* the click landed on the anchor cell: one cell, no range */
      setRange(null);
      select({ kind: 'run', blockId: run.blockId, pointer: cellRunPointer(anchor) });
    }
    return true;
  };

  /**
   * A press inside an open table cell that travels into another cell of the same table selects
   * the cells between them (Google Slides; table-range.ts). The session ends with its write when
   * the pointer first reaches another cell, the range follows the pointer from then on, and the
   * browser's own text selection, which the press began in the editable, is cleared on every move
   * so no text of the static cells reads as selected. The cell under the pointer is read from the
   * measured cell boxes (the overlay layer covers the sheet). A drag that stays inside the cell
   * is the browser's text selection and nothing here runs.
   */
  const armCellRangeDrag = (
    from: { blockId: string; anchor: CellAddress; session?: Editing },
    clientX: number,
    clientY: number,
    tap?: () => void,
  ) => {
    const { blockId, anchor, session } = from;
    const slideNow = slideRef.current;
    if (!slideNow || blockById(slideNow, blockId)?.type !== 'table') return;
    let live = false;
    const cellUnder = (ev: PointerEvent): CellAddress | null => {
      const rect = stageRect();
      if (!rect) return null;
      return cellAtPoint(blockId, boxesRef.current.runs, sheetPoint(rect, ev.clientX, ev.clientY));
    };
    const detach = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    const move = (ev: PointerEvent) => {
      if (!live) {
        if (session !== undefined && editingRef.current !== session) {
          detach();
          return;
        }
        if (Math.hypot(ev.clientX - clientX, ev.clientY - clientY) < DRAG_START_PX) return;
        const cell = cellUnder(ev);
        if (cell === null || (cell.row === anchor.row && cell.col === anchor.col)) return;
        live = true;
        if (session !== undefined) {
          endSessionForPress(session);
          if (editingRef.current !== null) {
            detach();
            return;
          }
        }
        window.getSelection()?.removeAllRanges();
        select({ kind: 'block', blockId });
        setRange({ blockId, anchor, focus: cell });
        return;
      }
      window.getSelection()?.removeAllRanges();
      const cell = cellUnder(ev);
      if (cell === null) return;
      setRange({ blockId, anchor, focus: cell });
    };
    const up = () => {
      detach();
      if (live) window.getSelection()?.removeAllRanges();
      /* a press on the selected table that never travelled: the tap moves the caret to the
         pressed cell (docs/FEATURES.md 2.1); with a session the browser's own click placed it */
      else if (session === undefined) tap?.();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  /**
   * The caret in a table cell from a click (docs/FEATURES.md 2.2 rank 2; the amended A1 for
   * tables): the session opens on the cell's run with the caret at the click point, and the cell
   * becomes the table's remembered cell (`startEdit` records it). Nothing is written.
   */
  const openCellAt = (
    run: { blockId: string; pointer: string; element: HTMLElement },
    point: { x: number; y: number },
  ) => {
    const slideNow = slideRef.current;
    if (!slideNow || editingRef.current !== null || gesture.current !== null) return;
    if (readRunText(slideNow, run.blockId, run.pointer) === undefined) return;
    startEdit(run, point);
  };

  /**
   * The run a key opens on a selected object (A1 rule 4): the anchor cell of its cell range, else
   * on a table the cell the seller last touched (the click that selected the table, the last
   * session; `lastCell`, docs/FEATURES.md 2.2 rank 4), else its first run. A table selected by a
   * marquee, by Tab from another object or from the filmstrip has no remembered cell and opens
   * cell 1,1.
   */
  const entryRunOf = (el: HTMLElement, blockId: string) => {
    const range = cellRangeRef.current;
    if (range !== null && range.blockId === blockId) {
      const pointer = cellRunPointer(range.anchor);
      const element = runElement(el, blockId, pointer);
      if (element) return { blockId, pointer, element };
    }
    const last = lastCell.current;
    if (last !== null && last.blockId === blockId) {
      const pointer = cellRunPointer(last.cell);
      const element = runElement(el, blockId, pointer);
      if (element) return { blockId, pointer, element };
    }
    return firstRunOf(el, blockId);
  };

  /**
   * The caret a typed key or Enter places on a selected object (A1 rule 4, `entryCaret`): over
   * the whole text so the first character replaces it, as in Google Slides; on a table at the end
   * of the remembered cell's text so the letter appends (docs/FEATURES.md 2.2 rank 4; audit
   * objects 5: a stray key with the table selected replaced cell 1,1's whole text), because a
   * table's text is many texts and replacing the first is a loss the seller did not ask for.
   */
  const entryCaretFor = (
    slideNow: Slide,
    blockId: string,
    entry: 'typing' | 'enter',
  ): CaretPlacement =>
    blockById(slideNow, blockId)?.type === 'table' ? 'end' : entryCaret(entry, null);

  /**
   * The labels of a group in document order (docs/FEATURES.md 2.2 rank 6): every member whose
   * markup carries a run with a text behind it (a text box, a shape with text); a connector has
   * none. Enter on the selected group opens the first, Tab in an open label the next.
   */
  const groupLabelRuns = (el: HTMLElement, slideNow: Slide, tag: string) =>
    blockOrder(el).flatMap((id) => {
      const block = blockById(slideNow, id);
      if (block?.pos?.group !== tag) return [];
      const run = firstRunOf(el, id);
      if (run === null || readRunText(slideNow, run.blockId, run.pointer) === undefined) return [];
      return [run];
    });

  /**
   * The Chart data grid from the stage (docs/FEATURES.md 2.2 rank 7): the window event the
   * chrome's Overlay and the Chart data section answer (CHART_CELL_EVENT); `open` asks for Format
   * options on the section. Nothing is written.
   */
  const requestChartCell = (blockId: string, row: number, column: number, open: boolean) => {
    const detail: ChartCellDetail = {
      deckId: deckIdRef.current,
      slideId: slideIdRef.current,
      blockId,
      row,
      column,
      open,
    };
    window.dispatchEvent(new CustomEvent(CHART_CELL_EVENT, { detail }));
  };

  /**
   * The cell of a chart mark under a press (docs/FEATURES.md 2.2 rank 7): a bar, a point or a
   * slice carries `data-series` and `data-category` (render/blocks/chart.ts), read from the
   * element and never from the drawing. Null off a mark.
   */
  const chartMarkAt = (target: EventTarget | null): { series: number; category: number } | null => {
    if (!(target instanceof Element)) return null;
    const mark = target.closest<Element>('[data-category][data-series]');
    if (mark === null) return null;
    const series = Number(mark.getAttribute('data-series'));
    const category = Number(mark.getAttribute('data-category'));
    if (!Number.isInteger(series) || !Number.isInteger(category)) return null;
    return { series, category };
  };

  /** The readout of a tapped chart mark: the category and the value as the chart draws it, for a moment. */
  const showMarkReadout = (text: string) => {
    window.clearTimeout(markReadoutTimer.current);
    setMarkReadout(text);
    markReadoutTimer.current = window.setTimeout(() => setMarkReadout(null), MARK_READOUT_MS);
  };

  /**
   * A press on a block's body arms a drag: past DRAG_START_PX it becomes the chip's gesture; a
   * pointer up before that is a tap, which runs what the press named (a table cell's caret, a
   * chart mark's cell) and nothing else.
   */
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
      const p = press.current;
      press.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      p?.tap?.();
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
    /* the draw is a gesture of the stage's life like a resize (gesture-life.ts), so the size it
       would store shows while the pointer is down and clears with the release, the cancel or a
       selection (docs/RETURN.md 2.1 "the drawing by drag with the readout"; stage-rules.ts
       drawReadout) */
    stepLife({ type: 'down' });
    const move = (ev: PointerEvent) => {
      const r = stageRect();
      if (!r) return;
      current = { shift: ev.shiftKey, alt: ev.altKey };
      const drawn = drawnBox(drawTool, start, sheetPoint(r, ev.clientX, ev.clientY), current);
      setMarquee(drawn.dragged ? drawn.box : null);
      const size = drawReadout(drawn.box, drawn.dragged, settingsRef.current.snapGrid);
      stepLife({ type: 'move', readout: size ? { kind: 'size', w: size.w, h: size.h } : null });
    };
    const finishDraw = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finishDraw);
      window.removeEventListener('pointercancel', cancel);
      setMarquee(null);
      setSites([]);
      stepLife({ type: 'pointerup' });
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
      stepLife({ type: 'pointercancel' });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finishDraw);
    window.addEventListener('pointercancel', cancel);
  };

  /**
   * Ends the session that holds the focus from a pointer handler, in the pointerdown, before the
   * browser moves the focus for the press: InlineText's finish runs endEdit synchronously, so
   * the same handler then reads the stage as free (editingRef null) and runs the press as a
   * selection press (sessionPressVerdict). The blur is the fallback while the handle is not up.
   */
  const endSessionForPress = (current: Editing) => {
    if (inlineRef.current) inlineRef.current.end('blur');
    else current.element.blur();
  };

  /** A press on the stage root outside the sheet: the workspace (SPEC-2 0.100) starts a marquee, a click deselects. */
  const onWorkspacePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (e.target instanceof Element && e.target.closest('.sheet')) return;
    if (e.target instanceof Element && e.target.closest('.ts-overlay')) return;
    const current = editingRef.current;
    if (current) {
      /* a press on the workspace ends the session and the edited block stays selected (endEdit);
         the focus would land on the stage root, which holds the run, and the park rule of
         InlineText onBlur would otherwise bring the caret back */
      endSessionForPress(current);
      return;
    }
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
    if (shiftClickOnCell(e, el, slideNow)) return;
    const current = editingRef.current;
    if (current) {
      /* a click inside the editable run is the caret's; one on the edited block's padding keeps
         the session (InlineText onBlur brings the focus back); one on another object ends the
         session here, before the focus moves, and runs below as that object's press, so a plain
         click selects it and a Shift or Cmd click adds it (finding F5); one on the empty sheet
         ends the session and the block stays selected */
      const verdict = sessionPressVerdict({
        insideRun: e.target instanceof Node && current.element.contains(e.target),
        under: resolveObject(e.target, el, slideNow),
        blockId: current.blockId,
      });
      if (verdict === 'caret') {
        /* a press inside an open table cell that travels into another cell selects the cells
           between them (armCellRangeDrag); inside the cell it stays the browser's text selection */
        const anchor = cellPointer(current.pointer);
        if (anchor !== null)
          armCellRangeDrag(
            { blockId: current.blockId, anchor, session: current },
            e.clientX,
            e.clientY,
          );
        return;
      }
      if (verdict === 'keep') return;
      endSessionForPress(current);
      if (editingRef.current !== null || verdict === 'end') return;
    }
    /* a plain press on the sheet ends the cell range: on the table it is the press of A1 rule 2
       (the drag that follows moves the table), elsewhere it is the other object's or the sheet's */
    if (cellRangeRef.current !== null && !e.shiftKey && !e.metaKey && !e.ctrlKey) setRange(null);
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
    const resolved = resolveObject(e.target, el, slideNow);
    const selected = selectedIds(selectionRef.current, extraRef.current);
    /* the band between a text object's text and its ring (text-ring.ts) belongs to the object:
       a press there on the one selected text object is a press on it, so the drag arms from the
       whole ring, not the text alone */
    const id = ((): string | null => {
      if (resolved !== null || selected.length !== 1) return resolved;
      const only = selected[0];
      const box = only !== undefined ? boxesRef.current.blocks[only] : undefined;
      const type =
        only !== undefined ? (blockById(slideNow, only)?.type ?? blockTypeIn(el, only)) : undefined;
      if (only === undefined || !box || type === undefined) return null;
      const ring = ringBoxFor(type, box);
      if (ring === box) return null;
      const rect = stageRect();
      const point = rect ? sheetPoint(rect, e.clientX, e.clientY) : null;
      return point && boxContains(ring, point.x, point.y) ? only : null;
    })();
    /* the click model (docs/gslides-parity/focus/AMENDMENTS.md A1 rules 1 and 2, above
       gslides-parity SPEC 10.2's single click caret, which opened the session here until this
       round): Selection.tsx objectPressPlan decides what the press does, so its rules carry unit
       tests (press-rules.test.ts). One click selects, whatever the object holds: no caret, no
       session, the ring, the handles and the chip; the press that follows arms the drag from
       anywhere inside the object's area, a text box and a placeholder included, and past
       DRAG_START_PX the move gesture takes the whole selection with it (armPress, chipHandleFor,
       beginGesture). The double click is the entry into the text (onDoubleClick, InlineText
       clickEntry), and so are a printable key and Enter (onKey). */
    /* the cell of a table the press landed in (docs/FEATURES.md 2.1, the amended A1 for tables):
       a tap places the caret there, a move on the selected table selects a range from it */
    const pressedRun = id !== null ? resolveRun(e.target, el) : null;
    const pressedCell =
      pressedRun !== null && pressedRun.blockId === id && blockById(slideNow, id)?.type === 'table'
        ? cellPointer(pressedRun.pointer)
        : null;
    const plan = objectPressPlan({
      under: id,
      selected,
      modifier: e.shiftKey || e.metaKey || e.ctrlKey,
      editable: editableRef.current,
      paint: Boolean(paintRef.current),
      grouped:
        id !== null &&
        blockById(slideNow, id)?.pos?.group !== undefined &&
        groupEnteredRef.current !== id,
      object: id !== null && isObjectId(slideNow, boxesRef.current, id),
      cell: pressedCell,
    });
    switch (plan.action) {
      case 'marquee':
        setGroupEntered(null);
        armMarquee(e.clientX, e.clientY);
        return;
      case 'paint':
        /* paint format armed: the click paints the block and nothing else (SPEC 3.1 row 6) */
        e.preventDefault();
        applyPaint(plan.blockId);
        select({ kind: 'block', blockId: plan.blockId });
        return;
      case 'toggle': {
        /* Shift and Cmd click toggle membership (SPEC-2 6.1 row 2); a group toggles whole */
        const members = expandGroups(slideNow, [plan.blockId]);
        let next = { selection: selectionRef.current, extra: extraRef.current as string[] };
        const adding = !selected.includes(plan.blockId);
        for (const member of members) {
          if (adding === !selectedIds(next.selection, next.extra).includes(member))
            next = toggleSelected(next.selection, next.extra, member);
        }
        select(next.selection, next.extra);
        return;
      }
      case 'press': {
        if (plan.select) {
          /* a click on a member of a group selects the group, so the drag that follows moves it
             whole, until a double click enters the member (SPEC-2 6.1 row 14; VERIFICATION-2
             finding 17) */
          if (groupEnteredRef.current !== plan.blockId) setGroupEntered(null);
          selectObjects([plan.blockId]);
        }
        const point = { x: e.clientX, y: e.clientY };
        /* the tap of the press: on a table cell the caret at the click point (docs/FEATURES.md 2.2
           rank 2; the pressed cell becomes the remembered cell of rank 4); on a bar, a point or a
           slice of the selected chart its cell in the Chart data grid with the value in the
           readout (rank 7); nothing elsewhere */
        const tap = ((): (() => void) | undefined => {
          if (plan.caret !== undefined && pressedRun !== null) {
            const run = pressedRun;
            const cell = plan.caret;
            return () => {
              lastCell.current = { blockId: run.blockId, cell };
              openCellAt(run, point);
            };
          }
          const mark = selected.includes(plan.blockId) ? chartMarkAt(e.target) : null;
          const chart = mark === null ? undefined : blockById(slideNow, plan.blockId);
          if (mark !== null && chart?.type === 'chart') {
            return () => {
              const category = chart.categories[mark.category];
              const value = chart.series[mark.series]?.values[mark.category];
              if (category !== undefined && value !== undefined)
                showMarkReadout(`${category}: ${formatChartNumber(value, chart.numberFormat)}`);
              requestChartCell(chart.id, mark.category + 1, mark.series + 1, true);
            };
          }
          return undefined;
        })();
        if (plan.range === true && plan.caret !== undefined) {
          /* the one selected table: a move from the cell selects a range and never moves the
             table, whose move surface is its ring band, its chip and its handles (2.1) */
          armCellRangeDrag(
            { blockId: plan.blockId, anchor: plan.caret },
            e.clientX,
            e.clientY,
            tap,
          );
          return;
        }
        /* Commenting and Viewing mode select the object for a comment's anchor and never drag
           (SPEC-3 5.3, 6.3): the plan's `drag` is false there; in Editing mode every measured
           object drags by its body, a picture, a shape, a material, a text box or a placeholder
           alike, and the ring's handles keep their own gestures (Overlay) */
        if (plan.drag)
          armPress({
            blockId: plan.blockId,
            clientX: e.clientX,
            clientY: e.clientY,
            alt: e.altKey,
            ...(tap === undefined ? {} : { tap }),
          });
        else if (tap !== undefined && editableRef.current) tap();
        return;
      }
    }
  };

  /**
   * What `clickEntry` reads about the object under a click (AMENDMENTS.md A1): a picture is a
   * croppable block on a canvas or a shot, or the photograph of a picture kind; a line never
   * opens; a shape and every text bearing object open their run; a member of a group not yet
   * entered is selected first.
   */
  const entryInputFor = (slideNow: Slide, el: HTMLElement, id: string, clicks: 1 | 2) => {
    const block = blockById(slideNow, id);
    const picture =
      (isCroppable(block) && (isFreeformSlide(slideNow) || block.type === 'shot')) ||
      (id === 'picture' && !isFreeformSlide(slideNow));
    const shape = block !== undefined && block.type === 'shape';
    const kind = picture
      ? 'picture'
      : shape
        ? isLineBlock(block)
          ? 'line'
          : 'shape'
        : isTextBlockType(blockTypeOf(slideNow, id) ?? '') || firstRunOf(el, id) !== null
          ? 'text'
          : 'other';
    return {
      clicks,
      editing: editingRef.current?.blockId === id,
      kind,
      groupMember: block?.pos?.group !== undefined && groupEnteredRef.current !== id,
      hasRun: firstRunOf(el, id) !== null,
    } as const;
  };

  /**
   * A double click: the entry into an object (docs/gslides-parity/focus/AMENDMENTS.md A1 rule 3;
   * SPEC-2 6.1 rows 14 and 19). Inside an open session it is the browser's word selection; on a
   * member of a group it selects the member alone; on a picture it opens crop; on a text object,
   * a placeholder or a shape with text it opens the session with the caret at the double click
   * (the run under the pointer, else the block's first run at its end). The one click before it
   * selected the object (onPointerDown), so the two clicks of the double are a select and an
   * entry, as in Google Slides.
   */
  const onDoubleClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    const el = body.current;
    const slideNow = slideRef.current;
    if (!el || !slideNow || editingRef.current) return;
    /* Commenting and Viewing mode: no crop, no member entry, no caret (SPEC-3 5.3) */
    if (!editableRef.current) return;
    const id = resolveObject(e.target, el, slideNow);
    if (id === null) return;
    const clicked = blockById(slideNow, id);
    /* a double click on a chart opens its numbers (docs/FEATURES.md 2.2 rank 7; audit-objects
       17: the double click did nothing and a value was four clicks away): Format options on the
       Chart data section with the first value cell active; a double click on the title run still
       opens the title's session, below */
    if (clicked?.type === 'chart' && resolveRun(e.target, el) === null) {
      e.preventDefault();
      requestChartCell(clicked.id, 1, 1, true);
      return;
    }
    const entry = entryInputFor(slideNow, el, id, 2);
    switch (clickEntry(entry)) {
      case 'crop':
        e.preventDefault();
        if (id === 'picture' && !isFreeformSlide(slideNow)) {
          /* the photograph of a picture kind: crop mode on the picture object's box without a
             write; the conversion travels with the crop's own commit (finding 19) */
          void enterCropProvisional('picture');
        } else enterCrop(id);
        return;
      case 'member': {
        e.preventDefault();
        setGroupEntered(id);
        groupEnteredRef.current = id;
        select({ kind: 'block', blockId: id }, []);
        /* a member that carries a run (a text box, a shape with its label) opens its text at once
           with the member entered behind it (docs/FEATURES.md 2.2 rank 6; audit-objects 11: one
           label was five clicks) */
        if (entry.hasRun && entry.kind !== 'picture' && entry.kind !== 'line') {
          const under = resolveRun(e.target, el);
          const run = under !== null && under.blockId === id ? under : firstRunOf(el, id);
          if (run && readRunText(slideNow, run.blockId, run.pointer) !== undefined)
            startEdit(
              run,
              entryCaret('double-click', run === under ? { x: e.clientX, y: e.clientY } : null),
            );
        }
        return;
      }
      case 'text': {
        /* the run under the pointer takes the caret at the point; a double click on the box's
           padding, or on a closed shape's body (docs/FOCUS.md section 4), opens the first run at
           its end. The browser's own double click selection of the drawn text is prevented: the
           session places the caret itself. */
        const under = resolveRun(e.target, el);
        const run = under !== null && under.blockId === id ? under : firstRunOf(el, id);
        if (!run || readRunText(slideNow, run.blockId, run.pointer) === undefined) return;
        e.preventDefault();
        startEdit(
          run,
          entryCaret('double-click', run === under ? { x: e.clientX, y: e.clientY } : null),
        );
        return;
      }
      default:
        return;
    }
  };

  /* links are text on the stage in edit mode, never navigation */
  const onClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.target instanceof Element && e.target.closest('a')) e.preventDefault();
  };

  /**
   * A right-click: the target of gslides-parity SPEC 4.3 and SPEC-2 4.3 for the chrome's menu.
   * Inside an editing session a right click over selected text opens the Text menu on the
   * selection (the `textSelection` target: the clipboard rows, Italic, Underline, Strikethrough,
   * Link, Format options; the matrix row text.context.text-selection), and a right click on a
   * collapsed caret ends the session and opens the edited object's own menu on the block (the
   * matrix row text.context.text-block; focus verification finding F4: a single click opens the
   * session, so the caret is the common state of a right click on a text box, and the menu's
   * rows are block writes whose result the editor adopts only outside a session). The browser's
   * own menu, with its spelling suggestions, never shows on the stage.
   */
  const onContextMenuEvent = (e: ReactMouseEvent<HTMLDivElement>) => {
    const cb = onContextMenuRef.current;
    const el = body.current;
    const slideNow = slideRef.current;
    if (!cb || !el || !slideNow) return;
    /* a right click an overlay child already answered (a guide's Delete guide menu,
       onGuideContextMenu) bubbles to the overlay layer's own handler; it stays that child's
       (the re-walk read the empty sheet's menu over a guide's, return/build/integrator.md) */
    if (
      e.target instanceof Element &&
      e.target.closest('.ts-overlay') !== null &&
      (e.nativeEvent.defaultPrevented || e.target.closest('[data-control^="guide."]') !== null)
    )
      return;
    const current = editingRef.current;
    if (current && e.target instanceof Node && current.element.contains(e.target)) {
      e.preventDefault();
      const selection = window.getSelection();
      const selected =
        selection !== null &&
        selection.rangeCount > 0 &&
        !selection.isCollapsed &&
        current.element.contains(selection.anchorNode) &&
        current.element.contains(selection.focusNode);
      const element =
        (e.target instanceof Element ? e.target.closest<HTMLElement>('[data-block]') : null) ?? el;
      const block = blockById(slideNow, current.blockId);
      const cell = block?.type === 'table' ? cellPointer(current.pointer) : null;
      const inSession = sessionContextTarget({ selected, cell: cell !== null });
      if (inSession === 'textSelection') {
        cb({
          target: 'textSelection',
          x: e.clientX,
          y: e.clientY,
          element,
          blockId: current.blockId,
        });
        return;
      }
      /* a collapsed caret: the session ends (endEdit selects the block) and the object's menu
         opens on it, as a right click on the frame edge does */
      endSessionForPress(current);
      if (inSession === 'tableCell' && cell) {
        select({ kind: 'run', blockId: current.blockId, pointer: current.pointer });
        cb({
          target: 'tableCell',
          x: e.clientX,
          y: e.clientY,
          element,
          blockId: current.blockId,
          cell: { ...cell, pointer: current.pointer },
        });
        return;
      }
      cb({
        target: contextTargetFor(slideNow, current.blockId),
        x: e.clientX,
        y: e.clientY,
        element,
        blockId: current.blockId,
      });
      return;
    }
    e.preventDefault();
    const inSheet = e.target instanceof Element && e.target.closest('.sheet') !== null;
    /* a right click on a selected object lands on the overlay's frame, not the sheet: it is the
       object's own menu, as on an unselected object (the matrix rows text.context.text-block and
       images.context.image; measured on the dev server: the selected box answered no menu) */
    const onOverlay = e.target instanceof Element && e.target.closest('.ts-overlay') !== null;
    const selectedAnchor = onOverlay ? selectedBlockId(selectionRef.current) : null;
    const id = inSheet ? resolveObject(e.target, el, slideNow) : selectedAnchor;
    const run = resolveRun(e.target, el);
    const element =
      (e.target instanceof Element ? e.target.closest<HTMLElement>('[data-block]') : null) ??
      (id !== null ? el.querySelector<HTMLElement>(`[data-block="${id}"]`) : null) ??
      el;
    if (id === null) {
      cb({ target: 'emptyCanvas', x: e.clientX, y: e.clientY, element });
      return;
    }
    const block = blockById(slideNow, id);
    if (!selectedIds(selectionRef.current, extraRef.current).includes(id)) {
      selectObjects([id]);
    }
    const cell = block?.type === 'table' && run ? cellPointer(run.pointer) : null;
    const bounds = cell !== null ? rangeOn(id) : null;
    if (cell && run && bounds !== null && cellInBounds(bounds, cell)) {
      /* a right click inside the cell range: the range's menu over the selection as it is (Merge
         cells and the other Table rows act on the range through EditorSelection.cells) */
      cb({
        target: 'cellRange',
        x: e.clientX,
        y: e.clientY,
        element,
        blockId: id,
        cell: { ...cell, pointer: run.pointer },
      });
      return;
    }
    if (cell && run) {
      /* a right click on a cell outside the range ends the range, as Google's does */
      if (bounds !== null) setRange(null);
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
    /* a person's drop fires on the picture under the pointer; a drop dispatched on the stage
       wrapper names no object, so the object under the point is read (docs/FOCUS.md design
       rule 13: a file dropped on a picture replaces it and keeps the frame) */
    const id =
      resolveObject(e.target, el, slideNow) ??
      resolveObject(document.elementFromPoint(e.clientX, e.clientY), el, slideNow);
    const [first] = files;
    if (!first) return;
    void insertPicture(first, {
      ...(id !== null && blockById(slideNow, id) ? { blockId: id } : {}),
      ...(point ? { point } : {}),
      replace: id === 'picture' && !isFreeformSlide(slideNow),
      way: 'drop',
    });
  };

  const selectedId = selectedBlockId(selection);
  const ids = selectedIds(selection, extra);
  /* the deck's shader palette (5.7): the module constant for a deck without a kit, so the mount
     does not remount per render */
  const shaderPalette = useMemo(() => shaderPaletteOfDeck(doc.deck), [doc.deck]);
  const anchorBlock = slide && selectedId !== null ? blockById(slide, selectedId) : undefined;
  const anchorPos: Position | null =
    anchorBlock?.pos ??
    (slide && selectedId !== null ? posFor(slide, selectedId, boxes) : null) ??
    null;
  /* a text object's ring stands off its text (text-ring.ts): the caret at the first character
     no longer sits on the ring's left edge */
  const measuredSelectionBox =
    selection === null
      ? null
      : selection.kind === 'run'
        ? (boxes.runs[`${selection.blockId}/${selection.pointer}`] ??
          boxes.blocks[selection.blockId] ??
          null)
        : (boxes.blocks[selection.blockId] ?? null);
  /* a grammar field (the cover title, a subtitle) is no block of the slide, so its type is read
     from the element the renderer wrote (data-type) when the slide's blocks do not name it */
  const ringTypeOf = (id: string): string | undefined =>
    (slide ? blockById(slide, id)?.type : undefined) ?? blockTypeIn(body.current, id);
  const selectionBox =
    measuredSelectionBox === null || selectedId === null
      ? measuredSelectionBox
      : ringBoxFor(ringTypeOf(selectedId), measuredSelectionBox);
  const extraBoxes = extra.flatMap((id) => {
    const box = boxes.blocks[id];
    return box ? [ringBoxFor(ringTypeOf(id), box)] : [];
  });
  /* the cell range's ring (table-range.ts): the union of its measured cells, inside the table's
     own ring; none while a session is open */
  const rangeRing = ((): { box: Box; label: string } | null => {
    if (cellRange === null || !slide || editing) return null;
    const rangeTable = blockById(slide, cellRange.blockId);
    if (rangeTable?.type !== 'table') return null;
    const bounds = rangeBounds(rangeTable, cellRange);
    const box = rangeBox(rangeTable, bounds, boxes.runs);
    return box === null
      ? null
      : { box, label: `${bounds.r0},${bounds.c0}:${bounds.r1},${bounds.c1}` };
  })();
  const group =
    ids.length > 1 && slide ? (selectionUnion(slide, ids, boxes) ?? groupBoxOf(ids, boxes)) : null;
  const groupTag = slide ? sharedGroup(slide, ids) : null;
  const measuredHoverBox =
    hover !== null && !ids.includes(hover) && !activeHandle ? (boxes.blocks[hover] ?? null) : null;
  const hoverBox =
    measuredHoverBox === null || hover === null
      ? null
      : ringBoxFor(ringTypeOf(hover), measuredHoverBox);
  /* a table cell or a cell range is active: the work is inside the table, so its outer transform
     handles (the eight resize squares, the rotation ring) and the column seams are not drawn, as
     Google draws them only for the whole-table selection (docs/RETURN.md 2.4). A single click
     selects the table block (chip Table, no cell), where they do show; a Shift click, a drag
     across cells or the cell left after a merge selects a cell, where they do not. Without this a
     merged cell's centre, which sits on a resize square, took a right click meant for its menu. */
  const cellActive =
    anchorBlock?.type === 'table' &&
    ((selection?.kind === 'run' && cellPointer(selection.pointer) !== null) ||
      (cellRange !== null && cellRange.blockId === anchorId));
  /* a table with a cell open or a cell or range active keeps its frame as a move surface: the
     chip and the ring band, and the eight handles (docs/FEATURES.md 2.1: "the table moves by its
     ring band, its chip and its eight handles"; `tables.range.drag-from-selected`), while the
     column seams stay away from the cells (docs/RETURN.md 2.4) */
  const tableFrame =
    shownSlide !== undefined &&
    editable &&
    !crop &&
    ids.length === 1 &&
    anchorId !== null &&
    anchorBlock?.type === 'table' &&
    ((editing !== null && editing.blockId === anchorId && cellPointer(editing.pointer) !== null) ||
      cellActive);
  const handles =
    shownSlide && !editing && editable && !cellActive
      ? handlesFor(shownSlide, boxes, selection, {
          ids,
          ...(crop ? { crop: { frame: crop.frame } } : {}),
        })
      : tableFrame && shownSlide && anchorId !== null
        ? handlesFor(shownSlide, boxes, { kind: 'block', blockId: anchorId }, { ids }).filter(
            (handle) => handle.kind === 'free-move' || handle.kind === 'free-resize',
          )
        : [];
  /* the column seams of one selected table (docs/RETURN.md 2.4 fix 5), from the header row's
     measured cells, beside its eight handles; none while a cell is edited, a cell or range is
     active, or in crop mode */
  if (
    shownSlide &&
    !editing &&
    editable &&
    !crop &&
    !cellActive &&
    ids.length === 1 &&
    anchorId !== null
  ) {
    const seamBlock = blockById(shownSlide, anchorId);
    if (seamBlock?.type === 'table')
      handles.push(...tableSeamHandles(seamBlock, boxes.blocks[anchorId], boxes.runs));
  }
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
          : `${blockDisplayName(shownSlide, selectedId, shown.deck.assets)}${showIds ? ` · ${selectedId}` : ''}`
      : null;
  /* the Edit data button under the selected chart (docs/FEATURES.md 2.2 rank 7, `bar.chart.editData`) */
  const editData =
    selectedId !== null && shownSlide && ids.length === 1 && !editing && editable && !crop
      ? blockById(shownSlide, selectedId)?.type === 'chart'
        ? { blockId: selectedId }
        : null
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
      groupTag !== null && shownSlide
        ? ids.map((id) => blockDisplayName(shownSlide, id, shown.deck.assets))
        : [],
    tableFrame,
    editData,
    valueReadout: scaleReadout ?? markReadout,
    count: ids.length,
    marquee,
    guides,
    arrange,
    paint: paint !== null,
    rotation: readout?.kind === 'angle' ? readout.value : null,
    sizeReadout: readout?.kind === 'size' ? { w: readout.w, h: readout.h } : null,
    widthReadout: readout?.kind === 'width' ? readout.value : null,
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
  /* the brand kit's frame band (docs/PRODUCT.md 4.1, 4.4): the footer logo, the footer text and
     the counter's format on the editor's own Frame, so Logo > Replace, Footer > Text and Slide
     numbers > Format read on the stage as they do in the show and the exports */
  const band = useMemo(
    () =>
      frameBandOf(
        doc.deck,
        theme,
        bandAssetResolver(doc.deck, (_id, _theme, path) => assetBase + path),
      ),
    [doc.deck, theme, assetBase],
  );
  const editingBox = editing
    ? (boxes.runs[`${editing.blockId}/${editing.pointer}`] ?? boxes.blocks[editing.blockId] ?? null)
    : null;
  /* the slides the link popover can point at, by title (docs/PRODUCT.md section 2 rank 19) */
  const slideTargets = useMemo(
    () =>
      slideOrder(shown.deck).map((id, index) => {
        const each = shown.slides[id];
        return { id, title: each === undefined ? id : slideTitle(each, index + 1) };
      }),
    [shown],
  );

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
          {/* the counter follows the deck's Slide numbers (Insert > Slide numbers: on, off, skip
              title slides) the way the show, the PDF and the PowerPoint do through the render's
              slideCounter; the Frame drew it on every slide before (docs/RETURN.md section 5
              slides.numbers.apply; build/b5.md section 7) */}
          <Frame
            index={index}
            total={total}
            counter={slide === undefined || slideCounter(doc.deck, slide, index + 1, total) !== ''}
            band={bandForSlide(band, slide)}
          />
          <div
            key={slideId}
            ref={body}
            className="pt-slide"
            data-slide-id={slideId}
            onPointerMove={onPointerMove}
            onPointerLeave={() => {
              setHover(null);
              clearHoverPrompt();
            }}
            onPointerDown={onPointerDown}
            onDoubleClick={onDoubleClick}
            onClick={onClick}
            dangerouslySetInnerHTML={{ __html: shownHtml }}
          />
          {/* the live shader over every material frame of the slide (SPEC 5.3, 5.4; M5): it re-mounts on every commit that moves or resizes an object (SPEC-2 0.94) */}
          {/* the features round, ship two (docs/FEATURES.md 5.6, 5.7; build/b5/integrator-hunks.md R6): one live mount per stage (the selected shader plays, the others show their frame), the deck's kit palette, 1x device pixels below zoom 100 */}
          <MaterialMount
            body={body}
            html={shownHtml}
            onError={onError}
            selected={ids}
            palette={shaderPalette}
            scale={k}
          />
        </Sheet>
      </div>
      {/* the overlay layer (SPEC 2.2 junction table): chrome, over the sheet's box, in CSS pixels; it follows the stage's scroll while zoomed.
          A right click on it (a frame edge, a handle) is the selected object's menu: the layer is a
          sibling of the stage root, so without this the right click on a selected thin line, whose
          frame edges cover its whole stroke, opened no menu at all (return/build/integrator.md,
          arrange.context.rotate-distribute; onContextMenuEvent reads the selection for a target
          on the overlay) */}
      <div
        className="ts-overlay ts-chrome"
        data-active-handle={activeHandle ?? undefined}
        data-alt={alt ? '' : undefined}
        data-freeform={freeform ? '' : undefined}
        data-crop={crop ? '' : undefined}
        onContextMenu={onContextMenuEvent}
        style={{
          left: fit.left + 1 - (zoom === 'fit' ? 0 : scroll.left),
          top: fit.top + 1 - (zoom === 'fit' ? 0 : scroll.top),
          width: fit.width,
          height: fit.height,
        }}
        hidden={stageSize.width <= 0}
      >
        {overlay ? overlay(view) : null}
        {/* the cell range on the selected table (table-range.ts; docs/RETURN.md 2.4): one ring in
            the selection colour over the union of its cells, inside the table's own ring (the
            Overlay's .ts-select rule; the chrome lint's `select` role); the plans read the same
            bounds through EditorMenuSelection.cells */}
        {rangeRing !== null ? (
          <div
            className="ts-select is-selected is-cells"
            data-cell-range={rangeRing.label}
            style={{
              left: rangeRing.box[0] * k,
              top: rangeRing.box[1] * k,
              width: rangeRing.box[2] * k,
              height: rangeRing.box[3] * k,
            }}
            aria-hidden="true"
          />
        ) : null}
        {/* the size a draw drag would store, while the drawn box is down (stage-rules.ts
            drawReadout); the chrome's Overlay draws the resize readout by the ring, and a draw
            has no ring yet */}
        {marquee !== null && toolName !== undefined && readout?.kind === 'size' ? (
          <span className="ts-readout" role="status" style={drawReadoutStyle(marquee, k)}>
            {sizeLabel(readout.w, readout.h)}
          </span>
        ) : null}
        {editing && editingBox ? (
          <InlineText
            key={`${slideId}:${editing.blockId}/${editing.pointer}`}
            element={editing.element}
            box={editingBox}
            k={k}
            multiline={editing.multiline}
            caret={editing.caret}
            autoLink={editing.link === true}
            cellArrows={
              slide !== undefined &&
              blockById(slide, editing.blockId)?.type === 'table' &&
              cellPointer(editing.pointer) !== null
            }
            slideTargets={slideTargets}
            detectLinks={linkDetection}
            onBurst={onBurst}
            onEnd={endEdit}
            onListEnter={onListEnter}
            onListBackspace={onListBackspace}
            onListLevel={onListLevel}
            onListLeave={onListBackspace}
            onIndent={onIndent}
            onCaret={onCaretInfo}
            onInput={measure}
            onPaste={pasteIntoCell}
            onUndo={() => onUndoRef.current?.()}
            onRedo={() => onRedoRef.current?.()}
            handle={(inline) => {
              inlineRef.current = inline;
              /* the printable key that opened this session (onKey, A1 rule 4) lands now, over the
                 whole text the entry selected, so the first character replaces the text */
              const typed = pendingInsert.current;
              if (inline !== null && typed !== null) {
                pendingInsert.current = null;
                inline.insertText(typed);
              }
            }}
          />
        ) : null}
      </div>
    </>
  );
}
