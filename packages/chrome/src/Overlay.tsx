import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';

import type { EditorOverlayView, LintBox } from '@turboslide/viewer/Editor';
import type { Box, Handle } from '@turboslide/viewer/Gestures';
import { GuideLines } from '@turboslide/viewer/Guides';
import { MarqueeRect } from '@turboslide/viewer/Marquee';
import { objectTransform, ROTATE_HANDLE_GAP_PX, ROTATE_HANDLE_PX } from '@turboslide/viewer/rotate';

import { DeckGuides } from './DeckGuides';
import { cn } from './lib/cn';
import { CANVAS } from './menus/strings';
import { Rulers } from './Rulers';
import { tipProps } from './Tooltip';

import './Overlay.css';

/**
 * The overlay over the stage in edit mode (SPEC 6.4; gslides-parity SPEC-2 section 6), drawn from
 * the boxes the viewer's Editor measured, in the chrome's tokens: a --pt-hair outline under the
 * pointer, the --pt-ink selection ring with a 13px chip naming the object in Google's words
 * outside it, the lint boxes of the slide while the lint layer is on (severity 3 in ink, 1 and 2
 * in titanium, the rule id in the chip), the insertion line and the outlined target slot of a
 * grammar reorder, and the handles of the direct manipulation table (the seam, the plate edge and
 * grip, the key edge, the shot edge and crop area, the pair figures, the scales markers). Handles
 * are buttons, so the arrow keys nudge them (SPEC 6.4 keyboard nudges) and the window API can name
 * them by label or `data-control`. The labels and markers of a declared diagram are handles that
 * take the pointer only while Alt is held (`data-alt-only`, the overlay root's `data-alt`).
 *
 * The canvas (Kevin's directive of 2026-09-12, SPEC-2 6.1): every object of every slide kind
 * carries the ring with eight 11 px squares, the rotation ring 24 px above the top centre joined
 * by a 1 px line (a `slider` the arrows step by a degree, Shift by fifteen), and the frame edges
 * that start its move; a rotated or flipped object's ring and handles turn with it, drawn from
 * `pos` (SPEC-2 1.5); a line kind shows its two end handles instead; a multi selection draws a
 * ring per member and the hair union box with the chip "3 objects", a group the union ring with
 * `role="group"` and the chip "Group"; the readouts (the size while a resize is down, the angle
 * while a rotation is down, the inch position while a guide drags); crop mode's dimmed picture
 * and black handles with its chip sentence; the connection sites of the shape under a line end;
 * the deck's guides (DeckGuides.tsx) and the rulers (Rulers.tsx). Every control carries the
 * chrome's tooltip (Tooltip.tsx tipProps); a native title is never used. Cmd Up and Cmd Down on a
 * focused move chip change the order through the view's onHandleOrder, Shift for the ends (SPEC
 * 10.1). Line law (SPEC 2.2): every rule here is 1px, the ring and an active handle draw ink as a
 * state, a resting handle draws --pt-hair, guides draw --pt-titanium, and the sheet's blocks draw
 * nothing.
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
/** The frame edge strips of an object: this many CSS pixels wide, centred on the ring (gslides-parity SPEC 10.2). */
export const FRAME_EDGE_PX = 8;

/** The chip sits above the ring's top left corner, or under its bottom left when the ring meets the sheet's top. */
function chipStyle(box: Box, k: number): CSSProperties {
  const above = box[1] * k - CHIP_H - CHIP_GAP;
  return {
    left: box[0] * k,
    top: above >= 0 ? above : (box[1] + box[3]) * k + CHIP_GAP,
  };
}

/** The readout chip sits above the ring's top right, clear of the chip and the rotation ring. */
function readoutStyle(box: Box, k: number): CSSProperties {
  const above = box[1] * k - CHIP_H - CHIP_GAP - ROTATE_HANDLE_GAP_PX;
  return {
    left: (box[0] + box[2]) * k,
    top: above >= 0 ? above : (box[1] + box[3]) * k + CHIP_GAP,
    transform: 'translateX(-100%)',
  };
}

/** The four edge strips of an object's frame, each centred on the ring's edge (gslides-parity SPEC 10.2: the frame is the drag surface). */
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
  if (handle.shape === 'ring') {
    /* the ring sits ROTATE_HANDLE_GAP_PX CSS pixels above the top centre of the box it turns (the
       hit box's bottom edge is the object's top) */
    return {
      left: (handle.box[0] + handle.box[2] / 2) * k,
      top: (handle.box[1] + handle.box[3]) * k - ROTATE_HANDLE_GAP_PX,
      width: ROTATE_HANDLE_PX,
      height: ROTATE_HANDLE_PX,
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
      return `Drag the frame or the chip anywhere: snaps to other objects, the slide's edges and centre and the guides; Shift keeps one axis, ${modKey()}drag skips the snaps, Option drag drops a copy. Arrows nudge 1 px, Shift 10 px. ${modKey()}Up and ${modKey()}Down change the order.`;
    case 'free-resize':
      return `Drag the ${RESIZE_NAMES[handle.dir ?? ''] ?? 'edge'} to resize; Shift keeps the aspect ratio, Option resizes from the centre. Arrows step 1 px, Shift 10 px.`;
    case 'free-rotate':
      return 'Drag to rotate about the centre; Shift snaps to 15 degrees. Left and Right turn 1 degree, Shift 15.';
    case 'line-end':
      return 'Drag the end of the line; it snaps to a connection site of the shape under it and follows that shape from then on. Shift keeps 45 degree steps.';
    case 'crop-edge':
      return `Drag the ${RESIZE_NAMES[handle.dir ?? ''] ?? 'edge'} of the crop. Press Enter to finish.`;
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

/** True for a move chip (a block within its slot, or an object): the order keys apply. */
function isMoveHandle(handle: Handle): boolean {
  return handle.kind === 'free-move' || handle.kind === 'block-move';
}

/** The arrow pair a key belongs to, for a two-axis handle (a diagram label or marker, an object). */
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
  // Shift steps ten on the grammar handles and on an object (SPEC-2 0.87), fifteen degrees on the rotation ring
  const free =
    handle.kind === 'free-move' || handle.kind === 'free-resize' || handle.kind === 'crop-edge';
  const big = e.shiftKey ? (handle.kind === 'free-rotate' ? 15 : 10) : 1;
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
      return !free &&
        handle.kind !== 'free-rotate' &&
        (handle.shape === 'square' || handle.shape === 'area')
        ? 1
        : null;
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
  /** the rotation ring is a slider: the angle in degrees */
  angle?: number;
  children?: ReactNode;
};

function HandleButton({
  handle,
  className,
  style,
  onDown,
  onKey,
  angle,
  children,
}: HandleButtonProps) {
  const tip = handleTip(handle);
  const slider = handle.kind === 'free-rotate';
  return (
    <button
      type="button"
      className={className}
      data-kind={handle.kind}
      data-shape={handle.shape}
      data-dir={handle.dir}
      data-index={handle.index}
      data-alt-only={handle.alt ? '' : undefined}
      style={style}
      aria-label={handle.label}
      data-control={handle.control}
      {...(slider
        ? {
            role: 'slider',
            'aria-valuemin': 0,
            'aria-valuemax': 359,
            'aria-valuenow': Math.round(angle ?? 0),
            'aria-valuetext': CANVAS.rotation(Math.round(angle ?? 0)),
          }
        : {})}
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
    // a two-axis handle (SPEC 6.4 dia labels and markers, M5; an object) takes Left and Right on
    // x, Up and Down on y; every other handle keeps its one axis
    const axis = handle.axis === 'xy' ? nudgeAxis(e) : null;
    if (axis) view.onHandleNudge(handle, delta, axis);
    else view.onHandleNudge(handle, delta);
  };
  const chipText =
    view.groupTag !== null && view.count > 1
      ? CANVAS.group
      : view.count > 1
        ? CANVAS.objects(view.count)
        : view.chip;
  const ringBox = view.groupBox ?? view.selectionBox;
  /* a rotated or flipped object's ring and handles turn with it, drawn from pos (SPEC-2 1.5);
     the chip, the readouts and the union box stay upright over the bounding box */
  const transform =
    view.count === 1 && view.selectionPos !== null ? objectTransform(view.selectionPos) : undefined;
  const rotated = transform !== undefined;
  const turnStyle: CSSProperties | undefined =
    rotated && ringBox
      ? { ...place(ringBox, k), transform, transformOrigin: 'center center' }
      : undefined;
  /* the frame of an object is its drag surface (gslides-parity SPEC 10.2, R09 A1): four edge
     strips start the same free-move gesture as the chip */
  const frameEdges =
    chipHandle && chipHandle.kind === 'free-move' && ringBox && !view.editing && !view.crop
      ? frameEdgeStyles(rotated ? [0, 0, ringBox[2], ringBox[3]] : ringBox, k)
      : null;
  const angle = view.selectionPos?.rotate ?? 0;
  /* the handles of a turned object are placed relative to its own box inside the turning layer */
  const localHandle = (handle: Handle): Handle =>
    rotated && ringBox
      ? {
          ...handle,
          box: [
            handle.box[0] - ringBox[0],
            handle.box[1] - ringBox[1],
            handle.box[2],
            handle.box[3],
          ],
        }
      : handle;
  const turning = drawn.filter(
    (handle) =>
      handle.kind === 'free-resize' || handle.kind === 'free-rotate' || handle.kind === 'line-end',
  );
  const flat = drawn.filter((handle) => !turning.includes(handle));
  const handleButton = (handle: Handle, local: boolean) => (
    <HandleButton
      key={handle.id}
      handle={handle}
      className={cn(
        'ts-handle',
        handle.blockId !== undefined && 'is-selected',
        view.activeHandle === handle.id && 'is-active',
      )}
      style={handleStyle(local ? localHandle(handle) : handle, k)}
      onDown={view.onHandleDown}
      onKey={onHandleKey}
      angle={angle}
    />
  );
  const readout =
    view.rotation !== null
      ? CANVAS.rotation(Math.round(view.rotation))
      : view.sizeReadout !== null
        ? CANVAS.size(Math.round(view.sizeReadout.w), Math.round(view.sizeReadout.h))
        : null;
  return (
    <>
      {view.rulers ? (
        <Rulers
          k={k}
          pointer={view.rulers.pointer}
          selection={view.rulers.selection}
          onRulerDown={view.onRulerDown}
        />
      ) : null}
      {view.deckGuides ? (
        <DeckGuides
          guides={view.deckGuides}
          k={k}
          dragging={view.draggingGuide}
          onGuideDown={view.onGuideDown}
          onGuideContextMenu={view.onGuideContextMenu}
        />
      ) : view.draggingGuide ? (
        <DeckGuides
          guides={{ x: [], y: [] }}
          k={k}
          dragging={view.draggingGuide}
          onGuideDown={view.onGuideDown}
          onGuideContextMenu={view.onGuideContextMenu}
        />
      ) : null}
      {view.hover ? (
        <div className="ts-hover" style={place(view.hover, k)} aria-hidden="true" />
      ) : null}
      {view.lint.map((lint) => (
        <LintMark key={lint.id} lint={lint} k={k} />
      ))}
      {/* the outlined target slot of a grammar reorder, hair, under the drop line */}
      {view.dropSlot ? (
        <div className="ts-drop-slot" style={place(view.dropSlot, k)} aria-hidden="true" />
      ) : null}
      {/* crop mode (SPEC-2 6.1 row 19): the picture at its full extent, dimmed outside the frame */}
      {view.crop ? (
        <>
          <div className="ts-crop-full" style={place(view.crop.full, k)} aria-hidden="true" />
          <div className="ts-crop-frame" style={place(view.crop.frame, k)} aria-hidden="true" />
        </>
      ) : null}
      {/* the other objects of a multi-selection: each its own ink ring */}
      {view.extraBoxes.map((box, i) => (
        <div
          key={`extra:${i}`}
          className="ts-select is-selected is-extra"
          style={place(box, k)}
          aria-hidden="true"
        />
      ))}
      {view.selectionBox && !view.crop ? (
        rotated && ringBox && view.count === 1 ? (
          <div className="ts-turn" style={turnStyle} data-rotated="" aria-hidden="true">
            <div
              className={cn('ts-select', 'is-selected', view.editing && 'is-editing')}
              style={{ left: 0, top: 0, width: ringBox[2] * k, height: ringBox[3] * k }}
            />
            {frameEdges && chipHandle
              ? (Object.keys(frameEdges) as Array<keyof typeof frameEdges>).map((side) => (
                  <div
                    key={`frame:${side}`}
                    className="ts-frame-edge"
                    data-side={side}
                    style={frameEdges[side]}
                    onPointerDown={(e) => {
                      if (e.button === 0) view.onHandleDown(chipHandle, e.nativeEvent);
                    }}
                  />
                ))
              : null}
            {view.editing ? null : turning.map((handle) => handleButton(handle, true))}
          </div>
        ) : (
          <div
            className={cn('ts-select', 'is-selected', view.editing && 'is-editing')}
            style={place(view.selectionBox, k)}
            aria-hidden="true"
          />
        )
      ) : null}
      {/* the box around a multi-selection: hair, so the whole selection reads as one; a group's ring is a named group */}
      {view.groupBox ? (
        view.groupTag !== null ? (
          <div
            className="ts-group is-group"
            role="group"
            aria-label={`${CANVAS.group}: ${view.groupMembers.join(', ')}`}
            data-group={view.groupTag}
            style={place(view.groupBox, k)}
          />
        ) : (
          <div className="ts-group" style={place(view.groupBox, k)} aria-hidden="true" />
        )
      ) : null}
      {ringBox && chipText !== null && !view.crop ? (
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
      {view.crop && ringBox ? (
        <span className="ts-select-chip is-static is-crop" style={chipStyle(view.crop.frame, k)}>
          {CANVAS.crop}
        </span>
      ) : null}
      {readout !== null && ringBox ? (
        <span className="ts-readout" role="status" style={readoutStyle(ringBox, k)}>
          {readout}
        </span>
      ) : null}
      {frameEdges && chipHandle && !rotated
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
      {/* the snap guides of a canvas drag, titanium */}
      {view.guides.length > 0 ? <GuideLines guides={view.guides} k={k} /> : null}
      {view.marquee ? <MarqueeRect box={view.marquee} k={k} /> : null}
      {/* the connection sites of the shape under a dragged line end or an armed line tool (SPEC-2 6.2) */}
      {view.sites.map((site, i) => (
        <span
          key={`site:${i}`}
          className="ts-site"
          style={{ left: site.x * k, top: site.y * k }}
          aria-hidden="true"
        />
      ))}
      {/* the points a Curve or Polyline tool placed so far, joined by a hair path */}
      {view.drawPoints.length > 0 ? (
        <svg className="ts-draw-path" aria-hidden="true">
          <polyline
            points={view.drawPoints.map((p) => `${p.x * k},${p.y * k}`).join(' ')}
            fill="none"
          />
          {view.drawPoints.map((p, i) => (
            <circle key={`pt:${i}`} cx={p.x * k} cy={p.y * k} r={3} />
          ))}
        </svg>
      ) : null}
      {flat.map((handle) => handleButton(handle, false))}
      {!rotated || view.count !== 1 ? turning.map((handle) => handleButton(handle, false)) : null}
    </>
  );
}
