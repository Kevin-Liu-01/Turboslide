// Browser launch (SPEC 5.3 determinism rules; AGENTS.md "Chromium"): the full Chrome for Testing
// binary, never the headless shell, with the ANGLE flags per platform, and the renderer string
// every RenderRecord carries so a frame is never regenerated silently on another backend
// (SPEC 5.4: Metal and SwiftShader disagree on pixels, slides report section 2.3).
//
// The fourth executable source, `sparticuz`, is the recorded deviation for a serverless function
// (docs/hosting-chromium.md): @sparticuz/chromium ships chrome-headless-shell 147 for Linux x64
// as Brotli files that inflate into the platform's temp directory on the first launch. It is
// used when TURBOSLIDE_CHROME is the word `sparticuz`, or when the process runs inside a Vercel
// or Lambda function (VERCEL, AWS_LAMBDA_FUNCTION_NAME) and no other executable exists on disk.
// The renderer string then names `chrome-headless-shell`, so a record from that binary is never
// mistaken for one from Chrome for Testing.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium } from 'playwright-core';
import type { Browser, BrowserContext, Page } from 'playwright-core';

export type GpuBackend = 'angle-metal' | 'swiftshader';

/**
 * The build the deck's shoot-slide.mjs hard-codes and compare-to-shoot.mjs needs for a meaningful
 * pixel comparison (AGENTS.md: playwright-core 1.62.1 installs revision 1234 instead).
 */
export const CHROMIUM_1217_PATH =
  '/Users/kevinliu/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

/** SPEC 5.3: the flags per backend. Chrome 137 removed the automatic SwiftShader fallback. */
export const LAUNCH_ARGS: Record<GpuBackend, readonly string[]> = {
  'angle-metal': ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
  swiftshader: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
};

export type ExecutableSource = 'env' | 'chromium-1217' | 'playwright' | 'sparticuz';

/** The TURBOSLIDE_CHROME value that selects the serverless binary. */
export const SPARTICUZ_CHROME = 'sparticuz';

/** The npm package of the serverless binary; the catalog pins 147.0.2 (Chromium 147, x64). */
export const SPARTICUZ_PACKAGE = '@sparticuz/chromium';

/** What the binary is: the headless shell, not the full browser (SPEC 5.3 deviation). */
export const SPARTICUZ_PRODUCT = 'chrome-headless-shell';

/** The product name the renderer string leads with for the three regular sources. */
export const CHROME_FOR_TESTING = 'Chrome for Testing';

/** Where @sparticuz/chromium inflates the binary: `<tmpdir>/chromium`, the only writable path in a function. */
export function sparticuzInflatedPath(tmp: string = tmpdir()): string {
  return join(tmp, 'chromium');
}

/** True inside a Vercel function or a Lambda: the two markers the platforms set. */
export function isServerless(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.VERCEL) || Boolean(env.AWS_LAMBDA_FUNCTION_NAME);
}

export type ResolvedExecutable = { path: string; source: ExecutableSource };

export type ResolveOptions = {
  /** Replaces existsSync (tests). */
  exists?: (path: string) => boolean;
  /** The Playwright default path; replaces chromium.executablePath() (tests). */
  playwrightPath?: () => string;
};

/**
 * TURBOSLIDE_CHROME (the word `sparticuz` selects the serverless binary), then the chromium-1217
 * build when present, then playwright-core's default when it is on disk, then, inside a function,
 * the serverless binary, and otherwise playwright-core's default so its "browser not installed"
 * message stays the one a developer sees. Synchronous: for `sparticuz` the path is where the
 * binary will be once prepareExecutable() has inflated it, which existsSync answers false for
 * until the first launch, so a test that probes the path skips as before.
 */
export function resolveExecutable(
  env: NodeJS.ProcessEnv = process.env,
  options: ResolveOptions = {},
): ResolvedExecutable {
  const exists = options.exists ?? existsSync;
  const playwrightPath = options.playwrightPath ?? (() => chromium.executablePath());
  const fromEnv = env.TURBOSLIDE_CHROME;
  if (fromEnv === SPARTICUZ_CHROME) return { path: sparticuzInflatedPath(), source: 'sparticuz' };
  if (fromEnv && fromEnv.length > 0) return { path: fromEnv, source: 'env' };
  if (exists(CHROMIUM_1217_PATH)) return { path: CHROMIUM_1217_PATH, source: 'chromium-1217' };
  const fromPlaywright = playwrightPath();
  if (exists(fromPlaywright)) return { path: fromPlaywright, source: 'playwright' };
  if (isServerless(env)) return { path: sparticuzInflatedPath(), source: 'sparticuz' };
  return { path: fromPlaywright, source: 'playwright' };
}

/** The shape of @sparticuz/chromium 147.0.2's default export, typed here because the dependency is optional. */
type SparticuzModule = {
  default: {
    readonly args: string[];
    readonly graphics: boolean;
    executablePath: (input?: string) => Promise<string>;
  };
};

/**
 * Switches of chromium.args that are dropped before the merge, and why:
 * - `--headless='shell'`: Playwright passes `--headless` itself and refuses to have the mode set
 *   twice in spirit; the binary is the headless shell whatever the switch says.
 * - `--enable-features=...` and `--disable-features=...`: Chromium reads the last occurrence of a
 *   repeated switch, and the user args land after Playwright's, so the package's short lists
 *   (`SharedArrayBuffer`; `AudioServiceOutOfProcess,IsolateOrigins,site-per-process`) would erase
 *   Playwright's own (`CDPScreenshotNewSurface`, the Translate and field trial disables that keep a
 *   screenshot deterministic). Site isolation is moot under `--single-process` anyway.
 * - `--no-sandbox`: Playwright adds it because `chromiumSandbox` is off by default.
 * - The SwiftShader set: already in LAUNCH_ARGS.swiftshader, so it is not repeated.
 */
export const SPARTICUZ_DROPPED_PREFIXES: readonly string[] = [
  '--headless',
  '--enable-features=',
  '--disable-features=',
  '--no-sandbox',
];

/**
 * The two switches of the serverless package that relax the browser's own security (gslides-parity
 * SPEC-3 8.10; report 04 F18): dropped under `TURBOSLIDE_WEB_SECURITY=strict`. The default keeps
 * them until the verifier's preview run shows the `file://` subresource fixture rendering without
 * them (docs/gslides-parity/build-3/b4.md records the measurement), then the default flips.
 */
export const WEB_SECURITY_PREFIXES: readonly string[] = [
  '--disable-web-security',
  '--allow-running-insecure-content',
];

export const WEB_SECURITY_ENV = 'TURBOSLIDE_WEB_SECURITY';

export function strictWebSecurity(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[WEB_SECURITY_ENV]?.trim().toLowerCase() === 'strict';
}

/**
 * chromium.args with the conflicts above removed and the deck's SwiftShader flags deduplicated.
 * What stays and matters: `--single-process`, `--no-zygote` and `--in-process-gpu` (one process
 * in the function), `--disable-setuid-sandbox`, `--font-render-hinting=none` (the package's
 * choice for stable text across hosts; a recorded pixel difference against the container's
 * default hinting), `--disable-web-security` and `--allow-running-insecure-content` (harmless on
 * the file:// documents the renderer loads), the cache and nudge switches.
 */
export function sparticuzExtraArgs(
  args: readonly string[],
  options: { strictWebSecurity?: boolean } = {},
): string[] {
  const base = new Set<string>(LAUNCH_ARGS.swiftshader);
  const strict = options.strictWebSecurity ?? strictWebSecurity();
  const out: string[] = [];
  for (const arg of args) {
    if (SPARTICUZ_DROPPED_PREFIXES.some((prefix) => arg.startsWith(prefix))) continue;
    if (strict && WEB_SECURITY_PREFIXES.some((prefix) => arg.startsWith(prefix))) continue;
    if (base.has(arg) || out.includes(arg)) continue;
    out.push(arg);
  }
  return out;
}

export type PreparedExecutable = ResolvedExecutable & {
  /** Switches to add after the backend flags (empty for the three regular sources). */
  extraArgs: string[];
  /** The product name the renderer string leads with. */
  product: string;
  /** Milliseconds spent inflating the serverless binary (0 when it was already there or not used). */
  inflateMs: number;
};

/**
 * The executable, ready to launch: the resolved path for the three regular sources; for
 * `sparticuz`, @sparticuz/chromium is loaded (an optional dependency, so the specifier is a
 * variable and no bundler follows it) and executablePath() inflates chromium.br, fonts.tar.br and
 * swiftshader.tar.br into the temp directory (about 130 MB, once per warm function).
 */
/**
 * Progress lines on stderr for the launch steps, on when TURBOSLIDE_LAUNCH_LOG is set or the
 * process runs inside a function (where they are the only record of where a launch stopped;
 * measured on the first hosted previews: a render job ran to its 300 s timeout without a line).
 */
export function launchLog(line: string, env: NodeJS.ProcessEnv = process.env): void {
  if (env.TURBOSLIDE_LAUNCH_LOG || isServerless(env)) console.error(`turboslide launch: ${line}`);
}

/** The launch waits at most this long for the browser (Playwright's default is 180 s). */
export const LAUNCH_TIMEOUT_MS = 90_000;

/** How long a killed serverless browser may take to exit before close() gives up waiting. */
export const KILL_TIMEOUT_MS = 5_000;

// The serverless shell runs --single-process and dies with SIGSEGV when a context or the
// browser is closed; the kernel then writes a core file of the whole process into the temp
// directory (measured on the hosted previews: two `core.chromium.*` files of 1,069 and 1,037 MB
// after two renders on a 525 MB /tmp, and every later file:// load answered net::ERR_FAILED).
// Two defences: the binary starts through a shell wrapper that sets the core limit to zero, and
// close() ends the process with SIGKILL, which produces no core, instead of the graceful close.
const singleProcessBrowsers = new WeakSet<Browser>();

/** Whether this browser is the single-process serverless shell (contexts are not closed on it). */
export function isSingleProcessBrowser(browser: Browser): boolean {
  return singleProcessBrowsers.has(browser);
}

/**
 * Flags `browser` as the single-process serverless shell, so every sheet context opened on it
 * stays open until the browser is killed (context.ts). launchBrowser calls it for the sparticuz
 * source; exported so a test can run the export's close path against a browser flagged the same
 * way (packages/export/src/scene/extract.test.ts).
 */
export function markSingleProcessBrowser(browser: Browser): void {
  singleProcessBrowsers.add(browser);
}

/** The environment variable the wrapper reads for the file it writes the browser's pid to. */
export const PID_FILE_VARIABLE = 'TURBOSLIDE_PIDFILE';

/**
 * The path of a shell wrapper that starts `binary` with core dumps off and records its pid
 * (the shell's pid survives the exec, so the file names the browser process itself, the one
 * process of the single-process shell); written beside the binary once.
 */
export function noCoreWrapper(binary: string): string {
  const wrapper = `${binary}-nocore.sh`;
  if (!existsSync(wrapper)) {
    writeFileSync(
      wrapper,
      [
        '#!/bin/sh',
        'ulimit -c 0 2>/dev/null',
        `[ -n "$${PID_FILE_VARIABLE}" ] && echo $$ > "$${PID_FILE_VARIABLE}"`,
        `exec "${binary}" "$@"`,
        '',
      ].join('\n'),
      { mode: 0o755 },
    );
  }
  return wrapper;
}

/** The pid the wrapper recorded, or null. */
export function readPid(pidFile: string): number | null {
  try {
    const pid = Number(readFileSync(pidFile, 'utf8').trim());
    return Number.isInteger(pid) && pid > 1 ? pid : null;
  } catch {
    return null;
  }
}

/** Ends the browser process the wrapper recorded with SIGKILL and waits for it to go. */
export async function killBrowser(pidFile: string): Promise<'killed' | 'gone' | 'unknown'> {
  const pid = readPid(pidFile);
  rmSync(pidFile, { force: true });
  if (pid === null) return 'unknown';
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    return 'gone';
  }
  const deadline = Date.now() + KILL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch {
      return 'killed';
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return 'killed';
}

/** The WebGL probe waits at most this long; a hung probe answers null and the launch goes on. */
export const PROBE_TIMEOUT_MS = 30_000;

export async function prepareExecutable(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): Promise<PreparedExecutable> {
  const resolved = resolveExecutable(env);
  launchLog(`executable ${resolved.source} ${resolved.path}`, env);
  if (resolved.source !== 'sparticuz')
    return { ...resolved, extraArgs: [], product: CHROME_FOR_TESTING, inflateMs: 0 };
  if (platform !== 'linux' || arch !== 'x64')
    throw new Error(
      `${SPARTICUZ_PACKAGE} ships a Linux x64 binary only; this process is ${platform} ${arch}. Set TURBOSLIDE_CHROME to a Chrome for Testing binary instead.`,
    );
  const specifier = SPARTICUZ_PACKAGE;
  let mod: SparticuzModule;
  try {
    mod = (await import(specifier)) as SparticuzModule;
  } catch (error) {
    throw new Error(
      `${SPARTICUZ_PACKAGE} is not installed (an optional dependency of @turboslide/headless): ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!mod.default.graphics)
    throw new Error(
      `${SPARTICUZ_PACKAGE}: graphics mode is off; the materials pipeline needs WebGL`,
    );
  const t = performance.now();
  const path = await mod.default.executablePath();
  const inflateMs = Math.round(performance.now() - t);
  launchLog(`inflated ${path} in ${inflateMs} ms`, env);
  return {
    path,
    source: 'sparticuz',
    extraArgs: sparticuzExtraArgs(mod.default.args),
    product: SPARTICUZ_PRODUCT,
    inflateMs,
  };
}

/** Metal on macOS, SwiftShader elsewhere; TURBOSLIDE_GPU=swiftshader|angle-metal overrides. */
export function defaultBackend(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): GpuBackend {
  const forced = env.TURBOSLIDE_GPU;
  if (forced === 'swiftshader' || forced === 'angle-metal') return forced;
  return platform === 'darwin' ? 'angle-metal' : 'swiftshader';
}

export type LaunchOptions = {
  backend?: GpuBackend;
  executablePath?: string;
  /** Probe the WebGL renderer string on launch (one blank page, about 100 ms). Default true. */
  probeRenderer?: boolean;
  extraArgs?: string[];
};

export type LaunchedBrowser = {
  browser: Browser;
  executablePath: string;
  executableSource: ExecutableSource;
  /** `Chrome for Testing`, or `chrome-headless-shell` for the sparticuz source. */
  product: string;
  backend: GpuBackend;
  args: string[];
  /** The Chromium version, for example '147.0.7727.15'. */
  version: string;
  /** The RenderRecord renderer string (SPEC 4.2). */
  renderer: string;
  close: () => Promise<void>;
};

/** The unmasked WebGL renderer string of a page, or null when WebGL is unavailable. */
/** The promise's value, or an Error naming `what` when it has not settled after `ms`. */
export function withDeadline<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} did not answer within ${ms} ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/** The promise's value, or `fallback` when it has not settled after `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

export async function webglRenderer(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return null;
    const value: unknown = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    return typeof value === 'string' ? value : null;
  });
}

/**
 * Compose the renderer string from the product, the browser version and the unmasked WebGL
 * renderer, for example 'ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Max, Unspecified Version)'
 * becomes 'Chrome for Testing 147.0.7727.15, ANGLE Metal, Apple M5 Max'. The serverless binary
 * leads with 'chrome-headless-shell' so the deviation from SPEC 5.3 is in every record.
 */
export function rendererString(
  version: string,
  webgl: string | null,
  backend: GpuBackend,
  product: string = CHROME_FOR_TESTING,
): string {
  const label = `${product} ${version}`;
  if (!webgl)
    return `${label}, ${backend === 'swiftshader' ? 'SwiftShader' : 'ANGLE Metal'}, no WebGL`;
  const backendLabel = /swiftshader/i.test(webgl)
    ? 'SwiftShader'
    : /metal/i.test(webgl)
      ? 'ANGLE Metal'
      : 'ANGLE';
  const device =
    /Renderer:\s*([^,)]+)/.exec(webgl)?.[1]?.trim() ??
    /\(([^,]+),/.exec(webgl)?.[1]?.trim() ??
    webgl;
  return `${label}, ${backendLabel}, ${device}`;
}

export async function launchBrowser(options: LaunchOptions = {}): Promise<LaunchedBrowser> {
  const prepared: PreparedExecutable = options.executablePath
    ? {
        path: options.executablePath,
        source: 'env',
        extraArgs: [],
        product: CHROME_FOR_TESTING,
        inflateMs: 0,
      }
    : await prepareExecutable();
  // the serverless binary has no Metal: SwiftShader whatever the platform default says
  const backend =
    prepared.source === 'sparticuz' ? 'swiftshader' : (options.backend ?? defaultBackend());
  const args = [...LAUNCH_ARGS[backend], ...prepared.extraArgs, ...(options.extraArgs ?? [])];
  launchLog(`launching ${backend} with ${args.length} switches`);
  const t = performance.now();
  const serverless = prepared.source === 'sparticuz';
  const pidFile = join(tmpdir(), `turboslide-chromium-${process.pid}-${Date.now()}.pid`);
  const browser = await chromium.launch({
    executablePath: serverless ? noCoreWrapper(prepared.path) : prepared.path,
    headless: true,
    args,
    timeout: LAUNCH_TIMEOUT_MS,
    ...(serverless ? { env: { ...process.env, [PID_FILE_VARIABLE]: pidFile } } : {}),
  });
  if (serverless) markSingleProcessBrowser(browser);
  const version = browser.version();
  launchLog(`launched ${prepared.product} ${version} in ${Math.round(performance.now() - t)} ms`);
  let webgl: string | null = null;
  let probeContext: BrowserContext | null = null;
  if (options.probeRenderer !== false) {
    const context = await withDeadline(browser.newContext(), PROBE_TIMEOUT_MS, 'probe context');
    const page = await withDeadline(context.newPage(), PROBE_TIMEOUT_MS, 'probe page');
    webgl = await withTimeout(webglRenderer(page), PROBE_TIMEOUT_MS, null);
    launchLog(`webgl ${webgl ?? 'none (or the probe timed out)'}`);
    // the serverless binary runs --single-process: its first context stays open until the browser
    // closes, because on the hosted previews every request that closed it and opened another
    // hung in that second newContext (no protocol answer, no timeout) to the job's 300 s limit
    if (prepared.source === 'sparticuz') probeContext = context;
    else await context.close();
  }
  return {
    browser,
    executablePath: prepared.path,
    executableSource: prepared.source,
    product: prepared.product,
    backend,
    args,
    version,
    renderer: rendererString(version, webgl, backend, prepared.product),
    close: async () => {
      // the serverless shell is killed, not closed (see singleProcessBrowsers); browser.close()
      // takes the probe context with it elsewhere, and a close error after the records are
      // written is not a render failure
      void probeContext;
      if (serverless) {
        launchLog(`browser ${await killBrowser(pidFile)}`);
        return;
      }
      await browser.close().catch(() => undefined);
    },
  };
}
