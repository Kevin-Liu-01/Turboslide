import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';

import type { EditorOverlayView, LintBox } from '@turboslide/viewer/Editor';
import type { Box, Handle } from '@turboslide/viewer/Gestures';

import { cn } from './lib/cn';

import './Overlay.css';

/**
 * The overlay over the stage in edit mode (SPEC 6.4), drawn from the boxes the viewer's Editor
 * measured, in the chrome's tokens: a --pt-hair outline under the pointer, the --pt-ink selection
 * ring with a 13px chip naming `type · id` outside it, the lint boxes of the slide while the lint
 * layer is on (severity 3 in ink, 1 and 2 in titanium, the rule id in the chip), the insertion
 * line of a block drag, and the handles of the direct manipulation table (the seam, the plate edge
 * and grip, the key edge, the shot edge and crop area, the pair figures, the scales markers). The
 * chip is the block's drag handle: dragging it reorders the block within its slot. Handles are
 * buttons, so the arrow keys nudge them (SPEC 6.4 keyboard nudges) and the window API can name
 * them by label or `data-control`. Line law (SPEC 2.2 junction table): every rule here is 1px, the
 * ring and an active handle draw ink as a state (.is-selected, .is-active), a resting handle draws
 * --pt-hair, and the sheet's blocks draw nothing. New in Turboslide; no Prototemplate source.
 */
export type OverlayProps = { view: EditorOverlayView };

/** A sheet box placed in CSS pixels. */
function place(box: Box, k: number): CSSProperties {
  return { left: box[0] * k, top: box[1] * k, width: box[2] * k, height: box[3] * k };
}

/** The chip's height plus its gap to the ring, in CSS pixels. */
const CHIP_H = 18;
const CHIP_GAP = 2;

/** The chip sits above the ring's top left corner, or under its bottom left when the ring meets the sheet's top. */
function chipStyle(box: Box, k: number): CSSProperties {
  const above = box[1] * k - CHIP_H - CHIP_GAP;
  return {
    left: box[0] * k,
    top: above >= 0 ? above : (box[1] + box[3]) * k + CHIP_GAP,
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

function nudgeDelta(e: ReactKeyboardEvent<HTMLElement>, handle: Handle): number | null {
  const big = e.shiftKey ? 10 : 1;
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
      return handle.shape === 'square' || handle.shape === 'area' ? 1 : null;
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

export function Overlay({ view }: OverlayProps) {
  const { k } = view;
  const chipHandle = view.handles.find((handle) => handle.shape === 'chip');
  const drawn = view.handles.filter((handle) => handle.shape !== 'chip');
  const onHandleKey = (e: ReactKeyboardEvent<HTMLButtonElement>, handle: Handle) => {
    const delta = nudgeDelta(e, handle);
    if (delta === null) return;
    e.preventDefault();
    e.stopPropagation();
    view.onHandleNudge(handle, delta);
  };
  return (
    <>
      {view.hover ? (
        <div className="ts-hover" style={place(view.hover, k)} aria-hidden="true" />
      ) : null}
      {view.lint.map((lint) => (
        <LintMark key={lint.id} lint={lint} k={k} />
      ))}
      {view.selectionBox ? (
        <div
          className={cn('ts-select', 'is-selected', view.editing && 'is-editing')}
          style={place(view.selectionBox, k)}
          aria-hidden="true"
        />
      ) : null}
      {view.selectionBox && view.chip !== null ? (
        chipHandle && !view.editing ? (
          <button
            type="button"
            className={cn('ts-select-chip', view.activeHandle === chipHandle.id && 'is-active')}
            style={chipStyle(view.selectionBox, k)}
            title={`${chipHandle.label} (drag to reorder)`}
            aria-label={chipHandle.label}
            data-control={chipHandle.control}
            onPointerDown={(e) => {
              if (e.button === 0) view.onHandleDown(chipHandle, e.nativeEvent);
            }}
            onKeyDown={(e) => onHandleKey(e, chipHandle)}
          >
            {view.chip}
          </button>
        ) : (
          <span className="ts-select-chip is-static" style={chipStyle(view.selectionBox, k)}>
            {view.chip}
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
      {drawn.map((handle) => (
        <button
          key={handle.id}
          type="button"
          className={cn(
            'ts-handle',
            handle.blockId !== undefined && 'is-selected',
            view.activeHandle === handle.id && 'is-active',
          )}
          data-kind={handle.kind}
          data-shape={handle.shape}
          style={handleStyle(handle, k)}
          title={handle.label}
          aria-label={handle.label}
          data-control={handle.control}
          onPointerDown={(e) => {
            if (e.button === 0) view.onHandleDown(handle, e.nativeEvent);
          }}
          onKeyDown={(e) => onHandleKey(e, handle)}
        />
      ))}
    </>
  );
}
