import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { createFrameCoalescer } from '@turboslide/viewer/gesture-frame';

import { PROMPTS } from './menus/strings.ts';
import { hideTooltip, tipProps } from './Tooltip';

import './NotesPane.css';

/** The pane's default height (SPEC 1.2 --pt-notes-h) and the share of the window it may take. */
export const NOTES_DEFAULT_HEIGHT = 64;
export const NOTES_MAX_SHARE = 0.4;
/** The pause after the last keystroke before the notes are one write (gslides-parity SPEC 7.2.15). */
export const NOTES_BURST_MS = 400;
/** A drag below this height hides the pane (SPEC 8: drag to the bottom to hide). */
const HIDE_BELOW_PX = 16;

/* the panes holding typed notes their 400 ms timer has not written yet, each with the flush that
   writes them now. A pane joins on a keystroke and leaves when its draft is written or it
   unmounts. The page counts them in its leave warning and writes them on `pagehide` and when the
   tab turns hidden (apps/studio/src/editor/leave-warning.ts), as it does InlineText's bursts */
const heldNoteFlushes = new Set<() => void>();

/** How many notes panes hold typed notes their timer has not written yet. */
export function heldNotes(): number {
  return heldNoteFlushes.size;
}

/** Writes every held notes draft now, through each pane's own commit. */
export function flushHeldNotes(): void {
  for (const flush of [...heldNoteFlushes]) flush();
}

export type NotesPaneProps = {
  /** the current slide's notes; the pane shows the slide's own text on every slide change */
  slideId: string;
  notes: string;
  /**
   * one write per 400 ms pause since the last keystroke, and on blur, slide change, unmount and
   * the page's flushHeldNotes: `slide.set /notes`. The draft of a slide reaches the callback of a
   * render that showed that slide, so a callback may bind its render's slide
   */
  onCommit: (notes: string) => void;
  /** the pane's height in CSS pixels; 0 hides it. The page keeps it (View > Show speaker notes) */
  height: number;
  onHeightChange: (height: number) => void;
  /** the window height the 40 percent cap reads; window.innerHeight when absent */
  windowHeight?: number;
  /** Cmd Option Shift S focuses the pane from anywhere (SPEC 8); on by default */
  bindKey?: boolean;
  /** a disabled pane (Viewing mode) shows the notes and takes no input */
  readOnly?: boolean;
};

/** The height a drag lands on: clamped to the window's share, or 0 when dragged to the bottom (pure; NotesPane.test.tsx pins it). */
export function clampNotesHeight(height: number, windowHeight: number): number {
  if (height < HIDE_BELOW_PX) return 0;
  return Math.min(Math.round(height), Math.round(windowHeight * NOTES_MAX_SHARE));
}

/**
 * The speaker notes pane under the canvas (gslides-parity SPEC 8, 1.1): a textarea bound to
 * `slide.notes` with the placeholder "Click to add speaker notes", one `slide.set /notes` per
 * 400 ms pause so undo removes a burst of typing, a three dot handle on the divider that drags the
 * height between 0 and 40 percent of the window (double click toggles the default height, a drag
 * to the bottom hides), Cmd Option Shift S to focus it, `spellcheck` on. The field and the
 * handle both carry the chrome's tooltip (Tooltip.tsx tipProps) with the name and the key, so
 * the tooltip audit finds no bare control here; the field's plate shows on a keyboard focus and
 * leaves at the first keystroke. Plain text with line breaks this round; nothing greys in the
 * pane. The right-click menu is the browser's own (SPEC
 * 4.3). New in Turboslide (no Prototemplate source).
 */
export function NotesPane({
  slideId,
  notes,
  onCommit,
  height,
  onHeightChange,
  windowHeight,
  bindKey = true,
  readOnly = false,
}: NotesPaneProps) {
  const [draft, setDraft] = useState(notes);
  const field = useRef<HTMLTextAreaElement>(null);
  const timer = useRef(0);
  /* the field's text as last typed or shown, and the text last written or received */
  const typed = useRef(notes);
  const committed = useRef(notes);
  /* the callbacks of the last committed render, so they belong to the slide in `shownSlide` until
     the slide change below has written that slide's draft */
  const callbacks = useRef({ onCommit, onHeightChange });
  const shownSlide = useRef(slideId);

  /* writes the held draft now through the shown slide's callback and leaves the held set; stable,
     since it reads refs alone */
  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = 0;
    heldNoteFlushes.delete(flush);
    const text = typed.current;
    if (text === committed.current) return;
    committed.current = text;
    callbacks.current.onCommit(text);
  }, []);

  /* a slide change: whatever was typed on the slide before is written now, through that slide's
     callback, and the new slide's notes fill the field */
  useLayoutEffect(() => {
    if (shownSlide.current !== slideId) {
      flush();
      shownSlide.current = slideId;
    }
    typed.current = notes;
    committed.current = notes;
    setDraft(notes);
  }, [slideId, notes, flush]);

  /* after the slide change above, so it reads the callbacks of the slide being left */
  useLayoutEffect(() => {
    callbacks.current = { onCommit, onHeightChange };
  });

  /* an unmount writes the held draft (the pane leaves with the editor or the last slide) */
  useEffect(() => flush, [flush]);

  /* Cmd Option Shift S (Google's "Open speaker notes panel") focuses the pane from anywhere */
  useEffect(() => {
    if (!bindKey) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.altKey || !event.shiftKey) return;
      if (event.key.toLowerCase() !== 's' && event.code !== 'KeyS') return;
      event.preventDefault();
      if (height === 0) callbacks.current.onHeightChange(NOTES_DEFAULT_HEIGHT);
      window.setTimeout(() => field.current?.focus(), 0);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bindKey, height]);

  const onChange = (value: string) => {
    typed.current = value;
    setDraft(value);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, NOTES_BURST_MS);
    heldNoteFlushes.add(flush);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      flush();
      event.currentTarget.blur();
    }
    /* the page's undo must not fire on the field's own text; the browser's undo runs here */
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z')
      event.stopPropagation();
  };

  /* the handle: drag resizes between 0 and 40 percent of the window; double click toggles. The
     page keeps the height as a state of the whole editor, so the drag sends one height per
     animation frame (the last pointer position of the frame), the release's own height, and on a
     cancelled pointer (the system took it) the last height the drag showed */
  const onHandleDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = height;
    const viewport = windowHeight ?? window.innerHeight;
    const heightAt = (y: number) => clampNotesHeight(startHeight + (startY - y), viewport);
    const frame = createFrameCoalescer({
      request: (callback) => window.requestAnimationFrame(callback),
      cancel: (handle) => window.cancelAnimationFrame(handle),
    });
    let sent = startHeight;
    let latest = startHeight;
    const send = (next: number) => {
      if (next === sent) return;
      sent = next;
      callbacks.current.onHeightChange(next);
    };
    const move = (ev: PointerEvent) => {
      latest = heightAt(ev.clientY);
      const next = latest;
      frame.push(() => send(next));
    };
    const end = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      frame.cancel();
      send(ev.type === 'pointerup' ? heightAt(ev.clientY) : latest);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  const onHandleKey = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const viewport = windowHeight ?? window.innerHeight;
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const step = event.shiftKey ? 40 : 8;
      onHeightChange(clampNotesHeight(height + (event.key === 'ArrowUp' ? step : -step), viewport));
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onHeightChange(height === 0 ? NOTES_DEFAULT_HEIGHT : 0);
    }
  };

  const hidden = height <= 0;
  const handleTip = tipProps({
    name: 'Speaker notes',
    doc: 'Drag to resize the notes, double click for the default height; drag to the bottom to hide them.',
    key: 'Cmd Option Shift S',
  });
  const fieldTip = tipProps({
    name: 'Speaker notes',
    doc: 'Notes for the presenter, shown in presenter view and never on the slide.',
    key: 'Cmd Option Shift S',
  });
  return (
    <div
      className={hidden ? 'ts-notes is-hidden' : 'ts-notes'}
      data-control="notes"
      style={{ height: hidden ? 0 : height }}
    >
      <button
        type="button"
        className="ts-notes-handle"
        aria-label="Resize speaker notes"
        data-control="notes.handle"
        {...handleTip}
        onPointerDown={onHandleDown}
        onDoubleClick={() =>
          onHeightChange(height === NOTES_DEFAULT_HEIGHT ? 0 : NOTES_DEFAULT_HEIGHT)
        }
        onKeyDown={(event) => {
          handleTip.onKeyDown(event);
          onHandleKey(event);
        }}
      >
        <span className="ts-notes-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </button>
      {hidden ? null : (
        <textarea
          ref={field}
          className="ts-notes-field"
          value={draft}
          placeholder={PROMPTS.notes}
          aria-label="Speaker notes"
          data-control="notes.text"
          spellCheck
          readOnly={readOnly}
          {...fieldTip}
          onChange={(event) => onChange(event.target.value)}
          onBlur={(event) => {
            fieldTip.onBlur(event);
            flush();
          }}
          onKeyDown={(event) => {
            fieldTip.onKeyDown(event);
            /* the plate shows on a keyboard focus and leaves at the first keystroke, so it never
               sits over the canvas while the notes are typed */
            hideTooltip(event.currentTarget);
            onKeyDown(event);
          }}
        />
      )}
    </div>
  );
}
