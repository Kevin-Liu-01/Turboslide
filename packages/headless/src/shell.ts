// The shell driver of Prototemplate/scripts/lint-lines.mjs (auditShellRoute, lines 862 to 983),
// ported for `turboslide lint --chrome` (SPEC 2.2, MILESTONES M1 acceptance). It opens one page
// at a width and theme, waits for the shell and for its client to hydrate (a bounded wait, never
// a fixed settle), verifies the theme, then drives the shell through its states with the keyboard
// and, once the document has stopped moving, runs an audit function inside it after each. The
// audit and the probe are parameters (they live in @turboslide/lint, which this package does not
// import, SPEC 3.3 item 3) and must be self-contained because Playwright serializes them.
// A state that did not apply is an infrastructure failure, never a pass (lint-lines.mjs line 113).
import type { Browser, Frame } from 'playwright-core';

export type ShellProbe = {
  theme: string | null;
  kind: string;
  sb: string | null;
  overlay: boolean;
  panel: boolean;
  search: boolean;
  mode: string | null;
  grid: boolean;
  book: boolean;
  help: boolean;
  [extra: string]: unknown;
};

export type ShellStateSpec = {
  /**
   * The key that enters the state ('[' for the list, 'g' for the grid, 'Meta+k' for the search),
   * or a click: `click:<selector>` presses the first element the selector finds (the editor binds
   * no bare letters, gslides-parity SPEC 10.2, so its states enter through its controls).
   */
  key: string;
  /** The audit name this state records under; may depend on the probe and the viewport width. */
  name?: (probe: ShellProbe, narrow: boolean) => string;
  /** Whether the probe shows the state applied. */
  applied: (probe: ShellProbe, narrow: boolean) => boolean;
  /** The key that leaves the state; default Escape. */
  leave?: string | ((probe: ShellProbe, narrow: boolean) => string);
  settleMs?: number;
};

/**
 * The states lint-lines.mjs drives (the list toggle, the index panel, the search, the grid, the
 * book) plus the editor's (MILESTONES M3 acceptance): inspector (Tab selects the first block, so
 * the ring, the chip and the Block section show), source (Cmd / opens the drawer), palette
 * (Cmd K) and twin (Shift D). The probe fields they read are packages/lint chrome.ts probeState.
 */
export const SHELL_STATES: Record<string, ShellStateSpec> = {
  /* the editor's states (gslides-parity SPEC 14.1 step 18, 14.5): grid view from the bottom bar,
     a bar menu open, the right panel open through Google's Version history chord
     (Cmd+Option+Shift+H, menus/model.ts file.versionHistory.see). Not the toolbar's Theme button,
     which collapses into More at or below 1100 px (SPEC 0.6, 1.3) while step 18 audits 390 px;
     not the bottom bar's Show side panel button either, which the dev server's TanStack devtools
     trigger covers at the bottom right (Playwright refuses the intercepted click). The chord
     works at every width and Escape closes the panel (the shell's Esc ladder). */
  editorGrid: {
    key: 'click:[data-control="view.gridView"]',
    applied: (p) => p.grid,
    leave: 'click:[data-control="view.filmstripView"]',
    settleMs: 700,
  },
  editorMenu: {
    key: 'click:[data-control="menubar.file"]',
    applied: (p) => Boolean(p.menu),
    leave: 'Escape',
    settleMs: 500,
  },
  editorPanel: {
    key: 'Meta+Alt+Shift+H',
    applied: (p) => Boolean(p.rpanel),
    leave: 'Escape',
    settleMs: 600,
  },
  list: {
    key: '[',
    name: (p, narrow) => (narrow || p.overlay ? 'list-open' : 'list-closed'),
    // at a wide width the column closes; at or below 900 px it opens as the overlay
    applied: (p, narrow) => (narrow ? p.overlay || p.sb !== '0' : p.sb === '0'),
    leave: (_p, narrow) => (narrow ? 'Escape' : '['),
    settleMs: 500,
  },
  index: { key: 'r', applied: (p) => p.panel, settleMs: 500 },
  search: {
    key: 'Meta+k',
    name: (p) => (p.search ? 'search' : p.panel ? 'search-as-index' : 'search'),
    applied: (p) => p.search || p.panel,
    settleMs: 500,
  },
  grid: { key: 'g', applied: (p) => p.grid, settleMs: 700 },
  book: { key: 'b', applied: (p) => p.book, settleMs: 700 },
  inspector: {
    key: 'Tab',
    applied: (p) => Boolean(p.inspector) && Boolean(p.selected),
    leave: 'Escape',
    settleMs: 600,
  },
  source: { key: 'Meta+/', applied: (p) => Boolean(p.source), leave: 'Meta+/', settleMs: 700 },
  palette: { key: 'Meta+k', applied: (p) => p.search, leave: 'Escape', settleMs: 500 },
  twin: { key: 'Shift+D', applied: (p) => Boolean(p.twin), leave: 'Shift+D', settleMs: 700 },
};

export type ShellDrivePlan<TConfig, TAudit> = {
  url: string;
  width: number;
  theme: 'light' | 'dark';
  states: string[];
  stateSpecs?: Record<string, ShellStateSpec>;
  /** Self-contained function run in the document to read what it shows. */
  probe: () => ShellProbe;
  /** Self-contained audit run in the document. */
  audit: (cfg: TConfig) => TAudit;
  cfg: TConfig;
  /** The selector that marks the shell as mounted. */
  readySelector?: string;
  /** Audit the first iframe's document instead (the Prototemplate /deck page). */
  deckFrame?: boolean;
  /** The key that toggles the theme when the document shows the other one. */
  themeKey?: string;
  timeoutMs?: number;
  /**
   * How long to wait for the studio page's client to take over the shell before the first key
   * (default 30 s; the page is an infrastructure failure past it). A page without the ported
   * shell root (the Prototemplate deck) has no hydration mark and gets `settleMs` instead.
   */
  hydrateTimeoutMs?: number;
  /** The fixed settle for a page without a hydration mark (default 1200 ms). */
  settleMs?: number;
  /** The bound on the wait for animations and scrolling to stop before each audit (default 2000 ms). */
  auditSettleMs?: number;
};

/**
 * Whether the studio page's client is running. Self-contained (Playwright serializes it): the
 * window API owner is installed (packages/agent window/registry.ts), or the shell root carries
 * data-settled, which ViewerShell sets one frame after its mount effect. The key listeners attach
 * in that same mount (useShellKeys, useMountEffect), so a key pressed earlier lands on the
 * server's markup and toggles nothing. Measured on a cold Vite dev server: with a fixed 1200 ms
 * settle the first audit reported `state "list" did not apply` in three runs of three.
 */
const hydrated = (): boolean => {
  const w = window as Window & { turboslide?: { studio?: unknown } };
  if (w.turboslide?.studio) return true;
  if (document.querySelector('.pt-viewer[data-settled]') !== null) return true;
  /* the home page and the trash announce their hydration themselves (apps/studio decks.index.tsx) */
  return document.querySelector('[data-hydrated]') !== null;
};

/**
 * Resolves once the document has stopped moving: no running animation with a finite iteration
 * count (CSS transitions, keyframe animations, and the view transition's
 * `::view-transition-old/new` pseudo-element animations, which Chromium lists on `html`), and the
 * window's and every element's scroll offsets unchanged across two samples 120 ms apart; or
 * `maxMs` reached. Finished animations kept by their fill mode (the outline rows' 120 ms entry)
 * and infinite loops are not motion.
 *
 * Why this exists (measured at 390 dark on /edit, the book state): the mode change runs through
 * `document.startViewTransition`, and while its 200 ms cross-fade runs, hit testing goes to the
 * `::view-transition` tree, so `document.elementsFromPoint` names no covering element and the
 * auditor's `bothVisible` (packages/lint chrome.ts) sees the book's rules through the opaque
 * inspector that covers them. The four findings (`ts-ctl-textarea | DIV`, `ts-ctl-json-field |
 * DIV`, `A | ts-insp-head`, `ts-ctl-select | A`) appear at 100 ms after the key and are gone at
 * 300 ms with the same 554 segments; the state's fixed 700 ms settle lands inside the transition
 * only when the book's mount is slow (one run of three by hand, the full chain under a
 * concurrent image build). Self-contained (Playwright serializes it).
 */
const settleDocument = async (maxMs: number): Promise<{ ms: number; settled: boolean }> => {
  const t0 = performance.now();
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const moving = (): boolean =>
    document.getAnimations().some((animation) => {
      if (animation.playState !== 'running') return false;
      const timing = animation.effect?.getTiming();
      return timing === undefined || timing.iterations !== Infinity;
    });
  const scrolls = (): string => {
    const out: string[] = [`${window.scrollX},${window.scrollY}`];
    for (const el of document.querySelectorAll<HTMLElement>('*')) {
      if (el.scrollTop !== 0 || el.scrollLeft !== 0) out.push(`${el.scrollTop},${el.scrollLeft}`);
    }
    return out.join(';');
  };
  let last = scrolls();
  while (performance.now() - t0 < maxMs) {
    await wait(120);
    const next = scrolls();
    if (next === last && !moving()) {
      return { ms: Math.round(performance.now() - t0), settled: true };
    }
    last = next;
  }
  return { ms: Math.round(performance.now() - t0), settled: false };
};

export type ShellDriveResult<TAudit> = {
  url: string;
  width: number;
  theme: 'light' | 'dark';
  results: Record<string, TAudit & { probe: ShellProbe }>;
  unapplied: string[];
  /** Set when the page could not be audited at all (HTTP error, missing shell, wrong theme). */
  infrastructure?: string;
};

async function press(target: Frame, key: string, deck: boolean): Promise<void> {
  if (key.startsWith('click:')) {
    const selector = key.slice('click:'.length);
    const el = await target.$(selector);
    if (el === null) throw new Error(`state control not found: ${selector}`);
    await el.click();
    return;
  }
  if (!deck) {
    await target.page().keyboard.press(key);
    return;
  }
  const m = /^(?:(Meta|Control)\+)?(.+)$/.exec(key);
  const mod = m?.[1] ?? null;
  const k = m?.[2] ?? key;
  await target.evaluate(
    ([kk, mm]) => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: kk,
          bubbles: true,
          cancelable: true,
          metaKey: mm === 'Meta',
          ctrlKey: mm === 'Control',
        }),
      );
    },
    [k, mod] as [string, string | null],
  );
}

export async function driveShell<TConfig, TAudit extends object>(
  browser: Browser,
  plan: ShellDrivePlan<TConfig, TAudit>,
): Promise<ShellDriveResult<TAudit>> {
  const { url, width, theme } = plan;
  const timeout = plan.timeoutMs ?? 60_000;
  const height = width <= 600 ? 844 : 900;
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
  const out: ShellDriveResult<TAudit> = { url, width, theme, results: {}, unapplied: [] };
  try {
    await context.addInitScript((t: string) => {
      try {
        localStorage.setItem('gt-theme', t);
        localStorage.setItem('gt-deck-theme', t);
      } catch {
        // storage unavailable
      }
    }, theme);
    const page = await context.newPage();
    const response = await page.goto(url, { waitUntil: 'load', timeout });
    if (!response || response.status() >= 400) {
      out.infrastructure = `HTTP ${response ? response.status() : 'none'} for ${url}`;
      return out;
    }
    let target: Frame = page.mainFrame();
    let deck = false;
    if (plan.deckFrame) {
      await page.waitForSelector('iframe, .pt-viewer', { timeout });
      const iframe = await page.$('iframe');
      if (iframe) {
        const frame = await iframe.contentFrame();
        if (!frame) {
          out.infrastructure = `the deck iframe at ${url} has no document`;
          return out;
        }
        await frame.waitForSelector('.viewer', { timeout });
        target = frame;
        deck = true;
      }
    } else {
      await page.waitForSelector(
        plan.readySelector ?? '.pt-viewer, .ts-studio, .viewer, .ts-home-page, .ts-trash-page',
        { timeout },
      );
    }
    // the ported shell hydrates (data-settled, or the window API owner); the Prototemplate deck
    // and any other page without the shell root keep the fixed settle
    const shellRoot = deck ? null : await page.$('.pt-viewer, .ts-home-page, .ts-trash-page');
    if (shellRoot) {
      const hydrateTimeout = plan.hydrateTimeoutMs ?? 30_000;
      try {
        await page.waitForFunction(hydrated, undefined, { timeout: hydrateTimeout, polling: 100 });
      } catch {
        out.infrastructure = `${url} at ${width} did not hydrate within ${hydrateTimeout} ms (no .pt-viewer[data-settled], no window.turboslide.studio)`;
        return out;
      }
    } else {
      await page.waitForTimeout(plan.settleMs ?? 1200);
    }
    await target.evaluate(() => document.fonts.ready);

    let probe = await target.evaluate(plan.probe);
    if (probe.theme === null) {
      await page.waitForTimeout(400);
      probe = await target.evaluate(plan.probe);
    }
    if (probe.theme !== null && probe.theme !== theme) {
      await press(target, plan.themeKey ?? 'd', deck);
      await page.waitForTimeout(400);
      probe = await target.evaluate(plan.probe);
    }
    if (probe.theme !== theme) {
      out.infrastructure = `${url} at ${width} shows theme ${String(probe.theme)}, wanted ${theme}`;
      return out;
    }

    // Playwright types evaluate's argument through Unboxed<Arg>, which a generic TConfig cannot
    // satisfy; the audit and its config are plain data, so the call is typed directly.
    const evaluateWith = target.evaluate.bind(target) as unknown as <TResult, TArg>(
      fn: (arg: TArg) => TResult,
      arg: TArg,
    ) => Promise<TResult>;
    const audit = async (name: string): Promise<ShellProbe> => {
      await target.evaluate(settleDocument, plan.auditSettleMs ?? 2000);
      const state = await target.evaluate(plan.probe);
      const found = await evaluateWith(plan.audit, plan.cfg);
      out.results[name] = { ...found, probe: state };
      return state;
    };
    await audit('rest');
    const narrow = width <= 900;
    const specs = plan.stateSpecs ?? SHELL_STATES;
    for (const state of plan.states) {
      const spec = specs[state];
      if (!spec) {
        out.unapplied.push(state);
        continue;
      }
      await press(target, spec.key, deck);
      await page.waitForTimeout(spec.settleMs ?? 500);
      const before = await target.evaluate(plan.probe);
      const name = spec.name ? spec.name(before, narrow) : state;
      const p = await audit(name);
      if (!spec.applied(p, narrow)) out.unapplied.push(state);
      const leave =
        typeof spec.leave === 'function' ? spec.leave(p, narrow) : (spec.leave ?? 'Escape');
      await press(target, leave, deck);
      await page.waitForTimeout(400);
      const after = await target.evaluate(plan.probe);
      // a state that survived its leave key is closed again the way it was opened
      if (spec.applied(after, narrow) && leave !== spec.key) {
        await press(target, spec.key, deck);
        await page.waitForTimeout(400);
      }
    }
    return out;
  } finally {
    await context.close();
  }
}
