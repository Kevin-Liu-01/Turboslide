// The stage in edit mode (SPEC 6.4): the theme's .ts-sheet root, the fitted sheet with the frame,
// the slide rendered through renderSlide as innerHTML (SPEC 5.3: React owns chrome, overlays and
// view state only), the measured block boxes, hover and selection, the gestures with a live
// preview from a draft document, inline text editing, and the overlay layer the chrome fills.
// Nothing here reaches the document except through an action-table call (SPEC 7.1): a drag ends in
// one mutation that `dispatch` receives as the same `block.set`, `block.move` or `slide.update`
// call the CLI and the MCP server make, with the document's revision as baseRevision. The owner of
// the client store (undo, autosave, conflicts; SPEC 6.7) provides `dispatch`.
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
import type { BlockSlot, Mutation } from '@turboslide/schema/mutations';
import { jsonEqual } from '@turboslide/schema/pointer';
import { applyMutations } from '@turboslide/schema/reduce';
import type { Box } from '@turboslide/schema/render';
import type { Text as Markup } from '@turboslide/schema/text';

import { Frame } from './Frame';
import {
  actionForMutation,
  blockMoveFor,
  EMPTY_BOXES,
  gestureMutation,
  handlesFor,
  labelClearanceBox,
  nudgeMutation,
  PART_SELECTORS,
  sheetPoint,
} from './Gestures';
import type { GestureContext, Handle, MeasuredBoxes, Point } from './Gestures';
import { InlineText, textCommitMutation } from './InlineText';
import { MaterialMount } from './MaterialMount';
import { isPictureKind, SHEET_W } from './model';
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
} from './Selection';
import type { Selection } from './Selection';
import { fitSheet, Sheet, SHEET_PAD } from './Sheet';
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
  lint: LintBox[];
  /** a run is being edited inline */
  editing: boolean;
  /** Alt is held: the diagram label and marker handles are live (SPEC 6.4 Alt-drag, M5) */
  alt: boolean;
  /** the 12 px clearance ring of the dragged diagram label, ink when a stroke intrudes (SPEC 6.4) */
  clearance: { box: Box; ok: boolean } | null;
  onHandleDown: (handle: Handle, event: PointerEvent) => void;
  /** `axis` names the arrow pair for a two-axis handle; the default is the handle's own axis */
  onHandleNudge: (handle: Handle, delta: number, axis?: 'x' | 'y') => void;
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
  /** the last previewed mutation, so an unchanged move re-renders nothing */
  last: Mutation | null;
};

/** Boxes are compared after rounding to a hundredth of a pixel, so a re-measure with the same layout re-renders nothing. */
function round(box: Box): Box {
  return box.map((v) => Math.round(v * 100) / 100) as unknown as Box;
}

/** Every box the gestures and the overlay read, in sheet pixels (SPEC 6.4: rect / k). */
function measureBoxes(body: HTMLElement): MeasuredBoxes | null {
  const stage = body.parentElement;
  if (!stage) return null;
  const rect = stage.getBoundingClientRect();
  const k = rect.width / SHEET_W;
  if (!(k > 0)) return null;
  const toBox = (el: Element): Box => {
    const r = el.getBoundingClientRect();
    return round([(r.left - rect.left) / k, (r.top - rect.top) / k, r.width / k, r.height / k]);
  };
  const next: MeasuredBoxes = { blocks: {}, slots: {}, runs: {}, parts: {} };
  body.querySelectorAll<HTMLElement>('[data-block]').forEach((el) => {
    const id = el.dataset.block;
    if (!id || id in next.blocks) return;
    next.blocks[id] = toBox(el);
    const selector = PART_SELECTORS[el.dataset.type as BlockType];
    if (selector) next.parts[id] = Array.from(el.querySelectorAll(selector), toBox);
  });
  body.querySelectorAll<HTMLElement>('[data-slot]').forEach((el) => {
    const slot = el.dataset.slot as BlockSlot | undefined;
    if (slot && !(slot in next.slots)) next.slots[slot] = toBox(el);
  });
  body.querySelectorAll<HTMLElement>('[data-run]').forEach((el) => {
    const run = el.dataset.run;
    if (run && !(run in next.runs)) next.runs[run] = toBox(el);
  });
  return next;
}

function backdropFor(document: DeckDocument, slide: Slide | undefined, theme: Theme, base: string) {
  if (!slide || !isPictureKind(slide.kind) || !('picture' in slide)) return undefined;
  const asset = document.deck.assets[slide.picture.asset];
  if (!asset) return undefined;
  if ('neutral' in asset.twins) return base + asset.twins.neutral;
  return base + (theme === 'dark' ? asset.twins.dark : asset.twins.light);
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
  const [boxes, setBoxes] = useState<MeasuredBoxes>(EMPTY_BOXES);
  const [hover, setHover] = useState<string | null>(null);
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const [drop, setDrop] = useState<Box | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [alt, setAlt] = useState(false);

  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const gesture = useRef<ActiveGesture | null>(null);
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

  const select = (next: Selection) => {
    if (jsonEqual(next, selectionRef.current)) return;
    selectionRef.current = next;
    setInnerSelection(next);
    onSelectionRef.current?.(next);
  };

  const measure = () => {
    const el = body.current;
    if (!el) return;
    const next = measureBoxes(el);
    if (!next) return;
    setBoxes((prev) => (jsonEqual(prev, next) ? prev : next));
  };

  /** One action call per mutation (SPEC 7.1); the draft stays up until the document moves on. */
  const commit = (mutation: Mutation) => {
    const call = actionForMutation(mutation, docRef.current.deck.revision);
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

  /* the fresh markup: the theme's twins and dither canvases, then the boxes; fonts and images re-measure */
  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    applyThemeToTree(el, theme);
    measure();
    const current = editingRef.current;
    if (current && !el.contains(current.element)) setEditing(null);
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
    if (mutation) commit(mutation);
  };

  /* the edit-mode keys (SPEC 6.9), in the capture phase so the shell's paging keys yield while a
     block is selected; inert inside fields and the editable run, and over the overlay's handles,
     which nudge themselves. This handler is the one owner of Tab in edit mode, the from-nothing
     case included: a second handler for that case in the studio route moved the selection twice
     per keydown (its uSES update flushed between the two capture listeners) */
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
      if (current === null || e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case 'Escape':
          select(escapeSelection(current));
          stop();
          return;
        case 'ArrowDown':
        case 'ArrowRight':
          select(cycleSelection(blockOrder(el), current, 1));
          stop();
          return;
        case 'ArrowUp':
        case 'ArrowLeft':
          select(cycleSelection(blockOrder(el), current, -1));
          stop();
          return;
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
          const block = blockById(slideNow, current.blockId);
          if (block) {
            commit({ op: 'block.remove', slideId: slideNow.id, blockId: block.id });
            select(null);
            /* the write is the one block.remove above; the chrome's toast names the block and
               the undo key so the removal is never silent (SPEC 6.9) */
            onRemovedRef.current?.({ type: block.type, id: block.id });
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

  const stageRect = () => body.current?.parentElement?.getBoundingClientRect();

  const onHandleDown = (handle: Handle, e: PointerEvent) => {
    const slideNow = slideRef.current;
    const rect = stageRect();
    if (e.button !== 0 || !slideNow || !rect || editingRef.current) return;
    e.preventDefault();
    const start = sheetPoint(rect, e.clientX, e.clientY);
    const ctx: GestureContext = { slide: slideNow, boxes: boxesRef.current };
    gesture.current = { handle, start, ctx, last: null };
    setActiveHandle(handle.id);
    setHover(null);
    if (handle.blockId !== undefined) select({ kind: 'block', blockId: handle.blockId });
    if (handle.kind === 'block-move' && handle.blockId !== undefined) {
      setDrop(blockMoveFor(slideNow, handle.blockId, start, ctx.boxes).indicator);
    }
    const move = (ev: PointerEvent) => {
      const g = gesture.current;
      const r = stageRect();
      if (!g || !r) return;
      const now = sheetPoint(r, ev.clientX, ev.clientY);
      if (g.handle.kind === 'block-move' && g.handle.blockId !== undefined) {
        setDrop(blockMoveFor(g.ctx.slide, g.handle.blockId, now, g.ctx.boxes).indicator);
      }
      const mutation = gestureMutation(g.handle, g.ctx, g.start, now);
      if (jsonEqual(mutation, g.last)) return;
      g.last = mutation;
      if (mutation === null) {
        setDraft(null);
        return;
      }
      try {
        setDraft(applyMutations(docRef.current, [mutation]).document);
      } catch {
        // a preview the reducer refuses: the last good preview stays up
      }
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      const g = gesture.current;
      gesture.current = null;
      setActiveHandle(null);
      setDrop(null);
      const r = stageRect();
      if (!g || !r) {
        setDraft(null);
        return;
      }
      const now = sheetPoint(r, ev.clientX, ev.clientY);
      const mutation = gestureMutation(g.handle, g.ctx, g.start, now);
      if (mutation === null) {
        setDraft(null);
        return;
      }
      commit(mutation);
    };
    const cancel = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      gesture.current = null;
      setActiveHandle(null);
      setDrop(null);
      setDraft(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
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
    if (mutation) commit(mutation);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = body.current;
    if (!el || gesture.current) return;
    const id = resolveBlock(e.target, el);
    setHover((prev) => (prev === id ? prev : id));
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = body.current;
    if (!el || e.button !== 0) return;
    const current = editingRef.current;
    /* a click inside the editable run is the caret's; one outside ends the edit through its blur */
    if (current) return;
    const id = resolveBlock(e.target, el);
    select(id === null ? null : { kind: 'block', blockId: id });
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
  const selectionBox =
    selection === null
      ? null
      : selection.kind === 'run'
        ? (boxes.runs[`${selection.blockId}/${selection.pointer}`] ??
          boxes.blocks[selection.blockId] ??
          null)
        : (boxes.blocks[selection.blockId] ?? null);
  const hoverBox =
    hover !== null && hover !== selectedId && !activeHandle ? (boxes.blocks[hover] ?? null) : null;
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
    lint,
    editing: editing !== null,
    alt,
    clearance: clearance ? { box: clearance.box, ok: clearance.ok } : null,
    onHandleDown,
    onHandleNudge,
  };

  const backdrop = backdropFor(shown, shownSlide, theme, assetBase);
  const isPicture = backdrop !== undefined;
  const editingBox = editing
    ? (boxes.runs[`${editing.blockId}/${editing.pointer}`] ?? boxes.blocks[editing.blockId] ?? null)
    : null;

  return (
    <>
      <div
        ref={root}
        className={
          isPicture
            ? 'ts-stagewrap ts-sheet ts-editor is-picture'
            : 'ts-stagewrap ts-sheet ts-editor'
        }
        data-theme={theme}
        data-editing={editing ? '' : undefined}
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
