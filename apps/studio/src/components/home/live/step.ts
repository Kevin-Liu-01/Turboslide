import { AGENTS } from '../copy';
import { HOME_LOOP, HOME_NEXT_STEPS } from '../loop.generated';
import type { LoopStep, StepLanding } from '../loop.generated';
import { PANEL_WIDTHS, formatLines, substituteAnswer, substituteName } from '../panel-format';
import type { PanelWidth } from '../panel-format';
import { ease, ms, onFrame, reduced, sequence, slowFactor } from './motion';
import type { SequenceBand } from './motion';

/**
 * One recorded command played on a terminal and a slide (docs/LANDING.md 2.2 "The loop", 2.9, 3.6
 * A1 to A5; v3.md "Interfaces V3 exports"). V3's file, apart from the agents band's console so the
 * hero's loop (V1's `live/stage.ts`) plays its steps without the band's code or recordings (v2.md
 * R24): it imports the copy, the loop's recording (`loop.generated.ts`), the panel's formatting
 * and the motion clock, nothing else.
 *
 * `playStep` types the command at the agent's constant 24 ms a character up to its value, prints
 * the value whole one frame later, prints the answer a line at a time, waits one beat, then calls
 * the caller's `land()`, which sets the change, while the ink ring travels to what changed under
 * the ink flag "Agent", which leaves 800 ms after the landing. Every frame is a function of the
 * step's own clock (`onFrame`), so a paused step holds its frame with no timer, frame callback or
 * running animation and resumes from it (the hero's loop through V4's `loop`); `finish()` lands it
 * at once. Under reduced motion the step lands at once and the flag is cut after its 800 ms hold.
 */

/* ---------------------------------------------------------------------------------------------
 * The step's clock (LANDING.md 3.4 L-H, 3.6 A1 to A6): clocks and holds, not motion tokens */

const CLOCK_MS = 24;
const PASTE_MS = 16;
const ANSWER_DELAY_MS = 200;
const ANSWER_STAGGER_MS = 55;
const ROW_STAGGER_MS = 55;
const RAIL_STAGGER_MS = 60;
const FLAG_HOLD_MS = 800;
const RING_MIN_MS = 300;
const RING_MAX_MS = 700;

/* ---------------------------------------------------------------------------------------------
 * Curves on the step's clock: the tokens' cubic-bezier values, solved in script */

type Curve = (t: number) => number;

function bezier(x1: number, y1: number, x2: number, y2: number): Curve {
  const at = (a: number, b: number, t: number): number =>
    3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i += 1) {
      const mid = (lo + hi) / 2;
      if (at(x1, x2, mid) < x) lo = mid;
      else hi = mid;
    }
    return at(y1, y2, (lo + hi) / 2);
  };
}

const curves = new Map<string, Curve>();
/** The curve of a token (`--ts-ease-<name>`), read once; linear when the value is not a bezier. */
function curve(name: 'arrive' | 'move' | 'fade'): Curve {
  const value = ease(name);
  let found = curves.get(value);
  if (found === undefined) {
    const m = /cubic-bezier\(([^)]+)\)/.exec(value);
    const n = m?.[1]?.split(',').map(Number) ?? [];
    found =
      n.length === 4 && n.every(Number.isFinite)
        ? bezier(n[0] as number, n[1] as number, n[2] as number, n[3] as number)
        : value === 'ease-out'
          ? bezier(0, 0, 0.58, 1)
          : (t: number) => Math.max(0, Math.min(1, t));
    curves.set(value, found);
  }
  return found;
}

const clamp01 = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t);

/* ---------------------------------------------------------------------------------------------
 * Geometry: a box in its sheet, rotation included */

/** A box in the sheet's pixels; `o` is how far the ring stands outside it (none round a whole slide). */
type Box = { cx: number; cy: number; w: number; h: number; deg: number; o: number };

/** The element's degrees from its computed transform and `rotate` (the turned title). */
function degreesOf(el: Element): number {
  const style = getComputedStyle(el);
  let deg = 0;
  const m = /matrix\(([^)]+)\)/.exec(style.transform);
  if (m !== null) {
    const [a, b] = (m[1] as string).split(',').map(Number) as [number, number];
    deg += (Math.atan2(b, a) * 180) / Math.PI;
  }
  const r = /(-?\d*\.?\d+)deg/.exec(style.rotate);
  if (r !== null) deg += Number(r[1]);
  return deg;
}

/** The ring stands this far outside a block it marks, so its line never cuts the block's first letter. */
const RING_OUTSET = 3;

/**
 * The element's own box in the sheet's pixels: its centre on screen, its turn, and its layout size
 * times the scale of the slide it sits in (the renderer's 1,600 by 900 stage is scaled to the sheet
 * by a transform, so a block's layout size is in stage units).
 */
function boxIn(el: HTMLElement, sheet: HTMLElement): Box {
  const r = el.getBoundingClientRect();
  const s = sheet.getBoundingClientRect();
  const root = el.closest<HTMLElement>('[data-home-slides]');
  const scale =
    root !== null && root.offsetWidth > 0
      ? root.getBoundingClientRect().width / root.offsetWidth
      : 1;
  const unscaled = root === el;
  return {
    cx: r.left + r.width / 2 - s.left,
    cy: r.top + r.height / 2 - s.top,
    w: unscaled ? r.width : el.offsetWidth > 0 ? el.offsetWidth * scale : r.width,
    h: unscaled ? r.height : el.offsetHeight > 0 ? el.offsetHeight * scale : r.height,
    deg: degreesOf(el),
    o: unscaled ? 0 : RING_OUTSET,
  };
}

function mixBox(a: Box, b: Box, t: number): Box {
  const mix = (x: number, y: number): number => x + (y - x) * t;
  return {
    cx: mix(a.cx, b.cx),
    cy: mix(a.cy, b.cy),
    w: mix(a.w, b.w),
    h: mix(a.h, b.h),
    deg: mix(a.deg, b.deg),
    o: mix(a.o, b.o),
  };
}

/** The agent's ring: four 1 px edges scaled along their length, so the line stays 1 px (A3). */
function drawRing(ring: HTMLElement, box: Box): void {
  const w = Math.max(1, box.w + 2 * box.o);
  const h = Math.max(1, box.h + 2 * box.o);
  ring.style.transform = `translate(${box.cx}px, ${box.cy}px) rotate(${box.deg}deg) translate(${-w / 2}px, ${-h / 2}px)`;
  const [top, bottom, left, right] = [...ring.children] as HTMLElement[];
  if (top) top.style.transform = `scaleX(${w})`;
  if (bottom) bottom.style.transform = `translate(0px, ${h - 1}px) scaleX(${w})`;
  if (left) left.style.transform = `scaleY(${h})`;
  if (right) right.style.transform = `translate(${w - 1}px, 0px) scaleY(${h})`;
}

/** The flag above the ring's top left corner, upright, inside the sheet. */
function placeFlag(flag: HTMLElement, box: Box): void {
  const rad = (box.deg * Math.PI) / 180;
  const dx = -box.w / 2 - box.o;
  const dy = -box.h / 2 - box.o;
  const x = box.cx + dx * Math.cos(rad) - dy * Math.sin(rad);
  const y = box.cy + dx * Math.sin(rad) + dy * Math.cos(rad);
  const height = flag.offsetHeight || 20;
  const top = y - height >= 0 ? y - height : y;
  flag.style.transform = `translate(${Math.round(x)}px, ${Math.round(top)}px)`;
}

/** Ends at once the renderer's own entrance fade (`.slide.is-on`, sheet.css `cut`), which 3.6 does not list. */
export function settleEntrance(el: Element): void {
  for (const a of el.getAnimations({ subtree: true }))
    if (a instanceof CSSAnimation && a.animationName === 'cut') a.finish();
}

/* ---------------------------------------------------------------------------------------------
 * The terminal: one entry is one logical line, formatted at each width the target shows */

/** A terminal's line containers by width. */
export type Screen = Partial<Record<PanelWidth, HTMLElement>>;
type Entry = { lines: Partial<Record<PanelWidth, HTMLElement[]>>; text: string };

function widthsOf(screen: Screen): PanelWidth[] {
  return (['wide', 'narrow'] as const).filter((w) => screen[w] !== undefined);
}

function spans(texts: readonly string[]): HTMLElement[] {
  return texts.map((text) => {
    const el = document.createElement('span');
    el.textContent = text;
    return el;
  });
}

/**
 * Appends a logical line; the oldest lines leave the top past the screen's keep, as a terminal
 * scrolls. A screen that scrolls (`data-keep`, the hero's terminal, docs/DESIGN.md 8.2) keeps that
 * many lines and follows its end while its end is in view; any other keeps its slots.
 */
export function addEntry(screen: Screen, text: string): Entry {
  const entry: Entry = { lines: {}, text };
  for (const width of widthsOf(screen)) {
    const host = screen[width] as HTMLElement;
    const keep = Number(host.dataset['keep']) || PANEL_WIDTHS[width].slots;
    const atEnd = host.scrollTop + host.clientHeight >= host.scrollHeight - 24;
    const els = spans(formatLines([text], width, { overlong: 'break' }));
    host.append(...els);
    entry.lines[width] = els;
    const extra = host.children.length - keep;
    for (let i = 0; i < extra; i += 1) host.firstElementChild?.remove();
    if (atEnd) host.scrollTop = host.scrollHeight;
  }
  return entry;
}

/** Rewrites an entry in place (a command being typed). */
function setEntry(screen: Screen, entry: Entry, text: string): void {
  if (entry.text === text) return;
  entry.text = text;
  for (const width of widthsOf(screen)) {
    const host = screen[width] as HTMLElement;
    const atEnd = host.scrollTop + host.clientHeight >= host.scrollHeight - 24;
    const old = entry.lines[width] ?? [];
    const els = spans(formatLines([text], width, { overlong: 'break' }));
    const first = old[0];
    if (first !== undefined && first.isConnected) first.before(...els);
    else host.append(...els);
    for (const el of old) el.remove();
    entry.lines[width] = els;
    if (atEnd && host.dataset['keep'] !== undefined) host.scrollTop = host.scrollHeight;
  }
}

export function clearScreen(screen: Screen): void {
  for (const width of widthsOf(screen)) screen[width]?.replaceChildren();
}

/* ---------------------------------------------------------------------------------------------
 * playStep */

export type StepTarget = {
  /** the screen's line containers by width; the hero passes `narrow` alone (44 columns) */
  terminal: Screen;
  /** the positioned wrapper of the slide the step changes: the ring and the flag are drawn in it */
  sheet: HTMLElement;
};

/** A step `playStep` plays: one of the hero's loop or a chip's command, its words already chosen. */
export type PlayableStep = {
  /** the command as printed, the name and revision substituted */
  command: string;
  /** the characters typed at 24 ms a character; the rest prints whole one frame later */
  typedChars: number;
  /** the answer as printed */
  answer: readonly string[];
  landing: StepLanding;
};

export type StepOptions = {
  /** clears the screen before the command (the hero's Restore) */
  clear?: boolean;
  /**
   * Called once the answer has printed and the beat has passed: the caller sets the slide's new
   * state and returns the element the ring travels to (null: no ring, as Restore).
   */
  land(): HTMLElement | null;
  /** where the ring starts when the sheet has no ring yet: the whole slide by default */
  from?: HTMLElement | null;
  /** the band whose `finishBand` lands the step; only with `track` */
  band: SequenceBand;
  /** registers the step as a sequence of its band (the chips); the hero's loop passes false */
  track: boolean;
  /** called once when the step has ended, finished or landed */
  onEnd?(): void;
};

export type StepHandle = {
  pause(): void;
  resume(): void;
  /** lands the step at once: everything printed, the change set, the ring and flag gone */
  finish(): void;
  readonly done: Promise<void>;
  /** the step's length in ms on its own clock (times `?slow=10`) */
  readonly length: number;
};

/** The ring each sheet keeps between steps, so the next step's ring travels from the last one. */
const lastBoxes = new WeakMap<HTMLElement, Box>();

/** A loop step of the hero (2.2) as `playStep` plays it, with the deck's customer. */
export function loopStep(step: LoopStep, customer: string): PlayableStep {
  return {
    command: substituteName(step.command, HOME_LOOP.customer, customer),
    typedChars:
      step.typedChars +
      (step.typedChars > step.command.indexOf(HOME_LOOP.customer) &&
      step.command.includes(HOME_LOOP.customer)
        ? customer.length - HOME_LOOP.customer.length
        : 0),
    answer: step.answer.map((line) => substituteAnswer(line, HOME_LOOP.customer, customer)),
    landing: step.landing,
  };
}

/**
 * Plays one step on `target` (LANDING.md 3.6 A1 to A5): types, answers, lands the caller's change
 * with the ring and the flag, and ends 800 ms after the landing with the flag's exit. Returns the
 * handle the caller pauses, resumes or finishes.
 */
export function playStep(target: StepTarget, step: PlayableStep, options: StepOptions): StepHandle {
  const { terminal, sheet } = target;
  const still = reduced();
  const slow = slowFactor();
  const typed = still ? 0 : Math.max(0, Math.min(step.typedChars, step.command.length));
  const typeEnd = typed * CLOCK_MS;
  const answerAt = still ? 0 : typeEnd + ANSWER_DELAY_MS;
  const fade = still ? 0 : ms('fast') / slow;
  const answerEnd =
    step.answer.length === 0
      ? answerAt
      : answerAt + fade + (step.answer.length - 1) * ANSWER_STAGGER_MS;
  const landAt = still ? 0 : answerEnd + ms('beat') / slow;
  /* the landing's length is known once the ring's distance is: set at the landing */
  let landLength = 0;
  let ringLength = 0;
  let flagOutAt = Number.POSITIVE_INFINITY;
  const flagFade = still ? 0 : ms('state') / slow;
  const estimate =
    landAt +
    Math.max(
      RING_MAX_MS,
      step.landing.kind === 'words'
        ? step.landing.chars * CLOCK_MS
        : ms('line') / slow + 3 * RAIL_STAGGER_MS,
    ) +
    FLAG_HOLD_MS +
    flagFade;

  if (options.clear === true) clearScreen(terminal);
  const command = addEntry(terminal, typed === 0 ? `$ ${step.command}` : '$ ');
  const answers: Entry[] = [];
  let changed: HTMLElement | null = null;
  let ring: HTMLElement | null = null;
  let flag: HTMLElement | null = null;
  let fromBox: Box | null = null;
  let toBox: Box | null = null;
  let landed = false;
  /* what the landing animates, set at the landing */
  let words: {
    parts: { shown: HTMLElement; rest: HTMLElement; text: string }[];
    total: number;
  } | null = null;
  let rows: HTMLElement[] = [];
  let rails: HTMLElement | null = null;
  let turn: { el: HTMLElement; from: number; to: number } | null = null;

  let time = 0;
  let stopTick: (() => void) | null = null;
  let ended = false;
  let resolveDone: () => void = () => undefined;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  const tracked = options.track ? sequence(options.band, () => finish()) : null;
  let holdTimer = 0;

  const makeRing = (): HTMLElement => {
    const el = document.createElement('div');
    el.className = 'ts-home-ring';
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('data-live-overlay', '');
    for (let i = 0; i < 4; i += 1) el.append(document.createElement('i'));
    sheet.append(el);
    return el;
  };
  const makeFlag = (): HTMLElement => {
    const el = document.createElement('span');
    el.className = 'ts-home-flag';
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('data-live-overlay', '');
    el.textContent = AGENTS.author.agent;
    sheet.append(el);
    return el;
  };

  /** A5: the changed words land at 24 ms a character, the rest held in the slide's ground. */
  const splitWords24 = (el: HTMLElement): void => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    for (let n = walker.nextNode(); n !== null; n = walker.nextNode())
      if ((n as Text).data.length > 0) nodes.push(n as Text);
    const parts = nodes.map((node) => {
      const shown = document.createElement('span');
      const rest = document.createElement('span');
      rest.style.color = 'transparent';
      rest.textContent = node.data;
      node.replaceWith(shown, rest);
      return { shown, rest, text: node.data };
    });
    words = { parts, total: parts.reduce((sum, p) => sum + p.text.length, 0) };
  };
  const paintWords = (k: number): void => {
    if (words === null) return;
    let left = k;
    for (const part of words.parts) {
      const take = Math.max(0, Math.min(part.text.length, left));
      part.shown.textContent = part.text.slice(0, take);
      part.rest.textContent = part.text.slice(take);
      left -= take;
    }
  };
  const unsplitWords = (): void => {
    if (words === null) return;
    for (const part of words.parts) {
      part.shown.replaceWith(document.createTextNode(part.text));
      part.rest.remove();
    }
    words = null;
  };

  const land = (): void => {
    landed = true;
    changed = options.land();
    if (changed === null) {
      /* no ring (Restore, a refused command): the step ends after the flag's hold all the same,
         so its length is the schedule's (scheduleOf with no ring and no landing) */
      flagOutAt = landAt + FLAG_HOLD_MS;
      return;
    }
    const slideRoot = changed.closest<HTMLElement>('[data-home-slides]');
    settleEntrance(slideRoot ?? changed);
    /* the box after the change: a turn's title already at its new angle */
    toBox = boxIn(changed, sheet);
    const last = lastBoxes.get(sheet);
    const start = options.from ?? slideRoot;
    fromBox = last ?? (start !== null && start !== changed ? boxIn(start, sheet) : toBox);
    if (step.landing.kind === 'turn') {
      /* the title turns from the angle it had to the one the change set, on the ring's curve */
      const to = step.landing.degrees;
      const from = to === 0 ? HOME_NEXT_STEPS.turnTo : 0;
      turn = { el: changed, from, to };
      if (!still) changed.style.rotate = `${from}deg`;
    }
    const distance = Math.hypot(toBox.cx - fromBox.cx, toBox.cy - fromBox.cy);
    ringLength =
      still || fromBox === toBox
        ? 0
        : Math.min(RING_MAX_MS, Math.max(RING_MIN_MS, RING_MIN_MS + distance / 2));
    if (turn !== null && !still) ringLength = RING_MAX_MS;
    ring = makeRing();
    flag = makeFlag();
    if (step.landing.kind === 'words' && !still) {
      splitWords24(changed);
      paintWords(0);
      landLength = (words as { total: number } | null)?.total ?? 0;
      landLength *= CLOCK_MS;
    } else if (step.landing.kind === 'rows' && !still) {
      rows = [...changed.children].filter((el): el is HTMLElement => el instanceof HTMLElement);
      for (const row of rows) row.style.opacity = '0';
      landLength = ms('state') / slow + (Math.min(rows.length, 7) - 1) * ROW_STAGGER_MS;
    } else if (step.landing.kind === 'rails' && !still) {
      rails = slideRoot?.querySelector<HTMLElement>('.frame') ?? null;
      if (rails !== null) {
        rails.setAttribute('data-rails', '');
        for (const side of ['top', 'left', 'right', 'bottom'])
          rails.style.setProperty(`--ts-rail-${side}`, '0');
      }
      landLength = ms('line') / slow + 3 * RAIL_STAGGER_MS;
    }
    flagOutAt = landAt + Math.max(ringLength, landLength) + FLAG_HOLD_MS;
  };

  /** Draws the step at time `t` on its clock (ms, `?slow=10` already taken out). */
  const draw = (t: number): void => {
    /* A1: the command */
    if (typed > 0) {
      const k = Math.min(typed, Math.floor(t / CLOCK_MS));
      const text = t >= typeEnd + PASTE_MS ? step.command : step.command.slice(0, k);
      setEntry(terminal, command, `$ ${text}`);
    }
    /* A2: the answer, a line at a time */
    step.answer.forEach((line, i) => {
      const at = answerAt + i * ANSWER_STAGGER_MS;
      if (t < at) return;
      let entry = answers[i];
      if (entry === undefined) {
        entry = addEntry(terminal, line);
        answers[i] = entry;
      }
      const o = fade === 0 ? 1 : curve('fade')(clamp01((t - at) / fade));
      for (const els of Object.values(entry.lines))
        for (const el of els ?? []) el.style.opacity = o >= 1 ? '' : String(o);
    });
    /* A3 to A5: the landing */
    if (t < landAt) return;
    if (!landed) land();
    const lt = t - landAt;
    if (ring !== null && fromBox !== null && toBox !== null) {
      const p = ringLength === 0 ? 1 : curve('move')(clamp01(lt / ringLength));
      const box = mixBox(fromBox, toBox, p);
      drawRing(ring, box);
      if (flag !== null) placeFlag(flag, box);
      if (turn !== null && !still)
        turn.el.style.rotate = `${turn.from + (turn.to - turn.from) * p}deg`;
    }
    if (words !== null) paintWords(Math.floor(lt / CLOCK_MS));
    if (rows.length > 0) {
      const d = ms('state') / slow;
      rows.forEach((row, i) => {
        const o = d === 0 ? 1 : curve('fade')(clamp01((lt - Math.min(i, 6) * ROW_STAGGER_MS) / d));
        row.style.opacity = o >= 1 ? '' : String(o);
      });
    }
    if (rails !== null) {
      const d = ms('line') / slow;
      ['top', 'left', 'right', 'bottom'].forEach((side, i) => {
        const p = d === 0 ? 1 : curve('arrive')(clamp01((lt - i * RAIL_STAGGER_MS) / d));
        rails?.style.setProperty(`--ts-rail-${side}`, String(p));
      });
    }
    /* the flag leaves 800 ms after the landing, over 160 ms */
    if (flag !== null && t >= flagOutAt) {
      const o = flagFade === 0 ? 0 : 1 - curve('fade')(clamp01((t - flagOutAt) / flagFade));
      flag.style.opacity = String(o);
      if (ring !== null) ring.style.opacity = String(o);
    }
    if (t >= flagOutAt + flagFade) end();
  };

  /** The step's end state: everything printed, the change set, the marks gone. */
  const end = (): void => {
    if (ended) return;
    ended = true;
    stopTick?.();
    stopTick = null;
    window.clearTimeout(holdTimer);
    if (!landed) {
      time = Number.POSITIVE_INFINITY;
      if (typed > 0) setEntry(terminal, command, `$ ${step.command}`);
      step.answer.forEach((line, i) => {
        if (answers[i] === undefined) answers[i] = addEntry(terminal, line);
      });
      land();
    }
    for (const entry of answers)
      for (const els of Object.values(entry.lines))
        for (const el of els ?? []) el.style.opacity = '';
    if (typed > 0) setEntry(terminal, command, `$ ${step.command}`);
    unsplitWords();
    for (const row of rows) row.style.removeProperty('opacity');
    if (rails !== null) {
      rails.removeAttribute('data-rails');
      for (const side of ['top', 'left', 'right', 'bottom'])
        rails.style.removeProperty(`--ts-rail-${side}`);
    }
    if (turn !== null) {
      if (turn.to === 0) turn.el.style.removeProperty('rotate');
      else turn.el.style.rotate = `${turn.to}deg`;
    }
    if (toBox !== null) lastBoxes.set(sheet, toBox);
    ring?.remove();
    flag?.remove();
    tracked?.done();
    options.onEnd?.();
    resolveDone();
  };

  const tick = (dt: number): void => {
    time += dt;
    draw(time);
  };
  const resume = (): void => {
    if (ended || stopTick !== null) return;
    if (still) {
      /* reduced motion: everything at once, the flag cut after its hold */
      draw(landAt);
      holdTimer = window.setTimeout(end, FLAG_HOLD_MS);
      stopTick = () => window.clearTimeout(holdTimer);
      return;
    }
    stopTick = onFrame(tick);
  };
  const pause = (): void => {
    stopTick?.();
    stopTick = null;
  };
  function finish(): void {
    end();
  }

  draw(0);
  resume();
  return {
    pause,
    resume,
    finish,
    done,
    get length() {
      return (Number.isFinite(flagOutAt) ? flagOutAt + flagFade : estimate) * slow;
    },
  };
}
