import { loadavg } from 'node:os';

import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import { BOOT_LIMIT_BYTES, FIELD_STILL_MS, MOTION_KEY } from '../../../src/components/home/boot';
import { BOOT_SCRIPT } from '../../../src/components/home/boot.generated';
import { HERO, NAV } from '../../../src/components/home/copy';
import { bayer8 } from '../../../../../packages/effects/src/bayer';
import { INTERLUDE_BANDS, glyphFor, glyphTone } from '../../../src/components/home/live/glyphs';
import { extraHTTPHeaders, title } from '../lib';
import { rowsForDriver } from '../matrix';

// A lane module of core/home.spec.ts (docs/LANDING.md section 3, 2.4, 6.7; the second pass). V4's:
// the motion system (V4#9: Pause Motion, H5, the one shot motions in view, rest, reduced motion,
// the hidden tab, the frame and main thread budgets, the keyboard walk) and the loops (V4#18: the
// eleven interludes, the scheduler's rule, nothing off screen). Every observation is through the
// page: an init script records, before any page script runs, `html`'s classes and `data-motion`,
// the fields' `data-field-state`, every `requestAnimationFrame` call and its callback's length,
// every timer that fires, every Web Animation's properties, every CSS animation and transition,
// every crossing of 35 percent in view of a one shot motion's target and the first paint, and the
// drivers read it with the page's own clock. A module declares a row's test only while the matrix
// holds the row (`entered`), so the module reads right on every push's tree: the first pass's
// `home.motion.hero` until V4#9 retires it for `home.motion.develop`, the loop rows from V4#18.
// Times are interaction bounds read only at a one minute load under 24 and measure rows only
// under 20 (docs/NEXT.md 4.0, LANDING.md 4.4); above the line the functional checks still run
// and the row is recorded "not read: load", never passed.

export const ROWS: readonly string[] = [
  'home.motion.hero',
  'home.motion.pause',
  'home.motion.develop',
  'home.motion.in-view',
  'home.motion.rest',
  'home.motion.reduced',
  'home.motion.hidden-tab',
  'home.budget.frame',
  'home.budget.main-thread',
  'home.a11y.keyboard-walk',
  'home.interludes.glyphs',
  'home.motion.loops',
  'home.motion.offscreen',
];

/** Whether the matrix on this tree holds a row: a test is declared only for an entered row. */
function entered(id: string): boolean {
  return rowsForDriver('core/home.spec.ts').some((row) => row.id === id);
}

/** Pause Motion is on the tree from V4#9, the push that enters its row. */
const PAUSE = entered('home.motion.pause');
/** The interludes and the scheduler's rows are on the tree from V4#18. */
const LOOPS = entered('home.motion.loops');

const INTERACTION_LOAD = 24;
const MEASURE_LOAD = 20;
/** A timer's lateness and one frame, the slack of a timing bound read at a quiet load. */
const SLACK_MS = 60;
/** One frame and the driver's own round trip, the bound of "within one frame". */
const FRAME_SLACK_MS = 100;

const DURATION = { gather: 1500, develop: 2400, line: 600, beat: 500 } as const;
const MARK = { pieces: 7 } as const;
const SEAM = { from: 82, to: 50 } as const;
const MOVED = ['left', 'top', 'width', 'height', 'right', 'bottom', 'inset'];
const INTERLUDE = { gather: 1500, hold: 7000, thin: 8500, length: 12000, tone: 0.06 } as const;

/** The one minute load average. */
function load(): number {
  return Math.round((loadavg()[0] ?? 0) * 10) / 10;
}

/** Records a reading with the load it was read at. */
function note(what: string, value: number | string): void {
  test.info().annotations.push({
    type: 'reading',
    description: `${what}: ${typeof value === 'number' ? `${Math.round(value * 10) / 10} ms` : value} at load ${load()}`,
  });
}

/**
 * The recorder, run before any page script (`addInitScript`): it wraps `requestAnimationFrame`,
 * the timers and `IntersectionObserver` callbacks with a clock, `Element.prototype.animate` with a
 * list of the properties animated, and watches `html`'s classes and `data-motion`, the fields'
 * states, the seam's value and cut, and 35 percent crossings of the one shot motions' targets as
 * they arrive with their bands.
 */
const RECORDER = String(() => {
  type Rec = {
    raf: number;
    frames: [number, number, number][];
    timers: number;
    io: [number, number][];
    props: string[];
    transitions: string[];
    css: string[];
    h1: string[];
    classes: [number, string][];
    motion: [number, string][];
    states: [number, string, string][];
    seam: [number, number][];
    cut: [number, number][];
    crossings: [number, string][];
    paints: [string, number][];
    visit: [number, string][];
  };
  const rec: Rec = {
    raf: 0,
    frames: [],
    timers: 0,
    io: [],
    props: [],
    transitions: [],
    css: [],
    h1: [],
    classes: [],
    motion: [],
    states: [],
    seam: [],
    cut: [],
    crossings: [],
    paints: [],
    visit: [],
  };
  (window as unknown as { __v4: Rec }).__v4 = rec;
  const now = (): number => performance.now();
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    rec.raf += 1;
    return raf((t) => {
      const start = now();
      try {
        cb(t);
      } finally {
        rec.frames.push([start, now() - start, t]);
      }
    });
  };
  const wrapTimer = <T extends typeof setTimeout | typeof setInterval>(fn: T): T =>
    ((handler: TimerHandler, ms?: number, ...args: unknown[]) =>
      fn(
        typeof handler === 'function'
          ? (...a: unknown[]) => {
              rec.timers += 1;
              (handler as (...b: unknown[]) => void)(...a);
            }
          : handler,
        ms,
        ...args,
      )) as unknown as T;
  window.setTimeout = wrapTimer(window.setTimeout.bind(window));
  window.setInterval = wrapTimer(window.setInterval.bind(window));
  const Observer = window.IntersectionObserver;
  window.IntersectionObserver = class extends Observer {
    constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      super((entries, observer) => {
        const start = now();
        try {
          cb(entries, observer);
        } finally {
          rec.io.push([start, now() - start]);
        }
      }, options);
    }
  };
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (
    this: Element,
    keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
    options?: number | KeyframeAnimationOptions,
  ): Animation {
    const list = Array.isArray(keyframes) ? keyframes : [keyframes ?? {}];
    for (const frame of list)
      for (const key of Object.keys(frame))
        if (!['offset', 'easing', 'composite'].includes(key)) rec.props.push(key);
    return animate.call(this, keyframes, options);
  };
  document.addEventListener('transitionrun', (e) => rec.transitions.push(e.propertyName), true);
  document.addEventListener(
    'animationstart',
    (e) => {
      rec.css.push(e.animationName);
      const target = e.target as Element;
      if (target.closest('h1') !== null || target.querySelector('h1') !== null)
        rec.h1.push(`${e.animationName} on ${target.tagName.toLowerCase()}.${target.className}`);
    },
    true,
  );
  /* the crossings of 35 percent in view of the one shot motions' targets, observed as each
     arrives with its band's chunk */
  const TARGETS: [string, string][] = [
    ['[data-band="canvas"] [data-field="canvas"]', 'canvas'],
    ['[data-band="export"] [data-seam-root]', 'export'],
    ['[data-band="close"] [data-home-slides]', 'close'],
  ];
  const named = new Map<Element, string>();
  const watch = new Observer(
    (entries) => {
      for (const e of entries)
        if (e.isIntersecting && e.intersectionRatio >= 0.35)
          rec.crossings.push([now(), named.get(e.target) ?? '']);
    },
    { threshold: [0.35] },
  );
  const attach = (): void => {
    for (const [selector, name] of TARGETS) {
      const el = document.querySelector(selector);
      if (el === null || named.has(el)) continue;
      named.set(el, name);
      watch.observe(el);
    }
  };
  new MutationObserver((list) => {
    let added = false;
    for (const m of list) {
      const target = m.target as Element;
      if (m.type === 'childList') {
        added = true;
        if (
          target.closest?.('[data-visit]') != null ||
          (target as Element).matches?.('[data-visit]')
        )
          rec.visit.push([now(), document.querySelector('[data-visit]')?.textContent ?? '']);
        continue;
      }
      if (m.type === 'characterData') {
        if (m.target.parentElement?.closest('[data-visit]') != null)
          rec.visit.push([now(), document.querySelector('[data-visit]')?.textContent ?? '']);
        continue;
      }
      if (target === document.documentElement) {
        if (m.attributeName === 'class') rec.classes.push([now(), target.className]);
        if (m.attributeName === 'data-motion')
          rec.motion.push([now(), target.getAttribute('data-motion') ?? '']);
      } else if (m.attributeName === 'data-field-state')
        rec.states.push([
          now(),
          target.getAttribute('data-field') ?? '',
          target.getAttribute('data-field-state') ?? '',
        ]);
      else if (m.attributeName === 'aria-valuenow' && target.matches('[data-seam]'))
        rec.seam.push([now(), Number(target.getAttribute('aria-valuenow'))]);
      else if (m.attributeName === 'style' && target.matches('[data-seam-root]')) {
        const cut = parseFloat((target as HTMLElement).style.getPropertyValue('--seam-cut'));
        if (Number.isFinite(cut) && cut !== rec.cut.at(-1)?.[1]) rec.cut.push([now(), cut]);
      }
    }
    if (added) attach();
  }).observe(document, {
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'data-motion', 'data-field-state', 'aria-valuenow', 'style'],
    childList: true,
    characterData: true,
  });
  /* the boot script's own writes, before the parser reaches anything */
  if (document.documentElement.className !== '')
    rec.classes.push([now(), document.documentElement.className]);
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) rec.paints.push([e.name, e.startTime]);
    }).observe({ type: 'paint', buffered: true });
  } catch {
    /* an engine without the paint timing */
  }
});

type Rec = {
  raf: number;
  frames: [number, number, number][];
  timers: number;
  io: [number, number][];
  props: string[];
  transitions: string[];
  css: string[];
  h1: string[];
  classes: [number, string][];
  motion: [number, string][];
  states: [number, string, string][];
  seam: [number, number][];
  cut: [number, number][];
  crossings: [number, string][];
  paints: [string, number][];
  visit: [number, string][];
};

type Opened = { context: BrowserContext; page: Page; requests: string[] };

type OpenOptions = {
  width?: number;
  height?: number;
  reduce?: boolean;
  theme?: 'light' | 'dark';
  /** Pause Motion stored before the visit */
  paused?: boolean;
  /** localStorage throws on every read and write */
  storageThrows?: boolean;
};

/** A fresh context with the recorder, at a viewport, in an appearance and a motion preference. */
async function open(browser: Browser, options: OpenOptions = {}): Promise<Opened> {
  const context = await browser.newContext({
    extraHTTPHeaders,
    viewport: { width: options.width ?? 1440, height: options.height ?? 900 },
    reducedMotion: options.reduce === true ? 'reduce' : 'no-preference',
  });
  await context.addInitScript(
    ([theme, paused, key]) => {
      try {
        localStorage.setItem('gt-theme', theme as string);
        if (paused === true) localStorage.setItem(key as string, 'paused');
      } catch {
        /* a context without storage */
      }
    },
    [options.theme ?? 'light', options.paused === true, MOTION_KEY] as const,
  );
  if (options.storageThrows === true)
    await context.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('denied', 'SecurityError');
        },
      });
    });
  await context.addInitScript(`(${RECORDER})()`);
  const page = await context.newPage();
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  return { context, page, requests };
}

/** Opens /home; `?slow=10` (3.8) makes the page's motions ten times longer. */
async function visit(page: Page, query = ''): Promise<void> {
  const response = await page.goto(`/home${query}`);
  expect(response?.status()).toBe(200);
  await page.waitForSelector('main#top[data-hydrated]', { timeout: 30_000 });
}

/** The first paint the page recorded: `first-paint`, or `first-contentful-paint` where only it is. */
const firstPaintOf = (r: Rec): number =>
  r.paints.find(([name]) => name === 'first-paint')?.[1] ??
  r.paints.find(([name]) => name === 'first-contentful-paint')?.[1] ??
  NaN;

const rec = (page: Page): Promise<Rec> =>
  page.evaluate(() => {
    const r = (window as unknown as { __v4: Rec }).__v4;
    /* the paint timing as the page holds it now (an observer's buffered entries may come late) */
    const paints = performance
      .getEntriesByType('paint')
      .map((e) => [e.name, e.startTime] as [string, number]);
    return { ...r, paints: paints.length > 0 ? paints : r.paints };
  });
const pageNow = (page: Page): Promise<number> => page.evaluate(() => performance.now());

async function liveReady(page: Page): Promise<void> {
  await page.waitForSelector('main#top[data-live="ready"]', { timeout: 30_000 });
}

/**
 * Where each field is the subject (the frame's filmstrip carries small prints of slides 1 and 6
 * with the same `data-field` names, which never develop).
 */
const FIELD_AT: Readonly<Record<string, string>> = {
  hero: '[data-sheet="hero"] [data-field="hero"]',
  canvas: '[data-band="canvas"] [data-field="canvas"]',
};

/** Whether a field box shows its still: its still layer is visible. */
function stillShown(page: Page, field: string): Promise<boolean> {
  return page.evaluate(
    (selector) => {
      const box = document.querySelector(selector);
      if (box === null) return false;
      const layer = [...box.children].find((c) => c.tagName !== 'CANVAS');
      const style = layer ? getComputedStyle(layer) : getComputedStyle(box, '::before');
      return style.visibility === 'visible' && style.display !== 'none';
    },
    FIELD_AT[field] ?? `[data-field="${field}"]`,
  );
}

/** Scrolls by the wheel, natively, in steps, with a pause after each (no smooth scrolling). */
async function wheelTo(page: Page, y: number, step = 400, pause = 120): Promise<void> {
  /* a wheel the page has not scrolled for yet (a busy main thread: at load 41 on 2026-10-03 the
     loops row stayed at the page's foot with the hero's stage out of view) is waited for, and
     five such wheels in a row are the page's end */
  let stalls = 0;
  for (;;) {
    const at = await page.evaluate(() => scrollY);
    const left = y - at;
    if (Math.abs(left) < 2) return;
    await page.mouse.wheel(0, Math.sign(left) * Math.min(step, Math.abs(left)));
    await page.waitForTimeout(pause);
    if ((await page.evaluate(() => scrollY)) !== at) {
      stalls = 0;
      continue;
    }
    stalls += 1;
    if (stalls >= 5) return;
    await page.waitForTimeout(pause * 2);
  }
}

/** The page y at which an element is centred in the viewport. */
function yToSee(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el === null) return scrollY;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.round(r.top + scrollY + r.height / 2 - innerHeight / 2));
  }, selector);
}

/** Loads every band: a native scroll to the bottom and back, then a wait for the inserts. */
async function loadEveryBand(page: Page): Promise<void> {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await wheelTo(page, height, 700, 150);
  await page.waitForTimeout(1_000);
  await wheelTo(page, 0, 1600, 60);
  await page.waitForTimeout(500);
}

const SELECTORS = {
  canvas: '[data-band="canvas"] [data-field="canvas"]',
  export: '[data-band="export"] [data-seam-root]',
  close: '[data-band="close"] [data-home-slides]',
} as const;

/**
 * Brings a band's chunk in while the band is still below the viewport (4.2: a band's chunk is
 * requested within two viewport heights), so its one shot motion is armed at its first
 * observation: scrolls until the band's top is half a viewport under the viewport's bottom and
 * waits for its reserved box to be filled. A band whose box the document fills needs no wait.
 */
async function loadBelow(page: Page, band: 'canvas' | 'export' | 'close'): Promise<void> {
  const top = await page.evaluate(
    (name) =>
      document.querySelector(`[data-band="${name}"]`)!.getBoundingClientRect().top + scrollY,
    band,
  );
  const vh = await page.evaluate(() => innerHeight);
  const y = Math.max(0, Math.round(top - vh * 1.5));
  if (y > (await page.evaluate(() => scrollY))) await wheelTo(page, y);
  await page.waitForSelector(
    `[data-reserve="${band}"][data-filled], [data-band="${band}"]:not(:has([data-reserve]))`,
    {
      timeout: 60_000,
    },
  );
  await page.waitForSelector(SELECTORS[band], { timeout: 60_000 });
  await page.waitForTimeout(300);
}

/** The frame's title on slide 1 (2.2): the editor's selection replica works on it. */
const frameTitle = (page: Page) =>
  page.locator('[data-hero-frame] [data-sheet="hero"] [data-object="title#heading"]').first();

/** Moves the frame's title by three nudges and takes it back with the hero's Undo. */
async function nudgeAndUndo(page: Page): Promise<void> {
  const title = frameTitle(page);
  if ((await title.count()) === 0) return;
  await title.focus();
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(800);
  const undo = page.locator('[data-undo="hero"]');
  if ((await undo.getAttribute('aria-disabled')) !== 'true') await undo.click({ timeout: 10_000 });
}

/** Hides or shows the tab the way the page reads it: `document.hidden` and a `visibilitychange`. */
async function setTabHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (h ? 'hidden' : 'visible'),
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

/** Frame callbacks, timers fired and task time over `ms` with no input. */
async function idle(
  page: Page,
  context: BrowserContext,
  ms = 2_000,
): Promise<{ raf: number; timers: number; taskPerSecond: number }> {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const task = async (): Promise<number> =>
    (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration')
      ?.value ?? 0;
  /* the two counts alone: the whole record grows with every frame of the visit, and copying it
     out of the page allocates enough for the collector to work through the window after it */
  const counts = (): Promise<{ raf: number; timers: number }> =>
    page.evaluate(() => {
      const r = (window as unknown as { __v4: { raf: number; timers: number } }).__v4;
      return { raf: r.raf, timers: r.timers };
    });
  const before = await counts();
  const task0 = await task();
  await page.waitForTimeout(ms);
  const task1 = await task();
  const after = await counts();
  await cdp.detach();
  return {
    raf: after.raf - before.raf,
    timers: after.timers - before.timers,
    taskPerSecond: ((task1 - task0) * 1000 * 1000) / ms,
  };
}

/**
 * Two readings of `idle` back to back, for a bound on the page's task time at rest: V8's memory
 * reducer runs one major collection a few seconds after a page goes quiet (10 to 18 ms of
 * `MajorGC` on the main thread, read in a trace at 19:10 on 2026-10-03), which is the engine's
 * and lands in either window; the task time judged is the smaller, the frames and timers are both
 * windows' together, and both task times are noted.
 */
async function restReading(
  page: Page,
  context: BrowserContext,
): Promise<{ raf: number; timers: number; taskPerSecond: number; windows: string }> {
  const a = await idle(page, context);
  const b = await idle(page, context);
  return {
    raf: a.raf + b.raf,
    timers: a.timers + b.timers,
    taskPerSecond: Math.min(a.taskPerSecond, b.taskPerSecond),
    windows: `${Math.round(a.taskPerSecond * 10) / 10} and ${Math.round(b.taskPerSecond * 10) / 10} ms`,
  };
}

/** The scheduler's reading (3.8). */
const motionState = (page: Page) =>
  page.evaluate(() => ({
    paused: window.tsHomeMotion?.paused ?? null,
    running: window.tsHomeMotion?.running() ?? [],
    registered: window.tsHomeMotion?.registered() ?? [],
    stopped: window.tsHomeMotion?.stopped?.() ?? [],
    visible: window.tsHomeMotion?.visible?.() ?? {},
  }));

const toggle = (page: Page) => page.locator('[data-motion-toggle]');

/** Presses Pause Motion without scrolling the page to the nav (the button's own click). */
const pressInPlace = (page: Page): Promise<void> =>
  page.evaluate(() => document.querySelector<HTMLButtonElement>('[data-motion-toggle]')?.click());

/** H5 in one visit: the hero field's develop, or its still shown by the first paint plus 3.0 s. */
async function readDevelop(page: Page, label: string, quiet: boolean): Promise<void> {
  await liveReady(page);
  await page.waitForFunction(() => window.tsHomeBoot?.ended === true, undefined, {
    timeout: 30_000,
  });
  await page.waitForTimeout(DURATION.gather + 400);
  const r = await rec(page);
  const firstPaint = firstPaintOf(r) ?? NaN;
  const hero = r.states.filter(([, name]) => name === 'hero');
  const developing = hero.find(([, , state]) => state === 'developing');
  const still = hero.find(([, , state]) => state === 'still');
  const introOff = r.classes.find(([, cls]) => !cls.includes('ts-intro'))?.[0] ?? NaN;
  expect(r.classes[0]?.[1] ?? '', 'ts-intro from the boot').toContain('ts-intro');
  if (developing !== undefined) {
    expect(still, 'the develop ends on the still').toBeDefined();
    note(`${label}: the develop started after the first paint`, developing[0] - firstPaint);
    note(`${label}: the develop ran`, still![0] - developing[0]);
    if (quiet) {
      expect(developing[0] - firstPaint).toBeLessThanOrEqual(FIELD_STILL_MS + SLACK_MS);
      expect(Math.abs(still![0] - developing[0] - DURATION.gather)).toBeLessThanOrEqual(
        2 * SLACK_MS,
      );
    }
  } else {
    note(`${label}: the develop`, 'not started; the still showed when ts-intro left');
    note(`${label}: ts-intro left after the first paint`, introOff - firstPaint);
    if (quiet) expect(introOff - firstPaint).toBeLessThanOrEqual(FIELD_STILL_MS + SLACK_MS);
  }
  expect(await stillShown(page, 'hero'), 'the field rests on its still').toBe(true);
  expect(r.h1, 'CSS animations on the h1 or what holds it').toEqual([]);
}

/** The develop never runs: no `ts-intro`, no developing state, the still from the first paint. */
async function readNoDevelop(page: Page): Promise<void> {
  await liveReady(page);
  await page.waitForTimeout(DURATION.gather + 500);
  const r = await rec(page);
  expect(
    r.classes.some(([, cls]) => cls.includes('ts-intro')),
    'no ts-intro',
  ).toBe(false);
  expect(r.states.filter(([, name, state]) => name === 'hero' && state === 'developing')).toEqual(
    [],
  );
  expect(await stillShown(page, 'hero')).toBe(true);
}

/** The expected gathered cells of an interlude's canvas (the glyph's print at s = 1). */
function gatheredCells(
  next: (typeof INTERLUDE_BANDS)[number],
  cols: number,
  rows: number,
): number[] {
  const tone = glyphTone(glyphFor(next, cols * 2 < 720), cols, rows);
  const out: number[] = [];
  for (let y = 0; y < rows; y += 1)
    for (let x = 0; x < cols; x += 1)
      out.push((tone[y * cols + x] ?? 0) > (bayer8(y, x) + 0.5) / 64 ? 1 : 0);
  return out;
}

/** The interludes the page renders, in its order (eleven from V4#20; one before each band till then). */
function renderedInterludes(page: Page): Promise<(typeof INTERLUDE_BANDS)[number][]> {
  return page.evaluate(
    (known) =>
      [...document.querySelectorAll<HTMLElement>('main > [data-interlude]')]
        .map((el) => el.dataset['interlude'] ?? '')
        .filter((name): name is (typeof known)[number] => (known as string[]).includes(name)),
    [...INTERLUDE_BANDS],
  );
}

/** An interlude canvas's inked cells, read in the page. */
function inkedCells(
  page: Page,
  next: string,
): Promise<{ cols: number; rows: number; ink: number[] }> {
  return page.evaluate((name) => {
    const canvas = document.querySelector<HTMLCanvasElement>(`[data-interlude="${name}"] canvas`);
    if (canvas === null) return { cols: 0, rows: 0, ink: [] };
    const ctx = canvas.getContext('2d');
    const data = ctx?.getImageData(0, 0, canvas.width, canvas.height).data;
    const ink: number[] = [];
    for (let i = 0; i < canvas.width * canvas.height; i += 1)
      ink.push((data?.[i * 4 + 3] ?? 0) > 0 ? 1 : 0);
    return { cols: canvas.width, rows: canvas.height, ink };
  }, next);
}

/** The element a loop id registers on (3.8): the hero's stage, an interlude, the people, the patterns. */
function loopSelector(id: string): string {
  if (id === 'L-H') return '[data-hero-stage]';
  if (id === 'P-L') return '[data-reserve="people"]';
  if (id === 'P-T') return '[data-reserve="patterns"]';
  if (id.startsWith('I1:')) return `[data-interlude="${id.slice(3)}"]`;
  return `[data-band="${id}"]`;
}

/** Scrolls a loop's element to the middle of the viewport, natively. */
async function bringToView(page: Page, id: string): Promise<void> {
  await wheelTo(page, await yToSee(page, loopSelector(id)), 900, 80);
}

/** A scroll position where no registered loop's element is in view, or null. */
function quietSpot(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const ids = window.tsHomeMotion?.registered() ?? [];
    const sel = (id: string): string =>
      id === 'L-H'
        ? '[data-hero-stage]'
        : id === 'P-L'
          ? '[data-reserve="people"]'
          : id === 'P-T'
            ? '[data-reserve="patterns"]'
            : id.startsWith('I1:')
              ? `[data-interlude="${id.slice(3)}"]`
              : `[data-band="${id}"]`;
    const boxes = ids
      .map((id) => document.querySelector(sel(id))?.getBoundingClientRect())
      .filter((r): r is DOMRect => r !== undefined)
      .map((r) => [r.top + scrollY, r.bottom + scrollY] as const)
      .sort((a, b) => a[0] - b[0]);
    const vh = innerHeight;
    const max = document.documentElement.scrollHeight - vh;
    for (let y = 0; y <= max; y += 20)
      if (boxes.every(([top, bottom]) => bottom <= y || top >= y + vh)) return y;
    return null;
  });
}

export function rows(): void {
  /* ---- H5 and the visit (the first pass's id until V4#9 retires it) ---- */
  for (const id of ['home.motion.hero', 'home.motion.develop'] as const) {
    if (!entered(id)) continue;
    test(title(id), async ({ browser }) => {
      test.setTimeout(150_000);
      const quiet = load() < INTERACTION_LOAD;
      const { context, page } = await open(browser);
      try {
        for (let index = 0; index < HERO.visit.length; index += 1) {
          const h1 = page.locator('h1');
          /* the sentence this visit shows: the stored index (a dev server's first load may reload
             once while it optimizes, which turns the visit) */
          const stored = await page
            .evaluate(() => localStorage.getItem('ts-home-visit'))
            .catch(() => null);
          const turn = index === 0 ? null : Number(stored ?? 0) % HERO.visit.length;
          await visit(page);
          const before = await h1.boundingBox();
          await readDevelop(page, `visit ${index + 1}`, quiet);
          expect(await h1.boundingBox()).toEqual(before);
          /* the visit's sentence, set before its first paint and never changed after (2.2) */
          const shown = (await page.locator('[data-visit]').textContent()) ?? '';
          expect(HERO.visit).toContain(shown);
          if (turn !== null)
            expect(shown, 'the next visit shows the next sentence').toBe(HERO.visit[turn]);
          const r = await rec(page);
          const firstPaint = firstPaintOf(r) ?? Infinity;
          for (const [at, text] of r.visit)
            if (at > firstPaint) expect(text, 'no change after the first paint').toBe(shown);
        }
      } finally {
        await context.close();
      }
      /* reduced motion and Pause Motion stored: the still from the first paint, no develop */
      for (const options of [{ reduce: true }, { paused: true }] as const) {
        const other = await open(browser, options);
        try {
          await visit(other.page);
          await readNoDevelop(other.page);
        } finally {
          await other.context.close();
        }
      }
      test.skip(!quiet, `not read: load ${load()} (the functional checks passed)`);
    });
  }

  /* ---- Pause Motion (3.2) ---- */
  if (entered('home.motion.pause'))
    test(title('home.motion.pause'), async ({ browser }) => {
      test.setTimeout(240_000);
      let unread = load() >= INTERACTION_LOAD;
      const { context, page } = await open(browser, { height: 700 });
      try {
        await visit(page, '?slow=10');
        /* the button: after Dark in the navigation, a toggle reading Pause Motion */
        await expect(toggle(page)).toHaveText(NAV.motion.pause, { useInnerText: true });
        await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
        const order = await page.evaluate(() => {
          const dark = document.querySelector('[data-theme-option="dark"]');
          const button = document.querySelector('[data-motion-toggle]');
          return dark !== null && button !== null
            ? Boolean(dark.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING) &&
                button.closest('header') !== null
            : false;
        });
        expect(order, 'after Dark, in the navigation').toBe(true);
        await liveReady(page);
        /* a running one shot motion lands at its end state within one frame: C1 at a tenth of
           speed, pressed mid develop */
        await loadBelow(page, 'canvas');
        await wheelTo(page, await yToSee(page, SELECTORS.canvas));
        await page.waitForFunction(
          () =>
            document
              .querySelector('[data-band="canvas"] [data-field="canvas"]')
              ?.getAttribute('data-field-state') === 'developing',
          undefined,
          { timeout: 30_000 },
        );
        await page.waitForTimeout(3_000);
        expect(await page.locator(SELECTORS.canvas).getAttribute('data-field-state')).toBe(
          'developing',
        );
        const pressedAt = await pageNow(page);
        await toggle(page).click();
        await page.waitForFunction(
          () =>
            document
              .querySelector('[data-band="canvas"] [data-field="canvas"]')
              ?.getAttribute('data-field-state') === 'still',
          undefined,
          { timeout: 5_000 },
        );
        const landed = (await rec(page)).states.find(
          ([at, name, state]) => name === 'canvas' && state === 'still' && at >= pressedAt,
        );
        note('C1 at its end state after the press', (landed?.[0] ?? NaN) - pressedAt);
        if (!unread)
          expect((landed?.[0] ?? Infinity) - pressedAt).toBeLessThanOrEqual(FRAME_SLACK_MS);
        await expect(toggle(page)).toHaveText(NAV.motion.play, { useInnerText: true });
        await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
        expect(await page.evaluate((key) => localStorage.getItem(key), MOTION_KEY)).toBe('paused');
        /* 0 frame callbacks in the next 2 s without input, at the top, the middle and the bottom */
        const height = await page.evaluate(
          () => document.documentElement.scrollHeight - innerHeight,
        );
        for (const [where, y] of [
          ['top', 0],
          ['middle', Math.round(height / 2)],
          ['bottom', height],
        ] as const) {
          await page.evaluate((to) => window.scrollTo(0, to), y);
          await page.waitForTimeout(1_500);
          const quietReading = await idle(page, context);
          note(`paused at the ${where}: frame callbacks in 2 s`, `${quietReading.raf}`);
          expect(quietReading.raf, `frame callbacks at the ${where}`).toBe(0);
          expect((await motionState(page)).running, `loops running at the ${where}`).toEqual([]);
        }
        /* visitor motions still run: a drag on the lighthouse and the show */
        const heading = page.locator('[data-band="canvas"] [data-object="lighthouse#h"]');
        if ((await heading.count()) > 0) {
          await heading.scrollIntoViewIfNeeded();
          const box = (await heading.boundingBox())!;
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30, {
            steps: 6,
          });
          await page.mouse.up();
          const moved = (await heading.boundingBox())!;
          expect(Math.round(moved.x - box.x), 'the drag moved the heading').toBeGreaterThan(30);
        }
        const present = page.locator('[data-present]');
        if ((await present.count()) > 0) {
          await present.scrollIntoViewIfNeeded();
          const props = (await rec(page)).props.length;
          await present.click();
          await expect(page.locator('[data-show]')).toBeVisible();
          expect((await rec(page)).props.length, 'the show moved').toBeGreaterThan(props);
          await page.keyboard.press('Escape');
        }
      } finally {
        await context.close();
      }
      /* remembered: a reload paints with the button pressed, the still and nothing starting */
      const again = await open(browser, { paused: true });
      try {
        await visit(again.page);
        const first = await again.page.evaluate(() => ({
          motion: document.documentElement.getAttribute('data-motion'),
        }));
        expect(first.motion).toBe('paused');
        const r = await rec(again.page);
        expect(
          r.motion.filter(([, v]) => v !== 'paused'),
          'never played',
        ).toEqual([]);
        await expect(toggle(again.page)).toHaveAttribute('aria-pressed', 'true');
        await expect(toggle(again.page)).toHaveText(NAV.motion.play, { useInnerText: true });
        await readNoDevelop(again.page);
        await again.page.waitForTimeout(1_000);
        const quietReading = await idle(again.page, again.context);
        expect(quietReading.raf, 'no automatic motion starts').toBe(0);
        expect((await motionState(again.page)).running).toEqual([]);
        /* Play puts the key away */
        await toggle(again.page).click();
        await expect(toggle(again.page)).toHaveAttribute('aria-pressed', 'false');
        expect(
          await again.page.evaluate((key) => localStorage.getItem(key), MOTION_KEY),
        ).toBeNull();
      } finally {
        await again.context.close();
      }
      /* storage that throws: the page plays and the button works for the visit */
      const blind = await open(browser, { storageThrows: true });
      try {
        await visit(blind.page);
        expect(
          await blind.page.evaluate(() => document.documentElement.getAttribute('data-motion')),
        ).toBeNull();
        await toggle(blind.page).click();
        expect(
          await blind.page.evaluate(() => document.documentElement.getAttribute('data-motion')),
        ).toBe('paused');
        await expect(toggle(blind.page)).toHaveAttribute('aria-pressed', 'true');
      } finally {
        await blind.context.close();
      }
      /* hidden under reduced motion */
      const reduced = await open(browser, { reduce: true });
      try {
        await visit(reduced.page);
        await expect(toggle(reduced.page)).toBeHidden();
      } finally {
        await reduced.context.close();
      }
      if (load() >= INTERACTION_LOAD) unread = true;
      test.skip(unread, `not read: load ${load()} (the functional checks passed)`);
    });

  /* ---- the one shot motions at 35 percent in view (3.5) ---- */
  if (entered('home.motion.in-view'))
    test(title('home.motion.in-view'), async ({ browser }) => {
      test.setTimeout(180_000);
      const quiet = load() < INTERACTION_LOAD;
      const { context, page } = await open(browser, { height: 700 });
      try {
        await visit(page);
        await liveReady(page);
        for (const target of ['canvas', 'export', 'close'] as const) {
          await loadBelow(page, target);
          await wheelTo(page, await yToSee(page, SELECTORS[target]));
          await page.waitForTimeout(target === 'canvas' ? 3_200 : 2_200);
        }
        const r = await rec(page);
        const crossed = (name: string): number =>
          r.crossings.find(([, n]) => n === name)?.[0] ?? NaN;
        /* armed below the viewport: the lighthouse developing from a blank canvas, the seam at 82 */
        expect(r.states.some(([, n, s]) => n === 'canvas' && s === 'developing')).toBe(true);
        expect(
          r.cut.map(([, v]) => v),
          'E1 arms at 82 and rests at 50',
        ).toEqual([SEAM.from, SEAM.to]);
        const c1 =
          (r.states.find(([, n, s]) => n === 'canvas' && s === 'still')?.[0] ?? NaN) -
          crossed('canvas');
        const e1 = (r.cut.at(-1)?.[0] ?? NaN) - crossed('export');
        note('C1 from 35 percent in view to the still', c1);
        note('E1 from 35 percent in view to 50 percent (a beat, then 600 ms)', e1);
        const values = r.seam.map(([, v]) => v);
        for (let i = 1; i < values.length; i += 1)
          expect(values[i]!).toBeLessThanOrEqual(values[i - 1]!);
        const pieces = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('[data-band="close"] [data-mark-piece]')].map(
            (p) => ({
              opacity: getComputedStyle(p).opacity,
              animations: p.getAnimations().length,
            }),
          ),
        );
        expect(pieces.length).toBe(MARK.pieces);
        for (const p of pieces) expect(p).toEqual({ opacity: '1', animations: 0 });
        expect(new Set(r.props).has('translate'), 'K1 moved by translate').toBe(true);
        if (quiet) {
          expect(Math.abs(c1 - DURATION.develop)).toBeLessThanOrEqual(2 * SLACK_MS);
          expect(Math.abs(e1 - DURATION.beat - DURATION.line)).toBeLessThanOrEqual(2 * SLACK_MS);
        }
        /* never again */
        const before = await rec(page);
        await wheelTo(page, 0, 1600, 60);
        for (const target of ['canvas', 'export', 'close'] as const) {
          await wheelTo(page, await yToSee(page, SELECTORS[target]), 1600, 60);
          await page.waitForTimeout(300);
        }
        const after = await rec(page);
        expect(after.states.filter(([, n]) => n === 'canvas').length).toBe(
          before.states.filter(([, n]) => n === 'canvas').length,
        );
        expect(after.cut.length).toBe(before.cut.length);
      } finally {
        await context.close();
      }
      /* a band above the viewport at its first observation renders final: opened at the close */
      const second = await open(browser, { height: 700 });
      try {
        const response = await second.page.goto('/home#close');
        expect(response?.status()).toBe(200);
        await liveReady(second.page);
        await second.page.waitForTimeout(2_000);
        await wheelTo(second.page, 0, 1600, 60);
        await second.page.waitForTimeout(800);
        const r = await rec(second.page);
        expect(r.states.filter(([, n, s]) => n === 'canvas' && s === 'developing')).toEqual([]);
        expect(r.cut.filter(([, v]) => v === SEAM.from)).toEqual([]);
        const hidden = await second.page.evaluate(
          () =>
            [
              ...document.querySelectorAll<HTMLElement>('[data-band="close"] [data-mark-piece]'),
            ].filter((p) => getComputedStyle(p).opacity !== '1').length,
        );
        expect(hidden).toBe(0);
      } finally {
        await second.context.close();
      }
      /* with Pause Motion pressed before the bands arrive, each lands at its end state */
      if (!PAUSE) {
        test.skip(!quiet, `not read: load ${load()} (the functional checks passed)`);
        return;
      }
      const third = await open(browser, { height: 700 });
      try {
        await visit(third.page);
        await liveReady(third.page);
        await toggle(third.page).click();
        for (const target of ['canvas', 'export', 'close'] as const) {
          await loadBelow(third.page, target);
          await wheelTo(third.page, await yToSee(third.page, SELECTORS[target]));
          await third.page.waitForTimeout(400);
        }
        expect(
          await third.page.locator(SELECTORS.canvas).getAttribute('data-field-state'),
        ).not.toBe('developing');
        expect(await stillShown(third.page, 'canvas')).toBe(true);
        const r = await rec(third.page);
        expect(r.cut.at(-1)?.[1] ?? SEAM.to, 'the seam at 50').toBe(SEAM.to);
        const pieces = await third.page.evaluate(
          () =>
            [
              ...document.querySelectorAll<HTMLElement>('[data-band="close"] [data-mark-piece]'),
            ].filter((p) => getComputedStyle(p).opacity !== '1' || p.getAnimations().length > 0)
              .length,
        );
        expect(pieces, 'the mark drawn still').toBe(0);
      } finally {
        await third.context.close();
      }
      test.skip(!quiet, `not read: load ${load()} (the functional checks passed)`);
    });

  /* ---- the page at rest with Pause Motion (3.7, 4.1) ---- */
  if (entered('home.motion.rest'))
    test(title('home.motion.rest'), async ({ browser }) => {
      test.setTimeout(240_000);
      let unread = false;
      const { context, page } = await open(browser, { height: 700 });
      try {
        await visit(page);
        await liveReady(page);
        /* every band plays: a full slow scroll with the one shot motions and the loops in view,
           the hero's title nudged and put back, and the show opened and closed */
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        await wheelTo(page, height, 500, 400);
        await page.waitForTimeout(3_000);
        await wheelTo(page, 0, 1600, 60);
        await nudgeAndUndo(page);
        await page.waitForTimeout(900);
        const present = page.locator('[data-present]');
        if ((await present.count()) > 0) {
          await present.scrollIntoViewIfNeeded();
          await present.click({ timeout: 10_000 });
          await page.waitForTimeout(800);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(800);
        }
        if (PAUSE) await toggle(page).click();
        const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
        for (const [where, y] of [
          ['top', 0],
          ['middle', Math.round(max / 2)],
          ['bottom', max],
        ] as const) {
          await page.evaluate((to) => window.scrollTo(0, to), y);
          await page.waitForTimeout(2_500);
          const reading = await restReading(page, context);
          const animations = await page.evaluate(() => document.getAnimations().length);
          note(`paused at the ${where}: frame callbacks in 4 s`, `${reading.raf}`);
          note(`paused at the ${where}: task time a second, two windows`, reading.windows);
          expect(reading.raf, `rAF calls at the ${where}`).toBe(0);
          expect(animations, `animations at the ${where}`).toBe(0);
          if (load() < INTERACTION_LOAD) expect(reading.taskPerSecond).toBeLessThanOrEqual(2);
          else unread = true;
        }
        const r = await rec(page);
        for (const prop of [...r.props, ...r.transitions]) expect(MOVED).not.toContain(prop);
        note('properties animated by script', [...new Set(r.props)].join(', '));
        note('properties transitioned', [...new Set(r.transitions)].join(', '));
      } finally {
        await context.close();
      }
      test.skip(unread, `not read: load ${load()} (the counts passed)`);
    });

  /* ---- reduced motion (3.9) ---- */
  if (entered('home.motion.reduced'))
    test(title('home.motion.reduced'), async ({ browser }) => {
      test.setTimeout(180_000);
      const { context, page, requests } = await open(browser, { reduce: true });
      try {
        await visit(page);
        await liveReady(page);
        await page.waitForTimeout(500);
        const loaded = await rec(page);
        expect(loaded.classes.some(([, cls]) => cls.includes('ts-intro'))).toBe(false);
        expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
        expect(await stillShown(page, 'hero')).toBe(true);
        if (PAUSE) await expect(toggle(page)).toBeHidden();
        /* a full native scroll moves nothing and prints every field at once */
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        await wheelTo(page, height, 500, 120);
        await page.waitForTimeout(800);
        expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
        for (const field of ['canvas', 'hero']) expect(await stillShown(page, field)).toBe(true);
        expect((await motionState(page)).running, 'no loop runs').toEqual([]);
        /* every interlude at its gathered glyph */
        for (const next of LOOPS ? INTERLUDE_BANDS : []) {
          const read = await inkedCells(page, next);
          if (read.cols === 0) continue;
          expect(read.ink, `the ${next} interlude gathered`).toEqual(
            gatheredCells(next, read.cols, read.rows),
          );
        }
        /* the patterns band: no shader chunk, both sides the still frame */
        expect(requests.filter((url) => /pattern-mount|home-pattern/.test(url))).toEqual([]);
        /* the hero's title nudged and put back by cuts */
        await wheelTo(page, 0, 1600, 60);
        await nudgeAndUndo(page);
        expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
        const present = page.locator('[data-present]');
        if ((await present.count()) > 0) {
          await present.scrollIntoViewIfNeeded();
          await present.click();
          await expect(page.locator('[data-show]')).toBeVisible();
          expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
          await page.keyboard.press('Escape');
        }
        const r = await rec(page);
        expect(r.props, 'no Web Animation is created').toEqual([]);
        expect(r.states.filter(([, , s]) => s === 'developing')).toEqual([]);
        expect(r.css.filter((name) => name !== '')).toEqual([]);
      } finally {
        await context.close();
      }
    });

  /* ---- the hidden tab (3.8) ---- */
  if (entered('home.motion.hidden-tab'))
    test(title('home.motion.hidden-tab'), async ({ browser }) => {
      test.setTimeout(120_000);
      const { context, page } = await open(browser, { height: 700 });
      try {
        await visit(page, '?slow=10');
        await liveReady(page);
        await loadBelow(page, 'canvas');
        await wheelTo(page, await yToSee(page, SELECTORS.canvas));
        await page.waitForFunction(
          () =>
            document
              .querySelector('[data-band="canvas"] [data-field="canvas"]')
              ?.getAttribute('data-field-state') === 'developing',
          undefined,
          { timeout: 30_000 },
        );
        await page.waitForTimeout(2_000);
        await setTabHidden(page, true);
        expect(await page.locator(SELECTORS.canvas).getAttribute('data-field-state')).toBe('still');
        const hiddenReading = await idle(page, context, 1_000);
        expect(hiddenReading.raf, 'no frame on a hidden tab').toBe(0);
        await setTabHidden(page, false);
        await page.waitForTimeout(300);
        expect(await page.locator(SELECTORS.canvas).getAttribute('data-field-state')).toBe('still');
      } finally {
        await context.close();
      }
    });

  /* ---- the frame and main thread budgets (measure rows, 4.1) ---- */
  if (entered('home.budget.frame'))
    test(title('home.budget.frame'), async ({ browser }) => {
      test.setTimeout(240_000);
      test.skip(load() >= MEASURE_LOAD, `not read: load ${load()}`);
      for (const rate of [1, 4]) {
        const { context, page } = await open(browser, { height: 700 });
        try {
          const cdp = await context.newCDPSession(page);
          await cdp.send('Emulation.setCPUThrottlingRate', { rate });
          await visit(page);
          await liveReady(page);
          await page.waitForTimeout(2_500);
          const height = await page.evaluate(() => document.documentElement.scrollHeight);
          await wheelTo(page, height, 500, 600);
          await page.waitForTimeout(2_000);
          const r = await rec(page);
          const longestFrame = Math.max(0, ...r.frames.map(([, d]) => d));
          const longestEntering = Math.max(0, ...r.io.map(([, d]) => d));
          note(`${rate}x CPU: the longest frame callback`, longestFrame);
          note(`${rate}x CPU: the longest observer callback (a band entering)`, longestEntering);
          expect(longestFrame).toBeLessThanOrEqual(rate === 1 ? 2 : 8);
          expect(longestEntering).toBeLessThanOrEqual(rate === 1 ? 10 : 35);
        } finally {
          await context.close();
        }
      }
    });

  if (entered('home.budget.main-thread'))
    test(title('home.budget.main-thread'), async ({ browser }) => {
      test.setTimeout(120_000);
      /* the boot script's size reads at any load */
      expect(Buffer.byteLength(BOOT_SCRIPT)).toBeGreaterThan(0);
      expect(Buffer.byteLength(BOOT_SCRIPT)).toBeLessThanOrEqual(BOOT_LIMIT_BYTES);
      note('the boot script', `${Buffer.byteLength(BOOT_SCRIPT)} B`);
      test.skip(load() >= MEASURE_LOAD, `not read: load ${load()}`);
      const { context, page } = await open(browser);
      try {
        await browser.startTracing(page, {
          categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'loading'],
        });
        await visit(page);
        await liveReady(page);
        await page.waitForTimeout(6_500);
        const trace = JSON.parse((await browser.stopTracing()).toString()) as {
          traceEvents: { name: string; ts: number; dur?: number; ph: string; tid: number }[];
        };
        const events = trace.traceEvents;
        const lcp = events.filter((e) => e.name === 'largestContentfulPaint::Candidate').at(-1);
        const nav = events.find(
          (e) => e.name === 'navigationStart' || e.name === 'NavigationStart',
        );
        const main = lcp?.tid ?? nav?.tid;
        const scripts = events.filter(
          (e) =>
            e.tid === main &&
            e.ph === 'X' &&
            [
              'EvaluateScript',
              'v8.compile',
              'FunctionCall',
              'v8.callFunction',
              'TimerFire',
              'FireAnimationFrame',
            ].includes(e.name),
        );
        const before = scripts.filter((e) => e.ts + (e.dur ?? 0) <= (lcp?.ts ?? 0));
        const scriptBeforeLcp = before.reduce((n, e) => n + (e.dur ?? 0), 0) / 1000;
        const longest = Math.max(0, ...scripts.map((e) => (e.dur ?? 0) / 1000));
        note('script task time before LCP at 1x', scriptBeforeLcp);
        note('the longest script task', longest);
        expect(scriptBeforeLcp).toBeLessThanOrEqual(120);
        expect(longest).toBeLessThanOrEqual(50);
      } finally {
        await context.close();
      }
    });

  /* ---- the keyboard walk (5) ---- */
  if (entered('home.a11y.keyboard-walk'))
    test(title('home.a11y.keyboard-walk'), async ({ browser }) => {
      test.setTimeout(300_000);
      const { context, page } = await open(browser);
      try {
        await visit(page);
        await liveReady(page);
        await loadEveryBand(page);
        if (PAUSE) await expect(toggle(page)).toBeVisible();
        const expected = await page.evaluate(() => {
          const visible = (el: Element): boolean => {
            const r = el.getBoundingClientRect();
            const s = getComputedStyle(el);
            return (
              r.width > 0 &&
              r.height > 0 &&
              s.visibility === 'visible' &&
              el.closest('[inert],[aria-hidden="true"],[hidden]') === null
            );
          };
          const list = [
            ...document.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]',
            ),
          ].filter((el) => el.tabIndex >= 0 && visible(el));
          (window as unknown as { __walk: HTMLElement[] }).__walk = list;
          return list.map((el) => el.outerHTML.slice(0, 120));
        });
        const togglePlace = await page.evaluate(() =>
          (window as unknown as { __walk: HTMLElement[] }).__walk.indexOf(
            document.querySelector('[data-motion-toggle]') as HTMLElement,
          ),
        );
        if (PAUSE) expect(togglePlace, 'Pause Motion in the walk').toBeGreaterThanOrEqual(0);
        const reached: number[] = [];
        const problems: string[] = [];
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        for (let i = 0; i < expected.length + 5; i += 1) {
          await page.keyboard.press('Tab');
          const focus = await page.evaluate(() => {
            const el = document.activeElement as HTMLElement | null;
            if (el === null || el === document.body) return null;
            const r = el.getBoundingClientRect();
            const s = getComputedStyle(el);
            const ring = document.querySelector('.ts-home-sel:not([hidden])') !== null;
            const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
            return {
              index: (window as unknown as { __walk: HTMLElement[] }).__walk.indexOf(el),
              html: el.outerHTML.slice(0, 120),
              shown: r.width > 0 && r.height > 0 && s.visibility === 'visible',
              indicator: outline || ring || s.boxShadow !== 'none',
            };
          });
          if (focus === null) break;
          if (reached.at(-1) === focus.index && focus.index !== -1) break;
          reached.push(focus.index);
          if (focus.index === -1) problems.push(`outside the list: ${focus.html}`);
          if (!focus.shown) problems.push(`hidden: ${focus.html}`);
          if (!focus.indicator) problems.push(`no indicator: ${focus.html}`);
        }
        note('Tab stops', `${reached.length} of ${expected.length}`);
        expect(problems).toEqual([]);
        expect(
          reached.slice(0, expected.length).map((i) => expected[i] ?? `outside (${i})`),
        ).toEqual(expected);
        /* SC 2.1.4: no key without a modifier acts with focus on nothing it changes */
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        const snapshot = () =>
          page.evaluate(() => ({
            rows: document.querySelectorAll('[data-history] [data-history-row]').length,
            show: document.querySelector('[data-show]:not([hidden])') !== null,
            kit: document.querySelector('main')?.getAttribute('data-page-kit') ?? 'gt',
            motion: document.documentElement.getAttribute('data-motion'),
          }));
        const still = await snapshot();
        for (const key of [
          's',
          'p',
          'z',
          'm',
          '[',
          ']',
          'Enter',
          'ArrowRight',
          'Delete',
          'Backspace',
        ])
          await page.keyboard.press(key);
        expect(await snapshot()).toEqual(still);
        /* Cmd or Ctrl+Z with focus outside an editing band changes nothing */
        await page.locator('footer a').first().focus();
        await page.keyboard.press('ControlOrMeta+z');
        await page.waitForTimeout(300);
        expect(await snapshot()).toEqual(still);
      } finally {
        await context.close();
      }
    });

  /* ---- the interludes (2.4; V4#18) ---- */
  if (entered('home.interludes.glyphs'))
    test(title('home.interludes.glyphs'), async ({ browser }) => {
      test.setTimeout(240_000);
      let quiet = load() < INTERACTION_LOAD;
      for (const width of [1440, 390]) {
        const { context, page } = await open(browser, { width, height: width === 390 ? 844 : 900 });
        try {
          await visit(page);
          await liveReady(page);
          /* one between every two sections from the numbers row to the close: eleven once the
             tree renders all twelve (V4#20), one before each band the tree renders until then */
          const order = await page.evaluate(() =>
            [
              ...document.querySelectorAll<HTMLElement>(
                'main > [data-band], main > [data-interlude]',
              ),
            ].map((el) => el.dataset['band'] ?? `|${el.dataset['interlude']}`),
          );
          const numbers = order.indexOf('numbers');
          const tail = order.slice(numbers, order.indexOf('close') + 1);
          const shown = INTERLUDE_BANDS.filter((band) => tail.includes(band));
          const expectedTail: string[] = ['numbers'];
          for (const next of shown) expectedTail.push(`|${next}`, next);
          expect(tail).toEqual(expectedTail);
          note(`${width}: interludes`, shown.length);
          for (const next of shown) {
            const strip = page.locator(`[data-interlude="${next}"]`);
            await expect(strip).toHaveAttribute('aria-hidden', 'true');
            const box = await strip.locator('.ts-interlude-box').boundingBox();
            expect(box?.height, `${next} height`).toBe(width === 390 ? 80 : 128);
            const read = await inkedCells(page, next);
            expect(read.cols, `${next} at 2 px cells`).toBe(Math.round((box?.width ?? 0) / 2));
            expect(read.rows).toBe(Math.round((box?.height ?? 0) / 2));
          }
          /* a cycle on the canvas: bring one interlude into view, read its ink over 19 s, which
             holds one whole hold (5.5 s of a 12 s cycle) wherever the cycle stands at the start */
          const next = 'agents';
          await wheelTo(page, await yToSee(page, `[data-interlude="${next}"]`));
          const samples = await page.evaluate(async (name) => {
            const canvas = document.querySelector<HTMLCanvasElement>(
              `[data-interlude="${name}"] canvas`,
            )!;
            const ctx = canvas.getContext('2d')!;
            const out: [number, number][] = [];
            const t0 = performance.now();
            while (performance.now() - t0 < 19_000) {
              const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
              let n = 0;
              for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n += 1;
              out.push([performance.now() - t0, n]);
              await new Promise((r) => setTimeout(r, 50));
            }
            return out;
          }, next);
          const read = await inkedCells(page, next);
          const gathered = gatheredCells(next, read.cols, read.rows).reduce((a, b) => a + b, 0);
          /* the holds the window saw whole: runs of samples at the gathered ink with a sample
             off it on both sides */
          const holds: number[] = [];
          let runStart = -1;
          let runEnd = -1;
          let opened = false;
          for (const [t, n] of samples) {
            if (n === gathered) {
              if (runStart < 0) runStart = t;
              runEnd = t;
            } else {
              if (runStart >= 0 && opened) holds.push(runEnd - runStart);
              runStart = -1;
              opened = true;
            }
          }
          expect(holds.length, 'a whole hold in the window').toBeGreaterThan(0);
          /* the longest: the ink's count can pass the gathered count for one sample mid gather */
          const held = Math.max(...holds);
          note(`${width}: the glyph held for`, held);
          /* the load at the reading decides */
          if (load() >= INTERACTION_LOAD) quiet = false;
          if (quiet)
            expect(Math.abs(held - (INTERLUDE.hold - INTERLUDE.gather))).toBeLessThanOrEqual(300);
          /* at most two interludes draw at once, anywhere on the page */
          const max = await page.evaluate(
            () => document.documentElement.scrollHeight - innerHeight,
          );
          for (let y = 0; y <= max; y += Math.round(max / 12)) {
            await page.evaluate((to) => window.scrollTo(0, to), y);
            await page.waitForTimeout(150);
            const running = (await motionState(page)).running.filter((id) => id.startsWith('I1:'));
            expect(running.length, `interludes running at ${y}`).toBeLessThanOrEqual(2);
          }
        } finally {
          await context.close();
        }
      }
      /* the gathered still under reduced motion and with Pause Motion stored, at both widths, read
         at the core's ready: the core reports ready once the stills are drawn (2.4; the Round 1
         follow-up, lane E item 5: at 390 with Pause Motion stored the canvases were still blank
         at ready, their glyph chunk not yet arrived) */
      for (const width of [1440, 390])
        for (const options of [{ reduce: true }, { paused: true }] as const) {
          const size = { width, height: width === 390 ? 844 : 900 };
          const { context, page } = await open(browser, { ...options, ...size });
          /* the glyph chunk answers a second late, as a loaded server or a slow network serves it,
             so a ready reported before the stills reads blank canvases */
          await context.route(/\/glyphs(\.ts|-[^/]*\.m?js)(\?|$)/, async (route) => {
            await new Promise((r) => setTimeout(r, 1000));
            await route.continue();
          });
          try {
            await visit(page);
            await liveReady(page);
            const shown = await renderedInterludes(page);
            expect(shown.length).toBeGreaterThan(0);
            for (const next of shown) {
              const read = await inkedCells(page, next);
              expect(read.ink, `${width} ${JSON.stringify(options)} ${next}`).toEqual(
                gatheredCells(next, read.cols, read.rows),
              );
            }
          } finally {
            await context.close();
          }
        }
      test.skip(!quiet, `not read: load ${load()} (the functional checks passed)`);
    });

  /* ---- the scheduler's rule over every registered loop (3.1, 3.8; V4#18) ---- */
  if (entered('home.motion.loops'))
    test(title('home.motion.loops'), async ({ browser }) => {
      test.setTimeout(300_000);
      const quiet = load() < INTERACTION_LOAD;
      const { context, page } = await open(browser);
      try {
        await visit(page);
        await liveReady(page);
        await loadEveryBand(page);
        const ids = (await motionState(page)).registered;
        note('loops registered', ids.join(', '));
        const shown = await renderedInterludes(page);
        expect(ids.filter((id) => id.startsWith('I1:')).sort()).toEqual(
          shown.map((next) => `I1:${next}`).sort(),
        );
        for (const id of ids) {
          await bringToView(page, id);
          const started = await page
            .waitForFunction(
              (loopId) => window.tsHomeMotion?.running().includes(loopId) === true,
              id,
              {
                timeout: 5_000,
              },
            )
            .then(() => true)
            .catch(() => false);
          const state = await motionState(page);
          expect(
            started,
            `${id} plays in view (running ${state.running.join(' ')}; stopped ${state.stopped.join(' ')}; in view ${JSON.stringify(state.visible)})`,
          ).toBe(true);
          const demos = state.running.filter((r) => !r.startsWith('I1:'));
          const fields = state.running.filter((r) => r.startsWith('I1:'));
          expect(demos.length, `demonstrations at ${id}`).toBeLessThanOrEqual(1);
          expect(fields.length, `interludes at ${id}`).toBeLessThanOrEqual(2);
          /* out of view: paused within one frame */
          await page.evaluate((sel) => {
            const el = document.querySelector(sel)!;
            const r = el.getBoundingClientRect();
            window.scrollTo(0, r.bottom + scrollY + 50);
          }, loopSelector(id));
          const left = await pageNow(page);
          await page.waitForFunction(
            (loopId) => !window.tsHomeMotion!.running().includes(loopId),
            id,
            {
              timeout: 5_000,
            },
          );
          note(`${id} paused after leaving the view`, (await pageNow(page)) - left);
        }
        /* Pause Motion holds every running loop's frame; Play resumes the loops in view */
        const held1 = shown[Math.min(3, shown.length - 1)]!;
        await bringToView(page, `I1:${held1}`);
        await page.waitForTimeout(800);
        const running = (await motionState(page)).running;
        expect(running.length).toBeGreaterThan(0);
        /* pressed where the page stands: the nav scrolls with the page, and a click through the
           locator would scroll it into view and take the loops out of it first */
        await pressInPlace(page);
        await page.waitForTimeout(FRAME_SLACK_MS);
        expect((await motionState(page)).running).toEqual([]);
        const held = await inkedCells(page, held1);
        const frozen = await idle(page, context, 1_000);
        expect(frozen.raf, 'no frame while paused').toBe(0);
        expect((await inkedCells(page, held1)).ink).toEqual(held.ink);
        await pressInPlace(page);
        await page.waitForFunction(
          () => (window.tsHomeMotion?.running().length ?? 0) > 0,
          undefined,
          {
            timeout: 5_000,
          },
        );
        expect((await motionState(page)).running.sort()).toEqual([...running].sort());
        /* a hidden tab pauses every loop, a visible tab resumes the loops in view */
        await setTabHidden(page, true);
        expect((await motionState(page)).running).toEqual([]);
        await setTabHidden(page, false);
        await page.waitForFunction(
          () => (window.tsHomeMotion?.running().length ?? 0) > 0,
          undefined,
          {
            timeout: 5_000,
          },
        );
      } finally {
        await context.close();
      }
      test.skip(!quiet, `not read: load ${load()} (the functional checks passed)`);
    });

  /* ---- nothing off screen or paused (4.1; V4#18) ---- */
  if (entered('home.motion.offscreen'))
    test(title('home.motion.offscreen'), async ({ browser }) => {
      test.setTimeout(240_000);
      let unread = load() >= INTERACTION_LOAD;
      for (const height of [900, 500, 300]) {
        const { context, page } = await open(browser, { height });
        try {
          await visit(page);
          await liveReady(page);
          await loadEveryBand(page);
          const spot = await quietSpot(page);
          if (spot === null) {
            note(`${height} px tall`, 'no place without a loop in view');
            continue;
          }
          await page.evaluate((y) => window.scrollTo(0, y), spot);
          /* 2 s for the work a full scroll through every band leaves behind (its collections) */
          await page.waitForTimeout(2_000);
          expect((await motionState(page)).running).toEqual([]);
          const reading = await restReading(page, context);
          note(
            `${height} px tall, at y ${spot}: frames, timers in 4 s, task a second in two windows`,
            `${reading.raf}, ${reading.timers}, ${reading.windows}`,
          );
          expect(reading.raf).toBe(0);
          expect(reading.timers).toBe(0);
          /* the load at the reading decides, as the rest row's does */
          if (load() >= INTERACTION_LOAD) unread = true;
          if (!unread) expect(reading.taskPerSecond).toBeLessThanOrEqual(2);
          /* anywhere with Pause Motion pressed */
          await page.evaluate(() => window.scrollTo(0, 0));
          await toggle(page).click();
          for (const y of [0.25, 0.5, 0.75]) {
            await page.evaluate(
              (f) => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f),
              y,
            );
            await page.waitForTimeout(1_000);
            const paused = await idle(page, context);
            expect(paused.raf, `paused at ${y}`).toBe(0);
            expect(paused.timers, `timers paused at ${y}`).toBe(0);
          }
          break;
        } finally {
          await context.close();
        }
      }
      if (load() >= INTERACTION_LOAD) unread = true;
      test.skip(unread, `not read: load ${load()} (the counts passed)`);
    });
}
