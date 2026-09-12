import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';

import type { EditorOverlayView, LintBox } from '@turboslide/viewer/Editor';
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
 * The freeform stage (Kevin's direction of 2026-09-11): the rings of every block of a
 * multi-selection and the hair box around the group, the eight resize squares of a positioned
 * block, the snap guides in titanium while a drag snaps, and the marquee. The Google Slides parity
 * round (gslides-parity SPEC 1.1, 4.3, 10.2) makes the block's frame the drag surface: four edge
 * strips around a positioned block start its move gesture, as Google's border does, since a click
 * inside the text now places the caret; the chip names the block in Google's words (Text box,
 * Image, Table) and prints the id only while Show slide and block ids is on (SPEC 13.7); the
 * arrange bar of the editor depth round is gone, its actions live in the Arrange menu and the
 * right-click menu (SPEC 4.3). Every control carries the chrome's tooltip (Tooltip.tsx tipProps)
 * naming it, what it does and its key; a native title is never used, so the audit and the reader
 * see one plate. Cmd Up and Cmd Down on a focused move chip (Ctrl on Windows) change the order
 * through the view's onHandleOrder, Google's Bring forward and Send backward, Shift for the ends
 * (SPEC 10.1); Alt with an arrow is retired (SPEC 10.2). Line law (SPEC 2.2 junction table): every rule here is 1px, the ring and an
 * active handle draw ink as a state (.is-selected, .is-active), a resting handle draws --pt-hair,
 * guides draw --pt-titanium, and the sheet's blocks draw nothing. New in Turboslide; no
 * Prototemplate source.
 */
export type OverlayProps = { view: EditorOverlayView };

/** A sheet box placed in CSS pixels. */
function place(box: Box, k: number): CSSProperties {
  return { left: box[0] * k, top: box[1] * k, width: box[2] * k, height: box[3] * k };
}

/** The chip's height plus its gap to the ring, in CSS pixels. */
const CHIP_H = 18;
const CHIP_GAP = 2;
/** The clearance a diagram label keeps from a stroke, in sheet pixels (DECK-GRAMMAR.md:45). */
const CLEARANCE_PX = 12;
/** The frame edge strips of a positioned block: this many CSS pixels wide, centred on the ring (gslides-parity SPEC 10.2). */
export const FRAME_EDGE_PX = 8;

/** The chip sits above the ring's top left corner, or under its bottom left when the ring meets the sheet's top. */
function chipStyle(box: Box, k: number): CSSProperties {
  const above = box[1] * k - CHIP_H - CHIP_GAP;
  return {
    left: box[0] * k,
    top: above >= 0 ? above : (box[1] + box[3]) * k + CHIP_GAP,
  };
}

/** The four edge strips of a block's frame, each centred on the ring's edge (gslides-parity SPEC 10.2: the frame is the drag surface). */
export function frameEdgeStyles(box: Box, k: number): Record<'n' | 's' | 'w' | 'e', CSSProperties> {
  const half = FRAME_EDGE_PX / 2;
  const left = box[0] * k;
  const top = box[1] * k;
  const width = box[2] * k;
  const height = box[3] * k;
  return {
    n: { left: left - half, top: top - half, width: width + FRAME_EDGE_PX, height: FRAME_EDGE_PX },
    s: {
      left: left - half,
      top: top + height - half,
      width: width + FRAME_EDGE_PX,
      height: FRAME_EDGE_PX,
    },
    w: {
      left: left - half,
      top: top + half,
      width: FRAME_EDGE_PX,
      height: Math.max(0, height - FRAME_EDGE_PX),
    },
    e: {
      left: left + width - half,
      top: top + half,
      width: FRAME_EDGE_PX,
      height: Math.max(0, height - FRAME_EDGE_PX),
    },
  };
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
      return `Drag the chip or the block to reorder it within its slot or into another slot. ${modKey()}Up and ${modKey()}Down move it one step, and with Shift to the first or the last place in its slot.`;
    case 'free-move':
      return `Drag the frame or the chip anywhere: snaps to the 8 px grid, the rails, the content box and other blocks. Arrows nudge 1 px, Shift 8 px. ${modKey()}Up and ${modKey()}Down change the order.`;
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
  const onHandleKey = (e: ReactKeyboardEvent<HTMLButtonElement>, handle: Handle) => {
    /* Cmd Up and Cmd Down on a move chip (Ctrl on Windows): Google's Bring forward and Send
       backward, Shift for the ends (gslides-parity SPEC 10.1), through the view's order and never
       a nudge. The chord stops here so the shell's key table does not run the Arrange menu's row
       a second time. Alt with an arrow is retired (SPEC 10.2) and does nothing on a handle. */
    if (
      (e.metaKey || e.ctrlKey) &&
      !e.altKey &&
      isMoveHandle(handle) &&
      (e.key === 'ArrowUp' || e.key === 'ArrowDown')
    ) {
      e.preventDefault();
      e.stopPropagation();
      const up = e.key === 'ArrowUp';
      view.onHandleOrder(
        handle,
        e.shiftKey ? (up ? 'front' : 'back') : up ? 'forward' : 'backward',
      );
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
  /* the frame of a positioned block is its drag surface (gslides-parity SPEC 10.2, R09 A1): four
     edge strips start the same free-move gesture as the chip */
  const frameEdges =
    chipHandle && chipHandle.kind === 'free-move' && ringBox && !view.editing
      ? frameEdgeStyles(ringBox, k)
      : null;
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
      {frameEdges && chipHandle
        ? (Object.keys(frameEdges) as Array<keyof typeof frameEdges>).map((side) => (
            <div
              key={`frame:${side}`}
              className="ts-frame-edge"
              data-side={side}
              style={frameEdges[side]}
              aria-hidden="true"
              onPointerDown={(e) => {
                if (e.button === 0) view.onHandleDown(chipHandle, e.nativeEvent);
              }}
            />
          ))
        : null}
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
    </>
  );
}
