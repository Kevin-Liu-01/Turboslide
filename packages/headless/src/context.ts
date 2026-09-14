// One page per theme (SPEC 5.3): a 1600 by 900 viewport, deviceScaleFactor 1, 2 or 3, reduced
// motion, the color scheme, the theme seeded in localStorage under the deck's two keys before any
// script runs (the viewer boots dark unless a theme is stored and never consults
// prefers-color-scheme, shoot-slide.mjs line 33), and the page and console error collectors of
// shoot-slide.mjs lines 35 and 36. Every sheet page a job opens comes from here, so the context
// and page deadlines and the single-process close guard apply to all of them: the export's 3x
// page for icons and marks was opened raw in packages/export until the hosted native export
// closed its context on chrome-headless-shell and crashed (docs/hosting-chromium.md section 3b).
import type { Browser, BrowserContext, Page } from 'playwright-core';

import type { RenderScale, RenderTheme } from './contracts.ts';
import { isSingleProcessBrowser, launchLog, withDeadline } from './launch.ts';

/** How long a browser context or page may take to open before the job fails with a reason. */
export const CONTEXT_TIMEOUT_MS = 60_000;

export const SHEET = { width: 1600, height: 900 } as const;

/**
 * The device scale factors a sheet page opens at: the render record scales (1 and 2, SPEC 4.2)
 * and 3, the export's raster scale for icons and marks (SPEC 8.6). The page types are generic
 * over the scale so a RenderRecord consumer (record.ts) keeps `1 | 2` and the export's 3x page
 * reports 3.
 */
export type SheetScale = RenderScale | 3;

export type SheetPageOptions<S extends SheetScale = RenderScale> = {
  theme: RenderTheme;
  /** Default 1. */
  scale?: S;
  viewport?: { width: number; height: number };
  /**
   * The network rule of the page (gslides-parity SPEC-3 0.30, 8.6): `deny` (the default) lets
   * `file:`, `data:`, `blob:` and `about:` requests and the loopback names through and aborts every
   * other request, so a slide's markup cannot reach the network from the render; `open` keeps
   * today's behaviour (`TURBOSLIDE_EGRESS=open`). `allowHosts` names hosts a capture may reach.
   */
  egress?: EgressRule;
  allowHosts?: ReadonlyArray<string>;
};

export type EgressRule = 'deny' | 'open';

/** The variable that opens the network of render pages; unset is `deny`. */
export const EGRESS_ENV = 'TURBOSLIDE_EGRESS';

export function defaultEgress(env: NodeJS.ProcessEnv = process.env): EgressRule {
  return env[EGRESS_ENV]?.trim().toLowerCase() === 'open' ? 'open' : 'deny';
}

/** The schemes a render page may load without a network: the document and its own resources. */
const LOCAL_SCHEMES: ReadonlyArray<string> = ['file:', 'data:', 'blob:', 'about:', 'chrome-error:'];

const LOOPBACK =
  /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\]|0\.0\.0\.0)(?::\d+)?$|\.localhost(?::\d+)?$/i;

/**
 * True when a request a render page makes may proceed under the deny rule: a local scheme, a
 * loopback host (the dev server a measurement page runs on), or an allowlisted host.
 */
export function egressAllowed(url: string, allowHosts: ReadonlyArray<string> = []): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (LOCAL_SCHEMES.includes(parsed.protocol)) return true;
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (LOOPBACK.test(parsed.host)) return true;
  const host = parsed.hostname.toLowerCase();
  return allowHosts.some((entry) => {
    const allowed = entry.toLowerCase();
    return host === allowed || host.endsWith(`.${allowed}`);
  });
}

/**
 * Closes the network of a context (SPEC-3 8.6 "Chromium's network closed during renders,
 * thumbnails, exports and captures"): every request outside `egressAllowed` is aborted and
 * recorded, so a slide whose `html` block names `http://127.0.0.1/x` or an outside beacon renders
 * with the request aborted in the route log. Returns the blocked URLs so far.
 */
export async function denyEgress(
  context: BrowserContext,
  allowHosts: ReadonlyArray<string> = [],
): Promise<{ blocked: () => string[] }> {
  const blocked: string[] = [];
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (egressAllowed(url, allowHosts)) return route.continue();
    blocked.push(url);
    launchLog(`egress denied: ${url.slice(0, 120)}`);
    return route.abort('blockedbyclient');
  });
  return { blocked: () => [...blocked] };
}

export type SheetPage<S extends SheetScale = RenderScale> = {
  context: BrowserContext;
  page: Page;
  theme: RenderTheme;
  scale: S;
  /** Errors since the last takeErrors(). */
  takeErrors: () => { pageErrors: string[]; consoleErrors: string[] };
  /** The requests the egress rule aborted since the page opened (SPEC-3 8.6). */
  blocked: () => string[];
  close: () => Promise<void>;
};

export async function openSheetPage<S extends SheetScale = RenderScale>(
  browser: Browser,
  options: SheetPageOptions<S>,
): Promise<SheetPage<S>> {
  // 1 when omitted; S is then the default type parameter, the record scales, which admit 1
  const scale = (options.scale ?? 1) as S;
  // bounded: a browser that stops answering the protocol would otherwise hold the job forever
  // (measured on the hosted previews; launch.ts records the cause)
  const context = await withDeadline(
    browser.newContext({
      viewport: options.viewport ?? { width: SHEET.width, height: SHEET.height },
      deviceScaleFactor: scale,
      colorScheme: options.theme,
      reducedMotion: 'reduce',
    }),
    CONTEXT_TIMEOUT_MS,
    'sheet context',
  );
  launchLog(`sheet context ${options.theme} at ${scale}x`);
  const egress =
    (options.egress ?? defaultEgress()) === 'deny'
      ? await denyEgress(context, options.allowHosts ?? [])
      : { blocked: () => [] as string[] };
  await context.addInitScript((theme: string) => {
    try {
      localStorage.setItem('gt-theme', theme);
      localStorage.setItem('gt-deck-theme', theme);
    } catch {
      // storage unavailable on file URLs in some configurations; the document stamps the theme itself
    }
  }, options.theme);
  const page = await withDeadline(context.newPage(), CONTEXT_TIMEOUT_MS, 'sheet page');
  launchLog('sheet page open');
  let pageErrors: string[] = [];
  let consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    // the resource a load error names travels with the text (a bare "Failed to load resource:
    // net::ERR_FAILED" from the hosted browser said nothing about which one)
    const url = message.location().url;
    consoleErrors.push(
      url && !message.text().includes(url) ? `${message.text()} (${url})` : message.text(),
    );
  });
  return {
    context,
    page,
    theme: options.theme,
    blocked: egress.blocked,
    scale,
    takeErrors() {
      const out = { pageErrors, consoleErrors };
      pageErrors = [];
      consoleErrors = [];
      return out;
    },
    // the single-process serverless shell crashes when a context is closed (launch.ts records the
    // core files that left), so its contexts stay open until the browser is killed; elsewhere a
    // close error after the records are written is not a render failure
    close: () =>
      isSingleProcessBrowser(browser) ? Promise.resolve() : context.close().catch(() => undefined),
  };
}
