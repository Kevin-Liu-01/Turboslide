// Browser launch (SPEC 5.3 determinism rules; AGENTS.md "Chromium"): the full Chrome for Testing
// binary, never the headless shell, with the ANGLE flags per platform, and the renderer string
// every RenderRecord carries so a frame is never regenerated silently on another backend
// (SPEC 5.4: Metal and SwiftShader disagree on pixels, slides report section 2.3).
import { existsSync } from 'node:fs';

import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';

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

export type ExecutableSource = 'env' | 'chromium-1217' | 'playwright';

/** TURBOSLIDE_CHROME, then the chromium-1217 build when present, then playwright-core's default. */
export function resolveExecutable(env: NodeJS.ProcessEnv = process.env): {
  path: string;
  source: ExecutableSource;
} {
  const fromEnv = env.TURBOSLIDE_CHROME;
  if (fromEnv && fromEnv.length > 0) return { path: fromEnv, source: 'env' };
  if (existsSync(CHROMIUM_1217_PATH)) return { path: CHROMIUM_1217_PATH, source: 'chromium-1217' };
  return { path: chromium.executablePath(), source: 'playwright' };
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
  backend: GpuBackend;
  args: string[];
  /** The Chromium version, for example '147.0.7727.15'. */
  version: string;
  /** The RenderRecord renderer string (SPEC 4.2). */
  renderer: string;
  close: () => Promise<void>;
};

/** The unmasked WebGL renderer string of a page, or null when WebGL is unavailable. */
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
 * Compose the renderer string from the browser version and the unmasked WebGL renderer, for
 * example 'ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Max, Unspecified Version)' becomes
 * 'Chrome for Testing 147.0.7727.15, ANGLE Metal, Apple M5 Max'.
 */
export function rendererString(version: string, webgl: string | null, backend: GpuBackend): string {
  const product = `Chrome for Testing ${version}`;
  if (!webgl)
    return `${product}, ${backend === 'swiftshader' ? 'SwiftShader' : 'ANGLE Metal'}, no WebGL`;
  const backendLabel = /swiftshader/i.test(webgl)
    ? 'SwiftShader'
    : /metal/i.test(webgl)
      ? 'ANGLE Metal'
      : 'ANGLE';
  const device =
    /Renderer:\s*([^,)]+)/.exec(webgl)?.[1]?.trim() ??
    /\(([^,]+),/.exec(webgl)?.[1]?.trim() ??
    webgl;
  return `${product}, ${backendLabel}, ${device}`;
}

export async function launchBrowser(options: LaunchOptions = {}): Promise<LaunchedBrowser> {
  const backend = options.backend ?? defaultBackend();
  const resolved = options.executablePath
    ? { path: options.executablePath, source: 'env' as const }
    : resolveExecutable();
  const args = [...LAUNCH_ARGS[backend], ...(options.extraArgs ?? [])];
  const browser = await chromium.launch({ executablePath: resolved.path, headless: true, args });
  const version = browser.version();
  let webgl: string | null = null;
  if (options.probeRenderer !== false) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      webgl = await webglRenderer(page);
    } finally {
      await context.close();
    }
  }
  return {
    browser,
    executablePath: resolved.path,
    executableSource: resolved.source,
    backend,
    args,
    version,
    renderer: rendererString(version, webgl, backend),
    close: () => browser.close(),
  };
}
