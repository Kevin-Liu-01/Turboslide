import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { Correction, Preferences } from '@turboslide/schema/preferences';
import { applyCorrection, autocorrect, isTriggerKey } from '@turboslide/schema/preferences';

import { DictateBox } from './DictateBox';
import type { RecognitionCtor } from './DictateBox';
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

export type NotesPaneProps = {
  /** the current slide's notes; the pane shows the slide's own text on every slide change */
  slideId: string;
  notes: string;
  /** one write per 400 ms pause since the last keystroke, and on blur and slide change: `slide.set /notes` */
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
  /** the deck's language (gslides-parity SPEC-5 7.1): the field's `lang`, the quote style, the dictation default */
  language?: string;
  /** the caller's preferences: the autocorrect rules run on the trigger keys (SPEC-5 7.1; R10 1.4) */
  preferences?: Preferences;
  /** Tools > Dictate speaker notes (SPEC-5 7.3): the box floats over the pane while open */
  dictate?: {
    open: boolean;
    onClose: () => void;
    /** `preferences.dictation.lang` */
    preferred?: string;
    onLanguage?: (lang: string) => void;
    /** the recognition constructor; the page's when absent (the tests inject a fake) */
    ctor?: RecognitionCtor | null;
  };
};

/** How long after a correction a Backspace reverts it alone (R10 1.4; G11). */
export const NOTES_REVERT_MS = 2000;

export type NotesCorrection = {
  value: string;
  caret: number;
  correction: Correction;
  /** the plain text the correction replaced, for the Backspace revert */
  from: string;
  /** the offset in the whole value */
  at: number;
};

/**
 * The autocorrect engine over the notes textarea (pure): the paragraph around the caret, the
 * trigger key about to land, the record's rules; the corrected value with the caret moved, or
 * null. A list correction never applies to the notes (plain text has no list marker).
 */
export function notesCorrection(
  value: string,
  caret: number,
  key: string,
  preferences: Preferences,
  language: string,
): NotesCorrection | null {
  if (!isTriggerKey(key)) return null;
  const start = value.lastIndexOf('\n', caret - 1) + 1;
  const end = value.indexOf('\n', caret);
  const paragraph = value.slice(start, end < 0 ? value.length : end);
  const correction = autocorrect(paragraph, caret - start, key, preferences, language, {
    listable: false,
    exceptions: preferences.spelling.dictionary,
  });
  if (correction === null || correction.link !== undefined || correction.list !== undefined)
    return null;
  const next = applyCorrection(paragraph, correction);
  const at = start + correction.at;
  const from = paragraph.slice(correction.at, correction.at + correction.remove);
  const shift = correction.insert.length - correction.remove;
  return {
    value: value.slice(0, start) + next + value.slice(end < 0 ? value.length : end),
    caret: caret + shift,
    correction,
    from,
    at,
  };
}

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
  language = 'en-US',
  preferences,
  dictate,
}: NotesPaneProps) {
  const [draft, setDraft] = useState(notes);
  const field = useRef<HTMLTextAreaElement>(null);
  const timer = useRef(0);
  const committed = useRef(notes);
  const callbacks = useRef({ onCommit, onHeightChange });
  callbacks.current = { onCommit, onHeightChange };
  const shownSlide = useRef(slideId);
  /* the last autocorrection, for the Backspace revert within 2 s (R10 1.4) */
  const lastCorrection = useRef<(NotesCorrection & { time: number }) | null>(null);

  /* a slide change: whatever was typed on the slide before is written now, and the new slide's
     notes fill the field */
  useLayoutEffect(() => {
    if (shownSlide.current !== slideId) {
      window.clearTimeout(timer.current);
      if (draft !== committed.current) callbacks.current.onCommit(draft);
      shownSlide.current = slideId;
    }
    committed.current = notes;
    setDraft(notes);
    // the draft is the field's own state; the effect reads it on the slide change only
  }, [slideId, notes]);

  const flush = () => {
    window.clearTimeout(timer.current);
    timer.current = 0;
    const text = field.current?.value ?? draft;
    if (text === committed.current) return;
    committed.current = text;
    callbacks.current.onCommit(text);
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);

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
    setDraft(value);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, NOTES_BURST_MS);
  };

  /** Writes a value into the field and the draft with the caret placed, then schedules the write. */
  const setValue = (value: string, caret: number) => {
    const element = field.current;
    setDraft(value);
    if (element !== null) {
      element.value = value;
      element.setSelectionRange(caret, caret);
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, NOTES_BURST_MS);
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
    if (readOnly || event.metaKey || event.ctrlKey || event.altKey) return;
    const element = event.currentTarget;
    /* Backspace right after a correction reverts the correction alone (G11) */
    if (event.key === 'Backspace' && lastCorrection.current !== null) {
      const last = lastCorrection.current;
      lastCorrection.current = null;
      if (Date.now() - last.time <= NOTES_REVERT_MS && element.value === last.value) {
        event.preventDefault();
        const restored =
          last.value.slice(0, last.at) +
          last.from +
          last.value.slice(last.at + last.correction.insert.length);
        flush();
        setValue(restored, last.at + last.from.length);
        flush();
        return;
      }
    }
    if (preferences === undefined || !isTriggerKey(event.key)) return;
    if (element.selectionStart !== element.selectionEnd) return;
    const caret = element.selectionStart;
    const result = notesCorrection(
      element.value,
      caret,
      event.key === 'Enter' ? '\n' : event.key,
      preferences,
      language,
    );
    if (result === null) return;
    /* the typed word travels as its own write, then the correction as its own, so undo reverts
       the correction alone (R10 1.4) */
    flush();
    if (result.correction.consumesTrigger === true) event.preventDefault();
    setValue(result.value, result.caret);
    flush();
    lastCorrection.current = { ...result, time: Date.now() };
  };

  /** A dictated result lands at the caret with a leading space and travels as typing does (SPEC-5 7.3). */
  const appendDictated = (text: string) => {
    const element = field.current;
    const current = element?.value ?? draft;
    const caret = element?.selectionStart ?? current.length;
    const lead = caret > 0 && !/\s$/u.test(current.slice(0, caret)) ? ' ' : '';
    const insert = `${lead}${text.trim()}`;
    setValue(current.slice(0, caret) + insert + current.slice(caret), caret + insert.length);
  };

  /* the handle: drag resizes between 0 and 40 percent of the window; double click toggles */
  const onHandleDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = height;
    const viewport = windowHeight ?? window.innerHeight;
    const move = (ev: PointerEvent) => {
      callbacks.current.onHeightChange(
        clampNotesHeight(startHeight + (startY - ev.clientY), viewport),
      );
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
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
          lang={language}
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
      {dictate?.open === true && !hidden && !readOnly ? (
        <DictateBox
          language={language}
          preferred={dictate.preferred}
          onLanguage={dictate.onLanguage}
          onFinal={appendDictated}
          onClose={dictate.onClose}
          ctor={dictate.ctor}
        />
      ) : null}
    </div>
  );
}
