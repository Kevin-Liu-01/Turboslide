import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { MOTION_BASE_CSS } from '@turboslide/render/motion';

import { LiveClone } from '../LiveClone';
import type { PageSize, ViewerSlide } from '../model';
import type { Theme } from '../theme';
import { attachMotionLayer, MOTION_STYLE_ID, setMotionStyle } from './motionLayer';
import { PenLayer } from './SlideshowLayer';
import type { PresentPlatform } from './presentKeys';
import { presentKeyAction } from './presentKeys';
import {
  counterText,
  formatElapsed,
  isNotesFont,
  motionOf,
  NOTES_FONT,
  slideNumberOf,
  stepCount,
  stepCounterText,
  stepNotesFont,
  stepPlayIndex,
} from './presentModel';
import type { PresentMediaState, PresentStroke } from './presentSync';
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
 *
 * Round five (gslides-parity SPEC-5 2.2, 0.14; MILESTONES-5 B1 day 4): the counter carries
 * "Step 2 of 4" while the slide has click steps (`turboslide: true`); Next and Previous go through
 * `onNext` and `onPrevious` so the page's step model decides between a step and a slide; the
 * current frame shows the audience's step state through the motion layer over its clone (the
 * same class layer the show applies, no second render path); the next preview is the current
 * slide one step ahead while steps remain and the next slide at rest after; a row per playing
 * medium with Pause and Restart reads the `media` messages; the pen's strokes are mirrored over
 * the current frame.
 */
export type PresenterConsoleProps = {
  title: string;
  /** the play list: the deck's unskipped slides in order, each with its `motion` when it has one */
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
  /** the step the audience reached on the slide (SPEC-5 2.2); 0 when absent */
  step?: number;
  /** the step model's next and previous; `onGoto` by one slide when absent */
  onNext?: () => void;
  onPrevious?: () => void;
  /** the media playing in the show (R11 5.6) and the controls back to it */
  media?: readonly PresentMediaState[];
  onMediaControl?: (blockId: string, action: 'play' | 'pause' | 'restart') => void;
  /** the pen's strokes on the current slide, mirrored over the frame (SPEC-5 0.15) */
  strokes?: readonly PresentStroke[];
  /** the deck's page in sheet px (SPEC-5 6.1) */
  page?: PageSize;
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

/**
 * A clone of a slide with the motion layer settled at a step (SPEC-5 2.2): the same classes the
 * show applies, without animation, so the frame shows what the audience sees at that step, or
 * what the next click shows. A slide without motion is the plain clone.
 */
function MotionClone({
  slide,
  theme,
  step,
  page,
}: {
  slide: ViewerSlide;
  theme: Theme;
  step: number;
  page?: PageSize;
}) {
  const box = useRef<HTMLDivElement>(null);
  const schedule = motionOf(slide);
  useLayoutEffect(() => {
    const root = box.current?.querySelector<HTMLElement>('[data-slide]');
    if (!root || schedule === undefined) return;
    const layer = attachMotionLayer(root, schedule, { reduced: true });
    layer.mount();
    if (step >= 0) layer.seek(step);
    return () => layer.unmount();
  }, [slide.html, schedule, step]);
  return (
    <div
      ref={box}
      className="ts-presenter-clone"
      data-step={schedule === undefined ? undefined : step}
    >
      <LiveClone html={slide.html} theme={theme} page={page} />
    </div>
  );
}

function Preview({
  slide,
  theme,
  label,
  empty,
  step = -1,
  page,
}: {
  slide: ViewerSlide | undefined;
  theme: Theme;
  label: string;
  empty: string;
  /** the step the clone settles at; -1 is the mount state, the slide at rest for a still */
  step?: number;
  page?: PageSize;
}) {
  return (
    <figure className="ts-presenter-preview">
      <figcaption>{label}</figcaption>
      <div
        className="ts-presenter-frame is-small"
        data-slide-id={slide?.id}
        data-step={slide ? step : undefined}
      >
        {slide ? (
          <MotionClone slide={slide} theme={theme} step={step} page={page} />
        ) : (
          <span className="ts-presenter-empty">{empty}</span>
        )}
      </div>
    </figure>
  );
}

/** m:ss of a position or a length, for the media rows. */
function mediaClock(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '';
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
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
  step = 0,
  onNext,
  onPrevious,
  media = [],
  onMediaControl,
  strokes = [],
  page,
}: PresenterConsoleProps) {
  const total = slides.length;
  const at = Math.max(0, Math.min(total - 1, index));
  const current = slides[at];
  const previous = at > 0 ? slides[at - 1] : undefined;
  const next = at < total - 1 ? slides[at + 1] : undefined;
  const steps = stepCount(motionOf(current));
  const stepLine = stepCounterText(step, steps);
  /* the next preview: the current slide one step ahead while steps remain, else the next slide at rest */
  const previewStep = step < steps;

  /* the hidden rule the clones settle under (SPEC-5 2.2); the console never animates */
  useEffect(() => {
    setMotionStyle(document, MOTION_STYLE_ID, MOTION_BASE_CSS);
  }, []);
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

  const move = useCallback(
    (delta: number) => {
      if (delta > 0 && onNext) {
        onNext();
        return;
      }
      if (delta < 0 && onPrevious) {
        onPrevious();
        return;
      }
      const to = stepPlayIndex(at, delta, total);
      if (to !== at) onGoto(to);
    },
    [at, total, onGoto, onNext, onPrevious],
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
          move(1);
          return;
        case 'previous':
          event.preventDefault();
          move(-1);
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
  }, [listOpen, platform, move, total, onGoto, onSay]);

  const notes = current?.notes?.trim() ?? '';

  return (
    <div
      className="ts-presenter"
      data-control="presenter"
      data-index={at}
      data-total={total}
      data-step={step}
      data-steps={steps}
    >
      {strokes.length > 0 && current ? (
        <PenLayer
          slideId={current.id}
          strokes={strokes}
          active={false}
          sheetSelector=".ts-presenter-frame.is-current .ts-sheet.is-clone"
          page={page}
        />
      ) : null}
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
              disabled={at <= 0 && step <= 0}
              onClick={() => move(-1)}
              {...tip({ name: PRESENT_TEXT.previous, key: 'Left arrow' })}
            >
              <PresentIcon name="previous" icons={icons} />
            </button>
            <div className="ts-presenter-current">
              <div
                className="ts-presenter-frame is-current"
                data-slide-id={current?.id}
                data-step={current ? step : undefined}
                data-steps={current ? steps : undefined}
              >
                {current ? (
                  <MotionClone slide={current} theme={theme} step={step} page={page} />
                ) : null}
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
                  {stepLine !== '' ? (
                    <span className="ts-presenter-stepline" data-control="presenter.step">
                      {stepLine}
                    </span>
                  ) : null}
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
              disabled={at >= total - 1 && step >= steps}
              onClick={() => move(1)}
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
              step={stepCount(motionOf(previous))}
              page={page}
            />
            {previewStep && current ? (
              <Preview
                slide={current}
                theme={theme}
                label={PRESENT_TEXT.nextStepPreview}
                empty={PRESENT_TEXT.endOfShow}
                step={step + 1}
                page={page}
              />
            ) : (
              <Preview
                slide={next}
                theme={theme}
                label={PRESENT_TEXT.nextSlide}
                empty={PRESENT_TEXT.endOfShow}
                step={-1}
                page={page}
              />
            )}
          </div>
          {media.length > 0 ? (
            <ul
              className="ts-presenter-media"
              data-control="presenter.media"
              aria-label={PRESENT_TEXT.playing}
            >
              {media.map((row) => (
                <li
                  key={row.blockId}
                  className="ts-presenter-media-row"
                  data-block={row.blockId}
                  data-state={row.state}
                >
                  <span className="ts-presenter-media-title">
                    {row.state === 'playing' ? `${PRESENT_TEXT.playing}: ` : ''}
                    {row.title ?? row.blockId}
                  </span>
                  <span className="ts-presenter-media-time">
                    {mediaClock(row.positionMs)}
                    {row.durationMs !== null ? ` / ${mediaClock(row.durationMs)}` : ''}
                  </span>
                  <button
                    type="button"
                    className="ts-presenter-text-btn"
                    data-control={`presenter.media.${row.blockId}.${row.state === 'playing' ? 'pause' : 'play'}`}
                    onClick={() =>
                      onMediaControl?.(row.blockId, row.state === 'playing' ? 'pause' : 'play')
                    }
                    {...tip({
                      name:
                        row.state === 'playing' ? PRESENT_TEXT.mediaPause : PRESENT_TEXT.mediaPlay,
                      doc: 'In the slideshow window',
                    })}
                  >
                    {row.state === 'playing' ? PRESENT_TEXT.mediaPause : PRESENT_TEXT.mediaPlay}
                  </button>
                  <button
                    type="button"
                    className="ts-presenter-text-btn"
                    data-control={`presenter.media.${row.blockId}.restart`}
                    onClick={() => onMediaControl?.(row.blockId, 'restart')}
                    {...tip({
                      name: PRESENT_TEXT.mediaRestart,
                      doc: 'From the start, in the slideshow window',
                    })}
                  >
                    {PRESENT_TEXT.mediaRestart}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
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
