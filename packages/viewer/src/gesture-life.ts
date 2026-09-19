// The life of one pointer gesture on the stage (build-4/hotfix-4.md cause W1): what the overlay
// shows while a handle is down, and the events that end it. The Editor keeps one of these per
// gesture and steps it on every event; the overlay's readouts read from it, so the size or the
// angle can be shown only between the press and the end of the same gesture. Kevin's report of
// 2026-09-14 (a stale "536 × 343" beside the title) came from a release that cleared the readout
// and set it again while computing the release's mutations; with the readout owned here, no
// release, no cancel, no lost capture, no blur and no Escape can leave a readout behind, and the
// selection that follows starts from the idle state. Framework free, no DOM.

/** What the overlay shows while a resize, a rotation or a table column seam is down; null shows nothing. */
export type GestureReadout =
  | { kind: 'angle'; value: number }
  | { kind: 'size'; w: number; h: number }
  /* the moved column's width while a table's column seam drags (docs/RETURN.md 2.4 fix 5) */
  | { kind: 'width'; value: number }
  | null;

/**
 * The events that end a gesture, whatever the handle kind: the pointer's release, the browser's
 * cancel (a touch turned into a scroll, a system gesture), the element losing its pointer capture,
 * the window losing focus mid drag, and Escape.
 */
export const GESTURE_END_EVENTS = [
  'pointerup',
  'pointercancel',
  'lostpointercapture',
  'blur',
  'escape',
] as const;
export type GestureEnd = (typeof GESTURE_END_EVENTS)[number];

export type GestureLife = {
  /** true between the press and the end event */
  down: boolean;
  /** the readout the last pointer move computed; always null while up */
  readout: GestureReadout;
};

export const GESTURE_IDLE: GestureLife = { down: false, readout: null };

export type GestureLifeEvent =
  | { type: 'down' }
  | { type: 'move'; readout: GestureReadout }
  | { type: GestureEnd }
  /** the selection changed (a click elsewhere, Tab, a chip): nothing of a past gesture survives */
  | { type: 'select' };

/**
 * The next state. A press starts a gesture with no readout; a move while down shows the readout
 * that move computed; every end event and a selection change return to idle, and a move that
 * arrives after the end (a late event, a stale listener) never revives a readout.
 */
export function gestureLife(state: GestureLife, event: GestureLifeEvent): GestureLife {
  switch (event.type) {
    case 'down':
      return { down: true, readout: null };
    case 'move':
      return state.down ? { down: true, readout: event.readout } : GESTURE_IDLE;
    default:
      return GESTURE_IDLE;
  }
}
