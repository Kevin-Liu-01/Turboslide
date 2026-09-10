// The shell driver of Prototemplate/scripts/lint-lines.mjs (auditShellRoute, lines 862 to 983),
// ported for `turboslide lint --chrome` (SPEC 2.2, MILESTONES M1 acceptance). It opens one page
// at a width and theme, waits for the shell, verifies the theme, then drives the shell through
// its states with the keyboard and runs an audit function inside the document after each. The
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
  /** The key that enters the state ('[' for the list, 'g' for the grid, 'Meta+k' for the search). */
  key: string;
  /** The audit name this state records under; may depend on the probe and the viewport width. */
  name?: (probe: ShellProbe, narrow: boolean) => string;
  /** Whether the probe shows the state applied. */
  applied: (probe: ShellProbe, narrow: boolean) => boolean;
  /** The key that leaves the state; default Escape. */
  leave?: string | ((probe: ShellProbe, narrow: boolean) => string);
  settleMs?: number;
};

/** The states lint-lines.mjs drives: the list toggle, the index panel, the search, the grid, the book. */
export const SHELL_STATES: Record<string, ShellStateSpec> = {
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
      await page.waitForSelector(plan.readySelector ?? '.pt-viewer, .ts-studio, .viewer', {
        timeout,
      });
    }
    await target.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);

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
