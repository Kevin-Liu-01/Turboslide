import { useCallback, useEffect, useRef, useState } from 'react';

import { LiveClone } from '../LiveClone';
import type { ViewerSlide } from '../model';
import type { Theme } from '../theme';
import type { PresentPlatform } from './presentKeys';
import { presentKeyAction } from './presentKeys';
import {
  counterText,
  formatElapsed,
  isNotesFont,
  NOTES_FONT,
  slideNumberOf,
  stepNotesFont,
  stepPlayIndex,
} from './presentModel';
import { SlideList } from './SlideList';
import { PRESENT_TEXT } from './strings';
import { defaultTip, isControlTarget, isEditableTarget, PresentIcon } from './ui';
import type { PresentIcons, PresentTip } from './ui';

import './PresenterConsole.css';

/**
 * The presenter console (gslides-parity SPEC 9.3; R04 A4; docs/spec/SPEC.md 6.10), the body of
 * `/present/:deckId`: a timer top left with Pause and Reset, the clock, the current slide with a
 * slide list dropdown and Previous and Next buttons, the previous and next slides at 0.3 scale,
 * the speaker notes with plus and minus text size buttons (14 to 28 px) and "No speaker notes for
 * this slide" when empty, and an Audience tools tab present and disabled. The console draws
 * stored frames through live clones; live shaders do not run here. Arrow keys, Space, the page
 * keys, Home, End and a number then Enter move the show; the route around the console publishes
 * every move to the slideshow window and feeds the audience's moves back in through `index`.
 */
export type PresenterConsoleProps = {
  title: string;
  /** the play list: the deck's unskipped slides in order */
  slides: readonly ViewerSlide[];
  index: number;
  theme: Theme;
  /** a slideshow window answered on the channel */
  connected: boolean;
  platform: PresentPlatform;
  onGoto: (index: number) => void;
  /** a toast for the digit jump; the console has no toast of its own */
  onSay?: (message: string) => void;
  icons?: PresentIcons;
  tip?: PresentTip;
};

const NOTES_SIZE_KEY = 'turboslide:presenter:notes-size';
const TICK_MS = 250;
const CLOCK_MS = 15_000;
const DIGIT_HOLD_MS = 1500;

function readNotesSize(): number {
  try {
    const stored = JSON.parse(localStorage.getItem(NOTES_SIZE_KEY) ?? 'null') as unknown;
    return isNotesFont(stored) ? stored : NOTES_FONT.initial;
  } catch {
    return NOTES_FONT.initial;
  }
}

function storeNotesSize(size: number): void {
  try {
    localStorage.setItem(NOTES_SIZE_KEY, String(size));
  } catch {
    // private mode: the size holds for the window
  }
}

/** The elapsed timer: counts up from the console's open, pauses and resets (R04 A4). */
function useElapsed(): {
  elapsedMs: number;
  running: boolean;
  toggle: () => void;
  reset: () => void;
} {
  const [running, setRunning] = useState(true);
  const [elapsedMs, setElapsed] = useState(0);
  const base = useRef(0);
  const startedAt = useRef<number | null>(Date.now());

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const started = startedAt.current;
      setElapsed(base.current + (started === null ? 0 : Date.now() - started));
    };
    tick();
    const timer = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(timer);
  }, [running]);

  const toggle = useCallback(() => {
    const now = Date.now();
    if (startedAt.current !== null) {
      base.current += now - startedAt.current;
      startedAt.current = null;
      setElapsed(base.current);
      setRunning(false);
    } else {
      startedAt.current = now;
      setRunning(true);
    }
  }, []);

  const reset = useCallback(() => {
    base.current = 0;
    if (startedAt.current !== null) startedAt.current = Date.now();
    setElapsed(0);
  }, []);

  return { elapsedMs, running, toggle, reset };
}

function useClock(): string {
  const read = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const [time, setTime] = useState(read);
  useEffect(() => {
    const timer = window.setInterval(() => setTime(read()), CLOCK_MS);
    return () => window.clearInterval(timer);
  }, []);
  return time;
}

function Preview({
  slide,
  theme,
  label,
  empty,
}: {
  slide: ViewerSlide | undefined;
  theme: Theme;
  label: string;
  empty: string;
}) {
  return (
    <figure className="ts-presenter-preview">
      <figcaption>{label}</figcaption>
      <div className="ts-presenter-frame is-small" data-slide-id={slide?.id}>
        {slide ? (
          <LiveClone html={slide.html} theme={theme} />
        ) : (
          <span className="ts-presenter-empty">{empty}</span>
        )}
      </div>
    </figure>
  );
}

export function PresenterConsole({
  title,
  slides,
  index,
  theme,
  connected,
  platform,
  onGoto,
  onSay,
  icons,
  tip = defaultTip,
}: PresenterConsoleProps) {
  const total = slides.length;
  const at = Math.max(0, Math.min(total - 1, index));
  const current = slides[at];
  const previous = at > 0 ? slides[at - 1] : undefined;
  const next = at < total - 1 ? slides[at + 1] : undefined;
  const timer = useElapsed();
  const clock = useClock();
  const [notesSize, setNotesSize] = useState<number>(NOTES_FONT.initial);
  const [listOpen, setListOpen] = useState(false);
  const listButton = useRef<HTMLButtonElement>(null);
  const digits = useRef('');
  const digitTimer = useRef(0);

  useEffect(() => {
    setNotesSize(readNotesSize());
  }, []);

  const step = useCallback(
    (delta: number) => {
      const to = stepPlayIndex(at, delta, total);
      if (to !== at) onGoto(to);
    },
    [at, total, onGoto],
  );

  const stepNotes = (direction: -1 | 1) => {
    const size = stepNotesFont(notesSize, direction);
    setNotesSize(size);
    storeNotesSize(size);
  };

  const closeList = useCallback(() => {
    setListOpen(false);
    listButton.current?.focus();
  }, []);

  /* the keys of the show that move it, read on the document so the console needs no focus */
  useEffect(() => {
    const clearDigits = () => {
      digits.current = '';
      window.clearTimeout(digitTimer.current);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (listOpen) return;
      const action = presentKeyAction(event, {
        blank: null,
        digits: digits.current !== '',
        control: isControlTarget(event.target),
        editable: isEditableTarget(event.target),
        platform,
      });
      if (action === null) return;
      switch (action.type) {
        case 'next':
          event.preventDefault();
          step(1);
          return;
        case 'previous':
          event.preventDefault();
          step(-1);
          return;
        case 'first':
          event.preventDefault();
          if (total > 0) onGoto(0);
          return;
        case 'last':
          event.preventDefault();
          if (total > 0) onGoto(total - 1);
          return;
        case 'digit':
          event.preventDefault();
          digits.current += action.digit;
          window.clearTimeout(digitTimer.current);
          digitTimer.current = window.setTimeout(clearDigits, DIGIT_HOLD_MS);
          onSay?.(PRESENT_TEXT.slideNumber(digits.current));
          return;
        case 'go': {
          event.preventDefault();
          const typed = digits.current;
          clearDigits();
          const n = slideNumberOf(typed, total);
          if (n === null) onSay?.(PRESENT_TEXT.noSlide(Number.parseInt(typed, 10)));
          else onGoto(n - 1);
          return;
        }
        default:
          /* the console has no blank slides, laser or exit of its own; those keys stay inert here */
          return;
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.clearTimeout(digitTimer.current);
    };
  }, [listOpen, platform, step, total, onGoto, onSay]);

  const notes = current?.notes?.trim() ?? '';

  return (
    <div className="ts-presenter" data-control="presenter" data-index={at} data-total={total}>
      <header className="ts-presenter-head">
        <div className="ts-presenter-timer" data-control="presenter.timer">
          <span className="ts-presenter-label">{PRESENT_TEXT.timer}</span>
          <output className="ts-presenter-elapsed" data-control="presenter.elapsed" aria-live="off">
            {formatElapsed(timer.elapsedMs)}
          </output>
          <button
            type="button"
            className="ts-presenter-text-btn"
            data-control="presenter.pause"
            aria-pressed={!timer.running}
            onClick={timer.toggle}
            {...tip({
              name: timer.running ? PRESENT_TEXT.pause : PRESENT_TEXT.resume,
              doc: 'Holds the timer where it is; the show keeps going',
            })}
          >
            {timer.running ? PRESENT_TEXT.pause : PRESENT_TEXT.resume}
          </button>
          <button
            type="button"
            className="ts-presenter-text-btn"
            data-control="presenter.reset"
            onClick={timer.reset}
            {...tip({ name: PRESENT_TEXT.reset, doc: 'Starts the timer again from zero' })}
          >
            {PRESENT_TEXT.reset}
          </button>
        </div>
        <h1 className="ts-presenter-title">{title}</h1>
        <div className="ts-presenter-facts">
          <span
            className={connected ? 'ts-presenter-link is-on' : 'ts-presenter-link'}
            data-control="presenter.connection"
            data-connected={connected}
            role="status"
          >
            {connected ? PRESENT_TEXT.connected : PRESENT_TEXT.disconnected}
          </span>
          <span className="ts-presenter-clock" data-control="presenter.clock">
            <span className="ts-presenter-label">{PRESENT_TEXT.clock}</span> {clock}
          </span>
        </div>
      </header>

      <div className="ts-presenter-body">
        <section className="ts-presenter-stage" aria-label={PRESENT_TEXT.currentSlide}>
          <div className="ts-presenter-row">
            <button
              type="button"
              className="ts-presenter-step"
              data-control="presenter.previous"
              aria-label={PRESENT_TEXT.previous}
              disabled={at <= 0}
              onClick={() => step(-1)}
              {...tip({ name: PRESENT_TEXT.previous, key: 'Left arrow' })}
            >
              <PresentIcon name="previous" icons={icons} />
            </button>
            <div className="ts-presenter-current">
              <div className="ts-presenter-frame is-current" data-slide-id={current?.id}>
                {current ? <LiveClone html={current.html} theme={theme} /> : null}
              </div>
              <div className="ts-presenter-pick">
                <button
                  ref={listButton}
                  type="button"
                  className={listOpen ? 'ts-presenter-counter is-on' : 'ts-presenter-counter'}
                  data-control="presenter.counter"
                  aria-haspopup="listbox"
                  aria-expanded={listOpen}
                  aria-controls="ts-presenter-list"
                  onClick={() => setListOpen((open) => !open)}
                  {...tip({
                    name: PRESENT_TEXT.slideList,
                    doc: 'The slide number and title; opens the list of slides to jump to one',
                  })}
                >
                  <b>{counterText(at, total)}</b>
                  <span className="ts-presenter-counter-title">{current?.title ?? ''}</span>
                  <span className="ts-presenter-caret" aria-hidden="true">
                    ▾
                  </span>
                </button>
                {listOpen ? (
                  <SlideList
                    id="ts-presenter-list"
                    slides={slides}
                    index={at}
                    theme={theme}
                    placement="down"
                    onSelect={(to) => {
                      closeList();
                      onGoto(to);
                    }}
                    onClose={closeList}
                  />
                ) : null}
              </div>
            </div>
            <button
              type="button"
              className="ts-presenter-step"
              data-control="presenter.next"
              aria-label={PRESENT_TEXT.next}
              disabled={at >= total - 1}
              onClick={() => step(1)}
              {...tip({ name: PRESENT_TEXT.next, key: 'Right arrow' })}
            >
              <PresentIcon name="next" icons={icons} />
            </button>
          </div>
          <div className="ts-presenter-previews">
            <Preview
              slide={previous}
              theme={theme}
              label={PRESENT_TEXT.previousSlide}
              empty={PRESENT_TEXT.startOfShow}
            />
            <Preview
              slide={next}
              theme={theme}
              label={PRESENT_TEXT.nextSlide}
              empty={PRESENT_TEXT.endOfShow}
            />
          </div>
        </section>

        <aside className="ts-presenter-side">
          <div className="ts-presenter-tabs" role="tablist" aria-label={PRESENT_TEXT.notes}>
            <button
              type="button"
              role="tab"
              id="ts-presenter-tab-notes"
              className="ts-presenter-tab is-on"
              aria-selected="true"
              aria-controls="ts-presenter-notes"
              data-control="presenter.tab.notes"
              {...tip({ name: PRESENT_TEXT.notes, doc: 'The notes typed under the slide' })}
            >
              {PRESENT_TEXT.notes}
            </button>
            <button
              type="button"
              role="tab"
              id="ts-presenter-tab-audience"
              className="ts-presenter-tab is-disabled"
              aria-selected="false"
              aria-disabled="true"
              tabIndex={0}
              data-control="presenter.tab.audience"
              {...tip({ name: PRESENT_TEXT.audienceTools, doc: PRESENT_TEXT.audienceToolsStub })}
            >
              {PRESENT_TEXT.audienceTools}
            </button>
          </div>
          <div
            id="ts-presenter-notes"
            role="tabpanel"
            aria-labelledby="ts-presenter-tab-notes"
            className="ts-presenter-notes"
          >
            <div className="ts-presenter-notes-tools">
              <button
                type="button"
                className="ts-presenter-size"
                data-control="presenter.notesSmaller"
                aria-label={PRESENT_TEXT.notesSmaller}
                disabled={notesSize <= NOTES_FONT.min}
                onClick={() => stepNotes(-1)}
                {...tip({ name: PRESENT_TEXT.notesSmaller })}
              >
                <PresentIcon name="minus" icons={icons} />
              </button>
              <output className="ts-presenter-size-readout" data-control="presenter.notesSize">
                {notesSize} px
              </output>
              <button
                type="button"
                className="ts-presenter-size"
                data-control="presenter.notesLarger"
                aria-label={PRESENT_TEXT.notesLarger}
                disabled={notesSize >= NOTES_FONT.max}
                onClick={() => stepNotes(1)}
                {...tip({ name: PRESENT_TEXT.notesLarger })}
              >
                <PresentIcon name="plus" icons={icons} />
              </button>
            </div>
            {notes === '' ? (
              <p
                className="ts-presenter-notes-empty"
                data-control="presenter.notesText"
                style={{ fontSize: `${notesSize}px` }}
              >
                {PRESENT_TEXT.noNotes}
              </p>
            ) : (
              <div
                className="ts-presenter-notes-text"
                data-control="presenter.notesText"
                style={{ fontSize: `${notesSize}px` }}
              >
                {notes}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
