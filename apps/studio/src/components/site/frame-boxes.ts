import { TRY_CHAPTER, TRY_FRAME_SRC, TRY_PRESS, TRY_VISIBLE, isTryReady } from './try-frame';
import type { TryPressed } from './try-frame';

/** What the title does with a press: the hero hands it to the live editor (`attachHeroBox`). */
export type OnPress = (who: TryPressed) => void;

/** The longest the frame waits for an idle moment after `load` (the old landing's live import rule). */
const IDLE_CAP_MS = 1500;
/** The frame's fade in; the poster leaves after it. */
const FADE_MS = 150;

/**
 * How far outside the window a chapter's editor starts loading: a little ahead of the reader, so
 * it is mostly ready on arrival while the section after it waits.
 */
const LOAD_MARGIN = '40% 0px';
/** How far outside the window it may go before it unloads, so few editors are alive at once. */
const DROP_MARGIN = '120% 0px';
/**
 * How long a chapter's box stays within LOAD_MARGIN before its editor loads: a fling down the page
 * passes a box in less, so it boots no editor it would drop a moment later.
 */
const LOAD_DWELL_MS = 400;

/** The live editor's frame of /try, added at the end of its box. */
function frameIn(box: HTMLElement, className: string): HTMLIFrameElement {
  const frame = document.createElement('iframe');
  frame.className = className;
  frame.src = TRY_FRAME_SRC;
  frame.title = box.dataset.frameTitle ?? '';
  frame.allow = 'fullscreen; clipboard-write';
  frame.loading = 'eager';
  box.append(frame);
  return frame;
}

/** Posts to a frame of this origin, once it has a window. */
function postTo(frame: HTMLIFrameElement | null, data: unknown): void {
  frame?.contentWindow?.postMessage(data, window.location.origin);
}

/**
 * The hero's box (HeroBox.tsx draws it; docs/SITE.md A.3, C.11): the poster first, a capture of
 * the live editor painted in a box whose size never changes; after the page's `load` and one idle
 * moment the live editor loads in a same origin frame over it, invisible, and when the frame says
 * it is ready the frame shows (a 150 ms fade, none under reduced motion) and the poster leaves.
 * Nothing moves: the frame takes the poster's box. Without script the poster stays. The page tells
 * the frame whenever the box enters or leaves the screen, so the agents work only while someone
 * can see them. The box's `data-state` names the step: `poster`, `loading`, `live`, `done`.
 *
 * A press on an avatar of the title (`press`) goes to the frame as `ts-try:press`: when the
 * poster is still up the frame starts loading at once and the press waits for its ready; when
 * less than half of the box is on screen the page brings it into view first, at once (the product
 * does not smooth-scroll).
 */
export function attachHeroBox(box: HTMLElement): { press: OnPress; detach: () => void } {
  let cancelled = false;
  let idle = 0;
  let onScreen = true;
  let ready = false;
  let queued: TryPressed[] = [];
  let frame: HTMLIFrameElement | null = null;
  const load = (): void => {
    if (cancelled || frame !== null) return;
    frame = frameIn(box, 'site-hero-frame');
    box.dataset.state = 'loading';
  };
  const send = (who: TryPressed): void => postTo(frame, { type: TRY_PRESS, who });
  const press: OnPress = (who) => {
    const rect = box.getBoundingClientRect();
    const shown = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
    /* at once: the product does not smooth-scroll (the brand lint's gt-ui/no-smooth-scroll) */
    if (shown < rect.height / 2) box.scrollIntoView({ block: 'start' });
    if (ready) {
      send(who);
      return;
    }
    queued = [...queued.slice(-3), who];
    load();
  };
  const begin = (): void => {
    if (cancelled) return;
    if (typeof window.requestIdleCallback === 'function')
      idle = window.requestIdleCallback(load, { timeout: IDLE_CAP_MS });
    else idle = window.setTimeout(load, 200);
  };
  if (document.readyState === 'complete') begin();
  else window.addEventListener('load', begin, { once: true });
  const onMessage = (event: MessageEvent): void => {
    if (event.origin !== window.location.origin) return;
    if (frame === null || event.source !== frame.contentWindow || !isTryReady(event.data)) return;
    ready = true;
    box.dataset.state = 'live';
    postTo(frame, { type: TRY_VISIBLE, visible: onScreen });
    for (const who of queued) send(who);
    queued = [];
    /* the poster leaves once the frame has faded in over it */
    window.setTimeout(() => {
      if (cancelled) return;
      for (const picture of box.querySelectorAll(':scope > picture')) picture.remove();
      box.dataset.state = 'done';
    }, FADE_MS + 50);
  };
  window.addEventListener('message', onMessage);
  const observer =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver((entries) => {
          const entry = entries[entries.length - 1];
          if (entry === undefined) return;
          onScreen = entry.isIntersecting;
          postTo(frame, { type: TRY_VISIBLE, visible: onScreen });
        });
  observer?.observe(box);
  return {
    press,
    detach: () => {
      cancelled = true;
      window.removeEventListener('load', begin);
      window.removeEventListener('message', onMessage);
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle);
      window.clearTimeout(idle);
      observer?.disconnect();
    },
  };
}

/**
 * A chapter's live editor (ChapterBox.tsx draws its box; docs/SITE.md 5, "The chapters"): the
 * same frame of /try as the hero's, which plays one chapter of the story (try/story.ts), named by
 * the box's `data-chapter`. The box keeps its size and shows paper until the frame says it is
 * ready, then the frame fades in over it, so nothing moves. The frame loads once the box has
 * stayed within LOAD_MARGIN of the window for LOAD_DWELL_MS and unloads past DROP_MARGIN, so the
 * page holds the hero's editor and one or two of these, and a fling past a box loads nothing. On its ready the page names the chapter (`ts-try:chapter`) and
 * tells it whether the box is on screen (`ts-try:visible`), as it does whenever that changes; off
 * screen its agents wait. The box's `data-state` is `empty`, `loading` or `live`.
 */
export function attachChapterBox(box: HTMLElement): () => void {
  if (typeof IntersectionObserver === 'undefined') return () => undefined;
  const chapter = Number(box.dataset.chapter);
  let onScreen = false;
  let ready = false;
  let frame: HTMLIFrameElement | null = null;
  /* the dwell's timer while the box is near and its editor not loaded yet */
  let dwell: number | undefined;
  const settle = (): void => {
    window.clearTimeout(dwell);
    dwell = undefined;
  };
  const last = (entries: IntersectionObserverEntry[]) => entries[entries.length - 1];
  const near = new IntersectionObserver(
    (entries) => {
      if (last(entries)?.isIntersecting !== true) {
        settle();
        return;
      }
      if (frame !== null || dwell !== undefined) return;
      dwell = window.setTimeout(() => {
        dwell = undefined;
        if (frame !== null) return;
        frame = frameIn(box, 'site-chapter-frame');
        box.dataset.state = 'loading';
      }, LOAD_DWELL_MS);
    },
    { rootMargin: LOAD_MARGIN },
  );
  const far = new IntersectionObserver(
    (entries) => {
      if (last(entries)?.isIntersecting !== false) return;
      settle();
      ready = false;
      frame?.remove();
      frame = null;
      box.dataset.state = 'empty';
    },
    { rootMargin: DROP_MARGIN },
  );
  const seen = new IntersectionObserver((entries) => {
    const entry = last(entries);
    if (entry === undefined) return;
    onScreen = entry.isIntersecting;
    if (ready) postTo(frame, { type: TRY_VISIBLE, visible: onScreen });
  });
  const onMessage = (event: MessageEvent): void => {
    if (event.origin !== window.location.origin) return;
    if (frame === null || event.source !== frame.contentWindow || !isTryReady(event.data)) return;
    ready = true;
    postTo(frame, { type: TRY_CHAPTER, chapter });
    postTo(frame, { type: TRY_VISIBLE, visible: onScreen });
    box.dataset.state = 'live';
  };
  window.addEventListener('message', onMessage);
  near.observe(box);
  far.observe(box);
  seen.observe(box);
  return () => {
    settle();
    window.removeEventListener('message', onMessage);
    near.disconnect();
    far.disconnect();
    seen.disconnect();
  };
}
