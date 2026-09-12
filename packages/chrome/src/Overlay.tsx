import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';

import type { ArrangeActions, EditorOverlayView, LintBox } from '@turboslide/viewer/Editor';
import type { Box, Handle } from '@turboslide/viewer/Gestures';
import { GuideLines } from '@turboslide/viewer/Guides';
import { MarqueeRect } from '@turboslide/viewer/Marquee';

import { cn } from './lib/cn';
import { tipProps } from './Tooltip';

import './Overlay.css';

/**
 * The overlay over the stage in edit mode (SPEC 6.4), drawn from the boxes the viewer's Editor
 * measured, in the chrome's tokens: a --pt-hair outline under the pointer, the --pt-ink selection
 * ring with a 13px chip naming `type · id` outside it, the lint boxes of the slide while the lint
 * layer is on (severity 3 in ink, 1 and 2 in titanium, the rule id in the chip), the insertion
 * line and the outlined target slot of a block drag, and the handles of the direct manipulation
 * table (the seam, the plate edge and grip, the key edge, the shot edge and crop area, the pair
 * figures, the scales markers). The chip is the block's drag handle: dragging it reorders the
 * block within its slot or into another one, and on a freeform slide moves it anywhere. Handles
 * are buttons, so the arrow keys nudge them (SPEC 6.4 keyboard nudges) and the window API can name
 * them by label or `data-control`. The labels and markers of a declared diagram are handles that
 * take the pointer only while Alt is held (`data-alt-only`, the overlay root's `data-alt`; SPEC 6.4
 * Alt-drag, M5), and a dragged label shows its 12 px clearance ring, ink as a state when a stroke
 * intrudes.
 *
 * This round (Kevin's direction of 2026-09-11) adds the freeform stage: the rings of every block
 * of a multi-selection and the hair box around the group, the eight resize squares of a
 * positioned block, the snap guides in titanium while a drag snaps, the marquee, and the arrange
 * bar under the selection (align, distribute, bring forward, send back) whose icons are Heroicons
 * 20 solid from the theme sprite. Every control carries the chrome's tooltip (Tooltip.tsx
 * tipProps) naming it, what it does and its key; a native title is never used, so the audit and
 * the reader see one plate. Alt with Up or Down on a focused move chip changes the order through
 * the view's onHandleOrder, the same write the arrange bar's order buttons make. Line law (SPEC 2.2
 * junction table): every rule here is 1px, the ring and an active handle draw ink as a state
 * (.is-selected, .is-active), a resting handle draws --pt-hair, guides draw --pt-titanium, and the
 * sheet's blocks draw nothing. New in Turboslide; no Prototemplate source.
 */
export type OverlayProps = { view: EditorOverlayView };

/** A sheet box placed in CSS pixels. */
function place(box: Box, k: number): CSSProperties {
  return { left: box[0] * k, top: box[1] * k, width: box[2] * k, height: box[3] * k };
}

/** The chip's height plus its gap to the ring, in CSS pixels. */
const CHIP_H = 18;
const CHIP_GAP = 2;
/** The arrange bar's height and its gap to the ring, in CSS pixels. */
const BAR_H = 32;
const BAR_GAP = 6;
/** The clearance a diagram label keeps from a stroke, in sheet pixels (DECK-GRAMMAR.md:45). */
const CLEARANCE_PX = 12;

/** The chip sits above the ring's top left corner, or under its bottom left when the ring meets the sheet's top. */
function chipStyle(box: Box, k: number): CSSProperties {
  const above = box[1] * k - CHIP_H - CHIP_GAP;
  return {
    left: box[0] * k,
    top: above >= 0 ? above : (box[1] + box[3]) * k + CHIP_GAP,
  };
}

/** The arrange bar sits under the ring's bottom left corner, or above its top right when the ring meets the sheet's bottom. */
function barStyle(box: Box, k: number, sheetHeight: number): CSSProperties {
  const below = (box[1] + box[3]) * k + BAR_GAP;
  if (below + BAR_H <= sheetHeight) return { left: box[0] * k, top: below };
  return { left: box[0] * k, top: Math.max(0, box[1] * k - BAR_H - BAR_GAP - CHIP_H - CHIP_GAP) };
}

/** A vertical edge handle is placed by its center and never thinner than its minimum hit width. */
function handleStyle(handle: Handle, k: number): CSSProperties {
  if (handle.shape === 'v') {
    return {
      left: (handle.box[0] + handle.box[2] / 2) * k,
      top: handle.box[1] * k,
      width: Math.max(9, handle.box[2] * k),
      height: handle.box[3] * k,
      transform: 'translateX(-50%)',
      cursor: handle.cursor,
    };
  }
  if (handle.shape === 'square') {
    return {
      left: (handle.box[0] + handle.box[2] / 2) * k,
      top: (handle.box[1] + handle.box[3] / 2) * k,
      width: 11,
      height: 11,
      transform: 'translate(-50%, -50%)',
      cursor: handle.cursor,
    };
  }
  return { ...place(handle.box, k), cursor: handle.cursor };
}

/** The Cmd key on Apple platforms, Ctrl elsewhere, for the tooltips. */
function modKey(): string {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
    ? '⌘'
    : 'Ctrl+';
}

const RESIZE_NAMES: Record<string, string> = {
  n: 'top edge',
  s: 'bottom edge',
  e: 'right edge',
  w: 'left edge',
  ne: 'top right corner',
  nw: 'top left corner',
  se: 'bottom right corner',
  sw: 'bottom left corner',
};

/**
 * What a handle's drag does and its keys, as the sentence of its tooltip (this round: every
 * control surface carries one). Plain sentences, no em dashes.
 */
export function handleDoc(handle: Handle): string {
  switch (handle.kind) {
    case 'col-seam':
      return 'Drag to set the column ratio: snaps to 4/8, 5/7 and 1/1, then 10 px steps. Left and Right step it.';
    case 'plate-width':
      return 'Drag the plate edge: snaps to the plate widths. Left and Right step it.';
    case 'plate-side':
      return 'Drag to the other half of the sheet to move the plate. Enter flips it.';
    case 'key-edge':
      return 'Drag: snaps to the key column set. Left and Right step it.';
    case 'shot-width':
      return 'Drag: snaps to the column width, 425 and the slot height. Left and Right step 10 px.';
    case 'shot-crop':
      return 'Drag up or down past 24 px to flip the crop between top and center. Enter flips it.';
    case 'pair-swap':
      return 'Drag over the other figure to swap them. Left and Right swap with a neighbour.';
    case 'scale-marker':
      return 'Drag along the bar: an integer from 0 to 100. Left and Right step 1, Shift 10.';
    case 'dia-label':
      return 'Alt-drag to move the label on the half-pixel grid; the ring shows its 12 px clearance. Arrows step 1 unit, Shift 10.';
    case 'dia-marker':
      return 'Alt-drag to move the marker on the half-pixel grid. Arrows step 1 unit, Shift 10.';
    case 'block-move':
      return 'Drag the chip or the block to reorder it within its slot or into another slot. Alt with Up or Down moves it one step.';
    case 'free-move':
      return `Drag the chip or the block anywhere: snaps to the 8 px grid, the rails, the content box and other blocks. Arrows nudge 1 px, Shift 8 px. Alt with Up or Down changes the order (${modKey()}] and ${modKey()}[).`;
    case 'free-resize':
      return `Drag the ${RESIZE_NAMES[handle.dir ?? ''] ?? 'edge'} to resize; Shift keeps the aspect. Arrows step 1 px, Shift 8 px.`;
  }
}

/** The tooltip of a handle as one string: its name, then what the drag does and its keys. */
export function handleTitle(handle: Handle): string {
  return `${handle.label}. ${handleDoc(handle)}`;
}

/** The tooltip props of a handle or the chip: the label as the name, the doc as the sentence. */
function handleTip(handle: Handle) {
  return tipProps({ name: handle.label, doc: handleDoc(handle) });
}

/** True for a move chip (a block within its slot, or a positioned block): the order keys apply. */
function isMoveHandle(handle: Handle): boolean {
  return handle.kind === 'free-move' || handle.kind === 'block-move';
}

/** The arrow pair a key belongs to, for a two-axis handle (a diagram label or marker, a positioned block). */
function nudgeAxis(e: ReactKeyboardEvent<HTMLElement>): 'x' | 'y' | null {
  switch (e.key) {
    case 'ArrowLeft':
    case 'ArrowRight':
      return 'x';
    case 'ArrowUp':
    case 'ArrowDown':
      return 'y';
    default:
      return null;
  }
}

function nudgeDelta(e: ReactKeyboardEvent<HTMLElement>, handle: Handle): number | null {
  // Shift steps ten on the grammar handles and eight sheet pixels on a positioned block
  const free = handle.kind === 'free-move' || handle.kind === 'free-resize';
  const big = e.shiftKey ? (free ? 8 : 10) : 1;
  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowUp':
      return big;
    case 'ArrowLeft':
    case 'ArrowDown':
      return -big;
    case 'Enter':
    case ' ':
      // a grip or an area has two states: the key flips it
      return !free && (handle.shape === 'square' || handle.shape === 'area') ? 1 : null;
    default:
      return null;
  }
}

function LintMark({ lint, k }: { lint: LintBox; k: number }) {
  return (
    <div
      className="ts-lint-box"
      data-severity={lint.severity}
      data-rule={lint.rule}
      style={place(lint.box, k)}
      aria-hidden="true"
    >
      <span className="ts-lint-box-chip">{lint.rule}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The arrange bar

type ArrangeGlyph =
  | 'align-left'
  | 'align-center'
  | 'align-right'
  | 'align-top'
  | 'align-middle'
  | 'align-bottom'
  | 'distribute-x'
  | 'distribute-y'
  | 'forward'
  | 'back';

/**
 * Heroicons 20 solid for the bar, every one a `<use>` of the theme sprite the stage inlines
 * (packages/theme/assets/sprite.svg; the round's rule). The three bars glyphs (bars-3-bottom-left,
 * bars-3-center-left, bars-3-bottom-right) read as align left, center and right, and rotated a
 * quarter turn as align top, middle and bottom; distribute and the order pair use arrows-right-left,
 * arrows-up-down and arrow-up (send back is bring forward turned over).
 */
const ALIGN_SYMBOL: Record<'left' | 'center' | 'right', string> = {
  left: '#i-bars-3-bottom-left',
  center: '#i-bars-3-center-left',
  right: '#i-bars-3-bottom-right',
};

function Glyph({ glyph }: { glyph: ArrangeGlyph }) {
  switch (glyph) {
    case 'align-left':
    case 'align-center':
    case 'align-right':
    case 'align-top':
    case 'align-middle':
    case 'align-bottom': {
      const symbol =
        glyph === 'align-left' || glyph === 'align-top'
          ? ALIGN_SYMBOL.left
          : glyph === 'align-center' || glyph === 'align-middle'
            ? ALIGN_SYMBOL.center
            : ALIGN_SYMBOL.right;
      const rotated = glyph === 'align-top' || glyph === 'align-middle' || glyph === 'align-bottom';
      return (
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
          className={rotated ? 'ts-arrange-rotated' : undefined}
        >
          <use href={symbol} />
        </svg>
      );
    }
    case 'distribute-x':
      return (
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <use href="#i-arrows-right-left" />
        </svg>
      );
    case 'distribute-y':
      return (
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <use href="#i-arrows-up-down" />
        </svg>
      );
    case 'forward':
      return (
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <use href="#i-arrow-up" />
        </svg>
      );
    case 'back':
      return (
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
          className="ts-arrange-flipped"
        >
          <use href="#i-arrow-up" />
        </svg>
      );
  }
}

type ArrangeButton = {
  glyph: ArrangeGlyph;
  control: string;
  /** the tooltip's name and the accessible name */
  name: string;
  /** the tooltip's sentence */
  doc: string;
  /** the tooltip's key chip, when the button has a key */
  key?: string;
  run: (arrange: ArrangeActions) => void;
  /** disabled below this many selected blocks */
  needs: number;
};

const ARRANGE_BUTTONS: ArrangeButton[] = [
  {
    glyph: 'align-left',
    control: 'arrange.align.left',
    name: 'Align left',
    doc: 'Moves the selected blocks so their left edges meet the leftmost one; a single block goes to the content box edge.',
    run: (a) => a.align('left'),
    needs: 1,
  },
  {
    glyph: 'align-center',
    control: 'arrange.align.center',
    name: 'Align center',
    doc: 'Centers the selected blocks on the group center; a single block centers on the content box.',
    run: (a) => a.align('center'),
    needs: 1,
  },
  {
    glyph: 'align-right',
    control: 'arrange.align.right',
    name: 'Align right',
    doc: 'Moves the selected blocks so their right edges meet the rightmost one; a single block goes to the content box edge.',
    run: (a) => a.align('right'),
    needs: 1,
  },
  {
    glyph: 'align-top',
    control: 'arrange.align.top',
    name: 'Align top',
    doc: 'Moves the selected blocks so their top edges meet the topmost one; a single block goes to the content box top.',
    run: (a) => a.align('top'),
    needs: 1,
  },
  {
    glyph: 'align-middle',
    control: 'arrange.align.middle',
    name: 'Align middle',
    doc: 'Centers the selected blocks vertically on the group; a single block centers on the content box.',
    run: (a) => a.align('middle'),
    needs: 1,
  },
  {
    glyph: 'align-bottom',
    control: 'arrange.align.bottom',
    name: 'Align bottom',
    doc: 'Moves the selected blocks so their bottom edges meet the lowest one; a single block goes to the content box bottom.',
    run: (a) => a.align('bottom'),
    needs: 1,
  },
  {
    glyph: 'distribute-x',
    control: 'arrange.distribute.x',
    name: 'Distribute horizontally',
    doc: 'Keeps the leftmost and rightmost blocks and spaces the ones between with equal gaps. Needs three blocks.',
    run: (a) => a.distribute('horizontal'),
    needs: 3,
  },
  {
    glyph: 'distribute-y',
    control: 'arrange.distribute.y',
    name: 'Distribute vertically',
    doc: 'Keeps the top and bottom blocks and spaces the ones between with equal gaps. Needs three blocks.',
    run: (a) => a.distribute('vertical'),
    needs: 3,
  },
  {
    glyph: 'forward',
    control: 'arrange.z.forward',
    name: 'Bring forward',
    doc: 'Paints the selected block over the next one.',
    key: `${modKey()}] or Alt Up`,
    run: (a) => a.zOrder('forward'),
    needs: 1,
  },
  {
    glyph: 'back',
    control: 'arrange.z.back',
    name: 'Send back',
    doc: 'Paints the selected block under the previous one.',
    key: `${modKey()}[ or Alt Down`,
    run: (a) => a.zOrder('backward'),
    needs: 1,
  },
];

function ArrangeBar({
  arrange,
  box,
  k,
  sheetHeight,
}: {
  arrange: ArrangeActions;
  box: Box;
  k: number;
  sheetHeight: number;
}) {
  return (
    <div
      className="ts-arrange"
      role="toolbar"
      aria-label="Arrange"
      style={barStyle(box, k, sheetHeight)}
    >
      {ARRANGE_BUTTONS.map((button, i) => (
        <button
          key={button.control}
          type="button"
          className={cn('pt-ib', 'pt-icon', (i === 6 || i === 8) && 'ts-arrange-group')}
          aria-label={button.name}
          data-control={button.control}
          disabled={arrange.count < button.needs}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => button.run(arrange)}
          {...tipProps({
            name: button.name,
            doc: button.doc,
            ...(button.key !== undefined ? { key: button.key } : {}),
          })}
        >
          <Glyph glyph={button.glyph} />
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// A handle button: the chip or a drawn handle, with its tooltip merged over its own keys

type HandleButtonProps = {
  handle: Handle;
  className: string;
  style: CSSProperties;
  onDown: (handle: Handle, event: PointerEvent) => void;
  onKey: (e: ReactKeyboardEvent<HTMLButtonElement>, handle: Handle) => void;
  children?: ReactNode;
};

function HandleButton({ handle, className, style, onDown, onKey, children }: HandleButtonProps) {
  const tip = handleTip(handle);
  return (
    <button
      type="button"
      className={className}
      data-kind={handle.kind}
      data-shape={handle.shape}
      data-dir={handle.dir}
      data-alt-only={handle.alt ? '' : undefined}
      style={style}
      aria-label={handle.label}
      data-control={handle.control}
      {...tip}
      onPointerDown={(e) => {
        if (e.button === 0) onDown(handle, e.nativeEvent);
      }}
      onKeyDown={(e) => {
        tip.onKeyDown(e);
        onKey(e, handle);
      }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------------------------
// The overlay

export function Overlay({ view }: OverlayProps) {
  const { k } = view;
  const chipHandle = view.handles.find((handle) => handle.shape === 'chip');
  const drawn = view.handles.filter((handle) => handle.shape !== 'chip');
  const sheetHeight = 900 * k;
  const onHandleKey = (e: ReactKeyboardEvent<HTMLButtonElement>, handle: Handle) => {
    /* Alt with Up or Down on a move chip: the order, as the chip's tooltip promises, never a
       nudge (measured on the editor depth preview: the block moved 1 px and kept its z) */
    if (e.altKey && isMoveHandle(handle) && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      e.stopPropagation();
      view.onHandleOrder(handle, e.key === 'ArrowUp' ? 'forward' : 'backward');
      return;
    }
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    const delta = nudgeDelta(e, handle);
    if (delta === null) return;
    e.preventDefault();
    e.stopPropagation();
    // a two-axis handle (SPEC 6.4 dia labels and markers, M5; a positioned block this round)
    // takes Left and Right on x, Up and Down on y; every other handle keeps its one axis
    const axis = handle.axis === 'xy' ? nudgeAxis(e) : null;
    if (axis) view.onHandleNudge(handle, delta, axis);
    else view.onHandleNudge(handle, delta);
  };
  const chipText =
    view.count > 1 && view.chip !== null ? `${view.count} blocks · ${view.chip}` : view.chip;
  const ringBox = view.groupBox ?? view.selectionBox;
  return (
    <>
      {view.hover ? (
        <div className="ts-hover" style={place(view.hover, k)} aria-hidden="true" />
      ) : null}
      {view.lint.map((lint) => (
        <LintMark key={lint.id} lint={lint} k={k} />
      ))}
      {/* the outlined target slot of a block drag (this round), hair, under the drop line */}
      {view.dropSlot ? (
        <div className="ts-drop-slot" style={place(view.dropSlot, k)} aria-hidden="true" />
      ) : null}
      {/* the other blocks of a multi-selection: each its own ink ring */}
      {view.extraBoxes.map((box, i) => (
        <div
          key={`extra:${i}`}
          className="ts-select is-selected is-extra"
          style={place(box, k)}
          aria-hidden="true"
        />
      ))}
      {view.selectionBox ? (
        <div
          className={cn('ts-select', 'is-selected', view.editing && 'is-editing')}
          style={place(view.selectionBox, k)}
          aria-hidden="true"
        />
      ) : null}
      {/* the hair box around the group, so the whole selection reads as one */}
      {view.groupBox ? (
        <div className="ts-group" style={place(view.groupBox, k)} aria-hidden="true" />
      ) : null}
      {ringBox && view.chip !== null ? (
        chipHandle && !view.editing ? (
          <HandleButton
            handle={chipHandle}
            className={cn('ts-select-chip', view.activeHandle === chipHandle.id && 'is-active')}
            style={chipStyle(ringBox, k)}
            onDown={view.onHandleDown}
            onKey={onHandleKey}
          >
            {chipText}
          </HandleButton>
        ) : (
          <span className="ts-select-chip is-static" style={chipStyle(ringBox, k)}>
            {chipText}
          </span>
        )
      ) : null}
      {view.drop ? (
        <div
          className="ts-drop is-active"
          style={{ left: view.drop[0] * k, top: view.drop[1] * k, width: view.drop[2] * k }}
          aria-hidden="true"
        />
      ) : null}
      {/* the 12 px clearance ring of a dragged diagram label (SPEC 6.4, M5): hair while the label
          keeps its distance, ink as a state when a stroke or a marker intrudes */}
      {view.clearance ? (
        <div
          className={cn('ts-clearance', !view.clearance.ok && 'is-short')}
          style={place(
            [
              view.clearance.box[0] - CLEARANCE_PX,
              view.clearance.box[1] - CLEARANCE_PX,
              view.clearance.box[2] + 2 * CLEARANCE_PX,
              view.clearance.box[3] + 2 * CLEARANCE_PX,
            ],
            k,
          )}
          aria-hidden="true"
        />
      ) : null}
      {/* the snap guides of a freeform drag (this round), titanium */}
      {view.guides.length > 0 ? <GuideLines guides={view.guides} k={k} /> : null}
      {view.marquee ? <MarqueeRect box={view.marquee} k={k} /> : null}
      {drawn.map((handle) => (
        <HandleButton
          key={handle.id}
          handle={handle}
          className={cn(
            'ts-handle',
            handle.blockId !== undefined && 'is-selected',
            view.activeHandle === handle.id && 'is-active',
          )}
          style={handleStyle(handle, k)}
          onDown={view.onHandleDown}
          onKey={onHandleKey}
        />
      ))}
      {/* the arrange bar of a freeform selection (this round), hidden while a drag is on */}
      {view.arrange && ringBox && !view.editing && view.activeHandle === null && !view.marquee ? (
        <ArrangeBar arrange={view.arrange} box={ringBox} k={k} sheetHeight={sheetHeight} />
      ) : null}
    </>
  );
}
