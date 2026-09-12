// The stage in edit mode (SPEC 6.4): the theme's .ts-sheet root, the fitted sheet with the frame,
// the slide rendered through renderSlide as innerHTML (SPEC 5.3: React owns chrome, overlays and
// view state only), the measured block boxes, hover and selection, the gestures with a live
// preview from a draft document, inline text editing, and the overlay layer the chrome fills.
// Nothing here reaches the document except through an action-table call (SPEC 7.1): a drag ends in
// one mutation that `dispatch` receives as the same `block.set`, `block.move` or `slide.update`
// call the CLI and the MCP server make, with the document's revision as baseRevision. The owner of
// the client store (undo, autosave, conflicts; SPEC 6.7) provides `dispatch`.
//
// This round (Kevin's direction of 2026-09-11, over SPEC 6.4's no-coordinates rule): a block drags
// by its chip or its body to reorder within its slot or into another slot (the drop line and the
// target slot outline come from blockMoveFor); a freeform slide (Freeform.tsx) drags its blocks
// anywhere with snapping and guides, resizes them from eight handles, nudges them with the arrows,
// selects several with Shift click or a marquee and moves them as a group, and arranges them
// (align, distribute, z-order) through the overlay's bar. Every gesture still ends in one write:
// several `pos` mutations travel as one `slide.update` (actionForMutations).
import type {
  PointerEvent as ReactPointerEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { renderSlide } from '@turboslide/render/slide';
import type { ActionId } from '@turboslide/schema/actions';
import type { BlockType } from '@turboslide/schema/blocks';
import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import type { Finding } from '@turboslide/schema/findings';
import type { AlignEdge, DistributeAxis, OrderMove } from '@turboslide/schema/freeform';
import type { Mutation } from '@turboslide/schema/mutations';
import { jsonEqual } from '@turboslide/schema/pointer';
import { applyMutations } from '@turboslide/schema/reduce';
import type { Box } from '@turboslide/schema/render';
import type { Text as Markup } from '@turboslide/schema/text';

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
  EMPTY_BOXES,
  freeGesture,
  gestureMutation,
  handlesFor,
  labelClearanceBox,
  nudgeMutation,
  sheetPoint,
} from './Gestures';
import type { FreeContext, GestureContext, Handle, MeasuredBoxes, Point } from './Gestures';
import type { Guide } from './Guides';
import { InlineText, textCommitMutation } from './InlineText';
import { isMarquee, marqueeBox, marqueeHits } from './Marquee';
import { MaterialMount } from './MaterialMount';
import { isPictureKind } from './model';
import {
  blockById,
  blockOrder,
  chipLabel,
  cycleSelection,
  escapeSelection,
  firstRunOf,
  isEditableTarget,
  resolveBlock,
  resolveRun,
  selectedBlockId,
  selectedIds,
  selectionOf,
  toggleSelected,
} from './Selection';
import type { Selection } from './Selection';
import { fitSheet, Sheet, SHEET_PAD } from './Sheet';
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
 * The arrange actions of a freeform selection (this round), the stage's side of block.align,
 * block.distribute and block.order with the schema's vocabulary; the overlay's bar calls them.
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
  /** `type · id` for the chip */
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
  /** the marquee being dragged */
  marquee: Box | null;
  /** the snap guides of the gesture under way */
  guides: Guide[];
  /** the arrange actions of a freeform selection, null when none applies */
  arrange: ArrangeActions | null;
  onHandleDown: (handle: Handle, event: PointerEvent) => void;
  /** `axis` names the arrow pair for a two-axis handle; the default is the handle's own axis */
  onHandleNudge: (handle: Handle, delta: number, axis?: 'x' | 'y') => void;
  /**
   * Alt with Up or Down on a focused move chip (Overlay.tsx): the paint order of a positioned
   * block, or one step within its slot on a grammar slide; `forward` is Up (this round).
   */
  onHandleOrder: (handle: Handle, move: OrderMove) => void;
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
  /** Delete removed this block; the chrome's toast names it and the undo key (SPEC 6.9) */
  onRemoved?: (block: { type: BlockType; id: string }) => void;
};

type Editing = { blockId: string; pointer: string; element: HTMLElement };

type ActiveGesture = {
  handle: Handle;
  start: Point;
  ctx: GestureContext;
  /** the last previewed mutations, so an unchanged move re-renders nothing */
  last: Mutation[] | null;
};

/** A press on a block's body that may become a drag; CSS pixels. */
type Press = { blockId: string; clientX: number; clientY: number };

/** A body drag starts once the pointer has moved this many CSS pixels from the press. */
const DRAG_START_PX = 4;
/** Arrow nudges on a freeform slide: one pixel, eight with Shift (this round). */
const NUDGE_PX = 1;
const NUDGE_SHIFT_PX = 8;

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
  'button, input, select, textarea, [contenteditable], [role="menu"], [role="dialog"], .ts-inspector';

/**
 * True when a key was pressed on a control outside the stage (an inspector button, a palette
 * swatch, a menu row): the stage's edit keys stay inert there, so Enter activates the button
 * instead of opening the selected block's text for editing (measured on the editor depth preview:
 * Enter on a fill swatch started inline editing and left the fill unchanged). The overlay's
 * handles sit outside the stage root too and keep their own keys (Overlay.tsx).
 */
export function isChromeControlTarget(target: EventTarget | null, stage: Element | null): boolean {
  if (!(target instanceof Element)) return false;
  if (stage !== null && stage.contains(target)) return false;
  return target.closest(CHROME_CONTROL) !== null;
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
      }).html;
    } catch {
      return '';
    }
  }, [shown, shownSlide, theme, assetBase]);

  const [innerSelection, setInnerSelection] = useState<Selection>(null);
  const selection = controlled === undefined ? innerSelection : controlled;
  /* the rest of a multi-selection beyond the anchor the page owns (this round) */
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

  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const gesture = useRef<ActiveGesture | null>(null);
  const press = useRef<Press | null>(null);
  /* the listeners bound once read the latest values through these refs */
  const docRef = useRef(doc);
  docRef.current = doc;
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
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onSelectionRef = useRef(onSelectionChange);
  onSelectionRef.current = onSelectionChange;
  const onRemovedRef = useRef(onRemoved);
  onRemovedRef.current = onRemoved;

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

  /** One action call per gesture (SPEC 7.1); several mutations travel as one slide.update. */
  const commit = (mutations: ReadonlyArray<Mutation>) => {
    if (mutations.length === 0) {
      setDraft(null);
      return;
    }
    const call = actionForMutations(mutations, docRef.current.deck.revision);
    let result: unknown;
    try {
      result = dispatchRef.current(call.id, call.input);
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

  /**
   * One order step for a block (this round): the paint order on a freeform slide (block.order),
   * one place within its slot on a grammar slide (block.move). `forward` is Up and `backward` is
   * Down on the keyboard (Alt with the arrows on the stage and on a focused move chip; Cmd ] and
   * Cmd [ on a freeform slide), as the arrange bar's tooltips state.
   */
  const orderBlock = (blockId: string, move: OrderMove) => {
    const slideNow = slideRef.current;
    if (!slideNow || gesture.current) return;
    if (isFreeformSlide(slideNow)) {
      commit(zOrderMutations(slideNow, blockId, move));
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

  /* the fresh markup: the theme's twins and dither canvases, then the boxes; fonts and images
     re-measure */
  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    applyThemeToTree(el, theme);
    measure();
    const editingNow = editingRef.current;
    if (editingNow && !el.contains(editingNow.element)) setEditing(null);
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
    // the boxes follow the markup and the theme; measure and setEditing are stable closures over refs
  }, [html, theme]);

  /* a selection that names a block the slide no longer has is dropped */
  useEffect(() => {
    const current = selectionRef.current;
    if (current && slide && blockOrder(body.current ?? document).length > 0) {
      if (!body.current?.querySelector(`[data-block="${current.blockId}"]`)) select(null);
    }
  }, [html]);

  const startEdit = (run: Editing) => {
    if (gesture.current) return;
    setEditing(run);
    select({ kind: 'run', blockId: run.blockId, pointer: run.pointer });
  };

  const endEdit = (text: Markup | null) => {
    const current = editingRef.current;
    setEditing(null);
    if (!current) return;
    select({ kind: 'block', blockId: current.blockId });
    const slideNow = slideRef.current;
    if (text === null || !slideNow) return;
    const mutation = textCommitMutation(slideNow, current.blockId, current.pointer, text);
    if (mutation) commit([mutation]);
  };

  const stageRect = () => body.current?.parentElement?.getBoundingClientRect();

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

  /* the edit-mode keys (SPEC 6.9), in the capture phase so the shell's paging keys yield while a
     block is selected; inert inside fields and the editable run, and over the overlay's handles,
     which nudge themselves. This handler is the one owner of Tab in edit mode, the from-nothing
     case included: a second handler for that case in the studio route moved the selection twice
     per keydown (its uSES update flushed between the two capture listeners). This round adds the
     freeform keys: the arrows nudge the selection by 1 px (8 with Shift), Alt with Up or Down
     changes the paint order (and reorders a block within its slot on a grammar slide), Cmd ] and
     Cmd [ bring forward and send back, Delete removes every selected block in one write. A key
     pressed on a chrome control outside the stage (isChromeControlTarget) is that control's. */
  useEffect(() => {
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
      /* a key on a chrome control (an inspector button, a swatch, a menu row) is that control's:
         only Tab below still reads it, to decide whether the page or the browser owns the order */
      const fromControl = isChromeControlTarget(e.target, root.current);
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
      if (current === null || fromControl) return;
      const free = isFreeformSlide(slideNow);
      const ids = selectedIds(current, extraRef.current);
      const boxesNow = boxesRef.current;
      /* the order keys: Alt with Up (forward) or Down (backward); Cmd ] and Cmd [ on a freeform
         slide, as the arrange bar's tooltips state */
      const orderMove: OrderMove | null =
        e.altKey && !e.metaKey && !e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')
          ? e.key === 'ArrowUp'
            ? 'forward'
            : 'backward'
          : (e.metaKey || e.ctrlKey) && free && (e.key === ']' || e.key === '[')
            ? e.key === ']'
              ? 'forward'
              : 'backward'
            : null;
      if (orderMove !== null) {
        orderBlock(current.blockId, orderMove);
        stop();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case 'Escape':
          select(escapeSelection(current));
          stop();
          return;
        case 'ArrowDown':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowLeft': {
          if (free) {
            const step = e.shiftKey ? NUDGE_SHIFT_PX : NUDGE_PX;
            const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
            const dy = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0;
            commit(freeNudgeMutations(slideNow, ids, boxesNow, dx, dy));
            stop();
            return;
          }
          const delta = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
          select(cycleSelection(blockOrder(el), current, delta));
          stop();
          return;
        }
        case 'Enter': {
          const run = firstRunOf(el, current.blockId);
          if (run) {
            startEdit(run);
            stop();
          }
          return;
        }
        case 'Delete':
        case 'Backspace': {
          // real blocks only: the text of a title or statement slide is a field, not a block
          const blocks = ids.flatMap((id) => {
            const block = blockById(slideNow, id);
            return block ? [block] : [];
          });
          const anchor = blocks[0];
          if (anchor) {
            commit(
              blocks.map((block): Mutation => ({
                op: 'block.remove',
                slideId: slideNow.id,
                blockId: block.id,
              })),
            );
            select(null);
            /* the write is the one block.remove (or one slide.update of several) above; the
               chrome's toast names the block and the undo key so the removal is never silent
               (SPEC 6.9) */
            onRemovedRef.current?.({ type: anchor.type, id: anchor.id });
            stop();
          }
          return;
        }
        default:
          return;
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // bound once; every value it reads comes through a ref
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

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = body.current;
    const slideNow = slideRef.current;
    if (!el || !slideNow || e.button !== 0) return;
    const current = editingRef.current;
    /* a click inside the editable run is the caret's; one outside ends the edit through its blur */
    if (current) return;
    const id = resolveBlock(e.target, el);
    const free = isFreeformSlide(slideNow);
    if (id === null) {
      if (free) armMarquee(e.clientX, e.clientY);
      else select(null);
      return;
    }
    const selected = selectedIds(selectionRef.current, extraRef.current);
    if (free && e.shiftKey) {
      const toggled = toggleSelected(selectionRef.current, extraRef.current, id);
      select(toggled.selection, toggled.extra);
    } else if (!selected.includes(id)) {
      // a click on a block of the group keeps the group, so the drag that follows moves it whole
      select({ kind: 'block', blockId: id });
    }
    /* real blocks drag by their body (this round): to reorder on a grammar slide, anywhere on a
       freeform one; the text of a title or statement slide is a field and has no chip */
    if (blockById(slideNow, id)) {
      armPress({ blockId: id, clientX: e.clientX, clientY: e.clientY });
    }
  };

  const onDoubleClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    const el = body.current;
    if (!el || editingRef.current) return;
    const run = resolveRun(e.target, el);
    if (run) {
      e.preventDefault();
      startEdit(run);
    }
  };

  /* links are text on the stage in edit mode, never navigation */
  const onClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.target instanceof Element && e.target.closest('a')) e.preventDefault();
  };

  const pad = present ? SHEET_PAD.present : narrow ? SHEET_PAD.narrow : SHEET_PAD.wide;
  const fitted = fitSheet({ aw: stageSize.width, ah: stageSize.height, pad });
  /* the same placement Sheet makes: under the toolbar on a narrow viewport */
  const fit = narrow && !present ? { ...fitted, top: pad } : fitted;
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

  /* the arrange actions of a freeform selection (this round): each is one write */
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

  const view: EditorOverlayView = {
    slideId,
    k,
    boxes,
    hover: hoverBox,
    selection,
    selectionBox,
    chip: selectedId !== null && shownSlide ? chipLabel(shownSlide, selectedId) : null,
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

  return (
    <>
      <div
        ref={root}
        className={rootClass}
        data-theme={theme}
        data-editing={editing ? '' : undefined}
        data-marquee={marquee ? '' : undefined}
      >
        <div className="backdrop" aria-hidden="true">
          {backdrop ? <img src={backdrop} alt="" /> : null}
        </div>
        <Sheet stageSize={stageSize} present={present} narrow={narrow} dir="next" edges={false}>
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
            dangerouslySetInnerHTML={{ __html: html }}
          />
          {/* the live shader over every material frame of the slide (SPEC 5.3, 5.4; M5) */}
          <MaterialMount body={body} html={html} onError={onError} />
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
            onCommit={(text) => endEdit(text)}
            onCancel={() => endEdit(null)}
            onInput={measure}
          />
        ) : null}
      </div>
    </>
  );
}
