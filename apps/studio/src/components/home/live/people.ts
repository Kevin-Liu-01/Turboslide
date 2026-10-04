import { PEOPLE } from '../copy';
import type { LiveContext } from './index';
import { finishBand, installGuards, loop, onFrame, play, timeline } from './motion';
import type { LoopHandle, Timeline } from './motion';
import { paintSlide } from './paint';
import { keyGaps, PEOPLE_LOOP_MS } from '../people-timing';

/**
 * Two people edit the same slide (docs/LANDING.md 2.10, 3.4 P-L, 3.6 W1; B's band,
 * `direction-b/landing.js` 1630 to 1870). V4's file, the band's chunk entry.
 *
 * Two screens, Maya's and Sam's, each the editor's title row (the mark, the deck's title and the
 * other person's presence chip) over the page deck's slides 2 and 3 as the store holds them (the
 * loader writes them from V1's `bands/people.generated.ts` and draws the store's state on them). The staged loop P-L (14 s, a demonstration) plays B's sequence with the editor's presence
 * marks drawn in ink (the page draws no hue, question 20): Sam's chip arrives on Maya's screen, his
 * outline and name flag land on Week 3's row and he types " in person" with a person's uneven
 * gaps, Maya's screen one key behind; Maya selects the heading and types on her own clock, Sam's
 * screen one key behind; Sam goes to slide 3, Maya presses Follow, the plate "Following Sam" shows
 * and her screen cuts to slide 3; Stop; both screens cut back to slide 2 with the typed words gone,
 * which is the loop's seam. Nothing reaches the page deck or Version history.
 *
 * A click, or Tab and Enter, on a text box of either screen stops the loop for good and types as
 * that person: that screen draws the visitor's selection and the browser's caret, the other draws
 * the person's ink outline, flag and caret, and the words follow 120 ms behind (W1). Escape ends
 * the typing. Under reduced motion, with Pause Motion at load and before the loop starts the band
 * shows B's still: Sam's words on both screens, his outline and flag on Maya's.
 */

type Who = 'maya' | 'sam';
type SlideOf = 'plan' | 'gets';
const OTHER: Readonly<Record<Who, Who>> = { maya: 'sam', sam: 'maya' };
const WHO: readonly Who[] = ['maya', 'sam'];

/** The text boxes of slide 2 the loop and the visitor type in, by the renderer's run. */
const RUNS = {
  heading: 'h/text',
  week3: 'rows/items/2/value',
} as const;

/** Each screen's text boxes a visitor may type in (2.10): the heading and the four rows. */
const TYPED_RUNS = [
  'h/text',
  'rows/items/0/value',
  'rows/items/1/value',
  'rows/items/2/value',
  'rows/items/3/value',
] as const;

/** The words each person types in the loop (the slide's own text gains them, then the seam takes them away). */
const SAM_TYPES = ' in person';
const MAYA_TYPES = ' ahead';

/** The schedule in ms of the cycle (B's, `b-strip-people.png`). */
const AT = {
  samChip: 1300,
  samSelects: 2500,
  samTypes: 3200,
  mayaSelects: 7400,
  mayaTypes: 7700,
  mayaLeaves: 9500,
  samToGets: 9900,
  follow: 10400,
  mayaFollows: 10640,
  stop: 12400,
  seam: 13700,
} as const;
/** The other screen trails a person by one key, and catches the last key this long after it. */
const TRAIL_MS = 140;
/** B's still, where reduced motion and Pause Motion at load hold the band (Sam's words typed). */
export const PEOPLE_STILL_AT = 6000;
/** The mirrored typing's delay (3.6 W1). */
const MIRROR_MS = 120;
/** A finger that moves further than this from its down is a scroll, not a tap (`hero-stage.ts`'s). */
const TAP_SLOP_PX = 10;
/** The keys that move the caret to an end of the line or the box while a person types. */
const CARET_KEYS: Readonly<
  Record<string, readonly ['backward' | 'forward', 'lineboundary' | 'documentboundary']>
> = {
  Home: ['backward', 'lineboundary'],
  End: ['forward', 'lineboundary'],
  PageUp: ['backward', 'documentboundary'],
  PageDown: ['forward', 'documentboundary'],
};

type Screen = {
  who: Who;
  el: HTMLElement;
  /** the title row's chip of the other person */
  chip: HTMLElement;
  /** the overlay the outline and the flag are drawn in, over the slides */
  marks: HTMLElement;
  outline: HTMLElement;
  flag: HTMLElement;
  /** the sheet wrappers of slides 2 and 3 */
  sheets: Record<SlideOf, HTMLElement>;
};

/** What a screen shows of a person: an outline and a flag on a text box, and a caret in it. */
type Presence = { of: Who; run: string; mine: boolean } | null;

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** The mark of the title row: the page's sprite symbol, as the slides' wordmark draws it. */
function markIcon(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '19');
  svg.setAttribute('height', '12');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', '#ts-mark');
  svg.append(use);
  return svg;
}

export function start(ctx: LiveContext): void {
  installGuards();
  const band = ctx.band;
  const pair = ctx.reserve ?? band.querySelector<HTMLElement>('[data-reserve="people"]') ?? band;
  const store = ctx.store;
  const follow = band.querySelector<HTMLElement>('[data-follow]');
  /* the Following plate's words (2.10), page copy shown only in the loop */
  if (follow !== null && follow.childElementCount === 0) {
    follow.append(el('span', '', PEOPLE.following), el('span', '', PEOPLE.stop));
    follow.setAttribute('aria-hidden', 'true');
    follow.classList.add('ts-people-follow');
  }

  /* the slides as the build wrote them, cloned fresh at every seam so the typed words go and the
     store's state (the name, the kit) is drawn again */
  const pristine = new Map<string, HTMLElement>();
  const screens = {} as Record<Who, Screen>;
  for (const who of WHO) {
    const node = pair.querySelector<HTMLElement>(`[data-screen="${who}"]`);
    if (node === null) return;
    const roots = [...node.querySelectorAll<HTMLElement>('[data-home-slides]')];
    const plan = roots.find((root) => root.dataset['slide'] === 'plan');
    const gets = roots.find((root) => root.dataset['slide'] === 'gets');
    if (plan === undefined || gets === undefined) return;
    pristine.set(`${who}-plan`, plan.cloneNode(true) as HTMLElement);
    pristine.set(`${who}-gets`, gets.cloneNode(true) as HTMLElement);
    const wrap = (root: HTMLElement): HTMLElement =>
      root.closest<HTMLElement>('.ts-home-sheet') ?? (root.parentElement as HTMLElement);
    /* the editor's title row: the mark, the deck's title and the other person's chip */
    let title = node.querySelector<HTMLElement>('.ts-people-title');
    if (title === null) {
      title = el('div', 'ts-people-title');
      title.setAttribute('aria-hidden', 'true');
      node.prepend(title);
    }
    if (title.childElementCount === 0)
      title.append(markIcon(), el('span', 'ts-people-deck', deckTitle()));
    const chip = el('span', 'ts-people-chip', PEOPLE.flags[OTHER[who]].slice(0, 1));
    title.append(chip);
    const marks = el('div', 'ts-people-marks');
    marks.setAttribute('data-live-overlay', '');
    marks.setAttribute('aria-hidden', 'true');
    const outline = el('div', 'ts-people-outline');
    const flag = el('div', 'ts-people-flag');
    marks.append(outline, flag);
    const slides = wrap(plan).parentElement ?? node;
    slides.classList.add('ts-people-slides');
    slides.append(marks);
    screens[who] = {
      who,
      el: node,
      chip,
      marks,
      outline,
      flag,
      sheets: { plan: wrap(plan), gets: wrap(gets) },
    };
  }

  function deckTitle(): string {
    const state = store.get() as { deckTitle?: string };
    return state.deckTitle ?? document.querySelector('[data-hero-title]')?.textContent ?? '';
  }
  store.subscribe(() => {
    for (const who of WHO) {
      const deck = screens[who]?.el.querySelector('.ts-people-deck');
      if (deck != null && deck.textContent !== deckTitle()) deck.textContent = deckTitle();
    }
  });

  const rootOf = (who: Who, slide: SlideOf): HTMLElement | null =>
    screens[who].sheets[slide].querySelector<HTMLElement>('[data-home-slides]');
  const target = (who: Who, run: string, slide: SlideOf = 'plan'): HTMLElement | null =>
    rootOf(who, slide)?.querySelector<HTMLElement>(`[data-run="${run}"]`) ?? null;

  /* ---- drawing ---- */

  const presence: Record<Who, Presence> = { maya: null, sam: null };
  const carets = new Set<HTMLElement>();

  /** Places a screen's outline and flag on the text box its presence names (a layout read). */
  const place = (who: Who): void => {
    const screen = screens[who];
    const shown = presence[who];
    const box = shown === null ? null : target(who, shown.run);
    if (shown === null || box === null) {
      screen.outline.hidden = true;
      screen.flag.hidden = true;
      return;
    }
    const o = screen.marks.getBoundingClientRect();
    const r = box.getBoundingClientRect();
    const pad = 3;
    const left = r.left - o.left - pad;
    const top = r.top - o.top - pad;
    screen.outline.hidden = false;
    screen.outline.classList.toggle('is-mine', shown.mine);
    screen.outline.style.transform = `translate(${left}px, ${top}px)`;
    screen.outline.style.width = `${r.width + pad * 2}px`;
    screen.outline.style.height = `${r.height + pad * 2}px`;
    const flagged = shown.of !== who;
    screen.flag.hidden = !flagged;
    if (flagged) {
      screen.flag.textContent = PEOPLE.flags[shown.of];
      screen.flag.style.transform = `translate(${left}px, ${top}px)`;
    }
  };

  /** Shows `of`'s presence on `who`'s screen on a text box, or none; a fade of 160 ms unless instant. */
  const show = (who: Who, next: Presence, instant: boolean): void => {
    presence[who] = next;
    place(who);
    if (next === null || instant) return;
    const screen = screens[who];
    for (const node of [screen.outline, screen.flag])
      if (!node.hidden) play(node, [{ opacity: 0 }, { opacity: 1 }], 'state', 'fade', 'people');
  };

  /**
   * Writes a text box's words on a screen, with a person's ink caret at their end when `caret` is
   * true, at that many characters in when it is a number, and none when it is false.
   */
  const write = (who: Who, run: string, text: string, caret: boolean | number): void => {
    const box = target(who, run);
    if (box === null || box.isContentEditable) return;
    box.textContent = text;
    if (caret !== false) {
      const at = caret === true ? text.length : Math.max(0, Math.min(caret, text.length));
      const mark = el('span', 'ts-people-caret');
      mark.setAttribute('aria-hidden', 'true');
      if (at < text.length) box.replaceChildren(text.slice(0, at), mark, text.slice(at));
      else box.append(mark);
      carets.add(mark);
    }
    place(who);
  };
  const clearCarets = (): void => {
    for (const mark of carets) mark.remove();
    carets.clear();
  };
  const restText = new Map<string, string>();
  const textAt = (who: Who, run: string): string => {
    const key = `${who}:${run}`;
    if (!restText.has(key)) restText.set(key, target(who, run)?.textContent ?? '');
    return restText.get(key) ?? '';
  };

  const showSlide = (who: Who, slide: SlideOf): void => {
    screens[who].sheets.plan.hidden = slide !== 'plan';
    screens[who].sheets.gets.hidden = slide !== 'gets';
    place(who);
  };

  const plate = (on: boolean, instant: boolean): void => {
    screens.maya.chip.classList.toggle('is-followed', on);
    if (follow === null) return;
    follow.hidden = !on;
    if (on && !instant) play(follow, [{ opacity: 0 }, { opacity: 1 }], 'state', 'fade', 'people');
  };

  /** The seam: fresh slides with the store's state, no marks, both screens on slide 2. */
  let dirty = true;
  const reset = (): void => {
    finishBand('people');
    clearCarets();
    restText.clear();
    if (dirty) {
      const state = store.get();
      for (const who of WHO)
        for (const slide of ['plan', 'gets'] as const) {
          const old = rootOf(who, slide);
          const fresh = pristine.get(`${who}-${slide}`)?.cloneNode(true) as HTMLElement | undefined;
          if (old === null || fresh === undefined) continue;
          old.replaceWith(fresh);
          paintSlide(fresh, state);
          if (slide === 'plan') markBoxes(who, fresh);
        }
      dirty = false;
    }
    for (const who of WHO) {
      presence[who] = null;
      place(who);
      showSlide(who, 'plan');
    }
    screens.maya.chip.hidden = true;
    screens.sam.chip.hidden = false;
    plate(false, true);
  };

  /* ---- the staged loop (P-L) ---- */

  const line: Timeline = timeline(PEOPLE_LOOP_MS, reset);
  line.at(AT.samChip, (instant) => {
    screens.maya.chip.hidden = false;
    if (!instant)
      play(screens.maya.chip, [{ opacity: 0 }, { opacity: 1 }], 'state', 'fade', 'people');
  });
  line.at(AT.samSelects, (instant) => {
    dirty = true;
    show('sam', { of: 'sam', run: RUNS.week3, mine: false }, instant);
    show('maya', { of: 'sam', run: RUNS.week3, mine: false }, instant);
    write('sam', RUNS.week3, textAt('sam', RUNS.week3), true);
    write('maya', RUNS.week3, textAt('maya', RUNS.week3), true);
  });
  const typing = (who: Who, run: string, words: string, from: number, seed: number): void => {
    const gaps = keyGaps(words, seed);
    let at = from;
    gaps.forEach((gap, index) => {
      at += gap;
      const typed = words.slice(0, index + 1);
      const trail = words.slice(0, index);
      line.at(at, () => {
        clearCarets();
        write(who, run, textAt(who, run) + typed, true);
        write(OTHER[who], run, textAt(OTHER[who], run) + trail, true);
      });
    });
    line.at(at + TRAIL_MS, () => {
      clearCarets();
      write(who, run, textAt(who, run) + words, true);
      write(OTHER[who], run, textAt(OTHER[who], run) + words, true);
    });
  };
  typing('sam', RUNS.week3, SAM_TYPES, AT.samTypes, 11);
  line.at(AT.mayaSelects, (instant) => {
    clearCarets();
    show('sam', { of: 'maya', run: RUNS.heading, mine: false }, instant);
    show('maya', { of: 'maya', run: RUNS.heading, mine: false }, instant);
    write('maya', RUNS.heading, textAt('maya', RUNS.heading), true);
    write('sam', RUNS.heading, textAt('sam', RUNS.heading), true);
  });
  typing('maya', RUNS.heading, MAYA_TYPES, AT.mayaTypes, 5);
  line.at(AT.mayaLeaves, () => {
    clearCarets();
    show('sam', null, true);
    show('maya', null, true);
  });
  line.at(AT.samToGets, () => showSlide('sam', 'gets'));
  line.at(AT.follow, (instant) => plate(true, instant));
  line.at(AT.mayaFollows, () => showSlide('maya', 'gets'));
  line.at(AT.stop, () => plate(false, true));
  line.at(AT.seam, () => reset());

  let stopFrames: (() => void) | null = null;
  const handle: LoopHandle = loop('people', pair, {
    kind: 'demonstration',
    play() {
      stopFrames ??= onFrame((dt) => line.advance(dt));
    },
    pause() {
      stopFrames?.();
      stopFrames = null;
    },
    still() {
      stopFrames?.();
      stopFrames = null;
      line.seek(PEOPLE_STILL_AT);
    },
  });
  /* the band's first paint holds B's still until the loop starts (3.4) */
  line.seek(PEOPLE_STILL_AT);

  /* ---- the visitor types as Maya or as Sam (W1) ---- */

  let stopped = false;
  /** the mirrored writes on their way: each key's words reach the other screen 120 ms after it */
  const mirrors = new Set<number>();
  /**
   * Stops the loop for good at its rest in place (the slides the visitor pressed stay the same
   * elements): no marks, no plate, both screens on slide 2, the loop's typed words taken away.
   */
  const stopLoop = (): void => {
    if (stopped) return;
    stopped = true;
    handle.stop();
    finishBand('people');
    clearCarets();
    for (const who of WHO)
      for (const run of Object.values(RUNS)) {
        const base = restText.get(`${who}:${run}`);
        const box = target(who, run);
        if (base !== undefined && box !== null) box.textContent = base;
      }
    restText.clear();
    for (const who of WHO) {
      presence[who] = null;
      showSlide(who, 'plan');
    }
    screens.maya.chip.hidden = false;
    plate(false, true);
  };

  function markBoxes(who: Who, root: HTMLElement): void {
    for (const run of TYPED_RUNS) {
      const box = root.querySelector<HTMLElement>(`[data-run="${run}"]`);
      if (box === null) continue;
      box.tabIndex = 0;
      box.setAttribute('role', 'textbox');
      box.setAttribute('aria-roledescription', 'text box');
      box.setAttribute(
        'aria-label',
        `${PEOPLE.screens[who]}, ${run === 'h/text' ? 'Heading' : `Row ${Number(run.split('/')[2]) + 1}`}`,
      );
      box.dataset['peopleBox'] = run;
    }
  }
  for (const who of WHO) {
    const root = rootOf(who, 'plan');
    if (root !== null) markBoxes(who, root);
  }

  const typeAs = (who: Who, run: string): void => {
    stopLoop();
    const box = target(who, run);
    if (box === null) return;
    const other = OTHER[who];
    dirty = true;
    box.contentEditable = 'plaintext-only';
    box.focus();
    const range = document.createRange();
    range.selectNodeContents(box);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    show(who, { of: who, run, mine: true }, true);
    show(other, { of: who, run, mine: false }, false);
    clearCarets();
    write(other, run, box.textContent ?? '', true);
    /* the caret's place in the box's words, which the other screen draws with them */
    const caretAt = (): number => {
      const selection = window.getSelection();
      const words = box.textContent ?? '';
      if (selection?.focusNode == null || !box.contains(selection.focusNode)) return words.length;
      const range = document.createRange();
      range.selectNodeContents(box);
      range.setEnd(selection.focusNode, selection.focusOffset);
      return range.toString().length;
    };
    /* each key's words and caret reach the other screen 120 ms after it (W1) */
    const mirror = (): void => {
      const words = box.textContent ?? '';
      const at = caretAt();
      place(who);
      const timer = window.setTimeout(() => {
        mirrors.delete(timer);
        clearCarets();
        write(other, run, words, at);
      }, MIRROR_MS);
      mirrors.add(timer);
    };
    const onSelection = (): void => {
      if (document.activeElement === box) mirror();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' || event.key === 'Enter') {
        event.preventDefault();
        end();
        box.focus();
        return;
      }
      /* Home and End take the line's ends and Page Up and Page Down the box's, as the editor's text
         boxes do, with Shift extending; Chromium on macOS scrolls the page for these keys in an
         editable and leaves the caret (verify1 F7) */
      const ends = CARET_KEYS[event.key];
      if (ends === undefined || event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      window.getSelection()?.modify(event.shiftKey ? 'extend' : 'move', ends[0], ends[1]);
    };
    const end = (): void => {
      box.removeEventListener('input', mirror);
      box.removeEventListener('blur', end);
      box.removeEventListener('keydown', onKey);
      document.removeEventListener('selectionchange', onSelection);
      for (const timer of mirrors) window.clearTimeout(timer);
      mirrors.clear();
      box.contentEditable = 'false';
      box.removeAttribute('contenteditable');
      clearCarets();
      write(other, run, box.textContent ?? '', false);
      show(who, null, true);
      show(other, null, true);
    };
    box.addEventListener('input', mirror);
    box.addEventListener('blur', end);
    box.addEventListener('keydown', onKey);
    document.addEventListener('selectionchange', onSelection);
  };

  const boxOf = (node: EventTarget | null): { who: Who; run: string } | null => {
    if (!(node instanceof Element)) return null;
    const box = node.closest<HTMLElement>('[data-people-box]');
    const who = node.closest<HTMLElement>('[data-screen]')?.dataset['screen'] as Who | undefined;
    if (box === null || who === undefined || box.isContentEditable) return null;
    return { who, run: box.dataset['peopleBox'] ?? '' };
  };
  /* the first press or key on either screen stops the loop for good (3.4). A mouse stops it on
     its down; a finger or a pen only as a tap, a lift within TAP_SLOP_PX of its down, so a scroll
     that starts on a screen leaves the loop playing as a wheel does (verify1 F5; the hero's rule,
     `hero-stage.ts`) */
  const onScreen = (event: Event): boolean =>
    (event.target as Element).closest?.('[data-screen]') != null;
  let tap: { id: number; x: number; y: number } | null = null;
  pair.addEventListener(
    'pointerdown',
    (event) => {
      if (!onScreen(event)) return;
      if (event.pointerType === 'mouse') stopLoop();
      else
        tap = event.isPrimary ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
    },
    { capture: true },
  );
  const away = (event: PointerEvent, from: { x: number; y: number }): boolean =>
    Math.hypot(event.clientX - from.x, event.clientY - from.y) > TAP_SLOP_PX;
  pair.addEventListener(
    'pointermove',
    (event) => {
      if (tap !== null && event.pointerId === tap.id && away(event, tap)) tap = null;
    },
    { capture: true, passive: true },
  );
  pair.addEventListener('pointercancel', () => void (tap = null), { capture: true });
  pair.addEventListener(
    'pointerup',
    (event) => {
      const down = tap;
      tap = null;
      if (down !== null && event.pointerId === down.id && !away(event, down)) stopLoop();
    },
    { capture: true },
  );
  pair.addEventListener(
    'keydown',
    (event) => {
      if (onScreen(event)) stopLoop();
    },
    { capture: true },
  );
  pair.addEventListener('click', (event) => {
    const hit = boxOf(event.target);
    if (hit !== null) typeAs(hit.who, hit.run);
  });
  pair.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const hit = boxOf(event.target);
    if (hit === null) return;
    event.preventDefault();
    typeAs(hit.who, hit.run);
  });
  new ResizeObserver(() => {
    for (const who of WHO) place(who);
  }).observe(pair);
}
