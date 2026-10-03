import { loadavg } from 'node:os';

import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import {
  BOOT_LIMIT_BYTES,
  CARET_HOLD_MS,
  FIRST_KEY_MS,
  SENTENCE_MAX,
} from '../../../src/components/home/boot';
import { BOOT_SCRIPT, VISIT_GAPS } from '../../../src/components/home/boot.generated';
import { extraHTTPHeaders, title } from '../lib';

// A lane module of core/home.spec.ts (docs/LANDING.md section 3, 6.7; build/integrator.md "Landing,
// day 0" 4.5, 4.7, 4.9 and 5.1). L4's, push 7: the hero sequence, the one shot motions in view,
// the page at rest, reduced motion, the hidden tab, the frame and main thread budgets and the
// keyboard walk. Every observation is through the page: an init script records, before any page
// script runs, the classes of `html`, the subtitle's text, the fields' `data-field-state`, every
// `requestAnimationFrame` call and its callback's length, every Web Animation's properties, every
// CSS transition and every crossing of 35 percent in view, and the drivers read it with the page's
// own clocks. Times are interaction bounds read only at a one minute load under 24 and measure
// rows only under 20 (docs/NEXT.md 4.0, LANDING.md 4.4); above the line the functional checks
// still run and the row is recorded "not read: load", never passed.

export const ROWS: readonly string[] = [
  'home.motion.hero',
  'home.motion.in-view',
  'home.motion.rest',
  'home.motion.reduced',
  'home.motion.hidden-tab',
  'home.budget.frame',
  'home.budget.main-thread',
  'home.a11y.keyboard-walk',
];

const INTERACTION_LOAD = 24;
const MEASURE_LOAD = 20;
/** A timer's lateness and one frame, the slack of a timing bound read at a quiet load. */
const SLACK_MS = 60;
/** The hero sequence's ceiling from T0 (3.7). */
const HERO_END_MS = 4500;
/** The hero's develop starts by T0 + 3.0 s or its still shows then (answer 1). */
const DEVELOP_BY_MS = 3000;

const DURATION = { gather: 1500, develop: 2400, line: 600, beat: 500, fast: 120 } as const;
const RAILS = { duration: 600, delays: [0, 60, 120, 180], easing: 'cubic-bezier(0.16, 1, 0.3, 1)' };
const MARK = { pieces: 7, stagger: 55, travel: 600, fade: 120 } as const;
const SEAM = { from: 82, to: 50 } as const;
const MOVED = ['left', 'top', 'width', 'height', 'right', 'bottom', 'inset'];

/** The one minute load average. */
function load(): number {
  return Math.round((loadavg()[0] ?? 0) * 10) / 10;
}

/** Records a timing reading with the load it was read at. */
function note(what: string, value: number | string): void {
  test.info().annotations.push({
    type: 'reading',
    description: `${what}: ${typeof value === 'number' ? `${Math.round(value * 10) / 10} ms` : value} at load ${load()}`,
  });
}

/**
 * The recorder, run before any page script (`addInitScript`). It wraps `requestAnimationFrame`
 * and `IntersectionObserver` callbacks with a clock, `Element.prototype.animate` with a list of
 * the properties animated, and watches `html`'s classes, the subtitle, the fields' states, the
 * seam's value and the mark pieces' inline style.
 */
const RECORDER = String(() => {
  type Rec = {
    raf: number;
    frames: [number, number, number][];
    io: [number, number][];
    props: string[];
    transitions: string[];
    css: string[];
    h1: string[];
    classes: [number, string][];
    texts: [number, string, number, boolean][];
    states: [number, string, string][];
    seam: [number, number][];
    cut: [number, number][];
    crossings: [number, string][];
    paints: [string, number][];
    rails: { name: string; duration: number; delay: number; easing: string }[];
    lcp: number;
  };
  const rec: Rec = {
    raf: 0,
    frames: [],
    io: [],
    props: [],
    transitions: [],
    css: [],
    h1: [],
    classes: [],
    texts: [],
    states: [],
    seam: [],
    cut: [],
    crossings: [],
    paints: [],
    rails: [],
    lcp: 0,
  };
  (window as unknown as { __l4: Rec }).__l4 = rec;
  const now = (): number => performance.now();
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    rec.raf += 1;
    return raf((t) => {
      const start = now();
      try {
        cb(t);
      } finally {
        /* the frame's timestamp is the same for every callback of one frame */
        rec.frames.push([start, now() - start, t]);
      }
    });
  };
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
      /* an animation on the h1 or on an element that holds it (3.4: the h1 never moves) */
      const target = e.target as Element;
      if (target.closest('h1') !== null || target.querySelector('h1') !== null)
        rec.h1.push(`${e.animationName} on ${target.tagName.toLowerCase()}.${target.className}`);
    },
    true,
  );
  const lead = (node: Node): Element | null =>
    (node.nodeType === 1 ? (node as Element) : node.parentElement)?.closest(
      '[data-object="title#lead"]',
    ) ?? null;
  new MutationObserver((list) => {
    for (const m of list) {
      const target = m.target as Element;
      if (m.type === 'attributes') {
        if (m.attributeName === 'class' && target === document.documentElement) {
          rec.classes.push([now(), document.documentElement.className]);
          /* H1 at T0: the CSS animations the class starts on the hero's rails, read at once */
          if (rec.rails.length === 0 && document.documentElement.classList.contains('ts-t0'))
            for (const a of document.getAnimations()) {
              const effect = a.effect as KeyframeEffect | null;
              if (effect?.target?.closest('[data-band="hero"]') == null) continue;
              const timing = effect.getTiming();
              rec.rails.push({
                name: (a as CSSAnimation).animationName ?? '',
                duration: Number(timing.duration),
                delay: Number(timing.delay),
                /* a CSS animation's curve is its keyframes' easing; the effect's own is linear */
                easing: String(effect.getKeyframes()[0]?.easing ?? timing.easing),
              });
            }
        } else if (m.attributeName === 'data-field-state')
          rec.states.push([
            now(),
            target.getAttribute('data-field') ?? '',
            target.getAttribute('data-field-state') ?? '',
          ]);
        else if (m.attributeName === 'aria-valuenow' && target.matches('[data-seam]'))
          rec.seam.push([now(), Number(target.getAttribute('aria-valuenow'))]);
        else if (m.attributeName === 'style' && target.matches('[data-seam-root]')) {
          /* the cut the seam rests at: written inline when E1 arms and when its animation ends */
          const cut = parseFloat((target as HTMLElement).style.getPropertyValue('--seam-cut'));
          if (Number.isFinite(cut) && cut !== rec.cut.at(-1)?.[1]) rec.cut.push([now(), cut]);
        }
        continue;
      }
      const el = lead(m.target);
      if (el === null) continue;
      const rest = [...el.querySelectorAll('span')].find(
        (s) => (s as HTMLElement).style.webkitTextFillColor === 'transparent',
      ) as HTMLElement | undefined;
      const typed = (el.textContent ?? '').length - (rest?.textContent ?? '').length;
      rec.texts.push([
        now(),
        el.textContent ?? '',
        rest ? typed : -1,
        (rest?.style.boxShadow ?? '') !== '',
      ]);
    }
  }).observe(document, {
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'data-field-state', 'aria-valuenow', 'style'],
    childList: true,
    characterData: true,
  });
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) rec.paints.push([e.name, e.startTime]);
    }).observe({ type: 'paint', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) rec.lcp = e.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    /* an engine without the paint timing */
  }
  /* the crossings of 35 percent in view of the motions' targets (3.5) */
  document.addEventListener('DOMContentLoaded', () => {
    const targets: [Element | null, string][] = [
      [document.querySelector('[data-field="strip"]'), 'strip'],
      [document.querySelector('[data-field="canvas"]'), 'canvas'],
      [document.querySelector('[data-seam]')?.parentElement ?? null, 'export'],
      [document.querySelector('[data-mark-piece]')?.closest('[data-home-slides]') ?? null, 'close'],
    ];
    const names = new Map<Element, string>();
    const watch = new Observer(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting && e.intersectionRatio >= 0.35)
            rec.crossings.push([now(), names.get(e.target) ?? '']);
      },
      { threshold: [0.35] },
    );
    for (const [el, name] of targets)
      if (el !== null) {
        names.set(el, name);
        watch.observe(el);
      }
  });
});

type Rec = {
  raf: number;
  frames: [number, number, number][];
  io: [number, number][];
  props: string[];
  transitions: string[];
  css: string[];
  h1: string[];
  classes: [number, string][];
  texts: [number, string, number, boolean][];
  states: [number, string, string][];
  seam: [number, number][];
  cut: [number, number][];
  crossings: [number, string][];
  paints: [string, number][];
  rails: { name: string; duration: number; delay: number; easing: string }[];
  lcp: number;
};

type Boot = { t0?: number; ended: boolean };

type Opened = { context: BrowserContext; page: Page };

/** A fresh context with the recorder, at a viewport, in an appearance and a motion preference. */
async function open(
  browser: Browser,
  options: { width?: number; height?: number; reduce?: boolean; theme?: 'light' | 'dark' } = {},
): Promise<Opened> {
  const context = await browser.newContext({
    extraHTTPHeaders,
    viewport: { width: options.width ?? 1440, height: options.height ?? 900 },
    reducedMotion: options.reduce === true ? 'reduce' : 'no-preference',
  });
  await context.addInitScript((theme) => {
    try {
      localStorage.setItem('gt-theme', theme);
    } catch {
      /* a context without storage */
    }
  }, options.theme ?? 'light');
  await context.addInitScript(`(${RECORDER})()`);
  return { context, page: await context.newPage() };
}

/** Opens /home; `?slow=10` (3.5) makes the hero sequence ten times longer, so a test can act
 * inside it at any load. */
async function visit(page: Page, query = ''): Promise<void> {
  const response = await page.goto(`/home${query}`);
  expect(response?.status()).toBe(200);
  await page.waitForSelector('main#top[data-hydrated]', { timeout: 30_000 });
}

const rec = (page: Page): Promise<Rec> =>
  page.evaluate(() => (window as unknown as { __l4: Rec }).__l4);
const boot = (page: Page): Promise<Boot | null> =>
  page.evaluate(() => {
    const b = window.tsHomeBoot;
    return b === undefined ? null : { t0: b.t0, ended: b.ended };
  });
const pageNow = (page: Page): Promise<number> => page.evaluate(() => performance.now());

async function liveReady(page: Page): Promise<void> {
  await page.waitForSelector('main#top[data-live="ready"]', { timeout: 30_000 });
}

/** Waits until the boot sequence has ended, at most 8 s. */
async function bootEnded(page: Page): Promise<void> {
  await page.waitForFunction(() => window.tsHomeBoot?.ended === true, undefined, {
    timeout: 8_000,
  });
}

/** Whether a field box shows its still: its still layer (a child or ::before) is visible. */
function stillShown(page: Page, field: string): Promise<boolean> {
  return page.evaluate((name) => {
    const box = document.querySelector(`[data-field="${name}"]`);
    if (box === null) return false;
    const layer = [...box.children].find((c) => c.tagName !== 'CANVAS');
    const style = layer ? getComputedStyle(layer) : getComputedStyle(box, '::before');
    return style.visibility === 'visible' && style.display !== 'none';
  }, field);
}

/** Scrolls by the wheel, natively, in steps, with a pause after each (no smooth scrolling). */
async function wheelTo(page: Page, y: number, step = 400, pause = 120): Promise<void> {
  for (;;) {
    const at = await page.evaluate(() => scrollY);
    const left = y - at;
    if (Math.abs(left) < 2) return;
    const before = at;
    await page.mouse.wheel(0, Math.sign(left) * Math.min(step, Math.abs(left)));
    await page.waitForTimeout(pause);
    if ((await page.evaluate(() => scrollY)) === before) return;
  }
}

/** The page y at which an element is 60 percent in view, centred. */
function yToSee(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el === null) return scrollY;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.round(r.top + scrollY + r.height / 2 - innerHeight / 2));
  }, selector);
}

const SELECTORS = {
  strip: '[data-field="strip"]',
  canvas: '[data-field="canvas"]',
  export: '[data-band="export"] [data-seam-root]',
  close: '[data-band="close"] [data-home-slides]',
} as const;

/** Moves the hero's title by three nudges, so a band has a change to undo. */
async function nudgeTitle(page: Page): Promise<void> {
  await page.locator('[data-object="title#heading"]').focus();
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(800);
}

const historyRows = (page: Page): Promise<number> =>
  page.locator('[data-history] [data-history-row]').count();

/** Hides the tab the way the page reads it: `document.hidden` and a `visibilitychange`. */
async function hideTab(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

export function rows(): void {
  test(title('home.motion.hero'), async ({ browser }) => {
    test.setTimeout(120_000);
    /* the sentences and their tables: at most 50 characters, every table inside 4.5 s */
    expect(VISIT_GAPS.length).toBe(3);
    for (const table of VISIT_GAPS) {
      expect(table.sentence.length).toBeLessThanOrEqual(SENTENCE_MAX);
      expect(table.lastKeyMs + CARET_HOLD_MS).toBeLessThanOrEqual(HERO_END_MS);
    }
    const quiet = load() < INTERACTION_LOAD;
    const { context, page } = await open(browser);
    try {
      for (const [index, table] of VISIT_GAPS.entries()) {
        await visit(page);
        /* the rails and rules draw out of their crosses from T0, 600 ms each, 60 ms apart */
        await page.waitForFunction(() => window.tsHomeBoot?.t0 !== undefined, undefined, {
          timeout: 5_000,
        });
        const h1Before = await page.locator('h1').boundingBox();
        await bootEnded(page);
        const h1After = await page.locator('h1').boundingBox();
        const b = await boot(page);
        const r = await rec(page);
        const t0 = b?.t0 ?? NaN;
        /* the visit's sentence, set before the subtitle's first paint and never swapped: the
           parser inserts the markup's sentence (the first visit's), and the boot script sets the
           visit's in the next animation frame callback, which runs before that frame paints, so
           no frame ends between the two; from the boot's set on, only the visit's sentence */
        const set = r.texts.findIndex(([, , typed]) => typed >= 0);
        expect(set, 'the boot script set the subtitle').toBeGreaterThanOrEqual(0);
        const setAt = r.texts[set]![0];
        const before = r.texts.slice(0, set).filter(([, text]) => text !== table.sentence);
        const lastOther = before.at(-1)?.[0] ?? -Infinity;
        /* the frames whose callbacks ran between the two: the boot's own frame (the last one
           before the set is recorded, its microtask) and none other */
        const between = new Set(
          r.frames
            .filter(([start, length]) => start >= lastOther && start + length <= setAt)
            .map(([, , frame]) => frame),
        );
        expect(
          between.size,
          'no frame painted the markup sentence before the set',
        ).toBeLessThanOrEqual(1);
        for (const [, text] of r.texts.slice(set)) expect(text).toBe(table.sentence);
        const firstPaint = r.paints.find(([name]) => name === 'first-paint')?.[1] ?? Infinity;
        note(
          `visit ${index + 1}: the sentence set at, first paint at`,
          `${Math.round(setAt)} ms, ${Math.round(firstPaint)} ms`,
        );
        await expect(page.locator('[data-object="title#lead"]')).toHaveText(table.sentence);
        expect(r.classes[0]?.[1] ?? '').toContain('ts-intro');
        /* H1: four lines, 600 ms on the arrive curve at 0, 60, 120 and 180 ms */
        const lines = r.rails.filter((a) => /draw/.test(a.name));
        expect(lines.length, JSON.stringify(r.rails)).toBe(4);
        expect(lines.map((a) => a.duration)).toEqual([600, 600, 600, 600]);
        expect([...lines.map((a) => a.delay)].sort((x, y) => x - y)).toEqual(RAILS.delays);
        for (const a of lines)
          expect(a.easing.replace(/\s/g, '')).toBe(RAILS.easing.replace(/\s/g, ''));
        /* H2 to H4: the keys on the gap table, the caret with the first key, solid, a cut after */
        const keys = r.texts.filter(([, , typed]) => typed > 0);
        const firstKey = keys.find(([, , typed]) => typed === 1);
        const lastKey = keys.find(([, , typed]) => typed === table.sentence.length);
        expect(firstKey, 'the first key').toBeDefined();
        expect(lastKey, 'the last key').toBeDefined();
        expect(firstKey![3], 'the caret appears with the first key').toBe(true);
        for (const [, , typed, caret] of keys) if (typed > 0) expect(caret).toBe(true);
        const ended = r.classes.find(([, cls]) => !cls.includes('ts-intro'))?.[0] ?? Infinity;
        note(`visit ${index + 1}: first key from T0`, firstKey![0] - t0);
        note(`visit ${index + 1}: last key from T0`, lastKey![0] - t0);
        note(`visit ${index + 1}: the sequence ended from T0`, ended - t0);
        note(`visit ${index + 1}: by the gap table`, `${table.lastKeyMs + CARET_HOLD_MS} ms`);
        if (quiet) {
          expect(Math.abs(firstKey![0] - t0 - FIRST_KEY_MS)).toBeLessThanOrEqual(SLACK_MS);
          expect(Math.abs(lastKey![0] - t0 - table.lastKeyMs)).toBeLessThanOrEqual(SLACK_MS);
          expect(Math.abs(ended - lastKey![0] - CARET_HOLD_MS)).toBeLessThanOrEqual(SLACK_MS);
          expect(ended - t0).toBeLessThanOrEqual(HERO_END_MS);
        }
        /* H5: the develop starts by T0 + 3.0 s and runs 1,500 ms, or the still shows at 3.0 s */
        await page.waitForTimeout(Math.max(0, t0 + HERO_END_MS + 200 - (await pageNow(page))));
        const hero = (await rec(page)).states.filter(([, name]) => name === 'hero');
        const developing = hero.find(([, , state]) => state === 'developing');
        const still = hero.find(([, , state]) => state === 'still');
        if (developing !== undefined) {
          note(`visit ${index + 1}: the develop started from T0`, developing[0] - t0);
          note(`visit ${index + 1}: the develop ran`, (still?.[0] ?? NaN) - developing[0]);
          expect(still, 'the develop ends on the still').toBeDefined();
          if (quiet) {
            expect(developing[0] - t0).toBeLessThanOrEqual(DEVELOP_BY_MS + SLACK_MS);
            expect(Math.abs(still![0] - developing[0] - DURATION.gather)).toBeLessThanOrEqual(
              2 * SLACK_MS,
            );
            expect(still![0] - t0).toBeLessThanOrEqual(HERO_END_MS + SLACK_MS);
          }
        } else
          note(`visit ${index + 1}: the develop`, 'not started; the still showed at T0 + 3.0 s');
        expect(await stillShown(page, 'hero'), 'the field rests on its still').toBe(true);
        /* the h1 never moves: final in its first frame, no animation on it or on what holds it */
        expect(h1After).toEqual(h1Before);
        expect(r.h1, 'animations on the h1 or its slide').toEqual([]);
        await liveReady(page);
      }
      /* a press in the hero ends the sequence at once, at its end state (at a tenth of speed, so
         the press lands while the subtitle types at any load) */
      await visit(page, '?slow=10');
      await page.waitForFunction(
        () =>
          window.tsHomeBoot?.t0 !== undefined && performance.now() > window.tsHomeBoot.t0 + 8_000,
        undefined,
        { timeout: 30_000 },
      );
      expect((await boot(page))?.ended).toBe(false);
      const sheet = await page.locator('[data-band="hero"] [data-home-slides]').boundingBox();
      await page.mouse.click(sheet!.x + sheet!.width - 12, sheet!.y + 12);
      await page.waitForTimeout(50);
      expect((await boot(page))?.ended).toBe(true);
      expect(await page.evaluate(() => document.documentElement.className)).not.toContain(
        'ts-intro',
      );
      await expect(page.locator('[data-object="title#lead"]')).toHaveText(VISIT_GAPS[0]!.sentence);
      /* a wheel in the hero ends it too */
      await visit(page, '?slow=10');
      await page.waitForFunction(() => window.tsHomeBoot?.t0 !== undefined, undefined, {
        timeout: 30_000,
      });
      expect((await boot(page))?.ended).toBe(false);
      await page.mouse.move(sheet!.x + 40, sheet!.y + 40);
      await page.mouse.wheel(0, 40);
      await page.waitForTimeout(50);
      expect((await boot(page))?.ended).toBe(true);
    } finally {
      await context.close();
    }
    test.skip(!quiet, `not read: load ${load()} (the functional checks passed)`);
  });

  test(title('home.motion.in-view'), async ({ browser }) => {
    test.setTimeout(120_000);
    const quiet = load() < INTERACTION_LOAD;
    /* 700 px tall, so the strip and every band start below the viewport */
    const { context, page } = await open(browser, { height: 700 });
    try {
      await visit(page);
      await liveReady(page);
      await bootEnded(page);
      const armed = await rec(page);
      /* armed below the viewport: the strip and the canvas field hold their first pose */
      expect(armed.states.some(([, n, s]) => n === 'strip' && s === 'developing')).toBe(true);
      expect(armed.states.some(([, n, s]) => n === 'canvas' && s === 'developing')).toBe(true);
      expect(armed.seam.at(-1)?.[1]).toBe(SEAM.from);
      for (const target of ['strip', 'canvas', 'export', 'close'] as const) {
        await wheelTo(page, await yToSee(page, SELECTORS[target]));
        await page.waitForTimeout(target === 'canvas' ? 3_000 : 2_000);
      }
      const r = await rec(page);
      const crossed = (name: string): number => r.crossings.find(([, n]) => n === name)?.[0] ?? NaN;
      const doneAt = (name: string): number =>
        r.states.find(([, n, s]) => n === name && s === 'still')?.[0] ?? NaN;
      const f1 = doneAt('strip') - crossed('strip');
      const c1 = doneAt('canvas') - crossed('canvas');
      note('F1 from 35 percent in view to the still', f1);
      note('C1 from 35 percent in view to the still', c1);
      expect(r.seam.at(-1)?.[1], 'E1 ends at 50 percent').toBe(SEAM.to);
      expect(
        r.cut.map(([, v]) => v),
        'E1 arms at 82 and rests at 50',
      ).toEqual([SEAM.from, SEAM.to]);
      const e1 = (r.cut.at(-1)?.[0] ?? NaN) - crossed('export');
      note('E1 from 35 percent in view to 50 percent (a beat, then 600 ms)', e1);
      /* the seam's value only falls, from 82 to 50 */
      const values = r.seam.map(([, v]) => v);
      for (let i = 1; i < values.length; i += 1)
        expect(values[i]!).toBeLessThanOrEqual(values[i - 1]!);
      const pieces = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('[data-mark-piece]')].map((p) => ({
          opacity: getComputedStyle(p).opacity,
          animations: p.getAnimations().length,
        })),
      );
      expect(pieces.length).toBe(MARK.pieces);
      for (const p of pieces) expect(p).toEqual({ opacity: '1', animations: 0 });
      if (quiet) {
        expect(Math.abs(f1 - DURATION.gather)).toBeLessThanOrEqual(2 * SLACK_MS);
        expect(Math.abs(c1 - DURATION.develop)).toBeLessThanOrEqual(2 * SLACK_MS);
        expect(Math.abs(e1 - DURATION.beat - DURATION.line)).toBeLessThanOrEqual(2 * SLACK_MS);
      }
      /* K1: seven pieces, 600 ms each and 120 ms of opacity, 55 ms apart, on translate */
      const props = new Set(r.props);
      expect(props.has('translate')).toBe(true);
      /* never again: back to the top and down once more, nothing moves */
      const before = await rec(page);
      await wheelTo(page, 0, 1200, 60);
      for (const target of ['strip', 'canvas', 'export', 'close'] as const) {
        await wheelTo(page, await yToSee(page, SELECTORS[target]), 1200, 60);
        await page.waitForTimeout(300);
      }
      const after = await rec(page);
      expect(after.states.length).toBe(before.states.length);
      expect(after.seam.length).toBe(before.seam.length);
      expect(after.cut.length).toBe(before.cut.length);
      expect(after.props.length).toBe(before.props.length);
    } finally {
      await context.close();
    }
    /* a band above the viewport at its first observation renders final: the page opened by a
       link to its last band, so the strip, the canvas and the seam are above the viewport when
       the live module starts (after load and one idle callback) and the close band is in it */
    const second = await open(browser, { height: 700 });
    try {
      const response = await second.page.goto('/home#close');
      expect(response?.status()).toBe(200);
      await liveReady(second.page);
      expect(
        await second.page.evaluate(
          () => document.querySelector('[data-band="export"]')!.getBoundingClientRect().bottom,
        ),
        'the export band is above the viewport when the live module starts',
      ).toBeLessThanOrEqual(0);
      await second.page.waitForTimeout(1_500);
      await wheelTo(second.page, 0, 1200, 60);
      await second.page.waitForTimeout(500);
      const r = await rec(second.page);
      expect(r.states.filter(([, n]) => n === 'strip' || n === 'canvas')).toEqual([]);
      expect(r.seam.filter(([, v]) => v === SEAM.from)).toEqual([]);
      const hidden = await second.page.evaluate(
        () =>
          [...document.querySelectorAll<HTMLElement>('[data-mark-piece]')].filter(
            (p) => getComputedStyle(p).opacity !== '1',
          ).length,
      );
      expect(hidden).toBe(0);
    } finally {
      await second.context.close();
    }
    test.skip(!quiet, `not read: load ${load()} (the functional checks passed)`);
  });

  test(title('home.motion.rest'), async ({ browser }) => {
    test.setTimeout(180_000);
    let unread = false;
    const { context, page } = await open(browser, { height: 700 });
    try {
      await visit(page);
      await liveReady(page);
      await bootEnded(page);
      /* every band plays: the hero ran, the one shot motions in view, and one of each interaction */
      await nudgeTitle(page);
      await page.locator('[data-undo="hero"]').click();
      for (const target of ['strip', 'canvas', 'export', 'close'] as const) {
        await wheelTo(page, await yToSee(page, SELECTORS[target]));
        await page.waitForTimeout(target === 'canvas' ? 3_000 : 2_000);
      }
      await wheelTo(page, await yToSee(page, '[data-band="tailor"] [data-kit="kestrel"]'));
      await page.locator('[data-kit="kestrel"]').click();
      await page.waitForTimeout(800);
      await page.locator('[data-kit="gt"]').click();
      await page.waitForTimeout(800);
      await wheelTo(page, await yToSee(page, '[data-agent-run]'));
      await page.locator('[data-agent-run]').click();
      await page.waitForTimeout(5_500);
      await wheelTo(page, await yToSee(page, '[data-present]'));
      await page.locator('[data-present]').click();
      await page.waitForTimeout(800);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1_000);
      const cdp = await context.newCDPSession(page);
      await cdp.send('Performance.enable');
      const height = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
      for (const [where, y] of [
        ['top', 0],
        ['middle', Math.round(height / 2)],
        ['bottom', height],
      ] as const) {
        await page.evaluate((to) => window.scrollTo(0, to), y);
        await page.waitForTimeout(2_500);
        const metric = async (): Promise<number> =>
          (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration')
            ?.value ?? 0;
        const raf0 = (await rec(page)).raf;
        const task0 = await metric();
        await page.waitForTimeout(2_000);
        const raf1 = (await rec(page)).raf;
        const task1 = await metric();
        const animations = await page.evaluate(() => document.getAnimations().length);
        const perSecond = ((task1 - task0) * 1000) / 2;
        note(`at rest at the ${where}: requestAnimationFrame calls in 2 s`, `${raf1 - raf0}`);
        note(`at rest at the ${where}: task time a second`, perSecond);
        expect(raf1 - raf0, `rAF calls at the ${where}`).toBe(0);
        expect(animations, `animations at the ${where}`).toBe(0);
        if (load() < INTERACTION_LOAD) expect(perSecond).toBeLessThanOrEqual(2);
        else unread = true;
      }
      const r = await rec(page);
      for (const prop of [...r.props, ...r.transitions]) expect(MOVED).not.toContain(prop);
      note('properties animated by script', [...new Set(r.props)].join(', '));
      note('properties transitioned', [...new Set(r.transitions)].join(', '));
    } finally {
      await context.close();
    }
    /* the task time a second is a timing bound: above the line the row is not read */
    test.skip(unread, `not read: load ${load()} (the counts passed)`);
  });

  test(title('home.motion.reduced'), async ({ browser }) => {
    test.setTimeout(120_000);
    const { context, page } = await open(browser, { reduce: true });
    try {
      await visit(page);
      await liveReady(page);
      await page.waitForTimeout(500);
      const loaded = await rec(page);
      expect(loaded.classes.some(([, cls]) => cls.includes('ts-intro'))).toBe(false);
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
      /* the hero's subtitle whole and its field at full tone from the first paint */
      expect(loaded.texts.every(([, , typed]) => typed === -1)).toBe(true);
      expect(await stillShown(page, 'hero')).toBe(true);
      /* a full native scroll moves nothing and prints every field at once */
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      await wheelTo(page, height, 500, 80);
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
      for (const field of ['strip', 'canvas', 'hero'])
        expect(await stillShown(page, field)).toBe(true);
      /* Undo cuts: the title moves by keys and returns at once */
      await wheelTo(page, 0, 1200, 60);
      const at = await page.locator('[data-object="title#heading"]').boundingBox();
      await nudgeTitle(page);
      expect(
        (await page.locator('[data-object="title#heading"]').boundingBox())?.x,
      ).toBeGreaterThan(at!.x);
      await page.locator('[data-undo="hero"]').click();
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
      expect((await page.locator('[data-object="title#heading"]').boundingBox())?.x).toBeCloseTo(
        at!.x,
        0,
      );
      /* the kit cuts */
      await page.locator('[data-kit="kestrel"]').scrollIntoViewIfNeeded();
      await page.locator('[data-kit="kestrel"]').click();
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
      await expect(page.locator('main#top')).toHaveAttribute('data-page-kit', 'kestrel');
      await page.locator('[data-kit="gt"]').click();
      /* the ring and the step cut */
      await page.locator('[data-agent-run]').scrollIntoViewIfNeeded();
      await page.locator('[data-agent-run]').click();
      await page.waitForTimeout(100);
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
      /* the show cuts */
      await page.locator('[data-present]').scrollIntoViewIfNeeded();
      await page.locator('[data-present]').click();
      await expect(page.locator('[data-show]')).toBeVisible();
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-show]')).toBeHidden();
      const r = await rec(page);
      expect(r.props, 'no Web Animation is created').toEqual([]);
      expect(r.states.filter(([, , s]) => s === 'developing')).toEqual([]);
      expect(r.css.filter((name) => name !== '')).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test(title('home.motion.hidden-tab'), async ({ browser }) => {
    test.setTimeout(90_000);
    /* the hero sequence */
    const first = await open(browser);
    try {
      await visit(first.page, '?slow=10');
      await first.page.waitForFunction(
        () =>
          window.tsHomeBoot?.t0 !== undefined && performance.now() > window.tsHomeBoot.t0 + 8_000,
        undefined,
        { timeout: 30_000 },
      );
      expect((await boot(first.page))?.ended).toBe(false);
      await hideTab(first.page);
      expect((await boot(first.page))?.ended).toBe(true);
      expect(await first.page.evaluate(() => document.documentElement.className)).not.toContain(
        'ts-intro',
      );
      await expect(first.page.locator('[data-object="title#lead"]')).toHaveText(
        VISIT_GAPS[0]!.sentence,
      );
    } finally {
      await first.context.close();
    }
    /* C1 and K1 mid way */
    const second = await open(browser, { height: 700 });
    try {
      const { page } = second;
      await visit(page);
      await liveReady(page);
      await bootEnded(page);
      await wheelTo(page, await yToSee(page, SELECTORS.canvas));
      await page.waitForFunction(
        () => {
          const r = (window as unknown as { __l4: Rec }).__l4;
          return r.crossings.some(([, n]) => n === 'canvas');
        },
        undefined,
        { timeout: 10_000 },
      );
      await page.waitForTimeout(600);
      expect(await page.locator(SELECTORS.canvas).getAttribute('data-field-state')).toBe(
        'developing',
      );
      await hideTab(page);
      expect(await page.locator(SELECTORS.canvas).getAttribute('data-field-state')).toBe('still');
      const raf0 = (await rec(page)).raf;
      await page.waitForTimeout(300);
      expect((await rec(page)).raf - raf0, 'no frame after the hidden tab').toBe(0);
    } finally {
      await second.context.close();
    }
  });

  test(title('home.budget.frame'), async ({ browser }) => {
    test.setTimeout(180_000);
    test.skip(load() >= MEASURE_LOAD, `not read: load ${load()}`);
    for (const rate of [1, 4]) {
      const { context, page } = await open(browser, { height: 700 });
      try {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate });
        await visit(page);
        await liveReady(page);
        await bootEnded(page);
        await page.waitForTimeout(2_000);
        for (const target of ['strip', 'canvas'] as const) {
          await wheelTo(page, await yToSee(page, SELECTORS[target]));
          await page.waitForTimeout(3_000);
        }
        const r = await rec(page);
        const printing = (name: string): [number, number] => {
          const start =
            r.states.find(([, n, s]) => n === name && s === 'developing')?.[0] ?? Infinity;
          const end =
            r.states.find(([t, n, s]) => n === name && s === 'still' && t > start)?.[0] ?? -1;
          return [start, end];
        };
        const frames = (name: string): number => {
          const [start, end] = printing(name);
          return Math.max(0, ...r.frames.filter(([t]) => t >= start && t <= end).map(([, d]) => d));
        };
        const longestEntering = Math.max(0, ...r.io.map(([, d]) => d));
        const reading = {
          hero: frames('hero'),
          strip: frames('strip'),
          canvas: frames('canvas'),
          entering: longestEntering,
        };
        note(
          `${rate}x CPU: the longest field frame (hero, strip, canvas)`,
          `${reading.hero.toFixed(2)}, ${reading.strip.toFixed(2)}, ${reading.canvas.toFixed(2)} ms`,
        );
        note(`${rate}x CPU: the longest band entering (observer callback)`, reading.entering);
        const frameBound = rate === 1 ? 2 : 8;
        const enterBound = rate === 1 ? 10 : 35;
        expect(Math.max(reading.hero, reading.strip, reading.canvas)).toBeLessThanOrEqual(
          frameBound,
        );
        expect(reading.entering).toBeLessThanOrEqual(enterBound);
      } finally {
        await context.close();
      }
    }
  });

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
        traceEvents: {
          name: string;
          ts: number;
          dur?: number;
          ph: string;
          tid: number;
          args?: Record<string, unknown>;
        }[];
      };
      const events = trace.traceEvents;
      const lcp = events.filter((e) => e.name === 'largestContentfulPaint::Candidate').at(-1);
      const nav = events.find((e) => e.name === 'navigationStart' || e.name === 'NavigationStart');
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
      const loaded = events.find((e) => e.name === 'MarkLoad' && e.tid === main)?.ts ?? 0;
      const window65 =
        scripts
          .filter((e) => e.ts >= loaded && e.ts <= loaded + 6_500_000)
          .reduce((n, e) => n + (e.dur ?? 0), 0) / 1000;
      const longest = Math.max(0, ...scripts.map((e) => (e.dur ?? 0) / 1000));
      note('script task time before LCP at 1x', scriptBeforeLcp);
      note('script task time from load to 6.5 s after at 1x', window65);
      note('the longest script task', longest);
      expect(scriptBeforeLcp).toBeLessThanOrEqual(120);
      expect(window65).toBeLessThanOrEqual(150);
      expect(longest).toBeLessThanOrEqual(50);
    } finally {
      await context.close();
    }
  });

  test(title('home.a11y.keyboard-walk'), async ({ browser }) => {
    test.setTimeout(180_000);
    const { context, page } = await open(browser);
    try {
      await visit(page);
      await liveReady(page);
      await bootEnded(page);
      /* the controls in reading order: every visible focusable element of the page, in DOM order,
         kept on the window so each Tab stop is read by its place in that list (an object's inline
         style changes when it takes focus, so its markup is no identity) */
      const expected = await page.evaluate(() => {
        const visible = (el: Element): boolean => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return (
            r.width > 0 &&
            r.height > 0 &&
            s.visibility === 'visible' &&
            el.closest('[inert],[aria-hidden="true"]') === null
          );
        };
        const list = [
          ...document.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), [tabindex="0"]',
          ),
        ].filter((el) => el.tabIndex >= 0 && visible(el));
        (window as unknown as { __walk: HTMLElement[] }).__walk = list;
        return list.map((el) => el.outerHTML.slice(0, 120));
      });
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
        reached.slice(0, expected.length).map((i) => expected[i] ?? `outside the list (${i})`),
      ).toEqual(expected);
      /* SC 2.1.4: no key without a modifier acts with focus on nothing it changes */
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      const snapshot = () =>
        page.evaluate(() => ({
          rows: document.querySelectorAll('[data-history] [data-history-row]').length,
          show: document.querySelector('[data-show]:not([hidden])') !== null,
          kit: document.querySelector('main')?.getAttribute('data-page-kit') ?? 'gt',
          title:
            (document.querySelector('[data-object="title#heading"]') as HTMLElement | null)?.style
              .transform ?? '',
        }));
      const quiet = await snapshot();
      for (const key of ['s', 'p', 'z', '[', ']', 'Enter', 'ArrowRight', 'Delete', 'Backspace'])
        await page.keyboard.press(key);
      expect(await snapshot()).toEqual(quiet);
      /* Cmd or Ctrl+Z with focus outside an editing band changes nothing */
      await nudgeTitle(page);
      const changed = await historyRows(page);
      await page.locator('footer a').first().focus();
      await page.keyboard.press('ControlOrMeta+z');
      await page.waitForTimeout(300);
      expect(await historyRows(page)).toBe(changed);
      await page.locator('[data-band="agents"] [role="tab"]').first().focus();
      await page.keyboard.press('ControlOrMeta+z');
      await page.waitForTimeout(300);
      expect(await historyRows(page)).toBe(changed);
    } finally {
      await context.close();
    }
  });
}
